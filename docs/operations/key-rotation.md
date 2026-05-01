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
