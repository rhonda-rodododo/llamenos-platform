# Epic 77: Metadata Minimization and Encryption

## Problem Statement

Llamenos must encrypt all sensitive metadata, not just content. The server should see minimal metadata — only what's strictly necessary for routing.

**Clean Rewrite Context:** Since Llamenos is pre-production with no deployed users, we build encrypted metadata storage from scratch. All metadata is encrypted from day one — no plaintext storage, no migration code.

Currently visible metadata includes:

| Metadata | Current State | Risk |
|----------|---------------|------|
| Call timestamps | Plaintext | Activity pattern analysis |
| Call durations | Plaintext | Behavioral profiling |
| Volunteer assignments | Plaintext | Links volunteers to specific calls |
| Shift schedules | Plaintext | Reveals who works when |
| Presence status | Plaintext | Real-time location/activity tracking |
| Audit logs | Plaintext (with truncated IP hashes) | Complete activity history |

Under subpoena, this metadata can reveal:
- Which volunteers were active during specific incidents
- Patterns suggesting which volunteers handle which types of calls
- Organizational structure and staffing levels

## Goals

1. **Minimize**: Reduce metadata the server needs to see
2. **Encrypt**: E2EE metadata that must be stored, using envelope pattern for multi-admin
3. **Ephemeral**: Move real-time metadata to Nostr relay (no server storage)
4. **Aggregate**: Replace individual records with privacy-preserving aggregates
5. **Scalable**: Per-record storage keys, paginated retrieval, client-side analytics on bounded windows

## Metadata Categories

### Category A: Can Be Fully Encrypted (Admin-Only)

These need to exist but only admins need to see them:

- **Volunteer assignments**: Which volunteer answered which call
- **Shift schedules**: Who is scheduled when (full details beyond routing pubkeys)
- **Audit log details**: Specific actions taken (with caveats — see Section E)

### Category B: Can Move Off-Server (Ephemeral)

These don't need permanent storage:

- **Presence status**: Who is currently online/available
- **Real-time call state**: Currently ringing, in progress
- **Typing indicators**: Ephemeral UI state

### Category C: Requires Aggregation (Statistical)

These are needed for operational metrics but not per-record:

- **Call counts**: Total calls per day/week
- **Duration distributions**: Average call length
- **Workload balance**: Relative volunteer activity (not absolute)

### Category D: Inherently Visible (Accept Trade-off)

These cannot be hidden from the server:

- **Call existence**: A call happened (telephony webhook)
- **Note existence**: Something was saved (though content is E2EE)
- **Active session count**: Server must route requests

## Technical Design

### A. Encrypted Volunteer Assignments

**Current Flow:**
```
CallRouterDO stores: { callId, volunteerPubkey, answeredAt }
Admin queries: GET /api/calls -> sees all assignments
```

**New Flow:**
```
CallRouterDO stores: { callId, encryptedContent, nonce, adminEnvelopes[] }
encryptedContent = XChaCha20(CallMetadata, perRecordKey)
adminEnvelopes[] = ECIES-wrap(perRecordKey) for each admin
Admin decrypts client-side
```

**Implementation:**

```typescript
// Per-record storage key: callrecord:${callId}
// NOT stored in a single calls[] array (hits 128KB DO value limit)

interface EncryptedCallRecord {
  callId: string
  callerLast4: string        // Needed for display
  timestamp: number          // When call started (needed for ordering/pagination)
  duration?: number          // Can keep unencrypted (acceptable trade-off)

  // Envelope-pattern encryption for admin(s)
  encryptedContent: string   // XChaCha20-Poly1305 ciphertext
  nonce: string              // 24-byte encryption nonce
  adminEnvelopes: RecipientEnvelope[]  // Per-record key wrapped for each admin
}

// Plaintext only visible to admin(s) after decryption
interface CallMetadata {
  volunteerPubkey: string
  answeredAt: number
  outcome: 'answered' | 'missed' | 'spam'
  notes?: string[]           // Note IDs (content already E2EE)
}
```

**Who encrypts:**
- Volunteer's client encrypts assignment when answering call
- Client wraps per-record key for each admin pubkey (fetched from IdentityDO admin registry, per Epic 76.2)
- Server receives encrypted blob + envelopes, cannot read
- Any admin's client decrypts when viewing call history

