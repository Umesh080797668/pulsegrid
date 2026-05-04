import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue({
      customElement: true,
    }),
    dts({ insertTypesEntry: true })
  ],
  build: {
    minify: true,
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'PulseGridSDK',
      fileName: (format) => format === 'umd' ? 'pulsegrid-sdk.min.js' : `pulsegrid-sdk.${format}.js`
    }
  }
})
