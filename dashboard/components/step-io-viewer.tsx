'use client';

import { useEffect, useMemo, useState, useCallback, type CSSProperties } from 'react';
import { io, type Socket } from 'socket.io-client';
import { diffWordsWithSpace } from 'diff';
import { replayFlowRunStep, type FlowRunStepLog, type StepStreamingEvent, type StepStateTransition } from '../lib/api';
import { useDashboardStore } from '../lib/store';

type StepIoViewerProps = {
  flowId: string;
  runId: string;
  stepsLog?: FlowRunStepLog[] | null;
};

/**
 * Merges live streaming events with persisted history
 * Live events take precedence for real-time state transitions
 */
type MergedStepData = FlowRunStepLog & {
  liveState?: StepStateTransition;
  receivedAt?: string;
};

function formatJson(value: unknown) {
  if (value === undefined) {
    return 'undefined';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function statusColor(status?: string) {
  switch ((status || '').toLowerCase()) {
    case 'success':
    case 'succeeded':
    case 'completed':
      return 'var(--success)';
    case 'failed':
    case 'error':
      return 'var(--error)';
    case 'running':
    case 'pending':
    case 'in_progress':
      return 'var(--warning)';
    default:
      return 'var(--text-2)';
  }
}

function stateTransitionBadge(state?: StepStateTransition) {
  const colors: Record<StepStateTransition, { bg: string; text: string }> = {
    queued: { bg: 'rgba(255,255,255,0.06)', text: 'var(--text-2)' },
    running: { bg: 'rgba(255,193,7,0.1)', text: 'var(--warning)' },
    success: { bg: 'rgba(34,214,116,0.1)', text: 'var(--success)' },
    failed: { bg: 'rgba(242,92,92,0.1)', text: 'var(--error)' },
  };

  if (!state || !colors[state]) {
    return { bg: 'rgba(255,255,255,0.06)', text: 'var(--text-2)' };
  }

  return colors[state];
}

function JsonDiffBlock({ before, after }: { before: unknown; after: unknown }) {
  const beforeJson = formatJson(before);
  const afterJson = formatJson(after);
  const changes = diffWordsWithSpace(beforeJson, afterJson);

  return (
    <pre style={{
      fontSize: 11,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      lineHeight: 1.7,
      margin: 0,
      color: 'var(--text-2)',
    }}>
      {changes.map((part, index) => {
        const style: CSSProperties = {
          background: part.added
            ? 'rgba(34,214,116,0.14)'
            : part.removed
              ? 'rgba(242,92,92,0.16)'
              : 'transparent',
          color: part.added
            ? 'var(--success)'
            : part.removed
              ? 'var(--error)'
              : 'inherit',
          textDecoration: part.removed ? 'line-through' : 'none',
          borderRadius: 4,
        };

        return (
          <span key={`${index}-${part.value.slice(0, 8)}`} style={style}>
            {part.value}
          </span>
        );
      })}
    </pre>
  );
}

function JsonDetails({
  label,
  value,
  defaultOpen = false,
  diffAgainst,
}: {
  label: string;
  value: unknown;
  defaultOpen?: boolean;
  diffAgainst?: unknown;
}) {
  return (
    <details open={defaultOpen} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, background: 'rgba(0,0,0,0.22)' }}>
      <summary style={{ cursor: 'pointer', listStyle: 'none', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </summary>
      <div style={{ padding: '0 12px 12px' }}>
        {diffAgainst !== undefined ? (
          <JsonDiffBlock before={diffAgainst} after={value} />
        ) : (
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, lineHeight: 1.7, color: 'var(--text-2)' }}>
            {formatJson(value)}
          </pre>
        )}
      </div>
    </details>
  );
}

