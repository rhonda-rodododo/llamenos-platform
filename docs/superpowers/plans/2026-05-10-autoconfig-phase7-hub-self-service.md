# Implementation Plan: Phase 7 Hub Self-Service Provider Auto-Configuration

## Overview

This plan breaks Phase 7 into ordered tasks with dependencies. Backend tasks come first, then frontend. Independent tasks within a phase can be dispatched to parallel workers.

Key architectural decisions reflected in this plan:
- **Separate entry points**: Hub onboarding wizard is distinct from platform setup wizard (shared components, separate orchestration)
- **Template-driven**: Extends existing CaseManagementTemplate with provider config fields + separate super-admin provider templates
- **Channel mix-and-match**: Any combination of telephony, Signal, WhatsApp, Telegram, RCS
- **Sub-account provisioning**: Optional auto-provisioning when master provider is configured
- **Zero-knowledge super-admin**: Cannot see hub credentials or content
- **Full test coverage**: Backend BDD + Desktop E2E + iOS XCUITest + Android Compose/Cucumber + isolation suite

---

## Task 1: New Permission — `system:create-hub`

**Complexity**: XS  
**Dependencies**: None  
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
**Dependencies**: None  
**Parallelizable with**: Task 1, Task 3

### Files to Create/Modify
- `packages/protocol/schemas/case-management-template.ts` — add `defaultChannels`, `recommendedProvider`, `providerDefaults`, `allowSubAccounts`, `channelGuidance` fields to template Zod schema
- `packages/protocol/tools/schema-registry.ts` — ensure updated schema is registered
- `packages/protocol/templates/general-hotline.json` — add `defaultChannels: ["voice", "sms"]`, `recommendedProvider: "twilio"`, `providerDefaults: { a2pRequired: true }`
- `packages/protocol/templates/ice-rapid-response.json` — add `defaultChannels: ["voice", "sms", "signal"]`, `channelGuidance` text

### Acceptance Criteria
- Template JSON schema accepts new optional provider fields
- At least 2 existing templates updated with sensible defaults
- `bun run codegen` generates updated Swift/Kotlin types with new fields
- Existing template loading does not break (all new fields are optional)

---

## Task 3: Provider Templates DB Schema & Migration + Hub Onboarding State

**Complexity**: S  
**Dependencies**: None  
**Parallelizable with**: Task 1, Task 2

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
**Dependencies**: None  
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
- `credential_hints` validated to not contain actual secrets (no values longer than 50 chars, no base64-encoded strings)
- Unit tests for all CRUD operations

---

## Task 6: Hub Onboarding Service

**Complexity**: L  
**Dependencies**: Task 3, Task 4, Task 5  
**Parallelizable with**: Task 7

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
- Sub-account provisioning: `provisionSubAccount(hubId, masterConfigId)` — creates sub-account via provider API, stores sub-account credentials per-hub
- Unit tests for all methods, especially quota checking and step progression

---

## Task 7: Hub Self-Service API Routes

**Complexity**: L  
**Dependencies**: Task 5, Task 6  
**Parallelizable with**: (blocked — needs Task 5 + 6)

### Files to Create/Modify
- `apps/worker/routes/provider-templates.ts` — new route file for template CRUD
- `apps/worker/routes/hub-onboard.ts` — new route file for hub onboarding + status + usage + quotas + channels + sub-account
- `apps/worker/routes/hubs.ts` — modify to accept `system:create-hub` as alternative permission for `POST /api/hubs`
- `apps/worker/index.ts` — register new route files

### Acceptance Criteria

**Provider Templates:**
- `GET /api/provider-templates` — list active templates (requires `telephony:view-providers`)
- `GET /api/provider-templates/:id` — get template detail
- `POST /api/provider-templates` — create (requires `system:manage-instance`)
- `PUT /api/provider-templates/:id` — update (requires `system:manage-instance`)
- `DELETE /api/provider-templates/:id` — deactivate (requires `system:manage-instance`)

