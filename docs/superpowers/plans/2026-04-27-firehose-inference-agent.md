# Firehose Inference Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port v1 firehose agent into v2 monorepo with tiered inference (local/external), forward-secrecy buffer encryption, progressive extraction, circuit breaker with half-open recovery, CMS schema integration, backpressure, and admin UI.

**Architecture:** Observer layer hooks into MessagingAdapter webhooks. Buffer layer encrypts with per-window ephemeral keys. Extraction loop decrypts, clusters, runs inference via OpenAI-compatible SDK, validates against CMS field schema, and publishes E2EE reports via envelope encryption + Nostr events. Admin UI manages connections, monitors health, and configures thresholds.

**Tech Stack:** Bun + Hono + Drizzle ORM (backend), OpenAI SDK (inference client), React + TanStack Router + shadcn/ui (desktop UI), Zod schemas + protocol codegen, BDD tests.

---

## File Map

### Phase 1: Protocol and Schema Foundation

| File | Action |
|------|--------|
| `packages/protocol/schemas/firehose.ts` | New: Zod schemas for connection config, buffer envelope, inference config, extraction result, health status |
| `packages/protocol/schemas/firehose-events.ts` | New: Nostr event payload schemas for firehose events |
| `packages/protocol/tools/schema-registry.ts` | Modify: Register firehose schemas |
| `packages/protocol/crypto-labels.json` | Modify: Add `LABEL_FIREHOSE_AGENT_SEAL`, `LABEL_FIREHOSE_BUFFER_ENCRYPT`, `LABEL_FIREHOSE_REPORT_WRAP` |
| `packages/shared/nostr-events.ts` | Modify: Add `KIND_FIREHOSE_REPORT`, `KIND_FIREHOSE_ALERT`, `KIND_FIREHOSE_STATUS`, `KIND_FIREHOSE_HEALTH` |
| `packages/shared/crypto-labels.ts` | Auto-updated by codegen from crypto-labels.json |

### Phase 2: Database Schema

| File | Action |
|------|--------|
| `apps/worker/db/schema/firehose.ts` | New: `firehose_connections`, `firehose_message_buffer`, `firehose_notification_optouts`, `firehose_window_keys` tables |
| `apps/worker/db/schema/index.ts` | Modify: Export firehose schema |
| `apps/worker/db/migrations/NNNN_firehose.sql` | New: Migration for firehose tables |

### Phase 3: Core Services

| File | Action |
|------|--------|
| `apps/worker/services/firehose.ts` | New: Connection CRUD, buffer operations, window key management, TTL cleanup |
| `apps/worker/services/firehose-inference.ts` | New: OpenAI-compatible inference client with tiered config, data minimization, schema builder |
| `apps/worker/services/firehose-agent.ts` | New: Agent lifecycle, extraction loop, heuristic clustering, progressive extraction, circuit breaker, report submission |
| `apps/worker/services/firehose-buffer.ts` | New: Window-based buffer encryption/decryption, key rotation, forward secrecy |
| `apps/worker/lib/token-bucket.ts` | New: Token bucket rate limiter for backpressure |

### Phase 4: Messaging Integration

| File | Action |
|------|--------|
| `apps/worker/messaging/router.ts` | Modify: Hook firehose observer into inbound message flow |
| `apps/worker/services/firehose-observer.ts` | New: Observes messaging channels, encrypts and buffers messages |

### Phase 5: Routes and API

| File | Action |
|------|--------|
| `apps/worker/routes/firehose.ts` | New: CRUD routes for connections, buffer stats, health, manual extraction trigger |
| `apps/worker/routes/index.ts` | Modify: Mount firehose routes |
| `apps/worker/lib/service-factories.ts` | Modify: Add firehose service factories |

### Phase 6: Server Lifecycle

| File | Action |
|------|--------|
| `apps/worker/index.ts` | Modify: Initialize firehose agent on startup, graceful shutdown |

### Phase 7: Desktop Admin UI

