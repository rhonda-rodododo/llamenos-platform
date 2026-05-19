# Epic G — Race Conditions & Concurrency Fixes

**Date**: 2026-05-18
**Origin**: Wave 4 security audit (Kimi) — race condition focus
**Severity distribution**: 1 CRITICAL, 4 HIGH, 5 MEDIUM, 3 LOW
**Status**: Spec complete, ready for planning

## Executive Summary

The audit found 13 race conditions across backend services, mostly following the same anti-pattern: SELECT-then-UPDATE/DELETE without row locking (`FOR UPDATE`) or transaction isolation. PostgreSQL + Drizzle ORM provide all the primitives needed to fix these atomically. H09 (PUK envelope race) is covered by Epic E and excluded here.

The fixes fall into three categories:
1. **Atomic UPDATE ... RETURNING** — collapse read+check+write into a single statement (RACE-01, 02, 03, 06, 08)
2. **Transaction with FOR UPDATE** — lock rows before read-modify-write (RACE-05, 07, 11)
3. **Database constraints + ON CONFLICT** — prevent duplicates at the schema level (RACE-04, 09, 13)
4. **Architectural** — move operations inside transactions or add eviction (RACE-10, 12)

---

## Findings

### RACE-01 — Invite Code Double-Redeem (CRITICAL)

**File**: `apps/worker/services/identity.ts:508-547` (`redeemInvite`)

**Current code pattern**:
```ts
return this.db.transaction(async (tx) => {
  const rows = await tx
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.code, data.code))
    .limit(1)
  // ← No FOR UPDATE — another transaction can read the same unredeemed invite
  if (rows.length === 0) throw ...
  const invite = rows[0]
  if (invite.usedAt) throw new ServiceError(400, 'Invite already used')
  // ...
  await tx.update(inviteCodes).set({ usedAt: new Date(), usedBy: data.pubkey })
    .where(eq(inviteCodes.code, data.code))
  // ← Both transactions see usedAt=NULL, both proceed
```

**Race window**: Two concurrent `POST /api/invite/redeem` requests with the same code. Both SELECT the invite inside their own transaction, both see `usedAt IS NULL`, both proceed to mark it used and create a volunteer. Result: two volunteers created from one invite.

**Exploitation scenario**: Attacker sends the same invite code in parallel from two devices. Gets two accounts with potentially admin roles.

**Fix — Atomic claim via UPDATE...RETURNING**:
```ts
return this.db.transaction(async (tx) => {
  // Atomic claim: UPDATE only if unredeemed and not expired
  const [invite] = await tx
    .update(inviteCodes)
    .set({ usedAt: new Date(), usedBy: data.pubkey })
    .where(
      and(
        eq(inviteCodes.code, data.code),
        sql`${inviteCodes.usedAt} IS NULL`,
        sql`${inviteCodes.expiresAt} > NOW()`,
      ),
    )
    .returning()

  if (!invite) throw new ServiceError(400, 'Invalid, expired, or already-used invite code')

  // Create volunteer — only one transaction reaches here
  const [volRow] = await tx.insert(users).values({...}).returning()
  return { volunteer: sanitizeUser(rowToUser(volRow)) }
})
```

**Why this is atomic**: PostgreSQL's `UPDATE ... WHERE usedAt IS NULL` acquires a row-level lock. Only one concurrent UPDATE can match the WHERE clause — the second sees the row as already updated and returns zero rows.

---

### RACE-02 — MLS Messages Non-Atomic Fetch-Delete (HIGH)

**File**: `apps/worker/services/crypto-keys.ts:284-317` (`fetchAndClearMlsMessages`)

**Current code pattern**:
```ts
const rows = await this.db.select().from(mlsPendingMessages)
  .where(and(eq(hubId), eq(deviceId)))
// ← Gap: another request reads the same rows
await this.db.delete(mlsPendingMessages)
  .where(and(eq(hubId), eq(deviceId)))
// ← Second delete finds nothing (already deleted), but first caller already returned the rows
```

**Race window**: Two concurrent fetches for the same device's MLS messages. Both SELECT the same rows. First DELETE succeeds. Second DELETE is a no-op. But both callers received and will process the same messages — potentially causing duplicate MLS handshake processing (commit replays, double-welcomes).

**Fix — DELETE...RETURNING as atomic fetch-and-delete**:
```ts
async fetchAndClearMlsMessages(hubId: string, deviceId: string): Promise<MlsMessageRecord[]> {
  const rows = await this.db
    .delete(mlsPendingMessages)
    .where(
      and(
        eq(mlsPendingMessages.hubId, hubId),
        eq(mlsPendingMessages.recipientDeviceId, deviceId),
      ),
    )
    .returning()

  return rows.map(r => ({
    id: r.id,
    hubId: r.hubId,
    recipientDeviceId: r.recipientDeviceId,
    messageType: r.messageType,
    payload: r.payload,
    createdAt: r.createdAt.toISOString(),
  }))
}
```

