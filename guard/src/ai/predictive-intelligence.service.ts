import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

export interface PredictiveInsight {
  id: string;
  flow_id: string;
  insight_type:
    | 'potential_error'
    | 'performance_degradation'
    | 'resource_exhaustion'
    | 'connector_issue';
  confidence: number; // 0-100
  description: string;
  recommended_action: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  timestamp: Date;
}

export interface FlowHealthScore {
  flow_id: string;
  score: number; // 0-100
  status: 'healthy' | 'degraded' | 'at_risk' | 'critical';
  error_rate: number;
  success_rate: number;
  avg_latency_ms: number;
  last_updated: Date;
  insights: PredictiveInsight[];
}

@Injectable()
export class PredictiveIntelligenceService {
  private readonly logger = new Logger(PredictiveIntelligenceService.name);
  private readonly flowMetrics = new Map<
    string,
    {
      executions: number;
      errors: number;
      latencies: number[];
      lastExecution: Date;
    }
  >();
  private readonly healthScores = new Map<string, FlowHealthScore>();

  /**
   * Analyze flow metrics and generate predictive insights
   */
  @OnEvent('flow.executed')
  async analyzeFlowMetrics(data: {
    flow_id: string;
    duration_ms: number;
    status: 'success' | 'error';
  }): Promise<void> {
    const { flow_id, duration_ms, status } = data;

    // Update metrics
    const metrics = this.getOrCreateMetrics(flow_id);
    metrics.executions++;
    metrics.latencies.push(duration_ms);
    metrics.lastExecution = new Date();

    if (status === 'error') {
      metrics.errors++;
    }

    // Keep only last 1000 latency measurements
    if (metrics.latencies.length > 1000) {
      metrics.latencies.shift();
    }

    // Update health score
    await this.updateHealthScore(flow_id);
  }

  /**
   * Get or create metrics for flow
   */
  private getOrCreateMetrics(
    flowId: string,
  ): {
    executions: number;
    errors: number;
    latencies: number[];
    lastExecution: Date;
  } {
    if (!this.flowMetrics.has(flowId)) {
      this.flowMetrics.set(flowId, {
        executions: 0,
        errors: 0,
        latencies: [],
        lastExecution: new Date(),
      });
    }
    return this.flowMetrics.get(flowId)!;
  }

  /**
   * Update flow health score and generate insights
   */
  private async updateHealthScore(flowId: string): Promise<void> {
    const metrics = this.flowMetrics.get(flowId);
    if (!metrics || metrics.executions < 5) {
      return; // Need minimum samples
    }

    const errorRate = (metrics.errors / metrics.executions) * 100;
    const successRate = 100 - errorRate;
    const avgLatency =
      metrics.latencies.reduce((a, b) => a + b, 0) /
      metrics.latencies.length;

    // Calculate health score
    let score = 100;
    score -= errorRate * 0.5; // Error rate heavily impacts score
    score -= this.calculateLatencyPenalty(avgLatency);
    score -= this.calculateTrendPenalty(metrics.latencies);
    score = Math.max(0, Math.min(100, score));

    // Determine status
    let status: 'healthy' | 'degraded' | 'at_risk' | 'critical';
    if (score >= 80) status = 'healthy';
    else if (score >= 60) status = 'degraded';
    else if (score >= 40) status = 'at_risk';
    else status = 'critical';

    // Generate insights
    const insights = this.generateInsights(
      flowId,
      errorRate,
      avgLatency,
      metrics,
    );

    const healthScore: FlowHealthScore = {
      flow_id: flowId,
      score,
      status,
      error_rate: errorRate,
      success_rate: successRate,
      avg_latency_ms: Math.round(avgLatency),
      last_updated: new Date(),
      insights,
    };

    this.healthScores.set(flowId, healthScore);

    if (status !== 'healthy') {
      this.logger.warn(
        `Flow ${flowId} health status: ${status} (score: ${score.toFixed(1)})`,
      );
    }
  }

