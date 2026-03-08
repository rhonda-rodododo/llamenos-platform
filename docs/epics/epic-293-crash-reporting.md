# Epic 293: Client Crash Reporting & Diagnostics

**Status**: PENDING
**Priority**: Medium
**Depends on**: None
**Blocks**: None
**Branch**: `desktop`

## Summary

Deploy a self-hosted, privacy-preserving crash reporting pipeline using GlitchTip (open-source Sentry-compatible). Wire all three clients (Desktop Tauri/React, iOS SwiftUI, Android Kotlin/Compose) to report crashes and unhandled errors to the GlitchTip instance. Strip PII before sending, upload source maps / dSYMs / ProGuard mappings in CI for symbolication, and add a link to the GlitchTip dashboard in the admin panel.

## Problem Statement

Currently, there is zero crash visibility across all platforms:

- **Desktop**: Rust panics in the Tauri backend are logged to stderr but not captured. React rendering errors crash the webview silently. No error boundary exists.
- **iOS**: Crashes are only visible if the volunteer reports them manually. No crash handler installed.
- **Android**: A `CrashReporter` class exists (`apps/android/.../CrashReporter.kt`) that writes crash logs to local storage, but these logs are never uploaded. The comment references "opt-in send to hub server on next launch (see Epic 213)" — this was never implemented.
- **Operators** deploying Llamenos for their hotline have no way to know if volunteers are experiencing crashes, which makes debugging field issues impossible.

Third-party crash reporting (Sentry, Crashlytics) is unacceptable for this project's threat model — crash reports may contain PII (call context, note fragments in stack traces), and sending them to a third party violates the zero-trust privacy architecture. GlitchTip is self-hosted, open-source, and Sentry SDK-compatible.

## Implementation

### 1. GlitchTip Deployment

#### 1a. Docker Compose Service

