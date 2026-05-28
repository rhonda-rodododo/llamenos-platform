# Disaster Recovery

## Purpose

Recover the Llamenos platform from a complete server loss.

## Recovery Targets

| Metric | Target |
|---|---|
| RTO (Recovery Time Objective) | 2 hours |
| RPO (Recovery Point Objective) | 24 hours (daily backups) |

## Prerequisites

- Access to backup storage (rclone remote configured)
- 1984 Hosting account (or alternative VPS provider)
- Ansible vault password
- SSH key for deployment

## Full Recovery Procedure

### 1. Provision new VPS

Follow the OpenTofu module docs at `deploy/opentofu/modules/1984hosting/main.tf`:
- Order VPS at 1984 Hosting (Debian 13, 4GB+ RAM)
- Add SSH key
- Note public IPv4/IPv6

### 2. Update DNS

Update A/AAAA records for `api`, `updates`, `releases` subdomains to new VPS IP.

### 3. Restore backups

```bash
# List available backups
rclone ls <remote>:llamenos-backups/

# Download latest backup
rclone copy <remote>:llamenos-backups/<latest_date>/ /tmp/restore/
```

### 4. Run deployment

```bash
./deploy/scripts/deploy-official.sh
```

### 5. Restore database

```bash
# Copy backup to server
scp /tmp/restore/postgres-backup.sql.gz deploy@<new_ip>:/tmp/

# Restore
ssh deploy@<new_ip>
docker exec -i $(docker ps -q -f name=postgres) \
  sh -c 'gunzip -c /tmp/postgres-backup.sql.gz | psql -U llamenos'
```

### 6. Restore file storage

```bash
# Copy RustFS data
rsync -avz /tmp/restore/rustfs-data/ deploy@<new_ip>:/opt/llamenos/data/rustfs/
```

### 7. Verify

```bash
curl https://api.llamenos.org/api/health/ready
curl https://updates.llamenos.org/health

# Run smoke check
cd deploy/ansible
ansible-playbook playbooks/smoke-check.yml -i inventory-production.yml -e "@vars-production.yml" --ask-vault-pass
```

## Backup Verification

The Ansible `backup` role runs daily encrypted backups to off-site storage via rclone. Verify backups are running:

```bash
ssh deploy@<server>

# Check last backup timestamp
ls -la /opt/llamenos/backups/

# Check rclone sync status
rclone ls <remote>:llamenos-backups/ | tail -5
```

## Restore Testing

Test the restore procedure quarterly using `deploy/ansible/playbooks/test-restore.yml`:

```bash
ansible-playbook playbooks/test-restore.yml -i inventory.yml -e "@vars.yml"
```

This provisions a temporary server, restores from backup, runs health checks, and tears down.
