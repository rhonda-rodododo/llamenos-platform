# Signal Notification Service — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a zero-knowledge Signal notification sidecar and integrate it with the app server for security alert delivery. Users can register their Signal contact, configure alert preferences, and receive real-time security notifications and periodic digests.

**Architecture:** The sidecar is an independent Bun/Hono HTTP service with SQLite. The app server gains three new services (UserNotifications, SignalContacts, SecurityPrefs), a digest cron, new API routes, a DB migration, and Zod schemas. Client-side registration UX is implemented on desktop first, with mobile following the same API pattern.

**Tech Stack:** Bun, Hono, SQLite (sidecar), PostgreSQL + Drizzle (app server), `@noble/hashes` (HMAC), Docker Compose, Zod schemas.

**Prerequisite completed:** Signal Messaging Channel spec exists. signal-cli-rest-api is already in Docker Compose under the `signal` profile.

---

## File Structure

### Files to Create

- `apps/signal-notifier/package.json` — sidecar package config
- `apps/signal-notifier/tsconfig.json` — TypeScript config
- `apps/signal-notifier/Dockerfile` — sidecar Docker image
- `apps/signal-notifier/src/server.ts` — Hono HTTP server (port 3100)
- `apps/signal-notifier/src/store.ts` — SQLite IdentifierStore class
- `apps/signal-notifier/src/bridge-client.ts` — signal-cli-rest-api HTTP client
- `apps/signal-notifier/src/store.test.ts` — Store unit tests
- `apps/worker/db/schema/signal-contacts.ts` — Drizzle schema for user_signal_contacts table
- `apps/worker/db/schema/security-prefs.ts` — Drizzle schema for user_security_prefs table
- `apps/worker/services/signal-contacts.ts` — SignalContactsService (HMAC + CRUD)
- `apps/worker/services/security-prefs.ts` — SecurityPrefsService (preferences CRUD)
- `apps/worker/services/user-notifications.ts` — UserNotificationsService (alert dispatch)
- `apps/worker/services/digest-cron.ts` — Digest cron runner
- `packages/protocol/schemas/security-prefs.ts` — Zod schemas for prefs + contact registration
- `src/client/components/settings/SignalNotificationSettings.tsx` — Desktop registration UI

### Files to Modify

- `deploy/docker/docker-compose.yml` — Add `signal-notifier` service under `signal` profile
- `deploy/docker/docker-compose.dev.yml` — Add `signal-notifier` for local dev
- `apps/worker/services/audit.ts` — Add new authentication event types to EVENT_CATEGORIES
- `apps/worker/db/schema/index.ts` — Export new schema tables
- `apps/worker/db/migrate.ts` (or migration file) — Run new table DDL
- `apps/worker/routes/auth.ts` (or equivalent route file) — Add signal-contact + security-prefs endpoints
- `apps/worker/index.ts` (or service initialization) — Wire up new services, start digest cron
- `packages/protocol/tools/schema-registry.ts` — Register new schemas
- `src/client/routes/` — Add settings route for Signal notifications

### Files to Delete

None.

---

## Phase 1: Notifier Sidecar (Independent, No App Server Changes)

### Task 1.1 — Create sidecar package structure

- [ ] Create `apps/signal-notifier/package.json` with dependencies: `hono` (^4.6), `bun-types` (dev).
- [ ] Create `apps/signal-notifier/tsconfig.json` extending base Bun config.
- [ ] Add `apps/signal-notifier` to root `package.json` workspaces array.

### Task 1.2 — Implement IdentifierStore

- [ ] Create `apps/signal-notifier/src/store.ts`:
  - `IdentifierStore` class with constructor accepting `dbPath: string`
  - Creates SQLite table: `identifiers (hash TEXT PRIMARY KEY, plaintext TEXT NOT NULL, type TEXT NOT NULL, created_at INTEGER NOT NULL)`
  - Methods: `register(hash, plaintext, type)`, `lookup(hash) -> StoredIdentifier | null`, `remove(hash)`
  - Uses `bun:sqlite` `Database` class

### Task 1.3 — Implement bridge client

- [ ] Create `apps/signal-notifier/src/bridge-client.ts`:
  - `BridgeConfig` interface: `{ bridgeUrl, bridgeApiKey, registeredNumber }`
  - `sendSignalMessage(config, recipient, message, disappearingTimerSeconds)` function
  - POST to `{bridgeUrl}/v2/send` with `{ number, recipients: [recipient], message, message_timer? }`
  - Returns `{ ok: boolean; error?: string }`

