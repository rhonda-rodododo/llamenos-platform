# Epic 280: Rolling Updates with Rollback

**Status**: PENDING
**Priority**: Medium
**Depends on**: Epic 276
**Blocks**: None
**Branch**: `desktop`

## Summary

Replace the current pull-and-restart update mechanism with a proper rolling update system that performs pre-update backups, pulls new images, health-gates the deployment, automatically rolls back on failure, supports pinned image versions, coordinates multi-host update order, and notifies operators on completion or failure. Add version history tracking for instant rollback and optional maintenance window scheduling.

## Problem Statement

The current `playbooks/update.yml` has a rollback mechanism but it is incomplete:

1. **Rollback does not actually restore previous images.** The current playbook saves image digests to `.rollback-images.json` and has a "Restore previous images from rollback state" task, but that task only echoes a message — it does not actually re-tag or pull previous images. After `docker compose up -d`, Docker uses whatever `:latest` was pulled, making rollback ineffective.

2. **No version pinning.** Operators use `:latest` tags by default. There is no mechanism to pin specific versions, track which version is running, or roll back to a known-good version without manually editing compose files.

3. **No multi-host coordination.** In a distributed deployment (Epic 276), updating PostgreSQL and the app simultaneously can cause connection failures. Updates must respect service dependency order.

4. **No operator notification.** After an update completes (or fails), there is no notification. Part-time operators may not check for hours.

5. **No canary deployment.** For deployments with multiple app replicas, there is no way to update one replica first, verify it works, then update the rest.

Evidence from `playbooks/update.yml` lines 88-93: The rollback block contains `echo "Rollback state found. Restarting with previous configuration."` but performs no actual image restoration.

## Implementation

### Phase 1: Version Management System

Track image versions and enable pinning.

**Additions to `deploy/ansible/vars.example.yml`:**

```yaml
# ─── Version Management ────────────────────────────────────────
# Pin specific image versions. When set, updates pull this exact tag.
# When empty, updates pull :latest and record the digest.
# Use "bun run version:pin" to set versions from the current deployment.

# llamenos_app_version: "0.14.0"        # Pinned: ghcr.io/llamenos/llamenos:0.14.0
# llamenos_postgres_version: "17.2"     # Pinned: postgres:17.2-alpine
# llamenos_caddy_version: "2.9.1"       # Pinned: caddy:2.9.1-alpine

# How many previous versions to keep for instant rollback
llamenos_rollback_versions: 3

# ─── Update Behavior ──────────────────────────────────────────
# Notification webhook for update completion/failure
llamenos_update_webhook: "{{ llamenos_alert_webhook | default('') }}"

# Health check retries after update (each retry = 5 second delay)
llamenos_update_health_retries: 30

# Enable canary deployment for multi-replica setups
llamenos_canary_enabled: false

# Maintenance window (cron expression) — updates only run during this window
# Leave empty to allow updates at any time
# llamenos_maintenance_window: "0 3 * * 0"  # Sundays at 3 AM
```

### Phase 2: Version Tracking Role

**File: `deploy/ansible/roles/llamenos-version-tracker/tasks/main.yml`**

