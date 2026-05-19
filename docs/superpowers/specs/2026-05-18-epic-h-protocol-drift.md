# Epic H — Protocol Documentation Drift & Label Count Correction

**Date:** 2026-05-18
**Status:** Spec complete — ready for planning
**Severity:** CRITICAL (security documentation)
**Scope:** Documentation-only changes (no code changes)

## Problem Statement

`docs/protocol/PROTOCOL.md` — the authoritative cross-platform wire format spec — has drifted significantly from the actual implementation. The document still describes ECIES/secp256k1/nsec as the primary encryption scheme in most algorithm blocks, while the codebase has fully migrated to HPKE/Ed25519-X25519/per-device-keys. Additionally, domain separation label counts are wrong in 6+ authoritative locations.

**Impact:**
1. New contributors implementing from the protocol doc will build the WRONG crypto
2. Security auditors reading the doc will audit against the WRONG primitives
3. Mobile developers referencing the doc for crypto implementation will use WRONG algorithms

## Current State Audit

### Actual Implementation (packages/crypto/src/)

| Primitive | Status | Source |
|-----------|--------|--------|
| HPKE (RFC 9180, X25519-HKDF-SHA256-AES256-GCM) | PRIMARY — all key wrapping | `hpke_envelope.rs` |
| Ed25519 | PRIMARY — device signing, auth, sigchain | `device_keys.rs`, `sigchain.rs` |
| X25519 | PRIMARY — HPKE decapsulation | `hpke_envelope.rs`, `device_keys.rs` |
| Argon2id (64MB, 3 iter, 4 parallel) | PRIMARY — PIN/credential KDF | `device_keys.rs`, `encryption.rs` |
| AES-256-GCM | PRIMARY — symmetric AEAD (HPKE, device keys) | `hpke_envelope.rs`, `device_keys.rs` |
| XChaCha20-Poly1305 | ACTIVE — hub event encryption, legacy content | `encryption.rs` |
| ECIES/secp256k1 | REMOVED — tombstone at label index 53 | `labels.rs:312` |
| PBKDF2-SHA256 | REMOVED — replaced by Argon2id | Not present in active code |
| nsec/bech32 | REMOVED — replaced by per-device Ed25519/X25519 keys | Not present |

**Label count:** `packages/protocol/crypto-labels.json` contains exactly **87 labels**.
The Rust `LABEL_REGISTRY` in `labels.rs` has 88 slots (indices 0-87), with index 53 being a tombstone for the removed `LABEL_ECIES_V2_SALT`.

### Domain Separation Label Count Errors

| Location | Claimed Count | Actual Count | Action |
|----------|---------------|--------------|--------|
| `docs/protocol/PROTOCOL.md:146` | 57 | 87 | Replace with reference |
| `docs/protocol/PROTOCOL.md` tables | ~52 entries listed | 87 | Expand or reference JSON |
| `packages/protocol/README.md:7` | 57 | 87 | Replace with reference |
| `packages/protocol/README.md:33` | 57 | 87 | Replace with reference |
| `docs/security/README.md:6` | 69 | 87 | Replace with reference |
| `docs/security/README.md:47` | 69 | 87 | Replace with reference |
| `docs/security/README.md:48` | 69 (indices 0-68) | 88 slots (0-87, one tombstone) | Replace with reference |
| `docs/security/README.md:104` | 69 | 87 | Replace with reference |
| `CLAUDE.md:106` (Directory Structure) | 68 | 87 | Replace with reference |
| `CLAUDE.md:141` (HPKE crypto) | 68 | 87 | Replace with reference |
| `CLAUDE.md:158` (Domain separation, 1st instance) | 69 | 87 | Replace with reference |
| `CLAUDE.md:168` (Domain separation, 2nd instance) | 69 | 87 | Replace with reference |

