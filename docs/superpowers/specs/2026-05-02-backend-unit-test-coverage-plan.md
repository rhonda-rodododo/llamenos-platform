# Backend Unit Test Coverage Plan

**Date:** 2026-05-02
**Status:** Spec (research only)
**Scope:** `apps/worker/` — identify highest-impact unit test targets

## Current State

### Existing Coverage
- **BDD integration tests:** 90 feature files, 1,065 scenarios (Playwright BDD). Strong coverage of API contracts, auth flows, CMS workflows, and security.
- **Existing unit tests:** 18 files, ~4,690 LOC in `apps/worker/__tests__/unit/`. Covers: permissions, auth-utils, crypto-utils, crypto-labels, entity-router, SSRF guard, signal adapter/failover, messaging adapter, telephony adapter, geocoding adapter, nostr publisher/events, firehose decrypt, audit chain, helpers, permission guard, security audit coverage.
- **Rust crypto:** Solid coverage via `cargo test` in `packages/crypto/`.

### What's Missing
The BDD tests exercise the system end-to-end but cannot efficiently test:
- Edge cases in pure algorithms (scoring, state machines, hash chains)
- Boundary conditions in crypto envelope logic
- Race conditions in concurrent delivery processing
- Failure modes in circuit breakers, retry logic, rate limiters
- Template engine inheritance resolution

## Top 10 Highest-Impact Unit Test Targets

### 1. Envelope Recipients ACL (`lib/envelope-recipients.ts`, 133 LOC)

**Why:** Determines WHO can decrypt each data tier. A bug here means data leaks or lockout. Pure functions, trivially testable.

**Already covered:** No.

**Test cases:**
1. Summary tier includes all members with matching `accessRoles`
2. Summary tier always includes admins with `cases:read-all` even without accessRoles match
3. Fields tier merges assigned volunteers + admins + editRoles holders without duplicates
4. PII tier restricted to admins + explicit `contacts:view-pii` holders
5. Empty hub members list returns empty arrays (no crash)

**Approach:** Pure unit test, no mocks needed. Build `HubMemberInfo[]` fixtures.
**Effort:** Small

---

### 2. Volunteer Scoring Algorithm (`routes/records.ts:665-715`)

**Why:** Determines case assignment suggestions. Wrong scoring = wrong volunteer gets cases. Complex weighted algorithm with 4 scoring components.

**Already covered:** BDD tests cover the API endpoint but not edge cases of the scoring math.

**Test cases:**
1. Base score of 50 for all eligible volunteers
2. Workload score inversely proportional to utilization (0 cases = +30, at capacity = +0)
3. Language match adds +15 when volunteer speaks requested language
4. Specialization bonus adds +5
5. Volunteers at max capacity excluded entirely
6. Results sorted descending by total score

**Approach:** Extract scoring logic to a pure function (currently inline in route handler). Test the extracted function.
**Effort:** Medium (requires extracting ~50 lines to a testable function)

---

### 3. Circuit Breaker (`lib/circuit-breaker.ts`, 232 LOC)

**Why:** Protects against cascading failures in telephony/messaging integrations. State machine bugs could either fail-open (hammering a broken service) or fail-closed (blocking all traffic permanently).

**Already covered:** No.

**Test cases:**
1. CLOSED -> OPEN after `failureThreshold` failures within window
2. OPEN -> HALF_OPEN after `resetTimeoutMs` elapses
3. HALF_OPEN -> CLOSED on successful probe
4. HALF_OPEN -> OPEN on failed probe
5. Failures outside rolling window don't count toward threshold
6. `CircuitOpenError` thrown immediately in OPEN state (fail-fast)

**Approach:** Pure unit test with time mocking (control `Date.now()`).
**Effort:** Small

---

### 4. Template Engine (`lib/template-engine.ts`, 280 LOC)

**Why:** Template inheritance drives all entity types, report types, and field definitions. Bugs in extends resolution mean missing fields, wrong IDs, or broken schemas across the entire CMS.

**Already covered:** BDD tests cover template application but not inheritance edge cases.

**Test cases:**
1. Single template without extends produces correct entity/report types
2. Depth-first extends resolution: child overrides parent types with same name
3. Multi-level inheritance chain (grandparent -> parent -> child)
4. Existing entity type IDs preserved (idempotent re-application)
5. New entity types get fresh UUIDs
6. Relationship types resolve source/target entity IDs from name map