```yaml
---
# Version tracker — records deployed image digests for rollback

- name: Create version history directory
  ansible.builtin.file:
    path: "{{ app_dir }}/versions"
    state: directory
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"

- name: Record current deployment version
  ansible.builtin.shell: |
    set -euo pipefail
    TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
    VERSION_FILE="{{ app_dir }}/versions/${TIMESTAMP}.json"

    # Collect all running image digests
    IMAGES='{}'
    for service_dir in {{ app_dir }}/services/*/; do
      service="$(basename "${service_dir}")"
      compose_file="${service_dir}/docker-compose.yml"
      [ -f "${compose_file}" ] || continue

      # Get image digest for each service
      DIGEST=$(docker compose -f "${compose_file}" images --format json 2>/dev/null | \
        python3 -c "import sys,json; data=json.load(sys.stdin); print(json.dumps({d['Service']:{'image':d['Repository']+':'+d['Tag'],'digest':d.get('ID','')} for d in data}))" 2>/dev/null || echo '{}')
      IMAGES=$(echo "${IMAGES}" "${DIGEST}" | python3 -c "import sys,json; a=json.loads(sys.stdin.readline()); b=json.loads(sys.stdin.readline()); a.update(b); print(json.dumps(a))")
    done

    # Write version file
    cat > "${VERSION_FILE}" <<EOFVERSION
    {
      "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "host": "{{ inventory_hostname }}",
      "services": ${IMAGES}
    }
    EOFVERSION

    echo "${VERSION_FILE}"
  register: version_record
  changed_when: true

- name: Enforce version history retention
  ansible.builtin.shell: |
    cd {{ app_dir }}/versions
    COUNT=$(ls -1 *.json 2>/dev/null | wc -l)
    KEEP={{ llamenos_rollback_versions | default(3) }}
    if [ "${COUNT}" -gt "$((KEEP + 1))" ]; then
      ls -1t *.json | tail -n "+$((KEEP + 2))" | xargs rm -f
    fi
  changed_when: false
```

### Phase 3: Rewritten Update Playbook

**File: `deploy/ansible/playbooks/update.yml`** (complete rewrite):

