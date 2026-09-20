/**
 * knope release process keeps `apps/desktop/Cargo.lock` in sync with
 * `apps/desktop/Cargo.toml`.
 *
 * `knope.toml`'s `versioned_files` bumps `apps/desktop/Cargo.toml`'s
 * `[package].version` on every release (via the `PrepareRelease` step in
 * the `prepare-release` workflow), but a bare `Cargo.toml` entry does NOT
 * touch the sibling `Cargo.lock` — knope only keeps a lockfile's own
 * `[[package]]` entry in step if that `Cargo.lock` is *also* listed in
 * `versioned_files` (bare, inferring the dependency name from the nearest
 * preceding `Cargo.toml` entry, or with an explicit `dependency = "..."`).
 *
 * Without that pairing, every release bumps `apps/desktop/Cargo.toml` and
 * silently leaves `apps/desktop/Cargo.lock` one (or more) versions behind.
 * That's exactly what happened across the 0.19.14 and 0.19.15 releases:
 * `apps/desktop/Cargo.lock`'s "llamenos-desktop" entry stayed at 0.19.13
 * while `apps/desktop/Cargo.toml` moved to 0.19.15, and `cargo metadata
 * --locked` (the same check `cargo build --locked` performs, and the rail
 * `tests/tauri-lockfile-consistency.spec.ts` added in #895) failed on
 * `main` as a result:
 *
 *   error: the lock file .../apps/desktop/Cargo.lock needs to be updated
 *   but --locked was passed to prevent this
 *
 * The fix is to list `apps/desktop/Cargo.lock` in `knope.toml`'s
 * `versioned_files`, positioned after `apps/desktop/Cargo.toml` so knope
 * infers the "llamenos-desktop" dependency name from it. Verified directly
 * against the real `knope` binary (0.22.4, matching `.github/workflows/
 * knope-release-pr.yml`'s pin) via `knope --dry-run prepare-release`, which
 * now reports:
 *
 *   Would add the following to apps/desktop/Cargo.toml: version = 0.19.16
 *   Would add the following to apps/desktop/Cargo.lock: llamenos-desktop = 0.19.16
 *
 * `knope` itself is not installed in the general test/e2e CI job (only the
 * dedicated `knope-release-pr` / `release` workflows install it via
 * `knope-dev/action`), so this rail checks the `knope.toml` *configuration*
 * directly — a static, deterministic assertion that doesn't require the
 * binary — rather than shelling out to `knope --dry-run`.
 *
 * Mutation check performed while authoring this test: reverting the
 * `knope.toml` change (removing the `"apps/desktop/Cargo.lock"` entry) made
 * the first test below fail with the expected message; restoring it made
 * both tests pass again.
 */

import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')
const KNOPE_TOML_PATH = resolve(REPO_ROOT, 'knope.toml')
const DESKTOP_CARGO_TOML = resolve(REPO_ROOT, 'apps/desktop/Cargo.toml')
const DESKTOP_CARGO_LOCK = resolve(REPO_ROOT, 'apps/desktop/Cargo.lock')

/**
 * Pulls the raw contents of `versioned_files = [ ... ]` out of knope.toml
 * and splits it into individual entries. Entries are either bare strings
 * (`"path"`) or inline tables (`{ path = "...", ... }`); splitting on
 * top-level commas (not commas inside `{ }`) is enough for this file's
 * known, simple shape — this is intentionally not a general TOML parser.
 */
function readVersionedFilesEntries(): string[] {
  const knopeToml = readFileSync(KNOPE_TOML_PATH, 'utf-8')
  const blockMatch = knopeToml.match(/versioned_files\s*=\s*\[([\s\S]*?)\n\]/)
  if (!blockMatch) {
    throw new Error(`Could not find "versioned_files = [...]" array in ${KNOPE_TOML_PATH}`)
  }

  const entries: string[] = []
  let depth = 0
  let current = ''
  for (const ch of blockMatch[1]) {
    if (ch === '{') depth++
    if (ch === '}') depth--
    if (ch === ',' && depth === 0) {
      if (current.trim()) entries.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) entries.push(current.trim())
  return entries
}

test.describe('knope release process keeps apps/desktop/Cargo.lock in sync', () => {
  test('knope.toml versioned_files pairs apps/desktop/Cargo.lock with apps/desktop/Cargo.toml', () => {
    const entries = readVersionedFilesEntries()
    const cargoTomlIdx = entries.findIndex((e) => e.includes('apps/desktop/Cargo.toml'))
    const cargoLockIdx = entries.findIndex((e) => e.includes('apps/desktop/Cargo.lock'))

    expect(
      cargoTomlIdx !== -1,
      `This test's fixture assumption changed: knope.toml's versioned_files no longer ` +
        `lists "apps/desktop/Cargo.toml" at all. Update this test to match the new config.`,
    ).toBe(true)

    expect(
      cargoLockIdx !== -1,
      `knope.toml's versioned_files does not list "apps/desktop/Cargo.lock". Without it, ` +
        `\`knope prepare-release\` bumps apps/desktop/Cargo.toml's version but never touches ` +
        `apps/desktop/Cargo.lock, so every release leaves the lockfile behind and fails ` +
        `\`cargo metadata --locked\` on main (see tests/tauri-lockfile-consistency.spec.ts, ` +
        `#895). Add "apps/desktop/Cargo.lock" to knope.toml's versioned_files, positioned ` +
        `after "apps/desktop/Cargo.toml" so knope infers the "llamenos-desktop" package ` +
        `name from it.`,
    ).toBe(true)

    expect(
      cargoLockIdx > cargoTomlIdx,
      `"apps/desktop/Cargo.lock" must be listed AFTER "apps/desktop/Cargo.toml" in ` +
        `knope.toml's versioned_files — knope infers a bare Cargo.lock entry's dependency ` +
        `name from the nearest preceding Cargo.toml entry in the array. Listed out of order ` +
        `(or with no preceding Cargo.toml), knope cannot infer "llamenos-desktop" and errors.`,
    ).toBe(true)
  })

  test('apps/desktop/Cargo.lock "llamenos-desktop" entry matches apps/desktop/Cargo.toml version right now', () => {
    const cargoToml = readFileSync(DESKTOP_CARGO_TOML, 'utf-8')
    const cargoLock = readFileSync(DESKTOP_CARGO_LOCK, 'utf-8')

    const tomlVersionMatch = cargoToml.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)
    if (!tomlVersionMatch) {
      throw new Error(`Could not find [package] version in ${DESKTOP_CARGO_TOML}`)
    }
    const tomlVersion = tomlVersionMatch[1]

    const lockEntryMatch = cargoLock.match(/\[\[package\]\]\nname = "llamenos-desktop"\nversion = "([^"]+)"/)
    if (!lockEntryMatch) {
      throw new Error(`Could not find the "llamenos-desktop" [[package]] entry in ${DESKTOP_CARGO_LOCK}`)
    }
    const lockVersion = lockEntryMatch[1]

    expect(
      lockVersion === tomlVersion,
      `apps/desktop/Cargo.lock's "llamenos-desktop" entry is at ${lockVersion} but ` +
        `apps/desktop/Cargo.toml declares ${tomlVersion}. This is exactly the drift that ` +
        `fails \`cargo metadata --locked\` / \`cargo build --locked\` on main (see ` +
        `tests/tauri-lockfile-consistency.spec.ts). Run \`cargo metadata --offline ` +
        `--manifest-path apps/desktop/Cargo.toml\` to regenerate the lockfile's version ` +
        `field, then commit the result.`,
    ).toBe(true)
  })
})
