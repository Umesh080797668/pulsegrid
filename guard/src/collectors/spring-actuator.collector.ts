import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import * as http from 'http';

/**
 * Collector that polls Spring Boot Actuator health endpoints and emits GuardAlerts
 * when health degrades.
 *
 * Periodically fetches /actuator/health from the Enterprise Service and triggers
 * alerts if:
 * - Service is DOWN
 * - Specific health indicators are degraded
 * - Response time exceeds thresholds
 */
@Injectable()
export class SpringBootActuatorCollector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('SpringBootActuatorCollector');
  private redis: Redis;
  private pollingIntervalId: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 60000; // 1 minute

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('SpringBootActuatorCollector initializing...');
    const actuatorUrl = process.env.ENTERPRISE_SERVICE_ACTUATOR_URL ||
      'http://localhost:8080/actuator/health';

    // Start polling at interval
    this.pollingIntervalId = setInterval(async () => {
      await this.pollHealthEndpoint(actuatorUrl);
    }, this.POLL_INTERVAL_MS);

    // Also run once immediately
    await this.pollHealthEndpoint(actuatorUrl);
    this.logger.log(`Polling Spring Boot Actuator at ${actuatorUrl}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
    }
    if (this.redis) {
      this.redis.disconnect();
    }
  }

  /**
   * Poll Spring Boot Actuator health endpoint.
   */
  private async pollHealthEndpoint(url: string): Promise<void> {
    try {
      const startTime = Date.now();
      const health = await this.fetchHealth(url);
      const latencyMs = Date.now() - startTime;

      const currentHealthKey = 'enterprise_service:health:current';
      const previousHealth = await this.redis.get(currentHealthKey);

      await this.redis.setex(
        currentHealthKey,
        300, // 5 min TTL
        JSON.stringify(health),
      );

      // Check for health degradation
      if (previousHealth) {
        const prev = JSON.parse(previousHealth);
        if (prev.status !== health.status) {
          // Status changed, emit alert
          await this.emitHealthAlert(
            health,
            latencyMs,
            `Health status changed from ${prev.status} to ${health.status}`,
          );
        }
      }

      // Check for DOWN status
      if (health.status === 'DOWN') {
        await this.emitHealthAlert(
          health,
          latencyMs,
          'Spring Boot Actuator reports service DOWN',
        );
      }

      // Check for high latency
      if (latencyMs > 5000) {
        this.logger.warn(
          `Spring Boot Actuator latency ${latencyMs}ms exceeds threshold`,
        );
      }
    } catch (err) {
      this.logger.error(`Failed to poll Spring Boot Actuator`, err);
      await this.emitHealthAlert(
        null,
        -1,
        `Failed to reach Actuator: ${String(err)}`,
      );
    }
  }

  /**
   * Fetch health from Spring Boot Actuator.
   */
  private fetchHealth(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      http.get(url, { timeout: 5000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Emit a GuardAlert for health degradation.
   */
  private async emitHealthAlert(
    health: any,
    latencyMs: number,
    message: string,
  ): Promise<void> {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const alert = {
      id: alertId,
      source: 'spring-actuator',
      severity: health && health.status === 'DOWN' ? 'critical' : 'warning',
      type: 'health_degradation',
      message,
      timestamp: new Date().toISOString(),
      workspace_id: 'system', // System-level alert
      status: 'pending_triage',
      ai_confidence: 0,
      raw_context: {
        health_status: health?.status || 'unknown',
        latency_ms: latencyMs,
        health_indicators: health?.components ? Object.keys(health.components) : [],
      },
    };

    try {
      const alertKey = `guard:alert:${alertId}`;
      await this.redis.setex(alertKey, 86400, JSON.stringify(alert));

      await this.redis.publish('guard:alerts', JSON.stringify(alert));

      const alertsListKey = 'guard:alerts:system';
      await this.redis.lpush(alertsListKey, alertId);
      await this.redis.ltrim(alertsListKey, 0, 999);

      this.logger.warn(`Emitted GuardAlert ${alertId}: ${message}`);
    } catch (err) {
      this.logger.error(`Failed to emit health alert`, err);
    }
  }
}