**File: `deploy/docker/docker-compose.yml`** — Add GlitchTip service (behind a profile so it's opt-in):

```yaml
  glitchtip:
    image: glitchtip/glitchtip:latest
    profiles: ["monitoring"]
    depends_on:
      - postgres
      - redis
    environment:
      DATABASE_URL: postgres://llamenos:${PG_PASSWORD}@postgres:5432/glitchtip
      SECRET_KEY: ${GLITCHTIP_SECRET_KEY}
      PORT: 8000
      GLITCHTIP_DOMAIN: https://glitchtip.${DOMAIN:-localhost}
      DEFAULT_FROM_EMAIL: glitchtip@${DOMAIN:-localhost}
      EMAIL_URL: ""  # Disable email notifications (optional)
      ENABLE_USER_REGISTRATION: "false"
      GLITCHTIP_MAX_EVENT_LIFE_DAYS: 30
      # Privacy: disable IP collection
      GLITCHTIP_COLLECT_IPS: "false"
    ports:
      - "8000:8000"
    restart: unless-stopped

  glitchtip-worker:
    image: glitchtip/glitchtip:latest
    profiles: ["monitoring"]
    depends_on:
      - postgres
      - redis
    command: ./bin/run-celery-with-beat.sh
    environment:
      DATABASE_URL: postgres://llamenos:${PG_PASSWORD}@postgres:5432/glitchtip
      SECRET_KEY: ${GLITCHTIP_SECRET_KEY}
      GLITCHTIP_MAX_EVENT_LIFE_DAYS: 30
    restart: unless-stopped
```

#### 1b. Ansible Role

**File: `deploy/ansible/vars.example.yml`** — Add GlitchTip variables:

```yaml
# ─── Crash Reporting (GlitchTip) ─────────────────────────────────
# Enable self-hosted crash reporting. Deploys GlitchTip alongside the app.
llamenos_glitchtip_enabled: false

# GlitchTip secret key (generate with: python -c 'import secrets; print(secrets.token_hex(32))')
glitchtip_secret_key: ""

# Data retention (days). Crash reports older than this are automatically deleted.
glitchtip_max_event_life_days: 30

# GlitchTip DSN — set after creating a project in GlitchTip UI.
# Clients use this to report crashes. Format: https://<key>@glitchtip.<domain>/1
glitchtip_dsn: ""
```

**File: `deploy/ansible/templates/docker-compose.j2`** — Conditionally include monitoring profile:

```jinja2
{% if llamenos_glitchtip_enabled %}
    profiles: ["monitoring"]
{% endif %}
```

**File: `deploy/ansible/templates/caddy.j2`** — Reverse proxy for GlitchTip:

```
glitchtip.{{ domain }} {
    reverse_proxy glitchtip:8000
}
```

#### 1c. Helm Chart (Kubernetes)

**File: `deploy/helm/llamenos/templates/deployment-glitchtip.yaml`** — GlitchTip deployment:

```yaml
{{- if .Values.glitchtip.enabled }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "llamenos.fullname" . }}-glitchtip
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/component: glitchtip
  template:
    spec:
      containers:
        - name: glitchtip
          image: "{{ .Values.glitchtip.image }}"
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "llamenos.fullname" . }}-glitchtip
                  key: database-url
            - name: SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: {{ include "llamenos.fullname" . }}-glitchtip
                  key: secret-key
            - name: GLITCHTIP_COLLECT_IPS
              value: "false"
            - name: GLITCHTIP_MAX_EVENT_LIFE_DAYS
              value: "{{ .Values.glitchtip.maxEventLifeDays }}"
          ports:
            - containerPort: 8000
{{- end }}
```

**File: `deploy/helm/llamenos/values.yaml`** — Add defaults:

```yaml
glitchtip:
  enabled: false
  image: glitchtip/glitchtip:latest
  maxEventLifeDays: 30
```

### 2. Desktop: React Error Boundary + Tauri Panic Handler

#### 2a. React Error Boundary

**File: `src/client/components/error-boundary.tsx`**:

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '@/lib/crash-reporter'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportError(error, {
      componentStack: errorInfo.componentStack ?? undefined,
      context: 'react-error-boundary',
    })
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
            <p className="text-muted-foreground mb-6">
              The app encountered an unexpected error. Your data is safe.
              The error has been reported automatically.
            </p>
            <button
              className="rounded bg-primary px-4 py-2 text-primary-foreground"
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
            >
              Reload App
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
```

**File: `src/client/routes/__root.tsx`** — Wrap app in error boundary:

```tsx
import { ErrorBoundary } from '@/components/error-boundary'

// In the root component's JSX:
<ErrorBoundary>
  <Outlet />
</ErrorBoundary>
```

#### 2b. Desktop Crash Reporter Client

**File: `src/client/lib/crash-reporter.ts`**:

```typescript
interface CrashReporterConfig {
  dsn: string | null
  release: string
  environment: string
}

let config: CrashReporterConfig = {
  dsn: null,
  release: '',
  environment: 'production',
}

/**
 * Initialize crash reporting. DSN is fetched from server config.
 * If DSN is null/empty, crash reporting is disabled (no GlitchTip deployed).
 */
export function initCrashReporter(dsn: string | null, release: string, env: string) {
  config = { dsn, release, environment: env }

  if (!dsn) return

  // Global unhandled error handler
  window.addEventListener('error', (event) => {
    reportError(event.error ?? new Error(event.message), {
      context: 'global-error-handler',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    })
  })

  // Unhandled promise rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason))
    reportError(error, { context: 'unhandled-rejection' })
  })
}

/**
 * Report an error to GlitchTip via Sentry-compatible envelope API.
 * Strips PII before sending.
 */
export async function reportError(
  error: Error,
  extra?: Record<string, string | number | undefined>,
) {
  if (!config.dsn) return

  const parsed = parseDSN(config.dsn)
  if (!parsed) return

  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level: 'error',
    release: config.release,
    environment: config.environment,
    exception: {
      values: [{
        type: error.name,
        value: sanitizeMessage(error.message),
        stacktrace: error.stack ? parseStackTrace(error.stack) : undefined,
      }],
    },
    extra: extra ? sanitizeExtra(extra) : undefined,
    // No user info, no IP, no breadcrumbs with PII
  }

  try {
    await fetch(`${parsed.baseUrl}/api/${parsed.projectId}/store/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.publicKey}`,
      },
      body: JSON.stringify(event),
    })
  } catch {
    // Crash reporting failure should never crash the app
  }
}

