'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiBase, authenticatedFetch } from '../../../lib/api';
import { buildOAuthAuthorizeUrl, getOAuthInstallConfig, isOAuthConnector } from '../../../lib/oauth-connectors';
import { useDashboardStore } from '../../../lib/store';

type ConnectorCatalogItem = {
  connector: string;
  auth: 'none' | 'bearer' | 'api_key' | 'oauth2' | 'mixed';
  action: string;
};

type VaultSecret = {
  connector_id?: string;
  connectorId?: string;
  name?: string;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | string | null;
};

function readAccountName(metadata: VaultSecret['metadata']): string {
  if (!metadata) {
    return '—';
  }

  try {
    const value = typeof metadata === 'string' ? JSON.parse(metadata) as Record<string, unknown> : metadata;
    const accountName = value.account_name || value.accountName;
    return typeof accountName === 'string' && accountName.trim() ? accountName : '—';
  } catch {
    return '—';
  }
}

export default function VaultSettingsPage() {
  const { accessToken, workspaceId, setAccessToken } = useDashboardStore();
  const [secrets, setSecrets] = useState<VaultSecret[]>([]);
  const [connectors, setConnectors] = useState<ConnectorCatalogItem[]>([]);
  const [error, setError] = useState('');

  const loadData = async () => {
    if (!accessToken || !workspaceId) {
      return;
    }

    const [secretResponse, connectorResponse] = await Promise.all([
      authenticatedFetch(`${apiBase}/workspaces/${workspaceId}/secrets`, accessToken, setAccessToken),
      authenticatedFetch(`${apiBase}/connectors/catalog`, accessToken, setAccessToken),
    ]);

    if (secretResponse.ok) {
      const payload = (await secretResponse.json()) as VaultSecret[] | { items?: VaultSecret[] };
      setSecrets(Array.isArray(payload) ? payload : payload.items || []);
      setError('');
    } else {
      setError(`Failed to load vault secrets (${secretResponse.status})`);
    }

    if (connectorResponse.ok) {
      const payload = (await connectorResponse.json()) as { items?: ConnectorCatalogItem[] };
      setConnectors(payload.items || []);
    }
  };

  useEffect(() => {
    void loadData();
  }, [accessToken, workspaceId]);

  const usedConnectorIds = useMemo(
    () => new Set(secrets.map((s) => s.connector_id || s.connectorId || s.name || '').filter(Boolean)),
    [secrets],
  );

  const connectorCatalog = useMemo(() => {
    const seen = new Set<string>();
    return connectors.filter((item) => {
      if (seen.has(item.connector)) {
        return false;
      }
      seen.add(item.connector);
      return true;
    });
  }, [connectors]);

  const missingConnectors = useMemo(
    () => connectorCatalog.filter((item) => !usedConnectorIds.has(item.connector)),
    [connectorCatalog, usedConnectorIds],
  );

  const removeSecret = async (connectorId: string) => {
    const response = await authenticatedFetch(
      `${apiBase}/workspaces/${workspaceId}/secrets/${encodeURIComponent(connectorId)}`,
      accessToken,
      setAccessToken,
      { method: 'DELETE' },
    );

    if (!response.ok) {
      setError(`Failed to delete secret (${response.status})`);
      return;
    }

    await loadData();
  };

  const connectConnector = (connector: string) => {
    if (!workspaceId || !isOAuthConnector(connector)) {
      return;
    }
    const config = getOAuthInstallConfig(connector, workspaceId);
    if (!config) {
      return;
    }
    const authorizeUrl = buildOAuthAuthorizeUrl(config);
    window.location.assign(authorizeUrl);
  };

  return (
    <div>
      <div className="page-hd">
        <div>
          <div className="page-title">VaultGuard</div>
          <div className="page-sub">Workspace connector secrets and OAuth connections</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={loadData}>Refresh</button>
        </div>
      </div>

      {error && <div className="alert alert-error mb-16">{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-hd">
          <div className="card-title">Stored Credentials</div>
          <span className="badge b-neutral" style={{ fontFamily: 'JetBrains Mono', fontSize: 10 }}>{secrets.length}</span>
        </div>
        {secrets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No credentials yet</div>
            <div className="empty-sub">Use Connect on a catalog connector to add one.</div>
          </div>
        ) : (
          <table>
            <thead><tr><th>Connector</th><th>Account</th><th>Last Updated</th><th>Metadata</th><th>Actions</th></tr></thead>
            <tbody>
              {secrets.map((secret, index) => {
                const connectorId = secret.connector_id || secret.connectorId || secret.name || `secret-${index}`;
                const metadataText = typeof secret.metadata === 'string' ? secret.metadata : JSON.stringify(secret.metadata || {});
                return (
                  <tr key={connectorId}>
                    <td style={{ fontWeight: 600 }}>{connectorId}</td>
                    <td>{readAccountName(secret.metadata)}</td>
                    <td>{secret.updated_at ? new Date(secret.updated_at).toLocaleString() : '—'}</td>
                    <td><span className="font-mono text-faint" style={{ fontSize: 11 }}>{metadataText.slice(0, 70)}</span></td>
                    <td>
                      <div className="flex gap-6">
                        <button className="btn btn-danger btn-sm" onClick={() => removeSecret(connectorId)}>Delete</button>
                        {isOAuthConnector(connectorId) && (
                          <button className="btn btn-primary btn-sm" onClick={() => connectConnector(connectorId)}>Connect</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-title">Catalog connectors with no credentials</div>
          <span className="badge b-neutral" style={{ fontFamily: 'JetBrains Mono', fontSize: 10 }}>{missingConnectors.length}</span>
        </div>
        {missingConnectors.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">All catalog connectors already have credentials</div>
          </div>
        ) : (
          <table>
            <thead><tr><th>Connector</th><th>Auth</th><th>Action</th><th>Connect</th></tr></thead>
            <tbody>
              {missingConnectors.map((item) => (
                <tr key={item.connector}>
                  <td style={{ fontWeight: 600 }}>{item.connector}</td>
                  <td><span className="badge b-accent">{item.auth}</span></td>
                  <td>{item.action}</td>
                  <td>
                    {item.auth === 'oauth2' && isOAuthConnector(item.connector) ? (
                      <button className="btn btn-primary btn-sm" onClick={() => connectConnector(item.connector)}>Connect</button>
                    ) : (
                      <span className="text-faint">Manual credential</span>
                    )}
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
