import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import path from 'path'
import { readFileSync } from 'fs'

// Test builds: mock Tauri IPC so Playwright can run in a regular browser
const isTestBuild = !!process.env.PLAYWRIGHT_TEST

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
  ],
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/client'),
      '@shared': path.resolve(__dirname, './packages/shared'),
      '@protocol': path.resolve(__dirname, './packages/protocol'),
      '@llamenos/i18n': path.resolve(__dirname, './packages/i18n/index.ts'),
      // Test builds: route Tauri IPC to JS mock implementations
      ...(isTestBuild ? {
        '@tauri-apps/api/core': path.resolve(__dirname, 'tests/mocks/tauri-core.ts'),
        '@tauri-apps/plugin-store': path.resolve(__dirname, 'tests/mocks/tauri-store.ts'),
        '@tauri-apps/plugin-updater': path.resolve(__dirname, 'tests/mocks/tauri-updater.ts'),
      } : {}),
    },
    conditions: ['import', 'module', 'default'],
  },
  define: {
    '__BUILD_TIME__': JSON.stringify(buildTime),
    '__BUILD_COMMIT__': JSON.stringify(buildCommit),
    '__BUILD_VERSION__': JSON.stringify(buildVersion),
    // Make PLAYWRIGHT_TEST available as import.meta.env.PLAYWRIGHT_TEST in the browser
    ...(isTestBuild ? { 'import.meta.env.PLAYWRIGHT_TEST': JSON.stringify('true') } : {}),
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    target: 'esnext',
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('@radix-ui')) return 'vendor-ui'
            if (id.includes('@noble/') || id.includes('nostr-tools')) return 'vendor-crypto'
          }
        },
      },
    },
  },
  server: {
    host: process.env.TAURI_DEV_HOST || '0.0.0.0',
    strictPort: true,
    // Proxy API/WS to Docker Compose backend for test and standalone dev builds
    ...(isTestBuild || !process.env.TAURI_ENV_PLATFORM ? {
      proxy: {
        '/api': {
          target: process.env.API_URL || 'http://localhost:3000',
          changeOrigin: true,
        },
        '/ws': {
          target: process.env.API_URL?.replace('http', 'ws') || 'ws://localhost:3000',
          ws: true,
        },
      },
    } : {}),
  },
  // Preview proxy (for `vite preview` used by Playwright tests)
  preview: {
    proxy: {
      '/api': {
        target: process.env.API_URL || 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.API_URL?.replace('http', 'ws') || 'ws://localhost:3000',
        ws: true,
      },
    },
  },
})
