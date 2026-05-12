---
epic: EP09
title: Recovery Group & Key Escrow
status: stub
depends-on: [EP01, EP02]
phase: 5
---

# EP09: Recovery Group & Key Escrow

**Date:** 2026-05-11
**Status:** Stub (awaiting detailed planning)
**Depends on:** EP01 (admin shell + nav), EP02 (device management + sigchain infrastructure)

## Scope

Port v1's social recovery / key escrow system to v2 and adapt it to the v2 crypto architecture (HPKE instead of secp256k1 ECIES, per-device Ed25519/X25519 keys, sigchain-based device authorization, PUK with CLKR). This epic covers the full lifecycle: admin configuration of recovery groups, user enrollment, recovery ceremony coordination (24h delay + threshold enforcement), emergency override, and share rotation.

## What Exists in v2

### Crypto Foundation (Complete)

- `packages/crypto/` has HPKE (X25519-HKDF-SHA256-AES256-GCM), Ed25519/X25519 device keys, HKDF, PUK with CLKR, sigchains, provisioning
- `packages/protocol/crypto-labels.json` has `RECOVERY_SALT` label but lacks recovery group HPKE wrapping labels (v1 had `LABEL_MASTER_RECOVERY_GROUP_WRAP`, `LABEL_PUK_RECOVERY_GROUP_WRAP`)
- No Shamir secret sharing in `packages/crypto/` (v1 used `shamir-secret-sharing` JS library from privy-io)
- PIN lockout hardening plan exists at `docs/superpowers/plans/2026-05-11-pin-lockout-hardening.md` -- related but orthogonal (covers brute-force protection, not social recovery)

### Admin Infrastructure (EP01 Provides)

- Admin sidebar nav config has `recovery-group` item under General group (permission: `settings:read`)
- No `recovery-group-section.tsx` stub file exists yet in v2 admin-sections (CLAUDE.md references it but it has not been created)

### Backend (Nothing)

- No recovery group DB schema in v2
- No recovery group API routes
- No recovery group service

### i18n

- No `recoveryGroup` i18n keys in v2's `packages/i18n/locales/en.json` (need to be added across all 13 locales)
- Generic `recovery.*` keys exist (for recovery key download flow) but are unrelated to admin recovery groups

## What v1 Has (Port Source)

### DB Schema (`src/server/db/schema/recovery.ts`)

Five tables forming the complete recovery lifecycle:

1. **`hub_recovery_groups`** -- One row per hub. Stores group public key, Shamir threshold (2-5), total shares (3-5), SHA-256 share commitments (JSONB array), creation/rotation timestamps. CHECK constraint: `threshold <= totalShares`.
2. **`hub_recovery_group_shares`** -- Per-admin HPKE-wrapped Shamir share. Composite PK `(hubId, adminPubkey)`. FK cascade on group deletion.
3. **`user_recovery_envelopes`** -- Per-(user, hub) envelope wrapping the user's root KEK under the recovery group public key. Composite PK `(userPubkey, hubId)`. Upsert on re-enrollment.
4. **`recovery_sessions`** -- Transient ceremony state. Tracks status (`pending` -> `ready` -> `completed`/`expired`/`cancelled`), admin contributions (JSONB array of `{byAdminPubkey, encryptedShare}`), 24h expiry, optional emergency override (justification + co-approver signature).
5. **`recovery_requests` + `recovery_participants`** -- Admin-initiated recovery request tracking with Shamir threshold enforcement. Composite PK on participants prevents duplicate contributions from same admin. FK cascade on request deletion.

### Zod Schemas (`src/shared/schemas/recovery-group.ts`)

Full request/response schemas for all 7 API endpoints:
- `RecoveryGroupEnrollSchema` (threshold 2-5, totalShares 3-5, shareEnvelopes, shareCommitments)
- `RecoveryGroupInfoSchema` (read-only group config)
- `RecoveryInitiateSchema` (unauthenticated, requires `userIdentifier` + `newDevicePubkey`)
- `RecoveryContributeShareSchema` (admin contributes encrypted share to session)
- `RecoveryCompleteSchema` (requires `newBundle` with 2+ factor envelopes, optional emergency override)
- `RecoverySessionStatusSchema` (includes `delayRemainingMs`)
- `UserRecoveryEnvelopeSchema` (per-hub envelope storage)

### API Routes (`src/server/routes/recovery-group.ts`)

Seven OpenAPIHono endpoints under `/api/auth/recovery-group/*`:
- `POST /enroll` -- admin enrolls N-of-M Shamir group (auth required)
- `GET /:hubId` -- get group config (auth + JWT required)
- `POST /initiate` -- user starts recovery (no auth, per-IP rate limited: 10 req/5min)
- `POST /contribute-share` -- admin contributes Shamir share (auth required)
- `GET /session/:id` -- session status (auth + JWT required)
- `POST /complete` -- complete recovery after 24h delay or emergency override (no auth)
- `POST /user-envelope` -- user stores recovery envelope (auth required)

