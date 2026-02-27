# Epic 116: Cross-Repo CI Integration

**Status: PENDING**
**Repos**: All three (llamenos-core triggers, llamenos + llamenos-mobile receive)
**Priority**: High — prevents crypto regressions across platforms
**Depends on**: Epic 111 (CI hardening — pinned actions)

## Summary

When llamenos-core passes CI on main, automatically trigger downstream CI in llamenos and llamenos-mobile via GitHub's `repository_dispatch` event. This ensures crypto changes in the shared crate are validated against all consumers immediately.

## Motivation

Currently, the three repos have completely independent CI. If a Rust crypto change breaks the JS or mobile crypto interop, it's not detected until someone manually runs tests in the downstream repo. With 14+ crypto operations shared across 3 platforms, automated cross-repo validation is essential.

## Architecture

### Event Flow

```
llamenos-core CI (main push)
  └── cargo test passes
  └── notify-downstream job
      ├── POST /repos/user/llamenos/dispatches
      │     body: { event_type: "core-updated", client_payload: { sha: "abc123" } }
      └── POST /repos/user/llamenos-mobile/dispatches
            body: { event_type: "core-updated", client_payload: { sha: "abc123" } }
```

### Downstream Response

- **llamenos**: Runs crypto-interop tests (fast — ~30s) using the latest `test-vectors.json` from llamenos-core
- **llamenos-mobile**: Runs unit tests (fast — ~10s) using the copied `test-vectors.json`

Both downstream jobs are lightweight — they only run the crypto interop subset, not full E2E.

## Implementation

### 1. llamenos-core: Add `notify-downstream` Job

**File**: `llamenos-core/.github/workflows/ci.yml`

Add a new job that runs after the `test` job passes, only on pushes to main (not PRs):

```yaml
  notify-downstream:
    needs: [test]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    name: Notify Downstream Repos

    steps:
      - name: Trigger llamenos CI
        uses: peter-evans/repository-dispatch@ff45666b9427631e3450c54a1bcbee4d9ff4d7c0 # v3.0.0
        with:
          token: ${{ secrets.CROSS_REPO_TOKEN }}
          repository: user/llamenos
          event-type: core-updated
          client-payload: '{"sha": "${{ github.sha }}", "ref": "${{ github.ref }}"}'

      - name: Trigger llamenos-mobile CI
        uses: peter-evans/repository-dispatch@ff45666b9427631e3450c54a1bcbee4d9ff4d7c0 # v3.0.0
        with:
          token: ${{ secrets.CROSS_REPO_TOKEN }}
          repository: user/llamenos-mobile
          event-type: core-updated
          client-payload: '{"sha": "${{ github.sha }}", "ref": "${{ github.ref }}"}'
```

### 2. llamenos: Add `repository_dispatch` Trigger

**File**: `llamenos/.github/workflows/ci.yml`

Add trigger:
```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  repository_dispatch:
    types: [core-updated]
```

For `repository_dispatch` events, run only the crypto interop test (skip build, deploy, version):

```yaml
  crypto-interop:
    if: github.event_name == 'repository_dispatch'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: oven-sh/setup-bun@4bc047ad259df6fc24a6c9b0f9a0cb08cf17fbe5 # v2.0.2
        with:
          version: ${{ env.BUN_VERSION }}
      - run: bun install --frozen-lockfile
      - name: Fetch latest test vectors
        run: |
          cd ../llamenos-core 2>/dev/null || git clone --depth 1 https://github.com/user/llamenos-core.git ../llamenos-core
          cd ../llamenos-core && git pull --ff-only 2>/dev/null || true
      - name: Run crypto interop tests
        run: bun run test -- tests/crypto-interop.spec.ts
```

### 3. llamenos-mobile: Add `repository_dispatch` Trigger

**File**: `llamenos-mobile/.github/workflows/mobile-e2e.yml`

Add trigger:
```yaml
on:
  pull_request:
    paths: [...]
  workflow_dispatch:
  repository_dispatch:
    types: [core-updated]
```

For `repository_dispatch` events, run only unit tests:

```yaml
  crypto-interop:
    if: github.event_name == 'repository_dispatch'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: oven-sh/setup-bun@4bc047ad259df6fc24a6c9b0f9a0cb08cf17fbe5 # v2.0.2
        with:
          version: "1.3.5"
      - run: bun install --frozen-lockfile
      - name: Sync test vectors from core
        run: |
          cd ../llamenos-core 2>/dev/null || git clone --depth 1 https://github.com/user/llamenos-core.git ../llamenos-core
          cd ../llamenos-core && git pull --ff-only 2>/dev/null || true
          cp ../llamenos-core/tests/fixtures/test-vectors.json __tests__/fixtures/test-vectors.json
      - name: Run crypto interop tests
        run: bun run test:unit:ci
```

### 4. Secret Configuration

**Required secret**: `CROSS_REPO_TOKEN`

This is a GitHub Personal Access Token (classic) with `repo` scope, stored as a repository secret in llamenos-core. It needs permission to create `repository_dispatch` events in the other two repos.

**Setup steps** (documented in `HUMAN_INSTRUCTIONS.md`):
1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with `repo` scope
3. Go to llamenos-core → Settings → Secrets → Actions → New repository secret
4. Name: `CROSS_REPO_TOKEN`, Value: the PAT

**Security note**: Use a fine-grained PAT if possible (GitHub now supports it). Scope to only the three repos with "Contents: Read" and "Actions: Write" permissions.

## Files to Modify

### llamenos-core
- `.github/workflows/ci.yml` — add `notify-downstream` job

### llamenos
- `.github/workflows/ci.yml` — add `repository_dispatch` trigger + `crypto-interop` job

### llamenos-mobile
- `.github/workflows/mobile-e2e.yml` — add `repository_dispatch` trigger + `crypto-interop` job

### Documentation
- `llamenos/docs/HUMAN_INSTRUCTIONS.md` — document `CROSS_REPO_TOKEN` setup

## Verification

1. Push a commit to llamenos-core main → downstream CI triggered within 1 minute
2. llamenos crypto-interop job runs and passes in <5 minutes
3. llamenos-mobile crypto-interop job runs and passes in <5 minutes
4. PR events in llamenos-core do NOT trigger downstream (only main pushes)
5. `CROSS_REPO_TOKEN` setup documented in HUMAN_INSTRUCTIONS.md
