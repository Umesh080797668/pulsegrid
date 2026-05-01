'use client';

import { useState, useEffect } from 'react';
import { Copy, Eye, EyeOff, Trash2, Plus } from 'lucide-react';
import { useDashboardStore } from '../../../lib/store';
import { createApiKey, listApiKeys, revokeApiKey, type ApiKey, type CreateApiKeyResponse } from '../../../lib/api';

export default function ApiKeysPage() {
  const { accessToken, workspaceId, setAccessToken } = useDashboardStore();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState<CreateApiKeyResponse | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokeLoading, setRevokeLoading] = useState<string | null>(null);

  const fetchKeys = async () => {
    if (!accessToken || !workspaceId) return;
    setLoading(true);
    try {
      const result = await listApiKeys({
        workspaceId,
        token: accessToken,
        setToken: setAccessToken,
      });
      if (result) setKeys(result);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchKeys();
  }, [accessToken, workspaceId]);

  const handleCreateKey = async () => {
    if (!accessToken || !workspaceId || !keyName.trim()) return;
    setLoading(true);
    try {
      const result = await createApiKey({
        workspaceId,
        name: keyName,
        token: accessToken,
        setToken: setAccessToken,
      });
      if (result) {
        setNewKey(result);
        setShowNewKey(true);
        setKeyName('');
        await fetchKeys();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!accessToken || !workspaceId) return;
    setRevokeLoading(keyId);
    try {
      const success = await revokeApiKey({
        workspaceId,
        keyId,
        token: accessToken,
        setToken: setAccessToken,
      });
      if (success) {
        setKeys(keys.filter(k => k.id !== keyId));
      }
    } finally {
      setRevokeLoading(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div>
      <div className="page-hd">
        <div>
          <div className="page-title">API Keys</div>
          <div className="page-sub">
            Create and manage API keys for programmatic access to PulseGrid
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-secondary"
            onClick={() => void fetchKeys()}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {newKey && (
        <div className="card" style={{ marginBottom: 20, borderColor: '#4ade80', borderWidth: 2 }}>
          <div className="card-hd">
            <div className="card-title">API Key Created Successfully</div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <div className="text-faint" style={{ marginBottom: 12 }}>
              Save this key now. You won't be able to see it again.
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                alignItems: 'center',
                background: '#f8f8f8',
                padding: '12px',
                borderRadius: '6px',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              <div
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                }}
              >
                {showNewKey ? newKey.key : `${newKey.key_prefix}...`}
              </div>
              <div style={{ display: 'grid', gridAutoFlow: 'column', gap: 8 }}>
                <button
                  onClick={() => setShowNewKey(!showNewKey)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#666',
                  }}
                >
                  {showNewKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  onClick={() => copyToClipboard(newKey.key, newKey.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: copiedId === newKey.id ? '#4ade80' : '#666',
                  }}
                >
                  {copiedId === newKey.id ? <Copy size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => setNewKey(null)}
              style={{ marginTop: 12 }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-hd">
          <div className="card-title">Create New Key</div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: 6, color: '#666' }}>
                Key Name
              </label>
              <input
                type="text"
                placeholder="e.g., Production API Key"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={() => void handleCreateKey()}
              disabled={loading || !keyName.trim()}
            >
              <Plus size={14} style={{ marginRight: 6 }} />
              {loading ? 'Creating…' : 'Create API Key'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-title">Active Keys</div>
        </div>
        {keys.length === 0 ? (
          <div style={{ padding: '16px 20px', color: '#999', textAlign: 'center' }}>
            No API keys created yet
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Name</th>
                <th style={{ textAlign: 'left' }}>Key</th>
                <th style={{ textAlign: 'left' }}>Created</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id}>
                  <td style={{ fontWeight: 500 }}>{key.name}</td>
                  <td>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        color: '#666',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      {key.key_prefix}***
                      <button
                        onClick={() => copyToClipboard(key.key_prefix, key.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: copiedId === key.id ? '#4ade80' : '#999',
                        }}
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  </td>
                  <td style={{ fontSize: '12px', color: '#999' }}>
                    {new Date(key.created_at || '').toLocaleDateString()}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      onClick={() => void handleRevoke(key.id)}
                      disabled={revokeLoading === key.id}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: revokeLoading === key.id ? 'default' : 'pointer',
                        color: '#f87171',
                        opacity: revokeLoading === key.id ? 0.6 : 1,
                      }}
                      title="Revoke API key"
                    >
                      <Trash2 size={14} />
                    </button>
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
