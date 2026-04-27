# Spec: Signal Notification Service (Zero-Knowledge Security Alerts)

**Date**: 2026-04-27
**Status**: Draft
**Scope**: Internal security alert delivery to users/admins via Signal
**Prerequisite**: Signal Messaging Channel spec (2026-04-27-signal-messaging-channel.md)

## Summary

A zero-knowledge notification sidecar that delivers security alerts (login from new IP, passkey changes, PIN changes, lockdowns, session revocations) and digest summaries to users via Signal. This is **distinct** from the Signal messaging adapter (which handles conversations with external contacts). The notification service is internal-only: the app server triggers alerts, the sidecar resolves anonymized contact hashes to plaintext Signal identifiers and delivers messages.

The app server **never** holds plaintext Signal identifiers for notification contacts. It stores only HMAC hashes. The sidecar holds the hash-to-plaintext mapping in an isolated SQLite store. Compromise of the app server alone does not reveal which Signal accounts belong to which users.

## Architecture

```
                                  +------------------+
                                  | signal-cli-rest  |
                                  | -api (bridge)    |
                                  | :8080            |
                                  +--------+---------+
                                           ^
                                           | /v2/send
                                           |
+-------------+  POST /notify  +-----------+----------+
| App Server  |  Bearer token  | Signal Notifier      |
| (Bun/Hono)  | ------------> | Sidecar (Bun/Hono)   |
|             |                | :3100                |
| - hash only |  POST /ident  | - SQLite store       |
| - prefs DB  |  /register    | - hash -> plaintext  |
| - triggers  |               | - bridge client      |
+------+------+  DELETE /ident +----------------------+
       ^         /:hash
       |
       |  HMAC key + hash
       |  computed client-side
       |
+------+------+
| Clients     |
| (Desktop,   |
|  iOS,       |
|  Android)   |
+--------------+
```

### Components

1. **Signal Notifier Sidecar** (`apps/signal-notifier/`) -- Standalone Bun/Hono HTTP service. Runs on port 3100. Only accepts requests from the app server (Bearer token auth). Maintains a SQLite database mapping HMAC hashes to plaintext Signal identifiers. Resolves hashes and forwards messages to the signal-cli-rest-api bridge.

2. **UserNotificationsService** (`apps/worker/services/user-notifications.ts`) -- App server service that decides when to send alerts, renders message text, checks user preferences, and posts to the notifier sidecar with retry logic.

3. **SignalContactsService** (`apps/worker/services/signal-contacts.ts`) -- App server service managing encrypted Signal contact metadata in PostgreSQL. Stores HMAC hashes and E2EE-encrypted contact identifiers (envelope-encrypted so admins can audit). Never stores plaintext.

4. **SecurityPrefsService** (`apps/worker/services/security-prefs.ts`) -- Per-user alert preferences stored in PostgreSQL. Controls which alert types fire, notification channel selection, digest cadence, and disappearing message timer.

5. **Digest Cron** -- Periodic function (daily + weekly) that aggregates auth events and sends summary digests to users who have opted in.

6. **Client Registration Flow** -- Desktop, iOS, and Android UIs allow users to register their Signal contact. Client computes HMAC hash locally, sends hash + plaintext to the server, which proxies registration to the notifier sidecar.

## Zero-Knowledge Contact Resolution

### Design Principles

- The app server stores **only** the HMAC hash of a user's Signal identifier (phone number or Signal username).
- The notifier sidecar stores the hash-to-plaintext mapping, populated during registration.
- The HMAC key is **per-user** -- derived deterministically from a server-side secret and the user's pubkey. This means:
  - Different users hashing the same phone number produce different hashes (no correlation attacks).
  - The server can derive any user's HMAC key without extra storage.
  - Clients compute the hash client-side using the key fetched from the server.

### HMAC Key Derivation

```
per_user_key = HMAC-SHA256(
  key:  SERVER_HMAC_SECRET,
  data: "signal-contact:" || user_pubkey
)

identifier_hash = HMAC-SHA256(
  key:  per_user_key,
  data: normalized_signal_identifier
)
```

Both functions use `@noble/hashes/hmac` with SHA-256. The domain prefix `"signal-contact:"` provides separation from other HMAC uses of the same server secret.

### Signal Identifier Normalization

