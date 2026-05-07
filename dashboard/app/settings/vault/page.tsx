'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  apiBase,
  authenticatedFetch,
  deleteWorkspaceCredential,
  listConnectorOAuthInstallations,
  upsertWorkspaceCredential,
  getCredentialDependents,
  type ConnectorCatalogItem,
  type ConnectorOAuthInstallation,
  type WorkspaceCredential,
  type CredentialDependentsResponse,
} from '../../../lib/api';
import { useDashboardStore } from '../../../lib/store';

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const connectorFromQuery = searchParams.get('connector') || '';
  const { accessToken, workspaceId, setAccessToken } = useDashboardStore();
  const [catalog, setCatalog] = useState<ConnectorCatalogItem[]>([]);
  const [credentials, setCredentials] = useState<WorkspaceCredential[]>([]);
  const [oauthInstallations, setOauthInstallations] = useState<ConnectorOAuthInstallation[]>([]);
  const [selectedConnector, setSelectedConnector] = useState(connectorFromQuery);
  const [secretName, setSecretName] = useState(connectorFromQuery);
  const [secretValue, setSecretValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingConnector, setSavingConnector] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showImpactModal, setShowImpactModal] = useState(false);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactData, setImpactData] = useState<CredentialDependentsResponse | null>(null);
  const [selectedCredentialForRotate, setSelectedCredentialForRotate] = useState<string | null>(null);

  useEffect(() => {
    setSelectedConnector(connectorFromQuery);
    setSecretName(connectorFromQuery);
  }, [connectorFromQuery]);

  const loadData = async () => {
    if (!accessToken || !workspaceId) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [catalogResponse, credentialResponse] = await Promise.all([
        authenticatedFetch(`${apiBase}/connectors/catalog`, accessToken, setAccessToken),
        authenticatedFetch(`${apiBase}/workspaces/${workspaceId}/credentials`, accessToken, setAccessToken),
      ]);

      if (catalogResponse.ok) {
        const payload = (await catalogResponse.json()) as { items?: ConnectorCatalogItem[] };
        setCatalog(payload.items || []);
      } else {
        setError(`Failed to load connector catalog (${catalogResponse.status})`);
      }

      if (credentialResponse.ok) {
        const payload = (await credentialResponse.json()) as WorkspaceCredential[] | { items?: WorkspaceCredential[] };
        setCredentials(Array.isArray(payload) ? payload : payload.items || []);
      } else {
        setError((current) => current || `Failed to load workspace credentials (${credentialResponse.status})`);
      }

      const oauthRows = await listConnectorOAuthInstallations({ workspaceId, token: accessToken, setToken: setAccessToken });
      setOauthInstallations(oauthRows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [accessToken, workspaceId]);

  const catalogByConnector = useMemo(() => {
    const seen = new Set<string>();
    return catalog.filter((item) => {
      if (seen.has(item.connector)) {
        return false;
      }
      seen.add(item.connector);
      return true;
    });
  }, [catalog]);

  const installedCredentialNames = useMemo(
    () => new Set(credentials.map((credential) => credential.name.trim().toUpperCase()).filter(Boolean)),
    [credentials],
  );

  const installedOAuthNames = useMemo(
    () => new Set(oauthInstallations.map((row) => row.connector.trim().toUpperCase()).filter(Boolean)),
    [oauthInstallations],
  );

  const selectedCatalogItem = useMemo(
    () => (selectedConnector ? catalogByConnector.find((item) => item.connector === selectedConnector) || null : null),
    [catalogByConnector, selectedConnector],
  );

  const pendingOAuthConnectors = useMemo(
    () => catalogByConnector.filter((item) => item.auth === 'oauth2' && !installedOAuthNames.has(item.connector.trim().toUpperCase())),
    [catalogByConnector, installedOAuthNames],
  );

  const handleOAuthInstall = (connector: string) => {
    if (!workspaceId) {
      return;
    }

    router.push(`/oauth/install?connector=${encodeURIComponent(connector)}&workspaceId=${encodeURIComponent(workspaceId)}`);
  };

  const handleSelectConnector = (connector: string) => {
    setSelectedConnector(connector);
    setSecretName(connector);
    setError('');
    setSuccess('');
  };

  const handleSaveCredential = async () => {
    if (!accessToken || !workspaceId || !selectedConnector) {
      return;
    }

    const connectorName = secretName.trim().toUpperCase();
    const value = secretValue.trim();
    if (!connectorName || !value) {
      setError('Connector name and secret value are required');
      return;
    }

    setSavingConnector(selectedConnector);
    setError('');
    setSuccess('');
    try {
      const ok = await upsertWorkspaceCredential({
        workspaceId,
        name: connectorName,
        value,
        token: accessToken,
        setToken: setAccessToken,
      });

      if (!ok) {
        setError(`Failed to store credential for ${connectorName}`);
        return;
      }

      setSecretValue('');
      setSuccess(`Stored credential for ${connectorName}`);
      await loadData();
    } finally {
      setSavingConnector('');
    }
  };

  const handleDeleteCredential = async (name: string) => {
    if (!accessToken || !workspaceId) {
      return;
    }

    setError('');
    const ok = await deleteWorkspaceCredential({
      workspaceId,
      name,
      token: accessToken,
      setToken: setAccessToken,
    });

    if (!ok) {
      setError(`Failed to delete credential ${name}`);
      return;
    }

    await loadData();
  };

  const handleRotateCredential = async (credentialId: string) => {
    if (!accessToken || !workspaceId) {
      return;
    }

    setSelectedCredentialForRotate(credentialId);
    setImpactLoading(true);
    setShowImpactModal(true);

    try {
      const data = await getCredentialDependents({
        credentialId,
        token: accessToken,
        setToken: setAccessToken,
      });

      if (data) {
        setImpactData(data);
      } else {
        setError('Failed to load credential dependencies');
      }
    } catch (err) {
      console.error('Failed to load credential dependents:', err);
      setError('Failed to load credential dependencies');
    } finally {
      setImpactLoading(false);
    }
  };

  const proceedWithRotation = async () => {
    if (!selectedCredentialForRotate) {
      return;
    }

    const credential = credentials.find((c) => c.name === selectedCredentialForRotate);
    if (!credential) {
      return;
    }

    setShowImpactModal(false);
    // Prompt user to enter new value
    const newValue = prompt(`Enter new credential value for ${credential.name}:`);
    if (!newValue) {
      return;
    }

    setSavingConnector(credential.name);
    try {
      const ok = await upsertWorkspaceCredential({
        workspaceId: workspaceId!,
        name: credential.name,
        value: newValue,
        token: accessToken!,
        setToken: setAccessToken,
      });

      if (!ok) {
        setError(`Failed to rotate credential ${credential.name}`);
        return;
      }

      setSuccess(`Successfully rotated credential for ${credential.name}`);
      await loadData();
    } finally {
      setSavingConnector('');
      setSelectedCredentialForRotate(null);
      setImpactData(null);
    }
  };

  const credentialRows = credentials.slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <div className="page-hd">
        <div>
          <div className="page-title">VaultGuard</div>
          <div className="page-sub">Install connectors with OAuth2 or API keys and manage workspace credentials</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => void loadData()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error mb-16">{error}</div>}
      {success && <div className="alert alert-success mb-16">{success}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-hd">
          <div className="card-title">Connector installation</div>
          <span className="badge b-accent" style={{ fontSize: 10 }}>{selectedCatalogItem ? selectedCatalogItem.auth : 'select a connector'}</span>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 6, color: '#666' }}>Connector</label>
              <select
                value={selectedConnector}
                onChange={(event) => handleSelectConnector(event.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6 }}
              >
                <option value="">Choose a connector</option>
                {catalogByConnector.map((item) => (
                  <option key={item.connector} value={item.connector}>
                    {item.connector} — {item.auth}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 6, color: '#666' }}>Secret name</label>
              <input
                type="text"
                value={secretName}
                onChange={(event) => setSecretName(event.target.value)}
                placeholder="Connector name or custom alias"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6 }}
              />
            </div>
          </div>

          {selectedCatalogItem?.auth === 'oauth2' ? (
            <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <div style={{ color: '#666', fontSize: 13 }}>
                This connector uses OAuth2. PulseGrid will redirect you to the provider and return to the dashboard after approval.
              </div>
              <button className="btn btn-primary" onClick={() => handleOAuthInstall(selectedConnector)} disabled={!workspaceId}>
                Install with OAuth2
              </button>
            </div>
          ) : selectedCatalogItem ? (
            <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 6, color: '#666' }}>Secret value</label>
                <textarea
                  value={secretValue}
                  onChange={(event) => setSecretValue(event.target.value)}
                  placeholder="Paste the API key or token here"
                  rows={5}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, resize: 'vertical' }}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={() => void handleSaveCredential()}
                disabled={!workspaceId || !selectedConnector || !secretValue.trim() || savingConnector === selectedConnector}
              >
                {savingConnector === selectedConnector ? 'Saving…' : 'Save API key'}
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 16, color: '#666' }}>Pick a connector to begin installation.</div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-hd">
          <div className="card-title">OAuth installations</div>
          <span className="badge b-neutral" style={{ fontFamily: 'JetBrains Mono', fontSize: 10 }}>{oauthInstallations.length}</span>
        </div>
        {oauthInstallations.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No OAuth connectors installed yet</div>
            <div className="empty-sub">Use the installation panel above to connect a provider.</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Connector</th>
                <th>Provider</th>
                <th>Scope</th>
                <th>Connected</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {oauthInstallations.map((installation) => (
                <tr key={`${installation.connector}-${installation.connectedAt}`}>
                  <td style={{ fontWeight: 600 }}>{installation.connector}</td>
                  <td>{installation.provider}</td>
                  <td style={{ fontSize: 12, color: '#666' }}>{installation.scope || '—'}</td>
                  <td style={{ fontSize: 12, color: '#666' }}>{new Date(installation.connectedAt).toLocaleString()}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleOAuthInstall(installation.connector)}>
                      Reconnect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-hd">
          <div className="card-title">Stored credentials</div>
          <span className="badge b-neutral" style={{ fontFamily: 'JetBrains Mono', fontSize: 10 }}>{credentialRows.length}</span>
        </div>
        {credentialRows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No API keys stored yet</div>
            <div className="empty-sub">Select an API-key connector above and paste the secret to save it.</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Connector</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {credentialRows.map((credential) => (
                <tr key={credential.name}>
                  <td style={{ fontWeight: 600 }}>{credential.name}</td>
                  <td style={{ fontSize: 12, color: '#666' }}>{credential.updated_at ? new Date(credential.updated_at).toLocaleString() : '—'}</td>
                  <td style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => void handleRotateCredential(credential.name)}
                      disabled={impactLoading}
                    >
                      Rotate
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => void handleDeleteCredential(credential.name)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-title">Catalog overview</div>
          <span className="badge b-neutral" style={{ fontFamily: 'JetBrains Mono', fontSize: 10 }}>{credentialRows.length + oauthInstallations.length}</span>
        </div>
        {catalogByConnector.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No connectors loaded</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Connector</th>
                <th>Auth</th>
                <th>Action</th>
                <th>Status</th>
                <th>Install</th>
              </tr>
            </thead>
            <tbody>
              {catalogByConnector.map((item) => {
                const installed = item.auth === 'oauth2'
                  ? installedOAuthNames.has(item.connector.trim().toUpperCase())
                  : installedCredentialNames.has(item.connector.trim().toUpperCase());

                return (
                  <tr key={item.connector}>
                    <td style={{ fontWeight: 600 }}>{item.connector}</td>
                    <td><span className="badge b-accent">{item.auth}</span></td>
                    <td>{item.action}</td>
                    <td>{installed ? 'Installed' : 'Not installed'}</td>
                    <td>
                      {item.auth === 'oauth2' ? (
                        <button className="btn btn-primary btn-sm" onClick={() => handleOAuthInstall(item.connector)}>
                          Install
                        </button>
                      ) : item.auth === 'api_key' || item.auth === 'mixed' ? (
                        <button className="btn btn-primary btn-sm" onClick={() => handleSelectConnector(item.connector)}>
                          Add API key
                        </button>
                      ) : (
                        <span className="text-faint">No install needed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pendingOAuthConnectors.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-hd">
            <div className="card-title">Pending OAuth installs</div>
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {pendingOAuthConnectors.map((item) => (
              <button key={item.connector} className="btn btn-secondary" onClick={() => handleOAuthInstall(item.connector)}>
                Install {item.connector}
              </button>
            ))}
          </div>
        </div>
      )}

      {showImpactModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
          }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: 600 }}>
              Impact Preview: Credential Rotation
            </h2>

            {impactLoading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <p>Loading dependency information...</p>
              </div>
            ) : impactData ? (
              <>
                <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>
                    <span style={{ color: '#d97706' }}>⚠️ Warning:</span> Rotating this credential will affect the following flows:
                  </p>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>
                    Statistics
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '4px', border: '1px solid #dcfce7' }}>
                      <div style={{ fontSize: '12px', color: '#666' }}>Total Flows</div>
                      <div style={{ fontSize: '20px', fontWeight: 600, color: '#16a34a' }}>
                        {impactData.total_flows}
                      </div>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: '#fef2f2', borderRadius: '4px', border: '1px solid #fee2e2' }}>
                      <div style={{ fontSize: '12px', color: '#666' }}>Active Flows</div>
                      <div style={{ fontSize: '20px', fontWeight: 600, color: '#dc2626' }}>
                        {impactData.active_flows}
                      </div>
                    </div>
                  </div>
                </div>

                {impactData.flows.length > 0 ? (
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>
                      Affected Flows
                    </h3>
                    <div style={{ border: '1px solid #ddd', borderRadius: '4px', maxHeight: '300px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f9fafb' }}>
                            <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, borderBottom: '1px solid #ddd' }}>Flow Name</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, borderBottom: '1px solid #ddd' }}>Status</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, borderBottom: '1px solid #ddd' }}>Runs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {impactData.flows.map((flow) => (
                            <tr key={flow.flow_id} style={{ borderBottom: '1px solid #ddd' }}>
                              <td style={{ padding: '12px', fontSize: '13px' }}>{flow.flow_name}</td>
                              <td style={{ padding: '12px', fontSize: '12px' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '4px 8px',
                                  borderRadius: '3px',
                                  backgroundColor: flow.status === 'active' ? '#dbeafe' : '#f3f4f6',
                                  color: flow.status === 'active' ? '#0369a1' : '#666',
                                  fontSize: '11px',
                                  fontWeight: 500,
                                }}>
                                  {flow.status}
                                </span>
                              </td>
                              <td style={{ padding: '12px', fontSize: '13px', color: '#666' }}>
                                {flow.execution_count}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '4px', marginBottom: '20px' }}>
                    <p style={{ margin: 0, fontSize: '14px', color: '#166534' }}>
                      ✓ No flows are affected by this credential rotation
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: '#dc2626' }}>
                <p>Failed to load impact information. Please try again.</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowImpactModal(false);
                  setSelectedCredentialForRotate(null);
                  setImpactData(null);
                }}
                disabled={impactLoading}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={proceedWithRotation}
                disabled={impactLoading || !impactData}
              >
                Proceed with Rotation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
