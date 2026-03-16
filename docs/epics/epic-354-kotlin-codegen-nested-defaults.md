# Epic 354: Kotlin Codegen — Nested Defaults & Optional Field Handling

## Problem Statement

The Kotlin post-processor in `packages/protocol/tools/codegen.ts` (`postProcessKotlin()`, lines 262-357) handles scalar defaults (Boolean, Long, String, `emptyList()`) but cannot handle:

1. **Enum-typed field defaults** — `category: EntityCategory` has a Zod default of `"case"` via `entityCategorySchema`, but the post-processor skips string defaults when the Kotlin type is not `String` or `String?` (line 334-338). The generated code produces `val category: EntityCategory` with no default.
2. **Required fields without defaults** — Fields like `closedStatuses: List<String>`, `statuses: List<EntityTypeDefinitionStatus>`, `fields: List<EntityTypeDefinitionField>` are required in JSON Schema but have no `"default"` key, so they are generated as non-nullable with no default. The API often returns simplified payloads (e.g., test entity types) that omit these fields.
3. **Enum-typed fields with defaults** — `defaultAccessLevel: DefaultAccessLevel` has Zod default `"assigned"` but the post-processor sees type `DefaultAccessLevel` (not `String`) and skips it.

This forces Android to maintain a hand-written lenient `EntityTypeDefinition` in `apps/android/app/src/main/java/org/llamenos/hotline/model/CaseModels.kt` (lines 47-80) with all-optional fields and hardcoded defaults, plus hand-written `EnumOption` (lines 82-92) and `EntityFieldDefinition` (lines 94-105). The TODO at line 45 says: _"Fix codegen to generate optional fields with defaults, then remove this."_

### Current codegen output vs. what Android needs

**Generated (no defaults on enum/complex fields):**
```kotlin
data class EntityTypeDefinition (
    val category: EntityCategory,          // no default — breaks on omitted field
    val closedStatuses: List<String>,      // no default — breaks on omitted field
    val defaultAccessLevel: DefaultAccessLevel,  // no default — has Zod .default('assigned')
    val fields: List<EntityTypeDefinitionField>, // no default — breaks on omitted field
    val statuses: List<EntityTypeDefinitionStatus>, // no default — breaks on omitted field
    // ...
)
```

**Hand-written lenient version (what works):**
```kotlin
data class EntityTypeDefinition(
    val category: String = "case",         // String instead of enum, with default
    val closedStatuses: List<String> = emptyList(),
    val defaultAccessLevel: String = "assigned",
    val fields: List<EntityFieldDefinition> = emptyList(),
    val statuses: List<EnumOption> = emptyList(),
    // ...
)
```

The hand-written version sacrifices type safety (uses `String` instead of enum types) to gain leniency. The goal is to make codegen produce the correct defaults so the generated types are both type-safe AND lenient.

## Requirements

### Phase 1: Enum-Typed String Defaults

**Goal:** When a field's JSON Schema type is a `$ref` to an enum AND the field has a `"default"` string value in the schema, inject the corresponding enum variant.

**Current behavior (line 333-338 of `postProcessKotlin`):**
```typescript
// Skip string defaults for enum types (can't assign String to enum)
const typeOnly = typeDecl.replace(/^:\s*/, '').replace(/[,\s].*$/, '')
if (typeOnly !== 'String' && typeOnly !== 'String?') {
  result.push(line)
  continue
}
```

**New behavior:** Instead of skipping non-String types, detect if the type is an enum class in the generated output and map the default string value to the enum variant name.

Implementation approach:
1. Before the line-by-line pass, scan the generated Kotlin for all `enum class` declarations and build a map: `{ "EntityCategory" → { "case" → "Case", "contact" → "Contact", ... } }`
2. The map is built by parsing `@SerialName("value") VariantName("value")` patterns from the generated enum bodies
3. In the default-injection logic, when `typeof defaultVal === 'string'` and the field type is a known enum, emit `TypeName.VariantName` instead of `"stringValue"`

**Concrete examples:**
```kotlin
// Before (current):
val category: EntityCategory,
val defaultAccessLevel: DefaultAccessLevel,

// After (with this change):
val category: EntityCategory = EntityCategory.Case,
val defaultAccessLevel: DefaultAccessLevel = DefaultAccessLevel.Assigned,
```

**Affected types** (fields with enum types + Zod `.default()`):
- `EntityTypeDefinition.category` → `EntityCategory.Case`
- `EntityTypeDefinition.defaultAccessLevel` → `DefaultAccessLevel.Assigned`
- `EntityFieldDefinition.accessLevel` → `AccessLevel.All`
- `EntityFieldDefinition.indexType` → `IndexType.None`
- `CreateEntityTypeBody.defaultAccessLevel` → `DefaultAccessLevel.Assigned`
- `RelationshipTypeDefinition.cascadeDelete` — already handled (Boolean)

### Phase 2: Required List Fields Without Schema Defaults