Before hashing, identifiers are normalized:
- **Phone numbers**: E.164 format (e.g., `+15551234567`) -- strip spaces, dashes, parentheses, ensure leading `+`.
- **Signal usernames**: Lowercase, trimmed (e.g., `username.42`).

## Registration Flow

```
1. User opens Settings > Security > Signal Notifications
2. Client fetches HMAC key:
     GET /api/auth/signal-contact/hmac-key
     -> { key: "hex..." }
3. User enters Signal phone number or username
4. Client normalizes identifier
5. Client computes: hash = HMAC-SHA256(key, normalized)
6. Client encrypts identifier with E2EE envelope (for admin audit)
7. Client sends to app server:
     POST /api/auth/signal-contact
     {
       identifierHash: "hex...",
       plaintextIdentifier: "+15551234567",     // only used for notifier registration
       identifierCiphertext: { ... },            // E2EE blob for audit
       identifierEnvelope: [ ... ],              // recipient envelopes
       identifierType: "phone" | "username"
     }
8. App server validates auth, rate limits
9. App server proxies to notifier sidecar:
     POST http://signal-notifier:3100/identities/register
     Authorization: Bearer NOTIFIER_API_KEY
     {
       identifierHash: "hex...",
       plaintextIdentifier: "+15551234567",
       identifierType: "phone"
     }
10. Notifier stores mapping in SQLite: hash -> plaintext
11. App server stores in PostgreSQL:
      - identifierHash (for lookup when sending alerts)
      - identifierCiphertext + identifierEnvelope (E2EE, for admin audit)
      - identifierType
      - verifiedAt timestamp
```

### Deregistration

```
DELETE /api/auth/signal-contact
1. App server looks up user's identifierHash
2. App server calls: DELETE http://signal-notifier:3100/identities/{hash}
3. Notifier removes mapping from SQLite
4. App server deletes row from PostgreSQL
```

### Plaintext Transit Security Note

The plaintext identifier transits through the app server during registration (step 7-9) but is **never persisted** by the app server. It is forwarded to the notifier sidecar and discarded. The E2EE ciphertext stored in PostgreSQL is encrypted with per-user + admin envelope keys and cannot be read by the server. A future enhancement could have the client register directly with the notifier via a time-limited registration token, eliminating plaintext transit through the app server entirely.

## Notification Triggers

### Security Alert Types

| Alert Type | Trigger | Default On |
|------------|---------|------------|
| `new_device` | Login from IP hash not seen before for this user | Yes |
| `passkey_added` | WebAuthn credential registered | Yes |
| `passkey_removed` | WebAuthn credential deleted | Yes |
| `pin_changed` | PIN/KEK proof rotated | Yes |
| `recovery_rotated` | Recovery key re-wrapped | Yes |
| `lockdown_triggered` | Emergency lockdown tier A/B/C | Always (cannot disable) |
| `session_revoked_remote` | Session revoked from another device | Yes |
| `digest` | Periodic summary (daily or weekly) | Weekly |

### Message Templates

All messages are plain text (no markdown/HTML -- Signal renders plain text only). Messages are intentionally terse to minimize information leakage if someone else sees the notification preview.

```
new_device:
  "New sign-in detected from {city}, {country} ({userAgent}).
   If this wasn't you, revoke the session and rotate your PIN."

passkey_added:
  "Passkey \"{credentialLabel}\" was added to your account."

passkey_removed:
  "Passkey \"{credentialLabel}\" was removed from your account."

pin_changed:
  "Your PIN was changed. If this wasn't you, trigger an emergency lockdown."

recovery_rotated:
  "Your recovery key was rotated. Save the new key in a safe place."

lockdown_triggered:
  "Emergency lockdown tier {tier} was triggered on your account."

session_revoked_remote:
  "A session from {city}, {country} was revoked."

digest:
  "{cadence} summary: {loginCount} login(s), {alertCount} alert(s),
   {failedCount} failed attempt(s) over the last {periodDays} days."
```

## Security Preferences Schema

### PostgreSQL Table: `user_security_prefs`

