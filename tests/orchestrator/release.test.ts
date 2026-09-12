import { describe, it, expect } from 'vitest'
import {
  releaseEngineerMayMerge, isKnopeReleasePr, RELEASE_ENGINEER_ACTOR, KNOPE_RELEASE_BRANCH,
  buildDispatchEnv, looksCredentialShaped, RELEASE_ENV_ALLOWLIST,
  buildReleaseReport, humanAskFor,
} from '../../orchestrator/src/roles/release.js'

describe('releaseEngineerMayMerge — never merges anything', () => {
  it('refuses to merge the knope release PR', () => {
    const result = releaseEngineerMayMerge({ headRefName: KNOPE_RELEASE_BRANCH, authorLogin: 'github-actions[bot]' })
    expect(result.merge).toBe(false)
    expect(result.reason).toMatch(/human/i)
  })

  it('refuses to merge its own work', () => {
    const result = releaseEngineerMayMerge({ headRefName: 'chore/bump-artifact-list', authorLogin: RELEASE_ENGINEER_ACTOR })
    expect(result.merge).toBe(false)
    expect(result.reason).toMatch(/own/i)
  })

  it('refuses to merge an ordinary, unrelated PR too — it has no merge capability at all', () => {
    const result = releaseEngineerMayMerge({ headRefName: 'feat/some-worker-branch', authorLogin: 'someone-else' })
    expect(result.merge).toBe(false)
  })

  it('MUTATION GUARD: the merge field is strictly the literal false, for every kind of input', () => {
    // A weaker test would assert only `expect(result.merge).toBeFalsy()`,
    // which a mutant returning `merge: 0` or `merge: undefined` could also
    // satisfy. Pin the literal type-narrowed value instead.
    const inputs = [
      { headRefName: KNOPE_RELEASE_BRANCH, authorLogin: 'anyone' },
      { headRefName: 'anything', authorLogin: RELEASE_ENGINEER_ACTOR },
      { headRefName: 'anything', authorLogin: 'anyone' },
    ]
    for (const pr of inputs) {
      const result: { merge: false; reason: string } = releaseEngineerMayMerge(pr)
      expect(result.merge).toBe(false)
    }
  })
})

describe('isKnopeReleasePr', () => {
  it('identifies the knope PR by its branch, not by title text a model could imitate', () => {
    expect(isKnopeReleasePr({ headRefName: 'release' })).toBe(true)
    expect(isKnopeReleasePr({ headRefName: 'release-notes-for-marketing' })).toBe(false)
  })
})

