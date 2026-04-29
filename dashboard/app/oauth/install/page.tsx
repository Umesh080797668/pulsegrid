import { Suspense } from 'react';
import OAuthInstallClient from '../ClientOAuthInstall';

export default function OAuthInstallPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--text)' }}>Loading OAuth install…</main>}>
      <OAuthInstallClient />
    </Suspense>
  );
}
