# Epic 200: Monorepo Foundation

## Goal

Restructure the repository into a Bun + Cargo workspace monorepo without breaking the existing desktop app, worker, or CI. This is the foundation for absorbing `llamenos-core` and adding native iOS/Android clients.

## Context

Currently the repo has a flat structure:
- `src-tauri/` — Tauri desktop shell (Rust)
- `src/worker/` — Cloudflare Worker backend
- `src/shared/` — Cross-boundary types + config
- `src/client/` — Frontend SPA (stays in place)
- `src/platform/` — Node.js platform abstraction (stays in place)

The target structure follows the proven `buildit` monorepo pattern, adapted for llamenos:

```
llamenos/
├── apps/
│   ├── desktop/          # Tauri app (moved from src-tauri/)
│   └── worker/           # Cloudflare Worker (moved from src/worker/)
├── packages/
│   └── shared/           # Cross-platform types (moved from src/shared/)
├── src/
│   ├── client/           # Desktop frontend (STAYS — Tauri embeds this)
│   └── platform/         # Node.js platform abstraction (STAYS)
├── site/                 # Marketing site (unchanged)
├── tests/                # Playwright E2E (unchanged)
├── docs/                 # Documentation (unchanged)
├── Cargo.toml            # NEW: Workspace root (virtual manifest)
└── package.json          # UPDATED: Bun workspace config
```

### Key Decision: `apps/` vs `clients/`

Buildit uses `clients/` for all platform clients. Llamenos uses `apps/` because:
- The worker is an "app" not a "client" — `apps/worker/` reads more naturally than `clients/worker/`
- The desktop Tauri shell is an "app" wrapper around the web UI in `src/client/`
- When iOS/Android are added later, `apps/ios/` and `apps/android/` fit well

### Key Decision: No Cargo Workspace (yet)

Buildit does NOT use a Cargo workspace — just path dependencies. We'll follow the same pattern initially. A virtual Cargo workspace manifest can be added later if/when we have multiple Rust crates that benefit from shared `target/` caching. For now, `apps/desktop/Cargo.toml` just uses `path = "../../packages/crypto"` (after Epic 201 absorbs the crate).

## Files to Move

### 1. `src-tauri/` → `apps/desktop/`

All files move. Key path updates:

| File | Change |
|------|--------|
| `apps/desktop/tauri.conf.json` | `frontendDist`: `"../dist/client"` → `"../../dist/client"` |
| `apps/desktop/tauri.conf.json` | `beforeDevCommand`: add `--cwd` to run from repo root |
| `apps/desktop/tauri.conf.json` | `beforeBuildCommand`: add `--cwd` to run from repo root |
| `apps/desktop/Cargo.toml` | `llamenos-core` path: `"../../llamenos-core"` → `"../../../llamenos-core"` (temporary until Epic 201) |

**Tauri CLI invocation**: `cargo tauri dev --project-path apps/desktop` or use `bun run --cwd apps/desktop tauri dev`. The buildit pattern uses `--project-path` in root scripts:
```json
"tauri:dev": "cargo tauri dev --project-path apps/desktop",
"tauri:build": "cargo tauri build --project-path apps/desktop"
```

However, Tauri CLI `--project-path` is only available in recent versions. An alternative is `beforeDevCommand` using `$(git rev-parse --show-toplevel)` like buildit:
```json
"beforeDevCommand": "bun run --cwd $(git rev-parse --show-toplevel) dev:vite",
"beforeBuildCommand": "bun run --cwd $(git rev-parse --show-toplevel) build"
```

**The `frontendDist` path** is relative to `tauri.conf.json` location. From `apps/desktop/`, the built frontend at `dist/client/` is `../../dist/client`.

### 2. `src/worker/` → `apps/worker/`

The worker code has ~65 relative imports to `../../shared/`, `../shared/`, and `../../../shared/`. These must ALL be converted to `@shared/` alias imports BEFORE the move.

Current relative imports (from grep):
```
src/worker/types.ts         → from '../shared/types'
src/worker/durable-objects/* → from '../../shared/...'
src/worker/routes/*          → from '../../shared/...'
src/worker/messaging/sms/*   → from '../../../shared/...'
src/worker/messaging/rcs/*   → from '../../../shared/...'
```

