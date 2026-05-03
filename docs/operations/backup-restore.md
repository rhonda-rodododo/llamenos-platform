# Backup and Restore

This document covers the Llamenos backup and restore procedures. Backups are managed by Ansible playbooks in `deploy/ansible/playbooks/`.

## What Gets Backed Up

| Service | Data | Criticality |
|---------|------|-------------|
| **PostgreSQL** | All application data (calls, notes, volunteers, shifts, audit logs, key material) | Critical |
| **strfry** | Nostr relay events (real-time presence, hub events) | High |
| **RustFS** | File attachments | Medium |
| **Config** | `docker-compose.yml`, `.env`, `Caddyfile` | Critical |

## Prerequisites

- Ansible 2.15+ installed: `pip install ansible`
- Ansible inventory configured at `deploy/ansible/inventory.yml`
- (Optional) `age` installed for encrypted backups — strongly recommended for production
- (Optional) `rclone` configured for remote storage offsite copies

## Backup Procedure

### Automated (Recommended)

The backup playbook deploys scripts and a daily cron job to the server. Run it once to set up automated backups:

```bash
cd deploy/ansible
ansible-playbook playbooks/backup.yml --ask-vault-pass
```

This installs scripts under `{{ app_dir }}/scripts/` and schedules a daily backup at 03:00 UTC via cron. The cron runs `backup-all.sh`, which calls each service script in dependency order and produces a unified manifest file with checksums.

### Manual / On-Demand

SSH to the server and run the orchestrator directly:

```bash
ssh deploy@YOUR_SERVER -p 2222
/opt/llamenos/scripts/backup-all.sh
```

To backup a single service:

```bash
/opt/llamenos/scripts/backup-postgres.sh   # PostgreSQL only
/opt/llamenos/scripts/backup-strfry.sh     # Nostr relay only
/opt/llamenos/scripts/backup-rustfs.sh     # RustFS objects only
/opt/llamenos/scripts/backup-config.sh     # Config files only
```

Via Ansible with a tag:

```bash
ansible-playbook playbooks/backup.yml --ask-vault-pass --tags postgres
ansible-playbook playbooks/backup.yml --ask-vault-pass --tags strfry
ansible-playbook playbooks/backup.yml --ask-vault-pass --tags rustfs
ansible-playbook playbooks/backup.yml --ask-vault-pass --tags config
```

### Backup Retention

Backups are stored on-server at `{{ app_dir }}/backups/`:

```
backups/
  postgres/{daily,weekly,monthly}/
  strfry/{daily,weekly,monthly}/
  rustfs/{daily,weekly,monthly}/
  config/{daily,weekly,monthly}/
  manifest-YYYYMMDD-HHMMSS.txt    # Unified checksums, kept for 30 runs
  backup.log
```

### Encryption

Production deployments should encrypt backups with `age`. Set `backup_age_public_key` in `deploy/ansible/vars.yml`. Each backup file is encrypted before being written to disk.

### Remote Offsite Copies

Set `backup_rclone_remote` in `vars.yml` to automatically sync backups to a remote storage destination after each run (Backblaze B2, S3-compatible, SFTP, etc.). `rclone` is installed automatically if this is configured.

### Monitoring

Set `backup_monitor_webhook_url` in `vars.yml` to send a POST notification to a webhook (Healthchecks.io, ntfy, etc.) after each backup run. The `backup-monitor` role handles this automatically.

---

## Restore Procedure

**WARNING**: Restore is destructive. It drops and recreates the database. Always verify backups are intact before restoring to a production system. Test restores with `restore_dry_run=true` first.

### Dry Run (Verify Without Restoring)

```bash
cd deploy/ansible
ansible-playbook playbooks/restore.yml --ask-vault-pass -e restore_dry_run=true
```

This logs what would be restored without touching any data.

### Full Restore (Latest Backup)

```bash
cd deploy/ansible
ansible-playbook playbooks/restore.yml --ask-vault-pass
```

Restore order is fixed:
1. Stop all services
2. Restore config (`docker-compose.yml`, `.env`, `Caddyfile`)
3. Start PostgreSQL only, restore database (drop + recreate + pg_restore)
4. Start strfry, import Nostr events
5. Start RustFS, sync file attachments
6. Start full stack
7. Wait for `/api/health` to return 200

### Point-in-Time Restore

To restore from a specific timestamp (format: `YYYYMMDD-HHMMSS`):

```bash
ansible-playbook playbooks/restore.yml --ask-vault-pass \
  -e restore_timestamp=20260308-030000
```

### Restore a Single Service

```bash
ansible-playbook playbooks/restore.yml --ask-vault-pass --tags postgres
ansible-playbook playbooks/restore.yml --ask-vault-pass --tags strfry
ansible-playbook playbooks/restore.yml --ask-vault-pass --tags rustfs
ansible-playbook playbooks/restore.yml --ask-vault-pass --tags config
```

### Cross-Host Restore (Disaster Recovery)

To restore to a new server from backups copied from the old server:

```bash
# Copy backups to new server first
rsync -av deploy@OLD_SERVER:/opt/llamenos/backups/ /tmp/llamenos-backups/

# Restore using the copied backup directory
ansible-playbook playbooks/restore.yml --ask-vault-pass \
  -e restore_source_dir=/tmp/llamenos-backups
```

Or use `restore_source_host` if the playbook has direct SSH access to the old server.

### Encrypted Backups

If backups are encrypted with `age`, provide the private key path:

```bash
ansible-playbook playbooks/restore.yml --ask-vault-pass \
  -e restore_age_key_path=/path/to/age-private-key.txt
```

---

## Verification Steps

After any restore, verify data integrity before resuming operations:

```bash
# Check application health
curl -s https://hotline.yourorg.org/api/health
# Expected: {"status":"ok"}

# Check Kubernetes/Docker health probes
curl -s http://localhost:3000/health/ready
curl -s http://localhost:3000/health/live

# Check all services are running
docker compose ps

# Verify PostgreSQL row counts (spot check)
docker compose exec postgres psql -U llamenos -d llamenos \
  -c "SELECT COUNT(*) FROM kv_store;"

# Check Nostr relay
curl -sI https://hotline.yourorg.org/nostr
# Expected: 426 Upgrade Required

# Check RustFS
curl -sf http://localhost:9000/health
```

Also run the backup-status playbook to confirm the backup monitor is healthy:

```bash
ansible-playbook playbooks/backup-status.yml --ask-vault-pass
```

---

## See Also

- `deploy/ansible/playbooks/backup.yml` — full backup orchestration playbook
- `deploy/ansible/playbooks/restore.yml` — full restore playbook
- `deploy/ansible/playbooks/test-restore.yml` — automated restore test playbook (runs dry-run + integrity checks)
- `deploy/ansible/playbooks/dr-test.yml` — disaster recovery drill playbook
- `docs/DR_SCENARIOS.md` — disaster recovery scenarios and runbook
- `docs/RUNBOOK.md` — operational runbook including backup monitoring alerts
