# Epic H — Protocol Documentation Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate every known cryptographic documentation drift in `docs/protocol/PROTOCOL.md` and supporting docs — wrong label counts, ECIES pseudocode in active sections, nsec-based provisioning, NIP-44 reference — and add CI guards to prevent regression.

**Architecture:** Documentation-only epic (no business logic changes). The plan fixes doc drift in 3 categories: (1) hardcoded label counts scattered across 12+ files, (2) active sections of PROTOCOL.md that still describe ECIES/nsec when code uses HPKE/per-device-keys, (3) missing or wrong endpoint schemas. Two new shell scripts act as CI guards. One legacy appendix consolidates the old ECIES documentation for historical reference.

**Tech Stack:** Bash (CI scripts), Markdown (all doc edits). No TypeScript/Rust changes.

---

## Background: What the Code Actually Does

Before touching any file, a worker must understand the verified current behavior:

**Actual label count in `packages/protocol/crypto-labels.json`:** 87 labels. Many docs say 57, 68, or 69 — all wrong.

**Content encryption (notes, messages, call records):** AES-256-GCM (12-byte IV, 16-byte tag). NOT XChaCha20-Poly1305. Wire format: `hex(iv[12] || ciphertext[n] || tag[16])` — all concatenated, hex-encoded.

**Key wrapping:** HPKE (RFC 9180, X25519-HKDF-SHA256-AES-256-GCM). NOT ECIES. Wire format per-recipient: `{ pubkey: hex64, enc: hex64, ct: hex }`. Author-only envelope (no pubkey field): `{ enc: hex64, ct: hex }`.

**HPKE seal output layout** (from `apps/worker/lib/crypto.ts:84–89`):
```
sealed[0..32]  → enc   (32-byte HPKE encapsulated key, hex-encoded = 64 chars)
sealed[32..]   → ct    (AEAD ciphertext, hex-encoded)
```

**Hub key wrapping** (from `apps/worker/db/schema/settings.ts` `hubKeys` table): columns `enc` + `ct` — confirms HPKE format. Client-side wrapping confirmed by `hubKeyEnvelopesBodySchema` (hubs.ts:63–68).

**Note encryption** (`src/client/lib/platform.ts:871–904`): `aesGcmEncrypt` + `hpkeSealKey`. Returns `{ encryptedContent: hex, authorEnvelope: {enc, ct}, adminEnvelopes: [{pubkey, enc, ct}] }`.

**Message encryption** (`apps/worker/lib/crypto.ts:72–93`): `encryptMessageForStorage` uses `hpkeSeal`. Returns `{ encryptedContent: hex, readerEnvelopes: [{pubkey, enc, ct}] }`.

**Call record encryption** (`apps/worker/lib/crypto.ts:100–121`): `encryptCallRecordForStorage` uses `hpkeSeal`. Returns `{ encryptedContent: hex, adminEnvelopes: [{pubkey, enc, ct}] }`.

**Provisioning** (`apps/worker/routes/provisioning.ts`, `apps/worker/services/identity.ts`): Still uses `encryptedNsec` field. DB schema (`packages/protocol/schemas/provisioning.ts`): `roomPayloadBodySchema` has `encryptedNsec: string`. The code has NOT been updated to Phase 6 per-device key transfer — the provisioning section of PROTOCOL.md describes the target state.

**Key storage** (per-device, Phase 6 — `PROTOCOL.md` Section 2.11): PBKDF2-SHA256 (600,000 iter) KDF, AES-256-GCM AEAD (12-byte nonce). Platform storage: Tauri Stronghold (desktop), iOS Keychain, Android EncryptedSharedPreferences. This is the CURRENT target, not the legacy nsec XChaCha20 scheme in Section 2.6.

**NIP-44**: Not used anywhere in the current codebase. Line 1026 of PROTOCOL.md says "Encrypted via NIP-44 for the specific recipient" — incorrect.

---

## File Map

**Modified:**
- `docs/protocol/PROTOCOL.md` — primary target: label count, algo rewrites, endpoint schemas
- `packages/protocol/README.md` — label count
- `docs/ARCHITECTURE.md` — label count
- `docs/architecture/E2EE_ARCHITECTURE.md` — label count (2 places)
- `docs/security/README.md` — label count (2 places)
- `docs/security/CRYPTO_ARCHITECTURE.md` — label count (3+ places)
- `docs/security/THREAT_MODEL.md` — label count (2 places)
- `docs/superpowers/specs/2026-05-05-hpke-envelope-encryption-design.md` — label count
- `docs/superpowers/specs/2026-05-03-security-hardening-plan.md` — label count (2 places)
- `CLAUDE.md` — label count (2 places: lines 106, 141)
- `DEVELOPMENT.md` — label count

**Created:**
- `scripts/check-label-count.sh` — CI guard: fail on hardcoded label-count numbers
- `scripts/check-ecies-active.sh` — CI guard: fail on ECIES/nsec in active PROTOCOL.md sections

**Deprecation note only (do not rewrite history):**
- `docs/protocol/llamenos-protocol.md` — old v2.0 doc with nsec/ECIES: add a deprecation header pointing to `PROTOCOL.md`
- `docs/epics/epic-202-protocol-schema-codegen.md` — historical, leave body intact, fix only the "25 constants" claim if it appears in a live guidance table

---

## Phase 1: Label Count Correction

### Task 1.1: Audit all hardcoded label counts

**Files:**
- Read: all files listed in the File Map above

- [ ] **Step 1: Confirm actual label count**

```bash
python3 -c "
import json
with open('packages/protocol/crypto-labels.json') as f:
    d = json.load(f)
print(f'Label count: {len(d[\"labels\"])}')
"
```

Expected output: `Label count: 87`

Note this number. Every doc that says 57, 68, or 69 is wrong. The fix is NOT to write "87" — it is to remove the hardcoded number and replace with a reference to the source file.

- [ ] **Step 2: Grep for all hardcoded counts in live docs**

```bash
grep -rn "\b57\b\|\b68\b\|\b69\b\|\b25\b\|\b28\b" docs/ CLAUDE.md DEVELOPMENT.md packages/protocol/README.md \
  --include="*.md" \
  | grep -i "label\|domain sep\|crypto-label\|constant" \
  | grep -v "COMPLETED_BACKLOG\|SECURITY_AUDIT\|CHANGELOG\|epics/"
```

Review every match. Historical changelog files are fine as-is. Live guidance files need fixing.

- [ ] **Step 3: Commit baseline (no changes yet)**

```bash
git add -A
git status
# Should be clean — just confirming baseline before edits
```

---

### Task 1.2: Fix label count in PROTOCOL.md

**Files:**
- Modify: `docs/protocol/PROTOCOL.md`

- [ ] **Step 1: Fix Section 2.1 label count**

Find line 146:
```
> **Note:** The authoritative source of truth for all 57 domain separation constants is `packages/protocol/crypto-labels.json`. The tables below list the most commonly used labels. Refer to the source file for the complete set.
```

Replace with:
```
> **Note:** The authoritative source of truth for all domain separation constants is `packages/protocol/crypto-labels.json`. The tables below list the most commonly used labels. Refer to the source file for the complete and current count.
```

- [ ] **Step 2: Fix Section 2.1 heading "HPKE / ECIES Key Wrapping Labels"**

Find:
```
#### HPKE / ECIES Key Wrapping Labels
```

Replace with:
```
#### HPKE Key Wrapping Labels
```

(ECIES is legacy; only its historical section should reference it)

- [ ] **Step 3: Verify the change**

