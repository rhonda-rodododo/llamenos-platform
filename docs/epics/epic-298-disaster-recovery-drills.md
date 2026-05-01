# Epic 298: Disaster Recovery Runbook & Drills
> **Note**: MinIO has been replaced by RustFS as of PR #40. All references to MinIO in this document should be read as RustFS.


**Status**: PENDING
**Priority**: Medium
**Depends on**: Epic 277 (Automated Backup & Restore infrastructure)
**Blocks**: None
**Branch**: `desktop`

## Summary

Create an automated disaster recovery testing framework that can provision a fresh environment, restore from the latest backup, validate all services, run smoke tests, and tear down — all in a single command. Define time-to-recovery targets, quarterly drill schedules, and documented procedures for 5 catastrophic scenarios. Extend the existing `test-restore.yml` playbook into a comprehensive DR validation suite.

## Problem Statement

The existing `RUNBOOK.md` has incident response procedures and `playbooks/test-restore.yml` validates that backups can be restored into a temporary PostgreSQL container. But there are critical gaps:

1. **No full-stack DR test.** The test-restore playbook only validates PostgreSQL. It doesn't verify that the app can boot, that RustFS data is intact, that the Nostr relay has its event history, or that the telephony provider still routes calls.
2. **No time-to-recovery measurement.** Operators don't know if recovery takes 30 minutes or 4 hours. Without measured recovery times, there's no way to set SLAs or know if the DR process is improving or degrading.
3. **No drill schedule.** DR testing happens ad hoc (if at all). Part-time operators forget to test unless there's a scheduled reminder.
4. **No scenario coverage.** The runbook covers "restore from backup" but not "server is ransomwared," "hosting provider disappears overnight," or "admin key is compromised."

For a crisis hotline, the difference between 1-hour and 12-hour recovery could mean lives. Automated DR drills ensure operators are practiced and the process actually works.

## Implementation

### Phase 1: Full-Stack DR Test Playbook

**File: `deploy/ansible/playbooks/dr-test.yml`**