**Approach:** Pure unit test. Build template fixtures, assert output structure.
**Effort:** Medium

---

### 5. Blast Delivery State Machine (`services/blasts.ts`, 1,075 LOC)

**Why:** Governs bulk message delivery to potentially thousands of recipients. State machine bugs could send duplicates, miss recipients, or fail silently.

**Already covered:** BDD covers basic blast lifecycle. Does NOT cover: delivery expansion edge cases, retry backoff math, concurrent drain safety.

**Test cases:**
1. `expandBlast` creates one delivery per subscriber-channel pair (subscriber with 2 verified channels = 2 deliveries)
2. Expansion batches inserts in chunks of 500
3. Exponential backoff: retry delay doubles per attempt (`base * 2^(attempts-1)`)
4. Max retries exceeded transitions delivery to permanent `failed`
5. `drainDeliveryBatch` returns only deliveries past their `nextRetryAt`
6. Daily blast limit blocks `send()` when at capacity

**Approach:** Extraction needed for backoff math (pure). Expansion/drain need DB (integration-style with test DB).
**Effort:** Large

---

### 6. Session Sliding Expiry (`services/identity.ts:563-590`)

**Why:** Session management is security-critical. Wrong expiry logic = sessions that never expire or expire too aggressively.

**Already covered:** BDD covers login/logout. Does NOT test sliding renewal threshold.

**Test cases:**
1. Session with > 1h remaining: no renewal, returns unchanged
2. Session with < 1h remaining: extends to now + 8h
3. Expired session: deleted, returns null
4. Session exactly at 1h boundary: renewed (boundary condition)

**Approach:** Needs DB mock or test DB for session lookup. Time mocking for expiry checks.
**Effort:** Medium

---

### 7. Device LRU Eviction (`services/identity.ts:791-855`)

**Why:** Device limit of 5 per user with LRU eviction. Bug = either blocking new device registration or evicting wrong device.

**Already covered:** BDD covers device registration. Does NOT test eviction ordering.

**Test cases:**
1. Registering 6th device evicts the one with oldest `lastSeenAt`
2. Registering existing device (same pubkey+pushToken) updates instead of inserting
3. User with exactly 5 devices: new registration triggers eviction
4. User with < 5 devices: no eviction
5. Multiple devices with same `lastSeenAt`: deterministic eviction (by ID or insertion order)

**Approach:** Needs test DB.
**Effort:** Medium

---

### 8. Rate Limiter (`lib/rate-limiter.ts`, 84 LOC)

**Why:** Protects blast delivery and API endpoints from overload. Token bucket math bugs could either throttle too aggressively or not at all.

**Already covered:** No.

**Test cases:**
1. Fresh limiter allows burst up to `maxTokens`
2. Exhausted tokens: `tryConsume()` returns false
3. Tokens refill at `tokensPerSecond` rate after elapsed time
4. `waitForToken()` resolves after calculated delay
5. Burst capacity defaults to 2x `tokensPerSecond`

**Approach:** Pure unit test with time mocking.
**Effort:** Small

---

### 9. Audit Hash Chain Computation (`services/audit.ts:79-100`)

**Why:** Tamper detection for the audit log. If `computeEntryHash` or `stableJsonStringify` has a bug, the entire chain is unverifiable.

**Already covered:** `audit-chain.test.ts` exists but scope is unclear — may need expansion.

**Test cases:**
1. `stableJsonStringify` produces identical output regardless of key insertion order
2. `computeEntryHash` produces deterministic hash for same inputs
3. Hash includes `previousEntryHash` (chain linkage)
4. Nested objects in `details` are sorted recursively
5. Round-trip: compute hash, verify it matches stored hash

**Approach:** Pure unit test.
**Effort:** Small (may just need expanding existing test file)

---

### 10. Push Encryption (`lib/push-encryption.ts`, 66 LOC)

**Why:** Two-tier push encryption (wake + full) ensures device notifications are encrypted with the right keys. Wrong key = notification unreadable or decryptable by wrong party.

**Already covered:** No.

