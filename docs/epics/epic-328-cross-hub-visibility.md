# Epic 328: Cross-Hub Case Visibility & Selective Sharing

**Status**: PENDING
**Priority**: Medium
**Depends on**: Epic 318 (Contact Entity), Epic 319 (Record Entity), Epic 321 (CMS RBAC)
**Blocks**: None
**Branch**: `desktop`

## Summary

Enable opt-in sharing of case management data between hubs. Each hub can enable a `shareWithSuperAdmins` setting that triggers the creation of summary-tier envelopes for super-admin pubkeys, allowing super-admins to query case summaries across opted-in hubs. Cross-hub contact correlation works via shared blind indexes of identifier hashes -- if the same phone number appears in two hubs' ContactDirectoryDOs, a super-admin can see "This contact has records in Hub B" without merging contacts or sharing PII. Includes a referral flow where Hub A can create an encrypted referral record that Hub B receives and can use to create their own case. Does NOT auto-merge data across hubs -- all cross-hub visibility is summary-level, read-only, and requires explicit super-admin action. ~16 files created/modified.

## Problem Statement

Crisis response organizations often operate as networks of independent chapters or hubs. A person arrested in Portland may have a bail fund case in the Portland hub and a legal representation case in the ACLU hub. Currently, each hub is completely isolated -- there is no way to know that the same person has records in multiple hubs.

This isolation is by design (security) but creates coordination gaps:
- Bail fund coordinators cannot see if an attorney has already been assigned in another hub
- Immigration rapid response networks need to know if a person has been flagged in another city
- Regional NLG chapters want aggregate statistics across chapters without exposing individual case details

Cross-hub visibility must be:
1. **Opt-in per hub** -- hub admins decide whether to share, not a global setting
2. **Summary-level only** -- super-admins see case numbers, statuses, and entity types, not field values or PII
3. **Cryptographically enforced** -- sharing means creating new ECIES envelopes for super-admin pubkeys. No envelopes = no access, regardless of server configuration
4. **Non-merging** -- the system shows "also in Hub B" as a signal, not an automatic merge

## Implementation

### Phase 1: API + Shared Specs

#### Task 1: Hub Sharing Setting

**File**: `apps/worker/durable-objects/settings-do.ts` (modify)

Add the `shareWithSuperAdmins` boolean to hub settings:

```typescript
// In the settings schema:
shareWithSuperAdmins: z.boolean().default(false),

// In the settings handler:
this.router.patch('/settings/sharing', async (req) => {
  const body = await req.json() as { shareWithSuperAdmins: boolean }
  const settings = await this.getSettings()
  settings.shareWithSuperAdmins = body.shareWithSuperAdmins
  await this.ctx.storage.put('settings', settings)

  // If enabling, return list of super-admin pubkeys that need envelopes
  if (body.shareWithSuperAdmins) {
    return json({
      settings,
      action: 'envelopes-needed',
      superAdminPubkeys: await this.getSuperAdminPubkeys(),
    })
  }

  return json({ settings })
})
```

#### Task 2: Cross-Hub Contact Search

**File**: `apps/worker/routes/cross-hub.ts` (new)

```typescript
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireRole } from '../middleware/permission-guard'

const crossHub = new Hono<AppEnv>()

/**
 * GET /api/cross-hub/contacts/search?identifierHash=<hash>
 *
 * Query all opted-in hubs' ContactDirectoryDOs for a matching identifier hash.
 * Only super-admins can use this endpoint.
 *
 * Returns: list of hubs where this identifier exists, with the contact's
 * summary-tier data (if the super-admin has a summary envelope).
 */
crossHub.get('/contacts/search',
  requireRole('super-admin'),
  async (c) => {
    const identifierHash = c.req.query('identifierHash')
    if (!identifierHash) {
      return c.json({ error: 'identifierHash required' }, 400)
    }

    // Get list of hubs that have sharing enabled
    const sharedHubs = await getSharedHubs(c.env)
    const results: CrossHubContactResult[] = []

    for (const hub of sharedHubs) {
      try {
        const contactDir = c.env.CONTACT_DIRECTORY.get(
          c.env.CONTACT_DIRECTORY.idFromName(hub.hubId)
        )
        const res = await contactDir.fetch(
          new Request(`http://do/contacts/lookup/${identifierHash}`)
        )
        if (res.ok) {
          const { contact } = await res.json() as { contact: Contact | null }
          if (contact) {
            results.push({
              hubId: hub.hubId,
              hubName: hub.hubName,
              contactId: contact.id,
              caseCount: contact.caseCount,
              lastInteractionAt: contact.lastInteractionAt,
              // Summary envelope for super-admin (if present)
              encryptedSummary: contact.encryptedSummary,
              summaryEnvelopes: contact.summaryEnvelopes,
            })
          }
        }
      } catch {
        // Skip unavailable hubs
      }
    }

    return c.json({
      identifierHash,
      matches: results,
      hubsSearched: sharedHubs.length,
    })
  },
)

