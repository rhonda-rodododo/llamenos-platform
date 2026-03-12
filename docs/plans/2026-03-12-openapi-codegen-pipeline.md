# OpenAPI → quicktype Codegen Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace JSON Schema codegen with Zod → OpenAPI → quicktype pipeline so Zod schemas are the single source of truth for cross-platform types.

**Architecture:** Server writes OpenAPI snapshot on dev startup. `bun run codegen` reads the snapshot, extracts `components.schemas`, feeds them to quicktype for Swift/Kotlin/TS generation. Crypto labels pipeline unchanged. Generated files are gitignored.

**Tech Stack:** hono-openapi (already integrated), quicktype-core (existing dep), Zod 4, Node.js server

**Prerequisites:** Epic 305 is complete — all 25 route files use `describeRoute()`, OpenAPI endpoint mounted at `/api/openapi.json`.

---

### Task 1: Add OpenAPI Snapshot Writer to Node.js Server

**Files:**
- Modify: `src/platform/node/server.ts`

**Step 1: Write the failing test**

No unit test for this — it's infrastructure. We'll verify manually.

**Step 2: Add snapshot writer after server starts**

After the server is listening, fetch the OpenAPI spec from itself and write it to `packages/protocol/openapi-snapshot.json`:

```typescript
// In the serve() callback, after logging the port:
if (process.env.ENVIRONMENT === 'development') {
  try {
    const specRes = await app.fetch(new Request(`http://localhost:${info.port}/api/openapi.json`))
    if (specRes.ok) {
      const spec = await specRes.json()
      const { writeFileSync } = await import('fs')
      const { resolve } = await import('path')
      const snapshotPath = resolve(import.meta.dirname ?? '.', '../../../packages/protocol/openapi-snapshot.json')
      writeFileSync(snapshotPath, JSON.stringify(spec, null, 2) + '\n')
      console.log('[llamenos] OpenAPI snapshot written to packages/protocol/openapi-snapshot.json')
    }
  } catch (err) {
    console.warn('[llamenos] Failed to write OpenAPI snapshot:', err)
  }
}
```

**Step 3: Verify**

Run: `bun run dev:node`
Expected: Console shows `[llamenos] OpenAPI snapshot written to packages/protocol/openapi-snapshot.json`
Verify: `cat packages/protocol/openapi-snapshot.json | jq '.openapi'` returns `"3.1.0"` (or similar)
Verify: `cat packages/protocol/openapi-snapshot.json | jq '.components.schemas | keys | length'` returns a number > 0

**Step 4: Commit**

```bash
git add src/platform/node/server.ts
git commit -m "feat: write OpenAPI snapshot on dev server startup"
```

---

### Task 2: Rewrite codegen.ts to Read from OpenAPI Snapshot

**Files:**
- Rewrite: `packages/protocol/tools/codegen.ts`

**Step 1: Understand current codegen.ts**

Current flow: reads 8 JSON Schema files from `packages/protocol/schemas/`, extracts `$defs`, feeds each to quicktype via `JSONSchemaInput`. Generates TS/Swift/Kotlin types + crypto labels.

New flow: reads `packages/protocol/openapi-snapshot.json`, extracts `components.schemas`, feeds each to quicktype via `JSONSchemaInput`. Crypto labels unchanged.

**Step 2: Rewrite codegen.ts**

Replace the schema-file reading with OpenAPI snapshot reading. Key changes:

1. Replace `SCHEMAS_DIR` with `SNAPSHOT_FILE` pointing to `openapi-snapshot.json`
2. Replace the loop over `readdirSync(SCHEMAS_DIR)` with reading the snapshot and iterating `spec.components.schemas`
3. For each schema in `components.schemas`, wrap as a standalone JSON Schema and feed to quicktype
4. The `LocalSchemaStore` needs to resolve `$ref` within the OpenAPI spec's `components.schemas` namespace
5. Crypto labels generation stays exactly the same

The OpenAPI spec's `components.schemas` section contains Zod-derived JSON Schema objects. Each one is a valid JSON Schema that quicktype can consume. Internal `$ref` values like `#/components/schemas/RecipientEnvelope` need to be resolved by the store.

