# Phase 7: Hub Self-Service Provider Auto-Configuration

## Overview

Phase 7 enables hub admins to independently configure their own telephony/messaging providers without platform super-admin intervention. The existing architecture already supports hub-scoped providers (`providerConfigs.hubId` FK, hub-scoped permissions), but the current UX assumes a platform-level setup wizard driven by super-admins. This phase adds a **separate hub onboarding wizard**, management UI, template-driven setup, channel mix-and-match, and sub-account provisioning so each hub can self-service.

## Motivation

- **Decentralization**: Each hub may operate independently (different orgs, jurisdictions, budgets). They need their own telephony provider accounts.
- **Reduced admin burden**: Platform super-admins shouldn't be a bottleneck for hub telephony setup.
- **Multi-tenancy**: Strict isolation between hubs' provider credentials, phone numbers, and billing.
- **Scalability**: As the platform grows, hub admins must be self-sufficient.
- **Channel flexibility**: Different hubs need different communication channels — a DV crisis line needs voice + SMS, while an ICE rapid response network needs Signal + WhatsApp + voice.

## User Stories

### Hub Admin Persona

1. **First-time setup**: As a hub admin, I can run a guided onboarding wizard to connect my hub's telephony provider, pick a phone number, and configure messaging channels — without needing platform super-admin help.
2. **Template-driven setup**: As a hub admin, I can select from pre-configured templates (e.g., "DV Crisis Hotline", "ICE Rapid Response") that pre-fill roles, channel defaults, and recommended settings — reducing configuration errors and setup time.
3. **Channel mix-and-match**: As a hub admin, I can enable any combination of channels (telephony, Signal, WhatsApp, Telegram, RCS) for my hub. Templates suggest defaults but I can add or remove channels freely.
4. **Own-account credentials**: As a hub admin, I can bring my own provider API keys and configure them in the onboarding wizard.
5. **Sub-account provisioning**: As a hub admin, if the platform super-admin has configured a master provider account with sub-accounts enabled, I can auto-provision a sub-account during onboarding without ever seeing master credentials.
6. **Ongoing management**: As a hub admin, I can view and modify my hub's provider configuration, rotate credentials, change phone numbers, add/remove channels, and switch providers from a dedicated settings panel — at any time, not just during initial setup.
7. **Usage visibility**: As a hub admin, I can see my hub's telephony/messaging usage (call count, SMS count) and any quotas or limits set by the platform admin.
8. **Isolation guarantee**: As a hub admin, I can never see or interact with another hub's provider configuration, phone numbers, or credentials.
9. **Cross-platform access**: As a hub admin on desktop, iOS, or Android, I have access to the same hub self-service features.

### Platform Super-Admin Persona

10. **Hub lifecycle management**: As a super-admin, I can create hubs, invite users as hub admins, set quotas, view hub operational status (provider type, active/inactive), and deactivate abandoned hubs.
11. **Template management**: As a super-admin, I can create, edit, and delete provider/onboarding templates that hub admins can instantiate.
12. **Master provider configuration**: As a super-admin, I can configure a master provider account and enable `allowSubAccounts` so hub admins can auto-provision sub-accounts during onboarding.
13. **Quota enforcement**: As a super-admin, I can set per-hub quotas (max numbers, monthly SMS cap) that hub admins see but cannot exceed.
14. **Self-serve hub creation**: As a super-admin, I can grant specific users the `system:create-hub` permission, allowing them to create their own hubs and run onboarding without super-admin involvement.
15. **Audit trail**: As a super-admin, I can see which hub admin configured which provider and when.

### Zero-Knowledge Constraints (Super-Admin Boundaries)

The super-admin role operates under strict zero-knowledge constraints:

