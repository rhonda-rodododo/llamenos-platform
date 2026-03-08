# Epic 295: Admin System Health Dashboard

**Status**: PENDING
**Priority**: Medium
**Depends on**: None
**Blocks**: None
**Branch**: `desktop`

## Summary

Add an in-app "System" tab to the admin panel that shows real-time system health, service status, call metrics, storage usage, backup status, and volunteer activity. A new `GET /api/system/health` endpoint aggregates data from the health endpoint, Prometheus metrics, and Durable Objects (CF) or PostgreSQL (self-hosted). All three platforms (desktop, iOS, Android) get a read-only dashboard with 30-second auto-refresh.

## Problem Statement

Admins currently have no visibility into infrastructure health from within the Llamenos app. They must SSH into the server and manually query health endpoints or check Docker container status. This creates two problems:

1. **Delayed incident detection.** An admin who is not also a server operator may not realize that the system is degraded (e.g., backup failures, relay disconnections) until call routing breaks.
2. **No operational context during calls.** When volunteers report issues ("my calls aren't connecting"), admins have no in-app way to confirm whether it's a server problem, a telephony provider outage, or a local issue.

A system health dashboard gives admins a single-pane view of operational status without requiring server access, reducing mean time to detection for infrastructure issues.

## Implementation

### Phase 1: Backend Endpoint

Create a new route that aggregates system health data. This is admin-only.

**File: `apps/worker/routes/system.ts`**

```typescript
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireRole } from '../lib/auth'

const system = new Hono<AppEnv>()

interface SystemHealth {
  server: {
    status: 'ok' | 'degraded'
    uptime: number | null
    version: string
    nodeVersion: string | null
  }
  services: Record<string, {
    status: 'ok' | 'failing' | 'unchecked'
    detail?: string
  }>
  calls: {
    todayTotal: number
    activeCalls: number
    avgResponseTimeMs: number | null
    missedToday: number
  }
  storage: {
    databaseSizeMb: number | null
    blobStorageMb: number | null
    relaySizeMb: number | null
  }
  backup: {
    lastBackupAt: string | null
    lastBackupSizeMb: number | null
    lastVerifyAt: string | null
    lastVerifyResult: 'pass' | 'fail' | null
  }
  volunteers: {
    totalActive: number
    onlineNow: number
    onShiftNow: number
    currentShiftCoverage: number // percentage of required slots filled
  }
  metrics: {
    errorRateLast24h: number // errors per hour average
    requestsLast24h: number
    p95LatencyMs: number | null
  }
}

system.get('/health', requireRole('admin'), async (c) => {
  const env = c.env as unknown as Record<string, unknown>
  const isNode = typeof process !== 'undefined' && process.env?.PLATFORM === 'node'

  // Aggregate data from multiple sources
  const [serverHealth, callMetrics, storageInfo, backupInfo, volunteerInfo] = await Promise.allSettled([
    fetchServerHealth(env),
    fetchCallMetrics(env, isNode),
    fetchStorageInfo(env, isNode),
    fetchBackupInfo(env, isNode),
    fetchVolunteerInfo(env, isNode),
  ])

  const health: SystemHealth = {
    server: serverHealth.status === 'fulfilled' ? serverHealth.value : {
      status: 'degraded', uptime: null, version: 'unknown', nodeVersion: null,
    },
    services: serverHealth.status === 'fulfilled'
      ? serverHealth.value.services
      : { app: { status: 'failing', detail: 'Health check failed' } },
    calls: callMetrics.status === 'fulfilled' ? callMetrics.value : {
      todayTotal: 0, activeCalls: 0, avgResponseTimeMs: null, missedToday: 0,
    },
    storage: storageInfo.status === 'fulfilled' ? storageInfo.value : {
      databaseSizeMb: null, blobStorageMb: null, relaySizeMb: null,
    },
    backup: backupInfo.status === 'fulfilled' ? backupInfo.value : {
      lastBackupAt: null, lastBackupSizeMb: null, lastVerifyAt: null, lastVerifyResult: null,
    },
    volunteers: volunteerInfo.status === 'fulfilled' ? volunteerInfo.value : {
      totalActive: 0, onlineNow: 0, onShiftNow: 0, currentShiftCoverage: 0,
    },
    metrics: {
      errorRateLast24h: 0, requestsLast24h: 0, p95LatencyMs: null,
    },
  }

  return c.json(health)
})

export default system
```

