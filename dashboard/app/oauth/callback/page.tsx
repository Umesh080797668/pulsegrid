'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--text)' }}>Loading OAuth callback…</main>}>
      <OAuthCallbackContent />
    </Suspense>
  );
}

function OAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const connector = searchParams.get('connector') || '';
  const workspaceId = searchParams.get('workspaceId') || '';
  const callbackStatus = searchParams.get('status') || '';
  const messageParam = searchParams.get('message') || '';
  const [message, setMessage] = useState('Finalizing connection…');

  const status = useMemo(() => {
    if (callbackStatus === 'success') {
      return 'success';
    }
    if (callbackStatus === 'error') {
      return 'error';
    }
    return 'unknown';
  }, [callbackStatus]);

  useEffect(() => {
    if (!connector || !workspaceId) {
      setMessage('Missing connector context.');
      return;
    }

    if (callbackStatus === 'success') {
      setMessage(`Connected ${connector} successfully.`);
    } else if (callbackStatus === 'error') {
      setMessage(messageParam || `Failed to connect ${connector}.`);
    } else {
      setMessage('Received unexpected callback payload.');
    }

    const timer = window.setTimeout(() => {
      router.replace(`/connectors?workspace=${encodeURIComponent(workspaceId)}`);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [callbackStatus, connector, messageParam, router, workspaceId]);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--text)', padding: 24 }}>
      <div style={{ width: 'min(640px, 100%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 28, boxShadow: 'var(--shadow-card)' }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>OAuth Callback</div>
        <div style={{ color: 'var(--text-3)', marginBottom: 18, lineHeight: 1.6 }}>
          {connector ? `Connector: ${connector}` : 'Connector not specified'}
          <br />
          {workspaceId ? `Workspace: ${workspaceId}` : 'Workspace not specified'}
        </div>
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 18 }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)', marginBottom: 8 }}>Status</div>
          <div style={{ fontSize: 14, color: 'var(--text)' }}>{message}</div>
          <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--text-3)' }}>Flow state: {status}</div>
        </div>
        <button onClick={() => router.replace('/flows')} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'white', cursor: 'pointer' }}>
          Return to dashboard
        </button>
      </div>
    </main>
  );
}
