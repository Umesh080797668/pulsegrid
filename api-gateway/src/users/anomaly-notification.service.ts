import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import * as admin from 'firebase-admin';
import { UsersService } from './users.service';

interface AnomalyEvent {
  event_type: string;
  description: string;
  confidence: number;
}

type RedisStreamEntry = [string, string[]];

/**
 * AnomalyNotificationService monitors the workspace Redis stream for anomaly_detected events
 * and sends real-time push notifications to mobile users.
 *
 * Flow:
 * 1. core-engine detects anomalies via statistical/ML analysis (>0.8 confidence)
 * 2. Pushes anomaly_detected event to Redis stream: workspace_{workspace_id}
 * 3. This service reads from that stream via XREAD with consumer groups
 * 4. Decodes the payload and fetches workspace FCM tokens
 * 5. Sends notification to all devices via Firebase Admin SDK
 * 6. Acknowledges the stream entry
 */
@Injectable()
export class AnomalyNotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AnomalyNotificationService');
  private streamListenerInterval: NodeJS.Timeout | null = null;
  private firebaseInitialized = false;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureFirebaseInitialized();
    this.startStreamListener();
  }

  onModuleDestroy(): void {
    if (this.streamListenerInterval) {
      clearInterval(this.streamListenerInterval);
    }
  }

  private async ensureFirebaseInitialized(): Promise<void> {
    if (this.firebaseInitialized) {
      return;
    }

    if (admin.apps.length > 0) {
      this.firebaseInitialized = true;
      return;
    }

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON is not set; anomaly notifications will be skipped');
      return;
    }

    const serviceAccount = JSON.parse(serviceAccountJson) as admin.ServiceAccount;
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    this.firebaseInitialized = true;
  }

  /**
   * Start polling the workspace streams for anomaly_detected events.
   * Polls every 5 seconds to check for new anomalies.
   */
  private startStreamListener(): void {
    this.streamListenerInterval = setInterval(async () => {
      try {
        await this.pollAnomalyStreams();
      } catch (error) {
        this.logger.error('Error polling anomaly streams:', error);
      }
    }, 5000); // Poll every 5 seconds
  }

  /**
   * Poll all workspace streams for anomaly_detected events.
   * This implementation uses simple XREVRANGE; for production, use consumer groups.
   */
  private async pollAnomalyStreams(): Promise<void> {
    // Get all workspace stream keys
    const streamKeys = await this.redis.keys('workspace_*');

    for (const streamKey of streamKeys) {
      // Extract workspace_id from key like "workspace_abc123"
      const workspaceId = streamKey.replace('workspace_', '');

      // Read latest 10 entries from stream
      const entries = (await this.redis.xrevrange(
        streamKey,
        '+',
        '-',
        'COUNT',
        10
      )) as RedisStreamEntry[];

      for (const [entryId, fieldValues] of entries) {
        try {
          // Find the 'payload' field in the stream entry
          const payloadIndex = fieldValues.findIndex((value) => value === 'payload');
          if (payloadIndex < 0 || payloadIndex + 1 >= fieldValues.length) {
            continue;
          }

          const payloadJson = fieldValues[payloadIndex + 1];
          const payload = JSON.parse(payloadJson) as AnomalyEvent;

          // Only process anomaly_detected events
          if (payload.event_type !== 'anomaly_detected') {
            continue;
          }

          // Check if this anomaly is high-confidence
          if (payload.confidence < 0.8) {
            this.logger.debug(`Skipping low-confidence anomaly: ${payload.confidence}`);
            continue;
          }

          // Send notification to workspace users
          await this.sendAnomalyNotification(workspaceId, payload);

          // Mark as processed by removing from stream
          // (In production, use consumer groups for better reliability)
          await this.redis.xdel(streamKey, entryId);
        } catch (error) {
          this.logger.error(`Failed to process stream entry ${entryId}:`, error);
        }
      }
    }
  }

  /**
   * Send anomaly notification to all users in the workspace.
   */
  private async sendAnomalyNotification(workspaceId: string, anomaly: AnomalyEvent): Promise<void> {
    this.logger.log(`Processing anomaly in workspace ${workspaceId}: ${anomaly.description}`);

    if (!this.firebaseInitialized) {
      this.logger.warn('Firebase not initialized; skipping anomaly notification');
      return;
    }

    // Get FCM tokens for all workspace users
    const tokensByUser = await this.usersService.getWorkspaceFcmTokens(workspaceId);

    if (tokensByUser.length === 0) {
      this.logger.log(`No FCM tokens for workspace ${workspaceId}; skipping notification`);
      return;
    }

    // Flatten tokens for sendMulticast
    const tokens = tokensByUser.flatMap((entry) => entry.tokens.map((token) => token.token));

    if (tokens.length === 0) {
      this.logger.log(`No tokens available for workspace ${workspaceId}`);
      return;
    }

    // Build notification payload
    const notificationPayload = {
      notification: {
        title: '⚠️ Anomaly Detected',
        body: anomaly.description.substring(0, 100), // Truncate for mobile display
      },
      data: {
        type: 'anomaly_alert',
        description: anomaly.description,
        confidence: String((anomaly.confidence * 100).toFixed(0)),
        workspaceId,
        timestamp: new Date().toISOString(),
        deepLink: 'pulsegrid://analytics/anomalies',
      },
    };

    try {
      // Send multicast message to all tokens
      const result = await (admin.messaging() as any).sendMulticast({
        tokens,
        notification: notificationPayload.notification,
        data: notificationPayload.data,
        android: { priority: 'high' },
        apns: { headers: { 'apns-priority': '10' } },
        webpush: {
          headers: {
            urgency: 'high',
          },
        },
      });

      this.logger.log(
        `Sent anomaly alert to workspace ${workspaceId}: ${result.successCount} successes, ${result.failureCount} failures`
      );

      // Log failures for debugging
      if (result.failureCount > 0) {
        result.responses.forEach((resp, idx) => {
          if (!resp.success) {
            this.logger.warn(`Failed to send to token ${tokens[idx]}: ${resp.error?.message}`);
          }
        });
      }
    } catch (error) {
      this.logger.error(`Failed to send multicast message for workspace ${workspaceId}:`, error);
    }
  }
}