/** Strip potential PII from error messages */
function sanitizeMessage(msg: string): string {
  // Remove hex strings that might be keys/tokens (32+ hex chars)
  return msg.replace(/[0-9a-f]{32,}/gi, '[REDACTED]')
    // Remove email-like patterns
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL]')
    // Remove phone-like patterns
    .replace(/\+?\d[\d\s-]{8,}/g, '[PHONE]')
}

function sanitizeExtra(extra: Record<string, string | number | undefined>): Record<string, string | number | undefined> {
  const sanitized: Record<string, string | number | undefined> = {}
  for (const [key, value] of Object.entries(extra)) {
    sanitized[key] = typeof value === 'string' ? sanitizeMessage(value) : value
  }
  return sanitized
}

function parseDSN(dsn: string): { baseUrl: string; publicKey: string; projectId: string } | null {
  try {
    const url = new URL(dsn)
    const publicKey = url.username
    const projectId = url.pathname.replace('/', '')
    const baseUrl = `${url.protocol}//${url.host}`
    return { baseUrl, publicKey, projectId }
  } catch {
    return null
  }
}

function parseStackTrace(stack: string): { frames: Array<{ filename: string; function: string; lineno: number; colno: number }> } {
  const frames = stack.split('\n')
    .filter(line => line.includes('at '))
    .map(line => {
      const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/)
      if (!match) return null
      return {
        function: match[1],
        filename: match[2],
        lineno: parseInt(match[3]),
        colno: parseInt(match[4]),
      }
    })
    .filter(Boolean) as Array<{ filename: string; function: string; lineno: number; colno: number }>

  return { frames: frames.reverse() } // Sentry expects most recent frame last
}
```

#### 2c. Tauri Rust Panic Handler

**File: `apps/desktop/src/lib.rs`** — Add panic hook:

```rust
use std::panic;

// In the run() function, before builder:
panic::set_hook(Box::new(|info| {
    let payload = info.payload();
    let message = if let Some(s) = payload.downcast_ref::<&str>() {
        s.to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "unknown panic".to_string()
    };

    let location = info.location().map(|loc| {
        format!("{}:{}:{}", loc.file(), loc.line(), loc.column())
    }).unwrap_or_default();

    // Write crash info to a file that the frontend can read on next launch
    let crash_dir = dirs::data_local_dir()
        .unwrap_or_default()
        .join("org.llamenos.hotline")
        .join("crashes");
    let _ = std::fs::create_dir_all(&crash_dir);
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let crash_file = crash_dir.join(format!("rust_panic_{timestamp}.txt"));
    let content = format!(
        "Rust Panic\nTimestamp: {}\nLocation: {}\nMessage: {}\n",
        chrono::Utc::now().to_rfc3339(),
        location,
        message
    );
    let _ = std::fs::write(crash_file, content);
}));
```

Add `chrono` and `dirs` to `Cargo.toml`:

```toml
chrono = "0.4"
dirs = "6"
```

#### 2d. Source Map Upload in CI

**File: `.github/workflows/tauri-release.yml`** — After build step:

```yaml
      - name: Upload source maps to GlitchTip
        if: env.GLITCHTIP_DSN != ''
        env:
          GLITCHTIP_DSN: ${{ secrets.GLITCHTIP_DSN }}
          SENTRY_AUTH_TOKEN: ${{ secrets.GLITCHTIP_AUTH_TOKEN }}
        run: |
          npx @sentry/cli releases new "${{ github.ref_name }}"
          npx @sentry/cli releases files "${{ github.ref_name }}" upload-sourcemaps dist/client/ --url-prefix '~/'
          npx @sentry/cli releases finalize "${{ github.ref_name }}"
```

### 3. iOS: Swift Crash Handler

**File: `apps/ios/Sources/Services/CrashReporter.swift`**:

```swift
import Foundation
import MetricKit

final class CrashReporter: NSObject, @unchecked Sendable, MXMetricManagerSubscriber {
    private let dsn: String?
    private let release: String
    private let environment: String

    static let shared = CrashReporter()

    override init() {
        self.dsn = nil  // Set after fetching config
        self.release = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
        self.environment = "production"
        super.init()
    }