**Step 1**: Convert all relative shared imports to `@shared/` alias:
```bash
# ../shared/ (1 file: types.ts)
# ../../shared/ (52 files)
# ../../../shared/ (12 files)
find src/worker -name '*.ts' -exec sed -i \
  "s|from '\.\./shared/|from '@shared/|g;
   s|from \"\.\./shared/|from \"@shared/|g;
   s|from '\.\./\.\./shared/|from '@shared/|g;
   s|from \"\.\./\.\./shared/|from \"@shared/|g;
   s|from '\.\./\.\./\.\./shared/|from '@shared/|g;
   s|from \"\.\./\.\./\.\./shared/|from \"@shared/|g" {} +
```

**Step 2**: `git mv src/worker apps/worker`

**Step 3**: Update `wrangler.jsonc`:
```jsonc
"main": "apps/worker/index.ts"  // was "src/worker/index.ts"
```

### 3. `src/shared/` → `packages/shared/`

This is used by:
- **Client code** (`src/client/`) — via `@shared/` Vite alias → no import changes needed
- **Worker code** (`apps/worker/`) — via `@shared/` alias after Step 1 above → no import changes needed
- **Test mocks** (`tests/mocks/crypto-impl.ts`) — via `@shared/` alias → no import changes needed
- **Platform code** (`src/platform/`) — no direct imports (verified by grep)

Only the alias resolution paths need updating.

## Config File Changes

### `package.json`

Add Bun workspaces. Note: `apps/desktop/` (Rust) and future `apps/ios/` (Swift), `apps/android/` (Kotlin) are NOT Bun workspaces — they don't have `package.json` files. Only JS/TS projects need to be listed.

```json
{
  "workspaces": [
    "packages/*",
    "site"
  ],
  "scripts": {
    "tauri:dev": "bunx tauri dev --project-path apps/desktop",
    "tauri:build": "bunx tauri build --project-path apps/desktop",
    "tauri:icon": "bunx tauri icon --project-path apps/desktop",
    "dev:worker": "bunx wrangler dev",
    "test:desktop": "bunx wdio tests/desktop/wdio.conf.ts"
  }
}
```

