import { describe, it, expect } from 'vitest'
import { parseOwnedPaths, matchesPath, loadLaneScopes } from '../../orchestrator/src/fragments.js'

// Verbatim excerpt of .claude/agents/fragments/ios-supervisor.md
const IOS = `
## Your Domain

**Owned paths:**
- \`apps/ios/\` — SwiftUI app (Sources/, Tests/, Package.swift, project.yml)
- \`.github/workflows/ios*.yml\` — iOS CI workflows

**Tech stack:**
- SwiftUI (iOS 17+, \`@Observable\` macro), SPM, xcodegen, XCUITest, UniFFI XCFramework
`

// Verbatim excerpt of .claude/agents/fragments/desktop-supervisor.md — the
// "Does NOT own" heading is INLINE (heading + paths on one line, trailing
// prose after), and the "tests/" bullet itself carries TWO backticked paths.
const DESKTOP = `
**Owned paths:**
- \`apps/desktop/\` — Tauri v2 shell (Rust backend + webview frontend)
- \`src/client/\` — Frontend SPA (Vite + React: routes, components, lib)
- \`tests/\` — Root test config, \`tests/mocks/\` (Tauri IPC mocks for Playwright)
- \`playwright.config.ts\`

**Does NOT own:** \`tests/features/\`, \`tests/steps/\` (backend-supervisor)

**Tech stack:**
- Tauri v2, Vite + React + TanStack Router + shadcn/ui, Playwright
`

// Verbatim excerpt of .claude/agents/fragments/backend-supervisor.md — same
// inline "Does NOT own" shape, with the mirror-image exclusion of desktop's.
const BACKEND = `
**Owned paths:**
- \`apps/worker/\` — Bun HTTP server (Hono + PostgreSQL: routes, db, services, telephony, messaging, lib)
- \`apps/sip-bridge/\` — Protocol-agnostic SIP bridge (\`PBX_TYPE\` selects ARI/ESL/Kamailio)
- \`apps/signal-notifier/\` — Zero-knowledge Signal notification sidecar (port 3100)
- \`tests/features/\` — BDD Gherkin feature files
- \`tests/steps/\` — Step definitions organized by domain

**Does NOT own:** \`tests/\` root, \`tests/mocks/\` (desktop-supervisor)

**Tech stack:**
- Bun + Hono + PostgreSQL/Drizzle, \`playwright-bdd\` for BDD tests
`

// Verbatim excerpt of .claude/agents/fragments/infra-supervisor.md — three
// backticked paths on a single bullet line.
const INFRA = `
**Owned paths:**
- \`deploy/\` — Docker Compose, Helm, Ansible, OpenTofu
- \`.github/workflows/\` — All CI/CD pipelines
- \`site/\` — Marketing site (Cloudflare Pages)
- \`Dockerfile*\`, \`knope.toml\`, \`Caddyfile*\`

**Tech stack:**
- Terraform/OpenTofu, Ansible, Helm, Docker Compose
`

describe('parseOwnedPaths', () => {
  it('extracts backticked paths from the Owned paths bullets', () => {
    expect(parseOwnedPaths(IOS).owned).toEqual(['apps/ios/', '.github/workflows/ios*.yml'])
  })

  it('stops at the next bold heading', () => {
    expect(parseOwnedPaths(IOS).owned).not.toContain('SwiftUI')
    expect(parseOwnedPaths(IOS).owned).not.toContain('@Observable')
  })

  it('extracts an inline "Does NOT own" line, ignoring trailing prose', () => {
    const r = parseOwnedPaths(DESKTOP)
    expect(r.notOwned).toEqual(['tests/features/', 'tests/steps/'])
  })

  it('extracts every backticked path from a bullet that carries more than one', () => {
    const r = parseOwnedPaths(DESKTOP)
    expect(r.owned).toEqual(['apps/desktop/', 'src/client/', 'tests/', 'tests/mocks/', 'playwright.config.ts'])
  })

  it('parses backend\'s mirror-image inline exclusion of desktop\'s owned tests/ root', () => {
    const r = parseOwnedPaths(BACKEND)
    expect(r.owned).toEqual([
      'apps/worker/',
      'apps/sip-bridge/',
      'apps/signal-notifier/',
      'tests/features/',
      'tests/steps/',
    ])
    expect(r.notOwned).toEqual(['tests/', 'tests/mocks/'])
  })

  it('drops a non-path backtick span mentioned in a bullet\'s description (PBX_TYPE is an env var, not a path)', () => {
    expect(parseOwnedPaths(BACKEND).owned).not.toContain('PBX_TYPE')
  })

  it('extracts all three backticked paths from a single bullet line', () => {
    expect(parseOwnedPaths(INFRA).owned).toEqual(['deploy/', '.github/workflows/', 'site/', 'Dockerfile*', 'knope.toml', 'Caddyfile*'])
  })

  it('returns empty lists rather than throwing on a fragment with no sections', () => {
    expect(parseOwnedPaths('# nothing here')).toEqual({ owned: [], notOwned: [] })
  })
})

