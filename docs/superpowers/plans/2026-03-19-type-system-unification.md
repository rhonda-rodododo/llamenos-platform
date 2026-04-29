# Type System Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all `z.infer<T> & {}` extension patterns and handwritten interface duplicates from `api.ts`, `@shared/types`, and `apps/worker/types.ts` by completing the protocol schemas and deriving all client types from them.
**Architecture:** Protocol schemas in `packages/protocol/schemas/` become the single source of truth for all wire types; `api.ts` becomes functions-only with re-exports for backward compat; worker infra types move to `apps/worker/types/infra.ts`. TypeScript compiler (`bun run typecheck`) is the continuous gate.
**Tech Stack:** Zod 4, TypeScript, `z.infer<>`, `packages/protocol/schemas/`, quicktype (Swift/Kotlin only after Phase F)

---

## Overview

Phases execute in strict order — each phase's gate must pass before starting the next.

| Phase | Scope | Gate |
|-------|-------|------|
| A | Complete schemas for entities with `& {}` extensions | `bun run typecheck` |
| A.5 | Complete schemas for standalone handwritten interfaces | `bun run typecheck` |
| B | Remove `& {}` extensions and standalone interfaces from `api.ts` | `bun run typecheck` |
| C | Clean `@shared/types` of entity duplicates | `bun run typecheck` |
| D | Delete `apps/worker/types.ts`, create `apps/worker/types/infra.ts` | `bun run typecheck` |
| E | Automate schema registry auto-discovery | `bun run codegen` succeeds |
| F | Remove TypeScript codegen from `codegen.ts` | `bun run codegen && bun run typecheck` |

---

## Phase A: Complete Schemas for Extension Types

### Task A1: Volunteer schema — add missing fields and admin variant

**Files:**
- Modify: `packages/protocol/schemas/volunteers.ts`
- Modify: `packages/protocol/schemas/index.ts`
- Modify: `packages/protocol/tools/schema-registry.ts`

**Context:** `api.ts` line 906 defines `Volunteer = z.infer<typeof volunteerResponseSchema> & { createdAt, phone, transcriptionEnabled, onBreak, callPreference, supportedMessagingChannels?, messagingEnabled? }`. The base schema already has `phone`, `transcriptionEnabled`, `onBreak`, `callPreference`, `messagingEnabled`, `supportedMessagingChannels` as optional — they just need to become guaranteed present on the admin response shape. New field `createdAt` is missing entirely.

- [ ] In `packages/protocol/schemas/volunteers.ts`, add `createdAt: z.string()` to `volunteerResponseSchema`. This field is always present in actual API responses (server sets it on creation).
- [ ] Tighten `callPreference` from `z.string().optional()` to `z.enum(['phone', 'browser', 'both']).optional()` in `volunteerResponseSchema`. Use `.optional()` to avoid parse failures if the value is absent.
- [ ] Add `volunteerAdminResponseSchema` extending `volunteerResponseSchema` with `phone: z.string()` required (admin always receives the phone), `messagingEnabled: z.boolean().optional()`, `supportedMessagingChannels: z.array(messagingChannelTypeSchema).optional()`:
  ```typescript
  export const volunteerAdminResponseSchema = volunteerResponseSchema.extend({
    phone: z.string(),
    messagingEnabled: z.boolean().optional(),
    supportedMessagingChannels: z.array(messagingChannelTypeSchema).optional(),
  })
  ```
- [ ] Export `volunteerAdminResponseSchema` from `packages/protocol/schemas/index.ts` (add to the barrel next to `volunteerResponseSchema`).
- [ ] Add `['volunteerAdminResponseSchema', volunteerAdminResponseSchema]` to the `schemaEntries` array in `packages/protocol/tools/schema-registry.ts` (after the existing volunteer entries, ~line 384).
- [ ] Run `bun run typecheck` — must pass before continuing.
- [ ] Commit: `git commit -m "feat(schemas): add createdAt, admin variant, and enum-typed callPreference to volunteer schema"`

---

### Task A2: EncryptedNote schema — add ephemeralPubkey

**Files:**
- Modify: `packages/protocol/schemas/notes.ts`

**Context:** `api.ts` line 922 defines `EncryptedNote = z.infer<typeof noteResponseSchema> & { ephemeralPubkey?: string }`. The field is described as a legacy field used for server-encrypted transcriptions.

- [ ] In `packages/protocol/schemas/notes.ts`, add `ephemeralPubkey: z.string().optional()` to `noteResponseSchema` (after `adminEnvelopes`). This is always optional.
- [ ] Run `bun run typecheck` — must pass.
- [ ] Commit: `git commit -m "feat(schemas): add ephemeralPubkey to noteResponseSchema"`

---

### Task A3: CallRecord schema — add missing fields and ActiveCall schema

**Files:**
- Modify: `packages/protocol/schemas/calls.ts`
- Modify: `packages/protocol/schemas/index.ts`
- Modify: `packages/protocol/tools/schema-registry.ts`

**Context:** `api.ts` line 937 defines `CallRecord = z.infer<typeof callRecordResponseSchema> & { recordingSid?, encryptedContent?, adminEnvelopes?, answeredBy?, callerNumber? }`. The `answeredBy` field is actually ALREADY in `callRecordResponseSchema` (line 9 of calls.ts) — the extension duplicates it. `callerNumber` is PII and must use a separate admin schema variant. `encryptedContent` and `adminEnvelopes` are envelope-encrypted fields.

`ActiveCall` (api.ts line 929) has no schema at all: `{ id, callerNumber, answeredBy, status: 'ringing'|'in-progress'|'completed'|'unanswered', startedAt }`.

- [ ] In `packages/protocol/schemas/calls.ts`, add missing fields to `callRecordResponseSchema`: `recordingSid: z.string().optional()`, `encryptedContent: z.string().optional()`, `adminEnvelopes: z.array(recipientEnvelopeSchema).optional()`. Import `recipientEnvelopeSchema` from `./common`.
- [ ] Tighten `callRecordResponseSchema.status` from `z.string()` to `z.enum(['ringing', 'in-progress', 'completed', 'unanswered']).optional()`. Use `.optional()` since the field may be absent on some response shapes.
- [ ] Add `activeCallResponseSchema` for the real-time call shape that includes `callerNumber` (admin-visible PII):
  ```typescript
  export const activeCallResponseSchema = z.object({
    id: z.string(),
    callerNumber: z.string(),
    answeredBy: z.string().nullable().optional(),
    startedAt: z.string(),
    status: z.enum(['ringing', 'in-progress', 'completed', 'unanswered']),
  })
  ```
