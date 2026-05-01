'use client';

import { useEffect, useMemo, useState } from 'react';
import { getWorkspaceSubscriptionStatus, upgradeWorkspacePlan, type WorkspaceSubscriptionStatus } from '../../../lib/api';
import { useDashboardStore } from '../../../lib/store';

function isFinalStatus(status?: string) {
  const normalized = (status || '').toLowerCase();
  return normalized === 'active' || normalized === 'canceled' || normalized === 'incomplete_expired';
}

export default function BillingSettingsPage() {
  const { accessToken, workspaceId, setAccessToken, workspaces, setWorkspaces } = useDashboardStore();
  const [status, setStatus] = useState<WorkspaceSubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [message, setMessage] = useState('');

  const currentWorkspace = useMemo(
    () => workspaces.find((ws) => ws.id === workspaceId) || null,
    [workspaces, workspaceId],
  );

  const refreshStatus = async () => {
    if (!accessToken || !workspaceId) {
      return;
    }

    setLoading(true);
    try {
      const next = await getWorkspaceSubscriptionStatus({
        workspaceId,
        token: accessToken,
        setToken: setAccessToken,
      });
      if (next) {
        setStatus(next);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, workspaceId]);

  useEffect(() => {
    if (!status?.billing?.status) {
      return;
    }

    if (isFinalStatus(status.billing.status)) {
      return;
    }

    const id = window.setInterval(() => {
      void refreshStatus();
    }, 3000);

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.billing?.status, accessToken, workspaceId]);

  const onUpgradeToPro = async () => {
    if (!accessToken || !workspaceId) {
      return;
    }

    setUpgradeLoading(true);
    setMessage('');
    try {
      const response = await upgradeWorkspacePlan({
        workspaceId,
        plan: 'pro',
        token: accessToken,
        setToken: setAccessToken,
      });

      const payload = (await response.json().catch(() => ({}))) as WorkspaceSubscriptionStatus & {
        billing?: { status?: string; requested_plan?: string };
      };

      if (!response.ok) {
        setMessage('Upgrade request failed. Please retry.');
        return;
      }

      setStatus(payload);
      setMessage(
        payload?.billing?.status === 'active'
          ? 'Upgrade confirmed. Pro plan is active.'
          : 'Upgrade requested. Waiting for Stripe webhook confirmation…',
      );

      const finalPlan = payload?.billing?.confirmed_plan || payload?.workspace?.plan;
      if (finalPlan) {
        setWorkspaces(
          workspaces.map((ws) =>
            ws.id === workspaceId
              ? {
                  ...ws,
                  plan: finalPlan,
                }
              : ws,
          ),
        );
      }
    } catch {
      setMessage('Upgrade request failed. Please retry.');
    } finally {
      setUpgradeLoading(false);
    }
  };

  const displayPlan = status?.workspace?.plan || currentWorkspace?.plan || 'free';
  const requestedPlan = status?.billing?.requested_plan || '—';
  const subscriptionStatus = status?.billing?.status || 'none';

  return (
    <div>
      <div className="page-hd">
        <div>
          <div className="page-title">Billing</div>
          <div className="page-sub">Upgrade workspace plans and monitor Stripe confirmation status</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => void refreshStatus()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {message && <div className="alert alert-success mb-16">{message}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-hd">
          <div className="card-title">Current Subscription</div>
        </div>
        <table>
          <tbody>
            <tr>
              <th style={{ width: 240 }}>Workspace plan</th>
              <td>{displayPlan}</td>
            </tr>
            <tr>
              <th>Requested plan</th>
              <td>{requestedPlan}</td>
            </tr>
            <tr>
              <th>Subscription status</th>
              <td>
                <span className="badge b-accent">{subscriptionStatus}</span>
              </td>
            </tr>
            <tr>
              <th>Stripe subscription</th>
              <td>{status?.billing?.stripe_subscription_id || '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-title">Upgrade</div>
        </div>
        <p className="text-faint" style={{ marginTop: 0 }}>
          Pro unlocks advanced connectors and higher usage limits.
        </p>
        <button className="btn btn-primary" onClick={onUpgradeToPro} disabled={upgradeLoading || !workspaceId}>
          {upgradeLoading ? 'Requesting upgrade…' : 'Upgrade to Pro'}
        </button>
      </div>
    </div>
  );
}
