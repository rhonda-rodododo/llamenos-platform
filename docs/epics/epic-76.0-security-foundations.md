# Epic 76.0: Pre-Implementation Security Foundations

## Problem Statement

A comprehensive security audit of the Llamenos cryptographic architecture found several foundational issues that must be resolved before any Epic 76+ implementation begins. These range from domain separation label inconsistencies between code and protocol documentation, to a circular authentication vulnerability in the device provisioning protocol, to missing emergency key revocation procedures and threat model gaps.

**Clean Rewrite Context:** Llamenos is pre-production with no deployed users. All fixes are clean implementations — no migration code, no backwards compatibility concerns.

**Audit Finding Summary:**

| Issue | Severity | Category |
|-------|----------|----------|
| Domain separation labels out of sync (spec vs code) | High | Cryptographic correctness |
| Provisioning channel circular authentication | Critical | Key management |
| No emergency key revocation procedures | High | Operational security |
| Threat model gaps (APNs/FCM, CF trust, adminPubkey fetch) | Medium | Documentation |
| Backup file identifies user as Llamenos volunteer | Medium | Privacy |

## Goals

1. Establish an authoritative domain separation label table and enforce consistency between code and protocol documentation
2. Fix the circular authentication vulnerability in the device provisioning protocol
3. Document emergency key revocation and rotation procedures
4. Close all identified threat model gaps with honest assessments
5. Remove identifying information from recovery backup files

## Technical Design

### 1. Domain Separation Label Audit

**Problem:** `encryptForPublicKey()` uses `"llamenos:transcription"` as the HKDF domain label for BOTH transcriptions AND messages. The protocol spec (`docs/protocol/llamenos-protocol.md`) says `"llamenos:transcription"` for note key wrapping, but the code uses `"llamenos:note-key"`. Spec and code are out of sync.

HKDF domain separation labels prevent cross-context key reuse — if two different encryption contexts share a label, a ciphertext from one context could be valid in the other. Each cryptographic operation must have a unique, fixed label.

**Authoritative Domain Separation Label Table:**

| Label | Purpose | Used By | Context |
|-------|---------|---------|---------|
| `"llamenos:note-key"` | ECIES wrapping of per-note symmetric key | `crypto.ts` (client + worker) | Note encryption (V2 forward secrecy) |
| `"llamenos:message"` | ECIES wrapping of per-message symmetric key | `crypto.ts` (client + worker) | E2EE messaging storage (Epic 74) |
| `"llamenos:transcription"` | Transcription key wrapping (server-side) | `crypto.ts` (worker) | Server-side transcription encryption |
| `"llamenos:file-key"` | Per-file attachment encryption key | `crypto.ts` (client) | Encrypted file uploads (reporter role) |
| `"llamenos:file-metadata"` | File metadata ECIES wrapping | `crypto.ts` (client) | File metadata encryption |
| `"llamenos:hub-event"` | HKDF derivation from hub key for per-event encryption | Nostr encryption layer | Hub-wide broadcast event content (Epic 76) |
| `"llamenos:hub-key-wrap"` | ECIES wrapping of hub key for member distribution | Hub key manager | Hub key distribution to volunteers/admins (Epic 76.2) |
| `"llamenos:backup"` | Recovery backup encryption key derivation | `key-manager.ts` (client) | PIN-encrypted key backup |

**Code is authoritative.** Where spec and code disagree, update the spec to match the code. Code has been tested and deployed; spec is documentation.

**Implementation:**

1. Audit `src/client/lib/crypto.ts` — catalog every HKDF `info` parameter
2. Audit `src/worker/lib/crypto.ts` — catalog every HKDF `info` parameter
3. Cross-reference against the table above; fix any mismatches
4. Update `docs/protocol/llamenos-protocol.md` Section 5 (Encryption) to match
5. Add a `src/shared/crypto-labels.ts` constants file:
   ```typescript
   export const DOMAIN_LABELS = {
     NOTE_KEY: 'llamenos:note-key',
     MESSAGE: 'llamenos:message',
     TRANSCRIPTION: 'llamenos:transcription',
     FILE_KEY: 'llamenos:file-key',
     FILE_METADATA: 'llamenos:file-metadata',
     HUB_EVENT: 'llamenos:hub-event',
     HUB_KEY_WRAP: 'llamenos:hub-key-wrap',
     BACKUP: 'llamenos:backup',
   } as const;
   ```