**Recommended fix:** Replace ALL hardcoded counts with `"see crypto-labels.json for current count"` or `"N labels (see crypto-labels.json)"` to prevent future drift. The JSON file is the single source of truth and will always have the real count.

---

## Section-by-Section PROTOCOL.md Audit

### Section 1: Authentication Protocol

| Section | What It Says | What Code Does | Status |
|---------|-------------|----------------|--------|
| 1.1 Schnorr Auth | secp256k1 Schnorr as primary | Server tries Schnorr first, Ed25519 fallback | PARTIALLY CORRECT — should be inverted (Ed25519 primary, Schnorr legacy) |
| 1.1.1 Ed25519 Auth | Ed25519 device auth | Matches implementation | CORRECT |
| 1.2 Session Auth | WebAuthn sessions | Matches implementation | CORRECT |
| 1.3 Auth Priority | Session first, then Bearer | Matches implementation | CORRECT |

**Required changes:**
- Swap ordering: Ed25519 device auth (1.1.1) should become 1.1, Schnorr should become 1.1.1 (Legacy)
- Update server verification order description: Ed25519 first, Schnorr fallback

### Section 2: Cryptographic Operations

#### 2.1 Domain Separation Constants

| Issue | Details |
|-------|---------|
| Count wrong | Says "57 domain separation constants" — actual is 87 |
| Table incomplete | Lists ~52 labels in tables — 35 labels are missing |
| Header says "HPKE / ECIES" | Should be "HPKE Key Wrapping Labels" (ECIES is dead) |
| LABEL_CONTACT_ID value wrong | Doc says `llamenos:contact-id`, actual is `llamenos:contact-identifier` |

**Required changes:**
- Update count to reference `crypto-labels.json`
- Remove "ECIES" from section headers
- Fix LABEL_CONTACT_ID value to match `crypto-labels.json`
- Add missing label categories or explicitly say "see crypto-labels.json for the complete set"
- Add tables for missing label groups: Entity Types, Recovery Group, Platform/Hub Roles, Teams/Tags, Server Signing, Storage, Audit, Erasure, Hub PTK, MLS, SFrame

#### 2.2 HPKE Envelope Encryption — CORRECT

This section accurately describes the current HPKE implementation. No changes needed.

#### 2.2.1 ECIES Key Wrapping (Legacy) — RESTRUCTURE

Currently tagged as "legacy" but subsequent sections (2.3-2.7) USE it as primary. This creates a contradiction.

**Required changes:**
- Move ECIES documentation to a clearly-marked appendix (Appendix C: Legacy ECIES Reference)
- Add note: "ECIES support has been removed from the crypto crate. This documentation is preserved for historical reference only."

#### 2.3 Per-Note Encryption — WRONG (uses ECIES)

| Line | What It Says | What Code Does |
|------|-------------|----------------|
| 430 | `eciesWrapKey(note_key, author_pubkey_hex, "llamenos:note-key")` | `hpke_seal_key(note_key, x25519_pubkey, LABEL_NOTE_KEY)` → v3 envelope |
| 435 | `eciesWrapKey(note_key, admin_pubkey, "llamenos:note-key")` | Same HPKE wrapping per admin |
| 456 | `eciesUnwrapKey(envelope, secret_key, "llamenos:note-key")` | `hpke_open_key(envelope, x25519_sk, LABEL_NOTE_KEY)` |

**HPKE equivalent pseudocode:**