**Why this is atomic**: `DELETE ... RETURNING *` atomically selects and removes the rows. The second concurrent DELETE sees no matching rows and returns empty.

---

### RACE-03 — Provision Room Double-Consume (HIGH)

**File**: `apps/worker/services/identity.ts:1189-1222` (`getProvisionRoom`)

**Current code pattern**:
```ts
const rows = await this.db.select().from(provisionRooms)
  .where(eq(provisionRooms.roomId, id)).limit(1)
// ...
if (room.encryptedNsec) {
  // Consume the room
  await this.db.delete(provisionRooms).where(eq(provisionRooms.roomId, id))
  return { status: 'ready', ... }
}
```

**Race window**: Two concurrent polls from the new device. Both SELECT the room with `encryptedNsec` populated, both see it as ready, both DELETE (second is a no-op), but both return the encrypted key material. If an attacker intercepts the provisioning flow, they can race the legitimate device.

**Fix — Atomic consume via DELETE...RETURNING**:
```ts
async getProvisionRoom(id: string, token: string): Promise<...> {
  // Atomic consume: DELETE only if ready, RETURNING the full row
  const [room] = await this.db
    .delete(provisionRooms)
    .where(
      and(
        eq(provisionRooms.roomId, id),
        eq(provisionRooms.token, token),
        sql`${provisionRooms.encryptedNsec} IS NOT NULL`,
        sql`${provisionRooms.expiresAt} > NOW()`,
      ),
    )
    .returning()

  if (room) {
    return {
      status: 'ready',
      ephemeralPubkey: room.ephemeralPubkey,
      encryptedNsec: room.encryptedNsec,
      primaryPubkey: room.primaryPubkey ?? undefined,
    }
  }

  // Room wasn't ready or was already consumed — check if it exists and is waiting
  const [existing] = await this.db.select().from(provisionRooms)
    .where(eq(provisionRooms.roomId, id)).limit(1)

  if (!existing) throw new ServiceError(404, 'Room not found')
  if (existing.token !== token) throw new ServiceError(403, 'Invalid token')
  if (existing.expiresAt < new Date()) {
    await this.db.delete(provisionRooms).where(eq(provisionRooms.roomId, id))
    return { status: 'expired' }
  }

  return { status: 'waiting', ephemeralPubkey: existing.ephemeralPubkey }
}
```

---

### RACE-04 — Blast Expand Duplicate Deliveries (HIGH)

**File**: `apps/worker/services/blasts.ts:560-780` (`send` + `expandBlast`)

**Current code pattern**:
```ts
// expandBlast builds delivery rows and batch-inserts:
await this.db.insert(blastDeliveries).values(batch)
// No unique constraint check — if expandBlast is called twice (e.g., retry after
// partial failure), or if send() and expandBlast() race, duplicate delivery rows are created.
```

**Race window**: If `expandBlast` is called twice concurrently (e.g., two workers pick up the same sending blast), both enumerate the same subscribers and insert delivery rows. While a unique constraint `blast_delivery_unique` on `(blastId, subscriberId, channel)` already exists in the schema, the INSERT doesn't use `ON CONFLICT`, so it would throw a constraint violation error crashing the second caller instead of gracefully deduplicating.

**Existing constraint**: The schema already has `unique('blast_delivery_unique').on(table.blastId, table.subscriberId, table.channel)` — good. The fix is to use `ON CONFLICT DO NOTHING` so concurrent expansions gracefully skip duplicates.

**Fix**:
```ts
// In expandBlast, change batch insert to:
for (let i = 0; i < deliveryValues.length; i += BATCH_SIZE) {
  const batch = deliveryValues.slice(i, i + BATCH_SIZE)
  await this.db.insert(blastDeliveries).values(batch).onConflictDoNothing()
}
```

Also: the `send()` method should atomically transition `draft`→`sending` to prevent two callers from both triggering expansion:
```ts
// In send(), use atomic status transition:
const [row] = await this.db
  .update(blasts)
  .set({ status: 'sending', sentAt: new Date(), updatedAt: new Date(), stats: {...} })
  .where(and(eq(blasts.id, id), sql`${blasts.status} IN ('draft', 'scheduled')`))
  .returning()

if (!row) throw new ServiceError(400, 'Blast is not in a sendable state (may already be sending)')
```

---

### RACE-05 — Device Register Exceeds Max Limit (HIGH)

**File**: `apps/worker/services/identity.ts:819-878` (`registerDevice`)

