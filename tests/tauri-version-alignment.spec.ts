/**
 * Tauri Rust crate / npm package version alignment.
 *
 * `apps/desktop/Cargo.toml`'s `tauri` dependency and `package.json`'s
 * `@tauri-apps/api` dependency used to be declared as independent floating
 * ranges (`tauri = { version = "2", ... }` and `"@tauri-apps/api": "^2.10.1"`).
 * Nothing coupled them, so a routine `cargo update` or `bun update` could
 * move one and not the other. The Tauri CLI refuses to build once they land
 * on different minors:
 *
 *   Found version mismatched Tauri packages. Make sure the NPM package and
 *   Rust crate versions are on the same major/minor releases:
 *   tauri (v2.11.3) : @tauri-apps/api (v2.10.1)
 *
 * That broke every Linux/Windows leg of tauri-release.yml (CI run
 * 35504685113) with no diff to point at — v0.19.13 shipped with only
 * checksums/provenance/SBOM, no installer.
 *
 * The fix (#895) was to pin the Rust crate and `@tauri-apps/api` to the same
 * exact version so they couldn't drift independently — but it missed the
 * third member of the trio, `@tauri-apps/cli` (`package.json`
 * `devDependencies`), which was left on a floating `^2.10.1`. That let the
 * CLI resolve to a newer minor than the other two on a fresh install (no
 * lockfile-pinned resolution can be assumed reproducible across bun
 * versions/hosts), and that newer CLI stopped accepting the
 * `bunx tauri build apps/desktop` positional-argument form the release
 * workflow relied on:
 *
 *   error: unexpected argument 'apps/desktop' found
 *
 * That broke every macOS/Linux/Windows leg of tauri-release.yml (CI run
 * 35521542402) — the exact same "one package left floating" defect in a new
 * place. The fix is to pin all three to the same exact version (no `^`, `~`,
 * or bare major) so none of them can drift alone. This test is the rail: it
 * reads all three manifests directly (the same failure mode the CLI's own
 * mismatch check reacts to) and fails loudly if ANY of their major.minor
 * versions disagree, or if any of them reverts to a floating range that
 * hides the minor entirely.
 *
 * Mutation check performed while authoring this test (see PR body for the
 * actual output): setting each version in turn to a different minor made the
 * corresponding test fail with the expected message; restoring the matching
 * pin made it pass.
 */

import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')
const CARGO_TOML_PATH = resolve(REPO_ROOT, 'apps/desktop/Cargo.toml')
const PACKAGE_JSON_PATH = resolve(REPO_ROOT, 'package.json')

interface MajorMinor {
  raw: string
  major: number
  minor: number
}

/**
 * Extracts major.minor from a version requirement string, rejecting
 * anything that doesn't pin at least the minor (a bare "2" or "2.x" range
 * hides exactly the information this check exists to compare, and is itself
 * the class of bug that caused the incident).
 */
function parseMajorMinor(raw: string, context: string): MajorMinor {
  const cleaned = raw.trim().replace(/^[\^~=]/, '')
  const match = cleaned.match(/^(\d+)\.(\d+)(?:\.\d+.*)?$/)
  if (!match) {
    throw new Error(
      `${context}: version "${raw}" does not pin an explicit major.minor ` +
        `(e.g. "2.11.1"). A bare major like "2" floats across every minor ` +
        `release, which is exactly the drift that broke tauri-release.yml.`,
    )
  }
  return { raw, major: Number(match[1]), minor: Number(match[2]) }
}

/**
 * All three Tauri packages that must move together, with the raw
 * (unstripped) version string used for the "exact pin" check below.
 */
function readAllTauriVersions(): Array<{ label: string; version: MajorMinor; raw: string }> {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const cargoMatch = readFileSync(CARGO_TOML_PATH, 'utf-8').match(
    /^tauri\s*=\s*(?:"([^"]+)"|\{[^}]*version\s*=\s*"([^"]+)")/m,
  )
  if (!cargoMatch) {
    throw new Error(`Could not find a top-level "tauri" dependency in ${CARGO_TOML_PATH}`)
  }
  const cargoRaw = (cargoMatch[1] ?? cargoMatch[2]) as string
  const apiRaw = pkg.dependencies?.['@tauri-apps/api']
  const cliRaw = pkg.devDependencies?.['@tauri-apps/cli']
  if (!apiRaw) throw new Error(`package.json has no "@tauri-apps/api" entry under "dependencies"`)
  if (!cliRaw) throw new Error(`package.json has no "@tauri-apps/cli" entry under "devDependencies"`)

  return [
    { label: 'apps/desktop/Cargo.toml "tauri" crate', version: parseMajorMinor(cargoRaw, 'Cargo.toml "tauri"'), raw: cargoRaw },
    { label: 'package.json "@tauri-apps/api"', version: parseMajorMinor(apiRaw, 'package.json "@tauri-apps/api"'), raw: apiRaw },
    { label: 'package.json "@tauri-apps/cli"', version: parseMajorMinor(cliRaw, 'package.json "@tauri-apps/cli"'), raw: cliRaw },
  ]
}

test.describe('Tauri version alignment', () => {
  test('Rust tauri crate, npm @tauri-apps/api and @tauri-apps/cli all pin the same major.minor', () => {
    const [rustEntry, apiEntry, cliEntry] = readAllTauriVersions()
    const rust = rustEntry.version
    const api = apiEntry.version
    const cli = cliEntry.version

    expect(
      rust.major === api.major && rust.minor === api.minor,
      `Tauri Rust crate (${rust.raw}) and npm @tauri-apps/api (${api.raw}) are on ` +
        `different minors. \`tauri build\` hard-fails on this exact mismatch — bump ` +
        `both apps/desktop/Cargo.toml's "tauri" dependency and package.json's ` +
        `"@tauri-apps/api" dependency together to a matching version.`,
    ).toBe(true)

    expect(
      rust.major === cli.major && rust.minor === cli.minor,
      `Tauri Rust crate (${rust.raw}) and npm @tauri-apps/cli (${cli.raw}) are on ` +
        `different minors. A drifted CLI can silently change its accepted argument ` +
        `shapes (e.g. dropping support for a positional project path) independently ` +
        `of the crate/api pair — bump package.json's "@tauri-apps/cli" dependency to ` +
        `match apps/desktop/Cargo.toml's "tauri" dependency.`,
    ).toBe(true)
  })

  test('all three Tauri packages are pinned to an exact version, not a floating range', () => {
    for (const { label, raw } of readAllTauriVersions()) {
      if (label.startsWith('apps/desktop/Cargo.toml')) {
        // Cargo exact pins use a leading "=" (e.g. "=2.11.1").
        expect(
          raw.startsWith('='),
          `${label} version ("${raw}") must be an exact pin (e.g. "=2.11.1") so cargo ` +
            `cannot resolve a different minor than the npm packages.`,
        ).toBe(true)
      } else {
        // npm/bun exact pins simply omit any range operator (no "^", "~", "*", or bare major).
        expect(
          /^\d+\.\d+\.\d+/.test(raw),
          `${label} version ("${raw}") must be an exact pin (no "^"/"~" prefix) so bun ` +
            `cannot resolve a different minor than the Rust crate.`,
        ).toBe(true)
      }
    }
  })
})
