# Plan: Unified SIP Bridge Rewrite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `asterisk-bridge/` with `sip-bridge/` — a protocol-agnostic bridge supporting Asterisk (ARI), FreeSWITCH (ESL), and Kamailio (JSONRPC) via a unified `BridgeClient` interface. Incorporate all memory hardening. Support SFrame E2EE passthrough.

**Spec reference:** `docs/superpowers/specs/2026-04-27-sip-bridge-rewrite.md`

**Source references:**
- Current bridge: `asterisk-bridge/src/` (5 files)
- Hardened branch: `lm-asterisk-bridge-hardening` (memory leak fixes)
- v1 unified bridge: `/media/rikki/recover2/projects/llamenos-platform-code-review/sip-bridge/src/` (proven BridgeClient + ARI/ESL/Kamailio clients)
- Worker adapter: `apps/worker/telephony/asterisk.ts`
- TelephonyAdapter interface: `apps/worker/telephony/adapter.ts`

---

## Task 1: Scaffold `sip-bridge/` Project

**Files:**
- Create: `sip-bridge/package.json`
- Create: `sip-bridge/tsconfig.json`
- Create: `sip-bridge/src/bridge-client.ts`
- Create: `sip-bridge/src/types.ts`

- [ ] Create `sip-bridge/package.json`:
  ```json
  {
    "name": "llamenos-sip-bridge",
    "version": "1.0.0",
    "description": "Unified SIP bridge — translates PBX events (Asterisk ARI, FreeSWITCH ESL, Kamailio JSONRPC) to HTTP webhooks for Llamenos",
    "type": "module",
    "scripts": {
      "dev": "bun run --watch src/index.ts",
      "start": "bun run src/index.ts",
      "typecheck": "tsc --noEmit",
      "build": "bun build src/index.ts --outdir dist --target bun",
      "test": "bun test"
    },
    "dependencies": {},
    "devDependencies": {
      "@types/bun": "^1.2.0",
      "typescript": "^5.8.0"
    }
  }
  ```

- [ ] Create `sip-bridge/tsconfig.json` — ESNext target, bundler moduleResolution, strict mode, Bun types

- [ ] Create `sip-bridge/src/bridge-client.ts` — copy from v1 (`/media/rikki/recover2/projects/llamenos-platform-code-review/sip-bridge/src/bridge-client.ts`), extend `BridgeOptions` with `type: 'mixing' | 'passthrough'` for SFrame E2EE support

- [ ] Create `sip-bridge/src/types.ts` — base event types shared across all clients (BridgeEvent union, OriginateParams, BridgeHealthStatus are already in bridge-client.ts; this file holds internal state types: ActiveCall, BridgeConfig, BridgeCommand, WebhookPayload, RecordingCallbackEntry)

- [ ] Run `cd sip-bridge && bun install && bun run typecheck`
- [ ] Commit: `feat(sip-bridge): scaffold unified bridge project with BridgeClient interface`

---

## Task 2: ARI Client (Asterisk)

**Files:**
- Create: `sip-bridge/src/clients/ari-client.ts`

- [ ] Port `asterisk-bridge/src/ari-client.ts` to `sip-bridge/src/clients/ari-client.ts`, implementing `BridgeClient` interface. Incorporate ALL hardening from `lm-asterisk-bridge-hardening`:
  - `Set<EventHandler>` instead of array
  - `offEvent()` method
  - `reconnectTimer` tracking + cleanup in `disconnect()`
  - Close old WS before reconnect
  - Snapshot-before-fanout (copy Set before iterating)
  - `AbortSignal.timeout(30_000)` on all fetch calls
  - `signal` on recording file fetch

- [ ] Add `translateEvent(ariEvent): BridgeEvent | null` private method that maps:
  - `StasisStart` → `channel_create`
  - `ChannelStateChange` (state=Up) → `channel_answer`
  - `ChannelDestroyed` → `channel_hangup`
  - `ChannelDtmfReceived` → `dtmf_received`
  - `RecordingFinished` → `recording_complete`
  - `RecordingFailed` → `recording_failed`
  - `PlaybackFinished` → `playback_finished`

