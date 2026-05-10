# Implementation Plan: Phase 7 Hub Self-Service Provider Auto-Configuration

## Overview

This plan breaks Phase 7 into ordered tasks with dependencies. Backend tasks come first, then frontend. Independent tasks within a phase can be dispatched to parallel workers.

Key architectural decisions reflected in this plan:
- **Security prerequisite**: Remove global config fallback before any Phase 7 work
- **Separate entry points**: Hub onboarding wizard is distinct from platform setup wizard (reuses sub-components, not `StepProviders.tsx`)
- **Provider templates are NEW**: Stored in `provider_templates` DB table — unrelated to existing CMS entity templates in `packages/protocol/templates/`
- **CMS template extension**: Existing CaseManagementTemplates get optional provider config fields
- **Channel mix-and-match**: Any combination of telephony, Signal, WhatsApp, Telegram, RCS
- **Sub-account provisioning**: Optional auto-provisioning when master provider is configured (all 8 providers support some form; Bandwidth capped at 50, Telnyx requires qualification)
- **One provider per hub**: `upsertProviderConfig` enforces single provider per hub — switching providers deletes old config first
- **Zero-knowledge super-admin**: Cannot see hub credentials or content
- **hubRoles is JSONB on users table**: NOT a join table — roles stored as JSONB array per user
- **Mobile screens are NEW**: iOS and Android have no hub-specific provider management UI yet — all screens scaffolded from scratch
- **Full test coverage**: Backend unit + security BDD + backend BDD + Desktop E2E + iOS XCUITest + Android Compose/Cucumber + isolation suite

## i18n Rule (APPLIES TO EVERY FRONTEND TASK)

> **ALL i18n strings MUST be added to `packages/i18n/locales/en.json` first, then propagated to all 12 other locale files, then generated via `bun run i18n:codegen`. NEVER add strings directly to platform-specific files (iOS `.strings`, Android `strings.xml`, desktop source). Run `bun run i18n:validate:all` before pushing.**

This rule applies to Task 11, Task 12, Task 13, Task 14, Task 15, Task 16, Task 17, and Task 18.

---

## Task 0: Security Prerequisite — Remove Global Config Fallback

**Complexity**: S  
**Dependencies**: None — MUST be completed before any other Phase 7 task  
**Parallelizable with**: Nothing — this is a prerequisite

### Problem

`getProviderConfigRow()` in `apps/worker/services/provider-setup/index.ts` falls back to global config (`hubId IS NULL`) when no hub-specific config exists. This breaks hub isolation: a hub without its own provider config would silently inherit the platform-level config, allowing calls to route through another entity's credentials.

### Files to Modify
- `apps/worker/services/provider-setup/index.ts` — remove `hubId IS NULL` fallback from `getProviderConfigRow()`; add runtime assertion that `hubId` is non-null
- Any callers of `getProviderConfigRow()` that assume a config always exists — update to handle `null` return (show onboarding wizard instead)
- `apps/worker/tests/` — add regression test: query with valid `hubId` but no config returns `null`, NOT the global config

### Acceptance Criteria
- `getProviderConfigRow(hubId)` returns `null` when no hub-specific config exists (no fallback)
- Runtime assertion: calling `getProviderConfigRow(null)` or `getProviderConfigRow(undefined)` throws
- All existing tests still pass (update any that relied on fallback behavior)
- Regression test: create global config + hub without config → hub query returns `null`

---

## Task 1: New Permission — `system:create-hub`

**Complexity**: XS  
**Dependencies**: Task 0  
**Parallelizable with**: Task 2, Task 3

### Files to Modify
- `packages/shared/permissions.ts` — add `system:create-hub` to `PERMISSION_CATALOG`

### Acceptance Criteria
- `system:create-hub` permission exists in catalog with description "Create new hubs (self-serve hub creation)"
- NOT included in any default role (super-admin grants explicitly)
- `isValidPermission('system:create-hub')` returns `true`
- `bun run codegen` succeeds (permission type updates propagate)

---

## Task 2: Extend CaseManagementTemplate Schema with Provider Fields

**Complexity**: S  
**Dependencies**: Task 0  
**Parallelizable with**: Task 1, Task 3

### Context

The existing templates in `packages/protocol/templates/` are **CMS entity templates** (entity types, custom fields, relationships). This task adds optional provider configuration fields to the CMS template schema. This is a schema extension — the templates remain CMS templates that now can also suggest communication channel defaults.

