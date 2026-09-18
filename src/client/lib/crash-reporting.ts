/**
 * Privacy-first crash reporting service for the desktop client.
 *
 * Key privacy guarantees:
 * - Crash reporting is strictly opt-in — user must explicitly consent.
 * - No PII is ever included in crash reports (no user IDs, keys, names, or phone numbers).
 * - Reports contain only: error type, stack trace, app version, OS version, browser info.
 * - The Sentry DSN is fetched from the hub server config, not hardcoded.
 *
 * Pending crash reports are stored in localStorage and uploaded on next page load
 * (or immediately if consent is granted and a DSN is configured).
 *
 * Desktop app: uploads are disabled. The packaged app's CSP `connect-src` is
 * `ipc:` only, and the Rust network proxy (apps/desktop/src/net.rs) reaches
 * nothing but the one backend origin the user configured — a DSN host handed
 * down in hub config is exactly the kind of server-chosen egress that allowlist
 * exists to refuse. Reports are still captured locally; an upload attempt logs
 * why it cannot run and rejects with `CrashReportUploadUnavailableError`, so the
 * UI can say so instead of failing silently.
 */

import { isPackagedTauri } from './api-config'

const STORAGE_KEY_CONSENT = 'crash-reporting-enabled'
const STORAGE_KEY_DSN = 'sentry-dsn'
const STORAGE_KEY_PENDING = 'crash-reports-pending'
const MAX_PENDING_REPORTS = 10

export interface CrashReport {
  timestamp: string
  errorType: string
  errorMessage: string
  stackTrace: string
  componentStack?: string
  appVersion: string
  userAgent: string
  scope?: string
}

/** Uploading crash reports is not possible in this process (see module doc). */
export class CrashReportUploadUnavailableError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'CrashReportUploadUnavailableError'
  }
}

const DESKTOP_UPLOAD_DISABLED_REASON =
  'crash report upload is disabled in the desktop app: its network egress is limited to the configured backend origin, and the crash-reporting DSN host is not that origin'

let loggedUploadDisabled = false

/** Why crash reports cannot be uploaded from this process, or `null` if they can. */
export function crashReportUploadUnavailableReason(): string | null {
  return isPackagedTauri() ? DESKTOP_UPLOAD_DISABLED_REASON : null
}

/** Whether the user has opted in to crash reporting. */
export function isCrashReportingEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY_CONSENT) === 'true'
}

/** Set the crash reporting consent preference. */
export function setCrashReportingEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY_CONSENT, enabled ? 'true' : 'false')
}

/** Set the Sentry/GlitchTip DSN from the hub config. */
export function setSentryDsn(dsn: string | null): void {
  if (dsn) {
    localStorage.setItem(STORAGE_KEY_DSN, dsn)
  } else {
    localStorage.removeItem(STORAGE_KEY_DSN)
  }
}

/** Get the currently configured Sentry/GlitchTip DSN. */
export function getSentryDsn(): string | null {
  return localStorage.getItem(STORAGE_KEY_DSN)
}

/** Get the count of pending crash reports. */
export function getPendingReportCount(): number {
  return getPendingReports().length
}

/** Get all pending crash reports. */
function getPendingReports(): CrashReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PENDING)
    if (!raw) return []
    return JSON.parse(raw) as CrashReport[]
  } catch {
    return []
  }
}

/** Save a crash report to local storage for later upload. */
export function saveCrashReport(report: CrashReport): void {
  const reports = getPendingReports()
  reports.unshift(report)
  // Keep only the most recent reports
  const trimmed = reports.slice(0, MAX_PENDING_REPORTS)
  localStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(trimmed))
}

/** Clear all pending crash reports. */
export function clearPendingReports(): void {
  localStorage.removeItem(STORAGE_KEY_PENDING)
}

/**
 * Capture an error and save it as a crash report.
 * If consent is granted and a DSN is configured, also attempts immediate upload.
 */
export function captureError(
  error: Error,
  options?: { componentStack?: string; scope?: string },
): void {
  const report: CrashReport = {
    timestamp: new Date().toISOString(),
    errorType: error.name || 'Error',
    errorMessage: error.message || 'Unknown error',
    stackTrace: error.stack || '',
    componentStack: options?.componentStack,
    appVersion: getAppVersion(),
    userAgent: navigator.userAgent,
    scope: options?.scope,
  }

  saveCrashReport(report)

  // Try immediate upload if consent + DSN are available. A failure keeps the
  // report pending for the next attempt; an unavailable upload path has already
  // been logged by uploadPendingReports.
  if (isCrashReportingEnabled()) {
    uploadPendingReports().catch(() => {})
  }
}

/**
 * Upload all pending crash reports to the Sentry/GlitchTip endpoint.
 * Returns the number of successfully uploaded reports. Rejects with
 * `CrashReportUploadUnavailableError` (after logging the reason once) where
 * uploads cannot run — pending reports are kept.
 */
