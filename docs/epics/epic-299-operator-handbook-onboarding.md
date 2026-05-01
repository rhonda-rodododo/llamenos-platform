# Epic 299: Operator Handbook & Onboarding

**Status**: PENDING
**Priority**: Low
**Depends on**: None (soft dependency on Epic 298 — references `docs/DR_SCENARIOS.md` which is created by 298)
**Blocks**: None
**Branch**: `desktop`

## Summary

Consolidate the existing operational documentation (QUICKSTART.md, RUNBOOK.md, PRODUCTION_CHECKLIST.md, DEPLOYMENT_HARDENING.md) into a single, task-organized "Operator Handbook" with a progressive structure: first 30 minutes, daily tasks, weekly tasks, monthly tasks, quarterly tasks. Include a one-page quick-reference card, a troubleshooting decision tree, and inline documentation for all `just` commands.

## Problem Statement

Llamenos has comprehensive operational documentation — over 2,100 lines across 4 files — but it is organized by topic (deployment, hardening, backup, monitoring) rather than by operator workflow. A new operator onboarding to the system faces several problems:

1. **Information scatter.** "How do I check if backups are working?" requires reading RUNBOOK.md (backup section), PRODUCTION_CHECKLIST.md (backup verification), and DEPLOYMENT_HARDENING.md (backup encryption). A single question spans 3 files.
2. **No progressive onboarding.** There's no "start here" guide that walks an operator through their first 30 minutes. The QUICKSTART.md covers initial deployment but not day-2 operations.
3. **No task frequency guidance.** Which tasks are daily? Weekly? Monthly? Operators don't know what to do when. For 2-3 part-time volunteers, a clear cadence prevents "nobody checked backups for 3 months" situations.
4. **No troubleshooting decision tree.** When "calls aren't routing," an operator must read through 1,006 lines of RUNBOOK.md to find the relevant section. A symptom-based decision tree would cut diagnosis time dramatically.

The Operator Handbook is a single document that answers: "I'm a new operator. What do I do right now, and what do I do every day/week/month?"

## Implementation

### Phase 1: Operator Handbook

**File: `docs/OPERATOR_HANDBOOK.md`**

Structure (each section references specific `just` commands):

```markdown
# Operator Handbook

## How to Use This Handbook

This is the single reference for operating a Llamenos deployment. It replaces
reading 4+ separate documents. Sections are organized by *when* you need them:

1. **Getting Started** — your first 30 minutes as an operator
2. **Daily Operations** — what to check each day you're on duty
3. **Weekly Maintenance** — scheduled tasks every Monday
4. **Monthly Tasks** — capacity review and updates
5. **Quarterly Tasks** — DR drills and security review
6. **Troubleshooting** — symptom → diagnosis → fix
7. **Emergency Procedures** — when things are on fire
8. **Architecture Overview** — how things fit together
9. **Command Reference** — every `just` command explained
10. **Glossary** — terms used in this handbook

---

## 1. Getting Started (First 30 Minutes)

### 1.1 Verify Access

```bash
# Can you reach the server?
just ping

# Can you see the deployment status?
just check
```

If `just ping` fails, check your SSH key and inventory.yml configuration.

### 1.2 Verify Services Are Running

```bash
# View all container status
ssh your-server "docker compose -f /opt/llamenos/docker-compose.yml ps"

# Check application health
curl https://your-domain.org/api/health | jq .
```

Expected output:
```json
{
  "status": "ok",
  "checks": {
    "postgres": "ok",
    "storage": "ok",
    "relay": "ok"
  },
  "version": "0.14.0"
}
```

If `status` is `degraded`, check the `checks` and `details` fields.

### 1.3 Verify Backups

```bash
# List recent backups
ssh your-server "ls -lht /opt/llamenos/backups/daily/ | head -5"

# Test that backups can be restored
just test-restore
```

If no backups exist, run `just backup` immediately.

### 1.4 Verify Alerting (if configured)

```bash
# Send a test alert
just test-alerts
```

Check your phone/email for the test notification.

### 1.5 Review Admin Dashboard

Log into the Llamenos app as an admin. Check:
- Active volunteers count
- Recent call log (any calls in the last 24 hours?)
- Shift schedule (are shifts covered?)

---

## 2. Daily Operations

### Daily Checklist (5 minutes)

- [ ] **Check alerts**: Review any notifications from the alerting system
- [ ] **Glance at health**: `curl https://your-domain.org/api/health | jq .status`
- [ ] **Review call log**: Open admin dashboard → Calls tab. Any unusual patterns?
- [ ] **Check shift coverage**: Admin dashboard → Shifts. Are upcoming shifts filled?