**Current code pattern**:
```ts
// Fetch all devices for this user to make the eviction decision
const allDevices = await this.db
  .select(...)
  .from(devices)
  .where(eq(devices.pubkey, pubkey))
// ← No transaction, no row lock — another registration can happen concurrently

const decision = decideDeviceRegistration(allDevices, data.pushToken)
// ... evict / insert based on decision
```

**Race window**: Two concurrent device registrations for the same user. Both read the device count (say, 4). Both decide there's room for one more. Both insert. User now has 6 devices, exceeding the max of 5.

**Fix — Wrap in transaction with FOR UPDATE on user row**:
```ts
async registerDevice(pubkey: string, data: {...}): Promise<void> {
  await this.db.transaction(async (tx) => {
    // Lock user row to serialize concurrent registrations
    const [user] = await tx
      .select({ pubkey: users.pubkey })
      .from(users)
      .where(eq(users.pubkey, pubkey))
      .for('update')
      .limit(1)

    if (!user) throw new ServiceError(404, 'User not found')

    const allDevices = await tx
      .select({ id: devices.id, lastSeenAt: devices.lastSeenAt, pushToken: devices.pushToken })
      .from(devices)
      .where(eq(devices.pubkey, pubkey))

    const decision = decideDeviceRegistration(allDevices, data.pushToken)

    if (decision.action === 'update_existing') {
      await tx.update(devices).set({...}).where(eq(devices.id, decision.deviceId))
      return
    }

    if (decision.evictDeviceId) {
      await tx.delete(devices).where(eq(devices.id, decision.evictDeviceId))
    }

    await tx.insert(devices).values({...})
  })
}
```

---

### RACE-06 — Session Refresh TOCTOU (MEDIUM)

**File**: `apps/worker/services/identity.ts:591-618` (`validateSession`)

**Current code pattern**:
```ts
const rows = await this.db.select().from(sessions).where(eq(sessions.token, token)).limit(1)
// ← Session could be deleted/expired concurrently between here...
if (row.expiresAt < new Date()) {
  await this.db.delete(sessions).where(eq(sessions.token, token))
  throw ...
}
// Sliding expiry renewal
const remaining = row.expiresAt.getTime() - Date.now()
if (remaining < RENEWAL_THRESHOLD_MS) {
  await this.db.update(sessions).set({ expiresAt: newExpiry })
    .where(eq(sessions.token, token))
  // ← ...and here. Update succeeds on deleted row (0 rows updated, no error thrown)
```

**Race window**: Session is read, then concurrently deleted by `revokeSession()` or `cleanup()`. The renewal UPDATE targets a now-deleted row — returns 0 rows. The method returns a "valid" session to the caller even though it was just revoked.

**Fix — Atomic conditional update**:
```ts
async validateSession(token: string): Promise<ServerSession> {
  // Single query: read and check expiry
  const rows = await this.db
    .select()
    .from(sessions)
    .where(eq(sessions.token, token))
    .limit(1)

  if (rows.length === 0) throw new ServiceError(401, 'Invalid session')
  const row = rows[0]

  if (row.expiresAt < new Date()) {
    await this.db.delete(sessions).where(eq(sessions.token, token))
    throw new ServiceError(401, 'Session expired')
  }

  // Sliding expiry — atomic conditional renewal
  const remaining = row.expiresAt.getTime() - Date.now()
  if (remaining < RENEWAL_THRESHOLD_MS) {
    const newExpiry = new Date(Date.now() + SESSION_DURATION_MS)
    const [updated] = await this.db
      .update(sessions)
      .set({ expiresAt: newExpiry })
      .where(
        and(
          eq(sessions.token, token),
          sql`${sessions.expiresAt} > NOW()`, // only renew if still alive
        ),
      )
      .returning()

    if (!updated) throw new ServiceError(401, 'Session expired or revoked')
    return { ...rowToSession(row), expiresAt: newExpiry.toISOString() }
  }

  return rowToSession(row)
}
```

---

### RACE-07 — PUK Envelope Stale Read (MEDIUM)

**File**: `apps/worker/services/crypto-keys.ts:212-250` (`getPukEnvelopeForDevice`)

**Current code pattern**:
```ts
// Query 1: get max generation
const [maxRow] = await this.db
  .select({ maxGen: max(pukEnvelopes.generation) })
  .from(pukEnvelopes)
  .where(and(eq(userPubkey), eq(deviceId)))

// ← Gap: a new envelope with generation+1 could be inserted here

// Query 2: fetch the envelope at that generation
const [row] = await this.db.select().from(pukEnvelopes)
  .where(and(eq(userPubkey), eq(deviceId), eq(generation, maxRow.maxGen)))
```

