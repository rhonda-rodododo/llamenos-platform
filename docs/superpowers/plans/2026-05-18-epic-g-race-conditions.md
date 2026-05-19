# Epic G — Race Conditions & Concurrency Fixes: Implementation Plan

**Spec**: `docs/superpowers/specs/2026-05-18-epic-g-race-conditions.md`
**Date**: 2026-05-18
**Findings**: 13 race conditions (1 CRITICAL, 4 HIGH, 5 MEDIUM, 3 LOW)

---

## Standard Pattern Guide

All fixes use one of four Drizzle ORM patterns. Implementors must use these exact patterns — no application-level "check then act" alternatives.

### Pattern A: Atomic Claim (`UPDATE ... WHERE condition RETURNING *`)

Collapses read + check + write into a single statement. PostgreSQL's row-level lock on UPDATE ensures only one concurrent caller matches the WHERE clause.

```ts
const [row] = await db
  .update(table)
  .set({ claimed: true, claimedAt: new Date() })
  .where(and(eq(table.id, id), eq(table.claimed, false)))
  .returning()

if (!row) throw new ServiceError(400, 'Already claimed or not found')
```

**Use for**: RACE-01, RACE-04 (send), RACE-06

### Pattern B: Atomic Fetch-and-Delete (`DELETE ... RETURNING *`)

Atomically selects and removes rows. Second concurrent caller sees no matching rows.

```ts
const rows = await db
  .delete(table)
  .where(and(eq(table.id, id), eq(table.status, 'pending')))
  .returning()
```

**Use for**: RACE-02, RACE-03, RACE-08

### Pattern C: Row Locking (`FOR UPDATE` inside transaction)

Lock rows before read-modify-write to serialize concurrent transactions.

```ts
await db.transaction(async (tx) => {
  const [row] = await tx
    .select()
    .from(table)
    .where(eq(table.id, id))
    .for('update')
    .limit(1)
  // ... modify and write back
})
```

**Use for**: RACE-05, RACE-07 (simplified to single query), RACE-11

### Pattern D: Database Constraints + `ON CONFLICT`

Prevent duplicates at the schema level. Application uses `onConflictDoNothing()` or `onConflictDoUpdate()`.

```ts
await db
  .insert(table)
  .values({...})
  .onConflictDoNothing()  // or .onConflictDoUpdate({...})
```

**Use for**: RACE-04 (expand), RACE-09, RACE-13

---

## Phase 1: Critical + High (RACE-01, -02, -03, -04, -05)

### Task 1.1 — RACE-01: Atomic invite claim

**File**: `apps/worker/services/identity.ts` — `redeemInvite` method (~line 508-547)
**Pattern**: A (Atomic Claim)
**Severity**: CRITICAL

**Current**: SELECT invite → check `usedAt IS NULL` → UPDATE set used → INSERT user. Two concurrent redemptions both see `usedAt=NULL`.

**Fix**:
1. Replace the SELECT + check + UPDATE sequence with a single atomic UPDATE:
   ```ts
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
   ```
2. Remove the separate SELECT, the `if (invite.usedAt)` check, and the `if (invite.expiresAt < new Date())` check — all folded into the WHERE clause.
3. The rest of the transaction (INSERT user) stays unchanged.

**No migration needed.**

---

### Task 1.2 — RACE-02: MLS messages atomic fetch-delete

**File**: `apps/worker/services/crypto-keys.ts` — `fetchAndClearMlsMessages` method (~line 284-317)
**Pattern**: B (Atomic Fetch-and-Delete)
**Severity**: HIGH

**Current**: SELECT messages → DELETE messages. Two concurrent fetches both get the same messages.

**Fix**:
1. Replace the SELECT + DELETE with a single `DELETE ... RETURNING`:
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
2. Remove the `if (rows.length === 0) return []` early return — the DELETE RETURNING handles it (returns empty array).

**No migration needed.**

---

### Task 1.3 — RACE-03: Provision room atomic consume

**File**: `apps/worker/services/identity.ts` — `getProvisionRoom` method (~line 1189-1222)
**Pattern**: B (Atomic Fetch-and-Delete)
**Severity**: HIGH

**Current**: SELECT room → check `encryptedNsec` → DELETE room. Two concurrent polls both get the encrypted key material.

**Fix**:
1. Attempt an atomic DELETE where the room is ready (has encryptedNsec, valid token, not expired):
   ```ts
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
   ```
