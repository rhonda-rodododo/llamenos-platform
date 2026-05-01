# Quick Reference Card

One-page reference for the most common Llamenos operator commands and checks. For full details, see the [Operator Handbook](OPERATOR_HANDBOOK.md).

---

## Health Checks

```bash
# Is the hotline up?
curl -s https://hotline.yourorg.org/api/health

# Are all containers healthy?
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"

# Is the relay reachable?
curl -sI https://hotline.yourorg.org/nostr    # Expect: 426

# Is the database accepting connections?
docker compose exec postgres pg_isready -U llamenos
```

## Logs

```bash
docker compose logs -f app                  # Follow app logs
docker compose logs --since 1h app          # Last hour
docker compose logs app | grep -i error     # Errors only
docker compose logs --since 24h strfry      # Relay logs
```

## Restart / Stop / Start

```bash
docker compose restart app                  # Restart app only
docker compose up -d                        # Start all services
docker compose down                         # Stop all services
```

## Backups

```bash
# Run a manual backup
docker compose exec -T postgres pg_dump -U llamenos llamenos \
  | gzip | age -r "age1..." > /opt/llamenos/backups/llamenos_$(date +%Y%m%d).sql.gz.age

# Verify latest backup
LATEST=$(ls -t /opt/llamenos/backups/*.age | head -1)
age -d -i /root/backup-key.txt "$LATEST" | gunzip | head -50
```

## Updates (via Ansible)

```bash
cd deploy/ansible
just update              # Pull, rebuild, restart with health check + rollback
just check               # Dry run (no changes)
just backup              # Pre-update backup
```

## Secret Generation

```bash
openssl rand -hex 32         # HMAC_SECRET, SERVER_NOSTR_SECRET
openssl rand -base64 24      # PG_PASSWORD, RustFS credentials
just generate-secrets        # Generate all secrets at once
```

## Disk & Resources

```bash
df -h /var/lib/docker                       # Disk usage
docker stats --no-stream                    # Container CPU/memory
docker system df -v                         # Docker volume sizes
docker compose exec postgres du -sh /var/lib/postgresql/data/
```

## Database

```bash
docker compose exec postgres psql -U llamenos -d llamenos                  # Interactive shell
docker compose exec postgres psql -U llamenos -d llamenos -c "VACUUM ANALYZE;"  # Maintenance
```

## Security

```bash
sudo fail2ban-client status sshd            # Check banned IPs
sudo fail2ban-client set sshd unbanip <IP>  # Unban an IP
sudo ufw status                             # Firewall rules
```

## Emergency

```bash
# Shut down immediately
docker compose down

# Invalidate all sessions
NEW_HMAC=$(openssl rand -hex 32)
sed -i "s|^HMAC_SECRET=.*|HMAC_SECRET=${NEW_HMAC}|" .env
docker compose up -d
```

## Maintenance Schedule

| Daily | Weekly | Monthly | Quarterly |
|-------|--------|---------|-----------|
| Health check | Verify backups | Update images | Rotate secrets |
| Check error logs | Review audit log | Database vacuum | Full restore test |
| Check disk space | Check resources | OS reboot check | Security review |

---

**Full documentation**: [Operator Handbook](OPERATOR_HANDBOOK.md) | [Runbook](RUNBOOK.md) | [Quickstart](QUICKSTART.md)
