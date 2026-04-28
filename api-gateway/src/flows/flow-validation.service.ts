import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { FlowDefinitionDto, FlowStepDto } from '../dto';

export interface FlowValidationResult {
  valid: boolean;
  errors: string[];
}

@Injectable()
export class FlowValidationService {
  private readonly logger = new Logger('FlowValidationService');

  /**
   * Perform structural validation on flow definition
   * Checks for:
   * - Step ID uniqueness
   * - Dependency graph validity
   * - Circular dependencies
   * - Step type compatibility with connector/action
   * - Conditional syntax validity
   */
  validateFlowDefinition(definition: FlowDefinitionDto): FlowValidationResult {
    const errors: string[] = [];

    // Step 1: Validate step ID uniqueness
    const stepIds = definition.steps.map((s) => s.id);
    const uniqueIds = new Set(stepIds);
    if (uniqueIds.size !== stepIds.length) {
      const duplicates = stepIds.filter((id, index) => stepIds.indexOf(id) !== index);
      errors.push(`Duplicate step IDs found: ${[...new Set(duplicates)].join(', ')}`);
    }

    // Step 2: Validate step dependencies
    const validStepIds = new Set(['trigger', ...stepIds]);
    for (const step of definition.steps) {
      for (const dep of step.depends_on || []) {
        if (!validStepIds.has(dep)) {
          errors.push(`Step "${step.id}" depends on non-existent step "${dep}"`);
        }
      }
    }

    // Step 3: Check for circular dependencies
    const circularDeps = this.detectCircularDependencies(definition.steps);
    if (circularDeps.length > 0) {
      errors.push(`Circular dependencies detected: ${circularDeps.join(' -> ')}`);
    }

    // Step 4: Validate step types and required fields
    for (const step of definition.steps) {
      const typeErrors = this.validateStepType(step);
      errors.push(...typeErrors);
    }

    // Step 5: Validate conditional expressions
    for (const step of definition.steps) {
      if (step.condition) {
        const condErrors = this.validateConditionExpression(step.condition, step.id);
        errors.push(...condErrors);
      }
    }

    // Step 6: Validate error policy
    if (definition.error_policy?.fallback_step_id) {
      if (!validStepIds.has(definition.error_policy.fallback_step_id)) {
        errors.push(
          `Error policy fallback step "${definition.error_policy.fallback_step_id}" does not exist`,
        );
      }
    }

    // Step 7: Validate trigger exists and has required fields
    if (!definition.trigger) {
      errors.push('Flow definition must have a trigger');
    } else if (!definition.trigger.connector || !definition.trigger.event) {
      errors.push('Trigger must have connector and event specified');
    }

    // Step 8: Validate at least one action step exists
    const hasAction = definition.steps.some((s) => s.type === 'action');
    if (!hasAction) {
      errors.push('Flow must have at least one action step');
    }

    // Step 9: Validate timeout values
    if (definition.timeout_ms && definition.timeout_ms < 0) {
      errors.push('Flow timeout_ms must be non-negative');
    }
    for (const step of definition.steps) {
      if (step.timeout_ms && step.timeout_ms < 0) {
        errors.push(`Step "${step.id}" timeout_ms must be non-negative`);
      }
    }

    // Step 10: Validate input mappings reference valid sources
    for (const step of definition.steps) {
      if (step.input_mapping) {
        for (const [, source] of Object.entries(step.input_mapping)) {
          const sourceErrors = this.validateInputSource(source, step.id, validStepIds);
          errors.push(...sourceErrors);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Detect circular dependencies in step execution graph
   */
  private detectCircularDependencies(steps: FlowStepDto[]): string[] {
    const graph = new Map<string, Set<string>>();

    // Build adjacency list
    for (const step of steps) {
      if (!graph.has(step.id)) {
        graph.set(step.id, new Set());
      }
      for (const dep of step.depends_on || []) {
        if (!graph.has(dep)) {
          graph.set(dep, new Set());
        }
        graph.get(step.id)!.add(dep);
      }
    }

    // DFS-based cycle detection
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[] = [];

    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      for (const neighbor of graph.get(node) || []) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        } else if (recursionStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart).concat([neighbor]);
          cycles.push(cycle.join(' -> '));
        }
      }

      recursionStack.delete(node);
    };

    for (const stepId of graph.keys()) {
      if (!visited.has(stepId)) {
        dfs(stepId, []);
      }
    }

    return cycles;
  }