    func configure(dsn: String?) {
        // Store DSN and install handlers
        guard let dsn else { return }

        // Install NSException handler for Objective-C exceptions
        NSSetUncaughtExceptionHandler { exception in
            CrashReporter.shared.reportException(exception)
        }

        // Subscribe to MetricKit for crash diagnostics (iOS 14+).
        // MetricKit provides crash reports including signal-based crashes
        // (SIGSEGV, SIGABRT, etc.) without the risks of installing raw
        // signal() handlers, which Apple discourages because they interfere
        // with the system crash reporter and debugger, and run in an
        // async-signal-unsafe context where most operations are undefined behavior.
        MXMetricManager.shared.add(self)

        // Check for crash files from previous session
        checkPendingCrashReports()
    }

    // MARK: - MXMetricManagerSubscriber

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for payload in payloads {
            if let crashDiagnostics = payload.crashDiagnostics {
                for crash in crashDiagnostics {
                    let report = CrashReport(
                        type: "MXCrashDiagnostic",
                        message: sanitize(crash.terminationReason ?? "Unknown crash"),
                        stackTrace: crash.callStackTree.jsonRepresentation()
                            .flatMap { String(data: $0, encoding: .utf8) }
                            .map { [$0] } ?? ["<no stack trace>"],
                        release: release,
                        environment: environment
                    )
                    writeCrashReport(report)
                }
            }
        }
        // Attempt to upload any newly written crash reports
        checkPendingCrashReports()
    }

    private func reportException(_ exception: NSException) {
        let report = CrashReport(
            type: exception.name.rawValue,
            message: sanitize(exception.reason ?? "Unknown exception"),
            stackTrace: exception.callStackSymbols,
            release: release,
            environment: environment
        )
        writeCrashReport(report)
    }

    /// Write crash to disk (crash handlers can't do network I/O reliably)
    private func writeCrashReport(_ report: CrashReport) {
        let crashDir = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent("crashes", isDirectory: true)
        try? FileManager.default.createDirectory(at: crashDir, withIntermediateDirectories: true)

        let filename = "crash_\(ISO8601DateFormatter().string(from: Date())).json"
        let file = crashDir.appendingPathComponent(filename)

        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        if let data = try? encoder.encode(report) {
            try? data.write(to: file)
        }
    }

    /// On next launch, upload any pending crash reports
    func checkPendingCrashReports() {
        guard let dsn else { return }
        let parsed = parseDSN(dsn)
        guard let parsed else { return }

        let crashDir = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent("crashes", isDirectory: true)

        guard let files = try? FileManager.default.contentsOfDirectory(
            at: crashDir, includingPropertiesForKeys: nil
        ) else { return }

        for file in files where file.pathExtension == "json" {
            guard let data = try? Data(contentsOf: file),
                  let report = try? JSONDecoder().decode(CrashReport.self, from: data) else {
                continue
            }
            uploadCrashReport(report, to: parsed)
            try? FileManager.default.removeItem(at: file)
        }
    }

    private func uploadCrashReport(
        _ report: CrashReport,
        to endpoint: (baseUrl: String, publicKey: String, projectId: String)
    ) {
        let event: [String: Any] = [
            "event_id": UUID().uuidString.replacingOccurrences(of: "-", with: ""),
            "timestamp": ISO8601DateFormatter().string(from: Date()),
            "platform": "cocoa",
            "level": "fatal",
            "release": report.release,
            "environment": report.environment,
            "exception": [
                "values": [[
                    "type": report.type,
                    "value": report.message,
                    "stacktrace": [
                        "frames": report.stackTrace.reversed().map { frame in
                            ["function": frame, "in_app": true] as [String: Any]
                        }
                    ]
                ]]
            ]
        ]

        guard let body = try? JSONSerialization.data(withJSONObject: event) else { return }
        var request = URLRequest(url: URL(string: "\(endpoint.baseUrl)/api/\(endpoint.projectId)/store/")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(
            "Sentry sentry_version=7, sentry_key=\(endpoint.publicKey)",
            forHTTPHeaderField: "X-Sentry-Auth"
        )
        request.httpBody = body

        URLSession.shared.dataTask(with: request).resume()
    }

    private func sanitize(_ message: String) -> String {
        var result = message
        // Redact hex strings 32+ chars (potential keys/tokens)
        let hexPattern = try! NSRegularExpression(pattern: "[0-9a-f]{32,}", options: .caseInsensitive)
        result = hexPattern.stringByReplacingMatches(
            in: result, range: NSRange(result.startIndex..., in: result),
            withTemplate: "[REDACTED]"
        )
        return result
    }

    private func parseDSN(_ dsn: String) -> (baseUrl: String, publicKey: String, projectId: String)? {
        guard let url = URL(string: dsn) else { return nil }
        let publicKey = url.user ?? ""
        let projectId = url.lastPathComponent
        let baseUrl = "\(url.scheme ?? "https")://\(url.host ?? "")"
        return (baseUrl, publicKey, projectId)
    }

    struct CrashReport: Codable {
        let type: String
        let message: String
        let stackTrace: [String]
        let release: String
        let environment: String
    }
}
```

**File: `apps/ios/Sources/App/LlamenosApp.swift`** — Initialize on launch:

```swift
// In init() or onAppear:
CrashReporter.shared.configure(dsn: appConfig.glitchtipDSN)
```

#### 3a. dSYM Upload in CI

**File: `.github/workflows/mobile-release.yml`** — After archive:

```yaml
      - name: Upload dSYMs to GlitchTip
        if: env.GLITCHTIP_DSN != ''
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.GLITCHTIP_AUTH_TOKEN }}
        run: |
          npx @sentry/cli debug-files upload \
            --include-sources \
            $RUNNER_TEMP/Llamenos.xcarchive/dSYMs/