| File | Action |
|------|--------|
| `src/client/lib/api.ts` | Modify: Add firehose API functions |
| `src/client/routes/hub-settings/firehose.tsx` | New: Firehose connections list page |
| `src/client/routes/hub-settings/firehose.$connectionId.tsx` | New: Connection detail/edit page |
| `src/client/components/firehose/connection-form.tsx` | New: Create/edit connection form |
| `src/client/components/firehose/connection-status.tsx` | New: Real-time status card with Nostr subscription |
| `src/client/components/firehose/extraction-history.tsx` | New: Extraction history table with confidence scores |
| `src/client/components/firehose/inference-health.tsx` | New: Inference endpoint health indicator |
| `src/client/components/firehose/field-mapping-preview.tsx` | New: JSON Schema preview from report type fields |
| `packages/i18n/locales/en.json` | Modify: Add ~30 firehose i18n keys |

### Phase 8: BDD Tests

| File | Action |
|------|--------|
| `packages/test-specs/features/core/firehose-connections.feature` | New: Connection CRUD scenarios |
| `packages/test-specs/features/core/firehose-extraction.feature` | New: Extraction loop scenarios |
| `packages/test-specs/features/core/firehose-circuit-breaker.feature` | New: Circuit breaker + backpressure scenarios |
| `tests/steps/backend/firehose-steps.ts` | New: Step definitions |
| `tests/api-helpers.ts` | Modify: Add firehose API test helpers |

---

## Phase 1: Protocol and Schema Foundation

### Task 1.1: Add crypto labels for firehose

**Files:** `packages/protocol/crypto-labels.json`

- [ ] Add three new labels:
  - `LABEL_FIREHOSE_AGENT_SEAL`: `"llamenos:firehose-agent-seal"` -- seals agent nsec at rest
  - `LABEL_FIREHOSE_BUFFER_ENCRYPT`: `"llamenos:firehose-buffer-encrypt"` -- domain separation for buffer envelope encryption
  - `LABEL_FIREHOSE_REPORT_WRAP`: `"llamenos:firehose-report-wrap"` -- domain separation for report envelope encryption

- [ ] Run `bun run codegen` to regenerate TS/Swift/Kotlin label constants

### Task 1.2: Add Nostr event kinds

**Files:** `packages/shared/nostr-events.ts`

- [ ] Add event kind constants:
  ```typescript
  export const KIND_FIREHOSE_REPORT = 20010
  export const KIND_FIREHOSE_ALERT = 20011
  export const KIND_FIREHOSE_STATUS = 20012
  export const KIND_FIREHOSE_HEALTH = 20013
  ```

### Task 1.3: Create firehose protocol schemas

**Files:** `packages/protocol/schemas/firehose.ts`, `packages/protocol/schemas/firehose-events.ts`

- [ ] Define Zod schemas for:
  - `FirehoseConnectionStatus`: `z.enum(['pending', 'active', 'paused', 'error'])`
  - `InferenceMode`: `z.enum(['local', 'external'])`
  - `InferenceConfig`: endpoint, model, apiKey, mode, consent, progressive config
  - `FirehoseConnectionConfig`: full connection configuration schema
  - `CreateFirehoseConnectionBody`: API request body
  - `UpdateFirehoseConnectionBody`: partial update body
  - `FirehoseConnectionResponse`: API response
  - `FirehoseBufferStats`: message count, oldest message, window count
  - `FirehoseHealthResponse`: latency, error rate, circuit state, backpressure info
  - `FirehoseExtractionResult`: fields, confidence, source message count, timestamps
  - `BufferEnvelopeJson`: encrypted content + recipient envelopes structure

- [ ] Define Nostr event payload schemas:
  - `FirehoseReportEvent`: type, connectionId, conversationId, confidence
  - `FirehoseAlertEvent`: type, connectionId, alertType, details
  - `FirehoseStatusEvent`: type, connectionId, status, timestamp
  - `FirehoseHealthEvent`: type, connectionId, healthy, latencyMs, errorRate

### Task 1.4: Register schemas in registry

**Files:** `packages/protocol/tools/schema-registry.ts`

- [ ] Register all new firehose schemas with appropriate names
- [ ] Run `bun run codegen` to verify registration