The `fetch*` helper functions query:
- `fetchServerHealth`: calls the existing `/api/health` endpoint internally and adds uptime/version
- `fetchCallMetrics`: queries `RecordsDO` (CF) or PostgreSQL `kv_store` for today's call records, aggregates counts
- `fetchStorageInfo`: on Node.js, runs `pg_database_size()` and checks MinIO bucket size; on CF, returns `null` (CF manages storage)
- `fetchBackupInfo`: on Node.js, reads the backup log and state file from disk; on CF, returns `null`
- `fetchVolunteerInfo`: queries `IdentityDO` for active volunteers and `ShiftManagerDO` for current shift status

### Phase 2: Desktop UI

**File: `src/client/routes/admin/system.tsx`**

A new TanStack Router route under `/admin/system` showing a card-based dashboard.

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useEffect, useState, useCallback } from 'react'
import { fetchSystemHealth, type SystemHealth } from '@/lib/api'

export const Route = createFileRoute('/admin/system')({
  component: SystemHealthPage,
})

function SystemHealthPage() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const refresh = useCallback(async () => {
    try {
      const data = await fetchSystemHealth()
      setHealth(data)
      setLastRefresh(new Date())
    } catch {
      // Keep stale data visible, show error indicator
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!isAdmin) return
    refresh()
    const interval = setInterval(refresh, 30_000)
    return () => clearInterval(interval)
  }, [isAdmin, refresh])

  if (!isAdmin) return null

  return (
    <div className="space-y-6 p-6" data-testid="system-health-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('admin.system.title')}</h1>
        <span className="text-sm text-muted-foreground">
          {t('admin.system.last_refresh', { time: lastRefresh.toLocaleTimeString() })}
        </span>
      </div>

      {/* Server Status Card */}
      <StatusCard title={t('admin.system.server')} data-testid="server-status-card">
        <StatusRow label={t('admin.system.status')} value={health?.server.status} />
        <StatusRow label={t('admin.system.uptime')} value={formatUptime(health?.server.uptime)} />
        <StatusRow label={t('admin.system.version')} value={health?.server.version} />
      </StatusCard>

      {/* Service Health Card */}
      <StatusCard title={t('admin.system.services')} data-testid="services-card">
        {health?.services && Object.entries(health.services).map(([name, svc]) => (
          <StatusRow key={name} label={name} value={svc.status} isStatus />
        ))}
      </StatusCard>

      {/* Call Metrics Card */}
      <StatusCard title={t('admin.system.calls')} data-testid="calls-card">
        <StatusRow label={t('admin.system.calls_today')} value={health?.calls.todayTotal} />
        <StatusRow label={t('admin.system.active_calls')} value={health?.calls.activeCalls} />
        <StatusRow label={t('admin.system.avg_response')} value={health?.calls.avgResponseTimeMs ? `${health.calls.avgResponseTimeMs}ms` : '—'} />
        <StatusRow label={t('admin.system.missed_calls')} value={health?.calls.missedToday} />
      </StatusCard>

      {/* Storage Card */}
      <StatusCard title={t('admin.system.storage')} data-testid="storage-card">
        <StatusRow label={t('admin.system.db_size')} value={health?.storage.databaseSizeMb ? `${health.storage.databaseSizeMb} MB` : '—'} />
        <StatusRow label={t('admin.system.blob_storage')} value={health?.storage.blobStorageMb ? `${health.storage.blobStorageMb} MB` : '—'} />
      </StatusCard>

      {/* Backup Status Card */}
      <StatusCard title={t('admin.system.backup')} data-testid="backup-card">
        <StatusRow label={t('admin.system.last_backup')} value={health?.backup.lastBackupAt || '—'} />
        <StatusRow label={t('admin.system.backup_size')} value={health?.backup.lastBackupSizeMb ? `${health.backup.lastBackupSizeMb} MB` : '—'} />
        <StatusRow label={t('admin.system.last_verify')} value={health?.backup.lastVerifyAt || '—'} />
      </StatusCard>

      {/* Volunteer Activity Card */}
      <StatusCard title={t('admin.system.volunteers')} data-testid="volunteers-card">
        <StatusRow label={t('admin.system.total_active')} value={health?.volunteers.totalActive} />
        <StatusRow label={t('admin.system.online_now')} value={health?.volunteers.onlineNow} />
        <StatusRow label={t('admin.system.on_shift')} value={health?.volunteers.onShiftNow} />
        <StatusRow label={t('admin.system.shift_coverage')} value={`${health?.volunteers.currentShiftCoverage ?? 0}%`} />
      </StatusCard>
    </div>
  )
}
```

### Phase 3: Navigation Integration

Add "System" as a new admin nav item in the sidebar, using the `Monitor` lucide icon.

**File: `src/client/routes/__root.tsx`** (extend admin nav section)

Add a `NavLink` to `/admin/system` with icon `Monitor` and i18n key `admin.system.nav` in the admin navigation section (alongside existing `/admin/settings` and `/admin/hubs` links).

### Phase 4: iOS View

**File: `apps/ios/Sources/Views/Admin/SystemHealthView.swift`**

```swift
import SwiftUI

