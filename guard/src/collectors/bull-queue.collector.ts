import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

/**
 * Collector that listens to Bull queue failures and emits GuardAlerts.
 * Monitors job failures across all PulseGrid queues and triggers AI triage.
 *
 * When Bull is integrated, this will subscribe to queue events.
 * For now, it provides a utility interface for other services to report queue failures.
 */
@Injectable()
export class BullQueueErrorCollector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('BullQueueErrorCollector');
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('BullQueueErrorCollector initialized (monitoring mode)');
    // When Bull is integrated, subscribe to queue failure events here
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      this.redis.disconnect();
    }
  }

  /**
   * Report a queue job failure and emit a GuardAlert.
   * Called by API Gateway when Bull jobs fail.
   */
  async reportQueueJobFailure(
    queueName: string,
    jobId: string | number,
    jobName: string,
    jobData: any,
    error: Error,
  ): Promise<string> {
    // Generate simple UUID-like ID since uuid package not available
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const workspaceId = jobData?.workspaceId || 'unknown';

    const alert = {
      id: alertId,
      source: 'nestjs-bull-queue',
      severity: 'error',
      type: 'job_failure',
      message: `Bull queue job failed: ${jobName}`,
      queue_name: queueName,
      job_id: jobId,
      job_name: jobName,
      error_message: error.message,
      error_stack: error.stack,
      timestamp: new Date().toISOString(),
      workspace_id: workspaceId,
      status: 'pending_triage',
      ai_confidence: 0,
      raw_context: {
        job_data: JSON.stringify(jobData),
        error_name: error.name,
      },
    };

    try {
      // Store alert in Redis for streaming to frontend
      const alertKey = `guard:alert:${alertId}`;
      await this.redis.setex(alertKey, 86400, JSON.stringify(alert)); // 24h TTL

      // Publish alert to PubSub channel for real-time updates
      await this.redis.publish('guard:alerts', JSON.stringify(alert));

      // Insert into alert list per workspace
      const alertsListKey = `guard:alerts:${workspaceId}`;
      await this.redis.lpush(alertsListKey, alertId);
      await this.redis.ltrim(alertsListKey, 0, 999); // Keep last 1000

      this.logger.warn(
        `Reported GuardAlert ${alertId} for Bull queue failure: ${jobName} (${error.message})`,
      );

      return alertId;
    } catch (err) {
      this.logger.error(`Failed to report queue job failure`, err);
      throw err;
    }
  }
}
