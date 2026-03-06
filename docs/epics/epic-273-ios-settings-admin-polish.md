# Epic 273: iOS Settings, Admin & Shared Polish

**Status**: PENDING
**Depends on**: Epic 269 (Design System Foundation)
**Branch**: `desktop`

## Summary

Restructure Settings from a wall of 11 sections into organized sub-pages, add a branded identity card, polish admin views with card layouts and counts, upgrade the panic wipe confirmation to a multi-step gate, and apply brand styling to all remaining shared views. Update all XCUITests to match new layouts.

## Problem Statement

Settings has 11 sections in one scrollable List — cognitive overload. Emergency Wipe is easy to miss at the bottom. Admin screens are plain NavigationLink lists with no visual indication of what's inside. The PanicWipe confirmation is a single "Wipe All Data" button with no friction gate. The Help screen uses plain DisclosureGroups. LoadingOverlay uses generic styling.

## Current Files

| File | Lines | Changes |
|------|-------|---------|
| `Views/Settings/SettingsView.swift` | 667 | Full restructure |
| `Views/Settings/PanicWipeConfirmationView.swift` | 106 | Multi-step gate |
| `Views/Settings/DeviceLinkView.swift` | 499 | Brand styling |
| `Views/Admin/AdminTabView.swift` | 118 | Card layout with counts |
| `Views/Admin/VolunteersView.swift` | ~200 | Brand polish |
| `Views/Admin/BanListView.swift` | ~150 | Brand polish |
| `Views/Admin/AuditLogView.swift` | ~200 | Brand polish |
| `Views/Admin/InviteView.swift` | ~150 | Brand polish |
| `Views/Admin/CustomFieldsView.swift` | ~200 | Brand polish |
| `Views/Admin/CustomFieldEditView.swift` | ~200 | Brand polish |
| `Views/Help/HelpView.swift` | 275 | Brand accordion |
| `Views/Components/LoadingOverlay.swift` | 95 | Brand tint |

## Tasks

### 1. SettingsView — Restructure into Sub-Pages

**New layout — Settings becomes a navigation hub:**

```
┌─────────────────────────────────────┐
│  [Avatar] npub1abc...xyz            │
│           Volunteer                 │
│           hub.example.org           │
│           ● Connected               │
└─────────────────────────────────────┘

  Account ›
    Identity, Hub, Connection, Device Link

  Preferences ›
    Notifications, Language, Security

  Admin Panel ›              (admin only)
    Manage volunteers, bans, audit...

  Help & FAQ ›

  ─────────────────────────────

  Lock App
  Logout

  ─────────────────────────────

  ⚠ Emergency Wipe

  v0.1.0 (build 1)
```

**Identity Card (top of settings):**
- `BrandCard` with prominent layout
- Generated color avatar (80x80, from npub hash — same algorithm as conversations)
- `CopyableField` for npub
- Role badge using `BadgeView`
- Hub URL (truncated)
- Connection `StatusDot` + status text

**Sub-pages:**
- **AccountSettingsView** (NEW): identity, hub, connection sections, device link
- **PreferencesSettingsView** (NEW): notification toggles, language picker, security (auto-lock, biometric)
- These are simple List views that extract the existing sections from SettingsView

**Actions section:**
- Lock App: plain button with lock icon
- Logout: destructive button with confirmation alert (existing)

**Danger Zone:**
- Emergency Wipe: red-tinted row, visually separated from other actions
- Moved above the footer (not buried at the very bottom)

**Footer:**
- App version + build number, centered
- "Llamenos - Secure Crisis Response" tagline

### 2. PanicWipeConfirmationView — Multi-Step Friction Gate

**Current**: Single red button with no friction.
**New**: Two-step confirmation requiring text input.

**Step 1**: Warning screen (current layout, improved):
- Large red warning icon (keep current)
- Bold title + clear description
- "Type WIPE to confirm" text field
- The confirm button is disabled until the user types "WIPE" (case-insensitive)
- Cancel button

