# Epic 94: Build Cleanup & Dead Code Removal

**Status**: Planned
**Depends on**: Epic 93 (Tauri-Only TS Migration)

## Goal

Remove all web/browser-only code, dead files, and unused dependencies now that the app is Tauri-only. Simplify the Vite config and CI/CD pipeline.

## Phase 1: Delete Dead Files

### Files to Delete

| File | Reason |
|------|--------|
| `src/client/lib/crypto.ts` | All callers now use `platform.ts` → Rust IPC |
| `src/client/lib/key-store.ts` | All storage now via Tauri Store (`keys.json`). `platform.ts` handles persistence |
| `src/client/lib/sri-workbox-plugin.ts` | PWA/service worker SRI — no service workers in Tauri |
| `src/client/components/pwa-install-banner.tsx` | PWA install prompt — not applicable to desktop |
| `src/client/lib/use-pwa-install.ts` | PWA install hook — not applicable to desktop |

### Verify No Remaining Imports

Before deleting, verify with grep:

```bash
# Should return zero results after Epic 93 migration:
grep -r "from './crypto'" src/client/
grep -r "from '../crypto'" src/client/
grep -r "from '@/lib/crypto'" src/client/

# key-store.ts — should only be imported from platform.ts type re-exports:
grep -r "from './key-store'" src/client/
grep -r "from '../key-store'" src/client/
grep -r "from '@/lib/key-store'" src/client/

# PWA files:
grep -r "pwa-install-banner" src/client/
grep -r "use-pwa-install" src/client/
grep -r "sri-workbox-plugin" .
```

### Move Types Out of crypto.ts

Before deleting `crypto.ts`, move the type definitions that other files still need to `src/shared/types.ts` or a new `src/client/lib/crypto-types.ts`:

```typescript
// Types currently defined in crypto.ts and used elsewhere:
export interface KeyEnvelope {
  wrappedKey: string
  ephemeralPubkey: string
}

export interface RecipientKeyEnvelope extends KeyEnvelope {
  pubkey: string
}
```

These types are already referenced in `platform.ts` via:
```typescript
import type { KeyEnvelope, RecipientKeyEnvelope } from './crypto'
```

**Approach**: Move to `src/shared/types.ts` where other shared types already live. Update all imports:

```typescript
// platform.ts:
import type { KeyEnvelope, RecipientKeyEnvelope } from '@shared/types'

// hub-key-manager.ts:
import type { KeyEnvelope, RecipientKeyEnvelope } from '@shared/types'
```

Check if `RecipientKeyEnvelope` and `KeyEnvelope` already exist in `@shared/types.ts` — they may already be defined there for the worker-side code.

## Phase 2: Vite Config Simplification

### Current State (`vite.config.ts`)

```typescript
import { VitePWA } from 'vite-plugin-pwa'
import { sriWorkboxPlugin } from './src/client/lib/sri-workbox-plugin'

const isTauriDev = !!process.env.TAURI_ENV_PLATFORM

// PWA conditionally loaded
...(!isTauriDev ? [VitePWA({...}), sriWorkboxPlugin()] : []),

// Build target conditional
...(isTauriDev ? { target: 'esnext' } : {}),

// Server config conditional
...(isTauriDev ? { host: '0.0.0.0', strictPort: true } : {}),
```

### After Cleanup

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import path from 'path'
import { readFileSync } from 'fs'

const buildTime = process.env.SOURCE_DATE_EPOCH
  ? new Date(parseInt(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  : new Date().toISOString()
const buildCommit = process.env.GITHUB_SHA || 'dev'
const buildVersion = JSON.parse(readFileSync('./package.json', 'utf-8')).version

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/client/routes',
      generatedRouteTree: './src/client/routeTree.gen.ts',
    }),
    react(),
    tailwindcss(),
    // No PWA — desktop app uses Tauri native window management
  ],
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/client'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
    conditions: ['import', 'module', 'default'],
  },
  define: {
    '__BUILD_TIME__': JSON.stringify(buildTime),
    '__BUILD_COMMIT__': JSON.stringify(buildCommit),
    '__BUILD_VERSION__': JSON.stringify(buildVersion),
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    target: 'esnext', // Always modern — Tauri webview only
  },
  server: {
    host: process.env.TAURI_DEV_HOST || '0.0.0.0',
    strictPort: true,
  },
})
```

**Removed**:
- `VitePWA` import and plugin configuration
- `sriWorkboxPlugin` import and usage
- `isTauriDev` variable and all conditionals
- `__TAURI__` define constant (always true now, can be removed from code that checks it)

## Phase 3: Remove PWA Banner from Root Layout

### `src/client/routes/__root.tsx`

Remove the `PwaInstallBanner` component import and rendering:

```typescript
// BEFORE:
import { PwaInstallBanner } from '@/components/pwa-install-banner'
// ... in AuthenticatedLayout:
<PwaInstallBanner />

