import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

/**
 * Collector for error beacons from the Next.js dashboard.
 * The dashboard reports runtime errors via POST to /guard/beacon.
 * This service processes and stores those beacons as GuardAlerts.
 */
@Injectable()
export class DashboardErrorBeaconCollector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('DashboardErrorBeaconCollector');
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('DashboardErrorBeaconCollector initialized');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      this.redis.disconnect();
    }
  }

  /**
   * Process an error beacon from the Next.js dashboard.
   * Called by the /guard/beacon POST endpoint.
   */
  async reportDashboardError(
    workspaceId: string,
    message: string,
    stack: string,
    url: string,
    userAgent: string,
    additionalContext?: Record<string, any>,
  ): Promise<string> {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const alert = {
      id: alertId,
      source: 'nextjs-dashboard',
      severity: 'error',
      type: 'frontend_error',
      message: `Dashboard error: ${message}`,
      timestamp: new Date().toISOString(),
      workspace_id: workspaceId,
      status: 'pending_triage',
      ai_confidence: 0,
      raw_context: {
        error_message: message,
        error_stack: stack,
        url,
        user_agent: userAgent,
        additional_context: additionalContext || {},
      },
    };

    try {
      // Store alert in Redis
      const alertKey = `guard:alert:${alertId}`;
      await this.redis.setex(alertKey, 86400, JSON.stringify(alert)); // 24h TTL

      // Publish for real-time updates
      await this.redis.publish('guard:alerts', JSON.stringify(alert));

      // Add to workspace alerts list
      const alertsListKey = `guard:alerts:${workspaceId}`;
      await this.redis.lpush(alertsListKey, alertId);
      await this.redis.ltrim(alertsListKey, 0, 999);

      this.logger.warn(
        `Reported dashboard error alert ${alertId}: ${message} (workspace: ${workspaceId})`,
      );

      return alertId;
    } catch (err) {
      this.logger.error(`Failed to report dashboard error`, err);
      throw err;
    }
  }

  /**
   * Get recent dashboard errors for a workspace.
   */
  async getRecentErrors(
    workspaceId: string,
    limit: number = 50,
  ): Promise<any[]> {
    try {
      const alertsListKey = `guard:alerts:${workspaceId}`;
      const alertIds = await this.redis.lrange(alertsListKey, 0, limit - 1);

      const alerts = [];
      for (const alertId of alertIds) {
        const alertKey = `guard:alert:${alertId}`;
        const alertJson = await this.redis.get(alertKey);
        if (alertJson) {
          alerts.push(JSON.parse(alertJson));
        }
      }

      return alerts;
    } catch (err) {
      this.logger.error(`Failed to retrieve recent errors`, err);
      return [];
    }
  }
}
