import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type CrashReporting = typeof import('./crash-reporting')

async function load(opts: { desktopApp: boolean }): Promise<CrashReporting> {
  vi.resetModules()
  const win = window as unknown as Record<string, unknown>
  if (opts.desktopApp) win.__TAURI_INTERNALS__ = {}
  else delete win.__TAURI_INTERNALS__
  return import('./crash-reporting')
}

function seedPendingReport(cr: CrashReporting) {
  cr.setCrashReportingEnabled(true)
  cr.setSentryDsn('https://publickey@crash.example.org/42')
  cr.saveCrashReport({
    timestamp: '2026-09-13T00:00:00.000Z',
    errorType: 'Error',
    errorMessage: 'boom',
    stackTrace: 'Error: boom\n    at x (app.js:1:1)',
    appVersion: '0.0.0',
    userAgent: 'test',
  })
}

describe('crash report upload', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  })

  it('is refused with a logged reason in the desktop app — no raw fetch, reports kept', async () => {
    const cr = await load({ desktopApp: true })
    seedPendingReport(cr)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(cr.uploadPendingReports()).rejects.toBeInstanceOf(cr.CrashReportUploadUnavailableError)
    await expect(cr.uploadPendingReports()).rejects.toBeInstanceOf(cr.CrashReportUploadUnavailableError)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(cr.getPendingReportCount()).toBe(1)
    expect(cr.crashReportUploadUnavailableReason()).toMatch(/disabled in the desktop app/)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[crash-reporting]'))
  })

  it('uploads to the DSN endpoint where direct egress is possible', async () => {
    const cr = await load({ desktopApp: false })
    seedPendingReport(cr)

    await expect(cr.uploadPendingReports()).resolves.toBe(1)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('https://crash.example.org/api/42/store/?sentry_key=publickey&sentry_version=7')
    expect(cr.getPendingReportCount()).toBe(0)
  })
})
