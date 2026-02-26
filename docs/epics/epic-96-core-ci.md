# Epic 96: llamenos-core CI/CD Pipeline

**Status**: In Progress
**Created**: 2026-02-26
**Depends on**: None (standalone repo)

## Goal

Set up GitHub Actions CI/CD for the `llamenos-core` Rust crate so that every push runs tests, lints, and builds all three targets (native, WASM, UniFFI), and tagged releases publish artifacts.

## Scope

- GitHub Actions workflow for `llamenos-core` repo (`ci.yml`)
- Rust toolchain setup (stable + wasm32-unknown-unknown target)
- `cargo test`, `cargo clippy`, `cargo fmt --check` on every push/PR
- WASM build verification (`wasm-pack build`)
- UniFFI binding generation check
- Crate publish readiness validation (dry-run)
- Artifact caching (cargo registry, target dir) for faster builds
- Branch protection rules requiring CI pass

## Files Created/Modified

- `~/projects/llamenos-core/.github/workflows/ci.yml`
- `~/projects/llamenos-core/.github/workflows/release.yml` (optional, for tagged releases)

## Dependencies

- `llamenos-core` repo must exist at `~/projects/llamenos-core`
- GitHub repo created and pushed
