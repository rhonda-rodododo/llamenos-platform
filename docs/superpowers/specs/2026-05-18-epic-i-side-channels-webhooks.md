# Epic I — Side Channels, Webhook Hardening & Error Disclosure

**Date**: 2026-05-18
**Status**: SPEC
**Audit**: Waves 4-5, 2026-05-18
**Priority**: CRITICAL (auth crash) / HIGH (timing side channels, replay attacks) / MEDIUM (error disclosure)

---

## Table of Contents

1. [Side Channels](#1-side-channels)
2. [Webhook Hardening](#2-webhook-hardening)
3. [Error Disclosure & Unsafe Parsing](#3-error-disclosure--unsafe-parsing)
4. [Shared Patterns](#4-shared-patterns)
5. [BDD Test Scenarios](#5-bdd-test-scenarios)
6. [Dependency Notes](#6-dependency-notes)
7. [Implementation Order](#7-implementation-order)

---

## 1. Side Channels

### Constant-Time Comparison Guide (Codebase Standard)

All comparisons of security-sensitive values (hashes, signatures, keys, commitments) MUST use constant-time operations. The codebase standard:

| Context | Method | Import |
|---------|--------|--------|
| Rust — raw `[u8]` bytes | `subtle::ConstantTimeEq` | `use subtle::ConstantTimeEq;` |
| Rust — hex strings | Decode to bytes first, then `ct_eq()` | Avoid comparing hex strings entirely |
| Rust — `&str` labels (non-secret) | `HashMap` lookup (O(1), no timing leak) | `std::collections::HashMap` |
| TypeScript — signatures | XOR-based loop (already used in `twilio.ts`) | Inline pattern |
| Tauri IPC boundary | Move comparison to Rust side; never compare in the IPC command layer | N/A |

**Rule**: Never use `==` or `!=` on hex-encoded secret material. Always decode to `&[u8]` and use `subtle::ConstantTimeEq`.

**Cargo.toml change**: Add `subtle = "2"` as a direct dependency (already in Cargo.lock via ed25519-dalek).

### SIDE-01 — Label Registry Linear Scan Timing (MEDIUM)

**Current code** (`packages/crypto/src/labels.rs:441-448`):
```rust
pub fn label_to_id(label: &str) -> Option<u8> {
    if label.is_empty() {
        return None;
    }
    LABEL_REGISTRY
        .iter()
        .position(|&l| l == label)
        .map(|i| i as u8)
}
```

**Attack scenario**: An attacker who can measure timing of crypto operations (e.g., via a network-visible encrypt/decrypt call that calls `label_to_id`) can determine which label is in use by observing how many iterations the scan takes. Labels at index 0 return faster than labels at index 68. This leaks which type of encrypted data is being processed.

**Fix**: Replace linear scan with a `HashMap<&'static str, u8>` built at initialization via `std::sync::LazyLock` (stable since Rust 1.80). The function becomes O(1) regardless of which label is queried.

```rust
use std::collections::HashMap;
use std::sync::LazyLock;

static LABEL_MAP: LazyLock<HashMap<&'static str, u8>> = LazyLock::new(|| {
    let mut map = HashMap::with_capacity(LABEL_REGISTRY.len());
    for (i, &label) in LABEL_REGISTRY.iter().enumerate() {
        if !label.is_empty() {
            map.insert(label, i as u8);
        }
    }
    map
});

pub fn label_to_id(label: &str) -> Option<u8> {
    if label.is_empty() {
        return None;
    }
    LABEL_MAP.get(label).copied()
}
```

**Validation**: `id_to_label` remains unchanged (array index lookup is already O(1)). Existing tests in `labels.rs` provide round-trip coverage.

### SIDE-02 — Sigchain Hash Comparison Variable-Time (HIGH)

**Current code** (`packages/crypto/src/sigchain.rs:169`):
```rust
if expected_hash != link.entry_hash {
    return Ok(false);
}
```

Both `expected_hash` and `link.entry_hash` are hex-encoded SHA-256 strings. The `!=` operator short-circuits on the first differing byte.

**Attack scenario**: An attacker who can submit crafted sigchain links and observe timing can iteratively determine the expected hash byte-by-byte. With a 64-character hex hash, this reduces brute-force from 2^256 to ~64×16 = 1024 measurements.

**Fix**: Decode both hex strings to `[u8; 32]` and use `subtle::ConstantTimeEq`:

```rust
use subtle::ConstantTimeEq;

let expected_bytes = hex::decode(&expected_hash).map_err(CryptoError::HexError)?;
let actual_bytes = hex::decode(&link.entry_hash).map_err(CryptoError::HexError)?;
if expected_bytes.ct_eq(&actual_bytes).unwrap_u8() != 1 {
    return Ok(false);
}
```

Also apply to the `signer_pubkey` comparison at line 155:
```rust
// Line 155 — also variable-time
if link.signer_pubkey != expected_signer_pubkey {
```

Both pubkey and hash comparisons in `verify_sigchain_link` must be constant-time.

### SIDE-03 — Shamir Verify Hex Comparison (MEDIUM)

**Current code** (`apps/desktop/src/crypto.rs:747`):
```rust
pub fn shamir_verify(x: u8, y_hex: String, commitment_hex: String) -> Result<bool, String> {
    let computed = shamir_commit(x, y_hex)?;
    Ok(computed == commitment_hex)
}
```

`shamir_commit` returns a hex-encoded SHA-256 hash, which is then compared with `==` — variable-time.

**Attack scenario**: An attacker who can invoke the IPC command repeatedly and measure response time can determine the commitment value byte-by-byte, recovering the Shamir share commitment and potentially forging share verification.

**Fix**: Move the comparison to use raw bytes with constant-time comparison. Since this is in the Tauri IPC layer (`apps/desktop/src/crypto.rs`), use the same `subtle::ConstantTimeEq` approach:

```rust
pub fn shamir_verify(x: u8, y_hex: String, commitment_hex: String) -> Result<bool, String> {
    let computed = shamir_commit(x, y_hex)?;
    let computed_bytes = hex::decode(&computed).map_err(|e| e.to_string())?;
    let expected_bytes = hex::decode(&commitment_hex).map_err(|e| e.to_string())?;
    if computed_bytes.len() != expected_bytes.len() {
        return Ok(false);
    }
    use subtle::ConstantTimeEq;
    Ok(computed_bytes.ct_eq(&expected_bytes).unwrap_u8() == 1)
}
```

**Note**: `apps/desktop/Cargo.toml` already has `packages/crypto` as a path dep, so `subtle` will be available once added to `packages/crypto/Cargo.toml`. Alternatively, add `subtle = "2"` directly to `apps/desktop/Cargo.toml`.

### SIDE-04 — Hub Field Encrypt/Decrypt Accepts Arbitrary AAD Label (HIGH)

**Current code** (`apps/desktop/src/crypto.rs:531-584`):
```rust
pub fn encrypt_hub_field(
    state: tauri::State<'_, CryptoState>,
    plaintext: String,
    label: String,  // ← arbitrary string from JS
) -> Result<String, String> {
    // ... uses label.as_bytes() as AAD without validation
}
```

**Attack scenario**: The JS frontend passes an arbitrary label string as AAD for AES-256-GCM encryption. A compromised or malicious JS context could:
1. Encrypt data with a fake label, bypassing domain separation (Albrecht defense).
2. Re-encrypt content under a different domain label, enabling cross-domain confusion attacks.
3. Use an empty label to strip AAD protection entirely.

**Fix**: Validate the label against the `LABEL_REGISTRY` before use. Import `label_to_id` from `packages/crypto/src/labels.rs`:

```rust
use llamenos_core::labels::label_to_id;

#[tauri::command]
pub fn encrypt_hub_field(
    state: tauri::State<'_, CryptoState>,
    plaintext: String,
    label: String,
) -> Result<String, String> {
    // Validate label against the registry — reject unknown labels
    if label_to_id(&label).is_none() {
        return Err(format!("Unknown crypto label: label not in LABEL_REGISTRY"));
    }
    // ... rest unchanged
}

#[tauri::command]
pub fn decrypt_hub_field(
    state: tauri::State<'_, CryptoState>,
    ciphertext_hex: String,
    label: String,
) -> Result<String, String> {
    if label_to_id(&label).is_none() {
        return Err(format!("Unknown crypto label: label not in LABEL_REGISTRY"));
    }
    // ... rest unchanged
}
```

**Error message**: Use a generic error — do NOT include the rejected label value in the error (information disclosure).

### SIDE-05 — Variable-Time Pubkey Comparison After PIN (LOW)

**Current code** (`packages/crypto/src/device_keys.rs:212-213`):
```rust
if derived_signing_pubkey != encrypted.state.signing_pubkey_hex
    || derived_encryption_pubkey != encrypted.state.encryption_pubkey_hex
{
    return Err(CryptoError::InvalidFormat(
        "derived public keys do not match stored state".into(),
    ));
}
```

**Attack scenario**: After PIN verification, the derived public keys are compared with `!=` on hex strings. An attacker who can observe timing of the PIN unlock operation could determine whether the signing or encryption key failed, and potentially learn prefix bytes of the stored pubkeys. Severity is LOW because PIN verification already gates this path.

**Fix**: Decode to bytes and use constant-time comparison:

```rust
use subtle::ConstantTimeEq;

let derived_sign_bytes = hex::decode(&derived_signing_pubkey).map_err(CryptoError::HexError)?;
let stored_sign_bytes = hex::decode(&encrypted.state.signing_pubkey_hex).map_err(CryptoError::HexError)?;
let derived_enc_bytes = hex::decode(&derived_encryption_pubkey).map_err(CryptoError::HexError)?;
let stored_enc_bytes = hex::decode(&encrypted.state.encryption_pubkey_hex).map_err(CryptoError::HexError)?;

let sign_match = derived_sign_bytes.ct_eq(&stored_sign_bytes);
let enc_match = derived_enc_bytes.ct_eq(&stored_enc_bytes);

// Combine both results to avoid short-circuit on first mismatch
if (sign_match & enc_match).unwrap_u8() != 1 {
    return Err(CryptoError::InvalidFormat(
        "derived public keys do not match stored state".into(),
    ));
}
```

### SIDE-06 — Recipient Matching Variable-Time (LOW)

**Current code** (`packages/crypto/src/encryption.rs:266,296`):
```rust
let envelope = reader_envelopes
    .iter()
    .find(|e| e.pubkey == reader_pubkey)
    .ok_or(CryptoError::DecryptionFailed)?;
```

**Attack scenario**: `.find()` returns on first match. An attacker who can observe timing of decryption operations can determine the recipient's position in the envelope list, potentially revealing the number of recipients or the order in which keys were added.

**Fix**: Always iterate all recipients and collect the match without early return:

```rust
let envelope = {
    let mut found: Option<&RecipientKeyEnvelope> = None;
    for e in reader_envelopes.iter() {
        // Compare pubkeys in constant time
        let pubkey_matches = {
            let a = hex::decode(&e.pubkey).unwrap_or_default();
            let b = hex::decode(reader_pubkey).unwrap_or_default();
            a.len() == b.len() && a.ct_eq(&b).unwrap_u8() == 1
        };
        // Use conditional assignment to avoid branching on match
        if pubkey_matches {
            found = Some(e);
        }
        // Continue iterating — do NOT break
    }
    found.ok_or(CryptoError::DecryptionFailed)?
};
```

Apply the same pattern to `decrypt_call_record` at line 296.

### SIDE-07 — SFrame Raw Nonce String (MEDIUM)

Cross-reference only. This is covered in Epic B (H10). No action in this epic.

---

## 2. Webhook Hardening

### Webhook Replay Protection Design

**Shared table schema** for nonce/replay tracking:

```sql
CREATE TABLE webhook_nonces (
    nonce_hash  TEXT PRIMARY KEY,          -- SHA-256 of (provider || body || timestamp)
    provider    TEXT NOT NULL,              -- 'twilio', 'signalwire', 'vonage', etc.
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL       -- provider-specific TTL
);

-- Auto-cleanup: partition by time or run periodic DELETE
CREATE INDEX idx_webhook_nonces_expires ON webhook_nonces (expires_at);
```

**Drizzle schema** (add to `apps/worker/db/schema/`):

```typescript
export const webhookNonces = pgTable('webhook_nonces', {
  nonceHash: text('nonce_hash').primaryKey(),
  provider: text('provider').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
```

**Replay check logic** (shared service):

```typescript
export async function checkWebhookReplay(
  db: PostgresJsDatabase,
  provider: string,
  body: string,
  timestamp: string,
  windowSeconds: number = 300
): Promise<boolean> {
  // 1. Reject if timestamp is outside the window
  const ts = parseInt(timestamp, 10)
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > windowSeconds) {
    return false // expired
  }

  // 2. Compute nonce hash
  const nonceInput = `${provider}:${body}:${timestamp}`
  const hash = createHash('sha256').update(nonceInput).digest('hex')

  // 3. INSERT ... ON CONFLICT to atomically check + store
  const expiresAt = new Date(Date.now() + windowSeconds * 1000)
  try {
    await db.insert(webhookNonces).values({
      nonceHash: hash,
      provider,
      expiresAt,
    })
    return true // first time seen
  } catch (e: unknown) {
    // Unique constraint violation = replay
    if ((e as { code?: string }).code === '23505') {
      return false
    }
    throw e
  }
}
```

**Cleanup**: Periodic `DELETE FROM webhook_nonces WHERE expires_at < NOW()` — either via pg_cron or an application-level interval (every 60s).

### W05-H02 — Twilio/SignalWire No Replay Protection (HIGH)

**Current code** (`apps/worker/telephony/twilio.ts:299-324`, `signalwire.ts:24-49`):
Both validate HMAC-SHA1 signatures but have zero timestamp or nonce checking. A captured webhook can be replayed indefinitely.

**Attack scenario**: An attacker who captures a valid Twilio webhook (e.g., via a compromised CDN, logging system, or network tap) can replay it to trigger duplicate call routing, status updates, or voicemail processing.

**Fix**:

1. **Twilio**: Twilio does not include a standard timestamp header. Use application-level replay protection via the `checkWebhookReplay` service above. Hash the full request body + URL as the nonce. Use a 5-minute window.

2. **SignalWire**: Same approach — hash body + URL. SignalWire uses Twilio-compatible webhooks.

3. Both adapters' `validateWebhook` methods gain a `db` parameter (or access via service context) and call `checkWebhookReplay` after signature validation passes.

**Provider retry handling**: Twilio retries on non-2xx responses. The nonce hash includes the body, which is identical on retry. Solution: the replay check returns false for duplicates, but the webhook middleware returns `200 OK` (idempotent) rather than `403` for replay detection. This acknowledges the retry without re-processing.

```typescript
// In webhook middleware (telephony.ts):
const replayResult = await checkWebhookReplay(db, 'twilio', bodyText, requestTimestamp)
if (!replayResult) {
  // Already processed — return 200 to stop retries, but don't re-process
  logger.info('Webhook replay detected, returning idempotent 200')
  return c.text('OK', 200)
}
```

### W05-H03 — No IP Allowlisting on Webhooks (HIGH)

**Current code**: Webhook routes at `apps/worker/routes/telephony.ts` and `apps/worker/messaging/router.ts` rely solely on signature validation.

**Attack scenario**: If a provider's signing secret is compromised, there is zero defense-in-depth. An attacker with the secret can forge webhooks from any IP.

**Fix**: Add optional IP allowlist middleware. Each provider publishes IP ranges:
- **Twilio**: `https://www.twilio.com/docs/usage/security` (published CIDR blocks)
- **SignalWire**: Documented IP ranges
- **Vonage/Telnyx/etc.**: Provider-specific docs

**Design**:

```typescript
// apps/worker/middleware/webhook-ip-allowlist.ts

interface IpAllowlistConfig {
  enabled: boolean
  cidrs: string[]  // e.g., ['54.172.60.0/23', '34.203.250.0/23']
}

// Per-provider config from hub settings or env
const PROVIDER_IP_RANGES: Record<string, string[]> = {
  twilio: [/* known Twilio ranges */],
  signalwire: [/* known SignalWire ranges */],
  // ... etc
}

export function webhookIpAllowlist(provider: string): MiddlewareHandler {
  return async (c, next) => {
    const config = await getIpAllowlistConfig(c, provider)
    if (!config.enabled) return next()

    const clientIp = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
    if (!clientIp || !isIpInCidrs(clientIp, config.cidrs)) {
      logger.warn('Webhook IP not in allowlist', { provider, clientIp })
      return c.text('Forbidden', 403)
    }
    return next()
  }
}
```

**Configuration**: IP allowlisting is **opt-in** (disabled by default). Admins can enable per provider in hub settings. The allowlist is populated from provider documentation and can be updated via settings.

### W05-M08 — Vonage/Telnyx 300s Replay Window (MEDIUM)

**Current code** (`apps/worker/telephony/vonage.ts:351`):
```typescript
if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false
```

300 seconds (5 minutes) is the current replay window for Vonage.

**Fix**: Reduce to 60 seconds. Vonage sends webhooks within seconds of the event. A 60-second window accommodates network latency and clock skew while drastically reducing the replay window.

```typescript
const WEBHOOK_TIMESTAMP_MAX_AGE_S = 60
if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > WEBHOOK_TIMESTAMP_MAX_AGE_S) return false
```

Apply the same to Telnyx if it uses a similar timestamp-based validation.

**Combined with W05-H02**: Even with the tighter timestamp window, add nonce-based replay protection for belt-and-suspenders defense.

### W05-M09 — No Content-Type Enforcement on Webhooks (MEDIUM)

**Current code**: Webhook endpoints accept any Content-Type header.

**Attack scenario**: An attacker could send a webhook with an unexpected Content-Type (e.g., `multipart/form-data` with a large body) to trigger parser edge cases or denial-of-service.

**Fix**: Add Content-Type enforcement middleware for webhook routes:

```typescript
// apps/worker/middleware/webhook-content-type.ts

const ALLOWED_CONTENT_TYPES: Record<string, string[]> = {
  twilio: ['application/x-www-form-urlencoded'],
  signalwire: ['application/x-www-form-urlencoded'],
  vonage: ['application/json'],
  telnyx: ['application/json'],
  plivo: ['application/x-www-form-urlencoded'],
  bandwidth: ['application/json'],
  signal: ['application/json'],
  whatsapp: ['application/json'],
  telegram: ['application/json'],
  rcs: ['application/json'],
}

export function enforceWebhookContentType(provider: string): MiddlewareHandler {
  return async (c, next) => {
    const contentType = c.req.header('content-type')?.split(';')[0]?.trim()
    const allowed = ALLOWED_CONTENT_TYPES[provider]
    if (allowed && contentType && !allowed.includes(contentType)) {
      return c.text('Unsupported Media Type', 415)
    }
    return next()
  }
}
```

### W05-M10 — No Common Auth Layer for Messaging Webhooks (MEDIUM)

**Current code** (`apps/worker/messaging/router.ts:65-66`):
```typescript
// No auth middleware — each adapter validates its own webhook signature.
messaging.post('/:channel/webhook', async (c) => {
```

Each messaging adapter self-validates. This means:
- No consistent baseline (some might skip validation)
- No shared replay protection
- No shared IP allowlisting
- No Content-Type enforcement

**Fix**: Create a shared `webhookAuth` middleware that runs before the adapter-specific handler:

```typescript
// apps/worker/middleware/webhook-auth.ts

export function webhookAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const channel = c.req.param('channel') as MessagingChannelType
    const hubId = new URL(c.req.url).searchParams.get('hub') || undefined

    // 1. Content-Type enforcement
    enforceContentType(channel, c)

    // 2. IP allowlist (if enabled)
    await checkIpAllowlist(channel, c)

    // 3. Get adapter and validate signature
    const adapter = await getMessagingAdapter(c, channel, hubId)
    const isValid = await adapter.validateWebhook(c.req.raw)
    if (!isValid) {
      logger.warn('Messaging webhook signature failed', { channel })
      return c.text('Forbidden', 403)
    }

    // 4. Replay protection
    const replayOk = await checkReplay(c, channel)
    if (!replayOk) {
      return c.text('OK', 200) // idempotent ack
    }

    c.set('messagingAdapter', adapter)
    return next()
  }
}
```

Apply this middleware to the messaging webhook route:
```typescript
messaging.post('/:channel/webhook', webhookAuth(), async (c) => {
  // adapter is now guaranteed validated
})
```

---

## 3. Error Disclosure & Unsafe Parsing

### Error Response Standardization

All error responses to clients follow this format:

```typescript
interface ErrorResponse {
  error: string  // Generic, non-revealing message
}
```

**Rules**:
- Auth failures: Always `{ error: "Authentication failed" }` with 401.
- Webhook failures: Always `403` with body `"Forbidden"`.
- Parse failures: Always `{ error: "Bad request" }` with 400.
- Internal errors: Always `{ error: "Internal server error" }` with 500.
- **NEVER** include stack traces, internal error messages, field names, or type information in error responses.
- **NEVER** vary the error message based on the specific failure reason — that creates an oracle.

### AST-01 — JSON.parse on Auth Header Without Try-Catch (CRITICAL)

**Current code** (`apps/worker/lib/auth.ts:16`):
```typescript
export function parseAuthHeader(header: string | null): AuthPayload | null {
  if (!header?.startsWith('Bearer ')) return null
  try {
    return JSON.parse(header.slice(7))
  } catch {
    return null
  }
}
```

**Observation**: The current code ALREADY has a try-catch. The audit finding appears to reference an earlier version. **Verify** that this is still the current code at implementation time. If the try-catch is present, this finding is already resolved. Mark as N/A if confirmed.

### AST-02 — SIP Bridge JSON Parse Without Try-Catch (HIGH)

**Current code** (`sip-bridge/src/index.ts:179,195,231,255`):
```typescript
// Line 179 — inside try block (OK)
const data = JSON.parse(body) as Record<string, unknown>
// Line 195 — inside try block (OK)
const data = JSON.parse(body) as { callSid: string; ... }
// Line 231 — inside try block (OK)
const data = JSON.parse(body) as { channelIds: string[]; exceptId?: string }
// Line 255 — inside try block (OK)
const data = JSON.parse(body) as { channelId: string }
```

**Observation**: All four `JSON.parse` calls are already inside try-catch blocks. **Verify** at implementation time. If confirmed wrapped, mark as N/A.

**However**: The catch blocks return the raw error string to the client:
```typescript
} catch (err) {
  return Response.json({ ok: false, error: String(err) }, { status: 500 })
}
```

This leaks internal error information. **Fix**: Replace `String(err)` with a generic message:
```typescript
} catch {
  return Response.json({ ok: false, error: 'Invalid request' }, { status: 400 })
}
```

Use 400 (not 500) for parse errors — it's a client error, not a server error.

### AST-03 — Decrypt-Then-Parse Without Validation (HIGH)

**Current code** (`apps/worker/lib/hub-event-crypto.ts:162`):
```typescript
return JSON.parse(new TextDecoder().decode(plaintext)) as Record<string, unknown>
```

No try-catch. If decryption produces valid but non-JSON bytes (e.g., via bit flip or wrong key), this crashes.

**Fix**:
```typescript
export function decryptHubEvent(hex: string, eventKey: Uint8Array, epoch?: number): Record<string, unknown> {
  const packed = hexToBytes(hex)
  if (packed.length < 28) {
    throw new Error('Invalid hub event ciphertext: too short')
  }
  const nonce = packed.slice(0, 12)
  const ciphertext = packed.slice(12)
  const aad = buildEventAad(epoch)
  const cipher = gcm(eventKey, nonce, aad)
  const padded = cipher.decrypt(ciphertext)
  const plaintext = unpadFromBucket(padded)

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(plaintext))
  } catch {
    // Decryption produced non-JSON — log as security event, do not expose details
    throw new Error('Hub event decryption produced invalid payload')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Hub event decryption produced invalid payload')
  }

  return parsed as Record<string, unknown>
}
```

Log the event server-side at WARN level with the hub ID and epoch (no plaintext).

### AST-04 — Fetch Without AbortSignal.timeout (HIGH)

**~46+ `fetch()` calls** across `apps/worker/` without timeout protection.

**Attack scenario**: A slow external service (Twilio API, SignalWire, Vonage, media download) hangs indefinitely. Each hanging request holds a connection and memory. Enough concurrent hangs exhaust the server's connection pool — denial of service.

### safeFetch() Wrapper Design

```typescript
// apps/worker/lib/safe-fetch.ts

import { createLogger } from './logger'

const logger = createLogger('safe-fetch')

const DEFAULT_TIMEOUT_MS = 30_000  // 30 seconds
const MAX_TIMEOUT_MS = 120_000     // 2 minutes (for large media downloads)

export interface SafeFetchOptions extends RequestInit {
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number
  /** Whether to validate the URL against SSRF rules (default: false) */
  ssrfGuard?: boolean
}

export async function safeFetch(url: string | URL, options: SafeFetchOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ssrfGuard = false, ...fetchOptions } = options

  const effectiveTimeout = Math.min(timeoutMs, MAX_TIMEOUT_MS)

  // URL validation
  const parsed = new URL(url)
  if (ssrfGuard) {
    // Delegate to ssrf-guard.ts (must be fail-closed — see Epic E dependency)
    await validateUrlSsrf(parsed)
  }

  // Enforce HTTPS for external calls
  if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1' && parsed.protocol !== 'https:') {
    throw new Error('External fetch requires HTTPS')
  }

  return fetch(url, {
    ...fetchOptions,
    signal: AbortSignal.timeout(effectiveTimeout),
  })
}
```

**Migration strategy**: Replace `fetch()` calls incrementally. Priority order:
1. **External API calls** (Twilio, SignalWire, Vonage, etc.) — telephony adapters
2. **Media downloads** (Signal adapter) — with `ssrfGuard: true`
3. **Internal service calls** (signal-notifier, sip-bridge) — shorter timeout (10s)
4. **Health checks** — shortest timeout (5s)

Do NOT use a blanket find-and-replace. Each call site needs its timeout tuned.

### AST-05 — Signal Media Download Without SSRF Guard (MEDIUM)

**Current code** (`apps/worker/messaging/signal/adapter.ts:176`):
```typescript
const mediaResponse = await fetch(params.mediaUrl)
```

**Attack scenario**: `params.mediaUrl` comes from an incoming Signal message. An attacker sends a message with `mediaUrl` pointing to `http://169.254.169.254/latest/meta-data/` (AWS metadata), `http://localhost:5432/` (PostgreSQL), or other internal services.

**Fix**: Use `safeFetch` with SSRF guard and timeout:
```typescript
const mediaResponse = await safeFetch(params.mediaUrl, {
  ssrfGuard: true,
  timeoutMs: 60_000,  // media downloads may be large
})
```

**Dependency**: Epic E must land the fail-closed SSRF guard fix first. Until then, this call remains vulnerable. **Implementation order**: Epic E SSRF fix → this change.

### W05-H01 — Global Error Handler Leaks Stack in Dev (HIGH)

**Current code** (`apps/worker/app.ts:74-79`):
```typescript
app.onError((err, c) => {
  if (err instanceof ServiceError) {
    return c.json({ error: err.message }, err.status as 400 | 401 | 403 | 404 | 409 | 410 | 429 | 500)
  }
  throw err  // ← re-throws to Hono default handler, which may include stack
})
```

**Attack scenario**: Non-ServiceError exceptions (e.g., from a dependency, a type error, or an unhandled promise rejection) are re-thrown to Hono's default error handler. Hono's default handler returns the error message and potentially a stack trace in the response body.

**Fix**:
```typescript
app.onError((err, c) => {
  if (err instanceof ServiceError) {
    return c.json({ error: err.message }, err.status as 400 | 401 | 403 | 404 | 409 | 410 | 429 | 500)
  }
  // Log full error server-side for debugging
  logger.error('Unhandled error', { error: err.message, stack: err.stack })
  // Return generic error — NEVER expose internals
  return c.json({ error: 'Internal server error' }, 500)
})
```

**ServiceError messages**: Audit all `ServiceError` constructors to ensure none include internal details (stack traces, SQL errors, key material). ServiceError messages are sent to the client — they must be safe for external consumption.

### W05-M05 — Auth Error Message Differential (MEDIUM)

**Current code**: Auth middleware returns distinct error messages for different failure types (e.g., "Invalid token", "Token expired", "Invalid signature", "User not found").

**Attack scenario**: An attacker can enumerate valid pubkeys by observing different error messages. "Token expired" confirms the pubkey exists. "User not found" confirms it doesn't. This is an oracle.

**Fix**: All auth failures return the same response:
```typescript
return c.json({ error: 'Authentication failed' }, 401)
```

Log the specific reason server-side:
```typescript
logger.debug('Auth failed', { reason: 'token_expired', pubkey: auth.pubkey })
return c.json({ error: 'Authentication failed' }, 401)
```

**Audit all auth paths** in `apps/worker/lib/auth.ts` and any middleware that calls it. Every path that returns 401 must use the identical error body.

### W05-M03 — Logger Missing Sensitive Key Patterns (MEDIUM)

**Current code** (`apps/worker/lib/logger.ts:147-148`):
```typescript
const SENSITIVE_KEY_RE =
  /phone|email|nsec|secret|token|ciphertext|encrypted|content|recovery|^pin$|password|credential|apikey|auth_token|access_key|secret_key|private_key|server_secret/i
```

**Missing patterns**: `sid`, `signature`, `jwt`, `nonce`, `cookie`, `session`, `bearer`.

**Fix**:
```typescript
const SENSITIVE_KEY_RE =
  /phone|email|nsec|secret|token|ciphertext|encrypted|content|recovery|^pin$|password|credential|apikey|auth_token|access_key|secret_key|private_key|server_secret|sid|signature|jwt|nonce|cookie|session|bearer/i
```

**Note**: `sid` will match Twilio SIDs, `signature` will match webhook signatures — both should be redacted in logs.

---

## 4. Shared Patterns

### Pattern: Constant-Time Hex Comparison (Rust)

Use this whenever comparing hex-encoded security-sensitive values:

```rust
use subtle::ConstantTimeEq;

fn ct_hex_eq(a: &str, b: &str) -> Result<bool, CryptoError> {
    let a_bytes = hex::decode(a).map_err(CryptoError::HexError)?;
    let b_bytes = hex::decode(b).map_err(CryptoError::HexError)?;
    if a_bytes.len() != b_bytes.len() {
        return Ok(false);
    }
    Ok(a_bytes.ct_eq(&b_bytes).unwrap_u8() == 1)
}
```

Consider adding this as a utility to `packages/crypto/src/lib.rs` or a new `utils.rs` module, since it's needed in sigchain, device_keys, encryption, and the desktop IPC layer.

### Pattern: Webhook Validation Pipeline

Every webhook endpoint follows this pipeline:

```
1. Content-Type check
2. IP allowlist (if enabled)
3. Provider-specific signature validation
4. Replay protection (nonce + timestamp)
5. Route handler
```

All steps except (5) are in middleware. Failure at any step returns a generic error and logs the specific reason server-side.

---

## 5. BDD Test Scenarios

### Webhook Replay Protection

```gherkin
Feature: Webhook replay protection
  Webhooks from telephony and messaging providers must not be replayable.

  Scenario: First delivery of a Twilio webhook succeeds
    Given a valid Twilio webhook signature
    When the webhook is delivered for the first time
    Then the response status should be 200
    And the call should be processed

  Scenario: Replay of an identical Twilio webhook is rejected idempotently
    Given a valid Twilio webhook that has already been processed
    When the same webhook is delivered again within 5 minutes
    Then the response status should be 200
    And the call should NOT be processed again

  Scenario: Webhook with expired timestamp is rejected
    Given a valid Vonage webhook signature
    But the timestamp is 90 seconds old
    When the webhook is delivered
    Then the response status should be 403

  Scenario: Webhook from non-allowlisted IP is rejected
    Given IP allowlisting is enabled for Twilio
    And the request comes from an IP not in the Twilio range
    When the webhook is delivered
    Then the response status should be 403

  Scenario: Webhook with wrong Content-Type is rejected
    Given a Twilio webhook with Content-Type "application/json"
    When the webhook is delivered
    Then the response status should be 415
```

### Auth Error Disclosure

```gherkin
Feature: Auth error messages do not leak information
  Auth failures must return identical responses regardless of failure type.

  Scenario Outline: All auth failures return the same error
    Given an auth request with <failure_type>
    When the request is processed
    Then the response status should be 401
    And the response body should be exactly '{"error":"Authentication failed"}'

    Examples:
      | failure_type           |
      | missing auth header    |
      | malformed JSON token   |
      | expired token          |
      | invalid signature      |
      | unknown pubkey         |
      | wrong method binding   |
```

### JSON Parse Crash Protection

```gherkin
Feature: Malformed JSON does not crash the server
  All JSON parse operations must be wrapped in error handling.

  Scenario: Malformed auth header returns 401
    Given a request with auth header "Bearer {not-json}"
    When the request is processed
    Then the response status should be 401
    And the server should not crash

  Scenario: Malformed SIP bridge command returns 400
    Given a valid SIP bridge webhook signature
    And the body is "this is not json"
    When the command endpoint is called
    Then the response status should be 400
    And the response should contain "Invalid request"

  Scenario: Hub event decrypt produces non-JSON
    Given an encrypted hub event that decrypts to non-JSON bytes
    When decryption and parsing is attempted
    Then a security event should be logged
    And the error should not expose the decrypted content
```

---

## 6. Dependency Notes

| Finding | Dependency | Notes |
|---------|-----------|-------|
| AST-05 (Signal SSRF) | **Epic E** — SSRF guard must fail-closed | Do NOT implement AST-05 until Epic E lands. Partial fix: add timeout now, SSRF guard after Epic E. |
| SIDE-07 (SFrame nonce) | **Epic B** — H10 | No action in this epic. |
| SIDE-04 (label validation) | SIDE-01 (HashMap) | SIDE-01's HashMap makes label validation O(1). Implement SIDE-01 first. |
| W05-H02 (replay protection) | Database migration | Requires new `webhook_nonces` table. |
| W05-H03 (IP allowlist) | Provider IP range documentation | Ranges change — make configurable, not hardcoded. |

### Cargo.toml Changes

```toml
# packages/crypto/Cargo.toml — add direct dependency
subtle = "2"
```

No new TypeScript dependencies required. `safeFetch` is a thin wrapper around native `fetch`.

---

## 7. Implementation Order

Implementation should proceed in dependency order:

### Phase 1 — Foundation (no dependencies)
1. **AST-01**: Verify auth.ts try-catch (likely N/A)
2. **AST-02**: Fix SIP bridge error messages (generic errors)
3. **AST-03**: Wrap hub-event-crypto JSON.parse
4. **W05-H01**: Fix global error handler (catch-all, no re-throw)
5. **W05-M05**: Standardize auth error messages
6. **W05-M03**: Add missing logger sensitive key patterns

### Phase 2 — Crypto constant-time (requires `subtle` dep)
7. **SIDE-01**: Label registry HashMap
8. **SIDE-02**: Sigchain constant-time hash comparison
9. **SIDE-03**: Shamir verify constant-time
10. **SIDE-04**: Hub field label validation (depends on SIDE-01)
11. **SIDE-05**: Device keys constant-time pubkey comparison
12. **SIDE-06**: Recipient matching constant-time scan

### Phase 3 — Webhook hardening (requires DB migration)
13. **W05-M09**: Content-Type enforcement middleware
14. **W05-M10**: Common webhook auth middleware
15. **W05-M08**: Tighten Vonage/Telnyx replay window
16. **W05-H02**: Twilio/SignalWire replay protection (nonce table)
17. **W05-H03**: IP allowlist middleware (opt-in)

### Phase 4 — Fetch hardening (requires safeFetch)
18. **AST-04**: safeFetch wrapper + migration of external fetch calls
19. **AST-05**: Signal media SSRF guard (BLOCKED on Epic E)

---

## Summary

| ID | Severity | Category | Status |
|----|----------|----------|--------|
| SIDE-01 | MEDIUM | Side channel | Fix: HashMap |
| SIDE-02 | HIGH | Side channel | Fix: subtle::ConstantTimeEq |
| SIDE-03 | MEDIUM | Side channel | Fix: subtle::ConstantTimeEq |
| SIDE-04 | HIGH | Side channel | Fix: Label registry validation |
| SIDE-05 | LOW | Side channel | Fix: subtle::ConstantTimeEq |
| SIDE-06 | LOW | Side channel | Fix: Full-scan match |
| SIDE-07 | MEDIUM | Side channel | Deferred to Epic B |
| W05-H02 | HIGH | Webhook | Fix: Nonce-based replay protection |
| W05-H03 | HIGH | Webhook | Fix: Optional IP allowlist |
| W05-M08 | MEDIUM | Webhook | Fix: Tighten to 60s |
| W05-M09 | MEDIUM | Webhook | Fix: Content-Type enforcement |
| W05-M10 | MEDIUM | Webhook | Fix: Common auth middleware |
| AST-01 | CRITICAL | Error/Parse | Verify (likely N/A) |
| AST-02 | HIGH | Error/Parse | Fix: Generic error messages |
| AST-03 | HIGH | Error/Parse | Fix: Try-catch + security log |
| AST-04 | HIGH | Error/Parse | Fix: safeFetch wrapper |
| AST-05 | MEDIUM | Error/Parse | BLOCKED on Epic E |
| W05-H01 | HIGH | Error | Fix: Catch-all error handler |
| W05-M05 | MEDIUM | Error | Fix: Uniform auth errors |
| W05-M03 | MEDIUM | Error | Fix: Expand sensitive regex |
