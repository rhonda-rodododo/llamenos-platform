# Spec: Unified SIP Bridge Rewrite

**Date:** 2026-04-27
**Status:** Draft
**Replaces:** `asterisk-bridge/` (ARI-only)
**Reference:** v1 plan at `docs/superpowers/plans/2026-04-03-plan-a-sip-bridge-refactor.md`

---

## Problem Statement

The current `asterisk-bridge/` is a tightly-coupled ARI-only service. v2 now has 8 telephony adapters, with two bridge-dependent backends (Asterisk, FreeSWITCH) that share no bridge code. The bridge needs to:

1. Support multiple PBX backends via a protocol-agnostic interface
2. Incorporate the memory hardening already done on `lm-asterisk-bridge-hardening`
3. Support SFrame E2EE media passthrough for encrypted voice
4. Be future-ready for WebRTC gateway mode (browser-to-SIP)

## Goals

1. **Replace** `asterisk-bridge/` with `sip-bridge/` — a protocol-agnostic bridge service
2. **Support 3 backend protocols** via `BridgeClient` interface: ARI (Asterisk), ESL (FreeSWITCH), JSONRPC (Kamailio as SIP proxy/load-balancer only)
3. **Maintain backward compatibility** with the Worker's `AsteriskAdapter` — same HTTP command/webhook interface
4. **Incorporate hardening** from `lm-asterisk-bridge-hardening`: Set-based handlers, centralized `cleanupCall()`, TTL pruning, AbortController timeouts, `dispose()` lifecycle
5. **SFrame E2EE path**: Support `passthrough` bridge type (no media termination) for encrypted RTP streams
6. **WebRTC gateway mode** (future): WebSocket SIP signaling for browser-based clients

## Non-Goals

- No IDP (identity/discovery protocol) — v2 uses Nostr keypairs directly
- No Kamailio call control — it remains a proxy/load-balancer with health-check only
- No multi-bridge-instance clustering (single bridge per deployment for now)
- No changes to the Worker's `TelephonyAdapter` interface itself

## Architecture

### Single Process, Multi-Client

```
┌─────────────────────────────────────────────────────┐
│                    sip-bridge                         │
│                                                      │
│  ┌────────────┐   ┌────────────────────────────┐   │
│  │ HTTP Server │   │     CommandHandler          │   │
│  │ (commands)  │──▶│  (call state + orchestration)│  │
│  └────────────┘   └────────────────────────────┘   │
│         ▲                      │                     │
│         │                      ▼                     │
│  ┌────────────┐   ┌────────────────────────────┐   │
│  │ WebhookSend│◀──│       BridgeClient          │   │
│  │ (→ Worker) │   │  (selected by PBX_TYPE)     │   │
│  └────────────┘   └────────────────────────────┘   │
│                        ▲           ▲         ▲       │
│                   ┌────┘     ┌─────┘    ┌────┘      │
│              AriClient   EslClient  KamailioClient   │
│              (WebSocket)  (TCP)     (HTTP/JSONRPC)   │
└─────────────────────────────────────────────────────┘
```

### Backend Selection

- **`PBX_TYPE` env var** selects the active client at startup: `asterisk` | `freeswitch` | `kamailio`
- One bridge process per PBX — no routing between multiple backends in one process
- Multi-backend deployments use separate bridge instances (one per PBX) with separate Worker adapter instances

### Why NOT Multi-Backend Per Process?

