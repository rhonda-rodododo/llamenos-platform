# Disaster Recovery Scenarios

This document covers five disaster recovery scenarios for Llamenos self-hosted deployments. Each scenario includes the cause, data at risk, a step-by-step recovery procedure, and a target Recovery Time Objective (RTO).

**Prerequisites**: Familiarity with the [Operator Runbook](RUNBOOK.md), functioning off-site backups, and access to the Ansible deployment playbooks in `deploy/ansible/`.

**Automated DR testing**: Run `just dr-test` from `deploy/ansible/` to execute a non-destructive recovery drill. See [DR Drills](#dr-drills) at the end of this document.

---

## Scenario 1: Server Total Loss

**Cause**: VPS provider hardware failure, accidental deletion, or catastrophic OS corruption that makes the server unbootable and unrecoverable.

**Data at risk**: All data on the server — database, MinIO blobs, relay state, Docker volumes, configuration. Off-site backups are the only copy.

**Target RTO**: < 4 hours

### Procedure

1. **Provision a new VPS** with the same OS (Debian 12 or Ubuntu 24.04).
   ```bash
   # From your local machine with Ansible
   cd deploy/ansible
   # Update inventory.yml with the new server IP
   just setup-all
   ```

2. **Copy the age identity key** to the new server (from your secure offline storage).
   ```bash
   scp /secure/backup-key.txt deploy@new-server:/root/backup-key.txt
   chmod 600 /root/backup-key.txt
   ```

3. **Copy or sync the latest backup** to the new server.
   ```bash
   # From off-site storage (rclone, S3, etc.)
   rclone copy remote:llamenos-backups/ /opt/llamenos/backups/ --progress
   ```

4. **Restore the database** from the latest backup.
   ```bash
   cd /opt/llamenos/deploy/docker
   LATEST=$(ls -t /opt/llamenos/backups/*.age | head -1)
   age -d -i /root/backup-key.txt "$LATEST" | gunzip \
     | docker compose exec -T postgres psql -U llamenos -d llamenos
   ```

5. **Restore MinIO blobs** (if backed up separately).
   ```bash
   rclone copy remote:llamenos-minio-backup/ /opt/llamenos/minio-restore/
   docker compose exec minio mc mirror /minio-restore/ local/llamenos-files/
   ```

6. **Update DNS** to point to the new server IP.
   - Update A/AAAA records for your hotline domain.
   - Wait for propagation (check with `dig +short hotline.yourorg.org`).

7. **Update Twilio webhook URLs** if the domain changed.
   - Go to Twilio Console > Phone Numbers > your number > Voice Configuration.
   - Update the webhook URL to `https://hotline.yourorg.org/telephony/voice`.

8. **Verify services**.
   ```bash
   docker compose ps
   curl -sf https://hotline.yourorg.org/api/health
   ```

9. **Notify volunteers** to reconnect. Their client-side keys are unaffected.

### Notes
- E2EE notes remain protected. The server never had plaintext note content.
- The strfry relay database is ephemeral (kind 20001 events) and does not need restoration. It rebuilds as clients reconnect.
- Caddy will automatically obtain new TLS certificates on first request.

---

## Scenario 2: Database Corruption

**Cause**: PostgreSQL data corruption from disk errors, interrupted writes during power loss, or a buggy migration.

**Data at risk**: Database contents — volunteer records, encrypted notes, audit logs, settings, shift schedules. MinIO blobs and configuration are unaffected.

**Target RTO**: < 1 hour

### Procedure

1. **Stop the application** (keep the database running for diagnostics).
   ```bash
   cd /opt/llamenos/deploy/docker
   docker compose stop app
   ```

2. **Assess the corruption**.
   ```bash
   docker compose exec postgres psql -U llamenos -d llamenos -c "
     SELECT count(*) FROM storage;
   "
   # If this returns an error, corruption is confirmed
   ```

3. **Attempt Point-in-Time Recovery (PITR)** if WAL archiving is enabled.
   ```bash
   # Only if you have WAL archives configured
   docker compose exec postgres pg_restore --target-time="2026-03-08 12:00:00" ...
   ```

4. **If PITR is not available, restore from the latest backup**.
   ```bash
   # Drop and recreate the database
   docker compose exec postgres psql -U llamenos -d postgres -c "
     SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='llamenos';
   "
   docker compose exec postgres psql -U llamenos -d postgres -c "DROP DATABASE llamenos;"
   docker compose exec postgres psql -U llamenos -d postgres -c "CREATE DATABASE llamenos OWNER llamenos;"

   # Restore
   LATEST=$(ls -t /opt/llamenos/backups/*.age | head -1)
   age -d -i /root/backup-key.txt "$LATEST" | gunzip \
     | docker compose exec -T postgres psql -U llamenos -d llamenos
   ```

5. **Restart the application**.
   ```bash
   docker compose start app
   docker compose exec app curl -sf http://localhost:3000/api/health
   ```

6. **Verify data integrity** through the admin UI — check recent notes, volunteer list, audit log.

### Notes
- Data created between the last backup and the corruption event is lost.
- Daily backups limit the window to 24 hours. Consider enabling WAL archiving for continuous PITR.
- MinIO blobs (encrypted file uploads) are not in PostgreSQL and are unaffected.

---

## Scenario 3: Ransomware

**Cause**: Attacker gains access to the server and encrypts all files, demanding payment for the decryption key.

**Data at risk**: Everything on the compromised server. Assume all server-side secrets (database password, HMAC secret, MinIO credentials, Twilio API keys, server Nostr secret) are compromised.

**Target RTO**: < 4 hours

### Procedure

1. **Do NOT pay the ransom.** There is no guarantee of data recovery, and payment funds future attacks.

2. **Isolate the compromised server** immediately.
   - Disable networking at the VPS provider dashboard (do not SSH in — the server is hostile).
   - If using a firewall dashboard, block all traffic.

3. **Provision a new VPS on a DIFFERENT provider** (the attack vector may be provider-specific).
   ```bash
   cd deploy/ansible
   # Update inventory.yml with the new server on a different provider
   just setup-all
   ```

4. **Rotate ALL credentials** before restoring data.
   ```bash
   # Generate entirely new secrets
   just generate-secrets
   # Use these new secrets in vars.yml
   just edit-vars
   ```

5. **Restore from off-site backup** (the on-server backups are compromised).
   ```bash
   rclone copy remote:llamenos-backups/ /opt/llamenos/backups/ --progress
   LATEST=$(ls -t /opt/llamenos/backups/*.age | head -1)
   age -d -i /root/backup-key.txt "$LATEST" | gunzip \
     | docker compose exec -T postgres psql -U llamenos -d llamenos
   ```

6. **Rotate Twilio credentials** in the Twilio Console (create new API key, revoke old one).

7. **Update DNS** to point to the new server.

8. **Verify all services** and run a DR validation.
   ```bash
   curl -sf https://hotline.yourorg.org/api/health
   ```

9. **Forensic analysis** of the compromised server:
   - Preserve the server image for investigation (most VPS providers can snapshot a stopped instance).
   - Determine the attack vector (SSH brute force, application vulnerability, supply chain).
   - Report to law enforcement if appropriate.

10. **Notify volunteers** to re-authenticate. Their client-side keys are not affected.

### Notes
- E2EE notes remain protected even if the attacker decrypts all server data. Note content is never stored in plaintext on the server.
- The off-site backup encryption key (age identity) must be stored truly offline — never on the server itself.
- Consider enabling MFA for SSH and using hardware security keys for VPS provider access.

---

## Scenario 4: Key Compromise

**Cause**: The admin's private key (nsec) is compromised through device theft, malware, social engineering, or insider threat. Alternatively, the `SERVER_NOSTR_SECRET` is exposed.

**Data at risk**: Admin-wrapped note envelopes (the attacker can decrypt notes wrapped for the compromised admin key). Active session tokens. Server identity if `SERVER_NOSTR_SECRET` is compromised.

**Target RTO**: < 2 hours

### Procedure

1. **Take the application offline** immediately.
   ```bash
   cd /opt/llamenos/deploy/docker
   docker compose stop app
   ```

2. **Generate a new admin keypair** on a trusted device.
   ```bash
   bun run bootstrap-admin
   # Record the new pubkey
   ```

3. **Update the server configuration**.
   ```bash
   sed -i "s|^ADMIN_PUBKEY=.*|ADMIN_PUBKEY=<new_pubkey>|" .env
   ```

4. **Rotate `SERVER_NOSTR_SECRET`** (always rotate this during a key compromise).
   ```bash
   NEW_NOSTR_SECRET=$(openssl rand -hex 32)
   sed -i "s|^SERVER_NOSTR_SECRET=.*|SERVER_NOSTR_SECRET=${NEW_NOSTR_SECRET}|" .env
   ```

5. **Rotate HMAC secret** to invalidate all active sessions.
   ```bash
   NEW_HMAC=$(openssl rand -hex 32)
   sed -i "s|^HMAC_SECRET=.*|HMAC_SECRET=${NEW_HMAC}|" .env
   ```

6. **Restart the application**.
   ```bash
   docker compose up -d
   docker compose exec app curl -sf http://localhost:3000/api/health
   ```

7. **Revoke all active sessions**. The HMAC rotation invalidates existing session tokens. All volunteers must re-authenticate.

8. **Re-wrap note envelopes**. Admin-wrapped envelopes created with the old admin key are no longer decryptable by the new admin. Volunteers must be online to re-wrap their notes for the new admin key.

9. **Review audit logs** for unauthorized actions during the compromise window.

10. **Assess GDPR impact**. If note content may have been accessed, this constitutes a potential data breach requiring notification within 72 hours.

### Notes
- Per-note forward secrecy limits the blast radius. Each note uses a unique ephemeral key — compromise of the admin identity key does NOT retroactively expose notes unless the attacker also has the per-note wrapped keys from the database.
- See the [Key Revocation Runbook](security/KEY_REVOCATION_RUNBOOK.md) for the detailed cryptographic response procedure.
- Hub key must be rotated to exclude the compromised key from future real-time events.

---

## Scenario 5: Hosting Provider Shutdown

**Cause**: The VPS provider ceases operations (business failure, legal action, sanctions), gives short notice (days to weeks), or becomes unavailable in a specific jurisdiction due to regulatory changes.

**Data at risk**: All data on the provider. However, this scenario typically allows time for a planned migration.

**Target RTO**: < 8 hours (planned migration) / < 24 hours (sudden shutdown)

### Procedure

1. **Secure a new hosting provider** in a GDPR-compliant jurisdiction.
   - Minimum specs: 2 vCPU, 4 GB RAM, 40 GB SSD.
   - Prefer a provider with a different legal jurisdiction than the one being abandoned.

2. **Provision the new server**.
   ```bash
   cd deploy/ansible
   # Update inventory.yml with the new server
   just setup-all
   ```

3. **If the old server is still accessible**, perform a fresh backup.
   ```bash
   # On the old server
   docker compose exec -T postgres pg_dump -U llamenos llamenos \
     | gzip \
     | age -r "age1..." \
     > /opt/llamenos/backups/llamenos_migration_$(date +%Y%m%d).sql.gz.age

   # Copy to local machine or off-site storage
   scp deploy@old-server:/opt/llamenos/backups/llamenos_migration_*.age .
   ```

4. **Restore the backup on the new server**.
   ```bash
   # Copy backup to new server
   scp llamenos_migration_*.age deploy@new-server:/opt/llamenos/backups/

   # Restore
   cd /opt/llamenos/deploy/docker
   LATEST=$(ls -t /opt/llamenos/backups/*.age | head -1)
   age -d -i /root/backup-key.txt "$LATEST" | gunzip \
     | docker compose exec -T postgres psql -U llamenos -d llamenos
   ```

5. **Migrate DNS** to point to the new server.
   - Update A/AAAA records.
   - If changing domain registrars, initiate the transfer early — it can take up to 7 days.

6. **Update Twilio webhook URLs**.
   - Twilio Console > Phone Numbers > your number > Voice Configuration.
   - Update to `https://new-hotline.yourorg.org/telephony/voice`.
   - Update the Status Callback URL and Messaging webhook if configured.

7. **Verify all services on the new server**.
   ```bash
   docker compose ps
   curl -sf https://new-hotline.yourorg.org/api/health

   # Run the automated DR test
   cd deploy/ansible
   just dr-test
   ```

8. **Decommission the old server** (if still accessible).
   - Export all logs for compliance records.
   - Wipe data securely.
   - Cancel the account.

9. **Notify volunteers** of any URL changes and request re-authentication.

### Notes
- This scenario is the strongest argument for maintaining off-site backups on a provider-independent storage service (e.g., Backblaze B2, Wasabi, or a second cloud provider).
- Keep a copy of the Ansible vars (encrypted) and the age identity key separate from any single provider.
- Document your provider dependencies (VPS, DNS, telephony, backup storage) so you know the full scope of migration.

---

## DR Drills

### Automated Testing

Run the non-destructive DR test playbook quarterly:

```bash
cd deploy/ansible
just dr-test
```

This provisions an isolated Docker environment on port 3333, restores from the latest backup, validates health and data integrity, measures time-to-recovery, and tears down. Results are saved as JSON in the `dr-results/` directory.

### Drill Schedule

| Quarter | Drill Type | Scenario |
|---------|-----------|----------|
| Q1 | Automated | Full restore from backup (Scenario 1) |
| Q2 | Tabletop | Ransomware response walkthrough (Scenario 3) |
| Q3 | Automated | Database restore + key rotation (Scenarios 2 + 4) |
| Q4 | Tabletop | Provider migration planning (Scenario 5) |

### Reviewing Results

```bash
cd deploy/ansible
just dr-status
```

This displays the last 5 DR test results and a link to this document.