6. Refactor all callsites to import from `@shared/crypto-labels` instead of hardcoding strings

**E2E Validation Test:**

Add a Playwright test that:
- Reads the protocol doc's label table (parse markdown)
- Reads the `DOMAIN_LABELS` constants from the codebase
- Asserts they match
- This prevents future drift between spec and implementation

### 2. Provisioning Channel Authentication Fix

**Problem:** The device-linking protocol has circular authentication. When provisioning a new device:

1. Both devices perform ECDH to establish a shared secret
2. The primary device sends the nsec encrypted with the shared secret
3. The new device verifies the nsec by deriving the pubkey and comparing it to... the pubkey sent alongside the nsec in the same message

An attacker controlling the provisioning WebSocket (server compromise, MITM on the provisioning room) can inject their own keypair. The new device would accept it because the verification is self-referential — there is no external trust anchor.

**Solution: Short Authentication String (SAS) Verification**

After the ECDH key exchange completes, both devices derive a Short Authentication String from the shared secret:

```typescript
// Both devices compute independently:
const sasBytes = hkdf(sha256, sharedSecret, 'llamenos:sas', 'llamenos:provisioning-sas', 4);
const sasCode = numberToSixDigitString(bytesToNumber(sasBytes) % 1000000);
// Display: "123 456" (space-separated for readability)
```

**Protocol flow (updated):**

```
Step 1:  Both devices connect to ephemeral provisioning room
Step 2:  ECDH key exchange (existing)
Step 3:  Both devices display 6-digit SAS code
Step 4:  Volunteer verbally confirms codes match across devices
Step 5:  User taps "Codes Match" on new device
Step 6:  Primary device sends encrypted nsec (existing)
Step 7:  New device receives and stores nsec
```

If the codes don't match, an attacker is present — abort immediately.

**Alternative approach (complementary):** Pre-share the volunteer's pubkey to the new device. After initial WebAuthn authentication on the new device, fetch the volunteer's registered pubkey from the server (`GET /api/auth/me`). Then in step 7, verify `derivedPubkey === expectedPubkey` where `expectedPubkey` came from the server, not from the provisioning channel. This doesn't replace SAS (server could be compromised) but adds defense in depth.

**Files to modify:**
- `src/client/lib/provisioning.ts` — add SAS computation and display
- `src/client/components/DeviceLinking.tsx` — add SAS confirmation UI
- `docs/protocol/llamenos-protocol.md` Section 10 — update protocol steps

### 3. Emergency Key Revocation Procedures

**Problem:** No documented procedure exists for what happens when:
- An admin's nsec is compromised
- A volunteer departs (friendly or hostile)
- A device is seized
- The hub key needs rotation

**Required Deliverables:**

#### 3a. Admin Key Compromise Response

Runbook for admin key compromise:

1. **Immediate** (within 1 hour):
   - Generate new admin keypair (`bun run bootstrap-admin`)
   - Update `ADMIN_PUBKEY` in deployment config
   - Redeploy application
   - All active sessions invalidated (server restart)

2. **Short-term** (within 24 hours):
   - Rotate hub key (see 3d below)
   - Re-wrap all note admin envelopes with new admin pubkey
   - Re-wrap all message admin envelopes with new admin pubkey
   - Audit log review: check for anomalous access patterns

3. **Assessment**:
   - Determine what data was accessible (all admin-encrypted envelopes)
   - Notify affected parties per GDPR obligations
   - Determine if compromised admin had hub key (can decrypt all Nostr events)

**Maximum response timeframe:** Hub key rotation must begin within 4 hours of confirmed compromise.

#### 3b. Volunteer Key Revocation on Departure

1. Admin deactivates volunteer via UI (existing functionality)
2. All active sessions revoked (existing)
3. Hub key rotated immediately (new random key distributed to remaining members)
4. Volunteer's note envelopes remain (they can still decrypt their own historical notes if they retained their nsec — acceptable, as they authored those notes)
5. Volunteer can no longer decrypt new hub events (new hub key)
6. If hostile departure: assess what data volunteer had access to

