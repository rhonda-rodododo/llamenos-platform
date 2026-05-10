# Pre-Commit Hook Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the lefthook pre-commit hook to run dprint formatting, bddgen freshness, unit tests, and additional checks in parallel, with agent-optimized output.

**Architecture:** Extend existing `lefthook.yml` with new parallel commands, add `dprint` formatter with `dprint.json` config, add convenience scripts to `package.json`, and verify all checks work correctly.

**Tech Stack:** lefthook, dprint, playwright-bdd, vitest, cargo, ESLint

---

## File Changes

1. **Create:** `dprint.json` — dprint formatter configuration
2. **Modify:** `lefthook.yml` — add new pre-commit and pre-push commands
3. **Modify:** `package.json` — add `format:check`, `format:write` scripts
4. **Modify:** `.gitignore` — ignore dprint cache if needed

---

## Task 1: Install dprint

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dprint as dev dependency**

```bash
bun add -D dprint
```

- [ ] **Step 2: Verify installation**

```bash
bunx dprint --version
```

Expected: version output (e.g., `0.49.0`)

---

## Task 2: Create dprint Configuration

**Files:**
- Create: `dprint.json`

- [ ] **Step 1: Write dprint.json config**

```json
{
  "typescript": {
    "lineWidth": 100,
    "indentWidth": 2,
    "useTabs": false,
    "semiColons": "always",
    "quoteStyle": "double",
    "trailingCommas": "all",
    "arrowFunction.useParentheses": "force"
  },
  "json": {},
  "markdown": {},
  "toml": {},
  "dockerfile": {},
  "includes": [
    "**/*.{ts,tsx,js,jsx,mjs,cjs}",
    "**/*.{json,jsonc}",
    "**/*.md",
    "**/*.toml",
    "**/*.yml",
    "**/*.yaml",
    "**/*.Dockerfile",
    "**/Dockerfile"
  ],
  "excludes": [
    "**/node_modules",
    "**/dist",
    "**/build",
    "**/.git",
    "**/target",
    "packages/protocol/generated",
    "apps/ios/vendor",
    "apps/android/vendor",
    "apps/android/app/build",
    "apps/ios/build",
    "apps/desktop/src-tauri/target",
    "tests/.features-gen",
    "**/*.lock"
  ],
  "plugins": [
    "https://plugins.dprint.dev/typescript-0.93.0.wasm",
    "https://plugins.dprint.dev/json-0.19.3.wasm",
    "https://plugins.dprint.dev/markdown-0.17.8.wasm",
    "https://plugins.dprint.dev/toml-0.6.3.wasm",
    "https://plugins.dprint.dev/dockerfile-0.3.2.wasm"
  ]
}
```

- [ ] **Step 2: Test dprint config**

```bash
bunx dprint check
```

Expected: Either "All files formatted" or a list of unformatted files. If unformatted files are listed, that's expected — we'll format them later.

---

## Task 3: Add package.json Scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add format scripts to package.json scripts section**

Add these entries to the `"scripts"` object (alphabetically near existing scripts):

```json
    "format:check": "dprint check",
    "format:write": "dprint fmt",
```

The scripts section should look like:

```json
  "scripts": {
    "dev": "bunx tauri dev apps/desktop",
    "dev:vite": "vite",
    "build": "vite build",
    "deploy": "bun run deploy:site",
    "deploy:site": "cd site && bun run deploy",
    "dev:tunnel": "bash scripts/dev-tunnel.sh",
    "build:server": "bun build src/server/index.ts --target=bun --outdir=dist/server",
    "build:docker": "bun run build:server",
    "start:server": "PLATFORM=bun bun --sql-preconnect src/server/index.ts",
    "typecheck": "bunx tsc --noEmit",
    "check:ipc-allowlist": "bash scripts/check-ipc-allowlist.sh",
    "bootstrap-admin": "bun run scripts/bootstrap-admin.ts",
    "format:check": "dprint check",
    "format:write": "dprint fmt",
    "test": "PLAYWRIGHT_TEST=true bunx playwright test",
    ...
```

---

## Task 4: Update lefthook.yml — Pre-Commit Stage

**Files:**
- Modify: `lefthook.yml`

- [ ] **Step 1: Rewrite lefthook.yml pre-commit section**

Replace the entire file content:

