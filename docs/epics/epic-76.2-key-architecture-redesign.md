# Epic 76.2: Cryptographic Key Architecture Redesign

## Problem Statement

The security audit found fundamental flaws in the hub key design described in Epic 76 and the current admin key architecture. These flaws undermine the entire cryptographic model and must be fixed before any Epic 76+ implementation.

**Clean Rewrite Context:** Llamenos is pre-production with no deployed users. The key architecture can be redesigned from scratch without migration concerns.

### Critical Findings

#### Finding 1: Hub Key Derived from Admin nsec (Deterministic Derivation Breaks Rotation)

The current design derives the hub key via HKDF from the admin's nsec:

```typescript
// CURRENT (BROKEN):
hubKey = HKDF-SHA256(adminSecretKey, "llamenos:hub:" + hubId, 32)
```

This is fundamentally broken because:
- **HKDF is deterministic** — the same input always produces the same output
- Rotating the hub key by incrementing a version counter (`"llamenos:hub:" + hubId + ":v2"`) still derives from the same admin nsec
- If the admin nsec is compromised, ALL hub key versions (past and future) are immediately derivable
- Key rotation provides ZERO forward secrecy against admin key compromise
- A single compromise point (admin nsec) unlocks the entire event history

#### Finding 2: Hub Key Shared With All Members

Every hub member (volunteer and admin) receives the same symmetric hub key. This means:
- Any compromised volunteer device has the hub key
- A compromised volunteer can decrypt ALL hub events (call notifications, presence updates, shift changes, settings)
- The hub key provides no access differentiation between roles

#### Finding 3: Admin Key Is a God Key

The admin nsec currently serves as:
- Authentication (Schnorr signatures for API auth)
- Hub key derivation (HKDF source for hub keys)
- Decryption (note admin envelopes, message admin envelopes)
- Event signing (Nostr event signatures)

A single key compromise reveals everything. There is no separation of concerns, no threshold protection, and no ability to isolate one function from another (e.g., compelled identity disclosure vs data decryption).

#### Finding 4: NIP-44 Misused for Hub Encryption

The current Epic 76 design passes the raw hub key where NIP-44 expects an ECDH-derived conversation key:

```typescript
// CURRENT (INCORRECT):
nip44.encrypt(plaintext, hubKey) // hubKey is a raw symmetric key
```

NIP-44's `encrypt/decrypt` functions expect a conversation key derived from `nip44.getConversationKey(sk, pk)`, which performs ECDH. Passing a raw symmetric key bypasses NIP-44's key derivation and may produce incorrect or insecure results depending on the implementation.

## Goals

1. Replace deterministic hub key derivation with random key generation
2. Design proper key distribution and rotation mechanism
3. Separate admin identity from admin decryption capability
4. Fix NIP-44 usage for hub-wide vs targeted encryption
5. Support multiple admins with independent decryption keys
6. Define volunteer key retirement procedure on departure

## New Key Hierarchy