### Files to Create/Modify
- `packages/protocol/schemas/case-management-template.ts` — add `defaultChannels`, `recommendedProvider`, `providerDefaults`, `allowSubAccounts`, `channelGuidance` fields to template Zod schema
- `packages/protocol/tools/schema-registry.ts` — ensure updated schema is registered
- `packages/protocol/templates/general-hotline.json` — add `defaultChannels: ["voice", "sms"]`, `recommendedProvider: "twilio"`, `providerDefaults: { a2pRequired: true }`
- `packages/protocol/templates/ice-rapid-response.json` — add `defaultChannels: ["voice", "sms", "signal"]`, `channelGuidance` text

### Acceptance Criteria
- Template JSON schema accepts new optional provider fields
- At least 2 existing CMS templates updated with sensible defaults
- `bun run codegen` generates updated Swift/Kotlin types with new fields
- Existing template loading does not break (all new fields are optional)

---

## Task 3: Provider Templates DB Schema & Migration + Hub Onboarding State

**Complexity**: S  
**Dependencies**: Task 0  
**Parallelizable with**: Task 1, Task 2

### Context

The `provider_templates` table is a completely new concept — super-admin-managed provider configuration templates. These are NOT related to the CMS entity templates in `packages/protocol/templates/`. They are stored in the database and managed via API.

### Files to Create/Modify
- `apps/worker/db/schema/provider-setup.ts` — add `providerTemplates` and `hubOnboardingState` table definitions
- `apps/worker/db/migrations/XXXX_provider_templates_and_onboarding.sql` — migration file

### Acceptance Criteria
- `provider_templates` table: id, name, slug (unique), description, provider_type, default_channels (text[]), credential_hints (JSONB), recommended_settings (JSONB), allow_sub_accounts (boolean), is_active, created_by, created_at, updated_at
- `hub_onboarding_state` table: hub_id (PK, FK to hubs), template_id, current_step, completed_steps (text[]), channel_config (JSONB), is_complete, created_at, updated_at
- Migration runs cleanly against existing DB
- Schema exports both new tables

---

## Task 4: Hub Quotas & Usage — Settings Extension

**Complexity**: S  
**Dependencies**: Task 0  
**Parallelizable with**: Task 1, Task 2, Task 3

### Files to Create/Modify
- `packages/protocol/schemas/provider-setup.ts` — add `hubProviderSettingsSchema`, `hubQuotasSchema`, `hubUsageSchema`, `channelConfigSchema` Zod schemas
- `packages/protocol/tools/schema-registry.ts` — register new schemas
- `apps/worker/services/settings.ts` — add `getHubProviderSettings()`, `updateHubQuotas()`, `updateHubUsage()` methods

### Acceptance Criteria
- Zod schemas defined for hub provider settings (quotas, usage, enabled channels, sub-account mode)
- SettingsService can read/write quota, usage, and channel data from `hubSettings.settings` JSONB
- `bun run codegen` generates Swift/Kotlin types
- Unit tests for settings read/write

---

## Task 5: Provider Template Service

**Complexity**: M  
**Dependencies**: Task 3  
**Parallelizable with**: Task 4

### Files to Create/Modify
- `apps/worker/services/provider-setup/templates.ts` — new `ProviderTemplateService` class
- `apps/worker/services/index.ts` — register template service in service container

### Acceptance Criteria
- CRUD operations: `createTemplate`, `updateTemplate`, `deactivateTemplate`, `listTemplates`, `getTemplate`
- `listTemplates` only returns active templates
- Validates slug uniqueness
- `credential_hints` validated to not contain actual secrets (no values longer than 100 chars, no base64-encoded strings)
- Unit tests for all CRUD operations

---

## Task 5a: Backend Unit Tests — Provider Template Service

**Complexity**: S  
**Dependencies**: Task 5  
**Parallelizable with**: Task 6

### Files to Create
- `apps/worker/__tests__/unit/provider-template-service.test.ts`

### Test Cases (using `createMockDb()` + `vitest`)
- CRUD operations: create template, read by id, update fields, deactivate
- `instantiateTemplate` applies defaults correctly to hub config
- Slug uniqueness validation — duplicate slug rejected
- Active-only filter on `listTemplates` — deactivated templates excluded
- `credential_hints` secret detection — rejects values that look like real credentials

