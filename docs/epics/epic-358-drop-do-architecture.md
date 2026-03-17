# Epic 358: Drop Durable Object Architecture — Direct PostgreSQL Services

**Depends on:** Epic 357 (Bun runtime migration)

## Context

The Llamenos backend was originally designed for Cloudflare Workers + Durable Objects. A Node.js platform shim was built to run the same DO code on PostgreSQL for self-hosted deployments. The project has since pivoted to self-hosted-only (Bun runtime, Epic 357), making the CF Workers path dead code and the DO abstraction pure overhead.

**Current architecture:**
- 9 Durable Objects (`IdentityDO`, `SettingsDO`, `RecordsDO`, `ShiftManagerDO`, `CallRouterDO`, `ConversationDO`, `BlastDO`, `ContactDirectoryDO`, `CaseDO`)
- All 9 are singletons accessed via `idFromName()` (with hub-scoped variants)
- Every DO uses a `DORouter` (44-line custom HTTP method+path router) for internal dispatch
- ALL data stored in a single `kv_store(namespace, key, value JSONB)` table — no typed tables
- Secondary indexes maintained as additional KV entries (`idx:*` keys)
- Advisory locks (`pg_advisory_xact_lock`) simulate CF's single-writer guarantee
- 1,194 lines of platform abstraction code (`src/platform/`) exist solely to shim DOs
- Routes call DOs via `fetch(new Request('http://do/path'))` — HTTP-over-nothing for in-process calls
- `wrangler.jsonc` configures 9 DO bindings that only matter for CF Workers

**What this costs:**
- Every "database query" is: route → build Request → DO.fetch() → DORouter.handle() → parse Request → storage.get() → SQL query on `kv_store` → deserialize JSONB → return Response → parse Response in route. At least 4 unnecessary serialization/deserialization cycles per operation.
- No relational indexes — ContactDirectoryDO and CaseDO maintain hand-rolled trigram and secondary indexes as separate KV rows (`idx:trigram:*`, `idx:status:*`, etc.)
- No JOINs — cross-entity queries require multiple sequential KV lookups
- No SQL aggregation — counts, sums, grouping all done in JS after loading full datasets
- The `kv_store` table has millions of rows with no type safety — a `vol:*` volunteer record and a `captcha:*` ephemeral entry share the same table
- Hub scoping is implicit in namespace strings, not enforced by schema
- ConversationDO and BlastDO duplicate subscriber/blast code (known debt)

## Goal

Replace the DO architecture with **direct PostgreSQL service classes** that own typed tables with proper relational schema, indexes, and constraints. Routes call services directly — no HTTP-over-nothing, no DORouter, no Request/Response serialization.

## Scope

### In Scope
- Replace all 9 DOs with service classes backed by typed PostgreSQL tables
- Design proper relational schema (one table per entity, foreign keys, indexes)
- Replace `kv_store` catch-all with purpose-built tables
- Replace `DORouter` dispatch with direct method calls
- Replace `getDOs(c.env)` / `getScopedDOs()` with service injection
- Replace advisory locks with row-level locking or optimistic concurrency
- Replace alarm poller with PostgreSQL-native scheduled tasks (pg_cron or application-level)
- Delete the entire `src/platform/` directory (1,194 lines)
- Delete `apps/worker/lib/do-router.ts`
- Delete `apps/worker/lib/do-access.ts`
- Update all ~30 route files to call services instead of DOs
- Update `apps/worker/types.ts` (Env interface)
- Delete `wrangler.jsonc` DO bindings (keep worker config if marketing site still needs it)
- Migrate existing data from `kv_store` to typed tables

### Out of Scope
- Cloudflare Workers for marketing site (unchanged — separate deployment)
- Frontend changes (API contract stays identical)
- Mobile clients (same API)
- Crypto layer (unchanged)
- Nostr relay integration (unchanged — still uses strfry)

## Architecture: Before and After

### Before: Route → DO → KV Store

```
HTTP Request
  → Hono route handler
    → getDOs(c.env).records  (DOStub)
      → stub.fetch(new Request('http://do/notes', { method: 'POST', body }))
        → DORouter.handle(request)
          → matched handler parses request body
            → this.ctx.storage.put('note:{uuid}', noteData)
              → PostgresStorage.put()
                → BEGIN; advisory_lock; INSERT INTO kv_store (namespace, key, value); COMMIT
            → return Response.json({ note })
          ← handler returns Response
        ← DORouter returns Response
      ← stub.fetch returns Response
    ← route parses response JSON
  → return c.json(data)
```

### After: Route → Service → Typed Table

```
HTTP Request
  → Hono route handler
    → c.get('services').records.createNote(noteData)
      → INSERT INTO notes (id, hub_id, author_pubkey, ...) VALUES (...) RETURNING *
    ← returns typed Note object
  → return c.json({ note })
```

**Eliminated:** DOStub, Request construction, DORouter, Response serialization, KV indirection, advisory locks for simple writes.

## Database Schema Design

### Principle: One Table Per Entity Type

Each DO's KV key patterns become proper tables. Hub scoping becomes an explicit `hub_id` column with a foreign key to `hubs`.

### Core Tables

