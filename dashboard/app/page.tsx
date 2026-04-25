'use client';

import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type Flow = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  run_count: number;
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
  const [events, setEvents] = useState<EventPayload[]>([]);
  const [error, setError] = useState('');
  const [authMsg, setAuthMsg] = useState('');

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
    if (!workspaceId) return;

    socket = io(wsUrl, { transports: ['websocket'] });
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
  }, [workspaceId, wsUrl]);

  useEffect(() => {
    if (token && refreshToken) {
      void loadConnectors();
    }
  }, [token, refreshToken]);

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
        <p className="muted">access token: {token ? 'active' : 'missing'} • refresh token: {refreshToken ? 'active' : 'missing'}</p>
        {error ? <p style={{ color: '#ff8f8f' }}>{error}</p> : null}
      </div>

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
