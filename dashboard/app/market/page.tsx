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
    const response = await authenticatedFetch(`${apiBase}/market/install`, accessToken, setAccessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, templateId }),
    });

    if (!response.ok) {
      setError(`Failed to install template (${response.status})`);
      return;
    }

    setError('');
    window.alert('Template installed successfully');
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
        </div>
      </div>

      {error && <div className="alert alert-error mb-16">{error}</div>}

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