### If Alerting is Not Configured

Without automated alerting, manually check:
```bash
# Health check
curl -sf https://your-domain.org/api/health | jq .

# Disk usage
ssh your-server "df -h /"

# Container status
ssh your-server "docker ps --format 'table {{.Names}}\t{{.Status}}'"
```

---

## 3. Weekly Maintenance (Monday, 15 minutes)

- [ ] **Review backup log**: `ssh your-server "tail -20 /opt/llamenos/backups/backup.log"`
- [ ] **Check security scan**: `just security-scan` (if configured)
- [ ] **Review Renovate PRs**: Check GitHub for dependency update PRs, merge approved ones
- [ ] **Check disk growth**: `ssh your-server "df -h / && du -sh /opt/llamenos/backups/"`
- [ ] **Verify NTP sync**: `ssh your-server "timedatectl | grep NTP"`

---

## 4. Monthly Tasks (1st of month, 30 minutes)

- [ ] **Capacity review**: Check PostgreSQL size growth rate
  ```bash
  ssh your-server "docker exec llamenos-postgres-1 psql -U llamenos -d llamenos -c \"SELECT pg_size_pretty(pg_database_size('llamenos'))\""
  ```
- [ ] **OS updates**: `just security-update` (or verify unattended-upgrades ran)
- [ ] **Docker image update**: `just update` (pulls latest images with rollback)
- [ ] **Review audit log**: Admin dashboard → Audit tab. Any unexpected entries?
- [ ] **Backup verification**: `just test-restore` (verify backup integrity)

---

## 5. Quarterly Tasks (Jan, Apr, Jul, Oct)

- [ ] **Disaster recovery drill**: `just dr-test` (full restore test)
- [ ] **Credential rotation**: Rotate HMAC secret, database password
  ```bash
  # Generate new secrets
  just generate-secrets
  # Update vars.yml
  just edit-vars
  # Deploy with new credentials
  just deploy
  ```
- [ ] **TLS certificate review**: Caddy auto-renews, but verify: `echo | openssl s_client -connect your-domain.org:443 2>/dev/null | openssl x509 -noout -dates`
- [ ] **Access review**: Who has SSH access? Remove former operators' keys.
- [ ] **Documentation review**: Is this handbook still accurate?

---

## 6. Troubleshooting

### Decision Tree

```
Symptom: Calls aren't routing
├── Is the app healthy? → curl https://your-domain.org/api/health
│   ├── NO → Check container status: docker compose ps
│   │   ├── App container not running → docker compose up -d app
│   │   ├── Postgres container not running → docker compose up -d postgres
│   │   └── App container restarting → Check logs: docker compose logs app --tail 50
│   └── YES → Is Twilio configured?
│       ├── Check admin settings → Telephony section
│       ├── Verify webhook URL in Twilio console matches your domain
│       └── Test with Twilio CLI: twilio api:core:calls:create --to +1234567890 --from +0987654321 --url https://your-domain.org/api/telephony/voice
│
Symptom: Volunteers can't log in
├── Is the app responding? → curl https://your-domain.org/api/health
│   ├── NO → See "App not responding" above
│   └── YES → Check time sync
│       ├── NTP drift > 30s breaks Schnorr token validation
│       ├── Fix: sudo systemctl restart chronyd
│       └── If persistent: check NTP servers in vars.yml
│
Symptom: Notes not saving
├── Is storage healthy? → Check health endpoint for storage status
│   ├── storage: failing → RustFS may be down: docker compose logs rustfs
│   └── storage: ok → Check browser console for encryption errors
│       └── If E2EE error → volunteer may need to re-enter PIN
│
Symptom: High disk usage alert
├── Check what's using space
│   ├── Database: SELECT pg_size_pretty(pg_database_size('llamenos'));
│   ├── Backups: du -sh /opt/llamenos/backups/*
│   ├── Docker: docker system df
│   └── Logs: du -sh /var/log/*
├── Quick fixes
│   ├── Prune Docker: docker system prune -f
│   ├── Rotate logs: logrotate -f /etc/logrotate.conf
│   └── If backups large: reduce retention in vars.yml
```