  /**
   * Calculate latency penalty
   */
  private calculateLatencyPenalty(avgLatency: number): number {
    // Penalize if average latency exceeds 5 seconds
    if (avgLatency > 5000) return 30;
    if (avgLatency > 2000) return 15;
    if (avgLatency > 1000) return 5;
    return 0;
  }

  /**
   * Calculate trend penalty (increasing latencies)
   */
  private calculateTrendPenalty(latencies: number[]): number {
    if (latencies.length < 10) return 0;

    const recent = latencies.slice(-10);
    const older = latencies.slice(-20, -10);

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const increase = ((recentAvg - olderAvg) / olderAvg) * 100;
    if (increase > 50) return 15;
    if (increase > 20) return 8;
    if (increase > 10) return 3;
    return 0;
  }

  /**
   * Generate predictive insights
   */
  private generateInsights(
    flowId: string,
    errorRate: number,
    avgLatency: number,
    metrics: any,
  ): PredictiveInsight[] {
    const insights: PredictiveInsight[] = [];

    // Insight 1: High error rate prediction
    if (errorRate > 5) {
      insights.push({
        id: `insight_${Date.now()}_error`,
        flow_id: flowId,
        insight_type: 'potential_error',
        confidence: Math.min(errorRate * 2, 95),
        description: `Flow has ${errorRate.toFixed(1)}% error rate. Potential connector or logic issue.`,
        recommended_action: 'Review flow logic and connector configuration',
        severity: errorRate > 20 ? 'critical' : 'high',
        timestamp: new Date(),
      });
    }

    // Insight 2: Performance degradation
    const latencyTrend = this.calculateTrendPenalty(metrics.latencies);
    if (latencyTrend > 0) {
      insights.push({
        id: `insight_${Date.now()}_perf`,
        flow_id: flowId,
        insight_type: 'performance_degradation',
        confidence: Math.min(latencyTrend * 3, 90),
        description: `Latency trending up: ${avgLatency.toFixed(0)}ms average. Performance degrading.`,
        recommended_action: 'Optimize flow steps, check external service latency',
        severity: avgLatency > 5000 ? 'high' : 'medium',
        timestamp: new Date(),
      });
    }

    // Insight 3: Resource exhaustion prediction
    if (metrics.executions > 1000 && errorRate > 0) {
      const recentErrorRate =
        (metrics.errors / Math.min(metrics.executions, 100)) * 100;
      if (recentErrorRate > errorRate * 1.5) {
        insights.push({
          id: `insight_${Date.now()}_resource`,
          flow_id: flowId,
          insight_type: 'resource_exhaustion',
          confidence: 75,
          description:
            'Error rate increasing. Possible rate limiting or resource exhaustion.',
          recommended_action: 'Implement backoff strategy, reduce concurrency',
          severity: 'high',
          timestamp: new Date(),
        });
      }
    }

    return insights.slice(0, 3); // Top 3 insights
  }

  /**
   * Get health score for flow
   */
  getFlowHealthScore(flowId: string): FlowHealthScore | null {
    return this.healthScores.get(flowId) || null;
  }

  /**
   * Get all flows by health status
   */
  getFlowsByStatus(
    status: 'healthy' | 'degraded' | 'at_risk' | 'critical',
  ): FlowHealthScore[] {
    return Array.from(this.healthScores.values()).filter(
      (h) => h.status === status,
    );
  }

  /**
   * Get flows needing attention (not healthy)
   */
  getFlowsNeedingAttention(): FlowHealthScore[] {
    return Array.from(this.healthScores.values()).filter(
      (h) => h.status !== 'healthy',
    );
  }

  /**
   * Get predictive insights for flow
   */
  getFlowInsights(flowId: string): PredictiveInsight[] {
    const health = this.healthScores.get(flowId);
    return health?.insights || [];
  }
}