**Hub Onboarding:**
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
- All routes validate hubId belongs to requesting user via `hasHubPermission()`
- Zero-knowledge: no route returns decrypted credentials to super-admin

---

## Task 8: Backend BDD Tests — Hub Onboarding & Templates

**Complexity**: M  
**Dependencies**: Task 7  
**Parallelizable with**: Task 9

### Files to Create/Modify
- `apps/worker/tests/features/hub-onboarding.feature` — Gherkin scenarios for onboarding flow
- `apps/worker/tests/steps/hub-onboarding.steps.ts` — step definitions
- `apps/worker/tests/features/provider-templates.feature` — Gherkin scenarios for template CRUD
- `apps/worker/tests/steps/provider-templates.steps.ts` — step definitions

### Acceptance Criteria
- Scenario: Hub admin starts onboarding with template → roles created, channels pre-selected, provider config created with correct hubId
- Scenario: Hub admin starts onboarding "from scratch" → no roles auto-created, manual channel selection
- Scenario: Hub admin completes all onboarding steps → hub marked as providerSetupComplete
- Scenario: Hub admin enables/disables channels independently after onboarding
- Scenario: User with `system:create-hub` creates own hub → becomes hub admin → runs onboarding
- Scenario: User without `system:create-hub` cannot create hubs → 403
- Scenario: Sub-account auto-provisioning when master provider configured
- Scenario: Super-admin CRUD on provider templates → create, list, update, deactivate
- Scenario: Super-admin sets hub quotas → hub admin sees limits
- Scenario: Quota enforcement blocks phone number provisioning when limit reached
- Scenario: Super-admin cannot see hub credentials via any API path (zero-knowledge)
- All scenarios pass against local backend (`bun run test:backend:bdd`)

---

## Task 9: Backend BDD Tests — Multi-Hub Isolation

**Complexity**: M  
**Dependencies**: Task 7  
**Parallelizable with**: Task 8

### Files to Create/Modify
- `apps/worker/tests/features/hub-isolation.feature` — Gherkin scenarios
- `apps/worker/tests/steps/hub-isolation.steps.ts` — step definitions

### Acceptance Criteria
- Scenario: Hub A admin configures provider → Hub B admin cannot see Hub A's config (GET returns empty/403)
- Scenario: Hub A admin provisions number → does not appear in Hub B's number list
- Scenario: Hub A admin enables Signal → Hub B's channel config unaffected
- Scenario: Hub A admin's usage stats do not include Hub B's activity
- Scenario: Hub admin with `telephony:manage-providers` but no `system:manage-instance` cannot create templates
- Scenario: Tampered hubId in request → 403 (middleware rejects cross-hub access)
- Scenario: Hub deactivation does not affect other hubs' configs
- Scenario: Super-admin aggregate view shows both hubs' operational status but no credentials
- 2+ hubs created in test setup, complete data separation verified
- All scenarios pass against local backend

---

## Task 10: Desktop — Hub Onboarding Wizard

**Complexity**: L  
**Dependencies**: Task 7 (API must be available)  
**Parallelizable with**: Task 11, Task 12

### Files to Create/Modify
- `src/client/routes/hub.$hubId.settings.communications.tsx` — new TanStack Router route
- `src/client/components/hub-settings/HubOnboardingWizard.tsx` — wizard container (7 steps, separate from SetupWizard)
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
- Provider connection step reuses `OAuthConnectButton` / `VoiceSmsProviderForm` (shared components)
- Phone number step reuses `PhoneNumberSelector` (shared component)
- Channel setup sub-flows reuse `SignalRegistrationFlow`, `WhatsAppProviderForm`, etc.
- Completion marks hub as setup-complete, transitions to settings panel
- Settings panel shows: provider status, phone numbers, channel toggles, A2P status, usage
- All interactions gated by user's hub permissions
- i18n keys added for all new strings (13 locales)

---

## Task 11: iOS — Hub Self-Service Screens

**Complexity**: L  
**Dependencies**: Task 7 (API must be available)  
**Parallelizable with**: Task 10, Task 12

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
- i18n strings via codegen

