# Llámenos Fleet Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the unattended dispatch core so that `llamenos-fleet tick` completes a **shadow pass** — reading work from GitHub, claiming it per lane, and reporting exactly what it would have dispatched, without dispatching anything.

**Architecture:** One concern per file under `orchestrator/`. Pure decision functions (`judge`, `destinationFor`, `classifyImpact`, breaker predicates) take no I/O and are tested directly; all I/O sits behind `WorkSource`/`WorkSink` ports over the `gh` CLI. The tick loop's *order* is the safety property: lock → halt → breakers → read → claim → per-dispatch halt re-check.

**Tech Stack:** TypeScript (strict, no `any`), Bun runtime, vitest 4 for tests, `gh` CLI for GitHub, systemd user timers for scheduling.

**Spec:** `docs/superpowers/specs/2026-09-11-llamenos-fleet-orchestrator-design.md`

**Reference implementation:** `translatemd/orchestrator/src/` — a working system of the same shape, 3,261 lines. Several tasks are *ports* of a named file. When a task says "port", read the reference file first; its comments record the specific production failures each guard exists to prevent, and those comments must survive the port.

## Global Constraints

- **This repo has exactly one remote, and that is an invariant.** `origin` →
  `git@github.com:rhonda-rodododo/llamenos-platform.git`. Extra remotes were
  removed on 2026-09-11 because `gh` exits with "multiple remotes detected"
  when more than one is present — a failure that reads at a call site like an
  auth or network problem. Every `gh` call still goes through the wrapper and
  is still pinned with `-R`, as defence in depth, and `doctor` asserts the
  single-remote invariant so drift is caught rather than debugged.
- **No `any`.** CLAUDE.md forbids it. Use `unknown` plus narrowing at boundaries.
- **A source read that fails returns `undefined`, never `[]`.** An empty backlog and an unreadable backlog must be distinguishable at every layer. A pass that cannot read its source aborts.
- **All fleet state lives under `~/.llamenos-fleet/`.** Never write state into the repo except worktrees at `.fleet-worktrees/` (gitignored).
- **Every lane's initial mode is `off`.** Modes live in runtime state at
  `~/.llamenos-fleet/lanes.json`, never in `config.ts` — `orchestrator/` is
  human-gated, and a dial that needs a reviewed PR to turn is not a dial.
  An absent or unparseable file means every lane is off.
- **Rail 8 is enforced, not just tested.** `loadLanes()` throws if any
  non-`off` lane has an empty `owned` list.
- **`orchestrator/` and `tests/orchestrator/` are high-impact**; the fleet may never merge changes to them. Encode this in `impact.ts` from the first version.
- **Workers never receive store, signing, deploy, or telephony credentials.**
- Tests live in `tests/orchestrator/` and run via `bun run test:fleet`.

---

### Task 1: Scaffold, constants, and the repo guard

**Files:**
- Create: `orchestrator/src/gh.ts`
- Create: `orchestrator/src/paths.ts`
- Create: `vitest.orchestrator.config.ts`
- Create: `tests/orchestrator/gh.test.ts`
- Modify: `package.json` (add `test:fleet` script)
- Modify: `.gitignore` (add `.fleet-worktrees/`)

**Interfaces:**
- Produces: `REPO` (const string), `gh(args: string[]): Promise<string>`, `ghJson<T>(args: string[]): Promise<T | undefined>`, and from `paths.ts`: `FLEET_DIR`, `LOCK_FILE`, `LEDGER_FILE`, `HALT_FILE`, `HALT_REASON_FILE`, `RESUMED_AT_FILE`, `LOG_FILE`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestrator/gh.test.ts
import { describe, it, expect } from 'vitest'
import { REPO, ghArgs } from '../../orchestrator/src/gh.js'

