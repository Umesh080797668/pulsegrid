import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyticsService, WorkspaceAnalytics, FlowMetrics, ConnectorMetrics } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  private readonly logger = new Logger('AnalyticsController');

  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * GET /analytics/overview?workspaceId=...&period=week
   * Get workspace analytics overview
   */
  @Get('overview')
  async getOverview(
    @Query('workspaceId') workspaceId: string,
    @Query('period') period: 'day' | 'week' | 'month' = 'week',
  ): Promise<WorkspaceAnalytics> {
    this.logger.log(
      `Fetching analytics overview for workspace ${workspaceId}, period: ${period}`,
    );
    return this.analyticsService.getWorkspaceAnalytics(workspaceId, period);
  }

  /**
   * GET /analytics/flows?workspaceId=...
   * Get flow performance metrics
   */
  @Get('flows')
  async getFlowMetrics(
    @Query('workspaceId') workspaceId: string,
  ): Promise<FlowMetrics[]> {
    this.logger.log(`Fetching flow metrics for workspace ${workspaceId}`);
    return this.analyticsService.getFlowMetrics(workspaceId);
  }

  /**
   * GET /analytics/flows/:flowId?workspaceId=...
   * Get metrics for specific flow
   */
  @Get('flows/:flowId')
  async getFlowDetail(
    @Param('flowId') flowId: string,
    @Query('workspaceId') workspaceId: string,
  ): Promise<any> {
    this.logger.log(
      `Fetching metrics for flow ${flowId} in workspace ${workspaceId}`,
    );
    const stats = await this.analyticsService.getFlowRunStats(
      workspaceId,
      flowId,
    );
    return stats;
  }

  /**
   * GET /analytics/connectors?workspaceId=...
   * Get connector health metrics
   */
  @Get('connectors')
  async getConnectorMetrics(
    @Query('workspaceId') workspaceId: string,
  ): Promise<ConnectorMetrics[]> {
    this.logger.log(`Fetching connector metrics for workspace ${workspaceId}`);
    return this.analyticsService.getConnectorMetrics(workspaceId);
  }

  /**
   * GET /analytics/errors?workspaceId=...&limit=20
   * Get recent flow errors
   */
  @Get('errors')
  async getRecentErrors(
    @Query('workspaceId') workspaceId: string,
    @Query('limit') limit: string = '20',
  ): Promise<any[]> {
    this.logger.log(
      `Fetching recent errors for workspace ${workspaceId}, limit: ${limit}`,
    );
    return this.analyticsService.getRecentErrors(
      workspaceId,
      parseInt(limit, 10),
    );
  }

  /**
   * GET /analytics/events?workspaceId=...&interval=day&limit=30
   * Get event metrics over time
   */
  @Get('events')
  async getEventMetrics(
    @Query('workspaceId') workspaceId: string,
    @Query('interval') interval: 'hour' | 'day' | 'week' = 'day',
    @Query('limit') limit: string = '30',
  ): Promise<any> {
    this.logger.log(
      `Fetching event metrics for workspace ${workspaceId}, interval: ${interval}`,
    );
    return this.analyticsService.getEventMetrics(
      workspaceId,
      interval,
      parseInt(limit, 10),
    );
  }

  /**
   * GET /analytics/runs?workspaceId=...&flowId=...&limit=10
   * Get flow run history with stats
   */
  @Get('runs')
  async getFlowRunStats(
    @Query('workspaceId') workspaceId: string,
    @Query('flowId') flowId?: string,
    @Query('limit') limit: string = '10',
  ): Promise<any> {
    this.logger.log(
      `Fetching flow run stats for workspace ${workspaceId}${
        flowId ? `, flow: ${flowId}` : ''
      }`,
    );
    return this.analyticsService.getFlowRunStats(
      workspaceId,
      flowId,
      parseInt(limit, 10),
    );
  }

  /**
   * GET /analytics/health?workspaceId=...
   * Get overall workspace health (quick summary)
   */
  @Get('health')
  async getWorkspaceHealth(
    @Query('workspaceId') workspaceId: string,
  ): Promise<any> {
    this.logger.log(`Fetching workspace health for ${workspaceId}`);
    const analytics = await this.analyticsService.getWorkspaceAnalytics(
      workspaceId,
      'week',
    );
    const errors = await this.analyticsService.getRecentErrors(workspaceId, 5);

    return {
      status: analytics.failedFlows === 0 ? 'healthy' : 'degraded',
      totalRuns: analytics.totalFlowRuns,
      successRate: this.analyticsService.calculateSuccessRate(
        analytics.successfulFlows,
        analytics.totalFlowRuns,
      ),
      activeConnectors: analytics.connectorMetrics.length,
      recentErrorCount: errors.length,
      recentErrors: errors.slice(0, 3),
    };
  }
}
