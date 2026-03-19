# Type System Unification

**Date**: 2026-03-19
**Status**: Draft v2 — deep analysis complete
**Priority**: High — root cause of Claude correction loops and test fragility

---

## Problem Statement

The Llamenos TypeScript codebase has **five parallel type systems** that describe the same domain entities. `src/client/lib/api.ts` (2278 lines) serves simultaneously as the API client implementation, a type definition library, and a schema migration workaround — all three in one file. Every client component imports types from `api.ts`, not from schemas.

This creates Claude correction loops: add a field to an API response, and you must update it in 2–4 different locations, some of which have subtle incompatibilities with others. The TypeScript compiler won't catch all of these because the extension pattern bypasses structural checks.

---

## Current State: The Five Systems

| Layer | Location | Consumer | Problem |
|-------|----------|---------|---------|
| Zod schemas | `packages/protocol/schemas/*.ts` | Worker routes (validation) | Incomplete, imprecise, missing security-variant patterns |
| `api.ts` z.infer extensions | `src/client/lib/api.ts` lines 900–2278 | All client components | `z.infer<T> & { extra }` pattern defers schema completion indefinitely |
| Handwritten interfaces in `api.ts` | Same file, 20+ interfaces | All client components | No schema counterpart at all |
| `apps/worker/types.ts` | Worker-internal | Dead DO code, some routes | Diverges from schemas; has server-only fields that must never reach client |
| `packages/shared/types.ts` | Mixed exports | Client + worker | Good re-exports mixed with handwritten duplicates (CustomFieldDefinition, FileRecord, etc.) |

The generated TypeScript output (`packages/protocol/generated/typescript/types.ts`) is consumed by **zero TypeScript files** — the entire TS codegen branch of the pipeline is dead weight.

---

## Root Cause Analysis: 4 Layers

### Layer 1: Schema Incompleteness (fields genuinely missing)

Fields present in API responses but absent from their schema:
- `volunteerResponseSchema` — missing: `createdAt`, `messagingEnabled`, `supportedMessagingChannels`
- `callRecordResponseSchema` — missing: `recordingSid`, `encryptedContent`, `adminEnvelopes`
- `noteResponseSchema` — missing: `ephemeralPubkey` (legacy field)
- `inviteResponseSchema` — missing: `phone`, `createdBy`
- `conversationResponseSchema` — missing: `lastMessageAt`
- No schema at all for: `ActiveCall`, `AuditLogEntry`, `ContactSummary`, `ContactTimeline`, `ShiftStatus`, `IvrAudioRecording`, `WebAuthnSettings`, `RoleDefinition`, `EvidenceMetadata`, `CustodyEntry`, `TemplateSummary`, `DirectoryContact` (and 10+ more in api.ts)

### Layer 2: Schema Imprecision (fields exist but wrong type)

Fields in schemas that are less precise than reality:
- `volunteerResponseSchema.phone` — `z.string().optional()` but the response always includes it for admin views; should be required in response, or have an admin-specific schema
- `volunteerResponseSchema.callPreference` — `z.string().optional()` but reality is `'phone' | 'browser' | 'both'`; should be `z.enum([...]).optional()`
- `callRecordResponseSchema.answeredBy` — present in both the schema (nullable.optional) and the `& {}` extension (redundant duplication)
- `conversationResponseSchema.status` — loose or missing where the real values are `'active' | 'waiting' | 'closed'`

### Layer 3: Security-Aware Typing (intentional schema gaps)

Some fields are deliberately absent from schemas because they're PII that should only reach admins:
- `callerNumber` on `CallRecord` — schema has `callerLast4` (truncated, safe for volunteers) but the admin view needs the full number. Current workaround: `& { callerNumber?: string }` extension. Correct fix: separate admin-only response schema variant.
- `Volunteer.phone` — full phone number visible only to admins. Currently in both schema (optional) and extension (required via intersection). Correct fix: `volunteerAdminResponseSchema` vs `volunteerVolunteerResponseSchema`.

This is an architectural gap: the protocol schemas don't distinguish between admin-visible and volunteer-visible response shapes for the same entity.

### Layer 4: `api.ts` as a Type Dump (structural problem)

`api.ts` has evolved to contain 35+ exported type/interface definitions alongside 100+ exported API functions. Components import types directly from `api.ts`:
```typescript
import type { Volunteer, CallRecord, Conversation } from '@/lib/api'
```