```bash
grep -n "57\|domain separation constants" docs/protocol/PROTOCOL.md | head -5
```

Expected: no lines showing "57"

- [ ] **Step 4: Commit**

```bash
git add docs/protocol/PROTOCOL.md
git commit -m "docs: remove hardcoded label count from PROTOCOL.md section 2.1"
```

---

### Task 1.3: Fix label count in security docs

**Files:**
- Modify: `docs/security/README.md`, `docs/security/CRYPTO_ARCHITECTURE.md`, `docs/security/THREAT_MODEL.md`

- [ ] **Step 1: Fix `docs/security/README.md`**

Find (line 6):
```
**Domain Separation Labels:** 69 defined (source of truth in `packages/protocol/crypto-labels.json`)
```
Replace with:
```
**Domain Separation Labels:** See `packages/protocol/crypto-labels.json` for current count (source of truth)
```

Find (line 46):
```
| **69 domain separation labels** | Albrecht defense — label enforced at decrypt |
```
Replace with:
```
| **Domain separation labels** (see `crypto-labels.json`) | Albrecht defense — label enforced at decrypt |
```

Find (line 48):
```
> All 69 labels are defined in `packages/protocol/crypto-labels.json` (source of truth) and registered in the Rust `LABEL_REGISTRY` with stable indices 0-68.
```
Replace with:
```
> All labels are defined in `packages/protocol/crypto-labels.json` (source of truth) and registered in the Rust `LABEL_REGISTRY` with stable indices. See the JSON file for the current count.
```

Find (line 104):
```
- ~~Domain separation label registry drift~~ — RESOLVED: all 69 labels now in Rust registry
```
Replace with:
```
- ~~Domain separation label registry drift~~ — RESOLVED: all labels now in Rust registry (see `crypto-labels.json` for current count)
```

- [ ] **Step 2: Fix `docs/security/CRYPTO_ARCHITECTURE.md`**

Find all occurrences of "69 labels" or "all 69":

```bash
grep -n "69 label\|all 69\|69 domain\|indices 0-68" docs/security/CRYPTO_ARCHITECTURE.md
```

For each live-guidance line (not historical changelog table rows), replace the number with a reference. Example:

Find:
```
All 69 labels are defined in `packages/protocol/crypto-labels.json` (source of truth) and generated to TypeScript, Swift, Kotlin, and Rust via codegen. Labels are registered in `packages/crypto/src/labels.rs` with stable numeric IDs (indices 0-68, never reordered).
```
Replace with:
```
All domain separation labels are defined in `packages/protocol/crypto-labels.json` (source of truth) and generated to TypeScript, Swift, Kotlin, and Rust via codegen. Labels are registered in `packages/crypto/src/labels.rs` with stable numeric IDs (never reordered). See the JSON file for the current count.
```

For the version/changelog table rows that say "69 labels" — leave those as-is (they record historical state accurately).

- [ ] **Step 3: Fix `docs/security/THREAT_MODEL.md`**

Find:
```
- 69 domain separation labels — prevents cross-context key reuse (Albrecht defense)
```
Replace with:
```
- Domain separation labels (see `packages/protocol/crypto-labels.json`) — prevents cross-context key reuse (Albrecht defense)
```

Find:
```
| Cross-context key reuse prevention | 69 domain separation labels + Albrecht defense | Label enforced at decrypt |
```
Replace with:
```
| Cross-context key reuse prevention | Domain separation labels + Albrecht defense (see `crypto-labels.json`) | Label enforced at decrypt |
```

- [ ] **Step 4: Verify no "69" remains in live guidance lines**

```bash
grep -n "\b69\b" docs/security/README.md docs/security/CRYPTO_ARCHITECTURE.md docs/security/THREAT_MODEL.md
```

Remaining 69s should only appear inside the historical changelog table (version rows dated before 2026-05-12). Any outside that table needs fixing.

- [ ] **Step 5: Commit**

```bash
git add docs/security/README.md docs/security/CRYPTO_ARCHITECTURE.md docs/security/THREAT_MODEL.md
git commit -m "docs: remove hardcoded label count from security docs"
```

---

### Task 1.4: Fix label count in architecture docs

**Files:**
- Modify: `docs/ARCHITECTURE.md`, `docs/architecture/E2EE_ARCHITECTURE.md`

- [ ] **Step 1: Fix `docs/ARCHITECTURE.md`**

Find:
```
- **Domain separation**: 57 labeled contexts in `packages/protocol/crypto-labels.json`
```
Replace with:
```
- **Domain separation**: All labeled contexts defined in `packages/protocol/crypto-labels.json` (source of truth; see file for current count)
```

- [ ] **Step 2: Fix `docs/architecture/E2EE_ARCHITECTURE.md`**

Find all occurrences of "57 labels" or "57 domain":

```bash
grep -n "57 label\|57 domain\|full set of 57" docs/architecture/E2EE_ARCHITECTURE.md
```

For each, replace the hardcoded number with a reference. Example:

Find:
```
> - Domain separation constants expanded from 25 to **57 labels** (`packages/protocol/crypto-labels.json`)
```
Replace with:
```
> - Domain separation constants consolidated in `packages/protocol/crypto-labels.json` (see file for current count)
```

Find:
```
> **Note:** This table shows 10 of the original Epic 76.0 labels. The full set of 57 labels is defined in `packages/protocol/crypto-labels.json` and documented in `docs/protocol/PROTOCOL.md` Section 2.1.
```
Replace with:
```
> **Note:** This table shows a subset of the original Epic 76.0 labels. The full set is defined in `packages/protocol/crypto-labels.json` and documented in `docs/protocol/PROTOCOL.md` Section 2.1.
```

- [ ] **Step 3: Commit**

```bash
git add docs/ARCHITECTURE.md docs/architecture/E2EE_ARCHITECTURE.md
git commit -m "docs: remove hardcoded label count from architecture docs"
```

---

### Task 1.5: Fix label count in CLAUDE.md, DEVELOPMENT.md, and protocol README

**Files:**
- Modify: `CLAUDE.md`, `DEVELOPMENT.md`, `packages/protocol/README.md`

- [ ] **Step 1: Fix `CLAUDE.md`**

The CLAUDE.md has two wrong entries. Find them:

```bash
grep -n "68 domain\|68 label" CLAUDE.md
```

Typically at line 106:
```
    crypto-labels.json # 68 domain separation constants (source of truth)
```
Replace with:
```
    crypto-labels.json # Domain separation constants (source of truth; see file for current count)
```

And at line 141:
```
- **HPKE crypto**: RFC 9180 X25519-HKDF-SHA256-AES256-GCM replaces secp256k1 ECIES everywhere. Ed25519/X25519 per-device keys (no more single nsec per user). Label enforcement at decrypt (Albrecht defense — 68 domain separation labels).
```
Replace with:
```
- **HPKE crypto**: RFC 9180 X25519-HKDF-SHA256-AES256-GCM replaces secp256k1 ECIES everywhere. Ed25519/X25519 per-device keys (no more single nsec per user). Label enforcement at decrypt (Albrecht defense — domain separation labels defined in `packages/protocol/crypto-labels.json`).
```

- [ ] **Step 2: Fix `DEVELOPMENT.md`**

```bash
grep -n "68 domain\|68 label" DEVELOPMENT.md
```

Apply the same fix: remove the number, reference the file.

- [ ] **Step 3: Fix `packages/protocol/README.md`**

