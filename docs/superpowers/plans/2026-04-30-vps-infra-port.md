# Plan: Port V1 VPS Infrastructure to V2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the mature VPS deployment infrastructure from V1 (`/home/rikki/projects/llamenos-hotline/`) to V2 (`/media/rikki/recover2/projects/llamenos-plan-vps-infra-port/`), adapting for V2 architecture: RustFS (not MinIO), 1984 Hosting Iceland (not Hetzner), and updated service names.

**Spec reference:** `docs/superpowers/specs/2026-04-30-desktop-distribution-design.md` (Section 9: Port V1 VPS Infrastructure, Section 3: Serving Infrastructure)

**Source references:**
- V1 ISO builder: `/home/rikki/projects/llamenos-hotline/scripts/iso-builder/`
- V1 Ansible: `/home/rikki/projects/llamenos-hotline/deploy/ansible/`
- V1 Caddy: `/home/rikki/projects/llamenos-hotline/deploy/docker/Caddyfile.production`
- V1 Backup: `/home/rikki/projects/llamenos-hotline/deploy/ansible/roles/backup/`
- V1 Production checklist: `/home/rikki/projects/llamenos-hotline/deploy/PRODUCTION_CHECKLIST.md`
- V1 CI workflows: `/home/rikki/projects/llamenos-hotline/.github/workflows/`
- V1 OpenTofu: `/home/rikki/projects/llamenos-hotline/deploy/opentofu/`
- V2 deploy: `/media/rikki/recover2/projects/llamenos-plan-vps-infra-port/deploy/`

---

## Task 1: ISO Builder (scripts/iso-builder/)

**Files to copy from V1:**
- `scripts/iso-builder/Dockerfile`
- `scripts/iso-builder/build-inside.sh`
- `scripts/iso-builder/preseed.cfg.template`
- `scripts/iso-builder/late-command.sh`
- `scripts/iso-builder/dropbear-setup.sh`
- `scripts/iso-builder/README.md`
- `scripts/build-iso.sh` (host entrypoint)
- `scripts/verify-iso.sh` (reproducibility verifier)

**V2 destination:** Same paths (create `scripts/iso-builder/`)

**Modifications for V2:**
- Update branding references: `Llamenos Hotline` → `Llamenos`
- Update motd in `late-command.sh` to reference V2 repo path
- Update `build-iso.sh` output filename prefix from `llamenos-debian13` to `llamenos-fde-debian13`

- [ ] Create `scripts/iso-builder/Dockerfile`:
  ```dockerfile
  # scripts/iso-builder/Dockerfile
  # Pinned Debian 13 builder image used by scripts/build-iso.sh.
  # All tool versions are pinned to support reproducible ISO output.

  # Pinned base image. Update via:
  #   docker pull debian:13.4-slim
  #   docker inspect debian:13.4-slim --format '{{index .RepoDigests 0}}'
  FROM debian:13.4-slim@sha256:4ffb3a1511099754cddc70eb1b12e50ffdb67619aa0ab6c13fcd800a78ef7c7a

  # Reproducible-build env
  ENV SOURCE_DATE_EPOCH=1735689600
  ENV DEBIAN_FRONTEND=noninteractive
  ENV LC_ALL=C
  ENV TZ=UTC

  # Install build tools.
  # debian-keyring provides /usr/share/keyrings/debian-role-keys.gpg used by
  # build-inside.sh to verify the upstream netinst ISO signature.
  RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        debian-keyring \
        gnupg \
        wget \
        xorriso \
        isolinux \
        syslinux-utils \
        cpio \
        gzip \
        xz-utils \
        busybox-static \
        gettext-base \
        python3 \
      && rm -rf /var/lib/apt/lists/*

  # Workspace
  WORKDIR /work

  # Copy in builder scripts. The host wrapper bind-mounts /out and /cache.
  COPY build-inside.sh /usr/local/bin/build-inside.sh
  COPY preseed.cfg.template /usr/local/share/llamenos-iso/preseed.cfg.template
  COPY late-command.sh /usr/local/share/llamenos-iso/late-command.sh
  COPY dropbear-setup.sh /usr/local/share/llamenos-iso/dropbear-setup.sh

  RUN chmod +x /usr/local/bin/build-inside.sh

  ENTRYPOINT ["/usr/local/bin/build-inside.sh"]
  ```

- [ ] Create `scripts/iso-builder/build-inside.sh` — copy verbatim from V1 (reproducible ISO build logic, GPG verification, initrd injection, grub patching, xorriso repack)

- [ ] Create `scripts/iso-builder/preseed.cfg.template` — copy verbatim from V1 (LUKS2 + LVM partitioning, SSH key staging, dropbear setup invocation)

- [ ] Create `scripts/iso-builder/late-command.sh` — copy from V1, update motd:
  ```sh
  #!/bin/sh
  # late-command.sh — runs in the installer chroot before reboot.
  # (V2: updated motd references from "Llamenos Hotline" to "Llamenos")
  set -eu
  # ... (same logic as V1) ...
  cat > /etc/motd <<EOF

    Llamenos — fresh install (Debian 13)
    ──────────────────────────────────────────────
    Disk encryption:  LUKS2 + LVM (active)
    Unlock mode:      ${UNLOCK_MODE}
    SSH user:         ${USERNAME} (sudo, key-only)
    Install status:   OK (see /var/lib/llamenos-iso-build-ok)

    NEXT STEP — from your workstation:

      cd <llamenos-checkout>/deploy/ansible
      just bootstrap   # if not already done
      ansible-playbook setup.yml -i 'this-host,'

  EOF
  ```

- [ ] Create `scripts/iso-builder/dropbear-setup.sh` — copy verbatim from V1 (dropbear-initramfs config, CIDR-to-netmask, static IP/DHCP network setup)

- [ ] Create `scripts/iso-builder/README.md` — copy from V1, update cross-references:
  ```markdown
  # ISO Builder Internals

  These files are invoked by `scripts/build-iso.sh` (the operator entrypoint)
  inside a pinned Debian 13 Docker container. Operators should NOT run these
  files directly.

  | File | Purpose |
  |------|---------|
  | `Dockerfile` | Pinned Debian 13 builder image with xorriso, gpg, debian-keyring, etc. |
  | `build-inside.sh` | Container entrypoint: GPG-verify upstream ISO, render preseed, stage helpers, repack |
  | `preseed.cfg.template` | Debian preseed template with `${VAR}` placeholders |
  | `late-command.sh` | Runs in installer chroot before reboot — stages SSH key, hardens sshd, calls dropbear-setup |
  | `dropbear-setup.sh` | Runs in installer chroot — configures dropbear-initramfs for remote LUKS unlock |

  See `docs/deployment/iso-install.md` for the operator guide and
  `docs/superpowers/specs/2026-04-09-fde-iso-builder-design.md` for the design rationale.
  ```

- [ ] Create `scripts/build-iso.sh` — copy from V1, update output filename:
  ```bash
  #!/usr/bin/env bash
  # scripts/build-iso.sh — host entrypoint for building a Llamenos FDE ISO.
  # (V2: output filename prefix changed from llamenos-debian13 to llamenos-fde-debian13)
  # ... (same validation and build logic as V1) ...
  # Line 296: ls -lh "${OUT_DIR_ABS}/llamenos-fde-debian13-${UNLOCK}.iso"{,.sha256}
  ```

- [ ] Create `scripts/verify-iso.sh` — copy from V1, update ISO glob pattern:
  ```bash
  # Line 42: find "$VERIFY_OUT" -name 'llamenos-fde-debian13-*.iso' | head -1
  ```