// AFTER:
// Remove import and JSX element entirely
```

## Phase 4: Update panic-wipe.ts

### Current State

`panic-wipe.ts` (lines 60-67) unregisters service workers:

```typescript
// Unregister service workers
try {
  navigator.serviceWorker?.getRegistrations().then(registrations => {
    registrations.forEach(reg => reg.unregister())
  }).catch(() => {})
} catch {
  // SW API may be unavailable
}
```

### After Cleanup

Remove the service worker unregistration block. Add Tauri Store cleanup:

```typescript
import * as keyManager from './key-manager'

export function performPanicWipe(): void {
  panicWipeCallback?.()

  try {
    keyManager.wipeKey()
  } catch {}

  setTimeout(async () => {
    try { localStorage.clear() } catch {}
    try { sessionStorage.clear() } catch {}

    // Clear IndexedDB databases
    try {
      if (typeof indexedDB !== 'undefined') {
        indexedDB.databases?.().then(dbs => {
          dbs.forEach(db => {
            if (db.name) indexedDB.deleteDatabase(db.name)
          })
        }).catch(() => {})
      }
    } catch {}

    // Clear Tauri Store data
    try {
      const { Store } = await import('@tauri-apps/plugin-store')
      for (const name of ['keys.json', 'settings.json', 'drafts.json']) {
        try {
          const store = await Store.load(name)
          await store.clear()
          await store.save()
        } catch {}
      }
    } catch {}

    window.location.href = '/login'
  }, FLASH_DURATION_MS)
}
```

## Phase 5: localStorage → Tauri Store Migration

This is a quality improvement that can be done opportunistically during this epic or deferred.

### Keys to Migrate

| localStorage Key | New Location | Priority |
|-----------------|-------------|----------|
| `llamenos-encrypted-key` | Already in Tauri Store (`keys.json`) after Epic 81 | Done |
| `llamenos-lock-delay` | `settings.json` → `lockDelay` | Medium |
| `llamenos-theme` | `settings.json` → `theme` | Medium |
| `llamenos-lang` | `settings.json` → `language` | Medium |
| `llamenos-notification-prefs` | `settings.json` → `notifications` | Medium |
| `llamenos-draft:*` | `drafts.json` → `{key: encryptedValue}` | Low |
| `llamenos-pwa-install-dismissed` | Delete (PWA removed) | Delete |

### Migration Pattern

For each setting, create a thin wrapper that reads/writes via Tauri Store:

```typescript
// src/client/lib/settings-store.ts
import { Store } from '@tauri-apps/plugin-store'

let _store: Awaited<ReturnType<typeof Store.load>> | null = null

async function getStore() {
  if (!_store) _store = await Store.load('settings.json')
  return _store
}

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const store = await getStore()
  const value = await store.get<T>(key)
  return value ?? defaultValue
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const store = await getStore()
  await store.set(key, value)
  await store.save()
}
```

**Decision**: Defer Tauri Store migration for settings to a future cleanup epic. The localStorage approach works fine in Tauri's webview and the migration adds complexity without security benefit (settings aren't secrets). Focus this epic on deleting dead code.

## Phase 6: Dependency Cleanup

### Remove

```bash
bun remove vite-plugin-pwa
```

### Evaluate

| Package | Can remove? | Reason to keep |
|---------|------------|---------------|
| `@noble/curves` | **Keep** | Still used in `file-crypto.ts` for `encryptMetadataForPubkey` (ephemeral ECDH), `provisioning.ts` |
| `@noble/ciphers` | **Keep** | File content encryption, hub symmetric ops |
| `@noble/hashes` | **Keep** | `bytesToHex`/`hexToBytes` utils still used in several files |
| `nostr-tools` | **Keep** | `verifyEvent` still used in relay event validation, `nip19` used in provisioning |
| `@simplewebauthn/*` | **Keep** | WebAuthn still works alongside nsec auth |
| `@scure/base` | **Keep** | Base encoding utilities |

After removing `vite-plugin-pwa`, run `bun install` to clean up the lockfile.

### Check for Unused @noble/curves Imports

After `crypto.ts` is deleted, check if `@noble/curves` is still imported anywhere:

```bash
grep -r "@noble/curves" src/client/
```

Expected remaining uses:
- `src/client/lib/file-crypto.ts` — `secp256k1` for `encryptMetadataForPubkey`
- `src/client/lib/provisioning.ts` — ECDH for device provisioning

These are legitimate uses (ephemeral ECDH, not nsec-dependent).

## Phase 7: Remove isTauri()/isBrowser() Detection

### platform.ts

After the full migration, `isTauri()` and `isBrowser()` are no longer needed in `platform.ts` since every function is Tauri-only. However, they might still be used elsewhere:

```bash
grep -r "isTauri\(\)" src/client/
grep -r "isBrowser\(\)" src/client/
```

Expected remaining uses:
- `src/client/lib/key-manager.ts` — was using `isTauri()` to conditionally call `lockCrypto()`. After Epic 93, always calls `lockCrypto()`.

**Decision**: Keep `isTauri()` exported from platform.ts but simplify it to always return `true`:

```typescript
/** Always true — this is a Tauri-only app. */
export function isTauri(): boolean { return true }

