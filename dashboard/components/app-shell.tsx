'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useMemo } from 'react';
import { Activity, BarChart3, Cable, CreditCard, Key, LogOut, Store, Vault, Workflow, Zap } from 'lucide-react';
import { apiBase, authenticatedFetch } from '../lib/api';
import { useDashboardStore } from '../lib/store';
import { AuthScreen } from './auth/auth-screen';

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
  { href: '/settings/billing', label: 'Billing', icon: <CreditCard size={14} /> },
  { href: '/settings/api-keys', label: 'API Keys', icon: <Key size={14} /> },
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

  // Allow unauthenticated access to OAuth and auth pages only.
  if (pathname.startsWith('/oauth')) {
    return <>{children}</>;
  }

  if (pathname === '/auth' || pathname === '/login' || pathname === '/register') {
    return <>{children}</>;
  }

  if (!accessToken) {
    // When unauthenticated, render the auth screen and after successful login
    // redirect users back to the path they originally requested (e.g. /dashboard).
    return <AuthScreen redirectTo={pathname || '/dashboard'} />;
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
