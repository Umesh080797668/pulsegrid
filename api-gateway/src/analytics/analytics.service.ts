import { Injectable, Logger, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Redis } from 'ioredis';

export interface FlowMetrics {
  flowId: string;
  flowName: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  averageDuration: number;
  lastRun?: string;
}

export interface ConnectorMetrics {
  connector: string;
  callCount: number;
  successRate: number;
  averageLatency: number;
  errorRate: number;
  lastUsed?: string;
}

export interface ConnectorHealth {
  connector: string;
  uptime: number;
  p95_latency_ms: number;
  error_rate: number;
  status: 'healthy' | 'degraded' | 'down';
}

export interface EventExplorerData {
  timestamp: string;
  connector: string;
  event_type: string;
  event_count: number;
  payload_size_bytes: number;
}

export interface WorkspaceAnalytics {
  workspaceId: string;
  period: string;
  totalEvents: number;
  totalFlowRuns: number;
  successfulFlows: number;
  failedFlows: number;
  averageFlowDuration: number;
  connectorMetrics: ConnectorMetrics[];
  flowMetrics: FlowMetrics[];
  topConnectors: ConnectorMetrics[];
  recentErrors: Array<{
    flowId: string;
    error: string;
    timestamp: string;
  }>;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger('AnalyticsService');
  private clickhouseClient: any;