---

## 7. Emergency Procedures

### Server Compromised
1. **Immediately**: Change SSH port and keys. Do NOT delete evidence.
2. Take a disk snapshot if the provider supports it (forensics).
3. Follow Scenario 3 (Ransomware) in `docs/DR_SCENARIOS.md`.
4. Provision new server, restore from off-site backup.

### Hotline Completely Down
1. Check health endpoint. If unreachable:
2. SSH to server. Check `docker compose ps`.
3. If server unreachable: contact hosting provider.
4. If hosting provider unreachable: provision new server, restore backup.
5. Update Twilio webhook URL to new server.
6. Time target: < 4 hours to full restoration.

### Data Breach Suspected
1. Assess scope: what data was potentially accessed?
2. E2EE notes are safe — server never has plaintext.
3. Metadata (call times, phone hashes) may be exposed.
4. Rotate all credentials immediately.
5. Notify affected parties per GDPR requirements.

---

## 8. Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Twilio     │────▶│  Llamenos   │────▶│ PostgreSQL  │
│  (telephony) │     │   App       │     │ (database)  │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                    ┌──────┼──────┐
                    ▼      ▼      ▼
              ┌────────┐ ┌────┐ ┌───────┐
              │ RustFS  │ │Nostr│ │ Caddy │
              │(files) │ │relay│ │(proxy)│
              └────────┘ └────┘ └───────┘
```

- **Caddy**: Reverse proxy, auto-TLS via Let's Encrypt
- **App**: Node.js, serves API + desktop static files
- **PostgreSQL**: All persistent data (via KV emulation layer)
- **RustFS**: Encrypted file storage (recordings, attachments)
- **Nostr relay (strfry)**: Real-time events between app instances

---

## 9. Command Reference

| Command | Description | When to use |
|---------|-------------|-------------|
| `just deploy` | Deploy or update the application | After config changes or image updates |
| `just update` | Pull latest images, restart with rollback | Monthly update or emergency patch |
| `just backup` | Run an encrypted backup immediately | Before risky changes |
| `just test-restore` | Verify latest backup can be restored | Weekly verification |
| `just dr-test` | Full disaster recovery drill | Quarterly |
| `just harden` | Apply security hardening | Initial setup or after SSH changes |
| `just check` | Dry-run deployment (no changes) | Before deploying to verify config |
| `just ping` | Test SSH connectivity | First thing when troubleshooting |
| `just test-alerts` | Send a test notification | After configuring alerting |
| `just security-scan` | Run OS-level CVE scan | Weekly or after security advisory |
| `just generate-secrets` | Generate fresh credentials | Initial setup or rotation |
| `just encrypt-vars` | Encrypt vars.yml with Vault | After editing secrets |
| `just edit-vars` | Edit encrypted vars.yml | When changing configuration |

---

## 10. Glossary

| Term | Definition |
|------|-----------|
| **age** | Modern encryption tool used for backup encryption |
| **Caddy** | Reverse proxy that handles TLS certificates automatically |
| **E2EE** | End-to-end encryption — data encrypted on the client, server cannot read it |
| **RustFS** | S3-compatible object storage for files and recordings |
| **Nostr** | Protocol for real-time events; Llamenos uses it for live updates |
| **ntfy** | Self-hosted push notification service for operator alerts |
| **rclone** | Tool for syncing backups to remote cloud storage |
| **Schnorr** | Digital signature scheme used for authentication tokens |
| **strfry** | Nostr relay implementation used by Llamenos |
| **Twilio** | Telephony provider for voice calls and SMS |
```

### Phase 2: Quick Reference Card

**File: `docs/QUICK_REFERENCE.md`**

```markdown
# Llamenos Operator Quick Reference

## Health Check
```
curl https://YOUR-DOMAIN/api/health | jq .
```

## Common Commands
```
just deploy        # Deploy/update
just backup        # Backup now
just test-restore  # Verify backup
just update        # Pull latest images
just ping          # Test SSH
just check         # Dry-run deploy
```

## When Something Breaks
1. `curl https://YOUR-DOMAIN/api/health` → Is it up?
2. `ssh SERVER "docker compose ps"` → Which container is down?
3. `ssh SERVER "docker compose logs SERVICE --tail 50"` → What's the error?
4. `ssh SERVER "docker compose restart SERVICE"` → Try restarting it
5. If all else fails: `just deploy` (redeploys everything)