**Goal:** For required `List<*>` fields that do NOT have a `"default": []` in JSON Schema, add `= emptyList()` so kotlinx.serialization tolerates omitted fields.

**Current behavior:** Only adds `= emptyList()` when the JSON Schema has `"default": []` (line 340-341). Fields like `closedStatuses`, `statuses`, `fields` are required arrays with no schema default, so they get no Kotlin default.

**New behavior:** For any required field with a `List<*>` type that does NOT already have a default, inject `= emptyList()`. This is safe because:
- If the server sends the field, kotlinx.serialization uses the sent value
- If the server omits it, the default kicks in instead of crashing
- An empty list is always a safe sentinel for "not provided"

Implementation: Add a second pass (or extend the existing field-matching logic) that checks for `List<` in the type declaration and adds `= emptyList()` when no default is already present.

**Concrete examples:**
```kotlin
// Before:
val closedStatuses: List<String>,
val fields: List<EntityTypeDefinitionField>,
val statuses: List<EntityTypeDefinitionStatus>,

// After:
val closedStatuses: List<String> = emptyList(),
val fields: List<EntityTypeDefinitionField> = emptyList(),
val statuses: List<EntityTypeDefinitionStatus> = emptyList(),
```

**Scope:** This applies globally to ALL generated data classes, not just `EntityTypeDefinition`. Any required `List<*>` field without a default gets `= emptyList()`.

### Phase 3: Add `.optional().default()` to Remaining Schema Fields

**Goal:** Instead of injecting defaults in the post-processor (which is a workaround), add `.optional().default('')` / `.optional().default(0)` directly to the Zod schema fields in `packages/protocol/schemas/entity-schema.ts` where leniency is genuinely needed.

The fields that need this treatment in `EntityTypeDefinitionSchema`:
- `hubId: z.string()` → `z.string().optional().default('')`
- `name: z.string()` → `z.string().optional().default('')`
- `label: z.string()` → `z.string().optional().default('')`
- `labelPlural: z.string()` → `z.string().optional().default('')`
- `description: z.string()` → `z.string().optional().default('')`
- `defaultStatus: z.string()` → `z.string().optional().default('')`

Same for `EntityFieldDefinitionSchema` and `EnumOptionSchema` — any field that the hand-written lenient wrapper defaults to `""` or `0`.

**Why schema-level, not post-processor:** Per CLAUDE.md: "DONT do workarounds — fix the actual underlying issues." The source of truth is the Zod schema. Making fields optional-with-defaults at the schema level means ALL platforms (TS, Swift, Kotlin) benefit from the same leniency, the JSON Schema correctly describes the API contract, and no post-processor allowlist needs maintenance.

**After this**: Run `bun run codegen` — the Kotlin post-processor (Phases 1-2 from above) will automatically inject the `= ""` / `= 0L` defaults from the JSON Schema's `"default"` values. No allowlist needed.

### Phase 4: Remove Hand-Written Lenient Types from Android

After Phases 1-3, the generated `EntityTypeDefinition`, `EnumOption`, and `EntityFieldDefinition` should have sufficient defaults. Remove:

1. **Delete from `CaseModels.kt`** (lines 41-105):
   - Hand-written `EntityTypeDefinition` data class
   - Hand-written `EnumOption` data class
   - Hand-written `EntityFieldDefinition` data class
   - The TODO comment at line 45

2. **Update imports** in consuming files:
   - `apps/android/.../ui/cases/CaseListScreen.kt` — change `import org.llamenos.hotline.model.EntityTypeDefinition` to `import org.llamenos.protocol.EntityTypeDefinition`
   - `apps/android/.../ui/cases/CaseDetailScreen.kt` — same
   - `apps/android/.../ui/cases/CaseManagementViewModel.kt` — same
   - `apps/android/.../ui/cases/QuickStatusSheet.kt` — same for both `EntityTypeDefinition` and `EnumOption`

3. **Adapt field access patterns.** The codegen types differ from the hand-written ones:
   - `category: String` (hand-written) → `category: EntityCategory` (codegen enum) — update comparisons from `== "case"` to `== EntityCategory.Case`
   - `statuses: List<EnumOption>` → `statuses: List<EntityTypeDefinitionStatus>` — quicktype generates distinct types per context even though the shape is identical. May need typealiases or adapter functions.
   - `fields: List<EntityFieldDefinition>` → `fields: List<EntityTypeDefinitionField>` — same issue

4. **Consider typealiases** in `CaseModels.kt` to bridge naming differences:
   ```kotlin
   // Bridge codegen type names to domain names used in UI code
   typealias EntityFieldDefinition = EntityTypeDefinitionField
   typealias EnumOption = EntityTypeDefinitionStatus  // if shapes are identical
   ```

### Phase 5: Verification