export async function uploadPendingReports(): Promise<number> {
  if (!isCrashReportingEnabled()) return 0

  const unavailable = crashReportUploadUnavailableReason()
  if (unavailable) {
    if (!loggedUploadDisabled) {
      console.warn(`[crash-reporting] ${unavailable}`)
      loggedUploadDisabled = true
    }
    throw new CrashReportUploadUnavailableError(unavailable)
  }

  const dsn = getSentryDsn()
  if (!dsn) return 0

  const endpoint = parseSentryDsn(dsn)
  if (!endpoint) return 0

  const reports = getPendingReports()
  if (reports.length === 0) return 0

  let uploaded = 0
  const remaining: CrashReport[] = []

  for (const report of reports) {
    try {
      const payload = buildSentryEvent(report)
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (response.ok) {
        uploaded++
      } else {
        remaining.push(report)
      }
    } catch {
      remaining.push(report)
    }
  }

  // Update storage with any reports that failed to upload
  if (remaining.length > 0) {
    localStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(remaining))
  } else {
    localStorage.removeItem(STORAGE_KEY_PENDING)
  }

  return uploaded
}

/**
 * Install global error handlers that capture unhandled errors and promise rejections.
 * Should be called once at app startup.
 */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    if (event.error instanceof Error) {
      captureError(event.error, { scope: 'global' })
    }
  })

  window.addEventListener('unhandledrejection', (event) => {
    const error =
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason))
    captureError(error, { scope: 'unhandled-promise' })
  })
}

// ── Internal helpers ──────────────────────────────────────────────

/**
 * Parse a Sentry DSN into the store endpoint URL.
 * DSN format: https://<key>@<host>/<project_id>
 * Endpoint: https://<host>/api/<project_id>/store/?sentry_key=<key>&sentry_version=7
 */
function parseSentryDsn(dsn: string): string | null {
  try {
    const url = new URL(dsn)
    const key = url.username
    if (!key) return null
    const projectId = url.pathname.replace(/^\//, '')
    const host = url.host
    return `${url.protocol}//${host}/api/${projectId}/store/?sentry_key=${key}&sentry_version=7`
  } catch {
    return null
  }
}

/**
 * Build a Sentry-compatible JSON event from a crash report.
 * Contains only technical information — never PII.
 */
function buildSentryEvent(report: CrashReport): Record<string, unknown> {
  const eventId = crypto.randomUUID().replace(/-/g, '')

  return {
    event_id: eventId,
    timestamp: report.timestamp,
    platform: 'javascript',
    level: 'error',
    logger: 'CrashReporting',
    server_name: '',
    release: report.appVersion,
    environment: process.env.NODE_ENV === 'development' ? 'development' : 'production',
    tags: {
      'browser': getBrowserInfo(),
      'scope': report.scope || 'unknown',
    },
    exception: {
      values: [
        {
          type: report.errorType,
          value: report.errorMessage.slice(0, 500),
          stacktrace: {
            frames: parseStackFrames(report.stackTrace),
          },
        },
      ],
    },
    extra: {
      raw_stack: report.stackTrace.slice(0, 8000),
      ...(report.componentStack
        ? { component_stack: report.componentStack.slice(0, 4000) }
        : {}),
    },
  }
}

/**
 * Parse a JS stack trace string into Sentry-compatible frames.
 * Best-effort extraction — some frames may not parse cleanly.
 */
function parseStackFrames(
  stack: string,
): Array<{ filename?: string; function?: string; lineno?: number; colno?: number }> {
  if (!stack) return []

  const lines = stack.split('\n').filter((l) => l.trim().startsWith('at '))
  return lines
    .map((line) => {
      const trimmed = line.trim().replace(/^at /, '')
      // Pattern: "functionName (filename:line:col)" or "filename:line:col"
      const match = trimmed.match(
        /^(.+?)\s+\((.+?):(\d+):(\d+)\)$|^(.+?):(\d+):(\d+)$/,
      )
      if (match) {
        if (match[1]) {
          return {
            function: match[1],
            filename: match[2],
            lineno: parseInt(match[3], 10),
            colno: parseInt(match[4], 10),
          }
        }
        return {
          filename: match[5],
          lineno: parseInt(match[6], 10),
          colno: parseInt(match[7], 10),
        }
      }
      return { function: trimmed }
    })
    .reverse() // Sentry expects frames in reverse order (caller first)
}

function getAppVersion(): string {
  return (
    (
      document.querySelector('meta[name="app-version"]') as HTMLMetaElement
    )?.content || '0.0.0'
  )
}

function getBrowserInfo(): string {
  const ua = navigator.userAgent
  if (ua.includes('Firefox/')) return 'Firefox'
  if (ua.includes('Edg/')) return 'Edge'
  if (ua.includes('Chrome/')) return 'Chrome'
  if (ua.includes('Safari/')) return 'Safari'
  return 'Unknown'
}