This means refactoring types requires touching `api.ts` AND every component that imports from it. The correct architecture separates concerns:
- Types live in `@protocol/schemas` (Zod-inferred)
- API functions live in domain-specific modules
- `api.ts` (if kept) only re-exports types and functions, never defines them

---

## Target Architecture

### Rule 1: Schema = Wire Truth

Every API request/response shape is defined as a Zod schema in `packages/protocol/schemas/`. No exceptions. The schema is the contract between server and client.

### Rule 2: Types = Schema Inference

All TypeScript types used in the client are derived via `z.infer<typeof someSchema>`. No handwritten interfaces for API shapes. No `& { extraFields }` extensions.

```typescript
// ❌ Before: extension pattern
export type Volunteer = z.infer<typeof volunteerResponseSchema> & { createdAt: string; ... }

// ✅ After: schema is complete
export type Volunteer = z.infer<typeof volunteerResponseSchema>
// ... and volunteerResponseSchema includes createdAt
```

### Rule 3: Admin vs. Volunteer Schema Variants

Entities with different visibility per role get separate schemas:
```typescript
// Schema for what volunteers see:
export const volunteerPublicResponseSchema = z.object({ pubkey, name, roles, active, ... })

// Schema for what admins see (extends public):
export const volunteerAdminResponseSchema = volunteerPublicResponseSchema.extend({
  phone: z.string(),   // full phone — admin only
  createdAt: z.string(),
  messagingEnabled: z.boolean(),
  supportedMessagingChannels: z.array(messagingChannelTypeSchema),
})
```

The route handler determines which schema to use based on the caller's role. The client receives the admin schema when logged in as admin.

### Rule 4: api.ts Becomes Functions-Only

After types are moved to schemas, `api.ts` contains only:
1. The HTTP request function (`request<T>()`)
2. Auth helpers
3. API domain functions (`getVolunteers()`, `createNote()`, etc.)
4. Re-exports of schema-inferred types for backward compatibility (gradual migration)

Target split (after stabilization):
```
src/client/lib/
  api/
    request.ts        # base HTTP request + auth
    volunteers.ts     # functions + type re-exports
    calls.ts
    records.ts
    conversations.ts
    settings.ts
    cms.ts
    contacts.ts
    ...
  api.ts              # barrel: re-exports everything from api/ (backward compat)
```

### Rule 5: Automate the Schema Registry

`packages/protocol/tools/schema-registry.ts` is a 700-line manual list of 160+ `[variableName, zodSchema]` pairs. It must be kept in sync with `schemas/index.ts`. Drift = silently dropped types.

Replace with auto-discovery:
```typescript
// Auto-generate from barrel export
import * as schemas from '../schemas/index.ts'
const entries = Object.entries(schemas).filter(([, v]) => v?._def !== undefined)
```

Adding a schema = update only the barrel `index.ts`. Registry derives automatically.

### Rule 6: Delete TypeScript Codegen

`packages/protocol/tools/codegen.ts` generates TypeScript interfaces via quicktype that no TypeScript file consumes. Remove the TypeScript generation step; keep Swift and Kotlin only.

The `packages/protocol/generated/typescript/` directory can be deleted. This also removes the `[property: string]: any` index signature problem caused by `z.looseObject()` in quicktype output.

---

## Migration Plan

This is a type-only reorganization. No runtime behavior changes. TypeScript compiler is the test gate throughout.

### Phase A: Schema Audit and Completion (~4 hours)

**Goal**: All API response shapes fully represented in schemas. No `& {}` extensions needed after this phase.

**SAFETY: All new fields added to response schemas in this phase MUST use `.optional()` unless confirmed always-present in actual API responses.** The Zod schemas are used for runtime request/response validation in worker routes. A newly required field that the server doesn't always return will cause runtime parse failures even if typecheck passes. After Phase A, smoke-test the key API endpoints to confirm no parse failures.

For each entity with a `& {}` extension in `api.ts`:

1. **Volunteer** — Add to `volunteerResponseSchema`:
   - `createdAt: z.string()`
   - `messagingEnabled: z.boolean().optional()`
   - `supportedMessagingChannels: z.array(messagingChannelTypeSchema).optional()`
   - Tighten `callPreference` to `z.enum(['phone', 'browser', 'both']).optional()`
   - Create `volunteerAdminResponseSchema` extending base with `phone: z.string()` required

2. **EncryptedNote** — Add `ephemeralPubkey: z.string().optional()` to `noteResponseSchema`