```yaml
---
# Disaster Recovery Test Playbook
#
# Provisions a temporary environment, restores from backup, validates
# all services, and tears down. Measures time-to-recovery.
#
# Usage:
#   just dr-test                    # Full DR test using Docker
#   just dr-test --tags validate    # Validate only (skip provision/restore)
#
# Modes:
#   local-docker (default): Spins up all services in Docker on the current host
#   remote-vps: Provisions a temporary VPS, restores, validates, destroys
#
# The test is non-destructive — it does NOT touch production data or services.

- name: Disaster Recovery Test
  hosts: localhost
  connection: local
  gather_facts: true

  vars:
    dr_mode: "{{ lookup('env', 'DR_MODE') | default('local-docker', true) }}"
    dr_start_time: "{{ ansible_date_time.epoch }}"
    dr_compose_dir: "/tmp/llamenos-dr-test-{{ ansible_date_time.epoch }}"
    dr_results_file: "{{ app_dir | default('/opt/llamenos') }}/dr-results/{{ ansible_date_time.iso8601_basic_short }}.json"

  tasks:
    # ─── Step 1: Setup ─────────────────────────────────────────────
    - name: Create DR test directory
      ansible.builtin.file:
        path: "{{ dr_compose_dir }}"
        state: directory
        mode: "0700"
      tags: [provision]

    - name: Record start time
      ansible.builtin.set_fact:
        dr_start_epoch: "{{ lookup('pipe', 'date +%s') }}"
      tags: [always]

    # ─── Step 2: Locate Latest Backup ──────────────────────────────
    - name: Find latest backup files
      ansible.builtin.find:
        paths: "{{ app_dir | default('/opt/llamenos') }}/backups/daily"
        patterns: "llamenos-*.sql.gz.age,llamenos-*.sql.gz"
        file_type: file
      register: dr_backup_files
      tags: [restore]

    - name: Assert backup exists
      ansible.builtin.assert:
        that: dr_backup_files.matched > 0
        fail_msg: "No backups found. Cannot run DR test without a backup."
      tags: [restore]

    - name: Select most recent backup
      ansible.builtin.set_fact:
        dr_backup_path: "{{ (dr_backup_files.files | sort(attribute='mtime') | last).path }}"
      tags: [restore]

    - name: Display backup selection
      ansible.builtin.debug:
        msg: "DR test using backup: {{ dr_backup_path }}"
      tags: [restore]

    # ─── Step 3: Provision Test Environment ────────────────────────
    - name: Generate Docker Compose for DR test
      ansible.builtin.copy:
        dest: "{{ dr_compose_dir }}/docker-compose.yml"
        mode: "0600"
        content: |
          name: llamenos-dr-test

          services:
            postgres:
              image: postgres:17-alpine
              environment:
                POSTGRES_DB: llamenos
                POSTGRES_USER: llamenos
                POSTGRES_PASSWORD: dr-test-password
              volumes:
                - dr-pgdata:/var/lib/postgresql/data
              healthcheck:
                test: ["CMD-SHELL", "pg_isready -U llamenos -d llamenos"]
                interval: 5s
                timeout: 3s
                retries: 10

            rustfs:
              image: rustfs/rustfs:RELEASE.2025-01-20T14-49-07Z
              command: server /data --console-address ":9001"
              environment:
                MINIO_ROOT_USER: drtest
                MINIO_ROOT_PASSWORD: drtest-password
              volumes:
                - dr-rustfsdata:/data
              healthcheck:
                test: ["CMD", "mc", "ready", "local"]
                interval: 5s
                timeout: 3s
                retries: 10

            app:
              image: "{{ llamenos_image | default('ghcr.io/llamenos/llamenos:latest') }}"
              depends_on:
                postgres:
                  condition: service_healthy
                rustfs:
                  condition: service_healthy
              environment:
                PLATFORM: node
                DATABASE_URL: postgresql://llamenos:dr-test-password@postgres:5432/llamenos
                ENVIRONMENT: development
                HMAC_SECRET: dr-test-hmac-secret-minimum-32-chars
                STORAGE_ENDPOINT: http://rustfs:9000
                STORAGE_ACCESS_KEY: drtest
                STORAGE_SECRET_KEY: drtest-password
                STORAGE_BUCKET: llamenos-files
              ports:
                - "3333:3000"
              healthcheck:
                test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
                interval: 10s
                timeout: 5s
                retries: 10
                start_period: 30s

          volumes:
            dr-pgdata:
            dr-rustfsdata:
      tags: [provision]

    - name: Start DR test environment
      ansible.builtin.command:
        cmd: docker compose up -d --wait
        chdir: "{{ dr_compose_dir }}"
      register: dr_provision_result
      tags: [provision]

    - name: Record provision time
      ansible.builtin.set_fact:
        dr_provision_epoch: "{{ lookup('pipe', 'date +%s') }}"
      tags: [provision]

    # ─── Step 4: Restore Backup ────────────────────────────────────
    - name: Create restore temp directory
      ansible.builtin.tempfile:
        state: directory
        prefix: dr-restore-
      register: dr_restore_tmpdir
      tags: [restore]

    - name: Decrypt backup (if encrypted)
      ansible.builtin.command:
        cmd: "age -d -i {{ backup_age_private_key_path | default('~/.age/backup-key.txt') }} -o {{ dr_restore_tmpdir.path }}/dump.sql.gz {{ dr_backup_path }}"
      when: dr_backup_path is search('.age$')
      tags: [restore]

    - name: Copy unencrypted backup
      ansible.builtin.copy:
        src: "{{ dr_backup_path }}"
        dest: "{{ dr_restore_tmpdir.path }}/dump.sql.gz"
        remote_src: true
      when: dr_backup_path is not search('.age$')
      tags: [restore]

    - name: Restore database into DR test container
      ansible.builtin.shell: |
        gunzip -c {{ dr_restore_tmpdir.path }}/dump.sql.gz | \
          docker exec -i llamenos-dr-test-postgres-1 psql -U llamenos -d llamenos
      tags: [restore]

    - name: Record restore time
      ansible.builtin.set_fact:
        dr_restore_epoch: "{{ lookup('pipe', 'date +%s') }}"
      tags: [restore]

    # ─── Step 5: Validate Services ─────────────────────────────────
    - name: Wait for app to be healthy after restore
      ansible.builtin.uri:
        url: "http://localhost:3333/api/health"
        method: GET
        status_code: 200
        return_content: true
      register: dr_health_check
      retries: 12
      delay: 5
      until: dr_health_check.status == 200
      tags: [validate]

    - name: Validate health check response
      ansible.builtin.assert:
        that:
          - dr_health_check.json.status == 'ok' or dr_health_check.json.status == 'degraded'
          - dr_health_check.json.checks.postgres is defined
        fail_msg: "Health check failed: {{ dr_health_check.json | to_json }}"
      tags: [validate]

    - name: Validate kv_store table has data
      ansible.builtin.command:
        cmd: >
          docker exec llamenos-dr-test-postgres-1
          psql -U llamenos -d llamenos -t -c
          "SELECT COUNT(*) FROM kv_store"
      register: dr_kv_count
      failed_when: dr_kv_count.rc != 0 or (dr_kv_count.stdout | trim | int) == 0
      tags: [validate]

    - name: Validate alarms table exists
      ansible.builtin.command:
        cmd: >
          docker exec llamenos-dr-test-postgres-1
          psql -U llamenos -d llamenos -t -c
          "SELECT COUNT(*) FROM alarms"
      register: dr_alarms_count
      failed_when: dr_alarms_count.rc != 0
      tags: [validate]

    - name: Validate API endpoints respond
      ansible.builtin.uri:
        url: "http://localhost:3333{{ item }}"
        method: GET
        status_code: [200, 401]
        return_content: false
      loop:
        - /api/health
        - /health/live
        - /health/ready
        - /api/metrics
      register: dr_endpoint_checks
      tags: [validate]

    - name: Record validation time
      ansible.builtin.set_fact:
        dr_validate_epoch: "{{ lookup('pipe', 'date +%s') }}"
      tags: [validate]

    # ─── Step 6: Calculate Results ─────────────────────────────────
    - name: Calculate recovery times
      ansible.builtin.set_fact:
        dr_results:
          date: "{{ ansible_date_time.iso8601 }}"
          backup_file: "{{ dr_backup_path }}"
          backup_age_hours: "{{ ((ansible_date_time.epoch | int) - (dr_backup_files.files | sort(attribute='mtime') | last).mtime) // 3600 }}"
          provision_seconds: "{{ (dr_provision_epoch | int) - (dr_start_epoch | int) }}"
          restore_seconds: "{{ (dr_restore_epoch | int) - (dr_provision_epoch | int) }}"
          validate_seconds: "{{ (dr_validate_epoch | int) - (dr_restore_epoch | int) }}"
          total_seconds: "{{ (dr_validate_epoch | int) - (dr_start_epoch | int) }}"
          health_status: "{{ dr_health_check.json.status }}"
          kv_store_rows: "{{ dr_kv_count.stdout | trim }}"
          result: "PASS"
      tags: [validate]

    - name: Display DR test results
      ansible.builtin.debug:
        msg: |
          ══════════════════════════════════════════════════
          DISASTER RECOVERY TEST RESULTS
          ══════════════════════════════════════════════════
          Date:           {{ dr_results.date }}
          Backup used:    {{ dr_results.backup_file }}
          Backup age:     {{ dr_results.backup_age_hours }} hours

          Time-to-Recovery Breakdown:
            Provision:    {{ dr_results.provision_seconds }}s
            Restore:      {{ dr_results.restore_seconds }}s
            Validate:     {{ dr_results.validate_seconds }}s
            ─────────────────────
            TOTAL:        {{ dr_results.total_seconds }}s

          Health:         {{ dr_results.health_status }}
          kv_store rows:  {{ dr_results.kv_store_rows }}
          Result:         {{ dr_results.result }}

          Target: < 14400s (4 hours)
          Status: {{ 'WITHIN TARGET' if (dr_results.total_seconds | int) < 14400 else 'EXCEEDS TARGET' }}
          ══════════════════════════════════════════════════
      tags: [validate]

    - name: Save results to file
      ansible.builtin.copy:
        dest: "{{ dr_results_file }}"
        content: "{{ dr_results | to_nice_json }}"
        mode: "0640"
      tags: [validate]
      ignore_errors: true

  # ─── Cleanup (always runs) ────────────────────────────────────
  post_tasks:
    - name: Tear down DR test environment
      ansible.builtin.command:
        cmd: docker compose down -v
        chdir: "{{ dr_compose_dir }}"
      ignore_errors: true
      tags: [always]

    - name: Remove DR test directory
      ansible.builtin.file:
        path: "{{ dr_compose_dir }}"
        state: absent
      tags: [always]

    - name: Remove restore temp directory
      ansible.builtin.file:
        path: "{{ dr_restore_tmpdir.path }}"
        state: absent
      when: dr_restore_tmpdir is defined
      tags: [always]
```