/**
 * POST /api/cross-hub/referrals
 *
 * Create a referral from one hub to another. The referral contains
 * an encrypted summary of the case + contact, wrapped for the target
 * hub's admin pubkeys.
 */
crossHub.post('/referrals',
  requireRole('super-admin'),
  async (c) => {
    const body = await c.req.json() as CreateReferralBody

    // Store referral in source hub's CaseDO
    const dos = getScopedDOs(c.env, body.sourceHubId)
    const referralId = crypto.randomUUID()
    const now = new Date().toISOString()

    const referral: Referral = {
      id: referralId,
      sourceHubId: body.sourceHubId,
      targetHubId: body.targetHubId,
      sourceRecordId: body.sourceRecordId,
      encryptedSummary: body.encryptedSummary,
      summaryEnvelopes: body.summaryEnvelopes,
      status: 'pending',
      createdAt: now,
      createdBy: c.get('pubkey'),
    }

    await dos.caseManager.fetch(new Request('http://do/referrals', {
      method: 'POST',
      body: JSON.stringify(referral),
    }))

    // Store referral in target hub's CaseDO as well
    const targetDOs = getScopedDOs(c.env, body.targetHubId)
    await targetDOs.caseManager.fetch(new Request('http://do/referrals/incoming', {
      method: 'POST',
      body: JSON.stringify(referral),
    }))

    return c.json({ referral }, 201)
  },
)

/**
 * GET /api/cross-hub/referrals
 * List inbound and outbound referrals for the current hub.
 */
crossHub.get('/referrals',
  requireRole('admin'),
  async (c) => {
    const hubId = c.get('hubId')
    const dos = getScopedDOs(c.env, hubId)
    const res = await dos.caseManager.fetch(
      new Request('http://do/referrals')
    )
    return new Response(res.body, res)
  },
)

export default crossHub
```

#### Task 3: Referral Schema

**File**: `apps/worker/schemas/cross-hub.ts` (new)

```typescript
import { z } from 'zod'
import { recipientEnvelopeSchema } from './common'

export const referralSchema = z.object({
  id: z.uuid(),
  sourceHubId: z.string(),
  targetHubId: z.string(),
  sourceRecordId: z.uuid(),
  encryptedSummary: z.string(),
  summaryEnvelopes: z.array(recipientEnvelopeSchema).min(1),
  status: z.enum(['pending', 'accepted', 'declined']),
  createdAt: z.string(),
  createdBy: z.string(),
  acceptedAt: z.string().optional(),
  declinedAt: z.string().optional(),
  targetRecordId: z.uuid().optional(),  // Created when accepted
})

export type Referral = z.infer<typeof referralSchema>

export const createReferralBodySchema = z.object({
  sourceHubId: z.string(),
  targetHubId: z.string(),
  sourceRecordId: z.uuid(),
  encryptedSummary: z.string().min(1),
  summaryEnvelopes: z.array(recipientEnvelopeSchema).min(1),
})

export type CreateReferralBody = z.infer<typeof createReferralBodySchema>

export const crossHubContactResultSchema = z.object({
  hubId: z.string(),
  hubName: z.string(),
  contactId: z.uuid(),
  caseCount: z.number(),
  lastInteractionAt: z.string(),
  encryptedSummary: z.string(),
  summaryEnvelopes: z.array(recipientEnvelopeSchema),
})

export type CrossHubContactResult = z.infer<typeof crossHubContactResultSchema>
```

#### Task 4: CaseDO Referral Storage

**File**: `apps/worker/durable-objects/case-do.ts` (modify)

Add referral storage and handlers:

```typescript
// Storage keys:
// referral:{id}               -> Referral
// referral:outbound:{hubId}:{id} -> true (index by target hub)
// referral:inbound:{id}       -> Referral (received from other hubs)

this.router.post('/referrals', async (req) => {
  const referral = await req.json() as Referral
  await this.ctx.storage.put(`referral:${referral.id}`, referral)
  await this.ctx.storage.put(
    `referral:outbound:${referral.targetHubId}:${referral.id}`,
    true
  )
  return json(referral, { status: 201 })
})

