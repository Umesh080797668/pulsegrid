import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue({
    customElement: true,
  })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'PulseGridSDK',
      fileName: (format) => `pulsegrid-sdk.${format}.js`
    }
  }
})