### Phase 2: DR Scenario Documentation

**File: `docs/DR_SCENARIOS.md`**

```markdown
# Disaster Recovery Scenarios

## Scenario 1: Server Total Loss
**Cause**: Hardware failure, datacenter fire, hosting provider terminates account.
**Data at risk**: Everything on the server.
**Recovery procedure**:
1. Provision new VPS from any provider (`just setup-all` on new inventory)
2. Copy backup files from off-site storage (rclone remote)
3. Run `just restore` to restore latest backup
4. Update DNS to point to new server IP
5. Verify with `just dr-test --tags validate`
**Target RTO**: < 4 hours (assuming off-site backups exist)
**Target RPO**: < 24 hours (daily backup frequency)

## Scenario 2: Database Corruption
**Cause**: Disk failure, OOM kill during write, buggy migration.
**Data at risk**: PostgreSQL data, potentially inconsistent state.
**Recovery procedure**:
1. Stop app service: `docker compose stop app`
2. Attempt point-in-time recovery if WAL archiving enabled
3. If not: restore from latest backup: `just restore`
4. Restart app: `docker compose up -d app`
5. Verify data integrity via admin dashboard
**Target RTO**: < 1 hour
**Target RPO**: < 24 hours

## Scenario 3: Ransomware (Encrypted Disks)
**Cause**: Server compromised, disks encrypted by attacker.
**Data at risk**: All on-disk data.
**Recovery procedure**:
1. Do NOT pay ransom. Do NOT try to recover the server.
2. Provision new VPS from a DIFFERENT provider (assume old provider compromised)
3. Rotate ALL credentials: database password, HMAC secret, admin keys, Twilio tokens
4. Restore from off-site backup (rclone remote — NOT the compromised server)
5. Deploy with new credentials via `just setup-all`
6. Investigate how the compromise occurred (SSH keys? unpatched CVE?)
**Target RTO**: < 4 hours
**Post-incident**: Full security audit, credential rotation, notify affected users

## Scenario 4: Key Compromise
**Cause**: Admin private key leaked, server nostr secret exposed.
**Data at risk**: Authentication integrity, encrypted data confidentiality.
**Recovery procedure**:
1. Generate new admin keypair: `bun run bootstrap-admin`
2. Rotate `server_nostr_secret`: `openssl rand -hex 32`
3. Update `vars.yml` with new keys, re-encrypt: `just encrypt-vars`
4. Deploy: `just deploy`
5. Revoke all existing sessions (admin action in app)
6. Re-invite all volunteers with new hub key
7. Previous E2EE notes remain encrypted with old keys — accessible only if old key retained
**Target RTO**: < 2 hours
**Note**: This is a security incident, not just a DR event. Follow incident response in RUNBOOK.md.

## Scenario 5: Hosting Provider Shutdown
**Cause**: Provider goes bankrupt, receives legal order to shut down, or exits market.
**Data at risk**: Server access, potentially DNS if using provider's DNS.
**Recovery procedure**:
1. Provision new VPS on alternative provider
2. If DNS was with old provider, update registrar to point to new provider's NS
3. Restore from off-site backup
4. Deploy with `just setup-all`
5. Update Twilio webhook URLs to new domain/IP
6. Verify telephony routing with test call
**Target RTO**: < 8 hours (DNS propagation is the bottleneck)
**Prevention**: Use a separate DNS provider (e.g., Cloudflare free tier) from hosting
```

