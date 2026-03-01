# Epic 213: Production Hardening

## Goal

Prepare the entire stack for production deployment: error monitoring, crash reporting, performance optimization, security review, and operational readiness.

## Context

The app is feature-complete across desktop, iOS, and Android. This epic addresses the gap between "it works in development" and "it's ready for real users under real conditions."

## Implementation

### 1. Error Monitoring & Crash Reporting

**Desktop (Tauri)**:
- Already has Tauri's built-in error handling
- Add window error handler for uncaught JS exceptions
- Log to file via `tauri-plugin-log` (already installed)

**iOS**:
- Add lightweight crash reporter using `NSSetUncaughtExceptionHandler`
- Store crash logs locally, upload on next launch (opt-in)
- No third-party crash SDK (privacy commitment)

**Android**:
- Add `Thread.setDefaultUncaughtExceptionHandler` for crash capture
- Store crash logs in app-private storage, upload on next launch (opt-in)
- Custom `CrashReporter` singleton with deferred upload

### 2. Network Resilience

**All platforms**:
- Retry with exponential backoff for transient failures (408, 429, 500, 502, 503, 504)
- Request timeout: 30s connect, 60s read
- Offline detection with UI indicator
- Queue failed note/message creation for retry when connectivity returns

**Desktop specific**:
- Use `navigator.onLine` + fetch heartbeat for reliable offline detection
- Store pending operations in Tauri Store

**Mobile specific**:
- iOS: `NWPathMonitor` for network state
- Android: `ConnectivityManager.NetworkCallback` for network state

### 3. Performance Optimization

**Desktop**:
- Lazy-load route chunks (already partially done via Vite code splitting)
- Virtual scrolling for large note/shift lists (TanStack Virtual)
- Debounce search inputs (already done)

**iOS**:
- Use `LazyVStack` for all list views (already done)
- Implement `@MainActor` annotations where missing
- Cache decoded notes in memory (LRU, max 100)

**Android**:
- Use `LazyColumn` for all lists (already done)
- Implement proper `remember` caching for expensive computations
- Use `ImmutableList` for Compose stability optimization
- R8 full mode with mapping file upload for release builds

### 4. Security Review Checklist

Pre-launch security verification:

- [ ] All API endpoints require authentication (except public routes)
- [ ] Rate limiting on all mutation endpoints
- [ ] CORS restricted to known origins in production
- [ ] CSP headers present and restrictive
- [ ] No secrets or PII in logs
- [ ] nsec never leaves secure storage (Keychain/Keystore/Stronghold)
- [ ] PIN brute-force protection (lockout after N attempts)
- [ ] Session token rotation on sensitive operations
- [ ] Webhook signature validation for all telephony/messaging providers
- [ ] E2EE key material zeroed after use
- [ ] No test/demo code reachable in production builds

### 5. Operational Readiness

**Monitoring endpoints**:
- `/api/health` — already exists
- `/api/health/detailed` — add DO health, uptime, version info (admin-only)

**Logging**:
- Structured JSON logging in production
- Request ID propagation for tracing
- Log rotation in Docker/self-hosted

**Backup verification**:
- Test restore from encrypted backups
- Document recovery procedures

## Verification

1. Error handler catches and logs test crashes on all platforms
2. Network resilience: app functions offline (cached data), syncs when online
3. Performance: 60fps scrolling on production build with 100+ notes
4. Security checklist all green
5. Health endpoint returns detailed status for admin
6. Crash report upload works (opt-in)

## Dependencies

- Epic 211 (Mobile CI) — CI must pass before production deploy
- Epic 212 (Test Coverage) — comprehensive tests validate hardening

## Blocks

- Nothing — this is the final hardening before launch
