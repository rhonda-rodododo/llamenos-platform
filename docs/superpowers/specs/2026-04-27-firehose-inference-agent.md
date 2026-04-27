# Spec: Firehose Inference Agent Service

**Date:** 2026-04-27
**Status:** Draft
**Branch target:** main

---

## Goal

Port and evolve the v1 firehose inference agent into the v2 monorepo architecture. The firehose observes messaging channels (Signal groups, SMS threads, WhatsApp groups), buffers incoming messages, runs LLM-powered extraction to produce structured CMS reports, and publishes results via E2EE envelope encryption and Nostr real-time events.

The v1 implementation (`llamenos-hotline/src/server/services/firehose.ts` + `firehose-agent.ts` + `firehose-inference.ts`) provides a solid foundation: connection CRUD, buffer management, heuristic clustering, OpenAI-compatible inference, and E2EE report submission. This spec defines the v2 evolution with tiered inference, forward-secrecy buffers, backpressure, circuit breakers, progressive extraction, and CMS schema integration.

---

## Architecture Overview

```
MessagingAdapter webhooks
        |
        v
  [Observer Layer]  -- receives inbound messages from Signal/SMS/WhatsApp
        |
        v
  [Buffer Layer]    -- encrypts with ephemeral per-window key, stores in PostgreSQL
        |              TTL-bounded, forward secrecy per window
        v
  [Extraction Loop] -- periodic (configurable interval per connection)
        |
        |-- 1. Decrypt buffered messages using agent nsec
        |-- 2. Heuristic cluster by time proximity
        |-- 3. (Optional) LLM-refined clustering
        |-- 4. Build extraction prompt from CMS field schema
        |-- 5. Run inference (local or remote, tiered)
        |-- 6. Validate extraction against schema
        v
  [Report Layer]    -- envelope-encrypt extracted report for agent + admins
        |
        |-- Create conversation record with report metadata
        |-- Publish Nostr event for real-time desktop/mobile notification
        |-- Audit log the extraction
        v
  [Admin UI]        -- connection management, field mapping, thresholds, health
```

---

## Trust Model and Privacy Guarantees

### Self-Hosted Default (Tier 1)

The default deployment runs inference entirely within operator infrastructure:

