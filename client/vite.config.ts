import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// In Docker, set VITE_PROXY_TARGET=http://server:4000 so the dev server proxies
// browser requests to the API container. Locally, defaults to localhost.
const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:4000'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The service worker is off in dev: a cached shell during development
      // hides the change you just made, which costs more time than it saves.
      devOptions: { enabled: false },
      includeAssets: ['vite.svg'],
      manifest: {
        name: 'Isoko Talents',
        short_name: 'Isoko',
        description:
          'Find work, show your skills, and get paid — built for informal workers in Kigali.',
        lang: 'en',
        theme_color: '#18181b',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/dashboard',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Photographs are deliberately absent from this list. The login
        // background alone is 2.8MB, and precaching it would spend a
        // noticeable slice of a prepaid data bundle on decoration before the
        // worker has done anything.
        globPatterns: ['**/*.{js,css,html,svg,woff2}', 'icons/*.png'],
        navigateFallback: '/index.html',
        // The app bundle is ~3.3MB, above Workbox's 2MB default. It has to be
        // precached or offline does not work at all, so the ceiling is raised
        // rather than the feature dropped — but the bundle is genuinely too
        // large for a low-end phone on metered data and wants code-splitting.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // The API is never served from cache first. A stale gig list that looks
        // live is worse than an honest failure: a worker could apply to
        // something already taken.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'isoko-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Uploaded photos and voice notes are immutable once written, so
            // serving them from cache saves metered data with no staleness.
            urlPattern: ({ url }) => url.pathname.startsWith('/uploads/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'isoko-uploads',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
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
