# Concurrent Local E2E Test Orchestration

**Date:** 2026-05-07
**Status:** Draft — pending review
**Priority:** P1 — enables reliable local full-suite validation before CI
**Related:** [2026-03-19 Test Infrastructure Overhaul](2026-03-19-test-infrastructure-overhaul.md) (test isolation patterns)

---

## Problem Statement

Running the full E2E test suite locally today is slow and unreliable because:

1. **Test suites share a single database.** Desktop Playwright, backend BDD, and iOS UI tests all hit `llamenos` on PostgreSQL port 5432. Race conditions between suites cause flaky failures.
2. **iOS tests require macOS**, but the backend they need runs on the Linux machine. Engineers must manually coordinate backend startup across machines.
3. **No unified orchestration.** `bun run test:all` runs desktop, worker, and crypto in parallel, but backend-bdd and iOS are separate manual steps.
4. **Android parallel E2E already solved this** (`scripts/android-parallel-e2e.sh`) with per-shard Docker Compose stacks, but the pattern is not generalized to other suites.
5. **strfry removal (PR 255 context)** eliminates the Nostr relay dependency, simplifying concurrent backend startup — no relay port conflicts, no shared relay state.

The goal: run **all** E2E tests locally with one command, fully concurrent, fully isolated, including iOS on a separate macOS machine.

---

## Goals

1. **One command runs everything:** `bun run test:all` includes desktop, backend-bdd, iOS (via SSH), worker, crypto, and android — all in parallel.
2. **Per-suite database isolation:** Each suite gets its own PostgreSQL database within a shared Postgres container.
3. **Per-suite backend isolation:** Each suite that needs a backend gets its own on a unique port with its own database.
4. **iOS cross-machine support:** iOS tests on macOS connect to a backend on the Linux machine (or macOS starts its own).
5. **Worktree-safe:** Running tests from a git worktree does not conflict with tests running in the main checkout or another worktree.
6. **Resource-efficient:** Share one PostgreSQL and one RustFS container across all suites; only app processes are duplicated.

---

## Non-Goals

- **Not replacing CI.** This is for local validation. CI already has its own parallel job matrix.
- **Not fixing test flakiness.** The [Test Infrastructure Overhaul](2026-03-19-test-infrastructure-overhaul.md) epic addresses flakiness. This spec addresses infrastructure isolation.
- **Not supporting Windows.** macOS + Linux only, matching current developer machines.
- **Not running production compose.** Dev compose only.

---

## Architecture

### High-Level Flow

```
Engineer runs: bun run test:all

  └─> test-orchestrator.sh (enhanced)
        ├─> Codegen guard (once)
        ├─> Start shared services (postgres, rustfs) if not running
        │
        ├─> Launch desktop suite      ┐
        ├─> Launch backend-bdd suite  ├─ all parallel
        ├─> Launch worker suite       │
        ├─> Launch crypto suite       │
        ├─> Launch iOS suite (SSH)    │
        ├─> Launch android suite      ┘
        │
        └─> Collect results, print summary
```

### Service Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Linux Machine (Primary)                           │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Shared Services (one per worktree)                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │   │
│  │  │  PostgreSQL │  │   RustFS    │  │   (strfry removed)  │   │   │
│  │  │   port 5432 │  │  port 9000  │  │                     │   │   │
│  │  │             │  │             │  │                     │   │   │
│  │  │ llamenos_desktop             │  │                     │   │   │
│  │  │ llamenos_bdd                 │  │  buckets:           │   │   │
│  │  │ llamenos_ios                 │  │  - desktop-files    │   │   │
│  │  │ llamenos_android_0           │  │  - bdd-files        │   │   │
│  │  │ ...                          │  │  - ios-files        │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐   │
│  │   Desktop   │  │ Backend BDD │  │   Worker    │  │  Crypto  │   │
│  │  Backend    │  │   Backend   │  │  (no BE)    │  │  (no BE) │   │
│  │  port 3001  │  │  port 3002  │  │             │  │          │   │
│  │  DB: desktop│  │  DB: bdd    │  │             │  │          │   │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘  └──────────┘   │
│         │                │                                          │
│  ┌──────▼──────┐  ┌──────▼──────┐                                   │
│  │  Playwright │  │  Playwright │                                   │
│  │   port 8788 │  │  API tests  │                                   │
│  └─────────────┘  └─────────────┘                                   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Android Parallel (existing)                                  │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐                        │   │
│  │  │ shard 0 │ │ shard 1 │ │ shard 2 │  ...                   │   │
│  │  │ port 3004│ │ port 3005│ │ port 3006│                      │   │
│  │  │ DB: and_0│ │ DB: and_1│ │ DB: and_2│                      │   │
│  │  └─────────┘ └─────────┘ └─────────┘                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  iOS Backend (for remote macOS)                               │   │
│  │  ┌─────────────┐                                              │   │
│  │  │   Backend   │  port 3003                                   │   │
│  │  │   DB: ios   │                                              │   │
│  │  └─────────────┘  ← macOS connects via LAN IP                │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    SSH / LAN
┌─────────────────────────────────────────────────────────────────────┐
│                    macOS Machine (iOS Tests)                         │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐                                   │
│  │  iOS Unit   │  │  iOS UI     │                                   │
│  │   Tests     │  │   Tests     │                                   │
│  │  Simulator  │  │  Simulator  │                                   │
│  └─────────────┘  └─────────────┘                                   │
│         │                │                                          │
│         └────────────────┴─> HTTP to Linux:3003 (iOS backend)       │
│                                                                      │
│  Optional: local backend (if macOS has bun + docker)                │
│  ┌─────────────┐                                                    │
│  │   Backend   │  port 3003 (local)                                 │
│  │   DB: ios   │                                                    │
│  └─────────────┘                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Port Allocation

