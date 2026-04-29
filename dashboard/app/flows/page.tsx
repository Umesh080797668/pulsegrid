'use client';

import { useEffect, useState } from 'react';
import { apiBase, authenticatedFetch } from '../../lib/api';
import { useDashboardStore } from '../../lib/store';

type Flow = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  run_count: number;
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

  return (
    <div>
      <div className="page-hd">
        <div>
          <div className="page-title">Flows</div>
          <div className="page-sub">{flows.length} flows in this workspace</div>
        </div>
        <div className="page-actions">
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
                  <td style={{ fontWeight: 600 }}>{flow.name}</td>
                  <td>
                    <span className={`badge ${flow.enabled ? 'b-success' : 'b-neutral'}`}>
                      <span className="badge-dot" />{flow.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td>{flow.run_count}</td>
                  <td>{flow.description || '—'}</td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => removeFlow(flow.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