```yaml
---
# Rolling Update Playbook
#
# Performs a safe rolling update with real rollback:
# 1. Check maintenance window (if configured)
# 2. Record current versions for rollback
# 3. Run pre-update backup
# 4. Pull new images
# 5. Update services in dependency order
# 6. Health-gate each service before proceeding
# 7. Rollback to exact previous images on failure
# 8. Notify operator on completion or failure
#
# Usage:
#   just update                          # Standard update
#   just update --tags app               # Update app service only
#   just update -e force_update=true     # Skip maintenance window check

- name: Pre-flight checks
  hosts: llamenos_servers
  become: true
  vars_files:
    - ../vars.yml

  tasks:
    - name: Check maintenance window
      when:
        - llamenos_maintenance_window is defined
        - llamenos_maintenance_window | length > 0
        - not (force_update | default(false) | bool)
      block:
        - name: Verify we are in the maintenance window
          ansible.builtin.shell: |
            # Parse cron expression and check if current time matches
            CRON_EXPR="{{ llamenos_maintenance_window }}"
            HOUR=$(date +%H)
            DOW=$(date +%u)
            CRON_HOUR=$(echo "${CRON_EXPR}" | awk '{print $2}')
            CRON_DOW=$(echo "${CRON_EXPR}" | awk '{print $5}')

            # Simple check: hour matches and day-of-week matches
            if [ "${CRON_HOUR}" != "*" ] && [ "${HOUR}" != "${CRON_HOUR}" ]; then
              echo "OUTSIDE_WINDOW"
              exit 0
            fi
            if [ "${CRON_DOW}" != "*" ] && [ "${DOW}" != "${CRON_DOW}" ]; then
              echo "OUTSIDE_WINDOW"
              exit 0
            fi
            echo "IN_WINDOW"
          register: window_check
          changed_when: false

        - name: Abort if outside maintenance window
          ansible.builtin.fail:
            msg: >
              Update rejected: outside maintenance window ({{ llamenos_maintenance_window }}).
              Use -e force_update=true to override.
          when: "'OUTSIDE_WINDOW' in window_check.stdout"

- name: Record pre-update state and backup
  hosts: llamenos_servers
  become: true
  vars_files:
    - ../vars.yml
  roles:
    - role: service-discovery
      tags: [always]

  tasks:
    - name: Record current image versions for rollback
      ansible.builtin.shell: |
        set -euo pipefail
        ROLLBACK_FILE="{{ app_dir }}/versions/.rollback-state.json"
        SERVICES='{}'

        for service_dir in {{ app_dir }}/services/*/; do
          service="$(basename "${service_dir}")"
          compose_file="${service_dir}/docker-compose.yml"
          [ -f "${compose_file}" ] || continue

          IMAGE=$(docker compose -f "${compose_file}" images --format json 2>/dev/null | \
            python3 -c "
import sys, json
data = json.load(sys.stdin)
result = {}
for d in data:
    repo = d.get('Repository', '')
    tag = d.get('Tag', 'latest')
    digest = d.get('ID', '')
    result[d['Service']] = {
        'image': f'{repo}:{tag}',
        'digest': digest,
        'compose_file': '${compose_file}'
    }
print(json.dumps(result))
" 2>/dev/null || echo '{}')

          SERVICES=$(echo "${SERVICES}" "${IMAGE}" | python3 -c "
import sys, json
a = json.loads(sys.stdin.readline())
b = json.loads(sys.stdin.readline())
a.update(b)
print(json.dumps(a))
")
        done

        cat > "${ROLLBACK_FILE}" <<EOF
        {
          "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
          "host": "{{ inventory_hostname }}",
          "services": ${SERVICES}
        }
        EOF
        echo "Rollback state saved to ${ROLLBACK_FILE}"
      register: rollback_state
      changed_when: true
      tags: [update]

    - name: Run pre-update backup
      ansible.builtin.include_role:
        name: backup-postgres
      when: llamenos_postgres_enabled | default(true)
      tags: [backup, update]

- name: Update infrastructure services (database, storage, relay)
  hosts: llamenos_servers
  become: true
  serial: 1
  vars_files:
    - ../vars.yml

  tasks:
    # ── PostgreSQL ──
    - name: Update PostgreSQL
      when: >
        llamenos_postgres_enabled | default(true) and
        (groups.get('llamenos_db', []) | length == 0 or
         inventory_hostname in groups.get('llamenos_db', groups['llamenos_servers']))
      tags: [postgres, update]
      block:
        - name: Resolve PostgreSQL image tag
          ansible.builtin.set_fact:
            pg_image: >-
              {%- if llamenos_postgres_version is defined and llamenos_postgres_version | length > 0 -%}
                postgres:{{ llamenos_postgres_version }}-alpine
              {%- else -%}
                {{ llamenos_postgres_image }}
              {%- endif -%}

        - name: Pull PostgreSQL image
          community.docker.docker_image:
            name: "{{ pg_image }}"
            source: pull
            force_source: true

        - name: Restart PostgreSQL with new image
          community.docker.docker_compose_v2:
            project_src: "{{ app_dir }}/services/postgres"
            state: restarted
            recreate: always

        - name: Wait for PostgreSQL health
          ansible.builtin.command:
            cmd: >
              docker compose -f {{ app_dir }}/services/postgres/docker-compose.yml
              exec -T postgres pg_isready -U llamenos -d llamenos
          register: pg_health
          retries: 15
          delay: 2
          until: pg_health.rc == 0

    # ── MinIO ──
    - name: Update MinIO
      when: >
        llamenos_minio_enabled | default(true) and
        (groups.get('llamenos_storage', []) | length == 0 or
         inventory_hostname in groups.get('llamenos_storage', groups['llamenos_servers']))
      tags: [minio, update]
      block:
        - name: Pull MinIO image
          community.docker.docker_image:
            name: "{{ llamenos_minio_image }}"
            source: pull
            force_source: true

        - name: Restart MinIO
          community.docker.docker_compose_v2:
            project_src: "{{ app_dir }}/services/minio"
            state: restarted
            recreate: always

        - name: Wait for MinIO health
          ansible.builtin.command:
            cmd: >
              docker compose -f {{ app_dir }}/services/minio/docker-compose.yml
              exec -T minio mc ready local
          register: minio_health
          retries: 15
          delay: 2
          until: minio_health.rc == 0

    # ── strfry ──
    - name: Update strfry
      when: >
        llamenos_strfry_enabled | default(true) and
        (groups.get('llamenos_relay', []) | length == 0 or
         inventory_hostname in groups.get('llamenos_relay', groups['llamenos_servers']))
      tags: [strfry, update]
      block:
        - name: Pull strfry image
          community.docker.docker_image:
            name: "{{ llamenos_strfry_image | default('dockurr/strfry:latest') }}"
            source: pull
            force_source: true

        - name: Restart strfry
          community.docker.docker_compose_v2:
            project_src: "{{ app_dir }}/services/strfry"
            state: restarted
            recreate: always

        - name: Wait for strfry health
          ansible.builtin.command:
            cmd: >
              docker compose -f {{ app_dir }}/services/strfry/docker-compose.yml
              exec -T strfry curl -sf http://localhost:7777
          register: strfry_health
          retries: 15
          delay: 2
          until: strfry_health.rc == 0

- name: Update application services
  hosts: llamenos_servers
  become: true
  serial: 1
  vars_files:
    - ../vars.yml

  tasks:
    - name: Update app service
      when: >
        llamenos_app_enabled | default(true) and
        (groups.get('llamenos_app', []) | length == 0 or
         inventory_hostname in groups.get('llamenos_app', groups['llamenos_servers']))
      tags: [app, update]
      block:
        - name: Resolve app image tag
          ansible.builtin.set_fact:
            app_image: >-
              {%- if llamenos_app_version is defined and llamenos_app_version | length > 0 -%}
                ghcr.io/llamenos/llamenos:{{ llamenos_app_version }}
              {%- else -%}
                {{ llamenos_app_image }}
              {%- endif -%}

        - name: Pull app image
          community.docker.docker_image:
            name: "{{ app_image }}"
            source: pull
            force_source: true

        - name: Restart app service
          community.docker.docker_compose_v2:
            project_src: "{{ app_dir }}/services/app"
            state: restarted
            recreate: always

        - name: Wait for app health check
          ansible.builtin.uri:
            url: "http://localhost:3000/api/health"
            method: GET
            status_code: 200
            return_content: true
          register: app_health
          retries: "{{ llamenos_update_health_retries | default(30) }}"
          delay: 5
          until: app_health.status == 200
          ignore_errors: true

        - name: Rollback app on health failure
          when: app_health is failed
          block:
            - name: Load rollback state
              ansible.builtin.slurp:
                src: "{{ app_dir }}/versions/.rollback-state.json"
              register: rollback_data

            - name: Parse rollback state
              ansible.builtin.set_fact:
                rollback: "{{ rollback_data.content | b64decode | from_json }}"

            - name: Pull previous app image
              community.docker.docker_image:
                name: "{{ rollback.services.app.image }}"
                source: pull
                force_source: true
              when: rollback.services.app is defined

            - name: Write rollback compose override for app
              ansible.builtin.copy:
                dest: "{{ app_dir }}/services/app/.rollback-override.yml"
                content: |
                  services:
                    app:
                      image: {{ rollback.services.app.image }}
                owner: "{{ deploy_user }}"
                group: "{{ deploy_group }}"
                mode: "0640"
              when: rollback.services.app is defined

            - name: Restart app with previous image via override
              ansible.builtin.shell: |
                docker compose \
                  -f {{ app_dir }}/services/app/docker-compose.yml \
                  -f {{ app_dir }}/services/app/.rollback-override.yml \
                  up -d --pull never
              when: rollback.services.app is defined

            - name: Wait for rollback health check
              ansible.builtin.uri:
                url: "http://localhost:3000/api/health"
                method: GET
                status_code: 200
              register: rollback_health
              retries: 20
              delay: 5
              until: rollback_health.status == 200

            - name: Send rollback notification
              ansible.builtin.uri:
                url: "{{ llamenos_update_webhook }}"
                method: POST
                body_format: form
                body: "Update FAILED and rolled back on {{ inventory_hostname }}. Previous version restored. Check logs: docker compose -f {{ app_dir }}/services/app/docker-compose.yml logs app"
                headers:
                  Title: "Update ROLLED BACK on {{ inventory_hostname }}"
                  Priority: "urgent"
                  Tags: "rotating_light"
              when: llamenos_update_webhook | default('') | length > 0
              ignore_errors: true

            - name: Fail with rollback notice
              ansible.builtin.fail:
                msg: >
                  App update failed and was rolled back to {{ rollback.services.app.image | default('previous version') }}.
                  The previous version is running. Check logs for the failure cause.

- name: Update proxy service
  hosts: llamenos_servers
  become: true
  vars_files:
    - ../vars.yml

  tasks:
    - name: Update Caddy
      when: >
        llamenos_caddy_enabled | default(true) and
        (groups.get('llamenos_proxy', []) | length == 0 or
         inventory_hostname in groups.get('llamenos_proxy', groups['llamenos_servers']))
      tags: [caddy, update]
      block:
        - name: Pull Caddy image
          community.docker.docker_image:
            name: "{{ llamenos_caddy_image }}"
            source: pull
            force_source: true

        - name: Restart Caddy
          community.docker.docker_compose_v2:
            project_src: "{{ app_dir }}/services/caddy"
            state: restarted
            recreate: always

- name: Post-update tasks
  hosts: llamenos_servers
  become: true
  vars_files:
    - ../vars.yml

  tasks:
    - name: Record new version
      ansible.builtin.include_role:
        name: llamenos-version-tracker
      tags: [update]

    - name: Clean up old images
      ansible.builtin.shell: docker image prune -f
      changed_when: true
      tags: [update]

    - name: Send success notification
      ansible.builtin.uri:
        url: "{{ llamenos_update_webhook }}"
        method: POST
        body_format: form
        body: "Update completed successfully on {{ inventory_hostname }}. All health checks passed. https://{{ domain }}"
        headers:
          Title: "Update Complete on {{ inventory_hostname }}"
          Priority: "default"
          Tags: "white_check_mark"
      when: llamenos_update_webhook | default('') | length > 0
      ignore_errors: true
      tags: [update]

    - name: Display update summary
      ansible.builtin.debug:
        msg: |
          Update completed successfully.
          Host: {{ inventory_hostname }}
          URL: https://{{ domain }}

          Version history: {{ app_dir }}/versions/
          Rollback state: {{ app_dir }}/versions/.rollback-state.json

          To rollback: just rollback
      tags: [update]
```