**Storage pattern:**
- `callrecord:${callId}` per-record keys in DO storage
- Use `ctx.storage.list({ prefix: 'callrecord:' })` for retrieval
- Cursor-based pagination by timestamp

### B. Encrypted Shift Schedules

**Current Flow:**
```
ShiftManagerDO stores: [{ volunteerPubkey, start, end, ringGroup }]
Server uses for call routing
```

**Challenge:** Server needs to know who's on shift to route calls.

**Solution: Hybrid Approach**

1. **For routing**: Server knows which pubkeys are currently on shift (minimal: just pubkeys, not names)
2. **For display**: Full schedule details encrypted for all admins

```typescript
interface EncryptedShiftSchedule {
  // Server needs for routing (minimal, plaintext)
  activePubkeys: string[]

  // Integrity binding: admin signs the activePubkeys list
  activePubkeysSignature: string    // Schnorr signature by admin who created the schedule
  signerPubkey: string              // Admin pubkey that signed

  // Admin-only details (envelope pattern)
  encryptedSchedule: string         // XChaCha20-Poly1305 ciphertext (full schedule with names, times, groups)
  nonce: string
  adminEnvelopes: RecipientEnvelope[]  // Per-schedule key wrapped for each admin
}
```

**Integrity binding for `activePubkeys`:**

The server could swap routing pubkeys undetected — e.g., routing calls to a compromised pubkey not actually on the schedule. To make this detectable:

1. Admin signs the `activePubkeys` list with their Schnorr signature when creating/updating the schedule
2. The signature covers: `"llamenos:shift-schedule:" + sorted(activePubkeys).join(",") + ":" + timestamp`
3. Signature is stored alongside the encrypted schedule
4. Any admin can verify during audit that `activePubkeys` matches what was actually scheduled
5. This doesn't prevent a rogue server from routing wrongly in real-time, but makes tampering **detectable after the fact**

**Trade-off:** Server still sees pubkeys of on-shift volunteers. Acceptable because:
- Pubkeys are pseudonymous (no PII)
- Server must route calls somehow
- Alternative (client-side routing) adds latency and complexity
- Integrity binding makes tampering auditable

### C. Ephemeral Presence via Nostr

**Depends on:** Epic 76 (Nostr Relay Sync)

**Current Flow:**
```
Client -> WebSocket -> Server -> broadcasts to all clients
Server logs presence changes
```

**New Flow:**
```
Client -> Nostr Relay -> all subscribed clients
Server never sees presence
```

**Implementation:**

See Epic 76 for Nostr event structure. Key point: presence events are:
- Published directly to relay by clients
- Encrypted with hub key
- Never touch the server
- No permanent storage (relay TTL: 1 hour)

### D. Privacy-Preserving Workload Metrics

**Current Flow:**
```
Admin queries: How many calls did Volunteer X handle this week?
Server: SELECT COUNT(*) FROM calls WHERE volunteer = X
```

**Problem:** Server knows exact counts per volunteer.

**Solution: Client-Side Aggregation with Bounded Windows**

Decrypting all records client-side does not scale. With 18K+ records, client-side decryption will timeout or exhaust memory.

**Design:**

1. **Per-record storage keys** (`callrecord:${callId}`) instead of single blob — required for DO storage limit (128KB per value)
2. **Time-based cursor pagination**: Admin dashboard fetches records for a bounded time window
3. **"Compute stats for past N days" mode**: Admin selects 7/30/90 day window, decrypts only that window
4. **Recent window for real-time dashboard**: Dashboard loads last 24-48 hours by default (typically < 500 records)
5. **Full-history analytics as explicit export**: "Export and analyze" flow downloads all records, decrypts in a Web Worker, produces CSV/report
6. **No server-side aggregation queries**: Server cannot compute per-volunteer stats

