# Epic 297: Security Update Automation

**Status**: PENDING
**Priority**: Low
**Depends on**: None
**Blocks**: None
**Branch**: `desktop`

## Summary

Extend the existing security update mechanisms (unattended-upgrades, Trivy CI scanning, bun audit) with automated Docker image rebuilds on base image CVEs, Renovate for monorepo dependency updates, weekly OS-level CVE scanning with operator alerts, and automated Bun patch-level updates. The goal is a system that keeps itself secure with minimal operator intervention, while never making breaking changes automatically.

## Problem Statement

Llamenos has good security foundations but relies on manual intervention for several update categories:

1. **Docker base image CVEs.** Trivy scans Docker images in CI, but if a CVE is found in the `node:22-alpine` base image, someone must manually trigger a rebuild. For part-time operators, this delay can be days.
2. **Dependency updates.** No automated dependency update bot (Dependabot/Renovate) is configured. Developers must manually run `bun outdated` and update packages. Security patches in transitive dependencies may go unnoticed.
3. **OS-level CVEs.** `unattended-upgrades` handles Debian/Ubuntu security patches, but operators have no visibility into what was patched or whether critical CVEs affect their deployment.
4. **Runtime updates.** Bun and Node.js patch releases (security fixes) require manual updates to CI workflows and Dockerfiles.

For a crisis hotline used by activist organizations targeted by nation-state adversaries, delay in security patching is an operational risk. Automation reduces the window of vulnerability.

## Implementation

### Phase 1: Renovate Configuration

**File: `renovate.json`**

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended",
    "group:monorepos",
    ":separateMajorReleases",
    ":automergeMinor",
    ":automergePatch",
    ":semanticCommits"
  ],
  "labels": ["dependencies"],
  "schedule": ["before 6am on Monday"],
  "timezone": "UTC",
  "rangeStrategy": "bump",
  "lockFileMaintenance": {
    "enabled": true,
    "automerge": true,
    "schedule": ["before 6am on Monday"]
  },
  "packageRules": [
    {
      "description": "Auto-merge patch and minor updates for non-critical packages",
      "matchUpdateTypes": ["patch", "minor"],
      "automerge": true,
      "automergeType": "pr",
      "platformAutomerge": true
    },
    {
      "description": "Group Rust crate updates",
      "matchManagers": ["cargo"],
      "groupName": "Rust crates",
      "automerge": true,
      "matchUpdateTypes": ["patch", "minor"]
    },
    {
      "description": "Group TypeScript/JS updates",
      "matchManagers": ["npm"],
      "groupName": "JS dependencies",
      "matchUpdateTypes": ["patch", "minor"]
    },
    {
      "description": "Security-only updates for major versions — require manual review",
      "matchUpdateTypes": ["major"],
      "automerge": false,
      "labels": ["dependencies", "breaking"]
    },
    {
      "description": "Docker base image updates",
      "matchManagers": ["dockerfile"],
      "groupName": "Docker base images",
      "automerge": true,
      "matchUpdateTypes": ["patch", "minor"]
    },
    {
      "description": "GitHub Actions updates",
      "matchManagers": ["github-actions"],
      "groupName": "GitHub Actions",
      "automerge": true,
      "matchUpdateTypes": ["patch", "minor"]
    },
    {
      "description": "iOS SPM dependency updates",
      "matchManagers": ["swift"],
      "groupName": "Swift packages",
      "automerge": false
    },
    {
      "description": "Android Gradle dependency updates",
      "matchManagers": ["gradle"],
      "groupName": "Android dependencies",
      "automerge": false
    },
    {
      "description": "Pin Ansible collection versions",
      "matchManagers": ["ansible-galaxy"],
      "automerge": false
    }
  ],
  "vulnerabilityAlerts": {
    "enabled": true,
    "labels": ["security"],
    "automerge": true,
    "matchUpdateTypes": ["patch"]
  }
}
```

### Phase 2: Weekly Docker Image Rebuild

**File: `.github/workflows/weekly-rebuild.yml`**

```yaml
name: Weekly Security Rebuild

on:
  schedule:
    - cron: '0 4 * * 1'  # Every Monday at 4:00 AM UTC
  workflow_dispatch: {}    # Manual trigger

