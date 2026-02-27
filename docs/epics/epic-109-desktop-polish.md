# Epic 109: Desktop Polish & Release Prep

**Status: COMPLETE**
**Repo**: llamenos

## Summary

Final polish for desktop app before first tagged release.

## Deliverables

### Version Sync
- `src-tauri/tauri.conf.json` version synced to 0.18.0 (was 0.1.0)
- `src-tauri/Cargo.toml` version synced to 0.18.0 (was 0.1.0)

### Tray Menu Enhancements
- **Show / Hide** toggle (replaces simple "Show Hotline") — toggles window visibility
- **Check for Updates...** (updater feature only) — emits `check-for-updates` event to frontend
- **About Hotline v{version}** — shows version, navigates to settings
- **Separator** lines between groups
- **Quit Hotline** (renamed from "Quit") — zeroizes crypto state before exit
- **Double-click** tray icon to show/focus window

### Version Bump Script
- Updated `scripts/bump-version.ts` to sync all 5 version files