### Acceptance Criteria
- All tests pass via `bun run test`
- Tests follow existing `createMockDb()` pattern

---

## Task 6: Hub Onboarding Service

**Complexity**: L  
**Dependencies**: Task 3, Task 4, Task 5  
**Parallelizable with**: Task 7

### Context

The `upsertProviderConfig` queries by `hubId` alone (not `(hubId, providerType)`), enforcing a single telephony provider per hub. Template instantiation must handle provider switching by deleting old config first, then creating new config.

### Files to Create/Modify
- `apps/worker/services/provider-setup/hub-onboard.ts` — new `HubOnboardService` class
- `apps/worker/services/provider-setup/index.ts` — integrate onboard service

### Acceptance Criteria
- `startOnboarding(hubId, templateId?)` — creates `hub_onboarding_state` row, optionally applies template (creates roles via existing `/roles/from-template` logic, sets default channels)
- `getOnboardingStatus(hubId)` — returns current step, completed steps, channel config
- `completeStep(hubId, step, data)` — advances onboarding state, validates step progression
- `getHubSetupStatus(hubId)` — returns composite status: provider connected? numbers provisioned? channels configured? which channels pending?
- `completeOnboarding(hubId)` — marks hub as setup-complete in hubSettings, sets `providerSetupComplete: true`
- `getHubUsage(hubId)` — returns current month usage from hubSettings JSONB
- `checkQuota(hubId, resource)` — returns whether hub can provision more (numbers, SMS, etc.)
- Quota check integrated into `ProviderSetup.provisionNumber()` — rejects if over limit
- `enableChannel(hubId, channel)` / `disableChannel(hubId, channel)` — toggle channels in hub config
- `switchProvider(hubId, newProviderType)` — deletes old provider config, creates new one (handles single-provider-per-hub constraint)
- Sub-account provisioning: `provisionSubAccount(hubId, masterConfigId)` — creates sub-account via provider API, stores sub-account credentials per-hub
- Unit tests for all methods, especially quota checking and step progression

---

## Task 6a: Backend Unit Tests — Hub Onboarding Service

**Complexity**: S  
**Dependencies**: Task 6  
**Parallelizable with**: Task 7

### Files to Create
- `apps/worker/__tests__/unit/hub-onboard-service.test.ts`

### Test Cases (using `createMockDb()` + `vitest`)
- `getHubSetupStatus` returns correct composite status for various states
- `completeOnboarding` sets `providerSetupComplete: true` in hubSettings
- `getHubUsage` returns current month aggregate counts
- `checkQuota` blocks provisioning when at limit, allows when under
- Step progression: cannot skip steps, cannot go backwards
- Channel enable/disable toggles config correctly
- `switchProvider` deletes old config before creating new
- Template instantiation: roles created, channels pre-set, provider type recommended

### Acceptance Criteria
- All tests pass via `bun run test`
- Tests follow existing `createMockDb()` pattern

---

## Task 7: Hub Self-Service API Routes

**Complexity**: L  
**Dependencies**: Task 5, Task 6  
**Parallelizable with**: (blocked — needs Task 5 + 6)

### Route Mounting

Hub-specific routes MUST be mounted under the existing hub-scoped prefix (`/api/hubs/:hubId/...`), consistent with how provider-setup routes are already mounted at `/api/hubs/:hubId/provider-setup/*`. Provider template routes are global (`/api/provider-templates`) since templates are platform-wide resources.

### Files to Create/Modify
- `apps/worker/routes/provider-templates.ts` — new route file for template CRUD (global mounting)
- `apps/worker/routes/hub-onboard.ts` — new route file for hub onboarding + status + usage + quotas + channels + sub-account (hub-scoped mounting)
- `apps/worker/routes/hubs.ts` — modify to accept `system:create-hub` as alternative permission for `POST /api/hubs`
- `apps/worker/index.ts` — register new route files

### Acceptance Criteria

**Provider Templates (global routes):**
- `GET /api/provider-templates` — list active templates (requires `telephony:view-providers`)
- `GET /api/provider-templates/:id` — get template detail
- `POST /api/provider-templates` — create (requires `system:manage-instance`)
- `PUT /api/provider-templates/:id` — update (requires `system:manage-instance`)
- `DELETE /api/provider-templates/:id` — deactivate (requires `system:manage-instance`)