**Race window**: Between the two queries, a PUK rotation inserts a new envelope with `generation = maxGen + 1`. The second query fetches the old generation's envelope. The client gets a stale PUK seed and can't decrypt new content.

**Fix — Single query with subquery or ORDER BY + LIMIT**:
```ts
async getPukEnvelopeForDevice(
  userPubkey: string,
  deviceId: string,
): Promise<PukEnvelopeRecord | null> {
  // Single query: fetch the latest envelope directly
  const [row] = await this.db
    .select()
    .from(pukEnvelopes)
    .where(
      and(
        eq(pukEnvelopes.userPubkey, userPubkey),
        eq(pukEnvelopes.deviceId, deviceId),
      ),
    )
    .orderBy(desc(pukEnvelopes.generation))
    .limit(1)

  if (!row) return null

  return {
    id: row.id,
    userPubkey: row.userPubkey,
    deviceId: row.deviceId,
    generation: row.generation,
    envelope: row.envelope,
    createdAt: row.createdAt.toISOString(),
  }
}
```

---

### RACE-08 — WebAuthn Challenge Delete-Before-Validate DoS (MEDIUM)

**File**: `apps/worker/services/identity.ts:744-765` (`getWebAuthnChallenge`)

**Current code pattern**:
```ts
async getWebAuthnChallenge(id: string): Promise<{ challenge: string }> {
  const rows = await this.db.select().from(webauthnChallenges)
    .where(eq(webauthnChallenges.challengeId, id)).limit(1)
  if (rows.length === 0) throw new ServiceError(404, 'Challenge not found')
  // Delete immediately (one-time use)
  await this.db.delete(webauthnChallenges)
    .where(eq(webauthnChallenges.challengeId, id))
  // Check expiry
  if (Date.now() - row.createdAt.getTime() > CHALLENGE_TTL_MS) throw ...
  return { challenge: row.challenge }
}
```

**Race window / DoS vector**: The `challengeId` is the only identifier needed to consume/delete a challenge. If an attacker can learn or predict the challenge ID, they can call `getWebAuthnChallenge(id)` first, deleting the challenge before the legitimate user validates their WebAuthn response. The legitimate user's validation then fails with "Challenge not found."

**Note**: The `webauthnChallenges` table has no `pubkey` column — challenges are not bound to a user at the database level. The ID alone is sufficient to consume.

**Fix — Atomic DELETE...RETURNING + bind challenge to user**:

Phase 1 (immediate, no schema change):
```ts
async getWebAuthnChallenge(id: string): Promise<{ challenge: string }> {
  // Atomic consume: DELETE and return in one operation
  const [row] = await this.db
    .delete(webauthnChallenges)
    .where(
      and(
        eq(webauthnChallenges.challengeId, id),
        // Only consume if not expired
        sql`${webauthnChallenges.createdAt} > NOW() - INTERVAL '${CHALLENGE_TTL_MS} milliseconds'`,
      ),
    )
    .returning()

  if (!row) throw new ServiceError(404, 'Challenge not found or expired')
  return { challenge: row.challenge }
}
```

Phase 2 (schema migration — recommended): Add a `pubkey` column to `webauthnChallenges` and bind challenge consumption to the authenticated user:
```sql
ALTER TABLE webauthn_challenges ADD COLUMN pubkey TEXT;
```
Then consume with `WHERE challenge_id = $1 AND pubkey = $2`.

---

### RACE-09 — Bulk Import Per-Row Race (MEDIUM)

**File**: `apps/worker/services/blasts.ts:223-287` (`importBulk`)

**Current code pattern**:
```ts
for (const entry of entries) {
  const identifierHash = this.hashIdentifier(entry.identifier)
  const existing = await this.getSubscriberByIdentifierHash(identifierHash, hubId)
  // ← Gap: concurrent import inserts the same subscriber
  if (existing) {
    // Merge channels/tags
  } else {
    await this.db.insert(subscribers).values({...})
    // ← Concurrent insert with same identifierHash could violate unique constraint
    //    or both succeed if the constraint doesn't cover all cases
  }
}
```

**Race window**: Two concurrent bulk imports with overlapping identifiers. Both check for an existing subscriber with the same `identifierHash`, both find none, both INSERT. The existing unique constraint `subscribers_hub_identifier_idx` on `(hubId, identifierHash)` would cause a constraint violation crash for one of them.

