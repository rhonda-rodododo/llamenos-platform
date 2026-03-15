# Epic 337: Mobile Case Management Views (Template-Driven)

**Status**: PENDING
**Priority**: Medium
**Depends on**: Epic 319 (Record Entity), Epic 340 (Volunteer Profiles), Epic 343 (Template-Defined Report Types)
**Branch**: `desktop`

## Summary

Build generic, template-driven mobile views for field volunteers on iOS (SwiftUI) and Android (Compose). The mobile interface shows whatever entity types, fields, statuses, and roles the hub's applied templates define — NOT hardcoded to any specific use case. A jail support volunteer sees arrest case fields because that's what the jail-support template defines. A street medic sees triage fields because that's what the street-medic template defines. The language, labels, and available actions all come from the template.

## Problem Statement

The desktop CRM is a full-featured interface for coordinators and admins. But field volunteers (jail support at the courthouse, street medics at a protest, ICE rapid responders, **legal observers at protests**) need a mobile interface for:
- Viewing their assigned cases with summary info
- Quick status updates (tap to change status)
- Viewing upcoming dates (court dates, follow-ups)
- Adding quick comments to case timelines
- Seeing contact info for people they're supporting
- **Submitting field reports** — LOs need to submit arrest reports and misconduct reports from the field. This is the highest-priority mobile CMS use case.

This must work WITHOUT hardcoding any specific template's fields. The mobile app reads the EntityTypeDefinition and **ReportTypeDefinition** from the API and renders fields dynamically — same SchemaForm concept as desktop, but optimized for touch.

## Architecture: Template-Driven Mobile

### How It Works

1. Mobile app calls `GET /api/settings/cms/entity-types` to get all entity types for the hub
2. For each entity type with `showInNavigation: true`, mobile shows a tab/section
3. Field rendering is driven by `EntityTypeDefinition.fields[]` — same as desktop SchemaForm
4. Status colors, labels, severity badges all come from the entity type definition
5. Role-scoped: the volunteer only sees entity types allowed by their `accessRoles`
6. Labels come from template i18n — not hardcoded English

### What The Volunteer Sees

**If hub uses jail-support template (Legal Observer role):**
- Primary action: **"Submit Report"** button (prominent, top of screen)
- Report type picker: "Arrest Report" or "Misconduct Report" (from template reportTypes)
- Report form: freeform textarea with **audio input** (tap mic, dictate, text appears)
- Media attach: camera/gallery for photos and video
- Submit → encrypted → server → appears in jail support coordinator's triage queue

**If hub uses jail-support template (Jail Support Coordinator role):**
- Tab: "Arrest Cases" (from template label)
- List: case numbers, status pills (Reported/In Custody/Released in template colors)
- Detail: arrest location, charges, attorney status (from template fields)
- Quick actions: change status, add comment

**If hub uses street-medic template:**
- Tab: "Medical Encounters" (from template label)
- List: case numbers, triage severity (Green/Yellow/Red/Black in template colors)
- Detail: chief complaint, mechanism of injury, disposition (from template fields)
- Quick actions: change status, add comment

**Same code, different configuration.**

## Implementation

### iOS (SwiftUI)

7 views, all template-driven:
1. **CaseListView** — entity type tabs, filterable case list
2. **CaseSummaryView** — read-only detail with template-driven field display
3. **QuickStatusSheet** — tap status picker with template statuses and colors
4. **DateCalendarView** — aggregated date fields across cases ("3 court dates this week")
5. **AddCommentSheet** — textarea, encrypt, POST interaction
6. **SubmitReportView** — report type picker, template-driven form with freeform textarea, audio input (iOS Speech framework), media attach (camera/gallery), submit
7. **MyReportsView** — list of reports submitted by this user with status

### Android (Compose)

Same 7 screens:
1. **CaseListScreen** — entity type tabs, lazy column list
2. **CaseSummaryScreen** — read-only detail
3. **QuickStatusSheet** — bottom sheet with status options
4. **DateCalendarScreen** — date aggregation view
5. **AddCommentSheet** — text input, encrypt, POST
6. **SubmitReportScreen** — report type picker, template-driven form, audio input (SpeechRecognizer), media attach, submit
7. **MyReportsScreen** — list of user's submitted reports

### Shared

- **Schema rendering logic**: Both platforms parse EntityTypeDefinition.fields and ReportTypeDefinition.fields and render appropriate native controls
- **Audio input**: Textarea fields with `supportAudioInput: true` show a mic button. iOS uses Speech framework, Android uses SpeechRecognizer. Audio is transcribed on-device and appended to the textarea. Audio never leaves the device.
- **Media attachments**: Camera capture and gallery selection for photo/video. Files are encrypted client-side before upload (same as desktop evidence).
- **Offline queue**: Status updates, comments, and **report submissions** queued when offline, synced on connectivity. LOs may lose connectivity at protests — reports must queue.
- **Summary-tier only for cases**: Mobile decrypts only summary-tier data for cases (not fields or PII). Reports submitted by the user are fully readable by the submitter.

## NOT on Mobile

- Entity type editor / template browser (admin desktop only)
- Contact directory (too complex for field work)
- Evidence chain of custody management (desktop — but media upload with reports IS on mobile)
- Bulk operations (needs multi-select)
- Relationship graph visualization
- Report triage / report-to-case conversion (desktop — coordinators do this, not field LOs)

## Acceptance Criteria

- [ ] Mobile app shows entity type tabs from hub's applied templates
- [ ] Field labels, status names, and colors come from template definitions
- [ ] Volunteers see only entity types allowed by their role
- [ ] Status change works (tap, select, confirm, synced)
- [ ] Comment addition works (type, encrypt, POST)
- [ ] **Report submission works** — template-driven report form with freeform textarea
- [ ] **Audio input works** — tap mic, dictate, text appears in textarea
- [ ] **Media attachment works** — camera/gallery photos and video attached to reports
- [ ] **Offline queue** handles connectivity loss for reports, status changes, and comments
- [ ] Same mobile code works for ANY template (jail support, street medic, etc.)
- [ ] Legal Observer role sees "Submit Report" as primary action, not case list
