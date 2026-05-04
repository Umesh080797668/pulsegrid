'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FlowCanvas } from '../../../components/flow-canvas';
import { StepIoViewer } from '../../../components/step-io-viewer';
import {
  apiBase,
  authenticatedFetch,
  deployFlowToStaging,
  getFlowEnvironments,
  getFlowRunsForEnvironment,
  getFlowVersionDiff,
  listFlowVersions,
  promoteFlowToProduction,
  rollbackFlowVersion,
  runFlowInEnvironment,
  type FlowRunRecord,
  type FlowEnvironmentStatus,
  type FlowVersion,
  type FlowVersionDiff,
} from '../../../lib/api';
import { useDashboardStore } from '../../../lib/store';
import { detectCircularSubFlowReferences, type FlowRecord } from '../../../lib/flow-subflows';

type ConnectorCatalogItem = {
  connector: string;
  action: string;
  category: string;
  auth: 'none' | 'bearer' | 'api_key' | 'oauth2' | 'mixed';
  required_input_fields: string[];
  optional_input_fields: string[];
};

type FlowResponse = FlowRecord & {
  enabled: boolean;
  run_count: number;
  workspace_id: string;
};

export default function FlowEditorPage() {
  const params = useParams<{ flowId: string | string[] }>();
  const router = useRouter();
  const flowId = useMemo(() => {
    const value = params?.flowId;
    return Array.isArray(value) ? value[0] : value || '';
  }, [params]);

  const { accessToken, workspaceId, setAccessToken } = useDashboardStore();
  const [flow, setFlow] = useState<FlowResponse | null>(null);
  const [workspaceFlows, setWorkspaceFlows] = useState<FlowRecord[]>([]);
  const [catalog, setCatalog] = useState<ConnectorCatalogItem[]>([]);
  const [definitionJson, setDefinitionJson] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [published, setPublished] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeEnvironment, setActiveEnvironment] = useState<'staging' | 'production'>('production');
  const [versions, setVersions] = useState<FlowVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [versionDiff, setVersionDiff] = useState<FlowVersionDiff | null>(null);
  const [versionBusy, setVersionBusy] = useState(false);
  const [environments, setEnvironments] = useState<FlowEnvironmentStatus[]>([]);
  const [environmentRuns, setEnvironmentRuns] = useState<FlowRunRecord[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');

  const loadVersionAndEnvironmentData = async (token: string, wsFlowId: string) => {
    const [versionRows, envRows, runRows] = await Promise.all([
      listFlowVersions({ flowId: wsFlowId, token, setToken: setAccessToken }),
      getFlowEnvironments({ flowId: wsFlowId, token, setToken: setAccessToken }),
      getFlowRunsForEnvironment({ flowId: wsFlowId, environment: activeEnvironment, token, setToken: setAccessToken }),
    ]);

    setVersions(versionRows);
    setEnvironments(envRows);
    setEnvironmentRuns(runRows.runs || []);

    if (versionRows.length > 0) {
      const nextSelected = selectedVersionId && versionRows.some((v) => v.id === selectedVersionId)
        ? selectedVersionId
        : versionRows[0]!.id;
      setSelectedVersionId(nextSelected);

      const diff = await getFlowVersionDiff({
        flowId: wsFlowId,
        versionId: nextSelected,
        token,
        setToken: setAccessToken,
      });
      setVersionDiff(diff);
    } else {
      setSelectedVersionId('');
      setVersionDiff(null);
    }
  };

  useEffect(() => {
    if (!accessToken || !workspaceId || !flowId) {
      return;
    }

    const load = async () => {
      const [flowResp, listResp, catalogResp] = await Promise.all([
        authenticatedFetch(`${apiBase}/flows/${flowId}`, accessToken, setAccessToken),
        authenticatedFetch(`${apiBase}/flows`, accessToken, setAccessToken),
        authenticatedFetch(`${apiBase}/connectors/catalog`, accessToken, setAccessToken),
      ]);

      if (!flowResp.ok) {
        setError(`Failed to load flow (${flowResp.status})`);
        return;
      }

      if (!listResp.ok) {
        setError(`Failed to load workspace flows (${listResp.status})`);
        return;
      }

      const flowData = (await flowResp.json()) as FlowResponse;
      const listData = (await listResp.json()) as FlowRecord[];
      const catalogData = catalogResp.ok ? (await catalogResp.json()) as { items?: ConnectorCatalogItem[] } : { items: [] };

      setFlow(flowData);
      setWorkspaceFlows(listData || []);
      setCatalog(catalogData.items || []);
      setDefinitionJson(JSON.stringify(flowData.definition || {}, null, 2));
      setName(flowData.name || flowData.definition?.name || 'Untitled flow');
      setDescription(flowData.description || flowData.definition?.description || '');
      setPublished(Boolean(flowData.definition?.published));
      await loadVersionAndEnvironmentData(accessToken, flowData.id);
      setError('');
    };

    void load();
  }, [accessToken, flowId, setAccessToken, workspaceId, activeEnvironment]);

  const reusableLibrary = useMemo(
    () => workspaceFlows.filter((item) => item.id !== flowId),
    [flowId, workspaceFlows],
  );

  const selectedRun = useMemo(
    () => environmentRuns.find((run) => String(run.id) === selectedRunId) || null,
    [environmentRuns, selectedRunId],
  );

  useEffect(() => {
    if (environmentRuns.length === 0) {
      setSelectedRunId('');
      return;
    }

    if (!selectedRunId || !environmentRuns.some((run) => String(run.id) === selectedRunId)) {
      setSelectedRunId(String(environmentRuns[0]!.id));
    }
  }, [environmentRuns, selectedRunId]);

  const saveFlow = async () => {
    if (!flow || !workspaceId) {
      return;
    }

    setError('');
    setSaving(true);

    try {
      const candidateDefinition = JSON.parse(definitionJson) as FlowRecord['definition'];
      const mergedDefinition = {
        ...candidateDefinition,
        id: flow.id,
        name,
        description: description || undefined,
        published,
      };

      const validationErrors = detectCircularSubFlowReferences(
        mergedDefinition,
        flow.id,
        workspaceFlows,
      );

      if (validationErrors.length > 0) {
        setError(validationErrors.join(' '));
        return;
      }

      const response = await authenticatedFetch(`${apiBase}/flows/${flow.id}`, accessToken, setAccessToken, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || undefined,
          definition: mergedDefinition,
          enabled: flow.enabled,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.message || payload.error || `Failed to save flow (${response.status})`);
        return;
      }

      const saved = (await response.json()) as { data?: FlowResponse };
      if (saved.data) {
        setFlow(saved.data);
        setDefinitionJson(JSON.stringify(saved.data.definition || mergedDefinition, null, 2));
        setPublished(Boolean(saved.data.definition?.published));
        await loadVersionAndEnvironmentData(accessToken, saved.data.id);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (!flowId) {
    return <div className="alert alert-error">Missing flow id.</div>;
  }

  const selectedVersion = versions.find((item) => item.id === selectedVersionId) || null;

  const handleSelectVersion = async (versionId: string) => {
    if (!flow || !accessToken) return;
    setSelectedVersionId(versionId);
    setVersionBusy(true);
    try {
      const diff = await getFlowVersionDiff({
        flowId: flow.id,
        versionId,
        token: accessToken,
        setToken: setAccessToken,
      });
      setVersionDiff(diff);
    } catch (diffError) {
      setError(diffError instanceof Error ? diffError.message : String(diffError));
    } finally {
      setVersionBusy(false);
    }
  };

  const handleRollbackVersion = async (versionId: string) => {
    if (!flow || !accessToken) return;
    setVersionBusy(true);
    setError('');
    try {
      const rolledBack = await rollbackFlowVersion({
        flowId: flow.id,
        versionId,
        note: `Rollback via dashboard (${new Date().toISOString()})`,
        token: accessToken,
        setToken: setAccessToken,
      });

      const rolled = rolledBack as FlowResponse;
      setFlow(rolled);
      setDefinitionJson(JSON.stringify(rolled.definition || {}, null, 2));
      await loadVersionAndEnvironmentData(accessToken, rolled.id);
    } catch (rollbackError) {
      setError(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
    } finally {
      setVersionBusy(false);
    }
  };

  const handleDeployStaging = async () => {
    if (!flow || !accessToken) return;
    setVersionBusy(true);
    setError('');
    try {
      const envRows = await deployFlowToStaging({
        flowId: flow.id,
        note: 'Deploy to staging with test credentials',
        token: accessToken,
        setToken: setAccessToken,
      });
      setEnvironments(envRows);
      await loadVersionAndEnvironmentData(accessToken, flow.id);
    } catch (deployError) {
      setError(deployError instanceof Error ? deployError.message : String(deployError));
    } finally {
      setVersionBusy(false);
    }
  };

  const handlePromoteProduction = async () => {
    if (!flow || !accessToken) return;
    setVersionBusy(true);
    setError('');
    try {
      const promoted = await promoteFlowToProduction({
        flowId: flow.id,
        note: 'Promote staging deployment to production',
        token: accessToken,
        setToken: setAccessToken,
      });
      const promotedFlow = promoted as FlowResponse;
      setFlow(promotedFlow);
      setDefinitionJson(JSON.stringify(promotedFlow.definition || {}, null, 2));
      await loadVersionAndEnvironmentData(accessToken, promotedFlow.id);
    } catch (promoteError) {
      setError(promoteError instanceof Error ? promoteError.message : String(promoteError));
    } finally {
      setVersionBusy(false);
    }
  };

  const handleRunInEnvironment = async () => {
    if (!flow || !accessToken) return;
    setVersionBusy(true);
    setError('');
    try {
      await runFlowInEnvironment({
        flowId: flow.id,
        environment: activeEnvironment,
        token: accessToken,
        setToken: setAccessToken,
      });
      const runs = await getFlowRunsForEnvironment({
        flowId: flow.id,
        environment: activeEnvironment,
        token: accessToken,
        setToken: setAccessToken,
      });
      setEnvironmentRuns(runs.runs || []);
      if (runs.runs?.length > 0) {
        setSelectedRunId(String(runs.runs[0]!.id));
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setVersionBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="page-hd">
        <div>
          <div className="page-title">Flow editor</div>
          <div className="page-sub">Edit the flow, publish reusable sub-flows, and save a safe dependency graph.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => router.push('/flows')}>Back to flows</button>
          <button className="btn btn-primary" onClick={saveFlow} disabled={saving || !flow}>Save flow</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <label className="form-group">
            <span className="form-label">Name</span>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="form-group" style={{ gridColumn: 'span 2' }}>
            <span className="form-label">Description</span>
            <input className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>

        <label className="form-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          <div>
            <div className="form-label" style={{ marginBottom: 2 }}>Publish to team library</div>
            <div className="muted" style={{ fontSize: 12 }}>Published flows can be reused as sub-routines in other flows.</div>
          </div>
        </label>
      </div>

      <FlowCanvas
        definitionJson={definitionJson}
        onDefinitionJsonChange={setDefinitionJson}
        catalog={catalog}
        flowLibrary={reusableLibrary}
        currentFlowId={flowId}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(360px, 1fr)', gap: 16 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card-title">Environment controls</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
            <button className="btn btn-secondary" onClick={handleDeployStaging} disabled={versionBusy || !flow}>Deploy to staging</button>
            <button className="btn btn-primary" onClick={handlePromoteProduction} disabled={versionBusy || !flow}>Promote to production</button>
            <button className="btn btn-ghost" onClick={handleRunInEnvironment} disabled={versionBusy || !flow}>Run now</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {environments.map((env) => (
              <span key={env.environment} className={`badge ${env.enabled ? 'b-success' : 'b-neutral'}`}>
                {env.environment}: {env.enabled ? 'deployed' : 'not deployed'}
              </span>
            ))}
          </div>

          <div>
            <div className="form-label" style={{ marginBottom: 6 }}>{activeEnvironment} run history</div>
            <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflow: 'auto' }}>
              {environmentRuns.length === 0 ? (
                <div className="muted" style={{ fontSize: 12 }}>No runs yet for {activeEnvironment}.</div>
              ) : (
                environmentRuns.slice(0, 30).map((run) => (
                  <button
                    key={String(run.id)}
                    type="button"
                    onClick={() => setSelectedRunId(String(run.id))}
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      border: String(run.id) === selectedRunId ? '1px solid rgba(90,125,255,0.72)' : '1px solid rgba(255,255,255,0.08)',
                      background: String(run.id) === selectedRunId ? 'rgba(90,125,255,0.08)' : 'rgba(255,255,255,0.02)',
                      color: 'inherit',
                      display: 'grid',
                      gap: 4,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{String(run.status || 'unknown')}</span>
                      <span className="muted" style={{ fontSize: 11 }}>{String(run.started_at || '')}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 11, wordBreak: 'break-all' }}>{String(run.id || '')}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <aside className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card-title">Version history</div>
          <div style={{ display: 'grid', gap: 8, maxHeight: 360, overflow: 'auto' }}>
            {versions.length === 0 ? (
              <div className="muted" style={{ fontSize: 12 }}>No versions available yet.</div>
            ) : versions.map((version) => (
              <button
                key={version.id}
                onClick={() => handleSelectVersion(version.id)}
                style={{
                  textAlign: 'left',
                  padding: 10,
                  borderRadius: 8,
                  border: selectedVersionId === version.id ? '1px solid rgba(124,156,255,0.8)' : '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.02)',
                  color: '#fff',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700 }}>{new Date(version.created_at).toLocaleString()}</div>
                <div className="muted" style={{ fontSize: 11 }}>by {version.created_by || 'system'}</div>
                <div className="muted" style={{ fontSize: 11 }}>{version.note || 'No note'}</div>
                <div style={{ marginTop: 8 }}>
                  <span
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleRollbackVersion(version.id);
                    }}
                    className="badge b-danger"
                    style={{ cursor: 'pointer' }}
                  >
                    Rollback
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
            <div className="form-label" style={{ marginBottom: 6 }}>Selected diff</div>
            {versionBusy ? <div className="muted" style={{ fontSize: 12 }}>Calculating diff…</div> : null}
            {!selectedVersion || !versionDiff ? (
              <div className="muted" style={{ fontSize: 12 }}>Select a version to inspect node-level changes.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#22d674', fontWeight: 700 }}>Added (green)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {versionDiff.added_nodes.length === 0 ? <span className="muted" style={{ fontSize: 11 }}>none</span> : versionDiff.added_nodes.map((nodeId) => (
                      <span key={`add-${nodeId}`} className="badge" style={{ background: 'rgba(34,214,116,0.15)', color: '#22d674', border: '1px solid rgba(34,214,116,0.45)' }}>{nodeId}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#ff6b6b', fontWeight: 700 }}>Removed (red)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {versionDiff.removed_nodes.length === 0 ? <span className="muted" style={{ fontSize: 11 }}>none</span> : versionDiff.removed_nodes.map((nodeId) => (
                      <span key={`del-${nodeId}`} className="badge" style={{ background: 'rgba(255,107,107,0.15)', color: '#ff6b6b', border: '1px solid rgba(255,107,107,0.45)' }}>{nodeId}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#ffd166', fontWeight: 700 }}>Changed</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {versionDiff.changed_nodes.length === 0 ? <span className="muted" style={{ fontSize: 11 }}>none</span> : versionDiff.changed_nodes.map((nodeId) => (
                      <span key={`chg-${nodeId}`} className="badge" style={{ background: 'rgba(255,209,102,0.15)', color: '#ffd166', border: '1px solid rgba(255,209,102,0.45)' }}>{nodeId}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="card-title">Step I/O timeline</div>
        {selectedRun ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span className={`badge ${selectedRun.status === 'failed' ? 'b-error' : selectedRun.status === 'running' ? 'b-running' : 'b-success'}`}>
                {selectedRun.status || 'unknown'}
              </span>
              <span className="badge b-neutral">Run {selectedRun.id}</span>
              <span className="badge b-neutral">{selectedRun.duration_ms ?? 0}ms</span>
              <span className="badge b-neutral">{selectedRun.steps_log?.length || 0} steps</span>
            </div>
            {selectedRun.error_message ? (
              <div className="alert alert-error" style={{ marginBottom: 0 }}>
                {selectedRun.error_message}
              </div>
            ) : null}
            <StepIoViewer
              flowId={flowId}
              runId={selectedRun.id}
              stepsLog={selectedRun.steps_log || []}
            />
          </>
        ) : (
          <div className="empty-state" style={{ padding: '26px 20px' }}>
            <div className="empty-title">Select a run</div>
            <div className="empty-sub">Pick a run from the history to inspect frozen step input, output, and replay.</div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Raw definition</div>
        <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{definitionJson}</pre>
      </div>
    </div>
  );
}
