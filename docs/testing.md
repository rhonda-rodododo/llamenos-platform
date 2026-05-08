# Testing Guide

## Quick Reference

```bash
# Run all tests (all platforms, fully concurrent)
bun run test:all

# Run specific platforms
bun run test:all --platforms desktop,backend-bdd

# Run iOS tests on remote macOS (from Linux)
bun run test:all --ios-remote

# Run desktop tests only
bun run test:desktop

# Run backend BDD tests only
bun run test:backend:bdd

# Run iOS tests locally (on macOS)
bun run test:ios

# Run iOS tests remotely (macOS connects to Linux backend)
bun run test:ios --remote-backend --hub-url http://linux-ip:3003
```

## Architecture

### Concurrent Test Isolation

All E2E test suites run concurrently with full isolation:

| Suite | Backend Port | Database | Notes |
|---|---|---|---|
| Desktop | 3001 | `llamenos_desktop` | Playwright on 8788 |
| Backend BDD | 3002 | `llamenos_bdd` | API-only tests |
| iOS | 3003 | `llamenos_ios` | macOS or remote |
| Android shard N | 3004+N | `llamenos_android_N` | Existing pattern |

### Shared Services

One PostgreSQL and one RustFS container serve all suites:
- PostgreSQL: `localhost:5432`
- RustFS: `localhost:9000`

Each suite gets its own database within the shared PostgreSQL instance.

### Worktree Safety

Running tests from a git worktree automatically uses unique ports and database names to avoid conflicts with the main checkout or other worktrees.

## iOS Cross-Machine Testing

### Setup

1. Ensure SSH access from Linux to macOS:
   ```bash
   ssh mac  # Should connect without password (use ssh keys)
   ```

2. Set environment on Linux:
   ```bash
   export MAC_SSH_HOST=mac  # or your SSH host alias
   export MAC_PROJECT=~/projects/llamenos
   ```

3. Run iOS tests remotely:
   ```bash
   bun run test:all --ios-remote
   ```

### How It Works

1. Linux starts an iOS backend on port 3003 with DB `llamenos_ios`
2. Linux discovers its LAN IP
3. Linux SSHs to macOS and runs: `bun run test:ios --remote-backend --hub-url http://linux-ip:3003`
4. macOS runs xcodebuild tests against the remote backend
5. Linux collects results

## Backend Manager

The backend manager (`scripts/lib/backend-manager.sh`) manages per-suite backends:

```bash
# Start a backend
scripts/lib/backend-manager.sh start desktop 3001 llamenos_desktop

# Stop a backend
scripts/lib/backend-manager.sh stop desktop

# Stop all backends
scripts/lib/backend-manager.sh stop-all

# Check status
scripts/lib/backend-manager.sh status

# Manage shared services
scripts/lib/backend-manager.sh services start
scripts/lib/backend-manager.sh services stop
```

## Troubleshooting

### Port Already in Use

If a port is already in use, the backend manager will fail with an error. Check what's using the port:
```bash
lsof -ti:3001
```

Stop the conflicting process or use a worktree for isolation.

### Database Already Exists

This is fine — databases are reused between runs for speed. To fully reset:
```bash
docker compose -f deploy/docker/docker-compose.dev.yml down -v
```

### macOS SSH Fails

Ensure passwordless SSH is configured:
```bash
ssh-copy-id mac
```

### Backend Won't Start

Check the backend log:
```bash
tail -f /tmp/llamenos-backend-desktop.log
```