```typescript
// New schema extraction approach:
const spec = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf-8'))
const schemas = spec.components?.schemas ?? {}

// Build a schema store that resolves OpenAPI $ref paths
class OpenAPISchemaStore extends JSONSchemaStore {
  constructor(private schemas: Record<string, unknown>) { super() }

  async fetch(address: string): Promise<JSONSchema | undefined> {
    // Resolve #/components/schemas/Foo references
    const match = address.match(/components\/schemas\/(\w+)/)
    if (match && this.schemas[match[1]]) {
      return this.schemas[match[1]] as JSONSchema
    }
    return undefined
  }
}

// Feed each schema to quicktype
for (const [name, schema] of Object.entries(schemas)) {
  await schemaInput.addSource({
    name,
    schema: JSON.stringify(schema),
  })
}
```

**Step 3: Run codegen and compare output**

Run: `bun run codegen`
Expected: Generates files in `packages/protocol/generated/{typescript,swift,kotlin}/`
Verify: Output types include API-surface types (NoteResponse, ShiftResponse, etc.) not just the old wire-format types

**Step 4: Verify types are reasonable**

Check that generated Swift has Codable structs matching Zod schemas:
- `packages/protocol/generated/swift/Types.swift` should contain note, shift, volunteer types
- `packages/protocol/generated/kotlin/Types.kt` should contain @Serializable data classes
- `packages/protocol/generated/typescript/types.ts` should contain interfaces

**Step 5: Commit**

```bash
git add packages/protocol/tools/codegen.ts
git commit -m "refactor: codegen reads from OpenAPI snapshot instead of JSON Schema files"
```

---

### Task 3: Delete JSON Schema Files

**Files:**
- Delete: `packages/protocol/schemas/envelope.json`
- Delete: `packages/protocol/schemas/notes.json`
- Delete: `packages/protocol/schemas/files.json`
- Delete: `packages/protocol/schemas/telephony.json`
- Delete: `packages/protocol/schemas/messaging.json`
- Delete: `packages/protocol/schemas/channels.json`
- Delete: `packages/protocol/schemas/blasts.json`
- Delete: `packages/protocol/schemas/hub.json`

**Step 1: Verify no other code references these files**

Run: `grep -r 'schemas/envelope\|schemas/notes\|schemas/files\|schemas/telephony\|schemas/messaging\|schemas/channels\|schemas/blasts\|schemas/hub' --include='*.ts' --include='*.json' --include='*.sh' .`
Expected: Only hits in `codegen.ts` (already rewritten) and possibly CLAUDE.md docs

**Step 2: Delete the schema files**

```bash
rm -rf packages/protocol/schemas/
```

**Step 3: Verify codegen still works**

Run: `bun run codegen`
Expected: Success — codegen now reads from snapshot, not schema files

**Step 4: Commit**

```bash
git add -A packages/protocol/schemas/
git commit -m "chore: remove JSON Schema files (replaced by OpenAPI snapshot)"
```

---

### Task 4: Remove codegen:check Script

**Files:**
- Modify: `package.json` (remove `codegen:check` script)
- Modify: `packages/protocol/tools/codegen.ts` (remove `--check` mode)

**Step 1: Remove codegen:check from package.json**

Remove the line: `"codegen:check": "bun run packages/protocol/tools/codegen.ts --check"`

**Step 2: Remove --check mode from codegen.ts**

Remove the `check` flag parsing and the file-comparison logic. codegen.ts should only generate.

**Step 3: Search for codegen:check references**

Run: `grep -r 'codegen:check\|codegen --check' . --include='*.ts' --include='*.sh' --include='*.json' --include='*.yml' --include='*.yaml' --include='*.md'`
Update any CI configs or scripts that reference it. Replace with `bun run codegen` as a build prerequisite.

**Step 4: Commit**