3. **CallRecord** — Add to `callRecordResponseSchema`:
   - `recordingSid: z.string().optional()`
   - `encryptedContent: z.string().optional()`
   - `adminEnvelopes: z.array(recipientEnvelopeSchema).optional()`
   - Remove redundant `answeredBy` from extension (already in schema)

4. **InviteCode** — Add `phone: z.string()`, `createdBy: z.string()` to `inviteResponseSchema`

5. **Conversation** — Add `lastMessageAt: z.string()`, tighten `status` to `z.enum(['active','waiting','closed'])`

6. **ConversationMessage** — Add missing fields (requires reading `messageResponseSchema`)

For handwritten interfaces with no schema counterpart, add schemas to appropriate files:
- `ActiveCall` → `calls.ts`
- `AuditLogEntry` → `audit.ts` (likely already has one — check)
- `ContactSummary`, `ContactTimeline` → `contacts.ts` or `contacts-v2.ts`
- `RoleDefinition` → `settings.ts` or new `roles.ts`
- `EvidenceMetadata`, `CustodyEntry` → `evidence.ts` (schemas exist but unused)
- `TemplateSummary` → `settings.ts` or new `templates.ts`
- `DirectoryContact`, `RawContact`, `ContactPII`, etc. → `contacts-v2.ts`
- `ServiceStatus`, `SystemHealth` → `health.ts` (likely exists)
- `CreateRecordBody`, `UpdateRecordBody` → `records.ts` (schemas exist but unused by client)
- `CreateEntityTypeBody` → `entity-schema.ts`

**Gate**: `bun run typecheck` passes. Zero new schema entries needed in api.ts after this phase.

### Phase A.5: Audit Remaining Handwritten Interfaces in api.ts (~2 hours)

**Goal**: Beyond the `& {}` extensions, `api.ts` contains approximately 30 handwritten interfaces that are NOT intersection extensions. These need individual decisions before Phase B can clean api.ts.

Known examples (non-exhaustive): `ShiftStatus`, `ContactSummary`, `ContactTimeline`, `AuditLogEntry`, `ActiveCall`, `ServiceStatus`, `SystemHealth`, `WebAuthnSettings`, `RoleDefinition`, `IvrAudioRecording`, `DirectoryContact`, `RawContact`, `DirectoryContactSummary`, `ContactRelationship`, `ContactGroup`, `ContactCaseLink`, `CreateRecordBody`, `UpdateRecordBody`, `EvidenceMetadata`, `CustodyEntry`, and more.

For each interface:
1. Does a schema already exist in `packages/protocol/schemas/`? (`evidence.ts` has `EvidenceMetadata`, `CustodyEntry`; `contacts-v2.ts` has `ContactSummary` — verify these match.) If yes: add a re-export from the schema file and delete the handwritten interface.
2. If no schema exists: add one to the appropriate schema file during this phase. Then re-export and delete.

This phase runs AFTER Phase A (schemas complete) and BEFORE Phase B (clean api.ts), because Phase A may already add some of these schemas as part of the missing-schema work.

**Gate**: Every type/interface in `api.ts` is either a `z.infer<>` derivation, a re-export from a schema file, or a function signature. No standalone `interface Foo { ... }` definitions remain.

### Phase B: Remove Extensions from api.ts (~2 hours)

After schemas are complete, convert each `z.infer<T> & {}` to plain `z.infer<T>`:
```typescript
// Before:
export type Volunteer = z.infer<typeof volunteerResponseSchema> & { createdAt: string; ... }

// After (schema is complete):
export type Volunteer = z.infer<typeof volunteerResponseSchema>
```

Remove all 20+ handwritten interfaces from api.ts that now have schema counterparts. Replace with:
```typescript
export type { ActiveCall } from '@protocol/schemas/calls'
export type { AuditLogEntry } from '@protocol/schemas/audit'
// etc.
```

**Gate**: `bun run typecheck` passes. Zero type definitions in api.ts (only re-exports and function signatures).

### Phase C: Clean @shared/types (~1 hour)

