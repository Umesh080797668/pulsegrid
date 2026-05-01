import { Injectable, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface ErrorPattern {
  id: string;
  error_type: string;
  frequency: number; // occurrences in last 24h
  last_seen: Date;
  severity: 'critical' | 'high' | 'medium' | 'low';
  suggested_fix?: string;
  affected_flows: string[];
}

export interface ErrorIntelligence {
  pattern_id: string;
  error_message: string;
  stack_trace?: string;
  context: Record<string, any>;
  flow_id: string;
  timestamp: Date;
  suggested_actions: string[];
}

export interface AutonomousAction {
  id: string;
  type: 'retry' | 'fallback' | 'alert' | 'heal' | 'scale';
  description: string;
  flow_id: string;
  priority: number;
  executed_at?: Date;
  result?: 'success' | 'failed';
}

@Injectable()
export class ErrorIntelligenceService {
  private readonly logger = new Logger(ErrorIntelligenceService.name);
  private readonly errorPatterns = new Map<string, ErrorPattern>();

  constructor(private eventEmitter: EventEmitter2) {}

  /**
   * Analyze error and extract intelligence
   */
  async analyzeError(error: any, context: any): Promise<ErrorIntelligence> {
    const errorKey = this.generateErrorKey(error);
    const pattern = this.getOrCreatePattern(errorKey, error, context);

    const suggested_actions = await this.generateSuggestedActions(
      error,
      context,
      pattern,
    );

    const intelligence: ErrorIntelligence = {
      pattern_id: pattern.id,
      error_message: error.message,
      stack_trace: error.stack,
      context,
      flow_id: context.flow_id,
      timestamp: new Date(),
      suggested_actions,
    };

    this.logger.debug(
      `Error analyzed: ${errorKey}. Pattern frequency: ${pattern.frequency}`,
    );

    // Emit error intelligence event for autonomous actions
    this.eventEmitter.emit('error.analyzed', intelligence, pattern);

    return intelligence;
  }

  /**
   * Get or create error pattern
   */
  private getOrCreatePattern(
    key: string,
    error: any,
    context: any,
  ): ErrorPattern {
    if (this.errorPatterns.has(key)) {
      const pattern = this.errorPatterns.get(key)!;
      pattern.frequency++;
      pattern.last_seen = new Date();
      if (context.flow_id && !pattern.affected_flows.includes(context.flow_id)) {
        pattern.affected_flows.push(context.flow_id);
      }
      return pattern;
    }

    const severity = this.classifySeverity(error, context);
    const pattern: ErrorPattern = {
      id: `pattern_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      error_type: error.name || 'UnknownError',
      frequency: 1,
      last_seen: new Date(),
      severity,
      affected_flows: context.flow_id ? [context.flow_id] : [],
    };

    this.errorPatterns.set(key, pattern);
    return pattern;
  }

  /**
   * Classify error severity
   */
  private classifySeverity(
    error: any,
    context: any,
  ): 'critical' | 'high' | 'medium' | 'low' {
    const message = error.message.toLowerCase();
    const status = context.status_code;

    // Critical: system down, auth failed, data loss risk
    if (
      message.includes('fatal') ||
      message.includes('panic') ||
      status === 500 ||
      message.includes('authentication')
    ) {
      return 'critical';
    }

    // High: API failures, timeouts affecting multiple flows
    if (status === 503 || status === 429 || message.includes('timeout')) {
      if (context.flow_count && context.flow_count > 5) return 'high';
      return 'medium';
    }

    // Medium: connector issues, transient failures
    if (status === 502 || status === 504 || message.includes('connection')) {
      return 'medium';
    }

    // Low: configuration, permission issues
    return 'low';
  }

  /**
   * Generate suggested actions based on error pattern
   */
  private async generateSuggestedActions(
    error: any,
    context: any,
    pattern: ErrorPattern,
  ): Promise<string[]> {
    const actions: string[] = [];
    const message = error.message.toLowerCase();
    const status = context.status_code;

    // Authentication errors
    if (message.includes('unauthorized') || message.includes('token')) {
      actions.push('Re-authenticate connector');
      actions.push('Check API key expiration');
      actions.push('Rotate credentials');
    }

    // Rate limiting
    if (status === 429 || message.includes('rate limit')) {
      actions.push('Reduce request frequency');
      actions.push('Implement exponential backoff');
      actions.push('Upgrade API plan');
    }

    // Timeout issues
    if (message.includes('timeout') || status === 504) {
      actions.push('Increase timeout threshold');
      actions.push('Implement circuit breaker');
      actions.push('Split large operations');
      actions.push('Check external service status');
    }

    // Database connection issues
    if (message.includes('connection') || message.includes('database')) {
      actions.push('Check database connectivity');
      actions.push('Restart database connection pool');
      actions.push('Scale database resources');
    }

    // Memory/resource exhaustion
    if (message.includes('memory') || message.includes('out of')) {
      actions.push('Optimize flow logic');
      actions.push('Implement pagination');
      actions.push('Clear cached data');
      actions.push('Scale compute resources');
    }

    // Default fallback actions
    if (actions.length === 0) {
      actions.push('Retry with exponential backoff');
      actions.push('Escalate to support');
    }

    return actions.slice(0, 3); // Return top 3 actions
  }

  /**
   * Generate error key for pattern tracking
   */
  private generateErrorKey(error: any): string {
    const name = error.name || 'Unknown';
    const message = error.message || '';
    // Normalize: remove timestamps, IDs, unique identifiers
    const normalized = message.replace(/\d{10,}/g, 'NUM');
    return `${name}:${normalized}`.substring(0, 100);
  }

  /**
   * Get top error patterns
   */
  getTopPatterns(limit: number = 10): ErrorPattern[] {
    return Array.from(this.errorPatterns.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
  }

  /**
   * Get patterns by severity
   */
  getPatternsBySeverity(
    severity: 'critical' | 'high' | 'medium' | 'low',
  ): ErrorPattern[] {
    return Array.from(this.errorPatterns.values()).filter(
      (p) => p.severity === severity,
    );
  }
}