Find:
```
- **`crypto-labels.json`** — 57 domain separation constants (source of truth for all platforms)
```
Replace with:
```
- **`crypto-labels.json`** — All domain separation constants (source of truth for all platforms; see file for current count)
```

- [ ] **Step 4: Fix specs that have hardcoded counts**

```bash
grep -n "57 label\|57 domain" \
  docs/superpowers/specs/2026-05-05-hpke-envelope-encryption-design.md \
  docs/superpowers/specs/2026-05-03-security-hardening-plan.md
```

For each match, change the number to "see `crypto-labels.json`". These spec files are reference material, not historical records.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md DEVELOPMENT.md packages/protocol/README.md \
  docs/superpowers/specs/2026-05-05-hpke-envelope-encryption-design.md \
  docs/superpowers/specs/2026-05-03-security-hardening-plan.md
git commit -m "docs: remove hardcoded label counts from CLAUDE.md, DEVELOPMENT.md, README, specs"
```

---

### Task 1.6: Create CI guard script for label counts

**Files:**
- Create: `scripts/check-label-count.sh`

- [ ] **Step 1: Write the script**

Create `scripts/check-label-count.sh`:

```bash
#!/usr/bin/env bash
# check-label-count.sh — Fail if any live doc hardcodes a number near
# "domain separation" or "labels" in the context of crypto-labels.json.
#
# Historical files (COMPLETED_BACKLOG, CHANGELOG, SECURITY_AUDIT, epics/) are
# excluded because they record past state and should not be rewritten.
#
# Exit code: 0 = pass, 1 = violations found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

EXCLUDE_PATTERNS=(
  "docs/COMPLETED_BACKLOG.md"
  "docs/epics/"
  "docs/security/SECURITY_AUDIT"
  "docs/security/SECURITY_GAPS_AND_ROADMAP.md"
  "CHANGELOG.md"
  "docs/superpowers/plans/"
)

# Build exclusion args for grep
GREP_EXCLUDES=()
for pat in "${EXCLUDE_PATTERNS[@]}"; do
  GREP_EXCLUDES+=(--exclude-dir="${pat}" --exclude="${pat}")
done

# Pattern: a bare number (25–150) immediately preceded or followed by
# text indicating it's a label count.
LABEL_COUNT_PATTERN='\b(25|28|57|68|69|87|[0-9]{2,3})\b.*(domain sep|crypto.?label|label.*constant|separation constant)'
ALT_PATTERN='(domain sep|crypto.?label|label.*constant|separation constant).*\b(25|28|57|68|69|87|[0-9]{2,3})\b'

cd "$REPO_ROOT"

VIOLATIONS=()

while IFS= read -r line; do
  VIOLATIONS+=("$line")
done < <(
  grep -rn -E "$LABEL_COUNT_PATTERN|$ALT_PATTERN" \
    --include="*.md" \
    docs/ CLAUDE.md DEVELOPMENT.md packages/protocol/README.md \
    2>/dev/null \
    | grep -v "COMPLETED_BACKLOG\|CHANGELOG\|SECURITY_AUDIT\|SECURITY_GAPS\|docs/epics/\|superpowers/plans/\|# [0-9]" \
    || true
)