```
Admin nsec (secp256k1) — IDENTITY + SIGNING ONLY
    │
    ├─► Schnorr signatures (API authentication)
    ├─► Nostr event signing (NIP-01)
    ├─► Hub administration (signing invite/revocation events)
    │
    └─► (Does NOT derive hub key)
        (Does NOT decrypt note/message content directly)

Admin Decryption Key (SEPARATE secp256k1 keypair)
    │
    ├─► Note admin envelopes (per-note key wrapped via ECIES)
    ├─► Message admin envelopes (per-message key wrapped via ECIES)
    ├─► Audit log decryption (server encrypts for admin decryption pubkey)
    ├─► Metadata decryption (encrypted assignments, schedules)
    │
    └─► Stored separately from nsec
        ├─► Can be on hardware key / air-gapped device
        ├─► Can be rotated independently of identity
        └─► If nsec is compelled, decryption key may remain protected

Hub Key (random 32 bytes — NOT derived from any key)
    │
    ├─► Nostr event content encryption (XChaCha20-Poly1305 with HKDF)
    ├─► Presence broadcast encryption
    ├─► Ephemeral hub-wide data
    │
    └─► Distribution: ECIES-wrapped individually per member
        ├─► Volunteer A envelope (ECIES with volunteer A pubkey)
        ├─► Volunteer B envelope (ECIES with volunteer B pubkey)
        ├─► Admin 1 envelope (ECIES with admin 1 decryption pubkey)
        └─► Admin 2 envelope (ECIES with admin 2 decryption pubkey)

Per-Note Key (random 32 bytes) — UNCHANGED, already correct
    ├─► Content encrypted with XChaCha20-Poly1305
    ├─► Key wrapped via ECIES for author
    └─► Key wrapped via ECIES for each admin's decryption pubkey

Per-Message Key (random 32 bytes) — NEW, matches note pattern
    ├─► Content encrypted with XChaCha20-Poly1305
    ├─► Key wrapped via ECIES for assigned volunteer
    └─► Key wrapped via ECIES for each admin's decryption pubkey
```

## Technical Design

### Phase 1: Hub Key as Random Secret

**Current (broken):**
```typescript
hubKey = HKDF(sha256, adminSecret, 'llamenos:hub:' + hubId, 32);
```

**New (correct):**
```typescript
hubKey = crypto.getRandomValues(new Uint8Array(32));
```

The hub key is a random 32-byte symmetric key with no mathematical relationship to any identity key. This means:
- Compromise of admin nsec does NOT reveal the hub key
- Each rotation generates a truly independent key
- Forward secrecy: old keys and new keys are cryptographically unrelated

#### Hub Key Generation

```typescript
// src/client/lib/hub-key-manager.ts

export async function generateHubKey(): Promise<Uint8Array> {
  return crypto.getRandomValues(new Uint8Array(32));
}
```

#### Hub Key Distribution

When admin creates a hub or invites a member, the hub key is wrapped individually for each member:

```typescript
import { DOMAIN_LABELS } from '@shared/crypto-labels';

export async function wrapHubKeyForMember(
  hubKey: Uint8Array,
  memberPubkey: string,
): Promise<RecipientEnvelope> {
  return encryptForPublicKey(
    hubKey,
    memberPubkey,
    DOMAIN_LABELS.HUB_KEY_WRAP,
  );
}

export async function unwrapHubKey(
  envelope: RecipientEnvelope,
  memberSecretKey: Uint8Array,
): Promise<Uint8Array> {
  return decryptWithSecretKey(
    envelope,
    memberSecretKey,
    DOMAIN_LABELS.HUB_KEY_WRAP,
  );
}
```

#### Hub Key Storage

Hub key envelopes are stored on the server. Each member has their own encrypted copy:

```typescript
interface HubKeyStore {
  hubId: string;
  version: number;
  envelopes: {
    [pubkey: string]: RecipientEnvelope; // ECIES-wrapped hub key
  };
  createdAt: number;
  createdBy: string; // Admin pubkey who generated this key version
}
```

The server stores encrypted blobs only — it cannot derive the hub key. Distribution options:

1. **REST API:** `GET /api/hubs/:hubId/keys` — returns envelopes for the requesting user's pubkey
2. **Nostr DM:** Admin sends NIP-44 encrypted message containing the wrapped hub key to each member (requires Epic 76 relay infrastructure)

For initial implementation (before Epic 76 relay is ready), use the REST API path. After Epic 76, hub key distribution can move to Nostr DMs for reduced server visibility.

#### Hub Key Rotation

Rotation generates a completely new random key with no mathematical link to the old key:

```typescript
export async function rotateHubKey(
  hubId: string,
  currentMembers: string[], // pubkeys of members who should receive new key
  adminSecretKey: Uint8Array,
): Promise<{ newKey: Uint8Array; version: number; envelopes: Record<string, RecipientEnvelope> }> {
  // 1. Generate entirely new random key
  const newKey = crypto.getRandomValues(new Uint8Array(32));

  // 2. Wrap for each current member
  const envelopes: Record<string, RecipientEnvelope> = {};
  for (const pubkey of currentMembers) {
    envelopes[pubkey] = await wrapHubKeyForMember(newKey, pubkey);
  }

  // 3. Publish rotation event (encrypted with OLD key so current members can read it)
  // This notifies clients to fetch the new key version
  // Event contains only: { action: 'key-rotated', newVersion: N }
  // Actual new key fetched separately via REST API or Nostr DM

  return { newKey, version: currentVersion + 1, envelopes };
}
```

**Key version management on the client:**

```typescript
interface HubKeyBundle {
  hubId: string;
  currentVersion: number;
  keys: Map<number, {
    key: Uint8Array;
    activatedAt: number;
    deactivatedAt?: number;
  }>;
}
```

Clients store the full key history so they can decrypt historical events encrypted with older key versions. Each Nostr event includes a `key-version` tag indicating which hub key version was used.

### Phase 2: Multi-Admin Support

With the new architecture, supporting multiple admins is straightforward — each admin has their own decryption key, and per-note/per-message symmetric keys are wrapped individually for each admin.

#### Multi-Admin Note Encryption

```
noteKey = random 32 bytes
encryptedContent = XChaCha20-Poly1305(noteKey, noteContent)

authorEnvelope    = ECIES(noteKey, authorPubkey)      // Author can decrypt
adminEnvelope_1   = ECIES(noteKey, admin1DecPubkey)   // Admin 1 can decrypt
adminEnvelope_2   = ECIES(noteKey, admin2DecPubkey)   // Admin 2 can decrypt
```

Storage cost: one additional envelope (~100 bytes) per admin per note. For a hub with 3 admins and 10,000 notes, this adds ~2MB — acceptable.

#### Multi-Admin Hub Key Distribution

Each admin receives their own ECIES-wrapped copy of the hub key:

```typescript
// Hub key wrapped for each admin's DECRYPTION pubkey (not their identity nsec)
for (const admin of admins) {
  envelopes[admin.decryptionPubkey] = await wrapHubKeyForMember(
    hubKey,
    admin.decryptionPubkey,
  );
}
```

#### Admin Onboarding/Offboarding

**New admin onboarding:**
1. Existing admin generates invite for new admin
2. New admin registers with their own nsec + separate decryption keypair
3. Existing admin wraps hub key for new admin's decryption pubkey
4. Existing admin re-wraps historical note/message keys for new admin (optional — can be done lazily on access)
5. Requires at least one existing admin to be online

**Admin offboarding:**
1. Remove admin from hub
2. Rotate hub key (new random key, distributed to remaining members)
3. Historical notes/messages remain accessible to departed admin (they have envelopes from before departure)
4. New notes/messages are NOT accessible to departed admin (no envelope created for them)

### Phase 3: Separate Admin Identity from Decryption

This is the most impactful security improvement — separating authentication from decryption means a compelled identity disclosure does not automatically reveal encrypted data.

#### Two Keypairs Per Admin

```
Admin Identity (nsec) — Used for:
    ├─► API authentication (Schnorr signatures)
    ├─► Nostr event signing
    ├─► WebAuthn credential binding
    └─► Hub administration (invites, revocations)

Admin Decryption Key — Used for:
    ├─► Decrypting note admin envelopes
    ├─► Decrypting message admin envelopes
    ├─► Decrypting audit log entries
    ├─► Unwrapping hub key
    └─► Decrypting encrypted metadata
```

**Why separate?** Consider a subpoena scenario:
- Subpoena demands admin identity → admin nsec is disclosed
- Attacker can authenticate as admin and sign events
- But attacker CANNOT decrypt notes, messages, or audit logs
- Decryption key stored on a separate device (hardware key, air-gapped machine)