---

## Task 12: Android — Hub Self-Service Screens

**Complexity**: L  
**Dependencies**: Task 7 (API must be available)  
**Parallelizable with**: Task 10, Task 11

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
- i18n strings via codegen

---

## Task 13: Desktop E2E Tests (Playwright)

**Complexity**: M  
**Dependencies**: Task 10  
**Parallelizable with**: Task 14, Task 15

### Files to Create/Modify
- `tests/hub-onboarding.spec.ts` — Playwright E2E for hub onboarding wizard
- `tests/hub-settings.spec.ts` — Playwright E2E for hub settings panel

### Acceptance Criteria
- Test: Hub admin navigates to hub settings → sees onboarding wizard (unconfigured hub)
- Test: Selects template → template details shown, channels pre-selected
- Test: "Start from scratch" → no template applied, manual channel selection
- Test: Proceeds through all wizard steps → hub marked as configured
- Test: After setup, settings panel shows provider status, numbers, channels, usage
- Test: Channel toggle from settings panel → API call, UI updates
- Test: Non-admin user cannot access hub communications settings (permission gate)
- Test: Quota display shows correct limits when set
- Tests pass with Tauri IPC mocks (`PLAYWRIGHT_TEST=true`)

---

## Task 14: iOS UI Tests (XCUITest)

**Complexity**: M  
**Dependencies**: Task 11  
**Parallelizable with**: Task 13, Task 15

### Files to Create/Modify
- `apps/ios/Tests/XCUITests/HubCommunicationsUITests.swift`

### Acceptance Criteria
- Test: Hub settings shows communications section
- Test: Onboarding sheet appears for unconfigured hub
- Test: Template selection updates UI and pre-selects channels
- Test: Channel checklist toggles work correctly
- Test: Provider form renders and accepts input
- Test: Settings screen shows provider status after setup
- Test: Non-admin user does not see communications settings

---

## Task 15: Android UI Tests (Compose + Cucumber BDD E2E)

**Complexity**: M  
**Dependencies**: Task 12  
**Parallelizable with**: Task 13, Task 14

### Files to Create/Modify
- `apps/android/app/src/androidTest/kotlin/org/llamenos/ui/HubCommunicationsTest.kt` — Compose UI tests
- `apps/android/app/src/androidTest/kotlin/org/llamenos/e2e/features/hub_onboarding.feature` — Cucumber feature
- `apps/android/app/src/androidTest/kotlin/org/llamenos/e2e/steps/HubOnboardingSteps.kt` — Cucumber steps

### Acceptance Criteria
**Compose UI tests:**
- Test: Hub settings shows communications section
- Test: Onboarding BottomSheet flow renders for unconfigured hub
- Test: Template selection card interactions
- Test: Channel switch toggles work
- Test: Provider form field validation
- Test: Settings screen provider status display

**Cucumber BDD E2E:**
- Scenario: Full onboarding flow with template selection → provider connected, channels configured
- Scenario: Channel enable/disable round-trip
- Scenario: Settings panel after onboarding complete shows all configured channels

---

## Task 16: i18n Strings for All Platforms

**Complexity**: S  
**Dependencies**: Task 10, Task 11, Task 12 (need to know all string keys)  
**Parallelizable with**: Task 13, Task 14, Task 15

### Files to Create/Modify
- `packages/i18n/locales/en.json` — add all new hub onboarding/settings strings
- `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json` — translations for 12 additional locales
- Run `bun run i18n:codegen` to generate iOS `.strings` + Android `strings.xml` + Kotlin `I18n.kt`
- Run `bun run i18n:validate:all` to verify all string refs

### Acceptance Criteria
- All new UI strings added to all 13 locales
- `bun run i18n:codegen` succeeds
- `bun run i18n:validate:all` passes (no missing refs on any platform)

---

## Task 17: Integration Smoke Test

**Complexity**: S  
**Dependencies**: Task 8, Task 9, Task 13 (all tests must pass individually first)  
**Parallelizable with**: Task 14, Task 15, Task 16

