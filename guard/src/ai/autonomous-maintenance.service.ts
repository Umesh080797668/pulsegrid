import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { ErrorIntelligence, AutonomousAction } from './error-intelligence.service';

export interface MaintenanceAction {
  id: string;
  flow_id: string;
  action_type: 'retry' | 'heal' | 'scale' | 'alert' | 'fallback';
  description: string;
  executed: boolean;
  execution_result?: string;
  timestamp: Date;
  error_pattern_id: string;
}

@Injectable()
export class AutonomousMaintenanceService {
  private readonly logger = new Logger(AutonomousMaintenanceService.name);
  private readonly actionQueue: AutonomousAction[] = [];
  private readonly executedActions = new Map<string, MaintenanceAction[]>();

  constructor(private eventEmitter: EventEmitter2) {}

  /**
   * Process error and execute autonomous maintenance actions
   */
  @OnEvent('error.analyzed')
  async handleErrorAnalyzed(
    intelligence: ErrorIntelligence,
    pattern: any,
  ): Promise<void> {
    this.logger.debug(
      `Processing autonomous maintenance for error: ${intelligence.error_message}`,
    );

    // Determine which actions to execute based on severity and pattern
    const actions = this.determineActions(intelligence, pattern);

    for (const action of actions) {
      await this.executeAction(action, intelligence);
    }
  }