**Implementation:**

```typescript
// Admin bootstrap generates TWO keypairs
export async function bootstrapAdmin(): Promise<AdminKeyBundle> {
  // Identity keypair (existing)
  const identitySecret = generatePrivateKey();
  const identityPubkey = getPublicKey(identitySecret);

  // Decryption keypair (NEW)
  const decryptionSecret = generatePrivateKey();
  const decryptionPubkey = getPublicKey(decryptionSecret);

  return {
    identity: {
      nsec: nip19.nsecEncode(identitySecret),
      npub: nip19.npubEncode(identityPubkey),
    },
    decryption: {
      secretKey: decryptionSecret, // Store separately!
      pubkey: decryptionPubkey,
    },
  };
}
```

**Server storage:**
- Server knows admin's identity pubkey (for auth verification) AND decryption pubkey (for creating admin envelopes)
- Server does NOT have either secret key
- When server creates audit log entries, it encrypts for the admin's decryption pubkey

**Client storage:**
- Identity nsec: PIN-encrypted in local key store (existing pattern)
- Decryption secret: PIN-encrypted in local key store OR on hardware key
- Both can be backed up separately

#### Upgrade Path for `bootstrap-admin`

The `bun run bootstrap-admin` script currently generates one keypair. Update to generate two:

```
$ bun run bootstrap-admin

Admin Identity:
  nsec: nsec1abc...
  npub: npub1def...

Admin Decryption Key:
  Secret: hex1234...
  Pubkey: hex5678...

⚠️  Store the decryption key SEPARATELY from the identity key.
    Consider a hardware security key or air-gapped device for the decryption secret.

Set in your deployment:
  ADMIN_PUBKEY=def...
  ADMIN_DECRYPTION_PUBKEY=5678...
```

### Phase 4: Correct Nostr Event Encryption

Fix the NIP-44 misuse identified in the audit.

#### Hub-Wide Broadcasts (Use XChaCha20-Poly1305 Directly)

For events that all hub members should see (call notifications, presence, shift updates), use the hub key as a symmetric encryption key — NOT nip44.encrypt.

```typescript
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { DOMAIN_LABELS } from '@shared/crypto-labels';

export function encryptForHub(
  plaintext: string,
  hubKey: Uint8Array,
): { ciphertext: string; nonce: string; keyVersion: number } {
  // Random nonce per event
  const nonce = crypto.getRandomValues(new Uint8Array(24));

  // Derive per-event key from hub key + nonce using HKDF
  const eventKey = hkdf(sha256, hubKey, nonce, DOMAIN_LABELS.HUB_EVENT, 32);

  // Encrypt with XChaCha20-Poly1305
  const cipher = xchacha20poly1305(eventKey, nonce);
  const ct = cipher.encrypt(new TextEncoder().encode(plaintext));

  return {
    ciphertext: bytesToHex(ct),
    nonce: bytesToHex(nonce),
    keyVersion: currentHubKeyVersion,
  };
}

export function decryptFromHub(
  ciphertext: string,
  nonce: string,
  hubKey: Uint8Array,
): string {
  const nonceBytes = hexToBytes(nonce);
  const eventKey = hkdf(sha256, hubKey, nonceBytes, DOMAIN_LABELS.HUB_EVENT, 32);
  const cipher = xchacha20poly1305(eventKey, nonceBytes);
  const plaintext = cipher.decrypt(hexToBytes(ciphertext));
  return new TextDecoder().decode(plaintext);
}
```

**Why not NIP-44?** NIP-44 is designed for two-party conversation encryption using ECDH. The hub key is a shared symmetric key, not a conversation key. Using NIP-44 with a raw symmetric key would:
- Bypass NIP-44's ECDH key derivation
- Potentially produce incorrect padding/versioning behavior
- Violate the NIP-44 specification

