'use client';

import { useEffect, useMemo, useState } from 'react';
import { getWorkspaceSubscriptionStatus, upgradeWorkspacePlan, type WorkspaceSubscriptionStatus } from '../../../lib/api';
import { useDashboardStore } from '../../../lib/store';

type BillingCycle = 'monthly' | 'yearly';

interface PlanTier {
  name: string;
  price: number;
  yearlyPrice?: number;
  billing: string;
  yearlyBilling?: string;
  features: string[];
  limits: {
    flows: number | string;
    events_per_day: number | string;
    events_per_month: number | string;
    team_members: number | string;
    run_history: string;
    connectors: string;
    analytics: string;
    support: string;
  };
  recommended?: boolean;
}

const PLAN_TIERS: Record<string, PlanTier> = {
  free: {
    name: 'Free',
    price: 0,
    billing: 'forever',
    features: ['Perfect for getting started', 'Limited flows and events'],
    limits: {
      flows: 5,
      events_per_day: '1,000',
      events_per_month: '30,000',
      team_members: 1,
      run_history: '7 days',
      connectors: 'Tier 1 only',
      analytics: 'Basic',
      support: 'Community',
    },
  },
  pro: {
    name: 'Pro',
    price: 12,
    billing: '/month',
    yearlyPrice: 120,
    yearlyBilling: '/year',
    features: ['For growing teams', 'Advanced connectors', 'Higher limits'],
    limits: {
      flows: 50,
      events_per_day: '100,000',
      events_per_month: '3,000,000',
      team_members: 3,
      run_history: '90 days',
      connectors: 'Tier 1 & 2',
      analytics: 'Standard',
      support: 'Email',
    },
  },
  business: {
    name: 'Business',
    price: 49,
    billing: '/month',
    recommended: true,
    features: [
      'For scaling businesses',
      'Full connector access',
      '25 team members',
      'Advanced analytics',
      '1-year run history',
      'Priority support',
    ],
    limits: {
      flows: 500,
      events_per_day: '2,000,000',
      events_per_month: '60,000,000',
      team_members: 25,
      run_history: '1 year',
      connectors: 'All tiers',
      analytics: 'Advanced',
      support: 'Priority email',
    },
  },
};

function isFinalStatus(status?: string) {
  const normalized = (status || '').toLowerCase();
  return normalized === 'active' || normalized === 'canceled' || normalized === 'incomplete_expired';
}

function PlanCard({
  planKey,
  tier,
  isCurrent,
  isUpgrade,
  billingCycle,
  onBillingCycleChange,
  onUpgrade,
  loading,
}: {
  planKey: string;
  tier: PlanTier;
  isCurrent: boolean;
  isUpgrade: boolean;
  billingCycle?: BillingCycle;
  onBillingCycleChange?: (cycle: BillingCycle) => void;
  onUpgrade: (cycle?: BillingCycle) => void;
  loading: boolean;
}) {
  const displayPrice = billingCycle === 'yearly' && tier.yearlyPrice ? tier.yearlyPrice : tier.price;
  const displayBilling = billingCycle === 'yearly' && tier.yearlyBilling ? tier.yearlyBilling : tier.billing;

  return (
    <div className={`plan-card ${isCurrent ? 'current' : ''} ${tier.recommended ? 'recommended' : ''}`} style={{
      border: tier.recommended ? '2px solid #ff6b35' : '1px solid #ddd',
      borderRadius: '8px',
      padding: '24px',
      marginBottom: '16px',
      backgroundColor: tier.recommended ? '#fff9f5' : '#fff',
      position: 'relative',
    }}>
      {tier.recommended && (
        <div style={{
          position: 'absolute',
          top: '-12px',
          left: '16px',
          backgroundColor: '#ff6b35',
          color: 'white',
          padding: '4px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 'bold',
        }}>
          RECOMMENDED
        </div>
      )}
      
      <div style={{ marginTop: tier.recommended ? '8px' : '0' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 'bold' }}>{tier.name}</h3>
        <div style={{ marginBottom: '16px' }}>
          <span style={{ fontSize: '32px', fontWeight: 'bold' }}>${displayPrice}</span>
          <span style={{ fontSize: '14px', color: '#666' }}>{displayBilling}</span>
        </div>

        {planKey === 'pro' && onBillingCycleChange && tier.yearlyPrice ? (
          <div style={{ display: 'flex', gap: 8, marginBottom: '16px' }}>
            <button
              type="button"
              className={billingCycle === 'monthly' ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => onBillingCycleChange('monthly')}
              style={{ flex: 1 }}
            >
              Monthly
            </button>
            <button
              type="button"
              className={billingCycle === 'yearly' ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => onBillingCycleChange('yearly')}
              style={{ flex: 1 }}
            >
              Yearly
            </button>
          </div>
        ) : null}

        {planKey === 'pro' && billingCycle === 'yearly' && tier.yearlyPrice ? (
          <div style={{ marginBottom: '12px', fontSize: '13px', color: '#555' }}>
            Save two months with annual billing.
          </div>
        ) : null}
        
        <div style={{ marginBottom: '16px' }}>
          {tier.features.map((feature, idx) => (
            <div key={idx} style={{ fontSize: '14px', color: '#555', marginBottom: '4px' }}>
              ✓ {feature}
            </div>
          ))}
        </div>
        
        <div style={{ 
          backgroundColor: '#f5f5f5', 
          padding: '12px', 
          borderRadius: '4px', 
          marginBottom: '16px',
          fontSize: '13px'
        }}>
          <div style={{ marginBottom: '8px' }}><strong>Limits:</strong></div>
          <div>Flows: {tier.limits.flows}</div>
          <div>Events/day: {tier.limits.events_per_day}</div>
          <div>Team members: {tier.limits.team_members}</div>
          <div>Run history: {tier.limits.run_history}</div>
          <div>Connectors: {tier.limits.connectors}</div>
          <div>Analytics: {tier.limits.analytics}</div>
          <div>Support: {tier.limits.support}</div>
        </div>
        
        {isCurrent ? (
          <button className="btn btn-disabled" style={{ width: '100%' }}>
            Current Plan
          </button>
        ) : isUpgrade ? (
          <button 
            className="btn btn-primary" 
            onClick={() => onUpgrade(billingCycle)} 
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? 'Processing…' : `Upgrade to ${tier.name}${billingCycle ? ` (${billingCycle})` : ''}`}
          </button>
        ) : (
          <button 
            className="btn btn-secondary" 
            onClick={() => onUpgrade(billingCycle)} 
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? 'Processing…' : `Downgrade to ${tier.name}${billingCycle ? ` (${billingCycle})` : ''}`}
          </button>
        )}
      </div>
    </div>
  );
}

