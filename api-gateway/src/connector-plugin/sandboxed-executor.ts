/**
 * Sandboxed Connector Execution Environment
 * Provides isolated, safe execution with resource limits and error handling
 */

import {
  IConnectorPlugin,
  ConnectorExecutionContext,
  ConnectorExecutionResult,
} from './connector.types';

export interface SandboxConfig {
  timeout?: number;
  maxMemory?: number;
  maxRequests?: number;
  rateLimit?: {
    requestsPerSecond?: number;
    requestsPerMinute?: number;
  };
  allowedDomains?: string[];
  blockPatterns?: RegExp[];
}

export interface ExecutionMetrics {
  duration: number;
  memoryUsed?: number;
  cpuUsed?: number;
  requestsMade?: number;
  errors?: string[];
}

/**
 * Request counter for rate limiting
 */
class RateLimiter {
  private counters: Map<string, { total: number; secondBuckets: Map<number, number> }> = new Map();
  private readonly defaultRequestsPerSecond = 10;
  private readonly defaultRequestsPerMinute = 300;

  canMakeRequest(key: string, rps?: number, rpm?: number): boolean {
    const now = Date.now();
    const second = Math.floor(now / 1000);

    if (!this.counters.has(key)) {
      this.counters.set(key, { total: 0, secondBuckets: new Map() });
    }

    const counter = this.counters.get(key)!;
    const currentSecondBucket = counter.secondBuckets.get(second) || 0;

    // Check per-second limit
    const limitRps = rps || this.defaultRequestsPerSecond;
    if (currentSecondBucket >= limitRps) {
      return false;
    }

    // Check per-minute limit
    const limitRpm = rpm || this.defaultRequestsPerMinute;
    const oneMinuteAgo = second - 60;
    let requestsInLastMinute = currentSecondBucket;
    for (const [bucket, count] of counter.secondBuckets) {
      if (bucket > oneMinuteAgo) {
        requestsInLastMinute += count;
      }
    }
    if (requestsInLastMinute >= limitRpm) {
      return false;
    }

    return true;
  }

  recordRequest(key: string): void {
    const now = Date.now();
    const second = Math.floor(now / 1000);

    if (!this.counters.has(key)) {
      this.counters.set(key, { total: 0, secondBuckets: new Map() });
    }

    const counter = this.counters.get(key)!;
    counter.total++;
    counter.secondBuckets.set(second, (counter.secondBuckets.get(second) || 0) + 1);

    // Cleanup old buckets (older than 2 minutes)
    const twoMinutesAgo = second - 120;
    for (const bucket of counter.secondBuckets.keys()) {
      if (bucket < twoMinutesAgo) {
        counter.secondBuckets.delete(bucket);
      }
    }
  }

  getStats(key: string): { total: number; lastMinute: number } {
    if (!this.counters.has(key)) {
      return { total: 0, lastMinute: 0 };
    }

    const counter = this.counters.get(key)!;
    const now = Date.now();
    const oneMinuteAgo = Math.floor((now - 60000) / 1000);

    let lastMinute = 0;
    for (const [bucket, count] of counter.secondBuckets) {
      if (bucket >= oneMinuteAgo) {
        lastMinute += count;
      }
    }

    return { total: counter.total, lastMinute };
  }

  reset(key?: string): void {
    if (key) {
      this.counters.delete(key);
    } else {
      this.counters.clear();
    }
  }
}

/**
 * Sandboxed Executor for connector actions
 */
export class SandboxedConnectorExecutor {
  private rateLimiter = new RateLimiter();
  private executionMetrics: Map<string, ExecutionMetrics[]> = new Map();