```sql
CREATE TABLE user_security_prefs (
  user_pubkey       TEXT PRIMARY KEY REFERENCES users(pubkey),
  auto_lock_ms      INTEGER NOT NULL DEFAULT 900000,        -- 15 min
  disappearing_timer_days INTEGER NOT NULL DEFAULT 1,       -- Signal disappearing msgs
  digest_cadence    TEXT NOT NULL DEFAULT 'weekly',          -- 'off' | 'daily' | 'weekly'
  alert_on_new_device      BOOLEAN NOT NULL DEFAULT true,
  alert_on_passkey_change  BOOLEAN NOT NULL DEFAULT true,
  alert_on_pin_change      BOOLEAN NOT NULL DEFAULT true,
  notification_channel     TEXT NOT NULL DEFAULT 'web_push', -- 'web_push' | 'signal'
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Zod Schema (in `packages/protocol/schemas/`)

```typescript
export const securityPrefsSchema = z.object({
  autoLockMs: z.number().int().min(0).optional().default(900000),
  disappearingTimerDays: z.number().int().min(0).max(365).optional().default(1),
  digestCadence: z.enum(['off', 'daily', 'weekly']).optional().default('weekly'),
  alertOnNewDevice: z.boolean().optional().default(true),
  alertOnPasskeyChange: z.boolean().optional().default(true),
  alertOnPinChange: z.boolean().optional().default(true),
  notificationChannel: z.enum(['web_push', 'signal']).optional().default('web_push'),
})

export const updateSecurityPrefsSchema = securityPrefsSchema.partial()
```

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/auth/security-prefs` | JWT | Get current prefs (upsert defaults if missing) |
| PATCH | `/api/auth/security-prefs` | JWT | Update prefs |
| GET | `/api/auth/signal-contact` | JWT | Get registered contact (hash + E2EE blob) |
| POST | `/api/auth/signal-contact` | JWT | Register Signal contact |
| DELETE | `/api/auth/signal-contact` | JWT | Unregister Signal contact |
| GET | `/api/auth/signal-contact/hmac-key` | JWT | Get per-user HMAC key |

## Digest Cron Design

### Scheduling

Two cron intervals:
- **Daily digest**: Runs at 06:00 UTC. Queries users with `digestCadence = 'daily'`.
- **Weekly digest**: Runs at 06:00 UTC on Mondays. Queries users with `digestCadence = 'weekly'`.

### Implementation

Note: v2 uses `AuditService` (hash-chained audit log at `apps/worker/services/audit.ts`) rather than a separate `AuthEventsService`. The digest cron queries the audit log's `authentication` event category (login, logout, sessionCreated, sessionExpired, passkeyRegistered, deviceLinked).

```typescript
async function runDigestCron(
  cadence: 'daily' | 'weekly'
): Promise<{ sent: number }> {
  const periodDays = cadence === 'daily' ? 1 : 7
  const since = new Date(Date.now() - periodDays * 86400_000)

  // Find all users with this cadence + Signal channel + registered contact
  const targets = await db.select()
    .from(userSecurityPrefs)
    .where(and(
      eq(userSecurityPrefs.digestCadence, cadence),
      eq(userSecurityPrefs.notificationChannel, 'signal')
    ))

  let sent = 0
  for (const user of targets) {
    const contact = await signalContacts.findByUser(user.userPubkey)
    if (!contact) continue

    // Query audit log for authentication-category events
    // AuditService.list() accepts: actorPubkey, eventType (category key),
    // dateFrom/dateTo (ISO strings), limit, offset
    const { entries: events } = await auditService.list(undefined, {
      actorPubkey: user.userPubkey,
      eventType: 'authentication',
      dateFrom: since.toISOString(),
      limit: 200,
    })

    const loginCount = events.filter(e => e.action === 'login').length
    const failedCount = events.filter(e => e.action === 'login_failed').length
    const alertCount = events.filter(e => e.action === 'alert_sent').length

    const result = await notifications.sendAlert(user.userPubkey, {
      type: 'digest', periodDays, loginCount, alertCount, failedCount,
    })
    if (result.delivered) sent++
  }
  return { sent }
}
```

The digest cron runs as a `setInterval` in the app server process. The interval checks a "last run" timestamp in the database to avoid double-sends on restarts. The cron does not run in the notifier sidecar -- it runs in the app server because it needs access to auth events and user preferences.

## Docker Deployment

### Signal Notifier Sidecar

Added to Docker Compose under the `signal` profile (same profile as `signal-cli`):

