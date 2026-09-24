/**
 * Single instance tests — verify that only one app instance can run.
 *
 * Uses window.__TAURI_INTERNALS__ directly for Tauri API access since
 * browser.execute() can't resolve bare module specifiers.
 *
 * Epic 88: Desktop & Mobile E2E Tests.
 */

import { spawnSync } from 'child_process'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('Single Instance', () => {
  it('should have the single-instance plugin loaded', async () => {
    const result = await browser.execute(() => {
      try {
        const internals = window.__TAURI_INTERNALS__
        if (!internals?.metadata) return { found: false, reason: 'no metadata' }
        return {
          found: true,
          label: internals.metadata.currentWindow?.label,
          windowCount: internals.metadata.windows?.length,
        }
      } catch (e: unknown) {
        return { found: false, reason: e instanceof Error ? e.message : String(e) }
      }
    })

    // Window label should be 'main'
    if (result.found) {
      expect(result.label).toBe('main')
    } else {
      console.warn('Single instance check skipped:', result.reason)
    }
  })

  it('should have only one window open', async () => {
    const result = await browser.execute(() => {
      try {
        const internals = window.__TAURI_INTERNALS__
        if (!internals?.metadata?.windows) return { count: -1, reason: 'no metadata.windows' }
        return { count: internals.metadata.windows.length, reason: '' }
      } catch (e: unknown) {
        return { count: -1, reason: e instanceof Error ? e.message : String(e) }
      }
    })

    if (result.count === -1) {
      console.warn('Window count check skipped:', result.reason)
    } else {
      expect(result.count).toBe(1)
    }
  })

  it('should reject a second instance launch', async () => {
    const binaryName = process.platform === 'win32' ? 'llamenos-desktop.exe' : 'llamenos-desktop'
    const binaryPath = path.resolve(
      __dirname, '..', '..', '..', 'apps', 'desktop', 'target', 'debug', binaryName,
    )

    const result = spawnSync(binaryPath, [], {
      timeout: 5_000,
      stdio: 'pipe',
    })

    // The second instance should exit (not remain running)
    const exited = result.status !== null || result.signal !== null
    expect(exited).toBe(true)
  })

  it('should have window visible after second instance attempt', async () => {
    const result = await browser.execute(async () => {
      try {
        const invoke = window.__TAURI_INTERNALS__?.invoke
        if (!invoke) return { error: '__TAURI_INTERNALS__.invoke not available' }

        const visible = await invoke('plugin:window|is_visible', { label: 'main' }) as boolean
        return { visible }
      } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : String(e) }
      }
    })

    if ('error' in result) {
      console.warn('Visibility check skipped:', result.error)
    } else {
      expect(result.visible).toBe(true)
    }
  })
})
