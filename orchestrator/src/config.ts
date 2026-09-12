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
 *
 * `file` defaults to the real operator state (`LANE_MODES_FILE`, under
 * `~/.llamenos-fleet/`) but is injectable so callers — tests in particular —
 * can point it at a fixture instead of depending on whatever the machine
 * running the test happens to have turned on.
 */
export function readLaneModes(file: string = LANE_MODES_FILE): Record<string, LaneMode> {
  if (!existsSync(file)) return {}
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
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

export async function loadLanes(repoRoot: string, modesFile: string = LANE_MODES_FILE): Promise<Lane[]> {
  const scopes = await loadLaneScopes(repoRoot)
  const modes = readLaneModes(modesFile)
  const lanes = LANES.map((l) => ({
    ...l,
    mode: modes[l.id] ?? l.mode,
    scope: scopes[l.id] ?? { owned: [], notOwned: [] },
  }))
  assertLiveLanesHaveScope(lanes)
  return lanes
}

/**
 * Binds every lane, including one with an empty owned list.
 *
 * `deploy/` and `.github/workflows/` are deliberately NOT here, unlike the
 * original brief. Never-write is for paths a worker must never write AT ALL;
 * those two instead rely on the impact gate — `classifyImpact` already marks
 * both high-impact, so a change touching them can never auto-merge and always
 * reaches a human. As drafted, the ios and android lane fragments declared CI
 * workflow paths (`.github/workflows/ios*.yml`, `.github/workflows/*android*`)
 * as their OWN, but a blanket `.github/workflows/` never-write entry made
 * those paths unwritable regardless — the fleet could never fix its own CI,
 * which is a large share of the near-term work. The merge gate, not the write
 * gate, is what keeps a bad workflow off `main`; verification runs tests in
 * the worktree, so a worker cannot weaken the gate that judges it.
 *
 * Entries with no `/` are basename patterns (see `matchesPath`): `.env`
 * matches `apps/worker/config/.env` at any depth, `keystore.properties`
 * matches `apps/android/keystore.properties`, and `*.pem`/`id_rsa`/
 * `id_ed25519` catch key material wherever a worker might create it.
 *
 * This list is NOT a mirror of `.claude/settings.json`'s PreToolUse hook —
 * that regex (`\.env$|\.dev\.vars|\.pem$|id_rsa$|id_ed25519$`) is a fast,
 * best-effort bail-out for interactive editing and has already drifted from
 * this one (it does not know about `keystore.properties` or any of the
 * signing-key extensions below). This list is the authoritative, exhaustive
 * one the scope checker enforces; the two are independent defenses and must
 * each be kept correct on their own, not assumed to track each other.
 *
 * `keystore.properties` holds the Android signing key's *password*, not the
 * key itself — `*.jks`/`*.keystore` are the actual Android keystore files.
 * `*.p8`/`*.p12`/`*.pfx`/`*.mobileprovision` cover iOS/macOS signing
 * (App Store Connect API keys, PKCS#12 export, provisioning profiles).
 * `.npmrc`/`.pgpass`/`authorized_keys` cover registry auth tokens, Postgres
 * credentials, and SSH access — none of which are recoverable secrets a
 * revert can undo once exfiltrated.
 *
 * SINGLE SOURCE OF TRUTH for two independent gates: `NEVER_WRITE_PATHS`
 * below (checked by `checkScope` at write/diff time) and `classifyImpact`
 * in `impact.ts` (checked at merge time). A secret pattern that is
 * never-write but not also high-impact is a gap the moment a secret reaches
 * a diff by any route the write gate did not cover — a rename, a symlink, a
 * path the write gate missed — because the merge gate would then wave it
 * through unreviewed. Add new secret patterns here ONLY; both gates pick
 * them up automatically.
 */
export const SECRET_PATH_PATTERNS: readonly string[] = [
  '.env',
  '.dev.vars',
  'keystore.properties',
  '*.pem',
  'id_rsa',
  'id_ed25519',
  '*.jks',
  '*.keystore',
  '*.p8',
  '*.p12',
  '*.pfx',
  '*.key',
  '*.mobileprovision',
  '.npmrc',
  '.pgpass',
  'authorized_keys',
]

export const NEVER_WRITE_PATHS: readonly string[] = SECRET_PATH_PATTERNS

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
