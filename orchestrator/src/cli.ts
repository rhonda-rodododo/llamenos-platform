import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { acquire } from './lock.js'
import { checkHalt, halt, resume, haltedLocally } from './killswitch.js'
import { readAll, append, since } from './ledger.js'
import { readResumedAt } from './circuit.js'
import { loadLanes, LIMITS, LANE_MODES_FILE } from './config.js'
import { GitHubSource } from './source.js'
import { tick, type TickDeps, type TickResult } from './tick.js'
import { FLEET_DIR, LOG_FILE, HALT_REASON_FILE } from './paths.js'
import { REPO } from './gh.js'

const REPO_ROOT = process.env['FLEET_REPO_ROOT'] ?? process.cwd()

function log(msg: string): void {
  mkdirSync(FLEET_DIR, { recursive: true })
  const line = `${new Date().toISOString()} ${msg}\n`
  appendFileSync(LOG_FILE, line)
  process.stdout.write(line)
}

/**
 * The fleet log is a plain append-only stream of `<timestamp> <message>`
 * lines, and one message per tick is the JSON-encoded TickResult. Reading it
 * back lets `doctor` and `status` — neither of which calls `tick()` — report
 * whether the *last* pass ended in `aborted: 'error'` without needing a
 * second, separate "last result" file to keep in sync with the log.
 */
function lastTickResult(): TickResult | undefined {
  if (!existsSync(LOG_FILE)) return undefined
  const lines = readFileSync(LOG_FILE, 'utf8').split('\n').filter((l) => l.trim().length > 0)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? ''
    const spaceIdx = line.indexOf(' ')
    const rest = spaceIdx >= 0 ? line.slice(spaceIdx + 1) : line
    try {
      const parsed: unknown = JSON.parse(rest)
      if (parsed !== null && typeof parsed === 'object' && 'ran' in parsed) return parsed as TickResult
    } catch {
      continue // not a TickResult line — an ordinary log message
    }
  }
  return undefined
}

async function doctor(): Promise<number> {
  const checks: [string, boolean, string][] = []
  let ghOk = false
  try { execFileSync('gh', ['auth', 'status'], { stdio: 'pipe' }); ghOk = true } catch { /* not authed */ }
  checks.push(['gh authenticated', ghOk, 'run: gh auth login'])

  // `gh repo view` takes its target as a bare positional argument, unlike
  // most other `gh` subcommands — it does not accept `-R`/`--repo` at all
  // ("unknown shorthand flag: 'R' in -R"). The shared `gh()` wrapper always
  // appends `-R <REPO>` for exactly the reason documented in gh.ts (pin the
  // repo, never infer it), so it cannot be used for this one command; call
  // the CLI directly instead, the same way the git-remote check below does.
  let repoOk = false
  try { execFileSync('gh', ['repo', 'view', REPO, '--json', 'name'], { stdio: 'pipe' }); repoOk = true } catch { /* unreadable */ }
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

  // R3: tick() never throws — every abnormal exit, including an unexpected
  // one, comes back as `aborted: 'error'`. doctor is a health check, so a
  // pass that errored last time must show up here even though doctor never
  // calls tick() itself.
  const last = lastTickResult()
  checks.push(['last tick pass did not error', last?.aborted !== 'error',
    last?.aborted === 'error' ? `${last.errorMessage ?? '(no message)'} — see ${LOG_FILE}` : ''])

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

  // R2: live dispatch is not implemented in this plan — it arrives in the
  // follow-on. Without this guard, a lane accidentally (or hopefully) set to
  // `live` in lanes.json would hit the placeholder `dispatch` below, which
  // throws — but tick()'s per-dispatch catch now records that as a FAILED
  // ledger row and keeps going, so the lane would just quietly accumulate
  // FAILED rows until the consecutive-failure breaker tripped it. That tells
  // an operator nothing actionable. Refuse up front instead, before deps (and
  // therefore any GitHub read or ledger write) are even constructed.
  const liveLanes = lanes.filter((l) => l.mode === 'live')
  if (liveLanes.length > 0) {
    process.stderr.write(
      `ERROR: live dispatch is not implemented yet — only "shadow" is a supported mode.\n` +
      `The following lane(s) are set to "live": ${liveLanes.map((l) => l.id).join(', ')}.\n` +
      `Edit ${LANE_MODES_FILE} and set them to "shadow" or "off", then re-run.\n`,
    )
    return 1
  }

  const deps: TickDeps = {
    lanes,
    now: () => Date.now(),
    acquireLock: acquire,
    checkHalt,
    readLedger: readAll,
    resumedAt: readResumedAt,
    listItems: (lane) => new GitHubSource(lane.requireLabel).list(),
    readLabels: (id) => new GitHubSource('').labels(id),
    // Live dispatch arrives in the follow-on plan. This is a second line of
    // defence only — the guard above means a `live` lane can never reach
    // here in practice — but it still fails loudly rather than silently
    // doing nothing, which would look exactly like a working fleet with an
    // empty backlog.
    dispatch: async () => { throw new Error('live dispatch not implemented — keep lanes in shadow mode') },
    record: append,
    log,
  }
  const r = await tick(deps)
  log(JSON.stringify(r))

  // R1: `attempted` counts every dispatch() call, success or failure; `failed`
  // is the subset that threw. Printing both means "N attempted" never reads
  // as "N succeeded".
  process.stdout.write(
    `ran: ${r.ran} attempted: ${r.attempted} failed: ${r.failed} shadowed: ${r.shadowed} rejections: ${r.rejections.length}\n`,
  )

  // R3: tick() never throws — an aborted: 'error' pass is the CLI's first and
  // only chance to make an operator-visible distinction between "a quiet
  // night" and "something broke".
  if (r.aborted === 'error') {
    process.stderr.write(`ERROR: tick pass aborted with an error: ${r.errorMessage ?? '(no message)'}\n`)
    return 1
  }
  if (r.aborted !== undefined) {
    process.stdout.write(`aborted: ${r.aborted}${r.breakerReason ? ` (${r.breakerReason})` : ''}\n`)
  }
  if (r.halted) {
    process.stdout.write(`halted: ${r.haltReason ?? 'unknown'}\n`)
  }
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

  // R3: surface the last tick's error state here too — status is the command
  // an operator runs to ask "is this thing OK", and an errored pass must be
  // impossible to mistake for a quiet one.
  const last = lastTickResult()
  if (last?.aborted === 'error') {
    process.stdout.write(`last tick: ERROR — ${last.errorMessage ?? '(no message)'}\n`)
    return 1
  }
  process.stdout.write(`last tick: ${last ? `ok (attempted ${last.attempted}, failed ${last.failed}, shadowed ${last.shadowed})` : 'none recorded yet'}\n`)
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

void main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  process.stderr.write(`FATAL: unhandled error in fleet CLI: ${msg}\n`)
  process.exit(1)
})