**Hub Onboarding (hub-scoped routes):**
- `POST /api/hubs/:hubId/onboard` — start/resume onboarding (requires `hubs:configure`)
- `GET /api/hubs/:hubId/onboard/status` — get onboarding progress (requires `telephony:view-providers`)
- `PUT /api/hubs/:hubId/onboard/step` — complete step (requires `hubs:configure`)
- `GET /api/hubs/:hubId/provider-status` — hub provider status (requires `telephony:view-providers`)
- `GET /api/hubs/:hubId/usage` — hub usage stats (requires `telephony:view-providers`)
- `PUT /api/hubs/:hubId/quotas` — set hub quotas (requires `system:manage-instance`)
- `PUT /api/hubs/:hubId/channels` — enable/disable channels (requires `hubs:configure`)
- `POST /api/hubs/:hubId/sub-account` — auto-provision sub-account (requires `hubs:configure`)

**Hub Creation:**
- `POST /api/hubs` accepts `system:create-hub` OR `system:manage-hubs` permission

**Cross-cutting:**
- OpenAPI descriptions via `describeRoute` on all routes
- Rate limiting: template creation (5/min), onboarding start (10/min)
- All hub-scoped routes validate hubId belongs to requesting user via `hasHubPermission()`
- Zero-knowledge: no route returns decrypted credentials to super-admin

---

## Task 8: Security BDD Tests — Hub Self-Service

**Complexity**: M  
**Dependencies**: Task 7  
**Parallelizable with**: Task 9, Task 10

### Files to Create
- `packages/test-specs/features/security/hub-self-service-security.feature` — Gherkin scenarios
- Corresponding step definitions

### Scenarios
- Cross-hub credential access attempt → denied (403)
- Tampered `hubId` in API request body vs. auth context → denied (403)
- Super-admin cannot read hub credentials via any API path
- OAuth state bound to `hubId` — callback with wrong hub user → denied
- Template `credential_hints` contains no real secrets (validation rejects suspicious values)
- Sub-account provisioning does not expose master credentials in response

### Acceptance Criteria
- All security scenarios pass against local backend
- No false positives — legitimate hub admin access still works

---

## Task 9: Backend BDD Tests — Hub Onboarding & Templates

**Complexity**: M  
**Dependencies**: Task 7  
**Parallelizable with**: Task 8, Task 10

### Files to Create/Modify
- `apps/worker/tests/features/hub-onboarding.feature` — Gherkin scenarios for onboarding flow
- `apps/worker/tests/steps/hub-onboarding.steps.ts` — step definitions
- `apps/worker/tests/features/provider-templates.feature` — Gherkin scenarios for template CRUD
- `apps/worker/tests/steps/provider-templates.steps.ts` — step definitions
- `apps/worker/tests/features/hub-channels.feature` — Gherkin scenarios for channel configuration

### Scenarios

**Hub Onboarding:**
- Hub admin starts onboarding with template → roles created, channels pre-selected, provider config created with correct hubId
- Hub admin starts onboarding "from scratch" → no roles auto-created, manual channel selection
- Hub admin completes all onboarding steps → hub marked as providerSetupComplete
- Hub admin enables/disables channels independently after onboarding
- User with `system:create-hub` creates own hub → becomes hub admin → runs onboarding
- User without `system:create-hub` cannot create hubs → 403
- Sub-account auto-provisioning when master provider configured
- Hub admin rotates credentials
- Hub admin switches provider (old config deleted, new created)

**Provider Templates:**
- Super-admin CRUD on provider templates → create, list, update, deactivate (full lifecycle)
- Super-admin sets hub quotas → hub admin sees limits
- Quota enforcement blocks phone number provisioning when limit reached
- Quota administration: set quota → enforce → exceed → blocked
- Super-admin cannot see hub credentials via any API path (zero-knowledge)

**Channel Configuration:**
- Channel mix: telephony only
- Channel mix: Signal + telephony
- Channel mix: all channels enabled
- Channel setup sub-flows complete correctly per channel type
- Usage tracking aggregate counts are correct

**Hub Lifecycle:**
- Self-service hub creation with `system:create-hub` permission
- Hub admin onboards from scratch (no template)

### Acceptance Criteria
- All scenarios pass against local backend (`bun run test:backend:bdd`)