| Suite | App Port | DB Name | RustFS Bucket | Notes |
|---|---|---|---|---|
| Desktop | 3001 | `llamenos_desktop` | `llamenos-desktop` | Playwright serves on 8788 |
| Backend BDD | 3002 | `llamenos_bdd` | `llamenos-bdd` | API-only tests |
| iOS | 3003 | `llamenos_ios` | `llamenos-ios` | macOS connects to Linux:3003 |
| Android shard 0 | 3004 | `llamenos_android_0` | `llamenos-android-0` | Existing pattern |
| Android shard 1 | 3005 | `llamenos_android_1` | `llamenos-android-1` | Existing pattern |
| Android shard N | 3004+N | `llamenos_android_N` | `llamenos-android-N` | Existing pattern |

Port base is configurable via `TEST_PORT_BASE` (default 3001). Worktrees automatically offset by worktree index to avoid conflicts.

---

## Components

### 1. PostgreSQL Multi-Database Init

PostgreSQL does not natively create multiple databases on startup. We use an init script:

**`deploy/docker/postgres-init/00-create-test-databases.sql`** (new):
```sql
-- Create databases for concurrent test suites
CREATE DATABASE llamenos_desktop;
CREATE DATABASE llamenos_bdd;
CREATE DATABASE llamenos_ios;
CREATE DATABASE llamenos_android_0;
CREATE DATABASE llamenos_android_1;
CREATE DATABASE llamenos_android_2;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE llamenos_desktop TO llamenos;
GRANT ALL PRIVILEGES ON DATABASE llamenos_bdd TO llamenos;
GRANT ALL PRIVILEGES ON DATABASE llamenos_ios TO llamenos;
GRANT ALL PRIVILEGES ON DATABASE llamenos_android_0 TO llamenos;
GRANT ALL PRIVILEGES ON DATABASE llamenos_android_1 TO llamenos;
GRANT ALL PRIVILEGES ON DATABASE llamenos_android_2 TO llamenos;
```

The init script is mounted into the postgres container via `docker-compose.concurrent.yml`.

### 2. Docker Compose Overlay

**`deploy/docker/docker-compose.concurrent.yml`** (new):

Extends `docker-compose.dev.yml` with:
- Postgres init script volume mount
- Per-suite app service templates (not running by default — started on demand)
- No strfry service (as specified)
- Project name includes worktree basename for isolation

```yaml
# Partial — full file in implementation
services:
  postgres:
    volumes:
      - ./postgres-init:/docker-entrypoint-initdb.d:ro

  # Template for per-suite backends — copied and customized at runtime
  app-desktop:
    extends: app
    ports:
      - "${DESKTOP_PORT:-3001}:3000"
    environment:
      - DATABASE_URL=postgresql://llamenos:${PG_PASSWORD:-dev}@postgres:5432/llamenos_desktop
      - PORT=3000
    profiles: ["desktop"]

  app-bdd:
    extends: app
    ports:
      - "${BDD_PORT:-3002}:3000"
    environment:
      - DATABASE_URL=postgresql://llamenos:${PG_PASSWORD:-dev}@postgres:5432/llamenos_bdd
      - PORT=3000
    profiles: ["bdd"]

  app-ios:
    extends: app
    ports:
      - "${IOS_PORT:-3003}:3000"
    environment:
      - DATABASE_URL=postgresql://llamenos:${PG_PASSWORD:-dev}@postgres:5432/llamenos_ios
      - PORT=3000
    profiles: ["ios"]
```

