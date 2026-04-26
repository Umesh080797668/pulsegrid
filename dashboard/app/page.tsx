'use client';

import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { FlowCanvas } from '../components/flow-canvas';
import { motion, AnimatePresence } from 'framer-motion';

/* ─── Types ─── */
type Flow = { id: string; name: string; description?: string; enabled: boolean; run_count: number; definition?: unknown; };
type EventPayload = { id: string; tenant_id?: string; event_type?: string; timestamp?: string; data?: unknown; };
type FlowRun = { id: string; status: 'success' | 'failed' | 'running' | string; started_at: string; completed_at?: string | null; };
type ConnectorCatalogItem = { connector: string; action: string; category: string; auth: 'none' | 'bearer' | 'api_key' | 'oauth2' | 'mixed'; required_input_fields: string[]; optional_input_fields: string[]; };
type WorkspaceCredential = { name: string; updated_at?: string | null; };
type WorkspaceItem = { id: string; name: string; slug: string; plan: string; owner_user_id: string; settings?: Record<string, unknown>; created_at?: string | null; };
type AuthMode = 'login' | 'register';
type Tab = 'overview' | 'flows' | 'builder' | 'credentials' | 'connectors' | 'events';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3000';
const LS_ACCESS = 'pulsegrid.accessToken';
const LS_REFRESH = 'pulsegrid.refreshToken';
const LS_WORKSPACE = 'pulsegrid.workspaceId';