export default function BillingSettingsPage() {
  const { accessToken, workspaceId, setAccessToken, workspaces, setWorkspaces } = useDashboardStore();
  const [status, setStatus] = useState<WorkspaceSubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedUpgradePlan, setSelectedUpgradePlan] = useState<string | null>(null);
  const [selectedProBillingCycle, setSelectedProBillingCycle] = useState<BillingCycle>('monthly');

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

  const onUpgradePlan = async (plan: string, billingCycle?: BillingCycle) => {
    if (!accessToken || !workspaceId) {
      return;
    }

    setUpgradeLoading(true);
    setMessage('');
    setSelectedUpgradePlan(plan);
    try {
      const response = await upgradeWorkspacePlan({
        workspaceId,
        plan,
        billingCycle,
        token: accessToken,
        setToken: setAccessToken,
      });

      const payload = (await response.json().catch(() => ({}))) as WorkspaceSubscriptionStatus & {
        billing?: { status?: string; requested_plan?: string };
      };

      if (!response.ok) {
        setMessage(`Failed to upgrade to ${plan}. Please retry.`);
        return;
      }

      setStatus(payload);
      const billingLabel = billingCycle ? ` (${billingCycle})` : '';
      setMessage(
        payload?.billing?.status === 'active'
          ? `Upgrade to ${plan.charAt(0).toUpperCase() + plan.slice(1)}${billingLabel} confirmed!`
          : `Upgrade to ${plan.charAt(0).toUpperCase() + plan.slice(1)}${billingLabel} requested. Waiting for confirmation…`,
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
      setMessage(`Failed to upgrade. Please retry.`);
    } finally {
      setUpgradeLoading(false);
      setSelectedUpgradePlan(null);
    }
  };

  const displayPlan = status?.workspace?.plan || currentWorkspace?.plan || 'free';
  const requestedPlan = status?.billing?.requested_plan || '—';
  const requestedBillingCycle = status?.billing?.requested_billing_cycle || 'monthly';
  const subscriptionStatus = status?.billing?.status || 'none';

  return (
    <div>
      <div className="page-hd">
        <div>
          <div className="page-title">Billing</div>
          <div className="page-sub">Manage workspace plans, view limits, and upgrade your subscription</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => void refreshStatus()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {message && <div className={`alert ${message.includes('Failed') ? 'alert-error' : 'alert-success'} mb-16`}>{message}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-hd">
          <div className="card-title">Current Subscription</div>
        </div>
        <table>
          <tbody>
            <tr>
              <th style={{ width: 240 }}>Workspace plan</th>
              <td style={{ fontWeight: 'bold', color: '#ff6b35' }}>{displayPlan.toUpperCase()}</td>
            </tr>
            <tr>
              <th>Requested plan</th>
              <td>{requestedPlan}</td>
            </tr>
            <tr>
              <th>Requested billing cycle</th>
              <td>{requestedBillingCycle}</td>
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
          <div className="card-title">Available Plans</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          {Object.entries(PLAN_TIERS).map(([planKey, tier]) => (
            <PlanCard
              key={planKey}
              planKey={planKey}
              tier={tier}
              isCurrent={displayPlan === planKey}
              isUpgrade={displayPlan === 'free' || (displayPlan === 'pro' && planKey === 'business')}
              billingCycle={planKey === 'pro' ? selectedProBillingCycle : undefined}
              onBillingCycleChange={planKey === 'pro' ? setSelectedProBillingCycle : undefined}
              onUpgrade={(billingCycle) => onUpgradePlan(planKey, billingCycle)}
              loading={upgradeLoading && selectedUpgradePlan === planKey}
            />
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: '20px', backgroundColor: '#f0f8ff', borderLeft: '4px solid #0066cc' }}>
        <div className="card-hd">
          <div className="card-title">Business Plan Benefits</div>
        </div>
        <ul style={{ paddingLeft: '20px', margin: 0 }}>
          <li>2 million events per day</li>
          <li>60 million events per month</li>
          <li>Up to 25 team members</li>
          <li>1-year run history retention</li>
          <li>Full access to all 500+ connectors</li>
          <li>Advanced analytics and reporting</li>
          <li>Priority email support</li>
          <li>99.9% SLA guarantee</li>
        </ul>
      </div>
    </div>
  );
}

