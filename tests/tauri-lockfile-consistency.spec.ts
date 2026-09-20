/**
 * `apps/desktop/Cargo.lock` <-> `apps/desktop/Cargo.toml` consistency.
 *
 * PR #895 (pinning `tauri`/`@tauri-apps/api` to matching exact versions —
 * see `tauri-version-alignment.spec.ts`) was flagged in review because its
 * `Cargo.lock` diff dropped the openmls/hpke-rs/libcrux dependency closure
 * (648 deleted lines) while `packages/crypto/Cargo.toml` still declares
 * `openmls = "0.9"`. That looked like an unreproducible, out-of-scope
 * lockfile rewrite.
 *
 * It wasn't. `mls` is an explicitly default-off feature on `llamenos-core`
 * (`packages/crypto/Cargo.toml`, decision recorded in #708): the
 * openmls -> hpke-rs -> libcrux chain carries aarch64 constant-time-timing
 * RUSTSEC advisories, so it is gated out of every shipped binary — mobile,
 * server, and desktop alike — unless a consumer opts in with
 * `--features mls`. `apps/desktop/Cargo.toml`'s `llamenos-core = { path =
 * "../../packages/crypto" }` dependency requests no features, so it never
 * activates `mls`, and the closure was never reachable from
 * `apps/desktop/Cargo.lock`'s resolved graph in the first place.
 *
 * Verified empirically while fixing the review's follow-up: restoring
 * `apps/desktop/Cargo.lock` to its pre-PR content and re-running EITHER
 * `cargo generate-lockfile` (full regen) OR the minimal
 * `cargo update -p tauri --precise 2.11.1` (scoped, PR-appropriate update)
 * both reproduce the PR's committed lockfile byte-for-byte — the openmls
 * entries that main's stale lockfile carried were themselves inconsistent
 * with the manifest (locked at openmls 0.8.1 / openmls_rust_crypto 0.5.1,
 * which does not satisfy the "0.9"/"0.6" requirement `packages/crypto`
 * actually declares) and get pruned by any cargo operation that touches the
 * file, full regen or scoped update alike. So the PR's lockfile was already
 * the unique, reproducible, `--locked`-satisfying result — and it is also
 * the *secure* one, matching the mls exclusion `packages/crypto/CLAUDE.md`
 * documents.
 *
 * This is the rail that keeps it that way: `cargo metadata --locked` is
 * cargo's own consistency check, run without a full compile. It fails
 * loudly the moment `Cargo.lock` stops satisfying `Cargo.toml` for any
 * reason (a real dependency bump forgotten from the lockfile, not just this
 * specific incident) — the exact class of drift `cargo build --locked`
 * would also catch, at a fraction of the cost.
 *
 * Mutation check performed while authoring this test: temporarily bumping
 * `apps/desktop/Cargo.toml`'s `tauri` requirement to a version the
 * committed lockfile can't satisfy (`=2.99.0`, which doesn't exist) made
 * `cargo metadata --locked` fail with cargo's own
 * `failed to select a version for the requirement` error (exit 101);
 * restoring the real pin made it pass again (see PR body for output).
 */

import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')
const DESKTOP_CARGO_TOML = resolve(REPO_ROOT, 'apps/desktop/Cargo.toml')

test.describe('Tauri desktop Cargo.lock consistency', () => {
  test('apps/desktop/Cargo.lock satisfies apps/desktop/Cargo.toml under --locked', () => {
    let failure: string | null = null
    try {
      execFileSync(
        'cargo',
        ['metadata', '--locked', '--format-version', '1', '--manifest-path', DESKTOP_CARGO_TOML],
        { stdio: 'pipe', timeout: 60_000 },
      )
    } catch (err) {
      const stderr = err && typeof err === 'object' && 'stderr' in err ? String((err as { stderr: unknown }).stderr) : String(err)
      failure = stderr
    }

    expect(
      failure === null,
      `apps/desktop/Cargo.lock no longer satisfies apps/desktop/Cargo.toml under ` +
        `\`cargo metadata --locked\` (the same check \`cargo build --locked\` performs). ` +
        `Run \`cargo update -p <changed-crate> --precise <version>\` (a scoped update, ` +
        `never a bare \`cargo generate-lockfile\`, which re-resolves everything and ` +
        `produces an unreviewable diff) from apps/desktop/, then commit the resulting ` +
        `Cargo.lock alongside the manifest change.\n\ncargo stderr:\n${failure}`,
    ).toBe(true)
  })
})