---

## Phase 2: Database Schema

### Task 2.1: Create firehose database tables

**Files:** `apps/worker/db/schema/firehose.ts`

- [ ] `firehose_connections` table:
  ```
  id (text PK)
  hub_id (text, FK to hubs)
  signal_group_id (text, nullable)
  display_name (text)
  encrypted_display_name (jsonb, nullable)
  report_type_id (text)
  agent_pubkey (text)
  encrypted_agent_nsec (text)
  inference_config (jsonb) -- InferenceConfig
  extraction_interval_sec (integer, default 60)
  system_prompt_suffix (text, nullable)
  geo_context (text, nullable)
  geo_context_country_codes (text[], nullable)
  buffer_ttl_days (integer, default 7)
  confidence_threshold (real, default 0.3)
  min_cluster_size (integer, default 2)
  cluster_window_ms (integer, default 300000)
  notify_via_signal (boolean, default true)
  status (text, default 'pending')
  circuit_breaker_state (text, default 'closed')
  circuit_breaker_failures (integer, default 0)
  circuit_breaker_last_attempt (timestamp, nullable)
  last_extraction_at (timestamp, nullable)
  last_health_check_at (timestamp, nullable)
  schema_version_hash (text, nullable)
  created_at (timestamp)
  updated_at (timestamp)
  ```

- [ ] `firehose_message_buffer` table:
  ```
  id (text PK)
  connection_id (text, FK)
  signal_timestamp (timestamp)
  encrypted_content (text)
  encrypted_sender_info (text)
  window_id (text)
  schema_version (text)
  cluster_id (text, nullable)
  extracted_report_id (text, nullable)
  received_at (timestamp)
  expires_at (timestamp)
  ```
  Indexes: `(connection_id, extracted_report_id)` for unextracted query, `(expires_at)` for cleanup

- [ ] `firehose_window_keys` table:
  ```
  id (text PK)
  connection_id (text, FK)
  window_start (timestamp)
  window_end (timestamp)
  encrypted_key (text) -- ECIES-wrapped for agent pubkey
  ephemeral_pubkey (text)
  is_active (boolean, default true)
  created_at (timestamp)
  ```

- [ ] `firehose_notification_optouts` table (from v1):
  ```
  id (text PK)
  connection_id (text, FK)
  user_id (text)
  opted_out_at (timestamp)
  UNIQUE(connection_id, user_id)
  ```

### Task 2.2: Export and migrate

**Files:** `apps/worker/db/schema/index.ts`

- [ ] Export all firehose tables from schema index
- [ ] Create migration SQL file
- [ ] Test migration against local PostgreSQL

---

## Phase 3: Core Services

### Task 3.1: Firehose service (connection CRUD + buffer ops)

**Files:** `apps/worker/services/firehose.ts`

Port from v1 (`llamenos-platform/src/server/services/firehose.ts`) with the following changes:
- [ ] Update imports to v2 paths (`../db`, `../bun-jsonb`, protocol schemas)
- [ ] Replace `encryptedAgentNsec: string` with structured `inference_config` JSONB
- [ ] Add `getWindowKeys()`, `createWindowKey()`, `deactivateWindowKey()` methods
- [ ] Add `getSchemaVersionHash(connectionId)` method
- [ ] Add `updateCircuitBreakerState()` method
- [ ] Carry forward: `createConnection`, `getConnection`, `listConnections`, `listActiveConnections`, `updateConnection`, `deleteConnection`, `findConnectionBySignalGroup`, buffer CRUD, notification optouts

### Task 3.2: Buffer encryption service

**Files:** `apps/worker/services/firehose-buffer.ts`

- [ ] `WindowKeyManager` class:
  - `getOrCreateActiveWindow(connectionId, agentPubkey)`: Returns current window key, creates new one if window expired
  - `encryptForBuffer(plaintext, connectionId, agentPubkey)`: Encrypts with current window key, returns envelope JSON
  - `rotateWindow(connectionId)`: Deactivate current window, create new one
  - `destroyExpiredWindows(connectionId)`: Zero and delete windows past TTL
  - Window duration configurable per connection (default 1 hour)

