'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StepIoViewer } from '../../../../components/step-io-viewer';
import {
  apiBase,
  authenticatedFetch,
  getFlowEnvironments,
  getFlowRunsForEnvironment,
  type FlowEnvironmentStatus,
  type FlowRunRecord,
} from '../../../../lib/api';
import { useDashboardStore } from '../../../../lib/store';

type FlowSummary = {
  id: string;
  name?: string;
  description?: string | null;
  enabled?: boolean;
  run_count?: number;
};

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export default function FlowRunsPage() {
  const params = useParams<{ flowId: string | string[] }>();
  const router = useRouter();
  const flowId = useMemo(() => {
    const value = params?.flowId;
    return Array.isArray(value) ? value[0] : value || '';
  }, [params]);

  const { accessToken, workspaceId, setAccessToken } = useDashboardStore();
  const [flow, setFlow] = useState<FlowSummary | null>(null);
  const [environments, setEnvironments] = useState<FlowEnvironmentStatus[]>([]);
  const [runs, setRuns] = useState<FlowRunRecord[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [activeEnvironment, setActiveEnvironment] = useState<'production' | 'staging'>('production');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedRun = useMemo(
    () => runs.find((run) => String(run.id) === selectedRunId) || null,
    [runs, selectedRunId],
  );

  const loadData = async () => {
    if (!accessToken || !workspaceId || !flowId) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [flowResp, envRows, runRows] = await Promise.all([
        authenticatedFetch(`${apiBase}/flows/${flowId}`, accessToken, setAccessToken),
        getFlowEnvironments({ flowId, token: accessToken, setToken: setAccessToken }),
        getFlowRunsForEnvironment({ flowId, environment: activeEnvironment, token: accessToken, setToken: setAccessToken }),
      ]);

      if (!flowResp.ok) {
        throw new Error(`Failed to load flow (${flowResp.status})`);
      }

      setFlow((await flowResp.json()) as FlowSummary);
      setEnvironments(envRows || []);
      setRuns(runRows.runs || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [accessToken, workspaceId, flowId, activeEnvironment]);

  useEffect(() => {
    if (runs.length === 0) {
      setSelectedRunId('');
      return;
    }

    if (!selectedRunId || !runs.some((run) => String(run.id) === selectedRunId)) {
      setSelectedRunId(String(runs[0]!.id));
    }
  }, [runs, selectedRunId]);

  if (!flowId) {
    return <div className="alert alert-error">Missing flow id.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="page-hd">
        <div>
          <div className="page-title">Flow runs</div>
          <div className="page-sub">
            {flow?.name || 'Flow'} · browse persisted run history and step I/O for this flow.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => router.push(`/flows/${flowId}`)}>
            Back to editor
          </button>
          <button className="btn btn-secondary" onClick={() => void loadData()} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className={`badge ${flow?.enabled ? 'b-success' : 'b-neutral'}`}>
            {flow?.enabled ? 'Enabled' : 'Disabled'}
          </span>
          <span className="badge b-neutral">Flow {flowId}</span>
          <span className="badge b-neutral">{flow?.run_count ?? runs.length} total runs</span>
          <span className="badge b-neutral">{runs.length} loaded runs</span>
        </div>
        {flow?.description ? (
          <div className="muted" style={{ fontSize: 13 }}>
            {flow.description}
          </div>
        ) : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            className={`btn ${activeEnvironment === 'production' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveEnvironment('production')}
          >
            Production
          </button>
          <button
            className={`btn ${activeEnvironment === 'staging' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveEnvironment('staging')}
          >
            Staging
          </button>
          <Link className="btn btn-ghost" href={`/flows/${flowId}`}>
            Edit flow
          </Link>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {environments.length === 0 ? (
            <span className="muted" style={{ fontSize: 12 }}>No environment deployments found.</span>
          ) : environments.map((environment) => (
            <span key={environment.environment} className={`badge ${environment.enabled ? 'b-success' : 'b-neutral'}`}>
              {environment.environment}: {environment.enabled ? 'deployed' : 'not deployed'}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card-title">{activeEnvironment} run history</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Latest runs from the backend persisted in Postgres.
          </div>
          <div style={{ display: 'grid', gap: 8, maxHeight: 620, overflow: 'auto', paddingRight: 4 }}>
            {runs.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 18px' }}>
                <div className="empty-title">No runs yet</div>
                <div className="empty-sub">Trigger this flow in {activeEnvironment} to populate the history.</div>
              </div>
            ) : runs.map((run) => (
              <button
                key={String(run.id)}
                type="button"
                onClick={() => setSelectedRunId(String(run.id))}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: String(run.id) === selectedRunId ? '1px solid rgba(90,125,255,0.72)' : '1px solid rgba(255,255,255,0.08)',
                  background: String(run.id) === selectedRunId ? 'rgba(90,125,255,0.08)' : 'rgba(255,255,255,0.02)',
                  color: 'inherit',
                  display: 'grid',
                  gap: 6,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span className={`badge ${run.status === 'failed' ? 'b-error' : run.status === 'running' ? 'b-running' : 'b-success'}`}>
                    {run.status || 'unknown'}
                  </span>
                  <span className="muted" style={{ fontSize: 11 }}>{formatDateTime(run.started_at)}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, wordBreak: 'break-all' }}>Run {String(run.id)}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <span className="badge b-neutral">{run.duration_ms ?? 0}ms</span>
                  <span className="badge b-neutral">{run.steps_log?.length || 0} steps</span>
                  <span className="badge b-neutral">{run.environment || activeEnvironment}</span>
                </div>
                {run.error_message ? (
                  <div style={{ color: 'var(--error)', fontSize: 11, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {run.error_message}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card-title">Step I/O inspector</div>
          {selectedRun ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span className={`badge ${selectedRun.status === 'failed' ? 'b-error' : selectedRun.status === 'running' ? 'b-running' : 'b-success'}`}>
                  {selectedRun.status || 'unknown'}
                </span>
                <span className="badge b-neutral">Run {selectedRun.id}</span>
                <span className="badge b-neutral">{selectedRun.duration_ms ?? 0}ms</span>
                <span className="badge b-neutral">{selectedRun.steps_log?.length || 0} steps</span>
                <span className="badge b-neutral">{formatDateTime(selectedRun.started_at)}</span>
              </div>

              {selectedRun.error_message ? (
                <div className="alert alert-error" style={{ marginBottom: 0 }}>
                  {selectedRun.error_message}
                </div>
              ) : null}

              <StepIoViewer flowId={flowId} runId={selectedRun.id} stepsLog={selectedRun.steps_log || []} />
            </>
          ) : (
            <div className="empty-state" style={{ padding: '26px 20px' }}>
              <div className="empty-title">Select a run</div>
              <div className="empty-sub">Open a run from the history to inspect persisted step input, output, and replay.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}