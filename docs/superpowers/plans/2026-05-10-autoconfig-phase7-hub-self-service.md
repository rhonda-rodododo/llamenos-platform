# Implementation Plan: Phase 7 Hub Self-Service Provider Auto-Configuration

## Overview

This plan breaks Phase 7 into ordered tasks with dependencies. Backend tasks come first, then frontend. Independent tasks within a phase can be dispatched to parallel workers.

---

## Task 1: Provider Templates — DB Schema & Migration

**Complexity**: S  
**Dependencies**: None  
**Parallelizable with**: Task 2

### Files to Create/Modify
- `apps/worker/db/schema/provider-setup.ts` — add `providerTemplates` table definition
- `apps/worker/db/migrations/XXXX_provider_templates.sql` — migration file

### Acceptance Criteria
- `provider_templates` table created with columns: id, name, slug (unique), description, provider_type, default_credentials (JSONB), default_capabilities (text[]), recommended_settings (JSONB), is_active, created_by, created_at, updated_at
- Migration runs cleanly against existing DB
- Schema exports the new table

---

## Task 2: Hub Quotas — Settings Extension

**Complexity**: S  
**Dependencies**: None  
**Parallelizable with**: Task 1

### Files to Create/Modify
- `packages/protocol/schemas/provider-setup.ts` — add `hubProviderSettingsSchema`, `hubQuotasSchema`, `hubUsageSchema` Zod schemas
- `packages/protocol/tools/schema-registry.ts` — register new schemas
- `apps/worker/services/settings.ts` — add `getHubProviderSettings()`, `updateHubQuotas()` methods

### Acceptance Criteria
- Zod schemas defined for hub provider settings, quotas, and usage
- SettingsService can read/write quota and usage data from `hubSettings.settings` JSONB
- `bun run codegen` generates Swift/Kotlin types

---

## Task 3: Provider Template Service

**Complexity**: M  
**Dependencies**: Task 1  
**Parallelizable with**: Task 2

### Files to Create/Modify
- `apps/worker/services/provider-setup/templates.ts` — new `ProviderTemplateService` class
- `apps/worker/services/index.ts` — register template service in service container

### Acceptance Criteria
- CRUD operations: `createTemplate`, `updateTemplate`, `deactivateTemplate`, `listTemplates`, `getTemplate`
- `instantiateTemplate(templateId, hubId)` — creates a `providerConfig` row from template defaults (credentials left empty, status = 'disconnected')
- Validates slug uniqueness
- Only returns active templates in list

---

## Task 4: Hub Onboarding & Status Service

**Complexity**: M  
**Dependencies**: Task 2, Task 3  
**Parallelizable with**: Task 5

### Files to Create/Modify
- `apps/worker/services/provider-setup/hub-onboard.ts` — new `HubOnboardService` class
- `apps/worker/services/provider-setup/index.ts` — integrate onboard service

### Acceptance Criteria
- `getHubSetupStatus(hubId)` — returns composite status: provider connected? numbers provisioned? messaging configured? a2p complete?
- `completeOnboarding(hubId, templateId)` — marks hub as setup-complete in hubSettings
- `getHubUsage(hubId)` — returns current month usage from hubSettings JSONB
- `checkQuota(hubId, resource)` — returns whether hub can provision more (numbers, SMS, etc.)
- Quota check integrated into `ProviderSetup.provisionNumber()` — rejects if over limit

---

## Task 5: Provider Template API Routes

**Complexity**: M  
**Dependencies**: Task 3  
**Parallelizable with**: Task 4

### Files to Create/Modify
- `apps/worker/routes/provider-setup.ts` — add template CRUD routes and hub-onboard/hub-status/hub-usage routes

### Acceptance Criteria
- `GET /api/provider-setup/templates` — list active templates (requires `telephony:view-providers`)
- `GET /api/provider-setup/templates/:id` — get template detail
- `POST /api/provider-setup/templates` — create (requires `system:manage-instance`)
- `PUT /api/provider-setup/templates/:id` — update (requires `system:manage-instance`)
- `DELETE /api/provider-setup/templates/:id` — deactivate (requires `system:manage-instance`)
- `POST /api/provider-setup/hub-onboard` — instantiate template for hub (requires `hubs:configure`)
- `GET /api/provider-setup/hub-status` — hub setup status (requires `telephony:view-providers`)
- `GET /api/provider-setup/hub-usage` — hub usage stats (requires `telephony:view-providers`)
- `PUT /api/provider-setup/hub-quotas` — set hub quotas (requires `system:manage-instance`)
- OpenAPI descriptions via `describeRoute`
- Rate limiting on template creation (5/min)

