# Cross-Platform Codegen Pipeline Spec

**Date:** 2026-03-18
**Status:** DECIDED
**Scope:** `packages/protocol/tools/codegen.ts`, `packages/protocol/tools/schema-registry.ts`, Swift/Kotlin/TypeScript consumers

---

## Current State

The codegen pipeline (`bun run codegen`) runs `packages/protocol/tools/codegen.ts`, which:

1. Calls `getSchemaRegistry()` from `schema-registry.ts` — a manually maintained list of 130+ Zod schemas, each explicitly imported and listed
2. Converts each schema to JSON Schema via Zod 4's `toJSONSchema(schema, { unrepresentable: 'any' })`
3. Feeds all schemas to quicktype-core for TypeScript, Swift, and Kotlin output
4. Post-processes Swift: strips `extension` blocks, adds `Sendable`, renames 15 types that shadow Swift builtins or UniFFI types
5. Post-processes Kotlin: replaces package name, injects default values from JSON Schema `"default"` fields into `@Serializable` data classes
6. Writes six files to `packages/protocol/generated/{typescript,swift,kotlin}/`

iOS includes `packages/protocol/generated/swift/` via `project.yml` source path.
Android includes `packages/protocol/generated/kotlin/` via `build.gradle.kts` `kotlin.srcDir`.
TypeScript does NOT import generated files — confirmed zero imports of `@protocol/generated` anywhere in the codebase.

---

## Problems to Fix

### A. TypeScript generated output is wasted work

**Problem:** `packages/protocol/generated/typescript/types.ts` (4240 lines) is never imported by any TypeScript code. All TypeScript consumers (worker routes, desktop client, `src/client/lib/api.ts`, `packages/shared/types.ts`) import Zod schemas directly from `@protocol/schemas/*` and infer types via `z.infer<typeof schema>`.

**Example of correct pattern** (from `src/client/lib/api.ts`):
```typescript
import { shiftResponseSchema } from '@protocol/schemas/shifts'
export type Shift = z.infer<typeof shiftResponseSchema>
```

The generated `typescript/types.ts` uses quicktype's interface style with structural divergences (index signatures from `additionalProperties: {}`, alphabetically sorted properties, different optional handling) that would actually conflict with schema-inferred types if imported. It is confusion-inducing dead weight.

**Decision:** Remove TypeScript from the codegen output pipeline entirely. Stop generating `typescript/types.ts` and `typescript/crypto-labels.ts`. Keep generating Swift and Kotlin only. The `generated/typescript/` directory should also be removed from `.gitignore` since it will no longer be generated.

**Impact on `InlineSchemaStore`:** The `InlineSchemaStore` name-mangling fix (see Phase A below) is still required for Swift and Kotlin output quality — it is not for TypeScript's benefit.

### B. `InlineSchemaStore` returns `undefined` for all `$ref` lookups

**Problem:** `InlineSchemaStore` in `codegen.ts` extends `JSONSchemaStore` with a no-op `fetch()` that returns `undefined` for any `$ref` address. Currently this does not cause crashes because Zod 4's `toJSONSchema()` inlines all sub-schemas by default — there are no cross-file `$ref` references (verified: 0 schemas contain `$ref`). However:

1. If any schema ever produces a `$ref` (e.g., via schema composition with `z.lazy()` or `$defs`), quicktype will fail silently or produce mangled type names like `Schema0`, `Schema1`.
2. The no-op `fetch()` is architecturally misleading — it suggests `$ref` resolution is handled when it is not.

**Confirmed:** Running a registry scan shows 0 schemas currently contain `$ref`. The risk is forward-looking.

**Fix:** Replace the no-op `InlineSchemaStore` with a `FlatSchemaStore` that builds a lookup map from all registered schemas by their name, so if `$ref` ever appears it resolves correctly:

