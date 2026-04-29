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
  Connection,
  addEdge,
} from '@xyflow/react';
import dagre from 'dagre';
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
    type: 'action' | 'parallel' | 'loop' | 'sub_flow';
    connector: string;
    action: string;
    input_mapping: Record<string, string>;
    depends_on: string[];
    retry_policy: {
      max_retries: number;
      initial_backoff_ms: number;
    };
    condition?: string;
  }>;
  error_policy?: {
    on_failure: string;
  };
};

function makeStepId() {
  return typeof crypto !== 'undefined' ? crypto.randomUUID() : `step-${Date.now()}`;
}

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'LR' });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 250, height: 120 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = Position.Left;
    node.sourcePosition = Position.Right;
    node.position = {
      x: nodeWithPosition.x - 250 / 2,
      y: nodeWithPosition.y - 120 / 2,
    };
  });

  return { nodes, edges };
};

export function FlowCanvas({
  definitionJson,
  onDefinitionJsonChange,
  catalog,
}: {
  definitionJson: string;
  onDefinitionJsonChange: (value: string) => void;
  catalog: ConnectorCatalogItem[];
}) {
  const [selectedStepId, setSelectedStepId] = useState('');

  const connectorOptions = useMemo(
    () => Array.from(new Set(catalog.map((item) => item.connector))),
    [catalog]
  );
  
  // Add step state
  const [newConnector, setNewConnector] = useState(() => connectorOptions[0] || 'custom');
  const [newAction, setNewAction] = useState('call_api');
  const [newStepType, setNewStepType] = useState<'action' | 'parallel' | 'loop' | 'sub_flow'>('action');

  const actionOptions = useMemo(
    () => catalog.filter((item) => item.connector === newConnector).map((item) => item.action),
    [catalog, newConnector]
  );
  
  // Edit step state
  const [editAction, setEditAction] = useState('');
  const [editConnector, setEditConnector] = useState('');
  const [editInputJson, setEditInputJson] = useState('');
  const [editCondition, setEditCondition] = useState('');

  const parsed = useMemo(() => {
    try {
      return JSON.parse(definitionJson) as FlowDefinition;
    } catch {
      return null;
    }
  }, [definitionJson]);

  const canEdit = Boolean(parsed);
  const selectedStep = parsed?.steps.find(s => s.id === selectedStepId);

  useEffect(() => {
    if (selectedStep) {
      setEditAction(selectedStep.action);
      setEditConnector(selectedStep.connector);
      setEditInputJson(JSON.stringify(selectedStep.input_mapping, null, 2));
      setEditCondition(selectedStep.condition || '');
    }
  }, [selectedStepId, selectedStep]);

  useEffect(() => {
    if (connectorOptions.length === 0) {
      setNewConnector('custom');
      setNewAction('call_api');
      return;
    }

    if (!connectorOptions.includes(newConnector)) {
      setNewConnector(connectorOptions[0]);
    }
  }, [connectorOptions, newConnector]);

  useEffect(() => {
    if (actionOptions.length === 0) {
      setNewAction('call_api');
      return;
    }

    if (!actionOptions.includes(newAction)) {
      setNewAction(actionOptions[0]);
    }
  }, [actionOptions, newAction]);

  function updateDefinition(next: FlowDefinition) {
    onDefinitionJsonChange(JSON.stringify(next, null, 2));
  }

  function addStep() {
    if (!parsed) return;

    updateDefinition({
      ...parsed,
      steps: [
        ...parsed.steps,
        {
          id: makeStepId(),
          type: newStepType,
          connector: newConnector,
          action: newAction,
          input_mapping: {},
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
    if (!parsed) return;
    const filtered = parsed.steps.filter((step) => step.id !== stepId);
    updateDefinition({
      ...parsed,
      steps: filtered.map((step) => ({
        ...step,
        depends_on: step.depends_on.filter(dep => dep !== stepId)
      })),
    });
    if (selectedStepId === stepId) {
      setSelectedStepId('');
    }
  }

  function updateSelectedStep() {
    if (!parsed || !selectedStepId) return;

    let inputMapping = {};
    try {
      inputMapping = editInputJson.trim() ? JSON.parse(editInputJson) : {};
    } catch {
      // Ignore parse error
      inputMapping = selectedStep?.input_mapping || {};
    }

    updateDefinition({
      ...parsed,
      steps: parsed.steps.map(step => {
        if (step.id === selectedStepId) {
          return {
            ...step,
            action: editAction,
            connector: editConnector,
            input_mapping: inputMapping,
            condition: editCondition ? editCondition : undefined,
          };
        }
        return step;
      })
    });
  }

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

  const onConnect = useCallback((connection: Connection) => {
    if (!parsed) return;
    
    // Updates dependencies when dragging an edge
    const sourceId = connection.source;
    const targetId = connection.target;
    
    if (sourceId && targetId && targetId !== 'trigger') {
      const dependsOnAdd = sourceId === 'trigger' ? [] : [sourceId];
      
      updateDefinition({
        ...parsed,
        steps: parsed.steps.map(step => {
          if (step.id === targetId) {
            const currentDeps = step.depends_on.filter(d => d !== 'trigger');
            const newDeps = Array.from(new Set([...currentDeps, ...dependsOnAdd]));
            return {
              ...step,
              depends_on: newDeps
            };
          }
          return step;
        })
      });
    }
  }, [parsed]);

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      setSelectedStepId(node.id === 'trigger' ? '' : node.id);
    },
    []
  );

  useEffect(() => {
    if (!parsed) return;

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    newNodes.push({
      id: 'trigger',
      position: { x: 0, y: 0 },
      data: { kind: 'Trigger', title: parsed.trigger.connector, subtitle: parsed.trigger.event, stepType: 'trigger' },
      type: 'customNode',
      draggable: true,
    });

    parsed.steps.forEach((step, index) => {
      newNodes.push({
        id: step.id,
        position: { x: 0, y: 0 },
        data: { 
          kind: step.type === 'action' ? `Step ${index + 1}` : `${step.type.toUpperCase()} ${index + 1}`,
          title: `${step.connector}.${step.action}`, 
          subtitle: step.id,
          stepType: step.type,
        },
        type: step.type === 'loop' ? 'loopNode' : step.type === 'parallel' ? 'parallelNode' : 'customNode',
        draggable: true,
      });

      const deps = step.depends_on.length > 0 ? step.depends_on.filter(d => d !== 'trigger') : [];
      if (deps.length === 0) {
        newEdges.push({
          id: `e-trigger-${step.id}`,
          source: 'trigger',
          target: step.id,
          animated: true,
          style: { stroke: '#7c9cff' },
        });
      } else {
        deps.forEach(dep => {
          newEdges.push({
            id: `e-${dep}-${step.id}`,
            source: dep,
            target: step.id,
            animated: true,
            style: { stroke: '#7c9cff' },
          });
        });
      }
    });

    const layouted = getLayoutedElements(newNodes, newEdges);
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [definitionJson, parsed]);

  const nodeTypes = useMemo(() => ({
    customNode: CustomNode, loopNode: LoopNode, parallelNode: ParallelNode
  }), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="muted">
        Visual builder for trigger + actions. Connect nodes safely to build parallel DAGs or complex logic.
      </div>
      
      {!canEdit ? (
        <div className="muted">
          The flow definition is invalid JSON, so the canvas cannot render yet.
        </div>
      ) : null}

      <div style={{ height: 500, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          colorMode="dark"
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        {/* ADD STEP PANEL */}
        <div style={{ flex: 1, padding: 16, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.02)' }}>
          <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 16 }}>Add New Step</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={newStepType} onChange={(e) => setNewStepType(e.target.value as any)} style={{ padding: '8px', flex: 1 }}>
                <option value="action">Action</option>
                <option value="parallel">Parallel</option>
                <option value="loop">Loop</option>
                <option value="sub_flow">Sub-Flow</option>
              </select>
              <select value={newConnector} onChange={(e) => setNewConnector(e.target.value)} style={{ padding: '8px', flex: 1 }}>
                {connectorOptions.length === 0 ? <option value="custom">custom</option> : null}
                {connectorOptions.map((connector) => (
                  <option key={connector} value={connector}>
                    {connector}
                  </option>
                ))}
              </select>
            </div>
            <select value={newAction} onChange={(e) => setNewAction(e.target.value)} style={{ padding: '8px', flex: 1 }}>
              {actionOptions.length === 0 ? <option value="call_api">call_api</option> : null}
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
            <button onClick={addStep} disabled={!canEdit} style={{ padding: '8px', backgroundColor: '#7c9cff', color: '#000', fontWeight: 'bold' }}>
              Add Step
            </button>
          </div>
        </div>

        {/* EDIT STEP PANEL */}
        {selectedStep ? (
          <div style={{ flex: 1, padding: 16, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Edit {selectedStep.type} ({selectedStep.id})</h3>
              <button onClick={() => removeStep(selectedStep.id)} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid red', color: 'red', borderRadius: 4, fontSize: 12 }}>
                Delete
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={{ padding: '8px', flex: 1 }}
                  value={editConnector}
                  onChange={(e) => setEditConnector(e.target.value)}
                  placeholder="Connector"
                />
                <input
                  style={{ padding: '8px', flex: 1 }}
                  value={editAction}
                  onChange={(e) => setEditAction(e.target.value)}
                  placeholder="Action"
                />
              </div>
              <textarea
                rows={4}
                value={editInputJson}
                onChange={(e) => setEditInputJson(e.target.value)}
                placeholder="Input mapping JSON"
                style={{ width: '100%', padding: '8px', fontFamily: 'monospace' }}
              />
              {selectedStep.type === 'loop' && (
                <input
                  style={{ padding: '8px' }}
                  value={editCondition}
                  onChange={(e) => setEditCondition(e.target.value)}
                  placeholder="Loop Condition (e.g., array length > 0)"
                />
              )}
              <button onClick={updateSelectedStep} style={{ padding: '8px', backgroundColor: '#22d674', color: '#000', fontWeight: 'bold' }}>
                Save Changes
              </button>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, padding: 16, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
            Select a step on the canvas to edit.
          </div>
        )}
      </div>
    </div>
  );
}

function CustomNode({ data, selected }: NodeProps) {
  const stepType = typeof data.stepType === 'string' ? data.stepType : 'action';
  const borderColor = stepType === 'parallel' ? '#22d674' : stepType === 'loop' ? '#f59e0b' : stepType === 'sub_flow' ? '#8b5cf6' : '#7c9cff';
  
  return (
    <div
      style={{
        minWidth: 220,
        padding: 14,
        borderRadius: 14,
        border: selected ? `1px solid ${borderColor}` : '1px solid rgba(255,255,255,0.12)',
        background: selected ? `${borderColor}20` : 'rgba(255,255,255,0.04)',
        boxShadow: selected ? `0 0 0 1px ${borderColor}3d` : 'none',
        backgroundColor: '#1a1a1a', 
        color: '#fff',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: borderColor, width: 8, height: 8 }} />
      <div className="muted" style={{ fontSize: 12, marginBottom: 6, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {typeof data.kind === "string" ? data.kind : "Step"}
      </div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {typeof data.title === "string" ? data.title : "Title"}
      </div>
      <div className="muted" style={{ wordBreak: 'break-all', opacity: 0.7, fontSize: 12 }}>
        {typeof data.subtitle === "string" ? data.subtitle : "Subtitle"}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        <span className="badge b-neutral" style={{ fontSize: 10, borderColor, color: borderColor }}>
          {stepType}
        </span>
      </div>
      
      <Handle type="source" position={Position.Right} style={{ top: '50%', background: borderColor, width: 8, height: 8 }} />
    </div>
  );
}

function LoopNode({ data, selected }: NodeProps) {
  const borderColor = '#f59e0b';
  return (
    <div style={{ minWidth: 240, padding: 14, borderRadius: 14, border: selected ? `1px solid ${borderColor}` : '1px solid rgba(255,255,255,0.12)', background: selected ? `${borderColor}20` : 'rgba(255,255,255,0.04)', backgroundColor: '#1a1a1a', color: '#fff' }}>
      <Handle type="target" position={Position.Left} style={{ background: borderColor }} />
      <div style={{ fontSize: 12, marginBottom: 6, color: borderColor, fontWeight: 600, letterSpacing: '0.05em' }}>LOOP</div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{String(data.title)}</div>
      <div style={{ opacity: 0.7, fontSize: 12, wordBreak: 'break-all' }}>{String(data.subtitle)}</div>
      <Handle type="source" position={Position.Right} style={{ top: '30%', background: borderColor }} id="body" />
      <Handle type="source" position={Position.Right} style={{ top: '70%', background: '#7c9cff' }} id="next" />
    </div>
  );
}

function ParallelNode({ data, selected }: NodeProps) {
  const borderColor = '#22d674';
  return (
    <div style={{ minWidth: 240, padding: 14, borderRadius: 14, border: selected ? `1px solid ${borderColor}` : '1px solid rgba(255,255,255,0.12)', background: selected ? `${borderColor}20` : 'rgba(255,255,255,0.04)', backgroundColor: '#1a1a1a', color: '#fff' }}>
      <Handle type="target" position={Position.Left} style={{ background: borderColor }} />
      <div style={{ fontSize: 12, marginBottom: 6, color: borderColor, fontWeight: 600, letterSpacing: '0.05em' }}>PARALLEL</div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{String(data.title)}</div>
      <div style={{ opacity: 0.7, fontSize: 12, wordBreak: 'break-all' }}>{String(data.subtitle)}</div>
      <Handle type="source" position={Position.Right} style={{ background: borderColor }} />
    </div>
  );
}
