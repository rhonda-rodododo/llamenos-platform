# Epic 272: iOS Feature Screens Polish

**Status**: PENDING
**Depends on**: Epic 269 (Design System Foundation)
**Branch**: `desktop`

## Summary

Polish all feature screens (Notes, Conversations, Shifts, Reports, Blasts, Contacts) with brand typography, semantic colors, card-based layouts, and improved visual hierarchy. Each screen gets targeted improvements, not a full rewrite.

## Problem Statement

Feature screens use stock SwiftUI List styling with minimal brand presence. Notes are plain rows with tiny badges. Conversation bubbles use system blue. The shifts clock-in button is a generic bordered button. Reports and Blasts lack visual hierarchy.

## Current Files

| File | Lines | Changes |
|------|-------|---------|
| `Views/Notes/NotesView.swift` | 259 | Card rows, accent borders |
| `Views/Notes/NoteCreateView.swift` | 315 | Branded form styling |
| `Views/Notes/NoteDetailView.swift` | 286 | Brand cards, collapsible metadata |
| `Views/Conversations/ConversationsView.swift` | 280 | Generated avatars, card rows |
| `Views/Conversations/ConversationDetailView.swift` | 310 | Brand-colored bubbles |
| `Views/Shifts/ShiftsView.swift` | 305 | Circular clock button, day pills |
| `Views/Reports/ReportsView.swift` | ~200 | Card rows, status colors |
| `Views/Reports/ReportCreateView.swift` | ~150 | Branded form |
| `Views/Reports/ReportDetailView.swift` | ~200 | Brand cards |
| `Views/Blasts/BlastsView.swift` | ~200 | Channel pills, status hierarchy |
| `Views/Blasts/CreateBlastView.swift` | ~150 | Branded form |
| `Views/Contacts/ContactsView.swift` | ~200 | Brand cards |
| `Views/Contacts/ContactTimelineView.swift` | ~200 | Timeline styling |

## Tasks

### 1. Notes — Card Rows with Accent Borders

**NotesView:**
- Note rows become `BrandCard` instances with a left accent border:
  - Has call → teal left border (4pt)
  - Has conversation → green left border
  - Standalone → `brandBorder` left border
- Preview text: `.brand(.body)`, bold first line
- Author + badges: use `BadgeView` component (from Epic 269)
- Date: `.brand(.footnote)`, `brandMutedForeground`
- "Load More" button: styled with `brandPrimary` text

**NoteCreateView:**
- Form sections: `BrandCard` containers instead of plain Form sections
- TextEditor: `brandCard` background, `brandBorder` outline, `brandPrimary` focus ring
- Custom field inputs: consistent styling with brand tokens
- Save button: `brandPrimary` fill, matches auth flow CTA style

**NoteDetailView:**
- Note text: full-width, `.brand(.body)`, generous padding
- Custom fields: `BrandCard` with field label-value pairs
- Metadata: `BrandCard` with collapsible section (DisclosureGroup)
- Call/Conversation IDs: use `CopyableField` (from Epic 269)

### 2. Conversations — Brand Bubbles & Generated Avatars

**ConversationsView:**
- Contact identifier: generate a colored circle avatar from the hash:
  - Take first 6 chars of hash → map to a hue (0-360)
  - Display as a 36x36 circle with the hue at 60% saturation
  - First 2 chars of hash displayed as "initials" inside
- Channel badge: integrated into the avatar (small icon overlay in bottom-right)
- Unread badge: `brandDestructive` background (not plain red)
- Status badge: uses `BadgeView` with semantic colors
- Row padding and spacing increased for readability

**ConversationDetailView:**
- Outbound bubbles: `brandPrimary` background (not `.accentColor`)
- Inbound bubbles: `brandCard` background with `brandBorder` outline
- Timestamp text: `.brand(.caption2)`, `brandMutedForeground`
- Channel header: compact colored strip using channel color (SMS=blue, WhatsApp=green, Signal=teal)
- Reply bar: `brandCard` background, `brandBorder` top divider, send button uses `brandPrimary`