```typescript
class FlatSchemaStore extends JSONSchemaStore {
  private readonly schemaMap: Map<string, object>

  constructor(schemas: Array<{ name: string; schema: string }>) {
    super()
    this.schemaMap = new Map(schemas.map(({ name, schema }) => [name, JSON.parse(schema)]))
  }

  async fetch(address: string): Promise<object | undefined> {
    return this.schemaMap.get(address)
  }
}
```

Pass the `allSchemas` array to this store in `generateForLanguage()`.

### C. `z.looseObject()` produces `additionalProperties: {}` in JSON Schema

**Problem:** `z.looseObject({ ... })` serializes to JSON Schema with `"additionalProperties": {}` (an empty object meaning "any additional properties allowed"). This is correct JSON Schema semantics, but quicktype interprets it as "open map" and generates index signatures:

- TypeScript: `[property: string]: any` — pollutes the generated interface (moot after fix A)
- Swift: No visible effect on struct types currently (quicktype drops `additionalProperties` for struct generation) — but it does affect the `JSONAny` class generation trigger
- Kotlin: No visible effect on data class fields currently

The real issue is that `z.looseObject()` is being used for request body schemas where additional properties are irrelevant to the wire type definition. These schemas exist to allow the Hono validator to pass extra form fields without rejecting the request — a server-side permissiveness concern. For codegen purposes, these should be treated as closed objects.

**Fix:** In `getSchemaRegistry()` (schema-registry.ts), strip `additionalProperties` from the JSON Schema output before passing to quicktype:

```typescript
function stripAdditionalProperties(schema: object): object {
  const s = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>
  delete s['additionalProperties']
  if (s['properties']) {
    for (const key of Object.keys(s['properties'] as object)) {
      const prop = (s['properties'] as Record<string, object>)[key]
      if (prop && typeof prop === 'object') {
        (s['properties'] as Record<string, object>)[key] = stripAdditionalProperties(prop) as object
      }
    }
  }
  if (Array.isArray(s['items'])) {
    s['items'] = (s['items'] as object[]).map(stripAdditionalProperties)
  } else if (s['items'] && typeof s['items'] === 'object') {
    s['items'] = stripAdditionalProperties(s['items'] as object)
  }
  return s
}
```

Apply this in `getSchemaRegistry()` before returning entries:
```typescript
entries.push({ name, jsonSchema: stripAdditionalProperties(jsonSchema) })
```

### D. `z.unknown()` and `z.any()` fields produce `JSONAny` in Swift

**Problem:** Several schemas use `z.unknown()` for fields that are genuinely opaque at the protocol level. These serialize to `{}` (empty JSON Schema object, meaning "any type"), which quicktype converts to `JSONAny` — a 200-line `class JSONAny: Codable` definition with complex runtime reflection logic appended to `Types.swift`.

Confirmed problematic schemas:
- `callerIdentifyResponseSchema`: `contact: z.unknown().nullable()` — the contact is a CMS contact record that varies by entity type
- `updateConversationBodySchema`: `metadata: z.record(z.unknown()).optional()` — free-form metadata map
- `auditEntryResponseSchema`: `details: z.record(z.unknown())` — audit details vary by event type
- `cleanupMetricsResponseSchema`: `conversation`, `identity`, `settings` — free-form metrics objects
- `authenticateBodySchema`, `registerCredentialBodySchema`: WebAuthn assertion/attestation objects
- `migrationStatusResponseSchema`: `namespaces: z.array(z.unknown())`
- `templateListResponseSchema`: `templates: z.array(z.unknown())`, `suggestedRoles: z.array(z.unknown()).optional()`, `updates: z.array(z.unknown())`

**Fix approach:** For each `z.unknown()` or `z.any()` field, decide:

1. **If the field is opaque JSON that Swift/Kotlin must store and re-serialize:** Replace with a specific `z.object({ ... })` type, or if truly dynamic, use `z.record(z.string(), z.unknown())` which quicktype renders as `[String: JSONAny]?` (a dictionary) — acceptable.
2. **If the field is a known type that was left unknown for expediency:** Replace with the actual type.
3. **For `z.array(z.unknown())`:** Replace with `z.array(z.object({ ... }))` if the items have a known shape.

Specific fixes required:

- `callerIdentifyResponseSchema.contact`: Replace `z.unknown().nullable()` with a dedicated `ContactSummary` type (id, caseCount, name fields) or a proper union with the CMS contact schema. This is a significant schema improvement.
- `auditEntryResponseSchema.details`: Replace `z.record(z.unknown())` with `z.record(z.string(), z.string()).optional()` — audit details are always string key/value pairs.
- `templateListResponseSchema.templates`, `.updates`, `.suggestedRoles`: These are dynamically-typed template objects. Define a `TemplateSummary` schema with the actual fields returned by the API.
- `migrationStatusResponseSchema.namespaces`: Define a proper `MigrationNamespace` schema.
- WebAuthn `assertion`/`attestation`: These are WebAuthn standard types. Use `z.record(z.string(), z.unknown())` — they're opaque to the app layer.
- `cleanupMetricsResponseSchema` conversation/identity/settings: These are metric counts. Define concrete schemas.

**Priority:** Fix the fields used by iOS/Android views first. `JSONAny` is functional but reflects poor schema hygiene.

### E. `schema-registry.ts` is manually maintained and drifts from `schemas/index.ts`

**Problem:** `schema-registry.ts` has two separate maintenance burdens:
1. An import list of ~130 named schema variables
2. A `schemaEntries` array of `[string, ZodType]` tuples that must be kept in sync

When a new schema is added to `packages/protocol/schemas/`, a developer must:
1. Add the export to the relevant schema file
2. Add the export to `schemas/index.ts`
3. Add the import to `schema-registry.ts`
4. Add the entry to `schemaEntries` in `schema-registry.ts`

Steps 3 and 4 are frequently forgotten (confirmed by examining git history of past epics). The result is schemas that exist in the codebase but are never codegen'd, causing iOS/Android to use `Codable` stubs or hand-written types instead of generated ones.

**Decision:** Replace the manual registry with automatic discovery from `schemas/index.ts`.

**Fix:** Use Bun's module resolution and ES module namespace import to enumerate all exports from `packages/protocol/schemas/index.ts` at runtime. Filter to those ending in `Schema` (or more precisely, those that are instances of `ZodType`):

```typescript
import * as allSchemas from '../schemas'
import { ZodType } from 'zod'

export function getSchemaRegistry(): SchemaRegistryEntry[] {
  const entries: SchemaRegistryEntry[] = []

  for (const [exportName, schema] of Object.entries(allSchemas)) {
    if (!(schema instanceof ZodType)) continue
    // Only include *Schema-named exports (skip non-schema exports)
    if (!exportName.endsWith('Schema')) continue

    const name = toPascalCase(exportName)
    try {
      const jsonSchema = toJSONSchema(schema as ZodType, { unrepresentable: 'any' })
      entries.push({ name, jsonSchema: stripAdditionalProperties(jsonSchema) })
    } catch (err) {
      console.warn(`Warning: Could not convert ${exportName} to JSON Schema, skipping: ${err}`)
    }
  }

  return entries
}
```

This means adding a new Zod schema to any file and re-exporting it from `schemas/index.ts` automatically includes it in codegen for all three platforms.

**Exclusions:** Some schemas should not be codegen'd (query schemas, internal validation schemas). Use a naming convention: schemas ending in `QuerySchema` are excluded. Any other exclusions are explicit:

```typescript
const EXCLUDED_SCHEMAS = new Set([
  'listRecordsQuerySchema',  // query parameter validation, not a wire type
  'okResponseSchema',        // too generic
])
```

Or alternatively, maintain only a small exclusion set rather than a full inclusion list.