---

## Task 6: Multi-Hub Isolation Tests (BDD)

**Complexity**: M  
**Dependencies**: Task 4, Task 5  
**Parallelizable with**: Task 7, Task 8, Task 9

### Files to Create/Modify
- `apps/worker/tests/features/provider-setup-hub-isolation.feature` — Gherkin scenarios
- `apps/worker/tests/steps/provider-setup-hub-isolation.steps.ts` — step definitions

### Acceptance Criteria
- Scenario: Hub A admin configures provider → Hub B admin cannot see Hub A's config
- Scenario: Hub A admin provisions number → does not appear in Hub B's number list
- Scenario: Hub admin with `telephony:manage-providers` but no `system:manage-instance` cannot create templates
- Scenario: Quota enforcement blocks number provisioning when limit reached
- Scenario: Template instantiation creates hub-scoped providerConfig
- All scenarios pass against local backend

---

## Task 7: Desktop — Hub Onboarding Wizard

**Complexity**: L  
**Dependencies**: Task 5 (API must be available)  
**Parallelizable with**: Task 8, Task 9

### Files to Create/Modify
- `src/client/routes/hub.$hubId.settings.communications.tsx` — new TanStack Router route
- `src/client/components/hub-settings/HubOnboardingWizard.tsx` — wizard container (7 steps)
- `src/client/components/hub-settings/ProviderTemplateCard.tsx` — template selection card
- `src/client/components/hub-settings/HubProviderSettings.tsx` — ongoing management panel
- `src/client/components/hub-settings/HubUsageCard.tsx` — usage display
- `src/client/lib/api/provider-setup.ts` — add API client functions for new endpoints

### Acceptance Criteria
- Onboarding wizard renders when hub has no provider configured
- Template selection step shows available templates as cards
- Provider connection step reuses `OAuthConnectButton` / `VoiceSmsProviderForm`
- Phone number step reuses `PhoneNumberSelector`
- Completion marks hub as setup-complete
- Settings panel shows provider status, numbers, messaging, A2P, usage
- All interactions gated by user's permissions
- i18n keys added for new strings

---

## Task 8: iOS — Hub Self-Service Screens

**Complexity**: L  
**Dependencies**: Task 5 (API must be available)  
**Parallelizable with**: Task 7, Task 9

### Files to Create/Modify
- `apps/ios/Sources/Views/HubSettings/HubCommunicationsView.swift` — main settings view
- `apps/ios/Sources/Views/HubSettings/HubOnboardingSheet.swift` — onboarding wizard sheet
- `apps/ios/Sources/Views/HubSettings/ProviderTemplateListView.swift` — template picker
- `apps/ios/Sources/Views/HubSettings/HubUsageView.swift` — usage display
- `apps/ios/Sources/ViewModels/HubCommunicationsViewModel.swift` — VM with API calls
- `apps/ios/Sources/Services/ProviderSetupAPI.swift` — add template/hub-status/hub-usage endpoints

### Acceptance Criteria
- Hub communications settings accessible from hub settings navigation
- Onboarding sheet presented when no provider configured
- Template list fetched from API, selectable
- Provider connection via ASWebAuthenticationSession (OAuth) or form
- Phone number provisioning integrated
- Usage display shows current month stats
- Permission-gated UI elements
- i18n strings via codegen

---

## Task 9: Android — Hub Self-Service Screens

**Complexity**: L  
**Dependencies**: Task 5 (API must be available)  
**Parallelizable with**: Task 7, Task 8

