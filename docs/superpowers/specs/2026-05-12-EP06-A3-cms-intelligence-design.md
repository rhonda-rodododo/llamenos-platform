---
epic: EP06
phase: A3
title: "CMS Intelligence — Assignment, Automation, Triage"
status: specced
depends-on: [EP06-A1]
blocks: []
---

# Spec: EP06-A3 — CMS Intelligence

**Date:** 2026-05-12
**Status:** Specced

---

## Goal

Wire up the intelligent automation layer of the CMS: fix the broken specialization scoring for case assignment, enable auto-assignment at entity creation, implement contact notification dispatch from case status changes, route assignment push notifications through the encrypted WebSocket relay, and complete the report-to-case atomic conversion endpoint. This phase runs in parallel with A2 (Write UX) since it operates on the backend and automation layer, not the write UI.

---

## Architecture Decisions

### 1. Specialization scoring — real matching, not +5 stub

The current `getAssigneeSuggestions` endpoint returns a flat +5 score for any specialization match. This must be replaced with entity-type-aware scoring:

**Scoring formula:**
```
score = workloadScore + languageScore + specializationScore + availabilityScore

workloadScore = max(0, 20 - (currentAssignments * 4))  // 0-20 range, decreases as workload increases
languageScore = spokenLanguages.includes(caseLanguage) ? 15 : 0
specializationScore = matchedSpecializations / requiredSpecializations * 25  // 0-25 range, proportional
availabilityScore = isOnShift ? 10 : 0
```

Entity types define `requiredSpecializations` (array of specialization tags). Volunteers have `specializations` (array of tags in their profile). Scoring matches the intersection.

**Data model additions:**
- Entity type definition: `requiredSpecializations: string[]` (already partially supported via categories)
- User profile: `specializations: string[]` (encrypted, blind-indexed with `HMAC_CONTACT_TAG`)
- User profile: `maxCaseAssignments: number | null` (null = unlimited)

### 2. Auto-assignment at entity creation

When `autoAssign` is enabled on an entity type, the record creation endpoint:
1. Creates the entity
2. Calls `getAssigneeSuggestions` internally
3. If a volunteer scores above the auto-assignment threshold, assigns automatically. Threshold is configurable per entity type (default: 30, range: 10-50). Set via `autoAssignThreshold` in entity type definition. Hub admins can tune this in entity type configuration.
4. Publishes assignment event via encrypted WebSocket relay
5. Returns the entity with assignment info

This is opt-in per entity type — many entity types (events, notes) don't need assignment.

### 3. Contact notification dispatch — client-side rendered

