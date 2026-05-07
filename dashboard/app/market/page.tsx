'use client';

import { useEffect, useState } from 'react';
import { apiBase, authenticatedFetch } from '../../lib/api';
import { useDashboardStore } from '../../lib/store';

type MarketTemplate = {
  id: string;
  title: string;
  description: string;
  price_cents: number;
};

export default function MarketPage() {
  const { accessToken, workspaceId, setAccessToken } = useDashboardStore();
  const [templates, setTemplates] = useState<MarketTemplate[]>([]);
  const [error, setError] = useState('');
  const [creatorLoading, setCreatorLoading] = useState(false);
  const [creatorMessage, setCreatorMessage] = useState('');

  const loadTemplates = async () => {
    if (!accessToken) {
      return;
    }
    const response = await authenticatedFetch(`${apiBase}/market/templates`, accessToken, setAccessToken);
    if (!response.ok) {
      setError(`Failed to load templates (${response.status})`);
      return;
    }
    const data = (await response.json()) as { templates: MarketTemplate[] };
    setTemplates(data.templates || []);
    setError('');
  };

  useEffect(() => {
    void loadTemplates();
  }, [accessToken]);

  const installTemplate = async (templateId: string) => {
    if (!workspaceId) {
      setError('Select a workspace first');
      return;
    }
    const response = await authenticatedFetch(`${apiBase}/market/templates/${templateId}/install`, accessToken, setAccessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    });

    if (!response.ok) {
      setError(`Failed to install template (${response.status})`);
      return;
    }

    const payload = await response.json();
    if (payload.requires_payment) {
      // start hosted checkout flow
      try {
        const checkoutResp = await authenticatedFetch(`${apiBase}/market/templates/${templateId}/checkout`, accessToken, setAccessToken, { method: 'POST' });
        if (!checkoutResp.ok) {
          setError('Failed to create checkout session');
          return;
        }
        const json = await checkoutResp.json();
        if (json.url) {
          window.location.href = json.url;
          return;
        }
        setError('Checkout URL not returned');
        return;
      } catch (err) {
        setError('Failed to initiate checkout');
        return;
      }
    }

    setError('');
    window.alert('Template installed successfully');
  };

  const onboardCreator = async () => {
    if (!accessToken) {
      setError('Sign in first');
      return;
    }

    setCreatorLoading(true);
    setCreatorMessage('');
    setError('');

    try {
      const response = await authenticatedFetch(`${apiBase}/market/onboard-creator`, accessToken, setAccessToken, {
        method: 'POST',
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || `Stripe onboarding failed (${response.status})`);
      }

      if (payload.url) {
        window.location.href = payload.url;
        return;
      }

      setCreatorMessage('Stripe onboarding link not returned.');
    } catch (onboardingError) {
      setError(onboardingError instanceof Error ? onboardingError.message : String(onboardingError));
    } finally {
      setCreatorLoading(false);
    }
  };

  return (
    <div>
      <div className="page-hd">
        <div>
          <div className="page-title">AutoMarket</div>
          <div className="page-sub">Discover and install templates</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={loadTemplates}>Refresh</button>
          <button className="btn btn-primary" onClick={onboardCreator} disabled={creatorLoading}>
            {creatorLoading ? 'Starting onboarding…' : 'Become a creator'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error mb-16">{error}</div>}
      {creatorMessage && <div className="alert alert-success mb-16">{creatorMessage}</div>}

      <div className="card mb-16" style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Creator payouts</div>
        <div className="muted" style={{ fontSize: 13 }}>
          Connect Stripe to receive the 70% creator share from paid template sales. PulseGrid retains the 30% platform fee automatically.
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-title">No templates available</div>
          </div>
        </div>
      ) : (
        <div className="connector-grid">
          {templates.map((item) => (
            <div key={item.id} className="connector-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <div className="connector-name">{item.title}</div>
                <span className="badge b-success" style={{ fontSize: 10 }}>{item.price_cents === 0 ? 'FREE' : `$${(item.price_cents / 100).toFixed(2)}`}</span>
              </div>
              <div className="connector-meta">{item.description}</div>
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-primary w-full" style={{ justifyContent: 'center' }} onClick={() => installTemplate(item.id)}>Install Template</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
