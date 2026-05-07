'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiBase, authenticatedFetch } from '../../lib/api';
import { useDashboardStore } from '../../lib/store';

type Flow = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  run_count: number;
  definition?: {
    published?: boolean;
  };
};

export default function FlowsPage() {
  const { accessToken, workspaceId, setAccessToken } = useDashboardStore();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [error, setError] = useState('');

  const loadFlows = async () => {
    if (!accessToken || !workspaceId) {
      return;
    }
    const response = await authenticatedFetch(`${apiBase}/flows?workspaceId=${workspaceId}`, accessToken, setAccessToken);
    if (!response.ok) {
      setError(`Failed to load flows (${response.status})`);
      return;
    }
    setError('');
    setFlows((await response.json()) as Flow[]);
  };

  useEffect(() => {
    void loadFlows();
  }, [accessToken, workspaceId]);

  const removeFlow = async (flowId: string) => {
    const response = await authenticatedFetch(`${apiBase}/flows/${flowId}`, accessToken, setAccessToken, { method: 'DELETE' });
    if (!response.ok) {
      setError(`Failed to delete flow (${response.status})`);
      return;
    }
    await loadFlows();
  };

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const analyseLastFailure = async (flowId: string) => {
    if (!accessToken || !workspaceId) return;
    const resp = await authenticatedFetch(`${apiBase}/flow-runs?workspaceId=${workspaceId}`, accessToken, setAccessToken);
    if (!resp.ok) {
      setError(`Failed to load run history (${resp.status})`);
      return;
    }
    const runs = await resp.json();
    const failed = runs
      .filter((r: any) => r.flow_id === flowId && r.status === 'failed')
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (failed.length === 0) {
      setError('No failed runs found for this flow');
      return;
    }
    const last = failed[0];
    const analyzeResp = await authenticatedFetch(`${apiBase}/ai/analyze-failure`, accessToken, setAccessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errorLog: last.error_log }),
    });
    if (!analyzeResp.ok) {
      setError(`AI analysis failed (${analyzeResp.status})`);
      return;
    }
    const analysisJson = await analyzeResp.json();
    const analysis = analysisJson.analysis || analysisJson || 'No analysis returned';
    setAiAnalysis(analysis);
    setAiModalOpen(true);
  };

  return (
    <div>
      <div className="page-hd">
        <div>
          <div className="page-title">Flows</div>
          <div className="page-sub">{flows.length} flows in this workspace</div>
        </div>
        <div className="page-actions">
          <a className="btn btn-primary" href="/flows/new">Describe automation</a>
          <button className="btn btn-secondary" onClick={loadFlows}>Refresh</button>
        </div>
      </div>

      {error && <div className="alert alert-error mb-16">{error}</div>}

      <div className="card">
        {flows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No flows yet</div>
            <div className="empty-sub">Create a flow from the API or flow builder.</div>
          </div>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Status</th><th>Runs</th><th>Description</th><th>Actions</th></tr></thead>
            <tbody>
              {flows.map((flow) => (
                <tr key={flow.id}>
                  <td style={{ fontWeight: 600 }}>
                    <Link href={`/flows/${flow.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{flow.name}</Link>
                    {flow.definition?.published ? (
                      <span className="badge b-accent" style={{ marginLeft: 8, fontSize: 10 }}>published</span>
                    ) : null}
                  </td>
                  <td>
                    <span className={`badge ${flow.enabled ? 'b-success' : 'b-neutral'}`}>
                      <span className="badge-dot" />{flow.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td>{flow.run_count}</td>
                  <td>{flow.description || '—'}</td>
                  <td>
                    <Link className="btn btn-secondary btn-sm" href={`/flows/${flow.id}`}>Edit</Link>
                    <Link className="btn btn-ghost btn-sm" href={`/flows/${flow.id}/runs`} style={{ marginLeft: 8 }}>Runs</Link>
                    <button className="btn btn-danger btn-sm" onClick={() => removeFlow(flow.id)}>Delete</button>
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => analyseLastFailure(flow.id)}>Analyse with AI</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {aiModalOpen && (
        <div className="modal-backdrop">
          <div className="modal card">
            <div className="modal-hd">AI Analysis</div>
            <div className="modal-body">
              <pre style={{ whiteSpace: 'pre-wrap' }}>{aiAnalysis}</pre>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setAiModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