**Migration path:** The current `schemaEntries` list has 130+ explicit entries. After the switch to auto-discovery, run `bun run codegen` and compare the before/after schema count. Investigate any newly discovered schemas (previously missing from the registry) and any that were in the registry but are no longer auto-discovered.

### F. No drift detection in CI for generated files

**Problem:** Generated Swift and Kotlin types are gitignored and regenerated in CI. If a developer changes a Zod schema without regenerating and the iOS/Android code uses the old types, there is no CI gate that catches this before PR merge — the mismatch is only caught when the mobile build fails.

**Fix:** Add a `codegen:check` script that:
1. Runs codegen to a temp directory
2. Diffs against the current `generated/` output
3. Fails if there is a diff

```bash
# In package.json scripts:
"codegen:check": "bun run packages/protocol/tools/codegen.ts --check"
```

In `codegen.ts`, add a `--check` flag that writes to a temp dir and diffs:

```typescript
const CHECK_MODE = process.argv.includes('--check')

// At write time:
if (CHECK_MODE) {
  const existing = existsSync(outputPath) ? readFileSync(outputPath, 'utf-8') : ''
  if (existing !== content) {
    console.error(`DRIFT: ${outputPath} is out of sync with schemas. Run bun run codegen.`)
    process.exit(1)
  }
} else {
  writeFileSync(outputPath, content)
}
```

Add this to the CI `typecheck` job (runs on every PR, before iOS/Android builds attempt to compile).

---

## Phase-by-Phase Implementation Plan

### Phase A: Fix `InlineSchemaStore` and strip `additionalProperties`

**Files:** `packages/protocol/tools/codegen.ts`

1. Replace `InlineSchemaStore` with `FlatSchemaStore` (see Problem B above)
2. Move `generateForLanguage` to accept the store as a parameter, built from the final `allSchemas` array
3. Add `stripAdditionalProperties()` recursive helper function
4. Call it on all JSON Schema output before passing to quicktype (in `getSchemaRegistry()` or in `codegen.ts` after calling `getSchemaRegistry()`)

**Verification:** Run `bun run codegen` and confirm Swift/Kotlin output no longer has `[property: string]: any` in TypeScript (moot post-Phase E) or open map types in Swift/Kotlin.

### Phase B: Remove TypeScript from codegen output

**Files:** `packages/protocol/tools/codegen.ts`, `.gitignore`, `packages/protocol/generated/`

1. Remove the `generateForLanguage('typescript', ...)` call from `main()`
2. Remove `typescript/types.ts` and `typescript/crypto-labels.ts` write steps
3. Remove the `typescript` directory creation
4. Update `console.log` output at the end
5. Update `.gitignore`: remove `packages/protocol/generated/typescript/` entry (no longer generated — or keep it to suppress any stale manual files)
6. Delete the existing `packages/protocol/generated/typescript/` directory
7. Update `packages/protocol/generated/.gitignore` if separate

**Important:** `packages/protocol/generated/typescript/crypto-labels.ts` IS currently used — check:

```bash
grep -r "generated/typescript/crypto-labels" packages/ src/ apps/
```

If `packages/shared/crypto-labels.ts` re-exports from the generated file, that chain must be redirected to import from `packages/protocol/crypto-labels.json` directly, or the generation of `typescript/crypto-labels.ts` must be kept while stopping generation of `typescript/types.ts`.

**Note:** The TypeScript crypto labels generation (`generateTSCryptoLabels`) produces the file at `packages/protocol/generated/typescript/crypto-labels.ts`. The shared re-export is at `packages/shared/crypto-labels.ts`. Verify the import chain before removing.

### Phase C: Automate schema registry

**Files:** `packages/protocol/tools/schema-registry.ts`

1. Replace the explicit import list and `schemaEntries` array with namespace import and auto-discovery
2. Maintain a small `EXCLUDED_SCHEMAS` set for query schemas and overly-generic schemas
3. Preserve the `toPascalCase` helper (still needed)
4. Add `stripAdditionalProperties` call here (moved from Phase A decision)

