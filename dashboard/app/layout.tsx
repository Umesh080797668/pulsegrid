import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'PulseGrid Dashboard',
  description: 'Phase 1 dashboard for flow management and live events',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