### Description
Run the full test orchestration to verify everything works together:

```bash
bun run test:all
```

### Acceptance Criteria
- `bun run test:backend:bdd` — all hub onboarding + isolation scenarios pass
- `bun run test:desktop` — all Playwright E2E pass
- `bun run test:ios` — all XCUITests pass
- `bun run test:android` — all Compose UI + Cucumber BDD pass
- `bun run codegen` — no regressions
- `bun run typecheck` — no type errors
- `bun run i18n:validate:all` — all string refs valid

---

## Execution Order & Parallelism

```
Phase A (parallel):  Task 1 + Task 2 + Task 3 + Task 4
Phase B (parallel):  Task 5 (needs 3) + Task 4 (if not done)
Phase C:             Task 6 (needs 3, 4, 5)
Phase D:             Task 7 (needs 5, 6)
Phase E (parallel):  Task 8 + Task 9 + Task 10 + Task 11 + Task 12
Phase F (parallel):  Task 13 + Task 14 + Task 15 + Task 16
Phase G:             Task 17 (integration smoke)
```

### Critical Path

```
Task 3 → Task 5 → Task 6 → Task 7 → Task 10 → Task 13 → Task 17
```

### Dependency Graph

```
Task 1 ─────────────────────────────────────────────────┐
Task 2 ──→ (codegen) ──────────────────────────────────┐│
Task 3 ──→ Task 5 ──┐                                 ││
Task 4 ──────────────┼──→ Task 6 ──→ Task 7 ──→ Task 8 ─┼─→ Task 17
                     │                    │    ╲──→ Task 9 ─┤
                     │                    ├──→ Task 10 ──→ Task 13 ─┤
                     │                    ├──→ Task 11 ──→ Task 14 ─┤
                     │                    └──→ Task 12 ──→ Task 15 ─┤
                     │                                     Task 16 ─┘
```

## Summary

| Task | Description | Size | Depends On |
|------|-------------|------|------------|
| 1 | New permission: `system:create-hub` | XS | — |
| 2 | Extend CaseManagementTemplate schema with provider fields | S | — |
| 3 | Provider templates + hub onboarding state DB schema | S | — |
| 4 | Hub quotas & usage settings extension | S | — |
| 5 | Provider template service (CRUD) | M | 3 |
| 6 | Hub onboarding service (steps, channels, sub-accounts, quotas) | L | 3, 4, 5 |
| 7 | Hub self-service API routes | L | 5, 6 |
| 8 | Backend BDD — hub onboarding & templates | M | 7 |
| 9 | Backend BDD — multi-hub isolation | M | 7 |
| 10 | Desktop — hub onboarding wizard + settings panel | L | 7 |
| 11 | iOS — hub self-service screens | L | 7 |
| 12 | Android — hub self-service screens | L | 7 |
| 13 | Desktop E2E tests (Playwright) | M | 10 |
| 14 | iOS UI tests (XCUITest) | M | 11 |
| 15 | Android UI tests (Compose + Cucumber BDD) | M | 12 |
| 16 | i18n strings for all platforms (13 locales) | S | 10, 11, 12 |
| 17 | Integration smoke test | S | 8, 9, 13 |

**Total**: 2XS/S + 4S + 5M + 4L + 1S + 1S = 17 tasks, maximum parallelism of 5 workers after Phase D completes.

**Key differences from v1 plan:**
- Added Task 1 (new permission), Task 2 (template extension), Task 16 (i18n), Task 17 (integration smoke)
- Split Task 6 (hub onboarding service) to include channel mix-and-match and sub-account logic
- Split Task 7 into separate route files (provider-templates.ts, hub-onboard.ts)
- Split BDD tests into two tasks (Task 8: onboarding/templates, Task 9: isolation)
- Expanded iOS tests (Task 14) and Android tests (Task 15) with more comprehensive scenarios
- Added Cucumber BDD E2E for Android alongside Compose UI tests
- Added explicit i18n task covering all 13 locales