  constructor(
    @Inject('PULSECORE_PACKAGE') private client: ClientGrpc,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {
    this.initializeClickHouseClient();
  }

  /**
   * Initialize ClickHouse client if configured
   */
  private initializeClickHouseClient(): void {
    const clickhouseUrl = process.env.CLICKHOUSE_URL;
    if (clickhouseUrl) {
      try {
        // Lazy load http module for ClickHouse queries
        this.clickhouseClient = {
          url: clickhouseUrl,
          initialized: true,
        };
        this.logger.log(`ClickHouse analytics enabled at ${clickhouseUrl}`);
      } catch (err) {
        this.logger.warn(`Failed to initialize ClickHouse client: ${err}`);
        this.clickhouseClient = null;
      }
    }
  }

  /**
   * Get workspace analytics overview for a specific period
   */
  async getWorkspaceAnalytics(
    workspaceId: string,
    period: 'day' | 'week' | 'month' = 'week',
  ): Promise<WorkspaceAnalytics> {
    try {
      const analyticsService: any = this.client.getService('PulseCoreService');
      const response = await analyticsService
        .getWorkspaceAnalytics({ workspace_id: workspaceId, period })
        .toPromise?.();

      return response || this.getEmptyAnalytics(workspaceId, period);
    } catch (error) {
      this.logger.error(
        `Error fetching workspace analytics for ${workspaceId}:`,
        error,
      );
      return this.getEmptyAnalytics(workspaceId, period);
    }
  }

  /**
   * Get flow performance metrics
   */
  async getFlowMetrics(workspaceId: string): Promise<FlowMetrics[]> {
    try {
      const analyticsService: any = this.client.getService('PulseCoreService');
      const response = await analyticsService
        .getFlowMetrics({ workspace_id: workspaceId })
        .toPromise?.();

      return response?.metrics || [];
    } catch (error) {
      this.logger.error(
        `Error fetching flow metrics for workspace ${workspaceId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Get connector health metrics
   */
  async getConnectorMetrics(workspaceId: string): Promise<ConnectorMetrics[]> {
    try {
      const analyticsService: any = this.client.getService('PulseCoreService');
      const response = await analyticsService
        .getConnectorMetrics({ workspace_id: workspaceId })
        .toPromise?.();

      return response?.metrics || [];
    } catch (error) {
      this.logger.error(
        `Error fetching connector metrics for workspace ${workspaceId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Get connectors health by reading Redis counters created by core executor
   */
  async getConnectorsHealth(): Promise<Array<{ connector: string; callCount: number; errorCount: number; errorRate: number; uptime: number }>> {
    try {
      const keys = await this.redis.keys('connector:calls:*');
      const by_connector: Record<string, { calls: number; errors: number }> = {};

      for (const k of keys) {
        // key format: connector:calls:{connector}:{window}
        let parts = k.split(':');
        if (parts.length < 4) continue;
        let connector = parts.slice(2, parts.length - 1).join(':');
        const val = parseInt((await this.redis.get(k)) || '0', 10);
        if (!by_connector[connector]) by_connector[connector] = { calls: 0, errors: 0 };
        by_connector[connector].calls += val;
      }

      const errKeys = await this.redis.keys('connector:errors:*');
      for (const k of errKeys) {
        let parts = k.split(':');
        if (parts.length < 4) continue;
        let connector = parts.slice(2, parts.length - 1).join(':');
        const val = parseInt((await this.redis.get(k)) || '0', 10);
        if (!by_connector[connector]) by_connector[connector] = { calls: 0, errors: 0 };
        by_connector[connector].errors += val;
      }

      return Object.entries(by_connector).map(([connector, v]) => {
        const errorRate = v.calls === 0 ? 0 : v.errors as number / (v.calls as number);
        return {
          connector,
          callCount: v.calls,
          errorCount: v.errors,
          errorRate,
          uptime: Math.max(0, 1 - errorRate),
        };
      });
    } catch (error) {
      this.logger.error('Failed to compute connectors health', error);
      return [];
    }
  }

  /**
   * Get flow run statistics
   */
  async getFlowRunStats(
    workspaceId: string,
    flowId?: string,
    limit: number = 10,
  ): Promise<any> {
    try {
      const analyticsService: any = this.client.getService('PulseCoreService');
      const payload: any = { workspace_id: workspaceId, limit };
      if (flowId) {
        payload.flow_id = flowId;
      }

      const response = await analyticsService
        .getFlowRunStats(payload)
        .toPromise?.();

      return response || { runs: [], statistics: {} };
    } catch (error) {
      this.logger.error(
        `Error fetching flow run stats for workspace ${workspaceId}:`,
        error,
      );
      return { runs: [], statistics: {} };
    }
  }

  /**
   * Get recent errors in flows
   */
  async getRecentErrors(workspaceId: string, limit: number = 20): Promise<any[]> {
    try {
      const analyticsService: any = this.client.getService('PulseCoreService');
      const response = await analyticsService
        .getRecentErrors({ workspace_id: workspaceId, limit })
        .toPromise?.();

      return response?.errors || [];
    } catch (error) {
      this.logger.error(
        `Error fetching recent errors for workspace ${workspaceId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Get event metrics over time
   */
  async getEventMetrics(
    workspaceId: string,
    interval: 'hour' | 'day' | 'week' = 'day',
    limit: number = 30,
  ): Promise<any> {
    try {
      const analyticsService: any = this.client.getService('PulseCoreService');
      const response = await analyticsService
        .getEventMetrics({ workspace_id: workspaceId, interval, limit })
        .toPromise?.();

      return response?.data || [];
    } catch (error) {
      this.logger.error(
        `Error fetching event metrics for workspace ${workspaceId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Calculate success rate percentage
   */
  calculateSuccessRate(successful: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((successful / total) * 100);
  }

  /**
   * Get connector health metrics from Redis circuit breaker counters
   */
  async getConnectorHealthMetrics(filterConnector?: string) {
    try {
      const metrics: any[] = [];

      // Get all connector health keys from Redis
      const pattern = 'connector:calls:*';
      const keys = await this.redis.keys(pattern);

      // Extract unique connectors and their latest windows
      const connectorWindows = new Map<string, number>();

      for (const key of keys) {
        // Pattern: connector:calls:{connector}:{window}
        const parts = key.split(':');
        if (parts.length === 4) {
          const connector = parts[2];
          const window = parseInt(parts[3], 10);

          if (filterConnector && connector !== filterConnector) {
            continue;
          }

          // Store the latest window for each connector
          const existing = connectorWindows.get(connector) || 0;
          if (window > existing) {
            connectorWindows.set(connector, window);
          }
        }
      }

      // Fetch metrics for each connector's latest window
      for (const [connector, window] of connectorWindows) {
        const callsKey = `connector:calls:${connector}:${window}`;
        const errorsKey = `connector:errors:${connector}:${window}`;

        const callsStr = await this.redis.get(callsKey);
        const errorsStr = await this.redis.get(errorsKey);

        const calls = callsStr ? parseInt(callsStr, 10) : 0;
        const errors = errorsStr ? parseInt(errorsStr, 10) : 0;

        const errorRate = calls > 0 ? errors / calls : 0;
        const uptime = 1 - errorRate;

        metrics.push({
          connector,
          error_rate: parseFloat(errorRate.toFixed(4)),
          uptime: parseFloat(uptime.toFixed(4)),
          calls,
          errors,
          window: new Date(window * 300 * 1000).toISOString(),
        });
      }

      // Sort by connector name
      metrics.sort((a, b) => a.connector.localeCompare(b.connector));

      this.logger.debug(
        `Returning health metrics for ${metrics.length} connectors`,
      );

      return {
        connectors: metrics,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error('Failed to get connector health metrics', err);
      return {
        connectors: [],
        timestamp: new Date().toISOString(),
        error: 'Failed to retrieve connector health metrics',
      };
    }
  }

  /**
   * Get empty analytics object as fallback
   */
  private getEmptyAnalytics(
    workspaceId: string,
    period: string,
  ): WorkspaceAnalytics {
    return {
      workspaceId,
      period,
      totalEvents: 0,
      totalFlowRuns: 0,
      successfulFlows: 0,
      failedFlows: 0,
      averageFlowDuration: 0,
      connectorMetrics: [],
      flowMetrics: [],
      topConnectors: [],
      recentErrors: [],
    };
  }

  /**
   * Query ClickHouse for connector health metrics (p95 latency, uptime, error rate)
   */
  async getConnectorHealthFromClickHouse(
    workspaceId: string,
    timePeriodHours: number = 24,
  ): Promise<ConnectorHealth[]> {
    if (!this.clickhouseClient?.initialized) {
      this.logger.warn('ClickHouse not configured, returning empty connector health');
      return [];
    }

    try {
      // Query ClickHouse for connector health metrics
      const query = `
        SELECT
          connector,
          quantile(0.95)(duration_ms) as p95_latency,
          sum(CASE WHEN status = 'error' THEN 1 ELSE 0 END) / count() * 100 as error_rate,
          count() as call_count
        FROM connector_health
        WHERE tenant_id = '${workspaceId}'
          AND received_at >= now() - INTERVAL ${timePeriodHours} HOUR
        GROUP BY connector
        ORDER BY call_count DESC
      `;

      const result = await this.queryClickHouse(query);

      return result.map((row: any) => ({
        connector: row.connector,
        uptime: 1 - row.error_rate / 100,
        p95_latency_ms: row.p95_latency || 0,
        error_rate: row.error_rate / 100,
        status: this.determineConnectorStatus(row.error_rate, row.p95_latency),
      }));
    } catch (err) {
      this.logger.error(
        `Failed to query connector health from ClickHouse: ${err}`,
      );
      return [];
    }
  }

  /**
   * Query ClickHouse for event explorer data
   */
  async getEventExplorer(
    workspaceId: string,
    timePeriodHours: number = 24,
    limit: number = 100,
  ): Promise<EventExplorerData[]> {
    if (!this.clickhouseClient?.initialized) {
      this.logger.warn('ClickHouse not configured, returning empty event explorer');
      return [];
    }

    try {
      const query = `
        SELECT
          toStartOfMinute(received_at) as timestamp,
          connector,
          event_type,
          count() as event_count,
          sum(payload_size_bytes) as total_payload_bytes
        FROM events
        WHERE tenant_id = '${workspaceId}'
          AND received_at >= now() - INTERVAL ${timePeriodHours} HOUR
        GROUP BY timestamp, connector, event_type
        ORDER BY timestamp DESC
        LIMIT ${limit}
      `;

      const result = await this.queryClickHouse(query);

      return result.map((row: any) => ({
        timestamp: row.timestamp,
        connector: row.connector,
        event_type: row.event_type,
        event_count: row.event_count,
        payload_size_bytes: row.total_payload_bytes || 0,
      }));
    } catch (err) {
      this.logger.error(`Failed to query event explorer from ClickHouse: ${err}`);
      return [];
    }
  }

  /**
   * Query ClickHouse for flow run metrics aggregates
   */
  async getFlowMetricsFromClickHouse(
    workspaceId: string,
    timePeriodHours: number = 24,
  ): Promise<any> {
    if (!this.clickhouseClient?.initialized) {
      this.logger.warn('ClickHouse not configured, returning empty flow metrics');
      return {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        averageDurationMs: 0,
        p95DurationMs: 0,
      };
    }

    try {
      const query = `
        SELECT
          count() as total_runs,
          sum(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_runs,
          sum(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failed_runs,
          round(avg(duration_ms), 2) as avg_duration,
          quantile(0.95)(duration_ms) as p95_duration
        FROM flow_run_metrics
        WHERE tenant_id = '${workspaceId}'
          AND started_at >= now() - INTERVAL ${timePeriodHours} HOUR
      `;

      const result = await this.queryClickHouse(query);
      const row = result[0] || {};

      return {
        totalRuns: row.total_runs || 0,
        successfulRuns: row.successful_runs || 0,
        failedRuns: row.failed_runs || 0,
        averageDurationMs: row.avg_duration || 0,
        p95DurationMs: row.p95_duration || 0,
      };
    } catch (err) {
      this.logger.error(`Failed to query flow metrics from ClickHouse: ${err}`);
      return {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        averageDurationMs: 0,
        p95DurationMs: 0,
      };
    }
  }

  /**
   * Helper to execute raw ClickHouse queries
   */
  private async queryClickHouse(query: string): Promise<any[]> {
    if (!this.clickhouseClient?.initialized) {
      throw new Error('ClickHouse not configured');
    }

    try {
      // Use import to dynamically load http client
      const http = await import('http');

      return new Promise((resolve, reject) => {
        const url = new URL(this.clickhouseClient.url);
        const queryParams = new URLSearchParams({
          query: query,
          format: 'JSONEachRow',
        });

        const options = {
          hostname: url.hostname,
          port: url.port || 8123,
          path: `${url.pathname || '/'}?${queryParams.toString()}`,
          method: 'GET',
          timeout: 30000,
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const lines = data.trim().split('\n');
              const result = lines.map((line) => JSON.parse(line));
              resolve(result);
            } catch (err) {
              reject(err);
            }
          });
        });

        req.on('error', reject);
        req.setTimeout(30000, () => req.destroy());
        req.end();
      });
    } catch (err) {
      this.logger.error(`ClickHouse query execution failed: ${err}`);
      throw err;
    }
  }

  /**
   * Determine connector status based on error rate and latency
   */
  private determineConnectorStatus(
    errorRate: number,
    latencyMs: number,
  ): 'healthy' | 'degraded' | 'down' {
    if (errorRate >= 50) {
      return 'down';
    }
    if (errorRate >= 10 || latencyMs > 5000) {
      return 'degraded';
    }
    return 'healthy';
  }
}