```yaml
signal-notifier:
  build:
    context: ../..
    dockerfile: apps/signal-notifier/Dockerfile
  profiles: ["signal"]
  restart: unless-stopped
  read_only: true
  tmpfs:
    - /tmp:size=16M
  volumes:
    - signal-notifier-data:/app/data
  environment:
    - PORT=3100
    - NOTIFIER_API_KEY=${SIGNAL_NOTIFIER_API_KEY:?required}
    - NOTIFIER_DB_PATH=/app/data/notifier.db
    - SIGNAL_BRIDGE_URL=http://signal-cli:8080
    - SIGNAL_BRIDGE_API_KEY=${SIGNAL_BRIDGE_API_KEY:-}
    - SIGNAL_REGISTERED_NUMBER=${SIGNAL_NOTIFIER_NUMBER:?required}
  networks:
    - internal
  depends_on:
    signal-cli:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3100/healthz"]
    interval: 30s
    timeout: 5s
    retries: 3
    start_period: 10s
```

### Environment Variables

**App server** (added to `app` service):
- `SIGNAL_NOTIFIER_URL` -- e.g., `http://signal-notifier:3100`
- `SIGNAL_NOTIFIER_API_KEY` -- shared Bearer token

**Notifier sidecar**:
- `PORT` -- HTTP port (default 3100)
- `NOTIFIER_API_KEY` -- Bearer token for app server auth
- `NOTIFIER_DB_PATH` -- SQLite file path (default `/app/data/notifier.db`)
- `SIGNAL_BRIDGE_URL` -- signal-cli-rest-api URL
- `SIGNAL_BRIDGE_API_KEY` -- bridge auth (if configured)
- `SIGNAL_REGISTERED_NUMBER` -- the Signal number used for sending notifications (can be different from the messaging channel number)

### Shared vs Separate Signal Numbers

The notifier can use the **same** signal-cli-rest-api bridge as the messaging adapter. signal-cli-rest-api supports multiple registered numbers. The notification service should use a **dedicated number** for alerts (separate from the messaging channel number) so that:
1. Users can distinguish alert messages from conversation messages.
2. The notification number can have a distinct Signal profile name (e.g., "Hotline Security Alerts").
3. Rate limiting and delivery monitoring are isolated.

However, sharing a single number is supported for simpler deployments.

## Multi-Platform Client Integration

### Desktop (Tauri)

Settings panel under Security > Signal Notifications:
1. Toggle: "Receive security alerts via Signal" (switches `notificationChannel` to `'signal'`)
2. Input: Signal phone number or username
3. "Register" button triggers the registration flow
4. Status display: "Connected" with identifier type and last verified date
5. "Disconnect" button triggers deregistration
6. Alert toggles: checkboxes for each alert type
7. Digest cadence: radio group (off / daily / weekly)
8. Disappearing timer: dropdown (1 day / 3 days / 7 days / 30 days)