Remove from `@shared/types`:
- `CustomFieldDefinition` — move entirely to a schema in `settings.ts` or `entity-schema.ts`; update usages across components. The DO reference in the comment ("stored as config in SessionManager DO") must also be purged.
- `FileRecord`, `UploadInit` — check if `files.ts` schema covers these
- `NotePayload` — already has schema equivalent likely; check `notes.ts`
- `BlastSettings`, `Subscriber`, `Blast`, `BlastContent` — **verify before removing**: check whether `packages/protocol/schemas/blasts.ts` exists and exports these types. If it does, derive from `z.infer` instead of keeping handwritten versions. If `blasts.ts` does not exist or does not cover these shapes, they stay in `@shared/types` until a schema is added.

Keep in `@shared/types` (non-API config/utility types):
- `TelephonyProviderConfig` and PROVIDER_REQUIRED_FIELDS
- `TELEPHONY_PROVIDER_LABELS`, `CHANNEL_SECURITY`, `CHANNEL_LABELS`, constants
- `MessagingConfig`, `SMSConfig`, `WhatsAppConfig` — credential/config shapes
- Helper functions (`fieldMatchesContext`)
- Re-exports from schemas (keep these — backward compat)

**Gate**: `bun run typecheck` passes.

### Phase D: Delete apps/worker/types.ts (~1 hour)

`apps/worker/types.ts` contains two distinct categories of types that must be handled differently:

**Category 1: Entity duplicate types** — `Volunteer`, `CallRecord`, `Conversation` interfaces, and similar domain entity shapes. These are duplicates of protocol schemas. Migrate them: delete from `types.ts`, import from the schema.

**Category 2: Infrastructure and CF binding types (OUT OF SCOPE for this spec)** — `Env` (Cloudflare Worker environment interface with DO/KV/bucket bindings), `DOStub`, `DONamespace`, `BlobStorage`, `TranscriptionService`, `AppEnv`, `ServerSession`, `AuthPayload`, `DeviceRecord`, push payload types, and similar worker-internal infrastructure shapes. These have no protocol schema counterpart and must NOT be migrated into `packages/protocol/schemas/`. They should remain in a renamed file: `apps/worker/types/infra.ts`, with an explicit header comment: `// Infrastructure and CF binding types — worker-internal only, never sent to client`. These are addressed in the backend dead code cleanup spec, not here.

For each type in `apps/worker/types.ts`:
- Category 1 (entity duplicate) → delete, add import from schema
- Category 2 (infrastructure) → move to `apps/worker/types/infra.ts`
- Genuinely ambiguous → mark `// server-only: never sent to client` and move to infra.ts

**Gate**: `bun run typecheck` passes. `apps/worker/types.ts` is deleted. `apps/worker/types/infra.ts` exists with only infrastructure types.

### Phase E: Automate Schema Registry (~1 hour)

Rewrite `schema-registry.ts` to auto-discover from the barrel `schemas/index.ts`.

**IMPORTANT: The automation cannot be naive barrel reflection.** Some schemas are intentionally excluded from codegen: query parameter schemas, route parameter schemas, utility/internal schemas (e.g., `okResponseSchema`, `QuerySchema`, `ParamsSchema` variants). A naive `Object.entries(schemas).filter(([, v]) => v?._def !== undefined)` would include these and generate unwanted types in Swift/Kotlin.

The automation must implement a filtering rule. The exact rule is a decision for planning time, but the options are:

- **Naming convention**: only generate types for exports matching `/ResponseSchema$|BodySchema$|Schema$/` but not `/QuerySchema$|ParamsSchema$/`
- **Explicit inclusion marker**: schemas that should be codegen'd export a `codegen: true` flag alongside the schema export; the registry filters for this marker
- **Preserve exclusion list**: keep the existing explicit exclusion list of schemas to skip, but auto-discover all other Zod schema exports (removing the need to manually add new schemas to the registry)

Whichever rule is chosen, it must be documented in a comment at the top of `schema-registry.ts` so future schema authors know whether their new schema will be auto-included or requires opt-in.

Test: add a new schema to `index.ts`, run `bun run codegen`, verify it appears in Swift/Kotlin output without touching `schema-registry.ts`.

### Phase F: Delete TypeScript Codegen (~30 min)

- Remove the TypeScript generation block from `codegen.ts`
- Delete `packages/protocol/generated/typescript/`
- Remove any references in `tsconfig.json`, `vite.config.ts` to the generated path
- Update `package.json` scripts if any reference the TypeScript generated output

**Gate**: `bun run codegen` succeeds; `bun run typecheck` passes; no imports of generated TypeScript anywhere.

### Phase G: Split api.ts (~2 hours, can be deferred)

