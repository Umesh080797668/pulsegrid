import nextra from 'nextra'

const withNextra = nextra({})

export default withNextra({
  experimental: {
    turbo: {
      resolveAlias: {
        'next-mdx-import-source-file': './mdx-components.tsx'
      }
    }
  }
})