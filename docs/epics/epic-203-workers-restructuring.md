# Epic 203: Workers Restructuring

## Goal

Give `apps/worker/` clean package boundaries with its own `package.json` and `tsconfig.json`, import shared types from `@llamenos/shared` and `@llamenos/protocol`, and update all build/deploy tooling accordingly. The worker remains a single Cloudflare Worker deployment — this is about code organization, not multi-worker splitting.

## Context

After Epic 200 moves `src/worker/` → `apps/worker/`, the worker code still shares the root `tsconfig.json` with the frontend. This creates coupling: the worker sees DOM types, React types, and client-only paths. Giving the worker its own TypeScript config creates a clean compile boundary and makes it a proper workspace member.

### Why NOT Split Into Multiple Workers

Buildit deploys 5 separate workers (`api`, `backend`, `federation`, `relay`, `ssr`), each with its own `wrangler.toml`. This makes sense at their scale (distinct services with independent scaling). Llamenos has a single API surface with 7 tightly-coupled Durable Objects — splitting would add network latency between DOs and complicate deployment for no benefit. Keep it monolithic.

### Current Worker Structure

```
src/worker/
├── index.ts                  # Entry point + DO exports + cron
├── app.ts                    # Hono app setup + route registration
├── types.ts                  # Env interface + DO bindings
├── durable-objects/          # 7 DOs: Identity, Settings, Records, ShiftManager, CallRouter, Conversation, Blast
├── routes/                   # 23 Hono route handlers
├── middleware/               # 5 middleware (auth, cors, permission-guard, hub, security-headers)
├── lib/                      # 15 utilities (auth, crypto, do-access, do-router, nostr, push, etc.)
├── messaging/                # MessagingAdapter + SMS/WhatsApp/Signal/RCS
├── telephony/                # SIP tokens, Asterisk integration
└── services/                 # audit, ringing, transcription
```

This structure is fine — the worker code is well-organized by domain. The restructuring is about package boundaries, not internal reorganization.

## Implementation

### Step 1: Create Worker `package.json`

**`apps/worker/package.json`**:
```json
{
  "name": "@llamenos/worker",
  "private": true,
  "type": "module",
  "dependencies": {
    "@llamenos/shared": "workspace:*"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20241224.0",
    "hono": "^4.7.4",
    "wrangler": "^4.14.4"
  }
}
```

Currently the worker's dependencies (Hono, `@cloudflare/workers-types`, wrangler) live in the root `package.json`. Moving them to the worker's own `package.json` makes the dependency graph explicit. Bun workspaces resolve `@llamenos/shared` via the workspace protocol.

### Step 2: Create Worker `tsconfig.json`

**`apps/worker/tsconfig.json`**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["@cloudflare/workers-types"],
    "paths": {
      "@shared/*": ["../../packages/shared/*"]
    }
  },
  "include": ["./**/*.ts"],
  "exclude": ["node_modules"]
}
```

Key differences from root tsconfig:
- **No `DOM` lib** — workers don't have DOM APIs
- **`@cloudflare/workers-types`** — CF-specific global types
- **No `@/*` alias** — worker shouldn't import client code
- **No `@worker/*` alias** — files reference each other with relative imports

### Step 3: Move `wrangler.jsonc` Into Worker Directory

Currently `wrangler.jsonc` lives at the repo root. Move it to `apps/worker/wrangler.jsonc`:

```jsonc
{
  "name": "llamenos",
  "main": "index.ts",  // relative to wrangler.jsonc location now
  "assets": {
    "directory": "../../dist/client/",  // relative to worker dir
    "binding": "ASSETS",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "single-page-application"
  },
  // ... rest unchanged
}
```

Update root `package.json` scripts:
```json
{
  "scripts": {
    "dev:worker": "wrangler dev --config apps/worker/wrangler.jsonc",
    "deploy:demo": "wrangler deploy --config apps/worker/wrangler.jsonc",
    "deploy": "bun run deploy:api && bun run deploy:site"
  }
}
```

**Alternative**: Use `--config` flag instead of moving the file, keeping wrangler at root. This is simpler but less clean. The move is preferred because the config belongs with the code it configures.

### Step 4: Update esbuild.node.mjs

The Node.js self-hosted build (`esbuild.node.mjs`) must reference the new worker location:

```javascript
// Entry point
entryPoints: ['src/platform/node/server.ts'],

// Path alias plugin updates
build.onResolve({ filter: /^@worker\// }, (args) => ({
  path: resolveWithExtensions(path.resolve('apps/worker', args.path.replace('@worker/', ''))),
}))
build.onResolve({ filter: /^@shared\// }, (args) => ({
  path: resolveWithExtensions(path.resolve('packages/shared', args.path.replace('@shared/', ''))),
}))
```

### Step 5: Update Playwright Config

`playwright.config.ts` runs `wrangler dev` as a webServer. Update to use the new config path:

```typescript
webServer: {
  command: `PLAYWRIGHT_TEST=true bun run build && wrangler dev --config apps/worker/wrangler.jsonc --port 8788`,
  // ... rest unchanged
}
```

### Step 6: Update Root `package.json` Workspaces

Ensure `apps/worker` is included as a workspace member:

```json
{
  "workspaces": [
    "packages/*",
    "apps/worker",
    "site"
  ]
}
```

Note: `apps/desktop` is NOT a workspace member (it's Rust, not JS). Only JS/TS projects with `package.json` are workspace members.

### Step 7: Clean Root Dependencies

Move worker-only dependencies from root `package.json` to `apps/worker/package.json`:
- `hono` → worker-only
- `@cloudflare/workers-types` → worker-only
- `wrangler` stays at root (used in root scripts)

Keep in root:
- `wrangler` — referenced by root deploy/dev scripts
- Build tools (Vite, TypeScript, etc.)
- Test tools (Playwright)
- Shared dev tools (Biome, etc.)

### Step 8: Update Docker/Node.js Build

The Docker build (`Dockerfile.build`) and Node.js platform code reference worker paths. The `@worker/*` alias continues to work since it's resolved at build time by esbuild and vite.

## What Does NOT Change

- **Internal worker file organization** — The routes/, durable-objects/, messaging/ structure is clean already
- **Deployment** — Still a single `wrangler deploy` for the whole worker
- **Worker entry point** — `index.ts` stays the same, just the path from root changes
- **DO bindings** — `wrangler.jsonc` migration references still use `"script_name"` from the same worker

## Verification Checklist

1. `bun install` — workspace resolution works
2. `bun run typecheck` — root and worker typecheck pass independently
3. `bun run dev:worker` — wrangler dev server starts with new config path
4. `bun run build` — Vite production build succeeds
5. `bun run build:node` — esbuild Node.js build succeeds with new paths
6. `bun run test` — Playwright E2E tests pass (wrangler starts from new location)
7. `bun run deploy:demo` — deploy works with new config path

## Risk Assessment

- **Low risk**: Moving `wrangler.jsonc` — declarative config, just path updates
- **Low risk**: Adding worker `package.json` — Bun workspace resolution handles deps
- **Medium risk**: Worker `tsconfig.json` may surface type errors that were hidden by root config — these should be fixed, not suppressed
- **Low risk**: esbuild path updates — straightforward find-and-replace

## Dependencies

- Epic 200 (Monorepo Foundation) — for `apps/worker/` location

## Blocks

- Nothing directly — this is a quality-of-life improvement for worker development