describe('gh', () => {
  it('pins the repo on every invocation', () => {
    expect(REPO).toBe('rhonda-rodododo/llamenos-platform')
    expect(ghArgs(['issue', 'list'])).toEqual(['issue', 'list', '-R', REPO])
  })

  it('does not duplicate an explicit -R', () => {
    expect(ghArgs(['issue', 'list', '-R', 'other/repo'])).toEqual(['issue', 'list', '-R', 'other/repo'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --config vitest.orchestrator.config.ts tests/orchestrator/gh.test.ts`
Expected: FAIL — cannot resolve `orchestrator/src/gh.js`.

- [ ] **Step 3: Write the implementation**

```ts
// orchestrator/src/gh.ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * The repo is pinned rather than inferred. A second git remote makes every `gh`
 * invocation exit with "multiple remotes detected", which reads at a call site
 * like an auth or network failure rather than a configuration one. This repo is
 * meant to have exactly one remote (asserted by `doctor`); the pin means a
 * violation cannot silently retarget the fleet at another repository.
 */
export const REPO = 'rhonda-rodododo/llamenos-platform'

export function ghArgs(args: string[]): string[] {
  return args.includes('-R') || args.includes('--repo') ? args : [...args, '-R', REPO]
}

/** Runs gh by argv — never through a shell. Returns stdout. Throws on non-zero exit. */
export async function gh(args: string[], timeoutMs = 60_000): Promise<string> {
  const { stdout } = await execFileAsync('gh', ghArgs(args), {
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  })
  return stdout
}

/**
 * Returns `undefined` on ANY failure — never an empty array or null. Callers
 * must be able to tell "nothing there" from "could not look". Collapsing those
 * two is how a fleet reports a quiet night over a full backlog.
 */
export async function ghJson<T>(args: string[], timeoutMs = 60_000): Promise<T | undefined> {
  try {
    const out = await gh(args, timeoutMs)
    return JSON.parse(out) as T
  } catch {
    return undefined
  }
}
```

```ts
// orchestrator/src/paths.ts
import { homedir } from 'node:os'
import { join } from 'node:path'

export const FLEET_DIR = join(homedir(), '.llamenos-fleet')
export const LOCK_FILE = join(FLEET_DIR, 'scheduler.lock')
export const LEDGER_FILE = join(FLEET_DIR, 'runs.jsonl')
export const HALT_REASON_FILE = join(FLEET_DIR, 'halt-reason.txt')
export const RESUMED_AT_FILE = join(FLEET_DIR, 'resumed-at')
export const LOG_FILE = join(FLEET_DIR, 'fleet.log')

/** Deliberately in $HOME, not FLEET_DIR: it must be creatable with `touch` by a
 *  human who does not know where the fleet keeps its state. */
export const HALT_FILE = join(homedir(), '.llamenos-fleet-disabled')
```

```ts
// vitest.orchestrator.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'fleet',
    include: ['tests/orchestrator/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
})
```

- [ ] **Step 4: Wire the script and ignore**

In `package.json` scripts add:
```json
"test:fleet": "bunx vitest run --config vitest.orchestrator.config.ts",
```
Append to `.gitignore`:
```
.fleet-worktrees/
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test:fleet`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add orchestrator/src/gh.ts orchestrator/src/paths.ts vitest.orchestrator.config.ts \
        tests/orchestrator/gh.test.ts package.json .gitignore
git commit -m "feat(fleet): scaffold orchestrator with repo-pinned gh wrapper"
```

---

### Task 2: Generate lane scope paths from agent fragments

This is the task that makes the scope breaker trustworthy: the paths a lane may
write are derived from the same fragment that briefs its workers, so the two
cannot drift.

**Files:**
- Create: `orchestrator/src/fragments.ts`
- Create: `tests/orchestrator/fragments.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseOwnedPaths(markdown: string): { owned: string[]; notOwned: string[] }`, `loadLaneScopes(repoRoot: string): Promise<Record<string, { owned: string[]; notOwned: string[] }>>`.

Fragment format, from `.claude/agents/fragments/ios-supervisor.md`:

```markdown
**Owned paths:**
- `apps/ios/` — SwiftUI app (Sources/, Tests/, Package.swift, project.yml)
- `.github/workflows/ios*.yml` — iOS CI workflows
```

Some fragments also carry a "does NOT own" list in the same shape. Paths are
always the first backticked span on a bullet line.

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestrator/fragments.test.ts
import { describe, it, expect } from 'vitest'
import { parseOwnedPaths } from '../../orchestrator/src/fragments.js'

const IOS = `
## Your Domain

**Owned paths:**
- \`apps/ios/\` — SwiftUI app (Sources/, Tests/, Package.swift)
- \`.github/workflows/ios*.yml\` — iOS CI workflows

**Tech stack:**
- SwiftUI, SPM
`

const DESKTOP = `
**Owned paths:**
- \`apps/desktop/\` — Tauri shell
- \`src/client/\` — React SPA

**Does NOT own:**
- \`tests/features/\` — backend-supervisor owns these
- \`tests/steps/\` — backend-supervisor owns these
`

describe('parseOwnedPaths', () => {
  it('extracts backticked paths from the Owned paths bullets', () => {
    expect(parseOwnedPaths(IOS).owned).toEqual(['apps/ios/', '.github/workflows/ios*.yml'])
  })

  it('stops at the next bold heading', () => {
    expect(parseOwnedPaths(IOS).owned).not.toContain('SwiftUI')
  })

  it('extracts the does-NOT-own list separately', () => {
    const r = parseOwnedPaths(DESKTOP)
    expect(r.owned).toEqual(['apps/desktop/', 'src/client/'])
    expect(r.notOwned).toEqual(['tests/features/', 'tests/steps/'])
  })

  it('returns empty lists rather than throwing on a fragment with no sections', () => {
    expect(parseOwnedPaths('# nothing here')).toEqual({ owned: [], notOwned: [] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:fleet -- tests/orchestrator/fragments.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// orchestrator/src/fragments.ts
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export interface LaneScope {
  owned: string[]
  notOwned: string[]
}

const OWNED_HEADING = /^\*\*Owned paths:\*\*\s*$/
const NOT_OWNED_HEADING = /^\*\*Does NOT own:?\*\*\s*$/i
const ANY_HEADING = /^\*\*.+\*\*\s*$/
const BULLET_PATH = /^[-*]\s+`([^`]+)`/

function collectSection(lines: string[], startIdx: number): string[] {
  const out: string[] = []
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (ANY_HEADING.test(line.trim())) break
    const m = BULLET_PATH.exec(line.trim())
    if (m?.[1]) out.push(m[1])
  }
  return out
}

/**
 * The scope breaker compares a worker's diff against these paths. They come
 * from the same fragment that briefs the worker, so a lane cannot be told it
 * owns something the breaker will then reject — the drift the reference system
 * could not prevent, because there scope lived in config and ownership lived in
 * prompt text.
 */
export function parseOwnedPaths(markdown: string): LaneScope {
  const lines = markdown.split('\n')
  let owned: string[] = []
  let notOwned: string[] = []
  lines.forEach((line, i) => {
    const t = line.trim()
    if (OWNED_HEADING.test(t)) owned = collectSection(lines, i)
    else if (NOT_OWNED_HEADING.test(t)) notOwned = collectSection(lines, i)
  })
  return { owned, notOwned }
}

export async function loadLaneScopes(repoRoot: string): Promise<Record<string, LaneScope>> {
  const dir = join(repoRoot, '.claude', 'agents', 'fragments')
  const files = await readdir(dir)
  const out: Record<string, LaneScope> = {}
  for (const f of files) {
    if (!f.endsWith('-supervisor.md')) continue
    const lane = f.replace(/-supervisor\.md$/, '')
    out[lane] = parseOwnedPaths(await readFile(join(dir, f), 'utf8'))
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:fleet -- tests/orchestrator/fragments.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verify against the real fragments**

Run:
```bash
bun -e "import('./orchestrator/src/fragments.ts').then(async m => console.log(JSON.stringify(await m.loadLaneScopes(process.cwd()), null, 2)))"
```
Expected: six lanes (`ios`, `android`, `desktop`, `backend`, `shared`, `infra`), each with a non-empty `owned` array. **If any lane comes back with an empty `owned` list, stop and fix the parser — a live lane with empty scope is the failure rail 8 exists to prevent.**

- [ ] **Step 6: Commit**

```bash
git add orchestrator/src/fragments.ts tests/orchestrator/fragments.test.ts
git commit -m "feat(fleet): derive lane scope paths from agent fragments"
```

---

### Task 3: Ledger

**Files:**
- Create: `orchestrator/src/ledger.ts`
- Create: `tests/orchestrator/ledger.test.ts`

**Interfaces:**
- Consumes: `paths.ts`.
- Produces: `type Outcome`, `interface RunRecord`, `append(r: RunRecord): void`, `readAll(): RunRecord[]`, `since(ms: number, now?: number): RunRecord[]`, `failedAttemptsFor(itemId: string): number`.

**Port from** `translatemd/orchestrator/src/ledger.ts` (83 lines), renaming `cardId`/`cardName` → `itemId`/`itemName`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestrator/ledger.test.ts
import { describe, it, expect } from 'vitest'
import { parseLedger, failedAttemptsIn, sinceIn, type RunRecord } from '../../orchestrator/src/ledger.js'

const rec = (o: Partial<RunRecord>): RunRecord => ({
  ts: 0, runId: 'r', lane: 'backend', itemId: '1', itemName: 'n',
  engine: 'claude', outcome: 'SUCCESS', ...o,
})

describe('ledger', () => {
  it('survives a truncated final line', () => {
    const good = JSON.stringify(rec({ runId: 'a' }))
    const parsed = parseLedger(good + '\n' + '{"ts":123,"runI')
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.runId).toBe('a')
  })

  it('counts failed attempts back to the most recent success', () => {
    const rows = [
      rec({ itemId: '7', outcome: 'FAILED', ts: 1 }),
      rec({ itemId: '7', outcome: 'SUCCESS', ts: 2 }),
      rec({ itemId: '7', outcome: 'FAILED', ts: 3 }),
      rec({ itemId: '7', outcome: 'FAILED', ts: 4 }),
    ]
    expect(failedAttemptsIn(rows, '7')).toBe(2)
  })

  it('does not count QUOTA as a failed attempt', () => {
    const rows = [rec({ itemId: '7', outcome: 'QUOTA', ts: 1 }), rec({ itemId: '7', outcome: 'FAILED', ts: 2 })]
    expect(failedAttemptsIn(rows, '7')).toBe(1)
  })

  it('ignores DISPATCHED rows when counting attempts', () => {
    const rows = [rec({ itemId: '7', outcome: 'DISPATCHED', ts: 1 }), rec({ itemId: '7', outcome: 'FAILED', ts: 2 })]
    expect(failedAttemptsIn(rows, '7')).toBe(1)
  })

  it('selects rows inside a window relative to an injected now', () => {
    const rows = [rec({ ts: 1000 }), rec({ ts: 5000 })]
    expect(sinceIn(rows, 2000, 6000)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:fleet -- tests/orchestrator/ledger.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// orchestrator/src/ledger.ts
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { LEDGER_FILE } from './paths.js'

/**
 * QUOTA is deliberately not a flavour of FAILED. A provider rate limit is not
 * the fleet misbehaving, and letting it feed the consecutive-failure breaker
 * turns a billing event into a global halt.
 */
export type Outcome =
  | 'DISPATCHED' | 'SUCCESS' | 'FAILED' | 'BLOCKED'
  | 'TIMEOUT' | 'SHADOW' | 'REJECTED' | 'QUOTA'

export interface RunRecord {
  ts: number
  runId: string
  lane: string
  itemId: string
  itemName: string
  engine: string
  branch?: string
  pr?: string
  outcome: Outcome
  note?: string
}

/** JSONL, not SQLite: a truncated final line costs one record; a locked
 *  database wedges every future pass. */
export function parseLedger(text: string): RunRecord[] {
  const out: RunRecord[] = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try { out.push(JSON.parse(t) as RunRecord) } catch { /* truncated tail */ }
  }
  return out
}

export function readAll(): RunRecord[] {
  if (!existsSync(LEDGER_FILE)) return []
  return parseLedger(readFileSync(LEDGER_FILE, 'utf8'))
}

export function append(r: RunRecord): void {
  mkdirSync(dirname(LEDGER_FILE), { recursive: true })
  appendFileSync(LEDGER_FILE, JSON.stringify(r) + '\n')
}

export function sinceIn(rows: RunRecord[], windowMs: number, now: number): RunRecord[] {
  return rows.filter((r) => now - r.ts <= windowMs)
}

export function since(windowMs: number, now = Date.now()): RunRecord[] {
  return sinceIn(readAll(), windowMs, now)
}

const TERMINAL_FAILURES: ReadonlySet<Outcome> = new Set<Outcome>(['FAILED', 'TIMEOUT', 'BLOCKED', 'REJECTED'])

/** Counts backward from the newest record for this item and stops at a SUCCESS. */
export function failedAttemptsIn(rows: RunRecord[], itemId: string): number {
  const mine = rows.filter((r) => r.itemId === itemId).sort((a, b) => b.ts - a.ts)
  let n = 0
  for (const r of mine) {
    if (r.outcome === 'SUCCESS') break
    if (TERMINAL_FAILURES.has(r.outcome)) n++
  }
  return n
}

export function failedAttemptsFor(itemId: string): number {
  return failedAttemptsIn(readAll(), itemId)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:fleet -- tests/orchestrator/ledger.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/ledger.ts tests/orchestrator/ledger.test.ts
git commit -m "feat(fleet): append-only JSONL run ledger"
```

---

### Task 4: Lock — one scheduler

**Files:**
- Create: `orchestrator/src/lock.ts`
- Create: `tests/orchestrator/lock.test.ts`

**Interfaces:**
- Produces: `acquire(): { held: true; release(): void } | { held: false; heldByPid: number }`, `isAlive(pid: number): boolean`.

**Port from** `translatemd/orchestrator/src/lock.ts` (70 lines). Keep the O_EXCL-plus-liveness-probe design and its comment: `flock(2)` was rejected because a stale lock must be recoverable by inspection rather than guesswork.

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestrator/lock.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { acquire } from '../../orchestrator/src/lock.js'
import { LOCK_FILE, FLEET_DIR } from '../../orchestrator/src/paths.js'

afterEach(() => { try { rmSync(LOCK_FILE) } catch { /* absent */ } })

describe('lock', () => {
  it('acquires when free and releases', () => {
    const l = acquire()
    expect(l.held).toBe(true)
    expect(existsSync(LOCK_FILE)).toBe(true)
    if (l.held) l.release()
    expect(existsSync(LOCK_FILE)).toBe(false)
  })

  it('refuses when a live process holds it', () => {
    const first = acquire()
    expect(first.held).toBe(true)
    const second = acquire()
    expect(second.held).toBe(false)
    if (first.held) first.release()
  })

  it('reaps a lock held by a dead pid', () => {
    mkdirSync(FLEET_DIR, { recursive: true })
    writeFileSync(LOCK_FILE, '999999')   // pid that cannot exist
    const l = acquire()
    expect(l.held).toBe(true)
    if (l.held) l.release()
  })

  it('does not release a lock another process now owns', () => {
    const l = acquire()
    writeFileSync(LOCK_FILE, '999999')   // someone else took over
    if (l.held) l.release()
    expect(existsSync(LOCK_FILE)).toBe(true)
    rmSync(LOCK_FILE)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:fleet -- tests/orchestrator/lock.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// orchestrator/src/lock.ts
import { openSync, writeSync, closeSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { FLEET_DIR, LOCK_FILE } from './paths.js'

export type Lock = { held: true; release(): void } | { held: false; heldByPid: number }

export function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

/**
 * A pidfile with an explicit liveness probe, not flock(2): a stale lock must be
 * recoverable by looking at it, not by guessing which process died.
 */
export function acquire(): Lock {
  mkdirSync(FLEET_DIR, { recursive: true })
  try {
    const fd = openSync(LOCK_FILE, 'wx')      // O_CREAT | O_EXCL
    writeSync(fd, String(process.pid))
    closeSync(fd)
    return { held: true, release: releaseIfMine }
  } catch {
    const holder = Number.parseInt(safeRead(LOCK_FILE), 10)
    if (Number.isFinite(holder) && isAlive(holder)) return { held: false, heldByPid: holder }
    rmSync(LOCK_FILE, { force: true })        // stale — reap and retry once
    return acquire()
  }
}

function safeRead(p: string): string {
  try { return readFileSync(p, 'utf8').trim() } catch { return '' }
}

/** Re-reads the pid before deleting: never remove a lock someone else now holds. */
function releaseIfMine(): void {
  if (!existsSync(LOCK_FILE)) return
  if (safeRead(LOCK_FILE) !== String(process.pid)) return
  rmSync(LOCK_FILE, { force: true })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:fleet -- tests/orchestrator/lock.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/lock.ts tests/orchestrator/lock.test.ts
git commit -m "feat(fleet): single-scheduler pidfile lock with liveness probe"
```

---

### Task 5: Kill switch

**Files:**
- Create: `orchestrator/src/killswitch.ts`
- Create: `tests/orchestrator/killswitch.test.ts`

**Interfaces:**
- Consumes: `paths.ts`, `gh.ts`.
- Produces: `haltedLocally(): boolean`, `haltedOnGitHub(): Promise<boolean>`, `checkHalt(): Promise<{ halted: boolean; reason?: string }>`, `halt(reason: string): void`, `resume(): void`.

**The two switches fail in opposite directions, on purpose.** The local file fails **closed** (present means stop, and its presence needs no network). The GitHub switch fails **open**: if the API cannot be read we do not treat that as a halt, because failing closed would make every GitHub outage an invisible full stop that looks identical to a quiet night.

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestrator/killswitch.test.ts
import { describe, it, expect } from 'vitest'
import { haltedOnGitHubFrom } from '../../orchestrator/src/killswitch.js'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

describe('haltedOnGitHubFrom', () => {
  it('halts when an open issue carries the halt label', () => {
    expect(haltedOnGitHubFrom([{ number: 1, title: '🛑 HALT ALL AGENTS', labels: [{ name: 'halt' }], state: 'OPEN' }])).toBe(true)
  })

  it('does not halt on a closed halt issue', () => {
    expect(haltedOnGitHubFrom([{ number: 1, title: '🛑 HALT ALL AGENTS', labels: [{ name: 'halt' }], state: 'CLOSED' }])).toBe(false)
  })

  it('does not halt on the title alone without the label', () => {
    expect(haltedOnGitHubFrom([{ number: 1, title: '🛑 HALT ALL AGENTS', labels: [], state: 'OPEN' }])).toBe(false)
  })

  it('fails OPEN on an unreadable response', () => {
    expect(haltedOnGitHubFrom(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:fleet -- tests/orchestrator/killswitch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// orchestrator/src/killswitch.ts
import { existsSync, writeFileSync, rmSync, readFileSync, mkdirSync } from 'node:fs'
import { FLEET_DIR, HALT_FILE, HALT_REASON_FILE, RESUMED_AT_FILE } from './paths.js'
import { ghJson } from './gh.js'

export const HALT_LABEL = 'halt'

export interface GhIssue {
  number: number
  title: string
  state: string
  labels: { name: string }[]
}

/** Fails CLOSED: a file that exists stops the fleet, and needs no network. */
export function haltedLocally(): boolean {
  return existsSync(HALT_FILE)
}

/**
 * Fails OPEN, deliberately. `undefined` means we could not read GitHub, and
 * treating that as a halt would make any API outage an invisible full stop
 * indistinguishable from a quiet night. The local file is the switch that
 * fails closed; this one is the switch that works from a phone.
 */
export function haltedOnGitHubFrom(issues: GhIssue[] | undefined): boolean {
  if (issues === undefined) return false
  return issues.some((i) => i.state === 'OPEN' && i.labels.some((l) => l.name === HALT_LABEL))
}

export async function haltedOnGitHub(): Promise<boolean> {
  const issues = await ghJson<GhIssue[]>([
    'issue', 'list', '--label', HALT_LABEL, '--state', 'open',
    '--json', 'number,title,state,labels',
  ])
  return haltedOnGitHubFrom(issues)
}

export async function checkHalt(): Promise<{ halted: boolean; reason?: string }> {
  if (haltedLocally()) {
    const reason = existsSync(HALT_REASON_FILE) ? readFileSync(HALT_REASON_FILE, 'utf8').trim() : 'halt file present'
    return { halted: true, reason }
  }
  if (await haltedOnGitHub()) return { halted: true, reason: `open issue labelled "${HALT_LABEL}"` }
  return { halted: false }
}

/** Breakers call this too: one halted state, one recovery path, no second
 *  "soft halt" that a human cannot clear the same way. */
export function halt(reason: string): void {
  mkdirSync(FLEET_DIR, { recursive: true })
  writeFileSync(HALT_FILE, '')
  writeFileSync(HALT_REASON_FILE, reason)
}

export function resume(): void {
  rmSync(HALT_FILE, { force: true })
  rmSync(HALT_REASON_FILE, { force: true })
  mkdirSync(FLEET_DIR, { recursive: true })
  writeFileSync(RESUMED_AT_FILE, String(Date.now()))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:fleet -- tests/orchestrator/killswitch.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/killswitch.ts tests/orchestrator/killswitch.test.ts
git commit -m "feat(fleet): file and GitHub kill switches with opposite failure modes"
```

---

### Task 6: Circuit breakers

**Files:**
- Create: `orchestrator/src/circuit.ts`
- Create: `tests/orchestrator/circuit.test.ts`

**Interfaces:**
- Consumes: `ledger.ts` (`RunRecord`, `Outcome`), `killswitch.ts` (`halt`).
- Produces: `rateBreaker(rows, limits, now): string | undefined`, `failureBreaker(rows, limits, resumedAt): string | undefined`, `checkBreakers(rows, limits, now, resumedAt): string | undefined`, `inQuotaCooldown(rows, lane, now): boolean`.

**The resume marker is not optional.** Without it, `resume` is a no-op that looks like it worked: the three failures that tripped the breaker are still the newest records, so the very next pass re-trips and the fleet deadlocks. `sinceResume` takes `resumedAt` as a **required parameter** so a pure function cannot silently consult the disk.

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestrator/circuit.test.ts
import { describe, it, expect } from 'vitest'
import { rateBreaker, failureBreaker, inQuotaCooldown } from '../../orchestrator/src/circuit.js'
import type { RunRecord, Outcome } from '../../orchestrator/src/ledger.js'

const LIMITS = { maxDispatchesPerHour: 6, consecutiveFailuresToHalt: 3, quotaCooldownMs: 3_600_000 }
const r = (outcome: Outcome, ts: number, lane = 'backend'): RunRecord =>
  ({ ts, runId: 'x', lane, itemId: '1', itemName: 'n', engine: 'claude', outcome })

describe('rateBreaker', () => {
  it('trips above the hourly dispatch ceiling', () => {
    const rows = Array.from({ length: 7 }, (_, i) => r('DISPATCHED', 1000 + i))
    expect(rateBreaker(rows, LIMITS, 2000)).toMatch(/dispatch rate/i)
  })
  it('does not trip at the ceiling', () => {
    const rows = Array.from({ length: 6 }, (_, i) => r('DISPATCHED', 1000 + i))
    expect(rateBreaker(rows, LIMITS, 2000)).toBeUndefined()
  })
  it('ignores dispatches older than the window', () => {
    const rows = Array.from({ length: 20 }, (_, i) => r('DISPATCHED', i))
    expect(rateBreaker(rows, LIMITS, 10_000_000)).toBeUndefined()
  })
})

describe('failureBreaker', () => {
  it('trips on three consecutive terminal failures', () => {
    const rows = [r('FAILED', 1), r('TIMEOUT', 2), r('FAILED', 3)]
    expect(failureBreaker(rows, LIMITS, 0)).toMatch(/consecutive/i)
  })
  it('does not count QUOTA toward the failure streak', () => {
    const rows = [r('FAILED', 1), r('QUOTA', 2), r('FAILED', 3)]
    expect(failureBreaker(rows, LIMITS, 0)).toBeUndefined()
  })
  it('resets the streak on a success', () => {
    const rows = [r('FAILED', 1), r('FAILED', 2), r('SUCCESS', 3), r('FAILED', 4)]
    expect(failureBreaker(rows, LIMITS, 0)).toBeUndefined()
  })
  it('ignores failures recorded before the resume marker', () => {
    const rows = [r('FAILED', 1), r('FAILED', 2), r('FAILED', 3)]
    expect(failureBreaker(rows, LIMITS, 100)).toBeUndefined()
  })
})

describe('inQuotaCooldown', () => {
  it('sits the lane out after a quota outcome', () => {
    expect(inQuotaCooldown([r('QUOTA', 1000, 'ios')], 'ios', 1000 + 60_000)).toBe(true)
  })
  it('releases the lane after the cooldown', () => {
    expect(inQuotaCooldown([r('QUOTA', 1000, 'ios')], 'ios', 1000 + 3_700_000)).toBe(false)
  })
  it('is per-lane, not global', () => {
    expect(inQuotaCooldown([r('QUOTA', 1000, 'ios')], 'backend', 1000 + 60_000)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:fleet -- tests/orchestrator/circuit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// orchestrator/src/circuit.ts
import { existsSync, readFileSync } from 'node:fs'
import { RESUMED_AT_FILE } from './paths.js'
import type { Outcome, RunRecord } from './ledger.js'

export interface Limits {
  maxDispatchesPerHour: number
  consecutiveFailuresToHalt: number
  quotaCooldownMs: number
}

const HOUR = 3_600_000

/** QUOTA is excluded: a provider rate limit is not the fleet misbehaving. */
const STREAK_FAILURES: ReadonlySet<Outcome> = new Set<Outcome>(['FAILED', 'TIMEOUT'])
const STREAK_RESETS: ReadonlySet<Outcome> = new Set<Outcome>(['SUCCESS', 'SHADOW'])

export function rateBreaker(rows: RunRecord[], limits: Limits, now: number): string | undefined {
  const n = rows.filter((x) => x.outcome === 'DISPATCHED' && now - x.ts <= HOUR).length
  return n > limits.maxDispatchesPerHour
    ? `dispatch rate ${n}/h exceeds ceiling of ${limits.maxDispatchesPerHour}`
    : undefined
}

export function failureBreaker(rows: RunRecord[], limits: Limits, resumedAt: number): string | undefined {
  const considered = rows
    .filter((x) => x.ts > resumedAt)
    .filter((x) => STREAK_FAILURES.has(x.outcome) || STREAK_RESETS.has(x.outcome))
    .sort((a, b) => b.ts - a.ts)
  let streak = 0
  for (const x of considered) {
    if (STREAK_RESETS.has(x.outcome)) break
    streak++
  }
  return streak >= limits.consecutiveFailuresToHalt
    ? `${streak} consecutive failures since last success`
    : undefined
}

export function readResumedAt(): number {
  if (!existsSync(RESUMED_AT_FILE)) return 0
  const n = Number.parseInt(readFileSync(RESUMED_AT_FILE, 'utf8').trim(), 10)
  return Number.isFinite(n) ? n : 0
}

export function checkBreakers(rows: RunRecord[], limits: Limits, now: number, resumedAt: number): string | undefined {
  return rateBreaker(rows, limits, now) ?? failureBreaker(rows, limits, resumedAt)
}

/** Lane-level backoff instead of a global halt: one provider's quota should not
 *  stop five other lanes that use a different one. */
export function inQuotaCooldown(rows: RunRecord[], lane: string, now: number, cooldownMs = HOUR): boolean {
  const last = rows.filter((x) => x.lane === lane && x.outcome === 'QUOTA').sort((a, b) => b.ts - a.ts)[0]
  return last !== undefined && now - last.ts < cooldownMs
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:fleet -- tests/orchestrator/circuit.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/circuit.ts tests/orchestrator/circuit.test.ts
git commit -m "feat(fleet): rate, failure and per-lane quota breakers"
```

---

### Task 7: Impact classification

**Files:**
- Create: `orchestrator/src/impact.ts`
- Create: `tests/orchestrator/impact.test.ts`

**Interfaces:**
- Produces: `classifyImpact(changedFiles: string[], addedLines: number): { impact: 'low' | 'high'; reasons: string[] }`, `HIGH_IMPACT_PATHS`.

The axis is **how expensive it is to be wrong**, never how confident the agent sounds.

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestrator/impact.test.ts
import { describe, it, expect } from 'vitest'
import { classifyImpact } from '../../orchestrator/src/impact.js'

describe('classifyImpact', () => {
  it('treats ordinary code as low impact', () => {
    expect(classifyImpact(['src/client/components/Button.tsx'], 20).impact).toBe('low')
  })

  it.each([
    ['packages/crypto/src/hpke.rs'],
    ['packages/protocol/schemas/note.ts'],
    ['packages/protocol/crypto-labels.json'],
    ['apps/worker/lib/auth.ts'],
    ['apps/worker/db/migrations/0042_x.sql'],
    ['.github/workflows/ci.yml'],
    ['deploy/helm/llamenos/values.yaml'],
    ['apps/ios/fastlane/Fastfile'],
    ['apps/android/keystore.properties'],
    ['orchestrator/src/tick.ts'],
    ['tests/orchestrator/impact.test.ts'],
  ])('treats %s as high impact', (f) => {
    expect(classifyImpact([f], 5).impact).toBe('high')
  })

  it('escalates on a large file count regardless of content', () => {
    const files = Array.from({ length: 41 }, (_, i) => `src/client/x${i}.ts`)
    const r = classifyImpact(files, 100)
    expect(r.impact).toBe('high')
    expect(r.reasons.join(' ')).toMatch(/41 files/)
  })

  it('escalates on a large line count regardless of content', () => {
    const r = classifyImpact(['src/client/a.ts'], 1501)
    expect(r.impact).toBe('high')
    expect(r.reasons.join(' ')).toMatch(/1501 lines/)
  })

  it('gives a reason for every high-impact verdict', () => {
    expect(classifyImpact(['packages/crypto/src/lib.rs'], 5).reasons.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:fleet -- tests/orchestrator/impact.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// orchestrator/src/impact.ts
export const LARGE_DIFF_FILES = 40
export const LARGE_DIFF_LINES = 1500

/**
 * Each entry is here because a mistake behind it is expensive in a way CI does
 * not catch. Crypto and protocol: a quiet error becomes an identity disclosure,
 * which is the whole threat model. Auth and migrations: state a revert does not
 * restore. CI, deploy, store and signing config: changes what ships, to whom.
 * orchestrator/ and its tests: a defect there disables the checks that would
 * have caught it, and weakening its tests is the same hazard by a shorter route.
 */
export const HIGH_IMPACT_PATHS: readonly string[] = [
  'packages/crypto/',
  'packages/protocol/schemas/',
  'packages/protocol/crypto-labels.json',
  'apps/worker/lib/auth',
  'apps/worker/lib/webauthn',
  'apps/worker/lib/session',
  'apps/worker/db/migrations/',
  '.github/workflows/',
  'deploy/',
  'apps/ios/fastlane/',
  'apps/android/fastlane/',
  'apps/android/keystore',
  'apps/desktop/tauri.conf.json',
  'orchestrator/',
  'tests/orchestrator/',
]

export function classifyImpact(
  changedFiles: string[],
  addedLines: number,
): { impact: 'low' | 'high'; reasons: string[] } {
  const reasons: string[] = []
  for (const f of changedFiles) {
    const hit = HIGH_IMPACT_PATHS.find((p) => f.startsWith(p) || f.includes(`/${p}`))
    if (hit) reasons.push(`${f} is under high-impact path ${hit}`)
  }
  if (changedFiles.length > LARGE_DIFF_FILES) {
    reasons.push(`${changedFiles.length} files exceeds the ${LARGE_DIFF_FILES}-file review threshold`)
  }
  if (addedLines > LARGE_DIFF_LINES) {
    reasons.push(`${addedLines} lines exceeds the ${LARGE_DIFF_LINES}-line review threshold`)
  }
  return { impact: reasons.length > 0 ? 'high' : 'low', reasons }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:fleet -- tests/orchestrator/impact.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/impact.ts tests/orchestrator/impact.test.ts
git commit -m "feat(fleet): impact classifier gating who may merge what"
```

---

### Task 8: Scope enforcement

**Files:**
- Create: `orchestrator/src/scope.ts`
- Create: `tests/orchestrator/scope.test.ts`

**Interfaces:**
- Consumes: `fragments.ts` (`LaneScope`).
- Produces: `checkScope(changed: string[], scope: LaneScope, neverWrite: string[]): { forbidden: string[]; strayed: string[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestrator/scope.test.ts
import { describe, it, expect } from 'vitest'
import { checkScope } from '../../orchestrator/src/scope.js'

const IOS = { owned: ['apps/ios/', '.github/workflows/ios'], notOwned: ['apps/ios/generated/'] }
const NEVER = ['.env', 'deploy/', '.github/workflows/']

describe('checkScope', () => {
  it('passes a diff entirely inside the lane', () => {
    expect(checkScope(['apps/ios/Sources/App.swift'], IOS, [])).toEqual({ forbidden: [], strayed: [] })
  })

  it('flags a file outside the lane as strayed', () => {
    expect(checkScope(['apps/android/x.kt'], IOS, []).strayed).toEqual(['apps/android/x.kt'])
  })

  it('flags a never-write path as forbidden even when the lane owns it', () => {
    const r = checkScope(['.github/workflows/ios-e2e.yml'], IOS, NEVER)
    expect(r.forbidden).toEqual(['.github/workflows/ios-e2e.yml'])
  })

  it('flags does-NOT-own paths as strayed even under an owned prefix', () => {
    expect(checkScope(['apps/ios/generated/Types.swift'], IOS, []).strayed)
      .toEqual(['apps/ios/generated/Types.swift'])
  })

  it('enforces never-write even for an unrestricted lane', () => {
    const r = checkScope(['.env'], { owned: [], notOwned: [] }, NEVER)
    expect(r.forbidden).toEqual(['.env'])
  })

  it('reports every offending file, not just the first', () => {
    const r = checkScope(['apps/android/a.kt', 'src/client/b.ts'], IOS, [])
    expect(r.strayed).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:fleet -- tests/orchestrator/scope.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// orchestrator/src/scope.ts
import type { LaneScope } from './fragments.js'

function underAny(file: string, prefixes: string[]): boolean {
  return prefixes.some((p) => file === p || file.startsWith(p))
}

/**
 * `forbidden` is absolute — the never-write list binds even a lane with an
 * empty `owned` array, so an unrestricted lane still cannot touch secrets,
 * deploy config or CI. `strayed` is lane-relative.
 */
export function checkScope(
  changed: string[],
  scope: LaneScope,
  neverWrite: string[],
): { forbidden: string[]; strayed: string[] } {
  const forbidden: string[] = []
  const strayed: string[] = []
  for (const f of changed) {
    if (underAny(f, neverWrite)) { forbidden.push(f); continue }
    if (underAny(f, scope.notOwned)) { strayed.push(f); continue }
    if (scope.owned.length > 0 && !underAny(f, scope.owned)) strayed.push(f)
  }
  return { forbidden, strayed }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:fleet -- tests/orchestrator/scope.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/scope.ts tests/orchestrator/scope.test.ts
git commit -m "feat(fleet): lane scope and never-write enforcement over diffs"
```

---

### Task 9: Config — lanes, roles, limits

**Files:**
- Create: `orchestrator/src/config.ts`
- Create: `tests/orchestrator/config.test.ts`

**Interfaces:**
- Consumes: `fragments.ts`, `impact.ts`.
- Produces: `type LaneMode`, `interface Lane`, `LANES: Lane[]`, `LIMITS: Limits`, `NEVER_WRITE_PATHS`, `MAX_ATTEMPTS_PER_ITEM`, `PROJECT_COLUMNS`, `loadLanes(repoRoot): Promise<Lane[]>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestrator/config.test.ts
import { describe, it, expect } from 'vitest'
import { LANES, LIMITS, NEVER_WRITE_PATHS, MAX_ATTEMPTS_PER_ITEM, assertLiveLanesHaveScope } from '../../orchestrator/src/config.js'
import type { Lane } from '../../orchestrator/src/config.js'

describe('assertLiveLanesHaveScope', () => {
  const lane = (mode: Lane['mode'], owned: string[]): Lane => ({
    id: 'ios', mode, cap: 1, engine: 'claude',
    requireLabel: 'agent-dispatchable', vetoLabels: [],
    scope: { owned, notOwned: [] },
  })

  it('throws when a live lane has no owned paths', () => {
    expect(() => assertLiveLanesHaveScope([lane('live', [])])).toThrow(/no owned paths|write scope/i)
  })

  it('throws when a shadow lane has no owned paths', () => {
    expect(() => assertLiveLanesHaveScope([lane('shadow', [])])).toThrow()
  })

  it('permits an off lane with no owned paths', () => {
    expect(() => assertLiveLanesHaveScope([lane('off', [])])).not.toThrow()
  })

  it('permits a live lane with owned paths', () => {
    expect(() => assertLiveLanesHaveScope([lane('live', ['apps/ios/'])])).not.toThrow()
  })

  it('names the offending lane and its fragment in the error', () => {
    expect(() => assertLiveLanesHaveScope([lane('live', [])]))
      .toThrow(/ios-supervisor\.md/)
  })
})

describe('config', () => {
  it('defines exactly the six domain lanes', () => {
    expect(LANES.map((l) => l.id).sort())
      .toEqual(['android', 'backend', 'desktop', 'infra', 'ios', 'shared'])
  })

  it('defaults every lane to off', () => {
    expect(LANES.every((l) => l.mode === 'off')).toBe(true)
  })

  it('caps every lane at 1', () => {
    expect(LANES.every((l) => l.cap === 1)).toBe(true)
  })

  it('requires a dispatch label on every lane', () => {
    expect(LANES.every((l) => l.requireLabel.length > 0)).toBe(true)
  })

  it('vetoes on needs-human everywhere', () => {
    expect(LANES.every((l) => l.vetoLabels.includes('needs-human'))).toBe(true)
  })

  it('never permits writes to secrets, deploy or CI', () => {
    for (const p of ['.env', 'deploy/', '.github/workflows/']) {
      expect(NEVER_WRITE_PATHS).toContain(p)
    }
  })

  it('gives up on an item after three failed attempts', () => {
    expect(MAX_ATTEMPTS_PER_ITEM).toBe(3)
  })

  it('sets a conservative first-night dispatch ceiling', () => {
    expect(LIMITS.maxDispatchesPerHour).toBeLessThanOrEqual(12)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:fleet -- tests/orchestrator/config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// orchestrator/src/config.ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadLaneScopes, type LaneScope } from './fragments.js'
import { FLEET_DIR } from './paths.js'
import type { Limits } from './circuit.js'

export type LaneMode = 'off' | 'shadow' | 'live'
export type EngineId = 'claude' | 'opencode'

export interface Lane {
  id: string
  mode: LaneMode
  cap: number
  engine: EngineId
  model?: string
  requireLabel: string
  vetoLabels: string[]
  /** Filled by loadLanes() from .claude/agents/fragments/<id>-supervisor.md */
  scope: LaneScope
}

export const LANE_IDS = ['backend', 'shared', 'desktop', 'ios', 'android', 'infra'] as const

/**
 * Lane order is claim priority: the first lane to claim an item owns it, so two
 * workers never race the same issue. `shared` sits high because protocol and
 * crypto changes block the client lanes that consume their codegen.
 */
export const LANES: Lane[] = LANE_IDS.map((id) => ({
  id,
  mode: 'off',                       // DEFAULT only — real mode comes from readLaneModes()
  cap: 1,
  engine: 'claude',
  requireLabel: 'agent-dispatchable',
  vetoLabels: ['needs-human', 'needs-decision', 'blocked', 'needs-info'],
  scope: { owned: [], notOwned: [] },
}))

export const LANE_MODES_FILE = join(FLEET_DIR, 'lanes.json')

/**
 * Modes live in runtime state, NOT in this source file. Two reasons: a dial
 * meant to be turned must not sit behind the merge gate (orchestrator/ is
 * high-impact, so editing it would require a human-gated PR to change a lane
 * from off to shadow), and a mode baked into source makes the "every lane
 * starts off" test false the moment anyone turns one on.
 *
 * Unknown lane ids and unreadable files both yield the default: off.
 */
export function readLaneModes(): Record<string, LaneMode> {
  if (!existsSync(LANE_MODES_FILE)) return {}
  try {
    const raw: unknown = JSON.parse(readFileSync(LANE_MODES_FILE, 'utf8'))
    if (typeof raw !== 'object' || raw === null) return {}
    const out: Record<string, LaneMode> = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v === 'off' || v === 'shadow' || v === 'live') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Rail 8, ENFORCED rather than merely tested. A live lane with an empty owned
 * list gives the scope breaker nothing to compare a diff against — it is not a
 * lane with wide permissions, it is a lane with no permission check at all.
 * Throwing at load is the safe direction: a startup failure beats a silent
 * unscoped dispatch.
 */
export function assertLiveLanesHaveScope(lanes: Lane[]): void {
  for (const l of lanes) {
    if (l.mode !== 'off' && l.scope.owned.length === 0) {
      throw new Error(
        `lane "${l.id}" is ${l.mode} but parsed no owned paths from ` +
        `.claude/agents/fragments/${l.id}-supervisor.md — refusing to run without a write scope`,
      )
    }
  }
}

export async function loadLanes(repoRoot: string): Promise<Lane[]> {
  const scopes = await loadLaneScopes(repoRoot)
  const modes = readLaneModes()
  const lanes = LANES.map((l) => ({
    ...l,
    mode: modes[l.id] ?? l.mode,
    scope: scopes[l.id] ?? { owned: [], notOwned: [] },
  }))
  assertLiveLanesHaveScope(lanes)
  return lanes
}

/** Binds every lane, including one with an empty owned list. */
export const NEVER_WRITE_PATHS: readonly string[] = [
  '.env',
  '.dev.vars',
  'deploy/',
  '.github/workflows/',
  'apps/android/keystore.properties',
]

export const MAX_ATTEMPTS_PER_ITEM = 3

export const LIMITS: Limits = {
  maxDispatchesPerHour: 8,
  consecutiveFailuresToHalt: 3,
  quotaCooldownMs: 3_600_000,
}

export const PROJECT_COLUMNS = {
  next: 'Next-up',
  inProgress: 'In Progress',
  inReview: 'In Review',
  blocked: 'Blocked',
  done: 'Done',
} as const

export const MIN_BODY_CHARS = 200
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:fleet -- tests/orchestrator/config.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/config.ts tests/orchestrator/config.test.ts
git commit -m "feat(fleet): lane, limit and column configuration"
```

---

### Task 10: WorkSource and WorkSink over GitHub

**Files:**
- Create: `orchestrator/src/source.ts`
- Create: `orchestrator/src/sink.ts`
- Create: `tests/orchestrator/source.test.ts`

**Interfaces:**
- Consumes: `gh.ts`, `config.ts`.
- Produces: `interface WorkItem`, `interface WorkSource`, `interface WorkSink`, `GitHubSource`, `GitHubSink`, `toWorkItem(raw): WorkItem`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestrator/source.test.ts
import { describe, it, expect } from 'vitest'
import { toWorkItem, itemsFrom } from '../../orchestrator/src/source.js'

const RAW = {
  number: 42,
  title: 'Fix the thing',
  body: 'x'.repeat(300),
  url: 'https://github.com/o/r/issues/42',
  state: 'OPEN',
  labels: [{ name: 'agent-dispatchable' }, { name: 'lane:ios' }],
}

describe('source', () => {
  it('maps a gh issue onto a WorkItem', () => {
    const item = toWorkItem(RAW)
    expect(item.id).toBe('42')
    expect(item.title).toBe('Fix the thing')
    expect(item.labels).toEqual(['agent-dispatchable', 'lane:ios'])
    expect(item.url).toBe('https://github.com/o/r/issues/42')
  })

  it('tolerates a null body', () => {
    expect(toWorkItem({ ...RAW, body: null }).body).toBe('')
  })

  it('returns undefined — not [] — when the read failed', () => {
    expect(itemsFrom(undefined)).toBeUndefined()
  })

  it('returns an empty array for a genuinely empty backlog', () => {
    expect(itemsFrom([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:fleet -- tests/orchestrator/source.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// orchestrator/src/source.ts
import { ghJson } from './gh.js'

export interface WorkItem {
  id: string
  title: string
  body: string
  url: string
  labels: string[]
}

export interface RawIssue {
  number: number
  title: string
  body: string | null
  url: string
  state: string
  labels: { name: string }[]
}

export interface WorkSource {
  /** `undefined` means the read FAILED. `[]` means the backlog is empty. */
  list(): Promise<WorkItem[] | undefined>
  /** Labels read fresh at dispatch time, never from a cached list. */
  labels(id: string): Promise<string[] | undefined>
}

export function toWorkItem(raw: RawIssue): WorkItem {
  return {
    id: String(raw.number),
    title: raw.title,
    body: raw.body ?? '',
    url: raw.url,
    labels: raw.labels.map((l) => l.name),
  }
}

export function itemsFrom(raw: RawIssue[] | undefined): WorkItem[] | undefined {
  return raw === undefined ? undefined : raw.map(toWorkItem)
}

const FIELDS = 'number,title,body,url,state,labels'

export class GitHubSource implements WorkSource {
  constructor(private readonly requireLabel: string) {}

  async list(): Promise<WorkItem[] | undefined> {
    return itemsFrom(
      await ghJson<RawIssue[]>([
        'issue', 'list', '--state', 'open', '--label', this.requireLabel,
        '--limit', '200', '--json', FIELDS,
      ]),
    )
  }

  /**
   * Read per item at dispatch time. A label list captured during selection can
   * be minutes stale, and "someone added needs-human while we were deciding" is
   * exactly the case the veto exists for.
   */
  async labels(id: string): Promise<string[] | undefined> {
    const raw = await ghJson<{ labels: { name: string }[] }>(['issue', 'view', id, '--json', 'labels'])
    return raw === undefined ? undefined : raw.labels.map((l) => l.name)
  }
}
```

```ts
// orchestrator/src/sink.ts
import { gh } from './gh.js'

export interface WorkSink {
  comment(id: string, body: string): Promise<void>
  addLabel(id: string, label: string): Promise<void>
  removeLabel(id: string, label: string): Promise<void>
}

export class GitHubSink implements WorkSink {
  async comment(id: string, body: string): Promise<void> {
    await gh(['issue', 'comment', id, '--body', body])
  }
  async addLabel(id: string, label: string): Promise<void> {
    await gh(['issue', 'edit', id, '--add-label', label])
  }
  async removeLabel(id: string, label: string): Promise<void> {
    await gh(['issue', 'edit', id, '--remove-label', label])
  }
}

/** Writes nothing. Used for shadow mode so a dry pass cannot mutate the board. */
export class NullSink implements WorkSink {
  async comment(): Promise<void> {}
  async addLabel(): Promise<void> {}
  async removeLabel(): Promise<void> {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:fleet -- tests/orchestrator/source.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/source.ts orchestrator/src/sink.ts tests/orchestrator/source.test.ts
git commit -m "feat(fleet): GitHub work source and sink behind ports"
```

---

### Task 11: Selection — the pure judge

**Files:**
- Create: `orchestrator/src/select.ts`
- Create: `tests/orchestrator/select.test.ts`

**Interfaces:**
- Consumes: `source.ts` (`WorkItem`), `config.ts` (`Lane`, `MIN_BODY_CHARS`).
- Produces: `type Rejection`, `judge(item, labels, lane): { ok: true } | { ok: false; reason: Rejection }`, `selectForLane(items, labelsById, lane): { candidates: WorkItem[]; rejections: { id: string; reason: Rejection }[] }`.

**Rejections are returned, never filtered away.** The digest renders them as a histogram, and that histogram is what catches a fleet that is silently picking up nothing.

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestrator/select.test.ts
import { describe, it, expect } from 'vitest'
import { judge, selectForLane } from '../../orchestrator/src/select.js'
import type { Lane } from '../../orchestrator/src/config.js'
import type { WorkItem } from '../../orchestrator/src/source.js'

const lane: Lane = {
  id: 'ios', mode: 'live', cap: 1, engine: 'claude',
  requireLabel: 'agent-dispatchable',
  vetoLabels: ['needs-human', 'blocked'],
  scope: { owned: ['apps/ios/'], notOwned: [] },
}
const item = (o: Partial<WorkItem> = {}): WorkItem =>
  ({ id: '1', title: 't', body: 'x'.repeat(300), url: 'u', labels: [], ...o })

describe('judge', () => {
  it('accepts a well-formed dispatchable item for its lane', () => {
    expect(judge(item(), ['agent-dispatchable', 'lane:ios'], lane).ok).toBe(true)
  })

  it('rejects an item missing the require label', () => {
    const r = judge(item(), ['lane:ios'], lane)
    expect(r).toEqual({ ok: false, reason: 'missing-require-label' })
  })

  it('rejects an item carrying a veto label even alongside the require label', () => {
    const r = judge(item(), ['agent-dispatchable', 'lane:ios', 'needs-human'], lane)
    expect(r).toEqual({ ok: false, reason: 'vetoed' })
  })

  it('rejects an item labelled for another lane', () => {
    const r = judge(item(), ['agent-dispatchable', 'lane:android'], lane)
    expect(r).toEqual({ ok: false, reason: 'other-lane' })
  })

  it('rejects an under-specified body', () => {
    const r = judge(item({ body: 'too short' }), ['agent-dispatchable', 'lane:ios'], lane)
    expect(r).toEqual({ ok: false, reason: 'body-too-short' })
  })

  it('treats unreadable labels as not dispatchable', () => {
    const r = judge(item(), undefined, lane)
    expect(r).toEqual({ ok: false, reason: 'labels-unreadable' })
  })

  it('checks the veto before the lane match, so a vetoed item never looks routable', () => {
    const r = judge(item(), ['agent-dispatchable', 'lane:android', 'blocked'], lane)
    expect(r).toEqual({ ok: false, reason: 'vetoed' })
  })
})

describe('selectForLane', () => {
  it('returns candidates and rejections together', () => {
    const items = [item({ id: '1', labels: [] }), item({ id: '2' })]
    const labels = new Map([['1', ['agent-dispatchable', 'lane:ios']], ['2', ['lane:ios']]])
    const r = selectForLane(items, labels, lane)
    expect(r.candidates.map((c) => c.id)).toEqual(['1'])
    expect(r.rejections).toEqual([{ id: '2', reason: 'missing-require-label' }])
  })

  it('preserves input order so board priority is honoured', () => {
    const items = [item({ id: '9' }), item({ id: '3' })]
    const labels = new Map([['9', ['agent-dispatchable', 'lane:ios']], ['3', ['agent-dispatchable', 'lane:ios']]])
    expect(selectForLane(items, labels, lane).candidates.map((c) => c.id)).toEqual(['9', '3'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:fleet -- tests/orchestrator/select.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// orchestrator/src/select.ts
import { MIN_BODY_CHARS, type Lane } from './config.js'
import type { WorkItem } from './source.js'

export type Rejection =
  | 'labels-unreadable'
  | 'missing-require-label'
  | 'vetoed'
  | 'other-lane'
  | 'body-too-short'

export type Verdict = { ok: true } | { ok: false; reason: Rejection }

export const LANE_LABEL_PREFIX = 'lane:'

/**
 * Pure: no I/O, no clock. Order matters — the veto is checked before the lane
 * match so an item a human has flagged can never be routed anywhere, and
 * unreadable labels are checked first so a failed read is never mistaken for
 * an absent label.
 */
export function judge(item: WorkItem, labels: string[] | undefined, lane: Lane): Verdict {
  if (labels === undefined) return { ok: false, reason: 'labels-unreadable' }
  if (!labels.includes(lane.requireLabel)) return { ok: false, reason: 'missing-require-label' }
  if (labels.some((l) => lane.vetoLabels.includes(l))) return { ok: false, reason: 'vetoed' }
  if (!labels.includes(`${LANE_LABEL_PREFIX}${lane.id}`)) return { ok: false, reason: 'other-lane' }
  if (item.body.trim().length < MIN_BODY_CHARS) return { ok: false, reason: 'body-too-short' }
  return { ok: true }
}

export function selectForLane(
  items: WorkItem[],
  labelsById: Map<string, string[] | undefined>,
  lane: Lane,
): { candidates: WorkItem[]; rejections: { id: string; reason: Rejection }[] } {
  const candidates: WorkItem[] = []
  const rejections: { id: string; reason: Rejection }[] = []
  for (const item of items) {
    const v = judge(item, labelsById.get(item.id), lane)
    if (v.ok) candidates.push(item)
    else rejections.push({ id: item.id, reason: v.reason })
  }
  return { candidates, rejections }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:fleet -- tests/orchestrator/select.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/select.ts tests/orchestrator/select.test.ts
git commit -m "feat(fleet): pure selection judge with rejection telemetry"
```

---

### Task 12: The tick loop, shadow-capable

**Files:**
- Create: `orchestrator/src/tick.ts`
- Create: `tests/orchestrator/tick.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `interface TickResult`, `interface TickDeps`, `tick(deps: TickDeps): Promise<TickResult>`, `claimAcrossLanes(lanes, itemsByLane): Map<string, string>`.

**The order of operations is the safety property.** Lock, then halt, then breakers, then read, then claim, then — for every single dispatch — check halt again, so a stop lands within one worker rather than one pass.

All I/O arrives through `TickDeps` so the loop is testable without GitHub, a clock, or a filesystem.

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestrator/tick.test.ts
import { describe, it, expect, vi } from 'vitest'
import { tick, claimAcrossLanes, type TickDeps } from '../../orchestrator/src/tick.js'
import type { Lane } from '../../orchestrator/src/config.js'
import type { WorkItem } from '../../orchestrator/src/source.js'

const lane = (id: string, mode: Lane['mode'] = 'shadow'): Lane => ({
  id, mode, cap: 1, engine: 'claude',
  requireLabel: 'agent-dispatchable',
  vetoLabels: ['needs-human'],
  scope: { owned: [`apps/${id}/`], notOwned: [] },
})
const item = (id: string): WorkItem =>
  ({ id, title: `t${id}`, body: 'x'.repeat(300), url: 'u', labels: [] })

function deps(over: Partial<TickDeps> = {}): TickDeps {
  return {
    lanes: [lane('ios')],
    now: () => 1000,
    acquireLock: () => ({ held: true, release: () => {} }),
    checkHalt: async () => ({ halted: false }),
    readLedger: () => [],
    resumedAt: () => 0,
    listItems: async () => [item('1')],
    readLabels: async () => ['agent-dispatchable', 'lane:ios'],
    dispatch: vi.fn(async () => ({ outcome: 'SUCCESS' as const })),
    record: vi.fn(),
    log: () => {},
    ...over,
  }
}

describe('tick', () => {
  it('does nothing when another scheduler holds the lock', async () => {
    const d = deps({ acquireLock: () => ({ held: false, heldByPid: 5 }) })
    const r = await tick(d)
    expect(r.ran).toBe(false)
    expect(d.dispatch).not.toHaveBeenCalled()
  })

  it('does nothing when halted', async () => {
    const d = deps({ checkHalt: async () => ({ halted: true, reason: 'testing' }) })
    const r = await tick(d)
    expect(r.halted).toBe(true)
    expect(d.dispatch).not.toHaveBeenCalled()
  })

  it('aborts the whole pass when the source is unreadable', async () => {
    const d = deps({ listItems: async () => undefined })
    const r = await tick(d)
    expect(r.aborted).toBe('source-unreadable')
    expect(d.dispatch).not.toHaveBeenCalled()
  })

  it('does not dispatch in shadow mode but does record a SHADOW row', async () => {
    const d = deps()
    await tick(d)
    expect(d.dispatch).not.toHaveBeenCalled()
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'SHADOW', lane: 'ios' }))
  })

  it('dispatches in live mode', async () => {
    const d = deps({ lanes: [lane('ios', 'live')] })
    await tick(d)
    expect(d.dispatch).toHaveBeenCalledTimes(1)
  })

  it('skips a lane whose mode is off', async () => {
    const d = deps({ lanes: [lane('ios', 'off')] })
    await tick(d)
    expect(d.record).not.toHaveBeenCalled()
  })

  it('re-checks halt between dispatches and stops mid-pass', async () => {
    let calls = 0
    const d = deps({
      lanes: [lane('ios', 'live')],
      listItems: async () => [item('1'), item('2')],
      checkHalt: async () => { calls++; return { halted: calls > 2 } },
    })
    const d2 = { ...d, lanes: [{ ...lane('ios', 'live'), cap: 5 }] }
    await tick(d2)
    expect((d.dispatch as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThan(2)
  })

  it('honours the per-lane cap', async () => {
    const d = deps({
      lanes: [{ ...lane('ios', 'live'), cap: 1 }],
      listItems: async () => [item('1'), item('2'), item('3')],
    })
    await tick(d)
    expect(d.dispatch).toHaveBeenCalledTimes(1)
  })

  it('records rejections so the digest can explain a quiet pass', async () => {
    const d = deps({ readLabels: async () => ['lane:ios'] })
    const r = await tick(d)
    expect(r.rejections).toEqual([{ id: '1', reason: 'missing-require-label' }])
  })
})

describe('claimAcrossLanes', () => {
  it('gives an item to the first lane in order that can claim it', () => {
    const owned = claimAcrossLanes(
      [lane('backend'), lane('ios')],
      new Map([['backend', [item('1')]], ['ios', [item('1')]]]),
    )
    expect(owned.get('1')).toBe('backend')
  })

  it('never assigns one item to two lanes', () => {
    const owned = claimAcrossLanes(
      [lane('backend'), lane('ios')],
      new Map([['backend', [item('1')]], ['ios', [item('1'), item('2')]]]),
    )
    expect([...owned.entries()].sort()).toEqual([['1', 'backend'], ['2', 'ios']])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:fleet -- tests/orchestrator/tick.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// orchestrator/src/tick.ts
import { checkBreakers } from './circuit.js'
import { LIMITS, MAX_ATTEMPTS_PER_ITEM, type Lane } from './config.js'
import { failedAttemptsIn, type Outcome, type RunRecord } from './ledger.js'
import { selectForLane, type Rejection } from './select.js'
import type { WorkItem } from './source.js'

export interface TickDeps {
  lanes: Lane[]
  now(): number
  acquireLock(): { held: true; release(): void } | { held: false; heldByPid: number }
  checkHalt(): Promise<{ halted: boolean; reason?: string }>
  readLedger(): RunRecord[]
  resumedAt(): number
  listItems(lane: Lane): Promise<WorkItem[] | undefined>
  readLabels(id: string): Promise<string[] | undefined>
  dispatch(item: WorkItem, lane: Lane): Promise<{ outcome: Outcome; note?: string; pr?: string; branch?: string }>
  record(r: RunRecord): void
  log(msg: string): void
}

export interface TickResult {
  ran: boolean
  halted?: boolean
  haltReason?: string
  aborted?: 'source-unreadable' | 'breaker'
  breakerReason?: string
  dispatched: number
  shadowed: number
  rejections: { id: string; reason: Rejection }[]
}

const empty = (over: Partial<TickResult> = {}): TickResult =>
  ({ ran: false, dispatched: 0, shadowed: 0, rejections: [], ...over })

let counter = 0
function runId(now: number): string {
  counter = (counter + 1) % 0xffff
  return `${now.toString(36)}${counter.toString(36).padStart(3, '0')}`
}

/**
 * Lane order is claim priority. The first lane able to claim an item owns it,
 * so two workers never race the same issue — concurrency is prevented here
 * rather than coordinated later.
 */
export function claimAcrossLanes(lanes: Lane[], itemsByLane: Map<string, WorkItem[]>): Map<string, string> {
  const owned = new Map<string, string>()
  for (const lane of lanes) {
    for (const item of itemsByLane.get(lane.id) ?? []) {
      if (!owned.has(item.id)) owned.set(item.id, lane.id)
    }
  }
  return owned
}

export async function tick(deps: TickDeps): Promise<TickResult> {
  const lock = deps.acquireLock()
  if (!lock.held) {
    deps.log(`another scheduler holds the lock (pid ${lock.heldByPid})`)
    return empty()
  }

  try {
    const halt = await deps.checkHalt()
    if (halt.halted) {
      deps.log(`halted: ${halt.reason ?? 'unknown'}`)
      return empty({ ran: true, halted: true, haltReason: halt.reason })
    }

    const rows = deps.readLedger()
    const now = deps.now()
    const tripped = checkBreakers(rows, LIMITS, now, deps.resumedAt())
    if (tripped) {
      deps.log(`breaker tripped: ${tripped}`)
      return empty({ ran: true, aborted: 'breaker', breakerReason: tripped })
    }

    const active = deps.lanes.filter((l) => l.mode !== 'off')
    const itemsByLane = new Map<string, WorkItem[]>()
    const allRejections: { id: string; reason: Rejection }[] = []
    const labelCache = new Map<string, string[] | undefined>()

    for (const lane of active) {
      const items = await deps.listItems(lane)
      // An unreadable source is NOT an empty one. Aborting the whole pass is
      // the only way a credential failure cannot masquerade as a quiet night.
      if (items === undefined) {
        deps.log(`source unreadable for lane ${lane.id} — aborting pass`)
        return empty({ ran: true, aborted: 'source-unreadable' })
      }
      for (const item of items) {
        if (!labelCache.has(item.id)) labelCache.set(item.id, await deps.readLabels(item.id))
      }
      const { candidates, rejections } = selectForLane(items, labelCache, lane)
      itemsByLane.set(lane.id, candidates)
      allRejections.push(...rejections)
    }

    const owned = claimAcrossLanes(active, itemsByLane)
    let dispatched = 0
    let shadowed = 0

    for (const lane of active) {
      let taken = 0
      for (const item of itemsByLane.get(lane.id) ?? []) {
        if (owned.get(item.id) !== lane.id) continue
        if (taken >= lane.cap) break

        if (failedAttemptsIn(rows, item.id) >= MAX_ATTEMPTS_PER_ITEM) {
          deps.log(`item ${item.id} has exhausted ${MAX_ATTEMPTS_PER_ITEM} attempts — leaving for a human`)
          continue
        }

        // Re-checked between EVERY dispatch: a stop lands within one worker,
        // not within one pass.
        const mid = await deps.checkHalt()
        if (mid.halted) {
          deps.log(`halted mid-pass: ${mid.reason ?? 'unknown'}`)
          return { ran: true, halted: true, haltReason: mid.reason, dispatched, shadowed, rejections: allRejections }
        }

        const base = { ts: deps.now(), runId: runId(deps.now()), lane: lane.id, itemId: item.id, itemName: item.title, engine: lane.engine }

        if (lane.mode === 'shadow') {
          deps.record({ ...base, outcome: 'SHADOW', note: `would dispatch to ${lane.id}; scope=${lane.scope.owned.join(',')}` })
          shadowed++
          taken++
          continue
        }

        const result = await deps.dispatch(item, lane)
        deps.record({ ...base, ...result })
        dispatched++
        taken++
      }
    }

    return { ran: true, dispatched, shadowed, rejections: allRejections }
  } finally {
    if (lock.held) lock.release()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:fleet -- tests/orchestrator/tick.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/tick.ts tests/orchestrator/tick.test.ts
git commit -m "feat(fleet): tick loop with shadow mode and mid-pass halt checks"
```

---

### Task 13: Guard tests — the rails, asserted

These are the tests that must fail loudly if a future change weakens a rail.
They are separate from the unit tests on purpose: a reviewer should be able to
read this one file and see every safety property in one place.

**Files:**
- Create: `tests/orchestrator/guards.test.ts`

- [ ] **Step 1: Write the guard tests**

```ts
// tests/orchestrator/guards.test.ts
import { describe, it, expect } from 'vitest'
import { LANES, NEVER_WRITE_PATHS, loadLanes, assertLiveLanesHaveScope } from '../../orchestrator/src/config.js'
import { classifyImpact, HIGH_IMPACT_PATHS } from '../../orchestrator/src/impact.js'
import { checkScope } from '../../orchestrator/src/scope.js'
import { haltedOnGitHubFrom } from '../../orchestrator/src/killswitch.js'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

describe('rail: a live lane must have a write scope', () => {
  // Asserted against a synthetic lane, not the live config: every configured
  // lane defaults to `off`, so looping over them would execute no assertion at
  // all — a test that passes by never running its check.
  it('throws rather than running a live lane with an empty scope', () => {
    expect(() => assertLiveLanesHaveScope([{
      id: 'ios', mode: 'live', cap: 1, engine: 'claude',
      requireLabel: 'agent-dispatchable', vetoLabels: [],
      scope: { owned: [], notOwned: [] },
    }])).toThrow()
  })

  it('parses a non-empty scope for every configured lane', async () => {
    const lanes = await loadLanes(process.cwd())
    for (const l of lanes) {
      expect(l.scope.owned.length, `lane ${l.id} parsed no owned paths from its fragment`).toBeGreaterThan(0)
    }
  })
})

describe('rail: the fleet cannot merge its own changes', () => {
  it('classifies orchestrator source as high impact', () => {
    expect(classifyImpact(['orchestrator/src/tick.ts'], 1).impact).toBe('high')
  })
  it('classifies its own tests as high impact', () => {
    expect(classifyImpact(['tests/orchestrator/guards.test.ts'], 1).impact).toBe('high')
  })
})

describe('rail: crypto and protocol always reach a human', () => {
  it.each([
    'packages/crypto/src/hpke.rs',
    'packages/protocol/schemas/note.ts',
    'packages/protocol/crypto-labels.json',
    'apps/worker/db/migrations/0001_init.sql',
  ])('%s is high impact', (f) => {
    expect(classifyImpact([f], 1).impact).toBe('high')
  })
})

describe('rail: never-write binds even an unrestricted lane', () => {
  it('forbids secrets for a lane with no declared scope', () => {
    expect(checkScope(['.env'], { owned: [], notOwned: [] }, [...NEVER_WRITE_PATHS]).forbidden).toEqual(['.env'])
  })
  it('forbids deploy config for a lane with no declared scope', () => {
    expect(checkScope(['deploy/helm/values.yaml'], { owned: [], notOwned: [] }, [...NEVER_WRITE_PATHS]).forbidden)
      .toHaveLength(1)
  })
})

describe('rail: the GitHub kill switch fails open', () => {
  it('does not halt when the issue list could not be read', () => {
    expect(haltedOnGitHubFrom(undefined)).toBe(false)
  })
})

describe('rail: exactly one git remote', () => {
  it('has only origin, pointing at llamenos-platform', () => {
    const remotes = execSync('git remote -v', { encoding: 'utf8' }).trim().split('\n')
    const names = new Set(remotes.map((l) => l.split(/\s+/)[0]))
    expect([...names]).toEqual(['origin'])
    expect(remotes.join(' ')).toContain('llamenos-platform')
  })
})

describe('rail: every lane starts off', () => {
  it('ships no lane in live or shadow mode by default', () => {
    expect(LANES.filter((l) => l.mode !== 'off')).toHaveLength(0)
  })
})

describe('rail: lane modes are runtime state, not source', () => {
  it('does not require editing orchestrator source to turn a dial', () => {
    // orchestrator/ is high-impact and human-gated. If mode lived in
    // config.ts, changing a lane from off to shadow would need a reviewed PR.
    const src = readFileSync('orchestrator/src/config.ts', 'utf8')
    expect(src).toContain('LANE_MODES_FILE')
  })
})
```

- [ ] **Step 2: Run the guards**

Run: `bun run test:fleet -- tests/orchestrator/guards.test.ts`
Expected: PASS. **If "parses a non-empty scope for every configured lane" fails, do not weaken the test — fix `fragments.ts`.** That test failing means the scope breaker has nothing to compare against for that lane, which is the exact condition rail 8 exists to catch.

- [ ] **Step 3: Commit**

```bash
git add tests/orchestrator/guards.test.ts
git commit -m "test(fleet): assert every safety rail"
```

---

### Task 14: CLI and the `llamenos-fleet` command

**Files:**
- Create: `orchestrator/src/cli.ts`
- Create: `orchestrator/bin/llamenos-fleet`
- Modify: `package.json` (add `fleet` script)

**Interfaces:**
- Consumes: everything above.
- Produces: commands `doctor`, `status`, `tick`, `halt <reason>`, `resume`.

- [ ] **Step 1: Write the CLI**

```ts
// orchestrator/src/cli.ts
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { acquire } from './lock.js'
import { checkHalt, halt, resume, haltedLocally } from './killswitch.js'
import { readAll, append, since } from './ledger.js'
import { readResumedAt } from './circuit.js'
import { loadLanes, LIMITS, LANE_MODES_FILE } from './config.js'
import { GitHubSource } from './source.js'
import { tick, type TickDeps } from './tick.js'
import { FLEET_DIR, LOG_FILE, HALT_REASON_FILE } from './paths.js'
import { REPO, gh } from './gh.js'

const REPO_ROOT = process.env['FLEET_REPO_ROOT'] ?? process.cwd()

function log(msg: string): void {
  mkdirSync(FLEET_DIR, { recursive: true })
  const line = `${new Date().toISOString()} ${msg}\n`
  appendFileSync(LOG_FILE, line)
  process.stdout.write(line)
}

async function doctor(): Promise<number> {
  const checks: [string, boolean, string][] = []
  let ghOk = false
  try { execFileSync('gh', ['auth', 'status'], { stdio: 'pipe' }); ghOk = true } catch { /* not authed */ }
  checks.push(['gh authenticated', ghOk, 'run: gh auth login'])

  let repoOk = false
  try { await gh(['repo', 'view', '--json', 'name']); repoOk = true } catch { /* unreadable */ }
  checks.push([`repo ${REPO} readable`, repoOk, 'check gh auth and network'])

  // Exactly one remote is an invariant, not a preference: a second remote
  // breaks bare `gh` and makes it possible to push fleet work to the wrong
  // repository. Asserted here so drift surfaces as a failed check.
  const remotes = execFileSync('git', ['remote'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n').map((r) => r.trim()).filter(Boolean)
  checks.push([`exactly one git remote (found: ${remotes.join(', ') || 'none'})`,
    remotes.length === 1 && remotes[0] === 'origin',
    'git remote remove <name> — this repo must only ever have origin -> llamenos-platform'])

  const lanes = await loadLanes(REPO_ROOT)
  for (const l of lanes) {
    checks.push([`lane ${l.id} has scope paths`, l.scope.owned.length > 0,
      `check .claude/agents/fragments/${l.id}-supervisor.md "**Owned paths:**" section`])
  }
  checks.push(['not halted', !haltedLocally(),
    existsSync(HALT_REASON_FILE) ? `halted: ${readFileSync(HALT_REASON_FILE, 'utf8').trim()} — clear with: llamenos-fleet resume` : ''])
  checks.push(['command on PATH', existsSync(`${process.env['HOME']}/.local/bin/llamenos-fleet`),
    `ln -sf ${REPO_ROOT}/orchestrator/bin/llamenos-fleet ~/.local/bin/llamenos-fleet`])

  let bad = 0
  for (const [name, ok, fix] of checks) {
    process.stdout.write(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok || !fix ? '' : `\n        ${fix}`}\n`)
    if (!ok) bad++
  }
  const modes = lanes.map((l) => `${l.id}=${l.mode}`).join(' ')
  process.stdout.write(`\nlanes: ${modes}\n`)
  process.stdout.write(`lane modes file: ${LANE_MODES_FILE}${existsSync(LANE_MODES_FILE) ? '' : ' (absent — all lanes off)'}\n`)
  return bad === 0 ? 0 : 1
}

async function runTick(): Promise<number> {
  const lanes = await loadLanes(REPO_ROOT)
  const deps: TickDeps = {
    lanes,
    now: () => Date.now(),
    acquireLock: acquire,
    checkHalt,
    readLedger: readAll,
    resumedAt: readResumedAt,
    listItems: (lane) => new GitHubSource(lane.requireLabel).list(),
    readLabels: (id) => new GitHubSource('').labels(id),
    // Live dispatch arrives in the follow-on plan. Until then a lane set to
    // `live` must fail loudly rather than silently doing nothing, which would
    // look exactly like a working fleet with an empty backlog.
    dispatch: async () => { throw new Error('live dispatch not implemented — keep lanes in shadow mode') },
    record: append,
    log,
  }
  const r = await tick(deps)
  log(JSON.stringify(r))
  return 0
}

function status(): number {
  const recent = since(24 * 3_600_000)
  const byOutcome = new Map<string, number>()
  for (const r of recent) byOutcome.set(r.outcome, (byOutcome.get(r.outcome) ?? 0) + 1)
  process.stdout.write(`halted: ${haltedLocally() ? 'YES' : 'no'}\n`)
  process.stdout.write(`runs (24h): ${recent.length}\n`)
  for (const [k, v] of [...byOutcome].sort()) process.stdout.write(`  ${k}: ${v}\n`)
  process.stdout.write(`limits: ${LIMITS.maxDispatchesPerHour}/h, halt after ${LIMITS.consecutiveFailuresToHalt} consecutive failures\n`)
  return 0
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2)
  switch (cmd) {
    case 'doctor':  process.exit(await doctor())
    case 'tick':    process.exit(await runTick())
    case 'status':  process.exit(status())
    case 'halt':    halt(rest.join(' ') || 'halted by hand'); log('HALTED'); process.exit(0)
    case 'resume':  resume(); log('RESUMED'); process.exit(0)
    default:
      process.stderr.write('usage: llamenos-fleet <doctor|status|tick|halt "reason"|resume>\n')
      process.exit(2)
  }
}

void main()
```

```bash
#!/usr/bin/env bash
# orchestrator/bin/llamenos-fleet
# Resolves the repo through this symlink so the command works from any directory.
set -euo pipefail

SELF="${BASH_SOURCE[0]}"
while [ -L "$SELF" ]; do
  DIR="$(cd -P "$(dirname "$SELF")" && pwd)"
  SELF="$(readlink "$SELF")"
  [[ $SELF != /* ]] && SELF="$DIR/$SELF"
done
REPO_ROOT="$(cd -P "$(dirname "$SELF")/../.." && pwd)"

# Secrets live here and are never in git.
[ -f "$HOME/.llamenos-fleet/env" ] && set -a && . "$HOME/.llamenos-fleet/env" && set +a

export FLEET_REPO_ROOT="$REPO_ROOT"
exec bun "$REPO_ROOT/orchestrator/src/cli.ts" "$@"
```

- [ ] **Step 2: Make it executable and install**

```bash
chmod +x orchestrator/bin/llamenos-fleet
mkdir -p ~/.local/bin
ln -sf "$PWD/orchestrator/bin/llamenos-fleet" ~/.local/bin/llamenos-fleet
```

Add to `package.json` scripts:
```json
"fleet": "bun orchestrator/src/cli.ts",
```

- [ ] **Step 3: Run doctor**

Run: `llamenos-fleet doctor`
Expected: every check `ok`, and a final line showing all six lanes as `off`.
**If any lane reports no scope paths, stop and fix `fragments.ts` before continuing.**

- [ ] **Step 4: Commit**

```bash
git add orchestrator/src/cli.ts orchestrator/bin/llamenos-fleet package.json
git commit -m "feat(fleet): llamenos-fleet CLI with doctor, status, tick, halt, resume"
```

---

### Task 15: The shadow pass

**Files:**
- Create: `orchestrator/systemd/llamenos-fleet-tick.service`
- Create: `orchestrator/systemd/llamenos-fleet-tick.timer`
- Create: `orchestrator/README.md`

- [ ] **Step 1: Write the systemd units**

```ini
# orchestrator/systemd/llamenos-fleet-tick.service
[Unit]
Description=Llámenos fleet — one dispatch pass
After=network-online.target

[Service]
Type=oneshot
# %h = the user unit owner's home. No WorkingDirectory=: the wrapper at
# %h/.local/bin/llamenos-fleet symlinks into the checkout and cd's there itself.
Environment=PATH=%h/.bun/bin:%h/.local/bin:/usr/local/bin:/usr/bin:/bin
EnvironmentFile=-%h/.llamenos-fleet/env
ExecStart=%h/.local/bin/llamenos-fleet tick
# A pass that cannot run is not a failure: the lock, the halt file and the
# breakers all exit cleanly on purpose, so systemd must not treat a quiet night
# as a fault and back off.
SuccessExitStatus=0
TimeoutStartSec=7200
```

```ini
# orchestrator/systemd/llamenos-fleet-tick.timer
[Unit]
Description=Llámenos fleet dispatch pass, every 30 minutes

[Timer]
# ABSOLUTE wall-clock, deliberately — NOT OnBootSec + OnUnitActiveSec.
# OnUnitActiveSec anchors off the last time the service was active, and
# OnBootSec fires only in the first minutes after a boot. On a machine that has
# been up for days with no recent activation there is nothing left to anchor to,
# so systemd schedules NOTHING — while `is-enabled` still says enabled and
# `is-active` still says active. An OnCalendar schedule cannot enter that state:
# every expression has a next occurrence computed from the clock alone.
OnCalendar=*-*-* *:00,30:00
Persistent=true
AccuracySec=1min

[Install]
WantedBy=timers.target
```

- [ ] **Step 2: Put one lane into shadow and run a pass by hand**

Modes are runtime state, not source — never edit `config.ts` to turn a dial:

```bash
mkdir -p ~/.llamenos-fleet
echo '{"backend":"shadow"}' > ~/.llamenos-fleet/lanes.json
```

Run: `llamenos-fleet tick`
Expected: a JSON line reporting `ran: true`, `dispatched: 0`, and either `shadowed: N` or a rejection histogram. **`dispatched` must be 0.**

- [ ] **Step 3: Put all six lanes into shadow and run again**

```bash
echo '{"backend":"shadow","shared":"shadow","desktop":"shadow","ios":"shadow","android":"shadow","infra":"shadow"}' \
  > ~/.llamenos-fleet/lanes.json
```

Run `llamenos-fleet tick` and read the log at `~/.llamenos-fleet/fleet.log`.

Confirm, and record the answers in the commit message:
1. Every lane reports scope paths matching its fragment's "Owned paths".
2. No item is claimed by two lanes.
3. Rejection reasons are plausible for the current backlog.
4. `dispatched` is 0 for every lane.

- [ ] **Step 4: Install the timer**

```bash
mkdir -p ~/.config/systemd/user
cp orchestrator/systemd/*.service orchestrator/systemd/*.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now llamenos-fleet-tick.timer
systemctl --user list-timers 'llamenos-fleet-*'
```
Expected: a real NEXT time, **never `infinity`** or an empty column.

- [ ] **Step 5: Write the README**

`orchestrator/README.md` must state: what the fleet is and is not; the eight rails and the file that owns each; the two kill switches and their opposite failure modes; every command; how to change a lane's mode; where state lives; and the resume command in full.

- [ ] **Step 6: Commit**

```bash
git add orchestrator/systemd orchestrator/README.md
git commit -m "feat(fleet): systemd timer and first shadow pass"
```

---

## Done when

- `bun run test:fleet` passes, guards included.
- `llamenos-fleet doctor` reports every check ok and all six lanes with non-empty scopes.
- A shadow pass across all six lanes dispatches nothing and explains every item it did not pick up.
- `systemctl --user list-timers` shows a real next-elapse time.

Live dispatch, verification, the PR review loop, digest and notification are the
follow-on plan: `2026-09-11-fleet-live-dispatch.md`.