```

### 4. Android: Enhance Existing CrashReporter

The existing `CrashReporter.kt` already captures crashes to local storage. Extend it to upload to GlitchTip on next launch.

**File: `apps/android/app/src/main/java/org/llamenos/hotline/CrashReporter.kt`** — Add upload method:

```kotlin
// Add to existing CrashReporter class:

private var dsn: String? = null

fun configure(dsn: String?) {
    this.dsn = dsn
    if (dsn != null) {
        uploadPendingCrashReports()
    }
}

private fun uploadPendingCrashReports() {
    val dsn = this.dsn ?: return
    val parsed = parseDSN(dsn) ?: return

    CoroutineScope(Dispatchers.IO).launch {
        val crashes = getCrashLogs()
        for (crashFile in crashes) {
            try {
                val content = crashFile.readText()
                val event = buildSentryEvent(content)
                uploadEvent(event, parsed)
                crashFile.delete()
            } catch (_: Exception) {
                // Upload failure — try next launch
            }
        }
    }
}

private fun buildSentryEvent(crashContent: String): String {
    val eventId = UUID.randomUUID().toString().replace("-", "")
    val sanitized = sanitize(crashContent)
    return """
    {
        "event_id": "$eventId",
        "timestamp": "${Instant.now()}",
        "platform": "java",
        "level": "fatal",
        "release": "${BuildConfig.VERSION_NAME}",
        "environment": "production",
        "exception": {
            "values": [{
                "type": "UncaughtException",
                "value": ${JSONObject.quote(sanitized)}
            }]
        }
    }
    """.trimIndent()
}

private fun uploadEvent(
    event: String,
    endpoint: Triple<String, String, String>,
) {
    val (baseUrl, publicKey, projectId) = endpoint
    val url = URL("$baseUrl/api/$projectId/store/")
    val connection = url.openConnection() as HttpURLConnection
    connection.requestMethod = "POST"
    connection.setRequestProperty("Content-Type", "application/json")
    connection.setRequestProperty(
        "X-Sentry-Auth",
        "Sentry sentry_version=7, sentry_key=$publicKey"
    )
    connection.doOutput = true
    connection.outputStream.write(event.toByteArray())
    connection.responseCode // Trigger the request
    connection.disconnect()
}

private fun sanitize(message: String): String {
    return message
        .replace(Regex("[0-9a-fA-F]{32,}"), "[REDACTED]")
        .replace(Regex("[\\w.-]+@[\\w.-]+\\.\\w+"), "[EMAIL]")
        .replace(Regex("\\+?\\d[\\d\\s-]{8,}"), "[PHONE]")
}