| Super-Admin CAN | Super-Admin CANNOT |
|-----------------|-------------------|
| Create/manage hubs (lifecycle) | See hub credentials or API keys |
| Create/edit templates | See call/note/conversation data |
| Set per-hub quotas | Modify hub's provider config directly |
| View hub operational status (provider type, active/inactive) | Access hub-encrypted content |
| View aggregate usage (call count, SMS count) | See individual call records |
| Deactivate abandoned hubs | Override hub admin's channel choices |

Usage tracking is aggregate only (call count, SMS count), visible to both hub admin and super-admin for quota purposes.

## Architecture

### Separate Entry Points (Option B)

The hub onboarding wizard is a **distinct flow** from the platform setup wizard. They share components but have separate orchestration:

```
Platform Setup Wizard (super-admin)     Hub Onboarding Wizard (hub admin)
├── StepProviders.tsx                   ├── HubOnboardingWizard.tsx
├── OAuthConnectButton.tsx ◄──SHARED──► ├── OAuthConnectButton.tsx
├── PhoneNumberSelector.tsx ◄──SHARED──► ├── PhoneNumberSelector.tsx
├── VoiceSmsProviderForm.tsx ◄──SHARED──► ├── VoiceSmsProviderForm.tsx
├── WhatsAppProviderForm.tsx ◄──SHARED──► ├── WhatsAppProviderForm.tsx
├── SignalProviderForm.tsx ◄──SHARED──► ├── SignalProviderForm.tsx
└── (platform-level settings)           └── HubProviderSettings.tsx (ongoing mgmt)
```

The platform wizard (`StepProviders.tsx`) remains unchanged. The hub onboarding wizard is new, uses the same shared components (they already accept props, not global state), but has its own step orchestration, template selection, and hub-scoped API calls.

### Hub Creation Paths

Two paths to create a hub, both leading to the same onboarding flow:

1. **Default (invite-only)**:
   - Super-admin creates hub via `POST /api/hubs`
   - Super-admin invites user as hub admin (`hubs:manage-members`)
   - Hub admin logs in, sees new hub, runs onboarding wizard

2. **Self-create (opt-in)**:
   - Super-admin grants user `system:create-hub` permission
   - User creates their own hub via `POST /api/hubs` (requires `system:create-hub`)
   - User automatically becomes hub admin, runs onboarding wizard

Invite-only is the default behavior. Self-create requires explicit permission grant.

### What Already Exists (Reuse)

| Component | Status |
|-----------|--------|
| `providerConfigs` table with `hubId` FK | Phase 1 |
| `oauthStates`, `signalRegistrations`, `a2pRegistrations` with `hubId` | Phase 1 |
| Hub-scoped permissions (`telephony:manage-providers`, `hubs:configure`, etc.) | Phase 1 |
| `hasHubPermission()` authorization in `packages/shared/permissions.ts` | Existing |
| `ProviderSetupService` with hubId parameter | Phase 2-3 |
| Provider capability registry (8 providers) in `registry.ts` | Phase 2 |
| OAuth flows with hubId scoping | Phase 3 |
| Desktop setup wizard (`StepProviders.tsx`) with shared components | Phase 5 |
| iOS/Android provider setup UI | Phase 6 |
| 14 CaseManagementTemplate bundles in `packages/protocol/templates/` with `suggestedRoles[]` | Existing |
| Role CRUD via `/api/roles` including `/roles/from-template` | Existing |

### What Phase 7 Adds

1. **Hub Onboarding Wizard** — hub-specific guided flow (separate entry point from platform wizard, shared components)
2. **Template Extensions** — extend existing `CaseManagementTemplate` JSON schema with provider configuration fields (channel defaults, provider hints, sub-account config)
3. **Channel Mix-and-Match** — any combination of telephony, Signal, WhatsApp, Telegram, RCS per hub
4. **Sub-Account Provisioning** — optional auto-provisioning mode when super-admin has configured master provider
5. **Hub Settings Panel** — dedicated provider management page in hub settings (persistent, not just onboarding)
6. **Hub Quotas** — extension to `hubSettings.settings` JSONB for quota tracking
7. **Usage Tracking** — lightweight aggregation of hub provider usage (call count, SMS count)
8. **New Permission** — `system:create-hub` for self-serve hub creation
9. **Multi-Hub Isolation Tests** — dedicated test suite verifying cross-hub data isolation across ALL platforms

