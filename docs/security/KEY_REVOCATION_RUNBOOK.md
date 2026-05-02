# Key Revocation Runbook

**Version:** 2.0
**Date:** 2026-05-02

Operational procedures for emergency key revocation, rotation, and compromise response in Llamenos deployments.

**Audience**: Administrators responsible for operating a Llamenos instance.

**Related documents**:
- [Crypto Architecture](CRYPTO_ARCHITECTURE.md) — Key hierarchy and cryptographic protocols
- [Threat Model](THREAT_MODEL.md) — Threat analysis and trust boundaries
- [Incident Response](INCIDENT_RESPONSE.md) — General incident response procedures
- [Deployment Hardening](DEPLOYMENT_HARDENING.md) — Infrastructure security

**Conventions**: Commands assume a Docker Compose deployment in `/opt/llamenos/deploy/docker/`. All commands should be run as the `deploy` user unless otherwise noted.

---

## Table of Contents

1. [Admin Key Compromise Response](#1-admin-key-compromise-response)
2. [User Departure and Device Revocation](#2-user-departure-and-device-revocation)
3. [Device Seizure Response](#3-device-seizure-response)
4. [Hub Key Rotation Ceremony](#4-hub-key-rotation-ceremony)
5. [PUK Rotation on Departure](#5-puk-rotation-on-departure)
6. [Response Timeframe Summary](#6-response-timeframe-summary)

---

## 1. Admin Key Compromise Response

The admin device keys are the most privileged credentials in the system. Compromise grants the attacker the ability to decrypt all admin-wrapped note envelopes, all admin-wrapped message envelopes, and (if the admin held the hub key) all hub-encrypted Nostr events. This is the highest-severity key compromise scenario.

**Responsible party**: The administrator (or a designated backup administrator with access to deployment infrastructure).

### 1.1 Immediate Actions (within 1 hour)

1. **Generate a new admin keypair** on a trusted device (not the compromised device):
   ```bash
   bun run bootstrap-admin
   ```
   This generates new Ed25519 signing + X25519 encryption keys. Record the new public keys securely.

2. **Update the deployment configuration** with the new admin public key:
   ```bash
   cd /opt/llamenos/deploy/docker
   sed -i "s|^ADMIN_PUBKEY=.*|ADMIN_PUBKEY=<new_pubkey>|" .env
   ```

3. **Redeploy the application**:
   ```bash
   docker compose restart app
   ```

4. **Verify the deployment** is running with the new key:
   ```bash
   docker compose exec app curl -sf http://localhost:3000/api/health/ready
   ```

5. **Deauthorize the compromised device** via sigchain. Publish a `remove-device` sigchain entry from another authorized admin device, referencing the compromised device's pubkey.

6. **Begin hub key rotation** immediately (see [Section 4](#4-hub-key-rotation-ceremony)).

### 1.2 Short-Term Actions (within 24 hours)

7. **Complete hub key rotation** (Section 4).

8. **Rotate PUK** for the admin user — generate new PUK seed, HPKE-wrap for remaining authorized devices, publish `rotate-puk` sigchain entry.

9. **Re-wrap all admin note envelopes** with the new admin X25519 pubkey. Each note's admin envelope must be re-HPKE-wrapped. Notes whose authors are offline cannot be re-wrapped until those users reconnect. Track progress in the admin UI.

10. **Re-wrap all admin message envelopes** similarly.

11. **Review the audit log** for anomalous access during the compromise window:
    - Unusual login times or IP addresses
    - Bulk data access or export
    - Settings or configuration changes
    - User account modifications

### 1.3 Assessment

12. **Determine what data was accessible**. The compromised admin key could decrypt:
    - All note envelopes HPKE-wrapped for the admin's X25519 pubkey
    - All message envelopes HPKE-wrapped for the admin
    - If the admin held the hub key: all hub-encrypted Nostr events until hub key rotation

13. **Assess GDPR notification obligations**. If personal data may have been exposed, notify the supervisory authority within 72 hours.

### 1.4 Verification Checklist

- [ ] New admin keypair is active — admin can authenticate with new Ed25519 key
- [ ] Old admin device is deauthorized via sigchain `remove-device` entry
- [ ] Hub key has been rotated — test by publishing a hub event; active members can decrypt
- [ ] PUK rotated — old PUK seed excluded from new device wrapping
- [ ] All active user sessions are functional
- [ ] Audit log shows compromise response actions
- [ ] GDPR notification filed (if applicable) within 72 hours
- [ ] Re-wrapping progress tracked

---

## 2. User Departure and Device Revocation

When a user leaves the organization, their devices must be deauthorized via sigchain and they must be excluded from future key distributions.

**Responsible party**: An administrator.

### 2.1 Friendly Departure

1. **Deactivate the user** via the admin UI. This immediately revokes all active sessions.

2. **Deauthorize all user devices** via sigchain. Publish `remove-device` entries for each of the user's authorized devices. This is the authoritative record that these devices are no longer trusted.

3. **Rotate the hub key** (see [Section 4](#4-hub-key-rotation-ceremony)). The departed user does NOT receive the new key.

4. **Rotate PUK for affected data** (see [Section 5](#5-puk-rotation-on-departure)) — exclude the departed user from future PUK seed distributions.

5. **Verify post-departure access boundaries**:
   - Departed user CAN decrypt notes they authored (they have the author envelope keys)
   - Departed user CANNOT decrypt new hub events (new hub key)
   - Departed user CANNOT decrypt other users' notes (they never had those HPKE envelopes)
   - Departed user CANNOT access the application (sessions revoked, devices deauthorized)

6. **Document the departure** in the audit log.

#### Verification Checklist

- [ ] User is deactivated (status: inactive)
- [ ] All user devices deauthorized via sigchain
- [ ] No active sessions remain
- [ ] Hub key rotated — departed user excluded
- [ ] At least one remaining member confirms they can decrypt new hub events
- [ ] Departure documented in audit log

### 2.2 Hostile Departure

The user is leaving on bad terms, has been terminated, or is suspected of acting against the organization.

1. **Deactivate the user immediately** via admin UI. If UI is unavailable:
   ```bash
   docker compose exec postgres psql -U llamenos -d llamenos -c "
     UPDATE users SET active = false
     WHERE signing_pubkey = '<user_pubkey>';
   "
   docker compose restart app
   ```

2. **Deauthorize all devices via sigchain** — publish `remove-device` entries immediately.

3. **Rotate the hub key immediately** (Section 4).

4. **Rotate PUK** (Section 5).

5. **Revoke all WebAuthn credentials** for the user's devices.

6. **Conduct an access assessment**:
   - What notes did they author or have access to?
   - What hub events were encrypted with keys they possessed?
   - Did they have admin-level access at any point?
   - Review audit logs for data exfiltration patterns.

7. **If the user was an admin**: Treat as admin key compromise (Section 1).

8. **Assess GDPR notification obligations** based on accessible data.

#### Verification Checklist

- [ ] User deactivated — no active sessions
- [ ] All devices deauthorized via sigchain
- [ ] Hub key rotated — departed user excluded
- [ ] PUK rotated — departed user excluded
- [ ] All WebAuthn credentials revoked
- [ ] Access assessment documented
- [ ] GDPR notification filed (if applicable)

---

## 3. Device Seizure Response

A user's device has been physically seized. The threat is physical access to extract device keys from platform secure storage.

### 3.1 Panic Wipe (User Action)

If the user still has momentary access before seizure:

1. **Lock the app** (triggers zeroization of device keys from Rust CryptoState/MobileState).
2. On desktop (Tauri): Close the application — Stronghold seals on shutdown.
3. On mobile: Force-quit the app.

### 3.2 Hub-Side Response (Administrator Action)

Whether or not the panic action was taken, assume worst case:

4. **Deactivate the user** immediately via admin UI.

5. **Deauthorize the seized device** via sigchain (`remove-device` entry). If the user has other devices, only the seized device needs deauthorization.

6. **Rotate the hub key** (Section 4).

7. **Revoke WebAuthn credentials** for the seized device.

### 3.3 PIN Protection Assessment

Device private keys are encrypted under a PIN-derived key (PBKDF2-SHA256, 600K iterations).

| PIN Length | Brute-force time (offline, GPU) | Assessment |
|------------|----------------------------------------------|------------|
| 6 digits | Hours to days | Marginal |
| 8 digits | Days to weeks | Provides meaningful time buffer |

PIN protection is a delay mechanism, not a permanent barrier. Hub key rotation must complete before a well-funded adversary cracks the PIN. For 6–8 digit PINs, begin hub key rotation within 1 hour of confirmed device seizure.

### 3.4 Post-Seizure Re-Onboarding

If the user continues with the organization on a new device:

8. Generate a new invite for the user.
9. User generates new device keys on new device.
10. Authorize new device via sigchain (signed by admin or another of the user's authorized devices).
11. User's old notes remain accessible to admin (admin envelope). The user can access historical notes if the CLKR chain is intact and their new device receives the current PUK seed.

---

## 4. Hub Key Rotation Ceremony

The hub key is a shared symmetric key used to encrypt Nostr relay events broadcast to all members. Rotation ensures departed members cannot decrypt future events.

**Responsible party**: An administrator.

### 4.1 Preparation

1. **Identify all active members** who must receive the new hub key (admin UI: filter active).
2. **Document the reason** for rotation (departure, seizure, compromise, routine).
3. **Ensure secure connection** to the admin interface.

### 4.2 Rotation Steps

4. **Generate a new random 32-byte hub key**:
   - Admin UI provides "Rotate Hub Key" function
   - Or: `crypto.getRandomValues(new Uint8Array(32))`
   - The hub key is random bytes — NOT derived from any identity key

5. **HPKE-wrap the new hub key for each remaining member** using each member's X25519 pubkey (label: `LABEL_HUB_KEY_WRAP`). One HPKE envelope per member.

6. **Publish a key rotation event** to the Nostr relay:
   - Encrypted with the OLD hub key (so current members can read it)
   - Contains reference to new key version

7. **Each active member's client** receives the rotation event:
   - Decrypts using old hub key
   - Retrieves its individually-wrapped new key blob
   - HPKE-opens the new hub key using its device X25519 key
   - Stores the new hub key indexed by version

8. **Events after rotation** use the new key version.

9. **Old hub key retained** by clients for decrypting historical events.

10. **Departed/revoked members excluded** — no HPKE envelope generated for them.

### 4.3 Verification

- [ ] New hub key generated and HPKE-distributed to all active members
- [ ] At least one user confirms they can decrypt a test hub event
- [ ] Departed/revoked members excluded from distribution
- [ ] Old hub key retained for historical decryption
- [ ] Key rotation event visible in audit log
- [ ] Monitor 24 hours for rotation failures (offline members)

### 4.4 Rotation Failure Recovery

If rotation fails mid-ceremony:
- Do NOT re-use a partially distributed key
- Generate a fresh hub key
- Publish cancellation event encrypted with old hub key
- Restart ceremony

---

## 5. PUK Rotation on Departure

When a user departs or a device is compromised, the PUK must be rotated so the departed user/device cannot derive future items keys or note epoch keys.

### 5.1 Rotation Steps

1. **Generate new PUK seed** (random 32 bytes) for generation N+1
2. **Encrypt old seed** (gen N) with new secretbox key (gen N+1) → CLKR chain link
3. **HPKE-wrap new seed** for each remaining authorized device (label: `LABEL_PUK_WRAP_TO_DEVICE`)
4. **Publish `rotate-puk` sigchain entry** recording the generation change
5. **Departed user's devices excluded** from new seed distribution

### 5.2 Impact

- Notes encrypted under old PUK generations remain decryptable by remaining users via CLKR chain walk
- Departed user retains their copy of the old PUK seed — they can decrypt notes from their tenure
- Departed user cannot derive new items keys or epoch keys (they don't have the new PUK seed)

---

## 6. Response Timeframe Summary

| Scenario | Action | Maximum Timeframe |
|----------|--------|-------------------|
| Admin key compromise | Immediate actions (new keypair, redeploy, sigchain deauthorize) | 1 hour |
| Admin key compromise | Hub key rotation BEGINS | 4 hours |
| Admin key compromise | Short-term actions (re-wrapping, PUK rotation, audit review) | 24 hours |
| Admin key compromise | GDPR breach notification (if applicable) | 72 hours |
| User departure (friendly) | Deactivation + sigchain deauthorize + hub key rotation | Same day |
| User departure (hostile) | Deactivation + sigchain deauthorize + hub key rotation | Immediately |
| Device seizure (no panic wipe) | Deactivation + sigchain deauthorize + hub key rotation | 1 hour |
| Device seizure (panic wipe confirmed) | Hub key rotation (precautionary) | 24 hours |
| Routine hub key rotation | Scheduled | Per organizational policy (quarterly recommended) |

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-02 | 2.0 | Complete rewrite: HPKE replaces ECIES for all key wrapping, sigchain-based device deauthorization replaces nsec revocation, added PUK rotation section, added CLKR chain references, updated device storage (Tauri Store/Keychain/Keystore not localStorage), removed Cloudflare Workers references, updated panic wipe to platform-native lock |
| 2026-02-25 | 1.0 | Initial version |
