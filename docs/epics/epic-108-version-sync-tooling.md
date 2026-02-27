# Epic 108: Version Sync & Developer Tooling

**Status: COMPLETE**
**Repos**: All three

## Summary

Automate version management across all three repos and improve developer setup.

## Deliverables

1. `scripts/sync-versions.sh` — checks & fixes version mismatches across all versioned files
2. `scripts/bump-version.ts` — updated to sync all 4 version files (package.json, tauri.conf.json, Cargo.toml, Chart.yaml, metainfo.xml)
3. `scripts/dev-setup.sh` — developer onboarding script (in all 3 repos)

## Version Files Synced

| File | Field |
|------|-------|
| `package.json` | `version` (source of truth) |
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.toml` | `version` |
| `deploy/helm/llamenos/Chart.yaml` | `appVersion` |
| `flatpak/org.llamenos.Hotline.metainfo.xml` | `<release version>` |