## Data Model Changes

### Extension: CaseManagementTemplate (packages/protocol/templates/)

Rather than creating a separate `provider_templates` DB table, Phase 7 extends the existing CaseManagementTemplate JSON schema with provider configuration fields. This keeps templates as a single concept — one template configures both case management (entity types, roles) AND communications (channels, provider hints).

New fields added to template JSON schema:

```typescript
interface CaseManagementTemplateProviderExtension {
  /** Default channels enabled by this template. Hub admin can modify at setup time. */
  defaultChannels?: ('voice' | 'sms' | 'whatsapp' | 'signal' | 'telegram' | 'rcs')[]

  /** Recommended telephony provider type (hint, not enforced). */
  recommendedProvider?: TelephonyProviderType

  /** Provider-specific default settings (e.g., { a2pRequired: false }). NOT actual secrets. */
  providerDefaults?: Record<string, unknown>

  /** Whether this template supports sub-account auto-provisioning. */
  allowSubAccounts?: boolean

  /** Description of channel requirements for the template's use case. */
  channelGuidance?: string
}
```

Example extension to `general-hotline.json`:
```json
{
  "id": "general-hotline",
  "version": "1.2.0",
  "defaultChannels": ["voice", "sms"],
  "recommendedProvider": "twilio",
  "providerDefaults": { "a2pRequired": true },
  "allowSubAccounts": false,
  "channelGuidance": "Voice and SMS are recommended for general hotlines. Add Signal or WhatsApp for secure messaging."
}
```

### New Table: `hub_onboarding_state`

Tracks per-hub onboarding progress (which steps are complete):

```sql
CREATE TABLE hub_onboarding_state (
  hub_id TEXT PRIMARY KEY REFERENCES hubs(id) ON DELETE CASCADE,
  template_id TEXT,                          -- which template was selected (nullable for "from scratch")
  current_step TEXT NOT NULL DEFAULT 'welcome',
  completed_steps TEXT[] NOT NULL DEFAULT '{}',
  channel_config JSONB NOT NULL DEFAULT '{}', -- which channels are enabled + per-channel status
  is_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### New Table: `provider_templates` (Super-Admin Managed)

For super-admin-created provider configuration templates (separate from case management templates). These are lightweight provider-only templates that can be applied independently or alongside a case management template:

```sql
CREATE TABLE provider_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  provider_type TEXT NOT NULL,           -- e.g. 'twilio', 'signalwire'
  default_channels TEXT[] NOT NULL DEFAULT '{}',
  credential_hints JSONB NOT NULL DEFAULT '{}',  -- field labels/placeholders (NOT actual secrets)
  recommended_settings JSONB NOT NULL DEFAULT '{}',
  allow_sub_accounts BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Extension: `hubSettings.settings` JSONB

Add typed fields to the hub settings JSONB:

```typescript
interface HubProviderSettings {
  providerQuotas?: {
    maxPhoneNumbers: number
    monthlySmsLimit: number | null  // null = unlimited
    monthlyCallMinutesLimit: number | null
  }
  providerSetupComplete: boolean
  templateId?: string           // which template was used for initial setup
  enabledChannels: string[]     // currently enabled channels
  subAccountMode?: boolean      // whether using sub-account provisioning
  usageTracking?: {
    currentMonth: string        // YYYY-MM
    smsCount: number
    callCount: number
    lastUpdated: string         // ISO timestamp
  }
}
```

### New Permission: `system:create-hub`

Added to `PERMISSION_CATALOG` in `packages/shared/permissions.ts`:

```typescript
'system:create-hub': 'Create new hubs (self-serve hub creation)',
```

