'use client';

import { useEffect, useState } from 'react';
import { apiBase, authenticatedFetch } from '../../lib/api';
import { useDashboardStore } from '../../lib/store';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface DashboardStats {
  totalRuns?: number;
  successfulRuns?: number;
  failedRuns?: number;
  successRate?: number;
  avgDuration?: number;
  activeFlows?: number;
  activeConnectors?: number;
}

export function QuickStats() {
  const { accessToken, workspaceId, setAccessToken } = useDashboardStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !workspaceId) return;

    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await authenticatedFetch(
          `${apiBase}/analytics/health?workspaceId=${workspaceId}`,
          accessToken,
          setAccessToken,
        );

        if (response.ok) {
          const data = (await response.json()) as DashboardStats;
          setStats(data);
          setError(null);
        } else {
          setError('Could not load stats');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [accessToken, workspaceId, setAccessToken]);

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ padding: 12, borderRadius: 8, backgroundColor: 'var(--bg-2)', height: 80 }} />
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return <div style={{ color: 'var(--error)', fontSize: 12 }}>Unable to load stats</div>;
  }

  const successRate = stats.successRate ? Math.round(stats.successRate * 100) : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
      <div style={{ padding: 12, borderRadius: 8, backgroundColor: 'var(--bg-2)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>Total Runs</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{stats.totalRuns || 0}</div>
      </div>
      <div style={{ padding: 12, borderRadius: 8, backgroundColor: 'var(--bg-2)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>Success Rate</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: successRate > 80 ? '#10b981' : successRate > 50 ? '#f59e0b' : '#ef4444' }}>{successRate}%</div>
          {successRate > 80 ? <TrendingUp size={16} style={{ color: '#10b981' }} /> : <TrendingDown size={16} style={{ color: '#ef4444' }} />}
        </div>
      </div>
      <div style={{ padding: 12, borderRadius: 8, backgroundColor: 'var(--bg-2)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>Active Flows</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{stats.activeFlows || 0}</div>
      </div>
      <div style={{ padding: 12, borderRadius: 8, backgroundColor: 'var(--bg-2)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>Connectors</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{stats.activeConnectors || 0}</div>
      </div>
    </div>
  );
}