```bash
git add package.json packages/protocol/tools/codegen.ts
# Also add any CI/script files that referenced codegen:check
git commit -m "chore: remove codegen:check (generated files are gitignored, codegen runs before build)"
```

---

### Task 5: Update Build Scripts to Run Codegen as Prerequisite

**Files:**
- Modify: `scripts/test-desktop.sh`
- Modify: `scripts/test-ios.sh`
- Modify: `scripts/test-android.sh`
- Modify: `scripts/test-orchestrator.sh` (if needed)

**Step 1: Check current codegen integration in build scripts**

Read each test script to see if/how they call codegen. The `--no-codegen` flag exists in the orchestrator, so codegen is likely already integrated.

**Step 2: Ensure codegen runs before build in each platform script**

Each platform test script should have a codegen step near the top (after `--no-codegen` check):

```bash
if [[ "$NO_CODEGEN" != "true" ]]; then
  log "Running codegen..."
  bun run codegen
fi
```

If this already exists (likely), just verify it works correctly now that codegen reads from the snapshot file.

**Step 3: Verify end-to-end**

Run: `bun run test:desktop`
Expected: codegen runs → types generated → typecheck passes → build succeeds → tests run

**Step 4: Commit**

```bash
git add scripts/
git commit -m "chore: ensure codegen runs as build prerequisite in all platform scripts"
```

---

### Task 6: Migrate iOS Models to Generated Types

**Files:**
- Delete: `apps/ios/Sources/Models/Note.swift` (contents replaced by generated Types.swift)
- Delete: `apps/ios/Sources/Models/Conversation.swift`
- Delete: `apps/ios/Sources/Models/Shift.swift`
- Delete: `apps/ios/Sources/Models/Contact.swift`
- Delete: `apps/ios/Sources/Models/Report.swift`
- Delete: `apps/ios/Sources/Models/Blast.swift`
- Delete: `apps/ios/Sources/Models/Admin.swift`
- Delete: `apps/ios/Sources/Models/CustomField.swift`
- Create: `apps/ios/Sources/Models/Extensions.swift` (UI-specific computed properties)
- Modify: All Swift files that import the old models

**Step 1: Identify which types from each model file are now in generated Types.swift**

Compare each hand-written model against generated output. Types that match API response shapes are replaced. Types that are UI-only (like `DecryptedNote` with computed properties) move to Extensions.swift.

**Step 2: Create Extensions.swift for UI-only types**

Types like `DecryptedNote` (combines server response + decrypted payload + computed properties) and `AnyCodableValue` are not API types — they stay as hand-written Swift. Move them to `Extensions.swift` along with any computed property extensions on generated types.

**Step 3: Update imports across the iOS codebase**

Find all files that reference deleted model types and update imports. Generated types should be available project-wide since Types.swift is in the project.

**Step 4: Build and test**

Run: `bun run test:ios`
Expected: codegen → xcframework → build → tests pass

**Step 5: Commit**

```bash
git add apps/ios/
git commit -m "refactor(ios): replace hand-written models with generated types + extensions"
```

---

### Task 7: Migrate Android Models to Generated Types

