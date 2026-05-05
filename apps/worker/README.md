# apps/worker

Bun HTTP server — the Llamenos backend. Built with [Hono](https://hono.dev/) routing and [Drizzle ORM](https://orm.drizzle.team/) + PostgreSQL for persistence.

> **Note**: The directory name `apps/worker/` is retained from an earlier Cloudflare Workers architecture. This is a plain Bun server, not a Worker. A rename is tracked as a separate epic.

## Architecture

| Layer | Technology |
|-------|-----------|
| HTTP framework | Hono |
| Database | PostgreSQL via Bun SQL + Drizzle ORM |
| File storage | RustFS (S3-compatible) |
| Real-time | Nostr relay (strfry) |
| Telephony | `TelephonyAdapter` — 8 providers (Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth, Asterisk, FreeSWITCH) |
| Messaging | `MessagingAdapter` — SMS, WhatsApp, Signal, Telegram, RCS |

## Running Locally

```bash
# Start backing services first (PostgreSQL, RustFS, strfry)
docker compose -f deploy/docker/docker-compose.dev.yml up -d

# Start the server with file watching
bun run dev:server
```

## Key Directories

```
routes/          # Hono route handlers (one file per resource)
db/              # Drizzle ORM schemas + migrations
  bun-jsonb.ts   # Custom JSONB column type (avoids double-serialization)
services/        # Business logic service classes
telephony/       # TelephonyAdapter interface + 8 provider implementations
messaging/       # MessagingAdapter interface + channel implementations
lib/             # Auth, crypto wrappers, WebAuthn utilities
```

## Important Notes

- **Schemas**: All Zod schemas live in `packages/protocol/schemas/` — import from `@protocol/schemas`, not from a local `schemas/` directory
- **JSONB**: Always import `jsonb` from `../db/bun-jsonb` (never from `drizzle-orm/pg-core`) — Drizzle's built-in JSONB calls `JSON.stringify()` but Bun SQL already serializes objects, causing double-serialization
- **Hono route ordering**: Mount specific paths (e.g., `/settings/cms`) before catch-all paths (e.g., `/settings`)
- **Test isolation**: `POST /api/test-create-hub`, `GET/DELETE /api/test-push-log`, `POST /api/test-simulate/push-dispatch` are available in dev for BDD test isolation

## Testing

```bash
bun run test:backend:bdd     # Backend BDD tests (requires running dev server)
bun run test:worker          # Codegen + typecheck + integration tests
```
