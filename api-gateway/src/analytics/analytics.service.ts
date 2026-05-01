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

  constructor(
    @Inject('PULSECORE_PACKAGE') private client: ClientGrpc,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

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
}