- [ ] Implement all BridgeClient methods:
  - `originate()` → `POST /channels`
  - `hangup()` → `DELETE /channels/{id}`
  - `answer()` → `POST /channels/{id}/answer`
  - `bridge()` → `POST /bridges` + `addChannel` x2, optionally record. Support `type: 'passthrough'` via Asterisk `simple_bridge` technology
  - `playMedia()`, `startMoh()`, `stopMoh()`, `recordChannel()`, `recordBridge()`, etc.
  - `healthCheck()` → `GET /asterisk/info` with latency measurement

- [ ] Retain Asterisk-specific public methods needed by CommandHandler: `startRinging()`, `stopRinging()`, `addChannelToBridge()`, `removeChannelFromBridge()`, `getAsteriskInfo()`, `listChannels()`, `listBridges()`

- [ ] Run `bun run typecheck`
- [ ] Commit: `feat(sip-bridge): implement ARI client with BridgeClient interface and memory hardening`

---

## Task 3: ESL Client (FreeSWITCH)

**Files:**
- Create: `sip-bridge/src/clients/esl-client.ts`

- [ ] Port from v1 (`/media/rikki/recover2/projects/llamenos-platform-code-review/sip-bridge/src/clients/esl-client.ts`). Key characteristics:
  - TCP connection using `Bun.connect()`
  - Text-based protocol: `Key: Value\n` headers, `\n\n` separator, Content-Length body
  - Auth: `auth <password>\n\n` → expect `+OK`
  - Subscribe: `event plain CHANNEL_CREATE CHANNEL_ANSWER CHANNEL_HANGUP_COMPLETE CHANNEL_BRIDGE DTMF RECORD_STOP PLAYBACK_STOP\n\n`
  - Commands: `api <cmd>\n\n` (sync) or `bgapi <cmd>\n\n` (async)

- [ ] Implement BridgeClient methods via ESL commands:
  - `originate()` → `bgapi originate {vars}sofia/internal/user@domain &park()`
  - `hangup()` → `api uuid_kill <uuid>`
  - `answer()` → `api uuid_answer <uuid>`
  - `bridge()` → `api uuid_bridge <uuid1> <uuid2>`. For passthrough: set `bypass_media=true` channel variable before bridge
  - `playMedia()` → `api uuid_broadcast <uuid> <path> aleg`
  - `startMoh()` → `api uuid_broadcast <uuid> local_stream://default aleg`
  - `recordChannel()` → `api uuid_record <uuid> start <path>`
  - `healthCheck()` → `api status` and measure RTT

- [ ] Event translation:
  - `CHANNEL_CREATE` → `channel_create`
  - `CHANNEL_ANSWER` → `channel_answer`
  - `CHANNEL_HANGUP_COMPLETE` → `channel_hangup` (extract `hangup_cause` as SIP cause code)
  - `DTMF` → `dtmf_received`
  - `RECORD_STOP` → `recording_complete`
  - `PLAYBACK_STOP` → `playback_finished`

- [ ] Apply same hardening patterns: Set-based handlers, reconnect timer tracking, connection deadline, buffer management

- [ ] Run `bun run typecheck`
- [ ] Commit: `feat(sip-bridge): implement ESL client for FreeSWITCH`

---

## Task 4: Kamailio Client (Management Only)

**Files:**
- Create: `sip-bridge/src/clients/kamailio-client.ts`

- [ ] Port from v1. Kamailio is a SIP proxy, NOT a PBX. All call-control methods throw with descriptive errors. Implements BridgeClient for uniform lifecycle.

- [ ] Implement:
  - `connect()` → verify JSONRPC endpoint reachable
  - `disconnect()` → no-op (stateless HTTP)
  - `isConnected()` → always true
  - `onEvent()` → no-op (no call events from proxy)
  - `healthCheck()` → `core.psx` JSONRPC method
  - All call-control methods → throw `Error('Kamailio is a SIP proxy — call control not supported. Use Asterisk or FreeSWITCH.')`

- [ ] Add Kamailio-specific public methods:
  - `listDispatcherEntries()` → `dispatcher.list` JSONRPC
  - `setDispatcherState(uri, active)` → `dispatcher.set_state` (for marking backends up/down)

- [ ] Run `bun run typecheck`
- [ ] Commit: `feat(sip-bridge): implement Kamailio JSONRPC client (management-only)`

---

## Task 5: CommandHandler (Unified)

