# Epic 368: Audit Log Hash Chain Fix — Timestamp Mismatch

**Status**: PENDING
**Priority**: High
**Depends on**: Epic 365 (surfaces the bug)
**Blocks**: None
**Branch**: `desktop`

## Summary

The audit log hash chain fails external verification because the server computes entry hashes
using a JavaScript `new Date().toISOString()` timestamp, but stores `created_at` using
PostgreSQL's `defaultNow()` which produces a different (typically milliseconds later) timestamp.
When `db-helpers.ts` fetches the row and tries to recompute the hash from the stored
`created_at`, the timestamps diverge, causing hash mismatches. Fix: include the JS `createdAt`
value explicitly in the Drizzle `INSERT` so the stored timestamp exactly matches what was used
to compute the hash.

## Problem Statement

**File**: `apps/worker/services/audit.ts`

The `AuditService.log()` method:

```typescript
const createdAt = new Date().toISOString()        // JS timestamp: "2026-03-18T14:30:00.123Z"

const entryHash = computeEntryHash({
  id,
  action,
  actorPubkey,
  createdAt,          // hash uses JS timestamp
  ...
})

const [row] = await tx
  .insert(auditLog)
  .values({
    id,
    action,
    actorPubkey,
    details,
    previousEntryHash,
    entryHash,
    // ← createdAt NOT included here!
    // Drizzle uses defaultNow() → PostgreSQL CURRENT_TIMESTAMP
    // e.g. "2026-03-18T14:30:00.125Z" (2ms later!)
  })
  .returning()
```

The Drizzle `INSERT` omits `createdAt`, so PostgreSQL's `defaultNow()` fires and produces a
timestamp that is slightly different from the JS timestamp used in the hash computation. This
discrepancy is unpredictable (it depends on network latency + DB query execution time).

**Schema** (`apps/worker/db/schema/records.ts:137`):
```typescript
createdAt: timestamp('created_at', { withTimezone: true })
  .notNull()
  .defaultNow(),    // ← this is used when no value is provided in INSERT
```

**Two failing scenarios**:

1. `Audit hash chain is verifiable` — `db-helpers.ts` fetches all audit entries, then for each
   entry recomputes `computeAuditEntryHash({ ..., createdAt: row.created_at })`. The stored
   `created_at` doesn't match the JS timestamp used during insert, so the recomputed hash
   differs from the stored `entryHash`.

2. `Audit entries are tamper-detectable` — Same root cause. The test fetches the latest entry
   and recomputes its hash; the `created_at` from DB doesn't match what was hashed.

**Secondary issue**: `db-helpers.ts:verifyAuditChain` uses:
```typescript
to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
```
This formats `created_at` to millisecond precision. But `new Date().toISOString()` outputs
nanosecond-trimmed milliseconds: `"2026-03-18T14:30:00.123Z"`. If PostgreSQL stores microseconds
(which `TIMESTAMPTZ` supports), the `to_char` format `.MS` gives 3-digit milliseconds, but the
JS timestamp was already millisecond-accurate. This format is consistent as long as the
timestamp itself is the same value. Once the INSERT uses the JS timestamp explicitly, both
paths produce identical strings.

## Implementation

### Fix 1: `apps/worker/services/audit.ts` — Include `createdAt` in INSERT

```typescript
// BEFORE:
const [row] = await tx
  .insert(auditLog)
  .values({
    id,
    hubId: hubId ?? null,
    action,
    actorPubkey,
    details,
    previousEntryHash,
    entryHash,
  })
  .returning()

// AFTER:
const [row] = await tx
  .insert(auditLog)
  .values({
    id,
    hubId: hubId ?? null,
    action,
    actorPubkey,
    details,
    previousEntryHash,
    entryHash,
    createdAt: new Date(createdAt),  // ← explicit: same value used in hash
  })
  .returning()
```

`new Date(createdAt)` converts the ISO string back to a `Date` object for Drizzle's `timestamp`
column. The stored value will be the exact same instant that was used in hash computation.

### Fix 2: Verify `db-helpers.ts` timestamp formatting

The `verifyAuditChain` helper in `tests/db-helpers.ts` queries:
```sql
to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
```

And `computeAuditEntryHash` in `tests/integrity-helpers.ts` receives a `createdAt: string`
that must exactly match the format used by the server's `computeEntryHash` in `audit.ts`:
```typescript
const content = `${entry.id}:${entry.action}:${entry.actorPubkey}:${entry.createdAt}:...`
```

