# Epic 202: Protocol Schema & Codegen

## Goal

Extract protocol types into JSON Schema, build a codegen tool that generates type definitions for TypeScript, Swift, and Kotlin. This prevents type drift across platforms as we add native iOS and Android clients.

## Context

Llamenos currently defines all wire types in `packages/shared/types.ts` (after Epic 200 moves). These types are used by the desktop frontend and the Cloudflare Worker backend. When native iOS and Android clients arrive (Epics 206-207), they'll need the same types in Swift and Kotlin.

### Buildit Pattern (reference, not template)

Buildit uses `quicktype-core` + `json-schema-to-zod` for codegen from JSON Schema → TypeScript/Swift/Kotlin/Rust. Their system is elaborate (27 modules, schema versioning, Dexie/SQLite migrations). Llamenos is simpler — we have fewer types and no local database. We'll adopt the pattern selectively:

- **YES**: JSON Schema as source of truth → codegen to all platforms
- **YES**: `quicktype-core` for Swift/Kotlin generation (proven, well-maintained)
- **NO**: Module registry, schema versioning (overkill for a hotline app with <20 types)
- **NO**: Dexie/SQLite migration generation (no local DB in llamenos)
- **NO**: Zod runtime validation (TypeScript types are sufficient for us)

### What Gets Codegen'd

**Wire types** (cross-platform, over-the-wire or stored on server):
- `RecipientEnvelope` — ECIES-wrapped keys
- `NotePayload` — encrypted note content
- `CustomFieldDefinition` — form field schema
- `FileRecord`, `FileKeyEnvelope`, `EncryptedFileMetadata` — encrypted files
- `Subscriber`, `Blast`, `BlastContent`, `BlastStats`, `BlastSettings` — messaging
- `TelephonyProviderConfig` — provider credentials
- `MessagingConfig`, `SMSConfig`, `WhatsAppConfig`, `SignalConfig`, `RCSConfig` — channels
- `Hub`, `HubRoleAssignment` — multi-tenant
- `SetupState`, `EnabledChannels` — configuration

**Crypto labels** (25 domain separation constants):
- These are string constants, not complex types — codegen as constants per platform

**NOT codegen'd** (platform-specific):
- UI component props
- Route params
- React state types
- Durable Object internal storage types

## Directory Structure

```
packages/protocol/
├── schemas/
│   ├── envelope.json         # RecipientEnvelope, FileKeyEnvelope
│   ├── notes.json            # NotePayload, CustomFieldDefinition
│   ├── files.json            # FileRecord, EncryptedFileMetadata, UploadInit
│   ├── telephony.json        # TelephonyProviderConfig, CallPreference
│   ├── messaging.json        # MessagingConfig, SMS/WhatsApp/Signal/RCS configs
│   ├── blasts.json           # Subscriber, Blast, BlastContent, BlastStats, BlastSettings
│   ├── hub.json              # Hub, HubRoleAssignment, SetupState, EnabledChannels
│   └── channels.json         # ChannelType, MessagingChannelType, TransportSecurity
├── crypto-labels.json        # All 25 domain separation constants
├── generated/
│   ├── typescript/           # → used by packages/shared/ + apps/worker/
│   ├── swift/                # → used by apps/ios/
│   └── kotlin/               # → used by apps/android/
├── tools/
│   └── codegen.ts            # Bun script using quicktype-core
└── package.json
```

## Schema Design

Each schema file uses standard JSON Schema (draft-07 or 2020-12). Example:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://llamenos.org/schemas/envelope.json",
  "title": "Envelope Types",
  "description": "ECIES-wrapped key envelopes used across notes, messages, files, and hub keys",
  "$defs": {
    "RecipientEnvelope": {
      "type": "object",
      "required": ["pubkey", "wrappedKey", "ephemeralPubkey"],
      "properties": {
        "pubkey": { "type": "string", "description": "Recipient x-only public key (hex)" },
        "wrappedKey": { "type": "string", "description": "Nonce (24b) + ciphertext: ECIES-wrapped symmetric key (hex)" },
        "ephemeralPubkey": { "type": "string", "description": "Ephemeral secp256k1 compressed public key for ECDH (hex)" }
      },
      "additionalProperties": false
    }
  }
}
```

### Crypto Labels Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://llamenos.org/schemas/crypto-labels.json",
  "title": "Cryptographic Domain Separation Labels",
  "type": "object",
  "properties": {
    "LABEL_NOTE_KEY": { "const": "llamenos:note-key" },
    "LABEL_FILE_KEY": { "const": "llamenos:file-key" },
    ...
  }
}
```

## Codegen Tool

`packages/protocol/tools/codegen.ts` — a Bun script:

```typescript
import { quicktype, InputData, JSONSchemaInput, FetchingJSONSchemaStore } from 'quicktype-core'

// For each schema file:
// 1. Read JSON Schema
// 2. Run quicktype for TypeScript, Swift, Kotlin
// 3. Write generated files

// TypeScript: just-types mode (interfaces only, no runtime)
// Swift: structs with Codable conformance
// Kotlin: data classes with kotlinx.serialization
```

### Package Definition

**`packages/protocol/package.json`**:
```json
{
  "name": "@llamenos/protocol",
  "private": true,
  "type": "module",
  "exports": {
    "./generated/typescript/*": "./generated/typescript/*"
  },
  "devDependencies": {
    "quicktype-core": "^23.2.6"
  }
}
```

### Root script

```json
{
  "scripts": {
    "codegen": "bun run packages/protocol/tools/codegen.ts"
  }
}
```

### TypeScript Output Caveat

quicktype in "just-types" mode generates TypeScript interfaces. These are **structurally typed** — they don't enforce `additionalProperties: false` at the type level (TypeScript can't do this). The JSON Schema strictness is enforced by:
- Swift/Kotlin codegen (Codable/kotlinx.serialization reject unknown fields by default)
- Server-side validation of incoming payloads (existing Hono middleware)
- The schemas themselves serve as the canonical definition

If runtime validation of TypeScript types is needed in the future, consider generating Zod schemas from the JSON Schemas — but this is NOT needed for the current use case.

## Migration Path

The existing `packages/shared/types.ts` won't be deleted immediately. Instead:

1. Create schemas from the existing types
2. Generate TypeScript types
3. Gradually migrate `packages/shared/types.ts` to re-export from generated types
4. Keep constants and functions (like `PROVIDER_REQUIRED_FIELDS`, `fieldMatchesContext`) in `types.ts` — these aren't pure types and don't belong in codegen

## Verification Checklist

1. `bun run codegen` — generates valid TypeScript, Swift, Kotlin
2. Generated TypeScript types are structurally identical to existing hand-written ones
3. `bun run typecheck` — no regressions from generated type imports
4. `bun run build` — Vite build succeeds
5. `bun run test` — E2E tests pass

## Risk Assessment

- **Low risk**: Codegen is additive — existing types remain until proven equivalent
- **Medium risk**: quicktype output style may differ from hand-written types — needs review
- **Low risk**: Generated Swift/Kotlin not used until Epics 206-207

## Dependencies

- Epic 200 (Monorepo Foundation) — for `packages/` directory
- Epic 201 (Absorb llamenos-core) — for Rust type generation context

## Blocks

- Epic 206 (iOS Foundation) — Swift types
- Epic 207 (Android Foundation) — Kotlin types
