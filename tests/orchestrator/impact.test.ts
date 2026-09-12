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

  it.each([
    // The orchestrator's own trust base: the fragments that define lane write
    // scope, and the settings file enforcing the write-deny hook.
    ['.claude/agents/fragments/backend.md'],
    ['.claude/settings.json'],
    // Migrations and schema — state a revert does not restore.
    ['drizzle/migrations/0001_init.sql'],
    ['packages/shared/migrations/0002_x.sql'],
    ['apps/worker/db/schema/users.ts'],
    // Middleware and the newly-covered auth/crypto route and lib surface.
    ['apps/worker/middleware/rate-limit.ts'],
    ['apps/worker/routes/auth.ts'],
    ['apps/worker/routes/sessions.ts'],
    ['apps/worker/routes/webauthn.ts'],
    ['apps/worker/lib/crypto.ts'],
    ['apps/worker/lib/hub-event-crypto.ts'],
    ['apps/worker/lib/push-encryption.ts'],
    ['apps/worker/lib/server-identity.ts'],
    ['apps/worker/lib/agent-identity.ts'],
    ['apps/worker/lib/timing-safe.ts'],
    ['apps/worker/lib/blind-index-query.ts'],
    ['apps/worker/services/crypto-keys.ts'],
    // Protocol codegen and shared crypto labels.
    ['packages/protocol/tools/codegen.ts'],
    ['packages/shared/crypto-labels.ts'],
    // Client/platform crypto boundary across desktop, iOS, Android.
    ['src/client/lib/platform.ts'],
    ['apps/desktop/src/main.rs'],
    ['apps/desktop/capabilities/default.json'],
    ['apps/ios/Sources/Services/CryptoService.swift'],
    ['apps/android/app/src/main/java/org/llamenos/hotline/crypto/CryptoService.kt'],
    // Build/release integrity: cert pinning, reproducible builds, versioning.
    ['scripts/inject-cert-pins.ts'],
    ['scripts/extract-cert-pins.sh'],
    ['scripts/verify-build.sh'],
    ['Dockerfile.build'],
    ['knope.toml'],
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

  // G2: boundary-exact tests, so a `>` -> `>=` refactor cannot pass silently.
  it('stays low at exactly the file-count threshold, and escalates one file past it', () => {
    const atThreshold = Array.from({ length: 40 }, (_, i) => `src/client/x${i}.ts`)
    expect(classifyImpact(atThreshold, 100).impact).toBe('low')

    const overThreshold = Array.from({ length: 41 }, (_, i) => `src/client/x${i}.ts`)
    expect(classifyImpact(overThreshold, 100).impact).toBe('high')
  })

  it('stays low at exactly the line-count threshold, and escalates one line past it', () => {
    expect(classifyImpact(['src/client/a.ts'], 1500).impact).toBe('low')
    expect(classifyImpact(['src/client/a.ts'], 1501).impact).toBe('high')
  })
})
