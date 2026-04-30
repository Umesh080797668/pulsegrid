import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { UsersService } from '../users/users.service';

@Injectable()
export class DailyDigestService {
  constructor(
    private readonly usersService: UsersService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  /**
   * Scheduled job to send daily digest notifications at 8 AM UTC
   * Query flow runs from previous day and send summary via FCM
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM, {
    timeZone: 'UTC',
    name: 'daily_digest',
  })
  async sendDailyDigest(): Promise<void> {
    console.log('[DailyDigest] Starting daily digest job at', new Date().toISOString());

    try {
      // TODO: Query all workspaces and their users
      // For each workspace:
      // 1. Get yesterday's flow runs stats
      // 2. Get all FCM tokens for workspace users
      // 3. Build digest notification payload
      // 4. Send via Firebase Admin SDK

      // Placeholder implementation
      await this.sendDigestForWorkspace('placeholder-workspace-id');
    } catch (error) {
      console.error('[DailyDigest] Error in daily digest job:', error);
    }
  }

  /**
   * Send daily digest for a specific workspace
   */
  private async sendDigestForWorkspace(workspaceId: string): Promise<void> {
    try {
      console.log(`[DailyDigest] Processing workspace: ${workspaceId}`);

      // TODO: Implement these steps:
      // 1. Query PostgreSQL/ClickHouse for yesterday's flow stats:
      //    - Total flow runs count
      //    - Success count and rate
      //    - Failed count
      //    - Average duration
      //    - Top 5 flows by run count

      const stats = {
        totalRuns: 42,
        successCount: 38,
        failureCount: 4,
        successRate: 90.5,
        averageDuration: 3450, // ms
        topFlows: [
          { name: 'Sync Users', runs: 15 },
          { name: 'Email Notification', runs: 12 },
          { name: 'Data Backup', runs: 10 },
          { name: 'Report Generation', runs: 3 },
          { name: 'Webhook Trigger', runs: 2 },
        ],
      };

      // 2. Get all FCM tokens for workspace users
      const fcmTokens = await this.usersService.getWorkspaceFcmTokens(workspaceId);

      if (!fcmTokens || fcmTokens.length === 0) {
        console.log(`[DailyDigest] No FCM tokens found for workspace ${workspaceId}`);
        return;
      }

      // 3. Build notification payload
      const notificationPayload = this.buildDigestNotification(stats);

      // 4. Send to all registered devices via Firebase Admin SDK
      // TODO: Initialize Firebase Admin and send multicast message
      // const result = await admin.messaging().sendMulticast({
      //   tokens: tokensList,
      //   notification: notificationPayload.notification,
      //   data: notificationPayload.data,
      //   android: { priority: 'high' },
      //   apns: { headers: { 'apns-priority': '10' } },
      // });

      console.log(`[DailyDigest] Would send digest to ${fcmTokens.length} users`);
      console.log(`[DailyDigest] Notification payload:`, notificationPayload);

      // Log digest sent event (audit trail)
      await this.logDigestSent(workspaceId, stats, fcmTokens.length);
    } catch (error) {
      console.error(`[DailyDigest] Error processing workspace ${workspaceId}:`, error);
    }
  }

  /**
   * Build Firebase notification payload for daily digest
   */
  private buildDigestNotification(stats: any) {
    const successPercentage = Math.round(stats.successRate);
    const summary = `${stats.totalRuns} flows run • ${stats.successCount} succeeded • ${stats.failureCount} failed`;

    return {
      notification: {
        title: '📊 Daily PulseGrid Digest',
        body: summary,
        imageUrl: 'https://pulsegrid.example.com/notification-icon.png',
      },
      data: {
        type: 'daily_digest',
        timestamp: new Date().toISOString(),
        stats: JSON.stringify({
          totalRuns: stats.totalRuns,
          successCount: stats.successCount,
          failureCount: stats.failureCount,
          successRate: stats.successRate,
          averageDuration: stats.averageDuration,
          topFlows: stats.topFlows,
        }),
        deepLink: 'pulsegrid://analytics',
      },
    };
  }

  /**
   * Log digest sent event for audit trail
   */
  private async logDigestSent(
    workspaceId: string,
    stats: any,
    recipientCount: number,
  ): Promise<void> {
    try {
      const eventKey = `digest_sent:${workspaceId}:${new Date().toISOString().split('T')[0]}`;
      await this.redis.setex(
        eventKey,
        30 * 24 * 60 * 60, // 30 days retention
        JSON.stringify({
          timestamp: new Date().toISOString(),
          recipientCount,
          stats,
        }),
      );
    } catch (error) {
      console.error('[DailyDigest] Error logging digest sent:', error);
    }
  }
}
