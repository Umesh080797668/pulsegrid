'use client';

import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiBase, authenticatedFetch } from '../../lib/api';
import { useDashboardStore } from '../../lib/store';

type FlowRun = {
  id: string;
  status: string;
  started_at: string;
};

export default function AnalyticsPage() {
  const { accessToken, workspaceId, setAccessToken } = useDashboardStore();
  const [runs, setRuns] = useState<FlowRun[]>([]);

  useEffect(() => {
    const run = async () => {
      if (!accessToken || !workspaceId) {
        return;
      }
      const response = await authenticatedFetch(`${apiBase}/flow-runs?workspaceId=${workspaceId}`, accessToken, setAccessToken);
      if (!response.ok) {
        return;
      }
      setRuns((await response.json()) as FlowRun[]);
    };
    void run();
  }, [accessToken, workspaceId, setAccessToken]);

  const successRuns = runs.filter((r) => r.status === 'success').length;
  const failedRuns = runs.filter((r) => r.status === 'failed').length;
  const successRate = runs.length ? Math.round((successRuns / runs.length) * 100) : 0;

  const series = useMemo(() => {
    const byDay = new Map<string, number>();
    runs.forEach((run) => {
      const day = new Date(run.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      byDay.set(day, (byDay.get(day) || 0) + 1);
    });
    return Array.from(byDay.entries()).slice(-7).map(([day, count]) => ({ day, runs: count }));
  }, [runs]);

  return (
    <div>
      <div className="page-hd">
        <div>
          <div className="page-title">Analytics</div>
          <div className="page-sub">Flow execution metrics</div>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card"><div className="stat-label">Total Runs</div><div className="stat-val">{runs.length}</div></div>
        <div className="stat-card"><div className="stat-label">Success</div><div className="stat-val">{successRuns}</div></div>
        <div className="stat-card"><div className="stat-label">Failed</div><div className="stat-val">{failedRuns}</div></div>
        <div className="stat-card"><div className="stat-label">Success Rate</div><div className="stat-val">{runs.length ? `${successRate}%` : '—'}</div></div>
      </div>

      <div className="card">
        <div className="card-hd"><div className="card-title">Runs by day</div></div>
        <div style={{ width: '100%', height: 280, padding: '12px 16px 8px' }}>
          {series.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">No run data yet</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="var(--text-3)" tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis stroke="var(--text-3)" tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' }} />
                <Area type="monotone" dataKey="runs" stroke="var(--accent)" fill="rgba(90,125,255,0.25)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