---

## Task 10: Backend BDD Tests — Multi-Hub Isolation

**Complexity**: M  
**Dependencies**: Task 7  
**Parallelizable with**: Task 8, Task 9

### Files to Create/Modify
- `apps/worker/tests/features/hub-isolation.feature` — Gherkin scenarios
- `apps/worker/tests/steps/hub-isolation.steps.ts` — step definitions

### Scenarios
- Hub A admin configures provider → Hub B admin cannot see Hub A's config (GET returns empty/403)
- Hub A admin provisions number → does not appear in Hub B's number list
- Hub A admin enables Signal → Hub B's channel config unaffected
- Hub A admin's usage stats do not include Hub B's activity
- Hub admin with `telephony:manage-providers` but no `system:manage-instance` cannot create templates
- Tampered hubId in request → 403 (middleware rejects cross-hub access)
- Hub deactivation does not affect other hubs' configs
- Super-admin aggregate view shows both hubs' operational status but no credentials
- 2+ hubs created in test setup, complete data separation verified

### Acceptance Criteria
- All scenarios pass against local backend

---

## Task 11: Desktop — Hub Onboarding Wizard

**Complexity**: L  
**Dependencies**: Task 7 (API must be available)  
**Parallelizable with**: Task 12, Task 13

**i18n**: ALL strings via `packages/i18n/locales/en.json` → codegen. No direct string literals.

### Files to Create/Modify
- `src/client/routes/hub.$hubId.settings.communications.tsx` — new TanStack Router route
- `src/client/components/hub-settings/HubOnboardingWizard.tsx` — wizard container (7 steps, separate from SetupWizard — does NOT reuse `StepProviders.tsx`)
- `src/client/components/hub-settings/ProviderTemplateCard.tsx` — template selection card
- `src/client/components/hub-settings/ChannelChecklist.tsx` — channel enable/disable checklist with toggle switches
- `src/client/components/hub-settings/ChannelSetupFlow.tsx` — per-channel sub-flow orchestration
- `src/client/components/hub-settings/HubProviderSettings.tsx` — ongoing management panel
- `src/client/components/hub-settings/HubUsageCard.tsx` — usage display
- `src/client/lib/api/hub-onboard.ts` — API client functions for new endpoints

### Acceptance Criteria
- Onboarding wizard renders when hub has no provider configured (`providerSetupComplete: false`)
- Settings panel renders when hub IS configured (`providerSetupComplete: true`)
- Template selection step shows available templates as cards + "Start from scratch"
- Channel checklist: toggleable, pre-checked from template
- Provider connection step reuses `OAuthConnectButton` / `VoiceSmsProviderForm` sub-components (NOT `StepProviders.tsx`)
- Phone number step reuses `PhoneNumberSelector` sub-component
- Channel setup sub-flows reuse `SignalRegistrationFlow`, `WhatsAppProviderForm`, etc.
- Completion marks hub as setup-complete, transitions to settings panel
- Settings panel shows: provider status, phone numbers, channel toggles, A2P status, usage
- All interactions gated by user's hub permissions
- All strings added to `packages/i18n/locales/en.json` + 12 other locales
- `bun run i18n:validate:desktop` passes

---

## Task 12: iOS — Hub Self-Service Screens

**Complexity**: L  
**Dependencies**: Task 7 (API must be available)  
**Parallelizable with**: Task 11, Task 13

**i18n**: ALL strings via `packages/i18n` codegen → `.strings` files. No direct string literals in Swift.

### Context

**No hub-specific provider management UI exists in iOS yet.** All screens are new — this is not extending existing Phase 6 provider setup screens. Phase 6 provider setup is platform-level; this is hub-scoped.

### Files to Create/Modify
- `apps/ios/Sources/Views/HubSettings/HubCommunicationsView.swift` — main settings view
- `apps/ios/Sources/Views/HubSettings/HubOnboardingSheet.swift` — onboarding wizard sheet (7 steps)
- `apps/ios/Sources/Views/HubSettings/ProviderTemplateListView.swift` — template picker
- `apps/ios/Sources/Views/HubSettings/ChannelChecklistView.swift` — channel toggles
- `apps/ios/Sources/Views/HubSettings/HubUsageView.swift` — usage display
- `apps/ios/Sources/ViewModels/HubCommunicationsViewModel.swift` — VM with API calls
- `apps/ios/Sources/Services/HubOnboardAPI.swift` — API client for new endpoints