```sql
-- Hub registry (from SettingsDO 'hub:*' keys)
CREATE TABLE hubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone_number TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  settings JSONB NOT NULL DEFAULT '{}'
);

-- Volunteers (from IdentityDO 'vol:*' keys)
CREATE TABLE volunteers (
  pubkey TEXT PRIMARY KEY,  -- 64-char hex
  roles TEXT[] NOT NULL DEFAULT '{"volunteer"}',  -- array, not singular
  display_name TEXT,
  phone TEXT,  -- encrypted
  status TEXT NOT NULL DEFAULT 'active',
  hub_roles JSONB NOT NULL DEFAULT '[]',  -- [{hubId, roleIds: string[]}]
  availability TEXT NOT NULL DEFAULT 'unavailable',
  on_break BOOLEAN DEFAULT false,
  call_preference TEXT,  -- 'phone', 'webrtc', 'sip'
  spoken_languages TEXT[] DEFAULT '{}',
  ui_language TEXT,
  transcription_enabled BOOLEAN DEFAULT false,
  profile_completed BOOLEAN DEFAULT false,
  specializations TEXT[] DEFAULT '{}',  -- Epic 340
  max_case_assignments INTEGER,          -- Epic 340
  team_id TEXT,                          -- Epic 340
  supervisor_pubkey TEXT,                -- Epic 340
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Sessions (from IdentityDO 'session:*' keys)
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  pubkey TEXT NOT NULL REFERENCES volunteers(pubkey) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  device_info JSONB
);
CREATE INDEX idx_sessions_pubkey ON sessions (pubkey);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- Invite codes (from IdentityDO 'invite:*' keys)
CREATE TABLE invite_codes (
  code TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'volunteer',
  created_by TEXT REFERENCES volunteers(pubkey),
  hub_id UUID REFERENCES hubs(id),
  redeemed_by TEXT REFERENCES volunteers(pubkey),
  redeemed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WebAuthn credentials (from IdentityDO 'webauthn:creds:*' keys)
CREATE TABLE webauthn_credentials (
  credential_id TEXT PRIMARY KEY,
  pubkey TEXT NOT NULL REFERENCES volunteers(pubkey) ON DELETE CASCADE,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_webauthn_pubkey ON webauthn_credentials (pubkey);

-- WebAuthn challenges (from IdentityDO 'webauthn:challenge:*' keys — ephemeral)
CREATE TABLE webauthn_challenges (
  challenge_id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Cleaned up by scheduled task (replaces IdentityDO alarm)

-- Device records (from IdentityDO 'devices:*' keys)
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pubkey TEXT NOT NULL REFERENCES volunteers(pubkey) ON DELETE CASCADE,
  platform TEXT NOT NULL,  -- 'ios', 'android', 'desktop'
  push_token TEXT,
  voip_token TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_devices_pubkey ON devices (pubkey);

-- Provisioning rooms (from IdentityDO 'provision:*' keys — ephemeral)
CREATE TABLE provision_rooms (
  room_id TEXT PRIMARY KEY,
  initiator_pubkey TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
```

### Settings Tables

```sql
-- System settings (from SettingsDO scalar keys)
-- Single-row table for global config
CREATE TABLE system_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton
  spam_settings JSONB NOT NULL DEFAULT '{}',
  call_settings JSONB NOT NULL DEFAULT '{}',
  transcription_settings JSONB NOT NULL DEFAULT '{}',
  ivr_languages TEXT[] DEFAULT '{}',
  messaging_config JSONB NOT NULL DEFAULT '{}',
  telephony_provider JSONB NOT NULL DEFAULT '{}',
  setup_state JSONB NOT NULL DEFAULT '{}',
  webauthn_settings JSONB NOT NULL DEFAULT '{}',
  case_management_enabled BOOLEAN DEFAULT false,
  auto_assignment_settings JSONB NOT NULL DEFAULT '{}',
  cross_hub_settings JSONB NOT NULL DEFAULT '{}',
  ttl_overrides JSONB NOT NULL DEFAULT '{}',
  applied_templates TEXT[] DEFAULT '{}',
  fallback_group TEXT[] DEFAULT '{}',       -- volunteer pubkeys for fallback routing
  report_categories TEXT[] DEFAULT '{}',    -- legacy messaging report categories
  report_types JSONB NOT NULL DEFAULT '[]'  -- legacy messaging report types
);

-- Hub-specific settings (from SettingsDO 'hub-settings:*' and 'hub-telephony:*' keys)
CREATE TABLE hub_settings (
  hub_id UUID PRIMARY KEY REFERENCES hubs(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}',
  telephony_provider JSONB NOT NULL DEFAULT '{}',
  phone_number TEXT
);

-- Hub keys (from SettingsDO 'hub-key:*' keys)
CREATE TABLE hub_keys (
  hub_id UUID NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  recipient_pubkey TEXT NOT NULL,
  wrapped_key TEXT NOT NULL,  -- ECIES envelope
  PRIMARY KEY (hub_id, recipient_pubkey)
);

-- Custom fields (from SettingsDO 'customFields' key)
CREATE TABLE custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  options TEXT[],
  required BOOLEAN DEFAULT false,
  visible_to TEXT[] NOT NULL DEFAULT '{}',  -- roles
  sort_order INTEGER DEFAULT 0
);

-- Roles (from SettingsDO 'roles' key)
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Entity type definitions (from SettingsDO 'entityTypes' key)
CREATE TABLE entity_type_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  icon TEXT,
  fields JSONB NOT NULL DEFAULT '[]',
  statuses JSONB NOT NULL DEFAULT '[]',
  severities JSONB NOT NULL DEFAULT '[]',
  config JSONB NOT NULL DEFAULT '{}',
  sort_order INTEGER DEFAULT 0
);

-- Relationship type definitions
CREATE TABLE relationship_type_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  inverse_label TEXT,
  config JSONB NOT NULL DEFAULT '{}'
);

-- Report type definitions (from SettingsDO 'reportTypeDefinitions' key)
CREATE TABLE report_type_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  fields JSONB NOT NULL DEFAULT '[]',
  config JSONB NOT NULL DEFAULT '{}'
);

-- Fallback call routing group (from SettingsDO 'fallback' key)
-- Stored in system_settings as: fallback_group TEXT[] DEFAULT '{}'
-- (added to system_settings table above)

-- Report categories (from SettingsDO 'reportCategories' key)
-- Legacy messaging report categories — stored as report_categories TEXT[] in system_settings

-- Case number sequences (from SettingsDO 'caseNumberSeq:*' keys)
CREATE TABLE case_number_sequences (
  prefix TEXT NOT NULL,
  year INTEGER NOT NULL,
  next_value INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (prefix, year)
);

-- IVR audio files (from SettingsDO 'ivr-audio:*' keys)
CREATE TABLE ivr_audio (
  prompt_type TEXT NOT NULL,
  language TEXT NOT NULL,
  audio BYTEA NOT NULL,
  PRIMARY KEY (prompt_type, language)
);

-- Rate limit windows (from SettingsDO 'rateLimitWindow:*' keys — ephemeral)
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CAPTCHA entries (from SettingsDO 'captcha:*' keys — ephemeral)
CREATE TABLE captchas (
  call_sid TEXT PRIMARY KEY,
  digits TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Records & Notes Tables

```sql
-- Encrypted notes (from RecordsDO 'note:*' keys)
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id UUID REFERENCES hubs(id),
  author_pubkey TEXT NOT NULL,
  call_id TEXT,
  contact_hash TEXT,
  envelopes JSONB NOT NULL,  -- encrypted per-recipient envelopes
  custom_fields JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_notes_hub ON notes (hub_id);