**Fix — Use INSERT...ON CONFLICT DO UPDATE**:
```ts
async importBulk(hubId: string, entries: ImportSubscriberEntry[]): Promise<...> {
  let imported = 0
  let skipped = 0

  for (const entry of entries) {
    const identifierHash = this.hashIdentifier(entry.identifier)
    const preferenceToken = this.generatePreferenceToken(identifierHash)
    const encrypted = this.hmacSecret
      ? encryptContactIdentifier(entry.identifier, this.hmacSecret)
      : null

    const channels = [{ type: entry.channel, verified: false }]

    const [result] = await this.db
      .insert(subscribers)
      .values({
        hubId,
        identifierHash,
        encryptedIdentifier: encrypted,
        channels,
        tags: entry.tags ?? [],
        language: entry.language ?? 'en',
        status: 'active',
        doubleOptInConfirmed: false,
        preferenceToken,
      })
      .onConflictDoUpdate({
        target: [subscribers.hubId, subscribers.identifierHash],
        set: {
          // Merge channels — use SQL to append if not present
          channels: sql`(
            SELECT jsonb_agg(DISTINCT elem)
            FROM (
              SELECT elem FROM jsonb_array_elements(${subscribers.channels}) elem
              UNION ALL
              SELECT elem FROM jsonb_array_elements(${JSON.stringify(channels)}::jsonb) elem
            ) combined
          )`,
          tags: sql`(
            SELECT COALESCE(array_agg(DISTINCT t), '{}')
            FROM unnest(${subscribers.tags} || ${sql`ARRAY[${sql.join((entry.tags ?? []).map(t => sql`${t}`), sql`,`)}]::text[]`}) t
          )`,
        },
      })
      .returning()

    // If the returned row was newly created vs. updated — check subscribedAt
    // For simplicity, count based on whether the channels changed
    if (result) {
      // A row was returned either way; we count as imported if new
      imported++ // Simplified — exact import/skip tracking can use xmax trick
    }
  }

  return { imported, skipped, total: entries.length }
}
```

Alternatively, a simpler approach: wrap each row in a try-catch that handles the unique constraint violation gracefully, falling back to the merge UPDATE. Or batch the entire import in a single transaction.

---

### RACE-10 — Erasure Re-Encryption Jobs Lost on Crash (MEDIUM)

**File**: `apps/worker/services/erasure.ts:245-364` (`executeErasure`)

**Current code pattern**:
```ts
await this.db.transaction(async (tx) => {
  // Phase 2 + Phase 3: cleanup + crypto-shredding
  // ... all inside transaction ...
  await auditService.log(...)
})

// Phase 4: Queue re-encryption jobs (OUTSIDE transaction)
for (const row of hubMembershipsRows) {
  const [job] = await this.db.insert(reEncryptionJobs).values({...}).returning()
  reEncryptionJobIds.push(job.id)
}

// Update erasure request status
await this.db.update(erasureRequests).set({ status: 'completed' })...
```

**Race window / crash scenario**: If the process crashes after the transaction commits (Phase 2+3 done) but before the re-encryption jobs are inserted, the user's data is shredded but the re-encryption never runs. Notes/messages that had the departed user in their envelope list retain stale envelopes that reference a destroyed key — these envelopes are harmless (can't be decrypted) but are never cleaned up.

Similarly, if the process crashes after some re-encryption jobs are queued but before the erasure request status is updated to `completed`, the request stays in `executing` state forever.

**Fix — Move re-encryption job queuing inside the transaction**:
```ts
async executeErasure(...): Promise<{ reEncryptionJobIds: string[] }> {
  const hubMembershipsRows = await this.db.execute(sql`...`)

  const reEncryptionJobIds: string[] = []

  await this.db.transaction(async (tx) => {
    // Phase 2 + Phase 3: cleanup + crypto-shredding (existing code)
    // ...

    // Phase 4: Queue re-encryption jobs INSIDE transaction
    for (const row of hubMembershipsRows as { hub_id: string }[]) {
      if (!row.hub_id) continue
      const [job] = await tx  // Use tx, not this.db
        .insert(reEncryptionJobs)
        .values({ userId, hubId: row.hub_id, status: 'queued' })
        .returning()
      reEncryptionJobIds.push(job.id)
    }

    // Update erasure request status INSIDE transaction
    await tx
      .update(erasureRequests)
      .set({ status: 'completed', executedAt: new Date() })
      .where(
        and(
          eq(erasureRequests.userId, userId),
          eq(erasureRequests.status, 'executing'),
        ),
      )

    // Audit log INSIDE transaction (already there)
    await auditService.log('userErasureExecuted', executedBy, {
      targetUserId: userId,
      justification,
    })
  })

  return { reEncryptionJobIds }
}
```

**Note**: The audit service's `log` call must also use the transaction handle (`tx`). If AuditService has its own `db` reference, it needs an overload or parameter that accepts a transaction context. This is an implementation detail for the plan.

---

### RACE-11 — updateUser Read-Then-Write (LOW)

**File**: `apps/worker/services/identity.ts:314-370` (`updateUser`)