```typescript
// Client-side bounded analytics
async function getVolunteerStats(
  timeWindow: { start: number; end: number },
  adminSecretKey: Uint8Array
): Promise<VolunteerStats[]> {
  // Paginated fetch of encrypted records within time window
  const records: EncryptedCallRecord[] = []
  let cursor: string | undefined

  do {
    const page = await api.getEncryptedCallRecords({
      after: timeWindow.start,
      before: timeWindow.end,
      cursor,
      limit: 100,
    })
    records.push(...page.records)
    cursor = page.nextCursor
  } while (cursor)

  // Decrypt and aggregate client-side
  const decrypted = await Promise.all(
    records.map(r => decryptCallMeta(r, adminSecretKey))
  )

  // Group by volunteer
  const byVolunteer = new Map<string, CallMetadata[]>()
  for (const call of decrypted) {
    const existing = byVolunteer.get(call.volunteerPubkey) ?? []
    existing.push(call)
    byVolunteer.set(call.volunteerPubkey, existing)
  }

  return Array.from(byVolunteer.entries()).map(([pubkey, calls]) => ({
    pubkey,
    totalCalls: calls.length,
    avgDuration: average(calls.map(c => c.duration ?? 0)),
    outcomes: countBy(calls, c => c.outcome),
  }))
}
```

**Trade-off:** More client-side computation, but server never sees per-volunteer stats. Bounded windows keep it practical.

### E. Audit Log Design

**This is the most nuanced section of the epic.** The audit found a fundamental tension: audit logs that only the admin can read are not audit logs — they're admin journals.

**The problem with fully-encrypted audit logs:**
- Admin controls whether logs are ever readable
- Breaks tamper-detection: admin could delete unfavorable entries
- Breaks GDPR Article 30 requirement for demonstrable record-keeping
- Defeats the purpose of audit: accountability requires that logs are not solely controlled by the audited party

**Recommendation: Option A — Server-readable audit logs with tamper detection**

Audit logs remain server-readable (encrypted at rest by infrastructure, not by admin key). This accepts the trade-off that audit logs exist for **organizational accountability**, not privacy from the server.

```typescript
// Server-readable audit entry (NOT encrypted for admin key)
interface AuditEntry {
  id: string                    // UUID, also used as storage key: audit:${id}
  timestamp: number             // When the action occurred
  action: string                // e.g., 'call.answered', 'note.created', 'volunteer.updated'
  actorPubkey: string           // Who performed the action (pseudonymous)
  targetPubkey?: string         // Who was affected (if applicable)
  details: Record<string, unknown>  // Action-specific data

  // Tamper detection
  actorSignature: string        // Schnorr signature by the actor over (action + timestamp + details hash)
  merkleRoot: string            // Running Merkle tree commitment (see below)
  previousEntryHash: string     // SHA-256 of previous entry (blockchain-like chaining)
}
```