**Nostr event format for hub-encrypted content:**

```json
{
  "kind": 30078,
  "pubkey": "<publisher pubkey>",
  "created_at": 1740000000,
  "tags": [
    ["d", "<hub_id>"],
    ["t", "llamenos:call:ring"],
    ["key-version", "3"]
  ],
  "content": "<hex ciphertext>:<hex nonce>",
  "sig": "<schnorr signature>"
}
```

The `key-version` tag tells the client which hub key version to use for decryption.

#### Targeted Messages (Use NIP-44 Correctly)

For events intended for a specific recipient (hub key distribution, volunteer-specific assignments), use NIP-44 as designed:

```typescript
import { nip44 } from 'nostr-tools/nip44';

export function encryptForRecipient(
  plaintext: string,
  senderSecretKey: Uint8Array,
  recipientPubkey: string,
): string {
  const conversationKey = nip44.v2.utils.getConversationKey(
    senderSecretKey,
    recipientPubkey,
  );
  return nip44.v2.encrypt(plaintext, conversationKey);
}

export function decryptFromSender(
  ciphertext: string,
  recipientSecretKey: Uint8Array,
  senderPubkey: string,
): string {
  const conversationKey = nip44.v2.utils.getConversationKey(
    recipientSecretKey,
    senderPubkey,
  );
  return nip44.v2.decrypt(ciphertext, conversationKey);
}
```

#### Event Signature Verification

All clients MUST verify Nostr event signatures before processing content:

```typescript
import { verifyEvent } from 'nostr-tools/pure';

function processEvent(event: NostrEvent): void {
  // 1. Verify signature (NIP-01)
  if (!verifyEvent(event)) {
    console.warn('Rejected event with invalid signature:', event.id);
    return;
  }

  // 2. Verify pubkey is authorized hub member
  if (!isAuthorizedPublisher(event.pubkey)) {
    console.warn('Rejected event from unauthorized pubkey:', event.pubkey);
    return;
  }

  // 3. Check event freshness (replay protection)
  if (Date.now() / 1000 - event.created_at > MAX_EVENT_AGE_SECONDS) {
    console.warn('Rejected stale event:', event.id);
    return;
  }

  // 4. Decrypt and process
  const content = decryptFromHub(event.content, hubKey);
  handleEventContent(event, content);
}
```

### Phase 5: Volunteer Key Retirement

When a volunteer departs (friendly or hostile), their access to future hub events must be immediately revoked.

#### Departure Procedure

```
1. Admin deactivates volunteer via UI
   │
2. Server revokes all sessions (existing)
   │
3. Admin client initiates hub key rotation
   ├─► Generate new random 32-byte hub key
   ├─► Wrap new key for ALL remaining members (excluding departed volunteer)
   ├─► Upload new key envelopes to server
   │
4. Publish rotation event (encrypted with OLD hub key)
   ├─► All current members (including departed, if still connected) see this
   ├─► Event contains: { action: 'key-rotated', newVersion: N, reason: 'member-departure' }
   ├─► Departed volunteer sees the rotation but cannot fetch the new key
   │
5. Remove departed volunteer's pubkey from relay authorized list
   │
6. New events use new hub key version
   └─► Departed volunteer cannot decrypt (missing new key)

Historical events:
   ├─► Encrypted with old hub key → departed volunteer can still decrypt
   ├─► This is acceptable: they were a member when those events occurred
   └─► Admin can optionally re-encrypt historical records (expensive, rarely needed)
```

#### Optional: Re-encrypt Historical Records

If a hostile departure warrants removing historical access:

1. Admin fetches all historical notes authored during the departed volunteer's tenure
2. For each note: re-wrap the per-note key, excluding the departed volunteer's envelope
3. Upload updated envelopes to server
4. This is expensive (O(notes)) and only needed for hostile departures

