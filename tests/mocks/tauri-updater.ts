/**
 * Mock @tauri-apps/plugin-updater for Playwright test builds.
 *
 * Aliased via vite.config.ts when PLAYWRIGHT_TEST=true.
 * Simulates the Tauri updater plugin API with controllable behavior.
 *
 * Test scenarios:
 * - No update available (default)
 * - Update available: set window.__MOCK_UPDATE
 * - Download progress simulation: automatic when downloadAndInstall is called
 */

// Production guard
if (!import.meta.env.PLAYWRIGHT_TEST) {
  throw new Error('FATAL: Tauri updater mock loaded outside test environment.')
}

// ── Mock control interface ───────────────────────────────────────
//
// Tests can set window.__MOCK_UPDATE to control update behavior:
//
//   window.__MOCK_UPDATE = {
//     version: '1.0.0',
//     body: 'Release notes here',
//     date: '2026-01-01T00:00:00Z',
//   }
//
// Set to null/undefined for "no update available".

interface MockUpdateConfig {
  version: string
  body?: string
  date?: string
  /** Simulated download size in bytes (default 10MB) */
  downloadSize?: number
  /** If true, downloadAndInstall will reject with an error */
  failDownload?: boolean
}

declare global {
  interface Window {
    __MOCK_UPDATE?: MockUpdateConfig | null
  }
}

// ── Types matching @tauri-apps/plugin-updater ────────────────────

type DownloadEvent =
  | { event: 'Started'; data: { contentLength: number | null } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' }

interface Update {
  version: string
  body: string | null
  date: string | null
  downloadAndInstall(onProgress?: (event: DownloadEvent) => void): Promise<void>
  download(onProgress?: (event: DownloadEvent) => void): Promise<void>
  install(): Promise<void>
  close(): Promise<void>
}

// ── Mock implementation ──────────────────────────────────────────

export async function check(): Promise<Update | null> {
  const config = window.__MOCK_UPDATE
  if (!config) return null

  const downloadSize = config.downloadSize ?? 10 * 1024 * 1024 // 10MB default

  return {
    version: config.version,
    body: config.body ?? null,
    date: config.date ?? null,

    async downloadAndInstall(onProgress) {
      if (config.failDownload) {
        throw new Error('Mock download failed')
      }

      // Simulate download progress in chunks
      const chunkSize = Math.floor(downloadSize / 5)

      onProgress?.({ event: 'Started', data: { contentLength: downloadSize } })

      // Simulate 5 progress chunks
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 50))
        onProgress?.({
          event: 'Progress',
          data: { chunkLength: chunkSize },
        })
      }

      await new Promise((r) => setTimeout(r, 50))
      onProgress?.({ event: 'Finished' })
    },

    async download(this: Update, onProgress) {
      await this.downloadAndInstall(onProgress)
    },

    async install() {
      // No-op in mock
    },

    async close() {
      // No-op in mock
    },
  }
}
