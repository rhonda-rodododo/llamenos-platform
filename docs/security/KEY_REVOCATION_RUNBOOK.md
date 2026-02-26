# Key Revocation Runbook

Operational procedures for emergency key revocation, rotation, and compromise response in Llamenos deployments.

**Audience**: Administrators responsible for operating a Llamenos instance.

**Related documents**:
- [Operator Runbook](../RUNBOOK.md) -- general operational procedures and incident response
- [Threat Model](THREAT_MODEL.md) -- threat analysis and trust boundaries
- [Deployment Hardening](DEPLOYMENT_HARDENING.md) -- infrastructure security
- [Epic 76.0](../epics/epic-76.0-security-foundations.md) -- security foundations design (Phase 3)

**Conventions**: Commands assume a Docker Compose deployment in `/opt/llamenos/deploy/docker/`. For Cloudflare Workers deployments, substitute `wrangler` commands and environment variable updates as appropriate. All commands should be run as the `deploy` user unless otherwise noted.

---

## Table of Contents

1. [Admin Key Compromise Response](#1-admin-key-compromise-response)
2. [Volunteer Key Revocation on Departure](#2-volunteer-key-revocation-on-departure)
3. [Device Seizure Response](#3-device-seizure-response)
4. [Hub Key Rotation Ceremony](#4-hub-key-rotation-ceremony)
5. [Response Timeframe Summary](#5-response-timeframe-summary)

---

## 1. Admin Key Compromise Response

The admin keypair is the most privileged credential in the system. Compromise of the admin nsec grants the attacker the ability to decrypt all admin-wrapped note envelopes, all admin-wrapped message envelopes, and (if the admin held the hub key) all hub-encrypted Nostr events. This is the highest-severity key compromise scenario.

**Responsible party**: The administrator (or a designated backup administrator with access to deployment infrastructure).

### 1.1 Immediate Actions (within 1 hour of confirmed compromise)

These steps must be completed as fast as possible. The goal is to revoke the compromised keypair and prevent further use.

1. **Generate a new admin keypair** on a trusted machine (not the compromised device):
   ```bash
   bun run bootstrap-admin
   ```
   Record the new public key securely. Do not transmit it over any channel the attacker may control.

2. **Update the deployment configuration** with the new admin public key:
   ```bash
   cd /opt/llamenos/deploy/docker
   sed -i "s|^ADMIN_PUBKEY=.*|ADMIN_PUBKEY=<new_pubkey>|" .env
   ```
   For Cloudflare Workers deployments, update the `ADMIN_PUBKEY` secret via `wrangler secret put ADMIN_PUBKEY`.

3. **Redeploy the application** to apply the new admin pubkey:
   ```bash
   docker compose restart app
   ```
   This invalidates all active sessions (the server restart clears in-memory session state).

4. **Verify the deployment** is running with the new key:
   ```bash
   docker compose exec app curl -sf http://localhost:3000/api/health
   ```

5. **Begin hub key rotation** immediately (see [Section 4](#4-hub-key-rotation-ceremony)). Do not wait for the 24-hour window -- start now.

### 1.2 Short-Term Actions (within 24 hours)

6. **Complete hub key rotation** (Section 4). The new hub key must be distributed to all active members. The maximum deadline for hub key rotation to begin is 4 hours from confirmed compromise; it must be completed within 24 hours.

7. **Re-wrap all admin note envelopes** with the new admin public key. This requires a re-encryption pass:
   - For each note in the system, the volunteer who authored it must be online to re-wrap their note's admin envelope using the new admin pubkey.
   - Notes whose authors are offline cannot be re-wrapped until those volunteers reconnect.
   - Track re-wrapping progress in the admin UI.

8. **Re-wrap all admin message envelopes** with the new admin public key, following the same process as note envelopes.

9. **Review the audit log** for anomalous access patterns during the compromise window:
   - Unusual login times or IP addresses
   - Bulk data access or export
   - Settings or configuration changes
   - Volunteer account modifications

### 1.3 Assessment

10. **Determine what data was accessible** to the attacker. The compromised admin key could decrypt:
    - All note envelopes wrapped for the admin pubkey
    - All message envelopes wrapped for the admin pubkey
    - If the admin held the hub key: all hub-encrypted Nostr events (past and present, until hub key rotation completes)

11. **Assess GDPR notification obligations**. If personal data of callers or volunteers may have been exposed, you must notify the supervisory authority within 72 hours of becoming aware of the breach. Prepare a report covering:
    - Nature of the breach and compromised key type
    - Categories and approximate number of data subjects affected
    - Likely consequences of the compromise
    - Measures taken (key rotation, re-wrapping, session invalidation)

12. **Notify affected parties** per your organization's breach notification policy and GDPR requirements.

**Maximum response timeframe**: Hub key rotation must BEGIN within 4 hours of confirmed compromise. All immediate actions (steps 1-5) must be completed within 1 hour. Short-term actions (steps 6-9) must be completed within 24 hours.

### 1.4 Verification Checklist

After completing all admin key compromise response actions, verify:

- [ ] New admin keypair is active — admin can log in with the new nsec
- [ ] Old admin keypair is rejected — login attempt with old nsec fails
- [ ] Hub key has been rotated — test by publishing a hub event and verifying active members can decrypt
- [ ] All active volunteer sessions are functional — at least one volunteer confirms they can decrypt notes
- [ ] Audit log shows the compromise response actions (key rotation, session invalidation)
- [ ] GDPR notification has been filed (if applicable) within the 72-hour window
- [ ] Re-wrapping progress is tracked — note which volunteers' envelopes have been re-wrapped

---

## 2. Volunteer Key Revocation on Departure

When a volunteer leaves the organization, their cryptographic keys must be revoked to prevent access to future data. The procedure differs depending on whether the departure is cooperative (friendly) or adversarial (hostile).

**Responsible party**: An administrator.

### 2.1 Friendly Departure

The volunteer is cooperating and leaving on good terms. They may retain their nsec (we cannot force deletion from their devices), but they will lose access to all future data.

1. **Deactivate the volunteer** via the admin UI:
   - Navigate to Volunteers > [volunteer name] > Deactivate
   - This immediately revokes all active sessions for the volunteer

2. **Confirm session revocation** -- the volunteer should be logged out of all devices. Verify no active sessions remain in the admin panel.

3. **Rotate the hub key** immediately (see [Section 4](#4-hub-key-rotation-ceremony)):
   - Generate a new random hub key
   - Distribute the new hub key to all remaining active members
   - The departed volunteer does NOT receive the new key

4. **Verify post-departure access boundaries**:
   - The departed volunteer CAN still decrypt notes they authored (they have the author envelope keys from when they were active). This is acceptable -- they authored those notes.
   - The departed volunteer CANNOT decrypt new hub events (new hub key).
   - The departed volunteer CANNOT decrypt other volunteers' notes (they never had those keys).
   - The departed volunteer CAN prove they were a member (their pubkey was registered). Consider whether this is a concern for your threat model.

5. **Document the departure** in the audit log with the date, reason, and confirmation that hub key rotation was completed.

#### Friendly Departure Verification Checklist

- [ ] Volunteer is deactivated in the admin UI (status: inactive)
- [ ] No active sessions remain for the volunteer
- [ ] Hub key has been rotated — new key distributed to all remaining members
- [ ] At least one remaining member confirms they can decrypt new hub events
- [ ] Departure documented in audit log

### 2.2 Hostile Departure

The volunteer is leaving on bad terms, has been terminated, or is suspected of acting against the organization's interests. Treat this as a potential security incident.

1. **Deactivate the volunteer immediately** via the admin UI. If the admin UI is not accessible, deactivate via the database:
   ```bash
   docker compose exec postgres psql -U llamenos -d llamenos -c "
     UPDATE storage
     SET value = jsonb_set(value::jsonb, '{active}', 'false')
     WHERE namespace = 'identity'
       AND key LIKE 'volunteer:%'
       AND value::jsonb->>'pubkey' = '<volunteer_pubkey>';
   "
   docker compose restart app
   ```

2. **Rotate the hub key immediately** (see [Section 4](#4-hub-key-rotation-ceremony)). Do not delay.

3. **Revoke all WebAuthn credentials** associated with the volunteer's devices via the admin UI.

4. **Conduct an access assessment** -- determine what data the hostile volunteer had access to during their tenure:
   - Which notes did they author or have access to?
   - Which hub events were encrypted with keys they possessed?
   - Did they have access to any shared resources or admin-level data?
   - Review audit logs for any data exfiltration patterns (bulk access, unusual export activity).

5. **Assess whether further action is needed** based on the access assessment:
   - If the volunteer had access to sensitive caller data, consider GDPR notification obligations.
   - If the volunteer had access to other volunteers' identities, notify those volunteers.
   - If the volunteer had admin-level access at any point, treat this as an admin key compromise (Section 1).

6. **Document the incident** thoroughly in the audit log and any incident tracking system.

#### Hostile Departure Verification Checklist

- [ ] Volunteer is deactivated — no active sessions remain
- [ ] Hub key has been rotated — departed volunteer's pubkey excluded from key distribution
- [ ] All WebAuthn credentials for the volunteer are revoked
- [ ] Access assessment documented — what data the volunteer had access to during tenure
- [ ] GDPR notification filed (if applicable)
- [ ] Other volunteers notified (if their identities were accessible to the departed volunteer)
- [ ] Incident documented in audit log and any external incident tracking

---

## 3. Device Seizure Response

A volunteer's device has been physically seized (by law enforcement, border agents, adversaries, or through theft). The threat is that the attacker gains physical access to the device and attempts to extract cryptographic keys from local storage.

**Responsible party**: The affected volunteer (for panic wipe) and an administrator (for hub key rotation and credential revocation).

### 3.1 Panic Wipe (Volunteer Action)

If the volunteer still has momentary access to the device before seizure:

1. **Trigger the panic wipe** using the triple-Escape mechanism (press Escape three times rapidly). This:
   - Zeroes the nsec from the in-memory closure
   - Clears the PIN-encrypted key store from local storage
   - Clears all session data
   - Navigates to a neutral page

2. **Confirm the wipe completed** -- the device should show no trace of the Llamenos application state. The PWA is named "Hotline" with a generic icon, which provides additional cover.

### 3.2 Hub-Side Response (Administrator Action)

Whether or not the panic wipe was successful, the administrator must assume the worst case:

3. **Assess whether panic wipe occurred**. Contact the volunteer through a secure side channel (not the seized device) to determine:
   - Was the panic wipe triggered before seizure?
   - Was the device locked (screen lock active) at the time of seizure?
   - Was the device powered on or off?

4. **If panic wipe was NOT possible** (or uncertain):
   - **Deactivate the volunteer** immediately via the admin UI
   - **Rotate the hub key** immediately (see [Section 4](#4-hub-key-rotation-ceremony))
   - **Revoke all WebAuthn credentials** for the seized device

5. **If panic wipe WAS confirmed**:
   - The nsec and key store have been cleared from the device
   - PIN protection on the local key store provides a time buffer -- even if the attacker recovers deleted data, they must crack the PIN to access the nsec
   - Hub key rotation is still recommended as a precaution, but the urgency is lower

6. **Revoke WebAuthn credentials** for the seized device via the admin UI, regardless of whether panic wipe occurred. Physical possession of the device may allow the attacker to use stored WebAuthn credentials.

### 3.3 PIN Protection Assessment

The volunteer's nsec is stored encrypted under a PIN-derived key. The strength of this protection depends on:

| PIN Length | Brute-force time (offline, no rate limiting) | Assessment |
|------------|----------------------------------------------|------------|
| 4 digits   | Minutes to hours                             | Insufficient against a funded adversary |
| 6 digits   | Hours to days                                | Marginal |
| 8+ digits  | Days to weeks                                | Provides meaningful time buffer |

The PIN protection is a delay mechanism, not a permanent barrier. Hub key rotation must be completed before a well-funded adversary could crack the PIN. For 4-6 digit PINs, this means hub key rotation should begin within 1 hour of confirmed device seizure.

### 3.4 Post-Seizure Volunteer Re-Onboarding

After the incident is resolved and if the volunteer continues with the organization:

7. **Generate a new invite** for the volunteer to onboard with a fresh keypair on a new device.
8. **The volunteer's old notes remain accessible** to the admin (admin envelope) but the volunteer will not be able to access their historical notes from the new keypair unless they retained a backup of their old nsec.
9. **Brief the volunteer** on any changes to operational security procedures.

---

## 4. Hub Key Rotation Ceremony

The hub key is a shared symmetric key used to encrypt Nostr relay events that are broadcast to all members (e.g., shift changes, presence updates, system announcements). When a member departs or a key is compromised, the hub key must be rotated so that former members cannot decrypt future events.

**Responsible party**: An administrator.

**Prerequisites**: The hub key rotation mechanism is designed in Epic 76.2. This section documents the operational ceremony; the implementation details are in the epic.

### 4.1 Preparation

1. **Identify all active members** who must receive the new hub key. This includes all active volunteers and all administrators. Verify the list in the admin UI under Volunteers (filter: active only).

2. **Confirm the reason for rotation** and document it:
   - Admin key compromise (Section 1)
   - Volunteer departure -- friendly (Section 2.1)
   - Volunteer departure -- hostile (Section 2.2)
   - Device seizure (Section 3)
   - Routine rotation (annual or per policy)

3. **Ensure you have a secure connection** to the admin interface. Do not perform key rotation over an untrusted network.

### 4.2 Rotation Steps

4. **Generate a new random 32-byte hub key**:
   - The admin UI provides a "Rotate Hub Key" function
   - Alternatively, the admin client generates the key locally: `crypto.getRandomValues(new Uint8Array(32))`
   - The hub key is random bytes — NOT derived from any identity key. This ensures no mathematical link between old and new hub keys

5. **Wrap the new hub key for each remaining member** via ECIES using each member's public key:
   - The admin client iterates over all active member pubkeys
   - For each member, it performs ECIES encryption of the new hub key using the domain label `"llamenos:hub-key-wrap"`
   - This produces one wrapped key blob per member

6. **Publish a key rotation event** to the Nostr relay:
   - The event is encrypted with the OLD hub key (so current members can read it)
   - The event contains a reference to the new key version and instructs clients to unwrap their individual key blob
   - Event kind and format are defined in Epic 76.2

7. **Each active member's client receives the rotation event**:
   - The client decrypts the rotation event using the old hub key
   - The client retrieves its individually-wrapped new hub key blob
   - The client unwraps the new hub key using its own nsec
   - The client stores the new hub key locally, indexed by version

8. **Events published after rotation use the new key version**:
   - All new hub events are encrypted with the new hub key
   - Clients include the key version identifier in encrypted events

9. **The old hub key is retained** by clients for decrypting historical events:
   - Clients maintain a key version history
   - When decrypting an event, the client selects the correct key version based on the event's key version identifier

10. **Departed or revoked members do NOT receive the new key**:
    - They are excluded from step 5 (no wrapped key blob generated for them)
    - They can still decrypt historical events encrypted with old key versions they possessed
    - They cannot decrypt any events encrypted with the new key

### 4.3 Verification

11. **Verify rotation success** by checking that active members can decrypt new hub events:
    - Have at least one volunteer confirm they received and can read a test hub event
    - Check the admin UI for key rotation status (members who have acknowledged the new key)

12. **Monitor for rotation failures** over the next 24 hours:
    - Members who were offline during rotation will receive the wrapped key when they reconnect
    - If a member cannot unwrap their key blob, re-wrap and re-publish for that member

#### Hub Key Rotation Verification Checklist

- [ ] New hub key generated and distributed to all active members
- [ ] At least one volunteer confirms they can decrypt a test hub event
- [ ] Departed/revoked members excluded from key distribution
- [ ] Old hub key retained by clients for historical event decryption
- [ ] Key rotation event visible in audit log
- [ ] Monitor for 24 hours for rotation failures (offline members)

### 4.4 Rotation Failure Recovery

If the rotation ceremony fails (e.g., admin client crashes mid-rotation, network failure during publishing):

13. **Do NOT re-use a partially distributed key.** Generate a fresh hub key and restart from step 4.

14. If members received a partial rotation (some have the new key, some do not):
    - Publish a cancellation event encrypted with the old hub key, instructing clients to discard the failed key version
    - Restart the ceremony with a new key

### 4.5 Emergency Hub Key Rotation via CLI

If the admin UI is not accessible (e.g., server partially down, admin locked out of UI), the hub key can be rotated using the admin nsec directly:

1. Obtain the list of active member pubkeys from the database:
   ```bash
   docker compose exec postgres psql -U llamenos -d llamenos -c "
     SELECT value->>'pubkey' AS pubkey
     FROM storage
     WHERE namespace = 'identity'
       AND key LIKE 'volunteer:%'
       AND (value->>'active')::boolean = true;
   "
   ```

2. Generate a new hub key and wrap it for each member. This requires running the admin client-side crypto code outside the browser (e.g., via a Node.js script using the admin nsec). A convenience script is planned for future releases.

3. Publish the key rotation event to the Nostr relay using the server's Nostr identity.

**Note**: CLI rotation is an emergency-only procedure. The admin UI handles all the cryptographic operations automatically and is the recommended approach.

---

## 5. Response Timeframe Summary

| Scenario | Action | Maximum Timeframe |
|----------|--------|-------------------|
| Admin key compromise | Immediate actions (new keypair, redeploy, session invalidation) | 1 hour |
| Admin key compromise | Hub key rotation BEGINS | 4 hours |
| Admin key compromise | Short-term actions complete (re-wrapping, audit review) | 24 hours |
| Admin key compromise | GDPR breach notification (if applicable) | 72 hours |
| Volunteer departure (friendly) | Deactivation + hub key rotation | Same day |
| Volunteer departure (hostile) | Deactivation + hub key rotation | Immediately upon decision |
| Device seizure (no panic wipe) | Deactivation + hub key rotation | 1 hour |
| Device seizure (panic wipe confirmed) | Hub key rotation (precautionary) | 24 hours |
| Routine hub key rotation | Scheduled rotation | Per organizational policy (recommended: quarterly) |

---

## Revision History

| Date | Change | Author |
|------|--------|--------|
| 2026-02-25 | Added verification checklists, updated hub key description (random 32 bytes, not derived), added Section 4.5 emergency CLI rotation, updated adminEnvelopes[] references | -- |
| 2026-02-25 | Initial version, per Epic 76.0 Phase 3 | -- |