**Run and compare:**
```bash
# Before:
bun run codegen
# Note the schema count output: "Found N schemas from Zod registry"
# Then make the change and run again
bun run codegen
# Compare: new count should be >= old count (finding missing schemas)
# Diff the Swift and Kotlin output — investigate any new types
```

### Phase D: Fix `z.unknown()` schemas for cleaner Swift/Kotlin

**Files:** Various `packages/protocol/schemas/*.ts`

This phase is incremental — fix the highest-impact schemas first. Priority order based on iOS/Android active usage:

1. `templateListResponseSchema` — fix `templates`, `updates`, `suggestedRoles` to use a `TemplateSummary` schema with actual fields
2. `callerIdentifyResponseSchema.contact` — add a proper nullable contact summary type
3. `auditEntryResponseSchema.details` — narrow to `z.record(z.string(), z.string()).optional()`
4. `migrationStatusResponseSchema.namespaces` — define `MigrationNamespace`
5. `cleanupMetricsResponseSchema` sub-objects — define concrete metric schemas

For each fix: update the schema, run `bun run codegen`, verify the Swift/Kotlin output no longer uses `JSONAny` for that field.

**Note:** `z.record(z.string(), z.unknown())` (which maps to `[String: JSONAny]` in Swift and `Map<String, JsonObject>` in Kotlin) is acceptable for genuinely opaque dictionaries. Only `z.unknown()` as a bare field type or `z.array(z.unknown())` needs fixing — these produce the largest `JSONAny` cascades.

### Phase E: TypeScript consumption strategy — DECIDED

**This is the confirmed architectural position, not a recommendation:**

- TypeScript uses `z.infer<typeof schema>` from Zod schemas directly. This is the already-established practice throughout the codebase — zero imports of generated types exist.
- Generated TypeScript output (`packages/protocol/generated/typescript/`) is to be **removed from the codegen pipeline entirely** (see Phase B). It should not exist as a reference artifact because its presence creates confusion about whether it should be imported.
- The generated `typescript/crypto-labels.ts` must be audited before removal (see Phase B caveat).
- The `InlineSchemaStore` fix (Phase A) benefits Swift and Kotlin output quality only.

**Why TypeScript should not use generated types:**

1. `z.infer<>` is the single source of truth — it cannot diverge from the schema
2. Generated types from quicktype are structurally equivalent but idiomatically different (alphabetical properties, index signatures from `additionalProperties`, no Zod validator attached)
3. Runtime validation via Zod parse is only possible with the Zod schema, not with plain TypeScript interfaces
4. Any type augmentation (`api.ts` does `z.infer<typeof schema> & { computed: string }`) requires the Zod schema anyway
5. Generated TypeScript interfaces would need to be kept in sync with Zod schemas AND with each other — dual source of truth is a maintenance antipattern

### Phase F: Add `codegen:check` CI gate

**Files:** `packages/protocol/tools/codegen.ts`, `package.json`, `.github/workflows/ci.yml`

1. Add `--check` flag support to `codegen.ts` (diff mode, exits 1 on drift)
2. Add `"codegen:check": "bun run packages/protocol/tools/codegen.ts --check"` to `package.json`
3. Add `codegen:check` step to CI `typecheck` job, after `bun run codegen` (which regenerates files from scratch), before the mobile build jobs that depend on the generated files

The check ensures that if a developer changes a schema without running codegen, CI fails fast with a clear message pointing to the fix.

---

## UniFFI Rust Type Surface

The UniFFI FFI types in `packages/crypto/` are separate from the JSON protocol codegen — they are generated by the UniFFI scaffolding (`uniffi::setup_scaffolding!()` in `lib.rs`) from Rust struct/enum annotations.