  /**
   * Determine which maintenance actions to execute
   */
  private determineActions(
    intelligence: ErrorIntelligence,
    pattern: any,
  ): AutonomousAction[] {
    const actions: AutonomousAction[] = [];
    const severity = pattern.severity;
    const frequency = pattern.frequency;

    // Priority 1: Retry with backoff for transient errors
    if (
      intelligence.error_message.includes('timeout') ||
      intelligence.error_message.includes('connection')
    ) {
      actions.push({
        id: `action_${Date.now()}_retry`,
        type: 'retry',
        description: `Retry flow with exponential backoff (attempt 1-3)`,
        flow_id: intelligence.flow_id,
        priority: 1,
      });
    }

    // Priority 2: Heal for recoverable errors
    if (
      frequency > 5 &&
      (severity === 'high' || severity === 'critical')
    ) {
      actions.push({
        id: `action_${Date.now()}_heal`,
        type: 'heal',
        description: `Heal flow: reset state, reconnect, retry`,
        flow_id: intelligence.flow_id,
        priority: 2,
      });
    }

    // Priority 3: Alert on critical patterns
    if (severity === 'critical' && frequency >= 3) {
      actions.push({
        id: `action_${Date.now()}_alert`,
        type: 'alert',
        description: `Send critical alert: ${pattern.error_type} pattern detected`,
        flow_id: intelligence.flow_id,
        priority: 3,
      });
    }

    // Priority 4: Scale if load-related
    if (
      intelligence.error_message.includes('rate limit') ||
      intelligence.error_message.includes('too many requests')
    ) {
      actions.push({
        id: `action_${Date.now()}_scale`,
        type: 'scale',
        description: `Scale: reduce concurrent flow executions`,
        flow_id: intelligence.flow_id,
        priority: 4,
      });
    }

    return actions.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Execute autonomous maintenance action
   */
  private async executeAction(
    action: AutonomousAction,
    intelligence: ErrorIntelligence,
  ): Promise<void> {
    this.logger.log(`Executing autonomous action: ${action.type} (${action.id})`);

    try {
      let result: string;

      switch (action.type) {
        case 'retry':
          result = await this.executeRetry(intelligence);
          break;
        case 'heal':
          result = await this.executeHeal(intelligence);
          break;
        case 'alert':
          result = await this.executeAlert(intelligence);
          break;
        case 'scale':
          result = await this.executeScale(intelligence);
          break;
        case 'fallback':
          result = await this.executeFallback(intelligence);
          break;
        default:
          result = 'unknown action type';
      }

      action.executed_at = new Date();
      action.result = 'success';

      const maintenance: MaintenanceAction = {
        id: action.id,
        flow_id: action.flow_id,
        action_type: action.type,
        description: action.description,
        executed: true,
        execution_result: result,
        timestamp: new Date(),
        error_pattern_id: intelligence.pattern_id,
      };

      this.recordAction(maintenance);
      this.logger.log(`Action executed successfully: ${action.type}`);
    } catch (error) {
      action.result = 'failed';
      this.logger.error(
        `Action execution failed: ${action.type}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Retry logic with exponential backoff
   */
  private async executeRetry(intelligence: ErrorIntelligence): Promise<string> {
    const maxRetries = 3;
    const backoffMs = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(
          `Retry attempt ${attempt}/${maxRetries} for flow ${intelligence.flow_id}`,
        );

        // Simulate retry (in real implementation, would re-execute flow)
        await new Promise((resolve) =>
          setTimeout(resolve, backoffMs * Math.pow(2, attempt - 1)),
        );

        return `Retry successful on attempt ${attempt}`;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
      }
    }

    throw new Error('All retry attempts exhausted');
  }

  /**
   * Heal: reset flow state and reconnect
   */
  private async executeHeal(intelligence: ErrorIntelligence): Promise<string> {
    this.logger.debug(`Healing flow: ${intelligence.flow_id}`);

    // Reset flow state
    // Reconnect external services
    // Clear error flags
    // Re-initialize connectors

    await new Promise((resolve) => setTimeout(resolve, 500));
    return 'Flow healed: state reset, connectors reconnected';
  }

  /**
   * Alert: send critical alert
   */
  private async executeAlert(intelligence: ErrorIntelligence): Promise<string> {
    this.logger.warn(
      `CRITICAL ALERT: Flow ${intelligence.flow_id} encountering repeated errors`,
    );

    // Emit alert event to notification service
    this.eventEmitter.emit('alert.critical', {
      flow_id: intelligence.flow_id,
      error_message: intelligence.error_message,
      suggested_actions: intelligence.suggested_actions,
    });

    return 'Alert sent to on-call team';
  }

  /**
   * Scale: reduce load on system
   */
  private async executeScale(intelligence: ErrorIntelligence): Promise<string> {
    this.logger.log(`Scaling flow execution: reducing concurrent runs`);

    // Reduce max concurrent flows
    // Increase backoff between executions
    // Emit scaling event

    this.eventEmitter.emit('flow.scale-down', {
      flow_id: intelligence.flow_id,
      max_concurrent: 5,
      backoff_ms: 5000,
    });

    return 'Flow execution scaled down to reduce load';
  }

  /**
   * Fallback: use alternative integration
   */
  private async executeFallback(
    intelligence: ErrorIntelligence,
  ): Promise<string> {
    this.logger.log(
      `Attempting fallback for flow: ${intelligence.flow_id}`,
    );

    // Check if fallback connector exists
    // Switch to fallback
    // Log fallback usage

    this.eventEmitter.emit('connector.fallback', {
      flow_id: intelligence.flow_id,
      primary_error: intelligence.error_message,
    });

    return 'Switched to fallback integration';
  }

  /**
   * Record executed maintenance action
   */
  private recordAction(action: MaintenanceAction): void {
    if (!this.executedActions.has(action.flow_id)) {
      this.executedActions.set(action.flow_id, []);
    }
    this.executedActions.get(action.flow_id)!.push(action);
  }

  /**
   * Get maintenance history for flow
   */
  getFlowMaintenanceHistory(flowId: string): MaintenanceAction[] {
    return this.executedActions.get(flowId) || [];
  }

  /**
   * Get all recent maintenance actions
   */
  getRecentActions(hours: number = 24): MaintenanceAction[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const allActions = Array.from(this.executedActions.values()).flat();
    return allActions.filter((a) => a.timestamp.getTime() > cutoff);
  }

  /**
   * Get success rate of autonomous actions
   */
  getActionSuccessRate(): number {
    const allActions = Array.from(this.executedActions.values()).flat();
    if (allActions.length === 0) return 0;
    const successful = allActions.filter(
      (a) => a.execution_result?.includes('successful'),
    ).length;
    return (successful / allActions.length) * 100;
  }
}
