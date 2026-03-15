# Epic 327: Support Contact Notifications via Messaging

**Status**: PENDING
**Priority**: Medium
**Depends on**: Epic 322 (Contact Relationships & Networks), Epic 330 (Desktop Case Management UI — StatusChangeDialog)
**Blocks**: None
**Branch**: `desktop`

## Summary

Enable automatic and manual notification of support contacts when a case status changes. Support contacts (family members, attorneys, bail fund coordinators) have communication preferences stored in their ContactPII (preferredChannel: Signal, SMS, WhatsApp). When a case transitions between statuses (e.g., `in_custody` to `released`), the system checks all contacts linked to the case with the `support_contact` role whose relationship metadata includes `notifyOnStatusChange: true`, and sends a notification via their preferred messaging channel. Notifications use template-based messages that are rendered from i18n strings with case variables substituted. Leverages the existing MessagingAdapter infrastructure and ConversationDO for outbound message delivery. ~14 files created/modified.

## Problem Statement

During a mass arrest or crisis event, support contacts (family members, attorneys, bail fund coordinators) need timely updates on case status changes. Currently, volunteers must manually call or message each support contact when something changes -- during a mass arrest with dozens of cases, this is overwhelming and error-prone.

The system already has:
- Contact relationships with roles (Epic 322: support_contact, attorney, family)
- Communication preferences in ContactPII (preferredChannel, preferredLanguage)
- A full MessagingAdapter infrastructure (SMS, Signal, WhatsApp adapters)
- ConversationDO for managing outbound messages

What is missing is the glue: detecting status changes, resolving notification recipients, rendering template messages, and dispatching via the correct channel. This epic connects those existing pieces.

## Implementation

### Phase 1: API + Shared Specs

#### Task 1: Notification Trigger on Status Change

**File**: `apps/worker/durable-objects/case-do.ts` (modify)

When a record's status changes (detected in the PATCH /records/:id handler), emit a notification trigger:

```typescript
// In the PATCH handler, after updating the record:
if (body.statusHash && body.statusHash !== existing.statusHash) {
  // Queue notification job
  const notificationPayload: StatusChangeNotification = {
    recordId: id,
    entityTypeId: existing.entityTypeId,
    oldStatusHash: existing.statusHash,
    newStatusHash: body.statusHash,
    changedBy: actorPubkey,
    changedAt: new Date().toISOString(),
  }
  // Store pending notification for processing
  await this.ctx.storage.put(
    `pending-notification:${id}:${Date.now()}`,
    notificationPayload
  )
  // Trigger alarm for async processing
  this.ctx.storage.setAlarm(Date.now() + 100)
}
```

#### Task 2: Notification Processor

**File**: `apps/worker/lib/notification-processor.ts` (new)

Core notification resolution logic:

```typescript
export interface StatusChangeNotification {
  recordId: string
  entityTypeId: string
  oldStatusHash: string
  newStatusHash: string
  changedBy: string
  changedAt: string
}

export interface NotificationRecipient {
  contactId: string
  channel: 'signal' | 'sms' | 'whatsapp'
  identifier: string                    // Phone number, Signal username
  preferredLanguage: string
  contactRole: string                   // 'support_contact', 'attorney', etc.
}

export interface NotificationMessage {
  recipient: NotificationRecipient
  body: string
  caseNumber: string
}

/**
 * Resolve notification recipients for a status change.
 *
 * 1. Fetch all contacts linked to the record
 * 2. Filter to those with roles that have notifyOnStatusChange
 * 3. For each, decrypt their communication preferences
 * 4. Return the list of recipients with their preferred channels
 *
 * NOTE: Steps 2-3 require decryption, so this must happen client-side
 * or via a trusted service with access to the hub key.
 */
export async function resolveNotificationRecipients(
  caseManager: DurableObjectStub,
  contactDirectory: DurableObjectStub,
  recordId: string,
): Promise<{ contactId: string; role: string }[]> {
  // Fetch contacts linked to the record
  const contactsRes = await caseManager.fetch(
    new Request(`http://do/records/${recordId}/contacts`)
  )
  const { contacts } = await contactsRes.json() as {
    contacts: Array<{ contactId: string; role: string }>
  }

  // Filter to notifiable roles (support_contact, attorney, family)
  const notifiableRoles = ['support_contact', 'attorney', 'family']
  return contacts.filter(c => notifiableRoles.includes(c.role))
}
```

#### Task 3: Notification API Routes

**File**: `apps/worker/routes/notifications.ts` (new)

```typescript
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'
import { resolveNotificationRecipients } from '../lib/notification-processor'