#### 3c. Device Seizure Response

1. Volunteer triggers panic wipe on seized device (existing triple-Escape mechanism)
2. If wipe was not possible: admin deactivates volunteer and rotates hub key
3. PIN protection on local key store provides time buffer — attacker must crack PIN to access nsec
4. WebAuthn credentials on seized device: revoke via admin UI

#### 3d. Hub Key Rotation Ceremony

1. Admin generates new random 32-byte hub key (see Epic 76.2)
2. Admin wraps new hub key via ECIES for each remaining member's pubkey
3. Admin publishes key rotation event (encrypted with OLD hub key, containing NEW key reference)
4. Each member receives wrapped new key and stores it
5. Events published after rotation use new key version
6. Old key retained for decrypting historical events
7. Departed/revoked members do not receive new key

**Write to:** `docs/security/KEY_REVOCATION_RUNBOOK.md`

### 4. Threat Model Updates

**Problem:** Several gaps identified in `docs/security/THREAT_MODEL.md`.

#### 4a. APNs/FCM as Trusted Parties

Push notification delivery requires Apple (APNs) and Google (FCM) infrastructure. These services can observe:

- **Device tokens** — link a specific device to push activity
- **Push timing** — when calls/messages arrive (activity patterns)
- **Push metadata** — message size, priority level
- **Cannot observe** — encrypted payload content (if implemented per Epic 75)

**Mitigation:** Encrypted push payloads (Epic 75). Apple/Google see that "a notification was sent" but not its content. This is a necessary trust trade-off for mobile support.

**Residual risk:** Activity pattern analysis. A sophisticated adversary with access to APNs/FCM records could determine when the hotline is active.

#### 4b. Cloudflare Trust (Honest Assessment)

Nosflare (Nostr relay running on CF Workers) provides protection against a **database-only subpoena** — if only the DO storage is obtained, events are encrypted. However, Cloudflare itself can observe:

- WebSocket connections to the relay (IP, timing, duration)
- Request/response metadata in the Workers runtime
- DO storage contents at rest (CF holds the encryption keys for DO storage)
- Worker execution logs (if enabled — must be disabled)

**Nosflare does NOT protect against Cloudflare as an adversary.** It protects against:
- Database-only subpoena (encrypted blobs vs plaintext WebSocket messages)
- Rogue employee with limited DB access
- Third-party breach of CF storage (data at rest is encrypted)

**Required actions:**
- Remove ALL application-level logging from Nosflare config
- Disable CF Workers analytics and logging where possible
- Document this trust boundary honestly for operators
- Recommend self-hosted strfry for maximum privacy deployments

#### 4c. `adminPubkey` Fetch Trust

Client fetches admin pubkey from `/api/auth/me` (previously `/api/config`). A MITM at startup could substitute an attacker's pubkey, causing the client to encrypt notes/messages for the attacker.