**Files:**
- Create: `sip-bridge/src/command-handler.ts`

- [ ] Port from `asterisk-bridge/src/command-handler.ts` (hardened version from `lm-asterisk-bridge-hardening`). Key changes:
  - Accept `BridgeClient` instead of `AriClient` — all call control goes through the interface
  - Incorporate centralized `cleanupCall()` with all 8 cleanup steps
  - TTL sweep for recording callbacks (5min TTL, 60s interval)
  - `dispose()` for graceful shutdown
  - `RecordingCallbackEntry` with `createdAt` timestamp

- [ ] Remove TwiML parsing — the CommandHandler now only processes JSON commands from the Worker. The Worker's AsteriskAdapter already returns JSON. Remove `parseTwimlToCommands()` entirely.

- [ ] Adjust event handling for protocol-agnostic events:
  - Listen for `BridgeEvent` (not `AnyAriEvent`)
  - `channel_create` with `args[0] === 'dialed'` → volunteer outbound leg
  - `channel_create` without → incoming call, answer + notify Worker
  - `channel_hangup` → cleanup + send call-status webhook
  - `dtmf_received` → gather logic
  - `recording_complete` / `recording_failed` → recording callback
  - `playback_finished` → gather timeout start

- [ ] The bridge command format stays the same (the Worker sends JSON):
  - `speak`, `play`, `gather`, `queue`, `bridge`, `record`, `hangup`, `leave_queue`, `ring`, `cancel_ringing`
  - Map these to `BridgeClient` method calls

- [ ] Run `bun run typecheck`
- [ ] Commit: `feat(sip-bridge): unified CommandHandler using BridgeClient interface`

---

## Task 6: WebhookSender (Simplified)

**Files:**
- Create: `sip-bridge/src/webhook-sender.ts`

- [ ] Port from `asterisk-bridge/src/webhook-sender.ts`. Key changes:
  - Remove `parseTwimlToCommands()` entirely (JSON-only mode)
  - Keep `sendWebhook()` — sends JSON POST to Worker, receives JSON commands back
  - Keep HMAC-SHA256 signing (`sign()`) and verification (`verifySignature()`)
  - Add `AbortSignal.timeout(30_000)` to webhook fetch (from hardening branch)
  - Change content type from `application/x-www-form-urlencoded` to `application/json`
  - Payload is now JSON (not form-encoded): `{ event, channelId, callerNumber, calledNumber, digits?, queueTime?, ... }`

- [ ] Update `WebhookPayload` type to be a clean JSON interface (no more Twilio field names):
  ```typescript
  interface WebhookPayload {
    event: string
    channelId: string
    callerNumber: string
    calledNumber?: string
    digits?: string
    queueTime?: number
    queueResult?: string
    callStatus?: string
    recordingStatus?: string
    recordingName?: string
    metadata?: Record<string, string>
  }
  ```

- [ ] Run `bun run typecheck`
- [ ] Commit: `feat(sip-bridge): JSON-only WebhookSender (remove TwiML parsing)`

---

## Task 7: Entry Point + Client Factory

**Files:**
- Create: `sip-bridge/src/index.ts`
- Create: `sip-bridge/src/client-factory.ts`

- [ ] Create `sip-bridge/src/client-factory.ts`:
  - Read `PBX_TYPE` env var (`asterisk` | `freeswitch` | `kamailio`)
  - Instantiate the appropriate BridgeClient with its config from env vars
  - Throw descriptive error if PBX_TYPE is missing or unknown

- [ ] Create `sip-bridge/src/index.ts` (port from `asterisk-bridge/src/index.ts`):
  - Load config from env vars (superset: ARI vars, ESL vars, Kamailio vars — only relevant ones used)
  - Create BridgeClient via factory
  - Create WebhookSender
  - Create CommandHandler(client, webhook, config)
  - Register `client.onEvent()` → `handler.handleEvent()`
  - Start HTTP server with all endpoints: `/health`, `/status`, `/command`, `/ring`, `/cancel-ringing`, `/hangup`, `/recordings/:name`
  - Bind to `BRIDGE_HOST` (default `0.0.0.0`) for Docker compatibility
  - Connect to PBX
  - Graceful shutdown: `handler.dispose()`, `client.disconnect()`, `server.stop()`

