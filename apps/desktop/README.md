# apps/desktop

Tauri v2 desktop shell for Llamenos. Native Rust backend + webview frontend (Vite + React + TanStack Router).

## Architecture

- **Rust backend** (`src/lib.rs`, `src/crypto.rs`): Tauri IPC handlers, plugin setup, system tray. All cryptographic operations run here via `packages/crypto/` — private keys **never** enter the webview.
- **Webview frontend** (`src/client/`): React SPA. Crypto calls go through `src/client/lib/platform.ts` which issues Tauri IPC commands. Never import from `@tauri-apps/*` directly — always use `platform.ts`.

## Prerequisites

- Rust 1.85+ (`rustup`)
- Bun
- Tauri CLI (included as dev dependency)
- **Linux**: `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`
- **macOS**: `xcode-select --install`
- **Windows**: Visual Studio Build Tools with "Desktop development with C++"

## Commands

```bash
bun run tauri:dev      # Development mode (Vite hot reload + Rust)
bun run tauri:build    # Release build → apps/desktop/target/release/bundle/
bun run typecheck      # TypeScript type check
bun run test           # Playwright E2E tests (uses Tauri IPC mock layer)
bun run test:desktop   # Full desktop E2E suite
```

## Tauri IPC Mock (for Playwright)

E2E tests run in a regular browser. `PLAYWRIGHT_TEST=true` triggers Vite aliases that replace `@tauri-apps/api/core` and `@tauri-apps/plugin-store` with JS mock implementations in `tests/mocks/`. The mock maintains a `CryptoState` that mirrors the Rust side.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib.rs` | Tauri app setup, plugin registration, tray, IPC command registration |
| `src/crypto.rs` | IPC command wrappers delegating to `packages/crypto` |
| `tauri.conf.json` | Tauri config (CSP, window config, bundle identifiers) |
| `capabilities/` | Tauri capability permissions |
| `Cargo.toml` | Rust dependencies including `../../packages/crypto` path dep |

## Version Management

Versions are managed by **knope** — never manually edit `tauri.conf.json` version fields. Use `bun run version:bump`.

## Flatpak

```bash
flatpak-builder --user --install build-dir flatpak/org.llamenos.Hotline.yml
```

Requires `flatpak-builder` and GNOME Platform runtime.
