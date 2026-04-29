import { Injectable, Logger, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';

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

  constructor(@Inject('PULSECORE_PACKAGE') private client: ClientGrpc) {}

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