**Alternative: runtime `docker run` instead of compose extensions**

Instead of defining per-suite services in compose, the backend manager can run `docker run` directly for each backend:
```bash
docker run -d \
  --name llamenos-test-desktop \
  -p 3001:3000 \
  -e DATABASE_URL=postgresql://llamenos:dev@host.docker.internal:5432/llamenos_desktop \
  ... \
  llamenos-app:latest
```

This is lighter than compose but requires building the app image. For local dev, we prefer running `bun` directly (see Component 3).

### 3. Backend Manager Library

**`scripts/lib/backend-manager.sh`** (new):

Manages per-suite backend lifecycle:

```bash
# Start a backend for a specific suite
backend_start() {
  local suite="$1"      # desktop|bdd|ios|android_N
  local port="$2"       # app port
  local db_name="$3"    # postgres database name
  
  # Check if postgres is running, start shared services if not
  ensure_shared_services
  
  # Check if backend already running on this port
  if backend_is_healthy "$port"; then
    echo "Backend for $suite already healthy on port $port"
    return 0
  fi
  
  # Export environment for this suite
  export PORT="$port"
  export DATABASE_URL="postgresql://llamenos:dev@localhost:5432/${db_name}"
  export DEV_RESET_SECRET="test-reset-${suite}"
  export HMAC_SECRET="$(openssl rand -hex 32)"
  
  # Start bun server in background
  nohup bun --watch src/server/index.ts > "/tmp/llamenos-backend-${suite}.log" 2>&1 &
  
  # Wait for health
  wait_for_backend "$port"
}

# Stop a backend
backend_stop() {
  local suite="$1"
  # Kill process by port
  lsof -ti:"$port" | xargs kill -9 2>/dev/null || true
}

# Ensure shared postgres + rustfs are running
ensure_shared_services() {
  if ! docker compose -f deploy/docker/docker-compose.dev.yml ps postgres | grep -q running; then
    docker compose -f deploy/docker/docker-compose.dev.yml up -d postgres rustfs
  fi
}
```

**Decision: Direct `bun` execution over Docker.**

Running the backend via `bun --watch` is faster than building a Docker image and matches how developers already run `bun run dev:server`. The backend manager starts `bun` processes directly with environment variables pointing to the isolated database.

### 4. Enhanced Test Scripts

**`scripts/test-desktop.sh`** — modifications:
- Before Step 4 (Playwright), start backend on port 3001 with DB `llamenos_desktop`
- Set `TEST_HUB_URL=http://localhost:3001` for Playwright global setup
- Stop backend on exit (trap)

**`scripts/test-backend-bdd.sh`** — modifications:
- Instead of checking for existing backend at localhost:3000, start one on port 3002 with DB `llamenos_bdd`
- Set `TEST_HUB_URL=http://localhost:3002`
- `--workers=1` remains (backend tests share server state within the suite, but are isolated from other suites)

**`scripts/test-ios.sh`** — modifications:
- Add `--remote-backend` flag: do not start local backend, connect to `TEST_HUB_URL` (default `http://linux-machine:3003`)
- Add `--local-backend` flag (default on macOS): start backend on port 3003 with DB `llamenos_ios`
- On Linux (non-macOS), exit with message unless `--remote-backend` is provided

### 5. Cross-Machine iOS Orchestration

**Option A: Linux starts iOS backend, macOS runs tests (recommended)**

1. Linux machine starts `app-ios` backend on port 3003
2. Linux SSHs to macOS: `ssh mac "cd llamenos && bun run test:ios --remote-backend --hub-url http://linux-ip:3003"`
3. macOS runs xcodebuild tests against the remote backend
4. Linux collects results via SSH exit code + log file sync

**Option B: macOS starts its own backend**

1. macOS has Docker Desktop or local Postgres
2. macOS starts its own backend on port 3003 with DB `llamenos_ios`
3. macOS runs tests against localhost:3003
4. Linux just triggers the run and collects results

**Recommendation: Option A** — macOS may not have Docker/Postgres set up. The Linux machine already has the infrastructure. The macOS machine just needs Xcode and the iOS project.

