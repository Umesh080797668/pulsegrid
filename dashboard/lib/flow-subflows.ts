export type FlowStep = {
  id: string;
  type: string;
  connector?: string;
  action?: string;
  input_mapping?: Record<string, string>;
  depends_on?: string[];
  condition?: string;
  source_language?: 'javascript' | 'python' | string;
  source_code?: string;
  code?: string;
  sub_flow_id?: string;
  sub_flow_input?: string;
};

export type FlowDefinition = {
  id: string;
  name: string;
  description?: string;
  published?: boolean;
  steps: FlowStep[];
  trigger?: {
    connector?: string;
    event?: string;
    filters?: unknown[];
  };
  error_policy?: {
    on_failure: string;
  };
};

export type FlowRecord = {
  id: string;
  name: string;
  description?: string;
  definition: FlowDefinition;
};

export type PublishedSubFlow = {
  id: string;
  name: string;
  description?: string;
  definition: FlowDefinition;
};

function pushUnique(errors: string[], message: string) {
  if (!errors.includes(message)) {
    errors.push(message);
  }
}

export function getPublishedSubFlows(flows: FlowRecord[]): PublishedSubFlow[] {
  return flows
    .filter((flow) => Boolean(flow.definition?.published))
    .map((flow) => ({
      id: flow.id,
      name: flow.name,
      description: flow.description || flow.definition.description,
      definition: flow.definition,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function detectCircularSubFlowReferences(
  candidateDefinition: FlowDefinition,
  currentFlowId: string,
  workspaceFlows: FlowRecord[],
): string[] {
  const errors: string[] = [];
  const rootFlowId = currentFlowId || candidateDefinition.id;
  const flowMap = new Map<string, FlowDefinition>();

  for (const flow of workspaceFlows) {
    if (flow?.id && flow.definition) {
      flowMap.set(flow.id, flow.definition);
    }
  }

  flowMap.set(rootFlowId, candidateDefinition);

  const visit = (flowId: string, stack: string[]): void => {
    const flow = flowMap.get(flowId);
    if (!flow || !Array.isArray(flow.steps)) {
      return;
    }

    for (const step of flow.steps) {
      if (step.type !== 'sub_flow') {
        continue;
      }

      const targetId = (step.sub_flow_id || '').trim();
      if (!targetId) {
        pushUnique(errors, `Sub-flow step "${step.id}" must reference a published flow.`);
        continue;
      }

      const targetFlow = flowMap.get(targetId);
      if (!targetFlow) {
        pushUnique(errors, `Sub-flow step "${step.id}" references unknown flow "${targetId}".`);
        continue;
      }

      if (!targetFlow.published) {
        pushUnique(errors, `Sub-flow step "${step.id}" references unpublished flow "${targetId}".`);
      }

      if (targetId === rootFlowId) {
        pushUnique(errors, `Sub-flow step "${step.id}" cannot reference the flow being saved (${rootFlowId}).`);
        continue;
      }

      if (stack.includes(targetId)) {
        const cycle = [...stack, targetId].join(' -> ');
        pushUnique(errors, `Circular sub-flow reference detected: ${cycle}`);
        continue;
      }

      visit(targetId, [...stack, targetId]);
    }
  };

  visit(rootFlowId, [rootFlowId]);

  return errors;
}