struct SystemHealthView: View {
    @Environment(AppState.self) private var appState
    @State private var health: SystemHealthResponse?
    @State private var isLoading = true
    @State private var lastRefresh = Date()

    var body: some View {
        List {
            // Server Status
            Section(header: Text(NSLocalizedString("admin_system_server", comment: "Server"))) {
                StatusRow(label: "Status", value: health?.server.status ?? "—", isStatus: true)
                StatusRow(label: "Uptime", value: formatUptime(health?.server.uptime))
                StatusRow(label: "Version", value: health?.server.version ?? "—")
            }

            // Services
            Section(header: Text(NSLocalizedString("admin_system_services", comment: "Services"))) {
                if let services = health?.services {
                    ForEach(Array(services.keys.sorted()), id: \.self) { key in
                        StatusRow(
                            label: key.capitalized,
                            value: services[key]?.status ?? "unchecked",
                            isStatus: true
                        )
                    }
                }
            }

            // Call Metrics
            Section(header: Text(NSLocalizedString("admin_system_calls", comment: "Calls"))) {
                StatusRow(label: "Today", value: "\(health?.calls.todayTotal ?? 0)")
                StatusRow(label: "Active", value: "\(health?.calls.activeCalls ?? 0)")
                StatusRow(label: "Missed", value: "\(health?.calls.missedToday ?? 0)")
            }

            // Volunteers
            Section(header: Text(NSLocalizedString("admin_system_volunteers", comment: "Volunteers"))) {
                StatusRow(label: "Online", value: "\(health?.volunteers.onlineNow ?? 0)")
                StatusRow(label: "On Shift", value: "\(health?.volunteers.onShiftNow ?? 0)")
                StatusRow(label: "Coverage", value: "\(health?.volunteers.currentShiftCoverage ?? 0)%")
            }

            // Backup
            Section(header: Text(NSLocalizedString("admin_system_backup", comment: "Backup"))) {
                StatusRow(label: "Last Backup", value: health?.backup.lastBackupAt ?? "—")
                StatusRow(label: "Last Verify", value: health?.backup.lastVerifyAt ?? "—")
            }
        }
        .navigationTitle(NSLocalizedString("admin_system_title", comment: "System Health"))
        .refreshable { await refresh() }
        .task { await refresh() }
        .task(id: "auto-refresh") {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                await refresh()
            }
        }
    }

    private func refresh() async {
        do {
            health = try await appState.apiService.fetchSystemHealth()
            lastRefresh = Date()
        } catch {
            // Keep stale data visible
        }
        isLoading = false
    }

    private func formatUptime(_ seconds: Int?) -> String {
        guard let s = seconds else { return "—" }
        let days = s / 86400
        let hours = (s % 86400) / 3600
        return days > 0 ? "\(days)d \(hours)h" : "\(hours)h"
    }
}
```

### Phase 5: Android View

**File: `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/SystemHealthScreen.kt`**

```kotlin
@Composable
fun SystemHealthScreen(
    viewModel: AdminViewModel = hiltViewModel()
) {
    val health by viewModel.systemHealth.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoadingHealth.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        while (true) {
            viewModel.refreshSystemHealth()
            delay(30_000)
        }
    }

    LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        // Server Status
        item {
            SectionCard(title = stringResource(R.string.admin_system_server)) {
                StatusRow("Status", health?.server?.status ?: "—", isStatus = true)
                StatusRow("Uptime", formatUptime(health?.server?.uptime))
                StatusRow("Version", health?.server?.version ?: "—")
            }
        }

        // Services
        item {
            SectionCard(title = stringResource(R.string.admin_system_services)) {
                health?.services?.forEach { (name, svc) ->
                    StatusRow(name.replaceFirstChar { it.uppercase() }, svc.status, isStatus = true)
                }
            }
        }

        // Call Metrics, Volunteers, Backup sections follow same pattern
    }
}
```

### Phase 6: i18n Strings

Add to `packages/i18n/locales/en.json`:

```json
{
  "admin": {
    "system": {
      "nav": "System",
      "title": "System Health",
      "last_refresh": "Last refreshed: {{time}}",
      "server": "Server",
      "status": "Status",
      "uptime": "Uptime",
      "version": "Version",
      "services": "Services",
      "calls": "Call Metrics",
      "calls_today": "Calls Today",
      "active_calls": "Active Calls",
      "avg_response": "Avg Response",
      "missed_calls": "Missed Calls",
      "storage": "Storage",
      "db_size": "Database",
      "blob_storage": "Blob Storage",
      "backup": "Backup Status",
      "last_backup": "Last Backup",
      "backup_size": "Backup Size",
      "last_verify": "Last Verify",
      "volunteers": "Volunteers",
      "total_active": "Total Active",
      "online_now": "Online Now",
      "on_shift": "On Shift",
      "shift_coverage": "Shift Coverage"
    }
  }
}
```

> **Note**: Codegen flattens nested keys with `_`, so `admin.system.title` becomes `admin_system_title` in iOS `.strings` and Android `R.string.admin_system_title`. Desktop uses the nested form via `t('admin.system.title')`.

Propagate to all 13 locales, then run `bun run i18n:codegen` and `bun run i18n:validate:all`.

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/worker/routes/system.ts` | Create | Backend endpoint aggregating system health |
| `apps/worker/index.ts` | Extend | Mount `/api/system` route |
| `src/client/lib/api.ts` | Extend | Add `fetchSystemHealth()` API function and `SystemHealth` type |
| `src/client/routes/admin/system.tsx` | Create | Desktop system health dashboard page |
| `src/client/routes/__root.tsx` | Extend | Add "System" NavLink to admin nav section |
| `apps/ios/Sources/Views/Admin/SystemHealthView.swift` | Create | iOS system health dashboard |
| `apps/ios/Sources/Views/Admin/AdminTabView.swift` | Extend | Add SystemHealthView navigation link |
| `apps/ios/Sources/Services/APIService.swift` | Extend | Add `fetchSystemHealth()` method |
| `apps/ios/Sources/Models/SystemHealth.swift` | Create | Codable model for system health response |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/SystemHealthScreen.kt` | Create | Android system health dashboard |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/AdminScreen.kt` | Extend | Add SystemHealthScreen tab |
| `apps/android/app/src/main/java/org/llamenos/hotline/model/AdminModels.kt` | Extend | Add SystemHealth data classes |
| `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt` | Extend | Add fetchSystemHealth endpoint |
| `packages/i18n/locales/en.json` | Extend | Add admin system health strings |
| `packages/i18n/locales/*.json` | Extend | Propagate new strings to all 13 locales |
| `tests/admin-system.spec.ts` | Create | Playwright E2E test for system health page |

