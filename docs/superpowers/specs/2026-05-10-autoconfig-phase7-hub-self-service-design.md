# Phase 7: Hub Self-Service Provider Auto-Configuration

## Overview

Phase 7 enables hub admins to independently configure their own telephony/messaging providers without platform super-admin intervention. The existing architecture already supports hub-scoped providers (`providerConfigs.hubId` FK, hub-scoped permissions), but the current UX assumes a platform-level setup wizard driven by super-admins. This phase adds hub-specific onboarding, management UI, and provider templates so each hub can self-service.

## Motivation

- **Decentralization**: Each hub may operate independently (different orgs, jurisdictions, budgets). They need their own telephony provider accounts.
- **Reduced admin burden**: Platform super-admins shouldn't be a bottleneck for hub telephony setup.
- **Multi-tenancy**: Strict isolation between hubs' provider credentials, phone numbers, and billing.
- **Scalability**: As the platform grows, hub admins must be self-sufficient.

## User Stories

### Hub Admin Persona

1. **First-time setup**: As a hub admin, I can run a guided onboarding wizard to connect my hub's telephony provider, pick a phone number, and configure messaging channels — without needing platform super-admin help.
2. **Provider templates**: As a hub admin, I can select from pre-configured provider templates (e.g., "Twilio Starter") that pre-fill credential fields and recommended settings, reducing configuration errors.
3. **Ongoing management**: As a hub admin, I can view and modify my hub's provider configuration, rotate credentials, change phone numbers, and switch providers from a dedicated settings panel.
4. **Usage visibility**: As a hub admin, I can see my hub's telephony/messaging usage (call minutes, SMS count) and any quotas or limits set by the platform admin.
5. **Isolation guarantee**: As a hub admin, I can never see or interact with another hub's provider configuration, phone numbers, or credentials.
6. **Cross-platform access**: As a hub admin on desktop, iOS, or Android, I have access to the same hub self-service features.

### Platform Super-Admin Persona

7. **Template management**: As a super-admin, I can create, edit, and delete provider templates that hub admins can instantiate.
8. **Quota enforcement**: As a super-admin, I can set per-hub quotas (max numbers, monthly SMS cap) that hub admins see but cannot exceed.
9. **Audit trail**: As a super-admin, I can see which hub admin configured which provider and when.

## Architecture

### What Already Exists (Reuse)

| Component | Status |
|-----------|--------|
| `providerConfigs` table with `hubId` FK | ✅ Phase 1 |
| `oauthStates`, `signalRegistrations`, `a2pRegistrations` with `hubId` | ✅ Phase 1 |
| Hub-scoped permissions (`telephony:manage-providers`, `hubs:configure`, etc.) | ✅ Phase 1 |
| `hasHubPermission()` authorization | ✅ Existing |
| `ProviderSetupService` with hubId parameter | ✅ Phase 2-3 |
| Provider capability registry (8 providers) | ✅ Phase 2 |
| OAuth flows with hubId scoping | ✅ Phase 3 |
| Desktop setup wizard (`StepProviders.tsx`) | ✅ Phase 5 |
| iOS/Android provider setup UI | ✅ Phase 6 |

### What Phase 7 Adds

1. **Provider Templates** — new DB table + CRUD API + template instantiation logic
2. **Hub Onboarding Wizard** — hub-specific guided flow (reuses existing wizard components but scoped to hub context)
3. **Hub Settings Panel** — dedicated provider management page in hub settings
4. **Hub Quotas** — extension to `hubSettings.settings` JSONB for quota tracking
5. **Usage Tracking** — lightweight aggregation of hub provider usage (call count, SMS count)
6. **Multi-Hub Isolation Tests** — dedicated test suite verifying cross-hub data isolation

## Data Model Changes

### New Table: `provider_templates`

```sql
CREATE TABLE provider_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  provider_type TEXT NOT NULL,           -- e.g. 'twilio', 'signalwire'
  default_credentials JSONB NOT NULL DEFAULT '{}',  -- pre-filled field hints (NOT actual secrets)
  default_capabilities TEXT[] NOT NULL DEFAULT '{}',
  recommended_settings JSONB NOT NULL DEFAULT '{}', -- e.g. { enableSms: true, a2pRequired: false }
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
  providerTemplateId?: string  // which template was used for initial setup
  usageTracking?: {
    currentMonth: string  // YYYY-MM
    smsCount: number
    callMinutes: number
    lastUpdated: string   // ISO timestamp
  }
}
```

### No Changes To

- `providerConfigs` — already hub-scoped
- `oauthStates` — already hub-scoped
- `signalRegistrations` / `a2pRegistrations` — already hub-scoped
- Permission model — existing permissions sufficient

## API Changes