2. If DELETE returned a row → return `{ status: 'ready', ... }`.
3. If DELETE returned nothing → fall back to SELECT to distinguish waiting/expired/not-found:
   ```ts
   const [existing] = await this.db.select().from(provisionRooms)
     .where(eq(provisionRooms.roomId, id)).limit(1)
   
   if (!existing) throw new ServiceError(404, 'Room not found')
   if (existing.token !== token) throw new ServiceError(403, 'Invalid token')
   if (existing.expiresAt < new Date()) {
     await this.db.delete(provisionRooms).where(eq(provisionRooms.roomId, id))
     return { status: 'expired' }
   }
   return { status: 'waiting', ephemeralPubkey: existing.ephemeralPubkey }
   ```

**No migration needed.**

---

### Task 1.4 — RACE-04: Blast expansion dedup + atomic send

**File**: `apps/worker/services/blasts.ts` — `send` method (~line 560) + `expandBlast` (batch insert)
**Pattern**: A (Atomic Claim for send) + D (ON CONFLICT for expand)
**Severity**: HIGH

**Current**: `send()` reads blast, checks status, then UPDATEs — no atomicity. `expandBlast` inserts delivery rows without `ON CONFLICT`, so retries crash on the existing unique constraint.

**Fix — Part A (`send` method)**:
1. Replace the read-check-update pattern in `send()` with an atomic status transition:
   ```ts
   async send(id: string, hubId?: string): Promise<BlastRow> {
     // ... rate limit check stays ...
     
     const [row] = await this.db
       .update(blasts)
       .set({
         status: 'sending',
         sentAt: new Date(),
         updatedAt: new Date(),
         stats: { totalRecipients: 0, sent: 0, delivered: 0, failed: 0, optedOut: 0 },
       })
       .where(
         and(
           eq(blasts.id, id),
           sql`${blasts.status} IN ('draft', 'scheduled')`,
         ),
       )
       .returning()
     
     if (!row) throw new ServiceError(400, 'Blast is not in a sendable state (may already be sending)')
     return row
   }
   ```
2. Remove the `getBlast(id)` call and the separate status check at the top of `send()`.

**Fix — Part B (`expandBlast` batch insert)**:
1. Change all `db.insert(blastDeliveries).values(batch)` calls in `expandBlast` to use `.onConflictDoNothing()`:
   ```ts
   await this.db.insert(blastDeliveries).values(batch).onConflictDoNothing()
   ```
2. The existing unique constraint `blast_delivery_unique` on `(blastId, subscriberId, channel)` handles dedup.

**No migration needed** — constraint already exists.

---

### Task 1.5 — RACE-05: Device registration with row locking

**File**: `apps/worker/services/identity.ts` — `registerDevice` method (~line 819-878)
**Pattern**: C (Row Locking with FOR UPDATE)
**Severity**: HIGH

**Current**: Reads all devices for user (no transaction, no lock) → decides eviction → inserts. Two concurrent registrations both see room for one more.

**Fix**:
1. Wrap the entire method body in `this.db.transaction()`.
2. Lock the user row with `FOR UPDATE` to serialize concurrent registrations:
   ```ts
   async registerDevice(pubkey: string, data: {...}): Promise<void> {
     await this.db.transaction(async (tx) => {
       // Serialize concurrent registrations by locking the user row
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
3. All `this.db` calls inside the method become `tx` calls.

**No migration needed.**

---

### Task 1.6 — Database migration (Phase 1)

No new database migrations are needed for Phase 1. All existing constraints are sufficient:
- `invite_codes`: PK on `code` — sufficient with atomic UPDATE
- `provision_rooms`: PK on `roomId` — sufficient with atomic DELETE
- `blast_deliveries`: `blast_delivery_unique` on `(blastId, subscriberId, channel)` — already exists
- `devices`: No unique constraint needed — row locking on user row serializes access

---

### Task 1.7 — BDD tests for Phase 1

**New feature file**: `packages/test-specs/features/security/race-conditions.feature`

All race condition tests use `Promise.all` to fire concurrent requests through the real API.

```gherkin
@security @concurrency
Feature: Race condition prevention

  Background:
    Given a fresh hub with an admin

  # RACE-01
  Scenario: Concurrent invite redemption only creates one volunteer
    Given an admin creates an invite code
    When two users simultaneously redeem the same invite code
    Then exactly one user is created
    And one redemption returns an error

  # RACE-02
  Scenario: Concurrent MLS message fetch returns messages to only one caller
    Given MLS messages are queued for a device
    When two requests simultaneously fetch MLS messages for that device
    Then exactly one response contains the messages
    And the other response is empty

  # RACE-03
  Scenario: Concurrent provision room consumption succeeds for only one caller
    Given a provision room has an encrypted payload
    When two requests simultaneously poll the provision room
    Then exactly one response contains the encrypted payload
    And the other response indicates room not found or waiting

  # RACE-04
  Scenario: Concurrent blast expansion does not create duplicate deliveries
    Given a blast with 10 matching subscribers
    When the blast is sent and expanded concurrently twice
    Then exactly 10 delivery records exist

  # RACE-05
  Scenario: Concurrent device registrations respect max device limit
    Given a user has 4 registered devices
    When two new devices register simultaneously
    Then the user has at most 5 devices