## Emergency Contacts
- Hosting provider: _______________
- Twilio dashboard: https://console.twilio.com
- Backup decryption key location: _______________
```

### Phase 3: Cross-Reference Updates

Update existing docs to point to the handbook:

- `docs/QUICKSTART.md`: Add note at top: "For ongoing operations after initial deployment, see `OPERATOR_HANDBOOK.md`."
- `docs/RUNBOOK.md`: Add note at top: "For a task-organized version of this information, see `OPERATOR_HANDBOOK.md`."
- `deploy/PRODUCTION_CHECKLIST.md`: Add note at top: "This checklist is also available in `OPERATOR_HANDBOOK.md` Section 1."
- `docs/security/DEPLOYMENT_HARDENING.md`: Add note at top: "For a task-organized summary, see `OPERATOR_HANDBOOK.md`."

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/OPERATOR_HANDBOOK.md` | Create | Consolidated operator handbook (all sections) |
| `docs/QUICK_REFERENCE.md` | Create | One-page command cheat sheet |
| `docs/QUICKSTART.md` | Extend | Add cross-reference to handbook |
| `docs/RUNBOOK.md` | Extend | Add cross-reference to handbook |
| `deploy/PRODUCTION_CHECKLIST.md` | Extend | Add cross-reference to handbook |
| `docs/security/DEPLOYMENT_HARDENING.md` | Extend | Add cross-reference to handbook |

## Testing

1. **Link verification**: All `just` commands referenced in the handbook should exist in `deploy/ansible/justfile`. Cross-reference every command mentioned.

2. **Procedure walkthrough**: Have a team member (or simulate as a new operator) follow the "Getting Started" section. Verify every command works as documented.

3. **Troubleshooting tree accuracy**: For each branch of the decision tree, verify the diagnostic command produces output that matches the described interpretation.

4. **Completeness check**: Verify that every topic in RUNBOOK.md, QUICKSTART.md, PRODUCTION_CHECKLIST.md, and DEPLOYMENT_HARDENING.md is represented in the handbook (either directly or via cross-reference).

5. **Quick reference test**: Print QUICK_REFERENCE.md. Verify it fits on one page (A4/Letter) when rendered.

## Acceptance Criteria

- [ ] Single `OPERATOR_HANDBOOK.md` document covering: getting started, daily/weekly/monthly/quarterly tasks, troubleshooting, emergencies, architecture, command reference, glossary
- [ ] Progressive structure: first 30 minutes section for new operators
- [ ] Task frequency clearly defined: daily (5 min), weekly (15 min), monthly (30 min), quarterly (1 hour)
- [ ] Troubleshooting decision tree for top 4 symptoms: calls not routing, login failures, notes not saving, high disk usage
- [ ] Quick reference card that fits on one printed page
- [ ] All `just` commands documented with description and use case
- [ ] Existing docs (QUICKSTART, RUNBOOK, PRODUCTION_CHECKLIST) cross-reference the handbook
- [ ] No duplication — handbook references existing docs for deep-dive topics rather than copying content
- [ ] Architecture diagram in text format (no external image dependencies)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Handbook becomes outdated as features change | High | Medium | Keep handbook in the same repo as code; CLAUDE.md instructs to update docs when architecture changes; quarterly review task includes documentation check |
| Information duplication with existing docs | Medium | Low | Handbook uses cross-references to RUNBOOK.md and other docs for deep-dive content; avoids copying procedures verbatim |
| Handbook too long, operators won't read it | Medium | Medium | Progressive structure means operators only need section 1 to get started; quick reference card provides one-page summary; table of contents with clear section numbering |
| Troubleshooting tree incomplete | High | Low | Start with top 4 symptoms (calls, login, notes, disk); expand based on support requests; tree structure is easy to extend |
| Non-English operators can't use it | Medium | Medium | Handbook is in English (primary operator language); i18n of operational docs is out of scope for this epic; commands are universal |