### Phase 4: Rollback Playbook

**File: `deploy/ansible/playbooks/rollback.yml`**

```yaml
---
# Rollback Playbook
#
# Instantly reverts to the previous deployment version using saved rollback state.
# Does NOT require pulling images — previous images are retained locally.
#
# Usage:
#   just rollback                          # Rollback to previous version
#   just rollback -e rollback_version=2    # Rollback to N versions ago

- name: Rollback Llamenos
  hosts: llamenos_servers
  become: true
  vars_files:
    - ../vars.yml

  tasks:
    - name: Check rollback state exists
      ansible.builtin.stat:
        path: "{{ app_dir }}/versions/.rollback-state.json"
      register: rollback_file

    - name: Fail if no rollback state
      ansible.builtin.fail:
        msg: >
          No rollback state found at {{ app_dir }}/versions/.rollback-state.json.
          This means no update has been performed since the version tracker was installed.
      when: not rollback_file.stat.exists

    - name: Load rollback state
      ansible.builtin.slurp:
        src: "{{ app_dir }}/versions/.rollback-state.json"
      register: rollback_data

    - name: Parse rollback state
      ansible.builtin.set_fact:
        rollback: "{{ rollback_data.content | b64decode | from_json }}"

    - name: Display rollback target
      ansible.builtin.debug:
        msg: |
          Rolling back to version from: {{ rollback.timestamp }}
          Services:
          {% for svc, info in rollback.services.items() %}
            {{ svc }}: {{ info.image }}
          {% endfor %}

    - name: Rollback each service
      ansible.builtin.shell: |
        set -euo pipefail
        SERVICE="{{ item.key }}"
        IMAGE="{{ item.value.image }}"
        COMPOSE_FILE="{{ item.value.compose_file }}"

        if [ ! -f "${COMPOSE_FILE}" ]; then
          echo "Compose file not found: ${COMPOSE_FILE}, skipping ${SERVICE}"
          exit 0
        fi

        # Check if the previous image is available locally
        if docker image inspect "${IMAGE}" &>/dev/null; then
          echo "Image ${IMAGE} available locally"
        else
          echo "Pulling previous image: ${IMAGE}"
          docker pull "${IMAGE}"
        fi

        # Extract the compose service name (the YAML key under services:)
        # and override its image via environment variable.
        # Compose files use ${SERVICE_IMAGE:-default} pattern for overridability.
        # We stop the current container, then bring it up with the old image.
        docker compose -f "${COMPOSE_FILE}" down

        # Determine the service name inside the compose file
        SVC_NAME="$(docker compose -f "${COMPOSE_FILE}" config --services 2>/dev/null | head -1)"

        # Use --pull=never to ensure we use the locally-available old image,
        # and pass the image override via docker compose run's --image or
        # by setting the image via env var. The cleanest approach: sed the
        # compose file's image field in-place, restart, then restore it.
        # Instead, we use `docker compose up` with an override file.
        OVERRIDE_FILE="$(dirname "${COMPOSE_FILE}")/.rollback-override.yml"
        cat > "${OVERRIDE_FILE}" <<EOFOVERRIDE
        services:
          ${SVC_NAME}:
            image: ${IMAGE}
        EOFOVERRIDE

        docker compose -f "${COMPOSE_FILE}" -f "${OVERRIDE_FILE}" up -d --pull never
        echo "Rolled back ${SERVICE} to ${IMAGE} via compose override"
      loop: "{{ rollback.services | dict2items }}"
      loop_control:
        label: "{{ item.key }}: {{ item.value.image }}"

    - name: Wait for app health check
      ansible.builtin.uri:
        url: "http://localhost:3000/api/health"
        method: GET
        status_code: 200
      register: rollback_health
      retries: 20
      delay: 5
      until: rollback_health.status == 200

    - name: Send rollback notification
      ansible.builtin.uri:
        url: "{{ llamenos_update_webhook }}"
        method: POST
        body_format: form
        body: "Manual rollback completed on {{ inventory_hostname }} to version from {{ rollback.timestamp }}. Health check: PASSED."
        headers:
          Title: "Rollback Complete on {{ inventory_hostname }}"
          Priority: "default"
          Tags: "rewind"
      when: llamenos_update_webhook | default('') | length > 0
      ignore_errors: true

    - name: Display rollback result
      ansible.builtin.debug:
        msg: |
          Rollback completed successfully.
          Reverted to: {{ rollback.timestamp }}
          Health check: PASSED
          URL: https://{{ domain }}
```