**Recommendation:** Do not re-encrypt by default. The departed volunteer authored those notes — revoking access to their own work is of limited value. Reserve re-encryption for adversarial scenarios.

## Files to Modify

### New Files

| File | Purpose |
|------|---------|
| `src/shared/crypto-labels.ts` | Authoritative domain separation labels (shared, Phase 1 of Epic 76.0) |
| `src/client/lib/hub-key-manager.ts` | Hub key generation, wrapping, unwrapping, rotation |
| `src/client/lib/nostr/hub-encryption.ts` | Hub-wide event encryption/decryption (XChaCha20-Poly1305) |
| `src/client/lib/nostr/targeted-encryption.ts` | NIP-44 targeted message encryption/decryption |
| `docs/security/KEY_ARCHITECTURE.md` | Key hierarchy documentation |

### Modified Files

| File | Changes |
|------|---------|
| `src/client/lib/crypto.ts` | Update ECIES to accept decryption pubkey, update domain labels |
| `src/worker/lib/crypto.ts` | Mirror client crypto changes |
| `src/client/lib/key-manager.ts` | Store admin decryption key separately |
| `src/client/lib/auth.tsx` | Add decryption pubkey to auth context |
| `src/worker/durable-objects/identity-do.ts` | Store member decryption pubkeys |
| `src/worker/durable-objects/records-do.ts` | Wrap note keys for multiple admin decryption pubkeys |
| `src/worker/durable-objects/conversation-do.ts` | Wrap message keys for multiple admin decryption pubkeys |
| `scripts/bootstrap-admin.ts` | Generate two keypairs (identity + decryption) |
| `docs/protocol/llamenos-protocol.md` | Update key hierarchy sections |

## Implementation Phases

### Phase 1: Hub Key as Random Secret (1 week)

**Tasks:**

1. Implement `generateHubKey()` — random 32 bytes
2. Implement `wrapHubKeyForMember()` — ECIES wrapping
3. Implement `unwrapHubKey()` — ECIES unwrapping
4. Implement hub key storage (server-side encrypted envelopes)
5. Implement hub key distribution via REST API
6. Implement hub key rotation (generate new, wrap for remaining members)
7. Implement client-side key version management
8. Update admin hub creation flow to generate random hub key
9. Update volunteer invite flow to wrap hub key for new member
10. E2E test: create hub, invite volunteer, verify both can decrypt hub-encrypted content

**Deliverables:**
- Hub key is random (not derived from admin nsec)
- Hub key distribution and rotation working
- Key versioning for historical event decryption

### Phase 2: Multi-Admin Note/Message Encryption (1 week)

**Tasks:**

1. Update note encryption to wrap per-note key for each admin's decryption pubkey
2. Update message encryption to wrap per-message key for each admin's decryption pubkey
3. Update `RecordsDO` to store multiple admin envelopes per note
4. Update `ConversationDO` to store multiple admin envelopes per message
5. Update admin dashboard to decrypt using admin's decryption key
6. E2E test: create note with two admins, verify both can decrypt

**Deliverables:**
- Notes and messages encrypted for multiple admins independently
- Any admin can decrypt without needing other admins' keys

### Phase 3: Separate Admin Identity from Decryption (1 week)

**Tasks:**

1. Update `bootstrap-admin` to generate two keypairs
2. Add `ADMIN_DECRYPTION_PUBKEY` to deployment config
3. Update key-manager to store decryption key separately
4. Update auth context to track both identity and decryption pubkeys
5. Update server to use decryption pubkey for creating admin envelopes
6. Update all encryption callsites to use decryption pubkey (not identity pubkey)
7. E2E test: admin authenticates with identity key, decrypts with decryption key

**Deliverables:**
- Admin nsec used only for signing/auth
- Admin decryption key used only for decryption
- Two keys can be stored on different devices

### Phase 4: Correct Nostr Event Encryption (0.5 weeks)

**Tasks:**

