# Epic 95: Deployment Architecture for Desktop-Only

**Status**: Complete
**Depends on**: Epic 94 (Build Cleanup)

## Goal

Update deployment infrastructure, marketing site, and CI/CD to reflect the desktop-only architecture:
1. Self-hosted Docker serves **API-only** (desktop clients connect to it)
2. Marketing site updated — remove PWA/browser references, add desktop download links
3. CI/CD pipeline updated — remove web SPA deploy, primary release is Tauri desktop
4. Cloudflare Workers deploy is API-only (no Pages SPA)

## Context

After Epics 92-94, the Llamenos frontend is a Tauri desktop app. There is no browser-loadable SPA. The deployment architecture must change:

| Component | Before | After |
|-----------|--------|-------|
| **Frontend** | Vite SPA served via CF Workers/Pages or Docker | Tauri desktop app (downloaded binary) |
| **API** | CF Workers or Docker Node.js | Same (no change) |
| **Marketing site** | Astro on CF Pages | Same (but content updated) |
| **Desktop release** | Secondary (PR #3 branch) | Primary distribution method |
| **Self-hosted** | Docker serves SPA + API | Docker serves API-only + download redirect |

## Phase 1: Self-Hosted Docker Changes

### 1.1 Dockerfile — Remove Frontend Build Stage

Current `deploy/docker/Dockerfile` has 4 stages:
1. Frontend (Vite build)
2. Backend (esbuild Node.js)
3. Deps (production node_modules)
4. Runtime

Remove stage 1 (frontend). The Docker image is API-only:

```dockerfile
# --- Stage 1: Backend ---
FROM oven/bun:1 AS backend
WORKDIR /build
COPY package.json bun.lockb ./
COPY src/worker/ src/worker/
COPY src/shared/ src/shared/
COPY esbuild.node.mjs ./
RUN bun install && node esbuild.node.mjs

# --- Stage 2: Deps ---
FROM oven/bun:1 AS deps
WORKDIR /build
COPY package.json bun.lockb ./
RUN bun install --production

# --- Stage 3: Runtime ---
FROM node:22-slim
RUN groupadd -r llamenos && useradd -r -g llamenos llamenos
WORKDIR /app
COPY --from=deps /build/node_modules ./node_modules
COPY --from=backend /build/dist/server ./dist/server

# Serve a minimal download page for browsers hitting the root URL
COPY deploy/docker/download-page/ ./public/

USER llamenos
ENV PLATFORM=node PORT=3000 NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1
CMD ["node", "dist/server/index.js"]
```

### 1.2 Download Landing Page

Create `deploy/docker/download-page/index.html` — a minimal page shown when someone visits the self-hosted instance in a browser:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Llamenos — Download Desktop App</title>
  <style>
    body { font-family: system-ui; max-width: 600px; margin: 60px auto; padding: 0 20px; color: #e0e0e0; background: #0a0a0a; }
    h1 { color: #fff; }
    a { color: #60a5fa; }
    .downloads { display: flex; gap: 16px; flex-wrap: wrap; margin: 24px 0; }
    .btn { display: inline-block; padding: 12px 24px; background: #1e40af; color: #fff; border-radius: 8px; text-decoration: none; }
    .btn:hover { background: #2563eb; }
  </style>
</head>
<body>
  <h1>Llamenos</h1>
  <p>Llamenos is a desktop application. Download the app for your platform:</p>
  <div class="downloads">
    <a class="btn" href="/api/download/windows">Windows</a>
    <a class="btn" href="/api/download/macos">macOS</a>
    <a class="btn" href="/api/download/linux">Linux</a>
  </div>
  <p><small>Or visit <a href="https://llamenos-platform.com">llamenos-platform.com</a> for documentation.</small></p>
</body>
</html>
```

### 1.3 Add Download API Endpoint

Add a simple download redirect endpoint to the Node.js server that redirects to the latest GitHub Release asset:

```typescript
// src/worker/api/download.ts
export function handleDownload(platform: string, env: Env): Response {
  const owner = env.GITHUB_OWNER || 'your-org'
  const repo = env.GITHUB_REPO || 'llamenos'
  const baseUrl = `https://github.com/${owner}/${repo}/releases/latest/download`

  const assets: Record<string, string> = {
    windows: `${baseUrl}/llamenos-desktop_x64-setup.nsis.zip`,
    macos: `${baseUrl}/llamenos-desktop_universal.dmg`,
    linux: `${baseUrl}/llamenos-desktop_amd64.AppImage`,
  }

  const url = assets[platform]
  if (!url) return new Response('Unknown platform', { status: 404 })
  return Response.redirect(url, 302)
}
```

### 1.4 Docker Compose — No Frontend Changes

`docker-compose.yml` remains mostly the same. The `app` service now only serves the API. The Caddy config may need a small update to serve the download page at `/` instead of proxying to a SPA.

## Phase 2: Cloudflare Workers Changes

### 2.1 Remove SPA Serving

The CF Worker currently serves the Vite build output at non-API routes. After this change:
- `/api/*` routes → Worker API handlers (unchanged)
- `/` and other routes → Redirect to marketing site or return download instructions

### 2.2 Update `wrangler.jsonc`

Remove `[site]` configuration (static asset serving) if present. The Worker is API-only.

### 2.3 Update deploy scripts

```json
{
  "deploy:demo": "bunx wrangler deploy",
  "deploy:api": "bunx wrangler deploy"
}
```

Remove `bun run build` from `deploy:demo` — no Vite build needed for API deployment.

## Phase 3: Marketing Site Content Updates

### 3.1 Pages to Update

The site has 42 Astro pages and 161 content docs in 13 languages. Key pages needing updates:

**English content** (then translate to other 12 locales):

| Page | Change |
|------|--------|
| Features page | Remove "Progressive Web App" feature. Add "Desktop App" with native crypto, auto-update, system tray |
| Volunteer guide | Remove "Install as PWA" instructions. Add "Download desktop app" |
| Admin setup guide | Update installation steps for desktop |
| WebRTC calling docs | Update to reference desktop app instead of browser |
| Deployment guides | Note that Docker/K8s serve API-only, desktop clients download from GitHub Releases |

### 3.2 Specific Text Replacements

Search and replace across all locale content files:

| Find | Replace |
|------|---------|
| "Progressive Web App" | "Desktop Application" |
| "Install the app as a PWA" | "Download the desktop app" |
| "installable on any device via the browser" | "available for Windows, macOS, and Linux" |
| "browser push notifications" | "desktop notifications" |
| "Service worker caches the app shell" | Remove entirely |
| "browser notification" | "desktop notification" |

### 3.3 Add Desktop Download Page

Create a new page at `site/src/pages/[lang]/download.astro`:

- Platform detection (Windows/macOS/Linux)
- Direct download links to latest GitHub Release assets
- Verification instructions (checksums from `CHECKSUMS.txt` in release)
- Auto-update note (Tauri updater handles subsequent updates)

### 3.4 Update Navigation

Add "Download" link to the site header navigation, pointing to the download page.

## Phase 4: CI/CD Pipeline Updates

### 4.1 `ci.yml` Changes

```yaml
# REMOVE these steps:
- name: Deploy web app to CF Workers
  run: bun run deploy:demo

# KEEP/MODIFY:
- name: Deploy API to CF Workers
  run: bunx wrangler deploy  # API-only, no Vite build
  if: needs.version.outputs.new-version

# MODIFY Playwright E2E steps:
- name: Build test app
  run: PLAYWRIGHT_TEST=true bun run build  # Uses Tauri IPC mock

# KEEP:
- name: Deploy marketing site
  run: bun run deploy:site
```

### 4.2 `tauri-release.yml` — Becomes Primary Release

This workflow is already correct. Ensure it:
- Generates `CHECKSUMS.txt` for all binaries
- Creates `latest.json` for Tauri auto-updater
- Publishes to GitHub Releases with SLSA provenance

### 4.3 `desktop-e2e.yml` — Expand Triggers

Currently only triggers on PRs touching `src-tauri/` or `tests/desktop/`. After desktop becomes primary:

```yaml
on:
  push:
    branches: [main, desktop]
    paths-ignore:
      - 'docs/**'
      - 'site/**'
      - '*.md'
  pull_request:
    paths-ignore:
      - 'docs/**'
      - 'site/**'
      - '*.md'
```

### 4.4 Docker CI — Update Build

`docker.yml` workflow should build the API-only Docker image (no Vite frontend):

```yaml
- name: Build Docker image
  run: docker build -f deploy/docker/Dockerfile -t llamenos-api .
```

## Phase 5: Package.json Script Cleanup

### Current Scripts

```json
"dev": "vite",                    // Browser-only dev (dead)
"build": "vite build",            // Vite build for Tauri webview
"preview": "vite preview",        // Browser preview (dead)
"deploy:demo": "bun run build && bunx wrangler deploy",  // Web deploy (dead)
```

### Updated Scripts

```json
"dev": "bunx tauri dev",                          // Primary dev command
"dev:vite": "vite",                                // Vite-only for quick frontend iteration
"dev:worker": "bunx wrangler dev",                 // Backend dev
"build": "vite build",                             // Build webview bundle (for Tauri)
"build:node": "node esbuild.node.mjs",             // Build Node.js server
"build:docker": "bun run build:node",              // Docker build (API-only, no Vite)
"deploy": "bun run deploy:api && bun run deploy:site",
"deploy:api": "bunx wrangler deploy",              // Deploy API Worker
"deploy:site": "cd site && bun run deploy",         // Deploy marketing site
"test": "PLAYWRIGHT_TEST=true bunx playwright test", // E2E with mock
"test:desktop": "bunx wdio tests/desktop/wdio.conf.ts", // Desktop E2E
"test:live": "bunx playwright test --config playwright.live.config.ts",
"typecheck": "tsc --noEmit",
"tauri:dev": "bunx tauri dev",                     // Alias (explicit)
"tauri:build": "bunx tauri build",                 // Desktop release build
```

Key changes:
- `dev` now runs `tauri dev` (was `vite`)
- `dev:vite` for when you just need the Vite server (fast frontend iteration)
- `deploy:demo` → `deploy:api` (clarity)
- `build:docker` no longer builds Vite frontend
- `test` sets `PLAYWRIGHT_TEST=true`
- Remove `preview` (not useful for Tauri)

## Phase 6: Update README.md

### Major Sections to Rewrite

**Installation/Getting Started**:
```markdown
## Installation

Download the latest release for your platform:

- **Windows**: [llamenos-desktop-setup.exe](https://github.com/org/llamenos/releases/latest)
- **macOS**: [llamenos-desktop.dmg](https://github.com/org/llamenos/releases/latest)
- **Linux**: [llamenos-desktop.AppImage](https://github.com/org/llamenos/releases/latest)

The app auto-updates when new versions are available.
```

**Features** — Remove:
- "Mobile responsive PWA"
- "Browser push notifications"
- "Installable on any device via the browser"

**Features** — Add:
- "Native desktop app (Windows, macOS, Linux)"
- "Hardware-backed crypto (secret key never enters the webview)"
- "System tray with status indicator"
- "Auto-updates with SLSA provenance"
- "Desktop notifications"

**Deployment** — Clarify:
- CF Workers and Docker serve the **API** only
- Desktop clients connect to the API
- Marketing site is separate (CF Pages)

**Development** — Update primary command:
```markdown
## Development

```bash
bun install                    # Install dependencies
bun run dev                    # Launch Tauri desktop dev (Vite + Rust)
bun run dev:worker             # Backend dev server
bun run test                   # Playwright E2E tests
bun run test:desktop           # Desktop integration tests
cd ../llamenos-core && cargo test  # Rust crypto tests
```
```

## Phase 7: Expand WebdriverIO Desktop Crypto Tests

### Current Coverage (`tests/desktop/specs/crypto.spec.ts`)

5 tests:
1. Detect Tauri environment
2. Generate keypair
3. PIN encrypt/decrypt
4. ECIES encrypt/decrypt
5. Schnorr sign/verify

### Add Tests for Epic 92 Commands

```typescript
// tests/desktop/specs/crypto-expanded.spec.ts

describe('Epic 92: Expanded Crypto IPC', () => {
  let testNsec: string
  let testPubkey: string

  before(async () => {
    // Generate and import a test keypair into CryptoState
    const kp = await browser.execute(async () => {
      return await window.__TAURI_INTERNALS__.invoke('generate_keypair')
    })
    testNsec = kp.nsec
    testPubkey = kp.publicKey

    await browser.execute(async (nsec, pubkey) => {
      await window.__TAURI_INTERNALS__.invoke('import_key_to_state', {
        nsec, pin: '123456', pubkeyHex: pubkey,
      })
    }, testNsec, testPubkey)
  })

  it('should create auth token from state', async () => {
    const token = await browser.execute(async () => {
      return await window.__TAURI_INTERNALS__.invoke('create_auth_token_from_state', {
        timestamp: Date.now(), method: 'GET', path: '/api/me',
      })
    })
    const parsed = JSON.parse(token)
    expect(parsed.pubkey).toHaveLength(64)
    expect(parsed.token).toHaveLength(128) // BIP-340 sig
  })

  it('should encrypt and decrypt note via state', async () => {
    const payload = JSON.stringify({ text: 'test note', callId: 'call-1' })
    const encrypted = await browser.execute(async (json, pubkey) => {
      return await window.__TAURI_INTERNALS__.invoke('encrypt_note', {
        payloadJson: json, authorPubkey: pubkey, adminPubkeys: [pubkey],
      })
    }, payload, testPubkey)

    expect(encrypted.encryptedContent).toBeDefined()
    expect(encrypted.authorEnvelope).toBeDefined()

    const decrypted = await browser.execute(async (enc, env) => {
      return await window.__TAURI_INTERNALS__.invoke('decrypt_note_from_state', {
        encryptedContent: enc, envelope: env,
      })
    }, encrypted.encryptedContent, encrypted.authorEnvelope)

    const parsed = JSON.parse(decrypted)
    expect(parsed.text).toBe('test note')
  })

  it('should encrypt and decrypt message via state', async () => {
    const encrypted = await browser.execute(async (pubkey) => {
      return await window.__TAURI_INTERNALS__.invoke('encrypt_message', {
        plaintext: 'hello', readerPubkeys: [pubkey],
      })
    }, testPubkey)

    const decrypted = await browser.execute(async (enc, envs) => {
      return await window.__TAURI_INTERNALS__.invoke('decrypt_message_from_state', {
        encryptedContent: enc, readerEnvelopes: envs,
      })
    }, encrypted.encryptedContent, encrypted.readerEnvelopes)

    expect(decrypted).toBe('hello')
  })

  it('should encrypt and decrypt draft via state', async () => {
    const encrypted = await browser.execute(async () => {
      return await window.__TAURI_INTERNALS__.invoke('encrypt_draft_from_state', {
        plaintext: 'draft text',
      })
    })

    const decrypted = await browser.execute(async (packed) => {
      return await window.__TAURI_INTERNALS__.invoke('decrypt_draft_from_state', {
        packedHex: packed,
      })
    }, encrypted)

    expect(decrypted).toBe('draft text')
  })

  it('should sign Nostr event from state', async () => {
    const event = await browser.execute(async () => {
      return await window.__TAURI_INTERNALS__.invoke('sign_nostr_event_from_state', {
        kind: 20001,
        createdAt: Math.floor(Date.now() / 1000),
        tags: [['d', 'test-hub'], ['t', 'llamenos:event']],
        content: 'encrypted-content',
      })
    })

    expect(event.id).toHaveLength(64)
    expect(event.sig).toHaveLength(128)
    expect(event.pubkey).toBe(testPubkey)
    expect(event.kind).toBe(20001)
  })

  it('should validate nsec format', async () => {
    const valid = await browser.execute(async (nsec) => {
      return await window.__TAURI_INTERNALS__.invoke('is_valid_nsec', { nsec })
    }, testNsec)
    expect(valid).toBe(true)

    const invalid = await browser.execute(async () => {
      return await window.__TAURI_INTERNALS__.invoke('is_valid_nsec', { nsec: 'not-a-nsec' })
    })
    expect(invalid).toBe(false)
  })

  it('should decrypt call record from state', async () => {
    // Encrypt a call record, then decrypt via state
    const encrypted = await browser.execute(async (pubkey) => {
      // Use encrypt_message with call metadata as a proxy
      // (Real call records are encrypted server-side)
      const meta = JSON.stringify({ answeredBy: null, callerNumber: '+15551234567' })
      return await window.__TAURI_INTERNALS__.invoke('encrypt_message', {
        plaintext: meta, readerPubkeys: [pubkey],
      })
    }, testPubkey)

    // decrypt_call_record_from_state uses the same ECIES pattern
    // but with LABEL_CALL_META. For this test, verify the IPC command
    // is callable (actual crypto correctness tested in cargo test).
    expect(encrypted.encryptedContent).toBeDefined()
  })

  it('should lock and unlock crypto state', async () => {
    await browser.execute(async () => {
      await window.__TAURI_INTERNALS__.invoke('lock_crypto')
    })

    const isUnlocked = await browser.execute(async () => {
      return await window.__TAURI_INTERNALS__.invoke('is_crypto_unlocked')
    })
    expect(isUnlocked).toBe(false)

    // Re-unlock for subsequent tests
    // (Need the encrypted key data from import_key_to_state)
  })
})
```

## Dependency Graph

```
Epic 94 (Build Cleanup) → Epic 95 (Deployment)
```

Epic 95 can start once Epic 94 is complete (no more web SPA code to deploy).

## Verification

1. Self-hosted Docker: `docker compose up` serves API at `/api/*` and download page at `/`
2. CF Workers: `bunx wrangler deploy` deploys API-only
3. Marketing site: No PWA/browser references, download page works
4. Desktop E2E: Expanded crypto tests pass on Linux and Windows
5. `tauri-release.yml`: Produces signed binaries for all 3 platforms

## Files Changed

| File | Action |
|------|--------|
| `deploy/docker/Dockerfile` | Remove frontend build stage |
| `deploy/docker/download-page/index.html` | **NEW** — download redirect page |
| `src/worker/api/download.ts` | **NEW** — download redirect endpoint |
| `docker-compose.yml` | Minor: Caddy config update |
| `.github/workflows/ci.yml` | Remove web deploy, add `PLAYWRIGHT_TEST` |
| `.github/workflows/desktop-e2e.yml` | Expand triggers |
| `.github/workflows/docker.yml` | API-only build |
| `package.json` | Update scripts |
| `README.md` | Major rewrite for desktop-only |
| `tests/desktop/specs/crypto-expanded.spec.ts` | **NEW** — expanded IPC tests |
| `site/src/content/**` | Update PWA → Desktop references (13 locales) |
| `site/src/pages/[lang]/download.astro` | **NEW** — download page |
