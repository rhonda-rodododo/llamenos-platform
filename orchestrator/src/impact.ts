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