This permission is NOT included in any default role. Super-admins explicitly grant it to users who should be able to create their own hubs.

### No Changes To

- `providerConfigs` — already hub-scoped
- `oauthStates` — already hub-scoped
- `signalRegistrations` / `a2pRegistrations` — already hub-scoped
- Existing permission model — existing permissions sufficient (only adding `system:create-hub`)

## Channel Configuration: Mix-and-Match

### Phone Number as Baseline

Almost every channel requires a phone number:
- **Voice/SMS**: Phone number required (obvious)
- **Signal**: Requires a phone number for registration
- **WhatsApp**: Requires a phone number for Business API registration
- **Telegram**: Standalone — uses bot token, no phone number needed
- **RCS**: Requires a phone number for agent registration

The onboarding wizard provisions the phone number early (Step 4) and subsequent channel setup steps use it.

### Channel Independence

Channels are independently enabled/disabled. A hub can run:
- Voice + SMS only (basic hotline)
- Voice + Signal + WhatsApp (secure messaging hotline)
- Signal + Telegram only (no voice, text-only)
- Any other combination

Templates suggest default channel combinations but hub admins can modify at setup time and afterward in settings.

### Provider Credentials Ownership

Two modes for provider credentials:

1. **Own-account mode (default)**: Hub admin brings their own API keys. Credentials entered during onboarding, encrypted with `HMAC_SECRET`, stored in `providerConfigs`.

2. **Sub-account mode (platform-enabled)**: Available when:
   - Super-admin has configured a master provider account at platform level
   - Super-admin has enabled `allowSubAccounts` on the master config
   - Template (if selected) has `allowSubAccounts: true`

   In sub-account mode, the onboarding wizard calls a platform API to auto-provision a sub-account under the master provider. The hub admin never sees master credentials. The sub-account credentials are stored in the hub's `providerConfigs`.

## Hub Onboarding Wizard Flow

Template-driven with checklist fallback. 7 steps:

### Step 1: Welcome
- "Set up your hub's communications"
- Brief explanation of what will be configured
- If hub was created from a case management template that has `defaultChannels`, mention the suggested setup

### Step 2: Choose Template
- Card grid of available provider templates (super-admin-created)
- If the hub was created with a case management template, its `defaultChannels` and `recommendedProvider` are pre-selected
- "Start from scratch" option for manual configuration
- Templates are starting points — users can modify any settings

### Step 3: Template Application
- If template selected: auto-creates suggested roles via `/roles/from-template` (existing endpoint)
- Sets default channel mix from template
- Pre-fills provider type recommendation
- If "from scratch": skip directly to Step 4

### Step 4: Provision Phone Number
- Connect provider (OAuth or credential entry) — reuses `OAuthConnectButton`, `VoiceSmsProviderForm`
- If sub-account mode: auto-provision sub-account, then proceed
- Search for available numbers → buy/assign — reuses `PhoneNumberSelector`
- Phone number is required for most channels (except Telegram)
- Quota check: reject if hub exceeds `maxPhoneNumbers`

### Step 5: Enable Channels
- Checklist of available channels, pre-checked from template (if any)
- Hub admin can add/remove channels freely
- Each channel shows whether it requires additional setup
- Channels: Voice, SMS, WhatsApp, Signal, Telegram, RCS

### Step 6: Channel Setup
- Sub-flows per enabled channel:
  - **Voice/SMS**: Webhook configuration (reuses `WebhookConfirmation`)
  - **WhatsApp**: Business API registration (reuses `WhatsAppProviderForm`)
  - **Signal**: Signal bridge registration (reuses `SignalRegistrationFlow`)
  - **Telegram**: Bot token entry
  - **RCS**: Agent registration
- A2P registration if required by provider (reuses existing A2P flow)
- Channels can be set up now or deferred ("Set up later" option)