### Phase 3: Drill Schedule Tracking

**File: `deploy/ansible/templates/dr-schedule.json.j2`**

```json
{
  "schedule": {
    "frequency": "quarterly",
    "next_drill": "{{ '%Y-%m-%d' | strftime(ansible_date_time.epoch | int + 90 * 86400) }}",
    "contact": "{{ acme_email | default('operator@example.com') }}"
  },
  "history": []
}
```

The DR test playbook appends to the `history` array after each successful drill, recording date, duration, and result. Operators can check `just dr-status` to see when the last drill was and when the next one is due.

### Phase 4: Justfile Commands

Add to `deploy/ansible/justfile`:

```just
# Run full disaster recovery test (provision → restore → validate → teardown)
dr-test *ARGS:
    ansible-playbook playbooks/dr-test.yml --ask-vault-pass {{ARGS}}

# View DR drill history and next scheduled drill
dr-status:
    @cat {{ app_dir }}/dr-results/*.json 2>/dev/null | jq -s 'sort_by(.date) | .[-5:]' || echo "No DR test results found"
    @echo ""
    @echo "DR Scenarios: docs/DR_SCENARIOS.md"

# Restore from latest backup (production restore — use with caution)
restore *ARGS:
    ansible-playbook playbooks/test-restore.yml --ask-vault-pass {{ARGS}}
```

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `deploy/ansible/playbooks/dr-test.yml` | Create | Full-stack DR test playbook with timing |
| `docs/DR_SCENARIOS.md` | Create | 5 disaster recovery scenarios with procedures |
| `deploy/ansible/templates/dr-schedule.json.j2` | Create | Quarterly drill schedule template |
| `deploy/ansible/justfile` | Extend | Add `dr-test`, `dr-status`, `restore` commands |
| `deploy/ansible/playbooks/test-restore.yml` | Keep | Existing simple restore test remains for quick validation |
| `docs/RUNBOOK.md` | Extend | Add DR drill section with cross-reference to DR_SCENARIOS.md |

