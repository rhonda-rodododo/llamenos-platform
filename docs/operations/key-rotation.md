# Llamenos Signing Key Rotation

## Minisign Release Signing Key

The minisign Ed25519 key is used to sign desktop release artifacts. The public key
is embedded in `apps/desktop/tauri.conf.json` at `plugins.updater.pubkey` (base64-encoded).

### When to Rotate

- Suspected key compromise
- Planned periodic rotation (annually recommended)
- Personnel change (signing operator leaves the project)

### Rotation Procedure

**This is a two-release process.** The transition release bridges the old and new keys.

#### 1. Generate new keypair

```bash
minisign -G -s ~/new-llamenos-release.key -p ~/new-llamenos-release.pub
```

Store the new private key on the same offline media as the old key (USB/air-gapped).

#### 2. Prepare transition release

Update `apps/desktop/tauri.conf.json` with the **new** public key:

```bash
# Encode the new public key as base64
NEW_PUBKEY_B64=$(base64 -w0 < ~/new-llamenos-release.pub)

# Update tauri.conf.json
jq --arg pk "${NEW_PUBKEY_B64}" '.plugins.updater.pubkey = $pk' \
  apps/desktop/tauri.conf.json > tmp.json && mv tmp.json apps/desktop/tauri.conf.json
```

Commit this change as part of the next version release.

#### 3. Sign the transition release with the OLD key

The transition release (containing the new pubkey) must be signed with the OLD key.
Clients running the previous version will verify this update using the old pubkey,
accept it, and then switch to the new pubkey for future updates.

```bash
./scripts/release/sign-artifacts.sh /tmp/llamenos-release-vX.Y.Z /path/to/OLD-llamenos-release.key
```

#### 4. All subsequent releases use the NEW key

After the transition release is published and clients have updated:

```bash
./scripts/release/sign-artifacts.sh /tmp/llamenos-release-vX.Y.Z /path/to/NEW-llamenos-release.key
```

#### 5. Document in audit repo

```bash
cd ~/projects/llamenos-releases
cat > KEY_ROTATION.md << 'EOF'
# Key Rotation Log

| Date | Old Key ID | New Key ID | Transition Version |
|------|-----------|-----------|-------------------|
| YYYY-MM-DD | <first 8 chars of old pubkey> | <first 8 chars of new pubkey> | vX.Y.Z |
EOF
git add KEY_ROTATION.md && git commit -m "docs: key rotation record"
```

#### 6. Destroy old key

After confirming clients have accepted the transition release (monitor update check logs
or wait at least 2 weeks for rollout), securely destroy the old private key:

```bash
shred -u /path/to/OLD-llamenos-release.key
```

### Emergency Rotation (Compromised Key)

If the old key is compromised, the procedure is the same but **urgent**:

1. Generate new key immediately
2. Cut a patch release with the new pubkey, signed with the old key
3. Publish immediately — every hour of delay is a window for the attacker
4. Destroy the compromised key
5. Notify users via the project's security advisory channel

---

## Hub Key Rotation

Each hub has a random 32-byte symmetric key used for hub-wide broadcast encryption. The
hub key is never derived from any identity key — it is pure random bytes. It is wrapped
individually for each hub member using HPKE (RFC 9180, X25519-HKDF-SHA256-AES256-GCM)
with domain label `llamenos:hub-key-wrap`. The server stores only the encrypted envelopes;
it never sees the raw hub key.

### When to Rotate

- A member is removed from the hub (mandatory — prevents departed member from decrypting
  future hub events)
- Suspected key compromise
- Planned periodic rotation (annually recommended)

### Rotation Procedure

Hub key rotation is performed **client-side by an admin**. The server provides
`PUT /api/hubs/:hubId/key` (requires `hubs:manage-keys` permission) to atomically
replace all member envelopes.

#### 1. Generate a new hub key

The admin client generates a new random hub key:

```typescript
const newHubKey = crypto.getRandomValues(new Uint8Array(32))
```

#### 2. Wrap the new hub key for each current member

For each remaining member (excluding any departed member being removed), the admin
client wraps the new hub key using HPKE:

```typescript
// Pseudocode — actual implementation is in packages/crypto via Tauri IPC
const envelope = hpkeSeal(newHubKey, memberPubkey, 'llamenos:hub-key-wrap')
```

A unique ephemeral keypair is generated per recipient per wrap operation.

#### 3. Upload new envelopes to the server

```bash
PUT /api/hubs/:hubId/key
Authorization: Bearer <admin-session-token>
Content-Type: application/json

{
  "envelopes": [
    { "recipientPubkey": "<hex>", "envelope": "<base64url>" },
    ...
  ]
}
```

The server atomically replaces all previous envelopes for this hub. Members who were
not included (e.g., departed members) immediately lose access to new hub events.

#### 4. Verify rotation

Each remaining member's client will fetch the new envelope on the next sync:

```bash
GET /api/hubs/:hubId/key
Authorization: Bearer <member-session-token>
```

#### 5. Document in audit log

Hub key rotation is automatically recorded in the server audit log with the admin's
pubkey, timestamp, and member count. No additional manual documentation is needed.

---

## Device Key Rotation (User Sigchain)

Each user has per-device Ed25519/X25519 keys stored in the platform secure enclave
(Tauri Stronghold, iOS Keychain, or Android Keystore). Device private keys never leave
the device. Authorization of new devices and revocation of old ones is tracked via the
user sigchain — an append-only, hash-chained, Ed25519-signed log.

### When to Rotate a Device Key

- Device is lost or stolen
- Device is being decommissioned
- Suspected compromise of the device enclave

### Rotation Procedure

Device key rotation is handled entirely by the client application via the sigchain flow.
The server is a delivery service for sigchain links; it enforces ordering but does not
validate signatures (signature validation is client-side).

#### 1. Revoke the old device

From another authorized device, append a `device_revoke` sigchain link referencing the
old device ID. This marks the old device's public key as no longer trusted.

#### 2. Re-wrap the user's PUK envelope for remaining devices

The PUK (Per-User Key) is HPKE-wrapped separately for each authorized device. After
revoking a device, the PUK envelope for that device becomes unreachable. On the next
PUK rotation cycle, a new PUK generation is issued and wrapped only for the remaining
authorized devices.

#### 3. Re-encrypt note and message keys (Cascading Lazy Key Rotation)

Llamenos uses cascading lazy key rotation: note/message content keys are re-wrapped
for the new PUK generation on next access, not proactively. No bulk re-encryption is
required at revocation time.

### Adding a New Device

New device authorization uses an ephemeral ECDH provisioning room:

1. Existing authorized device generates an invitation (ephemeral ECDH keypair)
2. New device presents its Ed25519/X25519 public keys
3. Existing device appends a `device_add` sigchain link authorizing the new device
4. The PUK seed is wrapped via HPKE for the new device's X25519 pubkey
5. New device unwraps the PUK and derives its own copy of all content keys

This flow is handled by the client application UI — no manual server-side steps are
required.
