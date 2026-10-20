import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: process.env.DEMO_MODE === 'true' ? 5175 : 5174,
    strictPort: true,
    watch: { ignored: ['**/data/**', '**/*.sqlite*', '**/*.bootstrap-*.local', '**/*.key'] },
    allowedHosts: ['.e2b.app'],
    // String targets make Vite rewrite Host to 127.0.0.1. Preserve the browser
    // host so the API can set the HTTPS/partitioned preview cookie correctly.
    proxy: { '/api': {
      target: `http://127.0.0.1:${process.env.PORT || (process.env.DEMO_MODE === 'true' ? 3003 : 3002)}`,
      changeOrigin: false,
    } },
  },
  preview: { host: '0.0.0.0', port: 4174, allowedHosts: ['.e2b.app'] },
})
