import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In Docker, set VITE_PROXY_TARGET=http://server:4000 so the dev server proxies
// browser requests to the API container. Locally, defaults to localhost.
const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:4000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/health': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: proxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