  /**
   * Execute a connector action in a sandboxed environment
   */
  async execute(
    connector: IConnectorPlugin,
    actionId: string,
    inputs: Record<string, any>,
    credentials: Record<string, any>,
    context: ConnectorExecutionContext,
    config: SandboxConfig = {},
  ): Promise<ConnectorExecutionResult> {
    const startTime = Date.now();
    const connectorId = connector.getMetadata().id;
    const executionKey = `${context.workspaceId}:${connectorId}`;

    try {
      // Check rate limits
      if (config.rateLimit) {
        const canExecute = this.rateLimiter.canMakeRequest(
          executionKey,
          config.rateLimit.requestsPerSecond,
          config.rateLimit.requestsPerMinute,
        );

        if (!canExecute) {
          const duration = Date.now() - startTime;
          return {
            success: false,
            error: 'Rate limit exceeded',
            errorCode: 'RATE_LIMIT_EXCEEDED',
            duration,
            retryable: true,
          };
        }
      }

      // Validate credentials before execution
      const credValidation = await connector.validateCredentials(credentials);
      if (!credValidation.valid) {
        const duration = Date.now() - startTime;
        return {
          success: false,
          error: `Invalid credentials: ${(credValidation.errors || []).join(', ')}`,
          errorCode: 'INVALID_CREDENTIALS',
          duration,
          retryable: false,
        };
      }

      // Execute with timeout
      const timeout = config.timeout || context.timeout || 30000;
      const executionPromise = connector.execute(actionId, inputs, credentials, {
        ...context,
        sandboxed: true,
      });

      const result = await Promise.race([
        executionPromise,
        this.sleep(timeout).then(() => {
          throw new Error(`Execution timeout after ${timeout}ms`);
        }),
      ]);

      // Record request
      this.rateLimiter.recordRequest(executionKey);

      // Record metrics
      const duration = Date.now() - startTime;
      this.recordMetric(connectorId, {
        duration,
        errors: result.success ? undefined : [result.error || 'Unknown error'],
      });

      return {
        ...result,
        duration,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const error = err instanceof Error ? err.message : String(err);

      // Record metrics
      this.recordMetric(connectorId, {
        duration,
        errors: [error],
      });

      return {
        success: false,
        error,
        errorCode: 'EXECUTION_ERROR',
        errorStack: err instanceof Error ? err.stack : undefined,
        duration,
        retryable: false,
      };
    }
  }

  /**
   * Get execution metrics
   */
  getMetrics(connectorId: string): {
    totalExecutions: number;
    successRate: number;
    avgDuration: number;
    errors: Record<string, number>;
  } | null {
    const metrics = this.executionMetrics.get(connectorId);
    if (!metrics || metrics.length === 0) {
      return null;
    }

    const successful = metrics.filter((m) => !m.errors || m.errors.length === 0).length;
    const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0);
    const avgDuration = totalDuration / metrics.length;

    const errors: Record<string, number> = {};
    for (const metric of metrics) {
      if (metric.errors) {
        for (const error of metric.errors) {
          errors[error] = (errors[error] || 0) + 1;
        }
      }
    }

    return {
      totalExecutions: metrics.length,
      successRate: successful / metrics.length,
      avgDuration,
      errors,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(connectorId?: string): void {
    if (connectorId) {
      this.executionMetrics.delete(connectorId);
    } else {
      this.executionMetrics.clear();
    }
  }

  /**
   * Get rate limiter stats
   */
  getRateLimiterStats(workspaceId: string, connectorId: string): { total: number; lastMinute: number } {
    return this.rateLimiter.getStats(`${workspaceId}:${connectorId}`);
  }

  /**
   * Reset rate limiter
   */
  resetRateLimiter(workspaceId?: string, connectorId?: string): void {
    if (workspaceId && connectorId) {
      this.rateLimiter.reset(`${workspaceId}:${connectorId}`);
    } else {
      this.rateLimiter.reset();
    }
  }

  private recordMetric(connectorId: string, metric: ExecutionMetrics): void {
    if (!this.executionMetrics.has(connectorId)) {
      this.executionMetrics.set(connectorId, []);
    }
    const metrics = this.executionMetrics.get(connectorId)!;
    metrics.push(metric);

    // Keep only last 1000 metrics per connector
    if (metrics.length > 1000) {
      metrics.shift();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