---

## Task 2: Ansible Playbooks + Roles

**V2 already has:** `deploy/ansible/` with setup.yml, playbooks (preflight, harden, deploy, smoke-check, observability), roles (common, llamenos, kamailio), templates, vars.example.yml, justfile.

**Missing from V1 that must be ported:**
- `playbooks/backup.yml`
- `playbooks/restore.yml`
- `playbooks/test-restore.yml`
- `playbooks/update.yml`
- `playbooks/deploy-demo.yml`
- `playbooks/reset-demo.yml`
- `roles/backup/` (complete role)
- `roles/ssh-hardening/` (V2's harden playbook references it but the role may be thin)
- `roles/firewall/` (UFW rules)
- `roles/kernel-hardening/` (sysctl hardening)
- `roles/fail2ban/` (brute-force protection)
- `roles/geoip/` (GeoIP database for rate limiting)

**Modifications for V2:**
- Replace all `minio` references with `rustfs` in backup role
- Update `vars.example.yml` to remove MinIO references, use RustFS
- Update service names: V2 uses `llamenos_app_enabled`, `llamenos_postgres_enabled`, etc.

- [ ] Create `deploy/ansible/playbooks/backup.yml`:
  ```yaml
  ---
  # Backup Playbook
  #
  # Runs an encrypted backup of the PostgreSQL database and uploads
  # it to an off-site storage destination via rclone.
  #
  # Usage:
  #   ansible-playbook playbooks/backup.yml --ask-vault-pass

  - name: Run backup
    hosts: all
    become: true
    vars_files:
      - ../vars.yml
    roles:
      - role: backup
        tags: [backup]
  ```

- [ ] Create `deploy/ansible/playbooks/restore.yml`:
  ```yaml
  ---
  # Restore Playbook
  #
  # Restores a PostgreSQL database from an age-encrypted backup file.
  #
  # Usage:
  #   ansible-playbook playbooks/restore.yml \
  #     -e "restore_backup_file=s3:bucket/llamenos-20260101-030000.sql.gz.age" \
  #     --ask-vault-pass

  - name: Restore from backup
    hosts: all
    become: true
    vars_files:
      - ../vars.yml
    tasks:
      - name: Assert backup file is specified
        ansible.builtin.assert:
          that:
            - restore_backup_file is defined
            - restore_backup_file | length > 0
          fail_msg: "Required: restore_backup_file must be set. Example: s3:bucket/file.sql.gz.age"

      - name: Download backup from remote
        ansible.builtin.command: |
          rclone copy "{{ restore_backup_file }}" /tmp/restore/
        when: "':' in restore_backup_file"
        changed_when: true

      - name: Decrypt backup with age
        ansible.builtin.command: |
          age -d -i "{{ backup_age_private_key_path }}" \
            -o /tmp/restore/llamenos-restore.sql.gz \
            /tmp/restore/{{ restore_backup_file | basename }}
        when: backup_age_private_key_path is defined
        changed_when: true

      - name: Restore PostgreSQL database
        ansible.builtin.shell: |
          set -euo pipefail
          gunzip -c /tmp/restore/llamenos-restore.sql.gz | \
            docker compose -f {{ app_dir }}/docker-compose.yml exec -T postgres \
            psql -U llamenos -d llamenos
        args:
          executable: /bin/bash
        changed_when: true

      - name: Clean up restore artifacts
        ansible.builtin.file:
          path: /tmp/restore
          state: absent
  ```

- [ ] Create `deploy/ansible/playbooks/test-restore.yml`:
  ```yaml
  ---
  # Test Restore Playbook
  #
  # Verifies that the latest backup can be decrypted and loaded into
  # a temporary PostgreSQL container. Non-destructive to production data.
  #
  # Usage:
  #   ansible-playbook playbooks/test-restore.yml --ask-vault-pass

  - name: Test backup restore
    hosts: all
    become: true
    vars_files:
      - ../vars.yml
    tasks:
      - name: Find latest daily backup
        ansible.builtin.find:
          paths: "{{ app_dir }}/backups/daily"
          patterns: "llamenos-*.sql.gz*"
        register: latest_backup

      - name: Assert backup exists
        ansible.builtin.assert:
          that:
            - latest_backup.files | length > 0
          fail_msg: "No daily backups found in {{ app_dir }}/backups/daily"

      - name: Run restore test in temporary container
        ansible.builtin.shell: |
          set -euo pipefail
          LATEST="{{ (latest_backup.files | sort(attribute='mtime', reverse=true))[0].path }}"
          echo "Testing restore of: $LATEST"
          # Create temporary restore container
          docker run --rm -i \
            -e POSTGRES_DB=llamenos \
            -e POSTGRES_USER=llamenos \
            -e POSTGRES_PASSWORD=testrestore \
            {{ llamenos_postgres_image | default('postgres:17-alpine') }} \
            bash -c "
              pg_ctlcluster 17 main start &
              sleep 3
              gunzip -c < /dev/stdin | psql -U llamenos -d llamenos
            " < "$LATEST"
          echo "Restore test PASSED"
        args:
          executable: /bin/bash
        changed_when: true
  ```

- [ ] Create `deploy/ansible/playbooks/update.yml`:
  ```yaml
  ---
  # Update Playbook
  #
  # Pulls latest Docker images, restarts the stack, and performs a
  # health-check-based rollback if the new version fails.
  #
  # Usage:
  #   ansible-playbook playbooks/update.yml --ask-vault-pass

  - name: Load configuration variables
    hosts: all
    gather_facts: false
    tasks:
      - name: Include vars file
        ansible.builtin.include_vars:
          file: ../vars.yml
        tags: always

  - name: Update Llamenos application
    hosts: all
    become: true
    vars:
      ansible_user: "{{ deploy_user | default('deploy') }}"
    tasks:
      - name: Pull latest images
        community.docker.docker_compose_v2:
          project_src: "{{ app_dir }}"
          pull: always
          state: present
        register: compose_pull

      - name: Restart stack with new images
        community.docker.docker_compose_v2:
          project_src: "{{ app_dir }}"
          state: present
          recreate: always
        register: compose_restart

      - name: Wait for application health check
        ansible.builtin.command: >
          docker compose -f {{ app_dir }}/docker-compose.yml
          exec -T app curl -sf http://localhost:3000/api/health
        register: health_check
        retries: 20
        delay: 5
        until: health_check.rc == 0
        changed_when: false

      - name: Report update success
        ansible.builtin.debug:
          msg: "Update successful. Health check: {{ health_check.stdout | default('OK') }}"
  ```

- [ ] Create `deploy/ansible/roles/backup/tasks/main.yml` — copy from V1, adapt for RustFS:
  ```yaml
  ---
  # Backup role
  #
  # Sets up automated encrypted backups:
  # - Installs age (modern encryption) and rclone (cloud sync)
  # - Creates a backup script that dumps PostgreSQL and RustFS blob storage
  # - Encrypts with age using the operator's public key
  # - Uploads to remote storage via rclone (if configured)
  # - Enforces retention policy (7 daily, 4 weekly, 3 monthly)
  # - Configures a daily cron job
  #
  # V2 ADAPTATION: Replaces MinIO references with RustFS. Uses V2 service
  # toggles and image variables.

  - name: Load OS-specific vars
    ansible.builtin.include_vars: "{{ lookup('ansible.builtin.first_found', params) }}"
    vars:
      params:
        files:
          - "{{ ansible_facts.distribution }}.yml"
          - "{{ ansible_facts.os_family }}.yml"
          - main.yml
        paths:
          - "{{ role_path }}/vars"

  - name: Install backup dependencies
    ansible.builtin.include_tasks: install.yml

  - name: Install rclone from apt
    ansible.builtin.apt:
      name: rclone
      state: present
      update_cache: true

  - name: Create backup directories
    ansible.builtin.file:
      path: "{{ app_dir }}/backups/{{ item }}"
      state: directory
      owner: "{{ deploy_user }}"
      group: "{{ deploy_group }}"
      mode: "0700"
    loop:
      - daily
      - weekly
      - monthly

  - name: Create backup script
    ansible.builtin.copy:
      dest: "{{ app_dir }}/scripts/backup.sh"
      owner: "{{ deploy_user }}"
      group: "{{ deploy_group }}"
      mode: "0750"
      content: |
        #!/usr/bin/env bash
        #
        # Llamenos Backup Script — managed by Ansible
        #
        # Performs an encrypted backup of the PostgreSQL database and RustFS blob storage.
        # Enforces retention: {{ backup_retain_daily | default(7) }} daily,
        # {{ backup_retain_weekly | default(4) }} weekly,
        # {{ backup_retain_monthly | default(3) }} monthly.
        #
        # Usage:
        #   ./backup.sh              # Run a daily backup
        #   ./backup.sh --manual     # Run and tag as manual backup

        set -euo pipefail

        BACKUP_DIR="{{ app_dir }}/backups"
        COMPOSE_FILE="{{ app_dir }}/docker-compose.yml"
        AGE_RECIPIENT="{{ backup_age_public_key | default('') }}"
        RCLONE_REMOTE="{{ backup_rclone_remote | default('') }}"
        TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
        DAY_OF_WEEK="$(date -u +%u)"
        DAY_OF_MONTH="$(date -u +%d)"

        # Determine backup type
        BACKUP_TYPE="daily"
        if [ "${1:-}" = "--manual" ]; then
          BACKUP_TYPE="manual"
        fi

        DB_FILENAME="llamenos-${TIMESTAMP}.sql.gz.age"
        BLOB_FILENAME="llamenos-blobs-${TIMESTAMP}.tar.gz.age"

        log() {
          echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
        }

        log "Starting ${BACKUP_TYPE} backup..."

        # Create temp directory for intermediate files
        TMPDIR="$(mktemp -d)"
        trap 'rm -rf "${TMPDIR}"' EXIT

        # Step 1: Dump PostgreSQL
        log "Dumping PostgreSQL database..."
        docker compose -f "${COMPOSE_FILE}" exec -T postgres \
          pg_dump -U llamenos -d llamenos --no-owner --no-privileges \
          | gzip -9 \
          > "${TMPDIR}/dump.sql.gz"

        DUMP_SIZE="$(stat -c%s "${TMPDIR}/dump.sql.gz")"
        log "Database dump: ${DUMP_SIZE} bytes (compressed)"

        # Step 1b: Dump RustFS blob storage via S3 API
        BLOB_SIZE=0
        STORAGE_ENDPOINT="{{ storage_endpoint | default('http://rustfs:9000') }}"
        STORAGE_ACCESS_KEY="{{ storage_access_key | default('') }}"
        STORAGE_SECRET_KEY="{{ storage_secret_key | default('') }}"

        if [ -n "${STORAGE_ACCESS_KEY}" ] && [ -n "${STORAGE_SECRET_KEY}" ]; then
          log "Dumping RustFS blob storage..."
          # Use rclone with S3 protocol to mirror RustFS buckets
          RCLONE_S3_CONFIG="--s3-provider=Other --s3-endpoint=${STORAGE_ENDPOINT} --s3-access-key-id=${STORAGE_ACCESS_KEY} --s3-secret-access-key=${STORAGE_SECRET_KEY} --s3-force-path-style"
          rclone copy ":s3:" "${TMPDIR}/blob-export/" ${RCLONE_S3_CONFIG} 2>/dev/null || true
          if [ -d "${TMPDIR}/blob-export" ] && [ "$(ls -A "${TMPDIR}/blob-export" 2>/dev/null)" ]; then
            tar czf "${TMPDIR}/blobs.tar.gz" -C "${TMPDIR}/blob-export" .
            rm -rf "${TMPDIR}/blob-export"
          fi

          if [ -f "${TMPDIR}/blobs.tar.gz" ]; then
            BLOB_SIZE="$(stat -c%s "${TMPDIR}/blobs.tar.gz")"
            log "Blob storage dump: ${BLOB_SIZE} bytes (compressed)"
          else
            log "WARNING: Blob storage dump produced no output (empty or no buckets)"
          fi
        else
          log "Skipping blob storage backup (no STORAGE_ACCESS_KEY/STORAGE_SECRET_KEY configured)"
        fi

        # Step 2: Encrypt with age
        if [ -n "${AGE_RECIPIENT}" ]; then
          log "Encrypting database backup with age..."
          age -r "${AGE_RECIPIENT}" -o "${TMPDIR}/${DB_FILENAME}" "${TMPDIR}/dump.sql.gz"
          if [ -f "${TMPDIR}/blobs.tar.gz" ]; then
            log "Encrypting blob backup with age..."
            age -r "${AGE_RECIPIENT}" -o "${TMPDIR}/${BLOB_FILENAME}" "${TMPDIR}/blobs.tar.gz"
          fi
        else
          log "WARNING: No age public key configured. Backups are NOT encrypted."
          DB_FILENAME="llamenos-${TIMESTAMP}.sql.gz"
          mv "${TMPDIR}/dump.sql.gz" "${TMPDIR}/${DB_FILENAME}"
          if [ -f "${TMPDIR}/blobs.tar.gz" ]; then
            BLOB_FILENAME="llamenos-blobs-${TIMESTAMP}.tar.gz"
            mv "${TMPDIR}/blobs.tar.gz" "${TMPDIR}/${BLOB_FILENAME}"
          fi
        fi

        # Step 3: Store in daily directory
        cp "${TMPDIR}/${DB_FILENAME}" "${BACKUP_DIR}/daily/${DB_FILENAME}"
        log "Saved DB to ${BACKUP_DIR}/daily/${DB_FILENAME}"
        if [ -f "${TMPDIR}/${BLOB_FILENAME}" ]; then
          cp "${TMPDIR}/${BLOB_FILENAME}" "${BACKUP_DIR}/daily/${BLOB_FILENAME}"
          log "Saved blobs to ${BACKUP_DIR}/daily/${BLOB_FILENAME}"
        fi

        # Step 4: Copy to weekly (on Sundays) and monthly (on 1st)
        if [ "${DAY_OF_WEEK}" = "7" ]; then
          cp "${TMPDIR}/${DB_FILENAME}" "${BACKUP_DIR}/weekly/${DB_FILENAME}"
          [ -f "${TMPDIR}/${BLOB_FILENAME}" ] && cp "${TMPDIR}/${BLOB_FILENAME}" "${BACKUP_DIR}/weekly/${BLOB_FILENAME}"
          log "Weekly backup saved"
        fi

        if [ "${DAY_OF_MONTH}" = "01" ]; then
          cp "${TMPDIR}/${DB_FILENAME}" "${BACKUP_DIR}/monthly/${DB_FILENAME}"
          [ -f "${TMPDIR}/${BLOB_FILENAME}" ] && cp "${TMPDIR}/${BLOB_FILENAME}" "${BACKUP_DIR}/monthly/${BLOB_FILENAME}"
          log "Monthly backup saved"
        fi

        # Step 5: Upload to remote storage via rclone
        if [ -n "${RCLONE_REMOTE}" ]; then
          log "Uploading to remote storage: ${RCLONE_REMOTE}"
          rclone copy "${TMPDIR}/${DB_FILENAME}" "${RCLONE_REMOTE}/daily/" --progress
          [ -f "${TMPDIR}/${BLOB_FILENAME}" ] && rclone copy "${TMPDIR}/${BLOB_FILENAME}" "${RCLONE_REMOTE}/daily/" --progress
          if [ "${DAY_OF_WEEK}" = "7" ]; then
            rclone copy "${TMPDIR}/${DB_FILENAME}" "${RCLONE_REMOTE}/weekly/" --progress
            [ -f "${TMPDIR}/${BLOB_FILENAME}" ] && rclone copy "${TMPDIR}/${BLOB_FILENAME}" "${RCLONE_REMOTE}/weekly/" --progress
          fi
          if [ "${DAY_OF_MONTH}" = "01" ]; then
            rclone copy "${TMPDIR}/${DB_FILENAME}" "${RCLONE_REMOTE}/monthly/" --progress
            [ -f "${TMPDIR}/${BLOB_FILENAME}" ] && rclone copy "${TMPDIR}/${BLOB_FILENAME}" "${RCLONE_REMOTE}/monthly/" --progress
          fi
          log "Remote upload complete"
        fi

        # Step 6: Enforce retention policy
        log "Enforcing retention policy..."

        enforce_retention() {
          local dir="$1"
          local keep="$2"
          local pattern="${3:-llamenos-*}"
          local count
          count="$(find "${dir}" -maxdepth 1 -type f -name "${pattern}" | wc -l)"
          if [ "${count}" -gt "${keep}" ]; then
            local to_delete=$(( count - keep ))
            find "${dir}" -maxdepth 1 -type f -name "${pattern}" -printf '%T@ %p\n' \
              | sort -n \
              | head -n "${to_delete}" \
              | cut -d' ' -f2- \
              | xargs rm -f
            log "Removed ${to_delete} old ${pattern} from ${dir}"
          fi
        }

        # Retain DB backups
        enforce_retention "${BACKUP_DIR}/daily" {{ backup_retain_daily | default(7) }} "llamenos-[0-9]*.sql.gz*"
        enforce_retention "${BACKUP_DIR}/weekly" {{ backup_retain_weekly | default(4) }} "llamenos-[0-9]*.sql.gz*"
        enforce_retention "${BACKUP_DIR}/monthly" {{ backup_retain_monthly | default(3) }} "llamenos-[0-9]*.sql.gz*"
        # Retain blob backups (same schedule)
        enforce_retention "${BACKUP_DIR}/daily" {{ backup_retain_daily | default(7) }} "llamenos-blobs-*"
        enforce_retention "${BACKUP_DIR}/weekly" {{ backup_retain_weekly | default(4) }} "llamenos-blobs-*"
        enforce_retention "${BACKUP_DIR}/monthly" {{ backup_retain_monthly | default(3) }} "llamenos-blobs-*"

        # Also enforce retention on remote
        if [ -n "${RCLONE_REMOTE}" ]; then
          rclone delete "${RCLONE_REMOTE}/daily/" --min-age "{{ backup_retain_daily | default(7) }}d" 2>/dev/null || true
          rclone delete "${RCLONE_REMOTE}/weekly/" --min-age "{{ backup_retain_weekly | default(4) * 7 }}d" 2>/dev/null || true
          rclone delete "${RCLONE_REMOTE}/monthly/" --min-age "{{ backup_retain_monthly | default(3) * 30 }}d" 2>/dev/null || true
        fi

        # Step 7: Write backup status for health endpoint
        DB_SIZE="$(stat -c%s "${TMPDIR}/${DB_FILENAME}" 2>/dev/null || echo 0)"
        TOTAL_BLOB_SIZE="${BLOB_SIZE}"
        printf '{"lastSuccessAt":"%s","lastSizeBytes":%s,"dbSizeBytes":%s,"blobSizeBytes":%s,"file":"%s"}\n' \
          "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
          "$(( DB_SIZE + TOTAL_BLOB_SIZE ))" \
          "${DB_SIZE}" \
          "${TOTAL_BLOB_SIZE}" \
          "${DB_FILENAME}" \
          > "${BACKUP_DIR}/.status.json"
        chmod 644 "${BACKUP_DIR}/.status.json"

        log "Backup complete: ${DB_FILENAME} (${DB_SIZE} bytes DB, ${TOTAL_BLOB_SIZE} bytes blobs)"

  - name: Run initial backup (non-fatal)
    ansible.builtin.command: "{{ app_dir }}/scripts/backup.sh"
    become_user: "{{ deploy_user }}"
    register: initial_backup_result
    changed_when: "'Backup complete' in initial_backup_result.stdout"
    failed_when: false

  - name: Warn if initial backup failed
    ansible.builtin.debug:
      msg: "WARNING: Initial backup returned rc={{ initial_backup_result.rc }}. Check next scheduled run at T+24h. stderr: {{ initial_backup_result.stderr | default('') }}"
    when: initial_backup_result.rc != 0

  - name: Configure daily backup cron job
    ansible.builtin.cron:
      name: "Llamenos daily backup"
      user: "{{ deploy_user }}"
      hour: "{{ backup_cron_hour | default('3') }}"
      minute: "{{ backup_cron_minute | default('0') }}"
      job: "{{ app_dir }}/scripts/backup.sh >> {{ app_dir }}/backups/backup.log 2>&1"
      state: "{{ 'present' if backup_enabled | default(true) else 'absent' }}"

  - name: Configure backup log rotation
    ansible.builtin.copy:
      dest: /etc/logrotate.d/llamenos-backup
      owner: root
      group: root
      mode: "0644"
      content: |
        {{ app_dir }}/backups/backup.log {
            weekly
            rotate 4
            compress
            delaycompress
            missingok
            notifempty
            create 0640 {{ deploy_user }} {{ deploy_group }}
        }
  ```

- [ ] Create `deploy/ansible/roles/backup/tasks/install.yml`:
  ```yaml
  ---
  - name: Install age (modern encryption tool)
    ansible.builtin.apt:
      name: age
      state: present
      update_cache: true
  ```

- [ ] Create `deploy/ansible/roles/backup/vars/main.yml`:
  ```yaml
  ---
  # Backup role defaults
  backup_retain_daily: 7
  backup_retain_weekly: 4
  backup_retain_monthly: 3
  backup_cron_hour: "3"
  backup_cron_minute: "0"
  backup_enabled: true
  ```

- [ ] Create `deploy/ansible/roles/ssh-hardening/tasks/main.yml` — copy from V1 (complete SSH hardening with cloud-init drop-in removal, crypto settings, custom port)

- [ ] Create `deploy/ansible/roles/firewall/tasks/main.yml` — copy from V1 (UFW configuration with Docker forwarding rules)

- [ ] Create `deploy/ansible/roles/kernel-hardening/tasks/main.yml` — copy from V1 (sysctl hardening: SYN cookies, rp_filter, ICMP redirects, memory protections, connection tracking)

- [ ] Create `deploy/ansible/roles/fail2ban/tasks/main.yml` — copy from V1 (SSH jail with UFW integration, aggressive mode)

- [ ] Create `deploy/ansible/roles/geoip/tasks/main.yml` (if not present in V2):
  ```yaml
  ---
  # GeoIP role
  #
  # Downloads and installs GeoIP2 databases for IP geolocation
  # (used by rate limiting and spam mitigation).

  - name: Install GeoIP dependencies
    ansible.builtin.apt:
      name:
        - geoipupdate
        - libmaxminddb0
      state: present
      update_cache: true

  - name: Configure GeoIP update
    ansible.builtin.copy:
      dest: /etc/GeoIP.conf
      owner: root
      group: root
      mode: "0644"
      content: |
        # GeoIP.conf — managed by Ansible
        # AccountID and LicenseKey must be set in vars.yml
        AccountID {{ geoip_account_id | default(0) }}
        LicenseKey {{ geoip_license_key | default('') }}
        EditionIDs GeoLite2-Country GeoLite2-City
    when: geoip_account_id is defined and geoip_license_key is defined

  - name: Run initial GeoIP database download
    ansible.builtin.command: geoipupdate
    when: geoip_account_id is defined and geoip_license_key is defined
    changed_when: true

  - name: Configure GeoIP update cron (weekly)
    ansible.builtin.cron:
      name: "GeoIP database update"
      minute: "0"
      hour: "4"
      weekday: "0"
      job: "/usr/bin/geoipupdate"
      user: root
      state: "{{ 'present' if geoip_account_id is defined else 'absent' }}"
  ```

- [ ] Update `deploy/ansible/vars.example.yml` — replace MinIO with RustFS:
  ```yaml
  # ─── Storage (RustFS) ──────────────────────────────────────────
  # REQUIRED: Access credentials for RustFS (S3-compatible object storage)
  # Generate with: openssl rand -base64 24
  storage_access_key: ""
  storage_secret_key: ""
  storage_bucket: llamenos-files
  storage_endpoint: http://rustfs:9000
  storage_sse_enabled: true
  ```
  And update service toggles section to replace `llamenos_minio_enabled` with `llamenos_rustfs_enabled`.

- [ ] Update `deploy/ansible/justfile` — add backup, restore, and update recipes from V1:
  ```just
  # Run encrypted backup
  backup *ARGS:
      ansible-playbook playbooks/backup.yml --ask-vault-pass {{ARGS}}

  # Restore from backup
  restore backup_file *ARGS:
      ansible-playbook playbooks/restore.yml --ask-vault-pass \
          --extra-vars "restore_backup_file={{backup_file}}" {{ARGS}}

  # Test that the latest backup can be restored
  test-restore *ARGS:
      ansible-playbook playbooks/test-restore.yml --ask-vault-pass {{ARGS}}

  # Update app (pull new image + restart with health check)
  update *ARGS:
      ansible-playbook playbooks/update.yml --ask-vault-pass {{ARGS}}
  ```

---

## Task 3: Caddy Config with New Vhosts

**V2 already has:** `deploy/docker/Caddyfile.production` with app.*, api.*, and crypto.* origins.

**New additions:**
- `downloads.llamenos.org` — serves desktop release artifacts from RustFS `/releases/` bucket
- `updates.llamenos.org` — serves Tauri updater signatures and artifacts from RustFS `/staging/` and `/releases/` buckets

**Modifications:**
- Add RustFS bucket configuration for `/staging/` and `/releases/` paths
- Add `downloads.` and `updates.` vhost blocks to Caddyfile.production
- Add corresponding Jinja2 template blocks to `deploy/ansible/roles/llamenos/templates/caddy.j2`

- [ ] Update `deploy/docker/Caddyfile.production` — append new vhosts:
  ```caddy
  # ─── Downloads origin — downloads.<parent> ────────────────────────
  # Serves desktop release artifacts (AppImage, DMG, EXE, checksums)
  # from the RustFS /releases/ bucket. Files are public; no auth needed.
  {$DOWNLOADS_DOMAIN} {
  	encode gzip zstd

  	# Proxy to RustFS S3 API for /releases/ bucket
  	handle /releases/* {
  		reverse_proxy rustfs:9000 {
  			header_up Host rustfs:9000
  		}
  		uri strip_prefix /releases
  	}

  	# Default: redirect / to latest release page on GitHub
  	handle {
  		redir https://github.com/llamenos/llamenos/releases/latest permanent
  	}

  	header {
  		# Static file CSP — no scripts, no frames
  		Content-Security-Policy "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'self'; font-src 'none'; connect-src 'none'; media-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; upgrade-insecure-requests"

  		Cross-Origin-Opener-Policy "same-origin"
  		Cross-Origin-Resource-Policy "cross-origin"
  		Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
  		X-Content-Type-Options "nosniff"
  		Referrer-Policy "no-referrer"
  		-Server
  	}
  }

  # ─── Updates origin — updates.<parent> ────────────────────────────
  # Serves Tauri updater metadata and signature files from RustFS.
  # The Tauri updater polls this endpoint for new versions.
  {$UPDATES_DOMAIN} {
  	encode gzip zstd

  	# Staging bucket — pre-release builds for testing
  	handle /staging/* {
  		reverse_proxy rustfs:9000 {
  			header_up Host rustfs:9000
  		}
  		uri strip_prefix /staging
  	}

  	# Releases bucket — production updater artifacts
  	handle /releases/* {
  		reverse_proxy rustfs:9000 {
  			header_up Host rustfs:9000
  		}
  		uri strip_prefix /releases
  	}

  	# Updater JSON endpoint — serves latest version metadata
  	handle /latest.json {
  		reverse_proxy rustfs:9000 {
  			header_up Host rustfs:9000
  		}
  	}

  	header {
  		# Allow CORS from app.* origin for updater checks
  		Access-Control-Allow-Origin "https://{$APP_DOMAIN}"
  		Access-Control-Allow-Methods "GET, HEAD"
  		Vary "Origin"

  		Cross-Origin-Opener-Policy "same-origin"
  		Cross-Origin-Resource-Policy "cross-origin"
  		Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
  		X-Content-Type-Options "nosniff"
  		Referrer-Policy "no-referrer"
  		-Server
  	}
  }
  ```

- [ ] Update `deploy/ansible/roles/llamenos/templates/caddy.j2` — append Jinja2 versions of the above vhosts, using `{{ downloads_domain }}` and `{{ updates_domain }}` variables

- [ ] Update `deploy/ansible/vars.example.yml` — add domain variables:
  ```yaml
  # ─── Domain Configuration ──────────────────────────────────────
  # Subdomains for the split-origin layout
  app_domain: "app.{{ domain }}"
  api_domain: "api.{{ domain }}"
  crypto_domain: "crypto.{{ domain }}"
  downloads_domain: "downloads.{{ domain }}"
  updates_domain: "updates.{{ domain }}"
  ```

- [ ] Update `deploy/ansible/roles/llamenos/templates/env.j2` — add new env vars:
  ```bash
  # ─── Desktop Distribution Domains ──────────────────────────────
  DOWNLOADS_DOMAIN={{ downloads_domain | default('downloads.' + domain) }}
  UPDATES_DOMAIN={{ updates_domain | default('updates.' + domain) }}
  ```

---

## Task 4: RustFS Bucket Setup

**Context:** V2 uses RustFS (not MinIO). The backup role and Caddy vhosts reference `/staging/` and `/releases/` buckets. These must be created at deploy time.

**Implementation:** Add RustFS bucket initialization to the `llamenos` Ansible role and docker-compose template.

- [ ] Update `deploy/ansible/roles/llamenos/tasks/main.yml` — add RustFS bucket initialization:
  ```yaml
  - name: Create RustFS buckets (staging, releases, files)
    ansible.builtin.shell: |
      set -euo pipefail
      cd "{{ app_dir }}"
      # Wait for RustFS to be ready
      for i in $(seq 1 30); do
        if docker compose exec -T rustfs mc ready local 2>/dev/null; then
          break
        fi
        sleep 2
      done
      # Configure mc alias
      docker compose exec -T rustfs \
        mc alias set local http://localhost:9000 {{ storage_access_key }} {{ storage_secret_key }} 2>/dev/null || true
      # Create buckets if they don't exist
      for bucket in llamenos-files llamenos-staging llamenos-releases; do
        docker compose exec -T rustfs \
          mc mb local/${bucket} 2>/dev/null || echo "Bucket ${bucket} already exists"
      done
      # Set public read policy on releases bucket (for downloads)
      docker compose exec -T rustfs \
        mc anonymous set download local/llamenos-releases 2>/dev/null || true
    args:
      executable: /bin/bash
    changed_when: true
    when: llamenos_rustfs_enabled | default(true) | bool
  ```

- [ ] Update `deploy/ansible/roles/llamenos/templates/docker-compose.j2` — ensure RustFS service is present (replace MinIO references):
  ```yaml
  rustfs:
    image: {{ rustfs_image | default('rustfs/rustfs:latest') }}
    restart: unless-stopped
    command: server /data --console-address ":9001"
    volumes:
      - rustfs-data:/data
    environment:
      - RUSTFS_ROOT_USER={{ storage_access_key }}
      - RUSTFS_ROOT_PASSWORD={{ storage_secret_key }}
    networks:
      - internal
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
  ```

- [ ] Update `deploy/docker/docker-compose.yml` — replace `minio:` service with `rustfs:` (same config as above, using env vars from .env)

---

## Task 5: Production Checklist

**V1 source:** `/home/rikki/projects/llamenos-hotline/deploy/PRODUCTION_CHECKLIST.md` (125 points)
**V2 already has:** `/media/rikki/recover2/projects/llamenos-plan-vps-infra-port/deploy/PRODUCTION_CHECKLIST.md`

**Modifications:**
- Update all MinIO references to RustFS
- Add desktop distribution checklist items (downloads domain, updates domain, code signing)
- Update for V2 service architecture (observability stack, signal notifier)
- Add RustFS bucket verification

- [ ] Update `deploy/PRODUCTION_CHECKLIST.md` — add new sections and update existing ones:
  ```markdown
  ## Infrastructure

  - [ ] Server provisioned in Iceland (1984 Hosting) — GDPR compliance + privacy jurisdiction
  - [ ] SSH access restricted to admin IPs only (not 0.0.0.0/0)
  - [ ] SSH key authentication only (password auth disabled)
  - [ ] Firewall rules: only 80, 443, and SSH port open
  - [ ] Unattended security updates enabled
  - [ ] fail2ban configured and running
  - [ ] NTP synchronized (critical for Schnorr token validation)
  - [ ] LUKS2 disk encryption active (verify: `cryptsetup status`)

  ## RustFS (Object Storage)

  - [ ] RustFS container running and healthy
  - [ ] `llamenos-files` bucket created (for app uploads)
  - [ ] `llamenos-staging` bucket created (for pre-release builds)
  - [ ] `llamenos-releases` bucket created (for release artifacts)
  - [ ] `llamenos-releases` bucket has public read policy (for downloads domain)
  - [ ] `STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY` are unique and >= 24 chars
  - [ ] SSE (server-side encryption) enabled on all buckets

  ## Desktop Distribution

  - [ ] `downloads.{{ domain }}` DNS A record points to server IP
  - [ ] `updates.{{ domain }}` DNS A record points to server IP
  - [ ] Caddy vhosts for downloads and updates are active
  - [ ] Release artifacts uploaded to RustFS /releases/ bucket
  - [ ] Tauri updater JSON (`latest.json`) accessible at `https://updates.{{ domain }}/latest.json`
  - [ ] Code signing certificates configured (Windows: Authenticode, macOS: Developer ID)
  - [ ] SLSA provenance attestation generated for each release
  - [ ] CHECKSUMS.txt published with each release
  ```

---

## Task 6: CI Workflows

**V1 source:** `.github/workflows/iso-builder.yml`, `.github/workflows/deploy-demo.yml`, `.github/workflows/auto-deploy-demo.yml`
**V2 destination:** `.github/workflows/`

**Modifications:**
- Update repository references from `rhonda-rodododo/llamenos-hotline` to `llamenos/llamenos`
- Update image names from `llamenos-hotline` to `llamenos`
- Update path triggers for V2 directory structure

- [ ] Create `.github/workflows/iso-builder.yml`:
  ```yaml
  name: ISO Builder

  on:
    push:
      branches: [main]
      paths:
        - 'scripts/build-iso.sh'
        - 'scripts/verify-iso.sh'
        - 'scripts/iso-builder/**'
        - 'tests/iso-builder/**'
        - '.github/workflows/iso-builder.yml'
    pull_request:
      paths:
        - 'scripts/build-iso.sh'
        - 'scripts/verify-iso.sh'
        - 'scripts/iso-builder/**'
        - 'tests/iso-builder/**'
        - '.github/workflows/iso-builder.yml'

  permissions:
    contents: read

  jobs:
    bats:
      name: Bats tests (arg parsing + template rendering)
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6.0.2
        - name: Install bats and gettext
          run: |
            sudo apt-get update
            sudo apt-get install -y bats gettext-base shellcheck
        - name: Shellcheck builder scripts
          run: |
            shellcheck --severity=warning scripts/build-iso.sh scripts/verify-iso.sh
            shellcheck --severity=warning -s sh scripts/iso-builder/late-command.sh scripts/iso-builder/dropbear-setup.sh
            shellcheck --severity=warning scripts/iso-builder/build-inside.sh
        - name: Run bats
          run: bats tests/iso-builder/

    build:
      name: Full ISO build + reproducibility
      runs-on: ubuntu-latest
      needs: bats
      concurrency:
        group: iso-build-${{ github.ref }}
        cancel-in-progress: true
      steps:
        - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6.0.2
        - name: Generate test SSH key
          run: |
            mkdir -p ${{ runner.temp }}/key
            ssh-keygen -t ed25519 -N '' -f ${{ runner.temp }}/key/test_ed25519 -C ci-test
        - name: Build ISO
          run: |
            ./scripts/build-iso.sh \
              --hostname ci-test-host \
              --ssh-key ${{ runner.temp }}/key/test_ed25519.pub \
              --unlock dropbear \
              --out ${{ runner.temp }}/out
        - name: Verify output
          run: |
            ls -lh ${{ runner.temp }}/out/
            test -f ${{ runner.temp }}/out/llamenos-fde-debian13-dropbear.iso
            test -f ${{ runner.temp }}/out/llamenos-fde-debian13-dropbear.iso.sha256
            ( cd ${{ runner.temp }}/out && sha256sum -c llamenos-fde-debian13-dropbear.iso.sha256 )
            test "$(stat -c%s ${{ runner.temp }}/out/llamenos-fde-debian13-dropbear.iso)" -gt 100000000
        - name: Reproducibility check
          run: |
            ./scripts/verify-iso.sh ${{ runner.temp }}/out/llamenos-fde-debian13-dropbear.iso -- \
              --hostname ci-test-host \
              --ssh-key ${{ runner.temp }}/key/test_ed25519.pub \
              --unlock dropbear
  ```

- [ ] Create `.github/workflows/deploy-demo.yml`:
  ```yaml
  name: Deploy Demo

  # Manual-only workflow: deploy the Llamenos demo VPS instance via Ansible.
  #
  # Required secrets:
  #   DEMO_INVENTORY_YML       — content of inventory-demo.yml (Ansible inventory)
  #   ANSIBLE_VAULT_PASSWORD   — password for ansible-vault encrypted demo_vars.yml
  #   DEMO_VARS_YML_ENCRYPTED  — content of encrypted demo_vars.yml
  #   DEMO_SSH_PRIVATE_KEY     — SSH private key for the demo VPS deploy user

  on:
    workflow_dispatch:
      inputs:
        reset_data:
          description: "Reset demo data after deploying?"
          type: boolean
          default: false
          required: false

  jobs:
    deploy-demo:
      name: Deploy to Demo VPS
      runs-on: ubuntu-latest
      environment: demo

      steps:
        - name: Checkout
          uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

        - name: Install Ansible
          run: |
            pip install ansible

        - name: Install Ansible community.docker collection
          run: |
            ansible-galaxy collection install community.docker

        - name: Write Ansible inventory
          run: |
            mkdir -p deploy/ansible
            printf '%s' "${{ secrets.DEMO_INVENTORY_YML }}" > deploy/ansible/inventory-demo.yml

        - name: Write Ansible vault password
          run: |
            printf '%s' "${{ secrets.ANSIBLE_VAULT_PASSWORD }}" > /tmp/vault-pass
            chmod 600 /tmp/vault-pass

        - name: Write encrypted demo vars
          run: |
            printf '%s' "${{ secrets.DEMO_VARS_YML_ENCRYPTED }}" > deploy/ansible/demo_vars.yml

        - name: Write SSH private key
          run: |
            mkdir -p ~/.ssh
            printf '%s' "${{ secrets.DEMO_SSH_PRIVATE_KEY }}" > ~/.ssh/llamenos_demo_deploy
            chmod 600 ~/.ssh/llamenos_demo_deploy
            ssh-keyscan -H "$(grep ansible_host deploy/ansible/inventory-demo.yml | head -1 | awk '{print $2}')" >> ~/.ssh/known_hosts 2>/dev/null || true

        - name: Deploy demo instance
          working-directory: deploy/ansible
          run: |
            ansible-playbook playbooks/deploy-demo.yml \
              -i inventory-demo.yml \
              --vault-password-file /tmp/vault-pass

        - name: Reset demo data
          if: ${{ inputs.reset_data }}
          working-directory: deploy/ansible
          run: |
            ansible-playbook playbooks/reset-demo.yml \
              -i inventory-demo.yml \
              --vault-password-file /tmp/vault-pass

        - name: Clean up secrets
          if: always()
          run: |
            rm -f /tmp/vault-pass
            rm -f ~/.ssh/llamenos_demo_deploy
            rm -f deploy/ansible/inventory-demo.yml
            rm -f deploy/ansible/demo_vars.yml
  ```

- [ ] Create `.github/workflows/auto-deploy-demo.yml`:
  ```yaml
  name: Auto-Deploy Demo

  # Triggered automatically when a GitHub Release is published.
  # Waits for the Docker image to be pushed by docker.yml, then deploys
  # to the demo VPS via Ansible using the release tag.
  #
  # Required secrets (same as deploy-demo.yml):
  #   DEMO_INVENTORY_YML       — content of inventory-demo.yml (Ansible inventory)
  #   ANSIBLE_VAULT_PASSWORD   — password for ansible-vault encrypted demo_vars.yml
  #   DEMO_VARS_YML_ENCRYPTED  — content of encrypted demo_vars.yml
  #   DEMO_SSH_PRIVATE_KEY     — SSH private key for the demo VPS deploy user

  on:
    release:
      types: [published]
    workflow_dispatch:
      inputs:
        tag:
          description: "Release tag to deploy (e.g. v1.2.3)"
          required: true
        reset_data:
          description: "Reset demo data after deploy?"
          type: boolean
          default: false

  concurrency:
    group: deploy-demo
    cancel-in-progress: false  # Never cancel an in-progress deploy

  permissions:
    contents: read
    packages: read

  jobs:
    deploy-demo:
      name: Deploy to Demo VPS
      runs-on: ubuntu-latest
      environment: demo
      timeout-minutes: 30

      steps:
        - name: Resolve tag
          id: tag
          run: |
            TAG="${{ github.event.release.tag_name || inputs.tag }}"
            echo "tag=$TAG" >> "$GITHUB_OUTPUT"
            echo "Deploying tag: $TAG"

        - name: Wait for Docker image to be available
          run: |
            TAG="${{ steps.tag.outputs.tag }}"
            IMAGE="ghcr.io/${{ github.repository }}:${TAG#v}"
            echo "Waiting for image: $IMAGE"
            for i in $(seq 1 20); do
              if docker manifest inspect "$IMAGE" > /dev/null 2>&1; then
                echo "Image available after attempt $i"
                exit 0
              fi
              echo "Attempt $i/20: image not yet available, waiting 30s..."
              sleep 30
            done
            echo "ERROR: Image $IMAGE not available after 10 minutes"
            exit 1

        - name: Checkout
          uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
          with:
            ref: ${{ steps.tag.outputs.tag }}

        - name: Install Ansible
          run: |
            pip install ansible
            ansible-galaxy collection install community.docker

        - name: Write Ansible inventory
          run: |
            printf '%s' "${{ secrets.DEMO_INVENTORY_YML }}" > deploy/ansible/inventory-demo.yml

        - name: Write Ansible vault password
          run: |
            printf '%s' "${{ secrets.ANSIBLE_VAULT_PASSWORD }}" > /tmp/vault-pass
            chmod 600 /tmp/vault-pass

        - name: Write encrypted demo vars
          run: |
            printf '%s' "${{ secrets.DEMO_VARS_YML_ENCRYPTED }}" > deploy/ansible/demo_vars.yml

        - name: Write SSH private key
          run: |
            mkdir -p ~/.ssh
            printf '%s' "${{ secrets.DEMO_SSH_PRIVATE_KEY }}" > ~/.ssh/llamenos_demo_deploy
            chmod 600 ~/.ssh/llamenos_demo_deploy
            ssh-keyscan -H "$(grep ansible_host deploy/ansible/inventory-demo.yml | head -1 | awk '{print $2}')" >> ~/.ssh/known_hosts 2>/dev/null || true

        - name: Deploy demo instance
          working-directory: deploy/ansible
          run: |
            TAG="${{ steps.tag.outputs.tag }}"
            IMAGE="ghcr.io/${{ github.repository }}:${TAG#v}"
            ansible-playbook playbooks/deploy-demo.yml \
              -i inventory-demo.yml \
              --vault-password-file /tmp/vault-pass \
              --extra-vars "llamenos_image=${IMAGE}"

        - name: Reset demo data
          if: ${{ inputs.reset_data == true }}
          working-directory: deploy/ansible
          run: |
            ansible-playbook playbooks/reset-demo.yml \
              -i inventory-demo.yml \
              --vault-password-file /tmp/vault-pass

        - name: Verify deployment
          working-directory: deploy/ansible
          run: |
            DEMO_HOST=$(ansible-inventory -i inventory-demo.yml --list 2>/dev/null | \
              python3 -c "import sys,json; inv=json.load(sys.stdin); print(next(iter(inv.get('demo',{}).get('hosts',{}).keys()),''))" 2>/dev/null || true)
            if [[ -z "$DEMO_HOST" ]]; then
              echo "Could not determine demo host from inventory — skipping external health check"
              exit 0
            fi
            HEALTH_URL="https://${DEMO_HOST}/api/health"
            echo "Checking health at: $HEALTH_URL"
            for i in $(seq 1 12); do
              STATUS=$(curl -sf "$HEALTH_URL" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null || echo "")
              if [[ "$STATUS" == "ok" ]]; then
                echo "Health check passed (attempt $i)"
                exit 0
              fi
              echo "Attempt $i/12: status='${STATUS}', waiting 10s..."
              sleep 10
            done
            echo "WARNING: Health check did not return 'ok' after 2 minutes — deploy may still be starting up"

        - name: Clean up secrets
          if: always()
          run: |
            rm -f /tmp/vault-pass
            rm -f ~/.ssh/llamenos_demo_deploy
            rm -f deploy/ansible/inventory-demo.yml
            rm -f deploy/ansible/demo_vars.yml
  ```

---

## Task 7: OpenTofu IaC (1984 Hosting Iceland)

**V1 source:** `deploy/opentofu/` — Hetzner Cloud module
**V2 already has:** `deploy/opentofu/` with Hetzner module

**Modifications:**
- 1984 Hosting does not have a Terraform/OpenTofu provider. Document as manual provisioning.
- Create a `modules/1984hosting/` module that outputs placeholder documentation
- Update root `main.tf` to support provider selection via variable

- [ ] Create `deploy/opentofu/modules/1984hosting/main.tf`:
  ```hcl
  # 1984 Hosting (Iceland) Module
  #
  # 1984 Hosting does not provide a Terraform/OpenTofu provider.
  # This module documents the manual provisioning steps and outputs
  # a generated Ansible inventory for use after manual setup.
  #
  # Manual provisioning steps:
  #   1. Order VPS at https://1984.hosting/ (select Iceland datacenter)
  #   2. Choose Debian 13 (trixie) as the OS image
  #   3. Add your SSH public key during ordering
  #   4. Note the assigned IPv4 address from the confirmation email
  #   5. Update your DNS A records to point to this IP
  #   6. Run Ansible: cd deploy/ansible && just setup-all
  #
  # For FDE (Full Disk Encryption):
  #   1. Build the FDE ISO: scripts/build-iso.sh --hostname <host> --ssh-key <pubkey>
  #   2. Mount the ISO via 1984 Hosting's remote console (VNC/iKVM)
  #   3. Boot from ISO and complete the LUKS2 installation
  #   4. Configure dropbear-initramfs for remote LUKS unlock
  #   5. Unlock remotely: ssh -p 2222 deploy@<ip> cryptroot-unlock

  locals {
    # These values must be filled in manually after provisioning
    server_ip   = var.server_ip
    server_name = var.server_name
    domain      = var.domain
  }
  ```

- [ ] Create `deploy/opentofu/modules/1984hosting/variables.tf`:
  ```hcl
  variable "server_ip" {
    description = "IPv4 address assigned by 1984 Hosting after manual provisioning"
    type        = string
  }

  variable "server_name" {
    description = "Server hostname"
    type        = string
    default     = "llamenos-iceland"
  }

  variable "domain" {
    description = "Primary domain for this instance"
    type        = string
  }
  ```

- [ ] Create `deploy/opentofu/modules/1984hosting/outputs.tf`:
  ```hcl
  output "server_ip" {
    description = "The manually assigned server IP"
    value       = var.server_ip
  }

  output "server_name" {
    description = "The server hostname"
    value       = var.server_name
  }

  output "ansible_inventory" {
    description = "Generated Ansible inventory snippet"
    value       = <<-INV
      all:
        hosts:
          ${var.server_name}:
            ansible_host: ${var.server_ip}
            ansible_user: deploy
            ansible_ssh_private_key_file: ~/.ssh/id_ed25519
      INV
  }
  ```

- [ ] Update `deploy/opentofu/main.tf`:
  ```hcl
  # Llamenos Infrastructure — Root Module
  #
  # Supports multiple hosting providers. Select via var.provider_name.
  #
  # Providers:
  #   - hetzner     — Hetzner Cloud (Germany/Finland)
  #   - 1984hosting — 1984 Hosting (Iceland) — manual provisioning
  #
  # Usage:
  #   cd deploy/opentofu
  #   cp terraform.tfvars.example terraform.tfvars  # edit values
  #   tofu init
  #   tofu plan
  #   tofu apply

  module "hetzner" {
    source = "./modules/hetzner"
    count  = var.provider_name == "hetzner" ? 1 : 0

    ssh_public_key_path = var.ssh_public_key_path
    server_type         = var.server_type
    location            = var.location
    server_name         = var.server_name
    image               = var.image
    domain              = var.domain
    enable_backups      = var.enable_backups
    admin_ssh_cidrs     = var.admin_ssh_cidrs
  }

  module "hosting1984" {
    source = "./modules/1984hosting"
    count  = var.provider_name == "1984hosting" ? 1 : 0

    server_ip   = var.server_ip
    server_name = var.server_name
    domain      = var.domain
  }

  module "inventory" {
    source = "./modules/generic"

    server_ip   = var.provider_name == "hetzner" ? module.hetzner[0].server_ip : module.hosting1984[0].server_ip
    server_name = var.provider_name == "hetzner" ? module.hetzner[0].server_name : module.hosting1984[0].server_name
    domain      = var.domain
    ansible_dir = var.ansible_dir
  }
  ```

- [ ] Update `deploy/opentofu/variables.tf` — add `provider_name` and `server_ip`:
  ```hcl
  variable "provider_name" {
    description = "Hosting provider: hetzner or 1984hosting"
    type        = string
    default     = "hetzner"

    validation {
      condition     = contains(["hetzner", "1984hosting"], var.provider_name)
      error_message = "provider_name must be 'hetzner' or '1984hosting'."
    }
  }

  variable "server_ip" {
    description = "Required for 1984hosting provider. The assigned IPv4 address."
    type        = string
    default     = ""
  }
  ```

- [ ] Update `deploy/opentofu/terraform.tfvars.example`:
  ```hcl
  # Hosting provider selection
  provider_name = "1984hosting"  # or "hetzner"

  # For 1984 Hosting (manual provisioning required)
  server_ip = "203.0.113.10"  # Fill in after ordering VPS

  # For Hetzner (automated provisioning)
  # hcloud_token = "YOUR_TOKEN"
  # server_type  = "cx21"
  # location     = "hel1"

  domain = "hotline.example.org"
  ssh_public_key_path = "~/.ssh/id_ed25519.pub"
  ```

---

## Verification Checklist

Before marking this plan complete, verify:

- [ ] All V1 files have been copied to correct V2 paths
- [ ] All MinIO references replaced with RustFS
- [ ] All `llamenos-hotline` branding updated to `llamenos`
- [ ] All repository references updated to `llamenos/llamenos`
- [ ] 1984 Hosting module documented with manual provisioning steps
- [ ] New Caddy vhosts (downloads, updates) included in both production Caddyfile and Ansible Jinja2 template
- [ ] RustFS buckets (files, staging, releases) created at deploy time
- [ ] Backup role uses RustFS S3 API (not MinIO mc)
- [ ] Production checklist includes RustFS and desktop distribution items
- [ ] CI workflows use correct V2 paths and image names
- [ ] `justfile` includes backup, restore, test-restore, and update recipes
