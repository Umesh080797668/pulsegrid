'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiBase, authenticatedFetch } from '../../lib/api';
import { buildOAuthAuthorizeUrl, getOAuthInstallConfig, isOAuthConnector } from '../../lib/oauth-connectors';
import { useDashboardStore } from '../../lib/store';

type ConnectorCatalogItem = {
  connector: string;
  action: string;
  category: string;
  auth: 'none' | 'bearer' | 'api_key' | 'oauth2' | 'mixed';
  required_input_fields: string[];
};

export default function ConnectorsPage() {
  const { accessToken, workspaceId, setAccessToken } = useDashboardStore();
  const [connectors, setConnectors] = useState<ConnectorCatalogItem[]>([]);

  const loadConnectors = async () => {
    if (!accessToken) {
      return;
    }
    const response = await authenticatedFetch(`${apiBase}/connectors/catalog`, accessToken, setAccessToken);
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as { items?: ConnectorCatalogItem[] };
    setConnectors(data.items || []);
  };

  useEffect(() => {
    void loadConnectors();
  }, [accessToken]);

  const uniqueConnectors = useMemo(() => {
    const seen = new Set<string>();
    return connectors.filter((item) => {
      if (seen.has(item.connector)) {
        return false;
      }
      seen.add(item.connector);
      return true;
    });
  }, [connectors]);

  const startOAuth = (connector: string) => {
    if (!workspaceId || !isOAuthConnector(connector)) {
      return;
    }
    const config = getOAuthInstallConfig(connector, workspaceId);
    if (!config) {
      return;
    }
    const url = buildOAuthAuthorizeUrl(config);
    window.location.assign(url);
  };

  return (
    <div>
      <div className="page-hd">
        <div>
          <div className="page-title">Connector Catalog</div>
          <div className="page-sub">{uniqueConnectors.length} connectors available</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={loadConnectors}>Refresh</button>
        </div>
      </div>

      {uniqueConnectors.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-title">No connectors loaded</div>
          </div>
        </div>
      ) : (
        <div className="connector-grid">
          {uniqueConnectors.map((item) => (
            <div key={item.connector} className="connector-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <div className="connector-name">{item.connector}</div>
                <span className="badge b-accent" style={{ fontSize: 10 }}>{item.auth}</span>
              </div>
              <div className="connector-meta">
                <div>Category: {item.category}</div>
                <div>Action: {item.action}</div>
              </div>
              <div style={{ marginTop: 16 }}>
                {item.auth === 'oauth2' ? (
                  <button className="btn btn-primary w-full" style={{ justifyContent: 'center' }} onClick={() => startOAuth(item.connector)}>Connect</button>
                ) : (
                  <button className="btn btn-secondary w-full" style={{ justifyContent: 'center' }} disabled>No OAuth required</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