describe('buildDispatchEnv — no credential-bearing variable is ever present', () => {
  const fullEnv = {
    PATH: '/usr/bin:/bin',
    HOME: '/home/fleet',
    CI: 'true',
    NODE_ENV: 'production',
    BUN_INSTALL: '/home/fleet/.bun',
    FLEET_HOME: '/home/fleet/.llamenos-fleet',
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    TZ: 'UTC',
    // Every one of these must NEVER appear in the dispatch environment,
    // whatever their value — pulled from .env.example's real variable
    // names (Twilio, Postgres, HMAC/session, Signal notifier, storage) plus
    // the mobile/desktop signing credentials that live only in CI/operator
    // machines and never in this repo's .env at all.
    TWILIO_ACCOUNT_SID: 'AC-secret-sid',
    TWILIO_AUTH_TOKEN: 'twilio-secret-token',
    PG_PASSWORD: 'db-secret-password',
    HMAC_SECRET: 'hmac-secret-value',
    SERVER_SECRET: 'server-secret-value',
    STORAGE_SECRET_KEY: 'storage-secret-value',
    NOTIFIER_API_KEY: 'notifier-secret-value',
    SIGNAL_NOTIFIER_BEARER_TOKEN: 'signal-bearer-secret',
    APPLE_API_KEY: 'apple-appstoreconnect-key',
    APPLE_API_KEY_ID: 'apple-key-id-secret',
    ANDROID_KEYSTORE_PASSWORD: 'keystore-secret-password',
    TAURI_SIGNING_PRIVATE_KEY: 'tauri-signing-secret',
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: 'tauri-signing-secret-password',
    DATABASE_URL: 'postgres://user:secretpass@host/db',
  }

  it('returns only the allowlisted keys', () => {
    const env = buildDispatchEnv(fullEnv)
    expect(Object.keys(env).sort()).toEqual([...RELEASE_ENV_ALLOWLIST].sort())
  })

  it('never includes any credential-bearing key', () => {
    const env = buildDispatchEnv(fullEnv)
    const credentialKeys = [
      'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'PG_PASSWORD', 'HMAC_SECRET', 'SERVER_SECRET',
      'STORAGE_SECRET_KEY', 'NOTIFIER_API_KEY', 'SIGNAL_NOTIFIER_BEARER_TOKEN', 'APPLE_API_KEY',
      'APPLE_API_KEY_ID', 'ANDROID_KEYSTORE_PASSWORD', 'TAURI_SIGNING_PRIVATE_KEY',
      'TAURI_SIGNING_PRIVATE_KEY_PASSWORD', 'DATABASE_URL',
    ]
    for (const k of credentialKeys) expect(env).not.toHaveProperty(k)
  })

  it('never includes any credential VALUE either — defense against a name collision leaking the wrong thing in', () => {
    const env = buildDispatchEnv(fullEnv)
    const serialized = JSON.stringify(env)
    const credentialValues = [
      'twilio-secret-token', 'db-secret-password', 'hmac-secret-value', 'server-secret-value',
      'storage-secret-value', 'notifier-secret-value', 'signal-bearer-secret', 'apple-appstoreconnect-key',
      'apple-key-id-secret', 'keystore-secret-password', 'tauri-signing-secret',
      'tauri-signing-secret-password', 'secretpass',
    ]
    for (const v of credentialValues) expect(serialized).not.toContain(v)
  })

  it('MUTATION GUARD: throws if the allowlist itself is compromised with a credential-shaped name', () => {
    // Simulates the exact failure mode the comment on buildDispatchEnv
    // warns about — a future edit that "helpfully" adds a credential name
    // to the allowlist. This must fail loudly, not leak the value quietly.
    expect(() => buildDispatchEnv(fullEnv, [...RELEASE_ENV_ALLOWLIST, 'TWILIO_AUTH_TOKEN']))
      .toThrow(/credential-shaped/i)
  })

  it('looksCredentialShaped recognizes common credential-name shapes', () => {
    for (const name of [
      'API_KEY', 'SOME_SECRET', 'AUTH_TOKEN', 'DB_PASSWORD', 'SIGNING_KEY',
      'TLS_CERT', 'ANDROID_KEYSTORE', 'IOS_P12', 'PROVISIONING_PROFILE', 'BEARER_TOKEN',
      'TWILIO_ACCOUNT_SID', 'DATABASE_URL',
    ]) {
      expect(looksCredentialShaped(name)).toBe(true)
    }
  })

  it('looksCredentialShaped does not flag ordinary, harmless names', () => {
    for (const name of RELEASE_ENV_ALLOWLIST) {
      expect(looksCredentialShaped(name)).toBe(false)
    }
  })
})

describe('buildReleaseReport / humanAskFor — honest about what this role cannot do', () => {
  it('names a specific human-only action for iOS: App Store submission', () => {
    const ask = humanAskFor('ios')
    expect(ask).toBeDefined()
    expect(ask).toMatch(/App Store Connect/)
  })

  it('names a specific human-only action for Android: Play Console submission', () => {
    const ask = humanAskFor('android')
    expect(ask).toBeDefined()
    expect(ask).toMatch(/Play Console/)
  })

  it('has no human ask for pipelines it can fully carry (desktop, marketing site)', () => {
    expect(humanAskFor('desktop')).toBeUndefined()
    expect(humanAskFor('marketing-site')).toBeUndefined()
  })

  it('a report for a human-gated pipeline carries the ask; others omit the field entirely', () => {
    const iosReport = buildReleaseReport({ pipeline: 'ios', artifactsVerified: [], problems: [], now: 1000 })
    expect(iosReport.humanAsk).toBeDefined()
    const desktopReport = buildReleaseReport({ pipeline: 'desktop', artifactsVerified: [], problems: [], now: 1000 })
    expect('humanAsk' in desktopReport).toBe(false)
  })
})