1. **Message decryption**: The agent process decrypts buffered messages using a sealed agent nsec (sealed with `LABEL_FIREHOSE_AGENT_SEAL` and the server's seal key). The nsec is zeroed from memory on agent shutdown.
2. **Local inference**: Decrypted plaintext is sent to a local Ollama/vLLM endpoint (default `http://localhost:11434/v1`). Plaintext never leaves the operator's network.
3. **Result encryption**: Extracted reports are envelope-encrypted (ECIES) for the agent pubkey + all admin pubkeys before storage. The server stores only ciphertext.
4. **Buffer encryption**: Messages in the buffer are encrypted with ephemeral per-window keys (see Buffer Management below). The server cannot read buffered messages without the agent nsec.

### External API Opt-In (Tier 2)

When operators explicitly enable external API mode:

1. **Explicit consent**: Requires setting `inferenceMode: 'external'` on the connection, plus a separate `externalInferenceConsent: true` flag. Both must be set; cannot be enabled via API alone (admin UI confirmation required).
2. **Data minimization**: Before sending to external API:
   - Strip all sender identifiers (usernames replaced with pseudonyms `User-A`, `User-B`, etc.)
   - Strip message IDs and internal references
   - Include only message content and relative timestamps
   - Never send hub ID, connection ID, or organizational context
3. **Audit logging**: Every external API call is audit-logged with: timestamp, connection ID, token count (estimated), model used, endpoint URL, and a SHA-256 hash of the minimized payload (for later verification without storing plaintext).
4. **Retention**: External API responses are processed immediately and not persisted in plaintext. Only the encrypted extraction result is stored.

### Key Management

- **Agent keypair**: Each firehose connection has a dedicated Nostr keypair. The nsec is sealed with `LABEL_FIREHOSE_AGENT_SEAL` using the server's seal key and stored encrypted in the database. Unsealing happens in-memory only when the agent starts.
- **Buffer window keys**: Ephemeral 32-byte symmetric keys rotated on a configurable window (default 1 hour). Old window keys are destroyed after the window closes and all messages in that window have been extracted or expired.
- **Report envelope keys**: Per-report random symmetric key, ECIES-wrapped for each recipient (agent + admins). Standard envelope encryption pattern from `ConversationService`.

---

## Buffer Management with Forward Secrecy

### Window-Based Key Rotation

Messages are encrypted with ephemeral symmetric keys that rotate on a time window:

```
Window 0: [t=0, t=60min)   -> key_0
Window 1: [t=60, t=120min) -> key_1
Window 2: [t=120, t=180min) -> key_2
```

Each window key is:
1. Generated via `crypto.getRandomValues(new Uint8Array(32))`
2. Used to encrypt all messages arriving within that window (XChaCha20-Poly1305 with domain label `LABEL_FIREHOSE_BUFFER_ENCRYPT`)
3. Stored in memory only (never persisted to disk/DB in plaintext)
4. ECIES-wrapped for the agent pubkey and stored alongside the buffer row (so the agent can decrypt during extraction)
5. Destroyed (zeroed) after the window closes and all messages in that window are either extracted or expired

This ensures forward secrecy: compromising the current window key does not reveal messages from prior windows.

### Buffer Schema

The existing v1 schema (from `firehose_message_buffer`) carries forward with additions:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | text PK | Message ID |
| `connection_id` | text FK | Which firehose connection |
| `signal_timestamp` | timestamp | Original message timestamp |
| `encrypted_content` | text | Envelope-encrypted message body |
| `encrypted_sender_info` | text | Envelope-encrypted sender metadata |
| `window_id` | text | Which key window this belongs to |
| `cluster_id` | text | Set after extraction clustering |
| `extracted_report_id` | text | Set after successful extraction |
| `schema_version` | text | CMS field schema version at ingest time |
| `received_at` | timestamp | Server receipt time |
| `expires_at` | timestamp | TTL expiry |

### TTL and Cleanup

- Default buffer TTL: configurable per connection (default 7 days, from v1)
- A periodic cleanup job (`purgeExpiredMessages`) runs every 15 minutes
- When a window's TTL expires, all messages in that window are deleted and the window key is zeroed

---

## Inference Client Design

### OpenAI-Compatible Interface

The inference client uses the OpenAI SDK (`openai` npm package) with a configurable `baseURL`. This works identically for:

- **Ollama**: `http://localhost:11434/v1`
- **vLLM**: `http://localhost:8000/v1`
- **OpenAI**: `https://api.openai.com/v1` (with API key)
- **Any OpenAI-compatible endpoint**: Groq, Together, local llama.cpp server, etc.

The only difference between self-hosted and external is the `baseURL` and `apiKey` configuration.

### Tiered Model Configuration

Each connection can configure:

```typescript
interface InferenceConfig {
  /** Primary endpoint URL (default: http://localhost:11434/v1) */
  endpoint: string
  /** Primary model name (default: qwen3:8b) */
  model: string
  /** API key for endpoint (default: 'not-needed' for local) */
  apiKey?: string
  /** Inference mode: 'local' (default) or 'external' */
  mode: 'local' | 'external'
  /** Required when mode='external' */
  externalInferenceConsent?: boolean

  /** Progressive extraction config */
  progressive?: {
    /** Enable cheap-then-expensive cascade */
    enabled: boolean
    /** Confidence threshold below which expensive model is used */
    confidenceThreshold: number  // default: 0.6
    /** Expensive model endpoint (can be same or different server) */
    expensiveEndpoint?: string
    /** Expensive model name */
    expensiveModel: string
    /** Expensive model API key */
    expensiveApiKey?: string
  }
}
```

### Client Caching

Inference clients are cached per endpoint URL (carried over from v1 `inferenceClients` map). This avoids creating new HTTP connections for every extraction cycle. The cache is cleared on agent shutdown.

---

## Prompt Engineering Strategy

### Crisis Context Extraction

Extraction prompts are carefully designed for crisis/rapid-response contexts:

1. **System prompt structure**:
   - Role: "You are a report extraction agent processing messages from a crisis response coordination channel."
   - Task: "Extract structured fields from the conversation according to the provided schema."
   - Context: Geographic context (if configured), custom system prompt suffix (if configured)
   - Constraints: "Only extract information explicitly stated in the messages. Mark fields as empty rather than guessing. Include a confidence score."

2. **Schema-driven extraction**: The JSON Schema for `response_format` is generated dynamically from the CMS field definitions. This means extraction automatically adapts when admins modify report type fields -- no prompt changes needed.

3. **Pseudonym mapping**: When data minimization is active (external mode), sender usernames are replaced with `User-A`, `User-B`, etc. A mapping is maintained in memory for the duration of the extraction call (not persisted).

4. **Confidence scoring**: The LLM is asked to self-report confidence (0-1). This is used for:
   - Filtering (below `CONFIDENCE_THRESHOLD`, default 0.3, extraction is discarded)
   - Progressive cascade trigger (below `progressive.confidenceThreshold`, default 0.6, expensive model re-extracts)
   - Display in admin UI (admins can review low-confidence extractions)

### Prompt Templates

Prompts are **not hardcoded to any use case** (legal observer, jail support, etc.). They are generic crisis-response extraction prompts that operate on whatever CMS field schema the admin has configured. The `systemPromptSuffix` on each connection allows admins to add domain-specific context without modifying code.

---

## CMS Field Schema Integration

### How Extraction Maps to Entity/Report Types

1. **Connection -> Report Type**: Each firehose connection is bound to a `reportTypeId` (from `report_type_definitions` table). This determines which fields the LLM extracts.

2. **Field Schema -> JSON Schema**: The `buildJsonSchemaFromFields()` method (from v1) converts CMS `CustomFieldDef` entries into a JSON Schema object suitable for the OpenAI `response_format` parameter. Field type mapping:
   - `text`, `textarea` -> `{ type: "string" }`
   - `select` -> `{ type: "string", enum: [...options] }`
   - `multiselect` -> `{ type: "string", description: "comma-separated from: ..." }`
   - `number` -> `{ type: "string", description: "numeric value" }`
   - `checkbox` -> `{ type: "string", description: "yes or no" }`
   - `date` -> `{ type: "string", description: "ISO 8601 datetime" }`
   - `location` -> `{ type: "string", description: "location/address" }`

3. **Schema versioning**: Each buffered message records the `schema_version` (a hash of the field definitions at ingest time). When the admin modifies report type fields:
   - New messages are ingested with the new schema version
   - Buffered (unextracted) messages with the old schema version are re-extracted using the new schema
   - Already-extracted reports are NOT retroactively modified (they remain as-is)

4. **Report type field resolution**: The agent loads fields via `SettingsService.getCustomFields()` filtered to the connection's `reportTypeId`, plus fields from the `reportTypeDefinitions.fields` JSONB column. Both sources are merged, with report-type-specific fields taking precedence.

---

## Nostr Event Publishing

### Event Types

All firehose events use generic Nostr tags (`["t", "llamenos:event"]`) so the relay cannot distinguish event types. Event content is encrypted with the hub's event key (via `encryptHubEvent`).

| Event | Kind | Content Type | Purpose |
|-------|------|-------------|---------|
| Report extracted | `KIND_FIREHOSE_REPORT` | `firehose:report` | New extraction available for review |
| Report notification | `KIND_FIREHOSE_REPORT` | `firehose:report:notify` | Push notification to admins |
| Circuit breaker tripped | `KIND_FIREHOSE_ALERT` | `firehose:alert:circuit-breaker` | Inference endpoint failure alert |
| Connection status change | `KIND_FIREHOSE_STATUS` | `firehose:status` | Agent started/stopped/paused |
| Health check result | `KIND_FIREHOSE_HEALTH` | `firehose:health` | Periodic endpoint health status |

### Event Tags

```typescript
tags: [
  ['d', hubId],           // hub scope
  ['t', 'llamenos:event'], // generic tag (relay cannot distinguish)
  ['c', connectionId],    // connection reference
]
```

---

## Admin UI Requirements

### Connection Management Page

Located at the hub settings level (since firehose connections are hub-scoped):

1. **Connection list**: Table showing all firehose connections for the hub with status indicators (active/paused/pending/error), last extraction time, buffer size, inference health.

2. **Create connection form**:
   - Display name (encrypted with hub key)
   - Report type selector (from `reportTypeDefinitions`)
   - Inference endpoint URL
   - Model name
   - Inference mode toggle (local/external) with consent confirmation dialog for external
   - Extraction interval (seconds, default 60)
   - Buffer TTL (days, default 7)
   - Geographic context (free text)
   - System prompt suffix (free text)
   - Signal notification toggle

3. **Connection detail view**:
   - Real-time status (via Nostr subscription)
   - Buffer statistics (message count, oldest message, window count)
   - Extraction history (last N extractions with confidence scores)
   - Inference health (latency, error rate, circuit breaker state)
   - Manual extraction trigger button
   - Pause/resume/delete controls

4. **Field mapping preview**: Shows the JSON Schema that will be sent to the LLM, generated from the selected report type's fields. Allows admins to verify the extraction schema before activating.

### Thresholds and Configuration

- Confidence threshold (connection-level, default 0.3)
- Progressive extraction toggle + expensive model confidence threshold (default 0.6)
- Circuit breaker failure count (default 3)
- Minimum cluster size (default 2)
- Cluster time window (default 5 minutes)

---

## Backpressure and Circuit Breaker

### Token Bucket Rate Limiting

Inference requests are rate-limited per connection using a token bucket:

```typescript
interface TokenBucket {
  tokens: number       // current tokens
  maxTokens: number    // bucket capacity (default: 10)
  refillRate: number   // tokens per second (default: 0.5)
  lastRefill: number   // timestamp of last refill
}
```

When the bucket is empty:
1. Messages continue to accumulate in the buffer (they are encrypted and stored regardless)
2. The extraction loop skips inference and logs a backpressure warning
3. The next extraction cycle checks the bucket again
4. An overflow counter tracks how many cycles were skipped (reported in health events)

### Priority Queue

When backpressure is active, newer message clusters are prioritized over older ones. Rationale: in crisis response, recent events are more actionable than stale ones. The extraction loop sorts clusters by newest-first when the bucket has limited tokens.

### Circuit Breaker

Carried forward from v1 with enhancements:

| State | Behavior |
|-------|----------|
| **Closed** | Normal operation. Failure counter resets on success. |
| **Open** | After N consecutive failures (default 3), agent is paused. Buffer continues accumulating. Nostr alert published. |
| **Half-open** | After a configurable cooldown (default 5 minutes), the next extraction cycle is attempted. Success -> closed. Failure -> open. |

The v1 implementation goes straight from closed to open (auto-pause). The v2 enhancement adds a half-open state with automatic recovery, reducing admin intervention for transient failures.

---

## Progressive Extraction

### Cheap -> Expensive Model Cascade

When progressive extraction is enabled:

1. **First pass**: Run extraction with the primary (cheap/local) model
2. **Confidence check**: If extraction confidence < `progressive.confidenceThreshold` (default 0.6):
   - Re-run extraction with the expensive model using the same prompt
   - Use the expensive model's result
   - Audit log records both attempts with their confidence scores
3. **Fallback**: If the expensive model also fails or returns low confidence, use the cheap model's result if it exceeds `CONFIDENCE_THRESHOLD` (0.3), otherwise discard

This allows operators to:
- Use a fast 8B local model for most extractions (sub-second latency)
- Fall back to a larger model (70B local or external API) only when needed
- Control cost/latency tradeoffs per connection

---

## New Protocol Schemas

The following Zod schemas need to be added to `packages/protocol/schemas/`:

1. **`firehose.ts`**: Connection config, buffer envelope, extraction result, health status
2. **Nostr event kinds**: `KIND_FIREHOSE_REPORT`, `KIND_FIREHOSE_ALERT`, `KIND_FIREHOSE_STATUS`, `KIND_FIREHOSE_HEALTH` in `packages/shared/nostr-events.ts` (if not already present)
3. **Crypto labels**: `LABEL_FIREHOSE_AGENT_SEAL`, `LABEL_FIREHOSE_BUFFER_ENCRYPT`, `LABEL_FIREHOSE_REPORT_WRAP` in `packages/protocol/crypto-labels.json`

---

## Decisions to Review

### 1. Inference Deployment Model

**Chosen:** Tiered -- self-hosted (Ollama/vLLM) by default, external API opt-in with data minimization.
**Alternatives considered:**
- Self-hosted only: Simpler security model, but excludes operators without GPU hardware
- External only: Lower operational burden, but violates zero-knowledge principle for the default case
- Client-side inference (WASM): Like the Whisper transcription pattern -- impractical for LLM-scale models on volunteer devices

### 2. Buffer Encryption Strategy

**Chosen:** Ephemeral per-window symmetric keys, ECIES-wrapped for agent pubkey, destroyed after window closes.
**Alternatives considered:**
- Encrypt with agent pubkey directly (per-message ECIES): Expensive for high-throughput channels, and the agent needs to decrypt in bulk anyway
- Encrypt with hub key: Would allow any hub member to decrypt buffers, violating least-privilege
- No buffer encryption (rely on DB access controls): Unacceptable -- compromised DB would expose all buffered plaintext

### 3. OpenAI SDK as Universal Interface

**Chosen:** `openai` npm package with configurable `baseURL` for both local and remote.
**Alternatives considered:**
- Direct HTTP calls: More control but more code to maintain; OpenAI SDK handles retries, streaming, response parsing
- Provider-specific SDKs: Ollama has its own SDK, but the OpenAI-compatible endpoint is standard across all providers now
- LangChain/LlamaIndex: Too heavy, too many abstractions, version churn; direct SDK is simpler and more predictable

### 4. Clustering Strategy

**Chosen:** Heuristic time-window clustering (5 min) as first pass, optional LLM-refined clustering as second pass.
**Alternatives considered:**
- LLM-only clustering: Expensive for every extraction cycle; heuristic handles the common case well
- Embedding-based clustering: Requires a separate embedding model; adds complexity without clear benefit for the message volumes we handle
- No clustering (extract from full buffer): Loses incident boundaries; a single extraction from 100+ messages produces low-quality results

### 5. Progressive Extraction (Cheap -> Expensive Cascade)

**Chosen:** Configurable two-tier cascade with confidence threshold trigger.
**Alternatives considered:**
- Always use expensive model: Cost-prohibitive for high-volume channels
- Always use cheap model: Acceptable quality for most cases, but misses complex incidents
- Ensemble (run both, merge results): Complex merge logic, unclear benefit over cascade

### 6. Circuit Breaker with Half-Open Recovery

**Chosen:** Three-state circuit breaker (closed/open/half-open) with automatic recovery attempt.
**Alternatives considered:**
- v1 pattern (closed/open only, manual resume): Requires admin intervention for transient failures
- Exponential backoff without circuit breaker: Does not alert admins of persistent issues
- No circuit breaker (fail and retry indefinitely): Could overwhelm a struggling inference endpoint

### 7. Schema Versioning and Re-Extraction

**Chosen:** Record schema version at ingest, re-extract buffered messages when schema changes, leave historical reports untouched.
**Alternatives considered:**
- Re-extract everything (including historical): Dangerous -- could produce different results from the same messages, breaking audit trail
- Ignore schema changes for buffered messages: Would produce reports with stale field definitions
- Version the extraction prompt separately from the schema: Over-engineered; schema version is sufficient

### 8. Data Minimization for External API

**Chosen:** Pseudonymize senders (`User-A`, `User-B`), strip IDs, strip organizational context, audit-log every external call.
**Alternatives considered:**
- Send full context to external API: Violates zero-knowledge principle
- Differential privacy / noise injection: Impractical for text extraction -- noise degrades extraction quality
- Encrypt messages for external API (homomorphic): Not feasible with current LLM architectures
