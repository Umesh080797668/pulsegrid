'use client';

import { useMemo, useState } from 'react';

type ConnectorCatalogItem = {
  connector: string;
  action: string;
  category: string;
  auth: 'none' | 'bearer' | 'api_key' | 'oauth2' | 'mixed';
  required_input_fields: string[];
  optional_input_fields: string[];
};

type FlowDefinition = {
  id: string;
  name: string;
  trigger: {
    connector: string;
    event: string;
    filters: unknown[];
  };
  steps: Array<{
    id: string;
    type: 'action';
    connector: string;
    action: string;
    input_mapping: Record<string, string>;
    depends_on: string[];
    retry_policy: {
      max_retries: number;
      initial_backoff_ms: number;
    };
  }>;
  error_policy?: {
    on_failure: string;
  };
};

function makeStepId() {
  return typeof crypto !== 'undefined' ? crypto.randomUUID() : `step-${Date.now()}`;
}

export function FlowCanvas({
  definitionJson,
  onDefinitionJsonChange,
  connectors,
}: {
  definitionJson: string;
  onDefinitionJsonChange: (value: string) => void;
  connectors: ConnectorCatalogItem[];
}) {
  const [selectedStepId, setSelectedStepId] = useState('');
  const [newConnector, setNewConnector] = useState(() => connectors[0]?.connector || 'custom');
  const [newAction, setNewAction] = useState(() => connectors[0]?.action || 'call_api');
  const [newInputJson, setNewInputJson] = useState('{\n  "endpoint_url": "https://httpbin.org/post",\n  "method": "POST"\n}');

  const parsed = useMemo(() => {
    try {
      return JSON.parse(definitionJson) as FlowDefinition;
    } catch {
      return null;
    }
  }, [definitionJson]);

  const visualSteps = parsed?.steps || [];
  const canEdit = Boolean(parsed);

  function updateDefinition(next: FlowDefinition) {
    onDefinitionJsonChange(JSON.stringify(next, null, 2));
  }

  function addStep() {
    if (!parsed) {
      return;
    }

    let inputMapping: Record<string, string> = {};
    try {
      const parsedInput = newInputJson.trim() ? JSON.parse(newInputJson) : {};
      if (parsedInput && typeof parsedInput === 'object' && !Array.isArray(parsedInput)) {
        inputMapping = Object.fromEntries(
          Object.entries(parsedInput as Record<string, unknown>).map(([key, value]) => [key, JSON.stringify(value)]),
        );
      }
    } catch {
      inputMapping = {};
    }

    updateDefinition({
      ...parsed,
      steps: [
        ...parsed.steps,
        {
          id: makeStepId(),
          type: 'action',
          connector: newConnector,
          action: newAction,
          input_mapping: inputMapping,
          depends_on: parsed.steps.length > 0 ? [parsed.steps[parsed.steps.length - 1].id] : [],
          retry_policy: {
            max_retries: 1,
            initial_backoff_ms: 500,
          },
        },
      ],
    });
    setSelectedStepId('');
  }

  function removeStep(stepId: string) {
    if (!parsed) {
      return;
    }

    const filtered = parsed.steps.filter((step) => step.id !== stepId);
    updateDefinition({
      ...parsed,
      steps: filtered.map((step, index) => ({
        ...step,
        depends_on: index === 0 ? [] : [filtered[index - 1].id],
      })),
    });
    if (selectedStepId === stepId) {
      setSelectedStepId('');
    }
  }

  return (
    <div>
      <div className="muted" style={{ marginBottom: 8 }}>
        Visual builder for trigger + actions. Select a step to remove it, or add a new action step below.
      </div>

      {!canEdit ? (
        <div className="muted" style={{ marginBottom: 12 }}>
          The flow definition is invalid JSON, so the canvas cannot render yet.
        </div>
      ) : null}

      {parsed ? (
        <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', minWidth: 'fit-content' }}>
            <NodeCard
              kind="Trigger"
              title={parsed.trigger.connector}
              subtitle={parsed.trigger.event}
            />
            {visualSteps.map((step, index) => (
              <div key={step.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Arrow />
                <NodeCard
                  kind={`Step ${index + 1}`}
                  title={`${step.connector}.${step.action}`}
                  subtitle={step.id}
                  active={selectedStepId === step.id}
                  onClick={() => setSelectedStepId(step.id)}
                  onRemove={() => removeStep(step.id)}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 16, paddingTop: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <select value={newConnector} onChange={(e) => setNewConnector(e.target.value)}>
            {connectors.length === 0 ? <option value="custom">custom</option> : null}
            {connectors.map((item) => (
              <option key={`${item.connector}:${item.action}`} value={item.connector}>
                {item.connector}
              </option>
            ))}
          </select>
          <input
            style={{ minWidth: 240 }}
            value={newAction}
            onChange={(e) => setNewAction(e.target.value)}
            placeholder="Action name"
          />
          <button onClick={addStep} disabled={!canEdit}>Add Step</button>
        </div>
        <textarea
          rows={5}
          value={newInputJson}
          onChange={(e) => setNewInputJson(e.target.value)}
          placeholder="New step input JSON"
          style={{ width: '100%' }}
        />
        <div className="muted" style={{ marginTop: 8 }}>
          Selected step: {selectedStepId || 'none'}
        </div>
      </div>
    </div>
  );
}

function NodeCard({
  kind,
  title,
  subtitle,
  active,
  onClick,
  onRemove,
}: {
  kind: string;
  title: string;
  subtitle: string;
  active?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        minWidth: 220,
        padding: 14,
        borderRadius: 14,
        border: active ? '1px solid #7c9cff' : '1px solid rgba(255,255,255,0.12)',
        background: active ? 'rgba(124,156,255,0.12)' : 'rgba(255,255,255,0.04)',
        boxShadow: active ? '0 0 0 1px rgba(124,156,255,0.3)' : 'none',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{kind}</div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div className="muted" style={{ wordBreak: 'break-all' }}>{subtitle}</div>
      {onRemove ? (
        <button style={{ marginTop: 10 }} onClick={(e) => { e.stopPropagation(); onRemove(); }}>
          Remove
        </button>
      ) : null}
    </div>
  );
}

function Arrow() {
  return (
    <div style={{ color: '#7c9cff', fontSize: 24, lineHeight: '1' }} aria-hidden="true">
      →
    </div>
  );
}