- Simplifies state management (all channels belong to one PBX)
- Avoids cross-PBX bridge scenarios (you can't bridge a channel on Asterisk with one on FreeSWITCH)
- Docker/Helm: one sidecar per PBX service, each with its own `PBX_TYPE`
- Failover is handled at the SIP proxy level (Kamailio dispatcher), NOT in the bridge

### BridgeClient Interface (from v1, proven)

```typescript
interface BridgeClient {
  connect(): Promise<void>
  disconnect(): void
  isConnected(): boolean
  onEvent(handler: (event: BridgeEvent) => void): void

  // Call control
  originate(params: OriginateParams): Promise<{ id: string }>
  hangup(channelId: string): Promise<void>
  answer(channelId: string): Promise<void>
  bridge(channelId1: string, channelId2: string, options?: BridgeOptions): Promise<string>
  destroyBridge(bridgeId: string): Promise<void>

  // Media
  playMedia(channelId: string, media: string, playbackId?: string): Promise<string>
  stopPlayback(playbackId: string): Promise<void>
  startMoh(channelId: string, mohClass?: string): Promise<void>
  stopMoh(channelId: string): Promise<void>

  // Recording
  recordChannel(channelId: string, params: RecordParams): Promise<void>
  recordBridge(bridgeId: string, params: RecordParams): Promise<void>
  stopRecording(recordingName: string): Promise<void>
  getRecordingFile(recordingName: string): Promise<ArrayBuffer | null>
  deleteRecording(recordingName: string): Promise<void>

  // System
  healthCheck(): Promise<BridgeHealthStatus>
  listChannels(): Promise<Array<{ id: string; state: string; caller: string }>>
  listBridges(): Promise<Array<{ id: string; channels: string[] }>>
}
```

### BridgeOptions (extended for E2EE)

```typescript
interface BridgeOptions {
  record?: boolean
  /** Bridge type: 'mixing' (default, media-terminating) or 'passthrough' (SFrame E2EE) */
  type?: 'mixing' | 'passthrough'
}
```

### SFrame E2EE Interaction

- **Mixing bridge** (default): PBX terminates media — supports recording, hold music, DTMF detection. NOT compatible with E2EE.
- **Passthrough bridge**: PBX relays RTP without processing. Compatible with SFrame-encrypted media. No server-side recording, DTMF detection, or hold music in this mode.
- **Selection logic**: The Worker decides based on hub settings. If `e2ee_voice` is enabled for a hub, the `bridge` command includes `type: 'passthrough'`.
- **Asterisk**: Uses `dtls_direct_media` bridge type in PJSIP, or `simple_bridge` technology.
- **FreeSWITCH**: Uses `bypass_media` mode (media stays between endpoints).
- **Recording with E2EE**: Client-side only (WASM Whisper). Server never sees plaintext audio in passthrough mode.

### HTTP Command Interface (Worker ↔ Bridge)

Unchanged from current `asterisk-bridge/`. The Worker sends signed JSON commands to these endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/status` | GET | Detailed status (active calls, bridges, PBX info) |
| `/command` | POST | Generic command dispatch (hangup, ring, cancelRinging, status) |
| `/ring` | POST | Parallel ring volunteers |
| `/cancel-ringing` | POST | Cancel all ringing except picked-up volunteer |
| `/hangup` | POST | Hang up a specific channel |
| `/recordings/:name` | GET | Fetch recording audio |

All POST endpoints verified via `X-Bridge-Signature` (HMAC-SHA256).

### Worker-Side Changes

- `AsteriskAdapter` renames internal field `ariUrl` → `bridgeUrl` (already talks to bridge, not ARI directly)
- Add `FreeSwitchAdapter` that also talks to the bridge over the same HTTP interface
- Both adapters share 90%+ of their code — extract `SipBridgeAdapter` base class
- `FreeSwitchAdapter` differs only in endpoint format (`sofia/internal/...` vs `PJSIP/...@trunk`)

### Webhook Format (Bridge → Worker)

The bridge POSTs signed webhooks to the Worker. Two modes:

1. **TwiML mode** (current): Bridge sends form-urlencoded webhooks mimicking Twilio format. Worker responds with TwiML. Bridge parses TwiML into internal commands. Advantage: Worker doesn't need adapter-specific response code.

2. **JSON command mode** (new, preferred): Bridge sends JSON webhooks. Worker responds with JSON commands. No TwiML parsing needed. The `AsteriskAdapter` already returns JSON commands — this is the native format.

**Decision: Use JSON command mode.** The TwiML parsing in `webhook-sender.ts` is fragile (regex-based). The AsteriskAdapter already generates JSON commands natively. Remove TwiML translation from the bridge entirely.

### Docker Deployment Model

```yaml
# One bridge per PBX backend
services:
  sip-bridge-asterisk:
    image: llamenos/sip-bridge
    environment:
      PBX_TYPE: asterisk
      ARI_URL: ws://asterisk:8088/ari/events
      ARI_REST_URL: http://asterisk:8088/ari
      ARI_USERNAME: llamenos
      ARI_PASSWORD: ${ARI_PASSWORD}
      WORKER_WEBHOOK_URL: http://worker:3001
      BRIDGE_SECRET: ${BRIDGE_SECRET}
      BRIDGE_PORT: 3000

  # Optional: second bridge for FreeSWITCH
  sip-bridge-freeswitch:
    image: llamenos/sip-bridge
    environment:
      PBX_TYPE: freeswitch
      ESL_HOST: freeswitch
      ESL_PORT: 8021
      ESL_PASSWORD: ${ESL_PASSWORD}
      WORKER_WEBHOOK_URL: http://worker:3001
      BRIDGE_SECRET: ${BRIDGE_SECRET_FS}
      BRIDGE_PORT: 3000
```

### Failover Strategy

- **SIP-level failover** via Kamailio dispatcher: routes SIP INVITE to healthy backends
- **Bridge health** reported via `/health` endpoint; Docker/k8s restarts unhealthy bridges
- **No application-level failover** between PBX types — if Asterisk is down, Kamailio routes to FreeSWITCH at SIP layer
- **Future**: Bridge could implement active/standby with a shared state store (Redis). Not needed pre-production.

### WebRTC Gateway (Future)

- WebSocket-based SIP signaling (SIP over WS, RFC 7118)
- Browser registers as a SIP endpoint via the bridge
- Bridge relays WebRTC ↔ SIP (ICE/STUN/TURN for NAT traversal)
- Compatible with SFrame E2EE (browser handles encryption, bridge just relays)
- Not part of this rewrite — interface designed to accommodate it later

## Memory Hardening (Carried Over)

All hardening from `lm-asterisk-bridge-hardening` is incorporated:

1. **Set-based event handlers** — `new Set<EventHandler>()` instead of array (prevents duplicate registration, O(1) removal)
2. **Centralized `cleanupCall()`** — single function tears down ALL state for a channel (gather timeout, queue interval, recording callbacks, bridges, ringing channels)
3. **TTL sweep** — recording callbacks pruned every 60s if older than 5 minutes
4. **AbortController timeouts** — all fetch() calls use `AbortSignal.timeout(30_000)`
5. **`dispose()` lifecycle** — graceful shutdown clears all intervals/timers
6. **Reconnect timer cleanup** — `clearTimeout(reconnectTimer)` on disconnect
7. **WebSocket cleanup on reconnect** — old WS closed before new connection attempt
8. **Snapshot-before-fanout** — copy handler Set before iterating (prevents mutation during iteration)

## Decisions to Review

1. **JSON command mode vs TwiML**: Spec recommends JSON-only. This means the TwiML parser in `webhook-sender.ts` is removed. If there's a future need for TwiML compatibility (e.g., third-party integrations), it would need to be re-added. **Risk**: Low — all bridge communication is internal.

2. **One process per PBX vs multi-PBX routing**: Spec chooses one-per-PBX. Alternative: single bridge with router that dispatches commands to the correct backend. **Trade-off**: Multi-PBX is more complex but reduces operational overhead. Given pre-production status and likely single-PBX deployments, one-per-PBX is simpler.

3. **Passthrough bridge for SFrame**: Requires Asterisk 18+ (`simple_bridge`) or FreeSWITCH `bypass_media`. If the PBX doesn't support passthrough, the bridge should reject `type: 'passthrough'` with an error rather than silently falling back to mixing (which would break E2EE expectations).

4. **Base class extraction on Worker side** (`SipBridgeAdapter`): The Asterisk and FreeSWITCH adapters share HTTP-to-bridge communication, HMAC signing, recording retrieval, and webhook parsing. Only endpoint format and some response parsing differs. Extract base class now or later? **Recommendation**: Now — it prevents code drift.

5. **TwiML response removal from AsteriskAdapter**: Currently the AsteriskAdapter returns JSON commands. The bridge's `parseTwimlToCommands` is dead code on the v2 path (it was needed when the Worker responded with TwiML for all providers). Remove it. The Worker-side already returns provider-specific formats.

6. **Kamailio as BridgeClient**: v1 implements it with all call-control methods throwing. Is this interface abuse? Alternative: separate `ProxyClient` interface with just `healthCheck()` + `listDispatcherEntries()`. **Recommendation**: Keep as BridgeClient with explicit "not supported" errors — it allows uniform lifecycle management in the bridge host.

7. **Recording storage**: Recordings are currently stored on the PBX filesystem and fetched via the bridge. For multi-PBX deployments, should recordings go to RustFS/S3 directly? **Recommendation**: Not in this rewrite. Current flow (PBX stores → bridge fetches → Worker stores to RustFS) works. Direct PBX→S3 is a separate optimization.

8. **Bridge port binding**: Currently binds to `127.0.0.1` only. In Docker, it needs to bind to `0.0.0.0` for inter-container communication. Use `BRIDGE_HOST` env var defaulting to `0.0.0.0` in Docker, `127.0.0.1` in dev.