```yaml
pre-commit:
  parallel: true
  commands:
    typecheck:
      run: bun run typecheck
      stage_fixed: true
    format-check:
      run: bun run format:check
      stage_fixed: true
    lint:
      glob: "{src,apps/worker}/**/*.{ts,tsx}"
      run: bun run lint
      stage_fixed: true
    codegen-freshness:
      glob: "packages/protocol/schemas/*.ts"
      run: bun run codegen && git diff --exit-code packages/protocol/generated/
    bddgen-freshness:
      glob: "{packages/test-specs/features/**/*.feature,tests/steps/**/*.ts}"
      run: bunx bddgen && git diff --exit-code tests/.features-gen/
    worker-unit-tests:
      glob: "apps/worker/**/*.{ts,tsx}"
      run: bun run test:worker:unit
    crypto-unit-tests:
      glob: "packages/crypto/**/*.rs"
      run: bun run crypto:test
    crypto-ffi-build:
      glob: "packages/crypto/**/*.rs"
      run: bun run crypto:build:server
    migration-drift:
      glob: "apps/worker/db/schema/*.ts"
      run: bun scripts/check-migration-drift.ts
    ipc-allowlist-check:
      glob: "{apps/desktop/src/**/*.rs,src/client/lib/platform.ts}"
      run: bun run check:ipc-allowlist
    i18n-validate:
      glob: "{packages/i18n/locales/*.json,src/client/**/*.tsx}"
      run: bun run i18n:validate:all
    test-specs-validate:
      glob: "{packages/test-specs/features/**/*.feature,tests/steps/**/*.ts}"
      run: bun run test-specs:validate
    block-env-files:
      run: |
        # Block actual .env files (which may contain secrets) but allow .env.example (template)
        staged=$(git diff --cached --name-only | grep -E 'deploy/docker/\.env' | grep -v '\.example$' || true)
        if [ -n "$staged" ]; then
          echo "ERROR: Refusing to commit deploy/docker/.env files."
          echo "These files contain secrets. Provision via orchestration layer instead."
          echo "Staged: $staged"
          exit 1
        fi

pre-push:
  commands:
    check-codegen-drift:
      run: bun run codegen:check
    check-migration-drift:
      run: bun scripts/check-migration-drift.ts
    check-format-drift:
      run: bun run format:check
```

---

## Task 5: Verify bddgen Output Directory

**Files:**
- None (verification only)

- [ ] **Step 1: Check where bddgen outputs files**

```bash
ls -la tests/.features-gen/ 2>/dev/null || echo "Directory does not exist"
```

If the directory doesn't exist, run:

```bash
bunx bddgen
```

Then check again:

```bash
ls -la tests/.features-gen/ 2>/dev/null || ls -la tests/*.spec.ts 2>/dev/null || echo "Need to find bddgen output"
```

- [ ] **Step 2: If bddgen outputs to a different location, update lefthook.yml**

If output is in `tests/.features-gen/`, no change needed.
If output is elsewhere (e.g., `tests/generated/`), update the `bddgen-freshness` command in `lefthook.yml`.

---

## Task 6: Update .gitignore for dprint

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add dprint cache to .gitignore**

Add at the end of `.gitignore`:

```
# dprint cache
.dprint/cache/
```

---

## Task 7: Test the Pre-Commit Hook

**Files:**
- None (testing only)

- [ ] **Step 1: Stage the changes**

```bash
git add lefthook.yml package.json dprint.json .gitignore
```

- [ ] **Step 2: Run lefthook manually to verify config is valid**

```bash
bunx lefthook run pre-commit
```

Expected: All checks run. Some may skip (no matching files). Format check may fail if files are unformatted — that's expected.

- [ ] **Step 3: If format-check fails, format the repo**

```bash
bun run format:write
git add -A
```

- [ ] **Step 4: Run lefthook again**

```bash
bunx lefthook run pre-commit
```

Expected: All checks pass or skip appropriately.

- [ ] **Step 5: Test pre-push**

```bash
bunx lefthook run pre-push
```

Expected: All checks pass.

---

## Task 8: Commit and Create PR

**Files:**
- None (git operations)

- [ ] **Step 1: Commit the changes**

```bash
git add -A
git commit -m "ci: enhance pre-commit hook with dprint, bddgen, unit tests, and more

Add comprehensive pre-commit checks to prevent stale generated code,
unformatted files, and broken tests from being committed.

Changes:
- Add dprint formatter with dprint.json config
- Add format:check and format:write scripts to package.json
- Extend lefthook pre-commit with 12 parallel checks:
  - typecheck, format-check, lint (every commit)
  - codegen-freshness, bddgen-freshness (on relevant changes)
  - worker-unit-tests, crypto-unit-tests, crypto-ffi-build (on relevant changes)
  - migration-drift, ipc-allowlist-check, i18n-validate, test-specs-validate
  - block-env-files (security)
- Add format-drift check to pre-push
- Add .dprint/cache to .gitignore

All checks run in parallel for minimal commit latency."
```

- [ ] **Step 2: Push and create PR**

```bash
git push -u origin HEAD
```

Then create a PR with title: `ci: enhance pre-commit hook with dprint, bddgen, unit tests, and more`

---

## Spec Coverage Check

| Spec Requirement | Plan Task |
|------------------|-----------|
| Add dprint formatter | Task 1, 2, 3 |
| dprint.json config | Task 2 |
| format:check / format:write scripts | Task 3 |
| typecheck every commit | Task 4 |
| format-check every commit | Task 4 |
| lint on TS changes | Task 4 |
| codegen-freshness on schema changes | Task 4 |
| bddgen-freshness on feature changes | Task 4, 5 |
| worker-unit-tests on worker changes | Task 4 |
| crypto-unit-tests on Rust changes | Task 4 |
| crypto-ffi-build on Rust changes | Task 4 |
| migration-drift on schema changes | Task 4 |
| ipc-allowlist-check on desktop changes | Task 4 |
| i18n-validate on i18n changes | Task 4 |
| test-specs-validate on feature changes | Task 4 |
| block-env-files security check | Task 4 |
| pre-push format drift check | Task 4 |
| Agent-optimized output | Task 4 (lefthook handles minimal output) |
| .gitignore dprint cache | Task 6 |
| Test the hook | Task 7 |
| Commit and PR | Task 8 |

All spec requirements are covered. No placeholders. No TBDs.