- [ ] Buffer envelope format:
  ```typescript
  interface BufferEnvelope {
    encrypted: string  // XChaCha20-Poly1305 ciphertext (hex)
    nonce: string      // 24-byte nonce (hex)
    windowId: string   // reference to window_keys row
    envelopes: Array<{ pubkey: string; encryptedKey: string; ephemeralPubkey: string }>
  }
  ```

### Task 3.3: Inference client

**Files:** `apps/worker/services/firehose-inference.ts`

Port from v1 (`llamenos-platform/src/server/services/firehose-inference.ts`) with enhancements:

- [ ] Carry forward: `FirehoseInferenceClient` class, `buildJsonSchemaFromFields()`, `extractReport()`, `detectIncidentBoundaries()`, `healthCheck()`
- [ ] Add `DataMinimizer` class:
  - `minimizeMessages(messages)`: Replace usernames with pseudonyms, strip IDs, strip metadata
  - `buildMinimizedPayloadHash(messages)`: SHA-256 of minimized content for audit
- [ ] Add progressive extraction support:
  - `extractWithCascade(messages, schema, config)`: Cheap model first, expensive if low confidence
- [ ] Add `InferenceAuditEntry` type for external API audit logging
- [ ] Add model configuration validation (check endpoint reachable on client creation)

### Task 3.4: Token bucket rate limiter

**Files:** `apps/worker/lib/token-bucket.ts`

- [ ] Implement `TokenBucket` class:
  ```typescript
  class TokenBucket {
    constructor(maxTokens: number, refillRate: number)
    tryConsume(tokens?: number): boolean
    getState(): { tokens: number; maxTokens: number; overflowCount: number }
  }
  ```
- [ ] In-memory per-connection (not persisted -- resets on restart, which is fine)

### Task 3.5: Firehose agent service

**Files:** `apps/worker/services/firehose-agent.ts`

Port from v1 (`llamenos-platform/src/server/services/firehose-agent.ts`) with enhancements:

- [ ] Carry forward: `AgentInstance` type, `init()`, `startAgent()`, `stopAgent()`, `shutdown()`, `runExtractionLoop()`, `heuristicCluster()`, `submitExtractedReport()`
- [ ] Add half-open circuit breaker state:
  - After cooldown (5 min), attempt single extraction
  - Success -> closed, failure -> back to open
  - Publish Nostr status events on state transitions
- [ ] Add backpressure via token bucket:
  - Check bucket before inference call
  - Skip extraction (keep messages buffered) when bucket empty
  - Prioritize newer clusters when bucket limited
- [ ] Add progressive extraction:
  - After cheap model extraction, check confidence
  - If below threshold and progressive enabled, re-extract with expensive model
  - Audit both attempts
- [ ] Add schema version checking:
  - On each extraction cycle, compute current schema hash
  - If hash differs from buffered messages' `schema_version`, log and proceed with current schema
- [ ] Add health check loop (separate interval, every 5 minutes):
  - Ping inference endpoint
  - Publish `KIND_FIREHOSE_HEALTH` event
  - Update `last_health_check_at` on connection

---

## Phase 4: Messaging Integration

### Task 4.1: Firehose observer

**Files:** `apps/worker/services/firehose-observer.ts`

- [ ] `FirehoseObserver` class:
  - `onInboundMessage(hubId, channelType, message)`: Called from messaging router
  - Finds active firehose connections for this hub that match the channel/group
  - Encrypts message content and sender info using `WindowKeyManager`
  - Stores encrypted buffer entry via `FirehoseService.addBufferMessage()`
  - Records schema version hash at ingest time

### Task 4.2: Hook into messaging router

**Files:** `apps/worker/messaging/router.ts`

- [ ] After existing message handling (conversation creation, notification dispatch), call `firehoseObserver.onInboundMessage()` for all inbound messages
- [ ] Only observe if there are active firehose connections for the hub (fast path: skip if no connections)
- [ ] Non-blocking: observer errors do not affect normal message flow (try/catch + log)

---

## Phase 5: Routes and API

