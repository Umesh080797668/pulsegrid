'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Cable, KeyRound, Layers, LogOut, Store, Vault, Workflow, Zap } from 'lucide-react';
import { apiBase, authenticatedFetch } from '../lib/api';
import { useDashboardStore } from '../lib/store';

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

const navItems: NavItem[] = [
  { href: '/flows', label: 'Flows', icon: <Workflow size={14} /> },
  { href: '/events', label: 'Events', icon: <Activity size={14} /> },
  { href: '/analytics', label: 'Analytics', icon: <BarChart3 size={14} /> },
  { href: '/connectors', label: 'Connectors', icon: <Cable size={14} /> },
  { href: '/market', label: 'Market', icon: <Store size={14} /> },
  { href: '/settings/vault', label: 'VaultGuard', icon: <Vault size={14} /> },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    accessToken,
    workspaceId,
    workspaces,
    hydrateFromStorage,
    setAccessToken,
    setWorkspaceId,
    setWorkspaces,
    clearSession,
  } = useDashboardStore();

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  useEffect(() => {
    const fromQuery = searchParams.get('workspace');
    if (fromQuery) {
      setWorkspaceId(fromQuery);
    }
  }, [searchParams, setWorkspaceId]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const run = async () => {
      const response = await authenticatedFetch(`${apiBase}/workspaces`, accessToken, setAccessToken);
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as Array<{ id: string; name: string; slug: string; plan: string; owner_user_id: string }>;
      setWorkspaces(data);
      if (!workspaceId && data.length > 0) {
        setWorkspaceId(data[0].id);
      }
    };

    void run();
  }, [accessToken, setAccessToken, setWorkspaceId, setWorkspaces, workspaceId]);

  const currentTitle = useMemo(
    () => navItems.find((item) => pathname.startsWith(item.href))?.label || 'PulseGrid',
    [pathname],
  );

  if (pathname.startsWith('/oauth')) {
    return <>{children}</>;
  }

  if (!accessToken) {
    return <AuthScreen />;
  }

  const onLogout = async () => {
    await fetch(`${apiBase}/auth/logout`, { method: 'POST', credentials: 'include' });
    clearSession();
  };

  return (
    <div className="layout">
      <div className="pg-ambient" />
      <div className="pg-grid" />

      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon"><Zap size={14} /></div>
          <span className="sidebar-logo-text">PulseGrid</span>
        </div>

        <nav className="sidebar-nav" style={{ paddingTop: 14 }}>
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={`nav-item${active ? ' active' : ''}`}>
                {item.icon}
                <span style={{ flex: 1 }}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="ws-label">Workspace</div>
          {workspaces.length === 0 && (
            <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text-3)' }}>No workspaces yet</div>
          )}
          {workspaces.map((ws) => (
            <button key={ws.id} className={`ws-pill${ws.id === workspaceId ? ' active' : ''}`} onClick={() => setWorkspaceId(ws.id)}>
              <div className="ws-avatar">{ws.name.slice(0, 2).toUpperCase()}</div>
              <span className="ws-name">{ws.name}</span>
            </button>
          ))}
          <div className="divider" />
          <button className="nav-item" style={{ color: 'var(--error)', opacity: 0.8 }} onClick={onLogout}>
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="tb-breadcrumb">
            <span className="tb-title">{currentTitle}</span>
          </div>
          <div className="tb-right">
            <div className="token-pill">
              <div className="tdot ok" />
              <span>Authenticated</span>
            </div>
          </div>
        </header>

        <div className="content">{children}</div>
      </div>
    </div>
  );
}

function AuthScreen() {
  const { setAccessToken } = useDashboardStore();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  const onSubmit = async () => {
    setMessage('');
    if (!email || !password) {
      setMessage('Email and password are required');
      return;
    }

    const endpoint = authMode === 'register' ? '/auth/register' : '/auth/login';
    const payload = authMode === 'register' ? { email, password, name: name || undefined } : { email, password };
    const response = await fetch(`${apiBase}${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string; accessToken?: string };

    if (!response.ok) {
      setMessage(data.message || `Authentication failed (${response.status})`);
      return;
    }

    if (authMode === 'register') {
      setAuthMode('login');
      setPassword('');
      setMessage(data.message || 'Account created. Please sign in.');
      return;
    }

    if (!data.accessToken) {
      setMessage('Authentication succeeded but token missing');
      return;
    }

    setAccessToken(data.accessToken);
  };

  return (
    <div className="auth-screen">
      <div className="auth-bg" />
      <div className="auth-grid" />
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon"><Zap size={20} /></div>
          <span className="auth-logo-text">PulseGrid</span>
          <div className="auth-tagline">Automation infrastructure for modern teams</div>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab${authMode === 'login' ? ' active' : ''}`} onClick={() => setAuthMode('login')}>Sign in</button>
          <button className={`auth-tab${authMode === 'register' ? ' active' : ''}`} onClick={() => setAuthMode('register')}>Create account</button>
        </div>

        <div className="auth-form-stack">
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {authMode === 'register' && (
            <div className="form-group">
              <label className="form-label">Display name</label>
              <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
        </div>

        {message && (
          <div className={`alert ${message.includes('failed') || message.includes('required') ? 'alert-error' : 'alert-success'}`}>
            {message}
          </div>
        )}

        <button className="btn btn-primary w-full" style={{ justifyContent: 'center' }} onClick={onSubmit}>
          {authMode === 'register' ? 'Create account' : 'Sign in to PulseGrid'}
        </button>
      </div>
    </div>
  );
}