## Testing

1. **Backend unit test**: Call `GET /api/system/health` as admin. Verify response matches `SystemHealth` schema. Call as non-admin — verify 403.

2. **Desktop E2E (Playwright)**: Navigate to `/admin/system`. Verify all 6 cards render with data-testid selectors. Wait 35 seconds, verify auto-refresh updates the "Last refreshed" timestamp.

3. **iOS XCUITest**: Navigate to Admin tab, tap System Health. Verify server status section renders. Pull-to-refresh triggers reload.

4. **Android UI test**: Navigate to Admin > System Health. Verify section cards render. Scroll to bottom to verify all sections visible.

5. **Degraded state test**: Stop PostgreSQL container. Verify system health page shows `postgres: failing` in the services section. Restart PostgreSQL, verify recovery within 30 seconds.

6. **i18n validation**: Run `bun run i18n:validate:all` after adding new strings.

## Acceptance Criteria

- [ ] `GET /api/system/health` returns aggregated health data, admin-only (403 for non-admins)
- [ ] Desktop: System health page accessible at `/admin/system` with 6 status cards
- [ ] Desktop: Auto-refresh every 30 seconds
- [ ] iOS: SystemHealthView in admin tab with pull-to-refresh
- [ ] Android: SystemHealthScreen in admin tab with auto-refresh
- [ ] Service status shows individual check results (postgres, storage, relay)
- [ ] Call metrics show today's totals (calls, active, missed, avg response time)
- [ ] Volunteer section shows online count, on-shift count, shift coverage percentage
- [ ] Backup section shows last backup time and last verify result
- [ ] All strings internationalized across 13 locales
- [ ] Playwright E2E test for desktop system health page

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| System health endpoint is slow (aggregates from multiple sources) | Medium | Low | Use `Promise.allSettled` — partial failures don't block the response; each source has a 5-second timeout |
| Storage size queries expensive on large databases | Low | Low | `pg_database_size()` is fast (reads pg_stat); MinIO bucket size uses HEAD bucket API |
| CF Workers have limited system metrics available | Medium | Low | CF-specific fields return `null`; dashboard shows "N/A" gracefully. CF has its own analytics dashboard |
| Auto-refresh creates unnecessary load | Low | Low | 30-second interval is modest; endpoint is lightweight; only fires when admin is viewing the page |
| Mobile views lag behind desktop feature set | Low | Medium | Mobile views are read-only dashboards — simpler to implement; API is the same |