this.router.post('/referrals/incoming', async (req) => {
  const referral = await req.json() as Referral
  await this.ctx.storage.put(`referral:inbound:${referral.id}`, referral)
  return json(referral, { status: 201 })
})

this.router.get('/referrals', async () => {
  const outbound = await this.ctx.storage.list({ prefix: 'referral:' })
  const inbound = await this.ctx.storage.list({ prefix: 'referral:inbound:' })

  const outboundReferrals: Referral[] = []
  for (const [key, value] of outbound) {
    if (!key.startsWith('referral:outbound:') && !key.startsWith('referral:inbound:')) {
      outboundReferrals.push(value as Referral)
    }
  }

  const inboundReferrals: Referral[] = []
  for (const [, value] of inbound) {
    inboundReferrals.push(value as Referral)
  }

  return json({ outbound: outboundReferrals, inbound: inboundReferrals })
})
```

#### Task 5: Shared Hub Registry

**File**: `apps/worker/lib/shared-hub-registry.ts` (new)

Helper to get list of hubs with sharing enabled:

```typescript
export interface SharedHub {
  hubId: string
  hubName: string
  shareWithSuperAdmins: boolean
}

export async function getSharedHubs(env: Env): Promise<SharedHub[]> {
  // IdentityDO maintains the hub registry
  const identity = env.IDENTITY.get(env.IDENTITY.idFromName('global'))
  const res = await identity.fetch(new Request('http://do/hubs'))
  const { hubs } = await res.json() as { hubs: Array<{ id: string; name: string }> }

  const shared: SharedHub[] = []
  for (const hub of hubs) {
    const settings = env.SETTINGS.get(env.SETTINGS.idFromName(hub.id))
    const settingsRes = await settings.fetch(new Request('http://do/settings'))
    const data = await settingsRes.json() as { shareWithSuperAdmins?: boolean }
    if (data.shareWithSuperAdmins) {
      shared.push({
        hubId: hub.id,
        hubName: hub.name,
        shareWithSuperAdmins: true,
      })
    }
  }

  return shared
}
```

#### Task 6: BDD Feature File

**File**: `packages/test-specs/features/core/cross-hub.feature` (new)

```gherkin
@backend
Feature: Cross-Hub Case Visibility & Selective Sharing
  Hubs can opt-in to share case summaries with super-admins.
  Super-admins can search for contacts across opted-in hubs.
  Referrals can be created between hubs.

  Background:
    Given a registered super-admin "superadmin1"
    And hub "hub-portland" with admin "admin-pdx"
    And hub "hub-seattle" with admin "admin-sea"
    And case management is enabled on both hubs

  @cross-hub
  Scenario: Enable sharing on a hub
    When admin "admin-pdx" enables shareWithSuperAdmins on "hub-portland"
    Then the hub settings should show shareWithSuperAdmins as true
    And the response should include the list of super-admin pubkeys needing envelopes

  @cross-hub
  Scenario: Cross-hub contact search finds matching identifier
    Given hub "hub-portland" has sharing enabled
    And hub "hub-seattle" has sharing enabled
    And contact "Carlos Martinez" with phone "+15551234567" in "hub-portland"
    And contact "Carlos M." with phone "+15551234567" in "hub-seattle"
    When super-admin "superadmin1" searches by identifier hash for "+15551234567"
    Then the results should include matches from both hubs
    And each match should include contactId, caseCount, and hub info

  @cross-hub
  Scenario: Non-shared hub excluded from cross-hub search
    Given hub "hub-portland" has sharing enabled
    And hub "hub-seattle" does NOT have sharing enabled
    And contact "Carlos Martinez" with phone "+15551234567" in both hubs
    When super-admin "superadmin1" searches by identifier hash for "+15551234567"
    Then the results should include only "hub-portland"
    And "hub-seattle" should not appear in results

  @cross-hub
  Scenario: Create referral from one hub to another
    Given an arrest case "JS-2026-0001" in "hub-portland"
    When super-admin "superadmin1" creates a referral:
      | sourceHubId    | hub-portland  |
      | targetHubId    | hub-seattle   |
      | sourceRecordId | JS-2026-0001  |
    Then a referral should be created with status "pending"
    And the referral should be visible in "hub-portland" as outbound
    And the referral should be visible in "hub-seattle" as inbound

  @cross-hub
  Scenario: Referral contains only summary-tier data
    Given a referral from "hub-portland" to "hub-seattle"
    When admin "admin-sea" views the inbound referral
    Then the referral should have encrypted summary data
    And the referral should NOT contain field-tier or PII-tier data

  @cross-hub @permissions
  Scenario: Non-super-admin cannot access cross-hub search
    Given a registered admin "admin-pdx" (hub admin, not super-admin)
    When admin "admin-pdx" tries to search cross-hub contacts
    Then the response status should be 403

  @cross-hub @permissions
  Scenario: Hub admin can view referrals for own hub
    Given an inbound referral to "hub-seattle"
    When admin "admin-sea" lists referrals
    Then the inbound referral should be visible