```
encryptNoteV2(payload: NotePayload, author_x25519_pubkey, admin_x25519_pubkeys[]):

  1. Serialize payload:
     json_string = JSON.stringify(payload)

  2. Generate per-note symmetric key:
     note_key = random(32)

  3. Encrypt content:
     nonce = random(12)  // AES-256-GCM uses 12-byte nonce
     ciphertext = AES-256-GCM(note_key, nonce, UTF-8(json_string))
     encrypted_content = base64url(nonce || ciphertext || tag)

  4. Wrap note_key for the author (HPKE v3 envelope):
     author_envelope = hpkeWrapKey(note_key, author_x25519_pubkey, "llamenos:note-key")
     // Returns: { v: 3, labelId: <NOTE_KEY_ID>, enc: base64url, ct: base64url }

  5. Wrap note_key for each admin:
     admin_envelopes = []
     for each admin_x25519_pubkey in admin_x25519_pubkeys:
       envelope = hpkeWrapKey(note_key, admin_x25519_pubkey, "llamenos:note-key")
       admin_envelopes.push({
         pubkey: admin_ed25519_pubkey,  // for identification
         envelope: envelope             // v3 HPKE envelope
       })

  6. Return EncryptedNoteV2
```

#### 2.4 Per-Message Encryption — WRONG (uses ECIES)

Same pattern as 2.3. All `eciesWrapKey` / `eciesUnwrapKey` calls must become `hpkeWrapKey` / `hpkeUnwrapKey` with v3 envelopes. Lines 504, 528, 546.

#### 2.5 Call Record Metadata Encryption — WRONG (uses ECIES)

Lines 582, 587 use `eciesWrapKey` / `eciesUnwrapKey`. Must be rewritten to HPKE.

#### 2.6 Key Storage (PIN-Encrypted) — WRONG (describes nsec + PBKDF2)

| What It Says | What Code Does |
|-------------|----------------|
| "nsec, bech32-encoded" | Per-device Ed25519 signing key + X25519 encryption key |
| PIN regex `/^\d{6,8}$/` | Minimum 8 digits or alphanumeric passphrase (8+ chars) |
| PBKDF2-SHA256, 600K iterations | Argon2id (64MB, 3 iterations, 4 parallelism) |
| XChaCha20-Poly1305 | AES-256-GCM (12-byte nonce, 16-byte tag) |
| Stores nsec bech32 string | Stores `EncryptedDeviceKeys` JSON (signing + encryption seeds) |

**This section needs a complete rewrite.** The current description is entirely wrong for the current implementation. Section 2.11 partially describes the new model but the primary section (2.6) still describes the old one.

**Required changes:**
- Rewrite 2.6 to describe the current model: Argon2id KDF, AES-256-GCM AEAD, per-device Ed25519/X25519 key pairs
- Reference the `EncryptedDeviceKeys` struct from `packages/crypto/src/device_keys.rs`
- Remove all nsec/bech32 references
- Remove PBKDF2 references (only legacy `RECOVERY_SALT` label references PBKDF2)

#### 2.7 Hub Key Management — PARTIALLY WRONG

Line 677: "wrapped individually for each hub member using ECIES" — must be HPKE.
Lines 684, 697: `eciesWrapKey` / `eciesUnwrapKey` → `hpkeWrapKey` / `hpkeUnwrapKey`.
Hub-wide encryption (XChaCha20-Poly1305 for event encryption) remains correct.

#### 2.8 WebSocket Event Encryption — CORRECT

HKDF derivation from hub key using `LABEL_HUB_EVENT`. XChaCha20-Poly1305 for event content. This matches the implementation.

#### 2.9 Server WebSocket Keypair Derivation — PARTIALLY WRONG

Line 774: `secp256k1.getPublicKey(secret_key)` — the server keypair derivation should reference Ed25519 if Phase 6 is complete, or document both.

#### 2.10 HMAC Operations — CORRECT

Matches implementation.

#### 2.11 Per-Device Keys — CORRECT BUT MISPLACED

This section correctly describes the Ed25519/X25519 per-device key model. However:
- It's labeled "Phase 6" suggesting it's optional/future — it's now the ONLY model
- The PIN encryption subsection says "PBKDF2-SHA256, 600,000 iterations" (line 823) — actual is Argon2id
- Should be promoted to the primary key storage section (replacing 2.6)

#### 2.12 Audit Log Hash Chain — CORRECT

