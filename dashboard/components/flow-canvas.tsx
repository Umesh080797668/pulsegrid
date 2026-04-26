'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  applyNodeChanges,
  applyEdgeChanges,
  OnNodesChange,
  OnEdgesChange,
  Handle,
  Position,
  NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

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

  // React Flow state
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      setSelectedStepId(node.id === 'trigger' ? '' : node.id);
    },
    []
  );

  // Sync JSON -> React Flow elements
  useEffect(() => {
    if (!parsed) return;

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Compute basic topological levels for layout
    const levels = new Map<string, number>();
    levels.set('trigger', 0);
    
    let changed = true;
    while(changed) {
      changed = false;
      for (const step of parsed.steps) {
        const oldLevel = levels.get(step.id) || 0;
        let maxDepLevel = -1;
        const deps = step.depends_on.length > 0 ? step.depends_on : ['trigger'];
        for (const d of deps) {
          maxDepLevel = Math.max(maxDepLevel, levels.get(d) ?? 0);
        }
        const newLevel = maxDepLevel + 1;
        if (newLevel > oldLevel) {
          levels.set(step.id, newLevel);
          changed = true;
        }
      }
    }

    // Counts per level to stack them
    const levelCounts = new Map<number, number>();

    // Trigger Node
    levelCounts.set(0, 1);
    newNodes.push({
      id: 'trigger',
      position: { x: 50, y: 150 },
      data: { kind: 'Trigger', title: parsed.trigger.connector, subtitle: parsed.trigger.event },
      type: 'customNode',
      draggable: true,
    });

    // Steps
    parsed.steps.forEach((step, index) => {
      const level = levels.get(step.id) || 1;
      const count = levelCounts.get(level) || 0;
      levelCounts.set(level, count + 1);
      
      newNodes.push({
        id: step.id,
        position: { x: 50 + (level * 320), y: 50 + (count * 150) },
        data: { 
          kind: `Step ${index + 1}`, 
          title: `${step.connector}.${step.action}`, 
          subtitle: step.id,
        },
        type: 'customNode',
        draggable: true,
      });

      const deps = step.depends_on.length > 0 ? step.depends_on : ['trigger'];
      deps.forEach(dep => {
        newEdges.push({
          id: `e-${dep}-${step.id}`,
          source: dep,
          target: step.id,
          animated: true,
          style: { stroke: '#7c9cff' },
        });
      });
    });

    // To retain manual dragged positions, we could merge with existing nodes.
    // For simplicity, we auto-layout whenever the JSON changes.
    setNodes(n => {
      // Basic merge to keep positions if nodes exist
      return newNodes.map(nn => {
        const existing = n.find(x => x.id === nn.id);
        if (existing) {
          return { ...nn, position: existing.position };
        }
        return nn;
      });
    });
    setEdges(newEdges);
  }, [definitionJson, parsed]);

  const nodeTypes = useMemo(() => ({
    customNode: CustomNode
  }), []);

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

      <div style={{ height: 500, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          colorMode="dark"
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 16, paddingTop: 16 }}>
         {selectedStepId && selectedStepId !== 'trigger' ? (
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => removeStep(selectedStepId)} style={{ color: 'red' }}>
              Remove Selected Step
            </button>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <select value={newConnector} onChange={(e) => setNewConnector(e.target.value)} style={{ padding: '8px' }}>
            {connectors.length === 0 ? <option value="custom">custom</option> : null}
            {connectors.map((item) => (
              <option key={`${item.connector}:${item.action}`} value={item.connector}>
                {item.connector}
              </option>
            ))}
          </select>
          <input
            style={{ minWidth: 240, padding: '8px' }}
            value={newAction}
            onChange={(e) => setNewAction(e.target.value)}
            placeholder="Action name"
          />
          <button onClick={addStep} disabled={!canEdit} style={{ padding: '8px 16px' }}>Add Step</button>
        </div>
        <textarea
          rows={5}
          value={newInputJson}
          onChange={(e) => setNewInputJson(e.target.value)}
          placeholder="New step input JSON"
          style={{ width: '100%', padding: '8px', fontFamily: 'monospace' }}
        />
        <div className="muted" style={{ marginTop: 8 }}>
          Selected step: {selectedStepId || 'none'}
        </div>
      </div>
    </div>
  );
}

function CustomNode({ data, selected }: NodeProps) {
  return (
    <div
      style={{
        minWidth: 220,
        padding: 14,
        borderRadius: 14,
        border: selected ? '1px solid #7c9cff' : '1px solid rgba(255,255,255,0.12)',
        background: selected ? 'rgba(124,156,255,0.12)' : 'rgba(255,255,255,0.04)',
        boxShadow: selected ? '0 0 0 1px rgba(124,156,255,0.3)' : 'none',
        backgroundColor: '#1a1a1a', 
        color: '#fff',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#7c9cff' }} />
      <div className="muted" style={{ fontSize: 12, marginBottom: 6, opacity: 0.7 }}>{typeof data.kind === "string" ? data.kind : "Step"}</div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{typeof data.title === "string" ? data.title : "Title"}</div>
      <div className="muted" style={{ wordBreak: 'break-all', opacity: 0.7, fontSize: 12 }}>{typeof data.subtitle === "string" ? data.subtitle : "Subtitle"}</div>
      <Handle type="source" position={Position.Right} style={{ background: '#7c9cff' }} />
    </div>
  );
}