### Task 1.4 — Implement sidecar HTTP server

- [ ] Create `apps/signal-notifier/src/server.ts`:
  - Hono app on `PORT` env (default 3100)
  - Bearer token auth middleware (checks `NOTIFIER_API_KEY`)
  - `POST /identities/register` — body: `{ identifierHash, plaintextIdentifier, identifierType }` — calls `store.register()`
  - `POST /notify` — body: `{ identifierHash, message, disappearingTimerSeconds? }` — resolves hash via store, sends via bridge client
  - `DELETE /identities/:hash` — calls `store.remove()`
  - `GET /healthz` — returns `{ ok: true }`
  - All endpoints except `/healthz` require Bearer token

### Task 1.5 — Write sidecar tests

- [ ] Create `apps/signal-notifier/src/store.test.ts`:
  - Test: register + lookup roundtrip
  - Test: lookup returns null for unknown hash
  - Test: register replaces existing entry (upsert)
  - Test: remove deletes entry
- [ ] Add `"test": "bun test"` script to sidecar package.json

### Task 1.6 — Create Dockerfile

- [ ] Create `apps/signal-notifier/Dockerfile`:
  - Base: `oven/bun:1-slim`
  - WORKDIR `/app`
  - Copy package.json, install, copy source
  - Create `/app/data` directory
  - ENV `NOTIFIER_DB_PATH=/app/data/notifier.db`
  - EXPOSE 3100
  - CMD `["bun", "run", "src/server.ts"]`

### Task 1.7 — Verify sidecar independently

- [ ] Run `cd apps/signal-notifier && bun test` -- all tests pass
- [ ] Run `cd apps/signal-notifier && bun run src/server.ts` -- starts on port 3100, healthz returns OK

---

## Phase 2: Protocol Schemas

### Task 2.1 — Security preferences Zod schema

- [ ] Create `packages/protocol/schemas/security-prefs.ts`:
  - `securityPrefsSchema` with all fields using `.optional().default(value)` pattern
  - `updateSecurityPrefsSchema = securityPrefsSchema.partial()`
  - `signalContactRegisterSchema` -- body for POST /signal-contact
  - `signalContactResponseSchema` -- response shape
  - Export all types via `z.infer<>`

### Task 2.2 — Register schemas

- [ ] Update `packages/protocol/tools/schema-registry.ts` to include the new schemas
- [ ] Run `bun run codegen` to verify schema registration works

---

## Phase 3: Database Schema + Services (App Server)

### Task 3.1 — Drizzle schema: user_signal_contacts