**Current code pattern**:
```ts
async updateUser(pubkey, data, isAdmin): Promise<...> {
  const existing = await this.db.select().from(users)
    .where(eq(users.pubkey, pubkey)).limit(1)
  // ← No lock — concurrent updates can both read old state
  if (existing.length === 0) throw ...

  const updates = {}
  // Build updates from data...
  updates.updatedAt = new Date()

  const [row] = await this.db.update(users).set(updates)
    .where(eq(users.pubkey, pubkey)).returning()
  return { volunteer: sanitizeUser(rowToUser(row)) }
}
```

**Race window**: Two concurrent `PATCH /api/users/:pubkey` requests. Both read the same current state, both build their update payloads independently, both write. The second write overwrites the first's changes for any overlapping fields.

**Severity note**: LOW because the `updates` object is built from the request data, not from existing state — the code doesn't do a read-modify-write on the same field (except `hubRoles`, which has its own `FOR UPDATE` in `setHubRole`). The real risk is limited to the existence check being stale: the user could be deleted between the SELECT and UPDATE. The UPDATE on a deleted user returns 0 rows, and the code destructures `[row]` which would be `undefined`.

**Fix — Direct UPDATE with existence check via RETURNING**:
```ts
async updateUser(pubkey, data, isAdmin): Promise<...> {
  const updates: Partial<typeof users.$inferInsert> = {}
  // Build updates from data (same logic)...
  for (const [key, value] of Object.entries(data)) {
    if (key === 'pubkey') continue
    if (key === 'active' && !isAdmin) throw ...
    if (isAdmin || VOLUNTEER_SAFE_FIELDS.has(key)) {
      applyField(key, value)
    }
  }
  updates.updatedAt = new Date()

  if (Object.keys(updates).length <= 1) { // only updatedAt
    throw new ServiceError(400, 'No valid fields to update')
  }

  const [row] = await this.db
    .update(users)
    .set(updates)
    .where(eq(users.pubkey, pubkey))
    .returning()

  if (!row) throw new ServiceError(404, 'Not found')
  return { volunteer: sanitizeUser(rowToUser(row)) }
}
```

---

### RACE-12 — Recovery Key Store Memory Leak (LOW)

**File**: `packages/crypto/src/ffi.rs:23-638`

**Current code pattern**:
```rust
static RECOVERY_KEY_STORE: std::sync::LazyLock<Mutex<HashMap<u64, zeroize::Zeroizing<String>>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

static NEXT_HANDLE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

pub fn mobile_recovery_group_generate_keypair() -> RecoveryGroupKeypair {
    // Generates keypair, stores private key in RECOVERY_KEY_STORE
    let handle = NEXT_HANDLE.fetch_add(1, ...);
    RECOVERY_KEY_STORE.lock().expect("...").insert(handle, sk);
    // ← Key stays in store until mobile_recovery_group_split_private_key is called
    // ← If split is never called (crash, app backgrounded), key stays forever
}
```

**Race window / leak scenario**: Not a race condition per se, but a resource leak. If `mobile_recovery_group_generate_keypair` is called but `mobile_recovery_group_split_private_key` is never called (app crash, user abandons flow), the private key material stays in the global `RECOVERY_KEY_STORE` HashMap indefinitely. Repeated abandoned flows accumulate entries.

**Fix — Add TTL-based eviction + max capacity**:
```rust
use std::time::Instant;

struct KeyEntry {
    key: zeroize::Zeroizing<String>,
    created_at: Instant,
}

const MAX_STORE_ENTRIES: usize = 16;
const KEY_TTL_SECS: u64 = 300; // 5 minutes

static RECOVERY_KEY_STORE: std::sync::LazyLock<Mutex<HashMap<u64, KeyEntry>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn mobile_recovery_group_generate_keypair() -> RecoveryGroupKeypair {
    let (sk, pk) = crate::shamir::generate_recovery_group_keypair();
    let handle = NEXT_HANDLE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    let mut store = RECOVERY_KEY_STORE.lock().expect("...");

    // Evict expired entries
    let now = Instant::now();
    store.retain(|_, entry| now.duration_since(entry.created_at).as_secs() < KEY_TTL_SECS);

    // Cap maximum entries
    if store.len() >= MAX_STORE_ENTRIES {
        // Remove oldest entry
        if let Some(&oldest_handle) = store.keys()
            .min_by_key(|&&h| store.get(&h).map(|e| e.created_at).unwrap_or(now))
        {
            store.remove(&oldest_handle);
        }
    }

    store.insert(handle, KeyEntry {
        key: sk,
        created_at: now,
    });

    RecoveryGroupKeypair { handle, public_key_hex: pk }
}
```