jobs:
  scan-and-rebuild:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read
      packages: write
      security-events: write

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Pull current image
        run: docker pull ghcr.io/${{ github.repository }}:latest || true

      - name: Scan current image with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/${{ github.repository }}:latest
          format: 'json'
          output: 'trivy-before.json'
          severity: 'CRITICAL,HIGH'
        continue-on-error: true

      - name: Check for vulnerabilities
        id: check-vulns
        run: |
          if [ -f trivy-before.json ]; then
            CRITICAL=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "CRITICAL")] | length' trivy-before.json)
            HIGH=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "HIGH")] | length' trivy-before.json)
            echo "critical=${CRITICAL}" >> "$GITHUB_OUTPUT"
            echo "high=${HIGH}" >> "$GITHUB_OUTPUT"
            echo "Found ${CRITICAL} critical, ${HIGH} high vulnerabilities"
            if [ "${CRITICAL}" -gt 0 ] || [ "${HIGH}" -gt 0 ]; then
              echo "needs_rebuild=true" >> "$GITHUB_OUTPUT"
            else
              echo "needs_rebuild=false" >> "$GITHUB_OUTPUT"
            fi
          else
            echo "needs_rebuild=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Rebuild image (no cache to pull fresh base)
        if: steps.check-vulns.outputs.needs_rebuild == 'true' || github.event_name == 'workflow_dispatch'
        uses: docker/build-push-action@v6
        with:
          context: .
          file: Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:rebuild-${{ github.run_number }}
          no-cache: true
          build-args: |
            SOURCE_DATE_EPOCH=0

      - name: Scan rebuilt image
        if: steps.check-vulns.outputs.needs_rebuild == 'true' || github.event_name == 'workflow_dispatch'
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/${{ github.repository }}:latest
          format: 'sarif'
          output: 'trivy-after.sarif'
          severity: 'CRITICAL,HIGH'

      - name: Upload Trivy SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-after.sarif
        continue-on-error: true
```

### Phase 3: OS-Level CVE Scanning Ansible Role

**File: `deploy/ansible/roles/security-scan/tasks/main.yml`**

```yaml
---
# Weekly OS-level CVE scan with operator notification
#
# Checks installed packages against known vulnerabilities and alerts
# operators if critical issues are found.

- name: Install vulnerability scanner
  ansible.builtin.apt:
    name:
      - debsecan        # Debian Security Analyzer
    state: present
  when: ansible_os_family == 'Debian'

- name: Create security scan script
  ansible.builtin.copy:
    dest: "{{ app_dir }}/scripts/security-scan.sh"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"
    content: |
      #!/usr/bin/env bash
      #
      # Weekly OS-level CVE scan — managed by Ansible
      # Checks installed packages for known vulnerabilities.
      # Alerts operators via the configured alerting provider if critical CVEs found.

      set -euo pipefail

      LOG_FILE="{{ app_dir }}/alerting/security-scan.log"
      TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

      log() {
        echo "[${TIMESTAMP}] $*" >> "${LOG_FILE}"
      }

      log "Starting weekly security scan..."

      # Run debsecan for fixed CVEs (those with available patches)
      CRITICAL_CVES="$(debsecan --only-fixed --suite "$(lsb_release -cs)" 2>/dev/null | grep -c 'urgency high\|urgency critical' || echo '0')"
      ALL_FIXED="$(debsecan --only-fixed --suite "$(lsb_release -cs)" 2>/dev/null | wc -l || echo '0')"

      log "Scan complete: ${CRITICAL_CVES} critical/high, ${ALL_FIXED} total fixable CVEs"

      if [ "${CRITICAL_CVES}" -gt 0 ]; then
        log "ALERT: ${CRITICAL_CVES} critical/high CVEs with available fixes"
        # Use the alerting script if available
        if [ -x "{{ app_dir }}/scripts/check-alerts.sh" ]; then
          source "{{ app_dir }}/scripts/check-alerts.sh"
          send_alert "high" "security_scan" "${CRITICAL_CVES} critical/high OS-level CVEs found with available patches. Run 'sudo apt upgrade' or 'just security-update' to fix."
        fi
      fi

      # Also scan Docker images on this host
      if command -v docker &>/dev/null; then
        IMAGES="$(docker images --format '{{ '{{' }}.Repository{{ '}}' }}:{{ '{{' }}.Tag{{ '}}' }}' | grep -v '<none>' | head -10)"
        for img in ${IMAGES}; do
          # Use trivy if available, otherwise skip
          if command -v trivy &>/dev/null; then
            DOCKER_CRITICAL="$(trivy image --severity CRITICAL --quiet --format json "${img}" 2>/dev/null | jq '[.Results[]?.Vulnerabilities[]?] | length' || echo '0')"
            if [ "${DOCKER_CRITICAL}" -gt 0 ]; then
              log "Docker image ${img}: ${DOCKER_CRITICAL} critical CVEs"
            fi
          fi
        done
      fi

      log "Security scan complete"

- name: Configure weekly security scan cron
  ansible.builtin.cron:
    name: "Llamenos weekly security scan"
    user: "{{ deploy_user }}"
    weekday: "1"  # Monday
    hour: "5"
    minute: "0"
    job: "{{ app_dir }}/scripts/security-scan.sh >> {{ app_dir }}/alerting/security-scan.log 2>&1"
    state: "{{ 'present' if llamenos_auto_security_updates | default(true) else 'absent' }}"

