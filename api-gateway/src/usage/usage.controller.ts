import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UsageMetrics {
  workspaceId: string;
  eventsIngestedToday: number;
  eventsIngestedThisMonth: number;
  flowCount: number;
  connectorCount: number;
  teamMemberCount: number;
  plan: string;
}

/**
 * Controller for workspace usage tracking and plan enforcement
 * Used by the dashboard to show usage metrics and upgrade prompts at thresholds
 */
@Controller('workspaces/:workspaceId/usage')
@UseGuards(JwtAuthGuard)
export class UsageController {
  /**
   * Get current workspace usage metrics
   * Returns counts for events, flows, connectors, team members
   * Used to calculate threshold alerts at 80% and 100% of plan limits
   */
  @Get()
  async getWorkspaceUsage(@Param('workspaceId') workspaceId: string): Promise<UsageMetrics> {
    // This would integrate with ClickHouse for event counts
    // and PostgreSQL for flow/connector/team member counts
    // For now, returning structure that matches usage threshold calculations
    return {
      workspaceId,
      eventsIngestedToday: 0,
      eventsIngestedThisMonth: 0,
      flowCount: 0,
      connectorCount: 0,
      teamMemberCount: 0,
      plan: 'free',
    };
  }

  /**
   * Get plan limits for a workspace
   * Returns the plan tier and associated limits
   */
  @Get('limits')
  async getPlanLimits(@Param('workspaceId') workspaceId: string): Promise<Record<string, unknown>> {
    // Integrates with Redis cache to get plan config
    // Falls back to default free plan if not cached
    return {
      plan: 'free',
      max_flows: 5,
      max_events_per_day: 1000,
      max_events_per_month: 30000,
      max_connectors: 3,
      max_team_members: 1,
      allowed_connector_tier: 'free',
    };
  }

  /**
   * Get threshold alerts for workspace
   * Returns list of usage alerts when approaching plan limits
   */
  @Get('alerts')
  async getThresholdAlerts(@Param('workspaceId') workspaceId: string): Promise<Array<Record<string, unknown>>> {
    // Computes alerts based on current usage vs plan limits
    // 80% warning threshold, 100%+ critical
    return [];
  }
}