- [ ] Export `activeCallResponseSchema` from `packages/protocol/schemas/index.ts`.
- [ ] Add `['activeCallResponseSchema', activeCallResponseSchema]` to `schemaEntries` in `schema-registry.ts`.
- [ ] Run `bun run typecheck` — must pass.
- [ ] Commit: `git commit -m "feat(schemas): add recordingSid/encryptedContent/adminEnvelopes to callRecordResponseSchema, add activeCallResponseSchema"`

---

### Task A4: InviteCode schema — make phone and createdBy non-optional

**Files:**
- Modify: `packages/protocol/schemas/invites.ts`

**Context:** `api.ts` line 963 defines `InviteCode = z.infer<typeof inviteResponseSchema> & { phone: string; createdBy: string }`. Looking at `invites.ts`, `phone` and `createdBy` are already present but as `.optional()`. The extension pattern forces them required on the client type.

- [ ] In `packages/protocol/schemas/invites.ts`, change `phone: z.string().optional()` to `phone: z.string()` and `createdBy: z.string().optional()` to `createdBy: z.string()`. These are always present in the admin invite list response. **SAFETY NOTE:** If the server can ever return invites without these fields (e.g., partially migrated data), keep `.optional()` and document that the extension pattern was incorrect. Verify by checking the worker route that returns invites — if it always sets both fields, make them required.
- [ ] Run `bun run typecheck` — must pass.
- [ ] Commit: `git commit -m "feat(schemas): make phone and createdBy required in inviteResponseSchema"`

---

### Task A5: Conversation schema — add lastMessageAt, metadata, tighten status

**Files:**
- Modify: `packages/protocol/schemas/conversations.ts`

**Context:** `api.ts` line 971 defines `Conversation = z.infer<typeof conversationResponseSchema> & { lastMessageAt: string; status: 'active'|'waiting'|'closed'; metadata?: {...} }`. Looking at `conversationResponseSchema` in `conversations.ts`: `lastMessageAt` is already present (`.optional()`), `status` is `z.string()` (loose). The extension forces `lastMessageAt` required and narrows `status` to enum.

- [ ] In `conversations.ts`, tighten `status` to `z.enum(['active', 'waiting', 'closed']).optional()` (keep optional to avoid parse failures if server returns unexpected values — use `.catch(undefined)` if needed).
- [ ] `lastMessageAt` is already present — the extension requiring it is unnecessary. Remove that from the extension in Phase B; no schema change needed here.
- [ ] Add `metadata` as optional to `conversationResponseSchema`:
  ```typescript
  metadata: z.object({
    linkedCallId: z.string().optional(),
    reportId: z.string().optional(),
    type: z.literal('report').optional(),
    reportTitle: z.string().optional(),
    reportCategory: z.string().optional(),
    reportTypeId: z.string().optional(),
    customFieldValues: z.string().optional(),
    conversionStatus: z.enum(['pending', 'in_progress', 'completed']).optional(),
  }).optional(),
  ```
- [ ] Run `bun run typecheck` — must pass.
- [ ] Commit: `git commit -m "feat(schemas): tighten status enum and add metadata to conversationResponseSchema"`

---

### Task A6: ConversationMessage schema — add missing fields

**Files:**
- Modify: `packages/protocol/schemas/conversations.ts`

**Context:** `api.ts` line 991 defines `ConversationMessage = z.infer<typeof messageResponseSchema> & { authorPubkey, direction, status?, hasAttachments?, attachmentIds?, deliveredAt?, readAt?, failureReason?, retryCount?, externalId? }`. Looking at `messageResponseSchema` in `conversations.ts`: `authorPubkey` is already present (`.optional()`), `direction` is already present (as `z.string()`), `status` is already present. Many extension fields are missing.

- [ ] In `conversations.ts`, tighten `messageResponseSchema.direction` from `z.string()` to `z.enum(['inbound', 'outbound']).optional()`.
- [ ] Tighten `messageResponseSchema.authorPubkey` — already `.optional()`, which is correct.
- [ ] Add missing optional fields to `messageResponseSchema`:
  ```typescript
  hasAttachments: z.boolean().optional(),
  attachmentIds: z.array(z.string()).optional(),
  deliveredAt: z.string().optional(),
  readAt: z.string().optional(),
  failureReason: z.string().optional(),
  retryCount: z.number().optional(),
  externalId: z.string().optional(),
  ```
- [ ] Run `bun run typecheck` — must pass.
- [ ] Commit: `git commit -m "feat(schemas): add delivery tracking and attachment fields to messageResponseSchema"`

---

## Phase A.5: Complete Schemas for Standalone Interfaces

### Task A5.1: ShiftStatus interface → schema

**Files:**
- Modify: `packages/protocol/schemas/shifts.ts`
- Modify: `packages/protocol/schemas/index.ts`
- Modify: `packages/protocol/tools/schema-registry.ts`

**Context:** `api.ts` line 330 has `export interface ShiftStatus { onShift, currentShift, nextShift }`. The `myStatusResponseSchema` in `shifts.ts` likely already covers this — verify.

- [ ] Read `packages/protocol/schemas/shifts.ts` — check if `myStatusResponseSchema` matches `ShiftStatus`. If it does, no schema change needed; go to Phase B where the handwritten interface is replaced with `z.infer`.
- [ ] If `myStatusResponseSchema` doesn't match `ShiftStatus`, add a `shiftStatusSchema` to `shifts.ts` that matches exactly and export it.
- [ ] Export from `index.ts` and add to `schema-registry.ts` if a new schema was added.
- [ ] Run `bun run typecheck`.
- [ ] Commit: `git commit -m "feat(schemas): ensure ShiftStatus has schema coverage in shifts.ts"`

---

### Task A5.2: AuditLogEntry interface → use existing schema

**Files:**
- No schema changes needed (schema exists)