1. Implement `encryptForHub()` — XChaCha20-Poly1305 with HKDF key derivation
2. Implement `decryptFromHub()` — matching decryption
3. Implement `encryptForRecipient()` — NIP-44 with proper conversation key
4. Implement `decryptFromSender()` — NIP-44 decryption
5. Add event signature verification to all client event processors
6. Add `key-version` tag to all hub-encrypted Nostr events
7. E2E test: publish encrypted event, verify correct decryption with matching key version

**Deliverables:**
- Hub encryption uses XChaCha20-Poly1305 (not NIP-44)
- Targeted encryption uses NIP-44 correctly
- All events verified before processing

### Phase 5: Volunteer Key Retirement (0.5 weeks)

**Tasks:**

1. Implement volunteer departure flow (admin deactivates → hub key rotation)
2. Remove departed volunteer from relay authorized pubkey list
3. Implement rotation event publication (encrypted with old key)
4. Client handles key rotation notification (fetches new key, stores version history)
5. E2E test: depart volunteer, verify they cannot decrypt new events, CAN decrypt old events

**Deliverables:**
- Volunteer departure triggers automatic hub key rotation
- Departed volunteer excluded from new key distribution
- Historical event access preserved (acceptable trade-off)

## Security Analysis

### Comparison: Old vs New Architecture

| Property | Old (Broken) | New (Fixed) |
|----------|-------------|-------------|
| Hub key derivation | Deterministic from admin nsec | Random 32 bytes |
| Admin nsec compromise → hub key | All versions exposed | Hub key NOT exposed |
| Volunteer compromise → hub events | All events decryptable | All events decryptable (inherent to shared key) |
| Hub key rotation | Meaningless (same source) | True independence (new random key) |
| Admin identity vs decryption | Single key for both | Separate keypairs |
| Multi-admin | Not supported | Each admin has independent decryption key |
| NIP-44 usage | Raw symmetric key (incorrect) | ECDH conversation key (correct) |
| Forward secrecy for hub events | None (deterministic derivation) | Per-rotation forward secrecy |

### Remaining Acceptable Risks

1. **Hub key shared with all members** — any member can decrypt hub events. This is inherent to the design (all members need to read hub broadcasts). Mitigation: rapid hub key rotation on member departure.

2. **Server sees encrypted envelopes** — the server stores ECIES-wrapped hub keys. It cannot decrypt them but can observe who has an envelope (metadata). Mitigation: move hub key distribution to Nostr DMs after Epic 76.

3. **Historical events accessible to departed members** — members who had the old hub key can still decrypt old events. Mitigation: events are ephemeral (24h retention on relay), accept trade-off for notes (author has legitimate access to their own work).

## Dependencies

- **Blocked by:** Epic 76.0 (security foundations — domain separation labels)
- **Blocks:** Epic 76 (Nostr relay sync — needs correct hub key architecture), Epic 74 (E2EE messaging — needs correct per-message key wrapping for multiple admins), Epic 75 (native clients — needs correct key hierarchy), Epic 77 (metadata encryption — needs admin decryption key separation)

## Success Criteria

1. **Hub Key Security**
   - [ ] Hub key is random 32 bytes (not derived from admin nsec)
   - [ ] Hub key rotation generates truly independent keys
   - [ ] Compromise of admin nsec does NOT reveal hub key
   - [ ] Hub key distributed via ECIES-wrapped individual envelopes

2. **Multi-Admin**
   - [ ] Multiple admins supported with independent decryption keys
   - [ ] Each admin can decrypt notes/messages without other admins' keys
   - [ ] Admin onboarding wraps existing keys for new admin
   - [ ] Admin offboarding rotates hub key, excludes departed admin

3. **Identity/Decryption Separation**
   - [ ] Admin nsec used ONLY for signatures and authentication
   - [ ] Separate decryption keypair used for all decryption operations
   - [ ] `bootstrap-admin` generates both keypairs
   - [ ] Two keys can be stored on separate devices