## Testing

1. **Local DR test**: Run `just dr-test` on a machine with Docker. Verify the full cycle completes: provision containers, restore backup, validate health and data, tear down containers. Confirm no containers remain after teardown (`docker ps -a | grep llamenos-dr-test` should be empty).

2. **Timing measurement**: Verify the results output shows provision, restore, and validate times separately. Total should be under the 4-hour target for a typical backup size.

3. **Failure recovery**: Stop the DR test mid-restore (Ctrl+C). Re-run `just dr-test`. Verify the cleanup runs and no stale containers/volumes remain.

4. **Results persistence**: Run `just dr-test` twice. Run `just dr-status`. Verify both results appear with timestamps.

5. **Validate-only mode**: Run `just dr-test -- --tags validate` against an already-running test environment. Verify only validation tasks run.

6. **No production impact**: Verify that `dr-test.yml` uses `hosts: localhost` and `connection: local`, and that all Docker resources are namespaced under `llamenos-dr-test` (not `llamenos`).

## Acceptance Criteria

- [ ] `just dr-test` runs a full DR cycle: provision, restore, validate, teardown
- [ ] Time-to-recovery is measured and reported (provision, restore, validate, total)
- [ ] Target RTO of < 4 hours documented and validated
- [ ] 5 disaster scenarios documented with step-by-step procedures
- [ ] DR test results saved as JSON for historical tracking
- [ ] `just dr-status` shows recent drill results and next scheduled drill
- [ ] DR test is non-destructive — no impact on production services
- [ ] Cleanup always runs even if validation fails (post_tasks)
- [ ] DR test validates: health endpoint, database table existence, row count, API endpoint accessibility
- [ ] `docs/RUNBOOK.md` updated with DR drill reference

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| DR test accidentally uses production database | Very Low | Critical | Playbook runs against `localhost` with Docker; uses port 3333 (not 3000); compose project named `llamenos-dr-test` |
| DR test fails due to insufficient disk space | Medium | Low | Test creates ~500 MB of containers; check `df` at start; Docker volumes cleaned up in post_tasks |
| Backup decryption fails (wrong key path) | Medium | Medium | Playbook provides clear error message; `backup_age_private_key_path` is configurable; unencrypted backups also supported |
| Docker Compose version incompatibility | Low | Low | Uses `docker compose` v2 (not `docker-compose` v1); minimum Docker 24.0 documented in prerequisites |
| DR test gives false confidence (tests restore but not telephony) | Medium | Medium | Documented limitation; telephony validation requires live Twilio credentials, which DR test does not use; scenario docs include manual telephony verification step |