  /**
   * Validate step type and required fields based on type
   */
  private validateStepType(step: FlowStepDto): string[] {
    const errors: string[] = [];

    switch (step.type) {
      case 'action':
        if (!step.connector || !step.action) {
          errors.push(
            `Action step "${step.id}" must have both connector and action specified`,
          );
        }
        break;

      case 'condition':
        if (!step.condition) {
          errors.push(`Condition step "${step.id}" must have a condition expression`);
        }
        break;

      case 'loop':
        if (!step.condition) {
          errors.push(`Loop step "${step.id}" must have a loop condition`);
        }
        break;

      case 'parallel':
        if (!step.depends_on || step.depends_on.length === 0) {
          errors.push(
            `Parallel step "${step.id}" must have at least one dependency to parallelize`,
          );
        }
        break;

      case 'delay':
        if (!step.timeout_ms || step.timeout_ms <= 0) {
          errors.push(`Delay step "${step.id}" must have a positive timeout_ms`);
        }
        break;

      case 'transform':
        if (!step.action) {
          errors.push(`Transform step "${step.id}" must have an action specified`);
        }
        break;

      case 'filter':
        if (!step.condition) {
          errors.push(`Filter step "${step.id}" must have a condition expression`);
        }
        break;

      case 'sub_flow':
        if (!step.action) {
          errors.push(`Sub-flow step "${step.id}" must have a sub-flow ID in action`);
        }
        break;

      case 'fork':
        if (!step.depends_on || step.depends_on.length === 0) {
          errors.push(`Fork step "${step.id}" must have dependencies`);
        }
        break;

      case 'trigger':
        errors.push(`Trigger type cannot be used as a regular step (id: "${step.id}")`);
        break;

      default:
        errors.push(
          `Unknown step type "${step.type}" for step "${step.id}"`,
        );
    }

    return errors;
  }

  /**
   * Validate conditional expression syntax
   */
  private validateConditionExpression(condition: string, stepId: string): string[] {
    const errors: string[] = [];

    // Basic checks for expression syntax
    if (!condition || condition.trim().length === 0) {
      errors.push(`Step "${stepId}" has empty condition expression`);
      return errors;
    }

    // Check for balanced brackets/parens
    const brackets = { '(': 0, '{': 0, '[': 0 };
    for (const char of condition) {
      if (char === '(') brackets['(']++;
      if (char === ')') brackets['(']--;
      if (char === '{') brackets['{']++;
      if (char === '}') brackets['{']--;
      if (char === '[') brackets['[']++;
      if (char === ']') brackets['[']--;

      for (const [bracket, count] of Object.entries(brackets)) {
        if (count < 0) {
          errors.push(
            `Step "${stepId}" condition has unmatched closing ${bracket}`,
          );
          break;
        }
      }
    }

    for (const [bracket, count] of Object.entries(brackets)) {
      if (count > 0) {
        errors.push(`Step "${stepId}" condition has unmatched opening ${bracket}`);
      }
    }

    // Check for common operators
    const operators = /\s*(and|or|not|&&|\|\||!|==|!=|<|>|<=|>=)\s*/i;
    if (!operators.test(condition)) {
      // Allow simple variable references
      if (!/^[\w.]+$/.test(condition.trim())) {
        errors.push(
          `Step "${stepId}" condition may have invalid syntax: "${condition}"`,
        );
      }
    }

    return errors;
  }

  /**
   * Validate input source references (e.g., "steps.previous.output")
   */
  private validateInputSource(
    source: string,
    stepId: string,
    validStepIds: Set<string>,
  ): string[] {
    const errors: string[] = [];

    if (!source || typeof source !== 'string') {
      return errors;
    }

    // Parse source reference: e.g., "steps.step_id.field" or "trigger.field"
    const parts = source.split('.');
    if (parts.length < 2) {
      errors.push(
        `Step "${stepId}" has invalid input source format: "${source}" (expected "steps.step_id.field" or "trigger.field")`,
      );
      return errors;
    }

    const sourceType = parts[0];
    if (sourceType === 'steps') {
      const referencedStepId = parts[1];
      if (!validStepIds.has(referencedStepId)) {
        errors.push(
          `Step "${stepId}" references non-existent step in input mapping: "${referencedStepId}"`,
        );
      }
    } else if (sourceType !== 'trigger' && sourceType !== 'env') {
      errors.push(
        `Step "${stepId}" has unknown input source type: "${sourceType}" (expected "steps", "trigger", or "env")`,
      );
    }

    return errors;
  }

  /**
   * Validate and throw error if invalid
   */
  validateFlowDefinitionOrThrow(definition: FlowDefinitionDto): void {
    const result = this.validateFlowDefinition(definition);
    if (!result.valid) {
      this.logger.error(
        `Flow validation failed: ${result.errors.join('; ')}`,
      );
      throw new BadRequestException({
        message: 'Flow definition validation failed',
        errors: result.errors,
      });
    }
  }
}
