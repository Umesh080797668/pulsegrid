import './globals.css';
import type { ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { Suspense } from 'react';

export const metadata = {
  title: 'PulseGrid Dashboard',
  description: 'Phase 1 dashboard for flow management and live events',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={<main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Loading dashboard…</main>}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