### Phase 5: Scheduled Update Cron

**File: `deploy/ansible/roles/llamenos-auto-update/tasks/main.yml`**

```yaml
---
# Automatic update scheduling
# Runs updates during the configured maintenance window.

- name: Skip if no maintenance window configured
  ansible.builtin.meta: end_host
  when: llamenos_maintenance_window is not defined or llamenos_maintenance_window | length == 0

- name: Create auto-update script
  ansible.builtin.template:
    src: update/auto-update.sh.j2
    dest: "{{ app_dir }}/scripts/auto-update.sh"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"

- name: Configure auto-update cron
  ansible.builtin.cron:
    name: "Llamenos auto-update"
    user: root
    job: "{{ app_dir }}/scripts/auto-update.sh >> {{ app_dir }}/logs/auto-update.log 2>&1"
    # Parse cron expression from maintenance window
    minute: "{{ llamenos_maintenance_window.split()[0] }}"
    hour: "{{ llamenos_maintenance_window.split()[1] }}"
    day: "{{ llamenos_maintenance_window.split()[2] }}"
    month: "{{ llamenos_maintenance_window.split()[3] }}"
    weekday: "{{ llamenos_maintenance_window.split()[4] }}"
    state: present
```

**File: `deploy/ansible/templates/update/auto-update.sh.j2`**