The server stores the ISO string form of `new Date()` — e.g., `"2026-03-18T14:30:00.123Z"`.
PostgreSQL stores this as a `TIMESTAMPTZ`. When read back via `to_char(..., 'MS')`, the
milliseconds are zero-padded to 3 digits. But `new Date().toISOString()` also produces 3-digit
milliseconds. This is consistent.

**Risk**: PostgreSQL stores `TIMESTAMPTZ` with microsecond precision. If the JS timestamp
`"2026-03-18T14:30:00.123Z"` is stored as `"2026-03-18T14:30:00.123000Z"` internally, the
`to_char` `.MS` output is `"123"` (3 digits), matching the JS format. No issue.

**However**, `to_char` with `.MS` gives milliseconds as `123`, while the server uses
`.toISOString()` which gives `"123"` also. **They match.** ✓

### Fix 3: Verify `computeAuditEntryHash` signature consistency

`tests/integrity-helpers.ts` exports `computeAuditEntryHash` with the same signature as the
server's internal `computeEntryHash`. Verify both use identical content format:

```typescript
// Server (audit.ts):
const content = `${entry.id}:${entry.action}:${entry.actorPubkey}:${entry.createdAt}:${JSON.stringify(entry.details ?? {})}:${entry.previousEntryHash ?? ''}`

// Test helper (integrity-helpers.ts):
// Must be identical
```

If they diverge (e.g., key ordering in `JSON.stringify(details)`), hashes will never match
regardless of timestamp fix. Audit and align the two implementations.

### Fix 4: Update `db-helpers.ts` to use the stored `created_at` directly

Since `postgres.js` returns JavaScript `Date` objects for `TIMESTAMPTZ` columns by default,
the `verifyAuditChain` method may need to convert `Date → ISO string` consistently:

```typescript
// In verifyAuditChain, after fetching rows via postgres.js:
// postgres.js returns created_at as a Date object — convert to ISO string
const createdAtStr = (row.created_at instanceof Date)
  ? row.created_at.toISOString()
  : row.created_at as string
```

But the query already uses `to_char(...)` which returns a string. Verify the `to_char` format
matches `new Date().toISOString()` exactly:
- `to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` → `"2026-03-18T14:30:00.123Z"` ✓

## Files to Modify

| File | Change |
|------|--------|
| `apps/worker/services/audit.ts` | Add `createdAt: new Date(createdAt)` to INSERT `.values()` |
| `tests/integrity-helpers.ts` | Verify `computeAuditEntryHash` content string matches server's |
| `tests/db-helpers.ts` | Verify `to_char` format and string conversion consistency |

## Testing

```bash
bun run test:backend:bdd -- --grep "Audit"
```

Both scenarios must pass:
- Audit hash chain is verifiable
- Audit entries are tamper-detectable

Also verify the full audit suite still passes (7 scenarios in `audit-integrity.feature`).

## Acceptance Criteria & Test Scenarios

- [ ] Audit entries inserted with explicit `createdAt` value matching what was used in hash
  → `packages/test-specs/features/security/audit-integrity.feature: "Audit hash chain is verifiable"`
- [ ] `computeAuditEntryHash` in test helpers produces the same hash as the server's internal function
  → `packages/test-specs/features/security/audit-integrity.feature: "Audit entries are tamper-detectable"`
- [ ] Hash chain passes DB-level verification (5 sequential ops → 5 linked entries)
  → `packages/test-specs/features/security/audit-integrity.feature: "Audit hash chain is verifiable"`
- [ ] Existing audit capture scenario still passes
  → `packages/test-specs/features/security/audit-integrity.feature: "Audit log captures all state-changing operations"`
- [ ] All BDD tests pass; 0 regressions

## Feature Files

| File | Status | Description |
|------|--------|-------------|
| `packages/test-specs/features/security/audit-integrity.feature` | Existing | No change needed |
| `tests/steps/backend/audit-integrity.steps.ts` | Possibly | Minor fix if hash comparison breaks |

## Risk Assessment

- **Low risk**: Single-line addition to INSERT — explicit timestamp instead of DB default
- **Low risk**: No behavior change for end users — `created_at` values will be ~1ms earlier
  than before (JS timestamp vs DB timestamp), which is irrelevant
- **Medium risk**: Verify `JSON.stringify(details ?? {})` key ordering is deterministic on the
  same object across server and test helper. Node.js and Bun both use insertion order for
  `JSON.stringify`, so objects constructed identically will serialize identically.
- **Low risk**: The change is purely additive — it doesn't modify the chain structure or
  any existing API responses