const notifications = new Hono<AppEnv>()

/**
 * POST /api/records/:id/notify-contacts
 * Manual trigger: send status update notifications to support contacts.
 * Used when an admin wants to notify contacts outside of automatic triggers.
 *
 * Body: {
 *   statusLabel: string,     // Cleartext status label (client decrypts)
 *   caseNumber: string,      // Cleartext case number
 *   recipients: Array<{
 *     identifier: string,    // Phone/Signal address
 *     channel: 'sms' | 'signal' | 'whatsapp',
 *     message: string,       // Pre-rendered message body
 *   }>
 * }
 *
 * The client resolves recipients and renders messages (because it has
 * the decryption keys). The server just dispatches via MessagingAdapter.
 */
notifications.post('/:id/notify-contacts',
  requirePermission('cases:update'),
  async (c) => {
    const recordId = c.req.param('id')
    const body = await c.req.json() as {
      statusLabel: string
      caseNumber: string
      recipients: Array<{
        identifier: string
        channel: 'sms' | 'signal' | 'whatsapp'
        message: string
      }>
    }

    const results: Array<{
      identifier: string
      channel: string
      success: boolean
      error?: string
    }> = []

    for (const recipient of body.recipients) {
      try {
        const adapter = getMessagingAdapter(c.env, recipient.channel)
        const result = await adapter.sendMessage({
          recipientIdentifier: recipient.identifier,
          body: recipient.message,
          conversationId: `notify-${recordId}-${Date.now()}`,
        })
        results.push({
          identifier: recipient.identifier,
          channel: recipient.channel,
          success: result.success,
          error: result.error,
        })
      } catch (err) {
        results.push({
          identifier: recipient.identifier,
          channel: recipient.channel,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return c.json({
      recordId,
      notificationsSent: results.filter(r => r.success).length,
      notificationsFailed: results.filter(r => !r.success).length,
      results,
    })
  },
)

export default notifications
```

Key design decision: **Client-side message rendering**. The server cannot decrypt contact profiles or case content (E2EE). Therefore, the client must:
1. Decrypt the contact's communication preferences (channel, identifier)
2. Decrypt the case's status label
3. Render the notification message from i18n templates
4. Submit the pre-rendered message to the server for dispatch

The server acts as a dumb pipe -- it receives the rendered message and dispatches via the appropriate MessagingAdapter.

#### Task 4: Notification Schema

**File**: `apps/worker/schemas/notifications.ts` (new)

```typescript
import { z } from 'zod'

export const notifyContactsBodySchema = z.object({
  statusLabel: z.string(),
  caseNumber: z.string(),
  recipients: z.array(z.object({
    identifier: z.string(),
    channel: z.enum(['sms', 'signal', 'whatsapp']),
    message: z.string().max(1600),  // SMS limit
  })).min(1).max(100),
})

export const notificationResultSchema = z.object({
  recordId: z.string(),
  notificationsSent: z.number(),
  notificationsFailed: z.number(),
  results: z.array(z.object({
    identifier: z.string(),
    channel: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
  })),
})

export const statusChangeNotificationSchema = z.object({
  recordId: z.uuid(),
  entityTypeId: z.uuid(),
  oldStatusHash: z.string(),
  newStatusHash: z.string(),
  changedBy: z.string(),
  changedAt: z.string(),
})

export type StatusChangeNotification = z.infer<typeof statusChangeNotificationSchema>
```

#### Task 5: Notification Message Templates (i18n)

**File**: `packages/i18n/locales/en.json` (modify)

```json
{
  "notifications": {
    "statusChange": "Update on case {{caseNumber}}: status changed to {{status}}.",
    "statusChangeDetailed": "Case {{caseNumber}} ({{entityType}}) status changed from {{oldStatus}} to {{newStatus}} by {{changedBy}} at {{time}}.",
    "released": "Good news: the person in case {{caseNumber}} has been released.",
    "inCustody": "Case {{caseNumber}}: the person is now in custody.",
    "arraigned": "Case {{caseNumber}}: arraignment has occurred.",
    "courtDate": "Case {{caseNumber}}: court date set for {{courtDate}}.",
    "sendNotification": "Send Notification",
    "notifyContacts": "Notify Support Contacts",
    "selectRecipients": "Select recipients to notify",
    "notificationSent": "{{count}} notification(s) sent successfully",
    "notificationFailed": "{{count}} notification(s) failed to send",
    "noNotifiableContacts": "No support contacts with notification preferences",
    "channelPreference": "Preferred channel",
    "notifyOnStatusChange": "Notify on status change"
  }
}
```

#### Task 6: BDD Feature File

**File**: `packages/test-specs/features/core/support-notifications.feature` (new)

```gherkin
@backend
Feature: Support Contact Notifications
  Support contacts receive notifications when case status changes.
  Notifications are sent via their preferred messaging channel.

  Background:
    Given a registered admin "admin1"
    And case management is enabled
    And an entity type "arrest_case" with numberPrefix "JS"
    And messaging adapters are configured for "sms" and "signal"

  @notifications
  Scenario: Manual notification on status change
    Given an arrest case "JS-2026-0001" exists
    And a support contact "Maria Garcia" linked to the case
    When admin "admin1" sends a notification to support contacts with:
      | identifier | +15559876543 |
      | channel    | sms          |
      | message    | Update on case JS-2026-0001: status changed to Released. |
    Then the notification should be dispatched via SMS
    And the response should show 1 notification sent

  @notifications
  Scenario: Multiple recipients via different channels
    Given an arrest case "JS-2026-0001" exists
    And support contacts:
      | name          | channel  | identifier    |
      | Maria Garcia  | sms      | +15559876543  |
      | Attorney Lee  | signal   | attorney.lee  |
    When admin "admin1" sends notifications to all support contacts
    Then 2 notifications should be dispatched
    And "Maria Garcia" should receive via SMS
    And "Attorney Lee" should receive via Signal

  @notifications
  Scenario: Failed notification does not block others
    Given an arrest case with 3 support contacts
    And SMS adapter will fail for "+15550000000"
    When admin "admin1" sends notifications to all contacts
    Then 2 notifications should succeed
    And 1 notification should fail
    And the failure reason should be included in the response

  @notifications
  Scenario: Empty recipients returns validation error
    Given an arrest case "JS-2026-0001" exists
    When admin "admin1" sends notifications with no recipients
    Then the response status should be 400

  @notifications @permissions
  Scenario: Volunteer without cases:update cannot send notifications
    Given a registered volunteer "vol1" without "cases:update" permission
    When volunteer "vol1" tries to send notifications for a case
    Then the response status should be 403
```

### Phase 2: Desktop UI

#### Task 7: NotifyContactsDialog Component

**File**: `src/client/components/cases/NotifyContactsDialog.tsx` (new)

Displayed from the record detail page when a status change occurs or when manually triggered:

```typescript
interface NotifyContactsDialogProps {
  recordId: string
  caseNumber: string
  statusLabel: string
  entityTypeLabel: string
  contacts: Array<{
    contactId: string
    displayName: string
    role: string
    channel: 'sms' | 'signal' | 'whatsapp'
    identifier: string
    notifyOnStatusChange: boolean
  }>
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

UI flow:
1. Dialog shows list of support contacts with checkboxes
2. Pre-checked contacts have `notifyOnStatusChange: true`
3. Message preview shows the rendered notification text
4. "Send" button dispatches to `POST /api/records/:id/notify-contacts`
5. Results shown: success/failure per recipient

Uses shadcn/ui: `Dialog`, `Checkbox`, `Badge`, `Button`, `ScrollArea`

Key `data-testid` attributes:
- `notify-contacts-dialog` -- dialog root
- `notify-recipient-{contactId}` -- checkbox for each recipient
- `notify-message-preview` -- message preview text
- `notify-send-button` -- send button
- `notify-result-success` -- success count display
- `notify-result-failure` -- failure count display

#### Task 8: Status Change Notification Trigger

**File**: `src/client/components/cases/StatusChangeDialog.tsx` (modify -- created in Epic 330)

After a status change is confirmed and saved, check if there are notifiable support contacts:

```typescript
// After successful PATCH /api/records/:id with new statusHash:
const supportContacts = decryptedContacts.filter(
  c => c.role === 'support_contact' && c.notifyOnStatusChange
)
if (supportContacts.length > 0) {
  setShowNotifyDialog(true)
}
```

#### Task 9: Desktop BDD Feature File

**File**: `packages/test-specs/features/platform/desktop/cases/notifications.feature` (new)

```gherkin
@desktop
Feature: Support Contact Notifications (Desktop)
  Admin can notify support contacts when case status changes.

  Background:
    Given the user is logged in as an admin
    And case management is enabled

  @notifications
  Scenario: Notification dialog appears after status change
    Given an arrest case with a support contact who has notification enabled
    When the admin changes the case status to "Released"
    Then the "Notify Support Contacts" dialog should appear
    And the support contact should be pre-selected

  @notifications
  Scenario: Send notification to selected contacts
    Given the "Notify Support Contacts" dialog is open
    And 2 support contacts are selected
    When the admin clicks "Send"
    Then a success message should show "2 notification(s) sent"

  @notifications
  Scenario: Skip notification
    Given the "Notify Support Contacts" dialog is open
    When the admin closes the dialog without sending
    Then no notifications should be sent
    And the status change should still be saved
```

## Files to Create

| File | Purpose |
|------|---------|
| `apps/worker/routes/notifications.ts` | Notification dispatch API route |
| `apps/worker/schemas/notifications.ts` | Zod schemas for notification types |
| `apps/worker/lib/notification-processor.ts` | Recipient resolution + notification logic |
| `src/client/components/cases/NotifyContactsDialog.tsx` | Notification recipient selection dialog |
| `packages/test-specs/features/core/support-notifications.feature` | Backend BDD scenarios |
| `packages/test-specs/features/platform/desktop/cases/notifications.feature` | Desktop BDD scenarios |
| `tests/steps/backend/notifications.steps.ts` | Backend step definitions |
| `tests/steps/cases/notification-steps.ts` | Desktop step definitions |

## Files to Modify

| File | Change |
|------|--------|
| `apps/worker/durable-objects/case-do.ts` | Add notification trigger on status change |
| `apps/worker/app.ts` | Mount notifications routes |
| `src/client/components/cases/StatusChangeDialog.tsx` | Trigger notification dialog after status change |
| `packages/i18n/locales/en.json` | Add notifications i18n section |
| `packages/i18n/locales/*.json` | Propagate to all 13 locales |
| `tests/test-ids.ts` | Add notification-related test IDs |

## Testing

### Backend BDD
- `bun run test:backend:bdd` -- 5 scenarios in `support-notifications.feature`

### Desktop BDD
- `bun run test:desktop` -- 3 scenarios in `notifications.feature`

## Acceptance Criteria & Test Scenarios

- [ ] Manual notification dispatch works via API
  -> `packages/test-specs/features/core/support-notifications.feature: "Manual notification on status change"`
- [ ] Multiple recipients via different channels dispatched correctly
  -> `packages/test-specs/features/core/support-notifications.feature: "Multiple recipients via different channels"`
- [ ] Partial failures do not block successful dispatches
  -> `packages/test-specs/features/core/support-notifications.feature: "Failed notification does not block others"`
- [ ] Input validation enforced
  -> `packages/test-specs/features/core/support-notifications.feature: "Empty recipients returns validation error"`
- [ ] Permission enforcement (cases:update required)
  -> `packages/test-specs/features/core/support-notifications.feature: "Volunteer without cases:update cannot send notifications"`
- [ ] Notification dialog appears after status change in desktop UI
  -> `packages/test-specs/features/platform/desktop/cases/notifications.feature: "Notification dialog appears after status change"`
- [ ] Notifications sent from desktop UI
  -> `packages/test-specs/features/platform/desktop/cases/notifications.feature: "Send notification to selected contacts"`
- [ ] All platform BDD suites pass
- [ ] Backlog files updated

## Feature Files

| File | Status | Description |
|------|--------|-------------|
| `packages/test-specs/features/core/support-notifications.feature` | New | 5 backend scenarios for notification dispatch |
| `packages/test-specs/features/platform/desktop/cases/notifications.feature` | New | 3 desktop scenarios for notification UI |
| `tests/steps/backend/notifications.steps.ts` | New | Backend step definitions |
| `tests/steps/cases/notification-steps.ts` | New | Desktop step definitions |

## Risk Assessment

- **Medium risk**: E2EE constraint on message rendering (Task 3) -- the server cannot decrypt contact profiles or case content, so the client must resolve recipients and render messages before submitting. This adds latency (client does extra API calls + decryption before dispatch) but preserves the E2EE guarantee. No workaround is acceptable.
- **Low risk**: MessagingAdapter reliability (Task 3) -- individual adapter failures are caught per-recipient and reported in the response. The notification dispatch loop continues even when one adapter fails.
- **Low risk**: i18n template rendering (Task 5) -- standard i18n interpolation using existing react-i18next patterns. Templates are simple string substitution, not complex formatting.
- **Low risk**: Desktop UI (Tasks 7-8) -- standard dialog component using existing shadcn/ui primitives.

## Execution

- **Phase 1**: Notification schema -> Notification processor -> API routes -> Mount -> CaseDO trigger -> i18n -> BDD -> gate
- **Phase 2**: NotifyContactsDialog -> StatusChangeDialog integration -> Desktop BDD -> gate
- **Phase 3**: `bun run test:all`