- [ ] Run `bun run typecheck && bun run build`
- [ ] Commit: `feat(sip-bridge): entry point with client factory and HTTP server`

---

## Task 8: Worker-Side — SipBridgeAdapter Base Class

**Files:**
- Create: `apps/worker/telephony/sip-bridge-adapter.ts`
- Modify: `apps/worker/telephony/asterisk.ts`

- [ ] Extract `SipBridgeAdapter` abstract base class from `AsteriskAdapter`:
  - Shared: `bridgeRequest()`, HMAC signing, `validateWebhook()`, `getCallRecording()`, `getRecordingAudio()`, all `parse*Webhook()` methods
  - Shared: `json()` helper, `speak()`, `play()`, `speakOrPlay()`
  - Abstract: `getEndpointFormat(phone: string): string` (returns SIP endpoint string for the specific PBX)
  - Abstract: `getPbxType(): string` (for logging/debugging)

- [ ] Refactor `AsteriskAdapter` to extend `SipBridgeAdapter`:
  - `getEndpointFormat(phone)` → `PJSIP/${phone}@trunk`
  - Remove all code now in base class
  - Keep any Asterisk-specific overrides (currently none)

- [ ] Run `bun run typecheck`
- [ ] Commit: `refactor(worker): extract SipBridgeAdapter base class from AsteriskAdapter`

---

## Task 9: Worker-Side — FreeSwitchAdapter

**Files:**
- Create: `apps/worker/telephony/freeswitch.ts`
- Modify: `apps/worker/lib/service-factories.ts`

- [ ] Create `FreeSwitchAdapter extends SipBridgeAdapter`:
  - `getEndpointFormat(phone)` → `sofia/internal/${phone}@${trunk}`
  - `getPbxType()` → `'freeswitch'`
  - Override any FreeSWITCH-specific behavior if needed (likely none — bridge abstracts it)

- [ ] Register in `apps/worker/lib/service-factories.ts`:
  - Add `case 'freeswitch': return new FreeSwitchAdapter(...)` in `createTelephonyAdapter()`
  - Import from `../telephony/freeswitch`

- [ ] Run `bun run typecheck`
- [ ] Commit: `feat(worker): add FreeSwitchAdapter extending SipBridgeAdapter`

---

## Task 10: Worker-Side — Update Webhook Parsing

**Files:**
- Modify: `apps/worker/telephony/sip-bridge-adapter.ts` (or asterisk.ts)
- Modify: relevant route handlers in `apps/worker/routes/`

- [ ] Update `parseIncomingWebhook()` and other parse methods to handle the new JSON payload format from the bridge:
  - Old: form-urlencoded with Twilio field names (`CallSid`, `From`, `To`, `Digits`)
  - New: JSON with clean field names (`channelId`, `callerNumber`, `calledNumber`, `digits`)
  - Support both formats during migration (check content-type header)

- [ ] Verify all telephony route handlers work with the new payload format

- [ ] Run `bun run typecheck`
- [ ] Commit: `feat(worker): support JSON webhook payloads from unified SIP bridge`

---

## Task 11: Dockerfile + Docker Compose

**Files:**
- Create: `sip-bridge/Dockerfile`
- Modify: `deploy/docker/docker-compose.dev.yml`
- Modify: `deploy/docker/docker-compose.yml`

- [ ] Create `sip-bridge/Dockerfile` (based on `asterisk-bridge/Dockerfile`):
  - Multi-stage: deps → build → production
  - Env vars: `PBX_TYPE`, `BRIDGE_HOST=0.0.0.0`, `BRIDGE_PORT=3000`, plus PBX-specific vars
  - HEALTHCHECK on `/health`

- [ ] Update `docker-compose.dev.yml`:
  - Replace `asterisk-bridge` service with `sip-bridge`
  - Set `PBX_TYPE=asterisk` for dev (Asterisk is the default dev PBX)
  - Link to asterisk service

- [ ] Update `docker-compose.yml` (production):
  - Replace `asterisk-bridge` service with `sip-bridge`
  - Support both Asterisk and FreeSWITCH via compose profiles

- [ ] Run `docker compose -f deploy/docker/docker-compose.dev.yml config` to validate
- [ ] Commit: `feat(sip-bridge): Dockerfile and Docker Compose integration`