CREATE INDEX idx_notes_author ON notes (author_pubkey);
CREATE INDEX idx_notes_contact ON notes (contact_hash);
CREATE INDEX idx_notes_created ON notes (created_at DESC);

-- Note replies (from RecordsDO 'note-replies:*' keys)
CREATE TABLE note_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  author_pubkey TEXT NOT NULL,
  envelopes JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_replies_note ON note_replies (note_id);

-- Contact metadata (from RecordsDO 'contact-meta:*' keys)
CREATE TABLE contact_metadata (
  contact_hash TEXT NOT NULL,
  hub_id UUID REFERENCES hubs(id),
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  note_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (contact_hash, hub_id)
);

-- Ban entries (from RecordsDO 'bans' key)
CREATE TABLE bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id UUID REFERENCES hubs(id),
  phone_hash TEXT NOT NULL,
  reason TEXT,
  reported_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (hub_id, phone_hash)
);
CREATE INDEX idx_bans_hub_phone ON bans (hub_id, phone_hash);

-- Audit log (from RecordsDO 'audit:*' keys)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id UUID REFERENCES hubs(id),
  action TEXT NOT NULL,
  actor_pubkey TEXT NOT NULL,
  details JSONB,
  previous_entry_hash TEXT,
  entry_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_hub ON audit_log (hub_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_log (action);
```

### Shift & Call Tables

```sql
-- Shifts (from ShiftManagerDO 'shifts' key)
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id UUID REFERENCES hubs(id),
  volunteer_pubkeys TEXT[] NOT NULL DEFAULT '{}',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  recurrence JSONB,  -- rrule config
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_shifts_hub_time ON shifts (hub_id, start_time, end_time);

-- Active calls (from CallRouterDO 'activeCalls' key)
CREATE TABLE active_calls (
  call_id TEXT PRIMARY KEY,
  hub_id UUID REFERENCES hubs(id),
  caller_hash TEXT,
  status TEXT NOT NULL DEFAULT 'ringing',
  answered_by TEXT REFERENCES volunteers(pubkey),
  started_at TIMESTAMPTZ DEFAULT now(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_calls_hub_status ON active_calls (hub_id, status);
CREATE INDEX idx_calls_started ON active_calls (started_at DESC);

-- Call records / history (from CallRouterDO 'callrecord:*' keys)
CREATE TABLE call_records (
  call_id TEXT PRIMARY KEY,
  hub_id UUID REFERENCES hubs(id),
  envelopes JSONB NOT NULL,  -- encrypted call metadata
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Conversation & Messaging Tables

```sql
-- Conversations (from ConversationDO 'conv:*' keys)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id UUID REFERENCES hubs(id),
  channel TEXT NOT NULL,  -- 'sms', 'whatsapp', 'signal'
  status TEXT NOT NULL DEFAULT 'waiting',
  assigned_to TEXT REFERENCES volunteers(pubkey),
  external_id TEXT,
  contact_identifier JSONB,  -- encrypted
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_conv_hub_status ON conversations (hub_id, status);
CREATE INDEX idx_conv_assigned ON conversations (assigned_to);
CREATE UNIQUE INDEX idx_conv_external ON conversations (external_id) WHERE external_id IS NOT NULL;

-- Messages (from ConversationDO 'messages:*' keys)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,  -- 'inbound', 'outbound'
  external_id TEXT,  -- provider message ID for delivery status callbacks
  envelopes JSONB NOT NULL,  -- encrypted
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_messages_conv ON messages (conversation_id, created_at);
CREATE UNIQUE INDEX idx_messages_external ON messages (external_id) WHERE external_id IS NOT NULL;

-- File records (from ConversationDO 'file:*' keys)
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  uploader_pubkey TEXT NOT NULL,
  filename TEXT,
  content_type TEXT,
  size_bytes BIGINT,
  r2_key TEXT,  -- blob storage key
  envelopes JSONB,  -- encrypted file key
  status TEXT DEFAULT 'uploading',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Subscribers (from BlastDO/ConversationDO 'subscribers:*' keys)
CREATE TABLE subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id UUID REFERENCES hubs(id),
  identifier_hash TEXT NOT NULL,
  channel TEXT NOT NULL,
  encrypted_identifier JSONB,
  preferences JSONB NOT NULL DEFAULT '{}',
  preference_token TEXT UNIQUE,
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (hub_id, identifier_hash)
);

-- Blasts (from BlastDO 'blasts:*' keys)
CREATE TABLE blasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id UUID REFERENCES hubs(id),
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivery_stats JSONB NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Blast settings
CREATE TABLE blast_settings (
  hub_id UUID PRIMARY KEY REFERENCES hubs(id),
  settings JSONB NOT NULL DEFAULT '{}'
);
```

### Contact Directory Tables

```sql
-- Contacts (from ContactDirectoryDO 'contact:*' keys)
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id UUID REFERENCES hubs(id),
  encrypted_data JSONB NOT NULL,  -- E2EE name, identifiers, etc.
  identifier_hashes TEXT[] NOT NULL DEFAULT '{}',  -- blind indexes
  name_hash TEXT,  -- blind index for lookup
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_contacts_hub ON contacts (hub_id);
CREATE INDEX idx_contacts_identifier ON contacts USING GIN (identifier_hashes);
CREATE INDEX idx_contacts_name ON contacts (name_hash) WHERE name_hash IS NOT NULL;
CREATE INDEX idx_contacts_tags ON contacts USING GIN (tags);

-- Contact relationships (from ContactDirectoryDO 'rel:*' keys)
CREATE TABLE contact_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id UUID REFERENCES hubs(id),
  contact_a UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  contact_b UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  relationship_type_id UUID REFERENCES relationship_type_definitions(id),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_rel_a ON contact_relationships (contact_a);
CREATE INDEX idx_rel_b ON contact_relationships (contact_b);

-- Affinity groups (from ContactDirectoryDO 'group:*' keys)
CREATE TABLE affinity_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id UUID REFERENCES hubs(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Group members (from ContactDirectoryDO 'groupmember:*' keys)
CREATE TABLE group_members (
  group_id UUID NOT NULL REFERENCES affinity_groups(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role TEXT,
  is_primary BOOLEAN DEFAULT false,
  PRIMARY KEY (group_id, contact_id)
);
```

### Case Management Tables

```sql
-- Case records (from CaseDO 'record:*' keys)
CREATE TABLE case_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id UUID REFERENCES hubs(id),
  case_number TEXT,
  entity_type_id UUID REFERENCES entity_type_definitions(id),
  status TEXT NOT NULL DEFAULT 'open',
  severity TEXT,
  assigned_to TEXT[] NOT NULL DEFAULT '{}',
  encrypted_data JSONB NOT NULL,  -- E2EE summary, custom fields
  created_by TEXT NOT NULL,
  category_hash TEXT,  -- blind index for category filtering
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_cases_hub ON case_records (hub_id);
CREATE INDEX idx_cases_status ON case_records (hub_id, status);
CREATE INDEX idx_cases_severity ON case_records (hub_id, severity);
CREATE INDEX idx_cases_type ON case_records (entity_type_id);
CREATE INDEX idx_cases_number ON case_records (case_number) WHERE case_number IS NOT NULL;
CREATE INDEX idx_cases_assigned ON case_records USING GIN (assigned_to);
CREATE INDEX idx_cases_category ON case_records (hub_id, category_hash) WHERE category_hash IS NOT NULL;

-- Events (from CaseDO 'event:*' keys)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id UUID REFERENCES hubs(id),
  parent_id UUID REFERENCES events(id),
  entity_type_id UUID REFERENCES entity_type_definitions(id),
  event_number TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  encrypted_data JSONB NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_events_hub ON events (hub_id);
CREATE INDEX idx_events_parent ON events (parent_id);
CREATE INDEX idx_events_status ON events (hub_id, status);

-- Case-contact links (from CaseDO 'recordcontact:*' keys)
CREATE TABLE case_contacts (
  case_id UUID NOT NULL REFERENCES case_records(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (case_id, contact_id)
);

-- Case-event links (from CaseDO 'caseevent:*' keys)
CREATE TABLE case_events (
  case_id UUID NOT NULL REFERENCES case_records(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (case_id, event_id)
);

-- Report-event links (from CaseDO 'reportevent:*' keys)
CREATE TABLE report_events (
  report_id UUID NOT NULL,  -- references conversations.id
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (report_id, event_id)
);

-- Report-case links (from CaseDO 'reportcase:*' keys)
CREATE TABLE report_cases (
  report_id UUID NOT NULL,
  case_id UUID NOT NULL REFERENCES case_records(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (report_id, case_id)
);

-- Case interactions (from CaseDO 'interaction:*' keys)
CREATE TABLE case_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES case_records(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL,
  source_id TEXT,  -- links to note/call/message that triggered it
  encrypted_data JSONB,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_interactions_case ON case_interactions (case_id, created_at);
CREATE INDEX idx_interactions_source ON case_interactions (source_id) WHERE source_id IS NOT NULL;
CREATE INDEX idx_interactions_type ON case_interactions (case_id, interaction_type);

-- Evidence metadata (from CaseDO 'evidence:*' keys)
CREATE TABLE evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES case_records(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  encrypted_metadata JSONB NOT NULL,
  hash TEXT NOT NULL,  -- content hash for integrity
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_evidence_case ON evidence (case_id);

-- Chain of custody (from CaseDO 'custody:*' keys)
CREATE TABLE custody_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  case_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_pubkey TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_custody_evidence ON custody_entries (evidence_id, created_at);
```

### Nostr Outbox & Scheduled Tasks

```sql
-- Already exists — no change
CREATE TABLE nostr_event_outbox (
  id SERIAL PRIMARY KEY,
  event_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  attempts INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'pending'
);

-- Scheduled tasks (replaces DO alarms + alarm poller)
CREATE TABLE scheduled_tasks (
  id TEXT PRIMARY KEY,  -- e.g., 'cleanup:sessions', 'blast:deliver:{uuid}'
  run_at TIMESTAMPTZ NOT NULL,
  task_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  claimed_at TIMESTAMPTZ  -- NULL = unclaimed
);
CREATE INDEX idx_tasks_due ON scheduled_tasks (run_at) WHERE claimed_at IS NULL;

-- Push reminder tracking (from ShiftManagerDO 'push-reminders:*' keys)
-- Tracks which shift reminders have been sent to avoid duplicates
CREATE TABLE push_reminders_sent (
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  reminder_date DATE NOT NULL,
  pubkey TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (shift_id, reminder_date, pubkey)
);
```

**Total: ~45 typed tables replacing 1 `kv_store` catch-all.**

## Service Layer Design

### Pattern: One Service Per Domain

Each DO becomes a service class with direct SQL queries. Services are instantiated once at startup and injected into Hono context.

```typescript
// apps/worker/services/identity-service.ts
import type { SQL } from 'bun'

export class IdentityService {
  constructor(private sql: SQL) {}

  async getVolunteer(pubkey: string): Promise<Volunteer | null> {
    const [row] = await this.sql`
      SELECT * FROM volunteers WHERE pubkey = ${pubkey}
    `
    return row ?? null
  }

  async createVolunteer(data: CreateVolunteerInput): Promise<Volunteer> {
    const [row] = await this.sql`
      INSERT INTO volunteers ${this.sql(data)}
      RETURNING *
    `
    return row
  }

  async listVolunteers(filters?: VolunteerFilters): Promise<Volunteer[]> {
    if (filters?.status) {
      return this.sql`
        SELECT * FROM volunteers WHERE status = ${filters.status}
        ORDER BY created_at DESC
      `
    }
    return this.sql`SELECT * FROM volunteers ORDER BY created_at DESC`
  }

  // ... all other IdentityDO methods become direct SQL
}
```

### Service Registry

```typescript
// apps/worker/services/index.ts
import type { SQL } from 'bun'

export interface Services {
  identity: IdentityService
  settings: SettingsService
  records: RecordsService
  shifts: ShiftService
  calls: CallService
  conversations: ConversationService
  blasts: BlastService
  contacts: ContactService
  cases: CaseService
  audit: AuditService  // extracted from RecordsDO — now a first-class service
}

export function createServices(sql: SQL): Services {
  const audit = new AuditService(sql)
  return {
    identity: new IdentityService(sql),
    settings: new SettingsService(sql),
    records: new RecordsService(sql, audit),
    shifts: new ShiftService(sql),
    calls: new CallService(sql),
    conversations: new ConversationService(sql),
    blasts: new BlastService(sql),
    contacts: new ContactService(sql),
    cases: new CaseService(sql),
    audit,
  }
}
```

### Hono Middleware — Service Injection

```typescript
// apps/worker/middleware/services.ts
import type { Services } from '../services'

// Inject services into every request context
export function servicesMiddleware(services: Services) {
  return async (c: Context, next: Next) => {
    c.set('services', services)
    // Hub scoping: services handle this internally via hub_id parameter
    await next()
  }
}
```

### Route Migration Example

**Before** (current DO-based):
```typescript
// routes/notes.ts
app.post('/', async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const body = await c.req.json()

  const res = await dos.records.fetch(
    new Request('http://do/notes', {
      method: 'POST',
      body: JSON.stringify({ ...body, authorPubkey: c.get('pubkey') }),
    })
  )

  if (!res.ok) return c.json(await res.json(), res.status)
  const data = await res.json()

  await audit(dos.records, 'noteCreated', c.get('pubkey'), { noteId: data.note.id })
  return c.json(data, 201)
})
```

**After** (direct service):
```typescript
// routes/notes.ts
app.post('/', async (c) => {
  const { records, audit } = c.get('services')
  const hubId = c.get('hubId')
  const body = await c.req.json()

  const note = await records.createNote({
    ...body,
    hubId,
    authorPubkey: c.get('pubkey'),
  })

  await audit.log('noteCreated', c.get('pubkey'), { noteId: note.id }, hubId)
  return c.json({ note }, 201)
})
```

**Eliminated:** Request/Response construction, JSON serialization/deserialization, DORouter dispatch, advisory locks (simple INSERT doesn't need them).

### Hub Scoping

Currently hub scoping creates separate DO instances (`idFromName(hubId)`) which land in separate `kv_store` namespaces. After migration, hub scoping is simply a `WHERE hub_id = $1` clause:

```typescript
class RecordsService {
  async listNotes(hubId: string | null, filters: NoteFilters) {
    return this.sql`
      SELECT * FROM notes
      WHERE hub_id = ${hubId}
        AND (${ filters.authorPubkey ? this.sql`author_pubkey = ${filters.authorPubkey}` : this.sql`TRUE` })
      ORDER BY created_at DESC
      LIMIT ${filters.limit ?? 50}
      OFFSET ${filters.offset ?? 0}
    `
  }
}
```

### Concurrency Control

**Current:** Advisory locks serialize ALL writes within a namespace, even unrelated ones. A note creation blocks a ban creation if they're in the same DO.

**After:** Row-level operations use PostgreSQL's default MVCC. For operations requiring atomicity across multiple rows, use explicit transactions:

```typescript
async createNoteWithAudit(data: CreateNoteInput) {
  return this.sql.begin(async (tx) => {
    const [note] = await tx`INSERT INTO notes ${tx(data)} RETURNING *`
    await tx`INSERT INTO audit_log ${tx({ action: 'noteCreated', ... })}`
    return note
  })
}
```

No advisory locks needed — PostgreSQL's row-level locking handles concurrent access naturally.

### Scheduled Tasks (Replaces Alarms)

The 5 DOs that use alarms all do periodic cleanup or delivery. Replace with a single task scheduler:

```typescript
// apps/worker/services/task-scheduler.ts
export class TaskScheduler {
  private interval: ReturnType<typeof setInterval> | null = null

  constructor(private sql: SQL, private handlers: Map<string, TaskHandler>) {}

  start(intervalMs = 15_000) {
    this.interval = setInterval(() => this.poll(), intervalMs)
    // Initial poll after 3s
    setTimeout(() => this.poll(), 3_000)
  }

  stop() {
    if (this.interval) clearInterval(this.interval)
  }

  async schedule(id: string, taskType: string, runAt: Date, payload = {}) {
    await this.sql`
      INSERT INTO scheduled_tasks (id, task_type, run_at, payload)
      VALUES (${id}, ${taskType}, ${runAt}, ${JSON.stringify(payload)})
      ON CONFLICT (id) DO UPDATE SET run_at = EXCLUDED.run_at, payload = EXCLUDED.payload
    `
  }

  private async poll() {
    const tasks = await this.sql.begin(async (tx) => {
      return tx`
        DELETE FROM scheduled_tasks
        WHERE id IN (
          SELECT id FROM scheduled_tasks
          WHERE run_at <= now() AND claimed_at IS NULL
          FOR UPDATE SKIP LOCKED
          LIMIT 50
        )
        RETURNING *
      `
    })

    for (const task of tasks) {
      const handler = this.handlers.get(task.task_type)
      if (handler) {
        handler(task.payload).catch(err =>
          console.error(`[scheduler] Task ${task.id} failed:`, err)
        )
      }
    }
  }
}
```

**Task types** (replacing DO alarms):
- `cleanup:sessions` — purge expired sessions, challenges, provision rooms (was IdentityDO alarm)
- `cleanup:captchas` — purge expired CAPTCHAs and rate limits (was SettingsDO alarm)
- `cleanup:conversations` — TTL cleanup (was ConversationDO alarm)
- `shift:push-reminder` — send push notifications for upcoming shifts (was ShiftManagerDO alarm)
- `blast:deliver:{id}` — process active blast delivery (was BlastDO alarm)
- `blast:scheduled:{id}` — fire scheduled blast (was BlastDO alarm)

## Migration Strategy

### Data Migration

Since this is pre-production, the simplest approach is:

1. **Create all new tables** via a migration script
2. **Migrate existing `kv_store` data** to typed tables — parse JSONB values and INSERT into proper tables
3. **Verify data integrity** with counts and spot checks
4. **Drop `kv_store` and `alarms` tables** after verification

```typescript
// migrations/migrate-kv-to-typed.ts
async function migrateIdentity(sql: SQL) {
  // Migrate volunteers
  const volunteers = await sql`
    SELECT key, value FROM kv_store
    WHERE namespace = 'identity-globalidentity'
    AND key LIKE 'vol:%'
  `
  for (const row of volunteers) {
    const vol = row.value as Volunteer
    await sql`INSERT INTO volunteers ${sql(mapVolunteer(vol))} ON CONFLICT DO NOTHING`
  }
  // ... sessions, invites, webauthn creds, devices, provision rooms
}
```

For a fresh deployment, just run the schema creation — no data to migrate.

### Code Migration Order

The migration must be done DO-by-DO to keep the app working at each step:

1. **Schema + services first** — create tables, write service classes (can coexist with DOs)
2. **Migrate one DO at a time** — update routes to call service instead of DO, verify BDD tests pass
3. **Delete DO code after all routes migrated**

**Suggested DO migration order** (dependency-driven):
1. `SettingsDO` — no inbound DO deps, most routes depend on it
2. `IdentityDO` — no inbound DO deps, auth depends on it
3. `RecordsDO` — notes, bans, audit
4. `ShiftManagerDO` — shifts, push reminders
5. `CallRouterDO` — depends on shifts + identity (already migrated)
6. `ConversationDO` + `BlastDO` — migrate together (deduplicate subscriber code)
7. `ContactDirectoryDO` — trigram indexes become GIN indexes
8. `CaseDO` — most complex, many link tables

### Wrangler / CF Workers Cleanup

After all DOs are migrated:
- Delete `wrangler.jsonc` DO binding section (keep if marketing site deploys need it)
- Delete `src/platform/` entirely (1,194 lines)
- Delete `apps/worker/lib/do-router.ts` (44 lines)
- Delete `apps/worker/lib/do-access.ts` (~120 lines)
- Delete `apps/worker/durable-objects/` directory (9 DO files)
- Update `apps/worker/types.ts` — `Env` no longer has DO namespaces
- Delete `src/platform/node/cf-types.d.ts`

## Files Created

```
apps/worker/services/
  index.ts                    # Service registry + createServices()
  identity-service.ts         # Volunteers, sessions, invites, WebAuthn, devices
  settings-service.ts         # System settings, hubs, entity types, roles
  records-service.ts          # Notes, bans, contact metadata
  audit-service.ts            # Hash-chained audit log (extracted from RecordsDO)
  shift-service.ts            # Shifts, push reminders
  call-service.ts             # Active calls, call records, presence
  conversation-service.ts     # Conversations, messages, files
  blast-service.ts            # Subscribers, blasts, delivery (deduplicated)
  contact-service.ts          # Contact directory, relationships, groups
  case-service.ts             # Cases, events, interactions, evidence, links
  task-scheduler.ts           # Replaces alarm poller
apps/worker/migrations/
  001-create-typed-tables.sql # Full schema
  002-migrate-kv-data.ts      # KV→typed migration script
apps/worker/middleware/
  services.ts                 # Service injection middleware
```

## Files Deleted

```
src/platform/                 # Entire directory (1,194 lines)
  index.ts
  cloudflare.ts
  types.ts
  node/
    durable-object.ts
    env.ts
    server.ts                 # Replaced by Epic 357's Bun entry point
    blob-storage.ts           # Moves to apps/worker/services/ or lib/
    transcription.ts          # Moves to apps/worker/services/ or lib/
    cf-types.d.ts
    storage/
      postgres-pool.ts        # Replaced by Bun.sql (Epic 357)
      postgres-storage.ts
      alarm-poller.ts         # Replaced by TaskScheduler
      startup-migrations.ts
      outbox.ts               # Stays (Nostr delivery unchanged)
      outbox-poller.ts        # Stays

apps/worker/durable-objects/  # Entire directory (9 files)
  identity-do.ts
  settings-do.ts
  records-do.ts
  shift-manager.ts
  call-router.ts
  conversation-do.ts
  blast-do.ts
  contact-directory-do.ts
  case-do.ts

apps/worker/lib/
  do-router.ts
  do-access.ts
```

## Files Modified

```
apps/worker/app.ts               # Remove DO imports, add service middleware
apps/worker/index.ts             # Remove DO class exports (CF Worker entry point)
apps/worker/types.ts             # Env drops DO namespaces, adds Services type
apps/worker/routes/*.ts          # All 32 route files: getDOs() → c.get('services')
apps/worker/lib/auth.ts          # DO fetch for session/volunteer → service call
apps/worker/lib/push-dispatch.ts # References IdentityDO/ShiftManagerDO → services
apps/worker/lib/voip-push.ts     # DO references → services
apps/worker/middleware/auth.ts   # identityDO fetch → identityService
apps/worker/middleware/permission-guard.ts  # DO references → services
apps/worker/middleware/hub.ts    # DO references → services
apps/worker/telephony/*.ts       # References to SettingsDO for config → settingsService
apps/worker/messaging/router.ts  # ConversationDO references → conversationService
apps/worker/services/audit.ts    # Currently references DO — becomes standalone service
wrangler.jsonc                   # Remove 9 DO bindings (keep base worker config if needed)
```

## Risks & Mitigations

### Risk: CRITICAL — Massive route rewrite
**Impact**: ~30 route files, ~200+ route handlers need updating from DO fetch pattern to service calls.
**Mitigation**: The transformation is mechanical — each `dos.X.fetch(new Request('http://do/path', opts))` becomes `services.X.method(params)`. The DO handler code IS the business logic; it moves into the service method body. BDD tests validate behavior at the API level — they don't test internal DO wiring.

### Risk: HIGH — Data migration correctness
**Impact**: `kv_store` data must be accurately parsed and inserted into typed tables.
**Mitigation**: Pre-production — no live user data at risk. Migration script validates counts. Can run fresh (no migration needed) for new deployments. For dev data, write a verification query per table comparing counts.

### Risk: HIGH — Concurrency model change
**Impact**: Advisory locks serialized all writes per namespace. Without them, concurrent writes to the same table may conflict.
**Mitigation**: PostgreSQL MVCC handles most cases. For critical atomic operations (e.g., audit log hash chain), use explicit transactions. The audit log hash chain is the only operation that truly requires serialized writes — use `SELECT ... FOR UPDATE` on the latest entry.

### Risk: MEDIUM — Hub scoping correctness
**Impact**: The implicit namespace-based hub scoping must be correctly replaced with `hub_id` columns everywhere.
**Mitigation**: Every hub-scoped table has a `hub_id` column. Every query in a hub-scoped service method includes `WHERE hub_id = $1`. BDD tests cover hub isolation.

### Risk: MEDIUM — Blob storage and transcription service relocation
**Impact**: `blob-storage.ts` and `transcription.ts` currently live in `src/platform/node/` which is deleted.
**Mitigation**: Move to `apps/worker/lib/` — these are standalone adapters with no DO dependency. The code is unchanged; only the file location moves.

### Risk: MEDIUM — ConversationDO/BlastDO data integrity bug (existing)
**Impact**: Both DOs maintain identical subscriber/blast code with SEPARATE data stores. Routes calling ConversationDO for blasts get different data than routes calling BlastDO. This is a pre-existing data integrity bug.
**Mitigation**: The migration unifies this into a single `subscribers`/`blasts` table, fixing the bug. During migration, audit which DO's routes are actually called to determine which dataset has the real data.

### Risk: MEDIUM — `volunteer-load` / `volunteer-conversations` denormalized counters
**Impact**: ConversationDO maintains denormalized load counters (`volunteer-load:{pubkey}`) for assignment balancing.
**Mitigation**: Replace with computed queries: `SELECT assigned_to, COUNT(*) FROM conversations WHERE status = 'active' GROUP BY assigned_to`. PostgreSQL is fast enough for this at pre-production scale. Add an index on `(assigned_to, status)` if needed.

### Risk: LOW — dev.ts test-reset must truncate typed tables
**Impact**: Current `test-reset` calls `deleteAll()` on 8 DOs (BlastDO is not reset — existing bug). Must be rewritten to `TRUNCATE` typed tables.
**Mitigation**: A single `TRUNCATE ... CASCADE` statement is simpler and more thorough than 8 separate DO resets. Fixes the BlastDO reset bug.

### Risk: LOW — Nostr outbox still works
**Impact**: The outbox and outbox-poller are in `src/platform/node/storage/` which is deleted.
**Mitigation**: Move `outbox.ts` and `outbox-poller.ts` to `apps/worker/lib/`. They only depend on the PostgreSQL pool, not on DOs.

## Acceptance Criteria

- [ ] All 9 DOs replaced with service classes
- [ ] ~40 typed PostgreSQL tables created with proper indexes and constraints
- [ ] `kv_store` and `alarms` tables dropped
- [ ] All ~30 route files updated to use services
- [ ] `src/platform/` directory deleted (1,194 lines)
- [ ] `apps/worker/durable-objects/` directory deleted (9 files)
- [ ] `do-router.ts` and `do-access.ts` deleted
- [ ] `wrangler.jsonc` DO bindings removed
- [ ] Hub scoping via `hub_id` columns, not namespace strings
- [ ] Audit log hash chain preserved with proper serialized writes
- [ ] Scheduled task system replaces DO alarms
- [ ] Blob storage and transcription adapters relocated
- [ ] Nostr outbox/poller relocated and working
- [ ] All BDD tests pass
- [ ] Data migration script for existing dev data
- [ ] No `import { DurableObject } from 'cloudflare:workers'` in codebase
- [ ] ConversationDO/BlastDO subscriber duplication resolved

## Implementation Order

1. **Create typed schema** (`001-create-typed-tables.sql`) — can coexist with `kv_store`
2. **Write service classes** — parallel to DOs, not yet wired
3. **Service middleware** — inject services into Hono context
4. **Migrate DOs one at a time** (order: Settings → Identity → Records → Shifts → Calls → Conversations+Blasts → Contacts → Cases)
5. **For each DO**: update routes → run BDD tests → delete DO file
6. **Relocate blob-storage, transcription, outbox** to `apps/worker/lib/`
7. **Delete platform layer** (`src/platform/`)
8. **Delete DO infrastructure** (do-router, do-access, durable-objects/)
9. **Write data migration script** (KV→typed, for existing dev data)
10. **Drop `kv_store` and `alarms` tables**
11. **Update docs** (CLAUDE.md, PROTOCOL.md, deployment docs)

## Estimated Impact

- **~1,194 lines deleted** (platform abstraction — `src/platform/`)
- **~8,431 lines deleted** (9 DO files: 8,160 + do-router: 44 + do-access: 227)
- **Total deleted: ~9,625 lines**
- **~4,000-5,000 lines created** (service classes — significantly less than DOs because no Request/Response overhead, no DORouter, no KV index management)
- **Net: ~4,500-5,500 lines removed**
- **1 table → ~45 typed tables** with proper indexes, FKs, and constraints
- **Query performance: 2-10x faster** for indexed lookups (no JSONB scan + JS filter)
- **4 serialization cycles eliminated** per operation (Request build → JSON parse → Response build → JSON parse)
- **No more advisory locks** for simple CRUD operations
- **Proper SQL JOINs** for cross-entity queries (e.g., case+contacts+events in one query)
- **Hub scoping enforced by schema** (FK constraints), not naming conventions
- **`cloudflare:workers` import eliminated** — no more tsconfig path alias risk (fixes Epic 357 concern)