```

**Step definitions**: `apps/worker/tests/bdd/steps/race-condition-steps.ts`

Each step definition must:
1. Set up the precondition via the real API
2. Use `Promise.all([request1(), request2()])` for the "simultaneously" step
3. Assert on outcomes (one success + one failure, or count constraints)

---

## Phase 2: Medium (RACE-06, -07, -08, -09, -10)

### Task 2.1 — RACE-06: Session refresh atomic conditional update

**File**: `apps/worker/services/identity.ts` — `validateSession` method (~line 591-618)
**Pattern**: A (Atomic Claim on renewal)
**Severity**: MEDIUM

**Current**: SELECT session → check expiry → UPDATE set new expiry. If session is revoked between SELECT and UPDATE, the UPDATE silently does nothing but the method returns "valid".

**Fix**:
1. Keep the initial SELECT for reading session data.
2. Replace the sliding expiry UPDATE with an atomic conditional update:
   ```ts
   if (remaining < RENEWAL_THRESHOLD_MS) {
     const newExpiry = new Date(Date.now() + SESSION_DURATION_MS)
     const [updated] = await this.db
       .update(sessions)
       .set({ expiresAt: newExpiry })
       .where(
         and(
           eq(sessions.token, token),
           sql`${sessions.expiresAt} > NOW()`,
         ),
       )
       .returning()
     
     if (!updated) throw new ServiceError(401, 'Session expired or revoked')
     return { ...rowToSession(row), expiresAt: newExpiry.toISOString() }
   }
   ```
3. The `sql\`expiresAt > NOW()\`` clause ensures we only renew a still-alive session.

**No migration needed.**

---

### Task 2.2 — RACE-07: PUK envelope single-query fetch

**File**: `apps/worker/services/crypto-keys.ts` — `getPukEnvelopeForDevice` method (~line 212-250)
**Pattern**: Single query (not a transaction, just consolidation)
**Severity**: MEDIUM

**Current**: Two queries — first gets `MAX(generation)`, second fetches that generation. A PUK rotation between queries returns stale data.