The `dev`, `build`, `typecheck`, `test` scripts stay the same (they operate on the root project).

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/client/*"],
      "@worker/*": ["./apps/worker/*"],
      "@shared/*": ["./packages/shared/*"]
    }
  },
  "include": ["src/**/*", "apps/**/*", "packages/**/*", "vite.config.ts"]
}
```

### `vite.config.ts`

```typescript
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src/client'),
    '@shared': path.resolve(__dirname, './packages/shared'),
  },
}
```

### `wrangler.jsonc`

```jsonc
"main": "apps/worker/index.ts"
```

The `dist/client` assets path stays the same (relative to repo root where wrangler runs).

### `apps/desktop/tauri.conf.json`

Since we use `bunx tauri dev --project-path apps/desktop` from the repo root, Tauri's own
cwd is already the repo root. The `beforeDevCommand` can use simple commands without
`$(git rev-parse ...)` shell substitution (which fails on Windows cmd.exe):

```json
{
  "build": {
    "beforeDevCommand": "bun run dev:vite",
    "beforeBuildCommand": "bun run build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../../dist/client"
  }
}
```

Note: Tauri v2 runs `beforeDevCommand` from the project directory. With `--project-path apps/desktop`, the working directory for these commands is `apps/desktop/`. If Vite needs to run from the repo root, use the root `package.json` scripts which handle paths correctly. Test on Windows before merging.

### `apps/desktop/Cargo.toml`

Temporary (until Epic 201 absorbs the crate):
```toml
llamenos-core = { path = "../../../llamenos-core" }
```

### `esbuild.node.mjs`

Update path alias resolution:
```javascript
build.onResolve({ filter: /^@worker\// }, (args) => ({
  path: resolveWithExtensions(path.resolve('apps/worker', args.path.replace('@worker/', ''))),
}))
build.onResolve({ filter: /^@shared\// }, (args) => ({
  path: resolveWithExtensions(path.resolve('packages/shared', args.path.replace('@shared/', ''))),
}))
```

### `playwright.config.ts`

The web server command needs updating if it references worker paths. Currently it runs `PLAYWRIGHT_TEST=true bun run build && bunx wrangler dev --port 8788` — this should still work since wrangler reads `wrangler.jsonc` from the root.

No changes needed to playwright.config.ts itself.

## CI Workflow Changes

### `.github/workflows/ci.yml`

The `APP_PATTERNS` regex for change detection needs updating:
```bash
APP_PATTERNS="^src/|^apps/|^packages/|^tests/|^playwright|^wrangler|^vite|^tsconfig|^package\.json|^bun\.lockb|^deploy/"
```

### `.github/workflows/desktop-e2e.yml`

- Path triggers: `src-tauri/**` → `apps/desktop/**`
- Rust cache workspace: `src-tauri` → `apps/desktop`
- sed command for llamenos-core: update `src-tauri/Cargo.toml` → `apps/desktop/Cargo.toml`

### `.github/workflows/tauri-release.yml`

- Rust cache workspace: `src-tauri` → `apps/desktop`
- sed command for llamenos-core path
- `tauri.conf.json` path: `src-tauri/tauri.conf.json` → `apps/desktop/tauri.conf.json`
- Artifact paths: `src-tauri/target/` → `apps/desktop/target/`

## Script Changes

### `scripts/bump-version.ts`

```typescript
const TAURI_CONF_PATH = resolve(ROOT, 'apps/desktop/tauri.conf.json')
const CARGO_TOML_PATH = resolve(ROOT, 'apps/desktop/Cargo.toml')
```

And the git add command:
```typescript
run('git add package.json apps/desktop/tauri.conf.json apps/desktop/Cargo.toml deploy/helm/llamenos/Chart.yaml flatpak/org.llamenos.Hotline.metainfo.xml')
```

### `scripts/sync-versions.sh`

```bash
TAURI_CONF="$ROOT/apps/desktop/tauri.conf.json"
CARGO_TOML="$ROOT/apps/desktop/Cargo.toml"
```

### `tests/desktop/wdio.conf.ts`

```typescript
const application = path.resolve(__dirname, '..', '..', 'apps', 'desktop', 'target', 'debug', binaryName)
```

### `flatpak/org.llamenos.Hotline.yml`

Update all `src-tauri` references to `apps/desktop`:
```yaml
- cd apps/desktop && cargo build --release --no-default-features --features custom-protocol
- install -Dm755 apps/desktop/target/release/llamenos-desktop /app/bin/llamenos-desktop
- install -Dm644 apps/desktop/icons/128x128.png ...
- install -Dm644 apps/desktop/icons/32x32.png ...
```

Also update the llamenos-core symlink:
```yaml
# Symlink llamenos-core as expected by Cargo.toml path dep
- ln -sf /run/build/llamenos-core ../../../llamenos-core
```

## Documentation Changes

Update `CLAUDE.md` directory structure section, path aliases section, and development commands to reflect new paths. Update `README.md` if it references `src-tauri/`.

## Verification Checklist

After all changes:
1. `bun install` — succeeds
2. `bun run typecheck` — passes
3. `bun run build` — Vite production build succeeds
4. `bun run dev:vite` — Vite dev server starts
5. `bun run dev:worker` — wrangler dev server starts
6. `bun run test` — Playwright E2E tests pass (webServer starts wrangler correctly)
7. `bun run build:node` — esbuild Node.js server build succeeds
8. `bun run tauri:dev` — Tauri desktop app launches (requires llamenos-core sibling)
9. All CI workflow paths reference correct directories

## Risk Assessment

- **Low risk**: Vite alias updates, tsconfig path updates — straightforward find-and-replace
- **Medium risk**: Tauri `beforeDevCommand`/`beforeBuildCommand` with `$(git rev-parse --show-toplevel)` — shell expansion must work on macOS, Linux, and Windows CI
- **Medium risk**: Worker relative import conversion — 65 files, must catch all patterns
- **Low risk**: CI workflow updates — path triggers and artifact paths are declarative
- **Mitigation**: Run full verification checklist before committing. Git preserves history through `git mv`.

## Dependencies

- None (this is the foundation epic)

## Blocked By

- Nothing

## Blocks

- Epic 201 (Absorb llamenos-core)
- Epic 202 (Protocol Schema & Codegen)
- Epic 203 (Workers Restructuring)
- Epic 204 (CI/CD Consolidation)
- Epic 205 (i18n Package Extraction)