### Step 7: Summary
- Shows configured vs. pending channels
- Link to hub settings for ongoing management
- "Go to hub dashboard" CTA
- Marks hub as `providerSetupComplete: true`

### Hub Settings Panel (Post-Onboarding)

Persistent dashboard at `/hub/:hubId/settings/communications` for ongoing management. Everything modifiable at any time:

- **Provider Card** — connected provider, status badge, last checked timestamp
  - Actions: Test connection, Rotate credentials, Disconnect, Switch provider
- **Phone Numbers** — list of provisioned numbers with capabilities
  - Actions: Add number (quota-checked), Remove number, Configure webhooks
- **Channel Status** — per-channel enable/disable with setup status
  - Actions: Enable/disable channel, Re-run setup, View configuration
- **A2P Status** — brand + campaign registration status
- **Usage** — current month's call count, SMS count, vs. quota (if set)

## API Changes

### New Routes

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/provider-templates` | `telephony:view-providers` | List active provider templates |
| GET | `/api/provider-templates/:id` | `telephony:view-providers` | Get template details |
| POST | `/api/provider-templates` | `system:manage-instance` | Create provider template (super-admin) |
| PUT | `/api/provider-templates/:id` | `system:manage-instance` | Update provider template |
| DELETE | `/api/provider-templates/:id` | `system:manage-instance` | Deactivate provider template |
| POST | `/api/hubs/:hubId/onboard` | `hubs:configure` | Start/resume hub onboarding (creates onboarding state, optionally applies template) |
| GET | `/api/hubs/:hubId/onboard/status` | `telephony:view-providers` | Get hub onboarding progress |
| PUT | `/api/hubs/:hubId/onboard/step` | `hubs:configure` | Complete an onboarding step |
| GET | `/api/hubs/:hubId/provider-status` | `telephony:view-providers` | Get hub's complete provider setup status (config + numbers + channels) |
| GET | `/api/hubs/:hubId/usage` | `telephony:view-providers` | Get hub's current usage stats |
| PUT | `/api/hubs/:hubId/quotas` | `system:manage-instance` | Set/update hub quotas (super-admin) |
| PUT | `/api/hubs/:hubId/channels` | `hubs:configure` | Enable/disable channels for hub |
| POST | `/api/hubs/:hubId/sub-account` | `hubs:configure` | Auto-provision sub-account from master provider |

### Modifications to Existing Routes

- `POST /api/hubs` — add `system:create-hub` as alternative permission (currently requires `system:manage-hubs`)
- All existing `/api/provider-setup/*` routes already accept `hubId` from context — no changes needed
- Add quota enforcement to `POST /phone-numbers/provision` — reject if hub exceeds `maxPhoneNumbers`
- Add quota check to telephony/messaging adapters at call/SMS time (hook point added, runtime enforcement deferred)

## UI Design

### Desktop Implementation

- New route: `/hub/:hubId/settings/communications`
- New components:
  - `HubOnboardingWizard.tsx` — wizard container (7 steps, separate from `SetupWizard`)
  - `ProviderTemplateCard.tsx` — template selection card
  - `ChannelChecklist.tsx` — channel enable/disable checklist
  - `ChannelSetupFlow.tsx` — per-channel sub-flow orchestration
  - `HubProviderSettings.tsx` — ongoing management panel
  - `HubUsageCard.tsx` — usage display
- Reuses: `OAuthConnectButton`, `PhoneNumberSelector`, `VoiceSmsProviderForm`, `WhatsAppProviderForm`, `SignalProviderForm`, `WebhookConfirmation`, `ProviderStatusBadge` (all existing)
- i18n keys added for new strings

### iOS Implementation

- New screens mirroring the desktop hub settings panel
- Onboarding wizard as SwiftUI sheet flow
- Reuses existing provider setup view components from Phase 6
- i18n strings via codegen

### Android Implementation

- New screens mirroring the desktop hub settings panel
- Onboarding wizard as Compose ModalBottomSheet flow
- Reuses existing provider setup view components from Phase 6
- i18n strings via codegen

### Cross-Platform Feature Matrix

| Feature | Desktop | iOS | Android |
|---------|---------|-----|---------|
| Hub onboarding wizard | Full wizard flow | Sheet-based flow | BottomSheet flow |
| Template selection | Card grid | List with detail | List with detail |
| Channel checklist | Checkbox grid | Toggle list | Switch list |
| Provider connection | OAuth popup / form | OAuth ASWebAuth / form | OAuth CustomTabs / form |
| Phone number management | Full table | Compact list | Compact list |
| Channel setup sub-flows | Inline accordion | Nested sheets | Nested BottomSheets |
| Hub settings panel | Full settings page | Settings screen | Settings screen |
| Usage display | Chart + numbers | Numbers only | Numbers only |

All platforms share:
- Same API endpoints
- Same Zod schemas (codegen to Swift/Kotlin)
- Same permission checks (client-side gating via user's permission set)

## Security Considerations

### Hub Isolation (Critical)

1. **Query scoping**: Every provider-related DB query MUST filter by `hubId`. The existing `ProviderSetupService` already takes `hubId` as a parameter — ensure all new queries follow this pattern.
2. **No cross-hub credential access**: `decryptCredentials()` is called with the row's own HMAC — but add a runtime assertion that the requesting user's hub matches the row's `hubId`.
3. **Template secrets**: `provider_templates.credential_hints` and `CaseManagementTemplate.providerDefaults` MUST NOT contain actual API keys. They store field hints/labels only.
4. **OAuth state binding**: OAuth flows already bind `stateId` to `hubId` — verify in callback that the completing user belongs to the same hub.
5. **Sub-account isolation**: When auto-provisioning sub-accounts, the master credentials are read server-side only. Hub admins never see master credentials. Sub-account credentials are encrypted and stored per-hub.

### Zero-Knowledge Super-Admin Boundaries

- Super-admin can view hub operational metadata (provider type, status, channel count, usage aggregates) but CANNOT view or decrypt hub provider credentials.
- Super-admin CANNOT access hub-encrypted content (notes, transcripts, conversations).
- Usage tracking stores only aggregate counts (call count, SMS count), not individual records.
- Template instantiation by hub admin does not grant super-admin access to the resulting configuration.

### Credential Scoping

- Each hub's provider credentials are encrypted with the global `HMAC_SECRET` (same as today).
- Future enhancement (out of scope): per-hub encryption keys derived from hub key.

### Quota Enforcement

- Quotas are advisory in Phase 7 (UI shows limits, provisioning is blocked at max numbers).
- Runtime call/SMS quota enforcement is deferred to a future phase (requires telephony adapter hooks).

### Permission Boundary: Custom Role Delegation

- Hub admins can create custom roles within their hub but CANNOT grant permissions they don't hold themselves.
- `system:create-hub` is a system-level permission — only super-admins can grant it.
- `system:manage-instance` remains the gate for template CRUD and quota management.

### Audit

- All provider configuration changes (connect, disconnect, rotate, provision number) already generate audit log entries via the existing audit middleware.
- Template instantiation generates a new audit entry.
- Hub creation (both paths) generates audit entries.
- Channel enable/disable generates audit entries.

## Testing Strategy

### Backend

1. **Unit tests**: 
   - `ProviderTemplateService` CRUD operations
   - `HubOnboardService` template instantiation, step progression
   - Quota checking logic
   - Channel enable/disable validation
   - Sub-account provisioning logic
   - `system:create-hub` permission resolution

2. **BDD scenarios** (`apps/worker/tests/features/`):
   - Hub admin onboards via template → provider config created with correct hubId, roles created
   - Hub admin onboards "from scratch" → manual config, no roles auto-created
   - Hub admin cannot access another hub's provider config (cross-hub isolation)
   - Hub admin enables/disables channels independently
   - Quota enforcement blocks phone number provisioning when limit reached
   - Super-admin creates/edits/deactivates provider templates
   - Super-admin sets hub quotas
   - Super-admin CANNOT see hub credentials (zero-knowledge boundary)
   - User with `system:create-hub` creates own hub and runs onboarding
   - User without `system:create-hub` cannot create hubs
   - Sub-account auto-provisioning when master provider is configured
   - Channel setup sub-flows complete correctly per channel type
   - Usage tracking aggregate counts are correct

3. **Multi-hub isolation test suite** (`apps/worker/tests/features/hub-isolation.feature`):
   - 2+ hubs with separate providers, numbers, channels
   - Cross-hub credential access attempt → 403
   - Cross-hub phone number access attempt → empty list
   - Cross-hub channel config access → 403
   - Super-admin aggregate view shows both hubs' status but no credentials
   - Hub deactivation does not affect other hubs

### Desktop (Playwright E2E)

1. Hub admin navigates to hub settings → sees onboarding wizard (unconfigured hub)
2. Selects template → template details shown, channels pre-selected
3. Proceeds through wizard → provider connected, number provisioned, channels configured
4. Hub marked as configured → settings panel shows instead of wizard
5. Settings panel: provider status card, phone numbers, channel toggles, usage
6. Non-admin user cannot access hub communications settings
7. Channel enable/disable from settings panel
8. "Start from scratch" flow without template

### iOS (XCUITest)

1. Hub settings shows communications section
2. Onboarding sheet presented for unconfigured hub
3. Template selection updates UI and pre-selects channels
4. Channel checklist toggles work
5. Provider connection form renders correctly
6. Settings screen shows provider status after setup
7. Permission-gated: non-admin cannot see communications settings

### Android (Compose UI Tests + Cucumber BDD E2E)

1. **Compose UI tests**:
   - Hub settings shows communications section
   - Onboarding BottomSheet flow renders for unconfigured hub
   - Template selection card interactions
   - Channel switch toggles work
   - Provider form field validation
   - Settings screen provider status display

2. **Cucumber BDD E2E**:
   - Full onboarding flow with template selection
   - Channel enable/disable round-trip
   - Settings panel after onboarding complete

### Crypto

- No new crypto operations in Phase 7 (provider credentials use existing `HMAC_SECRET` encryption)
- If sub-account provisioning adds any new key-wrapping, add tests to `packages/crypto`

### Multi-Hub Isolation (Dedicated Suite)

Cross-platform test suite with 2+ hubs verifying:
- Complete data separation for provider configs
- Complete data separation for phone numbers
- Complete data separation for channel configurations  
- Complete data separation for usage tracking
- Permission boundaries: hub admin A cannot access hub B's resources
- Custom role delegation: hub admin cannot escalate permissions beyond their own

### Permission Boundary Tests

- `system:create-hub` gating: user with permission can create hub, user without cannot
- `system:manage-instance` gating: only super-admin can CRUD templates and set quotas
- Hub admin cannot grant permissions they don't hold
- Super-admin zero-knowledge: cannot decrypt hub credentials via any API path

## Out of Scope / Future Work

- **Per-hub encryption keys**: Encrypting provider credentials with hub-specific keys (requires hub key rotation coordination)
- **Runtime quota enforcement**: Blocking calls/SMS mid-flight when quota exceeded (requires adapter-level hooks)
- **Billing integration**: Actual payment/invoicing for provider usage
- **Provider migration wizard**: Automated migration from one provider to another (number porting)
- **Multi-provider per hub**: Currently one primary telephony provider per hub; multi-provider is future
- **Template marketplace**: Community-contributed templates
- **Automated health monitoring**: Periodic provider health checks with alerting
- **Telegram/RCS channel adapters**: Placeholder UI for Telegram bot token and RCS agent registration — actual adapter implementation is a separate epic