```

### Phase 2: Desktop UI

#### Task 7: Sharing Settings UI

**File**: `src/client/components/admin-settings/sharing-section.tsx` (new)

Admin settings section for cross-hub sharing:

```typescript
interface SharingSectionProps {
  hubId: string
  shareWithSuperAdmins: boolean
  onToggle: (enabled: boolean) => void
}
```

UI elements:
- Toggle switch for `shareWithSuperAdmins`
- Warning text explaining what is shared (summary-tier only)
- List of super-admin pubkeys that will receive envelopes
- Confirmation dialog before enabling

Key `data-testid` attributes:
- `sharing-toggle` -- the on/off switch
- `sharing-warning` -- warning text
- `sharing-confirm-dialog` -- confirmation dialog
- `sharing-super-admin-list` -- list of super-admin pubkeys

#### Task 8: Cross-Hub Contact Search (Super-Admin View)

**File**: `src/client/components/cases/CrossHubSearch.tsx` (new)

Super-admin-only search interface:

```typescript
interface CrossHubSearchProps {
  onContactFound: (result: CrossHubContactResult) => void
}
```

UI flow:
1. Super-admin enters an identifier (phone number)
2. Client computes identifier hash
3. Calls `GET /api/cross-hub/contacts/search?identifierHash=<hash>`
4. Shows results grouped by hub
5. Each result shows: hub name, case count, last interaction date
6. "View in hub" link to navigate to that hub's contact

Key `data-testid` attributes:
- `cross-hub-search-input` -- search input field
- `cross-hub-search-button` -- search button
- `cross-hub-result-{hubId}` -- each hub's result
- `cross-hub-case-count-{hubId}` -- case count per hub

#### Task 9: Referral Management UI

**File**: `src/client/components/cases/ReferralPanel.tsx` (new)

Panel shown on the record detail page (for outbound referrals) and in a dedicated referral inbox (for inbound):

```typescript
interface ReferralPanelProps {
  referrals: { outbound: Referral[]; inbound: Referral[] }
  onAccept: (referralId: string) => void
  onDecline: (referralId: string) => void
  onCreateReferral: (targetHubId: string) => void
}
```

Key `data-testid` attributes:
- `referral-panel` -- panel container
- `referral-inbound-{id}` -- each inbound referral
- `referral-outbound-{id}` -- each outbound referral
- `referral-accept-{id}` -- accept button
- `referral-decline-{id}` -- decline button
- `create-referral-button` -- create referral button

#### Task 10: i18n Strings

**File**: `packages/i18n/locales/en.json` (modify)

```json
{
  "crossHub": {
    "shareWithSuperAdmins": "Share case summaries with super-admins",
    "sharingWarning": "When enabled, super-admins can see case numbers, statuses, and entity types for this hub. Field values and PII are NOT shared.",
    "enableSharing": "Enable Sharing",
    "disableSharing": "Disable Sharing",
    "confirmEnable": "Are you sure? This will create summary-tier envelopes for all super-admin pubkeys.",
    "crossHubSearch": "Cross-Hub Contact Search",
    "searchPlaceholder": "Enter phone number or identifier...",
    "searchResults": "Found in {{count}} hub(s)",
    "noResults": "No matches found in any shared hub",
    "contactInHub": "Contact found in {{hubName}}",
    "viewInHub": "View in hub",
    "referrals": "Referrals",
    "inboundReferrals": "Incoming Referrals",
    "outboundReferrals": "Outgoing Referrals",
    "createReferral": "Create Referral",
    "acceptReferral": "Accept",
    "declineReferral": "Decline",
    "referralPending": "Pending",
    "referralAccepted": "Accepted",
    "referralDeclined": "Declined",
    "referralFrom": "From {{hubName}}",
    "referralTo": "To {{hubName}}"
  }
}
```

## Files to Create

| File | Purpose |
|------|---------|
| `apps/worker/routes/cross-hub.ts` | Cross-hub search and referral API routes |
| `apps/worker/schemas/cross-hub.ts` | Zod schemas for cross-hub types |
| `apps/worker/lib/shared-hub-registry.ts` | Helper to get sharing-enabled hubs |
| `src/client/components/admin-settings/sharing-section.tsx` | Hub sharing toggle UI |
| `src/client/components/cases/CrossHubSearch.tsx` | Super-admin cross-hub search |
| `src/client/components/cases/ReferralPanel.tsx` | Referral management UI |
| `packages/test-specs/features/core/cross-hub.feature` | Backend BDD scenarios |
| `tests/steps/backend/cross-hub.steps.ts` | Backend step definitions |
| `tests/steps/cases/cross-hub-steps.ts` | Desktop step definitions |

## Files to Modify

| File | Change |
|------|--------|
| `apps/worker/durable-objects/settings-do.ts` | Add shareWithSuperAdmins setting |
| `apps/worker/durable-objects/case-do.ts` | Add referral storage + handlers |
| `apps/worker/app.ts` | Mount cross-hub routes |
| `src/client/routes/admin/settings.tsx` | Add sharing section |
| `packages/i18n/locales/en.json` | Add crossHub i18n section |
| `packages/i18n/locales/*.json` | Propagate to all 13 locales |
| `tests/test-ids.ts` | Add cross-hub test IDs |

## Testing

### Backend BDD
- `bun run test:backend:bdd` -- 7 scenarios in `cross-hub.feature`

### Desktop BDD
- `bun run test:desktop` -- scenarios covered by backend BDD + manual testing for UI components

## Acceptance Criteria & Test Scenarios

- [ ] Hub sharing can be enabled/disabled
  -> `packages/test-specs/features/core/cross-hub.feature: "Enable sharing on a hub"`
- [ ] Cross-hub contact search returns matches from shared hubs
  -> `packages/test-specs/features/core/cross-hub.feature: "Cross-hub contact search finds matching identifier"`
- [ ] Non-shared hubs excluded from search
  -> `packages/test-specs/features/core/cross-hub.feature: "Non-shared hub excluded from cross-hub search"`
- [ ] Referrals can be created between hubs
  -> `packages/test-specs/features/core/cross-hub.feature: "Create referral from one hub to another"`
- [ ] Referrals contain only summary-tier data
  -> `packages/test-specs/features/core/cross-hub.feature: "Referral contains only summary-tier data"`
- [ ] Cross-hub search restricted to super-admins
  -> `packages/test-specs/features/core/cross-hub.feature: "Non-super-admin cannot access cross-hub search"`
- [ ] Hub admins can view referrals for their hub
  -> `packages/test-specs/features/core/cross-hub.feature: "Hub admin can view referrals for own hub"`
- [ ] All platform BDD suites pass
- [ ] Backlog files updated

## Feature Files

| File | Status | Description |
|------|--------|-------------|
| `packages/test-specs/features/core/cross-hub.feature` | New | 7 backend scenarios for cross-hub operations |
| `tests/steps/backend/cross-hub.steps.ts` | New | Backend step definitions |
| `tests/steps/cases/cross-hub-steps.ts` | New | Desktop step definitions |

## Risk Assessment

- **High risk**: Cross-hub DO access (Task 2) -- querying multiple hubs' ContactDirectoryDOs in a single request could be slow if many hubs are shared. Mitigated by iterating hubs sequentially with per-hub timeouts and skipping unavailable hubs. Future optimization: cache shared hub list in a dedicated DO.
- **Medium risk**: Envelope management (Task 1) -- when sharing is enabled, summary-tier envelopes must be created for super-admin pubkeys on ALL existing records. This is a bulk operation that must be queued and processed incrementally via DO alarm. The setting change itself returns immediately.
- **Medium risk**: Referral security (Task 2) -- referrals contain encrypted data wrapped for target hub admin pubkeys. The source hub's client must know the target hub's admin pubkeys. This requires a pubkey exchange mechanism (currently assumed to be manual configuration or discoverable via IdentityDO).
- **Low risk**: Schemas and routes (Tasks 3-4) -- standard patterns following existing conventions.

## Execution

- **Phase 1**: Sharing setting -> Cross-hub schema -> Shared hub registry -> Cross-hub routes -> CaseDO referral storage -> Mount routes -> BDD -> gate
- **Phase 2**: Sharing settings UI -> CrossHubSearch -> ReferralPanel -> i18n -> gate
- **Phase 3**: `bun run test:all`
