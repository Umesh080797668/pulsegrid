'use client';

import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type Flow = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  run_count: number;
  definition?: unknown;
};

type EventPayload = {
  id: string;
  tenant_id?: string;
  event_type?: string;
  timestamp?: string;
  data?: unknown;
};

type FlowRun = {
  id: string;
  status: 'success' | 'failed' | 'running' | string;
  started_at: string;
  completed_at?: string | null;
};

type ConnectorCatalogItem = {
  connector: string;
  action: string;
  category: string;
  auth: 'none' | 'bearer' | 'api_key' | 'oauth2' | 'mixed';
  required_input_fields: string[];
  optional_input_fields: string[];
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3000';
const LS_ACCESS = 'pulsegrid.accessToken';
const LS_REFRESH = 'pulsegrid.refreshToken';
const LS_WORKSPACE = 'pulsegrid.workspaceId';

type AuthMode = 'login' | 'register';

type WorkspaceCredential = {
  name: string;
  updated_at?: string | null;
};

export default function HomePage() {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [flows, setFlows] = useState<Flow[]>([]);
  const [runs, setRuns] = useState<FlowRun[]>([]);
  const [connectors, setConnectors] = useState<ConnectorCatalogItem[]>([]);
  const [credentials, setCredentials] = useState<WorkspaceCredential[]>([]);
  const [events, setEvents] = useState<EventPayload[]>([]);
  const [error, setError] = useState('');
  const [authMsg, setAuthMsg] = useState('');
  const [managementApiKey, setManagementApiKey] = useState(process.env.NEXT_PUBLIC_MANAGEMENT_API_KEY || '');

  const [editingFlowId, setEditingFlowId] = useState('');
  const [flowName, setFlowName] = useState('');
  const [flowDescription, setFlowDescription] = useState('');
  const [flowEnabled, setFlowEnabled] = useState(true);
  const [triggerConnector, setTriggerConnector] = useState('webhook');
  const [triggerEvent, setTriggerEvent] = useState('webhook');
  const [actionConnector, setActionConnector] = useState('custom');
  const [actionName, setActionName] = useState('call_api');
  const [actionInputJson, setActionInputJson] = useState('{\n  "endpoint_url": "https://httpbin.org/post",\n  "method": "POST",\n  "body": {"hello": "world"}\n}');
  const [definitionJson, setDefinitionJson] = useState('');
  const [formMsg, setFormMsg] = useState('');

  const [credentialName, setCredentialName] = useState('');
  const [credentialValue, setCredentialValue] = useState('');

  const wsUrl = useMemo(() => {
    try {
      const u = new URL(apiBase);
      return `${u.protocol}//${u.host}/events`;
    } catch {
      return 'http://127.0.0.1:3000/events';
    }
  }, []);

  useEffect(() => {
    const access = localStorage.getItem(LS_ACCESS) || '';
    const refresh = localStorage.getItem(LS_REFRESH) || '';
    const savedWorkspace = localStorage.getItem(LS_WORKSPACE) || '';
    setToken(access);
    setRefreshToken(refresh);
    setWorkspaceId(savedWorkspace);
  }, []);

  useEffect(() => {
    if (workspaceId) {
      localStorage.setItem(LS_WORKSPACE, workspaceId);
    }
  }, [workspaceId]);

  useEffect(() => {
    let socket: Socket | null = null;
    if (!workspaceId || !token) return;

    socket = io(wsUrl, {
      transports: ['websocket'],
      auth: {
        token: `Bearer ${token}`,
      },
    });
    socket.on('connect', () => {
      socket?.emit('join_workspace', { workspaceId });
    });
    socket.on('workspace_event', (payload: EventPayload) => {
      setEvents((prev) => [payload, ...prev].slice(0, 100));
    });

    return () => {
      if (socket) {
        socket.emit('leave_workspace', { workspaceId });
        socket.disconnect();
      }
    };
  }, [workspaceId, token, wsUrl]);

  useEffect(() => {
    if (token && refreshToken) {
      void loadConnectors();
    }
  }, [token, refreshToken]);

  useEffect(() => {
    if (!definitionJson) {
      setDefinitionJson(JSON.stringify(buildFlowDefinition(), null, 2));
    }
  }, []);

  const successRuns = runs.filter((run) => run.status === 'success').length;
  const failedRuns = runs.filter((run) => run.status === 'failed').length;

  async function authenticatedFetch(input: string, init: RequestInit = {}) {
    let response = await fetch(input, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status !== 401 || !refreshToken) {
      return response;
    }

    const refreshResp = await fetch(`${apiBase}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!refreshResp.ok) {
      return response;
    }

    const refreshed = await refreshResp.json() as { accessToken: string; refreshToken: string };
    setToken(refreshed.accessToken);
    setRefreshToken(refreshed.refreshToken);
    localStorage.setItem(LS_ACCESS, refreshed.accessToken);
    localStorage.setItem(LS_REFRESH, refreshed.refreshToken);

    response = await fetch(input, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${refreshed.accessToken}`,
      },
    });
    return response;
  }

  async function onAuthSubmit() {
    setAuthMsg('');
    setError('');

    if (!email || !password) {
      setAuthMsg('Email and password are required');
      return;
    }

    const endpoint = authMode === 'register' ? '/auth/register' : '/auth/login';
    const payload = authMode === 'register'
      ? { email, password, name: name || undefined }
      : { email, password };

    const res = await fetch(`${apiBase}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      setAuthMsg(`Auth failed (${res.status})`);
      return;
    }

    const data = await res.json() as { accessToken: string; refreshToken: string };
    setToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    localStorage.setItem(LS_ACCESS, data.accessToken);
    localStorage.setItem(LS_REFRESH, data.refreshToken);
    setAuthMsg(authMode === 'register' ? 'Account created' : 'Logged in');
  }

  async function onLogout() {
    if (refreshToken) {
      await fetch(`${apiBase}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    }
    setToken('');
    setRefreshToken('');
    localStorage.removeItem(LS_ACCESS);
    localStorage.removeItem(LS_REFRESH);
  }

  async function loadFlows() {
    setError('');
    if (!workspaceId || !token || !refreshToken) {
      setError('workspaceId and JWT token are required');
      return;
    }

    const [flowsRes, runsRes] = await Promise.all([
      authenticatedFetch(`${apiBase}/flows?workspaceId=${workspaceId}`),
      authenticatedFetch(`${apiBase}/flow-runs?workspaceId=${workspaceId}`),
    ]);

    if (!flowsRes.ok) {
      setError(`Failed to load flows (${flowsRes.status})`);
      return;
    }

    const flowsData = (await flowsRes.json()) as Flow[];
    setFlows(flowsData);

    if (runsRes.ok) {
      const runsData = (await runsRes.json()) as FlowRun[];
      setRuns(runsData);
    }

    await loadConnectors();
    await loadCredentials();
  }

  async function loadConnectors() {
    if (!token || !refreshToken) {
      return;
    }

    const res = await authenticatedFetch(`${apiBase}/connectors/catalog`);
    if (!res.ok) {
      return;
    }

    const data = await res.json() as { items?: ConnectorCatalogItem[] };
    setConnectors(data.items || []);

    if (data.items && data.items.length > 0 && actionConnector === 'custom') {
      const firstAction = data.items.find((item) => item.connector !== 'webhook' && item.connector !== 'schedule');
      if (firstAction) {
        setActionConnector(firstAction.connector);
        setActionName(firstAction.action);
      }
    }
  }

  async function loadCredentials() {
    if (!workspaceId || !managementApiKey || !token || !refreshToken) {
      return;
    }

    const res = await authenticatedFetch(`${apiBase}/workspaces/${workspaceId}/credentials`, {
      headers: {
        'x-management-api-key': managementApiKey,
      },
    });

    if (!res.ok) {
      return;
    }

    const data = (await res.json()) as WorkspaceCredential[];
    setCredentials(data);
  }

  function buildFlowDefinition() {
    const flowId = typeof crypto !== 'undefined' ? crypto.randomUUID() : `flow-${Date.now()}`;
    const stepId = typeof crypto !== 'undefined' ? crypto.randomUUID() : `step-${Date.now()}`;
    let parsedInput: Record<string, unknown> = {};
    try {
      parsedInput = JSON.parse(actionInputJson || '{}') as Record<string, unknown>;
    } catch {
      parsedInput = {};
    }

    const inputMapping = Object.fromEntries(
      Object.entries(parsedInput).map(([k, v]) => [k, JSON.stringify(v)]),
    );

    return {
      id: flowId,
      name: flowName || 'Untitled Flow',
      trigger: {
        connector: triggerConnector,
        event: triggerEvent,
        filters: [],
      },
      steps: [
        {
          id: stepId,
          type: 'action',
          connector: actionConnector,
          action: actionName,
          input_mapping: inputMapping,
          depends_on: [],
          retry_policy: {
            max_retries: 1,
            initial_backoff_ms: 500,
          },
        },
      ],
      error_policy: {
        on_failure: 'notify_owner',
      },
    };
  }

  function regenerateDefinition() {
    setDefinitionJson(JSON.stringify(buildFlowDefinition(), null, 2));
  }

  async function saveFlow() {
    setFormMsg('');
    setError('');

    if (!workspaceId) {
      setFormMsg('Workspace ID is required');
      return;
    }
    if (!flowName.trim()) {
      setFormMsg('Flow name is required');
      return;
    }

    let definition: unknown;
    try {
      definition = JSON.parse(definitionJson);
    } catch {
      setFormMsg('Definition JSON is invalid');
      return;
    }

    const payload = {
      workspaceId,
      name: flowName.trim(),
      description: flowDescription.trim() || undefined,
      definition,
      enabled: flowEnabled,
    };

    const path = editingFlowId ? `${apiBase}/flows/${editingFlowId}` : `${apiBase}/flows`;
    const method = editingFlowId ? 'PUT' : 'POST';
    const res = await authenticatedFetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      setFormMsg(`Failed to save flow (${res.status})`);
      return;
    }

    setFormMsg(editingFlowId ? 'Flow updated' : 'Flow created');
    setEditingFlowId('');
    await loadFlows();
  }

  function editFlow(flow: Flow) {
    setEditingFlowId(flow.id);
    setFlowName(flow.name);
    setFlowDescription(flow.description || '');
    setFlowEnabled(flow.enabled);

    if (flow.definition && typeof flow.definition === 'object') {
      setDefinitionJson(JSON.stringify(flow.definition, null, 2));
    }
  }

  async function removeFlow(flowId: string) {
    const res = await authenticatedFetch(`${apiBase}/flows/${flowId}`, { method: 'DELETE' });
    if (!res.ok) {
      setError(`Failed to delete flow (${res.status})`);
      return;
    }
    if (editingFlowId === flowId) {
      setEditingFlowId('');
    }
    await loadFlows();
  }

  async function saveCredential() {
    if (!workspaceId || !credentialName || !credentialValue) {
      setError('workspace, credential name and credential value are required');
      return;
    }
    if (!managementApiKey) {
      setError('Management API key is required for credentials operations');
      return;
    }

    const res = await authenticatedFetch(`${apiBase}/workspaces/${workspaceId}/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-management-api-key': managementApiKey,
      },
      body: JSON.stringify({ name: credentialName, value: credentialValue }),
    });

    if (!res.ok) {
      setError(`Failed to save credential (${res.status})`);
      return;
    }

    setCredentialValue('');
    await loadCredentials();
  }

  async function deleteCredential(name: string) {
    if (!workspaceId || !managementApiKey) {
      setError('workspace and management key are required');
      return;
    }

    const res = await authenticatedFetch(`${apiBase}/workspaces/${workspaceId}/credentials/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: {
        'x-management-api-key': managementApiKey,
      },
    });

    if (!res.ok) {
      setError(`Failed to delete credential (${res.status})`);
      return;
    }

    await loadCredentials();
  }

  return (
    <main>
      <h1>PulseGrid Dashboard</h1>
      <p className="muted">Phase 1 MVP: auth/session + flow list + analytics + live workspace feed</p>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginBottom: 8 }}>Auth Session</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={authMode}
            onChange={(e) => setAuthMode(e.target.value as AuthMode)}
            style={{ minWidth: 120 }}
          >
            <option value="login">Login</option>
            <option value="register">Register</option>
          </select>
          <input
            style={{ minWidth: 280 }}
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            style={{ minWidth: 220 }}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {authMode === 'register' ? (
            <input
              style={{ minWidth: 220 }}
              placeholder="Display name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          ) : null}
          <button onClick={onAuthSubmit}>{authMode === 'register' ? 'Create account' : 'Sign in'}</button>
          <button onClick={onLogout}>Logout</button>
        </div>
        {authMsg ? <p className="muted">{authMsg}</p> : null}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            style={{ minWidth: 360 }}
            placeholder="Workspace UUID"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
          />
          <button onClick={loadFlows}>Load Flows</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <input
            style={{ minWidth: 360 }}
            placeholder="Management API Key (for credentials)"
            value={managementApiKey}
            onChange={(e) => setManagementApiKey(e.target.value)}
          />
          <button onClick={loadCredentials}>Load Credentials</button>
        </div>
        <p className="muted">access token: {token ? 'active' : 'missing'} • refresh token: {refreshToken ? 'active' : 'missing'}</p>
        {error ? <p style={{ color: '#ff8f8f' }}>{error}</p> : null}
      </div>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Flow Builder (Create / Update)</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <input style={{ minWidth: 280 }} placeholder="Flow name" value={flowName} onChange={(e) => setFlowName(e.target.value)} />
          <input style={{ minWidth: 320 }} placeholder="Description" value={flowDescription} onChange={(e) => setFlowDescription(e.target.value)} />
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            enabled
            <input type="checkbox" checked={flowEnabled} onChange={(e) => setFlowEnabled(e.target.checked)} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <input style={{ minWidth: 220 }} placeholder="Trigger connector" value={triggerConnector} onChange={(e) => setTriggerConnector(e.target.value)} />
          <input style={{ minWidth: 220 }} placeholder="Trigger event" value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)} />
          <select value={actionConnector} onChange={(e) => setActionConnector(e.target.value)}>
            {connectors.map((item) => (
              <option key={`${item.connector}:${item.action}`} value={item.connector}>{item.connector}</option>
            ))}
          </select>
          <input style={{ minWidth: 220 }} placeholder="Action name" value={actionName} onChange={(e) => setActionName(e.target.value)} />
          <button onClick={regenerateDefinition}>Generate Definition</button>
        </div>
        <textarea
          value={actionInputJson}
          onChange={(e) => setActionInputJson(e.target.value)}
          placeholder="Action input JSON"
          rows={6}
          style={{ width: '100%', marginBottom: 8 }}
        />
        <textarea
          value={definitionJson}
          onChange={(e) => setDefinitionJson(e.target.value)}
          placeholder="Flow definition JSON"
          rows={14}
          style={{ width: '100%', marginBottom: 8 }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={saveFlow}>{editingFlowId ? 'Update Flow' : 'Create Flow'}</button>
          <button onClick={() => { setEditingFlowId(''); setFormMsg('Edit mode cleared'); }}>Clear Edit Mode</button>
        </div>
        {formMsg ? <p className="muted">{formMsg}</p> : null}
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Workspace Credentials</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <input style={{ minWidth: 220 }} placeholder="Credential Name" value={credentialName} onChange={(e) => setCredentialName(e.target.value)} />
          <input style={{ minWidth: 360 }} placeholder="Credential Value" value={credentialValue} onChange={(e) => setCredentialValue(e.target.value)} />
          <button onClick={saveCredential}>Save Credential</button>
        </div>
        <ul>
          {credentials.map((item) => (
            <li key={item.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <strong>{item.name}</strong>
                  <div className="muted">updated: {item.updated_at ? new Date(item.updated_at).toLocaleString() : '-'}</div>
                </div>
                <button onClick={() => deleteCredential(item.name)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid" style={{ marginBottom: 16 }}>
        <section className="panel">
          <h2>Analytics</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div><strong>{runs.length}</strong><div className="muted">total runs</div></div>
            <div><strong>{successRuns}</strong><div className="muted">successful</div></div>
            <div><strong>{failedRuns}</strong><div className="muted">failed</div></div>
          </div>
        </section>
        <section className="panel">
          <h2>Recent Runs</h2>
          <ul>
            {runs.slice(0, 8).map((run) => (
              <li key={run.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{run.status}</strong>
                  <span className="muted">{new Date(run.started_at).toLocaleString()}</span>
                </div>
                <div className="muted">id: {run.id}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid">
        <section className="panel">
          <h2>Flows</h2>
          <small>{flows.length} loaded</small>
          <ul>
            {flows.map((flow) => (
              <li key={flow.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{flow.name}</strong>
                  <span className="muted">{flow.enabled ? 'enabled' : 'disabled'}</span>
                </div>
                <div className="muted">runs: {flow.run_count}</div>
                {flow.description ? <div>{flow.description}</div> : null}
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button onClick={() => editFlow(flow)}>Edit</button>
                  <button onClick={() => removeFlow(flow.id)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Live Events</h2>
          <small>via websocket room workspace:{workspaceId || '...'}</small>
          <ul>
            {events.map((evt) => (
              <li key={evt.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{evt.event_type || 'event'}</strong>
                  <span className="muted">{evt.timestamp || ''}</span>
                </div>
                <div className="muted">id: {evt.id}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Connector Catalog</h2>
          <button onClick={loadConnectors}>Refresh Catalog</button>
        </div>
        <small>{connectors.length} connectors available in this build</small>
        <ul>
          {connectors.map((item) => (
            <li key={`${item.connector}:${item.action}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{item.connector}</strong>
                <span className="muted">{item.category} • {item.auth}</span>
              </div>
              <div className="muted">action: {item.action}</div>
              <div className="muted">required: {item.required_input_fields.join(', ') || '-'}</div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