private fun parseDSN(dsn: String): Triple<String, String, String>? {
    return try {
        val url = java.net.URI(dsn)
        val publicKey = url.userInfo ?: return null
        val projectId = url.path.removePrefix("/")
        val baseUrl = "${url.scheme}://${url.host}"
        Triple(baseUrl, publicKey, projectId)
    } catch (_: Exception) {
        null
    }
}
```

**File: `apps/android/app/src/main/java/org/llamenos/hotline/LlamenosApp.kt`** — Configure on startup:

```kotlin
// In onCreate():
crashReporter.configure(dsn = configService.glitchtipDSN)
```

#### 4a. ProGuard Mapping Upload in CI

**File: `.github/workflows/mobile-release.yml`** — After Android build:

```yaml
      - name: Upload ProGuard mappings to GlitchTip
        if: env.GLITCHTIP_DSN != ''
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.GLITCHTIP_AUTH_TOKEN }}
        run: |
          npx @sentry/cli debug-files upload \
            apps/android/app/build/outputs/mapping/release/mapping.txt
```

### 5. Server: Expose GlitchTip DSN in Config

**File: `apps/worker/routes/config.ts`** — Add DSN to public config:

```typescript
// Add to config response (only if configured):
glitchtipDSN: c.env.GLITCHTIP_DSN || null,
```

**File: `apps/worker/types.ts`** — Add to Env:

```typescript
GLITCHTIP_DSN: string  // Optional — empty string if not configured
```

### 6. Admin Dashboard: GlitchTip Link

**File: `src/client/routes/admin/settings.tsx`** — Add GlitchTip section:

```tsx
// In admin settings, add a "Crash Reports" section with a link to GlitchTip:
{config.glitchtipDSN && (
  <SettingsSection title="Crash Reports">
    <a href={glitchtipBaseUrl} target="_blank" rel="noopener noreferrer">
      Open GlitchTip Dashboard
    </a>
  </SettingsSection>
)}
```

### 7. Privacy Safeguards

All crash reporters implement these rules:

1. **No IP logging**: GlitchTip configured with `GLITCHTIP_COLLECT_IPS=false`.
2. **PII sanitization**: Hex strings 32+ chars (keys, tokens), email patterns, and phone patterns are redacted before sending.
3. **No user identification**: No user ID, username, email, or IP attached to crash events.
4. **No breadcrumbs with PII**: No UI interaction logs, no API request URLs with query params.
5. **Configurable retention**: Default 30 days, adjustable via `GLITCHTIP_MAX_EVENT_LIFE_DAYS`.
6. **Opt-in deployment**: GlitchTip is behind a Docker Compose profile (`monitoring`) — not deployed by default.

## Files to Modify

| File | Change |
|------|--------|
| `deploy/docker/docker-compose.yml` | Add GlitchTip + worker services (monitoring profile) |
| `deploy/ansible/vars.example.yml` | Add `llamenos_glitchtip_*` variables |
| `deploy/ansible/templates/caddy.j2` | Add GlitchTip reverse proxy |
| `deploy/ansible/templates/docker-compose.j2` | Conditional GlitchTip inclusion |
| `deploy/ansible/templates/env.j2` | Pass `GLITCHTIP_*` env vars |
| `deploy/helm/llamenos/templates/deployment-glitchtip.yaml` | **New** — Kubernetes deployment |
| `deploy/helm/llamenos/values.yaml` | Add GlitchTip defaults |
| `src/client/lib/crash-reporter.ts` | **New** — Desktop crash reporter client |
| `src/client/components/error-boundary.tsx` | **New** — React error boundary |
| `src/client/routes/__root.tsx` | Wrap app in error boundary, init crash reporter |
| `apps/desktop/src/lib.rs` | Add Rust panic hook with crash file writer |
| `apps/desktop/Cargo.toml` | Add `chrono` and `dirs` dependencies |
| `.github/workflows/tauri-release.yml` | Source map upload step |
| `apps/ios/Sources/Services/CrashReporter.swift` | **New** — iOS crash handler + GlitchTip upload |
| `apps/ios/Sources/App/LlamenosApp.swift` | Init crash reporter |
| `.github/workflows/mobile-release.yml` | dSYM + ProGuard mapping upload steps |
| `apps/android/app/src/main/java/org/llamenos/hotline/CrashReporter.kt` | Add GlitchTip upload + PII sanitization |
| `apps/android/app/src/main/java/org/llamenos/hotline/LlamenosApp.kt` | Configure crash reporter with DSN |
| `apps/worker/routes/config.ts` | Expose `glitchtipDSN` in config response |
| `apps/worker/types.ts` | Add `GLITCHTIP_DSN` to Env |
| `src/client/routes/admin/settings.tsx` | Add GlitchTip dashboard link |

## Testing

### Desktop (Playwright)

- **Error boundary test**: Throw an error inside a route component — verify error boundary renders fallback UI, not a white screen.
- **PII sanitization test**: Unit test `sanitizeMessage()` with hex keys, emails, phone numbers — verify all redacted.
- **DSN parsing test**: Unit test `parseDSN()` with valid and invalid DSNs.
- **Crash reporter disabled test**: Initialize with `dsn: null` — verify `reportError()` is a no-op.

### iOS (XCTest)

- **Unit test**: `CrashReporterTests` — verify `sanitize()` strips hex strings and emails.
- **Unit test**: Verify `parseDSN()` extracts components correctly.
- **Unit test**: Verify crash file is written to disk.

### Android (Unit)

- **Unit test**: `CrashReporterTest` — verify `sanitize()` patterns.
- **Unit test**: Verify `parseDSN()` returns correct triple.
- **Unit test**: Verify `buildSentryEvent()` produces valid JSON.

### Integration

- **Docker Compose test**: Start with `--profile monitoring` — verify GlitchTip is accessible and accepts events.
- **End-to-end**: Trigger a crash on desktop, verify event appears in GlitchTip UI with sanitized content and source-mapped stack trace.

## Acceptance Criteria

- [ ] GlitchTip deployable via Docker Compose (`--profile monitoring`) and Ansible
- [ ] GlitchTip deployable via Helm chart (`glitchtip.enabled: true`)
- [ ] Desktop: React error boundary catches rendering errors, shows fallback UI, reports to GlitchTip
- [ ] Desktop: Unhandled JS errors and promise rejections reported to GlitchTip
- [ ] Desktop: Rust panics written to crash files, uploaded on next launch
- [ ] iOS: NSException crashes captured via `NSSetUncaughtExceptionHandler`, signal crashes captured via MetricKit `MXCrashDiagnostic`, stored locally, uploaded on next launch
- [ ] Android: Existing `CrashReporter` enhanced with GlitchTip upload
- [ ] All crash reports have PII sanitized (hex keys, emails, phone numbers redacted)
- [ ] GlitchTip configured with `GLITCHTIP_COLLECT_IPS=false`
- [ ] CI uploads source maps (desktop), dSYMs (iOS), ProGuard mappings (Android) for symbolication
- [ ] Admin settings page links to GlitchTip dashboard (when configured)
- [ ] Crash reporting is opt-in (not deployed by default)
- [ ] Data retention configurable (default 30 days)
- [ ] DSN exposed via `/api/config` response (clients self-configure)
- [ ] All platform tests pass

## Risk Assessment

- **MetricKit delivery delay**: MetricKit crash diagnostics are delivered up to 24 hours after the crash (batched by the OS). This means signal-based crashes (SIGSEGV, SIGABRT, etc.) will not be reported immediately on next launch, but will arrive via the `didReceive(_:)` callback when the OS delivers them. `NSSetUncaughtExceptionHandler` covers Objective-C exceptions immediately. Raw `signal()` handlers are intentionally NOT used per Apple guidelines -- they interfere with the system crash reporter, are async-signal-unsafe, and can cause undefined behavior.
- **GlitchTip availability**: If GlitchTip is down, crash uploads fail silently. Crash files persist on disk and are retried on next launch. This is acceptable — crash reporting is best-effort.
- **PII leakage edge cases**: Stack traces may contain user-visible strings (note content in error messages). The sanitization regex catches common patterns but cannot guarantee complete PII removal. Mitigation: keep error messages generic, never include user data in error strings in application code.
- **Storage overhead**: GlitchTip requires its own PostgreSQL database and Redis. Ansible/Helm templates should provision these alongside existing infrastructure. For small deployments, GlitchTip can share the existing PostgreSQL instance with a separate database.
- **Sentry SDK compatibility**: GlitchTip supports Sentry SDK v7 protocol. The custom crash reporter implementations use the raw Sentry store API directly (no SDK dependency). This avoids SDK version lock-in but means no automatic breadcrumbs or session tracking — acceptable for the privacy constraints.