**Tamper detection via Merkle chain:**
- Each audit entry includes a Schnorr signature by the actor's pubkey (proving the actor actually performed the action)
- Each entry includes the SHA-256 hash of the previous entry (chain integrity)
- A running Merkle tree root is maintained over all entries (any deletion or modification breaks the chain)
- Any admin can verify the chain is intact by replaying entries
- This does not prevent the server from *adding* fake entries (server could forge actor signatures only if it has the private key, which it doesn't)

**Why not fully-encrypted audit logs?**
- Document this trade-off explicitly in the codebase
- If the threat model changes (e.g., server operator is untrusted), consider Option B or C

**Alternative Option B** (documented but not recommended for initial implementation):
- Server stores plaintext event type + actor pubkey (minimal, for tamper detection)
- Plus encrypted details blob (admin-only, for content privacy)
- Trade-off: more complex, details still admin-controlled

**Alternative Option C** (documented but not recommended):
- Per-entry Schnorr signatures by actor's pubkey for tamper evidence
- Encrypted content for privacy
- Dual-access: external auditor key + admin key
- Trade-off: requires external auditor infrastructure

### F. DO Storage Pattern

**Critical scalability fix:** The current RecordsDO stores records as arrays (e.g., `calls[]`, `auditLog[]`). Durable Object storage has a 128KB limit per value. A single array of records will hit this limit quickly.

**Required pattern: per-record storage keys.**

```typescript
// WRONG (current pattern — hits 128KB limit):
await ctx.storage.put('calls', [...existingCalls, newCall])
await ctx.storage.put('auditLog', [...existingLog, newEntry])

// CORRECT (per-record keys):
await ctx.storage.put(`callrecord:${call.callId}`, encryptedCallRecord)
await ctx.storage.put(`audit:${entry.id}`, auditEntry)

// Retrieval with pagination:
const records = await ctx.storage.list({
  prefix: 'callrecord:',
  start: cursor,
  limit: 100,
})
```

This pattern applies to ALL encrypted record types:
- `callrecord:${callId}` — encrypted call assignments
- `audit:${entryId}` — audit log entries
- `shift:${scheduleId}` — encrypted shift schedules
- `message:${messageId}` — encrypted messages (Epic 74)

## Implementation Phases

### Phase 1: Encrypted Call Assignments (1 week)

**Tasks:**

1. Design `EncryptedCallRecord` type with envelope pattern (per-record key + admin envelopes)
2. Implement per-record storage keys: `callrecord:${callId}`
3. Volunteer client encrypts assignment when answering call, wraps key for all admin pubkeys
4. Admin client decrypts when viewing call list
5. Cursor-based pagination API for call records
6. No plaintext assignment storage path exists

**Deliverables:**
- Call assignments encrypted from day one
- Per-record DO storage (not arrays)
- Admin UI unchanged (decryption transparent)
- Paginated retrieval working

### Phase 2: Ephemeral Presence (0.5 weeks)

**Depends on:** Epic 76 (Nostr Relay)

**Tasks:**

1. Remove presence tracking from server
2. Presence events via Nostr only
3. Remove presence from audit logs

**Deliverables:**
- Server has no real-time presence data
- Presence flows through relay only

### Phase 3: Encrypted Shift Schedules (1 week)

**Tasks:**

1. Split shift data: routing pubkeys (minimal, plaintext) vs full details (envelope-pattern encrypted)
2. Admin encrypts full schedule when saving, wraps key for all admin pubkeys
3. Admin signs `activePubkeys` with Schnorr signature for integrity binding
4. Server only sees list of active pubkeys + signature
5. Admin client decrypts for display/editing
6. Admin client verifies `activePubkeys` signature during audit

**Deliverables:**
- Shift details (names, times, groups) invisible to server
- `activePubkeys` integrity binding via Schnorr signature
- Routing still works
- Any admin can audit schedule integrity

### Phase 4: Audit Log Infrastructure (1.5 weeks)

**Tasks:**

1. Design `AuditEntry` type with actor Schnorr signatures and Merkle chain
2. Implement per-entry storage keys: `audit:${entryId}`
3. Actor client signs audit entries before submission (Schnorr over action + timestamp + details hash)
4. Server maintains running Merkle tree root and previous-entry hash chain
5. Admin client can verify chain integrity
6. Cursor-based pagination for audit log retrieval
7. Document the trade-off: audit logs are server-readable, not admin-encrypted

**Deliverables:**
- Tamper-evident audit log with Merkle chain
- Per-entry actor signatures (Schnorr)
- Audit logs server-readable (by design)
- Chain verification tool in admin UI

### Phase 5: Client-Side Analytics (1 week)

**Tasks:**

1. Remove server-side aggregation queries
2. Admin dashboard fetches encrypted records for bounded time window (default: 48 hours)
3. Client-side decryption + aggregation in bounded window
4. "Export and analyze" flow for full-history analytics (Web Worker)
5. Time window selector in admin dashboard (7/30/90 days)

**Deliverables:**
- No per-volunteer queries on server
- Dashboard shows metrics computed locally over recent window
- Full-history export available as explicit action
- Responsive UI (no timeouts on large datasets)

## Server-Side Changes

### CallRouterDO

```diff
- volunteerPubkey: string;
- answeredAt: number;
+ // Per-record storage: callrecord:${callId}
+ encryptedContent: string;  // XChaCha20-Poly1305 ciphertext
+ nonce: string;
+ adminEnvelopes: RecipientEnvelope[];  // One per admin
```

### ShiftManagerDO

```diff
- shifts: Array<{ pubkey, start, end, ringGroup, name }>;
+ activePubkeys: string[];                 // For routing only
+ activePubkeysSignature: string;          // Schnorr integrity binding
+ signerPubkey: string;                    // Admin who signed
+ encryptedSchedule: string;              // XChaCha20-Poly1305 ciphertext
+ nonce: string;
+ adminEnvelopes: RecipientEnvelope[];     // One per admin
```

### RecordsDO / Audit Log Storage

```diff
- auditLog: AuditEntry[];                  // Single array (hits 128KB limit!)
+ // Per-entry storage: audit:${entryId}
+ interface AuditEntry {
+   id: string;
+   timestamp: number;
+   action: string;
+   actorPubkey: string;
+   targetPubkey?: string;
+   details: Record<string, unknown>;
+   actorSignature: string;                // Schnorr signature by actor
+   merkleRoot: string;                    // Running Merkle tree commitment
+   previousEntryHash: string;             // SHA-256 chain link
+ }
```

## Client-Side Changes

### New Decryption Utilities

```typescript
// src/client/lib/crypto/metadata.ts

export function encryptCallMeta(
  meta: CallMetadata,
  adminPubkeys: string[]        // All admin pubkeys
): {
  encryptedContent: string
  nonce: string
  adminEnvelopes: RecipientEnvelope[]
} {
  // Envelope pattern: random per-record key + ECIES wraps for each admin
  const recordKey = randomBytes(32)
  const nonce = randomBytes(24)
  const cipher = xchacha20poly1305(recordKey, nonce)
  const ciphertext = cipher.encrypt(utf8ToBytes(JSON.stringify(meta)))

  const adminEnvelopes = adminPubkeys.map(pubkey =>
    wrapKeyForPubkey(recordKey, pubkey, 'llamenos:call-meta')
  )

  return {
    encryptedContent: bytesToHex(ciphertext),
    nonce: bytesToHex(nonce),
    adminEnvelopes,
  }
}

export function decryptCallMeta(
  record: EncryptedCallRecord,
  adminSecretKey: Uint8Array
): CallMetadata {
  const pubkey = getPublicKey(adminSecretKey)
  const envelope = record.adminEnvelopes.find(e => e.pubkey === pubkey)
  if (!envelope) throw new Error('No envelope for this admin')

  const recordKey = unwrapKey(envelope, adminSecretKey, 'llamenos:call-meta')
  const ciphertext = hexToBytes(record.encryptedContent)
  const nonce = hexToBytes(record.nonce)
  const cipher = xchacha20poly1305(recordKey, nonce)
  const plaintext = cipher.decrypt(ciphertext)
  return JSON.parse(new TextDecoder().decode(plaintext))
}
```

### Updated Admin Dashboard

```typescript
// Fetch encrypted records for bounded time window, decrypt, aggregate
const { data: stats, isLoading } = useQuery({
  queryKey: ['call-stats', timeWindow],
  queryFn: async () => {
    if (!adminSecretKey) return null

    const records = await fetchCallRecordsPaginated(timeWindow)
    const decrypted = await Promise.all(
      records.map(r => decryptCallMeta(r, adminSecretKey))
    )

    return computeStats(decrypted)
  },
  staleTime: 60_000,  // Cache for 1 minute
})
```

### Audit Chain Verification

```typescript
// Admin can verify audit log integrity
async function verifyAuditChain(
  entries: AuditEntry[]
): Promise<{ valid: boolean; brokenAt?: string }> {
  let previousHash = ''

  for (const entry of entries) {
    // Verify chain link
    if (entry.previousEntryHash !== previousHash) {
      return { valid: false, brokenAt: entry.id }
    }

    // Verify actor signature
    const message = `${entry.action}:${entry.timestamp}:${sha256hex(JSON.stringify(entry.details))}`
    const valid = schnorr.verify(
      hexToBytes(entry.actorSignature),
      sha256(utf8ToBytes(message)),
      entry.actorPubkey
    )
    if (!valid) {
      return { valid: false, brokenAt: entry.id }
    }

    // Compute hash for next entry
    previousHash = sha256hex(JSON.stringify(entry))
  }

  return { valid: true }
}
```

## Security Considerations

### Multi-Admin Key Management

**Resolved in Epic 76.2.** All "encrypted for admin" in this epic means "encrypted for each admin" using the envelope pattern:

- One `RecipientEnvelope` per admin per record
- Storage cost: ~100 bytes per admin per record
- For a hub with 3 admins and 10K call records: ~3MB additional storage (acceptable)
- When admin is added: existing records need new envelopes (batch operation, admin-mediated)
- When admin is removed: optionally delete their envelopes (they had historical access regardless)

### Key Rotation

If an admin key is compromised, all encrypted metadata they had envelopes for is exposed. Mitigations:

1. **Forward secrecy**: Per-record ephemeral keys (already using ECIES envelope pattern) limit exposure to records where envelopes exist
2. **Key rotation**: Generate new admin keypair, re-wrap all active record keys for new pubkey, revoke old envelopes
3. **Multi-admin**: Compromise of one admin key doesn't expose records encrypted only for other admins (per-admin envelopes are independent)

### Subpoena Resistance

After implementation:

| Data | Subpoena Response |
|------|-------------------|
| Volunteer assignments | "Encrypted, we have no key — admin private keys are held by individual administrators on their personal devices" |
| Shift schedules | "We only have current active pubkeys (pseudonymous), full details are encrypted" |
| Presence history | "Not stored, ephemeral via relay" |
| Audit log content | "Server-readable by design (for accountability), contains pseudonymous pubkeys, no PII" |
| Call counts per volunteer | "No server-side aggregation capability, records are encrypted" |

### Audit Log Trade-off Documentation

**Audit logs that only the admin can read are not audit logs — they're admin journals.**

The decision to keep audit logs server-readable is deliberate:
- Audit logs exist for **organizational accountability**, not for privacy from the server
- GDPR Article 30 requires demonstrable record-keeping
- Tamper-detection via Merkle chain + actor signatures provides integrity guarantees
- Actor pubkeys in logs are pseudonymous (not PII)
- If the threat model requires hiding audit logs from the server, implement Option B or C (see Section E) as a future enhancement

## Success Criteria

1. **Privacy**
   - [ ] Volunteer assignments encrypted with envelope pattern (multi-admin) from day one
   - [ ] Shift schedule details encrypted with envelope pattern (multi-admin) from day one
   - [ ] `activePubkeys` signed by admin (Schnorr integrity binding)
   - [ ] Presence not stored on server (ephemeral via Nostr relay)
   - [ ] Audit logs server-readable with tamper-evident Merkle chain
   - [ ] Per-entry actor Schnorr signatures in audit logs

2. **Scalability**
   - [ ] Per-record DO storage keys (not arrays) — no 128KB limit hits
   - [ ] Cursor-based pagination for all record types
   - [ ] Admin dashboard loads bounded time window (not all records)
   - [ ] Full-history analytics as explicit export flow

3. **Functionality**
   - [ ] Call routing still works (server sees minimal pubkeys)
   - [ ] Admin dashboard shows all metrics (client-side compute, bounded window)
   - [ ] Audit chain verification tool in admin UI
   - [ ] No degradation in performance for operational flows

4. **Multi-Admin**
   - [ ] All encrypted records have envelopes for every active admin
   - [ ] New admin can be granted access to existing records (batch re-wrap)
   - [ ] Admin removal optionally revokes envelopes

## Dependencies

- **Epic 76 (Nostr Relay)**: Required for ephemeral presence
- **Epic 76.0 (Domain Separation Audit)**: Defines domain labels for metadata encryption (`llamenos:call-meta`, `llamenos:shift-schedule`)
- **Epic 76.2 (Key Architecture)**: Multi-admin pubkey registry, admin envelope management, resolves Open Question 1
- **Epic 74 (E2EE Messaging)**: Uses same envelope encryption pattern

## Estimated Effort

Large — touches CallRouterDO, ShiftManagerDO, RecordsDO storage patterns, admin dashboard, and adds audit chain infrastructure. The per-record storage migration and multi-admin envelope pattern are the primary complexity drivers.

## Execution Context

### RecordsDO Storage
- `src/worker/durable-objects/records-do.ts` — current audit log storage as array (hits 128KB DO limit)
- **Must change to:** per-entry keys (`audit:${id}`) with `ctx.storage.list({ prefix: 'audit:' })`
- Note storage already uses per-note approach

### ShiftManagerDO Storage
- `src/worker/durable-objects/shift-manager.ts` — shifts stored as array
- Supports midnight-crossing shifts, UTC-based
- **Split into:** `activePubkeys` (plaintext for routing) + `encryptedSchedule` (envelope pattern)

### CallRouterDO Call Records
- `src/worker/durable-objects/call-router.ts` — `activeCalls` and `callHistory` maps
- **Change to:** per-record keys (`callrecord:${callId}`) with envelope-pattern encryption

### Schnorr Signing
- `src/client/lib/crypto.ts` L349-358 — `createAuthToken()` uses `schnorr.sign(messageHash, secretKey)`
- Reuse `schnorr` import for actor signatures in audit entries and `activePubkeys` integrity binding

### DO Storage Pattern
- 128KB value limit per key in DO storage — critical constraint requiring per-record keys
- `ctx.storage.list({ prefix, start, limit })` for cursor-based pagination
