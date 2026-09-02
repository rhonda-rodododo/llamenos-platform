# Project Rules: Llamenos Hotline

Paste this block into the "Rules you must follow" section of worker prompts for Llamenos Hotline.

## Dispatch invocation (for supervisors)

```bash
DISPATCH_REPO=/media/rikki/Main/projects/llamenos-hotline \
WORKTREE_BASE=/media/rikki/Main/projects \
  ~/.claude/skills/supervising-dispatched-sessions/dispatch-one.sh <name> <prompt-file> [timeout] [model]
```

Prefix names with `lh-` to disambiguate from other projects in status.sh output.

---

## Llamenos Hotline Worker Rules

### Git & Worktrees
- **Always work in your worktree** — never `cd` to or `git checkout` in `/media/rikki/Main/projects/llamenos-hotline` (the main repo).
- **Worktrees live at** `/media/rikki/Main/projects/llamenos-hotline-<name>`.
- **GitHub remote:** `git@github.com:rhonda-rodododo/llamenos-hotline.git`

### Push & PR Creation (GitHub)
```bash
git push -u origin HEAD
gh pr create --title "<type>(<scope>): <description>" --body "## Summary\n<bullets>\n\n## Test plan\n<checklist>"
```
Use `gh` CLI for PR operations. Poll `gh pr view <n> --json statusCheckRollup` for CI status.

### Merging (GitHub)
- **Only merge when** `mergeStateStatus=CLEAN` AND every required check is green
- ```bash
  gh pr merge <n> --squash --delete-branch
  ```
- No flake excuses, no "almost green"

### Build + Test Verification (ALL tiers, MANDATORY before pushing)

Run **all four test tiers**, not just typecheck+build. CI is not the test runner.

```bash
# 1. Build verification
bun run typecheck
bun run lint
bun run build

# 2. Unit tests (fast, no services needed)
bun run test:unit

# 3. Integration tests (need postgres — start with bun run dev:docker)
bun run dev:docker   # if not already up
bunx playwright test tests/api/ --grep "integration" --workers=1

# 4. API E2E tests (need running server)
bun run dev:server &  # if not already up
bunx playwright test tests/api/ --workers=1

# 5. UI E2E tests (need running server + browser)
bunx playwright test <targeted-ui-specs> --workers=1
```

- **Start dev services first:** `bun run dev:docker`, then `bun run dev:server`. Confirm `curl -sf http://localhost:3000/api/health` → 200.
- **Target specs that touch your changes** — don't run the full suite unless you changed shared infrastructure.
- If shared state was touched (routes, fixtures, portals, IDB, crypto worker, types/schemas), run a **broader slice with 3 workers**:
  ```bash
  PLAYWRIGHT_WORKERS=3 bunx playwright test tests/api/ tests/ui/ --reporter=list
  ```
- If anything fails, diagnose root cause. No blind patches.

### Package Management
- **Package manager:** Bun
- **Lockfile:** `bun.lock` — commit after any package change
- **No in-place edits to shipped drizzle migrations** — create new migration files

### Code Standards
- **Testid-only selectors** in any E2E test — no CSS class or text selectors
- **Root-cause only** — no `--no-verify`, no weakening app code to silence tests
- **If blocked >60 min**, write `status: BLOCKED` and exit. Never push broken code. Exhaust alternative approaches before giving up.

### Test Fixture Maintenance (CRITICAL)
- **When you change types, schemas, or wire formats:** grep ALL test files (`tests/`, `*.test.ts`) for stubs/fixtures that construct the old shape. Update them in the SAME commit/PR. Never defer test fixture updates to a follow-up.
- **Refactors that touch shared types are not done until every test stub matches.** A PR that changes `RecipientEnvelope` from `{wrappedKey, ephemeralPubkey}` to `{v, labelId, enc, ct}` MUST also update every test that creates a `RecipientEnvelope` stub.
- **Run e2e tests locally, not just typecheck+build.** Type-checking cannot catch stale runtime test data — only running the tests reveals shape mismatches at the zod validation boundary.

### CI False-Positive Awareness
- **Doc-only PRs skip all test jobs** (unit, integration, API, E2E). A "green main" after merging a docs PR is meaningless for test health.
- **Before merging a code PR or release PR**, verify that the last *code-changing* CI run on main was green — not just the latest commit's CI status. Check `gh run list --branch main` and find the most recent run that actually ran tests (not all SKIPPED).
- **After merging a major refactor**, always trigger or wait for a full CI run on a code-changing commit before merging the next PR.

### Release Safety
- **Never merge the release PR autonomously.** The release PR is auto-maintained by knope, lives on branch `release`, title starts with `chore: prepare release v`. Merging it cuts a real release. Only merge when the user explicitly says "cut the release" / "ship it" AND all checks pass.
