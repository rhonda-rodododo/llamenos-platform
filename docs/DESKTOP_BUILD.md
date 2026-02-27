# Desktop Build Guide

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Rust | 1.85+ | [rustup.rs](https://rustup.rs) |
| Bun | latest | [bun.sh](https://bun.sh) |
| Tauri CLI | 2.x | `bun install` (included as devDep) |

### Linux (Debian/Ubuntu)

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev
```

### macOS

```bash
xcode-select --install
```

### Windows

Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-studio-build-tools/) with "Desktop development with C++".

## Setup

```bash
# Clone both repos as siblings
git clone git@github.com:rhonda-rodododo/llamenos.git
git clone git@github.com:rhonda-rodododo/llamenos-core.git

# Install dependencies
cd llamenos
bun install

# Or use the setup script
./scripts/dev-setup.sh
```

Both `llamenos` and `llamenos-core` must be in the same parent directory — `src-tauri/Cargo.toml` references `../../llamenos-core` as a path dependency.

## Development

```bash
bun run tauri:dev
```

This starts:
1. Vite dev server (port 5173)
2. Rust compilation + Tauri window

Hot reloading works for the frontend. Rust changes require a restart.

## Release Build

```bash
bun run tauri:build
```

Outputs platform-specific installers to `src-tauri/target/release/bundle/`.

## Type Checking

```bash
bun run typecheck
```

Always run before committing.

## Running E2E Tests

### Playwright (Web Mock)

Tests run against a mock IPC layer (no Rust backend):

```bash
bun run test              # Run all tests
bun run test:ui           # Playwright UI mode
bun run test -- --grep "smoke"  # Run specific tests
```

### WebdriverIO (Desktop)

Tests run against the real Tauri app:

```bash
bun run test:desktop
```

## Flatpak Build

```bash
flatpak-builder --user --install build-dir flatpak/org.llamenos.Hotline.yml
```

Requires `flatpak-builder` and GNOME Platform 47 runtime.

## Version Management

All version files are synced from `package.json`:

```bash
# Check version sync
./scripts/sync-versions.sh

# Fix mismatches
./scripts/sync-versions.sh --fix

# Bump version (updates all files, tags, changelog)
bun run version:bump patch "Bug fix release"
```

## Troubleshooting

### `llamenos-core` not found

Ensure `llamenos-core` is cloned as a sibling:
```
parent/
  llamenos/          # this repo
  llamenos-core/     # crypto crate
```

### Rust compilation slow

First build compiles all dependencies (~5 min). Subsequent builds are incremental (~10s).

### WebKit not found (Linux)

Install the dev package for your distro. On Ubuntu: `sudo apt install libwebkit2gtk-4.1-dev`.
