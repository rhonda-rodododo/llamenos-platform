/**
 * Mock @tauri-apps/plugin-process for Playwright test builds.
 *
 * Aliased via vite.config.ts when PLAYWRIGHT_TEST=true.
 * Records relaunch calls on window.__RELAUNCH_CALLED__ so tests can assert
 * that the restart flow was triggered.
 *
 * Note: platformRelaunch() in platform.ts also sets __RELAUNCH_CALLED__ directly
 * for test builds — this mock is a safety net for any direct imports that remain.
 */

if (!import.meta.env.PLAYWRIGHT_TEST) {
  throw new Error('FATAL: Tauri process mock loaded outside test environment.')
}

export async function relaunch(): Promise<void> {
  ;(window as Record<string, unknown>).__RELAUNCH_CALLED__ = true
}

export async function exit(_code?: number): Promise<void> {
  // No-op in tests
}