#### 2.13 Legacy V1 Note Decryption — CORRECT (legacy, correctly marked)

#### 2.13 (duplicate number) Transcription Decryption — WRONG

Uses `secp256k1.getSharedSecret()` and ECIES pattern (lines 893). Must be rewritten to HPKE.
Also: duplicate section number (two 2.13s).

#### 2.14 Draft Encryption — CORRECT

HKDF-derived keys with XChaCha20-Poly1305. Matches implementation.

#### 2.15 Export Encryption — CORRECT

Same pattern as drafts.

#### 2.16 Encrypted File Uploads — WRONG

Line 959: `ECIES-wrapped file key` — must be HPKE v3 envelope.

### Section 3: WebSocket Event Schema

| Issue | Details |
|-------|---------|
| Line 1026 | "Encrypted via NIP-44" — NIP-44 does not exist in the codebase. Should be "HPKE-encrypted for the specific recipient's X25519 pubkey" |
| Line 1012 | `"sig": "<schnorr_signature>"` — server events may use Ed25519 signatures now |

### Section 4: REST API Endpoints

**Endpoint audit:** Comparing PROTOCOL.md documented endpoints against actual `apps/worker/routes/`:

| Documented Endpoint | Actual Route File | Status |
|--------------------|--------------------|--------|
| `GET /api/health` | `health.ts` — routes at `/`, `/live`, `/ready` | CORRECT (but also has `/live` and `/ready` undocumented) |
| `GET /api/config` | `config.ts` | CORRECT |
| `GET /api/config/verify` | `config.ts` | CORRECT |
| `GET /api/version` | NOT FOUND | GHOST — does not exist, remove from doc |
| All auth endpoints | `auth.ts` | CORRECT |
| All webauthn endpoints | `webauthn.ts` | CORRECT |
| All invite endpoints | `invites.ts` | CORRECT |
| All volunteer endpoints | `users.ts` | CORRECT |
| All shift endpoints | `shifts.ts` | CORRECT |
| All note endpoints | `notes.ts` | CORRECT |
| All call endpoints | `calls.ts` | CORRECT |
| All conversation endpoints | `conversations.ts` | CORRECT |
| All report endpoints | `reports.ts` | CORRECT |
| All ban endpoints | `bans.ts` | CORRECT |
| All settings endpoints | `settings.ts` | CORRECT |
| All file endpoints | `files.ts`, `uploads.ts` | CORRECT |
| All blast endpoints | `blasts.ts` | CORRECT |
| All hub endpoints | `hubs.ts` | CORRECT |
| All setup endpoints | `setup.ts` | CORRECT |
| Audit endpoints | `audit.ts` | CORRECT |
| WebRTC endpoints | `telephony.ts` | CORRECT |
| Device provisioning | `provisioning.ts` | CORRECT |
| Telephony webhooks | `telephony.ts` | CORRECT |
| Messaging webhooks | — | CORRECT |
| Device registration | `devices.ts` | CORRECT |