describe('matchesPath', () => {
  it('matches a glob within one path segment', () => {
    expect(matchesPath('Dockerfile.build', 'Dockerfile*')).toBe(true)
  })

  it('does not let a glob cross a path separator boundary incorrectly, but does match within-segment suffixes', () => {
    expect(matchesPath('.github/workflows/ios-e2e.yml', '.github/workflows/ios*.yml')).toBe(true)
    expect(matchesPath('.github/workflows/android.yml', '.github/workflows/ios*.yml')).toBe(false)
  })

  it('treats a trailing slash as a directory prefix', () => {
    expect(matchesPath('apps/ios/Sources/App.swift', 'apps/ios/')).toBe(true)
  })

  it('treats a glob-free pattern as a plain prefix match', () => {
    expect(matchesPath('knope.toml', 'knope.toml')).toBe(true)
    expect(matchesPath('knope.tomlx', 'knope.toml')).toBe(true)
  })

  it('rejects a file that does not share the pattern prefix at all', () => {
    expect(matchesPath('xknope.toml', 'knope.toml')).toBe(false)
  })

  // G1 fix: a slash-free pattern is a basename pattern — it matches at any
  // depth, not just at the repo root. This is the never-write hole: a plain
  // `startsWith` on the whole path let a worker write `.env` anywhere except
  // the root.
  it('matches a bare-filename pattern at any depth, not just the repo root', () => {
    expect(matchesPath('.env', '.env')).toBe(true)
    expect(matchesPath('apps/worker/config/.env', '.env')).toBe(true)
    expect(matchesPath('deploy/docker/.env', '.env')).toBe(true)
  })

  it('does not let a bare-filename pattern match an unrelated file that merely contains it', () => {
    expect(matchesPath('apps/worker/env.ts', '.env')).toBe(false)
    expect(matchesPath('src/dotenv/index.ts', '.env')).toBe(false)
  })

  it('still over-blocks a basename that starts with the pattern — deliberate, deny-side, and safe', () => {
    // `.environment` is not `.env`, but a deny list erring toward blocking
    // too much rather than too little is the safe failure mode here, so this
    // is asserted as intended behavior, not tolerated as a quirk.
    expect(matchesPath('.environment', '.env')).toBe(true)
  })

  it('matches a bare glob pattern against the basename at any depth', () => {
    expect(matchesPath('Dockerfile.build', 'Dockerfile*')).toBe(true)
    expect(matchesPath('deploy/docker/Dockerfile', 'Dockerfile*')).toBe(true)
  })
})

describe('loadLaneScopes against the real fragments', () => {
  it('parses all six lanes to exactly the paths documented in the source files', async () => {
    const scopes = await loadLaneScopes(process.cwd())

    expect(scopes.ios).toEqual({
      owned: ['apps/ios/', '.github/workflows/ios*.yml'],
      notOwned: [],
    })

    expect(scopes.android).toEqual({
      owned: ['apps/android/'],
      notOwned: [],
    })

    expect(scopes.desktop).toEqual({
      owned: ['apps/desktop/', 'src/client/', 'tests/', 'tests/mocks/', 'playwright.config.ts'],
      notOwned: ['tests/steps/', 'packages/test-specs/'],
    })

    expect(scopes.backend).toEqual({
      owned: ['apps/worker/', 'sip-bridge/', 'signal-notifier/', 'tests/steps/'],
      notOwned: ['tests/', 'tests/mocks/', 'packages/test-specs/'],
    })

    expect(scopes.shared).toEqual({
      owned: [
        'packages/crypto/',
        'packages/protocol/',
        'packages/shared/',
        'packages/i18n/',
        'docs/protocol/PROTOCOL.md',
        'packages/test-specs/',
      ],
      notOwned: [],
    })

    expect(scopes.infra).toEqual({
      owned: ['deploy/', '.github/workflows/', 'site/', 'Dockerfile*', 'knope.toml', 'Caddyfile*'],
      notOwned: [],
    })
  })
})
