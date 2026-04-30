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
  id?: string;
  connector_id?: string;
  connectorId?: string;
  name?: string;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | string | null;
};

type DependentFlow = {
  id: string;
  name: string;
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
  const [dependentFlows, setDependentFlows] = useState<DependentFlow[]>([]);
  const [showDependentsModal, setShowDependentsModal] = useState(false);
  const [selectedCredential, setSelectedCredential] = useState<VaultSecret | null>(null);
  const [loadingDependents, setLoadingDependents] = useState(false);

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

  const fetchCredentialDependents = async (credentialId: string, secret: VaultSecret) => {
    setLoadingDependents(true);
    setSelectedCredential(secret);
    try {
      const response = await authenticatedFetch(
        `${apiBase}/credentials/${credentialId}/dependents`,
        accessToken,
        setAccessToken,
      );

      if (response.ok) {
        const data = (await response.json()) as { flows?: DependentFlow[] };
        setDependentFlows(data.flows || []);
      } else {
        setDependentFlows([]);
      }
    } catch (err) {
      console.error('Failed to fetch dependents:', err);
      setDependentFlows([]);
    } finally {
      setLoadingDependents(false);
      setShowDependentsModal(true);
    }
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
            <thead><tr><th>Connector</th><th>Account</th><th>Last Updated</th><th>Metadata</th><th>Used by</th><th>Actions</th></tr></thead>
            <tbody>
              {secrets.map((secret, index) => {
                const credentialId = secret.id || secret.connector_id || secret.connectorId || secret.name || `secret-${index}`;
                const metadataText = typeof secret.metadata === 'string' ? secret.metadata : JSON.stringify(secret.metadata || {});
                return (
                  <tr key={credentialId}>
                    <td style={{ fontWeight: 600 }}>{credentialId}</td>
                    <td>{readAccountName(secret.metadata)}</td>
                    <td>{secret.updated_at ? new Date(secret.updated_at).toLocaleString() : '—'}</td>
                    <td><span className="font-mono text-faint" style={{ fontSize: 11 }}>{metadataText.slice(0, 70)}</span></td>
                    <td>
                      <button
                        className="badge b-accent"
                        onClick={() => fetchCredentialDependents(credentialId, secret)}
                        style={{ cursor: 'pointer', border: 'none', background: 'inherit' }}
                      >
                        Used by N flows
                      </button>
                    </td>
                    <td>
                      <div className="flex gap-6">
                        <button className="btn btn-danger btn-sm" onClick={() => removeSecret(credentialId)}>Delete</button>
                        {isOAuthConnector(credentialId) && (
                          <button className="btn btn-primary btn-sm" onClick={() => connectConnector(credentialId)}>Connect</button>
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

      {/* Dependents Modal */}
      {showDependentsModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowDependentsModal(false)}
        >
          <div
            style={{
              background: 'var(--color-bg-primary)',
              borderRadius: 8,
              padding: 24,
              maxWidth: 500,
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 600 }}>
                Flows using this credential
              </h2>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 14 }}>
                {selectedCredential?.name || selectedCredential?.connector_id || 'Credential'}
              </p>
            </div>

            {loadingDependents ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-text-secondary)' }}>
                Loading...
              </div>
            ) : dependentFlows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-text-secondary)' }}>
                <p>No flows using this credential</p>
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {dependentFlows.map((flow) => (
                  <li
                    key={flow.id}
                    style={{
                      padding: '12px 0',
                      borderBottom: '1px solid var(--color-border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{flow.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                      {flow.id.slice(0, 12)}…
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowDependentsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
