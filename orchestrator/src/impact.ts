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

  // These two are the other half of the orchestrator's own trust base: it
  // already treats its own source as high-impact, but a worker that edits the
  // fragment defining its own lane's write scope — or the settings file
  // enforcing the PreToolUse write-deny hook — can widen its own authority
  // without ever touching `orchestrator/`.
  '.claude/agents/fragments/',
  '.claude/settings.json',

  'drizzle/migrations/',
  'packages/shared/migrations/',
  'apps/worker/db/schema/',
  'apps/worker/middleware/',
  'apps/worker/routes/auth',
  'apps/worker/routes/sessions',
  'apps/worker/routes/webauthn',
  'apps/worker/lib/crypto',
  'apps/worker/lib/hub-event-crypto',
  'apps/worker/lib/push-encryption',
  'apps/worker/lib/server-identity',
  'apps/worker/lib/agent-identity',
  'apps/worker/lib/timing-safe',
  'apps/worker/lib/blind-index-query',
  'apps/worker/services/crypto-keys',
  'packages/protocol/tools/',
  'packages/shared/crypto-labels.ts',
  'src/client/lib/platform.ts',
  'apps/desktop/src/',
  'apps/desktop/capabilities/',
  'apps/ios/Sources/Services/CryptoService.swift',
  'apps/android/app/src/main/java/org/llamenos/hotline/crypto/',
  'scripts/inject-cert-pins.ts',
  'scripts/extract-cert-pins.sh',
  'scripts/verify-build.sh',
  'Dockerfile.build',
  'knope.toml',
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
