import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { sriWorkboxPlugin } from './src/client/lib/sri-workbox-plugin'
import path from 'path'

import { readFileSync } from 'fs'

// Build-time constants for reproducible builds (Epic 79)
// CI sets SOURCE_DATE_EPOCH from git commit timestamp; dev builds use current time
const buildTime = process.env.SOURCE_DATE_EPOCH
  ? new Date(parseInt(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  : new Date().toISOString()
const buildCommit = process.env.GITHUB_SHA || 'dev'
const buildVersion = JSON.parse(readFileSync('./package.json', 'utf-8')).version

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/client/routes',
      generatedRouteTree: './src/client/routeTree.gen.ts',
    }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.svg'],
      manifest: {
        name: 'Hotline',
        short_name: 'Hotline',
        description: 'Secure communication app',
        theme_color: '#1a1a2e',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/telephony\//],
        // No API runtime caching — sensitive call data must never be cached on device
      },
    }),
    sriWorkboxPlugin(),
  ],
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/client'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
    conditions: ['import', 'module', 'default'],
  },
  define: {
    '__BUILD_TIME__': JSON.stringify(buildTime),
    '__BUILD_COMMIT__': JSON.stringify(buildCommit),
    '__BUILD_VERSION__': JSON.stringify(buildVersion),
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
})
