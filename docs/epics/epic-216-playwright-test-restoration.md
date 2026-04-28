# Epic 216: Playwright Test Restoration (Docker Compose Backend)

## Goal

Restore Playwright E2E tests from 30 passing to 355+ on the desktop branch by switching the test backend from Wrangler dev to Docker Compose. This also establishes Docker Compose as the unified backend for tests across all clients (desktop Playwright, iOS XCUITest, Android instrumented tests).

## Context

The desktop branch has 39 spec files with 355+ test cases, but only ~30 pass because the webServer (Wrangler dev) fails to start correctly for backend-dependent tests. Wrangler is becoming irrelevant except for demo deploys — Docker Compose is the canonical backend.

### Current State
- **playwright.config.ts** webServer command: `PLAYWRIGHT_TEST=true bun run build && bunx wrangler dev --config apps/worker/wrangler.jsonc --port 8788 --var ENVIRONMENT:development`
- **Docker Compose**: `deploy/docker/docker-compose.yml` + `docker-compose.test.yml` — fully operational with PostgreSQL, RustFS, strfry, app server
- **Test override**: `docker-compose.test.yml` sets `ENVIRONMENT=development` and exposes port 3000

### Architecture Change
- **Backend**: Docker Compose services (app, postgres, rustfs, strfry)
- **Frontend**: Vite dev server (`PLAYWRIGHT_TEST=true bun run dev`) serving the SPA with Tauri IPC mocks
- **Alternative**: Tauri dev mode (`bun run tauri:dev`) if it's possible to run Playwright against a Tauri webview — investigate feasibility

## Implementation

### 1. Update playwright.config.ts

Replace the single Wrangler webServer with a dual setup:

```typescript
webServer: process.env.PLAYWRIGHT_BASE_URL
  ? undefined
  : [
      {
        // Backend: Docker Compose
        command: "docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/docker-compose.test.yml up -d --build --wait app",
        url: "http://localhost:3000/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000, // Docker build can take a while
      },
      {
        // Frontend: Vite dev server with Tauri IPC mocks
        command: "PLAYWRIGHT_TEST=true bun run dev --port 8788",
        url: "http://localhost:8788",
        reuseExistingServer: !process.env.CI,
      },
    ],
```

Alternatively, if Playwright supports a single webServer, configure Vite to proxy `/api/*` to `http://localhost:3000`.

### 2. Configure Vite API Proxy

Update `vite.config.ts` to proxy API requests to Docker Compose backend when in test mode:

```typescript
server: {
  port: 8788,
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
    '/ws': {
      target: 'ws://localhost:3000',
      ws: true,
    },
  },
},
```

### 3. Docker Compose .env for Tests

Create a `deploy/docker/.env.test` (or `deploy/docker/.env.example` update) with the minimal required env vars:

```bash
PG_PASSWORD=testpassword
STORAGE_ACCESS_KEY=rustfsadmin
STORAGE_SECRET_KEY=rustfsadmin
HMAC_SECRET=$(openssl rand -hex 32)
ADMIN_PUBKEY=<test-admin-pubkey>
ENVIRONMENT=development
```

### 4. Update test:build Script

```json
"test:build": "PLAYWRIGHT_TEST=true bun run build",
"test:docker:up": "docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/docker-compose.test.yml up -d --build --wait app",
"test:docker:down": "docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/docker-compose.test.yml down",
```

### 5. Fix Test Failures by Category

After switching to Docker Compose, categorize and fix remaining failures:

1. **Backend connectivity**: Tests that assume Wrangler dev's Durable Object emulation — need to verify against PostgreSQL storage
2. **API path changes**: Worker-specific routes vs Node.js platform routes
3. **WebSocket tests**: Strfry relay connection vs Wrangler dev WebSocket
4. **Import path issues**: Any `@worker/` imports that break in test builds
5. **Test-specific regressions**: Timing, selectors, or data-testid changes from monorepo restructuring

### 6. CI Pipeline Update

Update `.github/workflows/` to use Docker Compose for E2E tests:

```yaml
- name: Start test backend
  run: |
    cp deploy/docker/.env.test deploy/docker/.env
    docker compose -f deploy/docker/docker-compose.yml \
                   -f deploy/docker/docker-compose.test.yml \
                   up -d --build --wait app

- name: Run Playwright tests
  run: PLAYWRIGHT_BASE_URL=http://localhost:3000 bun run test
```

### 7. Tauri Dev Mode Investigation

Investigate whether Playwright can run against Tauri dev mode (`bun run tauri:dev`):
- Tauri dev starts Vite + Rust backend together
- Would test the actual Rust crypto path instead of IPC mocks
- May require Playwright to connect to the Tauri webview (WebKit-based)
- If feasible, this provides a more realistic test environment

## Unified Backend for All Clients

With Docker Compose as the test backend:
- **Desktop (Playwright)**: Vite dev server + Docker Compose API
- **iOS (XCUITest)**: Simulator connects to Docker Compose API on localhost
- **Android (Instrumented tests)**: Emulator connects to Docker Compose API on 10.0.2.2:3000
- All clients test against the same backend, ensuring cross-platform consistency

## Verification

1. `bun run test --list` discovers all 355+ tests
2. `bun run test` passes all tests (except known platform-specific issues)
3. Docker Compose services start and stop cleanly between test runs
4. CI pipeline passes with Docker Compose backend
5. No wrangler dev dependency for testing

## Dependencies

- Docker and Docker Compose available on dev machines and CI
- `.env.test` with required environment variables

## Risk

- **Medium**: Docker build time may slow down test startup (mitigate with layer caching)
- **Low**: Some tests may depend on Wrangler-specific Durable Object behavior
- **Low**: Port conflicts on developer machines