/** Always false — this is a Tauri-only app. */
export function isBrowser(): boolean { return false }
```

Or better: remove all call sites and delete the functions. Callers that checked `isTauri()` before calling `lockCrypto()` etc. can just call directly.

## Phase 8: CI/CD Updates

### Current Workflows

1. **`ci.yml`** — Builds Vite app + deploys to Cloudflare Workers/Pages
2. **`docker.yml`** — Docker image for self-hosted deployment
3. **`desktop-e2e.yml`** — Tauri desktop E2E tests
4. **`tauri-release.yml`** — Desktop release builds

### Changes

**`ci.yml`**:
- Remove the web deploy step (`wrangler pages deploy`)
- Keep the Worker deploy step (API still runs on CF Workers)
- Keep Vite build step (Tauri still bundles the Vite output)
- Remove Playwright browser E2E tests (replaced by desktop E2E in `desktop-e2e.yml`)
- Actually — Playwright E2E tests can still run against the Vite dev server in a browser for API testing. Keep for now, but note that crypto operations will fail in browser (no Tauri IPC). Tests that exercise crypto need to run in `desktop-e2e.yml`.

**`docker.yml`**:
- Simplify to API-only. The Docker image is for self-hosted server deployment.
- Remove Vite frontend build from Docker (desktop clients connect to the API, not a served SPA).
- Actually — the self-hosted Docker deployment needs to serve SOMETHING at the frontend URL. Options:
  1. Serve a "Download the desktop app" landing page
  2. Keep the Vite build but it won't work without Tauri

  **Decision**: Defer Docker changes. The self-hosted deployment architecture needs a separate discussion (Epic 95?). For now, Docker can keep building the API.

**`desktop-e2e.yml`**:
- This becomes the primary E2E workflow
- Add crypto operation tests (note create/decrypt, message encrypt/decrypt, auth token creation)

**`tauri-release.yml`**:
- No changes needed — already set up correctly

## Phase 9: Documentation Updates

### CLAUDE.md

Update the following sections:

1. **Tech Stack**: Remove "PWA" mention. Add "Desktop-only" clarification.
2. **Key Technical Patterns**: Remove `platform.ts` "falls back to JS on browser" language. State it's Tauri-only.
3. **Gotchas**: Remove the `isTauriDev` conditional note. Add note that `crypto.ts` and `key-store.ts` are deleted.
4. **Development Commands**: Remove `bun run dev` for browser-only dev. Emphasize `bun run tauri:dev`.
5. **Directory Structure**: Remove `crypto.ts`, `key-store.ts` from listing.

### README.md

Update to reflect desktop-only nature. Remove PWA install instructions.

### MEMORY.md

Update the Multi-Platform Architecture section:
- Note that `crypto.ts` and `key-store.ts` are deleted
- Note that `getSecretKey()` is eliminated
- Note that `platform.ts` is Tauri-only (no browser fallback)

## Verification Checklist

After all phases:

```bash
# Dead files are deleted
test ! -f src/client/lib/crypto.ts
test ! -f src/client/lib/key-store.ts
test ! -f src/client/lib/sri-workbox-plugin.ts
test ! -f src/client/components/pwa-install-banner.tsx
test ! -f src/client/lib/use-pwa-install.ts

# No remaining imports from deleted files
grep -r "from './crypto'" src/client/         # zero results
grep -r "from '../crypto'" src/client/        # zero results
grep -r "from '@/lib/crypto'" src/client/     # zero results
grep -r "from './key-store'" src/client/      # zero results
grep -r "from '@/lib/key-store'" src/client/  # zero results
grep -r "pwa-install-banner" src/client/      # zero results
grep -r "sri-workbox-plugin" .                # zero results

# No getSecretKey
grep -r "getSecretKey" src/client/            # zero results

# No secretKey: Uint8Array
grep -r "secretKey: Uint8Array" src/client/   # zero results

# No VitePWA
grep -r "VitePWA" vite.config.ts              # zero results
grep -r "vite-plugin-pwa" package.json        # zero results

# Build succeeds
bun run typecheck
bun run build
bun run tauri:dev  # app launches and works

# Rust tests pass
cd ../llamenos-core && cargo test
```

## Files Changed

| File | Action |
|------|--------|
| `src/client/lib/crypto.ts` | **DELETE** |
| `src/client/lib/key-store.ts` | **DELETE** |
| `src/client/lib/sri-workbox-plugin.ts` | **DELETE** |
| `src/client/components/pwa-install-banner.tsx` | **DELETE** |
| `src/client/lib/use-pwa-install.ts` | **DELETE** |
| `src/shared/types.ts` | Add `KeyEnvelope`, `RecipientKeyEnvelope` if not already there |
| `vite.config.ts` | Remove PWA/SRI plugins, remove conditionals |
| `src/client/routes/__root.tsx` | Remove PWA banner |
| `src/client/lib/panic-wipe.ts` | Remove SW cleanup, add Tauri Store cleanup |
| `package.json` | Remove `vite-plugin-pwa` dependency |
| `CLAUDE.md` | Update documentation |
| `.claude/projects/-home-rikki-projects-llamenos/memory/MEMORY.md` | Update memory |
