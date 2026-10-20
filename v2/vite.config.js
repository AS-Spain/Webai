import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { privateFilePolicy } from './server/private-files.js'

const privacy = privateFilePolicy()
// Browser traffic always uses relative /api URLs, including vite preview.
const proxy = { '/api': {
  target: `http://127.0.0.1:${process.env.PORT || (process.env.DEMO_MODE === 'true' ? 3003 : 3002)}`,
  changeOrigin: false,
} }
export default defineConfig({
  plugins: [privacy.plugin, react()],
  server: {
    host: '0.0.0.0',
    port: process.env.DEMO_MODE === 'true' ? 5175 : 5174,
    strictPort: true,
    fs: { deny: privacy.deny },
    watch: { ignored: ['**/data/**', '**/*.sqlite*', '**/*.bootstrap-*.local', '**/*.key'] },
    allowedHosts: ['.e2b.app'],
    // Preserve the public Host for secure preview cookies and Origin checks.
    proxy,
  },
  preview: { host: '0.0.0.0', port: 4174, allowedHosts: ['.e2b.app'], proxy },
})
