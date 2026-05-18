# Cross-Platform E2E Test Seeding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-platform data seeding reimplementations with a single declarative `POST /api/test-seed` endpoint that all E2E suites share.

**Architecture:** New dev-only endpoint in `apps/worker/routes/dev.ts` accepts a seed spec (entity types, records, reports, shifts, members, contacts) and calls the existing service layer. Android `TestApiClient.kt` shrinks from 642 lines to ~120 — just HTTP + seed spec construction. Entity type definitions move server-side as templates.

**Tech Stack:** Hono route handler, Zod validation, existing service layer (`services.settings`, `services.cases`, `services.shifts`, `services.conversations`, `services.contacts`, `services.identity`)

**Spec:** `docs/superpowers/specs/2026-05-17-cross-platform-test-seeding-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/worker/routes/dev.ts` | Modify | Add `POST /test-seed` handler + seed spec Zod schema + entity type templates |
| `tests/api-helpers.ts` | Modify | Add `seedViaApi()` wrapper that calls `POST /test-seed` for desktop tests (optional parity) |
| `apps/android/.../helpers/TestApiClient.kt` | Rewrite | Thin client: `seed()` posts to `/api/test-seed`, `SeedSpec`/`SeedResult` data classes |
| `apps/android/.../steps/events/EventsSteps.kt` | Modify | Use `testApiClient.seed(spec)` instead of `setupCmsViaApi()` |
| `apps/android/.../steps/triage/TriageSteps.kt` | Modify | Same migration |
| `apps/android/.../steps/cases/CaseListSteps.kt` | Modify | Same migration |
| `apps/android/.../steps/cases/CaseDetailSteps.kt` | Modify | Same migration |
| `apps/android/.../steps/calls/ActiveCallSteps.kt` | Modify | Use `seed()` for shift creation |
| `apps/android/.../steps/hubs/HubSwitchSteps.kt` | Modify | Use `seed()` for hub membership |
| `apps/android/.../steps/ScenarioHooks.kt` | Modify | Remove TestApiClient.bootstrapAdmin complexity |

---

### Task 1: Add `POST /test-seed` endpoint with Zod schema

**Files:**
- Modify: `apps/worker/routes/dev.ts`

This task adds the seeding endpoint with full Zod validation, entity type templates, and service layer calls. The endpoint is gated by `ENVIRONMENT=development` + `checkResetSecret()` — identical guards to all existing dev.ts endpoints.

- [ ] **Step 1: Define the seed spec Zod schema**

Add after the existing imports at the top of `apps/worker/routes/dev.ts`:

```typescript
import { z } from 'zod'
```

Add the schema definition before the `test-setup-cms` endpoint (around line 236):

```typescript
// ─── Declarative Test Seeding (cross-platform E2E helper) ─────────────────
// Single endpoint that creates all test data from a declarative spec.
// Replaces per-platform reimplementations (TestApiClient.kt, etc.)
// with one server-side implementation using proven service calls.

const seedEntityTypeSchema = z.object({
  template: z.enum(['arrest_case', 'protest_event']),
  records: z.number().int().min(0).max(50).optional().default(0),
  assignTo: z.array(z.string()).optional().default([]),
})

const seedReportTypeSchema = z.object({
  template: z.enum(['general_report']),
  triageReports: z.number().int().min(0).max(50).optional().default(0),
})

const seedShiftSchema = z.object({
  pubkey: z.string().min(64).max(64),
  allDay: z.boolean().optional().default(true),
})

const seedMemberSchema = z.object({
  pubkey: z.string().min(64).max(64),
  roleIds: z.array(z.string()).optional().default(['role-volunteer']),
})

const seedContactSchema = z.object({
  displayName: z.string().min(1),
  contactType: z.string().optional().default('person'),
})

const seedSpecSchema = z.object({
  hubId: z.string().uuid(),
  adminSeed: z.string().length(64).regex(/^[0-9a-f]+$/),

  permissions: z.object({
    grantVolunteerCms: z.boolean().optional().default(false),
    enableCaseManagement: z.boolean().optional().default(false),
  }).optional().default({}),

  entityTypes: z.array(seedEntityTypeSchema).optional().default([]),
  reportTypes: z.array(seedReportTypeSchema).optional().default([]),
  shifts: z.array(seedShiftSchema).optional().default([]),
  members: z.array(seedMemberSchema).optional().default([]),
  contacts: z.array(seedContactSchema).optional().default([]),
})
```