**Current state:** After L-1 fix (Epic 67), adminPubkey is only returned to authenticated users via `/api/auth/me`. This reduces (but doesn't eliminate) the attack surface — an attacker must compromise the TLS connection to an authenticated session.

**Mitigations (defense in depth):**
1. **Pin adminPubkey in client build** — include expected admin pubkey hash in the built JS bundle. Client warns if server-returned pubkey doesn't match pinned value.
2. **Out-of-band verification** — admin pubkey displayed in admin settings; volunteers can verify via secure side channel.
3. **Certificate pinning** — pin the TLS certificate of the Llamenos server (Cloudflare or self-hosted).

**Recommendation:** Option 1 (build-time pinning) for production deployments. Accept the trade-off that admin key rotation requires a client rebuild.

#### 4d. Departed Volunteer Key Retirement

When a volunteer departs, they retain their nsec (we cannot force deletion from their devices). Implications:
- They can still decrypt notes they authored (they have author envelope keys)
- They CANNOT decrypt new hub events (hub key rotated)
- They CANNOT decrypt other volunteers' notes (never had those keys)
- They CAN prove they were a member (their pubkey was registered)

**Mitigation:** Hub key rotation on departure (Section 3b). Accept that historical access cannot be revoked for notes the volunteer authored.

#### 4e. SMS/WhatsApp Outbound Message Limitation

The server sees plaintext of outbound SMS/WhatsApp messages momentarily. This is an inherent provider requirement — Twilio/WhatsApp APIs accept plaintext, not ciphertext. The server:
1. Receives encrypted outbound message from volunteer client
2. Decrypts using admin key (server holds admin key for outbound routing)
3. Forwards plaintext to provider API
4. Discards plaintext from memory (never stored)

**This is NOT zero-knowledge for outbound messages.** Document this limitation explicitly. Signal channel (via self-hosted signal-cli bridge) can achieve true E2EE for outbound if the bridge handles decryption at final hop.

#### 4f. npm Supply Chain Risk

The application depends on npm packages including `@noble/curves`, `@noble/ciphers`, `@noble/hashes`, `nostr-tools`, and others. A compromised dependency could:
- Exfiltrate keys during build (malicious postinstall scripts)
- Exfiltrate keys at runtime (compromised crypto library)
- Introduce backdoors in encryption

**Current mitigations:**
- `bun audit` in CI (Epic 65, M-8)
- `bun.lockb` lockfile with frozen installs
- SRI hashes for cached assets (Epic 67, L-10)

**Additional mitigations (recommended):**
- Pin critical crypto dependencies to exact versions + SHA
- Review `@noble/*` releases manually before updating (audited library, single author)
- Consider vendoring `@noble/*` into the repository for airgapped verification
- Add `--ignore-scripts` to CI install step (already default in bun)

### 5. Backup File Privacy Fix

**Problem:** The recovery backup file contains plaintext pubkey and `"format": "llamenos-key-backup"` which identifies the user as a Llamenos volunteer. If a device is seized and the backup file discovered (e.g., in downloads folder), it immediately identifies the person as associated with the hotline — even before any decryption.

**Current backup format:**
```json
{
  "format": "llamenos-key-backup",
  "version": 1,
  "pubkey": "abc123...",
  "encryptedNsec": "...",
  "salt": "...",
  "createdAt": "2026-02-25T12:00:00Z"
}
```

**New backup format:**
```json
{
  "v": 1,
  "id": "a1b2c3",
  "d": "...",
  "s": "...",
  "t": 1740000000
}
```

Changes:
1. **Remove `"format"` field** — replace with no identifying marker. The client recognizes the format by the presence of the `"v"`, `"d"`, `"s"` fields.
2. **Replace `"pubkey"` with truncated hash** — `"id"` contains first 6 hex chars of SHA-256(pubkey). Enough for the user to identify which backup is which, not enough to identify the pubkey.
3. **Use short field names** — `"d"` (data/encrypted nsec), `"s"` (salt), `"t"` (timestamp), `"v"` (version). Generic enough to not identify the application.
4. **Reduce timestamp precision** — round to nearest hour (remove minutes/seconds). Reduces timing correlation.
5. **Generic file extension** — save as `.json` or `.dat`, not `.llamenos-backup` or similar.

**Files to modify:**
- `src/client/lib/key-manager.ts` — update export/import functions
- `src/client/components/BackupCard.tsx` — update backup UI if it shows format details

## Implementation Phases

### Phase 1: Domain Separation Label Audit (0.5 weeks)

**Tasks:**
1. Create `src/shared/crypto-labels.ts` with authoritative label constants
2. Audit and refactor `src/client/lib/crypto.ts` to use shared labels
3. Audit and refactor `src/worker/lib/crypto.ts` to use shared labels
4. Update `docs/protocol/llamenos-protocol.md` to match code
5. Add E2E cross-validation test

**Deliverables:**
- All domain labels defined in one authoritative location
- Protocol doc matches code
- Automated test prevents future drift

### Phase 2: Provisioning Channel Authentication (0.5 weeks)

**Tasks:**
1. Implement SAS derivation in provisioning protocol
2. Add SAS display UI to both primary and new device provisioning screens
3. Add "Codes Match" / "Codes Don't Match" confirmation buttons
4. Add pre-share pubkey verification as defense-in-depth
5. Update protocol documentation Section 10
6. Add E2E test for provisioning with SAS verification

**Deliverables:**
- Device provisioning requires verbal SAS confirmation
- Protocol doc updated
- E2E test covering the happy path and abort-on-mismatch

### Phase 3: Key Revocation Procedures (0.5 weeks)

**Tasks:**
1. Write `docs/security/KEY_REVOCATION_RUNBOOK.md`
2. Document admin key compromise response procedure
3. Document volunteer departure procedure
4. Document device seizure response
5. Design hub key rotation ceremony (details in Epic 76.2)
6. Define maximum response timeframes
7. Cross-reference from `docs/RUNBOOK.md`

**Deliverables:**
- Complete key revocation runbook
- Response timeframes defined
- Cross-referenced from existing operator runbook

### Phase 4: Threat Model Updates (0.5 weeks)

**Tasks:**
1. Add APNs/FCM trust analysis to `docs/security/THREAT_MODEL.md`
2. Add honest Cloudflare trust assessment
3. Add `adminPubkey` fetch trust analysis
4. Add departed volunteer key retirement section
5. Add SMS/WhatsApp outbound plaintext limitation
6. Add npm supply chain risk assessment
7. Review and update data classification document if needed

**Deliverables:**
- Comprehensive threat model covering all identified gaps
- Honest documentation of trade-offs and residual risks

### Phase 5: Backup File Privacy (0.5 weeks)

**Tasks:**
1. Design new generic backup format
2. Update `key-manager.ts` export function
3. Update `key-manager.ts` import function (support both old and new format for dev convenience, remove old format support before production)
4. Update any UI components that reference backup format
5. Add E2E test: export backup, verify no identifying strings in file content

**Deliverables:**
- Backup files contain no application-identifying information
- Pubkey replaced with truncated hash
- Timestamp precision reduced

## Dependencies

- **Blocks:** Epic 76, Epic 76.1, Epic 76.2, Epic 74, Epic 75, Epic 77, Epic 78, Epic 79
- **Blocked by:** None — this is the starting point for all zero-knowledge architecture work

## Success Criteria

1. **Cryptographic Correctness**
   - [ ] All HKDF domain labels defined in single authoritative source (`@shared/crypto-labels`)
   - [ ] Protocol doc matches code for all domain labels
   - [ ] Automated test validates spec-code consistency
   - [ ] No two encryption contexts share a domain label

2. **Provisioning Security**
   - [ ] Device provisioning displays SAS code on both devices
   - [ ] Provisioning aborts if user indicates codes don't match
   - [ ] Protocol doc Section 10 updated with SAS verification steps

3. **Operational Security**
   - [ ] Key revocation runbook exists and covers all scenarios
   - [ ] Maximum response timeframes defined
   - [ ] Hub key rotation ceremony designed (implementation in Epic 76.2)

4. **Threat Model Completeness**
   - [ ] All identified gaps addressed in threat model
   - [ ] Honest assessment of Cloudflare trust boundary
   - [ ] SMS/WhatsApp outbound limitation documented
   - [ ] npm supply chain risks documented

5. **Backup Privacy**
   - [ ] Backup file contains no application-identifying strings
   - [ ] Pubkey replaced with truncated hash
   - [ ] Timestamp precision reduced
   - [ ] E2E test validates backup file content

## Open Questions

1. **SAS code length**: 6 digits (1 in 1,000,000 chance of collision) vs 4 digits (1 in 10,000)? Recommendation: 6 digits — volunteers are making a security-critical verification, extra digits are worth the minor inconvenience.

2. **Admin pubkey pinning**: Should the pinned pubkey be a build-time constant or a runtime config? Build-time is more secure (harder to tamper) but requires rebuild on admin key rotation. Recommendation: Build-time for production, runtime for development.

3. **Backup format migration**: Should we support importing the old format indefinitely? Recommendation: Support old format import during development only. Remove before production — there are no deployed users to migrate.

4. **Vendor noble libraries**: Should we vendor `@noble/*` into the repo? Reduces supply chain risk but increases maintenance burden. Recommendation: Defer until closer to production deployment, then evaluate.

## Estimated Effort

Small-Medium — primarily documentation, refactoring, and protocol fixes. No new infrastructure required. Approximately 2.5 weeks.