**Missing from documentation (routes that exist but aren't documented):**

| Route File | Undocumented Endpoints |
|-----------|----------------------|
| `health.ts` | `GET /api/health/live`, `GET /api/health/ready` (Kubernetes probes) |
| `sigchain.ts` | Sigchain CRUD endpoints |
| `puk.ts` | PUK (Per-User Key) endpoints |
| `recovery-group.ts` | Recovery group endpoints |
| `tags.ts` | Tag management endpoints |
| `teams.ts` | Team management endpoints |
| `contacts.ts`, `contacts-v2.ts` | Contact management endpoints |
| `records.ts` | Record management endpoints |
| `entity-schema.ts` | Entity schema endpoints |
| `events.ts` | Event management endpoints |
| `evidence.ts` | Evidence management endpoints |
| `erasure.ts` | Data erasure endpoints |
| `retention.ts` | Data retention endpoints |
| `security-events.ts` | Security event endpoints |
| `mls.ts` | MLS group management endpoints |
| `ring-groups.ts` | Ring group management endpoints |
| `sessions.ts` | Session management endpoints |
| `platform-bans.ts` | Platform-level bans |
| `platform-settings.ts` | Platform settings |
| `provider-setup.ts` | Provider setup wizard |
| `provider-templates.ts` | Provider templates |
| `account.ts` | Account management |
| `analytics.ts` | Analytics endpoints |
| `metrics.ts` | Prometheus metrics |
| `firehose.ts` | Firehose inference endpoints |
| `signal-notification.ts` | Signal notification endpoints |
| `geocoding.ts` | Geocoding endpoints |

**Note:** Not all undocumented routes need to be added to PROTOCOL.md. The protocol doc should cover routes that external client implementors need. Internal-only routes (metrics, firehose, geocoding) may be out of scope.

#### Ghost Endpoint: `GET /api/version`

The audit context mentions this at PROTOCOL.md:~2150. However, searching the actual PROTOCOL.md text reveals NO reference to `/api/version`. The `GET /api/config/verify` endpoint at line 1113 may be what was confused with a "version" endpoint. **No action needed** — the ghost endpoint does not actually appear in the document.

### Section 5: Push Notification Protocol

| Issue | Details |
|-------|---------|
| Line 2078 | `"wakeKeyPublic": hex, // 33-byte compressed secp256k1 pubkey (66 hex chars)` — should be X25519 pubkey (32 bytes, 64 hex chars) |

### Section 6: Device Provisioning Protocol — CRITICALLY WRONG

This entire section describes the OLD nsec-transfer model:

| What It Says | What Code Does |
|-------------|----------------|
| `secp256k1.generateKey()` (line 2157) | Ed25519/X25519 key generation |
| "Encrypt nsec" (line 2204) | New device generates own keys locally; no nsec transfer |
| `nsec_bech32` transfer (lines 2207-2229) | Existing device adds new device's pubkey to sigchain |
| ECDH shared secret (secp256k1) | HPKE or X25519 ECDH |
| "Import nsec with user-chosen PIN" (line 2229) | Device encrypts own-generated keys with PIN |

**Current provisioning flow (actual):**

```
1. New device generates Ed25519 signing + X25519 encryption keypairs locally
2. New device creates provisioning room with its X25519 ephemeral pubkey
3. Primary device scans QR / enters short code
4. SAS verification via HKDF-derived code (correct in doc, but uses wrong curve)
5. Primary device adds new device's pubkeys to user's sigchain
6. Server wraps PUK for new device via LABEL_PUK_WRAP_TO_DEVICE
7. New device encrypts its own keys with user's PIN (Argon2id + AES-256-GCM)
```

**Key difference:** No secret key material is transferred between devices. The new device generates its own keys, and the existing device authorizes them via sigchain. The PUK is then wrapped for the new device by the server (or the existing device).

### Section 7: Permission Model — CORRECT

No changes needed. Accurately reflects PBAC implementation.

### Appendix A: Library Dependencies — WRONG

| What It Says | What Code Does |
|-------------|----------------|
| `@noble/curves` for secp256k1, Ed25519, X25519 | `packages/crypto` Rust crate — no JS crypto in production |
| `@noble/ciphers/chacha` for XChaCha20-Poly1305 | Rust `chacha20poly1305` crate |
| "Schnorr is separate named export from secp256k1" | Ed25519 is the primary signing algorithm |
| Web Crypto API for PBKDF2 | Argon2id in Rust |

**Required changes:**
- Rewrite to reference `packages/crypto/` Rust crate as the single implementation
- List Rust crate dependencies (hpke-rs, ed25519-dalek, x25519-dalek, aes-gcm, argon2, etc.)
- Note platform compilation targets: native (Tauri), WASM (browser testing), UniFFI (iOS/Android)
- Keep JS library references only as "historical reference for understanding legacy code"

---

## Fix Strategy

### Phase 1: Label Count Fix (all files)

**Strategy:** Replace hardcoded counts with dynamic references.

Pattern: Replace `N domain separation constants` / `N domain separation labels` / `All N crypto context constants` with phrasing like:

> Domain separation constants are defined in `packages/protocol/crypto-labels.json` (source of truth). See that file for the current count and complete list.

Or where a count adds value:

> 87 domain separation constants (source of truth: `packages/protocol/crypto-labels.json`)

**Files to update:**
1. `docs/protocol/PROTOCOL.md:146`
2. `packages/protocol/README.md:7,33`
3. `docs/security/README.md:6,47,48,104`
4. `CLAUDE.md:106,141,158,168`

### Phase 2: PROTOCOL.md Algorithm Block Rewrites

For each section using ECIES pseudocode, replace with HPKE equivalents:

1. **Section 2.3** (Per-Note Encryption): `eciesWrapKey` → `hpkeWrapKey`, v3 envelope format
2. **Section 2.4** (Per-Message Encryption): Same transformation
3. **Section 2.5** (Call Record Metadata): Same transformation
4. **Section 2.7** (Hub Key Distribution): `eciesWrapKey` → `hpkeWrapKey` for member wrapping
5. **Section 2.13b** (Transcription): ECIES → HPKE
6. **Section 2.16** (File Uploads): ECIES envelope → HPKE v3 envelope

All rewrites should:
- Use `hpkeWrapKey()` / `hpkeUnwrapKey()` with v3 envelope format
- Reference X25519 pubkeys (32 bytes) instead of secp256k1 (33 bytes compressed)
- Use the `labelId` integer field instead of raw label strings in wire format
- Reference `RecipientKeyEnvelope` with v3 envelope structure

### Phase 3: Key Storage Rewrite (Section 2.6)

Complete rewrite:
- Remove nsec/bech32 terminology
- Describe per-device Ed25519 + X25519 key generation
- Replace PBKDF2-SHA256 with Argon2id (64MB, 3 iterations, 4 parallelism)
- Replace XChaCha20-Poly1305 with AES-256-GCM (12-byte nonce)
- Reference `EncryptedDeviceKeys` struct from `device_keys.rs`
- Merge content from Section 2.11 (which is partially correct)

### Phase 4: Provisioning Rewrite (Section 6)

Complete rewrite of the protocol flow:
- New device generates its own Ed25519/X25519 keys (no key transfer)
- SAS verification using X25519 ECDH (not secp256k1)
- Sigchain authorization replaces nsec transfer
- PUK wrapping for new device via `LABEL_PUK_WRAP_TO_DEVICE`
- Remove all NIP-44 references

### Phase 5: Legacy Appendix

Create **Appendix C: Legacy ECIES Reference (Pre-v2)**:
- Move the current Section 2.2.1 ECIES documentation here
- Add clear header: "This appendix documents the legacy ECIES scheme that was used prior to the HPKE migration. It is preserved for historical reference. All current implementations MUST use HPKE (Section 2.2)."
- Move the RecipientKeyEnvelope (ECIES format) here
- Add note about ECIES tombstone in label registry (index 53)

### Phase 6: Appendix A Rewrite

Rewrite library dependencies to reference Rust crate:
- `packages/crypto/` as single implementation
- List actual Rust dependencies from Cargo.toml
- Document compilation targets (native, WASM, UniFFI)
- Keep JS references as "Legacy/Testing Only" subsection

### Phase 7: Miscellaneous Fixes

1. **Line 1026:** Replace "NIP-44" with "HPKE targeted encryption"
2. **Line 2078:** Fix wakeKeyPublic description (X25519, 32 bytes, not secp256k1)
3. **Section 2.9:** Update server keypair derivation curve reference
4. **Section 2.13 duplicate:** Renumber (should be 2.13 and 2.14, shifting subsequent sections)
5. **Section 1.1/1.1.1:** Swap ordering (Ed25519 primary, Schnorr legacy)
6. **Add missing health probe routes:** `/api/health/live`, `/api/health/ready`

---

## CI Guard: Label Count Drift Prevention

Add a script (e.g., `scripts/check-label-count.sh`) that:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Count labels in the source of truth
ACTUAL=$(python3 -c "import json; d=json.load(open('packages/protocol/crypto-labels.json')); print(len(d['labels']))")

# Check for hardcoded counts in docs that don't match
DRIFT=0
for file in docs/protocol/PROTOCOL.md packages/protocol/README.md docs/security/README.md CLAUDE.md; do
  # Look for patterns like "N domain separation" or "N crypto context" with wrong numbers
  if grep -qP '\b\d+\b(?=\s+(domain separation|crypto context))' "$file" 2>/dev/null; then
    while IFS= read -r line; do
      NUM=$(echo "$line" | grep -oP '\b\d+\b(?=\s+(domain separation|crypto context))')
      if [ -n "$NUM" ] && [ "$NUM" != "$ACTUAL" ]; then
        echo "DRIFT: $file says $NUM labels, actual is $ACTUAL"
        DRIFT=1
      fi
    done < <(grep -P '\b\d+\b\s+(domain separation|crypto context)' "$file")
  fi
done

if [ "$DRIFT" -eq 1 ]; then
  echo "ERROR: Label count drift detected. Update docs or use 'see crypto-labels.json' references."
  exit 1
fi
echo "OK: No label count drift detected ($ACTUAL labels)"
```

This should be added to CI as a pre-merge check. Can also be a pre-commit hook.

**Recommended approach:** Rather than maintaining a fragile count-checking script, the best long-term fix is the Phase 1 strategy: replace all hardcoded counts with references to `crypto-labels.json`. Once no hardcoded counts exist, drift is impossible.

---

## Implementation Priority

| Phase | Severity | Effort | Description |
|-------|----------|--------|-------------|
| Phase 1 | CRITICAL | Low | Fix label counts in all 4 files |
| Phase 2 | CRITICAL | Medium | Rewrite ECIES → HPKE in 6 algorithm blocks |
| Phase 3 | CRITICAL | Medium | Rewrite key storage section |
| Phase 4 | HIGH | Medium | Rewrite provisioning section |
| Phase 5 | MEDIUM | Low | Create legacy ECIES appendix |
| Phase 6 | MEDIUM | Low | Rewrite Appendix A |
| Phase 7 | MEDIUM | Low | Miscellaneous fixes |
| CI Guard | LOW | Low | Add label count check script |

Phases 1-4 are blocking for any security audit or new contributor onboarding.

---

## Files Modified by This Epic

| File | Changes |
|------|---------|
| `docs/protocol/PROTOCOL.md` | Major rewrite of sections 2.3-2.7, 2.9, 2.11, 2.13b, 2.16, 3.2, 5.1, 6.x, Appendix A; new Appendix C |
| `packages/protocol/README.md` | Fix label counts (lines 7, 33) |
| `docs/security/README.md` | Fix label counts (lines 6, 47, 48, 104) |
| `CLAUDE.md` | Fix label counts (lines 106, 141, 158, 168) |
| `scripts/check-label-count.sh` | NEW — CI guard script |

## Validation Criteria

1. No ECIES pseudocode appears in any "current" (non-legacy/non-appendix) section
2. No nsec/bech32 references appear outside legacy appendix
3. No hardcoded label counts that don't match `crypto-labels.json`
4. All algorithm blocks match `packages/crypto/src/` implementations
5. Key storage section describes Argon2id + AES-256-GCM, not PBKDF2 + XChaCha20
6. Provisioning section describes device key generation + sigchain, not nsec transfer
7. NIP-44 reference is removed
8. RecipientKeyEnvelope uses v3 HPKE format in all current sections