- [ ] **Step 2: Define entity type templates**

Add template definitions below the schema:

```typescript
function entityTypeTemplate(name: 'arrest_case' | 'protest_event') {
  if (name === 'arrest_case') {
    return {
      id: crypto.randomUUID(),
      name: 'arrest_case',
      label: 'Arrest Case',
      labelPlural: 'Arrest Cases',
      description: 'BDD test entity type',
      category: 'case' as const,
      color: '#ef4444',
      statuses: [
        { value: 'reported', label: 'Reported', color: '#f59e0b', order: 1 },
        { value: 'confirmed', label: 'Confirmed', color: '#3b82f6', order: 2 },
        { value: 'in_custody', label: 'In Custody', color: '#ef4444', order: 3 },
        { value: 'released', label: 'Released', color: '#22c55e', order: 4 },
        { value: 'case_closed', label: 'Case Closed', color: '#6b7280', order: 5, isClosed: true },
      ],
      defaultStatus: 'reported',
      closedStatuses: ['case_closed'],
      fields: [
        { id: crypto.randomUUID(), name: 'arrest_datetime', label: 'Arrest Date/Time', type: 'date', required: true, order: 1, accessLevel: 'all', indexable: false, indexType: 'none', visibleToUsers: true, editableByUsers: true, hubEditable: true },
        { id: crypto.randomUUID(), name: 'location', label: 'Location', type: 'text', required: false, order: 2, accessLevel: 'all', indexable: false, indexType: 'none', visibleToUsers: true, editableByUsers: true, hubEditable: true },
        { id: crypto.randomUUID(), name: 'charges', label: 'Charges', type: 'textarea', required: false, order: 3, accessLevel: 'all', indexable: false, indexType: 'none', visibleToUsers: true, editableByUsers: true, hubEditable: true },
      ],
      numberPrefix: 'JS',
      numberingEnabled: true,
    }
  }
  return {
    id: crypto.randomUUID(),
    name: 'protest_event',
    label: 'Protest Event',
    labelPlural: 'Protest Events',
    description: 'BDD test event entity type',
    category: 'event' as const,
    color: '#3b82f6',
    statuses: [
      { value: 'planned', label: 'Planned', color: '#f59e0b', order: 1 },
      { value: 'active', label: 'Active', color: '#22c55e', order: 2 },
      { value: 'completed', label: 'Completed', color: '#6b7280', order: 3, isClosed: true },
    ],
    defaultStatus: 'planned',
    closedStatuses: ['completed'],
    fields: [
      { id: crypto.randomUUID(), name: 'event_date', label: 'Event Date', type: 'date', required: true, order: 1, accessLevel: 'all', indexable: false, indexType: 'none', visibleToUsers: true, editableByUsers: true, hubEditable: true },
      { id: crypto.randomUUID(), name: 'location', label: 'Location', type: 'text', required: false, order: 2, accessLevel: 'all', indexable: false, indexType: 'none', visibleToUsers: true, editableByUsers: true, hubEditable: true },
    ],
    numberPrefix: 'EVT',
    numberingEnabled: true,
  }
}
```

- [ ] **Step 3: Implement the endpoint handler**

Add the route handler:

```typescript
dev.post('/test-seed', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not Found' }, 404)
  }
  if (!checkResetSecret(c)) {
    return c.json({ error: 'Not Found' }, 404)
  }

  const raw = await c.req.json().catch(() => ({}))
  const parsed = seedSpecSchema.safeParse(raw)
  if (!parsed.success) {
    return c.json({ error: 'Invalid seed spec', details: parsed.error.flatten() }, 400)
  }
  const spec = parsed.data
  const services = c.get('services')
  const errors: string[] = []

  // Ensure roles exist (CI fresh database may be empty)
  await services.settings.ensureInit({ ENVIRONMENT: c.env.ENVIRONMENT })

  // ── Permissions ──
  if (spec.permissions.enableCaseManagement) {
    try {
      await services.settings.setCaseManagementEnabled({ enabled: true }, spec.hubId)
      // Also enable globally for non-hub-scoped checks
      await services.settings.setCaseManagementEnabled({ enabled: true })
    } catch (e) {
      errors.push(`enableCaseManagement: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (spec.permissions.grantVolunteerCms) {
    try {
      await services.settings.updateRole('role-volunteer', {
        permissions: [
          'calls:answer', 'calls:read-active',
          'notes:create', 'notes:read-own', 'notes:update-own', 'notes:reply',
          'conversations:claim', 'conversations:send', 'conversations:read-assigned',
          'conversations:claim-sms', 'conversations:claim-whatsapp',
          'conversations:claim-signal', 'conversations:claim-rcs', 'conversations:claim-web',
          'shifts:read-own', 'bans:report',
          'reports:read-all', 'reports:read-assigned', 'reports:send-message',
          'files:upload', 'files:download-own',
          'cases:create', 'cases:read-all', 'cases:update', 'cases:assign',
          'events:read', 'events:create', 'evidence:upload', 'evidence:download',
          'hubs:read', 'settings:read',
          'hubs:configure', 'telephony:view-providers',
        ],
      })
    } catch (e) {
      errors.push(`grantVolunteerCms: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── Members ──
  const memberResults: Array<{ pubkey: string }> = []
  for (const member of spec.members) {
    try {
      await services.identity.setHubRole({
        pubkey: member.pubkey,
        hubId: spec.hubId,
        roleIds: member.roleIds,
      })
      memberResults.push({ pubkey: member.pubkey })
    } catch (e) {
      errors.push(`addMember ${member.pubkey.slice(0, 16)}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── Entity Types ──
  const entityTypeResults: Array<{ id: string; name: string; category: string; defaultStatus: string }> = []
  for (const etSpec of spec.entityTypes) {
    const template = entityTypeTemplate(etSpec.template)
    try {
      const created = await services.settings.createEntityType({
        ...template,
        hubId: spec.hubId,
      })
      entityTypeResults.push({
        id: created.id,
        name: created.name,
        category: created.category ?? template.category,
        defaultStatus: created.defaultStatus ?? template.defaultStatus,
      })
    } catch (e) {
      // May already exist — try to find it
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('unique')) {
        try {
          const { entityTypes: existing } = await services.settings.getEntityTypes(spec.hubId)
          const found = existing.find(et => et.name === etSpec.template)
          if (found) {
            entityTypeResults.push({
              id: found.id,
              name: found.name,
              category: found.category ?? template.category,
              defaultStatus: found.defaultStatus ?? template.defaultStatus,
            })
            errors.push(`entityType ${etSpec.template}: already exists, reusing ${found.id}`)
          } else {
            errors.push(`entityType ${etSpec.template}: create failed and not found: ${msg}`)
          }
        } catch {
          errors.push(`entityType ${etSpec.template}: create failed: ${msg}`)
        }
      } else {
        errors.push(`entityType ${etSpec.template}: ${msg}`)
      }
    }
  }

  // ── Records ──
  // Use adminSeed to derive the pubkey for dummy envelopes
  const adminPubkey = spec.adminSeed // In dev mode, seed IS the pubkey for dummy envelopes
  const recordResults: Array<{ id: string; entityTypeId: string; caseNumber?: string }> = []
  for (const etSpec of spec.entityTypes) {
    const et = entityTypeResults.find(e => e.name === etSpec.template)
    if (!et) continue
    for (let i = 0; i < etSpec.records; i++) {
      try {
        const isEvent = et.category === 'event'
        const record = await services.cases.create({
          entityTypeId: et.id,
          statusHash: et.defaultStatus,
          assignedTo: etSpec.assignTo,
          blindIndexes: {},
          encryptedSummary: btoa(isEvent
            ? `{"title":"Test Event ${i + 1}","summary":"Seeded event"}`
            : `{"title":"Test Case ${i + 1}","summary":"Seeded case"}`),
          summaryEnvelopes: [{
            pubkey: adminPubkey,
            ct: 'a'.repeat(64),
            enc: adminPubkey,
          }],
          createdBy: adminPubkey,
          hubId: spec.hubId,
        })
        recordResults.push({
          id: record.id,
          entityTypeId: et.id,
          caseNumber: record.caseNumber ?? undefined,
        })
      } catch (e) {
        errors.push(`record ${et.name}[${i}]: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  // ── Report Types ──
  const reportTypeResults: Array<{ id: string; name: string }> = []
  for (const rtSpec of spec.reportTypes) {
    try {
      const rt = await services.settings.createReportType({
        name: 'general_report',
        label: 'General Report',
        labelPlural: 'General Reports',
        description: 'BDD test report type',
        allowCaseConversion: true,
        mobileOptimized: true,
        statuses: [
          { value: 'new', label: 'New', color: '#f59e0b', order: 1 },
          { value: 'reviewed', label: 'Reviewed', color: '#3b82f6', order: 2 },
          { value: 'closed', label: 'Closed', color: '#6b7280', order: 3, isClosed: true },
        ],
        defaultStatus: 'new',
        closedStatuses: ['closed'],
        fields: [],
        hubId: spec.hubId,
      })
      reportTypeResults.push({ id: rt.id, name: rt.name })
    } catch (e) {
      errors.push(`reportType ${rtSpec.template}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── Triage Reports ──
  const triageReportResults: Array<{ id: string }> = []
  for (const rtSpec of spec.reportTypes) {
    const rt = reportTypeResults.find(r => r.name === rtSpec.template || r.name === 'general_report')
    for (let i = 0; i < rtSpec.triageReports; i++) {
      try {
        const report = await services.conversations.create({
          hubId: spec.hubId,
          channelType: 'web',
          status: 'waiting',
          metadata: {
            type: 'report',
            reportTitle: `Test Triage Report ${i + 1}`,
            reportCategory: 'general',
            conversionStatus: 'pending',
            ...(rt ? { reportTypeId: rt.id } : {}),
          },
        })
        if (report?.id) triageReportResults.push({ id: report.id })
      } catch (e) {
        errors.push(`triageReport[${i}]: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  // ── Shifts ──
  const shiftResults: Array<{ id: string }> = []
  for (const shiftSpec of spec.shifts) {
    try {
      const shift = await services.shifts.create(spec.hubId, {
        encryptedName: btoa('BDD Test Shift'),
        startTime: shiftSpec.allDay ? '00:00' : '08:00',
        endTime: shiftSpec.allDay ? '23:59' : '17:00',
        days: [0, 1, 2, 3, 4, 5, 6],
        userPubkeys: [shiftSpec.pubkey],
      })
      shiftResults.push({ id: shift.id })
    } catch (e) {
      errors.push(`shift ${shiftSpec.pubkey.slice(0, 16)}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── Contacts ──
  const contactResults: Array<{ id: string }> = []
  for (const contactSpec of spec.contacts) {
    try {
      const contact = await services.contacts.create({
        hubId: spec.hubId,
        identifierHashes: [`name_${Date.now()}_${Math.random().toString(36).slice(2)}`],
        encryptedSummary: btoa(JSON.stringify({
          displayName: contactSpec.displayName,
          contactType: contactSpec.contactType,
          tags: [],
        })),
        summaryEnvelopes: [{
          pubkey: adminPubkey,
          ct: 'a'.repeat(64),
          enc: adminPubkey,
        }],
        contactTypeHash: contactSpec.contactType,
      })
      contactResults.push({ id: contact.id })
    } catch (e) {
      errors.push(`contact ${contactSpec.displayName}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return c.json({
    ok: errors.filter(e => !e.includes('reusing')).length === 0,
    entityTypes: entityTypeResults,
    records: recordResults,
    reportTypes: reportTypeResults,
    triageReports: triageReportResults,
    shifts: shiftResults,
    contacts: contactResults,
    members: memberResults,
    errors,
  })
})
```

- [ ] **Step 4: Verify typecheck passes**

Run: `bun run typecheck`
Expected: PASS (no new type errors)

- [ ] **Step 5: Commit**

```bash
git add apps/worker/routes/dev.ts
git commit -m "feat: add POST /test-seed declarative seeding endpoint

Dev-only endpoint that creates test data from a declarative spec.
Entity type templates, records, report types, shifts, members, and
contacts are all created via the existing service layer. Replaces
per-platform reimplementations of data seeding."
```

---

### Task 2: Add backend BDD test for the seeding endpoint

**Files:**
- Modify: `tests/api-helpers.ts` (add `seedViaApi()` wrapper)

This task adds a TypeScript helper so desktop/backend tests can also use the endpoint, and verifies the endpoint works end-to-end.

- [ ] **Step 1: Add seedViaApi helper to api-helpers.ts**

Add at the end of the file (before closing), after the existing helpers:

```typescript
// ── Declarative Test Seeding ─────────────────────────────────────

export interface SeedSpec {
  hubId: string
  adminSeed: string
  permissions?: {
    grantVolunteerCms?: boolean
    enableCaseManagement?: boolean
  }
  entityTypes?: Array<{
    template: 'arrest_case' | 'protest_event'
    records?: number
    assignTo?: string[]
  }>
  reportTypes?: Array<{
    template: 'general_report'
    triageReports?: number
  }>
  shifts?: Array<{
    pubkey: string
    allDay?: boolean
  }>
  members?: Array<{
    pubkey: string
    roleIds?: string[]
  }>
  contacts?: Array<{
    displayName: string
    contactType?: string
  }>
}

export interface SeedResult {
  ok: boolean
  entityTypes: Array<{ id: string; name: string; category: string; defaultStatus: string }>
  records: Array<{ id: string; entityTypeId: string; caseNumber?: string }>
  reportTypes: Array<{ id: string; name: string }>
  triageReports: Array<{ id: string }>
  shifts: Array<{ id: string }>
  contacts: Array<{ id: string }>
  members: Array<{ pubkey: string }>
  errors: string[]
}

export async function seedViaApi(
  request: APIRequestContext,
  spec: SeedSpec,
): Promise<SeedResult> {
  const { status, data } = await apiPost<SeedResult>(
    request,
    '/test-seed',
    spec,
    spec.adminSeed,
  )
  if (status !== 200) throw new Error(`test-seed failed: HTTP ${status}`)
  return data
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/api-helpers.ts
git commit -m "feat: add seedViaApi() helper for cross-platform test seeding

TypeScript wrapper around POST /test-seed for desktop/backend BDD tests.
Exports SeedSpec/SeedResult types for type-safe seed construction."
```

---

### Task 3: Rewrite Android TestApiClient to use /test-seed

**Files:**
- Rewrite: `apps/android/app/src/androidTest/java/org/llamenos/hotline/helpers/TestApiClient.kt`

The existing 642-line file becomes ~120 lines: HTTP client + `SeedSpec`/`SeedResult` data classes + `seed()` method. All entity type templates, envelope construction, and multi-step orchestration is now server-side.

- [ ] **Step 1: Rewrite TestApiClient.kt**

Replace the entire file with:

```kotlin
package org.llamenos.hotline.helpers

import android.util.Log
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Thin E2E test client that seeds data via POST /api/test-seed.
 *
 * All entity type definitions, envelope construction, and multi-step
 * orchestration lives server-side. This client sends a declarative spec
 * and gets back IDs for created resources.
 *
 * Dev-only: the /test-seed endpoint returns 404 outside ENVIRONMENT=development.
 */
class TestApiClient(
    private val baseUrl: String,
    private val testSecret: String,
) {
    companion object {
        private const val TAG = "TestApiClient"
        private const val CONNECT_TIMEOUT_MS = 30_000
        private const val READ_TIMEOUT_MS = 30_000

        private val json = Json { ignoreUnknownKeys = true }
    }

    // ─── Seed Spec Types ──────────────────────────────────────────────

    @Serializable
    data class SeedPermissions(
        val grantVolunteerCms: Boolean = false,
        val enableCaseManagement: Boolean = false,
    )

    @Serializable
    data class SeedEntityType(
        val template: String,
        val records: Int = 0,
        val assignTo: List<String> = emptyList(),
    )

    @Serializable
    data class SeedReportType(
        val template: String,
        val triageReports: Int = 0,
    )

    @Serializable
    data class SeedShift(
        val pubkey: String,
        val allDay: Boolean = true,
    )

    @Serializable
    data class SeedMember(
        val pubkey: String,
        val roleIds: List<String> = listOf("role-volunteer"),
    )

    @Serializable
    data class SeedContact(
        val displayName: String,
        val contactType: String = "person",
    )

    @Serializable
    data class SeedSpec(
        val hubId: String,
        val adminSeed: String,
        val permissions: SeedPermissions = SeedPermissions(),
        val entityTypes: List<SeedEntityType> = emptyList(),
        val reportTypes: List<SeedReportType> = emptyList(),
        val shifts: List<SeedShift> = emptyList(),
        val members: List<SeedMember> = emptyList(),
        val contacts: List<SeedContact> = emptyList(),
    )

    // ─── Seed Result Types ────────────────────────────────────────────

    @Serializable
    data class EntityTypeResult(
        val id: String = "",
        val name: String = "",
        val category: String = "",
        val defaultStatus: String = "",
    )

    @Serializable
    data class RecordResult(
        val id: String = "",
        val entityTypeId: String = "",
        val caseNumber: String? = null,
    )

    @Serializable
    data class IdResult(val id: String = "")

    @Serializable
    data class PubkeyResult(val pubkey: String = "")

    @Serializable
    data class SeedResult(
        val ok: Boolean = false,
        val entityTypes: List<EntityTypeResult> = emptyList(),
        val records: List<RecordResult> = emptyList(),
        val reportTypes: List<IdResult> = emptyList(),
        val triageReports: List<IdResult> = emptyList(),
        val shifts: List<IdResult> = emptyList(),
        val contacts: List<IdResult> = emptyList(),
        val members: List<PubkeyResult> = emptyList(),
        val errors: List<String> = emptyList(),
    )

    // ─── Core API ─────────────────────────────────────────────────────

    /**
     * Seed test data via the declarative /api/test-seed endpoint.
     * Returns IDs for all created resources.
     */
    fun seed(spec: SeedSpec): SeedResult {
        val body = json.encodeToString(SeedSpec.serializer(), spec)
        Log.i(TAG, "seed: hubId=${spec.hubId}, entityTypes=${spec.entityTypes.size}, " +
            "records=${spec.entityTypes.sumOf { it.records }}")
        val response = post("/api/test-seed", body)
        val result = json.decodeFromString(SeedResult.serializer(), response)
        if (result.errors.isNotEmpty()) {
            Log.w(TAG, "seed warnings: ${result.errors}")
        }
        Log.i(TAG, "seed result: ok=${result.ok}, entityTypes=${result.entityTypes.size}, " +
            "records=${result.records.size}")
        return result
    }

    /**
     * POST with X-Test-Secret header. All /test-* endpoints use this auth.
     */
    fun post(path: String, body: String): String {
        val url = URL("$baseUrl$path")
        Log.d(TAG, "POST $url")

        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("X-Test-Secret", testSecret)
            conn.doOutput = true
            conn.outputStream.use { os ->
                os.write(body.toByteArray(Charsets.UTF_8))
            }

            val code = conn.responseCode
            val responseBody = if (code in 200..299) {
                conn.inputStream.bufferedReader().use { it.readText() }
            } else {
                val errorBody = try {
                    conn.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                } catch (_: IOException) { "" }
                Log.e(TAG, "POST $path returned HTTP $code: $errorBody")
                throw SimulationException("POST $path failed with HTTP $code: $errorBody")
            }

            Log.d(TAG, "Response ($code): ${responseBody.take(500)}")
            return responseBody
        } finally {
            conn.disconnect()
        }
    }
}
```

- [ ] **Step 2: Verify Android build compiles**

Run: `cd apps/android && ./gradlew :app:compileDebugAndroidTestKotlin`
Expected: Compilation errors in step files (they still reference old methods). That's expected — we fix them in Task 4.

- [ ] **Step 3: Commit**

```bash
git add apps/android/app/src/androidTest/java/org/llamenos/hotline/helpers/TestApiClient.kt
git commit -m "refactor(android-e2e): rewrite TestApiClient to use /test-seed

Replaces 642-line client with ~120 lines. All entity type definitions,
envelope construction, and multi-step orchestration now server-side.
Client just POSTs a declarative SeedSpec and gets back resource IDs."
```

---

### Task 4: Migrate Android step definitions to use seed()

**Files:**
- Modify: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/ScenarioHooks.kt`
- Modify: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/events/EventsSteps.kt`
- Modify: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/triage/TriageSteps.kt`
- Modify: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/cases/CaseListSteps.kt`
- Modify: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/cases/CaseDetailSteps.kt`
- Modify: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/calls/ActiveCallSteps.kt`
- Modify: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/hubs/HubSwitchSteps.kt`

- [ ] **Step 1: Simplify ScenarioHooks.kt**

The `TestApiClient` no longer needs admin bootstrapping — it uses `X-Test-Secret` header directly. Remove the `bootstrapAdmin` pattern:

Replace the companion object in ScenarioHooks:

```kotlin
companion object {
    private const val TAG = "ScenarioHooks"

    /**
     * Admin seed for test seeding (used in SeedSpec.adminSeed).
     * 64-char hex — matches ADMIN_SEED in tests/api-helpers.ts.
     */
    const val ADMIN_SEED = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

    @Volatile
    var currentHubId: String = ""
        private set

    @Volatile
    var apiClient: TestApiClient? = null
        private set
}
```

In `createScenarioHub()`, replace the TestApiClient bootstrap block (lines 119-128) with:

```kotlin
// Create thin API client (uses X-Test-Secret, no admin bootstrap needed)
apiClient = TestApiClient(
    baseUrl = SimulationClient.hubUrl,
    testSecret = SimulationClient.testSecret,
)
```

- [ ] **Step 2: Migrate EventsSteps.kt**

Find the `eventsExistInTheSystem()` method. Replace the `setupCmsViaApi` call with:

```kotlin
val client = ScenarioHooks.apiClient
    ?: throw IllegalStateException("TestApiClient not initialized")
val hubId = ScenarioHooks.currentHubId
val result = client.seed(
    TestApiClient.SeedSpec(
        hubId = hubId,
        adminSeed = ScenarioHooks.ADMIN_SEED,
        permissions = TestApiClient.SeedPermissions(
            grantVolunteerCms = true,
            enableCaseManagement = true,
        ),
        entityTypes = listOf(
            TestApiClient.SeedEntityType(template = "protest_event", records = 2),
        ),
    )
)
check(result.ok) { "test-seed failed for events: errors=${result.errors}" }
Log.i("EventsSteps", "Seeded ${result.entityTypes.size} entity types, ${result.records.size} records")
```

- [ ] **Step 3: Migrate TriageSteps.kt**

Replace the `triageEligibleReportsExist()` method's `setupCmsViaApi` call with:

```kotlin
val client = ScenarioHooks.apiClient
    ?: throw IllegalStateException("TestApiClient not initialized")
val hubId = ScenarioHooks.currentHubId
val result = client.seed(
    TestApiClient.SeedSpec(
        hubId = hubId,
        adminSeed = ScenarioHooks.ADMIN_SEED,
        permissions = TestApiClient.SeedPermissions(
            grantVolunteerCms = true,
            enableCaseManagement = true,
        ),
        reportTypes = listOf(
            TestApiClient.SeedReportType(template = "general_report", triageReports = 2),
        ),
    )
)
check(result.ok) { "test-seed failed for triage: errors=${result.errors}" }
Log.i("TriageSteps", "Seeded ${result.reportTypes.size} report types, ${result.triageReports.size} reports")
```

- [ ] **Step 4: Migrate CaseListSteps.kt**

Replace the `setupCmsViaApi` calls in `theAppIsLaunchedAndAuthenticatedAsAdmin()`:

Phase 1 (unassigned records):
```kotlin
val result = client?.seed(
    TestApiClient.SeedSpec(
        hubId = hubId,
        adminSeed = ScenarioHooks.ADMIN_SEED,
        permissions = TestApiClient.SeedPermissions(
            grantVolunteerCms = true,
            enableCaseManagement = true,
        ),
        entityTypes = listOf(
            TestApiClient.SeedEntityType(template = "arrest_case", records = 1),
            TestApiClient.SeedEntityType(template = "protest_event", records = 1),
        ),
    )
)
```

Phase 2 (assigned records, after getting npub):
```kotlin
val cmsResult = client?.seed(
    TestApiClient.SeedSpec(
        hubId = hubId,
        adminSeed = ScenarioHooks.ADMIN_SEED,
        entityTypes = listOf(
            TestApiClient.SeedEntityType(
                template = "arrest_case",
                records = 1,
                assignTo = listOf(npub),
            ),
        ),
    )
)
```

- [ ] **Step 5: Migrate CaseDetailSteps.kt**

Replace the `setupCmsViaApi` call in `anUnassignedCaseDetailIsOpen()`:

```kotlin
try {
    client?.seed(
        TestApiClient.SeedSpec(
            hubId = hubId,
            adminSeed = ScenarioHooks.ADMIN_SEED,
            permissions = TestApiClient.SeedPermissions(
                grantVolunteerCms = true,
                enableCaseManagement = true,
            ),
            entityTypes = listOf(
                TestApiClient.SeedEntityType(template = "arrest_case", records = 1),
            ),
        )
    )
} catch (e: Exception) {
    Log.w("CaseDetailSteps", "test-seed for unassigned case failed: ${e.message}")
}
```

- [ ] **Step 6: Migrate ActiveCallSteps.kt**

Replace any `createShift` call with:

```kotlin
client.seed(
    TestApiClient.SeedSpec(
        hubId = hubId,
        adminSeed = ScenarioHooks.ADMIN_SEED,
        shifts = listOf(
            TestApiClient.SeedShift(pubkey = signingPubkey),
        ),
    )
)
```

- [ ] **Step 7: Migrate HubSwitchSteps.kt**

Replace any `addHubMember` call with:

```kotlin
client.seed(
    TestApiClient.SeedSpec(
        hubId = hub2Id,
        adminSeed = ScenarioHooks.ADMIN_SEED,
        members = listOf(
            TestApiClient.SeedMember(pubkey = signingPubkey),
        ),
    )
)
```

- [ ] **Step 8: Verify Android test compilation**

Run: `cd apps/android && ./gradlew :app:compileDebugAndroidTestKotlin`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/android/app/src/androidTest/
git commit -m "refactor(android-e2e): migrate all steps to declarative test-seed

All Given steps now call testApiClient.seed(SeedSpec) instead of
multi-step setupCmsViaApi(). ScenarioHooks no longer needs admin
bootstrapping — TestApiClient uses X-Test-Secret directly."
```

---

### Task 5: Remove old test-setup-cms endpoint

**Files:**
- Modify: `apps/worker/routes/dev.ts`

Now that Android uses `/test-seed`, the old `/test-setup-cms` endpoint is dead code.

- [ ] **Step 1: Remove the test-setup-cms endpoint**

Delete the `dev.post('/test-setup-cms', ...)` handler from `apps/worker/routes/dev.ts` (lines ~240-412). Keep the comment separator and simulation endpoints that follow it.

- [ ] **Step 2: Remove SimulationClient.setupCms references in Android**

Check if `SimulationClient.kt` still has `setupCms()` method. If so, remove it since no step definitions call it anymore.

- [ ] **Step 3: Verify typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Verify Android compilation**

Run: `cd apps/android && ./gradlew :app:compileDebugAndroidTestKotlin`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/worker/routes/dev.ts apps/android/
git commit -m "chore: remove deprecated test-setup-cms endpoint

Replaced by POST /test-seed. Also removes unused setupCms() from
SimulationClient.kt."
```

---

### Task 6: Integration verification

**Files:** None (testing only)

- [ ] **Step 1: Start local backend**

```bash
docker compose -f deploy/docker/docker-compose.dev.yml up -d
bun run dev:server
```

- [ ] **Step 2: Run backend BDD tests**

```bash
bun run test:backend:bdd
```

Expected: All existing scenarios PASS (no regressions from dev.ts changes)

- [ ] **Step 3: Run desktop E2E tests (smoke)**

```bash
bun run test -- --grep "case management"
```

Expected: CMS-related desktop tests still pass (they use api-helpers.ts directly, not affected)

- [ ] **Step 4: Verify test-seed endpoint manually**

```bash
curl -s -X POST http://localhost:3000/api/test-seed \
  -H 'Content-Type: application/json' \
  -H 'X-Test-Secret: test-secret' \
  -d '{
    "hubId": "<hub-id-from-test-reset>",
    "adminSeed": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "permissions": {"enableCaseManagement": true, "grantVolunteerCms": true},
    "entityTypes": [
      {"template": "arrest_case", "records": 2},
      {"template": "protest_event", "records": 1}
    ],
    "reportTypes": [{"template": "general_report", "triageReports": 1}]
  }' | jq .
```

Expected: `ok: true`, entity type IDs, record IDs, no errors

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address integration test findings for test-seed endpoint"
```
