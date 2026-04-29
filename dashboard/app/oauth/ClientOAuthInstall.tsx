'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isOAuthConnector, type OAuthConnectorKey } from '../../lib/oauth-connectors';
import { apiBase } from '../../lib/api';

export default function OAuthInstallClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const connector = (searchParams.get('connector') || '') as OAuthConnectorKey;
  const workspaceId = searchParams.get('workspaceId') || '';
  const [status, setStatus] = useState('Preparing connector authorization…');
  const [provider, setProvider] = useState('');

  const canInstall = useMemo(() => Boolean(connector && workspaceId && isOAuthConnector(connector)), [connector, workspaceId]);

  useEffect(() => {
    if (!canInstall) {
      setStatus('Invalid connector install request');
      return;
    }

    const accessToken = window.localStorage.getItem('pulsegrid.accessToken') || '';
    if (!accessToken) {
      setStatus('Missing dashboard session. Please sign in and retry.');
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const response = await fetch(`${apiBase}/connectors/oauth/${encodeURIComponent(connector)}/start?workspaceId=${encodeURIComponent(workspaceId)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          if (!cancelled) {
            setStatus(`OAuth start failed (${response.status})`);
          }
          return;
        }

        const data = (await response.json()) as { authorizeUrl: string; provider: string };
        if (cancelled) return;

        setProvider(data.provider || 'oauth');
        setStatus(`Redirecting to ${data.provider || 'provider'}…`);
        window.location.replace(data.authorizeUrl);
      } catch {
        if (!cancelled) {
          setStatus('OAuth start failed due to a network error');
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [canInstall, connector, workspaceId]);

  const skipToCallback = () => {
    const callbackUrl = new URL(`${window.location.origin}/oauth/callback`);
    callbackUrl.searchParams.set('connector', connector || '');
    callbackUrl.searchParams.set('workspaceId', workspaceId || '');
    callbackUrl.searchParams.set('status', 'error');
    callbackUrl.searchParams.set('message', 'OAuth was canceled before completion');
    window.location.assign(callbackUrl.toString());
  };

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--text)', padding: 24 }}>
      <div style={{ width: 'min(720px, 100%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 28, boxShadow: 'var(--shadow-card)' }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Install OAuth Connector</div>
        <div style={{ color: 'var(--text-3)', marginBottom: 18, lineHeight: 1.6 }}>
          {connector ? `${connector} is being connected to workspace ${workspaceId || '—'}.` : 'Missing connector information.'}
        </div>
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 18 }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)', marginBottom: 8 }}>Status</div>
          <div style={{ fontSize: 14, color: 'var(--text)' }}>{status}</div>
          {provider && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--text-3)' }}>
              Provider: {provider}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={skipToCallback} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'white', cursor: 'pointer' }}>
            Continue to callback
          </button>
          <button onClick={() => router.back()} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer' }}>
            Cancel
          </button>
          <a href={`${apiBase}/auth/github`} style={{ alignSelf: 'center', color: 'var(--accent)', fontSize: 13 }}>
            Backend OAuth demo login
          </a>
        </div>
      </div>
    </main>
  );
}
