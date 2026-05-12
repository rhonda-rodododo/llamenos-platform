/**
 * Mock @tauri-apps/api/path for Playwright test builds.
 * Returns dummy paths since the actual filesystem is not used in tests.
 */

export async function appDataDir(): Promise<string> {
  return '/mock/app-data'
}

export async function appLocalDataDir(): Promise<string> {
  return '/mock/app-local-data'
}

export async function appConfigDir(): Promise<string> {
  return '/mock/app-config'
}