**Step 2**: Final confirmation alert:
- After typing "WIPE" and tapping confirm, show a system alert: "This cannot be undone. Are you absolutely sure?"
- Destructive "Yes, Wipe Everything" + Cancel

**Haptic**: `.warning` on entering the screen, `.error` on final wipe

### 3. AdminTabView — Card Layout with Counts

Replace plain NavigationLink list with `BrandCard`-based navigation:

```
┌─────────────────────────────────────┐
│ 👥 Volunteers              12 ›    │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ ✋ Ban List                  3 ›    │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ 📋 Audit Log              247 ›    │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ ✉️ Invites                   5 ›    │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ 📝 Custom Fields             8 ›    │
└─────────────────────────────────────┘
```

- Each card shows the section icon, name, and item count (fetched from API)
- Counts displayed as `BadgeView` with `brandMutedForeground`
- Cards are tappable NavigationLinks
- Counts load async on appear (show spinner until loaded)

### 4. Admin Sub-Views — Brand Polish

Apply consistent brand styling across all admin views:

**VolunteersView:**
- Volunteer rows as `BrandCard` with role badge, status indicator
- Add/invite action: `brandPrimary` button

**BanListView:**
- Ban entries as `BrandCard` with monospaced identifier, date
- Add ban: `brandDestructive` action button

**AuditLogView:**
- Log entries as compact `BrandCard` rows
- Timestamp: `.brandMono(.caption)`
- Action type: `BadgeView`
- Hash chain indicator: small link icon in `brandMutedForeground`

**InviteView:**
- Invite cards with code display, status badge, expiry date
- Create invite: `brandPrimary` CTA

**CustomFieldsView / CustomFieldEditView:**
- Field list as `BrandCard` with type indicator, required badge
- Edit form: branded styling matching NoteCreateView pattern

### 5. HelpView — Branded Accordions

- Section headers: `.brand(.headline)` with teal icon
- DisclosureGroup: custom chevron animation, `brandCard` background for expanded content
- Security rows: use `BadgeView` for "E2EE" indicator
- FAQ questions: slightly bolder than answers for visual hierarchy

### 6. DeviceLinkView — Brand Polish

- QR scanner overlay: `brandPrimary` border corners (instead of accent opacity)
- SAS code digits: `brandCard` background, `brandPrimary` text when active
- Confirm/Reject buttons: green uses `statusActive`, destructive uses `brandDestructive`
- All step screens: use brand typography and colors

### 7. LoadingOverlay — Brand Tinted

- Spinner: tinted `brandPrimary` (not white)
- Background card: `brandCard` fill with `.ultraThinMaterial`
- Message text: `.brand(.subheadline)`, `brandForeground`

### 8. Update All XCUITests

This is the most test-impactful epic because:
- Settings restructure changes navigation paths (Settings → Account → identity)
- PanicWipe now requires text input
- Admin cards may change accessibility identifiers

**Test updates required:**
- Settings tests: update navigation flow for sub-pages
- PanicWipe test: add "WIPE" text input step
- Admin tests: verify card-based navigation works
- All other tests: verify no regressions from shared component changes

## Files Modified

All files listed in the table above, plus:
- `Sources/Views/Settings/AccountSettingsView.swift` — NEW
- `Sources/Views/Settings/PreferencesSettingsView.swift` — NEW
- `Tests/UI/` — multiple test file updates

## Acceptance Criteria

- [ ] SettingsView shows identity card at top with avatar, npub, role, hub, connection
- [ ] Settings organized into Account, Preferences, Admin sub-pages
- [ ] PanicWipeConfirmationView requires typing "WIPE" + final alert confirmation
- [ ] AdminTabView shows card layout with item counts
- [ ] All admin sub-views use BrandCard styling
- [ ] HelpView has branded accordion styling
- [ ] DeviceLinkView uses brand colors throughout
- [ ] LoadingOverlay uses brand-tinted spinner
- [ ] All XCUITests pass with restructured navigation
- [ ] Light and dark mode verified via simulator screenshots