Update `mobile_recovery_group_split_private_key` to extract from the new struct:
```rust
pub fn mobile_recovery_group_split_private_key(handle: u64, total: u8, threshold: u8)
  -> Result<Vec<...>, CryptoError>
{
    let entry = RECOVERY_KEY_STORE.lock().expect("...")
        .remove(&handle)
        .ok_or_else(|| CryptoError::InvalidInput("invalid or already-consumed or expired handle".into()))?;

    let mut sk = entry.key;
    // ... rest unchanged
}
```

---

### RACE-13 — Bulk Import Channel Merge Conflict (LOW)

**File**: `apps/worker/services/blasts.ts:230-264`

**Current code pattern**: Same loop as RACE-09, but focused on the channel merge path:
```ts
const existing = await this.getSubscriberByIdentifierHash(identifierHash, hubId)
if (existing) {
  const channels = (existing.channels ?? []) as SubscriberChannel[]
  // Check if channel already present, push if not
  // ← Another import could be modifying channels concurrently
  await this.db.update(subscribers)
    .set({ channels, tags })
    .where(eq(subscribers.id, existing.id))
}
```

**Race window**: Two concurrent imports both read the same subscriber's channels array. Both decide to add a new channel. Both write their version. The second write overwrites the first's channel addition.

**Fix**: This is addressed by the same fix as RACE-09. Using `INSERT ... ON CONFLICT DO UPDATE` with a SQL-level merge operation (as shown in RACE-09) ensures the channel merge happens atomically in the database rather than in application code.

---

## Verified-Clean Patterns (Audit Confirmation)

The following patterns were reviewed by the auditor and confirmed safe. Document them here so future audits don't re-flag them:

1. **`drainDeliveryBatch`** (`blasts.ts:791-809`) — Uses `FOR UPDATE SKIP LOCKED` with CTE. Correct concurrent delivery claiming pattern. ✅

2. **`markExecuting`** (`erasure.ts:386-393`) — Atomic `UPDATE ... WHERE status = 'pending' RETURNING`. Only one caller wins the race. ✅

3. **`setHubRole` / `removeHubRole`** (`identity.ts:388-440`) — Uses `FOR UPDATE` inside transaction. Correct read-modify-write pattern. ✅

4. **`revokeDevice`** (`identity.ts:942-1011`) — Sigchain append + device delete + security event inside single transaction. ✅

5. **`distributePukEnvelopes`** (`crypto-keys.ts:182-206`) — Bulk INSERT with unique constraint protection. ✅

6. **`bootstrapAdmin`** (`identity.ts:174-192`) — Uses `onConflictDoNothing()`. Safe against concurrent bootstrap. ✅

7. **`markDeliverySent/Delivered/Failed`** (`blasts.ts:828-896`) — Single-row UPDATEs by ID. Idempotent status transitions. ✅

---

## Transaction Pattern Guide

### Drizzle ORM `FOR UPDATE`

```ts
// Lock rows for the duration of the transaction
await tx
  .select()
  .from(someTable)
  .where(eq(someTable.id, id))
  .for('update')
  .limit(1)
```

### Drizzle ORM `DELETE ... RETURNING`

```ts
// Atomic fetch-and-delete
const [row] = await this.db
  .delete(someTable)
  .where(and(eq(someTable.id, id), eq(someTable.status, 'pending')))
  .returning()
```

### Drizzle ORM `UPDATE ... WHERE ... RETURNING`

```ts
// Atomic conditional update (claim pattern)
const [row] = await this.db
  .update(someTable)
  .set({ status: 'claimed', claimedAt: new Date() })
  .where(and(eq(someTable.id, id), eq(someTable.status, 'pending')))
  .returning()

if (!row) throw new Error('Already claimed or not found')
```

### Drizzle ORM `ON CONFLICT`

```ts
// Upsert — insert or update on constraint violation
await this.db
  .insert(someTable)
  .values({...})
  .onConflictDoNothing()                    // Skip duplicate
  // OR
  .onConflictDoUpdate({
    target: someTable.uniqueColumn,          // Or [col1, col2] for composite
    set: { field: newValue },
  })
```

### Raw SQL for `FOR UPDATE SKIP LOCKED`

Drizzle ORM's `.for()` supports `'update'` but not `SKIP LOCKED` natively. Use raw SQL:
```ts
const rows = await this.db.execute(sql`
  SELECT * FROM some_table
  WHERE status = 'pending'
  LIMIT ${batchSize}
  FOR UPDATE SKIP LOCKED
`)
```

---

## Database Constraint Additions

### New constraints needed

| Table | Constraint | Type | Purpose |
|-------|-----------|------|---------|
| `webauthn_challenges` | Add `pubkey` column | Schema | Bind challenges to users (RACE-08 Phase 2) |