**Files:**
- Delete: `apps/android/app/src/main/java/org/llamenos/hotline/model/NoteModels.kt`
- Delete: `apps/android/app/src/main/java/org/llamenos/hotline/model/ShiftModels.kt`
- Delete: `apps/android/app/src/main/java/org/llamenos/hotline/model/ReportModels.kt`
- Delete: `apps/android/app/src/main/java/org/llamenos/hotline/model/CallModels.kt`
- Delete: `apps/android/app/src/main/java/org/llamenos/hotline/model/ContactModels.kt`
- Delete: `apps/android/app/src/main/java/org/llamenos/hotline/model/CustomFieldModels.kt`
- Delete: `apps/android/app/src/main/java/org/llamenos/hotline/model/ConversationModels.kt`
- Delete: `apps/android/app/src/main/java/org/llamenos/hotline/model/AdminModels.kt`
- Keep: `apps/android/app/src/main/java/org/llamenos/hotline/model/AuthModels.kt` (if auth-specific)
- Keep: `apps/android/app/src/main/java/org/llamenos/hotline/model/LlamenosEvent.kt` (Nostr event, not API type)
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/model/Extensions.kt` (UI-specific extensions)
- Modify: Kotlin files that import deleted model types

**Step 1: Compare each model file against generated Types.kt**

Same approach as iOS — types matching API shapes are replaced, UI-only types move to Extensions.kt.

**Step 2: Create Extensions.kt**

Extension functions for computed properties (display names, formatting, etc.) that the old model files had.

**Step 3: Update imports**

Generated types will be in a `quicktype` package by default. Either configure quicktype to use `org.llamenos.hotline.model` package, or add import aliases.

Important: quicktype's Kotlin output defaults to `package quicktype`. The codegen.ts should be configured to output `package org.llamenos.protocol` (matching the existing crypto labels package). The Android project then imports from there.

**Step 4: Build and test**

Run: `bun run test:android`
Expected: codegen → gradle build → unit tests pass

**Step 5: Commit**

```bash
git add apps/android/
git commit -m "refactor(android): replace hand-written models with generated types + extensions"
```

---

### Task 8: Deduplicate Desktop TypeScript Types

**Files:**
- Modify: `packages/shared/types.ts` — remove API-surface types that are now generated
- Modify: files that import from `packages/shared/types.ts` — update imports

**Step 1: Identify which types in shared/types.ts overlap with generated types**

Types like `RecipientEnvelope`, `TelephonyProviderConfig`, `NotePayload`, `CustomFieldDefinition` should now come from generated output or from `z.infer<>` on Zod schemas.

**Step 2: Remove overlapping types, keep crypto-only types**

Keep types that are:
- Used only on the client side (not API wire format)
- Crypto-specific (key management types)
- UI display constants (like `TELEPHONY_PROVIDER_LABELS`)

Remove types that are:
- Exact duplicates of API request/response shapes
- Already defined in Zod schemas

**Step 3: Update imports**

Files that imported removed types from `@shared/*` now import from generated types or use `z.infer<typeof schema>` from the Zod schemas.

**Step 4: Typecheck**

Run: `bun run typecheck`
Expected: No type errors

**Step 5: Commit**

```bash
git add packages/shared/ src/client/
git commit -m "refactor: deduplicate shared types with generated OpenAPI types"
```

---

### Task 9: Update Documentation

**Files:**
- Modify: `CLAUDE.md` — update codegen commands, remove references to JSON Schema files
- Modify: `docs/epics/epic-305-openapi-spec-scalar-docs.md` — mark as COMPLETED
- Modify: `docs/plans/2026-03-12-openapi-codegen-pipeline-design.md` — mark as COMPLETED

**Step 1: Update CLAUDE.md**

- Remove references to `packages/protocol/schemas/` directory
- Update codegen description to mention OpenAPI snapshot
- Remove `codegen:check` from command list
- Update directory structure to show `openapi-snapshot.json` instead of `schemas/`
- Note that generated files are gitignored

**Step 2: Mark epics/plans as completed**

Update status fields.

**Step 3: Commit**

```bash
git add CLAUDE.md docs/
git commit -m "docs: update for OpenAPI codegen pipeline"
```

---

### Task 10: End-to-End Verification

**Step 1: Full test suite**

Run: `bun run test:all`
Expected: All platforms pass — codegen runs as prerequisite, generated types compile correctly on each platform.

**Step 2: Verify the development workflow**

1. Start dev server: `bun run dev:node` — snapshot written
2. Modify a Zod schema (e.g., add a field to `apps/worker/schemas/notes.ts`)
3. Restart dev server — snapshot updates
4. Run `bun run codegen` — types regenerate with new field
5. TypeScript/Swift/Kotlin show the new field in generated output

**Step 3: Verify CI workflow**

The snapshot is committed. CI runs `bun run codegen` before each platform build. If someone changes a Zod schema but forgets to update the snapshot, the generated types won't include the change — but the code that uses the new field won't compile either, so the failure is visible.