/* ─── Framer variants ─── */
const fadeUp = {
  initial:   { opacity: 0, y: 14 },
  animate:   { opacity: 1, y: 0 },
  exit:      { opacity: 0, y: -8 },
  transition: { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
};
const stagger = { animate: { transition: { staggerChildren: 0.06 } } };
const statItem = {
  initial: { opacity: 0, y: 20, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
};

/* ─── Icon Component ─── */
function Ic({ n, s = 15 }: { n: string; s?: number }) {
  const p: Record<string, string> = {
    grid:      'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
    zap:       'M13 2 3 14h9l-1 8 10-12h-9z',
    tool:      'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
    key:       'm21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4',
    plug:      'M12 22v-5M9 8V2M15 8V2M18 8H6a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2z',
    activity:  'M22 12h-4l-3 9L9 3l-3 9H2',
    logout:    'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    plus:      'M12 5v14M5 12h14',
    edit:      'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
    trash:     'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
    refresh:   'M1 4v6h6M3.51 15a9 9 0 1 0 .49-4.63',
    check:     'M20 6 9 17l-5-5',
    save:      'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
    settings:  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    workspace: 'M2 3h20v14H2zM8 21h8M12 17v4',
    x:         'M18 6 6 18M6 6l12 12',
    shield:    'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    cpu:       'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18',
    layers:    'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={p[n] || ''} />
    </svg>
  );
}

/* ─── Status Badge ─── */
function RunBadge({ status }: { status: string }) {
  const cls = status === 'success' ? 'b-success' : status === 'failed' ? 'b-error' : 'b-running';
  return <span className={`badge ${cls}`}><span className="badge-dot" />{status}</span>;
}

/* ─── Stat Card ─── */
function StatCard({ icon, label, value, hint, color, bg, delay = 0 }: {
  icon: string; label: string; value: string | number; hint: React.ReactNode;
  color: string; bg: string; delay?: number;
}) {
  return (
    <motion.div
      className="stat-card"
      variants={statItem}
      whileHover={{ y: -2 }}
    >
      <div className="stat-card-shimmer" />
      <div className="stat-icon" style={{ background: bg, color }}>
        <Ic n={icon} s={16} />
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-val" style={{ color }}>{value}</div>
      <div className="stat-hint">{hint}</div>
    </motion.div>
  );
}

export default function HomePage() {
  const [activeTab, setActiveTab]           = useState<Tab>('overview');
  const [authMode, setAuthMode]             = useState<AuthMode>('login');
  const [email, setEmail]                   = useState('');
  const [password, setPassword]             = useState('');
  const [name, setName]                     = useState('');
  const [token, setToken]                   = useState('');
  const [refreshToken, setRefreshToken]     = useState('');
  const [workspaceId, setWorkspaceId]       = useState('');
  const [workspaces, setWorkspaces]         = useState<WorkspaceItem[]>([]);
  const [flows, setFlows]                   = useState<Flow[]>([]);
  const [runs, setRuns]                     = useState<FlowRun[]>([]);
  const [connectors, setConnectors]         = useState<ConnectorCatalogItem[]>([]);
  const [credentials, setCredentials]       = useState<WorkspaceCredential[]>([]);
  const [events, setEvents]                 = useState<EventPayload[]>([]);
  const [error, setError]                   = useState('');
  const [authMsg, setAuthMsg]               = useState('');
  const [managementApiKey, setManagementApiKey] = useState(process.env.NEXT_PUBLIC_MANAGEMENT_API_KEY || '');
  const [editingFlowId, setEditingFlowId]   = useState('');
  const [flowName, setFlowName]             = useState('');
  const [flowDescription, setFlowDescription] = useState('');
  const [flowEnabled, setFlowEnabled]       = useState(true);
  const [triggerConnector, setTriggerConnector] = useState('webhook');
  const [triggerEvent, setTriggerEvent]     = useState('webhook');
  const [actionConnector, setActionConnector] = useState('custom');
  const [actionName, setActionName]         = useState('call_api');
  const [actionInputJson, setActionInputJson] = useState('{\n  "endpoint_url": "https://httpbin.org/post",\n  "method": "POST",\n  "body": {"hello": "world"}\n}');
  const [definitionJson, setDefinitionJson] = useState('');
  const [formMsg, setFormMsg]               = useState('');
  const [workspaceName, setWorkspaceName]   = useState('');
  const [workspaceSlug, setWorkspaceSlug]   = useState('');
  const [workspaceSettingsJson, setWorkspaceSettingsJson] = useState('{\n  "region": "local"\n}');
  const [workspaceMsg, setWorkspaceMsg]     = useState('');
  const [credentialName, setCredentialName] = useState('');
  const [credentialValue, setCredentialValue] = useState('');
  const [showNewWs, setShowNewWs]           = useState(false);

  const wsUrl = useMemo(() => {
    try { const u = new URL(apiBase); return `${u.protocol}//${u.host}/events`; }
    catch { return 'http://127.0.0.1:3000/events'; }
  }, []);

  useEffect(() => {
    const access = localStorage.getItem(LS_ACCESS) || '';
    const refresh = localStorage.getItem(LS_REFRESH) || '';
    const saved   = localStorage.getItem(LS_WORKSPACE) || '';
    setToken(access); setRefreshToken(refresh); setWorkspaceId(saved);
  }, []);

  useEffect(() => { if (workspaceId) localStorage.setItem(LS_WORKSPACE, workspaceId); }, [workspaceId]);

  useEffect(() => {
    let socket: Socket | null = null;
    if (!workspaceId || !token) return;
    socket = io(wsUrl, { transports: ['websocket'], auth: { token: `Bearer ${token}` } });
    socket.on('connect', () => { socket?.emit('join_workspace', { workspaceId }); });
    socket.on('workspace_event', (p: EventPayload) => setEvents(prev => [p, ...prev].slice(0, 100)));
    return () => { if (socket) { socket.emit('leave_workspace', { workspaceId }); socket.disconnect(); } };
  }, [workspaceId, token, wsUrl]);

  useEffect(() => {
    if (token && refreshToken) { void loadConnectors(); void loadWorkspaces(); }
  }, [token, refreshToken]);

  useEffect(() => { if (!definitionJson) setDefinitionJson(JSON.stringify(buildFlowDefinition(), null, 2)); }, []);

  useEffect(() => {
    if (!token || !refreshToken || !workspaceId) return;
    if (activeTab === 'flows')       void loadFlows();
    if (activeTab === 'credentials') void loadCredentials();
    if (activeTab === 'connectors')  void loadConnectors();
  }, [activeTab, workspaceId]);

  const successRuns  = runs.filter(r => r.status === 'success').length;
  const failedRuns   = runs.filter(r => r.status === 'failed').length;
  const successRate  = runs.length > 0 ? Math.round((successRuns / runs.length) * 100) : 0;

  async function authenticatedFetch(input: string, init: RequestInit = {}) {
    let res = await fetch(input, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
    if (res.status !== 401 || !refreshToken) return res;
    const rr = await fetch(`${apiBase}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
    if (!rr.ok) return res;
    const rd = await rr.json() as { accessToken: string; refreshToken: string };
    setToken(rd.accessToken); setRefreshToken(rd.refreshToken);
    localStorage.setItem(LS_ACCESS, rd.accessToken); localStorage.setItem(LS_REFRESH, rd.refreshToken);
    return fetch(input, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${rd.accessToken}` } });
  }

  async function onAuthSubmit() {
    setAuthMsg(''); setError('');
    if (!email || !password) { setAuthMsg('Email and password are required'); return; }
    const endpoint = authMode === 'register' ? '/auth/register' : '/auth/login';
    const payload  = authMode === 'register' ? { email, password, name: name || undefined } : { email, password };
    const res = await fetch(`${apiBase}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) { setAuthMsg(`Authentication failed (${res.status})`); return; }
    const data = await res.json() as { accessToken: string; refreshToken: string };
    setToken(data.accessToken); setRefreshToken(data.refreshToken);
    localStorage.setItem(LS_ACCESS, data.accessToken); localStorage.setItem(LS_REFRESH, data.refreshToken);
    setAuthMsg(authMode === 'register' ? 'Account created successfully' : 'Signed in successfully');
  }

  async function onLogout() {
    if (refreshToken) await fetch(`${apiBase}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
    setToken(''); setRefreshToken('');
    localStorage.removeItem(LS_ACCESS); localStorage.removeItem(LS_REFRESH);
  }

  async function loadFlows() {
    setError('');
    if (!workspaceId || !token || !refreshToken) { setError('Select a workspace first'); return; }
    const [fr, rr] = await Promise.all([
      authenticatedFetch(`${apiBase}/flows?workspaceId=${workspaceId}`),
      authenticatedFetch(`${apiBase}/flow-runs?workspaceId=${workspaceId}`),
    ]);
    if (!fr.ok) { setError(`Failed to load flows (${fr.status})`); return; }
    setFlows((await fr.json()) as Flow[]);
    if (rr.ok) setRuns((await rr.json()) as FlowRun[]);
    await loadConnectors(); await loadCredentials();
  }

  async function loadWorkspaces() {
    if (!token || !refreshToken) return;
    const res = await authenticatedFetch(`${apiBase}/workspaces`);
    if (!res.ok) return;
    const data = (await res.json()) as WorkspaceItem[];
    setWorkspaces(data);
    if (!workspaceId && data.length > 0) setWorkspaceId(data[0].id);
  }

  async function createWorkspace() {
    setWorkspaceMsg('');
    if (!workspaceName.trim()) { setWorkspaceMsg('Workspace name is required'); return; }
    let settings: Record<string, unknown> = {};
    try { settings = workspaceSettingsJson.trim() ? JSON.parse(workspaceSettingsJson) : {}; }
    catch { setWorkspaceMsg('Invalid settings JSON'); return; }
    const res = await authenticatedFetch(`${apiBase}/workspaces`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: workspaceName.trim(), slug: workspaceSlug.trim() || undefined, settings }),
    });
    if (!res.ok) { setWorkspaceMsg(`Failed to create workspace (${res.status})`); return; }
    const created = await res.json() as WorkspaceItem;
    setWorkspaceMsg('Workspace created successfully');
    setWorkspaceId(created.id); setWorkspaceName(''); setWorkspaceSlug('');
    setShowNewWs(false);
    await loadWorkspaces();
  }

  async function loadConnectors() {
    if (!token || !refreshToken) return;
    const res = await authenticatedFetch(`${apiBase}/connectors/catalog`);
    if (!res.ok) return;
    const data = await res.json() as { items?: ConnectorCatalogItem[] };
    setConnectors(data.items || []);
    if (data.items && data.items.length > 0 && actionConnector === 'custom') {
      const first = data.items.find(i => i.connector !== 'webhook' && i.connector !== 'schedule');
      if (first) { setActionConnector(first.connector); setActionName(first.action); }
    }
  }

  async function loadCredentials() {
    if (!workspaceId || !managementApiKey || !token || !refreshToken) return;
    const res = await authenticatedFetch(`${apiBase}/workspaces/${workspaceId}/credentials`, { headers: { 'x-management-api-key': managementApiKey } });
    if (!res.ok) return;
    setCredentials((await res.json()) as WorkspaceCredential[]);
  }

  function buildFlowDefinition() {
    const flowId = typeof crypto !== 'undefined' ? crypto.randomUUID() : `flow-${Date.now()}`;
    const stepId = typeof crypto !== 'undefined' ? crypto.randomUUID() : `step-${Date.now()}`;
    let parsedInput: Record<string, unknown> = {};
    try { parsedInput = JSON.parse(actionInputJson || '{}') as Record<string, unknown>; } catch { parsedInput = {}; }
    const inputMapping = Object.fromEntries(Object.entries(parsedInput).map(([k, v]) => [k, JSON.stringify(v)]));
    return {
      id: flowId, name: flowName || 'Untitled Flow',
      trigger: { connector: triggerConnector, event: triggerEvent, filters: [] },
      steps: [{ id: stepId, type: 'action' as const, connector: actionConnector, action: actionName, input_mapping: inputMapping, depends_on: [], retry_policy: { max_retries: 1, initial_backoff_ms: 500 } }],
      error_policy: { on_failure: 'notify_owner' },
    };
  }

  function regenerateDefinition() { setDefinitionJson(JSON.stringify(buildFlowDefinition(), null, 2)); }

  async function saveFlow() {
    setFormMsg(''); setError('');
    if (!workspaceId) { setFormMsg('Select a workspace first'); return; }
    if (!flowName.trim()) { setFormMsg('Flow name is required'); return; }
    let definition: unknown;
    try { definition = JSON.parse(definitionJson); } catch { setFormMsg('Definition JSON is invalid'); return; }
    const payload: any = { workspaceId, name: flowName.trim(), description: flowDescription.trim() || undefined, definition };
    if (editingFlowId) payload.enabled = flowEnabled;
    const path = editingFlowId ? `${apiBase}/flows/${editingFlowId}` : `${apiBase}/flows`;
    const res = await authenticatedFetch(path, { method: editingFlowId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) { setFormMsg(`Failed to save flow (${res.status})`); return; }
    setFormMsg(editingFlowId ? 'Flow updated successfully' : 'Flow created successfully');
    setEditingFlowId(''); await loadFlows();
  }

  function editFlow(flow: Flow) {
    setEditingFlowId(flow.id); setFlowName(flow.name);
    setFlowDescription(flow.description || ''); setFlowEnabled(flow.enabled);
    if (flow.definition && typeof flow.definition === 'object') setDefinitionJson(JSON.stringify(flow.definition, null, 2));
    setActiveTab('builder');
  }

  async function removeFlow(flowId: string) {
    const res = await authenticatedFetch(`${apiBase}/flows/${flowId}`, { method: 'DELETE' });
    if (!res.ok) { setError(`Failed to delete flow (${res.status})`); return; }
    if (editingFlowId === flowId) setEditingFlowId('');
    await loadFlows();
  }

  async function saveCredential() {
    if (!workspaceId || !credentialName || !credentialValue) { setError('Workspace, name and value are required'); return; }
    if (!managementApiKey) { setError('Management API key is required'); return; }
    const res = await authenticatedFetch(`${apiBase}/workspaces/${workspaceId}/credentials`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-management-api-key': managementApiKey },
      body: JSON.stringify({ name: credentialName, value: credentialValue }),
    });
    if (!res.ok) { setError(`Failed to save credential (${res.status})`); return; }
    setCredentialValue(''); await loadCredentials();
  }

  async function deleteCredential(n: string) {
    if (!workspaceId || !managementApiKey) { setError('Workspace and management key are required'); return; }
    const res = await authenticatedFetch(`${apiBase}/workspaces/${workspaceId}/credentials/${encodeURIComponent(n)}`, {
      method: 'DELETE', headers: { 'x-management-api-key': managementApiKey },
    });
    if (!res.ok) { setError(`Failed to delete credential (${res.status})`); return; }
    await loadCredentials();
  }

  /* ─────────────────────────── AUTH SCREEN ─────────────────────────────── */
  if (!token || !refreshToken) {
    return (
      <div className="auth-screen">
        <div className="auth-bg" />
        <div className="auth-grid" />
        <motion.div
          className="auth-card"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div className="auth-logo">
            <motion.div
              className="auth-logo-icon"
              animate={{ boxShadow: ['0 0 20px rgba(90,125,255,0.3)', '0 0 36px rgba(90,125,255,0.5)', '0 0 20px rgba(90,125,255,0.3)'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Ic n="zap" s={22} />
            </motion.div>
            <span className="auth-logo-text">PulseGrid</span>
            <div className="auth-tagline">Automation infrastructure for modern teams</div>
          </div>

          <div className="auth-tabs">
            <button className={`auth-tab${authMode === 'login' ? ' active' : ''}`} onClick={() => setAuthMode('login')}>Sign in</button>
            <button className={`auth-tab${authMode === 'register' ? ' active' : ''}`} onClick={() => setAuthMode('register')}>Create account</button>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={authMode}
              initial={{ opacity: 0, x: authMode === 'login' ? -8 : 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: authMode === 'login' ? 8 : -8 }}
              transition={{ duration: 0.18 }}
              className="auth-form-stack"
            >
              <div className="form-group">
                <label className="form-label">Email address</label>
                <input className="form-input" type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && onAuthSubmit()} />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="form-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && onAuthSubmit()} />
              </div>
              {authMode === 'register' && (
                <div className="form-group">
                  <label className="form-label">Display name <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span></label>
                  <input className="form-input" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {authMsg && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`alert ${authMsg.includes('failed') || authMsg.includes('required') ? 'alert-error' : 'alert-success'}`}
            >
              {authMsg}
            </motion.div>
          )}

          <motion.button
            className="btn btn-primary w-full"
            style={{ justifyContent: 'center', padding: '11px', fontSize: '14px', fontWeight: 600 }}
            onClick={onAuthSubmit}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            {authMode === 'register' ? 'Create account' : 'Sign in to PulseGrid'}
          </motion.button>
        </motion.div>
      </div>
    );
  }

  const currentWs = workspaces.find(w => w.id === workspaceId);

  const navItems: { tab: Tab; icon: string; label: string; count?: number }[] = [
    { tab: 'overview',    icon: 'grid',     label: 'Overview' },
    { tab: 'flows',       icon: 'zap',      label: 'Flows',       count: flows.length || undefined },
    { tab: 'builder',     icon: 'tool',     label: 'Flow Builder' },
    { tab: 'credentials', icon: 'key',      label: 'Credentials', count: credentials.length || undefined },
    { tab: 'connectors',  icon: 'plug',     label: 'Connectors',  count: connectors.length || undefined },
    { tab: 'events',      icon: 'activity', label: 'Live Events', count: events.length || undefined },
  ];

  /* ─────────────────────────── MAIN LAYOUT ─────────────────────────────── */
  return (
    <div className="layout">
      <div className="pg-ambient" />
      <div className="pg-grid" />

      {/* ── Sidebar ── */}
      <motion.aside
        className="sidebar"
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon"><Ic n="zap" s={14} /></div>
          <span className="sidebar-logo-text">PulseGrid</span>
        </div>

        <nav className="sidebar-nav" style={{ paddingTop: 14 }}>
          {navItems.map((item, i) => (
            <motion.button
              key={item.tab}
              className={`nav-item${activeTab === item.tab ? ' active' : ''}`}
              onClick={() => setActiveTab(item.tab)}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 + 0.1, duration: 0.25 }}
              whileHover={{ x: 1 }}
            >
              <Ic n={item.icon} s={14} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.count !== undefined && <span className="nav-badge">{item.count}</span>}
            </motion.button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="ws-label">Workspace</div>
          {workspaces.length === 0 && (
            <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text-3)' }}>No workspaces yet</div>
          )}
          {workspaces.map(ws => (
            <button key={ws.id} className={`ws-pill${ws.id === workspaceId ? ' active' : ''}`} onClick={() => setWorkspaceId(ws.id)}>
              <div className="ws-avatar">{ws.name.slice(0, 2).toUpperCase()}</div>
              <span className="ws-name">{ws.name}</span>
            </button>
          ))}
          <div className="divider" />
          <button
            className="nav-item"
            style={{ color: 'var(--error)', opacity: 0.8 }}
            onClick={onLogout}
          >
            <Ic n="logout" s={14} />
            Sign out
          </button>
        </div>
      </motion.aside>

      {/* ── Main area ── */}
      <div className="main-area">

        {/* Topbar */}
        <header className="topbar">
          <div className="tb-breadcrumb">
            <span className="tb-title">{navItems.find(n => n.tab === activeTab)?.label}</span>
            {currentWs && (
              <>
                <span className="tb-sep">/</span>
                <span className="tb-sub">{currentWs.name}</span>
              </>
            )}
          </div>
          <div className="tb-right">
            {error && (
              <span style={{ fontSize: 12, color: 'var(--error)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {error}
              </span>
            )}
            <div className="token-pill">
              <div className={`tdot ${token ? 'ok' : 'bad'}`} />
              <span>{token ? 'Authenticated' : 'No session'}</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="content">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} {...fadeUp}>

              {/* ══════════ OVERVIEW ══════════ */}
              {activeTab === 'overview' && (
                <div>
                  <div className="page-hd">
                    <div className="page-header-left">
                      <div className="page-title">Overview</div>
                      <div className="page-sub">Your automation platform at a glance</div>
                    </div>
                    <div className="page-actions">
                      <button className="btn btn-secondary" onClick={loadFlows}><Ic n="refresh" s={13} />Refresh</button>
                      <motion.button
                        className="btn btn-primary"
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={() => { setEditingFlowId(''); setFlowName(''); setActiveTab('builder'); }}
                      >
                        <Ic n="plus" s={13} />New Flow
                      </motion.button>
                    </div>
                  </div>

                  {/* Stat Cards */}
                  <motion.div className="stat-grid" variants={stagger} initial="initial" animate="animate">
                    <StatCard icon="zap"      label="Total Flows"   value={flows.length}
                      hint={`${flows.filter(f => f.enabled).length} enabled`}
                      color="var(--accent)"   bg="rgba(90,125,255,0.12)" />
                    <StatCard icon="activity" label="Total Runs"    value={runs.length}
                      hint="all time"
                      color="var(--warning)"  bg="rgba(245,158,11,0.10)" />
                    <StatCard icon="check"    label="Success Rate"
                      value={runs.length > 0 ? `${successRate}%` : '—'}
                      hint={`${successRuns} ok · ${failedRuns} failed`}
                      color={runs.length === 0 ? 'var(--text-2)' : successRate >= 80 ? 'var(--success)' : 'var(--warning)'}
                      bg="rgba(34,214,116,0.09)" />
                    <StatCard icon="cpu"      label="Live Events"   value={events.length}
                      hint={<><span className="live-dot" style={{ display: 'inline-block', marginRight: 4 }} />streaming</>}
                      color="var(--success)"  bg="rgba(34,214,116,0.09)" />
                  </motion.div>

                  <div className="two-col">
                    {/* Recent Runs */}
                    <div className="card">
                      <div className="card-hd">
                        <div className="card-title"><Ic n="activity" s={13} />Recent Runs</div>
                        {runs.length > 0 && (
                          <span className="badge b-neutral" style={{ fontFamily: 'JetBrains Mono', fontSize: 10 }}>{runs.length}</span>
                        )}
                      </div>
                      {runs.length === 0 ? (
                        <div className="empty-state">
                          <div className="empty-icon"><Ic n="activity" s={18} /></div>
                          <div className="empty-title">No runs yet</div>
                          <div className="empty-sub">Flow execution history will appear here</div>
                        </div>
                      ) : (
                        <table>
                          <thead><tr><th>Status</th><th>Run ID</th><th>Started</th></tr></thead>
                          <tbody>
                            {runs.slice(0, 8).map(run => (
                              <tr key={run.id}>
                                <td><RunBadge status={run.status} /></td>
                                <td><span className="font-mono text-faint" style={{ fontSize: 11 }}>{run.id.slice(0, 12)}…</span></td>
                                <td><span className="text-muted" style={{ fontSize: 12 }}>{new Date(run.started_at).toLocaleString()}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Live Events */}
                    <div className="card">
                      <div className="card-hd">
                        <div className="card-title"><Ic n="activity" s={13} />Live Events</div>
                        <span className="live-badge"><span className="live-dot" />Live</span>
                      </div>
                      <div style={{ padding: '4px 20px', maxHeight: 300, overflowY: 'auto' }}>
                        {events.length === 0 ? (
                          <div className="empty-state">
                            <div className="empty-icon"><Ic n="activity" s={18} /></div>
                            <div className="empty-title">Waiting for events…</div>
                            <div className="empty-sub">Events will appear here in real time via WebSocket</div>
                          </div>
                        ) : events.slice(0, 12).map(evt => (
                          <div key={evt.id} className="event-item">
                            <div>
                              <div className="event-type">{evt.event_type || 'event'}</div>
                              <div className="event-id">{evt.id.slice(0, 20)}…</div>
                            </div>
                            <div className="text-xs text-faint" style={{ whiteSpace: 'nowrap', marginTop: 2 }}>{evt.timestamp || ''}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ══════════ FLOWS ══════════ */}
              {activeTab === 'flows' && (
                <div>
                  <div className="page-hd">
                    <div>
                      <div className="page-title">Flows</div>
                      <div className="page-sub">{flows.length} flows in this workspace</div>
                    </div>
                    <div className="page-actions">
                      <button className="btn btn-secondary" onClick={loadFlows}><Ic n="refresh" s={13} />Refresh</button>
                      <motion.button
                        className="btn btn-primary"
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setEditingFlowId(''); setFlowName(''); setFlowDescription(''); setFlowEnabled(true);
                          setDefinitionJson(JSON.stringify(buildFlowDefinition(), null, 2)); setActiveTab('builder');
                        }}
                      >
                        <Ic n="plus" s={13} />New Flow
                      </motion.button>
                    </div>
                  </div>
                  {error && <div className="alert alert-error mb-16"><Ic n="x" s={13} />{error}</div>}
                  <div className="card">
                    {flows.length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-icon"><Ic n="zap" s={20} /></div>
                        <div className="empty-title">No flows yet</div>
                        <div className="empty-sub">Create your first automation flow to get started</div>
                        <button className="btn btn-primary" onClick={() => setActiveTab('builder')}><Ic n="plus" s={13} />Create your first flow</button>
                      </div>
                    ) : (
                      <table>
                        <thead><tr><th>Name</th><th>Status</th><th>Runs</th><th>Description</th><th>Actions</th></tr></thead>
                        <tbody>
                          {flows.map(flow => (
                            <tr key={flow.id}>
                              <td style={{ fontWeight: 600 }}>{flow.name}</td>
                              <td>
                                <span className={`badge ${flow.enabled ? 'b-success' : 'b-neutral'}`}>
                                  <span className="badge-dot" />{flow.enabled ? 'Enabled' : 'Disabled'}
                                </span>
                              </td>
                              <td><span className="font-mono text-muted" style={{ fontSize: 12 }}>{flow.run_count}</span></td>
                              <td><span className="text-muted truncate" style={{ maxWidth: 200, display: 'block' }}>{flow.description || '—'}</span></td>
                              <td>
                                <div className="flex gap-6">
                                  <button className="btn btn-secondary btn-sm" onClick={() => editFlow(flow)}><Ic n="edit" s={12} />Edit</button>
                                  <button className="btn btn-danger btn-sm" onClick={() => removeFlow(flow.id)}><Ic n="trash" s={12} /></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* ══════════ BUILDER ══════════ */}
              {activeTab === 'builder' && (
                <div>
                  <div className="page-hd">
                    <div>
                      <div className="page-title">{editingFlowId ? 'Edit Flow' : 'Create Flow'}</div>
                      <div className="page-sub">{editingFlowId ? `Editing · ${editingFlowId.slice(0, 16)}…` : 'Build a new automation flow'}</div>
                    </div>
                    <div className="page-actions">
                      {editingFlowId && (
                        <button className="btn btn-secondary" onClick={() => { setEditingFlowId(''); setFlowName(''); setFlowDescription(''); setFlowEnabled(true); setFormMsg(''); }}>
                          <Ic n="x" s={13} />Clear Edit
                        </button>
                      )}
                      <motion.button className="btn btn-primary" onClick={saveFlow} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Ic n="save" s={13} />{editingFlowId ? 'Update Flow' : 'Create Flow'}
                      </motion.button>
                    </div>
                  </div>

                  {formMsg && <div className={`alert ${formMsg.includes('Failed') || formMsg.includes('required') || formMsg.includes('invalid') ? 'alert-error' : 'alert-success'} mb-16`}>{formMsg}</div>}
                  {error && <div className="alert alert-error mb-16">{error}</div>}

                  <div className="builder-grid">
                    {/* Left: Config Panel */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div className="card">
                        <div className="card-hd"><div className="card-title"><Ic n="layers" s={13} />Flow Details</div></div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                          <div className="form-group">
                            <label className="form-label">Flow Name *</label>
                            <input className="form-input" placeholder="My Automation Flow" value={flowName} onChange={e => setFlowName(e.target.value)} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Description</label>
                            <input className="form-input" placeholder="What does this flow do?" value={flowDescription} onChange={e => setFlowDescription(e.target.value)} />
                          </div>
                          <label className="form-check-row">
                            <input type="checkbox" checked={flowEnabled} onChange={e => setFlowEnabled(e.target.checked)} />
                            <span style={{ fontSize: 13, fontWeight: 500 }}>Enabled</span>
                          </label>
                        </div>
                      </div>

                      <div className="card">
                        <div className="card-hd"><div className="card-title"><Ic n="zap" s={13} />Trigger</div></div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div className="form-group">
                            <label className="form-label">Connector</label>
                            <input className="form-input" value={triggerConnector} onChange={e => setTriggerConnector(e.target.value)} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Event</label>
                            <input className="form-input" value={triggerEvent} onChange={e => setTriggerEvent(e.target.value)} />
                          </div>
                        </div>
                      </div>

                      <div className="card">
                        <div className="card-hd"><div className="card-title"><Ic n="cpu" s={13} />Action Step</div></div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div className="form-group">
                            <label className="form-label">Connector</label>
                            <select className="form-select" value={actionConnector} onChange={e => setActionConnector(e.target.value)}>
                              {connectors.length === 0 && <option value="custom">custom</option>}
                              {connectors.map(item => (
                                <option key={`${item.connector}:${item.action}`} value={item.connector}>{item.connector}</option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Action</label>
                            <input className="form-input" value={actionName} onChange={e => setActionName(e.target.value)} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Input JSON</label>
                            <textarea className="form-textarea" rows={5} value={actionInputJson} onChange={e => setActionInputJson(e.target.value)} />
                          </div>
                          <button className="btn btn-secondary w-full" style={{ justifyContent: 'center' }} onClick={regenerateDefinition}>
                            <Ic n="refresh" s={13} />Generate Definition
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Right: Canvas + JSON */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div className="card">
                        <div className="card-hd"><div className="card-title"><Ic n="grid" s={13} />Visual Canvas</div></div>
                        <div style={{ padding: 14 }}>
                          <FlowCanvas definitionJson={definitionJson} onDefinitionJsonChange={setDefinitionJson} connectors={connectors} />
                        </div>
                      </div>
                      <div className="card">
                        <div className="card-hd"><div className="card-title"><Ic n="layers" s={13} />Flow Definition JSON</div></div>
                        <div style={{ padding: 14 }}>
                          <textarea
                            className="form-textarea w-full"
                            rows={14}
                            value={definitionJson}
                            onChange={e => setDefinitionJson(e.target.value)}
                            placeholder="Flow definition JSON"
                            style={{ minHeight: 280 }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ══════════ CREDENTIALS ══════════ */}
              {activeTab === 'credentials' && (
                <div>
                  <div className="page-hd">
                    <div>
                      <div className="page-title">Credentials</div>
                      <div className="page-sub">Manage workspace secrets and API keys</div>
                    </div>
                    <div className="page-actions">
                      <button className="btn btn-secondary" onClick={loadCredentials}><Ic n="refresh" s={13} />Refresh</button>
                    </div>
                  </div>
                  {error && <div className="alert alert-error mb-16">{error}</div>}

                  <div className="two-col" style={{ alignItems: 'start' }}>
                    <div className="card">
                      <div className="card-hd"><div className="card-title"><Ic n="plus" s={13} />Add Credential</div></div>
                      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div className="form-group">
                          <label className="form-label">Management API Key</label>
                          <input className="form-input" type="password" placeholder="mgmt-key-…" value={managementApiKey} onChange={e => setManagementApiKey(e.target.value)} />
                          <div className="form-hint">Required for credential operations</div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Credential Name</label>
                          <input className="form-input" placeholder="SLACK_API_TOKEN" value={credentialName} onChange={e => setCredentialName(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Value</label>
                          <input className="form-input" type="password" placeholder="xoxb-…" value={credentialValue} onChange={e => setCredentialValue(e.target.value)} />
                        </div>
                        <motion.button className="btn btn-primary" onClick={saveCredential} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                          <Ic n="save" s={13} />Save Credential
                        </motion.button>
                      </div>
                    </div>

                    <div className="card">
                      <div className="card-hd">
                        <div className="card-title"><Ic n="shield" s={13} />Stored Credentials</div>
                        <span className="badge b-neutral" style={{ fontFamily: 'JetBrains Mono', fontSize: 10 }}>{credentials.length}</span>
                      </div>
                      {credentials.length === 0 ? (
                        <div className="empty-state">
                          <div className="empty-icon"><Ic n="key" s={18} /></div>
                          <div className="empty-title">No credentials yet</div>
                          <div className="empty-sub">Add a credential to get started</div>
                        </div>
                      ) : (
                        <div style={{ padding: '4px 20px' }}>
                          {credentials.map(item => (
                            <div key={item.name} className="cred-row">
                              <div>
                                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{item.name}</div>
                                <div className="text-xs text-faint">Updated: {item.updated_at ? new Date(item.updated_at).toLocaleString() : '—'}</div>
                              </div>
                              <button className="btn btn-danger btn-sm" onClick={() => deleteCredential(item.name)}><Ic n="trash" s={12} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ══════════ CONNECTORS ══════════ */}
              {activeTab === 'connectors' && (
                <div>
                  <div className="page-hd">
                    <div>
                      <div className="page-title">Connector Catalog</div>
                      <div className="page-sub">{connectors.length} connectors available in this build</div>
                    </div>
                    <div className="page-actions">
                      <button className="btn btn-secondary" onClick={loadConnectors}><Ic n="refresh" s={13} />Refresh</button>
                    </div>
                  </div>
                  {connectors.length === 0 ? (
                    <div className="card">
                      <div className="empty-state">
                        <div className="empty-icon"><Ic n="plug" s={20} /></div>
                        <div className="empty-title">No connectors loaded</div>
                        <div className="empty-sub">Connectors will appear after loading from the API</div>
                        <button className="btn btn-secondary" onClick={loadConnectors}><Ic n="refresh" s={13} />Load Connectors</button>
                      </div>
                    </div>
                  ) : (
                    <motion.div className="connector-grid" variants={stagger} initial="initial" animate="animate">
                      {connectors.map(item => {
                        const authColor: Record<string, string> = {
                          none: 'var(--text-3)', bearer: 'var(--accent)',
                          api_key: 'var(--success)', oauth2: 'var(--warning)', mixed: 'var(--accent-2)',
                        };
                        return (
                          <motion.div key={`${item.connector}:${item.action}`} className="connector-card" variants={statItem}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                              <div className="connector-name">{item.connector}</div>
                              <span className="badge b-accent" style={{ fontSize: 10 }}>{item.auth}</span>
                            </div>
                            <div className="connector-meta">
                              <div>Action: <strong style={{ color: 'var(--text-2)' }}>{item.action}</strong></div>
                              <div>Category: <span style={{ color: 'var(--text-2)' }}>{item.category}</span></div>
                              {item.required_input_fields.length > 0 && (
                                <div style={{ marginTop: 6 }}>
                                  <span style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Required</span>
                                  <div className="font-mono" style={{ fontSize: 10.5, marginTop: 2, color: 'var(--text-3)' }}>{item.required_input_fields.join(', ')}</div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  )}
                </div>
              )}

              {/* ══════════ EVENTS ══════════ */}
              {activeTab === 'events' && (
                <div>
                  <div className="page-hd">
                    <div>
                      <div className="page-title">Live Events</div>
                      <div className="page-sub">Real-time workspace events via WebSocket · room: workspace:{workspaceId?.slice(0, 12) || '…'}</div>
                    </div>
                    <div className="page-actions">
                      <span className="live-badge"><span className="live-dot" />Live</span>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEvents([])}><Ic n="trash" s={12} />Clear</button>
                    </div>
                  </div>
                  <div className="card">
                    {events.length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-icon"><Ic n="activity" s={20} /></div>
                        <div className="empty-title">Listening for events…</div>
                        <div className="empty-sub">Workspace events will stream here in real time once your flows trigger</div>
                      </div>
                    ) : (
                      <table>
                        <thead><tr><th>Type</th><th>Event ID</th><th>Tenant</th><th>Timestamp</th></tr></thead>
                        <tbody>
                          {events.map(evt => (
                            <tr key={evt.id}>
                              <td><span className="badge b-accent">{evt.event_type || 'event'}</span></td>
                              <td><span className="font-mono text-faint" style={{ fontSize: 11 }}>{evt.id.slice(0, 16)}…</span></td>
                              <td><span className="text-muted">{evt.tenant_id?.slice(0, 12) || '—'}</span></td>
                              <td><span className="text-muted" style={{ fontSize: 12 }}>{evt.timestamp || '—'}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Workspaces management */}
                  <div style={{ marginTop: 28 }}>
                    <div className="page-hd" style={{ marginBottom: 18 }}>
                      <div>
                        <div className="page-title" style={{ fontSize: 17 }}>Workspaces</div>
                        <div className="page-sub">Manage your workspaces</div>
                      </div>
                      <div className="page-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowNewWs(s => !s)}><Ic n="plus" s={12} />New Workspace</button>
                        <button className="btn btn-secondary btn-sm" onClick={loadWorkspaces}><Ic n="refresh" s={12} />Refresh</button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {showNewWs && (
                        <motion.div
                          className="card mb-16"
                          initial={{ opacity: 0, y: -10, scaleY: 0.95 }}
                          animate={{ opacity: 1, y: 0, scaleY: 1 }}
                          exit={{ opacity: 0, y: -10, scaleY: 0.95 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="card-hd"><div className="card-title">Create Workspace</div></div>
                          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                            <div className="form-row">
                              <div className="form-group">
                                <label className="form-label">Name *</label>
                                <input className="form-input" placeholder="My Workspace" value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} />
                              </div>
                              <div className="form-group">
                                <label className="form-label">Slug <span className="text-faint">(optional)</span></label>
                                <input className="form-input" placeholder="my-workspace" value={workspaceSlug} onChange={e => setWorkspaceSlug(e.target.value)} />
                              </div>
                            </div>
                            <div className="form-group">
                              <label className="form-label">Settings JSON</label>
                              <textarea className="form-textarea" rows={3} value={workspaceSettingsJson} onChange={e => setWorkspaceSettingsJson(e.target.value)} />
                            </div>
                            {workspaceMsg && (
                              <div className={`alert ${workspaceMsg.includes('Failed') || workspaceMsg.includes('required') || workspaceMsg.includes('Invalid') ? 'alert-error' : 'alert-success'}`}>
                                {workspaceMsg}
                              </div>
                            )}
                            <div className="flex gap-8">
                              <motion.button className="btn btn-primary" onClick={createWorkspace} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                                <Ic n="plus" s={13} />Create Workspace
                              </motion.button>
                              <button className="btn btn-ghost" onClick={() => setShowNewWs(false)}>Cancel</button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {workspaces.length > 0 && (
                      <div className="card">
                        <table>
                          <thead><tr><th>Name</th><th>Slug</th><th>Plan</th><th>Actions</th></tr></thead>
                          <tbody>
                            {workspaces.map(ws => (
                              <tr key={ws.id}>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div className="ws-avatar" style={{ width: 24, height: 24 }}>{ws.name.slice(0, 2).toUpperCase()}</div>
                                    <span style={{ fontWeight: 600 }}>{ws.name}</span>
                                    {ws.id === workspaceId && <span className="badge b-accent" style={{ fontSize: 10 }}>Active</span>}
                                  </div>
                                </td>
                                <td><span className="font-mono text-faint" style={{ fontSize: 12 }}>{ws.slug}</span></td>
                                <td><span className="badge b-neutral">{ws.plan}</span></td>
                                <td>
                                  <button className="btn btn-secondary btn-sm" onClick={() => setWorkspaceId(ws.id)}>
                                    {ws.id === workspaceId ? 'Selected' : 'Select'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}