Rate limiting: In-memory sliding window per IP for `/initiate`, bounded at 10k entries with LRU eviction.

### Service Layer (`src/server/services/recovery-group-service.ts`)

`RecoveryGroupService` class with methods: `enrollHub`, `getGroup`, `getSharesForAdmin`, `initiateRecovery`, `getSession`, `contributeShare`, `completeRecovery`, `rotateGroup`, `putUserRecoveryEnvelope`, `getUserRecoveryEnvelope`.

Key business rules:
- 24h delay between session creation and completion (`RECOVERY_DELAY_MS`)
- Emergency override reduces delay to 1h floor (`EMERGENCY_OVERRIDE_MIN_MS`), requires co-approver signature + justification
- Duplicate admin contribution detection (same admin cannot contribute twice)
- Session transitions to `ready` when contribution count >= threshold
- Group rotation deletes old shares, updates group key + commitments

### Client-Side Crypto (`src/client/lib/recovery-group-share.ts`)

Shamir splitting/combining via `shamir-secret-sharing` (privy-io, GF(2^8), Cure53/Zellic audited):
- `splitRecoveryGroupSecret(secret, total, threshold)` -> branded `ShamirShare[]`
- `combineAndVerifyShares(verifiedShares)` -> secret (requires `VerifiedShare` branded type)
- `verifyAndBrandShare(share, commitment)` -> `VerifiedShare` (SHA-256 commitment check)
- `commitShare(share)` -> hex commitment
- `generateRecoveryGroupKeyPair()` -> secp256k1 keypair (v1; **must change to X25519 for v2**)

### Tier 3 HPKE Wrapping (`src/client/lib/recovery-group-tier3.ts`)

Dual-wraps master seed + PUK seed under recovery group public key with domain-separated AAD:
- `wrapSecretsForRecoveryGroup()` -- HPKE-seal both seeds with `LABEL_MASTER_RECOVERY_GROUP_WRAP` / `LABEL_PUK_RECOVERY_GROUP_WRAP`
- `unwrapSecretsFromRecoveryGroup()` -- HPKE-open with reconstructed group private key

### Admin UI (`src/client/components/admin-sections/recovery-group-section.tsx`)

Threshold/total configuration form (threshold 2-5, total 3-5), enrollment button, error/success states. v1 uses hex-encoded placeholder envelopes; v2 must use real HPKE wrapping per admin pubkey.

### User-Facing Recovery (`src/client/components/user-sections/recovery-rotate-section.tsx`)

Recovery key rotation: PIN verification -> re-wrap KEK with new recovery key -> display key as code block + download as .txt.

## What's Missing from v2

### Phase 1: Crypto Foundation

1. **Shamir secret sharing in `packages/crypto/`** -- Either port `shamir-secret-sharing` JS library calls to Rust, or keep JS library and expose via WASM/UniFFI. Decision needed: Rust-native Shamir (auditable, single crate) vs. JS library (already audited, faster to ship). Recommendation: Rust-native for consistency with crypto-in-Rust philosophy.
2. **Recovery group crypto labels** -- Add `LABEL_RECOVERY_GROUP_KEY_WRAP`, `LABEL_MASTER_RECOVERY_GROUP_WRAP`, `LABEL_PUK_RECOVERY_GROUP_WRAP` (and any others) to `packages/protocol/crypto-labels.json` + codegen.
3. **X25519 recovery group keypair** -- v1 used secp256k1; v2 must use X25519 to match HPKE. `generateRecoveryGroupKeyPair()` must produce X25519 keys.
4. **Share commitment verification** -- SHA-256 commitment scheme (port from v1, straightforward).

### Phase 2: DB Schema

5. **Recovery group tables** -- Port all 5 tables from v1's `recovery.ts` to v2's Drizzle schema (`apps/worker/db/schema/`). Adapt column names if v2 conventions differ (e.g., v2 uses `userId` not `userPubkey` if user model changed).
6. **Drizzle migrations** -- Generate and apply migrations for the 5 new tables.

### Phase 3: Backend API

7. **Zod schemas in `packages/protocol/schemas/`** -- Port v1's `recovery-group.ts` schemas to v2's protocol package. Register in schema registry.
8. **Recovery group service** -- Port `RecoveryGroupService` to `apps/worker/services/`. Adapt to v2's DB patterns and auth model.
9. **Recovery group API routes** -- Port 7 endpoints to `apps/worker/routes/`. Use v2's OpenAPIHono patterns, middleware, and permission model.
10. **Per-IP rate limiting for `/initiate`** -- Port in-memory sliding window rate limiter.