4. **Correct Encryption**
   - [ ] Hub-wide events use XChaCha20-Poly1305 with HKDF (not NIP-44)
   - [ ] Targeted messages use NIP-44 with proper ECDH conversation key
   - [ ] All Nostr events verified (signature + pubkey authorization) before processing
   - [ ] Hub key version tracked per event

5. **Volunteer Retirement**
   - [ ] Volunteer departure triggers hub key rotation
   - [ ] Departed volunteer cannot decrypt new events
   - [ ] Departed volunteer can decrypt historical events (acceptable)
   - [ ] Departed volunteer removed from relay authorized list

## Open Questions

1. **Admin decryption key hardware storage**: Should we require hardware key (YubiKey, etc.) for admin decryption key in production? Recommendation: Recommend but don't require. Document the option. Hardware keys add significant operational complexity for small organizations.

2. **Hub key distribution timing**: When a new volunteer accepts an invite, how quickly do they receive the hub key? Via REST API: immediately on invite acceptance. Via Nostr DM: requires admin to be online. Recommendation: REST API for initial distribution, with Nostr DM as an enhancement after Epic 76.

3. **Key ceremony for multi-admin hub key rotation**: If there are 3 admins and one departs, do all remaining admins need to be online? No — any single remaining admin can generate the new hub key and wrap it for the others. Recommendation: Designate a "primary admin" who performs key ceremonies, with any admin as fallback.

4. **Backward compatibility with single-admin hubs**: Should single-admin hubs use the same multi-admin infrastructure? Recommendation: Yes — treat single-admin as a special case of multi-admin (list of one). This avoids maintaining two code paths.

5. **Audit log encryption for multi-admin**: Server creates audit entries encrypted for admin decryption pubkeys. With multiple admins, server must encrypt for each. Should all admins see all audit logs? Recommendation: Yes — all admins have full audit visibility. Role-based audit access adds complexity with minimal security benefit at this stage.

## Estimated Effort

Large — 4 weeks total. This is a fundamental rewrite of the key management layer affecting crypto, storage, auth, and UI. However, the pre-production context means no migration code, which significantly reduces complexity.

## Execution Context

### Current encryptNoteV2 Signature
- `src/client/lib/crypto.ts` L140-161 — `encryptNoteV2(payload: NotePayload, authorPubkey: string, adminPubkey: string): EncryptedNoteV2`
- Returns `{ encryptedContent, authorEnvelope, adminEnvelope }` — single admin envelope
- **Change to:** `encryptNoteV2(payload, authorPubkey, adminPubkeys: string[]): EncryptedNoteV2` with `adminEnvelopes: NoteEnvelope[]`

### RecordsDO Note Storage
- `src/worker/durable-objects/records-do.ts` — notes stored with `adminEnvelope` (singular) field
- **Change to:** `adminEnvelopes` (array) — single admin = array of one

### ConversationDO Message Storage
- `src/worker/durable-objects/conversation-do.ts` — messages need same envelope pattern
- Current message storage: per-conversation arrays; needs per-message keys (`message:${id}`)

### Bootstrap Script
- `scripts/bootstrap-admin.ts` — currently generates one keypair; needs identity + decryption separation
- Output format: `ADMIN_PUBKEY=<identity>` + `ADMIN_DECRYPTION_PUBKEY=<decryption>` (new env var)

### Auth Context
- `src/client/lib/auth.tsx` — `AuthState` interface has `adminPubkey: string`
- **Add:** `adminDecryptionPubkey: string` field
- `/api/auth/me` endpoint returns admin pubkey; needs to also return decryption pubkey

### File Crypto Pattern to Reuse
- `src/client/lib/file-crypto.ts` L164-208 — `encryptFile()` already does multi-recipient ECIES wrapping
- `wrapKeyForPubkey()` at L18-52 — reuse this pattern for hub key wrapping (change domain label)
