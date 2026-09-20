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
 * The fix is to pin both to the same exact version (no `^`, `~`, or bare
 * major) so they cannot drift independently. This test is the rail: it reads
 * the two manifests directly (the same failure mode the CLI's own check
 * reacts to) and fails loudly if their major.minor ever disagree again, or if
 * either reverts to a floating range that hides the minor entirely.
 *
 * Mutation check performed while authoring this test (see PR body for the
 * actual output): setting the two versions to different minors made the test
 * fail with the expected message; restoring the matching pin made it pass.
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

function readCargoTauriVersion(): MajorMinor {
  const contents = readFileSync(CARGO_TOML_PATH, 'utf-8')
  // Matches both `tauri = "2.11.1"` and `tauri = { version = "2.11.1", ... }`,
  // anchored to the start of a line so `tauri-build`/`tauri-plugin-*` never match.
  const match = contents.match(/^tauri\s*=\s*(?:"([^"]+)"|\{[^}]*version\s*=\s*"([^"]+)")/m)
  if (!match) {
    throw new Error(`Could not find a top-level "tauri" dependency in ${CARGO_TOML_PATH}`)
  }
  const version = match[1] ?? match[2]
  return parseMajorMinor(version, `apps/desktop/Cargo.toml "tauri" dependency`)
}

function readNpmTauriApiVersion(): MajorMinor {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as {
    dependencies?: Record<string, string>
  }
  const version = pkg.dependencies?.['@tauri-apps/api']
  if (!version) {
    throw new Error(`package.json has no "@tauri-apps/api" entry under "dependencies"`)
  }
  return parseMajorMinor(version, `package.json "@tauri-apps/api" dependency`)
}

test.describe('Tauri version alignment', () => {
  test('Rust tauri crate and npm @tauri-apps/api pin the same major.minor', () => {
    const rust = readCargoTauriVersion()
    const npm = readNpmTauriApiVersion()

    expect(
      rust.major === npm.major && rust.minor === npm.minor,
      `Tauri Rust crate (${rust.raw}) and npm @tauri-apps/api (${npm.raw}) are on ` +
        `different minors. \`tauri build\` hard-fails on this exact mismatch — bump ` +
        `both apps/desktop/Cargo.toml's "tauri" dependency and package.json's ` +
        `"@tauri-apps/api" dependency together to a matching version.`,
    ).toBe(true)
  })

  test('both dependencies are pinned to an exact version, not a floating range', () => {
    const cargoRaw = readFileSync(CARGO_TOML_PATH, 'utf-8')
      .match(/^tauri\s*=\s*(?:"([^"]+)"|\{[^}]*version\s*=\s*"([^"]+)")/m)
    const npmRaw = (
      JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as { dependencies?: Record<string, string> }
    ).dependencies?.['@tauri-apps/api']

    expect(cargoRaw, 'expected to find the tauri dependency in Cargo.toml').toBeTruthy()
    const cargoVersion = cargoRaw![1] ?? cargoRaw![2]

    // Cargo exact pins use a leading "=" (e.g. "=2.11.1"); npm/bun exact pins
    // simply omit any range operator (no "^", "~", "*", or bare major).
    expect(
      cargoVersion.startsWith('='),
      `apps/desktop/Cargo.toml's "tauri" version ("${cargoVersion}") must be an exact ` +
        `pin (e.g. "=2.11.1") so cargo cannot resolve a different minor than npm.`,
    ).toBe(true)
    expect(
      /^\d+\.\d+\.\d+/.test(npmRaw ?? ''),
      `package.json's "@tauri-apps/api" version ("${npmRaw}") must be an exact pin ` +
        `(no "^"/"~" prefix) so bun cannot resolve a different minor than cargo.`,
    ).toBe(true)
  })
})