**Context:** `api.ts` line 948 has `export interface AuditLogEntry`. `packages/protocol/schemas/audit.ts` exports `auditEntryResponseSchema` which covers all fields including optional `previousEntryHash` and `entryHash`. This is already in the schema — the work is just removing the handwritten interface in Phase B.

- [ ] Verify `auditEntryResponseSchema` fields match `AuditLogEntry` in api.ts. If `details` field type differs (schema: `z.record(z.string(), z.unknown()).optional()` vs interface: `Record<string, unknown>` required), update schema to `z.record(z.string(), z.unknown())` (non-optional).
- [ ] Run `bun run typecheck`.
- [ ] Commit: `git commit -m "feat(schemas): align auditEntryResponseSchema details field with AuditLogEntry usage"` (skip if no changes needed)

---

### Task A5.3: ContactSummary and ContactTimeline interfaces → use existing schemas

**Files:**
- Modify: `packages/protocol/schemas/contacts.ts`

**Context:** `api.ts` lines 459–475 define `ContactSummary` and `ContactTimeline`. `packages/protocol/schemas/contacts.ts` exports `contactTimelineSummarySchema` which matches `ContactSummary`. `ContactTimeline` has no schema — it's a response wrapper with typed call/conversation/note arrays.

- [ ] In `packages/protocol/schemas/contacts.ts`, add:
  ```typescript
  export const contactTimelineResponseSchema = z.object({
    contact: contactTimelineSummarySchema,
    calls: z.array(z.record(z.string(), z.unknown())),
    conversations: z.array(z.record(z.string(), z.unknown())),
    notes: z.array(z.record(z.string(), z.unknown())),
  })
  ```
  Note: `calls`/`conversations`/`notes` use loose record types here because the concrete typed arrays (`CallRecord[]`, etc.) would create a circular dependency between schema files. In Phase B, `api.ts` will NOT use `z.infer<typeof contactTimelineResponseSchema>` directly for `ContactTimeline` since the array element types are too loose. Instead, Phase B will define `ContactTimeline` as a composed type:
  ```typescript
  export type ContactTimeline = {
    contact: z.infer<typeof contactTimelineSummarySchema>
    calls: CallRecord[]
    conversations: Conversation[]
    notes: EncryptedNote[]
  }
  ```
  This is acceptable — it's a client-side composed type, not a standalone protocol wire type.
- [ ] Export `contactTimelineResponseSchema` from `index.ts`.
- [ ] Add to `schema-registry.ts`.
- [ ] Run `bun run typecheck`.
- [ ] Commit: `git commit -m "feat(schemas): add contactTimelineResponseSchema to contacts.ts"`

---

### Task A5.4: SystemHealth and ServiceStatus interfaces → use existing schemas

**Files:**
- No schema changes needed

**Context:** `api.ts` lines 1572–1607 define `ServiceStatus` and `SystemHealth`. `packages/protocol/schemas/system.ts` exports `systemHealthResponseSchema` which covers all these fields (including the nested `server`, `services`, `calls`, `storage`, `backup`, `volunteers`, `timestamp`). This is already complete — work is just removing the handwritten interfaces in Phase B.

- [ ] Verify `systemHealthResponseSchema` covers `SystemHealth` exactly. Check that the `serviceStatus` inline schema in `system.ts` matches the `ServiceStatus` interface.
- [ ] Export `serviceStatusSchema` (currently unexported as `const serviceStatusSchema`) from `system.ts` so Phase B can use `z.infer<typeof serviceStatusSchema>` for `ServiceStatus`.
- [ ] Run `bun run typecheck`.
- [ ] Commit: `git commit -m "feat(schemas): export serviceStatusSchema from system.ts"`

---

### Task A5.5: WebAuthnSettings interface → use existing schema

**Files:**
- No schema changes needed (but verify)

**Context:** `api.ts` line 821 defines `export interface WebAuthnSettings { requireForAdmins, requireForVolunteers }`. `packages/protocol/schemas/settings.ts` should have `webauthnSettingsSchema`. The schema-registry already includes it.

- [ ] Read `packages/protocol/schemas/webauthn.ts` and `settings.ts` to confirm `webauthnSettingsSchema` exists and covers both fields.
- [ ] No schema change needed — just remove the handwritten interface in Phase B.

---

### Task A5.6: RoleDefinition interface → use existing schema

**Files:**
- Modify: `packages/protocol/schemas/settings.ts`

**Context:** `api.ts` line 839 defines `export interface RoleDefinition { id, name, slug, permissions, isDefault, isSystem, description, createdAt, updatedAt }`. `packages/protocol/schemas/settings.ts` has `roleResponseSchema`. Compare: `isDefault` and `isSystem` are `.optional()` in the schema but required in the interface. `createdAt` and `updatedAt` are `.optional()` in schema but required in interface.

- [ ] In `settings.ts`, change `isDefault: z.boolean().optional()` to `isDefault: z.boolean()`, `isSystem: z.boolean().optional()` to `isSystem: z.boolean()`. **SAFETY:** Verify the server always returns these fields. If unsure, keep `.optional()` and accept that `RoleDefinition` will have optional fields.
- [ ] Run `bun run typecheck`.
- [ ] Commit: `git commit -m "feat(schemas): ensure roleResponseSchema matches RoleDefinition interface"`

---

### Task A5.7: IvrAudioRecording interface → add schema to settings.ts

**Files:**
- Modify: `packages/protocol/schemas/settings.ts`
- Modify: `packages/protocol/schemas/index.ts`
- Modify: `packages/protocol/tools/schema-registry.ts`

**Context:** `api.ts` line 723 defines `export interface IvrAudioRecording { promptType, language, size, uploadedAt }`. No schema exists for this.

- [ ] In `settings.ts`, add:
  ```typescript
  export const ivrAudioRecordingSchema = z.object({
    promptType: z.string(),
    language: z.string(),
    size: z.number(),
    uploadedAt: z.string(),
  })
  ```
- [ ] Export from `index.ts` and add to `schema-registry.ts`.
- [ ] Run `bun run typecheck`.
- [ ] Commit: `git commit -m "feat(schemas): add ivrAudioRecordingSchema to settings.ts"`

---

### Task A5.8: Directory contact interfaces → use/extend contacts-v2 schemas

