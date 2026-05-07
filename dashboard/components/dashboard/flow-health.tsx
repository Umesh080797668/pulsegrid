'use client';

import { useEffect, useState } from 'react';
import { apiBase, authenticatedFetch } from '../../lib/api';
import { useDashboardStore } from '../../lib/store';
import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';

export interface FlowHealth {
  flowId: string;
  flowName: string;
  status: 'healthy' | 'degraded' | 'failed';
  successRate: number;
  recentErrors?: number;
  lastRun?: string;
}

export function FlowHealth() {
  const { accessToken, workspaceId, setAccessToken } = useDashboardStore();
  const [flows, setFlows] = useState<FlowHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !workspaceId) return;

    const fetchFlowHealth = async () => {
      try {
        setLoading(true);
        const response = await authenticatedFetch(
          `${apiBase}/analytics/flows?workspaceId=${workspaceId}`,
          accessToken,
          setAccessToken,
        );

        if (!response.ok) {
          throw new Error('Failed to fetch flow health');
        }

        const data = (await response.json()) as any;
        const healthFlows = Array.isArray(data)
          ? data.slice(0, 5).map((f: any) => {
              const successRate = f.successRate || 0;
              const status: 'healthy' | 'degraded' | 'failed' = successRate > 0.8 ? 'healthy' : successRate > 0.5 ? 'degraded' : 'failed';
              return {
                flowId: f.id || f.flow_id || 'unknown',
                flowName: f.name || f.flow_name || 'Unnamed Flow',
                status,
                successRate: Math.round(successRate * 100),
                recentErrors: f.recentErrors || 0,
                lastRun: f.lastRun,
              };
            })
          : [];
        setFlows(healthFlows);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setFlows([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFlowHealth();
  }, [accessToken, workspaceId, setAccessToken]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle size={14} style={{ color: '#10b981' }} />;
      case 'degraded':
        return <AlertTriangle size={14} style={{ color: '#f59e0b' }} />;
      default:
        return <AlertCircle size={14} style={{ color: '#ef4444' }} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return '#10b981';
      case 'degraded':
        return '#f59e0b';
      default:
        return '#ef4444';
    }
  };

  if (loading) return <div style={{ padding: '12px', color: 'var(--text-2)', fontSize: 13 }}>Loading flow health…</div>;
  if (error) return <div style={{ padding: '12px', color: 'var(--error)', fontSize: 13 }}>Error: {error}</div>;
  if (flows.length === 0) return <div style={{ padding: '12px', color: 'var(--text-3)', fontSize: 13 }}>No flows yet</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {flows.map((flow) => (
        <div key={flow.flowId} style={{ padding: 10, borderRadius: 6, backgroundColor: 'var(--bg-2)', fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {getStatusIcon(flow.status)}
              <span style={{ fontWeight: 500, color: 'var(--text-1)' }}>{flow.flowName}</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{flow.successRate}% success</span>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: 'var(--bg-1)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${flow.successRate}%`,
                backgroundColor: getStatusColor(flow.status),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