**`scripts/test-ios-remote.sh`** (new):
```bash
# Runs on Linux, orchestrates iOS tests on macOS

# 1. Start iOS backend on Linux
backend_start ios 3003 llamenos_ios

# 2. Get Linux LAN IP
LINUX_IP=$(hostname -I | awk '{print $1}')

# 3. SSH to macOS and run tests
ssh "${MAC_SSH_HOST:-mac}" \
  "cd ${MAC_PROJECT:-~/projects/llamenos} && \
   bun run test:ios --remote-backend --hub-url http://${LINUX_IP}:3003"

# 4. Collect exit code
```

### 6. Orchestrator Integration

**`scripts/test-orchestrator.sh`** — enhancements:

```bash
# New flag: --ios-remote — include iOS tests via SSH to macOS
# New flag: --android — include Android tests
# New flag: --backend-bdd — include backend BDD (previously manual)

# Platform detection now includes:
# - desktop (always on Linux/macOS with bun+cargo)
# - backend-bdd (always with bun)
# - ios (on macOS locally, or on Linux if --ios-remote and MAC_SSH_HOST set)
# - android (on Linux/macOS with ANDROID_HOME)
# - worker (always with bun)
# - crypto (always with cargo)

# Shared services started once before parallel suite launch
ensure_shared_services

# Each suite starts its own backend via backend-manager.sh
```

### 7. Worktree Safety