**Files:**
- Modify: `packages/protocol/schemas/contacts-v2.ts`
- Modify: `packages/protocol/schemas/index.ts`
- Modify: `packages/protocol/tools/schema-registry.ts`

**Context:** `api.ts` lines 1855–2068 define many directory contact types: `DirectoryContactType`, `IdentifierType`, `ContactIdentifier`, `RawContact`, `DirectoryContactSummary`, `ContactPII`, `DirectoryContact`, `ContactRelationship`, `ContactGroup`, `ContactCaseLink`, `CreateRawContactBody`, `CreateDirectoryContactBody`.

Looking at `packages/protocol/schemas/contacts-v2.ts`: `contactSchema` matches `RawContact`, `contactSummarySchema` matches `DirectoryContactSummary`, `contactPIISchema` matches `ContactPII`. The contact-relationship types are in `packages/protocol/schemas/contact-relationships.ts`.

- [ ] Verify `contactSchema` fields exactly match `RawContact` in `api.ts`. If `preferenceToken` is missing from schema (it's in `@shared/types.Subscriber` not contact), this is correct and no change needed.
- [ ] In `contacts-v2.ts`, add missing schemas:
  ```typescript
  export const directoryContactTypeSchema = z.enum(['individual', 'organization', 'legal_resource', 'service_provider'])
  export type DirectoryContactType = z.infer<typeof directoryContactTypeSchema>

  export const identifierTypeSchema = z.enum(['phone', 'email', 'signal'])
  export type IdentifierType = z.infer<typeof identifierTypeSchema>

  export const contactIdentifierSchema = z.object({
    id: z.string(),
    type: identifierTypeSchema,
    value: z.string(),
    isPrimary: z.boolean(),
  })

  export const directoryContactSchema = z.object({
    id: z.string(),
    displayName: z.string(),
    contactType: directoryContactTypeSchema,
    tags: z.array(z.string()),
    caseCount: z.number(),
    lastInteractionAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    canDecrypt: z.boolean(),
    demographics: z.string().optional(),
    emergencyContacts: z.string().optional(),
    communicationPrefs: z.string().optional(),
    notes: z.string().optional(),
    identifiers: z.array(contactIdentifierSchema).optional(),
  })

  export const contactCaseLinkSchema = z.object({
    recordId: z.string(),
    caseNumber: z.string().optional(),
    entityTypeLabel: z.string(),
    role: z.string(),
    status: z.string(),
    createdAt: z.string(),
  })

  export const createRawContactBodySchema = contactSchema.omit({ id: true, createdAt: true, updatedAt: true, lastInteractionAt: true, caseCount: true, noteCount: true, interactionCount: true }).extend({
    tagHashes: z.array(z.string()).optional(),
    blindIndexes: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  })
  ```
- [ ] Export new schemas from `index.ts` and add to `schema-registry.ts`.
- [ ] Run `bun run typecheck`.
- [ ] Commit: `git commit -m "feat(schemas): add DirectoryContact, ContactIdentifier, ContactCaseLink schemas to contacts-v2.ts"`

---

### Task A5.9: CMS body interfaces → confirm schemas exist (Phase B cleanup only)

**Files:**
- No schema changes needed

**Context:** `api.ts` lines 1633 and 1774 define `CreateEntityTypeBody` and `CreateRecordBody`/`UpdateRecordBody`. These schemas already exist and are registered: `createEntityTypeBodySchema` in `entity-schema.ts` and `createRecordBodySchema`/`updateRecordBodySchema` in `records.ts`. Both are exported and in `schema-registry.ts`. The api.ts handwritten interfaces are just not yet replaced with `z.infer<>` — that is Phase B work.

- [ ] Read `packages/protocol/schemas/records.ts` to confirm `createRecordBodySchema` covers `CreateRecordBody` fields: `entityTypeId`, `statusHash`, `severityHash`, `categoryHash`, `assignedTo`, `blindIndexes`, `encryptedSummary`, `summaryEnvelopes`, `encryptedFields`, `fieldEnvelopes`, `encryptedPII`, `piiEnvelopes`, `parentRecordId`, `contactLinks`. The schema uses `.optional().default([])` for some fields — this is fine, `z.infer<>` will reflect the correct output type.
- [ ] No schema changes needed. Phase B will replace the handwritten interfaces with `z.infer<typeof createEntityTypeBodySchema>` etc.
- [ ] No commit needed for this task.

---

### Task A5.10: AssignmentSuggestion interface → add schema to records.ts

**Files:**
- Modify: `packages/protocol/schemas/records.ts`
- Modify: `packages/protocol/schemas/index.ts`
- Modify: `packages/protocol/tools/schema-registry.ts`

**Context:** `api.ts` line 2086 defines `export interface AssignmentSuggestion { pubkey, score, reasons, activeCaseCount, maxCases }`. Check if `suggestAssigneesResponseSchema` in `records.ts` already has this shape inline.

- [ ] Read `packages/protocol/schemas/records.ts` to check `suggestAssigneesResponseSchema`. If it uses `z.object()` inline for suggestions, extract and export `assignmentSuggestionSchema` separately so Phase B can use `z.infer<typeof assignmentSuggestionSchema>` for `AssignmentSuggestion`.
- [ ] Export from `index.ts` and add to `schema-registry.ts` if new.
- [ ] Run `bun run typecheck`.
- [ ] Commit: `git commit -m "feat(schemas): extract and export assignmentSuggestionSchema from records.ts"`

---

### Task A5.11: TemplateSummary interface → add schema to entity-schema.ts

**Files:**
- Modify: `packages/protocol/schemas/entity-schema.ts`
- Modify: `packages/protocol/schemas/index.ts`
- Modify: `packages/protocol/tools/schema-registry.ts`

**Context:** `api.ts` line 1679 defines `export interface TemplateSummary { id, name, description, icon?, version, entityTypeCount, totalFieldCount, suggestedRoleCount, tags, comingSoon? }`. Check `templateListResponseSchema` in `entity-schema.ts` — if it wraps inline objects, extract `templateSummarySchema`.

- [ ] Read `packages/protocol/schemas/entity-schema.ts` to check `templateListResponseSchema`. If it uses inline objects for templates, extract and export `templateSummarySchema`.
- [ ] Export from `index.ts` and add to `schema-registry.ts` if new.
- [ ] Run `bun run typecheck`.
- [ ] Commit: `git commit -m "feat(schemas): extract and export templateSummarySchema from entity-schema.ts"`

---

## Phase B: Remove Extensions and Interfaces from api.ts

### Task B1: Replace Volunteer, EncryptedNote, CallRecord type extensions

**Files:**
- Modify: `src/client/lib/api.ts`

**Context:** After Phase A schemas are complete, the `& {}` extension patterns in the "Types" section of `api.ts` (lines 901–1005) can be replaced with plain `z.infer<>` derivations. This also requires importing the new schemas added in Phase A.

- [ ] Add imports at the top of `api.ts` for new schemas: `import { volunteerAdminResponseSchema } from '@protocol/schemas/volunteers'`, `import { activeCallResponseSchema } from '@protocol/schemas/calls'`.
- [ ] Replace the `Volunteer` type:
  ```typescript
  // Before (line 906):
  export type Volunteer = z.infer<typeof volunteerResponseSchema> & { ... }
  // After:
  export type Volunteer = z.infer<typeof volunteerAdminResponseSchema>
  ```
- [ ] Replace `EncryptedNote` type (now `ephemeralPubkey` is in schema):
  ```typescript
  export type EncryptedNote = z.infer<typeof noteResponseSchema>
  ```
- [ ] Replace `ActiveCall` interface with schema inference (new `activeCallResponseSchema`):
  ```typescript
  export type ActiveCall = z.infer<typeof activeCallResponseSchema>
  ```
  Remove the `export interface ActiveCall` block.
- [ ] Replace `CallRecord` type (schema now has `recordingSid`, `encryptedContent`, `adminEnvelopes`):
  ```typescript
  export type CallRecord = z.infer<typeof callRecordResponseSchema>
  ```
- [ ] Replace `InviteCode` type (schema now has required phone/createdBy):
  ```typescript
  export type InviteCode = z.infer<typeof inviteResponseSchema>
  ```
- [ ] Replace `Conversation` type (schema now has metadata, tightened status):
  ```typescript
  export type Conversation = z.infer<typeof conversationResponseSchema>
  ```
- [ ] Replace `ConversationMessage` type (schema now has all delivery tracking fields):
  ```typescript
  export type ConversationMessage = z.infer<typeof messageResponseSchema>
  ```
- [ ] Run `bun run typecheck` — fix any type errors (likely component files that used the previously-extended fields; they should still work since all fields are now in the schema).
- [ ] Commit: `git commit -m "refactor(api): replace z.infer & {} extension types with complete schema inference"`

---

### Task B2: Replace standalone handwritten interfaces with schema re-exports

**Files:**
- Modify: `src/client/lib/api.ts`

**Context:** After Task B1, the remaining standalone `interface` and `type` definitions in `api.ts` that have schema counterparts (from Phase A.5) can be replaced with `z.infer<>` derivations or `export type { X } from '@protocol/schemas/...'`.

- [ ] Replace `export interface ShiftStatus` with:
  ```typescript
  export type ShiftStatus = z.infer<typeof myStatusResponseSchema>
  ```
  (Import `myStatusResponseSchema` from shifts, or use the dedicated schema added in A5.1 if applicable.)
- [ ] Replace `export interface AuditLogEntry` with:
  ```typescript
  export type { auditEntryResponseSchema } from '@protocol/schemas/audit'
  export type AuditLogEntry = z.infer<typeof auditEntryResponseSchema>
  ```
- [ ] Replace `ContactSummary` and `ContactTimeline` interfaces with schema inference from `contacts.ts`.
- [ ] Replace `export interface ServiceStatus` and `export interface SystemHealth` with:
  ```typescript
  export type SystemHealth = z.infer<typeof systemHealthResponseSchema>
  export type ServiceStatus = z.infer<typeof serviceStatusSchema>
  ```
  Add `systemHealthResponseSchema` and `serviceStatusSchema` to imports from `@protocol/schemas/system`.
- [ ] Replace `export interface WebAuthnSettings` with `z.infer<typeof webauthnSettingsSchema>`.
- [ ] Replace `export interface RoleDefinition` with `z.infer<typeof roleResponseSchema>`.
- [ ] Replace `export interface IvrAudioRecording` with `z.infer<typeof ivrAudioRecordingSchema>`.
- [ ] Replace `RawContact`, `DirectoryContactSummary`, `ContactPII`, `DirectoryContact`, `ContactRelationship`, `ContactGroup`, `ContactCaseLink`, `ContactIdentifier`, `DirectoryContactType`, `IdentifierType` with schema inference from `@protocol/schemas/contacts-v2` and `@protocol/schemas/contact-relationships`.
- [ ] Replace `CreateEntityTypeBody`, `CreateRecordBody`, `UpdateRecordBody` with `z.infer<>` from their existing schemas.
- [ ] Replace `export interface AssignmentSuggestion` with `z.infer<typeof assignmentSuggestionSchema>`.
- [ ] Replace `export interface TemplateSummary` with `z.infer<typeof templateSummarySchema>`.
- [ ] Replace `export interface EvidenceMetadata` with `z.infer<typeof evidenceMetadataSchema>` (already in `evidence.ts`).
- [ ] Replace `export interface CustodyEntry` with `z.infer<typeof custodyEntrySchema>` (already in `evidence.ts`).
- [ ] Replace `EvidenceClassification` and `CustodyAction` type aliases with `z.infer<>` from `evidence.ts`.
- [ ] Replace `export interface CreateRawContactBody` with `z.infer<typeof createRawContactBodySchema>` from `contacts-v2.ts`.
- [ ] Replace `export interface CreateDirectoryContactBody` — this is a legacy pre-encryption helper that may have no exact schema counterpart. If it's only used in one place, inline it at that usage site and remove from api.ts.
- [ ] Run `bun run typecheck` after each replacement group. Fix errors immediately.
- [ ] Commit: `git commit -m "refactor(api): replace all standalone handwritten interfaces with schema-inferred types"`

---

### Task B3: Verify api.ts is interface-free

**Files:**
- Read-only: `src/client/lib/api.ts`

- [ ] Search for remaining `export interface` in `src/client/lib/api.ts`. The only acceptable occurrences should be error class declarations (`ApiError`, `NetworkError`, `OfflineQueuedError`) which are proper classes, not type definitions.
- [ ] Search for `export type X = z.infer<T> &` pattern — should find zero instances.
- [ ] Run `bun run typecheck` — must pass clean.
- [ ] Run `bun run test` — Playwright tests must pass.
- [ ] Commit: `git commit -m "test: verify api.ts is free of handwritten interfaces — all types schema-inferred"`

---

## Phase C: Clean @shared/types

### Task C1: Migrate CustomFieldDefinition to a schema

**Files:**
- Modify: `packages/protocol/schemas/settings.ts`
- Modify: `packages/protocol/schemas/index.ts`
- Modify: `packages/protocol/tools/schema-registry.ts`
- Modify: `packages/shared/types.ts`

**Context:** `@shared/types` line 80 defines `interface CustomFieldDefinition`. This is a handwritten interface with no schema counterpart. The `customFieldResponseSchema` in `settings.ts` is a stripped-down version used for a different response shape — it doesn't match the full `CustomFieldDefinition`.

- [ ] In `packages/protocol/schemas/settings.ts`, add `customFieldDefinitionSchema` (the full definition, matching `@shared/types.CustomFieldDefinition`):
  ```typescript
  export const customFieldDefinitionSchema = z.object({
    id: z.string(),
    name: z.string(),
    label: z.string(),
    type: z.enum(['text', 'number', 'select', 'checkbox', 'textarea', 'file']),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
    validation: z.object({
      minLength: z.number().optional(),
      maxLength: z.number().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    }).optional(),
    visibleToVolunteers: z.boolean(),
    editableByVolunteers: z.boolean(),
    context: z.enum(['call-notes', 'conversation-notes', 'reports', 'all']),
    maxFileSize: z.number().optional(),
    allowedMimeTypes: z.array(z.string()).optional(),
    maxFiles: z.number().optional(),
    order: z.number(),
    createdAt: z.string(),
  })
  ```
- [ ] Export `customFieldDefinitionSchema` from `index.ts` and add to `schema-registry.ts`.
- [ ] In `packages/shared/types.ts`, replace `export interface CustomFieldDefinition` with:
  ```typescript
  export type { CustomFieldDefinition } from '@protocol/schemas/settings'
  import type { CustomFieldDefinition } from '@protocol/schemas/settings'
  ```
  And keep the helper function `fieldMatchesContext` and constants (`MAX_CUSTOM_FIELDS`, `CUSTOM_FIELD_CONTEXT_LABELS`, etc.) in place — they depend on `CustomFieldContext` which is the enum type.
- [ ] Keep `CustomFieldContext` type in `@shared/types` or move to `settings.ts` schema (as `z.infer<typeof customFieldDefinitionSchema>['context']`). The `fieldMatchesContext` helper function must remain accessible.
- [ ] Run `bun run typecheck` — fix any remaining references.
- [ ] Commit: `git commit -m "feat(schemas): add customFieldDefinitionSchema, migrate CustomFieldDefinition from @shared/types to protocol schemas"`

---

### Task C2: Migrate FileRecord and UploadInit to schemas

**Files:**
- Modify: `packages/protocol/schemas/files.ts`
- Modify: `packages/protocol/schemas/uploads.ts`
- Modify: `packages/shared/types.ts`

**Context:** `@shared/types` lines 117–146 define `FileRecord` and `UploadInit`. Check `packages/protocol/schemas/files.ts` and `uploads.ts` for existing schemas.

- [ ] Read `packages/protocol/schemas/files.ts` and `uploads.ts` to check for `fileRecordSchema` and `uploadInitSchema`. If they exist and match, update `@shared/types` to re-export from the schema. If they don't exist, add them.
- [ ] In `uploads.ts`, add `uploadInitSchema` if missing:
  ```typescript
  export const uploadInitSchema = z.object({
    totalSize: z.number(),
    totalChunks: z.number(),
    conversationId: z.string(),
    recipientEnvelopes: z.array(fileKeyEnvelopeSchema),
    encryptedMetadata: z.array(encryptedMetadataEntrySchema),
  })
  ```
- [ ] In `@shared/types`, replace handwritten `FileRecord` and `UploadInit` with re-exports from protocol schemas (once confirmed they match).
- [ ] Run `bun run typecheck`.
- [ ] Commit: `git commit -m "refactor(shared): migrate FileRecord and UploadInit to protocol schemas"`

---

### Task C3: Evaluate NotePayload, ReportType, Hub, BlastSettings

**Files:**
- Modify: `packages/shared/types.ts`

**Context:** These types in `@shared/types` may or may not have schema counterparts. The spec says to verify before removing.

- [ ] `NotePayload` — check `notes.ts` for a payload schema. This is a client-side decrypted type, not a wire format — it may legitimately stay in `@shared/types`. If no schema exists and the type is only used client-side for encryption, leave it in `@shared/types` with a comment `// Client-side plaintext payload — not a wire format`.
- [ ] `ReportType` — check if `reportTypeResponseSchema` in `settings.ts` covers this. The `@shared/types.ReportType` has `fields: CustomFieldDefinition[]` which is richer than `reportTypeResponseSchema.fields: z.array(z.string())`. These serve different shapes — leave `ReportType` in `@shared/types` but add a comment that `CustomFieldDefinition[]` uses the migrated schema type.
- [ ] `Hub` — check `packages/protocol/schemas/hubs.ts` for `hubResponseSchema`. If it matches `Hub`, replace in `@shared/types` with `export type { Hub } from '@protocol/schemas/hubs'`.
- [ ] `Subscriber`, `Blast`, `BlastContent`, `BlastSettings` — verify `packages/protocol/schemas/blasts.ts` covers these. The `blastResponseSchema` and `subscriberResponseSchema` exist and are in the registry. Replace handwritten interfaces with `z.infer<>` re-exports. **Key difference:** `@shared/types.BlastContent.text` vs `blastResponseSchema.content.body` field name mismatch — verify and reconcile before removing.
- [ ] Run `bun run typecheck` after each change.
- [ ] Commit: `git commit -m "refactor(shared): migrate Hub, Blast types to protocol schema re-exports, keep NotePayload/ReportType in place"`

---

## Phase D: Clean apps/worker/types.ts

### Task D1: Categorize and move worker types

**Files:**
- Create: `apps/worker/types/infra.ts`
- Modify: `apps/worker/types.ts`
- Modify: all files importing from `apps/worker/types.ts`

**Context:** `apps/worker/types.ts` has two distinct categories. Category 1 (entity duplicates) should be deleted and replaced with schema imports. Category 2 (infra types) must stay but move to `apps/worker/types/infra.ts`.

**Category 1 — Delete (replace with schema imports in any worker route that references them):**
- `Volunteer` (line 129) — duplicate of `volunteerResponseSchema`
- `Shift` (line 154) — duplicate of `shiftResponseSchema`
- `BanEntry` (line 164) — duplicate of `banResponseSchema`
- `CallRecord` (line 171) — duplicate of `callRecordResponseSchema`
- `EncryptedNote` (line 222) — duplicate of `noteResponseSchema`
- `AuditLogEntry` (line 238) — duplicate of `auditEntryResponseSchema`
- `SpamSettings` (line 249) — duplicate of `spamSettingsSchema`
- `CallSettings` (line 257) — duplicate of `callSettingsSchema`
- `InviteCode` (line 261) — duplicate of `inviteResponseSchema`
- `Conversation` (line 306) — duplicate of `conversationResponseSchema`
- `MessageDeliveryStatus` (line 327) — if used as a type alias only, delete; if needed by routes, keep as a re-export from `@protocol/schemas/conversations`
- `MessageKeyEnvelope` (line 357) — deprecated re-export from `@shared/types`, delete entirely

**Category 2 — Move to `apps/worker/types/infra.ts` (server-only, not wire formats):**
- `BlobStorage`, `TranscriptionService`, `DOStub`, `DONamespace`, `Env`
- `DeviceRecord`, `PushNotificationType`, `WakePayload`, `FullPushPayload`
- `UserRole` (deprecated)
- `WebAuthnCredential`, `WebAuthnSettings`
- `ServerSession`, `AuthPayload`
- `BlastQueueItem`, `BlastDeliveryQueue`
- `AppEnv`
- `EncryptedCallRecord` (line 196) — server-internal encrypted storage format; not a wire response type, no schema counterpart — server-only, move to infra.ts
- `CallRecordMetadata` (line 217) — plaintext inside EncryptedCallRecord; server-only, move to infra.ts
- `EncryptedMessage` (line 336) — server-internal message storage format with `readerEnvelopes: RecipientEnvelope[]`, different shape from `messageResponseSchema`; move to infra.ts

- [ ] Create `apps/worker/types/infra.ts` with a header comment: `// Infrastructure and CF binding types — worker-internal only, never sent to client`. Move Category 2 types into this file. Keep the same import structure (import from `@shared/types` etc.).
- [ ] Create `apps/worker/types/index.ts` as a barrel that re-exports from `infra.ts` and from protocol schemas (for the entity types that routes still need).
- [ ] Find all files in `apps/worker/` that import from `../types` or `./types` — update them to import from the new locations. Entity types should import from `@protocol/schemas/...`; infra types from `./types/infra` or `./types`.
- [ ] Delete `apps/worker/types.ts` once all imports are migrated.
- [ ] Run `bun run typecheck` — fix all errors.
- [ ] Commit: `git commit -m "refactor(worker): migrate types.ts — entity duplicates deleted, infra types moved to types/infra.ts"`

---

## Phase E: Automate Schema Registry

### Task E1: Implement auto-discovery with exclusion filter

**Files:**
- Modify: `packages/protocol/tools/schema-registry.ts`
- Modify: `packages/protocol/schemas/index.ts`

**Context:** The current 650-line manual `schemaEntries` array in `schema-registry.ts` must be kept in sync with schema exports. The spec identifies three approaches. The best for this codebase is the **preserve exclusion list** approach: auto-discover all Zod schema exports from `schemas/index.ts`, but maintain an explicit list of schemas to SKIP (query schemas, input-only schemas that shouldn't become codegen types).

- [ ] Read `packages/protocol/schemas/index.ts` to understand what it currently exports.
- [ ] Add auto-discovery to `schema-registry.ts`:
  ```typescript
  import * as allSchemas from '../schemas/index.ts'

  /**
   * Schemas excluded from codegen. Add to this list if a schema should be
   * used for validation only, not for Swift/Kotlin type generation.
   *
   * Naming convention: query/input schemas for route parameter validation
   * (QuerySchema, ParamsSchema) are excluded by name pattern automatically.
   * Add to EXCLUDED_SCHEMAS for any other schema that should not be codegen'd.
   */
  const EXCLUDED_SCHEMAS = new Set([
    'okResponseSchema',
    // Add schemas here that are internal/utility only
  ])

  // Auto-discover: include all Zod schemas except:
  // 1. Query parameter schemas (names ending in QuerySchema or ParamsSchema)
  // 2. Explicitly excluded schemas in EXCLUDED_SCHEMAS
  const discoveredEntries: Array<[string, ZodType]> = Object.entries(allSchemas)
    .filter(([name, schema]) => {
      if (typeof (schema as ZodType)?._def === 'undefined') return false  // not a Zod schema
      if (EXCLUDED_SCHEMAS.has(name)) return false
      if (/QuerySchema$|ParamsSchema$/.test(name)) return false
      return true
    })
    .map(([name, schema]) => [name, schema as ZodType])
  ```
- [ ] Replace the manual `schemaEntries` array with `discoveredEntries` in `getSchemaRegistry()`.
- [ ] Run `bun run codegen` — verify it succeeds without errors. Compare generated output counts to the old manual list.
- [ ] Add a new test schema to `schemas/index.ts` (temporarily), run `bun run codegen`, verify it appears in Swift/Kotlin output without touching `schema-registry.ts`. Remove the test schema.
- [ ] Commit: `git commit -m "feat(codegen): automate schema registry with barrel auto-discovery + exclusion list"`

---

## Phase F: Remove TypeScript Codegen

### Task F1: Remove TS generation from codegen.ts and delete generated output

**Files:**
- Modify: `packages/protocol/tools/codegen.ts`
- Delete: `packages/protocol/generated/typescript/types.ts` (gitignored, but may exist locally)
- Modify: `packages/protocol/tools/codegen.ts`

**Context:** The spec (Open Question 5) explicitly says to proceed with deleting TypeScript codegen because TypeScript uses `z.infer<>` directly. The generated `packages/protocol/generated/typescript/types.ts` is consumed by zero TypeScript files (verified: no imports found). The `crypto-labels.ts` generated file is re-exported from `packages/shared/crypto-labels.ts` — check if this is also generated and currently consumed.

- [ ] Run `grep -r "from.*generated/typescript" ~/projects/llamenos/src ~/projects/llamenos/apps/worker ~/projects/llamenos/packages/shared` to confirm zero consumers.
- [ ] Check if `packages/shared/crypto-labels.ts` re-exports from the generated TypeScript file or from `packages/protocol/crypto-labels.json` directly. If it imports from the generated file, this must be changed to import from `packages/protocol/crypto-labels.json` or inline the constants.
- [ ] In `packages/protocol/tools/codegen.ts`, remove the TypeScript generation from `main()`:
  - Remove `tsLines` from the `Promise.all` call
  - Remove `writeFileSync(join(GENERATED_DIR, 'typescript', 'types.ts'), tsContent)`
  - Remove `writeFileSync(join(GENERATED_DIR, 'typescript', 'crypto-labels.ts'), tsCryptoContent)`
  - Remove `generateForLanguage('typescript', ...)` call
  - Remove `tsCryptoContent` and `tsContent` variables
  - Remove `generateTSCryptoLabels` function
  - Update console.log output to remove TypeScript line
- [ ] Keep `mkdirSync` for `typescript` directory removed or update to only create `swift` and `kotlin` dirs.
- [ ] Run `bun run codegen` — must succeed generating only Swift and Kotlin.
- [ ] Run `bun run typecheck` — must pass.
- [ ] Commit: `git commit -m "feat(codegen): remove TypeScript codegen — Swift and Kotlin only, TS uses z.infer directly"`

---

## Phase G: Split api.ts (Deferred)

### Task G1: Split api.ts by domain (can be deferred post-Phase F)

**Files:**
- Create: `src/client/lib/api/request.ts`
- Create: `src/client/lib/api/volunteers.ts`
- Create: `src/client/lib/api/calls.ts`
- Create: `src/client/lib/api/conversations.ts`
- Create: `src/client/lib/api/notes.ts`
- Create: `src/client/lib/api/shifts.ts`
- Create: `src/client/lib/api/bans.ts`
- Create: `src/client/lib/api/settings.ts`
- Create: `src/client/lib/api/cms.ts`
- Create: `src/client/lib/api/contacts.ts`
- Create: `src/client/lib/api/blasts.ts`
- Create: `src/client/lib/api/hubs.ts`
- Modify: `src/client/lib/api.ts` (becomes thin barrel)

**Context:** This is a structural refactor with no type changes. `api.ts` currently has 2278 lines. Splitting it by domain reduces file size and makes navigation easier. This task can be deferred until after Phases A-F are complete and all tests pass. All components importing from `@/lib/api` continue to work because `api.ts` becomes a barrel re-exporting everything from `api/`.

- [ ] Create `src/client/lib/api/request.ts` — move: `request()`, `getAuthHeaders()`, `getAuthHeadersForReplay()`, `setOnAuthExpired()`, `setOnApiActivity()`, `ApiError`, `NetworkError`, `OfflineQueuedError`, `isNetworkError()`, `hp()`, `setActiveHub()`, `getActiveHub()`, constants.
- [ ] Create `src/client/lib/api/volunteers.ts` — move: volunteer API functions and `Volunteer` type re-export.
- [ ] Create `src/client/lib/api/calls.ts` — move: call API functions, `ActiveCall`/`CallRecord` type re-exports.
- [ ] Create `src/client/lib/api/conversations.ts` — move: conversation/message API functions and type re-exports.
- [ ] Create `src/client/lib/api/notes.ts` — move: note API functions, `EncryptedNote` re-export.
- [ ] Create `src/client/lib/api/shifts.ts` — move: shift API functions, `Shift`/`ShiftStatus` re-exports.
- [ ] Create `src/client/lib/api/bans.ts` — move: ban API functions, `BanEntry` re-export.
- [ ] Create `src/client/lib/api/settings.ts` — move: all settings API functions and settings type re-exports.
- [ ] Create `src/client/lib/api/cms.ts` — move: CMS entity type, record, report type, template API functions and type re-exports.
- [ ] Create `src/client/lib/api/contacts.ts` — move: contact directory, evidence API functions and type re-exports.
- [ ] Create `src/client/lib/api/blasts.ts` — move: blast/subscriber API functions and type re-exports.
- [ ] Create `src/client/lib/api/hubs.ts` — move: hub API functions and `Hub` re-export.
- [ ] Rewrite `src/client/lib/api.ts` as a thin barrel:
  ```typescript
  // Backward-compat barrel — all consumers import from here unchanged
  export * from './api/request'
  export * from './api/volunteers'
  export * from './api/calls'
  // ... etc
  ```
- [ ] Run `bun run typecheck` and `bun run test` — must pass clean.
- [ ] Commit: `git commit -m "refactor(api): split api.ts into domain modules, api.ts becomes backward-compat barrel"`

---

## Verification Checklist

After all phases complete, verify the spec's success criteria:

- [ ] `bun run typecheck` passes
- [ ] `bun run test` (Playwright E2E) passes
- [ ] `bun run codegen` succeeds (Swift and Kotlin only)
- [ ] Zero `& { }` type extensions in `src/client/lib/api.ts` — `grep "z\.infer.*&" src/client/lib/api.ts` returns nothing
- [ ] Zero standalone `export interface` (non-class) in `src/client/lib/api.ts`
- [ ] `apps/worker/types.ts` deleted — `ls apps/worker/types.ts` returns not found
- [ ] `apps/worker/types/infra.ts` exists with only worker-internal types
- [ ] `@shared/types` has no entity duplicates with schema counterparts
- [ ] Schema registry auto-discovers from barrel
- [ ] `packages/protocol/generated/typescript/` does not contain `types.ts`
- [ ] Adding a new API response field requires changing exactly 1 file (the schema)
