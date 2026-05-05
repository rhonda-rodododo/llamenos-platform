# packages/protocol

Cross-platform type definitions and codegen pipeline for Llamenos.

## What it provides

- **80+ Zod schemas** (`schemas/`) — single source of truth for all API request/response types
- **`crypto-labels.json`** — 57 domain separation constants (source of truth for all platforms)
- **Codegen tool** (`tools/codegen.ts`) — generates Swift Codable structs and Kotlin `@Serializable` data classes via `toJSONSchema()` + quicktype-core
- **Schema registry** (`tools/schema-registry.ts`) — maps 85+ schemas to named types for codegen
- **OpenAPI snapshot** (`openapi-snapshot.json`) — written by dev server on startup

## Usage

```bash
# After any schema change, regenerate all platform types
bun run codegen

# CI check (fails if generated output is out of date)
bun run codegen:check
```

Generated output goes to `generated/` (gitignored). Codegen runs as a build prerequisite.

## Schemas

Zod schemas in `schemas/` are the **authoritative** type definitions. Worker routes import from `@protocol/schemas`. The old `apps/worker/schemas/` path is gone.

**Critical pattern**: Always use `.optional().default(value)`, never bare `.default(value)`. Zod 4 produces wrong JSON Schema output with bare `.default()`, breaking Kotlin/Swift codegen defaults.

## Crypto labels

`crypto-labels.json` is the source of truth for all 57 domain separation constants. The codegen tool generates:
- TypeScript constants (`packages/shared/crypto-labels.ts`)
- Swift constants (generated Swift file)
- Kotlin constants (generated Kotlin file)
- Rust constants (`packages/crypto/src/labels.rs` imports these)

Never add a raw string literal for a crypto context — always add a new entry to `crypto-labels.json` and regenerate.

## Codegen details

The Kotlin post-processor injects `@Serializable` defaults for `.optional().default()` fields. The Swift post-processor strips convenience extensions, adds `Sendable`, and renames 15 types that shadow Swift builtins. TypeScript uses `z.infer<>` directly — generated TS output has been removed.