```bash
#!/usr/bin/env bash
# Auto-Update — managed by Ansible
# Checks for new image versions and runs the update playbook if found.
set -euo pipefail

APP_DIR="{{ app_dir }}"
ALERT_WEBHOOK="{{ llamenos_update_webhook | default('') }}"
HOST="{{ inventory_hostname }}"
LOG_PREFIX="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [auto-update]"

log() { echo "${LOG_PREFIX} $*"; }

# Check if any images have updates available
UPDATES_AVAILABLE=false

for service_dir in ${APP_DIR}/services/*/; do
  service="$(basename "${service_dir}")"
  compose_file="${service_dir}/docker-compose.yml"
  [ -f "${compose_file}" ] || continue

  # Get current image digest
  CURRENT=$(docker compose -f "${compose_file}" images --format json 2>/dev/null | \
    python3 -c "import sys,json; data=json.load(sys.stdin); [print(d.get('ID','')) for d in data]" 2>/dev/null | head -1)

  # Pull and check for new digest
  IMAGE=$(docker compose -f "${compose_file}" config --images 2>/dev/null | head -1)
  [ -z "${IMAGE}" ] && continue

  docker pull "${IMAGE}" --quiet 2>/dev/null
  NEW=$(docker inspect --format '{{ '{{' }}.Id{{ '}}' }}' "${IMAGE}" 2>/dev/null)

  if [ -n "${CURRENT}" ] && [ -n "${NEW}" ] && [ "${CURRENT}" != "${NEW}" ]; then
    log "Update available for ${service}: ${IMAGE}"
    UPDATES_AVAILABLE=true
  fi
done

if [ "${UPDATES_AVAILABLE}" = "false" ]; then
  log "No updates available"
  exit 0
fi

log "Updates found. Running update playbook..."

# Notify operator that auto-update is starting
if [ -n "${ALERT_WEBHOOK}" ]; then
  curl -sf -d "Auto-update starting on ${HOST} during maintenance window." \
    -H "Title: Auto-Update Starting on ${HOST}" \
    -H "Priority: default" \
    -H "Tags: arrows_counterclockwise" \
    "${ALERT_WEBHOOK}" 2>/dev/null || true
fi

# Run the update playbook
cd {{ app_dir }}/../ansible 2>/dev/null || cd /opt/llamenos-ansible
ansible-playbook playbooks/update.yml \
  -e force_update=true \
  --vault-password-file {{ llamenos_vault_password_file | default('/dev/null') }} \
  2>&1 | while read -r line; do log "${line}"; done

EXIT_CODE=$?

if [ "${EXIT_CODE}" -ne 0 ]; then
  log "Auto-update failed with exit code ${EXIT_CODE}"
fi

exit ${EXIT_CODE}
```