When running from a git worktree:
- Compose project name: `llamenos-$(basename $(git rev-parse --show-toplevel))`
- Port base offset: detect worktree index, add offset (e.g., worktree #1 uses ports 4001+)
- Database names: `llamenos_desktop_w1`, `llamenos_bdd_w1`, etc.
- Log files: `/tmp/llamenos-$(worktree-name)-backend-${suite}.log`

**`scripts/lib/worktree-detect.sh`** (new):
```bash
# Detect if we're in a worktree and compute isolation parameters
worktree_name() {
  local git_dir
  git_dir="$(git rev-parse --git-dir 2>/dev/null || true)"
  if [[ "$git_dir" == *".git/worktrees/"* ]]; then
    basename "$(dirname "$git_dir")"
  else
    echo "main"
  fi
}

worktree_port_offset() {
  local name
  name="$(worktree_name)"
  case "$name" in
    main) echo 0 ;;
    *) echo "$(echo "$name" | cksum | cut -d' ' -f1 | tail -c 3)" ;;
  esac
}
```

---

## Database Lifecycle

### Creation
- Shared PostgreSQL container starts with init script creating all test databases
- If a database already exists, init script skips it (idempotent)
- Each suite backend runs migrations on its own database at startup

### Cleanup
- Databases are **not** dropped between runs (fast reuse)
- `test-reset` endpoint truncates tables within the suite's database only
- Full cleanup: `docker compose -f docker-compose.dev.yml down -v` (rarely needed)

### Migration Consistency
- All backends share the same migration files
- Running multiple backends concurrently means multiple migration runners
- PostgreSQL advisory locks prevent concurrent migration conflicts
- Alternatively: run migrations once in `ensure_shared_services` before starting backends

**Decision: Run migrations once in shared services startup.**

Before starting any backend, run:
```bash
bun run migrate:up  # Uses default DATABASE_URL=llamenos
# Then each backend uses its own DB (already migrated via init? No — init only creates DBs)
```

Actually, Drizzle migrations must run per-database. Simpler approach:
- Each backend runs migrations on its own DB at startup
- Drizzle's migration table is per-database, so no conflicts
- Multiple `bun run migrate:up` processes with different `DATABASE_URL`s are safe

---

## Environment Variables

### Per-Suite Backend Env

| Variable | Desktop | Backend BDD | iOS | Android N |
|---|---|---|---|---|
| `PORT` | 3001 | 3002 | 3003 | 3004+N |
| `DATABASE_URL` | `.../llamenos_desktop` | `.../llamenos_bdd` | `.../llamenos_ios` | `.../llamenos_android_N` |
| `DEV_RESET_SECRET` | `test-reset-desktop` | `test-reset-bdd` | `test-reset-ios` | `test-reset-android-N` |
| `HMAC_SECRET` | random | random | random | random |
| `ADMIN_PUBKEY` | same | same | same | same |
| `STORAGE_BUCKET` | `llamenos-desktop` | `llamenos-bdd` | `llamenos-ios` | `llamenos-android-N` |

### Shared Env (all suites)

| Variable | Value |
|---|---|
| `POSTGRES_HOST` | `localhost` |
| `POSTGRES_PORT` | `5432` |
| `POSTGRES_USER` | `llamenos` |
| `POSTGRES_PASSWORD` | `dev` |
| `RUSTFS_ENDPOINT` | `http://localhost:9000` |
| `RUSTFS_ACCESS_KEY` | `rustfsadmin` |
| `RUSTFS_SECRET_KEY` | `rustfsadmin` |

---

## CLI Interface

### New Commands

```bash
# Run all E2E tests concurrently (full suite)
bun run test:all

# Run specific suites
bun run test:all --platforms desktop,backend-bdd
bun run test:all --platforms ios --ios-remote

# Start shared services only (useful for manual testing)
scripts/test-concurrent.sh --services-only

# Stop all test backends and shared services
scripts/test-concurrent.sh --stop-all

# Check what would run (dry run)
bun run test:all --dry-run
```

### Existing Command Changes

| Command | Change |
|---|---|
| `bun run test:desktop` | Now starts own backend on port 3001 |
| `bun run test:backend:bdd` | Now starts own backend on port 3002 |
| `bun run test:ios` | New flags: `--remote-backend`, `--hub-url` |
| `bun run test:android` | Unchanged (already isolated) |
| `bun run test:worker` | Unchanged (no backend needed) |
| `bun run test:crypto` | Unchanged (no backend needed) |

---

## Error Handling

### Backend Startup Failure
- If a backend fails to start (port in use, DB connection failed), the suite fails fast
- Other suites continue running
- Orchestrator reports which suite failed and why

### Port Conflicts
- If a port is already in use, backend manager tries next port (port + 100)
- Logs warning about port conflict

### macOS SSH Failure
- If `MAC_SSH_HOST` is not configured, iOS tests are skipped with a warning
- If SSH connection fails, iOS suite fails with connection error

### Database Already Exists
- Init script is idempotent (`CREATE DATABASE IF NOT EXISTS` equivalent)
- Existing data is preserved (fast reuse)

---

## Success Criteria

| Criterion | Before | After |
|---|---|---|
| Command to run all E2E | Multiple manual steps | `bun run test:all` |
| Database isolation | None (all share `llamenos`) | Per-suite databases |
| Backend isolation | None (all share :3000) | Per-suite backends on unique ports |
| iOS + Linux coordination | Manual | Automated via SSH |
| Worktree conflicts | Possible port/DB conflicts | Automatic isolation |
| Time to run full suite | ~30+ min (serial) | ~10 min (parallel) |
| Android parallel | Already works | Unchanged |
| strfry dependency | Required | Removed |

---

## Implementation Order

1. **Create `scripts/lib/backend-manager.sh`** — backend lifecycle management
2. **Create `deploy/docker/postgres-init/00-create-test-databases.sql`** — multi-DB init
3. **Modify `scripts/test-desktop.sh`** — start isolated backend
4. **Modify `scripts/test-backend-bdd.sh`** — start isolated backend
5. **Modify `scripts/test-ios.sh`** — add remote backend support
6. **Create `scripts/test-ios-remote.sh`** — cross-machine orchestration
7. **Enhance `scripts/test-orchestrator.sh`** — include all suites, shared services
8. **Create `scripts/lib/worktree-detect.sh`** — worktree isolation
9. **Update documentation** — `docs/testing.md`, `CLAUDE.md` test section
10. **Test end-to-end** — verify all suites run concurrently without conflicts

---

## Documentation Updates

The following files must be updated as part of implementation:

1. **`docs/testing.md`** (new or existing) — comprehensive testing guide
2. **`CLAUDE.md`** — update test orchestration section
3. **`README.md`** — update quick start testing instructions
4. **`.claude/skills/test-orchestration/SKILL.md`** — update with concurrent patterns

---

## Open Questions

1. **Should we use Docker for backends or direct `bun` execution?**
   - Decision: Direct `bun` — faster, matches dev workflow
2. **How to handle RustFS bucket creation?**
   - RustFS buckets are auto-created on first write; no pre-creation needed
3. **Should databases be dropped between runs?**
   - Decision: No — preserves speed, `test-reset` handles table truncation
4. **What if macOS is not reachable?**
   - iOS suite is skipped with a clear warning; other suites continue
5. **How does this interact with the Test Infrastructure Overhaul epic?**
   - This spec provides the infrastructure isolation; the overhaul epic provides test-level isolation (hub-per-worker). They are complementary.