**Fix**:
1. Replace the two queries with a single `ORDER BY generation DESC LIMIT 1`:
   ```ts
   async getPukEnvelopeForDevice(
     userPubkey: string,
     deviceId: string,
   ): Promise<PukEnvelopeRecord | null> {
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
2. Ensure `desc` is imported from `drizzle-orm`.

**No migration needed.**

---

### Task 2.3 — RACE-08: WebAuthn challenge atomic consume (Phase 1 + Phase 2)

**File**: `apps/worker/services/identity.ts` — `getWebAuthnChallenge` method (~line 744-765)
**Pattern**: B (Atomic Fetch-and-Delete)
**Severity**: MEDIUM

**Phase 1 — Atomic DELETE...RETURNING (no schema change)**:
1. Replace SELECT + DELETE with atomic DELETE:
   ```ts
   async getWebAuthnChallenge(id: string): Promise<{ challenge: string }> {
     const [row] = await this.db
       .delete(webauthnChallenges)
       .where(
         and(
           eq(webauthnChallenges.challengeId, id),
           sql`${webauthnChallenges.createdAt} > NOW() - INTERVAL '${CHALLENGE_TTL_MS / 1000} seconds'`,
         ),
       )
       .returning()
     
     if (!row) throw new ServiceError(404, 'Challenge not found or expired')
     return { challenge: row.challenge }
   }
   ```

**Phase 2 — Schema migration to bind challenges to users**:
1. **Migration file**: Add `pubkey` column to `webauthn_challenges`:
   ```ts
   // In schema: apps/worker/db/schema/users.ts
   export const webauthnChallenges = pgTable('webauthn_challenges', {
     challengeId: text('challenge_id').primaryKey(),
     challenge: text('challenge').notNull(),
     pubkey: text('pubkey'),  // NEW — binds challenge to user
     createdAt: timestamp('created_at', { withTimezone: true })
       .notNull()
       .defaultNow(),
   })
   ```
2. **Drizzle migration**: `bun run drizzle-kit generate` to create the ALTER TABLE migration.
3. **Update `createWebAuthnChallenge`**: Accept and store `pubkey` parameter.
4. **Update `getWebAuthnChallenge`**: Add `pubkey` to the WHERE clause:
   ```ts
   async getWebAuthnChallenge(id: string, pubkey: string): Promise<{ challenge: string }> {
     const [row] = await this.db
       .delete(webauthnChallenges)
       .where(
         and(
           eq(webauthnChallenges.challengeId, id),
           eq(webauthnChallenges.pubkey, pubkey),
           sql`${webauthnChallenges.createdAt} > NOW() - INTERVAL '${CHALLENGE_TTL_MS / 1000} seconds'`,
         ),
       )
       .returning()
     
     if (!row) throw new ServiceError(404, 'Challenge not found or expired')
     return { challenge: row.challenge }
   }
   ```
5. **Update callers**: All routes calling `getWebAuthnChallenge` must pass authenticated user's pubkey.

**Migration**: ADD COLUMN (non-blocking, no NOT NULL, no default). Add index:
```sql
ALTER TABLE webauthn_challenges ADD COLUMN pubkey TEXT;
CREATE INDEX webauthn_challenges_pubkey_idx ON webauthn_challenges (pubkey);
```

---

### Task 2.4 — RACE-09 + RACE-13: Bulk import ON CONFLICT DO UPDATE

**File**: `apps/worker/services/blasts.ts` — `importBulk` method (~line 223-287)
**Pattern**: D (ON CONFLICT DO UPDATE)
**Severity**: MEDIUM (RACE-09) + LOW (RACE-13)

**Current**: Per-row SELECT → check exists → INSERT or UPDATE. Concurrent imports with overlapping identifiers crash on constraint violation (RACE-09) or silently overwrite channel merges (RACE-13).

**Fix**:
1. Replace the SELECT + conditional INSERT/UPDATE loop with `INSERT ... ON CONFLICT DO UPDATE`:
   ```ts
   for (const entry of entries) {
     const identifierHash = this.hashIdentifier(entry.identifier)
     const preferenceToken = this.generatePreferenceToken(identifierHash)
     const encrypted = this.hmacSecret
       ? encryptContactIdentifier(entry.identifier, this.hmacSecret)
       : null
     
     const newChannels = [{ type: entry.channel, verified: false }]
     
     const [result] = await this.db
       .insert(subscribers)
       .values({
         hubId,
         identifierHash,
         encryptedIdentifier: encrypted,
         channels: newChannels,
         tags: entry.tags ?? [],
         language: entry.language ?? 'en',
         status: 'active',
         doubleOptInConfirmed: false,
         preferenceToken,
       })
       .onConflictDoUpdate({
         target: [subscribers.hubId, subscribers.identifierHash],
         set: {
           // Merge channels at the SQL level — atomic, no read-modify-write
           channels: sql`(
             SELECT jsonb_agg(DISTINCT elem)
             FROM (
               SELECT elem FROM jsonb_array_elements(${subscribers.channels}) elem
               UNION ALL
               SELECT elem FROM jsonb_array_elements(${JSON.stringify(newChannels)}::jsonb) elem
             ) combined
           )`,
           // Merge tags at the SQL level
           tags: sql`(
             SELECT COALESCE(array_agg(DISTINCT t), '{}')
             FROM unnest(${subscribers.tags} || ARRAY[${sql.join((entry.tags ?? []).map(t => sql`${t}`), sql`,`)}]::text[]) t
           )`,
         },
       })
       .returning()
     
     // Use xmax=0 trick to distinguish insert vs. update if exact counts needed
     imported++
   }
   ```
2. Remove the `getSubscriberByIdentifierHash` call and the entire if/else branch.
3. The existing `subscribers_hub_identifier_idx` unique constraint handles dedup.

**No migration needed** — constraint already exists.

---

### Task 2.5 — RACE-10: Erasure re-encryption jobs inside transaction

**File**: `apps/worker/services/erasure.ts` — `executeErasure` method (~line 245-364)
**Pattern**: Architectural (move operations inside transaction)
**Severity**: MEDIUM

**Current**: Phase 4 (re-encryption job queuing) and status update happen OUTSIDE the main transaction. If the process crashes after Phase 2+3 but before Phase 4, jobs are lost.

**Fix**:
1. Move re-encryption job inserts INSIDE the transaction:
   ```ts
   await this.db.transaction(async (tx) => {
     // Phase 2 + Phase 3 (existing code, unchanged)
     // ...
     
     // Phase 4: Queue re-encryption jobs INSIDE transaction
     for (const row of hubMembershipsRows as { hub_id: string }[]) {
       if (!row.hub_id) continue
       const [job] = await tx
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
     
     // Audit log is already inside the transaction (CRIT-1)
   })
   ```
2. Change all `this.db` references after the transaction to `tx` references inside it.
3. **AuditService transaction context**: The `auditService.log()` call is already inside the transaction but uses its own `this.db`. Since `AuditService.log()` internally creates its own transaction via `this.db.transaction()`, and the `tx` passed to `executeErasure`'s transaction is different, we need to either:
   - **Option A (preferred)**: Add an optional `txOverride` parameter to `AuditService.log()` that uses the provided transaction context instead of opening a new one. This preserves atomicity.
   - **Option B**: Accept the current behavior where the audit log entry is written in a separate transaction. This is the current state and is acceptable because the audit entry is append-only and idempotent.
   
   **Decision**: Use Option A. Add `txOverride?: typeof this.db` parameter to `AuditService.log()`. When provided, use it directly instead of creating a nested transaction.

**No migration needed.**

---

### Task 2.6 — BDD tests for Phase 2

Add to `packages/test-specs/features/security/race-conditions.feature`:

```gherkin
  # RACE-06
  Scenario: Session renewal fails if session was concurrently revoked
    Given a user has an active session near expiry
    When the session is revoked and renewed simultaneously
    Then the renewal returns an auth error

  # RACE-08
  Scenario: WebAuthn challenge cannot be consumed by another user
    Given a WebAuthn challenge is created for a user
    When another user attempts to consume the challenge
    Then the challenge consumption fails

  # RACE-09
  Scenario: Concurrent bulk imports handle overlapping identifiers gracefully
    Given a hub with existing subscribers
    When two bulk imports with overlapping identifiers run simultaneously
    Then no duplicate subscribers are created
    And all channels are correctly merged

  # RACE-10
  Scenario: Erasure re-encryption jobs are created atomically with erasure
    Given a user is a member of 3 hubs
    When the user's erasure is executed
    Then exactly 3 re-encryption jobs are created
    And the erasure request status is completed
```

---

## Phase 3: Low (RACE-11, -12, -13)

### Task 3.1 — RACE-11: updateUser direct UPDATE with RETURNING

**File**: `apps/worker/services/identity.ts` — `updateUser` method (~line 314-370)
**Pattern**: Direct UPDATE (already mostly correct)
**Severity**: LOW

**Current**: SELECT to check existence → build updates → UPDATE. The SELECT is unnecessary since the UPDATE RETURNING handles the "not found" case.

**Fix**:
1. Remove the initial SELECT + existence check.
2. Build the updates object from request data (same logic).
3. Use the existing UPDATE ... RETURNING pattern and check for null:
   ```ts
   const [row] = await this.db
     .update(users)
     .set(updates)
     .where(eq(users.pubkey, pubkey))
     .returning()
   
   if (!row) throw new ServiceError(404, 'Not found')
   ```
4. The code already does this at line 364-368 but the SELECT at line 320-325 is redundant.

**No migration needed.**

---

### Task 3.2 — RACE-12: Recovery key store TTL eviction

**File**: `packages/crypto/src/ffi.rs` — `RECOVERY_KEY_STORE` (~line 23-28), `mobile_recovery_group_generate_keypair` (~line 602), `mobile_recovery_group_split_private_key` (~line 620)
**Pattern**: Architectural (add TTL + max capacity)
**Severity**: LOW

**Fix**:
1. Replace `HashMap<u64, zeroize::Zeroizing<String>>` with a struct that includes a timestamp:
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
   ```

2. In `mobile_recovery_group_generate_keypair`, before inserting:
   ```rust
   let mut store = RECOVERY_KEY_STORE.lock().expect("...");
   
   // Evict expired entries
   let now = Instant::now();
   store.retain(|_, entry| now.duration_since(entry.created_at).as_secs() < KEY_TTL_SECS);
   
   // Cap maximum entries — remove oldest if at capacity
   if store.len() >= MAX_STORE_ENTRIES {
       if let Some(&oldest_handle) = store.keys()
           .min_by_key(|&&h| store.get(&h).map(|e| e.created_at).unwrap_or(now))
       {
           store.remove(&oldest_handle);
       }
   }
   
   store.insert(handle, KeyEntry { key: sk, created_at: now });
   ```

3. In `mobile_recovery_group_split_private_key`, extract from `KeyEntry`:
   ```rust
   let entry = RECOVERY_KEY_STORE.lock().expect("...")
       .remove(&handle)
       .ok_or_else(|| CryptoError::InvalidInput(
           "invalid or already-consumed or expired handle".into(),
       ))?;
   let mut sk = entry.key;
   ```

**Unit tests** (add to `packages/crypto/src/ffi.rs` or a test module):
- Test that generating a keypair and splitting it works normally.
- Test that after TTL expiration, the split call returns an error.
- Test that MAX_STORE_ENTRIES is enforced (generate 17 keypairs, verify oldest handle is evicted).

**No migration needed.**

---

### Task 3.3 — RACE-13: Already fixed by Task 2.4

RACE-13 (bulk import channel merge conflict) is the same code path as RACE-09. The `ON CONFLICT DO UPDATE` fix in Task 2.4 handles both race conditions atomically.

**No additional work needed.**

---

## Migration Summary

| Phase | Migration | Description | Blocking? |
|-------|-----------|-------------|-----------|
| 2 | `ALTER TABLE webauthn_challenges ADD COLUMN pubkey TEXT` | Bind challenges to users (RACE-08 Phase 2) | No (ADD COLUMN without NOT NULL) |
| 2 | `CREATE INDEX webauthn_challenges_pubkey_idx ON webauthn_challenges (pubkey)` | Query performance | No (CONCURRENTLY) |

All other fixes are application-level query changes.

---

## Execution Order

### Wave 1 — Parallel (all independent)
- **Task 1.1** (RACE-01): `identity.ts:redeemInvite`
- **Task 1.2** (RACE-02): `crypto-keys.ts:fetchAndClearMlsMessages`
- **Task 1.3** (RACE-03): `identity.ts:getProvisionRoom`
- **Task 2.1** (RACE-06): `identity.ts:validateSession`
- **Task 2.2** (RACE-07): `crypto-keys.ts:getPukEnvelopeForDevice`
- **Task 3.1** (RACE-11): `identity.ts:updateUser`

### Wave 2 — Parallel (all independent)
- **Task 1.4** (RACE-04): `blasts.ts:send` + `expandBlast`
- **Task 1.5** (RACE-05): `identity.ts:registerDevice`
- **Task 2.3** (RACE-08): `identity.ts:getWebAuthnChallenge` + schema migration
- **Task 3.2** (RACE-12): `packages/crypto/src/ffi.rs` — recovery key store

### Wave 3 — After Wave 2
- **Task 2.4** (RACE-09/13): `blasts.ts:importBulk` — depends on RACE-04 changes landing first (same file)
- **Task 2.5** (RACE-10): `erasure.ts:executeErasure` + `audit.ts:log` tx override

### Wave 4 — After all fixes
- **Task 1.7** (BDD Phase 1): Race condition feature file + step definitions
- **Task 2.6** (BDD Phase 2): Additional scenarios

---

## Verification Checklist

For each fix, verify:
- [ ] The race window is provably eliminated (not just narrowed)
- [ ] No regression in normal (non-concurrent) behavior
- [ ] Error messages are clear and don't leak internal state
- [ ] Existing BDD tests still pass
- [ ] New BDD tests demonstrate the race is fixed (two concurrent requests, exactly one wins)

### Final verification
- [ ] `bun run typecheck` passes
- [ ] `bun run test:backend:bdd` passes (all existing + new scenarios)
- [ ] `bun run crypto:test` passes (RACE-12 unit tests)
- [ ] `bun run crypto:clippy` passes