### Files to Create/Modify
- `apps/android/app/src/main/kotlin/org/llamenos/ui/hubsettings/HubCommunicationsScreen.kt` — Compose screen
- `apps/android/app/src/main/kotlin/org/llamenos/ui/hubsettings/HubOnboardingFlow.kt` — onboarding BottomSheet
- `apps/android/app/src/main/kotlin/org/llamenos/ui/hubsettings/ProviderTemplateList.kt` — template picker
- `apps/android/app/src/main/kotlin/org/llamenos/ui/hubsettings/HubUsageCard.kt` — usage display
- `apps/android/app/src/main/kotlin/org/llamenos/viewmodel/HubCommunicationsViewModel.kt` — VM
- `apps/android/app/src/main/kotlin/org/llamenos/api/ProviderSetupApi.kt` — add new endpoints

### Acceptance Criteria
- Hub communications settings accessible from hub settings navigation
- Onboarding BottomSheet flow when no provider configured
- Template list as Material 3 cards
- Provider connection via Chrome Custom Tabs (OAuth) or form
- Phone number provisioning integrated
- Usage display with current month stats
- Permission-gated composables
- i18n strings via codegen

---

## Task 10: Desktop E2E Tests

**Complexity**: M  
**Dependencies**: Task 7  
**Parallelizable with**: Task 11, Task 12

### Files to Create/Modify
- `tests/hub-self-service.spec.ts` — Playwright E2E for hub onboarding and settings

### Acceptance Criteria
- Test: Hub admin navigates to hub settings → sees onboarding wizard
- Test: Selects template → proceeds through wizard → hub marked as configured
- Test: Settings panel shows provider status after setup
- Test: Non-admin user cannot access hub communications settings
- Tests pass with Tauri IPC mocks

---

## Task 11: iOS UI Tests

**Complexity**: S  
**Dependencies**: Task 8  
**Parallelizable with**: Task 10, Task 12

### Files to Create/Modify
- `apps/ios/Tests/XCUITests/HubCommunicationsUITests.swift`

### Acceptance Criteria
- Test: Hub settings shows communications section
- Test: Onboarding sheet appears for unconfigured hub
- Test: Template selection updates UI

---

## Task 12: Android UI Tests

**Complexity**: S  
**Dependencies**: Task 9  
**Parallelizable with**: Task 10, Task 11

### Files to Create/Modify
- `apps/android/app/src/androidTest/kotlin/org/llamenos/ui/HubCommunicationsTest.kt`

### Acceptance Criteria
- Test: Hub settings shows communications section
- Test: Onboarding flow appears for unconfigured hub
- Test: Template selection works

---

## Execution Order & Parallelism

```
Phase A (parallel):  Task 1 + Task 2
Phase B (parallel):  Task 3 + (Task 2 if not done)
Phase C (parallel):  Task 4 + Task 5
Phase D (parallel):  Task 6 + Task 7 + Task 8 + Task 9
Phase E (parallel):  Task 10 + Task 11 + Task 12
```

### Critical Path

```
Task 1 → Task 3 → Task 5 → Task 7 (desktop UI)
Task 2 → Task 4 → Task 5 → Task 6 (BDD tests)
```

### Dependency Graph

```
Task 1 ──→ Task 3 ──→ Task 5 ──→ Task 7 ──→ Task 10
                  ╲        ╲──→ Task 8 ──→ Task 11
Task 2 ──→ Task 4 ─╱        ╲──→ Task 9 ──→ Task 12
                              ╲──→ Task 6
```

## Summary

| Task | Description | Size | Depends On |
|------|-------------|------|------------|
| 1 | Provider templates DB schema | S | — |
| 2 | Hub quotas settings extension | S | — |
| 3 | Provider template service | M | 1 |
| 4 | Hub onboarding & status service | M | 2, 3 |
| 5 | API routes (templates, hub-onboard, usage, quotas) | M | 3 |
| 6 | Multi-hub isolation BDD tests | M | 4, 5 |
| 7 | Desktop hub onboarding wizard + settings | L | 5 |
| 8 | iOS hub self-service screens | L | 5 |
| 9 | Android hub self-service screens | L | 5 |
| 10 | Desktop E2E tests | M | 7 |
| 11 | iOS UI tests | S | 8 |
| 12 | Android UI tests | S | 9 |

**Total**: 4S + 5M + 3L = ~12 tasks, maximum parallelism of 4 workers after Phase C completes.