The HMAC key fetch and hash computation happen in the client (desktop uses `@noble/hashes` in the webview since this is not a secret key operation -- the HMAC key is derived from a server secret, not the user's nsec).

### iOS (SwiftUI)

Settings section: Security > Signal Notifications. Same UX as desktop. The HMAC computation uses CryptoKit's `HMAC<SHA256>` or the shared Rust crypto crate. Registration calls the same REST API endpoints.

### Android (Kotlin/Compose)

Settings section: Security > Signal Notifications. Same UX. HMAC computation uses `javax.crypto.Mac` with `HmacSHA256` or the shared Rust JNI crate.

## Threat Model

### Scenario: App Server Compromised

**Attacker has**: Full database access, environment variables, source code.

**They can see**: HMAC hashes of Signal identifiers, E2EE-encrypted contact blobs (unreadable without user/admin keys), security preferences, auth event history.

**They cannot**: Resolve hashes to plaintext Signal numbers (mapping lives only in the notifier's SQLite). They can derive per-user HMAC keys (since they have `HMAC_SECRET`) and could brute-force phone numbers by hashing candidates, but this is rate-limited by the SHA-256 computation cost for the ~10B phone number space (roughly 2^33 candidates for global phone numbers -- feasible with significant compute but not trivial).

**Mitigations**: 
- The notifier sidecar runs on a separate container/host with no shared filesystem.
- The notifier's SQLite volume is not accessible from the app container.
- E2EE contact blobs cannot be decrypted without user or admin private keys.

### Scenario: Notifier Sidecar Compromised

**Attacker has**: SQLite store (hash -> plaintext Signal identifiers), bridge credentials.

**They can see**: All registered Signal numbers/usernames mapped to their HMAC hashes. They can send arbitrary Signal messages from the notification number.

**They cannot**: Correlate hashes to user pubkeys (the hash alone doesn't reveal which user it belongs to without the per-user HMAC key). They cannot access the app server database, auth events, or user accounts.

**Mitigations**:
- The notifier is on the `internal` Docker network only (no external access).
- SQLite file encrypted at rest via Docker volume encryption or OS-level disk encryption.
- The notifier has no access to PostgreSQL or the app server's HMAC_SECRET.

### Scenario: Both Compromised

Full deanonymization of Signal contacts is possible. This is the expected worst case and is equivalent to the threat model without zero-knowledge separation. The separation provides defense-in-depth: compromising both systems is harder than compromising one.

### Scenario: Signal Bridge Compromised

Attacker can read/send messages on all registered numbers. This is mitigated by disappearing messages (messages auto-delete from the recipient's device) and by keeping notification content intentionally vague.

## Decisions to Review

| # | Decision | Chosen | Alternatives | Rationale |
|---|----------|--------|-------------|-----------|
| 1 | **Sidecar vs. embedded** | Separate Bun/Hono sidecar | Embed hash resolution in app server; use a serverless function | Isolation is the point -- compromise of app server doesn't leak contacts. Embedding defeats the zero-knowledge design. Serverless adds cold-start latency for time-sensitive alerts. |
| 2 | **SQLite vs. PostgreSQL for notifier store** | SQLite | PostgreSQL (shared or separate), Redis, in-memory | Single-file, no extra infra, sidecar is single-process. The store is tiny (one row per registered user). PostgreSQL would require network access and another dependency. |
| 3 | **Per-user HMAC keys vs. global key** | Per-user (derived from server secret + pubkey) | Single global HMAC key for all users | Per-user prevents correlation attacks: same phone number for two users produces different hashes. Global key means anyone with the key can check if a specific number is registered for any user. |
| 4 | **Plaintext transits app server during registration** | Yes (proxy model) | Direct client-to-notifier with registration token; mutual TLS between client and notifier | Proxy is simpler: the notifier only needs to trust the app server, not authenticate individual clients. The plaintext is not persisted. Direct registration would require exposing the notifier to the internet and implementing client auth. Can be added as a future enhancement. |
| 5 | **Shared vs. dedicated Signal number** | Dedicated number recommended, shared supported | Always shared; always separate bridge instances | Dedicated provides clear UX separation and isolated rate limiting. Shared reduces infra for small deployments. Separate bridge instances would double resource usage for minimal benefit. |
| 6 | **Disappearing messages** | Per-user configurable timer | Fixed timer for all users; no disappearing messages | Users have different threat models. Some need messages to vanish in 24h, others want 7 days for reference. Signal's disappearing messages API supports per-message timers. |
| 7 | **Digest cron location** | App server process | Notifier sidecar; separate cron container; external scheduler | The digest needs access to auth events and user preferences (PostgreSQL), which the notifier doesn't have. Running in the app server keeps it simple and leverages existing DB connections. |
| 8 | **Retry strategy** | 3 attempts, exponential backoff (400ms, 800ms, 1600ms) | Dead letter queue; unlimited retries with circuit breaker | 3 attempts is sufficient for transient bridge failures. DLQ adds complexity for a fire-and-forget alert system. Alerts are informational -- a missed alert is logged but not critical to system operation. |
| 9 | **Notification channel enum** | `'web_push' | 'signal'` | `'signal'` only; multi-channel (push + Signal simultaneously) | Web push is the default for users without Signal. Multi-channel simultaneously would be overwhelming and leak information across channels. Users choose one. |
| 10 | **Hub scoping** | Global (not hub-scoped) | Hub-scoped preferences and contacts | Security alerts are account-level (login, passkey, PIN) not hub-level. A user's Signal contact and alert preferences apply across all hubs. Hub-scoped would fragment the security posture. |
