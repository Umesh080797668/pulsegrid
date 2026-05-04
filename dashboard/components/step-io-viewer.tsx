'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { diffWordsWithSpace } from 'diff';
import { replayFlowRunStep, type FlowRunStepLog } from '../lib/api';
import { useDashboardStore } from '../lib/store';

type StepIoViewerProps = {
  flowId: string;
  runId: string;
  stepsLog?: FlowRunStepLog[] | null;
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

  useEffect(() => {
    if (!stepsLog || stepsLog.length === 0) {
      setSelectedStepId('');
      return;
    }

    if (!selectedStepId || !stepsLog.some((step) => step.step_id === selectedStepId)) {
      setSelectedStepId(stepsLog[0]!.step_id);
    }
  }, [stepsLog, selectedStepId]);

  const selectedStep = useMemo(
    () => stepsLog?.find((step) => step.step_id === selectedStepId) || stepsLog?.[0] || null,
    [selectedStepId, stepsLog],
  );

  const handleReplayStep = async (stepId: string) => {
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
  };

  if (!stepsLog || stepsLog.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '24px 20px' }}>
        <div className="empty-title">No step I/O captured</div>
        <div className="empty-sub">This run does not have a persisted step log yet.</div>
      </div>
    );
  }

  const inputValue = selectedStep?.input;
  const outputValue = selectedStep?.output;
  const snapshotValue = selectedStep?.step_outputs_snapshot;
  const triggerEventValue = selectedStep?.trigger_event;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: 12, minHeight: 420 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflow: 'auto', paddingRight: 4 }}>
        {stepsLog.map((step, index) => {
          const isSelected = step.step_id === selectedStepId;
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
                <span className="badge" style={{ border: '1px solid rgba(255,255,255,0.06)', color: statusColor(step.status), background: 'rgba(255,255,255,0.02)' }}>
                  {step.status || 'unknown'}
                </span>
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
                <summary style={{ cursor: 'pointer', listStyle: 'none', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Replay result
                </summary>
                <div style={{ padding: '0 12px 12px' }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.7, color: 'var(--text-2)' }}>
                    {formatJson(replayResult)}
                  </pre>
                </div>
              </details>
            ) : null}

            <JsonDetails label="Input" value={inputValue} defaultOpen diffAgainst={selectedStep.output !== undefined ? selectedStep.output : undefined} />
            <JsonDetails label="Output" value={outputValue} defaultOpen diffAgainst={selectedStep.input !== undefined ? selectedStep.input : undefined} />
            <JsonDetails label="Upstream outputs snapshot" value={snapshotValue || {}} />
            <JsonDetails label="Trigger event" value={triggerEventValue || {}} />
          </>
        ) : null}
      </div>
    </div>
  );
}