### Task 5.1: Firehose routes

**Files:** `apps/worker/routes/firehose.ts`

- [ ] `GET /hubs/:hubId/firehose/connections` -- list connections (admin only)
- [ ] `POST /hubs/:hubId/firehose/connections` -- create connection
- [ ] `GET /hubs/:hubId/firehose/connections/:id` -- get connection detail
- [ ] `PATCH /hubs/:hubId/firehose/connections/:id` -- update connection
- [ ] `DELETE /hubs/:hubId/firehose/connections/:id` -- delete connection
- [ ] `POST /hubs/:hubId/firehose/connections/:id/start` -- activate agent
- [ ] `POST /hubs/:hubId/firehose/connections/:id/pause` -- pause agent
- [ ] `POST /hubs/:hubId/firehose/connections/:id/extract` -- manual extraction trigger
- [ ] `GET /hubs/:hubId/firehose/connections/:id/health` -- inference health check
- [ ] `GET /hubs/:hubId/firehose/connections/:id/buffer-stats` -- buffer statistics
- [ ] `GET /hubs/:hubId/firehose/connections/:id/extractions` -- extraction history
- [ ] All routes require admin permission (`firehose:manage`)

### Task 5.2: Mount routes and service factories

**Files:** `apps/worker/routes/index.ts`, `apps/worker/lib/service-factories.ts`

- [ ] Mount firehose routes under hub scope
- [ ] Add `getFirehoseService()`, `getFirehoseAgent()`, `getFirehoseObserver()` factories
- [ ] Initialize agent on server startup (conditional on `FIREHOSE_AGENT_SEAL_KEY` env var)

---

## Phase 6: Server Lifecycle

### Task 6.1: Agent initialization and shutdown

**Files:** `apps/worker/index.ts`

- [ ] On server start: if `FIREHOSE_AGENT_SEAL_KEY` is set, call `firehoseAgent.init()` to load and start all active connections
- [ ] On graceful shutdown (SIGTERM/SIGINT): call `firehoseAgent.shutdown()` to stop all agents, zero keys, flush state
- [ ] Add periodic cleanup job: `firehoseService.purgeExpiredMessages()` every 15 minutes

---

## Phase 7: Desktop Admin UI

### Task 7.1: API client functions

**Files:** `src/client/lib/api.ts`

- [ ] `listFirehoseConnections(hubId)`
- [ ] `createFirehoseConnection(hubId, data)`
- [ ] `getFirehoseConnection(hubId, connectionId)`
- [ ] `updateFirehoseConnection(hubId, connectionId, data)`
- [ ] `deleteFirehoseConnection(hubId, connectionId)`
- [ ] `startFirehoseConnection(hubId, connectionId)`
- [ ] `pauseFirehoseConnection(hubId, connectionId)`
- [ ] `triggerFirehoseExtraction(hubId, connectionId)`
- [ ] `getFirehoseHealth(hubId, connectionId)`
- [ ] `getFirehoseBufferStats(hubId, connectionId)`
- [ ] `getFirehoseExtractions(hubId, connectionId)`

### Task 7.2: Connections list page

**Files:** `src/client/routes/hub-settings/firehose.tsx`

- [ ] Table with columns: name, report type, status, last extraction, buffer size, health indicator
- [ ] Create new connection button -> opens form
- [ ] Row click -> navigates to detail view
- [ ] Status badges: active (green), paused (yellow), pending (gray), error (red)

### Task 7.3: Connection form component

**Files:** `src/client/components/firehose/connection-form.tsx`