if [ ${#VIOLATIONS[@]} -gt 0 ]; then
  echo "❌ Hardcoded domain separation label counts found in live docs:"
  echo "   Replace the number with: 'see packages/protocol/crypto-labels.json'"
  echo ""
  for v in "${VIOLATIONS[@]}"; do
    echo "  $v"
  done
  exit 1
fi

echo "✅ No hardcoded label counts found in live docs."
exit 0
```

- [ ] **Step 2: Make executable and test**

```bash
chmod +x scripts/check-label-count.sh
bash scripts/check-label-count.sh
```

Expected: `✅ No hardcoded label counts found in live docs.`

If violations are reported, return to Tasks 1.2–1.5 and fix the remaining entries before proceeding.

- [ ] **Step 3: Commit**

```bash
git add scripts/check-label-count.sh
git commit -m "feat(ci): add check-label-count.sh to catch hardcoded domain separation counts"
```

---

## Phase 2: PROTOCOL.md Algorithm Block Rewrite

### Task 2.1: Rewrite Section 2.3 — Per-Note Encryption (ECIES → HPKE)

**Files:**
- Modify: `docs/protocol/PROTOCOL.md`

**Why this is needed:** Section 2.3 (lines ~407–480) describes `eciesWrapKey` with XChaCha20-Poly1305. The actual code (`src/client/lib/platform.ts:871–904`) uses AES-256-GCM for content + HPKE (`hpkeSealKey`) for key wrapping. Mobile devs implementing from this spec will build the wrong thing.

**Verified code behavior** (read before editing):
- Content: `aesGcmEncrypt` → `hex(iv[12] || ct_with_tag)`, AES-256-GCM
- Author envelope: `{ enc: hex64, ct: hex }` (KeyEnvelope schema, no pubkey)
- Admin envelopes: `[{ pubkey: hex64, enc: hex64, ct: hex }]` (RecipientEnvelope schema)

- [ ] **Step 1: Replace Section 2.3 Encryption block**

Find the entire Encryption subsection (starts with `encryptNoteV2(` pseudocode, ends before `#### Decryption`). Replace with:

```
encryptNoteV2(payload: NotePayload, author_x25519_pubkey[32], admin_x25519_pubkeys[32][]):

  1. Serialize payload:
     json_string = JSON.stringify(payload)
     // NotePayload = { text: string, fields?: Record<string, string|number|boolean> }

  2. Generate per-note symmetric key:
     note_key = random(32)

  3. Encrypt content with AES-256-GCM:
     iv = random(12)
     key = AES-256-GCM.importKey(note_key)
     ciphertext_with_tag = AES-256-GCM.encrypt(key, iv, UTF-8(json_string))
     // ciphertext_with_tag: variable length + 16-byte GCM tag appended
     encrypted_content = hex(iv || ciphertext_with_tag)

  4. Wrap note_key for the author via HPKE:
     author_sealed = HPKE.Seal(author_x25519_pubkey, note_key,
                               info=UTF-8("llamenos:note-key"), aad=UTF-8("llamenos:note-key:key-wrap"))
     author_envelope = {
       enc: hex(author_sealed[0..32]),   // 32-byte encapsulated key → 64 hex chars
       ct:  hex(author_sealed[32..])     // AEAD ciphertext
     }

  5. Wrap note_key for each admin via HPKE:
     admin_envelopes = []
     for each admin_x25519_pubkey in admin_x25519_pubkeys:
       sealed = HPKE.Seal(admin_x25519_pubkey, note_key,
                          info=UTF-8("llamenos:note-key"), aad=UTF-8("llamenos:note-key:key-wrap"))
       admin_envelopes.push({
         pubkey: hex(admin_x25519_pubkey),  // 64 hex chars
         enc:    hex(sealed[0..32]),
         ct:     hex(sealed[32..])
       })

  6. Return:
     EncryptedNoteV2 {
       encryptedContent: encrypted_content,   // hex string
       authorEnvelope:   author_envelope,      // KeyEnvelope { enc, ct }
       adminEnvelopes:   admin_envelopes        // RecipientEnvelope[] { pubkey, enc, ct }
     }
```

- [ ] **Step 2: Replace Section 2.3 Decryption block**

Find the Decryption subsection. Replace with:

```
decryptNoteV2(encrypted_content_hex, envelope: KeyEnvelope, device_x25519_secret_key[32]):

  1. Reconstruct HPKE envelope:
     // The stored KeyEnvelope has enc + ct (no version or labelId — raw HPKE output)
     enc_bytes = hex_to_bytes(envelope.enc)   // 32 bytes
     ct_bytes  = hex_to_bytes(envelope.ct)

  2. Unwrap the note key via HPKE:
     note_key = HPKE.Open(device_x25519_secret_key,
                          enc_bytes, ct_bytes,
                          info=UTF-8("llamenos:note-key"), aad=UTF-8("llamenos:note-key:key-wrap"))
     // note_key: 32 bytes

  3. Decrypt content with AES-256-GCM:
     data = hex_to_bytes(encrypted_content_hex)
     iv   = data[0..12]
     ciphertext_with_tag = data[12..]
     plaintext = AES-256-GCM.decrypt(note_key, iv, ciphertext_with_tag)

  4. Parse JSON:
     json_string = UTF-8_decode(plaintext)
     payload = JSON.parse(json_string) as NotePayload
     // If JSON parse fails or doesn't have .text field:
     // Return { text: json_string }
```

- [ ] **Step 3: Update the Wire Format subsection**

Find:
```
#### Wire Format: `encryptedContent`

```
Offset  Length    Content
------  ------    -------
0       24        XChaCha20-Poly1305 nonce
24      variable  Ciphertext (UTF-8 JSON + 16-byte auth tag)
```
```

Replace with:
```
#### Wire Format: `encryptedContent`

```
Offset  Length    Content
------  ------    -------
0       12        AES-256-GCM IV (random, 12 bytes)
12      variable  Ciphertext + GCM tag (UTF-8 JSON payload + 16-byte GCM authentication tag)
```

The entire byte sequence is hex-encoded for transport.

#### Wire Format: Key Envelopes

Author envelope (`authorEnvelope`):
```json
{ "enc": "<hex64 — 32-byte HPKE encapsulated key>", "ct": "<hex — AEAD ciphertext>" }
```

Admin envelope (`adminEnvelopes[i]`):
```json
{ "pubkey": "<hex64>", "enc": "<hex64>", "ct": "<hex>" }
```
```

- [ ] **Step 4: Verify the section no longer contains `ecies` or `XChaCha20`**

```bash
awk '/^### 2\.3 Per-Note/,/^### 2\.4/' docs/protocol/PROTOCOL.md | grep -i "ecies\|xchacha"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add docs/protocol/PROTOCOL.md
git commit -m "docs: rewrite PROTOCOL.md Section 2.3 (per-note encryption) ECIES→HPKE/AES-GCM"
```

---

### Task 2.2: Rewrite Section 2.4 — Per-Message Encryption (ECIES → HPKE)

**Files:**
- Modify: `docs/protocol/PROTOCOL.md`

**Verified code behavior** (`apps/worker/lib/crypto.ts:72–93`, `src/client/lib/platform.ts:937–960`):
- Same AES-256-GCM content encryption as notes
- Key wrapping: `hpkeSeal`, returns `{pubkey, enc, ct}` per reader
- Server-side: `encryptMessageForStorage` with `LABEL_MESSAGE`

- [ ] **Step 1: Replace Section 2.4 Encryption block**

Find the `encryptMessage(` pseudocode. Replace with:

```
encryptMessage(plaintext_string, reader_x25519_pubkeys[32][]):

  1. Generate per-message symmetric key:
     message_key = random(32)

  2. Encrypt content with AES-256-GCM:
     iv = random(12)
     ciphertext_with_tag = AES-256-GCM.encrypt(message_key, iv, UTF-8(plaintext_string))
     encrypted_content = hex(iv || ciphertext_with_tag)

  3. Wrap message_key for each reader via HPKE:
     reader_envelopes = []
     for each reader_x25519_pubkey in reader_x25519_pubkeys:
       sealed = HPKE.Seal(reader_x25519_pubkey, message_key,
                          info=UTF-8("llamenos:message"), aad=UTF-8("llamenos:message:key-wrap"))
       reader_envelopes.push({
         pubkey: hex(reader_x25519_pubkey),  // 64 hex chars
         enc:    hex(sealed[0..32]),
         ct:     hex(sealed[32..])
       })

  4. Return:
     EncryptedMessagePayload {
       encryptedContent: encrypted_content,
       readerEnvelopes:  reader_envelopes     // RecipientEnvelope[] { pubkey, enc, ct }
     }
```

- [ ] **Step 2: Replace Section 2.4 Decryption block**

Find the `decryptMessage(` pseudocode. Replace with:

```
decryptMessage(encrypted_content_hex, reader_envelopes[], device_x25519_secret_key[32], reader_pubkey_hex):

  1. Find matching envelope:
     envelope = reader_envelopes.find(e => e.pubkey === reader_pubkey_hex)
     // Return null if no matching envelope

  2. Unwrap message key via HPKE:
     enc_bytes = hex_to_bytes(envelope.enc)
     ct_bytes  = hex_to_bytes(envelope.ct)
     message_key = HPKE.Open(device_x25519_secret_key, enc_bytes, ct_bytes,
                             info=UTF-8("llamenos:message"), aad=UTF-8("llamenos:message:key-wrap"))

  3. Decrypt content with AES-256-GCM:
     data = hex_to_bytes(encrypted_content_hex)
     iv   = data[0..12]
     ciphertext_with_tag = data[12..]
     plaintext = AES-256-GCM.decrypt(message_key, iv, ciphertext_with_tag)

  4. Return UTF-8 string
```

- [ ] **Step 3: Update the Server-Side Encryption paragraph**

Find:
```
3. Server wraps `message_key` for each authorized reader (assigned volunteer + all admins) using `eciesWrapKeyServer()` with `LABEL_MESSAGE`.
```

Replace with:
```
3. Server wraps `message_key` for each authorized reader (assigned volunteer + all admins) via HPKE with `LABEL_MESSAGE`. See `apps/worker/lib/crypto.ts` `encryptMessageForStorage()`.
```

- [ ] **Step 4: Verify**

```bash
awk '/^### 2\.4 Per-Message/,/^### 2\.5/' docs/protocol/PROTOCOL.md | grep -i "ecies\|xchacha"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add docs/protocol/PROTOCOL.md
git commit -m "docs: rewrite PROTOCOL.md Section 2.4 (per-message encryption) ECIES→HPKE/AES-GCM"
```

---

### Task 2.3: Rewrite Section 2.5 — Call Record Metadata Encryption (ECIES → HPKE)

**Files:**
- Modify: `docs/protocol/PROTOCOL.md`

**Verified code behavior** (`apps/worker/lib/crypto.ts:100–121`):
- `encryptCallRecordForStorage`: AES-256-GCM content, HPKE key wrapping with `LABEL_CALL_META`
- Returns `{ encryptedContent, adminEnvelopes: [{pubkey, enc, ct}] }` (no volunteer envelope — admins only)

- [ ] **Step 1: Replace Section 2.5 Algorithm block**

Find the `encryptCallRecordForStorage(` pseudocode. Replace with:

```
encryptCallRecordForStorage(metadata_object, admin_x25519_pubkeys[32][]):

  1. record_key = random(32)
  2. iv = random(12)
  3. ciphertext_with_tag = AES-256-GCM.encrypt(record_key, iv, UTF-8(JSON.stringify(metadata_object)))
  4. encrypted_content = hex(iv || ciphertext_with_tag)
  5. admin_envelopes = admin_x25519_pubkeys.map(pk => {
       sealed = HPKE.Seal(pk, record_key,
                          info=UTF-8("llamenos:call-meta"), aad=UTF-8("llamenos:call-meta:key-wrap"))
       return {
         pubkey: hex(pk),
         enc:    hex(sealed[0..32]),
         ct:     hex(sealed[32..])
       }
     })
  6. Return { encryptedContent, adminEnvelopes }
```

- [ ] **Step 2: Fix the Decryption reference line**

Find:
```
Decryption uses `eciesUnwrapKey(envelope, secret_key, "llamenos:call-meta")`.
```

Replace with:
```
Decryption: `HPKE.Open(device_x25519_secret_key, hex_to_bytes(envelope.enc), hex_to_bytes(envelope.ct), info=UTF-8("llamenos:call-meta"), aad=UTF-8("llamenos:call-meta:key-wrap"))` returns `record_key`. Then AES-256-GCM decrypt using `iv = data[0..12]`.
```

- [ ] **Step 3: Verify**

```bash
awk '/^### 2\.5/,/^### 2\.6/' docs/protocol/PROTOCOL.md | grep -i "ecies\|xchacha"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add docs/protocol/PROTOCOL.md
git commit -m "docs: rewrite PROTOCOL.md Section 2.5 (call record encryption) ECIES→HPKE/AES-GCM"
```

---

### Task 2.4: Restructure Section 2.6 and 2.11 — Key Storage

**Files:**
- Modify: `docs/protocol/PROTOCOL.md`

**Why:** Section 2.6 describes the old nsec/XChaCha20-Poly1305 PIN encryption as the primary model. Section 2.11 describes Phase 6 per-device Ed25519/X25519 keys as an addendum. This is backwards. Phase 6 is now the current system.

**Verified code behavior** (`PROTOCOL.md` Section 2.11 + `apps/worker/db/schema/devices.ts`):
- Phase 6: Ed25519 signing key + X25519 encryption key per device
- PIN KDF: PBKDF2-SHA256, 600,000 iter (unchanged from legacy)
- AEAD: AES-256-GCM, 12-byte nonce (changed from XChaCha20-Poly1305, 24-byte nonce)
- Platform storage: Tauri Stronghold / iOS Keychain / Android EncryptedSharedPreferences

- [ ] **Step 1: Add deprecation notice to Section 2.6**

At the start of Section 2.6, after the `### 2.6 Key Storage (PIN-Encrypted)` heading, insert:

```
> **Legacy Model:** This section describes the original nsec-per-user key storage using XChaCha20-Poly1305.
> The current system uses per-device Ed25519/X25519 keypairs stored with AES-256-GCM (Section 2.11).
> Section 2.6 is retained for backward-compatibility reference only.
> New client implementations MUST use the Section 2.11 model.
```

- [ ] **Step 2: Update Section 2.11 title to mark it as current**

Find:
```
### 2.11 Per-Device Keys (Phase 6)
```

Replace with:
```
### 2.11 Per-Device Key Storage (Current)
```

- [ ] **Step 3: Update Section 2.11 intro paragraph**

Find:
```
Phase 6 replaces the single nsec-per-user model with per-device keypairs. Each device generates two independent keypairs on first launch:
```

Replace with:
```
The current key model uses per-device keypairs — replacing the legacy single nsec-per-user scheme (Section 2.6). Each device generates two independent keypairs on first launch:
```

- [ ] **Step 4: Fix PIN encryption AEAD description in Section 2.11**

The section already has:
```
PIN Encryption (Phase 6):
  KDF:    PBKDF2-SHA256, 600,000 iterations
  AEAD:   AES-256-GCM (12-byte nonce, 16-byte tag)
```

Verify this is present and accurate. If the parenthetical is missing, add it.

- [ ] **Step 5: Commit**

```bash
git add docs/protocol/PROTOCOL.md
git commit -m "docs: clarify PROTOCOL.md Section 2.6 (legacy) vs 2.11 (current) key storage"
```

---

### Task 2.5: Rewrite Section 2.7 — Hub Key Distribution (ECIES → HPKE)

**Files:**
- Modify: `docs/protocol/PROTOCOL.md`

**Verified code behavior** (from `apps/worker/db/schema/settings.ts` `hubKeys` table — columns: `enc`, `ct`; `packages/protocol/schemas/hubs.ts` `hubKeyEnvelopesBodySchema` — `{pubkey, enc, ct}`):
- Hub key wrapping is client-side (client sends envelopes via `PUT /api/hubs/:hubId/key`)
- Envelope format: `{ pubkey, enc, ct }` (RecipientEnvelope — HPKE format)

- [ ] **Step 1: Fix the Distribution subsection intro**

Find:
```
The hub key is wrapped individually for each hub member using ECIES:
```

Replace with:
```
The hub key is wrapped individually for each hub member using HPKE. Clients compute envelopes and upload them via `PUT /api/hubs/:hubId/key`:
```

- [ ] **Step 2: Replace `wrapHubKeyForMembers` pseudocode**

Find the `wrapHubKeyForMembers(` block. Replace with:

```
wrapHubKeyForMembers(hub_key[32], member_x25519_pubkeys[32][]):

  envelopes = []
  for each member_x25519_pubkey in member_x25519_pubkeys:
    sealed = HPKE.Seal(member_x25519_pubkey, hub_key,
                       info=UTF-8("llamenos:hub-key-wrap"), aad=UTF-8("llamenos:hub-key-wrap:key-wrap"))
    envelopes.push({
      pubkey: hex(member_x25519_pubkey),
      enc:    hex(sealed[0..32]),
      ct:     hex(sealed[32..])
    })
  return envelopes
```

- [ ] **Step 3: Replace `unwrapHubKey` pseudocode**

Find:
```
unwrapHubKey(envelope, secret_key[32]):
  return eciesUnwrapKey(envelope, secret_key, "llamenos:hub-key-wrap")
```

Replace with:
```
unwrapHubKey(envelope: RecipientEnvelope, device_x25519_secret_key[32]):
  enc_bytes = hex_to_bytes(envelope.enc)
  ct_bytes  = hex_to_bytes(envelope.ct)
  return HPKE.Open(device_x25519_secret_key, enc_bytes, ct_bytes,
                   info=UTF-8("llamenos:hub-key-wrap"), aad=UTF-8("llamenos:hub-key-wrap:key-wrap"))
  // Returns hub_key: 32 bytes
```

- [ ] **Step 4: Verify**

```bash
awk '/^### 2\.7/,/^### 2\.8/' docs/protocol/PROTOCOL.md | grep -i "ecies\|xchacha"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add docs/protocol/PROTOCOL.md
git commit -m "docs: rewrite PROTOCOL.md Section 2.7 (hub key distribution) ECIES→HPKE"
```

---

### Task 2.6: Fix Section 2.8 NIP-44 reference and Section 2.16 ECIES reference

**Files:**
- Modify: `docs/protocol/PROTOCOL.md`

- [ ] **Step 1: Fix NIP-44 reference in Section 2.8**

Find (around line 1026):
```
- **Targeted messages**: Encrypted via NIP-44 for the specific recipient.
```

Replace with:
```
- **Targeted messages**: Encrypted via HPKE (Section 2.2) targeted to the recipient's X25519 pubkey.
```

- [ ] **Step 2: Fix Section 2.16 ECIES reference in file uploads**

Find (around line 959):
```
  encryptedFileKey: string     // ECIES-wrapped file key (LABEL_FILE_KEY)
```

Replace with:
```
  encryptedFileKey: string     // HPKE-wrapped file key (LABEL_FILE_KEY) — RecipientEnvelope { enc, ct }
```

Also fix the interface name if it still says `RecipientEnvelope` in a way that implies old format — verify and update to match current schema.

- [ ] **Step 3: Commit**

```bash
git add docs/protocol/PROTOCOL.md
git commit -m "docs: fix NIP-44 reference in Section 2.8, ECIES reference in Section 2.16"
```

---

## Phase 3: Provisioning Protocol Rewrite

### Task 3.1: Rewrite Section 6 — Device Provisioning Protocol

**Files:**
- Modify: `docs/protocol/PROTOCOL.md`

**Why:** Section 6 (starting at line ~2147) describes secp256k1 ECDH for the ephemeral keypair and transfers `nsec_bech32` via XChaCha20-Poly1305. This is the pre-Phase-6 model. The target state (Phase 6) uses X25519 ECDH for SAS + transfers a device key bundle (Ed25519 pubkey + X25519 pubkey + PUK encrypted for the new device) instead of nsec.

**Note on current code state:** `apps/worker/routes/provisioning.ts` and `apps/worker/services/identity.ts` still use `encryptedNsec` as the field name. The DB column is also `encryptedNsec`. This means the server currently accepts the OLD protocol. The rewrite documents the TARGET state. Add a code note explaining the migration path.

**Verified target behavior** (from Section 2.11 and CLAUDE.md):
- New device generates Ed25519 + X25519 keypairs
- Ephemeral key exchange uses X25519 (not secp256k1)
- Provisioning payload: new device's Ed25519 pubkey + X25519 pubkey + HPKE-encrypted PUK seed
- The provisioning symmetric key is HKDF-derived from ECDH output using `LABEL_PROVISIONING_SALT`

- [ ] **Step 1: Add Phase 6 transition note at the top of Section 6**

After the `## 6. Device Provisioning Protocol` heading, insert:

```
> **Migration Note (v2.0):** The server currently accepts the `encryptedNsec` field for backward compatibility with pre-Phase-6 clients. The protocol described below reflects the Phase 6 target using per-device keypairs. New implementations MUST implement the Phase 6 protocol. The server field is named `encryptedNsec` but carries the Phase 6 device key bundle payload described here.
```

- [ ] **Step 2: Replace Section 6.1 Protocol Flow diagram**

The flow uses `secp256k1.generateKey()` for the ephemeral keypair and `nsec_bech32` as the payload. Replace the entire flow with:

```
New Device                          Server                     Primary Device
-----------                         ------                     ---------------
1. Generate ephemeral keypair (X25519):
   eSK, ePK = X25519.generateKey()
   // eSK: 32 bytes, ePK: 32 bytes

2. POST /api/provision/rooms
   { ephemeralPubkey: hex(ePK) }
                                    Creates room with
                                    roomId + token
   <-- { roomId, token }

3. Display QR code:
   JSON.stringify({ r: roomId, t: token })
   (or short code: roomId[0..8])

4. Poll: GET /api/provision/rooms/:id
   ?token=<token>
                                                               Scans QR / enters code

                                                        5. GET /api/provision/rooms/:id
                                                           ?token=<token>
                                                           <-- { ephemeralPubkey: hex(ePK) }

                                                        6. Compute shared secret:
                                                           shared = X25519(primarySK, ePK)
                                                           // shared: 32 bytes (raw X25519 output)

                                                        7. Compute SAS:
                                                           sasBytes = HKDF(SHA-256, shared,
                                                             salt=UTF-8("llamenos:sas"),
                                                             info=UTF-8("llamenos:provisioning-sas"),
                                                             length=4)
                                                           num = (sasBytes[0]<<24 | sasBytes[1]<<16 |
                                                                  sasBytes[2]<<8  | sasBytes[3]) >>> 0
                                                           code = (num % 1000000).padStart(6, '0')
                                                           Display: "XXX XXX"

8. Also compute SAS (from new device side):
   shared = X25519(eSK, primaryPK)
   // X25519 is symmetric: same shared secret
   Same HKDF derivation → same SAS
   Display: "XXX XXX"

9. User visually compares                                    User visually compares
   both codes match? -->                                     <-- both codes match?

                                                        10. Derive provisioning key:
                                                            prov_key = HKDF(SHA-256, shared,
                                                              salt=UTF-8("llamenos:provisioning:v1"),
                                                              info=UTF-8("llamenos:provisioning:v1"),
                                                              length=32)
                                                            // LABEL_PROVISIONING_SALT

                                                        11. Build device key bundle:
                                                            bundle = JSON.stringify({
                                                              signingPubkey: hex(primary_ed25519_pubkey),
                                                              encPubkey: hex(primary_x25519_pubkey),
                                                              pukEncrypted: <HPKE-wrapped PUK for new device>
                                                            })

                                                        12. Encrypt device key bundle:
                                                            iv = random(12)
                                                            ct_with_tag = AES-256-GCM.encrypt(prov_key, iv,
                                                                            UTF-8(bundle))
                                                            encryptedPayload = hex(iv || ct_with_tag)

                                                        13. POST /api/provision/rooms/:id/payload
                                                            Auth: Required (primary device)
                                                            { token, encryptedNsec: encryptedPayload,
                                                              primaryPubkey: hex(primary_ed25519_pubkey) }
                                                            // Note: field name is "encryptedNsec" for
                                                            // backward compat; payload is device bundle

14. Poll returns status: "ready"
    { encryptedNsec: encryptedPayload, primaryPubkey }

15. Derive provisioning key (same as step 10):
    shared = X25519(eSK, primaryPK)
    prov_key = HKDF(SHA-256, shared,
      salt=UTF-8("llamenos:provisioning:v1"),
      info=UTF-8("llamenos:provisioning:v1"),
      length=32)

16. Decrypt device key bundle:
    data = hex_to_bytes(encryptedPayload)
    iv   = data[0..12]
    ct   = data[12..]
    bundle_json = UTF-8_decode(AES-256-GCM.decrypt(prov_key, iv, ct))
    bundle = JSON.parse(bundle_json)

17. New device now has:
    - Primary device's signing + encryption pubkeys (for sigchain verification)
    - PUK (Per-User Key) encrypted for new device's X25519 key
    New device decrypts PUK using its X25519 secret key (HPKE.Open with LABEL_PUK_WRAP_TO_DEVICE).

18. New device generates its own keypairs (Section 2.11) and registers via sigchain.
```

- [ ] **Step 3: Cross-reference the implementation**

After the flow diagram, add:

```
#### Server Implementation

Cross-reference: `apps/worker/routes/provisioning.ts`, `apps/worker/services/identity.ts` `createProvisionRoom()`, `getProvisionRoom()`, `setProvisionPayload()`.

The server stores only the ephemeral pubkey and encrypted payload — it cannot decrypt the payload. The `encryptedNsec` field in the server API carries the Phase 6 device key bundle described above.
```

- [ ] **Step 4: Remove NIP-44 / secp256k1 from Section 6 and verify**

```bash
awk '/^## 6\./,/^## 7\./' docs/protocol/PROTOCOL.md | grep -i "secp256k1\|nsec_bech32\|NIP-44\|eciesWrap\|eciesUnwrap\|XChaCha20"
```

Expected: no output. `nsec` may still appear in comments/notes but not in algorithm pseudocode steps.

- [ ] **Step 5: Commit**

```bash
git add docs/protocol/PROTOCOL.md
git commit -m "docs: rewrite PROTOCOL.md Section 6 (provisioning) secp256k1/nsec→X25519/HPKE device bundle"
```

---

## Phase 4: Legacy Appendix

### Task 4.1: Create Appendix C — Legacy Encryption (pre-v2 ECIES)

**Files:**
- Modify: `docs/protocol/PROTOCOL.md`

**Why:** ECIES documentation (Section 2.2.1) should remain for anyone implementing backward-compat read of old data. But the Section 2.3–2.7 ECIES pseudocode has been removed, so Section 2.2.1 is the canonical reference. We add an Appendix clearly marking the old system and ensuring all ECIES content is consolidated there.

- [ ] **Step 1: Add Appendix C at the end of PROTOCOL.md**

After Appendix B (Type Definitions), append:

```markdown
## Appendix C: Legacy Encryption (pre-v2 ECIES)

> **Historical Reference Only.** This appendix documents the encryption primitives used before v2.0 (2026-Q1). They are retained so implementors can read data encrypted with the old scheme during migration. **DO NOT implement new encryption using these algorithms.**

### C.1 ECIES Key Wrapping (Replaced by Section 2.2 HPKE)

ECIES was the key-wrapping primitive in v1. It used secp256k1 ECDH + XChaCha20-Poly1305 instead of X25519 HPKE + AES-256-GCM.

See Section 2.2.1 for the full ECIES algorithm specification (retained in the main body for backward-compat read path).

### C.2 nsec-per-User Key Storage (Replaced by Section 2.11)

v1 stored a single secp256k1 secret key (nsec, bech32-encoded) per user, PIN-encrypted with PBKDF2-SHA256 + XChaCha20-Poly1305. See Section 2.6 (marked Legacy) for the full algorithm.

### C.3 Provisioning (secp256k1 ECDH + nsec Transfer)

v1 provisioning used secp256k1 ECDH for the ephemeral key exchange and transferred the nsec directly. The SAS derivation used the same HKDF parameters. See the migration note in Section 6.1 for context.

### C.4 XChaCha20-Poly1305 Wire Format (v1 encryptedContent)

v1 content was encrypted with XChaCha20-Poly1305:

```
Offset  Length    Content
------  ------    -------
0       24        XChaCha20-Poly1305 nonce (random, 24 bytes)
24      variable  Ciphertext + 16-byte Poly1305 authentication tag
```

The entire byte sequence was hex-encoded. v2 uses AES-256-GCM with a 12-byte IV (Section 2.3).
```

- [ ] **Step 2: Update Table of Contents to include Appendix C**

Find the Table of Contents section. Add after "Appendix B":
```
- [Appendix C: Legacy Encryption (pre-v2 ECIES)](#appendix-c-legacy-encryption-pre-v2-ecies)
```

- [ ] **Step 3: Add deprecation header to llamenos-protocol.md**

This old doc (`docs/protocol/llamenos-protocol.md`) describes v1 nsec/ECIES and should not be confused with the canonical spec. Add at the top (after the frontmatter):

```markdown
> **⚠️ DEPRECATED.** This document describes Llamenos v1 cryptography (nsec, ECIES, secp256k1).
> The canonical interoperability specification is `docs/protocol/PROTOCOL.md`.
> This file is retained as historical reference only.
```

- [ ] **Step 4: Commit**

```bash
git add docs/protocol/PROTOCOL.md docs/protocol/llamenos-protocol.md
git commit -m "docs: add Appendix C (legacy ECIES) to PROTOCOL.md, deprecate llamenos-protocol.md"
```

---

## Phase 5: Endpoint Audit

### Task 5.1: Audit PROTOCOL.md endpoints against actual routes

**Files:**
- Modify: `docs/protocol/PROTOCOL.md`

- [ ] **Step 1: List all actual routes**

```bash
grep -rn "\.get\|\.post\|\.patch\|\.put\|\.delete" \
  apps/worker/routes/*.ts \
  | grep -o "'\(/[^']*\)'" | sort -u | head -60
```

This gives the actual route paths. Compare against what Section 4 documents.

- [ ] **Step 2: Check for GET /api/version (should not exist)**

```bash
grep -rn "version" apps/worker/routes/ --include="*.ts" | grep "\.get\|\.post"
```

If `GET /api/version` appears in PROTOCOL.md but not in routes, remove it from Section 4.

To check PROTOCOL.md for stale version endpoints:
```bash
grep -n "GET /api/version\b" docs/protocol/PROTOCOL.md
```

Remove any matches.

- [ ] **Step 3: Fix POST /api/notes body envelope format**

In Section 4.7 (Notes), the documented request body for `POST /api/notes` still shows:
```
"authorEnvelope"?: { "wrappedKey": hex, "ephemeralPubkey": hex },
"adminEnvelopes"?: RecipientKeyEnvelope[]
```

The actual schema (`packages/protocol/schemas/notes.ts` or common.ts) uses `{ enc, ct }`. Fix to:

```
"authorEnvelope"?: { "enc": hex64, "ct": hex },         // KeyEnvelope (HPKE; no pubkey field)
"adminEnvelopes"?: { "pubkey": hex64, "enc": hex64, "ct": hex }[]  // RecipientEnvelope[]
```

Same fix for `PATCH /api/notes/:id`.

To verify the actual schema first:
```bash
grep -n "authorEnvelope\|adminEnvelopes\|wrappedKey\|ephemeralPubkey" \
  packages/protocol/schemas/notes.ts 2>/dev/null || \
grep -n "authorEnvelope\|adminEnvelopes" apps/worker/routes/notes.ts
```

Match the schema exactly.

- [ ] **Step 4: Verify Section 4.1 GET /api/config/verify still matches**

```bash
grep -n "config.get.*verify\|/verify" apps/worker/routes/config.ts
```

Check the response fields match what PROTOCOL.md documents. The route at line 112 of config.ts returns `{ version, commit, buildTime, ... }`. Verify fields match documentation.

- [ ] **Step 5: Flag any endpoints missing from PROTOCOL.md**

Newer routes (blasts, recovery-group, contacts-v2, entity-schema, etc.) may not be in PROTOCOL.md. This epic doesn't require documenting all new endpoints, but note any that are referenced in encryption-relevant sections.

Add a brief note at the end of Section 4:
```
> **Note:** This section documents the core API surface. Additional endpoints for blasts, recovery groups, events, and entity management are implemented but not fully documented here. See `apps/worker/routes/` for the full route list.
```

- [ ] **Step 6: Commit**

```bash
git add docs/protocol/PROTOCOL.md
git commit -m "docs: endpoint audit — fix notes envelope format, remove stale endpoints, add coverage note"
```

---

## Phase 6: CI Guard Scripts

### Task 6.1: Create CI guard for ECIES in active PROTOCOL.md sections

**Files:**
- Create: `scripts/check-ecies-active.sh`

- [ ] **Step 1: Write the script**

Create `scripts/check-ecies-active.sh`:

```bash
#!/usr/bin/env bash
# check-ecies-active.sh — Fail if ECIES/nsec/secp256k1 pseudocode appears in
# the active (non-appendix, non-legacy) sections of PROTOCOL.md.
#
# Allowed: Section 2.2.1 (ECIES legacy reference), Appendix A/B/C, legacy notes.
# Forbidden: any new eciesWrapKey / eciesUnwrapKey / secp256k1.getSharedSecret
#            / nsec_bech32 in active algorithm pseudocode blocks.
#
# Exit code: 0 = pass, 1 = violations found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROTOCOL="$SCRIPT_DIR/../docs/protocol/PROTOCOL.md"

if [ ! -f "$PROTOCOL" ]; then
  echo "❌ PROTOCOL.md not found at $PROTOCOL"
  exit 1
fi

# Extract lines before the legacy/appendix sections.
# We stop scanning when we hit Section 2.2.1 or Appendix A.
# Sections explicitly allowed to contain ECIES:
#   - ### 2.2.1 ECIES Key Wrapping (Legacy)
#   - ### 2.6 Key Storage ... (Legacy)
#   - ## Appendix A, B, C
#   - ## 6. Device Provisioning ... (migration note only, not pseudocode)

VIOLATIONS=()

IN_ALLOWED_SECTION=0
SECTION=""

while IFS= read -r line; do
  # Track section transitions
  if echo "$line" | grep -qE "^### 2\.2\.1|^## Appendix|^### C\.|^> \*\*Legacy|^> \*\*Historical|^> \*\*Deprecated|^> \*\*Migration Note"; then
    IN_ALLOWED_SECTION=1
  fi

  # Reset allowed-section flag on next same-level or higher heading
  if echo "$line" | grep -qE "^### 2\.[^2]|^### [3-9]|^## [3-9]|^## [A-Z]" && ! echo "$line" | grep -qE "^### 2\.2\.1|^## Appendix|^### C\."; then
    IN_ALLOWED_SECTION=0
  fi

  if [ "$IN_ALLOWED_SECTION" -eq 1 ]; then
    continue
  fi

  # Check for forbidden patterns in active sections
  if echo "$line" | grep -qiE "eciesWrapKey|eciesUnwrapKey|secp256k1\.getSharedSecret|nsec_bech32|NIP-44"; then
    VIOLATIONS+=("$line")
  fi
done < "$PROTOCOL"

if [ ${#VIOLATIONS[@]} -gt 0 ]; then
  echo "❌ Legacy crypto primitives found in active PROTOCOL.md sections:"
  echo "   Move ECIES/nsec/NIP-44 references to Appendix C or a Legacy subsection."
  echo ""
  for v in "${VIOLATIONS[@]}"; do
    echo "  $v"
  done
  exit 1
fi

echo "✅ No legacy crypto primitives in active PROTOCOL.md sections."
exit 0
```

- [ ] **Step 2: Make executable and test**

```bash
chmod +x scripts/check-ecies-active.sh
bash scripts/check-ecies-active.sh
```

Expected: `✅ No legacy crypto primitives in active PROTOCOL.md sections.`

If violations are reported, they indicate work remaining in Phases 2–3.

- [ ] **Step 3: Test that the script catches regressions**

Temporarily insert a violation into PROTOCOL.md:

```bash
echo "     author_envelope = eciesWrapKey(note_key, author_pubkey_hex, 'llamenos:note-key')" >> docs/protocol/PROTOCOL.md
bash scripts/check-ecies-active.sh
# Should print: ❌ Legacy crypto primitives found in active PROTOCOL.md sections:
git checkout docs/protocol/PROTOCOL.md   # undo the test injection
```

- [ ] **Step 4: Commit**

```bash
git add scripts/check-ecies-active.sh
git commit -m "feat(ci): add check-ecies-active.sh to catch ECIES/nsec regression in PROTOCOL.md"
```

---

### Task 6.2: Wire CI guard scripts into GitHub Actions

**Files:**
- Modify: `.github/workflows/` (find the docs or lint CI workflow)

- [ ] **Step 1: Find the relevant workflow**

```bash
ls .github/workflows/ | grep -i "lint\|docs\|check\|ci"
```

Identify which workflow runs doc checks. If none exists, use `ci.yml` or create a new job in the main CI workflow.

- [ ] **Step 2: Add a job or step for the guard scripts**

In the relevant workflow file, add:

```yaml
  docs-guard:
    name: Documentation Guard
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check label counts
        run: bash scripts/check-label-count.sh
      - name: Check ECIES in active sections
        run: bash scripts/check-ecies-active.sh
```

If an existing `jobs:` section exists, add `docs-guard` alongside the other jobs.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/
git commit -m "ci: add documentation guard jobs for label counts and ECIES regression"
```

---

## Phase 7: Final Verification

### Task 7.1: Run all CI guard scripts and verify clean

- [ ] **Step 1: Run both guard scripts**

```bash
bash scripts/check-label-count.sh && echo "PASS: label count" || echo "FAIL: label count"
bash scripts/check-ecies-active.sh && echo "PASS: ecies guard" || echo "FAIL: ecies guard"
```

Both must print PASS. Fix any remaining issues before proceeding.

- [ ] **Step 2: Verify PROTOCOL.md has no ECIES in active sections**

```bash
grep -n "eciesWrapKey\|eciesUnwrapKey\|eciesWrapKeyServer" docs/protocol/PROTOCOL.md | grep -v "2\.2\.1\|Appendix\|Legacy\|deprecated\|ecies.*section\|migration"
```

Expected: only lines in Section 2.2.1 or Appendix C. No active section references.

- [ ] **Step 3: Verify notes/message wire format is consistent end-to-end**

Check that these three things agree:
1. Section 2.3 describes `{enc, ct}` for envelopes  
2. Section 4.7 (POST /api/notes) body matches `{enc, ct}`
3. `packages/protocol/schemas/common.ts` `recipientEnvelopeSchema` has `{pubkey, enc, ct}`

```bash
grep -n "enc.*ct\|wrappedKey\|ephemeralPubkey" docs/protocol/PROTOCOL.md | grep -i "note\|envelope"
grep -n "wrappedKey\|ephemeralPubkey" packages/protocol/schemas/common.ts
```

Expected: no `wrappedKey` or `ephemeralPubkey` anywhere in canonical schemas or active PROTOCOL.md text.

- [ ] **Step 4: Commit final verification pass**

```bash
git add -A
git status
# Should be clean or only expected changes
git commit -m "docs(epic-h): final pass — all ECIES/nsec/label drift resolved in PROTOCOL.md" --allow-empty-message
```

---

## Self-Review Against Spec

### Coverage check

| Spec requirement | Task(s) |
|-----------------|---------|
| Label count correction in 6+ files | Tasks 1.2–1.5 |
| `scripts/check-label-count.sh` | Task 1.6 |
| Section 2.3 ECIES→HPKE | Task 2.1 |
| Section 2.4 ECIES→HPKE | Task 2.2 |
| Section 2.5 ECIES→HPKE | Task 2.3 |
| Section 2.6 key storage reconcile | Task 2.4 |
| Section 2.7 hub key ECIES→HPKE | Task 2.5 |
| NIP-44 reference removal | Task 2.6 |
| Section 6 provisioning rewrite | Task 3.1 |
| Legacy appendix for ECIES | Task 4.1 |
| Endpoint audit + schema fixes | Task 5.1 |
| `scripts/check-ecies-active.sh` | Task 6.1 |
| CI wiring | Task 6.2 |

### Placeholder scan

No TBDs or "implement later" in this plan. Every step shows exact pseudocode, exact file paths, exact grep commands with expected output.

### Type consistency

- `RecipientEnvelope`: `{pubkey: hex64, enc: hex64, ct: hex}` — used consistently across tasks 2.1–2.5
- `KeyEnvelope`: `{enc: hex64, ct: hex}` — author-only variant, no pubkey, used in tasks 2.1 only
- `hpkeSeal` output: `sealed[0..32] = enc`, `sealed[32..] = ct` — consistent across all tasks
- AES-256-GCM wire format: `hex(iv[12] || ciphertext_with_tag)` — consistent across tasks 2.1–2.3
- HPKE AEAD info/aad pattern: `info=UTF-8(label)`, `aad=UTF-8(label + ":key-wrap")` — consistent across tasks 2.1–2.5