### Existing constraints confirmed sufficient

| Table | Constraint | Status |
|-------|-----------|--------|
| `blast_deliveries` | `unique('blast_delivery_unique').on(blastId, subscriberId, channel)` | ✅ Already exists — RACE-04 just needs `ON CONFLICT` |
| `subscribers` | `unique('subscribers_hub_identifier_idx').on(hubId, identifierHash)` | ✅ Already exists — RACE-09 just needs `ON CONFLICT` |
| `invite_codes` | PK on `code` | ✅ Sufficient with atomic UPDATE |
| `provision_rooms` | PK on `roomId` | ✅ Sufficient with atomic DELETE |

---

## Migration Plan

### Migration 1: `webauthn_challenges` pubkey column (RACE-08 Phase 2)

```sql
ALTER TABLE webauthn_challenges ADD COLUMN pubkey TEXT;
-- Backfill: existing challenges are short-lived (5min TTL), no backfill needed
-- Index for the new query pattern:
CREATE INDEX webauthn_challenges_pubkey_idx ON webauthn_challenges (pubkey);
```

This migration is non-blocking (ADD COLUMN with no NOT NULL and no default doesn't lock the table).

### No other migrations needed

All other fixes are application-level query changes that use existing constraints.

---

## BDD Test Scenarios

Race condition tests require concurrent request execution. Use `Promise.all` to fire parallel requests.

### RACE-01: Invite double-redeem
```gherkin
Scenario: Concurrent invite redemption only creates one volunteer
  Given an admin creates an invite code
  When two users simultaneously redeem the same invite code
  Then exactly one user is created
  And one redemption returns an error
```

### RACE-02: MLS message double-fetch
```gherkin
Scenario: Concurrent MLS message fetch returns messages to only one caller
  Given MLS messages are queued for a device
  When two requests simultaneously fetch MLS messages for that device
  Then exactly one response contains the messages
  And the other response is empty
```

### RACE-03: Provision room double-consume
```gherkin
Scenario: Concurrent provision room consumption succeeds for only one caller
  Given a provision room has an encrypted payload
  When two requests simultaneously poll the provision room
  Then exactly one response contains the encrypted payload
  And the other response indicates room not found
```

### RACE-04: Blast expansion idempotency
```gherkin
Scenario: Concurrent blast expansion does not create duplicate deliveries
  Given a blast is in sending state with 10 matching subscribers
  When expand is called twice concurrently
  Then exactly 10 delivery records exist (not 20)
```

### RACE-05: Device registration limit
```gherkin
Scenario: Concurrent device registrations respect the max device limit
  Given a user has 4 registered devices (max 5)
  When two new devices register simultaneously
  Then the user has at most 5 devices
```

### RACE-06: Session renewal after revocation
```gherkin
Scenario: Session renewal fails if session was concurrently revoked
  Given a user has an active session near expiry
  When the session is revoked and renewed simultaneously
  Then the renewal returns an auth error
```

---

## Dependency Ordering

### Independent (can be done in parallel)
- RACE-01 (invite redeem) — isolated to `redeemInvite`
- RACE-02 (MLS fetch-delete) — isolated to `fetchAndClearMlsMessages`
- RACE-03 (provision room) — isolated to `getProvisionRoom`
- RACE-06 (session refresh) — isolated to `validateSession`
- RACE-07 (PUK stale read) — isolated to `getPukEnvelopeForDevice`
- RACE-08 (WebAuthn challenge) — isolated to `getWebAuthnChallenge`
- RACE-11 (updateUser) — isolated to `updateUser`
- RACE-12 (recovery key store) — isolated to `packages/crypto/src/ffi.rs`

### Coupled pairs
- **RACE-04, RACE-09, RACE-13** — All in `blasts.ts`, touch related subscriber/delivery code. Should be done together to ensure consistent use of `ON CONFLICT` patterns.
- **RACE-05** — Depends on transaction pattern being consistent with how identity.ts uses transactions (same patterns as RACE-01).
- **RACE-10** — Changes transaction boundary in `erasure.ts`. May require AuditService to accept a transaction context parameter. Check if AuditService.log already supports this.

### Suggested execution order
1. **Wave 1** (CRITICAL + simple HIGH): RACE-01, RACE-02, RACE-03 — highest impact, simplest fixes
2. **Wave 2** (remaining HIGH + MEDIUM): RACE-04/09/13 (blast batch), RACE-05, RACE-06, RACE-07, RACE-08
3. **Wave 3** (LOW + architectural): RACE-10, RACE-11, RACE-12

---

## Scope Exclusion

**H09 (PUK envelope race)** is tracked in Epic E and excluded from this spec.