- [ ] Display name field (will be encrypted with hub key on submit)
- [ ] Report type selector (fetches from hub's report type definitions)
- [ ] Inference config section:
  - Endpoint URL input with test connection button
  - Model name input
  - Mode toggle (local/external) with consent dialog for external
  - Progressive extraction toggle with threshold config
- [ ] Extraction config section:
  - Interval (seconds)
  - Confidence threshold
  - Cluster window (minutes)
  - Min cluster size
- [ ] Buffer config section:
  - TTL (days)
  - Window duration (minutes)
- [ ] Context section:
  - Geographic context (free text)
  - System prompt suffix (textarea)
- [ ] Notification toggle

### Task 7.4: Connection detail page

**Files:** `src/client/routes/hub-settings/firehose.$connectionId.tsx`

- [ ] Status card with real-time updates via Nostr subscription
- [ ] Action buttons: Start, Pause, Delete, Manual Extract
- [ ] Tabbed sections:
  - **Overview**: Config summary, field mapping preview
  - **Buffer**: Message count, oldest/newest, window count, schema version
  - **Extractions**: History table with confidence, timestamp, source count, link to report
  - **Health**: Inference latency chart, error rate, circuit breaker state, backpressure status

### Task 7.5: i18n strings

**Files:** `packages/i18n/locales/en.json`

- [ ] Add ~30 keys under `firehose.*` namespace for all UI strings

---

## Phase 8: BDD Tests

### Task 8.1: Connection CRUD tests

**Files:** `packages/test-specs/features/core/firehose-connections.feature`, `tests/steps/backend/firehose-steps.ts`

- [ ] Scenario: Admin creates a firehose connection with local inference
- [ ] Scenario: Admin creates a firehose connection with external inference (requires consent)
- [ ] Scenario: Admin updates connection inference config
- [ ] Scenario: Admin deletes connection (buffer messages purged)
- [ ] Scenario: Non-admin cannot access firehose endpoints

### Task 8.2: Extraction loop tests

**Files:** `packages/test-specs/features/core/firehose-extraction.feature`

- [ ] Scenario: Messages buffered and extracted on interval (mock inference endpoint)
- [ ] Scenario: Low-confidence extraction is discarded
- [ ] Scenario: Progressive extraction cascades to expensive model
- [ ] Scenario: Extraction produces E2EE report conversation
- [ ] Scenario: Schema version change triggers re-extraction of buffered messages

### Task 8.3: Circuit breaker and backpressure tests

**Files:** `packages/test-specs/features/core/firehose-circuit-breaker.feature`

- [ ] Scenario: Circuit breaker trips after N consecutive failures
- [ ] Scenario: Half-open state recovers on successful extraction
- [ ] Scenario: Backpressure skips extraction when token bucket empty
- [ ] Scenario: Newer clusters prioritized during backpressure

---

## Execution Order and Dependencies

```
Phase 1 (protocol) ─┐
                     ├── Phase 2 (DB) ── Phase 3 (services) ── Phase 4 (messaging) ── Phase 5 (routes) ── Phase 6 (lifecycle)
Phase 1 (protocol) ─┘                                                                                          │
                                                                                                                v
                                                                                                   Phase 7 (UI) + Phase 8 (BDD)
```

- Phases 1-2 can start immediately (no code dependencies)
- Phase 3 depends on Phase 1 (crypto labels, schemas) and Phase 2 (DB tables)
- Phase 4 depends on Phase 3 (buffer service, observer)
- Phase 5 depends on Phase 3 (services to expose)
- Phase 6 depends on Phase 5 (routes mounted)
- Phase 7 depends on Phase 5 (API available)
- Phase 8 can begin writing feature files in parallel with Phase 3+ (step definitions need routes)

### Parallel Agent Dispatch

Three agents can work simultaneously:
1. **Backend agent**: Phases 1-6 (sequential)
2. **Frontend agent**: Phase 7 (after Phase 5 routes exist -- can stub API initially)
3. **Test agent**: Phase 8 feature files (can write Gherkin immediately, step definitions after routes)

---

## Verification Checklist

- [ ] `bun run typecheck` passes
- [ ] `bun run build` succeeds
- [ ] `bun run test:backend:bdd` -- firehose scenarios green
- [ ] `bun run test` -- desktop Playwright tests still pass (no regressions)
- [ ] Manual test: create connection with local Ollama endpoint, send messages via Signal adapter mock, verify extraction produces report
- [ ] Manual test: circuit breaker trips when inference endpoint is down, recovers when back
- [ ] Codegen outputs updated (`bun run codegen`)
- [ ] i18n strings added (`bun run i18n:validate:desktop`)