### 3. Shifts — Circular Clock Button & Day Pills

**ShiftsView:**
- Clock in/out: replace rectangular button with a large circular button (80x80pt):
  - Clock in: green circle, white play icon, subtle shadow
  - Clock out: red circle, white stop icon
  - Press animation: scale to 0.9 on press
  - Haptic on tap
- Shift status indicator: use `StatusDot` (animated pulse when on shift)
- Elapsed timer: larger, uses `.brandMono(.title2)`, green when active
- Weekly schedule headers: day names as horizontal scrollable pills
  - Today's pill: `brandPrimary` background, white text
  - Other days: `brandMuted` background, `brandMutedForeground` text
  - Tapping a pill scrolls to that day's section
- Shift rows: use `BrandCard` with time range prominent, volunteer count as `BadgeView`
- Sign Up button: `brandPrimary` bordered, compact

### 4. Reports — Status-Coded Cards

**ReportsView:**
- Report rows as `BrandCard` instances
- Status badge uses semantic colors:
  - Open: `statusActive` (green)
  - Pending/Waiting: `statusWarning` (amber)
  - Closed: `brandMutedForeground` (gray)
- Category badge: `brandPrimary` subtle background
- Create button: `brandPrimary` tint

**ReportCreateView:**
- Branded form layout matching NoteCreateView pattern
- Category picker: styled segments or menu

**ReportDetailView:**
- Header: title in `.brand(.title2)`, status + category badges in `HStack`
- Metadata card: `BrandCard` with label-value pairs
- Action buttons: brand-styled (Claim=`brandPrimary`, Close=`brandDestructive`)

### 5. Blasts — Channel Pills & Status Hierarchy

**BlastsView:**
- Subscriber stats: compact `BrandCard` with 3 metrics (active/total/paused)
- Blast rows as `BrandCard` instances:
  - Name: `.brand(.headline)` — most prominent
  - Status badge: draft=`brandMutedForeground`, scheduled=`brandAccent`, sent=`statusActive`
  - Channel targets as horizontal pill badges (SMS=blue, WhatsApp=green, Signal=teal)
  - Message preview: `.brand(.caption)`, 2 lines, `brandMutedForeground`
- "Send Now" button: `brandPrimary` compact button (only for drafts)

**CreateBlastView:**
- Branded form matching other create forms

### 6. Contacts — Branded Search & Timeline

**ContactsView:**
- Search bar: brand-styled (standard `.searchable` is fine, iOS handles styling)
- Contact rows as `BrandCard`:
  - Identifier in `.brandMono(.body)` with generated color avatar (same as conversations)
  - Interaction badges: use `BadgeView` for calls/conversations/notes/reports counts
  - Last seen: `.brand(.footnote)`, `brandMutedForeground`

**ContactTimelineView:**
- Summary header: large generated avatar + identifier + total count
- Timeline events: vertical timeline with colored dots + connecting line:
  - Event icon colored by type
  - `BrandCard` for event content
  - Time/duration in `.brand(.caption)`
- This is the most visually ambitious change in this epic

### 7. Update XCUITests

- Update tests for any changed accessibility identifiers
- Verify note, conversation, shift, report, blast, contact flows all pass
- Pay special attention to conversation bubble identifiers (color change shouldn't affect them)

## Files Modified

All files listed in the table above, plus test files.

## Acceptance Criteria

- [ ] Note rows have colored left accent borders and use BrandCard
- [ ] NoteCreateView/NoteDetailView use branded form styling
- [ ] Conversation list has generated color avatars from contact hash
- [ ] Outbound message bubbles use brandPrimary (not system blue)
- [ ] Shifts clock in/out uses large circular button with haptic
- [ ] Weekly schedule has horizontal day pills with today highlighted
- [ ] Report rows have status-colored badges
- [ ] Blast rows have channel pills and clear status hierarchy
- [ ] Contact rows have generated avatars and BadgeView counts
- [ ] ContactTimelineView has vertical timeline with colored dots
- [ ] All XCUITests pass
- [ ] Light and dark mode verified via simulator screenshots
