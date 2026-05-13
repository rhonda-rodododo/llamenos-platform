---
epic: EP09
title: Recovery Group & Key Escrow
status: specced
depends-on: [EP01, EP02]
phase: 5
---

# EP09: Recovery Group & Key Escrow

**Date:** 2026-05-12
**Status:** Specced (revised after cross-platform E2EE recovery research)
**Depends on:** EP01 (admin shell + nav + permission infrastructure), EP02 (device management + sigchain)

## Summary

Port v1's social recovery / key escrow system to v2, adapting to the v2 crypto architecture: HPKE (X25519-HKDF-SHA256-AES256-GCM), per-device Ed25519/X25519 keys, sigchain-based device authorization, PUK with CLKR.

The system enables account recovery when a user loses all their devices. A configured group of recovery contacts (share holders) each hold a Shamir secret share of a recovery group private key. When a user needs recovery, they initiate a request from a new device (verified via Signal), share holders approve by contributing their shares (HPKE-sealed directly to the user's new device), and the user's PUK seed is restored — giving them access to all encrypted data in that hub.

**Key architectural decisions:**
1. Rust-native Shamir secret sharing in `packages/crypto/` (single auditable crate, UniFFI for all platforms)
2. Per-hub recovery groups (hub is the trust boundary — no cross-hub trust escalation)
3. Direct HPKE share transport (each share holder HPKE-seals their share to the user's new device pubkey — simpler, proven, no MLS desync risk)
4. Signal-verified recovery initiation (all users required to use Signal — serves as second factor)
5. Full mobile parity (all admin operations available on iOS/Android)
6. Permission-gated (no hardcoded role references)
7. Recovery group pubkey anchored to sigchain (prevents server-side key substitution)
8. Configurable delay with duress detection (defense against coerced share holders)

## Research Context

This spec was informed by a comprehensive survey of recovery mechanisms across Signal (SVR3), WhatsApp (HSM-backed OPAQUE), Matrix (SSSS — Albrecht et al. vulnerabilities), Keybase (sigchain + paper keys), 1Password (emergency access), Apple (HSM escrow + recovery contacts), Proton (SRP + org keys), Wire (MLS migration), Tresorit (zero-knowledge enterprise), and Wickr (ephemeral key management).

Key findings that shaped this design:
- **Account recovery is the primary attack surface** in E2EE systems (confirmed by Signal cryptographer). A weak recovery path undermines the entire security model.
- **No production platform uses MLS for recovery** — Wire uses MLS for messaging but recovery is out-of-band. MLS adds complexity risk (desync, bootstrapping) to an already-critical subsystem. We chose direct HPKE share transport instead.
- **Matrix's Albrecht et al. vulnerabilities** were caused by lack of domain separation in the recovery subsystem — validates our 69-label domain separation scheme.
- **Apple's 1-of-N recovery contacts** are weaker than K-of-N Shamir — any single contact is a coercion/compromise target.
- **Proton's organizational key** (admin can decrypt user data) is an anti-pattern for our threat model — we preserve per-note forward secrecy.
- **Signal rejects social recovery** due to coercion graphs — we accept this trade-off but mitigate with time delays, duress detection, and geographic distribution guidance.
- **1Password's time-delay with rejection window** validates our approach — grantor can cancel during the delay period.
- **Keybase's sigchain anchoring** prevents silent key substitution by the server — we adopt this for recovery group pubkeys.

## Design Decisions

### D1: Rust-Native Shamir Secret Sharing

Shamir GF(2^8) implementation in `packages/crypto/src/shamir.rs` (~200 lines). Single codebase compiled to native (Tauri), WASM (test builds), and UniFFI (iOS/Android). Consistent with the crypto-in-Rust philosophy — one implementation to audit.

v1 used the `shamir-secret-sharing` JS library (privy-io, Cure53/Zellic audited). The Rust replacement needs its own audit but eliminates three separate code paths (JS, Swift shim, Kotlin shim) and keeps all crypto in one crate.

API surface:
- `split(secret: &[u8], total: u8, threshold: u8) -> Result<Vec<Share>, CryptoError>` — threshold ∈ [2,5], total ∈ [3,5]
- `combine(shares: &[Share]) -> Result<Vec<u8>, CryptoError>` — requires ≥ threshold shares
- `commit(share: &Share) -> [u8; 32]` — SHA-256 commitment for tamper detection
- `verify(share: &Share, commitment: &[u8; 32]) -> bool`

Information-theoretic security: below-threshold shares reveal zero information about the secret.

### D2: Per-Hub Recovery Groups

Each hub maintains its own recovery group with its own share holders. Recovery restores the user's PUK seed for that specific hub — not their device keys or cross-hub access.

**Why not platform-scoped or cross-hub?** A compromised or malicious share holder in Hub A should not be able to escalate to recovering access in Hub B. The hub is the trust boundary. A user in N hubs needs N separate recoveries — more ceremonies, but no cross-hub trust leakage.

In practice, most users belong to 1-2 hubs, so the UX cost is minimal.

### D3: Direct HPKE Share Transport

Share contributions use direct HPKE encryption from each share holder to the recovering user's new device X25519 pubkey. The server relays HPKE ciphertext — it never sees plaintext shares. Each share holder's contribution is authenticated via their sigchain-verified device key (Ed25519 signature over the HPKE ciphertext + session ID).

**Why HPKE over MLS?** Research found no production platform uses MLS for recovery ceremonies. MLS adds significant complexity risk:
- MLS group desynchronization could brick a recovery ceremony at the worst possible moment
- Bootstrapping an unauthenticated user into an MLS group has unresolved edge cases
- Share transport is a one-shot operation where HPKE direct-to-recipient is sufficient
- The primary protection is the Shamir threshold, not forward secrecy on share transport

HPKE share transport is still fully E2EE — the server stores and relays only ciphertext. Authentication comes from Ed25519 signatures verified against the contributor's sigchain, not from MLS group membership.

**Future path:** MLS-based ceremony can be added as an enhancement if operational experience shows it's needed. The share contribution API is transport-agnostic.

### D4: Recovery Target — PUK Seed Per-Hub

Recovery restores the user's PUK seed for a specific hub. The PUK seed is wrapped (HPKE) under the recovery group's X25519 public key at enrollment time, and unwrapped during the ceremony using the reconstructed private key.

The new device is already provisioned with fresh device keys (via EP02 device generation). Recovery gives the new device access to hub-specific encrypted data by delivering the PUK seed, from which items_key and per-note/message keys can be derived via CLKR.

Flow:
1. New device already has its own Ed25519/X25519 keys
2. Recovery ceremony delivers PUK seed for the hub
3. New device derives items_key → can decrypt notes, messages, hub metadata
4. New device creates a sigchain entry (special recovery link type) to authorize itself

### D5: X25519 Recovery Group Keypair

v1 used secp256k1 for the recovery group keypair. v2 uses X25519 to match HPKE. The private key is the Shamir secret — split into N shares, never stored whole, zeroized immediately after splitting.

### D6: Zero-Knowledge Server

The server's role is minimal and metadata-only:
- Stores HPKE ciphertext (share envelopes, user recovery envelopes, share contributions) — never plaintext
- Tracks contribution metadata (who contributed, when) — not the share contents
- Enforces rate limits on initiation endpoint (defense-in-depth)
- Enforces configurable delay (defense-in-depth — client also enforces)
- Relays Signal verification for recovery initiation

The server cannot read shares, reconstruct the recovery group private key, or access PUK seeds. Even share contributions during a ceremony are HPKE-encrypted to the user's new device — the server relays ciphertext only.

### D7: Signal-Verified Recovery Initiation

All Llámenos users are required to use Signal. Recovery initiation uses Signal as a second factor:

1. User submits recovery request via app (unauthenticated — they lost their device)
2. Server sends a verification code to the user's registered Signal identity via the `signal-notifier` sidecar
3. User enters the code on their new device to confirm identity
4. Only then does the server create the recovery session and notify share holders

This closes the distributed attacker gap identified in research — IP rate limiting alone is insufficient. Signal verification leverages the existing trusted channel without adding new infrastructure. The `signal-notifier` sidecar already handles HMAC-hashed contact resolution (zero-knowledge — no plaintext phone numbers stored).

WebAuthn is part of the normal authentication flow but cannot be used for recovery initiation (the user has lost their device and WebAuthn credentials with it).

### D8: Permission Model

All operations gated by permissions, never by role names.

| Permission | Scope | Gates |
|---|---|---|
| `recovery:manage` | hub | Configure/rotate recovery groups, assign share holders, cancel sessions |
| `recovery:hold-share` | hub | Hold a Shamir share (gates UI for share contribution) |
| `recovery:initiate` | hub | Initiate recovery for another user (admin-side) |
| `recovery:approve` | hub | Act as emergency override second approver |
| `recovery:view` | hub | View recovery group status and recovery request dashboard |

The user-initiated recovery endpoint requires Signal verification, not permissions (the user has no authenticated session).

### D9: Recovery Group Pubkey Transparency

The recovery group public key is anchored to the hub's sigchain to prevent server-side key substitution (inspired by Keybase's sigchain anchoring and Proton's Key Transparency).

At enrollment:
1. The enrolling user creates a sigchain link of type `recovery-group-enroll` containing the recovery group X25519 public key and share holder pubkeys
2. All share holders verify the sigchain link before accepting their shares
3. Users verify the recovery group pubkey from the sigchain before allowing auto-enrollment of their PUK seed

At rotation:
1. A new sigchain link of type `recovery-group-rotate` is created with the new public key
2. The old link is not deleted (sigchain is append-only) — clients verify the latest link

If the server attempts to substitute a malicious recovery group key, the sigchain entry would be missing or inconsistent, and clients would refuse to enroll.

### D10: Duress Detection

Against nation-state adversaries who may coerce share holders, the system includes duress-aware mechanisms:

1. **Duress share:** Each share holder can optionally register a "duress commitment" — a second SHA-256 commitment for a fake share that, when contributed, produces a recognizably-wrong secret. If the recovery fails with a duress-flagged share, the system logs a coercion alert visible to other share holders.
2. **Geographic distribution guidance:** The admin UI recommends distributing share holders across different jurisdictions. A warning is shown if all share holders are in the same geographic region.
3. **Out-of-band verification requirement:** The UI strongly prompts share holders to verify recovery requests through a separate channel (phone call, in-person) before contributing. This is UX guidance, not a technical enforcement.
4. **Canary check-in:** Share holders are periodically prompted (configurable interval) to confirm they still have access to their share and are not under duress. A missed check-in triggers an alert to other share holders and recommends group rotation.

### D11: Configurable Delay

The recovery delay is configurable per hub (not hardcoded):

| Setting | Default | Range | Notes |
|---|---|---|---|
| Standard delay | 24h | 4h–168h (1 week) | Normal recovery |
| Emergency floor | 4h | 1h–24h | Urgent recovery minimum |

The research found that a 1h emergency floor may be too short against sophisticated adversaries who can compel two share holders simultaneously. Default raised to 4h. Hub-scoped configuration allows organizations to set their own risk tolerance.

### D12: User-Facing Terminology

Internal code and docs use crypto-precise terms. User-facing UI uses plain language:

| Internal/Code | User-Facing |
|---|---|
| Recovery ceremony | Account recovery |
| Recovery group | Recovery team |
| Share holder | Recovery contact |
| Shamir share | (never exposed) |
| Contribute share | Approve recovery |
| Threshold | Required approvals |
| Recovery session | Recovery request |
| Emergency override | Urgent recovery |
| Co-approver | Second approver |
| Duress share | (never exposed — silent mechanism) |

i18n keys use internal naming (`recoveryGroup.sessions.*`); string values use plain language.

### D13: Atomic Group Rotation

When recovery groups rotate (share holder departure, periodic policy), the process must be atomic to prevent a window where a compromised old share retains access:

1. Generate new X25519 keypair and split into new shares
2. HPKE-wrap new shares to new share holder set
3. In a single transaction:
   a. Delete old shares (FK cascade from `hub_recovery_groups`)
   b. Insert new group config + new shares
   c. Update all user recovery envelopes (re-wrap under new pubkey)
4. Create sigchain link for the rotation
5. Old shares are cryptographically useless after the group pubkey changes — even if an attacker retained a copy, they cannot decrypt envelopes wrapped under the new key

### D14: Share Liveness Verification

Between enrollment and recovery, there is no guarantee that share holders still have access to their decrypted shares (device loss, key rotation, etc.). Periodic liveness checks detect stale shares:

1. Each share holder's client periodically (configurable, default monthly) attempts to HPKE-open their stored share envelope with their current device key
2. On success: client posts a signed "liveness proof" (Ed25519 signature over `share_commitment || timestamp`) to the server
3. On failure: client alerts the share holder that their share needs re-provisioning (group rotation required)
4. The admin UI shows share liveness status for each recovery contact: last verified timestamp, stale warning if overdue

This does NOT reveal the share to the server — only a signature proving the holder can decrypt it.

## Crypto Foundation

### New Rust Module: `packages/crypto/src/shamir.rs`

GF(2^8) Shamir secret sharing implementation:
- Polynomial evaluation over GF(2^8) with irreducible polynomial 0x11B
- Random coefficients from `OsRng` for each split
- Share format: `(x: u8, y: Vec<u8>)` where x is the evaluation point (1-indexed, never 0)
- Lagrange interpolation for reconstruction

Constraints enforced at the API level:
- `threshold ∈ [2, 5]`
- `total ∈ [3, 5]`
- `threshold ≤ total`

Exposed via:
- Native: direct Rust calls (Tauri desktop)
- UniFFI: `mobile_shamir_split`, `mobile_shamir_combine`, `mobile_shamir_commit`, `mobile_shamir_verify` (iOS/Android)
- WASM: `shamir_split`, `shamir_combine`, `shamir_commit`, `shamir_verify` (test builds)

### New Crypto Labels

Added to `packages/protocol/crypto-labels.json`, generated to TS/Swift/Kotlin via codegen:

| Label | Value | Purpose |
|---|---|---|
| `LABEL_RECOVERY_GROUP_SHARE_WRAP` | `llamenos:recovery-group:share-wrap:v1` | HPKE wrapping each share holder's Shamir share at rest |
| `LABEL_RECOVERY_PUK_SEED_WRAP` | `llamenos:recovery-group:puk-seed-wrap:v1` | HPKE wrapping user's PUK seed under recovery group pubkey |
| `LABEL_RECOVERY_SHARE_CONTRIBUTE` | `llamenos:recovery-group:share-contribute:v1` | HPKE wrapping share contribution to user's new device during ceremony |
| `LABEL_RECOVERY_LIVENESS_PROOF` | `llamenos:recovery-group:liveness-proof:v1` | Domain separation for share liveness proofs |

### Recovery Group Keypair

X25519 keypair generated client-side:
- Private key: 32 random bytes → Shamir split → zeroized
- Public key: X25519 base point multiplication → stored on `hub_recovery_groups` and anchored in sigchain

## Recovery Group Lifecycle

### Enrollment

1. User with `recovery:manage` configures threshold (K) and total shares (N)
2. Client generates X25519 recovery group keypair
3. Client splits private key into N Shamir shares
4. Client computes SHA-256 commitment for each share (+ optional duress commitments)
5. Client HPKE-seals each share to the corresponding share holder's X25519 device pubkey (`LABEL_RECOVERY_GROUP_SHARE_WRAP`)
6. Private key zeroized immediately — never persisted whole
7. Enrolling user creates sigchain link (`recovery-group-enroll`) with group pubkey + share holder pubkeys
8. Public key + commitments + share envelopes sent to server
9. Server stores ciphertext only
10. Share holders verify sigchain link before accepting shares

### User Auto-Enrollment

When a user authenticates to a hub with an active recovery group, the client:
1. Verifies the recovery group pubkey against the sigchain (prevents server key substitution)
2. Wraps their PUK seed under the verified recovery group public key (`LABEL_RECOVERY_PUK_SEED_WRAP`)
3. Envelope stored server-side per (user, hub)
4. Re-wrapped on PUK rotation (CLKR) — always verifying sigchain first

### Group Rotation (Atomic — D13)

Triggered on share holder departure or periodic policy:
1. New X25519 keypair generated, private key split into new shares
2. New per-holder HPKE envelopes created
3. Single DB transaction: delete old group + shares (cascade), insert new group + shares, re-wrap all user recovery envelopes
4. New sigchain link (`recovery-group-rotate`) with new pubkey
5. Old shares cryptographically useless after pubkey change

### Share Holder Changes

- **Adding:** Group must be rotated (new split with updated N)
- **Removing:** Mandatory rotation — departing holder's share is compromised by definition

## Recovery Ceremony

### Phase 1: Initiation (Signal-verified)

1. User installs app on new device, generates fresh Ed25519/X25519 device keys
2. User taps "Account recovery" → enters their identifier (email/phone) + selects hub
3. `POST /initiate` — server sends verification code via Signal (`signal-notifier` sidecar)
4. User enters verification code on new device → `POST /initiate/verify`
5. Server creates recovery session (`status: pending`, delay starts), stores new device pubkey
6. Server notifies share holders (push notification / in-app alert via Signal)
7. Rate limited: 10 req / 5 min per IP (defense-in-depth, in addition to Signal verification)
8. Anti-enumeration: response shape and timing identical whether user exists or not

### Phase 2: Share Contribution (direct HPKE)

1. Each share holder receives notification, opens recovery request dashboard
2. Share holder verifies the request is legitimate (out-of-band: Signal message, phone call, in-person)
3. Share holder decrypts their stored Shamir share (HPKE-open with device key, `LABEL_RECOVERY_GROUP_SHARE_WRAP`)
4. Share holder verifies their share against the stored SHA-256 commitment
5. Share holder HPKE-seals the plaintext share to the recovering user's new device X25519 pubkey (`LABEL_RECOVERY_SHARE_CONTRIBUTE`), with AAD binding `(sessionId, contributorPubkey)` to prevent replay
6. Share holder signs the HPKE ciphertext + session ID with their Ed25519 device key (sigchain-authenticated)
7. `POST /session/:id/contribute` — server stores HPKE ciphertext + signature, records contributor metadata
8. When contribution count ≥ K: server transitions session to `active`

### Phase 3: Delay Enforcement

- **Server-side:** Refuses to release HPKE-encrypted contributions until configurable delay elapsed (default 24h, range 4h–168h)
- **Client-side:** Recovering user's device enforces delay locally before combining — defense-in-depth only (a compromised client could skip this). The primary protection is the Shamir threshold requiring multiple independent share holders to cooperate.
- **Purpose:** Window for the real account holder to notice and cancel from any other authenticated device, or for coerced share holders to raise an alarm
- **Cancellation:** Any authenticated device for that user, or user with `recovery:manage`, can cancel
- **Signal notification:** The recovering user's registered Signal identity receives a notification when a recovery session is created for them — alerting them if the request is unauthorized

### Phase 4: Completion

After delay elapsed + threshold contributions received:

1. Server releases HPKE-encrypted share contributions to the recovering user's new device
2. New device HPKE-opens each contribution with its device key (`LABEL_RECOVERY_SHARE_CONTRIBUTE`)
3. New device verifies each share against stored commitments + verifies Ed25519 signatures against sigchain
4. New device combines verified shares → reconstructs recovery group X25519 private key
5. Private key decrypts user's PUK seed envelope (`LABEL_RECOVERY_PUK_SEED_WRAP`)
6. PUK seed loaded into new device's CryptoState
7. New device creates sigchain entry (recovery link type) to authorize itself
8. PUK re-wrapped (HPKE) to new device's pubkey
9. Recovery group private key zeroized immediately
10. Recovery event logged to hash-chained audit log
11. User prompted to set PIN for new device key protection

### Emergency Override (Urgent Recovery)

- Reduces delay to configurable floor (default 4h, range 1h–24h)
- Requires: justification text (min 16 chars) + second approver Ed25519 signature over session ID
- Second approver must have `recovery:approve` permission and be a different person than the contributing share holders
- Signature verified by the recovering user's device + all share holder devices before accepting
- Emergency override metadata stored on session record for audit trail

### Adversarial Scenarios

| Threat | Mitigation |
|---|---|
| Compromised server | Stores only HPKE ciphertext. Cannot read shares, reconstruct private key, or access PUK seed. Cannot substitute recovery group key (sigchain-anchored). |
| Server key substitution | Recovery group pubkey anchored in sigchain — clients verify before enrolling PUK seed. Mismatch prevents enrollment. (D9) |
| Compromised single share holder | Has one share — information-theoretically useless below threshold. Cannot complete ceremony alone. |
| Coerced share holders | Time delay (default 24h) gives window to alert. Duress share detection (D10). Geographic distribution guidance. Canary check-ins. |
| Stolen new device during ceremony | Attacker needs new device's private key (PIN-protected in CryptoState) to decrypt HPKE share contributions. |
| Replay attack with old shares | AAD binding `(sessionId, contributorPubkey)` on HPKE contributions prevents replay across sessions. Share commitments bound to specific enrollment. |
| Race condition (real user + attacker) | Signal verification for initiation. 24h delay. Cancellation by any authenticated device. Signal notification to user on session creation. |
| Malicious hub admin (cross-hub) | Per-hub groups — compromised user in Hub A cannot escalate to Hub B. Hub is the trust boundary. (D2) |
| User enumeration via initiate | Response shape and timing identical for existing and non-existing users. |
| DoS on initiate endpoint | Per-IP rate limit (10/5min) + Signal verification (prevents automated abuse). |
| Threshold bricking | DB constraint: `threshold ≤ totalShares`. Cannot create unrecoverable groups. |
| Orphan shares on rotation | Atomic rotation (D13): old shares deleted in same transaction as new group creation. |
| Stale shares (holder lost device) | Periodic liveness verification (D14): holders prove they can decrypt their share without revealing it. |
| Re-enrollment guess counter reset | Recovery sessions are bound to a specific user + hub + session ID. Creating a new session does not reset any security counters — each session has its own independent delay. (Informed by WhatsApp HSM re-initialization attack research.) |

## Database Schema

### `hub_recovery_groups`

| Column | Type | Notes |
|---|---|---|
| `hubId` | UUID PK | FK → hubs |
| `groupPublicKey` | text | X25519 public key (hex) |
| `threshold` | int | K value, CHECK 2-5 |
| `totalShares` | int | N value, CHECK 3-5 |
| `shareCommitments` | JSONB | Array of SHA-256 hex strings |
| `duressCommitments` | JSONB | nullable, array of optional duress commitments (same length as shareCommitments, null entries for holders without duress shares) |
| `sigchainLinkHash` | text | Hash of the sigchain link anchoring this group's pubkey |
| `delayHours` | int | Configurable recovery delay, default 24, CHECK 4-168 |
| `emergencyFloorHours` | int | Configurable urgent recovery floor, default 4, CHECK 1-24 |
| `createdAt` | timestamp | |
| `rotatedAt` | timestamp | nullable |

CHECK: `threshold <= totalShares`, `emergencyFloorHours <= delayHours`

### `hub_recovery_group_shares`

| Column | Type | Notes |
|---|---|---|
| `hubId` | UUID | FK → hub_recovery_groups ON DELETE CASCADE |
| `holderPubkey` | text | X25519 pubkey of share holder |
| `shareEnvelope` | text | HPKE ciphertext (hex) |
| `lastLivenessProof` | timestamp | nullable, last successful liveness verification |
| `createdAt` | timestamp | |

Composite PK: `(hubId, holderPubkey)`

### `user_recovery_envelopes`

| Column | Type | Notes |
|---|---|---|
| `userPubkey` | text | User's identity pubkey |
| `hubId` | UUID | FK → hubs |
| `envelope` | text | PUK seed HPKE-wrapped under recovery group pubkey |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | Re-set on PUK rotation |

Composite PK: `(userPubkey, hubId)`

### `recovery_sessions`

| Column | Type | Notes |
|---|---|---|
| `sessionId` | UUID PK | Auto-generated |
| `hubId` | UUID | FK → hubs |
| `userPubkey` | text | User being recovered |
| `newDevicePubkey` | text | New device's X25519 pubkey |
| `signalVerified` | boolean | Whether Signal verification was completed |
| `status` | enum | pending / verified / active / completed / expired / cancelled |
| `expiresAt` | timestamp | createdAt + hub's configured delay |
| `completedAt` | timestamp | nullable |
| `cancelledAt` | timestamp | nullable |
| `cancelledBy` | text | nullable, pubkey of canceller |
| `emergencyOverride` | JSONB | nullable: `{justification, approverPubkey, approverSignature}` |
| `createdAt` | timestamp | |

Indexes: `hubId`, `userPubkey`, `status`

Note: `status` flow is `pending` → (Signal verification) → `verified` → (threshold contributions) → `active` → (delay elapsed) → `completed`. Also `pending/verified/active` → `expired` or `cancelled`.

### `recovery_session_contributions`

| Column | Type | Notes |
|---|---|---|
| `sessionId` | UUID | FK → recovery_sessions ON DELETE CASCADE |
| `contributorPubkey` | text | Share holder who contributed |
| `encryptedShare` | text | HPKE ciphertext — share sealed to new device's X25519 pubkey |
| `contributorSignature` | text | Ed25519 signature over (ciphertext + sessionId) |
| `contributedAt` | timestamp | |

Composite PK: `(sessionId, contributorPubkey)` — prevents duplicate contributions.

The `encryptedShare` column stores HPKE ciphertext that only the recovering user's new device can decrypt. The server relays it but cannot read it. The `contributorSignature` allows the recovering device to verify the share came from a sigchain-authorized device.

## API Endpoints

Eight endpoints under `/api/recovery-group/*`:

### Authenticated

**`POST /enroll`** — Configure recovery group
- Permission: `recovery:manage`
- Body: `RecoveryGroupEnrollSchema` — threshold, totalShares, groupPublicKey, shareEnvelopes[], shareCommitments[], duressCommitments?, sigchainLinkHash, delayHours?, emergencyFloorHours?
- Validates: envelope count = commitment count = totalShares, threshold ≤ totalShares, sigchain link exists and contains matching pubkey
- Response: `{ok: true}`

**`GET /:hubId`** — Get recovery group config
- Permission: `recovery:view`
- Response: `RecoveryGroupInfoSchema` — publicKey, threshold, totalShares, commitments, sigchainLinkHash, delayHours, emergencyFloorHours, timestamps, shareHolderLiveness[]

**`POST /session/:id/contribute`** — Submit encrypted share contribution
- Permission: `recovery:hold-share`
- Body: `{encryptedShare, contributorSignature}` — HPKE ciphertext sealed to new device pubkey + Ed25519 signature
- Validates: session exists and is `verified`, contributor is a share holder, no duplicate contribution
- If contribution count ≥ threshold: session status → `active`
- Response: `{ok: true, status, contributionCount}`

**`GET /session/:id`** — Get recovery request status
- Permission: `recovery:view`
- Response: `RecoverySessionStatusSchema` — status, contributionCount, threshold, delayRemainingMs, contributions[] (HPKE ciphertext released only after delay)

**`POST /user-envelope`** — Store/update user recovery envelope
- Auth required (any authenticated user)
- Body: `{hubId, envelope}` — HPKE ciphertext
- Upserts on `(userPubkey, hubId)`
- Response: `{ok: true}`

**`POST /session/:id/cancel`** — Cancel a recovery request
- Auth required — must be the recovering user (from another device) or user with `recovery:manage`
- Sets status → `cancelled`, records `cancelledBy`
- Response: `{ok: true}`

**`POST /shares/liveness`** — Submit share liveness proof
- Permission: `recovery:hold-share`
- Body: `{hubId, proof}` — Ed25519 signature over `(shareCommitment || timestamp)`
- Updates `lastLivenessProof` timestamp
- Response: `{ok: true}`

### Unauthenticated

**`POST /initiate`** — Start account recovery (two-step with Signal verification)
- No auth (user lost their device)
- Rate limit: 10 req / 5 min per IP (defense-in-depth)
- Body: `RecoveryInitiateSchema` — hubId, userIdentifier, newDevicePubkey
- Server sends verification code via Signal (`signal-notifier` sidecar)
- Response: `{sessionId, verificationSent: true}` (same shape regardless of user existence — anti-enumeration)

**`POST /initiate/verify`** — Confirm Signal verification code
- No auth
- Body: `{sessionId, verificationCode}`
- On success: session status → `verified`, delay timer starts, share holders notified
- Response: `{ok: true, expiresAt}`
- Brute-force protection: 5 attempts max per session, then session expires

## UI Design

All admin UIs permission-gated. Full mobile parity — many users with admin permissions work from the field without desktop access.

### Admin: Recovery Team Configuration

- **Location:** Admin sidebar → hub scope → "Recovery Team"
- **Permission:** `recovery:manage`
- **Features:**
  - Required approvals (K) and total contacts (N) inputs with validation
  - Recovery contact selection — picker showing users with `recovery:hold-share`, device verification status, liveness status
  - Recovery delay configuration (hours, default 24)
  - Urgent recovery floor configuration (hours, default 4)
  - Set up / Rotate buttons
  - Current status: configured/not configured, required approvals count, contact list, last rotation, sigchain link hash
  - Contact health: verified devices, last seen, last liveness proof, stale warning
  - Geographic distribution advisory: warning if all contacts in same region

### Admin: Account Recovery Requests

- **Location:** Admin sidebar → hub scope → "Recovery Requests"
- **Permission:** `recovery:view` (actions require `recovery:hold-share` or `recovery:manage`)
- **Features:**
  - Active requests: user identifier, status (including Signal verification state), approval progress (K of N), time remaining
  - Approve button: decrypts stored share, verifies commitment, HPKE-seals to new device pubkey, signs, submits
  - Urgent recovery: justification + second approver selection (`recovery:approve`)
  - Cancel button: for fraudulent requests (`recovery:manage`)
  - Request history: completed/expired/cancelled with timestamps
  - Duress alert: if a duress share is detected, highlighted warning for remaining share holders

### User: Account Recovery Flow

- **Location:** Login screen → "I lost my device"
- **No auth required**
- **Steps:**
  1. Enter identifier (email/phone) + select hub
  2. App generates fresh device keys
  3. Submit recovery request → Signal verification code sent
  4. Enter verification code
  5. Waiting screen: "Waiting for your recovery contacts to approve" + approval progress + delay countdown
  6. Progress updates as approvals arrive (polling session status)
  7. After delay + approvals met: device downloads + decrypts share contributions → PUK seed restored
  8. "Account recovered" → Set new PIN prompt

### User: Recovery Status (authenticated)

- **Location:** Security settings
- **Features:** Per-hub enrollment status — "Your account is recoverable in [Hub Name]" / "No recovery team configured"
- Read-only — enrollment is automatic (with sigchain verification)

### Platform Parity

| Feature | Desktop | iOS | Android |
|---|---|---|---|
| Recovery team config | ✓ | ✓ | ✓ |
| Contact picker | ✓ | ✓ | ✓ |
| Delay configuration | ✓ | ✓ | ✓ |
| Set up / rotate | ✓ | ✓ | ✓ |
| Recovery request dashboard | ✓ | ✓ | ✓ |
| Approve recovery | ✓ | ✓ | ✓ |
| Urgent recovery | ✓ | ✓ | ✓ |
| Account recovery initiation | ✓ | ✓ | ✓ |
| Signal verification | ✓ | ✓ | ✓ |
| Recovery completion | ✓ | ✓ | ✓ |
| Share liveness check | ✓ | ✓ | ✓ |

No desktop-only features. Mobile users with appropriate permissions can perform every recovery operation from the field.

## i18n

New namespace `recoveryGroup.*` across all 13 locales (~55 keys). All via `packages/i18n` + codegen to iOS `.strings` and Android `strings.xml`.

**Admin configuration:**
- `recoveryGroup.title` → "Recovery Team"
- `recoveryGroup.description` → "Set up a recovery team so users can recover their accounts if they lose access to their devices. Recovery contacts hold approval keys; a minimum number of approvals is required."
- `recoveryGroup.requiredApprovals` → "Required approvals"
- `recoveryGroup.totalContacts` → "Total recovery contacts"
- `recoveryGroup.setup` → "Set up recovery team"
- `recoveryGroup.settingUp` → "Setting up…"
- `recoveryGroup.setupSuccess` → "Recovery team set up successfully."
- `recoveryGroup.rotate` → "Rotate recovery team"
- `recoveryGroup.rotating` → "Rotating…"
- `recoveryGroup.rotateSuccess` → "Recovery team rotated successfully."
- `recoveryGroup.contacts` → "Recovery contacts"
- `recoveryGroup.noTeam` → "No recovery team configured"
- `recoveryGroup.lastRotated` → "Last rotated"
- `recoveryGroup.contactHealth` → "Contact status"
- `recoveryGroup.deviceVerified` → "Device verified"
- `recoveryGroup.deviceUnverified` → "Device not verified"
- `recoveryGroup.livenessOk` → "Share verified"
- `recoveryGroup.livenessStale` → "Share verification overdue"
- `recoveryGroup.delayConfig` → "Recovery waiting period (hours)"
- `recoveryGroup.emergencyFloorConfig` → "Minimum urgent recovery period (hours)"
- `recoveryGroup.geoWarning` → "Consider distributing recovery contacts across different regions for better security"

**Recovery request dashboard:**
- `recoveryGroup.requests.title` → "Account Recovery Requests"
- `recoveryGroup.requests.active` → "Active requests"
- `recoveryGroup.requests.history` → "Request history"
- `recoveryGroup.requests.status.pending` → "Awaiting verification"
- `recoveryGroup.requests.status.verified` → "Verified — waiting for approvals"
- `recoveryGroup.requests.status.active` → "Approved — waiting period"
- `recoveryGroup.requests.status.completed` → "Completed"
- `recoveryGroup.requests.status.expired` → "Expired"
- `recoveryGroup.requests.status.cancelled` → "Cancelled"
- `recoveryGroup.requests.approve` → "Approve recovery"
- `recoveryGroup.requests.approving` → "Approving…"
- `recoveryGroup.requests.approvalProgress` → "{{count}} of {{required}} approvals"
- `recoveryGroup.requests.timeRemaining` → "Time remaining"
- `recoveryGroup.requests.cancel` → "Cancel request"
- `recoveryGroup.requests.cancelConfirm` → "Are you sure? This will stop the recovery process."
- `recoveryGroup.requests.duressAlert` → "Warning: a potential coercion alert has been detected. Verify this request through a separate channel before proceeding."

**Urgent recovery:**
- `recoveryGroup.urgent.title` → "Urgent recovery"
- `recoveryGroup.urgent.enable` → "Enable urgent recovery"
- `recoveryGroup.urgent.description` → "Reduces the waiting period. Requires a second approver and a written reason."
- `recoveryGroup.urgent.justification` → "Reason for urgency"
- `recoveryGroup.urgent.justificationPlaceholder` → "Explain why this recovery is urgent (min 16 characters)"
- `recoveryGroup.urgent.secondApprover` → "Second approver"
- `recoveryGroup.urgent.selectApprover` → "Select a second approver"
- `recoveryGroup.urgent.reducedDelay` → "Waiting period reduced to {{hours}} hours"

**User-facing recovery:**
- `recoveryGroup.initiate.title` → "Account recovery"
- `recoveryGroup.initiate.description` → "Lost access to your device? Your recovery contacts can help you regain access to your account."
- `recoveryGroup.initiate.identifier` → "Your email or phone number"
- `recoveryGroup.initiate.selectHub` → "Select your organization"
- `recoveryGroup.initiate.submit` → "Start recovery"
- `recoveryGroup.initiate.submitting` → "Starting…"
- `recoveryGroup.initiate.signalVerification` → "Enter the verification code sent to your Signal"
- `recoveryGroup.initiate.verificationCode` → "Verification code"
- `recoveryGroup.initiate.verify` → "Verify"
- `recoveryGroup.initiate.waiting` → "Waiting for your recovery contacts to approve"
- `recoveryGroup.initiate.approvalsReceived` → "{{count}} of {{required}} approvals received"
- `recoveryGroup.initiate.delayCountdown` → "Access will be restored in {{time}}"
- `recoveryGroup.initiate.complete` → "Account recovered"
- `recoveryGroup.initiate.setPin` → "Set a PIN to protect your new device"
- `recoveryGroup.initiate.success` → "You're all set. Your account has been recovered."

**User security settings:**
- `recoveryGroup.status.enrolled` → "Your account is recoverable in {{hubName}}"
- `recoveryGroup.status.notConfigured` → "No recovery team configured for this organization"

**Errors:**
- `recoveryGroup.error.thresholdExceedsTotal` → "Required approvals cannot exceed total contacts"
- `recoveryGroup.error.rateLimited` → "Too many requests. Please wait a few minutes."
- `recoveryGroup.error.sessionExpired` → "This recovery request has expired"
- `recoveryGroup.error.commitmentFailed` → "Recovery data verification failed — contact your administrator"
- `recoveryGroup.error.alreadyApproved` → "You have already approved this request"
- `recoveryGroup.error.notContact` → "You are not a recovery contact for this organization"
- `recoveryGroup.error.signalVerificationFailed` → "Verification code is incorrect"
- `recoveryGroup.error.signalVerificationExpired` → "Verification code has expired. Please start over."
- `recoveryGroup.error.sigchainMismatch` → "Recovery team configuration could not be verified. Contact your administrator."

## Test Strategy

### Rust Unit Tests (`packages/crypto/`)

- Shamir split/combine round-trip for all valid (K,N) combinations: (2,3), (2,4), (2,5), (3,3), (3,4), (3,5), (4,4), (4,5), (5,5)
- Below-threshold shares produce wrong output (information-theoretic security)
- Commitment generation and verification round-trip
- Tampered share fails commitment check
- Invalid parameters rejected: threshold > total, threshold < 2, total > 5, total < 3
- Empty/oversized secrets handled gracefully
- X25519 recovery group keypair generation
- HPKE wrapping/unwrapping with recovery-specific labels (`LABEL_RECOVERY_GROUP_SHARE_WRAP`, `LABEL_RECOVERY_PUK_SEED_WRAP`, `LABEL_RECOVERY_SHARE_CONTRIBUTE`)
- Wrong label fails decryption (Albrecht defense)
- AAD binding prevents cross-session replay

### Backend BDD (`bun run test:backend:bdd`)

- Recovery group enrollment: valid config accepted, threshold > total rejected
- Enrollment: envelope count must match totalShares
- Enrollment: sigchain link hash verified
- Session lifecycle: initiate → verify → contribute → active → (delay) → complete / expire / cancel
- Signal verification: correct code advances session, wrong code rejected, 5 attempts max
- Rate limiting: 11th request within 5 min returns 429
- Duplicate contribution: same pubkey twice returns error
- Anti-enumeration: initiate for nonexistent user returns same response shape and timing
- Cancellation: by recovering user's other device, by user with `recovery:manage`
- Permission enforcement: each endpoint gated by correct permission
- Session expiry: sessions past configured delay with insufficient contributions auto-expire
- Configurable delay: verify hub-specific delay settings are respected
- Share liveness: proof accepted, stale shares flagged
- Contribution release: HPKE ciphertext only released after delay elapsed

### Desktop Playwright

- Admin: configure recovery team (set threshold/contacts, delays, enroll)
- Admin: view recovery request dashboard, approve request
- Admin: urgent recovery flow with second approver
- Admin: cancel fraudulent request
- Admin: rotate recovery team
- Admin: view share liveness status
- User: account recovery initiation from login screen
- User: Signal verification step
- User: recovery completion + PIN setup
- User: view recovery enrollment status in security settings

### Mobile (XCUITest + Android Compose UI tests)

- Same flows as desktop — full parity
- Admin: recovery team configuration from mobile
- Admin: approve recovery from mobile device
- User: account recovery on fresh install + Signal verification

### Adversarial / Security Tests

- Commitment mismatch rejection (tampered share)
- Duress share detection (if implemented — produces wrong secret, triggers alert)
- Session expiry after configured delay with incomplete approvals
- Urgent recovery without valid second approver signature rejected
- Rate limit enforcement on unauthenticated endpoint
- Signal verification brute-force protection (5 attempts max)
- Anti-enumeration: response timing constant regardless of user existence
- Below-threshold combination produces incorrect secret (verified by commitment failure)
- Cross-hub isolation: recovery in Hub A does not affect Hub B
- Replay attack: contribution from session A rejected in session B (AAD binding)
- Sigchain verification: user rejects enrollment if recovery group pubkey not in sigchain
- Server key substitution: mismatched sigchain → enrollment refused

## Scope Breakdown (Implementation Phases)

### Phase 1: Crypto Foundation
- Implement `shamir.rs` in `packages/crypto/`
- Add recovery group crypto labels to `crypto-labels.json` + codegen
- Add X25519 recovery group keypair generation
- Expose Shamir + recovery functions via UniFFI (mobile) and native (desktop)
- Rust unit tests for all Shamir operations

### Phase 2: Protocol Schemas + DB Schema
- Create `recovery-group.ts` Zod schemas in `packages/protocol/schemas/`
- Register in schema registry
- Create 5 Drizzle tables in `apps/worker/db/schema/`
- Generate and apply migrations
- Run codegen for TS/Swift/Kotlin types

### Phase 3: Backend Service + API Routes
- Implement `RecoveryGroupService` in `apps/worker/services/`
- Implement 8 API endpoints in `apps/worker/routes/recovery-group.ts`
- Signal verification integration via `signal-notifier` sidecar
- Per-IP rate limiting on `/initiate`
- Backend BDD tests

### Phase 4: Desktop UI
- Recovery team configuration section (admin sidebar)
- Recovery request dashboard (admin sidebar)
- Approve recovery flow (share decryption + HPKE-seal to new device + sign)
- Urgent recovery flow with second approver
- Account recovery initiation from login screen + Signal verification step
- Recovery completion + PIN setup
- Share liveness UI
- Playwright E2E tests

### Phase 5: Mobile UI — iOS
- SwiftUI views for all admin recovery flows (full parity)
- SwiftUI views for user account recovery + Signal verification
- XCUITest tests

### Phase 6: Mobile UI — Android
- Compose views for all admin recovery flows (full parity)
- Compose views for user account recovery + Signal verification
- Compose UI tests

### Phase 7: i18n
- Add `recoveryGroup.*` keys to all 13 locale files
- Run `bun run i18n:codegen` + validators
- Can be parallelized with Phases 4-6

## Relationship to Other Epics

- **EP01** (Permission System): Provides admin shell, nav, permission infrastructure. Recovery permissions added to permission catalog.
- **EP02** (Device Management): Provides sigchain for device authorization. Recovery completion creates a special sigchain link type (`recovery` action) — EP02 must define this link type in the sigchain spec. Device verification status shown in share holder picker. Recovery group enrollment/rotation also creates sigchain links (`recovery-group-enroll`, `recovery-group-rotate`).
- **EP03** (Teams & Tags): No direct dependency. Share holders may overlap with team leads but are tracked independently by pubkey.
- **EP08** (Platform Ops & Compliance): GDPR erasure must cascade to recovery data — delete user recovery envelopes and session records. Recovery events logged to hash-chained audit log.
- **PIN Lockout Hardening** (orthogonal plan): Complementary — recovery group is the social recovery path after PIN lockout leads to key wipe (10 failed attempts). Independent but mutually aware.
- **Signal Notifier Sidecar**: Recovery initiation depends on `signal-notifier` for verification codes. The sidecar's zero-knowledge HMAC-hashed contact resolution is used for user lookup during initiation.

## Open Questions (Resolved)

1. **Shamir implementation language?** → Rust-native in `packages/crypto/` (D1)
2. **Recovery group key type?** → X25519 (D5)
3. **Recovery scope?** → Per-hub (D2)
4. **Ceremony protocol?** → Direct HPKE share transport, not MLS (D3) — research found no production platform uses MLS for recovery; HPKE is simpler and sufficient
5. **Recovery target?** → PUK seed per-hub (D4)
6. **Share transport?** → HPKE direct to new device pubkey, server relays ciphertext (D6)
7. **Initiation authentication?** → Signal verification via `signal-notifier` sidecar (D7)
8. **Recovery group key trust?** → Sigchain-anchored pubkey (D9)
9. **Coercion defense?** → Duress shares + time delay + geographic distribution + canary check-ins (D10)
10. **Delay configuration?** → Hub-configurable, default 24h standard / 4h emergency floor (D11)
11. **Group rotation safety?** → Atomic DB transaction (D13)
12. **Share freshness?** → Periodic liveness verification (D14)