---

## Task 12: Remove `asterisk-bridge/`

**Files:**
- Delete: `asterisk-bridge/` (entire directory)
- Update: any references in `package.json` workspace config, CI, docs

- [ ] Delete `asterisk-bridge/` directory
- [ ] Update root `package.json` if it references asterisk-bridge workspace
- [ ] Update `deploy/docker/docker-compose.yml` — rename `asterisk-bridge` service to `sip-bridge`, update dockerfile path
- [ ] Update `deploy/helm/llamenos/values.yaml` — rename asterisk-bridge references
- [ ] Update `.github/workflows/docker.yml` — update build context/dockerfile references
- [ ] Update `CLAUDE.md` to reference `sip-bridge/` instead of `asterisk-bridge/`
- [ ] Merge the `lm-asterisk-bridge-hardening` branch changes (now incorporated into sip-bridge)
- [ ] Run full typecheck: `bun run typecheck`
- [ ] Commit: `refactor: remove asterisk-bridge/ (replaced by sip-bridge/)`

---

## Task 13: Tests

**Files:**
- Create: `sip-bridge/src/clients/ari-client.test.ts`
- Create: `sip-bridge/src/clients/esl-client.test.ts`
- Create: `sip-bridge/src/clients/kamailio-client.test.ts`
- Create: `sip-bridge/src/command-handler.test.ts`
- Create: `sip-bridge/src/webhook-sender.test.ts`

- [ ] ARI client tests: mock WebSocket + fetch, verify event translation, reconnect logic, timeout handling
- [ ] ESL client tests: mock TCP socket, verify protocol parsing, event translation, command formatting
- [ ] Kamailio client tests: mock fetch, verify JSONRPC formatting, health check, call-control throws
- [ ] CommandHandler tests: mock BridgeClient, verify:
  - Incoming call flow (channel_create → answer → webhook → execute commands)
  - Parallel ring (ring command → originate → volunteer answers → bridge)
  - DTMF gather (gather command → digit events → callback)
  - Queue (queue command → MOH → wait callbacks → leave)
  - cleanupCall() tears down everything
  - TTL sweep removes stale entries
- [ ] WebhookSender tests: verify JSON formatting, HMAC signing, signature verification

- [ ] Run `cd sip-bridge && bun test`
- [ ] Commit: `test(sip-bridge): unit tests for all bridge components`

---

## Task 14: BDD Feature File (Backend Integration)

**Files:**
- Create: `tests/features/telephony/sip-bridge.feature`

- [ ] Write BDD scenarios covering:
  - Bridge health check endpoint
  - Incoming call → Worker webhook → JSON command response
  - Parallel ring → volunteer answers → bridge established
  - Recording → recording complete webhook
  - DTMF gather → digits collected → callback
  - E2EE passthrough bridge type
  - Invalid command handling (400 response)
  - HMAC signature verification (403 on invalid)

- [ ] Commit: `test(bdd): SIP bridge integration scenarios`

---

## Verification Checklist

After all tasks:
- [ ] `cd sip-bridge && bun run typecheck && bun run build && bun test`
- [ ] `bun run typecheck` (root — Worker types)
- [ ] `docker compose -f deploy/docker/docker-compose.dev.yml up sip-bridge -d` (starts + passes health check)
- [ ] `asterisk-bridge/` directory no longer exists
- [ ] `lm-asterisk-bridge-hardening` branch can be deleted (changes absorbed)

---

## Architecture Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend selection | `PBX_TYPE` env var, one process per PBX | Simplicity; no cross-PBX bridging needed |
| Command format | JSON only (no TwiML) | AsteriskAdapter already uses JSON; TwiML parser was fragile regex |
| Failover | SIP-level via Kamailio dispatcher | Application-level failover adds complexity without pre-production benefit |
| E2EE support | `passthrough` bridge option | Explicit opt-in; reject if PBX doesn't support it |
| Worker code sharing | `SipBridgeAdapter` base class | Prevents drift between Asterisk/FreeSWITCH adapters |
| Webhook payload | JSON with clean field names | Drop Twilio-mimicking form-encoded format for internal bridge communication |
| Docker model | One container per PBX backend | Maps cleanly to sidecar pattern; independent scaling |