### Acceptance Criteria
- Hub communications settings accessible from hub settings navigation
- Onboarding sheet presented when no provider configured
- Template list fetched from API, selectable, shows channel defaults
- Channel checklist with SwiftUI toggles
- Provider connection via ASWebAuthenticationSession (OAuth) or form
- Phone number provisioning integrated
- Usage display shows current month stats vs. quota
- Permission-gated UI elements (hide settings for non-admins)
- All strings via `packages/i18n` codegen
- `bun run i18n:validate:ios` passes

---

## Task 13: Android — Hub Self-Service Screens

**Complexity**: L  
**Dependencies**: Task 7 (API must be available)  
**Parallelizable with**: Task 11, Task 12

**i18n**: ALL strings via `packages/i18n` codegen → `strings.xml` + `I18n.kt`. No direct string literals in Kotlin.

### Context

**No hub-specific provider management UI exists in Android yet.** All screens are new — this is not extending existing Phase 6 provider setup screens. Phase 6 provider setup is platform-level; this is hub-scoped.

### Files to Create/Modify
- `apps/android/app/src/main/kotlin/org/llamenos/ui/hubsettings/HubCommunicationsScreen.kt` — Compose screen
- `apps/android/app/src/main/kotlin/org/llamenos/ui/hubsettings/HubOnboardingFlow.kt` — onboarding BottomSheet
- `apps/android/app/src/main/kotlin/org/llamenos/ui/hubsettings/ProviderTemplateList.kt` — template picker
- `apps/android/app/src/main/kotlin/org/llamenos/ui/hubsettings/ChannelChecklist.kt` — channel switches
- `apps/android/app/src/main/kotlin/org/llamenos/ui/hubsettings/HubUsageCard.kt` — usage display
- `apps/android/app/src/main/kotlin/org/llamenos/viewmodel/HubCommunicationsViewModel.kt` — VM
- `apps/android/app/src/main/kotlin/org/llamenos/api/HubOnboardApi.kt` — API client

### Acceptance Criteria
- Hub communications settings accessible from hub settings navigation
- Onboarding BottomSheet flow when no provider configured
- Template list as Material 3 cards with channel defaults shown
- Channel switches (Material 3 Switch composables)
- Provider connection via Chrome Custom Tabs (OAuth) or form
- Phone number provisioning integrated
- Usage display with current month stats vs. quota
- Permission-gated composables
- All strings via `packages/i18n` codegen
- `bun run i18n:validate:android` passes

---

## Task 14: Desktop E2E Tests (Playwright)

**Complexity**: M  
**Dependencies**: Task 11  
**Parallelizable with**: Task 15, Task 16

### Files to Create/Modify
- `tests/hub-onboarding.spec.ts` — Playwright E2E for hub onboarding wizard (all 7 steps)
- `tests/hub-settings.spec.ts` — Playwright E2E for hub settings panel
- `tests/hub-multi-hub.spec.ts` — Playwright E2E for multi-hub navigation

### Scenarios

**Wizard Steps (each step tested individually):**
- Step 1 (Welcome): renders correctly for unconfigured hub
- Step 2 (Template): template cards load, selection works, "from scratch" works
- Step 3 (Template Application): roles created, channels pre-selected
- Step 4 (Phone Number): provider connection, number search/selection
- Step 5 (Channel Checklist): toggles work, pre-checked from template
- Step 6 (Channel Setup): sub-flows render per enabled channel
- Step 7 (Summary): shows configured vs. pending, completion CTA

**Hub Settings Panel:**
- View provider status card with connection info
- Modify channels (enable/disable from settings)
- View usage stats and quota

**Multi-Hub Navigation:**
- Navigate between hubs with different provider configs
- Each hub shows its own provider status, channels, usage
- No cross-hub data leakage in UI

**Permission:**
- Non-admin user cannot access hub communications settings (permission gate)

### Acceptance Criteria
- Tests pass with Tauri IPC mocks (`PLAYWRIGHT_TEST=true`)
- Each wizard step has at least one dedicated test

---

## Task 15: iOS UI Tests (XCUITest)

**Complexity**: M  
**Dependencies**: Task 12  
**Parallelizable with**: Task 14, Task 16