**Test cases:**
1. Wake tier encrypts with device public key, decryptable with device private key
2. Full tier encrypts with volunteer Nostr pubkey, decryptable with volunteer nsec
3. Domain separation: wake label differs from full label
4. Encrypted payload is not plaintext (basic smoke test)
5. Cross-tier: wake-encrypted payload NOT decryptable with full-tier key

**Approach:** Pure unit test using `@noble/curves` key generation.
**Effort:** Small

---

## Honorable Mentions (Next Wave)

| Module | Why | Effort |
|--------|-----|--------|
| `lib/retry.ts` (147 LOC) | Exponential backoff + jitter correctness | Small |
| `lib/blind-index-query.ts` (71 LOC) | Privacy-critical search matching | Small |
| `lib/hub-event-crypto.ts` (47 LOC) | Relay content encryption correctness | Small |
| `services/conversations.ts` message status state machine | Status ordering (pending->sent->delivered->read) can't regress | Medium |
| `services/shifts.ts` overnight shift logic | Time-wrapping edge case (22:00-06:00) | Small |
| `services/firehose-agent.ts` circuit breaker + clustering | 5-min time-proximity message grouping | Medium |
| `messaging/router.ts` webhook signature validation | Per-provider HMAC verification | Medium |
| `telephony/sip-tokens.ts` JWT generation | Token claims correctness | Small |

## Test Infrastructure Recommendations

### Test Runner
**`bun:test`** (built-in). Already used by existing unit tests. No additional dependency needed.

### File Organization
**Colocated `__tests__/unit/` directory** — matches existing convention at `apps/worker/__tests__/unit/`. Keep this pattern.

Naming: `<module-name>.test.ts` (e.g., `envelope-recipients.test.ts`, `circuit-breaker.test.ts`).

### Mocking Strategy

**Pure function tests (Top 1-4, 8-10):** No mocks needed. Import the function, call it, assert output. These are the highest-ROI tests.

**DB-dependent tests (Top 5-7):** Two options:

1. **Preferred: Extract pure logic, test that.** Most services mix pure computation with DB calls. Extract the scoring/expiry/eviction algorithms into standalone functions, test those purely. Leave DB integration to BDD.

2. **Fallback: Test DB via `bun:test`.** Use the existing dev Docker Compose PostgreSQL. Create a test schema per file (same pattern as BDD `test-create-hub`). Only use this for tests where the DB interaction IS the logic (e.g., `FOR UPDATE SKIP LOCKED` in blast drain).

**External API mocks:** Not needed for this wave. Telephony/messaging adapter tests already exist and use mocks.

### What NOT to Unit Test

- Route handlers that are pure glue code (call service, return response)
- Drizzle schema definitions (declarative, no logic)
- Config validation (`lib/config.ts`) — fails loudly at startup, covered by deployment
- Anything already well-covered by BDD scenarios (auth flows, CRUD operations, permission checks at API level)

## Implementation Priority

| Phase | Targets | Total Effort | Why First |
|-------|---------|-------------|-----------|
| **Phase 1** | #1 (envelope), #3 (circuit breaker), #8 (rate limiter), #10 (push encryption) | ~2h | Pure functions, zero setup, maximum security impact |
| **Phase 2** | #2 (scoring), #4 (template engine), #9 (audit hash) | ~3h | Extract + test pattern, medium complexity |
| **Phase 3** | #5 (blast state machine), #6 (session expiry), #7 (device LRU) | ~4h | DB-dependent, need test setup |

## Decisions to Review

1. **Extract-to-test vs. test-in-place:** The volunteer scoring algorithm (target #2) is currently inline in a route handler. Extracting it to a testable function is the right call for testability, but it changes production code to enable testing. **Chosen: Extract.** The function is pure and self-contained; extracting it also improves readability.

2. **DB tests: dev Postgres vs. in-memory:** For phase 3 tests that need a real DB, we'll use the dev Docker Compose PostgreSQL (already running for BDD). An in-memory alternative (like `pglite`) would add a dependency and might not match production behavior. **Chosen: Dev Postgres.** Matches production, no new deps.

3. **Test granularity for state machines:** The blast delivery state machine (target #5) has both pure math (backoff calculation) and DB-dependent transitions (expansion, drain). **Chosen: Split.** Test backoff math purely; test expansion/drain with DB.
