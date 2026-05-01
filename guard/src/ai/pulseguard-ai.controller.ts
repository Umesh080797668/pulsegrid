import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ErrorIntelligenceService } from './error-intelligence.service';
import { AutonomousMaintenanceService } from './autonomous-maintenance.service';
import { PredictiveIntelligenceService } from './predictive-intelligence.service';

@Controller('pulseguard/ai')
export class PulseGuardAIController {
  constructor(
    private errorIntelligence: ErrorIntelligenceService,
    private autonomousMaintenance: AutonomousMaintenanceService,
    private predictiveIntelligence: PredictiveIntelligenceService,
  ) {}

  /**
   * Report an error for analysis
   * POST /pulseguard/ai/errors
   */
  @Post('errors')
  @HttpCode(HttpStatus.ACCEPTED)
  async reportError(
    @Body()
    data: {
      error: any;
      context: any;
    },
  ) {
    const intelligence = await this.errorIntelligence.analyzeError(
      data.error,
      data.context,
    );
    return {
      status: 'analyzed',
      pattern_id: intelligence.pattern_id,
      suggested_actions: intelligence.suggested_actions,
    };
  }

  /**
   * Get top error patterns
   * GET /pulseguard/ai/patterns?limit=10
   */
  @Get('patterns')
  getTopPatterns(@Body() query?: { limit?: number }) {
    const limit = query?.limit || 10;
    const patterns = this.errorIntelligence.getTopPatterns(limit);
    return {
      count: patterns.length,
      patterns,
    };
  }

  /**
   * Get patterns by severity
   * GET /pulseguard/ai/patterns/:severity
   */
  @Get('patterns/:severity')
  getPatternsBySeverity(
    @Param('severity') severity: 'critical' | 'high' | 'medium' | 'low',
  ) {
    const patterns = this.errorIntelligence.getPatternsBySeverity(severity);
    return {
      severity,
      count: patterns.length,
      patterns,
    };
  }

  /**
   * Get maintenance history for a flow
   * GET /pulseguard/ai/maintenance/:flowId
   */
  @Get('maintenance/:flowId')
  getMaintenanceHistory(@Param('flowId') flowId: string) {
    const history = this.autonomousMaintenance.getFlowMaintenanceHistory(
      flowId,
    );
    return {
      flow_id: flowId,
      actions: history,
      count: history.length,
    };
  }

  /**
   * Get recent maintenance actions
   * GET /pulseguard/ai/maintenance?hours=24
   */
  @Get('maintenance-recent')
  getRecentMaintenance(@Body() query?: { hours?: number }) {
    const hours = query?.hours || 24;
    const actions = this.autonomousMaintenance.getRecentActions(hours);
    const successRate = this.autonomousMaintenance.getActionSuccessRate();
    return {
      hours,
      count: actions.length,
      success_rate: `${successRate.toFixed(2)}%`,
      actions,
    };
  }

  /**
   * Get flow health score
   * GET /pulseguard/ai/health/:flowId
   */
  @Get('health/:flowId')
  getFlowHealth(@Param('flowId') flowId: string) {
    const health = this.predictiveIntelligence.getFlowHealthScore(flowId);
    if (!health) {
      return {
        flow_id: flowId,
        message: 'Insufficient data to calculate health score',
      };
    }
    return health;
  }

  /**
   * Get flows needing attention
   * GET /pulseguard/ai/flows/attention
   */
  @Get('flows/attention')
  getFlowsNeedingAttention() {
    const flows = this.predictiveIntelligence.getFlowsNeedingAttention();
    return {
      count: flows.length,
      flows,
    };
  }

  /**
   * Get flows by health status
   * GET /pulseguard/ai/flows/status/:status
   */
  @Get('flows/status/:status')
  getFlowsByStatus(
    @Param('status') status: 'healthy' | 'degraded' | 'at_risk' | 'critical',
  ) {
    const flows = this.predictiveIntelligence.getFlowsByStatus(status);
    return {
      status,
      count: flows.length,
      flows,
    };
  }

  /**
   * Get predictive insights for a flow
   * GET /pulseguard/ai/insights/:flowId
   */
  @Get('insights/:flowId')
  getFlowInsights(@Param('flowId') flowId: string) {
    const insights = this.predictiveIntelligence.getFlowInsights(flowId);
    return {
      flow_id: flowId,
      count: insights.length,
      insights,
    };
  }

  /**
   * Health check endpoint
   * GET /pulseguard/ai/health
   */
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      service: 'pulseguard-ai',
      timestamp: new Date().toISOString(),
    };
  }
}
