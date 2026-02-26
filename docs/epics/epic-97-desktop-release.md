# Epic 97: Desktop Release Pipeline

**Status**: In Progress
**Created**: 2026-02-26
**Depends on**: Epic 95 (Deployment Architecture), Epic 96 (Core CI)

## Goal

Automate Tauri desktop builds and releases via GitHub Actions so that tagged commits produce signed binaries for Linux, macOS, and Windows, published as GitHub Releases with checksums and SLSA provenance.

## Scope

- GitHub Actions workflow (`release-desktop.yml`) triggered on version tags
- Matrix build: Linux (AppImage, .deb), macOS (universal .dmg), Windows (.msi, .exe)
- Code signing setup (Apple notarization, Windows Authenticode, Linux GPG)
- `CHECKSUMS.txt` generation and attestation (SLSA provenance via `slsa-framework/slsa-github-generator`)
- Tauri updater JSON endpoint generation (`latest.json` for auto-update)
- Upload artifacts to GitHub Releases
- CI workflow (`ci.yml`) for PRs: typecheck, build, Playwright E2E tests
- Reproducible build verification (Epic 79 `SOURCE_DATE_EPOCH` integration)

## Files Created/Modified

- `.github/workflows/release-desktop.yml`
- `.github/workflows/ci.yml`
- `src-tauri/tauri.conf.json` (updater endpoint config)
- `scripts/verify-build.sh` (update for new artifact paths)

## Dependencies

- Epic 95 complete (deployment architecture settled)
- Epic 96 complete (llamenos-core CI ensures crate builds)
- Apple Developer account for notarization
- Windows code signing certificate
- GitHub repository secrets configured