Once types are clean, split the 2278-line file by domain. This is cosmetic/structural — no type changes. Provides:
- Faster TypeScript compilation (smaller files)
- Easier navigation for Claude
- Clear domain boundaries

Can be deferred to after critical phases (A-F) are complete.

---

## Files Impacted

**Heavily modified (schema additions):**
- `packages/protocol/schemas/volunteers.ts` — add fields, add admin variant
- `packages/protocol/schemas/calls.ts` — add fields, add ActiveCall schema
- `packages/protocol/schemas/conversations.ts` — add fields, tighten status enum
- `packages/protocol/schemas/notes.ts` — add ephemeralPubkey
- `packages/protocol/schemas/invites.ts` — add phone, createdBy
- `packages/protocol/schemas/settings.ts` — add TemplateSummary, RoleDefinition
- `packages/protocol/schemas/contacts-v2.ts` — add DirectoryContact et al.
- `packages/protocol/schemas/evidence.ts` — promote existing schemas to be consumed by client

**Heavily modified (type removal):**
- `src/client/lib/api.ts` — remove all 35+ type/interface definitions, keep only re-exports

**Deleted:**
- `packages/protocol/generated/typescript/types.ts`
- `apps/worker/types.ts` (or reduced to near-empty internal.ts)

**Modified (clean up duplicates):**
- `packages/shared/types.ts` — remove entity shapes that now have schema counterparts

**Modified (automation):**
- `packages/protocol/tools/schema-registry.ts` — replace manual list with barrel auto-discovery
- `packages/protocol/tools/codegen.ts` — remove TypeScript generation step

---

## Risk Assessment

**Low risk**: Schema additions (additive), type narrowing (compiler will catch regressions), registry automation (test gate).

**Medium risk**: Removing `& {}` extensions — each removed extension may reveal components using the extended fields that no longer exist. Mitigation: use `bun run typecheck` as continuous gate.

**Medium risk**: `@shared/types` cleanup — many files import from it. Mitigation: keep re-exports during transition, remove them in a separate cleanup pass.

**High risk (deferred)**: api.ts domain split — touching imports in 50+ component files. Mitigation: do this LAST, after all other phases complete and tests pass.

---

## Success Criteria

- [ ] `bun run typecheck` passes throughout every phase
- [ ] Zero `& { }` type extensions in `api.ts`
- [ ] Zero handwritten interfaces for API shapes in `api.ts`
- [ ] `apps/worker/types.ts` deleted or reduced to `// server-only: never sent to client` types only
- [ ] `@shared/types` contains no entity shapes with schema counterparts
- [ ] Schema registry auto-discovers from barrel export
- [ ] `packages/protocol/generated/typescript/` deleted
- [ ] Adding a new API response field requires changing exactly 1 file (the schema)
- [ ] Admin vs. volunteer schema variants exist for entities with role-differentiated visibility

---

## Open Questions for Review

1. **contacts.ts vs. contacts-v2.ts** — two contact schemas for different systems. Should these be unified, or is the split intentional (timeline view vs. CMS directory)? The spec assumes both are kept but cleaned up.

2. **Inline `import('@shared/types')` in function signatures** — these already resolve correctly (shared/types re-exports from schemas). Can be left as-is or cleaned to direct schema imports. Not a correctness issue.

3. **`z.looseObject()` on input schemas** — the input schemas use `looseObject` for server-side permissiveness (forward compatibility). This is correct and should be kept for input schemas. Response schemas should use strict `z.object()`.

4. **`CallPreference` as `z.string()` vs. enum** — tightening to enum in the response schema may cause parse failures if the server ever returns an unexpected value. Consider adding `.catch(undefined)` for safety or using `.pipe()` to narrow after parsing.

5. **Should TypeScript consume generated types or z.infer?** Swift and Kotlin consume types generated by quicktype from the Zod schemas. TypeScript currently uses `z.infer<>` directly (not the quicktype output). The cross-platform type system spec will make a definitive decision here. This spec proceeds on the assumption that `z.infer` is the TypeScript type source — it is simpler, avoids the `[property: string]: any` index signature problem in quicktype output, and keeps the Zod runtime validation integrated with the type derivation. However, if the decision is to align all platforms on generated types, Phase F (delete TS codegen) becomes Phase F (fix TS codegen output quality instead — address `looseObject` index signatures, enum naming, nullability, etc.). **This spec does not resolve this question.** Implementers should check `docs/superpowers/specs/` for a cross-platform type system spec before executing Phase F.