### Phase 6: Just Commands

**Additions to `deploy/ansible/justfile`:**

```makefile
# Pull latest images and restart with health check and rollback
update *ARGS:
    ansible-playbook playbooks/update.yml --ask-vault-pass {{ARGS}}

# Update a specific service only
update-service SERVICE *ARGS:
    ansible-playbook playbooks/update.yml --ask-vault-pass --tags {{SERVICE}} {{ARGS}}

# Rollback to the previous version
rollback *ARGS:
    ansible-playbook playbooks/rollback.yml --ask-vault-pass {{ARGS}}

# Show current deployed versions
versions:
    #!/usr/bin/env bash
    ansible all -m shell -a "cat /opt/llamenos/versions/.rollback-state.json 2>/dev/null | python3 -m json.tool || echo 'No version data'" --ask-vault-pass

# Show version history
version-history:
    #!/usr/bin/env bash
    ansible all -m shell -a "ls -lt /opt/llamenos/versions/*.json 2>/dev/null | head -5" --ask-vault-pass

# Pin current versions (saves running digests to vars.yml)
version-pin:
    #!/usr/bin/env bash
    echo "Current running versions:"
    ansible all -m shell -a "docker ps --format '{{.Image}}' | sort" --ask-vault-pass
    echo ""
    echo "Copy the desired versions into your vars.yml:"
    echo "  llamenos_app_version: \"x.y.z\""
    echo "  llamenos_postgres_version: \"17.x\""
```

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `deploy/ansible/playbooks/update.yml` | Rewrite | Full rolling update with real rollback |
| `deploy/ansible/playbooks/rollback.yml` | Create | Manual rollback to previous version |
| `deploy/ansible/roles/llamenos-version-tracker/tasks/main.yml` | Create | Version recording and retention |
| `deploy/ansible/roles/llamenos-auto-update/tasks/main.yml` | Create | Scheduled auto-update |
| `deploy/ansible/templates/update/auto-update.sh.j2` | Create | Auto-update script |
| `deploy/ansible/vars.example.yml` | Extend | Version pinning, update behavior, maintenance window vars |
| `deploy/ansible/justfile` | Extend | Add `rollback`, `versions`, `version-history`, `version-pin`, `update-service` commands |