**Current exported UniFFI types:**
- `KeyEnvelope` (`ecies.rs`) — `uniffi::Record`
- `RecipientKeyEnvelope` (`ecies.rs`) — `uniffi::Record`
- `EncryptedNote` (`encryption.rs`) — `uniffi::Record`
- `EncryptedMessage` (`encryption.rs`) — `uniffi::Record`
- `EncryptedKeyData` (`encryption.rs`) — `uniffi::Record`
- `KeyPair` (`keys.rs`) — `uniffi::Record`
- `CryptoError` (`errors.rs`) — `uniffi::Error`

All are gated behind `#[cfg_attr(feature = "mobile", ...)]`. The `mobile` feature flag is required for UniFFI symbol generation.

**No changes needed to UniFFI types in this spec.** The Swift post-processor in `codegen.ts` already handles the `KeyEnvelope` name collision by renaming the protocol-generated type to `ProtocolKeyEnvelope`. The UniFFI-generated `LlamenosCore.swift` (generated by `packages/crypto/scripts/build-mobile.sh ios`) and the protocol codegen output (`packages/protocol/generated/swift/Types.swift`) coexist because their type names do not collide after the rename.

**Future consideration:** If new Rust types need to be shared between the protocol JSON codegen (request/response bodies) and the UniFFI FFI (mobile crypto calls), define the canonical type in one place. Currently `KeyEnvelope` exists in both (`ecies.rs` as a Rust struct AND `packages/protocol/schemas/common.ts` as a Zod schema). The Rust `KeyEnvelope` is the canonical definition for crypto operations; the Zod `keyEnvelopeSchema` is the canonical definition for JSON wire format. They must remain structurally identical — this is an invariant enforced by tests, not codegen.

---

## Non-Goals

- **Zod-to-Swift/Kotlin at compile time:** The current Zod → JSON Schema → quicktype pipeline is intentionally indirect. Zod is a JS library; Swift and Kotlin cannot consume Zod schemas directly. The JSON Schema intermediate step is correct. Direct Zod-to-Swift transpilation (e.g., via a Zod plugin) would add significant complexity and fragility.
- **OpenAPI integration:** The OpenAPI snapshot (`openapi-snapshot.json`) is written by the dev server at startup for documentation tooling. It is a separate concern from type codegen.
- **WASM crypto types for TypeScript:** TypeScript uses the UniFFI-adjacent Tauri IPC mock or the Rust-compiled WASM module, neither of which requires generated types — they use the Rust struct signatures directly.
- **Runtime schema validation in Swift/Kotlin:** The generated `Codable`/`@Serializable` structs handle JSON decoding. Adding Zod-equivalent runtime validators in Swift or Kotlin is out of scope.

---

## Success Criteria

1. `bun run codegen` generates only Swift and Kotlin output (+ crypto labels for both)
2. Swift output compiles without errors in `apps/ios/` — `bun run ios:build` passes
3. Kotlin output compiles without errors in `apps/android/` — `./gradlew compileDebugKotlin` passes
4. Adding a new schema to any file in `packages/protocol/schemas/` and re-exporting it from `schemas/index.ts` automatically includes it in the next codegen run without any changes to `schema-registry.ts`
5. `bun run codegen:check` exits 0 when generated files are up-to-date, exits 1 with a clear message when they are stale
6. No TypeScript code imports from `packages/protocol/generated/` — confirmed by `grep -r "@protocol/generated" src/ apps/worker/ packages/shared/`
7. `JSONAny` class no longer appears in `Types.swift` (after Phase D schema fixes for the highest-impact fields)

---

## Execution Order

Phases can be executed in order: A → B → C → D → F. Each is independently mergeable.

Phase D (schema cleanup) can be done incrementally across multiple PRs — one schema domain at a time. It does not block Phase F (CI gate).

Phase C (auto-discovery) has the highest risk of unintended schema inclusion and should be validated carefully. Run a before/after diff of all generated output when landing it.