### Phase 4: Admin UI (Desktop)

11. **`recovery-group-section.tsx`** -- Admin section component for threshold configuration, share distribution, group status display. Must use v2's section layout patterns and admin settings infrastructure from EP01.
12. **Share distribution UI** -- Show which admins hold shares, re-enrollment flow, rotation trigger.
13. **Recovery ceremony dashboard** -- Active sessions, contribution status, approve/deny.
14. **i18n keys** -- Add `recoveryGroup.*` keys to all 13 locales in `packages/i18n/locales/`.

### Phase 5: User-Facing Recovery

15. **User recovery enrollment** -- Auto-wrap user's root KEK under recovery group public key on first login to a hub with an active recovery group.
16. **Recovery initiation flow** -- User-facing "I lost my device" flow that creates a recovery session.
17. **Recovery completion UI** -- After 24h delay + threshold met, user provisions new device with recovered keys.

### Phase 6: Emergency Override

18. **Emergency override path** -- Co-approver signature verification, 1h reduced delay, justification logging.
19. **Audit log entries** -- Recovery events in the hash-chained audit log (Epic 77).

### Phase 7: Mobile Recovery Views

20. **iOS recovery views** -- SwiftUI views for recovery initiation, status polling, completion.
21. **Android recovery views** -- Compose views for the same flows.
22. **Mobile Shamir** -- If Shamir stays in Rust, mobile gets it via UniFFI/JNI. If JS, need mobile-specific handling.

## Key Design Decisions (To Be Made)

1. **Shamir implementation language**: Rust (single crate, auditable, UniFFI for mobile) vs. JS (`shamir-secret-sharing` library, already audited, WASM for mobile). Recommendation: Rust-native.
2. **Recovery group key type**: X25519 (matches HPKE, v2 standard) -- this is decided, not secp256k1.
3. **Share wrapping**: HPKE per-admin pubkey (v1 used placeholder hex; v2 must do real HPKE wrapping with `LABEL_RECOVERY_GROUP_KEY_WRAP`).
4. **Recovery bundle requirements**: v1's `RecoveryCompleteSchema` requires `newBundle` with 2+ factor envelopes. Validate this still makes sense with v2's key management (PIN + recovery key minimum).
5. **Emergency override verification**: v1 stores co-approver signature as opaque string. v2 should verify the Ed25519 signature server-side against the co-approver's sigchain-authorized device key.
6. **Relationship to PIN lockout hardening**: The pin lockout plan is orthogonal but complementary. Recovery group provides social recovery when PIN lockout leads to key wipe (10 failed attempts). The plans should be aware of each other but are independently implementable.

## Security Constraints

- Recovery group private key is NEVER stored -- only reconstructed transiently from Shamir shares during a ceremony.
- Shares are HPKE-wrapped per admin pubkey -- the server stores ciphertext, never plaintext shares.
- 24h mandatory delay between session creation and completion (1h floor with emergency override + co-approver).
- SHA-256 share commitments for tamper detection -- server stores commitments at enrollment; each admin verifies their share against the commitment before contributing.
- Duplicate contribution prevention at DB level (composite PK on `recovery_participants`).
- Rate limiting on unauthenticated `/initiate` endpoint (10 req/5min per IP).
- All HPKE operations use domain-separated labels from `crypto-labels.json` (Albrecht defense).

## Test Strategy

- **Rust unit tests**: Shamir split/combine correctness, commitment verification, edge cases (threshold = total, minimum threshold).
- **Backend BDD**: Recovery group enrollment, session lifecycle, threshold enforcement, 24h delay, emergency override, rate limiting, duplicate contribution rejection.
- **Desktop Playwright**: Admin recovery group configuration, enrollment flow, ceremony dashboard.
- **Integration**: Full ceremony end-to-end -- enroll group, user enrolls, user initiates recovery, admins contribute shares, delay elapses, user completes recovery with new device.
- **Adversarial tests**: Insufficient shares produce wrong secret (information-theoretic), commitment mismatch rejection, replay attacks on shares, emergency override without valid co-approver signature.

## Relationship to Other Epics

- **EP01** (Admin Sidebar Port): Provides the admin shell, nav infrastructure, and `settings:read` permission that gates the recovery group section.
- **EP02** (Device Management): Provides sigchain infrastructure for device authorization. Recovery completion must create a valid sigchain entry for the new device.
- **EP03** (Volunteer Management): Volunteers may be enrolled in recovery (their KEK wrapped under group key). No direct dependency but recovery group membership may overlap with volunteer admin roles.
- **PIN Lockout Hardening**: Complementary -- recovery group is the social recovery path after PIN lockout leads to key wipe.
- **Epic 77** (Audit Log): Recovery events should be logged in the hash-chained audit trail.
