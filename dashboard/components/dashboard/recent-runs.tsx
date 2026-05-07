'use client';

import { useEffect, useState } from 'react';
import { apiBase, authenticatedFetch, FlowRunRecord } from '../../lib/api';
import { useDashboardStore } from '../../lib/store';
import Link from 'next/link';
import { AlertCircle, CheckCircle, Clock } from 'lucide-react';

export function RecentRuns() {
  const { accessToken, workspaceId, setAccessToken } = useDashboardStore();
  const [runs, setRuns] = useState<FlowRunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !workspaceId) return;

    const fetchRuns = async () => {
      try {
        setLoading(true);
        const response = await authenticatedFetch(
          `${apiBase}/analytics/runs?workspaceId=${workspaceId}&limit=5`,
          accessToken,
          setAccessToken,
        );

        if (!response.ok) {
          throw new Error('Failed to fetch recent runs');
        }

        const data = (await response.json()) as { runs?: FlowRunRecord[] };
        setRuns(data.runs || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setRuns([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRuns();
  }, [accessToken, workspaceId, setAccessToken]);

  const getStatusIcon = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'success':
        return <CheckCircle size={14} style={{ color: '#10b981' }} />;
      case 'failed':
        return <AlertCircle size={14} style={{ color: '#ef4444' }} />;
      default:
        return <Clock size={14} style={{ color: '#f59e0b' }} />;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'success':
        return '#10b981';
      case 'failed':
        return '#ef4444';
      default:
        return '#f59e0b';
    }
  };

  if (loading) return <div style={{ padding: '12px', color: 'var(--text-2)', fontSize: 13 }}>Loading recent runs…</div>;
  if (error) return <div style={{ padding: '12px', color: 'var(--error)', fontSize: 13 }}>Error: {error}</div>;
  if (runs.length === 0) return <div style={{ padding: '12px', color: 'var(--text-3)', fontSize: 13 }}>No recent runs yet</div>;

  return (
    <table style={{ width: '100%', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
          <th style={{ padding: '8px 0', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)' }}>Flow</th>
          <th style={{ padding: '8px 0', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)' }}>Status</th>
          <th style={{ padding: '8px 0', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)' }}>Duration</th>
          <th style={{ padding: '8px 0', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)' }}>Started</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr key={run.id} style={{ borderBottom: '1px solid var(--border-color)', height: 40 }}>
            <td style={{ padding: '8px 0' }}>
              {run.flow_id ? (
                <Link href={`/flows/${run.flow_id}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 11, fontWeight: 500 }}>
                  {run.flow_id.slice(0, 8)}…
                </Link>
              ) : (
                <span style={{ color: 'var(--text-3)' }}>—</span>
              )}
            </td>
            <td style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              {getStatusIcon(run.status)}
              <span style={{ color: getStatusColor(run.status) }}>{run.status || 'pending'}</span>
            </td>
            <td style={{ padding: '8px 0', color: 'var(--text-3)' }}>{run.duration_ms ? `${run.duration_ms}ms` : '—'}</td>
            <td style={{ padding: '8px 0', color: 'var(--text-3)' }}>
              {run.started_at ? new Date(run.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