1. `bun run codegen` — inspect `packages/protocol/generated/kotlin/Types.kt` for correct defaults
2. `cd apps/android && ./gradlew compileDebugKotlin` — verify clean compilation
3. `cd apps/android && ./gradlew testDebugUnitTest` — verify unit tests pass
4. `cd apps/android && ./gradlew lintDebug` — verify no lint regressions
5. `cd apps/android && ./gradlew compileDebugAndroidTestKotlin` — verify E2E test compilation
6. Manually verify that deserializing a partial `EntityTypeDefinition` JSON (e.g., `{"id": "test", "name": "test"}`) succeeds with sensible defaults

## Key Files

| File | Change |
|------|--------|
| `packages/protocol/tools/codegen.ts` | Enhance `postProcessKotlin()` — enum default mapping, required list defaults, allowlisted string/long defaults |
| `packages/protocol/schemas/entity-schema.ts` | Reference only — Zod source of truth for `entityTypeDefinitionSchema` |
| `packages/protocol/generated/kotlin/Types.kt` | Output — verify generated defaults are correct |
| `apps/android/.../model/CaseModels.kt` | Remove hand-written `EntityTypeDefinition`, `EnumOption`, `EntityFieldDefinition`; keep typealiases and API response wrappers |
| `apps/android/.../ui/cases/CaseListScreen.kt` | Update imports, adapt enum comparisons |
| `apps/android/.../ui/cases/CaseDetailScreen.kt` | Update imports, adapt field type references |
| `apps/android/.../ui/cases/CaseManagementViewModel.kt` | Update imports |
| `apps/android/.../ui/cases/QuickStatusSheet.kt` | Update imports, adapt enum/status type references |

## Technical Details

### How quicktype generates enum classes

quicktype converts JSON Schema `enum` (from `z.enum([...])`) into Kotlin `enum class` with `@SerialName` annotations:

```kotlin
@Serializable
enum class EntityCategory(val value: String) {
    @SerialName("case") Case("case"),
    @SerialName("contact") Contact("contact"),
    @SerialName("custom") Custom("custom"),
    @SerialName("event") Event("event");
}
```

The post-processor can parse these to build the enum variant map: regex `@SerialName\("(.+?)"\)\s+(\w+)\(` captures `(serialName, variantName)` pairs per enum class.

### How Zod `.optional().default()` maps to JSON Schema

A field like `numberingEnabled: z.boolean().optional().default(false)` produces JSON Schema where:
- The field is NOT in `"required"` (because `.optional()`)
- The field has `"default": false`

quicktype sees the field is optional and generates `val numberingEnabled: Boolean = false` — this already works correctly because quicktype handles optional+default for primitives.

The problem is fields that are `required` (no `.optional()`) with a `.default()` — Zod 4's `toJSONSchema()` puts them in `"required"` AND sets `"default"`. quicktype generates them as non-nullable, non-defaulted. The post-processor must add the default.

### quicktype's type deduplication issue

quicktype generates distinct types for structurally identical objects when they appear in different schema contexts. For example, `EnumOption` (from `enumOptionSchema`) becomes:
- `EnumOption` (standalone)
- `EntityTypeDefinitionStatus` (inside `entityTypeDefinitionSchema.statuses`)
- `EntityTypeDefinitionCategory` (inside `entityTypeDefinitionSchema.categories`)
- `EntityTypeDefinitionContactRole` (inside `entityTypeDefinitionSchema.contactRoles`)

These are all identical data classes. The hand-written `CaseModels.kt` uses a single `EnumOption` everywhere. After migration, Android code must either:
1. Use the specific codegen type names (verbose but accurate)
2. Add typealiases to map them back to a common name
3. Accept the codegen names and update UI code

Option 2 (typealiases) is recommended for backward compatibility.

## Risks

- **Medium: Regex fragility.** The post-processor uses regex to parse Kotlin source. Changes to quicktype's output format could break parsing. Mitigated by running full codegen + Android build as verification.
- **Low: Over-defaulting.** Phase 3's allowlisted string/long defaults could mask genuine API bugs where a required field is missing. Mitigated by keeping the allowlist small and explicit.
- **Low: Enum variant naming.** quicktype capitalizes enum variants (e.g., `"case"` → `Case`). If a variant name conflicts with a Kotlin keyword, quicktype escapes it with backticks. The enum map parser must handle this.

## Dependencies

- None — this is a self-contained codegen enhancement.

## Acceptance Criteria

- [ ] `bun run codegen` produces `EntityTypeDefinition` with defaults on all fields that have Zod defaults (enum, boolean, string, list)
- [ ] `EntityFieldDefinition` and `EnumOption` also receive appropriate defaults
- [ ] Hand-written lenient types removed from `CaseModels.kt`
- [ ] All Android Kotlin files compile: `./gradlew compileDebugKotlin`
- [ ] Android unit tests pass: `./gradlew testDebugUnitTest`
- [ ] Android E2E tests compile: `./gradlew compileDebugAndroidTestKotlin`
- [ ] No other generated types are broken by the post-processor changes (verified by full codegen + build)
