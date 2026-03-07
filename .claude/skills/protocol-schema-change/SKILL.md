---
name: protocol-schema-change
description: >
  Guide JSON Schema and protocol changes through the multi-platform codegen pipeline in the
  Llamenos monorepo. Use this skill when modifying files in packages/protocol/schemas/,
  changing crypto-labels.json, updating wire formats, adding new message types, or when
  the user mentions "schema change", "protocol update", "codegen", "wire format", "new message
  type", "crypto label", "domain separation", "add a field", "new field", "envelope format",
  or "shared types". Also use when the user describes adding or modifying data structures that
  need to work across all platforms (desktop, iOS, Android, worker) — this implies a protocol
  change. If a change touches encrypted payload formats or cross-platform type definitions,
  this skill applies. Schema changes have blast radius across every platform — this skill
  ensures nothing is missed.
---

# Protocol Schema Changes for Llamenos

The protocol layer (`packages/protocol/`) defines the source-of-truth types and crypto constants
shared across all platforms. Changes here propagate to TypeScript, Swift, and Kotlin via codegen.
Missing a step means type mismatches, runtime crashes, or crypto failures on one or more platforms.

## Architecture

```
packages/protocol/
  schemas/              # 8 JSON Schema files (source of truth)
  crypto-labels.json    # 28 domain separation constants (source of truth)
  tools/codegen.ts      # quicktype-core generator → TS/Swift/Kotlin
  generated/
    typescript/         # Generated TS interfaces
    swift/              # Generated Swift structs (Codable)
    kotlin/             # Generated Kotlin data classes (kotlinx.serialization)
```

## When to Use This Skill

- Adding a new message type or envelope format
- Modifying existing schema fields (adding, removing, renaming)
- Adding or modifying crypto domain separation labels
- Changing wire format for encrypted payloads
- Adding new API request/response types

## Schema Change Workflow

### Step 1: Modify the Schema

Edit the relevant JSON Schema file in `packages/protocol/schemas/`:

| Schema | Purpose |
|--------|---------|
| `envelope.schema.json` | Encrypted envelope wrapper (ECIES, note envelopes) |
| `notes.schema.json` | Note payload, custom fields, attachments |
| `files.schema.json` | File upload metadata, chunk info |
| `telephony.schema.json` | Call state, provider config, DTMF events |
| `messaging.schema.json` | Conversation messages, blast payloads |
| `identity.schema.json` | Volunteer/admin profiles, invite tokens |
| `settings.schema.json` | Hub settings, feature flags, provider config |
| `audit.schema.json` | Audit log entries, hash chain |

Follow JSON Schema conventions:
- Use `"type"` and `"required"` fields
- Add `"description"` to every field for generated doc comments
- Use `"enum"` for fixed string unions
- Use `"$ref"` for shared sub-schemas
- For new types, consider adding `"additionalProperties": false` to prevent extension

### Step 2: Add/Update Crypto Labels (if needed)

If the change introduces a new encrypted context, add a label to `packages/protocol/crypto-labels.json`:

```json
{
  "LABEL_NEW_CONTEXT": "llamenos:new-context:v1"
}
```

Rules for crypto labels:
- Prefix with `llamenos:`
- Include version suffix (`:v1`) for future migration
- Use kebab-case after the prefix
- NEVER use raw string literals in code — always reference the generated constant
- Each label must be unique across the entire file

### Step 3: Run Codegen

```bash
bun run codegen
```

This generates:
- `packages/protocol/generated/typescript/` — TS interfaces
- `packages/protocol/generated/swift/` — Swift structs with Codable conformance
- `packages/protocol/generated/kotlin/` — Kotlin data classes with kotlinx.serialization

Also regenerates crypto label constants for all languages.

### Step 4: Verify Generated Output

```bash
bun run codegen:check
```

This verifies the generated files match what codegen would produce. CI runs this to catch
stale generated files.

Review the generated types:
- Are field names correct? (quicktype infers names from schema)
- Are optional fields marked correctly?
- Do enum values match the schema?
- For Swift: are structs Codable? Do they have CodingKeys if needed?
- For Kotlin: are @Serializable annotations present?

### Step 5: Update Platform Consumers

After codegen, update code that uses the changed types:

**Desktop (TypeScript)**:
- Import from `@shared/` or `packages/protocol/generated/typescript/`
- Update components/hooks that reference changed fields
- Update platform.ts if crypto operations changed

**Worker (TypeScript)**:
- Update DO storage/retrieval for changed types
- Update API route handlers
- Update Nostr event payloads if wire format changed

**iOS (Swift)**:
- Generated types land in `packages/protocol/generated/swift/`
- Copy to `apps/ios/Sources/Generated/` if not auto-synced
- Update ViewModels that decode/encode these types
- Update CryptoService if crypto labels changed

**Android (Kotlin)**:
- Generated types land in `packages/protocol/generated/kotlin/`
- Copy to `apps/android/app/src/main/java/org/llamenos/protocol/` if not auto-synced
- Update repositories/ViewModels that use these types
- Update CryptoService if crypto labels changed

### Step 6: Update Protocol Documentation

If the change affects the wire format, update `docs/protocol/PROTOCOL.md`:
- New message type descriptions
- Updated encryption envelope format
- New API endpoints that use the type
- Version compatibility notes

### Step 7: Test Across Platforms

```bash
bun run test:changed    # Test affected platforms
bun run codegen:check   # Verify codegen is fresh
```

For crypto-related changes, ensure cross-platform interop:
- Rust test vectors in `packages/crypto/tests/`
- Desktop Playwright tests that encrypt/decrypt
- iOS crypto interop tests
- Android crypto unit tests

## Breaking vs Non-Breaking Changes

### Non-Breaking (safe)
- Adding new optional fields to existing schemas
- Adding new schema files (new types)
- Adding new crypto labels

### Breaking (requires migration strategy)
- Removing or renaming fields
- Changing field types
- Changing enum values
- Modifying crypto label values (changes wire format!)

For pre-production: clean breaks are acceptable. Document the break in the epic.

For production (future): add version byte, implement fallback detection, migration window.

## Common Pitfalls

- **Stale codegen**: Always run `bun run codegen` after schema changes. CI catches this via `codegen:check`
- **Raw string literals**: NEVER use `"llamenos:note-seal"` directly — import from generated constants
- **Missing platform updates**: Schema change affects ALL platforms. Check desktop, worker, iOS, Android
- **quicktype quirks**: quicktype may generate unexpected type names. Review the output
- **Crypto label collision**: Every label must be unique. Check existing labels before adding