export function StepIoViewer({ flowId, runId, stepsLog }: StepIoViewerProps) {
  const { accessToken, setAccessToken } = useDashboardStore();
  const [selectedStepId, setSelectedStepId] = useState('');
  const [replayingStepId, setReplayingStepId] = useState('');
  const [replayResult, setReplayResult] = useState<Record<string, unknown> | null>(null);
  const [replayError, setReplayError] = useState('');
  
  // Real-time streaming state
  const [liveSteps, setLiveSteps] = useState<Map<string, MergedStepData>>(new Map());
  const [wsConnected, setWsConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Initialize websocket connection for live step streaming
  useEffect(() => {
    if (!accessToken) {
      return;
    }

    try {
      const wsUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace('http', 'ws') || 'ws://127.0.0.1:3000';
      const newSocket = io(wsUrl, {
        path: '/events',
        transports: ['websocket'],
        auth: { token: `Bearer ${accessToken}` },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });

      newSocket.on('connect', () => {
        setWsConnected(true);
        // Subscribe to step streaming for this run
        newSocket.emit('subscribe_step_stream', { flowId, runId });
      });

      newSocket.on('disconnect', () => {
        setWsConnected(false);
      });

      /**
       * Real-time step I/O updates during flow execution
       * Payload: StepStreamingEvent with state_transition indicating step lifecycle
       */
      newSocket.on('step_io_update', (event: Record<string, unknown>) => {
        const stepUpdate = event as StepStreamingEvent;
        
        setLiveSteps((prev) => {
          const updated = new Map(prev);
          const stepId = stepUpdate.step_id;
          const existing = updated.get(stepId) || { step_id: stepId };

          // Merge live event with existing data
          const merged: MergedStepData = {
            ...existing,
            step_id: stepId,
            input: stepUpdate.input ?? existing.input,
            output: stepUpdate.output ?? existing.output,
            error: stepUpdate.error ?? existing.error,
            step_outputs_snapshot: stepUpdate.step_outputs_snapshot ?? existing.step_outputs_snapshot,
            trigger_event: stepUpdate.trigger_event ?? existing.trigger_event,
            duration_ms: stepUpdate.duration_ms ?? existing.duration_ms,
            liveState: stepUpdate.state_transition,
            receivedAt: stepUpdate.timestamp,
            // Accumulate state transitions
            state_transitions: [
              ...(existing.state_transitions || []),
              stepUpdate.state_transition,
            ],
          };

          updated.set(stepId, merged);
          return updated;
        });
      });

      newSocket.on('ws_error', (error: Record<string, unknown>) => {
        console.error('WebSocket error:', error);
      });

      setSocket(newSocket);

      return () => {
        newSocket.emit('unsubscribe_step_stream', { flowId, runId });
        newSocket.close();
      };
    } catch (error) {
      console.error('Failed to connect websocket:', error);
    }
  }, [accessToken, flowId, runId]);

  // Merge live events with persisted history
  const mergedSteps = useMemo(() => {
    const merged = new Map<string, MergedStepData>();

    // First add persisted history
    if (stepsLog) {
      stepsLog.forEach((step) => {
        merged.set(step.step_id, {
          ...step,
          liveState: undefined,
          state_transitions: step.state_transitions,
        });
      });
    }

    // Then overlay live events (live takes precedence)
    liveSteps.forEach((liveStep, stepId) => {
      merged.set(stepId, liveStep);
    });

    return merged;
  }, [stepsLog, liveSteps]);

  const stepsArray = useMemo(() => Array.from(mergedSteps.values()), [mergedSteps]);

  useEffect(() => {
    if (selectedStepId || stepsArray.length === 0) {
      return;
    }

    // Auto-select first step on initial load or clear if none available
    if (stepsArray.length > 0) {
      setSelectedStepId(stepsArray[0]!.step_id);
    } else {
      setSelectedStepId('');
    }
  }, [stepsArray, selectedStepId]);

  const selectedStep = useMemo(
    () => mergedSteps.get(selectedStepId) || stepsArray[0] || null,
    [selectedStepId, mergedSteps, stepsArray],
  );

  const handleReplayStep = useCallback(
    async (stepId: string) => {
      if (!accessToken) {
        setReplayError('Missing access token.');
        return;
      }

      setReplayError('');
      setReplayResult(null);
      setReplayingStepId(stepId);

      try {
        const payload = await replayFlowRunStep({
          flowId,
          runId,
          stepId,
          token: accessToken,
          setToken: setAccessToken,
        });
        setReplayResult(payload);
      } catch (error) {
        setReplayError(error instanceof Error ? error.message : String(error));
      } finally {
        setReplayingStepId('');
      }
    },
    [accessToken, flowId, runId, setAccessToken],
  );

  if (stepsArray.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '24px 20px' }}>
        <div className="empty-title">No step I/O captured</div>
        <div className="empty-sub">
          {wsConnected
            ? 'Waiting for steps to execute in real-time...'
            : 'Connecting to live stream...'}
        </div>
        {wsConnected && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>
            🔴 Live: connected
          </div>
        )}
      </div>
    );
  }

  const inputValue = selectedStep?.input;
  const outputValue = selectedStep?.output;
  const snapshotValue = selectedStep?.step_outputs_snapshot;
  const triggerEventValue = selectedStep?.trigger_event;
  const currentLiveState = selectedStep?.liveState;
  const stateTransitions = selectedStep?.state_transitions || [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: 12, minHeight: 420 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflow: 'auto', paddingRight: 4 }}>
        {stepsArray.map((step, index) => {
          const isSelected = step.step_id === selectedStepId;
          const liveState = step.liveState;
          const badgeStyle = stateTransitionBadge(liveState);

          return (
            <button
              key={step.step_id}
              type="button"
              onClick={() => setSelectedStepId(step.step_id)}
              style={{
                textAlign: 'left',
                padding: 12,
                borderRadius: 10,
                border: isSelected ? '1px solid rgba(90,125,255,0.7)' : '1px solid rgba(255,255,255,0.06)',
                background: isSelected ? 'rgba(90,125,255,0.08)' : 'rgba(255,255,255,0.02)',
                color: 'var(--text)',
                cursor: 'pointer',
                boxShadow: isSelected ? '0 0 0 1px rgba(90,125,255,0.2) inset' : 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }} className="truncate">
                    {step.step_id}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                    #{index + 1} · {step.duration_ms ?? 0}ms
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                  {liveState && (
                    <span
                      className="badge"
                      style={{
                        border: '1px solid rgba(255,255,255,0.06)',
                        color: badgeStyle.text,
                        background: badgeStyle.bg,
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: 'capitalize',
                      }}
                    >
                      {liveState}
                    </span>
                  )}
                  <span
                    className="badge"
                    style={{
                      border: '1px solid rgba(255,255,255,0.06)',
                      color: statusColor(step.status),
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    {step.status || 'unknown'}
                  </span>
                </div>
              </div>
              {step.error ? (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--error)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {step.error}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        {selectedStep ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em' }}>{selectedStep.step_id}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
                  Duration {selectedStep.duration_ms ?? 0}ms · Status {selectedStep.status || 'unknown'}
                  {selectedStep.replay ? ' · Replay result' : ''}
                </div>
                {stateTransitions.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {stateTransitions.map((transition, idx) => {
                      const tBadge = stateTransitionBadge(transition);
                      return (
                        <span
                          key={`${transition}-${idx}`}
                          style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: tBadge.bg,
                            color: tBadge.text,
                            fontWeight: 500,
                            textTransform: 'capitalize',
                          }}
                        >
                          {transition}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleReplayStep(selectedStep.step_id)}
                disabled={replayingStepId === selectedStep.step_id}
              >
                {replayingStepId === selectedStep.step_id ? 'Replaying…' : 'Replay step'}
              </button>
            </div>

            {replayError ? <div className="alert alert-error" style={{ marginBottom: 0 }}>{replayError}</div> : null}
            {replayResult ? (
              <details open style={{ border: '1px solid rgba(90,125,255,0.2)', borderRadius: 10, background: 'rgba(90,125,255,0.06)' }}>
                <summary
                  style={{
                    cursor: 'pointer',
                    listStyle: 'none',
                    padding: '10px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--accent)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Replay result
                </summary>
                <div style={{ padding: '0 12px 12px' }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.7, color: 'var(--text-2)' }}>
                    {formatJson(replayResult)}
                  </pre>
                </div>
              </details>
            ) : null}

            <JsonDetails
              label="Input"
              value={inputValue}
              defaultOpen
              diffAgainst={selectedStep.output !== undefined ? selectedStep.output : undefined}
            />
            <JsonDetails
              label="Output"
              value={outputValue}
              defaultOpen
              diffAgainst={selectedStep.input !== undefined ? selectedStep.input : undefined}
            />
            <JsonDetails label="Upstream outputs snapshot" value={snapshotValue || {}} />
            <JsonDetails label="Trigger event" value={triggerEventValue || {}} />
          </>
        ) : null}
      </div>
    </div>
  );
}
