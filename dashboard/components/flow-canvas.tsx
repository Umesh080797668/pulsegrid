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
import { CodeStepEditor } from './code-step-editor';
import {
  detectCircularSubFlowReferences,
  getPublishedSubFlows,
  type FlowRecord,
  type PublishedSubFlow,
} from '../lib/flow-subflows';

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
  published?: boolean;
  description?: string;
  trigger: {
    connector: string;
    event: string;
    filters: unknown[];
  };
  steps: Array<{
    id: string;
    type: 'action' | 'parallel' | 'parallel_split' | 'merge' | 'loop' | 'sub_flow' | 'code';
    connector?: string;
    action?: string;
    input_mapping: Record<string, string>;
    depends_on: string[];
    retry_policy: {
      max_retries: number;
      initial_backoff_ms: number;
    };
    condition?: string;
    script_language?: 'javascript' | 'python';
    code?: string;
    source_code?: string;
    source_language?: 'javascript' | 'python';
    sub_flow_id?: string;
    sub_flow_input?: string;
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
  flowLibrary = [],
  currentFlowId = '',
}: {
  definitionJson: string;
  onDefinitionJsonChange: (value: string) => void;
  catalog: ConnectorCatalogItem[];
  flowLibrary?: FlowRecord[];
  currentFlowId?: string;
}) {
  const [selectedStepId, setSelectedStepId] = useState('');

  const connectorOptions = useMemo(
    () => Array.from(new Set(catalog.map((item) => item.connector))),
    [catalog]
  );
  
  // Add step state
  const [newConnector, setNewConnector] = useState(() => connectorOptions[0] || 'custom');
  const [newAction, setNewAction] = useState('call_api');
  const [newStepType, setNewStepType] = useState<'action' | 'parallel' | 'parallel_split' | 'merge' | 'loop' | 'sub_flow' | 'code'>('action');
  const [newSubFlowId, setNewSubFlowId] = useState('');
  const [newSubFlowInput, setNewSubFlowInput] = useState('{\n  "event_type": "{{trigger.event_type}}"\n}');

  const actionOptions = useMemo(
    () => catalog.filter((item) => item.connector === newConnector).map((item) => item.action),
    [catalog, newConnector]
  );
  
  // Edit step state
  const [editAction, setEditAction] = useState('');
  const [editConnector, setEditConnector] = useState('');
  const [editInputJson, setEditInputJson] = useState('');
  const [editCondition, setEditCondition] = useState('');
  const [editSourceLanguage, setEditSourceLanguage] = useState<'javascript' | 'python'>('javascript');
  const [editSourceCode, setEditSourceCode] = useState('');
  const [editCompiledWasm, setEditCompiledWasm] = useState('');
  const [editSubFlowId, setEditSubFlowId] = useState('');
  const [editSubFlowInput, setEditSubFlowInput] = useState('');
  const [compileStatus, setCompileStatus] = useState('');
  const [compileError, setCompileError] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [subFlowValidationErrors, setSubFlowValidationErrors] = useState<string[]>([]);
  const [libraryQuery, setLibraryQuery] = useState('');

  const publishedSubFlows = useMemo(() => getPublishedSubFlows(flowLibrary), [flowLibrary]);
  const publishedSubFlowLookup = useMemo(
    () => new Map(publishedSubFlows.map((flow) => [flow.id, flow])),
    [publishedSubFlows],
  );

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
      setEditAction(selectedStep.action || '');
      setEditConnector(selectedStep.connector || '');
      setEditInputJson(JSON.stringify(selectedStep.input_mapping, null, 2));
      setEditCondition(selectedStep.condition || '');
      setEditSourceLanguage(selectedStep.source_language || selectedStep.script_language || 'javascript');
      setEditSourceCode(selectedStep.source_code || 'function transform(input) {\n  return input;\n}');
      setEditCompiledWasm(selectedStep.code || '');
      setCompileStatus(selectedStep.code ? 'WASM artifact attached' : 'Awaiting compile');
      setCompileError('');
      setEditSubFlowId(selectedStep.sub_flow_id || '');
      setEditSubFlowInput(selectedStep.sub_flow_input || '{\n  "event_type": "{{trigger.event_type}}"\n}');
    }
  }, [selectedStepId, selectedStep]);

  useEffect(() => {
    if (!parsed) {
      setSubFlowValidationErrors([]);
      return;
    }

    const errors = detectCircularSubFlowReferences(
      parsed,
      currentFlowId || parsed.id,
      flowLibrary,
    );
    setSubFlowValidationErrors(errors);
  }, [currentFlowId, flowLibrary, parsed]);

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

  useEffect(() => {
    if (publishedSubFlows.length === 0) {
      setNewSubFlowId('');
      return;
    }

    if (!publishedSubFlows.some((flow) => flow.id === newSubFlowId)) {
      setNewSubFlowId(publishedSubFlows[0].id);
    }
  }, [newSubFlowId, publishedSubFlows]);

  function updateDefinition(next: FlowDefinition) {
    onDefinitionJsonChange(JSON.stringify(next, null, 2));
  }

  function addStep() {
    if (!parsed) return;

    const isCodeStep = newStepType === 'code';
    const isSubFlowStep = newStepType === 'sub_flow';

    updateDefinition({
      ...parsed,
      steps: [
        ...parsed.steps,
        {
          id: makeStepId(),
          type: newStepType,
          ...(isCodeStep
            ? {
                source_language: 'javascript',
                source_code: 'function transform(input) {\n  return input;\n}',
                code: '',
              }
            : isSubFlowStep
              ? {
                  sub_flow_id: newSubFlowId,
                  sub_flow_input: newSubFlowInput,
                }
              : {
                connector: newConnector,
                action: newAction,
              }),
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

  function addLibrarySubFlow(flow: PublishedSubFlow) {
    if (!parsed) return;

    const newStepId = makeStepId();
    updateDefinition({
      ...parsed,
      steps: [
        ...parsed.steps,
        {
          id: newStepId,
          type: 'sub_flow',
          sub_flow_id: flow.id,
          sub_flow_input: '{\n  "event_type": "{{trigger.event_type}}"\n}',
          input_mapping: {},
          depends_on: parsed.steps.length > 0 ? [parsed.steps[parsed.steps.length - 1].id] : [],
          retry_policy: {
            max_retries: 1,
            initial_backoff_ms: 500,
          },
        },
      ],
    });
    setNewStepType('sub_flow');
    setNewSubFlowId(flow.id);
    setNewSubFlowInput('{\n  "event_type": "{{trigger.event_type}}"\n}');
    setSelectedStepId(newStepId);
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
          const isCodeStep = selectedStep?.type === 'code';
          const isSubFlowStep = selectedStep?.type === 'sub_flow';

          return {
            ...step,
            action: isCodeStep || isSubFlowStep ? step.action : editAction,
            connector: isCodeStep || isSubFlowStep ? step.connector : editConnector,
            input_mapping: inputMapping,
            condition: editCondition ? editCondition : undefined,
            source_language: isCodeStep ? editSourceLanguage : step.source_language,
            source_code: isCodeStep ? editSourceCode : step.source_code,
            code: isCodeStep ? editCompiledWasm : step.code,
            script_language: isCodeStep ? editSourceLanguage : step.script_language,
            sub_flow_id: isSubFlowStep ? editSubFlowId : step.sub_flow_id,
            sub_flow_input: isSubFlowStep ? editSubFlowInput : step.sub_flow_input,
          };
        }
        return step;
      })
    });
  }

  async function compileSelectedCodeStep() {
    if (!parsed || !selectedStep || selectedStep.type !== 'code') {
      return;
    }

    setIsCompiling(true);
    setCompileError('');
    setCompileStatus('Compiling source to WASM…');

    try {
      const response = await fetch('/api/code-steps/compile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language: editSourceLanguage,
          sourceCode: editSourceCode,
          stepId: selectedStep.id,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || payload.message || `Compilation failed (${response.status})`);
      }

      const wasmBase64 = String(payload.wasmBase64 || '');
      if (!wasmBase64) {
        throw new Error('Compiler returned an empty WASM artifact');
      }

      setEditCompiledWasm(wasmBase64);
      setCompileStatus('Compilation succeeded');
      updateDefinition({
        ...parsed,
        steps: parsed.steps.map((step) =>
          step.id === selectedStep.id
            ? {
                ...step,
                source_language: editSourceLanguage,
                source_code: editSourceCode,
                script_language: editSourceLanguage,
                code: wasmBase64,
              }
            : step
        ),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCompileStatus('Compilation failed');
      setCompileError(message);
    } finally {
      setIsCompiling(false);
    }
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
      const isCodeStep = step.type === 'code';
      const isSubFlowStep = step.type === 'sub_flow';
      const referencedSubFlow = isSubFlowStep && step.sub_flow_id ? publishedSubFlowLookup.get(step.sub_flow_id) : undefined;
      newNodes.push({
        id: step.id,
        position: { x: 0, y: 0 },
        data: { 
          kind: isCodeStep
            ? `Code Step ${index + 1}`
            : isSubFlowStep
              ? `Sub-flow ${index + 1}`
              : step.type === 'action'
                ? `Step ${index + 1}`
                : `${step.type.toUpperCase()} ${index + 1}`,
          title: isCodeStep
            ? `${step.source_language || step.script_language || 'javascript'} → WASM`
            : isSubFlowStep
              ? referencedSubFlow?.name || step.sub_flow_id || 'Reusable sub-flow'
              : `${step.connector}.${step.action}`,
          subtitle: isSubFlowStep
            ? step.sub_flow_input || referencedSubFlow?.description || step.sub_flow_id || step.id
            : step.id,
          stepType: step.type,
          sourceLanguage: step.source_language || step.script_language || undefined,
          isCodeStep,
        },
        type: step.type === 'code' ? 'codeNode' : step.type === 'loop' ? 'loopNode' : step.type === 'merge' ? 'mergeNode' : step.type === 'parallel' || step.type === 'parallel_split' ? 'parallelNode' : 'customNode',
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
  }, [definitionJson, parsed, publishedSubFlowLookup]);

  const nodeTypes = useMemo(() => ({
    customNode: CustomNode, loopNode: LoopNode, parallelNode: ParallelNode, mergeNode: MergeNode, codeNode: CodeNode
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

      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
        <div style={{ flex: 1.6, display: 'flex', flexDirection: 'column', gap: 12 }}>
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

          {subFlowValidationErrors.length > 0 ? (
            <div style={{ padding: 12, borderRadius: 8, border: '1px solid rgba(255, 99, 99, 0.45)', background: 'rgba(255, 99, 99, 0.08)' }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: '#ffb4b4' }}>Sub-flow validation</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#ffd7d7', fontSize: 13 }}>
                {subFlowValidationErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div style={{ padding: 12, borderRadius: 8, border: '1px solid rgba(34, 214, 116, 0.25)', background: 'rgba(34, 214, 116, 0.06)', color: '#b9f6ca', fontSize: 13 }}>
              No circular sub-flow references detected.
            </div>
          )}
        </div>

        <aside style={{ width: 320, padding: 16, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 16 }}>Sub-flow library</h3>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              Publish reusable flows here. Insert them into the canvas as sub-routines.
            </div>
            <input
              value={libraryQuery}
              onChange={(e) => setLibraryQuery(e.target.value)}
              placeholder="Search published sub-flows"
              style={{ width: '100%', padding: '8px', borderRadius: 6 }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {publishedSubFlows.filter((flow) => {
              const query = libraryQuery.trim().toLowerCase();
              if (!query) return true;
              return [flow.name, flow.description || '', flow.id].some((value) => value.toLowerCase().includes(query));
            }).length === 0 ? (
              <div className="muted" style={{ fontSize: 13, padding: 12, border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 8 }}>
                No published sub-flows available.
              </div>
            ) : (
              publishedSubFlows
                .filter((flow) => {
                  const query = libraryQuery.trim().toLowerCase();
                  if (!query) return true;
                  return [flow.name, flow.description || '', flow.id].some((value) => value.toLowerCase().includes(query));
                })
                .map((flow) => (
                  <button
                    key={flow.id}
                    onClick={() => addLibrarySubFlow(flow)}
                    style={{ textAlign: 'left', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', color: '#fff' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontWeight: 700 }}>{flow.name}</div>
                      <span className="badge b-neutral" style={{ fontSize: 10 }}>published</span>
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 8, wordBreak: 'break-word' }}>
                      {flow.description || flow.id}
                    </div>
                    <div className="muted" style={{ fontSize: 11, opacity: 0.75 }}>
                      {flow.id}
                    </div>
                  </button>
                ))
            )}
          </div>
        </aside>
      </div>

      <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch' }}>
        {/* ADD STEP PANEL */}
        <div style={{ flex: 1, padding: 16, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.02)' }}>
          <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 16 }}>Add New Step</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={newStepType} onChange={(e) => setNewStepType(e.target.value as any)} style={{ padding: '8px', flex: 1 }}>
                <option value="action">Action</option>
                <option value="code">Code</option>
                <option value="parallel">Parallel</option>
                <option value="parallel_split">Parallel Split</option>
                <option value="merge">Merge</option>
                <option value="loop">Loop</option>
                <option value="sub_flow">Sub-Flow</option>
              </select>
              <select value={newConnector} onChange={(e) => setNewConnector(e.target.value)} style={{ padding: '8px', flex: 1 }} disabled={newStepType === 'code' || newStepType === 'sub_flow'}>
                {connectorOptions.length === 0 ? <option value="custom">custom</option> : null}
                {connectorOptions.map((connector) => (
                  <option key={connector} value={connector}>
                    {connector}
                  </option>
                ))}
              </select>
            </div>
            {newStepType === 'sub_flow' ? (
              <>
                <select value={newSubFlowId} onChange={(e) => setNewSubFlowId(e.target.value)} style={{ padding: '8px', flex: 1 }}>
                  {publishedSubFlows.length === 0 ? <option value="">No published sub-flows</option> : null}
                  {publishedSubFlows.map((flow) => (
                    <option key={flow.id} value={flow.id}>
                      {flow.name}
                    </option>
                  ))}
                </select>
                <textarea
                  rows={4}
                  value={newSubFlowInput}
                  onChange={(e) => setNewSubFlowInput(e.target.value)}
                  placeholder="Sub-flow input template"
                  style={{ width: '100%', padding: '8px', fontFamily: 'monospace' }}
                />
              </>
            ) : newStepType === 'code' ? null : (
              <select value={newAction} onChange={(e) => setNewAction(e.target.value)} style={{ padding: '8px', flex: 1 }}>
                {actionOptions.length === 0 ? <option value="call_api">call_api</option> : null}
                {actionOptions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            )}
            <button onClick={addStep} disabled={!canEdit} style={{ padding: '8px', backgroundColor: '#7c9cff', color: '#000', fontWeight: 'bold' }}>
              Add Step
            </button>
          </div>
        </div>

        {/* EDIT STEP PANEL */}
        {selectedStep ? (
          <div style={{ flex: 1, padding: 16, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>Edit {selectedStep.type} ({selectedStep.id})</h3>
                {selectedStep.type === 'code' ? (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Build custom JS or Python and compile it to a sandboxed WASM module.
                  </div>
                ) : selectedStep.type === 'sub_flow' ? (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Reusable sub-flows run as isolated routines and receive the rendered input payload.
                  </div>
                ) : null}
              </div>
              <button onClick={() => removeStep(selectedStep.id)} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid red', color: 'red', borderRadius: 4, fontSize: 12 }}>
                Delete
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedStep.type === 'code' ? (
                <CodeStepEditor
                  language={editSourceLanguage}
                  sourceCode={editSourceCode}
                  compiledWasmBase64={editCompiledWasm}
                  compileStatus={compileStatus}
                  compileError={compileError}
                  onLanguageChange={(value) => setEditSourceLanguage(value)}
                  onSourceCodeChange={(value) => setEditSourceCode(value)}
                  onCompiledWasmChange={(value) => setEditCompiledWasm(value)}
                  onCompile={compileSelectedCodeStep}
                  isCompiling={isCompiling}
                />
              ) : selectedStep.type === 'sub_flow' ? (
                <>
                  <select value={editSubFlowId} onChange={(e) => setEditSubFlowId(e.target.value)} style={{ padding: '8px', width: '100%' }}>
                    {publishedSubFlows.length === 0 ? <option value="">No published sub-flows</option> : null}
                    {publishedSubFlows.map((flow) => (
                      <option key={flow.id} value={flow.id}>
                        {flow.name}
                      </option>
                    ))}
                  </select>
                  <textarea
                    rows={4}
                    value={editSubFlowInput}
                    onChange={(e) => setEditSubFlowInput(e.target.value)}
                    placeholder="Sub-flow input template"
                    style={{ width: '100%', padding: '8px', fontFamily: 'monospace' }}
                  />
                  <textarea
                    rows={4}
                    value={editInputJson}
                    onChange={(e) => setEditInputJson(e.target.value)}
                    placeholder="Input mapping JSON"
                    style={{ width: '100%', padding: '8px', fontFamily: 'monospace' }}
                  />
                </>
              ) : (
                <>
                  {selectedStep.type === 'merge' || selectedStep.type === 'parallel_split' ? (
                    <div className="muted" style={{ fontSize: 12 }}>
                      This step is driven by graph connections. Connect upstream and downstream steps to define the branch structure.
                    </div>
                  ) : (
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
                  )}
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
                </>
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
  const borderColor = stepType === 'parallel' || stepType === 'parallel_split' ? '#22d674' : stepType === 'merge' ? '#8b5cf6' : stepType === 'loop' ? '#f59e0b' : stepType === 'sub_flow' ? '#8b5cf6' : '#7c9cff';
  
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

function CodeNode({ data, selected }: NodeProps) {
  const borderColor = '#22d674';
  return (
    <div
      style={{
        minWidth: 240,
        padding: 14,
        borderRadius: 14,
        border: selected ? `1px solid ${borderColor}` : '1px solid rgba(34, 214, 116, 0.35)',
        background: selected ? `${borderColor}20` : 'rgba(34, 214, 116, 0.07)',
        boxShadow: selected ? `0 0 0 1px ${borderColor}3d` : 'none',
        backgroundColor: '#102018',
        color: '#fff',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: borderColor, width: 8, height: 8 }} />
      <div className="muted" style={{ fontSize: 12, marginBottom: 6, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Code Step
      </div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {typeof data.title === 'string' ? data.title : 'WASM Sandbox'}
      </div>
      <div className="muted" style={{ wordBreak: 'break-all', opacity: 0.7, fontSize: 12 }}>
        {typeof data.subtitle === 'string' ? data.subtitle : 'Subtitle'}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        <span className="badge b-neutral" style={{ fontSize: 10, borderColor, color: borderColor }}>
          {String(data.sourceLanguage || 'javascript')}
        </span>
        <span className="badge b-neutral" style={{ fontSize: 10, borderColor: '#7c9cff', color: '#7c9cff' }}>
          wasm
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

function MergeNode({ data, selected }: NodeProps) {
  const borderColor = '#8b5cf6';

  return (
    <div style={{ minWidth: 240, padding: 14, borderRadius: 14, border: selected ? `1px solid ${borderColor}` : '1px solid rgba(255,255,255,0.12)', background: selected ? `${borderColor}20` : 'rgba(255,255,255,0.04)', backgroundColor: '#1a1a1a', color: '#fff' }}>
      <Handle type="target" position={Position.Left} style={{ background: borderColor }} />
      <div style={{ fontSize: 12, marginBottom: 6, color: borderColor, fontWeight: 600, letterSpacing: '0.05em' }}>MERGE</div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{String(data.title)}</div>
      <div style={{ opacity: 0.7, fontSize: 12, wordBreak: 'break-all' }}>{String(data.subtitle)}</div>
      <Handle type="source" position={Position.Right} style={{ background: borderColor }} />
    </div>
  );
}