### Files to Create/Modify
- `apps/ios/Tests/XCUITests/HubCommunicationsUITests.swift`

### Scenarios
- Hub settings shows communications section
- Onboarding sheet appears for unconfigured hub
- Template selection updates UI and pre-selects channels
- Channel checklist toggles work correctly
- **OAuth connection via ASWebAuthenticationSession** — flow initiates correctly
- **Channel enable/disable toggles** — each channel independently toggleable
- **Settings panel interactions** — view status, modify channels, view usage
- Provider form renders and accepts input
- Settings screen shows provider status after setup
- Non-admin user does not see communications settings

### Acceptance Criteria
- All tests pass on iOS simulator

---

## Task 16: Android UI Tests (Compose + Cucumber BDD E2E)

**Complexity**: M  
**Dependencies**: Task 13  
**Parallelizable with**: Task 14, Task 15

### Files to Create/Modify
- `apps/android/app/src/androidTest/kotlin/org/llamenos/ui/HubCommunicationsTest.kt` — Compose UI tests
- `apps/android/app/src/androidTest/assets/features/hub-self-service.feature` — Cucumber BDD feature file
- `apps/android/app/src/androidTest/kotlin/org/llamenos/e2e/steps/hubs/HubSelfServiceSteps.kt` — Cucumber steps

### Scenarios

**Compose UI tests:**
- Hub settings shows communications section
- Onboarding BottomSheet flow renders for unconfigured hub
- Template selection card interactions
- Channel switch toggles work
- Provider form field validation
- Settings screen provider status display

**Cucumber BDD E2E:**
- Full onboarding E2E flow (template selection → provider → number → channels → complete)
- Channel enable/disable round-trip
- Settings panel after onboarding complete shows all configured channels
- Settings management E2E (view status, modify channels, view usage)

### Acceptance Criteria
- All Compose UI tests pass
- All Cucumber BDD E2E scenarios pass on emulator/device

---

## Task 17: i18n Strings for All Platforms

**Complexity**: S  
**Dependencies**: Task 11, Task 12, Task 13 (need to know all string keys)  
**Parallelizable with**: Task 14, Task 15, Task 16

### Files to Create/Modify
- `packages/i18n/locales/en.json` — add all new hub onboarding/settings strings
- `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json` — translations for 12 additional locales
- Run `bun run i18n:codegen` to generate iOS `.strings` + Android `strings.xml` + Kotlin `I18n.kt`
- Run `bun run i18n:validate:all` to verify all string refs

### Acceptance Criteria
- All new UI strings added to all 13 locales
- `bun run i18n:codegen` succeeds
- `bun run i18n:validate:all` passes (no missing refs on any platform)
- No strings added directly to platform-specific files

---

## Task 18: Integration Smoke Test

**Complexity**: S  
**Dependencies**: Task 8, Task 9, Task 10, Task 14 (all tests must pass individually first)  
**Parallelizable with**: Task 15, Task 16, Task 17

### Description
Run the full test orchestration to verify everything works together:

```bash
bun run test:all
```

### Acceptance Criteria
- `bun run test:backend:bdd` — all hub onboarding + isolation + security scenarios pass
- `bun run test:desktop` — all Playwright E2E pass
- `bun run test:ios` — all XCUITests pass
- `bun run test:android` — all Compose UI + Cucumber BDD pass
- `bun run codegen` — no regressions
- `bun run typecheck` — no type errors
- `bun run i18n:validate:all` — all string refs valid

---

## Execution Order & Parallelism

```
Phase 0:             Task 0 (SECURITY PREREQUISITE — must complete first)
Phase A (parallel):  Task 1 + Task 2 + Task 3 + Task 4
Phase B (parallel):  Task 5 + Task 5a (needs 3, 5)
Phase C:             Task 6 + Task 6a (needs 3, 4, 5)
Phase D:             Task 7 (needs 5, 6)
Phase E (parallel):  Task 8 + Task 9 + Task 10 + Task 11 + Task 12 + Task 13
Phase F (parallel):  Task 14 + Task 15 + Task 16 + Task 17
Phase G:             Task 18 (integration smoke)
```

### Critical Path

```
Task 0 → Task 3 → Task 5 → Task 6 → Task 7 → Task 11 → Task 14 → Task 18
```

### Dependency Graph