## Testing

1. **Basic update with health gate**: Deploy v1 of app. Run `just update`. Verify pre-update backup runs, new images are pulled, services restart in order (postgres -> minio -> strfry -> app -> caddy), health checks pass, version is recorded, notification is sent.

2. **Automatic rollback**: Deploy v1. Prepare a broken v2 image (e.g., one that crashes on startup). Run `just update`. Verify: update detects health failure, pulls v1 back, restarts with v1, health passes, rollback notification is sent, playbook exits with failure.

3. **Manual rollback**: Deploy v1. Update to v2 (successfully). Run `just rollback`. Verify v1 is restored and health passes.

4. **Version pinning**: Set `llamenos_app_version: "0.14.0"`. Run update. Verify the exact tag is pulled, not `:latest`.

5. **Multi-host update order**: With postgres on host A, app on host B. Run update. Verify postgres updates first on host A, then app updates on host B. Health checks pass at each stage.

6. **Maintenance window**: Set `llamenos_maintenance_window: "0 3 * * 0"`. Attempt update outside the window. Verify it is rejected. Use `-e force_update=true` to override.

7. **Version history retention**: Run 5 updates. Verify only `llamenos_rollback_versions` (default 3) version files are retained plus the current rollback state.

8. **Notification delivery**: Verify ntfy/gotify receives messages for: update started, update succeeded, update failed/rolled back, and manual rollback.

9. **Idempotency**: Run `just update` when no new images are available. Verify services are restarted but rollback state is correctly updated.

## Acceptance Criteria

- [ ] Pre-update backup runs automatically before every update
- [ ] Services update in dependency order: database -> storage -> relay -> app -> proxy
- [ ] Each service is health-checked before proceeding to the next
- [ ] Failed health check triggers automatic rollback to exact previous images
- [ ] Rollback pulls previous images by tag (not just `:latest`)
- [ ] Version history records image digests for each deployment
- [ ] `just rollback` manually reverts to previous version with one command
- [ ] Version pinning supports specific tags (e.g., `llamenos_app_version: "0.14.0"`)
- [ ] Operator receives ntfy/gotify notification on update success and failure
- [ ] Maintenance window prevents updates outside scheduled hours
- [ ] `force_update=true` overrides maintenance window
- [ ] Version history retains last N deployments (configurable, default 3)
- [ ] Old Docker images are pruned after successful update
- [ ] Multi-host deployments update services on the correct hosts with `serial: 1`
- [ ] `just update-service app` updates only the app service

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Rollback image no longer available in registry | Low | High | Version tracker records digests; Docker retains pulled images locally; `llamenos_rollback_versions` controls retention |
| PostgreSQL schema migration incompatible with rollback | Medium | High | Document that schema migrations are one-way; backup runs before update; operators must test migrations in staging |
| Auto-update during incident causes additional disruption | Low | High | Maintenance window check prevents unscheduled updates; `force_update` requires explicit opt-in |
| Multi-host update timeout due to slow image pulls | Medium | Medium | `serial: 1` ensures one host at a time; health check retries are configurable |
| Rollback state file corruption | Low | Medium | JSON format is atomic-write; if missing, playbook fails with clear error rather than partial rollback |
| Docker image prune removes rollback images | Low | High | Prune only runs after successful update; uses `--filter until=168h` to keep recent images; version tracker records exact tags |