- [ ] Create `apps/worker/db/schema/signal-contacts.ts`:
  - Table: `user_signal_contacts`
  - Columns: `userPubkey` (PK, text), `identifierHash` (text, not null), `identifierCiphertext` (jsonb), `identifierEnvelope` (jsonb), `identifierType` (text), `verifiedAt` (timestamp), `createdAt` (timestamp, default now), `updatedAt` (timestamp, default now)
  - Use custom `jsonb` from `../bun-jsonb` (never drizzle's built-in)

### Task 3.2 — Drizzle schema: user_security_prefs

- [ ] Create `apps/worker/db/schema/security-prefs.ts`:
  - Table: `user_security_prefs`
  - Columns: `userPubkey` (PK, text), `autoLockMs` (integer, default 900000), `disappearingTimerDays` (integer, default 1), `digestCadence` (text, default 'weekly'), `alertOnNewDevice` (boolean, default true), `alertOnPasskeyChange` (boolean, default true), `alertOnPinChange` (boolean, default true), `notificationChannel` (text, default 'web_push'), `updatedAt` (timestamp, default now)

### Task 3.3 — Export schemas + migration

- [ ] Update `apps/worker/db/schema/index.ts` to export both new tables
- [ ] Generate/create migration to add both tables (Drizzle Kit or raw SQL migration)
- [ ] Verify migration runs: `bun run dev:server` starts without errors

### Task 3.4 — SignalContactsService

- [ ] Create `apps/worker/services/signal-contacts.ts`:
  - `hashSignalIdentifier(normalized, secret)` -- HMAC-SHA256
  - `derivePerUserHmacKey(serverHmacSecret, userPubkey)` -- HMAC-SHA256 with `"signal-contact:"` prefix
  - `SignalContactsService` class:
    - Constructor: `(db, hmacSecret)`
    - `upsert(input: UpsertSignalContactInput)` -- INSERT ... ON CONFLICT DO UPDATE
    - `findByUser(userPubkey)` -- SELECT by pubkey
    - `deleteByUser(userPubkey)` -- DELETE
    - `getPerUserHmacKey(userPubkey)` -- derives key
    - `hashIdentifierForUser(normalized, userPubkey)` -- derives key then hashes

### Task 3.5 — SecurityPrefsService

- [ ] Create `apps/worker/services/security-prefs.ts`:
  - `SecurityPrefsService` class:
    - Constructor: `(db)`
    - `get(userPubkey)` -- SELECT or INSERT defaults + return
    - `update(userPubkey, patch)` -- upsert then UPDATE

### Task 3.6 — UserNotificationsService

- [ ] Create `apps/worker/services/user-notifications.ts`:
  - `AlertInput` discriminated union type for all alert types
  - `renderAlertMessage(input)` -- returns plain text string
  - `formatDisappearingTimerSeconds(days)` -- days * 86400
  - `UserNotificationsService` class:
    - Constructor: `(signalContacts, prefs, auditService, config: { notifierUrl, notifierApiKey })`
    - Note: Uses v2's `AuditService` (not a separate AuthEventsService) for logging alert delivery events
    - `sendAlert(userPubkey, alert)`:
      1. Check `prefs.notificationChannel === 'signal'`
      2. Check contact exists
      3. Check per-alert-type toggles (alertOnNewDevice, alertOnPasskeyChange, alertOnPinChange; lockdown always fires)
      4. Render message via `renderAlertMessage(alert)`
      5. POST to notifier `/notify` with identifierHash, message, disappearingTimerSeconds
      6. Retry up to 3 times with exponential backoff (400ms, 800ms, 1600ms)
      7. Log `alert_sent` via `AuditService.log()` on success
      8. Return `{ delivered: boolean }`

### Task 3.7 — Digest cron

- [ ] Create `apps/worker/services/digest-cron.ts`:
  - `runDigestCron(db, auditService, prefs, signalContacts, notifications, cadence)` function
  - Note: v2 uses `AuditService` (hash-chained audit log) rather than a separate `AuthEventsService`. The digest cron queries the audit log for authentication-category events.
  - Must add new action types to `EVENT_CATEGORIES.authentication` in `apps/worker/services/audit.ts`: `'loginFailed'`, `'alertSent'`, `'pinChanged'`, `'recoveryRotated'`, `'sessionRevoked'`, `'lockdownTriggered'`
  - Queries users with matching cadence + signal channel
  - Aggregates audit events: `login` -> loginCount, `loginFailed` -> failedCount, `alertSent` -> alertCount
  - Sends digest alert for each qualifying user
  - Returns `{ sent: number }`

---

## Phase 4: API Routes

### Task 4.1 — Signal contact endpoints

- [ ] Add routes to the auth route file (or create `apps/worker/routes/signal-notifications.ts` and mount):
  - `GET /api/auth/signal-contact` -- returns stored contact (hash + E2EE blob) or null
  - `POST /api/auth/signal-contact` -- validates body (SignalContactRegisterSchema), rate limits, proxies to notifier, upserts in DB
  - `DELETE /api/auth/signal-contact` -- deletes from notifier + DB
  - `GET /api/auth/signal-contact/hmac-key` -- returns derived per-user HMAC key

### Task 4.2 — Security prefs endpoints

- [ ] Add routes:
  - `GET /api/auth/security-prefs` -- returns prefs (upserts defaults if missing)
  - `PATCH /api/auth/security-prefs` -- validates with UpdateSecurityPrefsSchema, updates

### Task 4.3 — Wire services into app initialization

- [ ] Instantiate `SignalContactsService`, `SecurityPrefsService`, `UserNotificationsService` in the app bootstrap
- [ ] Pass `UserNotificationsService` to auth event trigger points:
  - Login verify (new device alert)
  - Passkey register/delete
  - PIN change
  - Recovery rotation
  - Lockdown
  - Session revoke (remote)
- [ ] Start digest cron intervals:
  - Daily: check every hour, run if past 06:00 UTC and not yet run today
  - Weekly: check every hour, run if Monday + past 06:00 UTC and not yet run this week

---

## Phase 5: Docker Compose Integration

### Task 5.1 — Production compose

- [ ] Add `signal-notifier` service to `deploy/docker/docker-compose.yml`:
  - Profile: `signal`
  - Build context: `../..`, Dockerfile: `apps/signal-notifier/Dockerfile`
  - Volume: `signal-notifier-data:/app/data`
  - Environment: PORT, NOTIFIER_API_KEY, NOTIFIER_DB_PATH, SIGNAL_BRIDGE_URL, SIGNAL_BRIDGE_API_KEY, SIGNAL_REGISTERED_NUMBER
  - Network: `internal`
  - Depends on: `signal-cli` (healthy)
  - Healthcheck: curl /healthz
- [ ] Add `signal-notifier-data` to volumes section
- [ ] Add `SIGNAL_NOTIFIER_URL=http://signal-notifier:3100` and `SIGNAL_NOTIFIER_API_KEY` to `app` service environment

### Task 5.2 — Dev compose

- [ ] Add `signal-notifier` service to `deploy/docker/docker-compose.dev.yml`:
  - Lighter config for local dev (optional, gated behind signal profile or separate dev file)
  - Or document running the notifier locally with `cd apps/signal-notifier && bun run dev`

### Task 5.3 — Document env vars

- [ ] Add to `.env.example` (or document in compose comments):
  - `SIGNAL_NOTIFIER_API_KEY` (generate with `openssl rand -hex 32`)
  - `SIGNAL_NOTIFIER_NUMBER` (the dedicated notification Signal number)

---

## Phase 6: Desktop Client UI

### Task 6.1 — Signal Notification Settings component

- [ ] Create `src/client/components/settings/SignalNotificationSettings.tsx`:
  - Fetches current prefs + contact on mount
  - Displays registration status
  - Phone/username input for new registration
  - HMAC key fetch + client-side hash computation
  - E2EE envelope encryption of identifier (using platform.ts crypto)
  - Register/Disconnect buttons
  - Alert type toggles (checkboxes)
  - Digest cadence selector (off/daily/weekly)
  - Disappearing timer dropdown
  - All mutations call PATCH /security-prefs or POST/DELETE /signal-contact

### Task 6.2 — Route integration

- [ ] Add Signal Notifications section to the Security settings page
- [ ] Wire navigation/routing as needed

---

## Phase 7: Verification

### Task 7.1 — Sidecar unit tests

- [ ] `cd apps/signal-notifier && bun test` -- all pass

### Task 7.2 — App server typecheck + build

- [ ] `bun run typecheck` -- no errors
- [ ] `bun run build` -- succeeds

### Task 7.3 — Integration test (manual or BDD)

- [ ] Start dev compose with signal profile
- [ ] Register a Signal contact via API
- [ ] Trigger an alert (e.g., login from new IP in test)
- [ ] Verify notification appears in Signal

### Task 7.4 — Codegen check

- [ ] `bun run codegen` -- succeeds with new schemas
- [ ] `bun run codegen:check` -- no drift

---

## Phase 8: Mobile Client (Future, after desktop is stable)

### Task 8.1 — iOS registration UI

- [ ] SwiftUI settings section for Signal notifications
- [ ] HMAC computation using CryptoKit or Rust FFI
- [ ] Same API calls as desktop

### Task 8.2 — Android registration UI

- [ ] Compose settings section for Signal notifications
- [ ] HMAC computation using javax.crypto.Mac or Rust JNI
- [ ] Same API calls as desktop

---

## Dependency Graph

```
Phase 1 (sidecar) ─────────────┐
                                │
Phase 2 (schemas) ──────────────┤
                                ├──> Phase 4 (routes) ──> Phase 5 (docker) ──> Phase 7 (verify)
Phase 3 (DB + services) ───────┤
                                │
                                └──> Phase 6 (desktop UI)
                                
Phase 8 (mobile) depends on Phase 7 passing
```

Phases 1, 2, and 3 can run in parallel. Phase 4 depends on all three. Phase 5 and 6 can run in parallel after Phase 4. Phase 7 is final verification. Phase 8 is follow-up work.