```
Task 0 ──────────────────────────────────────────────────────────────────────┐
  ├──→ Task 1 ──────────────────────────────────────────────────────────────┐│
  ├──→ Task 2 ──→ (codegen) ───────────────────────────────────────────────┐││
  ├──→ Task 3 ──→ Task 5 ──→ Task 5a                                     │││
  │                  │                                                     │││
  ├──→ Task 4 ───────┼──→ Task 6 ──→ Task 6a                             │││
  │                  │        │                                            │││
  │                  │        └──→ Task 7 ──→ Task 8 (security BDD) ──────┤││
  │                  │                  │ ╲──→ Task 9 (onboarding BDD) ───┤││
  │                  │                  │  ╲──→ Task 10 (isolation BDD) ──┤││
  │                  │                  ├──→ Task 11 (Desktop) ──→ Task 14 ┤││
  │                  │                  ├──→ Task 12 (iOS) ──→ Task 15 ────┤││
  │                  │                  └──→ Task 13 (Android) ──→ Task 16 ┤││
  │                  │                                            Task 17 ─┘││
  │                  │                                                      ││
  └──────────────────┴──────────────────────────────────────────→ Task 18 ──┘│
                                                                             │
```

## Summary

| Task | Description | Size | Depends On |
|------|-------------|------|------------|
| 0 | Security prerequisite: remove global config fallback | S | — |
| 1 | New permission: `system:create-hub` | XS | 0 |
| 2 | Extend CaseManagementTemplate schema with provider fields | S | 0 |
| 3 | Provider templates + hub onboarding state DB schema | S | 0 |
| 4 | Hub quotas & usage settings extension | S | 0 |
| 5 | Provider template service (CRUD) | M | 3 |
| 5a | Backend unit tests — provider template service | S | 5 |
| 6 | Hub onboarding service (steps, channels, sub-accounts, quotas) | L | 3, 4, 5 |
| 6a | Backend unit tests — hub onboarding service | S | 6 |
| 7 | Hub self-service API routes | L | 5, 6 |
| 8 | Security BDD — hub self-service | M | 7 |
| 9 | Backend BDD — hub onboarding & templates & channels | M | 7 |
| 10 | Backend BDD — multi-hub isolation | M | 7 |
| 11 | Desktop — hub onboarding wizard + settings panel | L | 7 |
| 12 | iOS — hub self-service screens (NEW — no existing hub settings UI) | L | 7 |
| 13 | Android — hub self-service screens (NEW — no existing hub settings UI) | L | 7 |
| 14 | Desktop E2E tests (Playwright) — all 7 steps + settings + multi-hub | M | 11 |
| 15 | iOS UI tests (XCUITest) — expanded with OAuth + channel toggles | M | 12 |
| 16 | Android UI tests (Compose + Cucumber BDD E2E) — full flow | M | 13 |
| 17 | i18n strings for all platforms (13 locales) | S | 11, 12, 13 |
| 18 | Integration smoke test | S | 8, 9, 10, 14 |

**Total**: 20 tasks (1 prerequisite + 4 XS/S + 5 S + 6 M + 4 L), maximum parallelism of 6 workers after Phase D completes.

**Key changes from previous plan revision:**
- Added Task 0 (security prerequisite: remove global config fallback) — blocks all other tasks
- Added Task 5a, 6a (dedicated backend unit test tasks for template and onboarding services)
- Added Task 8 (security BDD scenarios — cross-hub access, tampered hubId, zero-knowledge)
- Expanded Task 9 with credential rotation, provider switching, channel mix, quota administration, hub lifecycle scenarios
- Expanded Task 14 (Desktop E2E) with individual wizard step tests, hub settings panel, multi-hub navigation
- Expanded Task 15 (iOS) with OAuth ASWebAuth, channel toggles, settings panel interactions
- Expanded Task 16 (Android) with Cucumber BDD E2E in `hub-self-service.feature` + step defs in `steps/hubs/`
- Added i18n rule to every frontend task header
- Fixed template terminology: CMS templates vs. provider templates clearly distinguished
- Fixed StepProviders reusability claim: sub-components reused, not the wizard itself
- Documented single-provider-per-hub constraint and provider switching flow
- Documented hub-scoped route mounting requirement
- Documented per-provider sub-account capabilities and limitations (Bandwidth 50 cap, Telnyx qualification)