When a case status changes and the entity type has `notifyContactsOnStatusChange` enabled:
1. Desktop/mobile shows a "Notify Contacts?" prompt after status change
2. User selects contacts to notify and channel (SMS, Signal, WhatsApp, etc.)
3. Client renders notification message from template (E2EE constraint — server can't read contact PII to personalize messages)
4. Client sends rendered messages to `POST /records/:id/notify-contacts`
5. Server dispatches via appropriate messaging adapter

**Template variables available client-side:**
- `{{status}}` — new status label (decrypted from entity)
- `{{caseNumber}}` — case number (cleartext)
- `{{hubName}}` — hub name (decrypted from hub config)

Contact PII (name, phone) is decrypted client-side for addressing. The notification message body is necessarily plaintext for dispatch (SMS/Signal can't decrypt custom encryption). The privacy guarantee is decoupled identity: the server receives the delivery identifier hash separately from the message body, so it dispatches the message without being able to correlate "which contact" with "which case" — the identifier hash is one-way and the message body contains only the rendered template text, not the contact's identity.

### 4. Assignment push via encrypted WebSocket — not Nostr

Case assignment events publish through the encrypted WebSocket relay (`ws-events.ts`), not Nostr. The event payload:
```json
{
  "type": "case:assigned",
  "hubId": "...",
  "recordId": "...",
  "assignedTo": "pubkey",
  "entityTypeId": "..."
}
```

Payload contains only IDs — no case content, no PII. The assignee's client receives the event, fetches the full entity via API, and decrypts locally.

Mobile push notifications (iOS APNS, Android FCM) use a similarly minimal payload:
```json
{
  "type": "case_assigned",
  "hubId": "...",
  "recordId": "..."
}
```

The mobile app handles the push by fetching and decrypting the entity on-device.

### 5. Report-to-entity atomic conversion

Triage workflow: a report (intake submission) can be converted to a full entity (case). This is currently a disconnected create+link flow. The atomic conversion:
1. `POST /records/convert-from-report` receives `{ reportId, entityTypeId, additionalFields }`
2. Server in a single transaction:
   - Creates new entity record
   - Links report to entity
   - Updates report status to "converted"
   - Copies report field values to entity fields (where field names match)
   - Preserves report's original encrypted content as first interaction on the entity
3. Returns the new entity

Field mapping is strict name-based matching only — no fuzzy matching. Unmatched report fields are preserved in the interaction record, not silently dropped.

### 6. Firehose integration — already complete, just wiring

The firehose (LLM-powered message extraction) is fully implemented in v2:
- `firehose-agent.ts` — extraction orchestration with circuit breaker
- `firehose-inference.ts` — LLM inference with JSON Schema field extraction
- `firehose-observer.ts` — messaging router integration
- `firehose.ts` routes — connection CRUD
- DB schema for connections, message buffers, opt-outs

What's needed: ensure firehose-extracted reports flow through the triage → entity conversion pipeline. Firehose creates reports; triage reviews them; conversion creates entities. The pipeline should be seamless.

**UI gap:** Desktop has a triage view (`triage.tsx`) but no "Convert to Entity" button using the atomic conversion endpoint. Mobile has no triage view.

---

## Current State

### Backend
- **Assignment suggestions:** `GET /records/:id/suggest-assignees` exists but scoring is stub (+5 for any specialization)
- **Assignment:** `POST /records/:id/assign` and `POST /records/:id/unassign` fully implemented
- **Contact notification:** `POST /records/:id/notify-contacts` route exists but no client API function or UI
- **Report-to-case conversion:** No atomic conversion endpoint — triage UI creates case and links report separately
- **Firehose:** Fully implemented — agent, inference, observer, routes, DB schema, tests
- **WebSocket relay:** Fully implemented — encrypted events, Ed25519 auth, fan-out, rate limiting

### Desktop
- **Assignment dialog:** Exists in case detail view, shows suggestions
- **Triage view:** `triage.tsx` with status tabs, report content display, case creation panel — but no atomic conversion
- **Contact notification:** No UI
- **Firehose admin:** Firehose connection management in admin settings

### iOS
- **Assignment:** No assignment UI
- **Triage:** No triage view
- **Contact notification:** No UI
- **Firehose:** No admin UI (acceptable — firehose config is complex, desktop OK)

### Android
- **Assignment:** No assignment UI
- **Triage:** No triage view
- **Contact notification:** No UI
- **Firehose:** No admin UI

---

## Gaps This Phase Addresses

| # | Gap | From EP06 Stub |
|---|-----|----------------|
| 1 | Specialization scoring fix | Gap 9 |
| 2 | Auto-assignment wiring | Gap 9 |
| 3 | Contact notification UI + client API | Gap 10 |
| 4 | Assignment push notifications | Gap 10 |
| 5 | Report-to-entity conversion endpoint | Gap 10 |
| 6 | Triage "Convert to Entity" UI | Gap 10 |
| 7 | Mobile triage view | New (mobile hub admin) |
| 8 | Mobile assignment UI | New (mobile hub admin) |

---

## Threat Model Considerations

### Assignment event payloads
Assignment events via WebSocket contain only `recordId`, `hubId`, `assignedTo` (pubkey). No entity content, no PII, no case details. The receiving client fetches and decrypts the full entity separately.

### Push notification minimalism
Mobile push payloads (APNS/FCM) contain only `type`, `hubId`, `recordId`. No readable content in the push — prevents lock screen information leakage. The app decrypts entity details on-demand after the user opens the notification.

### Contact notification E2EE
Server is a dumb dispatch pipe for contact notifications. Client:
1. Decrypts contact PII to get delivery address (phone, Signal ID)
2. Renders notification message from template client-side
3. Sends rendered message + delivery address hash to server
4. Server dispatches via messaging adapter without seeing the plaintext combination of who + what

The server sees: delivery channel + identifier hash + encrypted message. It can dispatch but cannot correlate "which contact got which notification."

### Auto-assignment scoring data
Scoring uses:
- Workload count: server-side query (no PII)
- Language match: blind-indexed `spokenLanguages` on user profile — server matches hashes, not plaintext
- Specialization match: blind-indexed `specializations` — server matches hashes
- Availability: shift status (cleartext, non-sensitive)

Server computes scores without decrypting any user or entity data.

### Triage conversion atomicity
The atomic conversion endpoint prevents the half-created state where a report is linked to a case that wasn't fully created (data integrity). The transaction wraps creation + linking + status update.

---

## Permission Model

| Permission | Allows | Platforms |
|---|---|---|
| `cases:assign` | Assign/unassign volunteers to entities | All |
| `cases:create` | Create entities (including via report conversion) | All |
| `cases:update` | Update entity status (triggers notification prompt) | All |
| `contacts:view` | Required for notification dispatch (see contact PII) | All |
| `settings:manage-cms` | Configure entity type auto-assignment, notification settings | All (hub admin) |
| `reports:triage` | Access triage view, convert reports to entities | All (hub admin + case managers) |

---

## Mobile UX Patterns

### Assignment on mobile (iOS/Android)
1. Entity detail view → "Assign" button (visible with `cases:assign` permission)
2. Assignment sheet: list of suggested volunteers with scores
3. Each row: volunteer display name, score breakdown (workload, language, specialization)
4. Tap to assign → confirmation → WebSocket event published
5. "Auto-assigned" badge on entities that were auto-assigned at creation

### Triage on mobile (iOS/Android)
1. Navigation: triage tab visible to users with `reports:triage` permission
2. Report list: status tabs (pending, reviewing, converted, dismissed)
3. Tap report → full-screen detail with decrypted content
4. Actions: "Convert to Entity" → entity type picker → review mapped fields → confirm
5. Actions: "Dismiss" → confirmation dialog
6. After conversion: navigate to new entity detail

### Contact notification prompt (iOS/Android)
1. After entity status change → "Notify linked contacts?" bottom sheet
2. Contact list: multi-select contacts to notify
3. Channel picker: SMS, Signal, WhatsApp (based on contact's known channels)
4. Message preview: rendered from template with status/case number
5. "Send" dispatches via server
6. Delivery status feedback in entity timeline

---

## Implementation Scope

### Backend
1. **Fix specialization scoring** — replace stub with real formula in `getAssigneeSuggestions`, extract scoring into `assignment-scorer.ts` utility
2. **Add `requiredSpecializations` to entity type schema** — protocol schema update + DB migration for entity type definitions
3. **Auto-assignment wiring** — optional auto-assign step in record creation endpoint
4. **Report-to-entity conversion endpoint** — `POST /records/convert-from-report` with transaction
5. **Entity type notification settings** — `notifyContactsOnStatusChange` flag on entity type definitions
6. **WebSocket event for assignment** — publish `case:assigned` event via encrypted relay

### Desktop
7. **Fix assignment dialog scoring display** — show score breakdown, not just flat score
8. **Triage "Convert to Entity" button** — wire to atomic conversion endpoint
9. **Contact notification dialog** — post-status-change prompt with contact picker, channel selector, template preview
10. **Client API functions** — `convertReportToEntity()`, `notifyContacts()`

### iOS
11. **Assignment UI** — assignment sheet in entity detail with volunteer suggestions
12. **Triage view** — report list with status tabs, detail view, conversion action
13. **Contact notification prompt** — bottom sheet after status change
14. **Push notification handling** — `case_assigned` push → fetch + decrypt entity

### Android
15. **Assignment UI** — assignment bottom sheet in entity detail with volunteer suggestions
16. **Triage view** — report list with status tabs, detail view, conversion action
17. **Contact notification prompt** — bottom sheet after status change
18. **Push notification handling** — `case_assigned` push → fetch + decrypt entity

### Protocol / i18n
19. **Protocol schemas** — conversion request/response, notification request, updated entity type with `requiredSpecializations` and `notifyContactsOnStatusChange`
20. **i18n strings** — all 13 locales: scoring labels, triage actions, notification prompts, conversion confirmations

---

## References

- Existing spec: `2026-03-21-cms-smart-assignment.md` — scoring formula and auto-assignment detail
- Existing spec: `2026-03-21-cms-automation.md` — notification dispatch and conversion detail
- Assignment suggestions endpoint: `apps/worker/routes/records.ts` (`/suggest-assignees`)
- Firehose implementation: `apps/worker/services/firehose-agent.ts`
- WebSocket relay: `apps/worker/lib/ws-events.ts`
- Triage UI: `src/client/routes/triage.tsx`
