# Llámenos Fleet — Live Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Take the fleet from a shadow pass to **live dispatch** — a worker is briefed, works in its own worktree, opens a PR, its diff is verified mechanically and by a different engine, and low-impact work merges while everything expensive stops for a human.

**Architecture:** The engine adapter wraps the repo's existing, proven `dispatch-one.sh` rather than standing up a second runtime. Verification is mechanical-first: scope and tests block; a second-engine opinion may only downgrade a pass, never rescue a mechanical failure. Everything already built in Plan 1 (`select`, `scope`, `impact`, `circuit`, `killswitch`, `lock`, `ledger`, `tick`) is wired, not rewritten.

**Tech Stack:** TypeScript (strict, no `any`), Bun, vitest 4, `gh` CLI, `dispatch-one.sh` + tmux.

**Spec:** `docs/superpowers/specs/2026-09-11-llamenos-fleet-orchestrator-design.md`

**Predecessor:** `docs/superpowers/plans/2026-09-11-fleet-core.md` (PR #642)

## Global Constraints

- TypeScript strict, **no `any`**. `orchestrator/` and `tests/orchestrator/` are covered by `bunx tsc --noEmit` and `bunx eslint`; both must stay clean. Tests via `bun run test:fleet`.
- **A source read that fails returns `undefined`, never `[]`.** Unchanged from Plan 1 and still load-bearing.
- **Mechanical gates run before any model opinion, and block.** A second-engine review may only downgrade a pass. An unreachable reviewer blocks.
- **The fleet may never merge `orchestrator/`, `tests/orchestrator/`, `.claude/agents/fragments/`, `.claude/settings.json`, crypto, protocol schemas, auth, migrations, CI, deploy, store or signing config.** `classifyImpact` already encodes this; wiring it is this plan's job.
- **Every lane returns to `off` at the end of this plan.** Going live is a separate, deliberate act (Task 12).
- **No worker ever receives store, signing, deploy, or telephony credentials.**
- Existing behaviour must not regress: 231 tests pass today.

---

### Task 1: Vendor the dispatch machinery into the repo

The fleet must not depend on an untracked script that can change under it without a commit. This is the failure PR #623's own README describes — machine-local sources drifting for months unnoticed.

**Files:**
- Create: `orchestrator/vendor/dispatch/` (copied from `~/.claude/skills/supervising-dispatched-sessions/`)
- Create: `orchestrator/vendor/README.md`
- Create: `scripts/check-vendor-drift.sh`
- Modify: `package.json` (add `fleet:vendor:check`)
- Test: `tests/orchestrator/vendor.test.ts`

**Interfaces:**
- Produces: `DISPATCH_SCRIPT` path constant exported from `orchestrator/src/paths.ts`.

- [ ] **Step 1: Identify exactly what must be vendored**

Run `bash ~/.claude/skills/supervising-dispatched-sessions/dispatch-one.sh --help` and read the script's head. Copy `dispatch-one.sh` and every file it sources or references at runtime — at minimum the `prompt-template*.md` and `prompt-rules-llamenos.md` it assembles from. Do **not** vendor `trello-*.sh` (this fleet reads GitHub) or other projects' rules files (`prompt-rules-skybuild.md`, `prompt-rules-translatemd.md`).

**Take the version that includes PR #643's fixes** — the pre-#643 rules instruct workers to run `bun run dev:docker` and `bun run test:unit`, neither of which exists, and point `DISPATCH_REPO` at the retired sibling repo `llamenos-hotline`. Verify before copying: grep the copied rules for `dev:docker`, `test:unit`, and `llamenos-hotline`. If any are present, you have the wrong version — stop and report.

- [ ] **Step 2: Write the drift guard**

```bash
# scripts/check-vendor-drift.sh
#!/usr/bin/env bash
# The fleet dispatches through orchestrator/vendor/dispatch/. That copy is the
# one that ships and the one CI runs. The $HOME skill directory is a developer
# convenience that is NOT version-controlled and may differ.
#
# This guard does not force them equal — that would make every local experiment
# a CI failure. It asserts the vendored copy is present, executable, and carries
# no reference to a command or repo that does not exist, which is exactly how
# the pre-#643 rules shipped broken for months.
set -euo pipefail
V="orchestrator/vendor/dispatch"
fail=0
[[ -x "$V/dispatch-one.sh" ]] || { echo "FAIL: $V/dispatch-one.sh missing or not executable"; fail=1; }
for bad in "dev:docker" "run test:unit" "llamenos-hotline"; do
  if grep -rn -- "$bad" "$V" >/dev/null 2>&1; then
    echo "FAIL: vendored dispatch references '$bad', which does not exist in this repo:"
    grep -rn -- "$bad" "$V" | head -5
    fail=1
  fi
done
exit $fail
```

- [ ] **Step 3: Write the test**

```ts
// tests/orchestrator/vendor.test.ts
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { DISPATCH_SCRIPT } from '../../orchestrator/src/paths.js'

describe('vendored dispatch machinery', () => {
  it('exists and is executable', () => {
    expect(existsSync(DISPATCH_SCRIPT)).toBe(true)
    expect(statSync(DISPATCH_SCRIPT).mode & 0o111).toBeGreaterThan(0)
  })

  it.each(['dev:docker', 'run test:unit', 'llamenos-hotline'])(
    'does not instruct workers to use %s, which does not exist here',
    (bad) => {
      const out = execFileSync('bash', ['-c',
        `grep -rn -- '${bad}' orchestrator/vendor/dispatch || true`], { encoding: 'utf8' })
      expect(out.trim()).toBe('')
    })

  it('accepts the flags the engine adapter depends on', () => {
    const src = readFileSync(DISPATCH_SCRIPT, 'utf8')
    for (const flag of ['--agent', '--owns', '--effort', '--rules', '--max-budget-usd', '--dry-run']) {
      expect(src, `dispatch-one.sh must accept ${flag}`).toContain(flag)
    }
  })
})
```

- [ ] **Step 4: Run, wire, commit**

Run: `bun run test:fleet -- tests/orchestrator/vendor.test.ts` → PASS.
Add `"fleet:vendor:check": "bash scripts/check-vendor-drift.sh"` to `package.json` and a step to CI's `backend-unit` job beside the fleet suite.

```bash
git add orchestrator/vendor scripts/check-vendor-drift.sh tests/orchestrator/vendor.test.ts package.json .github/workflows/ci.yml orchestrator/src/paths.ts
git commit -m "feat(fleet): vendor the dispatch machinery with a drift guard"
```

---

### Task 2: The engine adapter

**Files:**
- Create: `orchestrator/src/engines.ts`
- Test: `tests/orchestrator/engines.test.ts`

**Interfaces:**
- Consumes: `paths.ts` (`DISPATCH_SCRIPT`), `config.ts` (`Lane`), `source.ts` (`WorkItem`), `ledger.ts` (`Outcome`).
- Produces:
```ts
export interface DispatchRequest {
  name: string; item: WorkItem; lane: Lane; briefPath: string
  timeoutSec: number; model: string; effort: EffortLevel
}
export interface DispatchResult {
  outcome: Outcome; branch?: string; pr?: string; note?: string; worktree?: string
}
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export function statusToOutcome(status: string): Outcome
export function parseStatusFile(text: string): Record<string, string>
export async function dispatch(req: DispatchRequest): Promise<DispatchResult>
export function readStatus(name: string): Record<string, string> | undefined
```

**How it works.** `dispatch-one.sh <name> <brief-file> [timeout] [model] [worktree]` creates the worktree off `origin/main`, assembles the prompt, starts a detached tmux session, and writes `~/tier-overnight-status/<name>.status`. The adapter writes the brief, spawns it, polls the status file, and maps the terminal status to an `Outcome`. Flags used: `--agent <lane>-supervisor`, `--owns <lane scope>`, `--effort`, `--rules llamenos`.

- [ ] **Step 1: Write the failing tests for the pure parts**

```ts
// tests/orchestrator/engines.test.ts
import { describe, it, expect } from 'vitest'
import { statusToOutcome, parseStatusFile, buildArgs } from '../../orchestrator/src/engines.js'
import type { Lane } from '../../orchestrator/src/config.js'

describe('parseStatusFile', () => {
  it('parses the key: value protocol', () => {
    const r = parseStatusFile('session: x\nstatus: SUCCESS\npr: 42\nduration_sec: 10\nnotes: did the thing\n')
    expect(r['status']).toBe('SUCCESS')
    expect(r['pr']).toBe('42')
    expect(r['notes']).toBe('did the thing')
  })
  it('keeps colons inside a value', () => {
    expect(parseStatusFile('notes: fixed a: b mapping')['notes']).toBe('fixed a: b mapping')
  })
  it('tolerates a truncated final line', () => {
    expect(parseStatusFile('status: SUCCESS\npr')['status']).toBe('SUCCESS')
  })
})

describe('statusToOutcome', () => {
  it.each([
    ['SUCCESS', 'SUCCESS'], ['BLOCKED', 'BLOCKED'], ['FAILED', 'FAILED'],
    ['NEEDS_CONTEXT', 'BLOCKED'], ['PARTIAL', 'BLOCKED'],
  ])('maps %s to %s', (s, o) => expect(statusToOutcome(s)).toBe(o))

  it('maps a non-terminal status to FAILED rather than guessing success', () => {
    expect(statusToOutcome('IN_PROGRESS')).toBe('FAILED')
    expect(statusToOutcome('DISPATCHED')).toBe('FAILED')
  })

  it('maps an unknown status to FAILED', () => {
    expect(statusToOutcome('WAT')).toBe('FAILED')
  })
})

describe('buildArgs', () => {
  const lane: Lane = {
    id: 'backend', mode: 'live', cap: 1, engine: 'claude',
    requireLabel: 'agent-dispatchable', vetoLabels: [],
    scope: { owned: ['apps/worker/', 'sip-bridge/'], notOwned: [] },
  }
  it('passes the lane supervisor as --agent', () => {
    expect(buildArgs({ name: 'n', briefPath: '/b', lane, timeoutSec: 60, model: 'sonnet', effort: 'medium' }))
      .toContain('--agent')
    expect(buildArgs({ name: 'n', briefPath: '/b', lane, timeoutSec: 60, model: 'sonnet', effort: 'medium' }))
      .toContain('backend-supervisor')
  })
  it('passes the lane scope as --owns, comma separated', () => {
    const a = buildArgs({ name: 'n', briefPath: '/b', lane, timeoutSec: 60, model: 'sonnet', effort: 'medium' })
    expect(a[a.indexOf('--owns') + 1]).toBe('apps/worker/,sip-bridge/')
  })
  it('refuses to build args for a lane with an empty scope', () => {
    const bare = { ...lane, scope: { owned: [], notOwned: [] } }
    expect(() => buildArgs({ name: 'n', briefPath: '/b', lane: bare, timeoutSec: 60, model: 'sonnet', effort: 'medium' }))
      .toThrow(/scope/i)
  })
  it('always injects the llamenos project rules', () => {
    const a = buildArgs({ name: 'n', briefPath: '/b', lane, timeoutSec: 60, model: 'sonnet', effort: 'medium' })
    expect(a[a.indexOf('--rules') + 1]).toBe('llamenos')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test:fleet -- tests/orchestrator/engines.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement**

Key decisions to encode in comments:
- `statusToOutcome` maps a **non-terminal** status (`IN_PROGRESS`, `DISPATCHED`) to `FAILED`, not to success. A worker that never wrote a terminal status is a worker that died; treating that as success is how a fleet reports work it never did.
- `buildArgs` **throws** on an empty lane scope. `--owns` is the only thing standing between two workers and the same file, and passing an empty ownership block silently removes that protection.
- Spawn by argv via `execFile`, never through a shell — a worker-authored branch or issue title must never reach `bash -c`.

- [ ] **Step 4: Run to verify pass, then commit**

```bash
git add orchestrator/src/engines.ts tests/orchestrator/engines.test.ts
git commit -m "feat(fleet): engine adapter over the vendored dispatch script"
```

---

### Task 3: The brief

A worker's entire task specification. Atlas's lesson: the brief is one string, the output contract is explicit, and the worker is told what it may NOT do.

**Files:**
- Create: `orchestrator/src/brief.ts`
- Test: `tests/orchestrator/brief.test.ts`

**Interfaces:**
- Produces: `buildBrief(item: WorkItem, lane: Lane, branch: string, priorAttempts: RunRecord[]): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestrator/brief.test.ts
import { describe, it, expect } from 'vitest'
import { buildBrief } from '../../orchestrator/src/brief.js'
import type { Lane } from '../../orchestrator/src/config.js'
import type { WorkItem } from '../../orchestrator/src/source.js'
import type { RunRecord } from '../../orchestrator/src/ledger.js'

const lane: Lane = {
  id: 'backend', mode: 'live', cap: 1, engine: 'claude',
  requireLabel: 'agent-dispatchable', vetoLabels: [],
  scope: { owned: ['apps/worker/'], notOwned: ['tests/'] },
}
const item: WorkItem = {
  id: '42', title: 'Fix the thing', body: 'x'.repeat(300),
  url: 'https://github.com/o/r/issues/42', labels: ['agent-dispatchable', 'lane:backend'],
}

describe('buildBrief', () => {
  it('carries the issue body verbatim as the specification', () => {
    expect(buildBrief(item, lane, 'auto/backend-x', [])).toContain(item.body)
  })
  it('names the issue and its url for provenance', () => {
    const b = buildBrief(item, lane, 'auto/backend-x', [])
    expect(b).toContain('#42'); expect(b).toContain(item.url)
  })
  it('states the branch the worker must use', () => {
    expect(buildBrief(item, lane, 'auto/backend-x', [])).toContain('auto/backend-x')
  })
  it('forbids merging, deploying and sending', () => {
    const b = buildBrief(item, lane, 'auto/backend-x', []).toLowerCase()
    expect(b).toMatch(/never merge/); expect(b).toMatch(/never deploy/)
  })
  it('states the output contract', () => {
    const b = buildBrief(item, lane, 'auto/backend-x', [])
    expect(b).toContain('DONE'); expect(b).toContain('BLOCKED')
  })
  it('includes what previous attempts learned', () => {
    const prior: RunRecord[] = [{
      ts: 1, runId: 'r', lane: 'backend', itemId: '42', itemName: 'Fix the thing',
      engine: 'claude', outcome: 'REJECTED', note: 'scope violation: touched packages/crypto/',
    }]
    const b = buildBrief(item, lane, 'auto/backend-x', prior)
    expect(b).toContain('scope violation')
    expect(b).toMatch(/previous attempt/i)
  })
  it('says nothing about previous attempts when there are none', () => {
    expect(buildBrief(item, lane, 'auto/backend-x', [])).not.toMatch(/previous attempt/i)
  })
})
```

- [ ] **Step 2–4: Fail, implement, pass**

The brief must state: the issue, its body verbatim, the branch, the lane's owned paths, one PR only, never merge/deploy/send, stay in scope, say so if you reduce scope, **do not run the full test suite** (run only what your diff touches), and the output contract `DONE <pr-url>` or `BLOCKED <reason>`.

**Prior-attempt context is the thing Atlas lacks entirely** — there, every run starts from zero and an item simply fails three times. Include, for each prior terminal attempt: the outcome and the note. Cap at the three most recent.

```bash
git commit -m "feat(fleet): worker brief carrying prior-attempt context"
```

---

### Task 4: Wire mechanical verification

**Files:**
- Create: `orchestrator/src/verify.ts`
- Test: `tests/orchestrator/verify.test.ts`

**Interfaces:**
- Consumes: `scope.ts` (`checkScope`), `impact.ts` (`classifyImpact`), `config.ts` (`NEVER_WRITE_PATHS`).
- Produces:
```ts
export interface VerifyInput { worktree: string; branch: string; lane: Lane }
export interface VerifyReport {
  passed: boolean; reasons: string[]
  changedFiles: string[]; addedLines: number
  impact: 'low' | 'high'; impactReasons: string[]
  testsRun?: string[]; testsPassed?: boolean
}
export function changedFilesFrom(diffNameOnly: string): string[]
export function addedLinesFrom(diffText: string): number
export function testTargetsFor(changed: string[]): string[]
export function isSafeTestPath(p: string): boolean
export async function verifyMechanical(input: VerifyInput): Promise<VerifyReport>
```

**This task wires `checkScope` and `classifyImpact`, which have had no runtime caller until now.**

- [ ] **Step 1: Write the failing tests**

```ts
// tests/orchestrator/verify.test.ts
import { describe, it, expect } from 'vitest'
import { changedFilesFrom, addedLinesFrom, testTargetsFor, isSafeTestPath } from '../../orchestrator/src/verify.js'

describe('changedFilesFrom', () => {
  it('splits git diff --name-only output', () => {
    expect(changedFilesFrom('a/b.ts\nc/d.ts\n')).toEqual(['a/b.ts', 'c/d.ts'])
  })
  it('returns [] for empty output', () => {
    expect(changedFilesFrom('')).toEqual([])
  })
})

describe('addedLinesFrom', () => {
  it('counts added lines and ignores the +++ header', () => {
    const diff = ['--- a/x.ts', '+++ b/x.ts', '@@', '+one', '+two', '-gone', ' same'].join('\n')
    expect(addedLinesFrom(diff)).toBe(2)
  })
})

describe('isSafeTestPath', () => {
  it.each(['-rf', '../etc/passwd', 'a$(whoami)b', 'a;rm -rf /', 'a`id`b'])(
    'rejects %s', (p) => expect(isSafeTestPath(p)).toBe(false))
  it.each(['tests/orchestrator', 'apps/worker/__tests__/unit'])(
    'accepts %s', (p) => expect(isSafeTestPath(p)).toBe(true))
})

describe('testTargetsFor', () => {
  it('maps worker changes to the worker unit suite', () => {
    expect(testTargetsFor(['apps/worker/lib/auth.ts']).join(' ')).toMatch(/worker/)
  })
  it('maps orchestrator changes to the fleet suite', () => {
    expect(testTargetsFor(['orchestrator/src/tick.ts']).join(' ')).toMatch(/orchestrator/)
  })
  it('never returns the whole suite', () => {
    expect(testTargetsFor(['apps/worker/a.ts', 'src/client/b.tsx'])).not.toContain('.')
  })
  it('returns [] when nothing maps, rather than falling back to everything', () => {
    expect(testTargetsFor(['README.md'])).toEqual([])
  })
})
```

- [ ] **Step 2–4: Fail, implement, pass**

Order inside `verifyMechanical`, and the order is the point:
1. `checkScope(changed, lane.scope, NEVER_WRITE_PATHS)` — any `forbidden` or `strayed` is an immediate fail with the offending files named.
2. `classifyImpact(changed, addedLines)` — recorded, not a fail.
3. Diff-targeted tests via `testTargetsFor`, run **by argv with no shell**. Atlas's scar: a previous version built a `bash -lc` string from worker-authored filenames, so a committed file named `$(...)` would have executed inside the gate holding every credential. `isSafeTestPath` rejects leading `-`, `..`, and anything outside an allowlisted character set.
4. **Never run the full suite.** It is slow, it produces failures unrelated to the diff, and CI already shards it.
5. A non-zero test exit with **zero** parsed failing assertions is infrastructure, not a code failure: warn, set `testsPassed: undefined`, do not block.

```bash
git commit -m "feat(fleet): mechanical verification wiring scope and impact"
```

---

### Task 5: Non-author verification — the second opinion

**Files:**
- Create: `orchestrator/src/review.ts`
- Test: `tests/orchestrator/review.test.ts`

**Interfaces:**
- Produces:
```ts
export const VERIFIER_BRIEF: string
export function verifierFor(authorEngine: EngineId): EngineId
export function parseVerdict(output: string): 'PASS' | 'FAIL' | 'UNREADABLE'
export async function secondOpinion(input: {...}): Promise<{ verdict, text }>
export async function postReview(pr: string, verdict, body: string): Promise<void>
```

**This is spec rail 1** and the reason a live lane is defensible at all.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/orchestrator/review.test.ts
import { describe, it, expect } from 'vitest'
import { parseVerdict, verifierFor } from '../../orchestrator/src/review.js'

describe('verifierFor', () => {
  it('never returns the author engine', () => {
    expect(verifierFor('claude')).not.toBe('claude')
    expect(verifierFor('opencode')).not.toBe('opencode')
  })
})

describe('parseVerdict', () => {
  it('reads an explicit PASS', () => {
    expect(parseVerdict('SCOPE: ok\nVERDICT: PASS')).toBe('PASS')
  })
  it('reads an explicit FAIL', () => {
    expect(parseVerdict('VERDICT: FAIL — touched files outside its lane')).toBe('FAIL')
  })
  it('treats a missing verdict as UNREADABLE, not as a pass', () => {
    expect(parseVerdict('I think it looks fine honestly')).toBe('UNREADABLE')
  })
  it('treats empty output as UNREADABLE', () => {
    expect(parseVerdict('')).toBe('UNREADABLE')
  })
  it('is case-insensitive and tolerates leading whitespace', () => {
    expect(parseVerdict('  verdict: pass')).toBe('PASS')
  })
})
```

- [ ] **Step 2–4: Fail, implement, pass**

Rules to encode:
- The verifier runs on a **different engine** from the author. Different vendor, different weights, different failure modes is the property that matters — a model reviewing its own output shares its blind spots.
- It runs read-only. It is told it is a reader.
- **`UNREADABLE` blocks.** An unreachable or incoherent reviewer is not a pass. This is where a naive implementation silently degrades to no review at all.
- A second opinion is requested **only when the mechanical gates already passed**, and it may only turn a pass into a fail.
- A high-impact diff gets a longer review — more turns, and told why it was classified high-impact.
- The review is posted to the PR with `gh pr review --request-changes|--approve`, so it is the same artifact a human reviewer produces and a human can reply in the same thread.

```bash
git commit -m "feat(fleet): non-author verification on a different engine"
```

---

### Task 6: The merge gate

**Files:**
- Create: `orchestrator/src/merge.ts`
- Test: `tests/orchestrator/merge.test.ts`

**Interfaces:**
- Produces: `mayAutoMerge(report: VerifyReport, ciGreen: boolean, reviewVerdict): { merge: boolean; reason: string }`, `ciStatusFor(pr)`, `mergePr(pr)`.

- [ ] **Step 1: Write the failing tests — this is the highest-stakes pure function in the fleet**

```ts
// tests/orchestrator/merge.test.ts
import { describe, it, expect } from 'vitest'
import { mayAutoMerge } from '../../orchestrator/src/merge.js'
import type { VerifyReport } from '../../orchestrator/src/verify.js'

const ok = (over: Partial<VerifyReport> = {}): VerifyReport => ({
  passed: true, reasons: [], changedFiles: ['apps/worker/x.ts'], addedLines: 10,
  impact: 'low', impactReasons: [], testsPassed: true, ...over,
})

describe('mayAutoMerge', () => {
  it('merges low-impact work with green CI and an approving non-author review', () => {
    expect(mayAutoMerge(ok(), true, 'PASS').merge).toBe(true)
  })
  it('refuses when CI is not green', () => {
    expect(mayAutoMerge(ok(), false, 'PASS').merge).toBe(false)
  })
  it('refuses when the review did not pass', () => {
    expect(mayAutoMerge(ok(), true, 'FAIL').merge).toBe(false)
  })
  it('refuses when the review was unreadable', () => {
    expect(mayAutoMerge(ok(), true, 'UNREADABLE').merge).toBe(false)
  })
  it('refuses high-impact work even with everything else green', () => {
    expect(mayAutoMerge(ok({ impact: 'high', impactReasons: ['crypto'] }), true, 'PASS').merge).toBe(false)
  })
  it('refuses when mechanical verification failed', () => {
    expect(mayAutoMerge(ok({ passed: false, reasons: ['strayed'] }), true, 'PASS').merge).toBe(false)
  })
  it('refuses when tests could not be established', () => {
    expect(mayAutoMerge(ok({ testsPassed: undefined }), true, 'PASS').merge).toBe(false)
  })
  it('always gives a reason', () => {
    expect(mayAutoMerge(ok({ impact: 'high' }), true, 'PASS').reason.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2–4: Fail, implement, pass**

`mayAutoMerge` is pure and takes no I/O. **Every condition is an AND**; there is no path that merges on a subset. Merges are `--squash` so `revert` is one commit.

```bash
git commit -m "feat(fleet): merge gate — every condition an AND"
```

---

### Task 7: Wire the live dispatch path into `tick`

**Files:**
- Modify: `orchestrator/src/tick.ts`
- Modify: `orchestrator/src/cli.ts` (remove the live refusal from Plan 1)
- Test: `tests/orchestrator/tick-live.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover, all through injected `TickDeps`: a live lane dispatches; a `DISPATCHED` ledger row is written **at dispatch time** (the rate breaker counts these — issue #638); `inQuotaCooldown` is honoured and skips the lane; a quota outcome does not feed the failure streak; the settle path records exactly one terminal row per run; and the worktree is destroyed on every outcome including success.

- [ ] **Step 2–4: Fail, implement, pass**

Order inside a dispatch, unchanged from Plan 1 except where noted:
1. Halt re-check (already present).
2. Attempt-limit check (already present).
3. **Write a `DISPATCHED` row** — this is issue #638; the rate breaker counts these and nothing wrote them.
4. `engines.dispatch(...)`.
5. `verifyMechanical(...)`; on failure, comment the reasons on the issue and record `REJECTED`.
6. `secondOpinion(...)` only if mechanical passed; post it as a PR review.
7. `mayAutoMerge(...)` → merge, or comment and leave for a human.
8. **`settle()`** — the single exit: stop the session, kill any process still inside the worktree, **salvage uncommitted work to a pushed branch**, destroy the worktree, label the issue.

Salvage before teardown is not optional: Atlas lost 1,070 correct lines to a 61-minute timeout whose worktree was then deleted.

```bash
git commit -m "feat(fleet): live dispatch path with settle and salvage"
```

---

### Task 8: Breakers must actually halt (issue #638)

**Files:**
- Modify: `orchestrator/src/circuit.ts`, `orchestrator/src/tick.ts`
- Test: `tests/orchestrator/circuit.test.ts`

- [ ] **Steps**

The spec says "a tripped breaker writes the same halt file a human would — one halted state, one recovery path", and `killswitch.ts` comments that breakers call it. **Nothing calls `halt()` except the CLI.** A tripped breaker currently aborts the pass and logs a line; `doctor` still says `not halted` and the operator is never told to run `resume`.

Make a tripped breaker call `halt(reason)`. Test: after a trip, `haltedLocally()` is true and the reason names the breaker. Then verify `doctor` reports it — that is the operator-facing half.

```bash
git commit -m "fix(fleet): a tripped breaker halts, closes #638"
```

---

### Task 9: Labels re-read at dispatch time (issue #639)

**Files:** Modify `orchestrator/src/tick.ts`; test in `tests/orchestrator/tick-live.test.ts`.

- [ ] **Steps**

`source.ts`'s docstring promises labels are read at dispatch time; `tick` reads them once during selection. Under live dispatch a worker runs for many minutes, so a human adding `needs-human` mid-pass has no effect. Re-read immediately before each dispatch and re-apply `judge`. Test: labels that gain a veto between selection and dispatch cause the item to be skipped, with a rejection recorded.

```bash
git commit -m "fix(fleet): re-read labels at dispatch time, closes #639"
```

---

### Task 10: Digest and notification

**Files:**
- Create: `orchestrator/src/digest.ts`, `orchestrator/src/notify.ts`
- Create: `orchestrator/systemd/llamenos-fleet-digest.{service,timer}`
- Test: `tests/orchestrator/digest.test.ts`

**Interfaces:**
- Produces: `renderDigest(input): string`, `rejectionHistogram(rejections): {reason, count}[]`, `notify(subject, body)`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('rejectionHistogram', () => {
  it('dedupes by item so one item counts once', () => {
    const h = rejectionHistogram([
      { id: '1', reason: 'other-lane' }, { id: '1', reason: 'other-lane' },
      { id: '1', reason: 'body-too-short' },
    ])
    expect(h.reduce((n, r) => n + r.count, 0)).toBe(1)
  })
  it('reports the most specific reason, not other-lane', () => {
    const h = rejectionHistogram([{ id: '1', reason: 'other-lane' }, { id: '1', reason: 'vetoed' }])
    expect(h[0]?.reason).toBe('vetoed')
  })
  it('omits an item whose only reason is other-lane', () => {
    expect(rejectionHistogram([{ id: '1', reason: 'other-lane' }])).toEqual([])
  })
})
```

This is issue #641: the first real shadow pass produced **17 rejections for 3 issues**, because every lane rejects every item that is not its own. A digest reporting "17 not picked up" over a 3-item backlog actively misleads — and that histogram is the signal meant to catch a silently broken fleet.

- [ ] **Step 2–4: Fail, implement, pass**

The digest must carry: a halt banner **with the literal resume command**, lane modes, an outcome histogram, recent runs, what is waiting on a human, and the deduped rejection histogram. Atlas shipped a digest instructing operators to run a command that had never been installed — at the exact moment everything was halted. Assert in a test that the resume command the digest prints actually exists on disk.

`notify` has two best-effort sinks and neither may halt or retry the pass.

```bash
git commit -m "feat(fleet): digest with deduped rejection telemetry, closes #641"
```

---

### Task 11: Revert (spec rail 5)

**Files:** Modify `orchestrator/src/cli.ts`; test in `tests/orchestrator/cli.test.ts`.

- [ ] **Steps**

`llamenos-fleet revert <runId>`: look the run up in the ledger, `gh pr close --delete-branch`, remove the worktree, delete the branch. It does **not** re-label the issue — a human decides what the item's state should be. Merges are `--squash` precisely so this is one commit.

```bash
git commit -m "feat(fleet): rehearsed revert"
```

---

### Task 12: The ramp

**Files:** `orchestrator/README.md`, `~/.llamenos-fleet/lanes.json` (not in git).

- [ ] **Step 1: One shadow pass across all six lanes.** Confirm `attempted: 0` and that the rejection histogram is now sane.

- [ ] **Step 2: One lane live, cap 1, one issue.** Put `infra` live with exactly one `agent-dispatchable` issue. Watch the whole path: dispatch → worktree → PR → mechanical verify → second opinion → merge gate. **Expect it to stop at the gate** rather than merge, and confirm why.

- [ ] **Step 3: Verify the kill switch under load.** With a worker in flight, `llamenos-fleet halt "testing"`. Confirm the next pass does not dispatch and the digest shows the halt banner. Then `resume` and confirm the breaker does not immediately re-trip — that is the bug the resume marker exists for.

- [ ] **Step 4: All six lanes live, cap 1.** Only after steps 2 and 3 pass.

- [ ] **Step 5: Return every lane to `off`** and record in the README exactly what was observed at each step.

**Do not skip step 3.** A kill switch that has never been tested against a running worker is a claim, not a control.

---

## Done when

- `bun run test:fleet` passes, including every new guard.
- A live pass dispatches a real worker, verifies its diff mechanically and on a different engine, and stops at the merge gate for a high-impact change.
- A tripped breaker halts, and `doctor` says so.
- The digest's rejection histogram reports one entry per item.
- `halt` stops a pass with a worker in flight; `resume` does not immediately re-trip.
- Every lane is returned to `off`.