- name: Install trivy for Docker image scanning (optional)
  ansible.builtin.shell: |
    if command -v trivy &>/dev/null; then
      echo "already installed"
    else
      curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
      echo "installed"
    fi
  register: trivy_install
  changed_when: "'installed' in trivy_install.stdout"
  when: llamenos_auto_security_updates | default(true)
```

### Phase 4: Ansible Variables

Add to `deploy/ansible/vars.example.yml`:

```yaml
# ─── Security Updates ──────────────────────────────────────────────
# Enable automated security scanning and patching
llamenos_auto_security_updates: true

# Maintenance window for automated updates (24h format, UTC)
# Updates are only applied during this window
llamenos_maintenance_window_start: "03:00"
llamenos_maintenance_window_end: "05:00"
```

### Phase 5: CI Audit Job Enhancement

Extend the existing CI to run `bun audit` with severity filtering and fail on critical/high.

**File: `.github/workflows/ci.yml`** (extend existing)

Add a step to the existing audit job:

```yaml
  - name: Check for critical vulnerabilities
    run: |
      bun audit --severity critical 2>&1 || {
        echo "::error::Critical vulnerabilities found. Run 'bun audit' locally for details."
        exit 1
      }
```

### Phase 6: Justfile Commands

Add to `deploy/ansible/justfile`:

```just
# Run OS security scan immediately
security-scan *ARGS:
    ssh {{ ansible_host }} "{{ app_dir }}/scripts/security-scan.sh"

# Apply available security updates
security-update *ARGS:
    ansible-playbook playbooks/update.yml --ask-vault-pass --tags security {{ARGS}}
```

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `renovate.json` | Create | Renovate bot configuration for monorepo dependency updates |
| `.github/workflows/weekly-rebuild.yml` | Create | Weekly Docker image rebuild on CVE detection |
| `deploy/ansible/roles/security-scan/tasks/main.yml` | Create | OS-level CVE scanning role |
| `deploy/ansible/vars.example.yml` | Extend | Add security update configuration variables |
| `deploy/ansible/playbooks/deploy.yml` | Extend | Include security-scan role |
| `deploy/ansible/justfile` | Extend | Add `security-scan` and `security-update` commands |
| `.github/workflows/ci.yml` | Extend | Add critical-severity audit check |

## Testing

1. **Renovate dry run**: After merging `renovate.json`, check the Renovate dashboard (GitHub app) for detected dependencies. Verify it finds `package.json`, `Cargo.toml`, `Package.swift`, `build.gradle.kts`, `Dockerfile`, and GitHub Actions workflow files.

2. **Weekly rebuild test**: Manually trigger the `weekly-rebuild.yml` workflow via `workflow_dispatch`. Verify it pulls the current image, scans with Trivy, rebuilds if CVEs found (or always on manual trigger), and pushes the new image.

3. **OS scan test**: Run `just security-scan` on a deployed server. Verify the script runs `debsecan`, counts critical CVEs, and logs results. If alerting is configured, verify an alert is sent when critical CVEs are present.

4. **Renovate PR test**: After Renovate creates its first batch of PRs, verify:
   - Patch/minor updates are auto-merged after CI passes
   - Major updates create PRs with `breaking` label and require manual review
   - Rust crates are grouped in a single PR
   - JS dependencies are grouped in a single PR

5. **CI audit test**: Introduce a known-vulnerable package version in a test branch. Verify the audit job fails with a clear error message.

## Acceptance Criteria

- [ ] Renovate configured and creating grouped dependency update PRs
- [ ] Patch/minor updates auto-merge after CI passes
- [ ] Major updates require manual review (labeled `breaking`)
- [ ] Weekly Docker image rebuild triggered when Trivy finds critical/high CVEs
- [ ] OS-level CVE scanning runs weekly via cron, alerts operators on critical findings
- [ ] Trivy installed on deployed servers for Docker image scanning
- [ ] `just security-scan` runs an immediate CVE check
- [ ] `just security-update` applies available security patches
- [ ] CI fails on critical audit findings
- [ ] Maintenance window configurable for automated updates
- [ ] All automation is opt-in (`llamenos_auto_security_updates: true`)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Renovate auto-merge breaks build | Low | Medium | Auto-merge only for patch/minor; CI must pass first; major updates require manual review |
| Weekly rebuild pushes broken image | Low | High | Trivy scan runs after rebuild — if new image has more CVEs, the scan will flag it; operators can pin specific image tags |
| debsecan not available on non-Debian | Medium | Low | Role checks `ansible_os_family == 'Debian'` and skips on other distros; RHEL/Alpine operators need manual scanning |
| Trivy download fails on air-gapped servers | Low | Low | Trivy install is optional; security scan still runs debsecan without it |
| Too many Renovate PRs overwhelm small team | Medium | Low | Weekly schedule limits PR frequency; grouping reduces PR count; operators can adjust schedule in `renovate.json` |