### New Routes

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/provider-setup/templates` | `telephony:view-providers` | List active provider templates |
| GET | `/api/provider-setup/templates/:id` | `telephony:view-providers` | Get template details |
| POST | `/api/provider-setup/templates` | `system:manage-instance` | Create provider template (super-admin) |
| PUT | `/api/provider-setup/templates/:id` | `system:manage-instance` | Update provider template |
| DELETE | `/api/provider-setup/templates/:id` | `system:manage-instance` | Deactivate provider template |
| POST | `/api/provider-setup/hub-onboard` | `hubs:configure` | Instantiate template for hub (creates providerConfig from template) |
| GET | `/api/provider-setup/hub-status` | `telephony:view-providers` | Get hub's complete provider setup status (config + numbers + signal + a2p) |
| GET | `/api/provider-setup/hub-usage` | `telephony:view-providers` | Get hub's current usage stats |
| PUT | `/api/provider-setup/hub-quotas` | `system:manage-instance` | Set/update hub quotas (super-admin) |

### Modifications to Existing Routes

- All existing `/api/provider-setup/*` routes already accept `hubId` from context — no changes needed.
- Add quota enforcement to `POST /phone-numbers/provision` — reject if hub exceeds `maxPhoneNumbers`.
- Add quota check to telephony/messaging adapters at call/SMS time (future — out of scope for Phase 7 UI, but hook point added).

## UI Design

### Hub Onboarding Wizard

Triggered when a hub admin first accesses hub settings and no provider is configured.

**Flow:**
1. **Welcome** — "Set up your hub's communications" intro
2. **Choose Template** — card grid of available templates (or "Custom" for manual config)
3. **Connect Provider** — OAuth or credential entry (reuses `OAuthConnectButton`, `VoiceSmsProviderForm`)
4. **Pick Phone Number** — search + provision (reuses `PhoneNumberSelector`)
5. **Configure Messaging** — Signal/WhatsApp/SMS channel setup (conditional on template)
6. **A2P Registration** — if required by template/provider (reuses existing A2P flow)
7. **Confirmation** — summary of what was configured, "Go to hub settings" CTA

### Hub Settings Panel (Provider Management)

Located under Hub Settings → Communications:

- **Provider Card** — shows connected provider, status badge, last checked timestamp
  - Actions: Test connection, Rotate credentials, Disconnect
- **Phone Numbers** — list of provisioned numbers with capabilities
  - Actions: Add number, Remove number, Configure webhooks
- **Messaging Channels** — Signal/WhatsApp status
  - Actions: Register, Unregister, View status
- **A2P Status** — brand + campaign registration status
- **Usage** — current month's call minutes, SMS count, vs. quota (if set)

### Desktop Implementation

- New route: `/hub/:hubId/settings/communications`
- New components: `HubOnboardingWizard`, `HubProviderSettings`, `ProviderTemplateCard`, `HubUsageCard`
- Reuses: All existing provider setup components (they already accept props, not global state)

### iOS / Android Implementation

- New screens mirroring the desktop hub settings panel
- Onboarding wizard as a modal flow (SwiftUI sheet / Compose ModalBottomSheet)
- Reuses existing provider setup view components from Phase 6

## Security Considerations

### Hub Isolation (Critical)

1. **Query scoping**: Every provider-related DB query MUST filter by `hubId`. The existing `ProviderSetupService` already takes `hubId` as a parameter — ensure all new queries follow this pattern.
2. **No cross-hub credential access**: `decryptCredentials()` is called with the row's own HMAC — but add a runtime assertion that the requesting user's hub matches the row's `hubId`.
3. **Template secrets**: `provider_templates.default_credentials` MUST NOT contain actual API keys. It stores field hints/labels only (e.g., `{ "accountSid": "", "authToken": "" }`).
4. **OAuth state binding**: OAuth flows already bind `stateId` to `hubId` — verify in callback that the completing user belongs to the same hub.

### Credential Scoping

- Each hub's provider credentials are encrypted with the global `HMAC_SECRET` (same as today).
- Future enhancement (out of scope): per-hub encryption keys derived from hub key. For now, the server-side encryption is sufficient since the server already has access to decrypt for API calls.

### Quota Enforcement

- Quotas are advisory in Phase 7 (UI shows limits, provisioning is blocked at max numbers).
- Runtime call/SMS quota enforcement is deferred to a future phase (requires telephony adapter hooks).

### Audit

- All provider configuration changes (connect, disconnect, rotate, provision number) already generate audit log entries via the existing audit middleware.
- Template instantiation (`hub-onboard`) generates a new audit entry.

## Cross-Platform Requirements

| Feature | Desktop | iOS | Android |
|---------|---------|-----|---------|
| Hub onboarding wizard | Full wizard flow | Sheet-based flow | BottomSheet flow |
| Hub settings panel | Full settings page | Settings screen | Settings screen |
| Template selection | Card grid | List with detail | List with detail |
| Provider connection | OAuth popup / form | OAuth ASWebAuth / form | OAuth CustomTabs / form |
| Phone number management | Full table | Compact list | Compact list |
| Usage display | Chart + numbers | Numbers only | Numbers only |

All platforms share:
- Same API endpoints
- Same Zod schemas (codegen to Swift/Kotlin)
- Same permission checks (client-side gating via user's permission set)

## Testing Strategy

### Backend

1. **Unit tests**: `ProviderSetupService` template instantiation, quota checking
2. **Integration tests (BDD)**: 
   - Hub admin onboards via template → provider config created with correct hubId
   - Hub admin cannot access another hub's provider config
   - Quota enforcement blocks provisioning over limit
   - Template CRUD by super-admin
3. **Multi-hub isolation test suite**: Dedicated scenarios with 2+ hubs verifying complete data separation

### Frontend

1. **Desktop E2E (Playwright)**: Hub onboarding wizard flow, settings panel interactions
2. **iOS XCUITest**: Hub settings navigation, template selection
3. **Android Compose UI tests**: Hub settings, onboarding flow

### Security

1. **Isolation fuzzing**: Attempt cross-hub access with tampered hubId in requests
2. **Permission boundary**: Verify `telephony:manage-providers` without `system:manage-instance` cannot create templates

## Out of Scope / Future Work

- **Per-hub encryption keys**: Encrypting provider credentials with hub-specific keys (requires hub key rotation coordination)
- **Runtime quota enforcement**: Blocking calls/SMS mid-flight when quota exceeded (requires adapter-level hooks)
- **Billing integration**: Actual payment/invoicing for provider usage
- **Provider migration wizard**: Automated migration from one provider to another (number porting)
- **Multi-provider per hub**: Currently one primary telephony provider per hub; multi-provider is future
- **Template marketplace**: Community-contributed templates
- **Automated health monitoring**: Periodic provider health checks with alerting
