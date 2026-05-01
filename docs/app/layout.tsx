import type { ReactNode } from 'react'
import { Layout } from 'nextra-theme-docs'
import { getPageMap } from 'nextra/page-map'

export const metadata = {
  title: 'PulseGrid Docs',
  description: 'Documentation for PulseGrid',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Layout
          pageMap={await getPageMap('/')}
          docsRepositoryBase="https://github.com/Umesh080797668/pulsegrid/tree/main/docs"
          sidebar={{ autoCollapse: true }}
        >
          {children ?? null}
        </Layout>
      </body>
    </html>
  )
}
