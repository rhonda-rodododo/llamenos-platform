# Epic 293: Client Crash Reporting & Diagnostics

**Status: COMPLETE**

## Overview

Privacy-first crash reporting across all three client platforms (Desktop, iOS, Android) with
opt-in consent, local crash log storage, and optional upload to a self-hosted GlitchTip
(Sentry-compatible) error tracking service.

## Privacy Guarantees

- Crash reporting is strictly **opt-in** — disabled by default on all platforms
- No PII is ever included in crash reports (no user IDs, keys, names, or phone numbers)
- Reports contain only: error type, stack trace, app version, OS version, device model
- The Sentry DSN is fetched from the hub server config, not hardcoded
- Users can view, send, or discard pending crash reports at any time

## Deliverables

### 1. GlitchTip Service (Docker Compose)
Behind `monitoring` profile. Uses shared PostgreSQL + Redis for Celery.

### 2. Ansible Templates
Conditional GlitchTip in docker-compose.j2, Caddy reverse proxy, env vars.

### 3. Backend Config
Serves `sentryDsn` from `GLITCHTIP_DSN` env var via `/api/config`.

### 4. Android CrashReporter
Enhanced with Sentry upload, opt-in consent, DSN from hub config.

### 5. iOS CrashReportingService
NSException + signal handlers, local storage, async Sentry upload.

### 6. Desktop Error Boundary + Crash Reporting
Global error handlers, localStorage-based reports, Settings UI.

### 7. i18n Strings
`crashReporting` section in all 13 locale files.
