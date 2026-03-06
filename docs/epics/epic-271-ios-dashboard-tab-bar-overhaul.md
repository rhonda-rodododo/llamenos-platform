# Epic 271: iOS Dashboard & Tab Bar Overhaul

**Status**: PENDING
**Depends on**: Epic 269 (Design System Foundation)
**Branch**: `desktop`

## Summary

Rebuild the dashboard from scratch as a custom command center layout, replacing the generic `.insetGrouped` List with a purpose-built ScrollView. This is the most-used screen in the app — volunteers check it constantly during shifts. It needs to communicate status at a glance.

## Problem Statement

The current dashboard is an `.insetGrouped` List with LabeledContent rows — indistinguishable from iOS Settings. The shift status is a small text row when it should be the dominant visual element. Quick actions are plain buttons with chevrons. Activity stats are buried in secondary text. A volunteer glancing at their phone during a crisis call needs to see "I'm on shift, 2 active calls, 45 minutes elapsed" in under 1 second.

## Current Files

- `Sources/Views/Dashboard/DashboardView.swift` — 391 lines
- `Sources/Views/Dashboard/MainTabView.swift` — 120 lines

## Tasks

### 1. DashboardView — Full Rebuild

Replace the entire List-based layout with a custom `ScrollView`:

**Hero Shift Card (top, full-width):**
```
┌─────────────────────────────────────┐
│  ● On Shift                 02:34:17│
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  (progress?) │
│                                     │
│  [Clock Out]                        │
└─────────────────────────────────────┘
```
- Full-width `BrandCard` with conditional gradient background:
  - On shift: subtle teal gradient (`brandPrimary` at 10% opacity → 5%)
  - Off shift: neutral `brandCard` background
- `StatusDot` (animated green pulse) + "On Shift" / "Off Shift" in `.brand(.headline)`
- Large elapsed timer in `.brandMono(.title)` with `.contentTransition(.numericText())`, green when on shift
- Clock in/out button: prominent, full-width within the card
  - Clock in: green tint, play icon
  - Clock out: red tint, stop icon (with confirmation alert)
- Active call count shown inline when on shift: `phone.fill` icon + count in `brandPrimary`

**Activity Stats Row (horizontal scroll or fixed 3-column):**
```
┌──────────┐ ┌──────────┐ ┌──────────┐
│    2     │ │    7     │ │    3     │
│ Active   │ │ Notes    │ │ Unread   │
│ Calls    │ │ Today    │ │ Messages │
└──────────┘ └──────────┘ └──────────┘
```
- Three compact `BrandCard` instances in an `HStack`
- Large number (`.brand(.title)`, bold, semantic color) centered
- Label below in `.brand(.caption)`, `brandMutedForeground`
- Colors: calls=`brandPrimary`, notes=`brandAccent`, messages=green
- Numbers use `.contentTransition(.numericText())`

**Quick Actions Grid (2x2):**
```
┌────────────────┐ ┌────────────────┐
│  📋 Reports    │ │  👥 Contacts   │
└────────────────┘ └────────────────┘
┌────────────────┐ ┌────────────────┐
│  📢 Blasts     │ │  ❓ Help       │
└────────────────┘ └────────────────┘
```
- 2-column `LazyVGrid` of tappable `BrandCard` instances
- Each card: SF Symbol icon (tinted `brandPrimary`) + label in `.brand(.subheadline)`
- Admin-only cards (Contacts, Blasts) conditionally shown — grid reflows to 1 column if only 2 items
- Subtle press effect (scale 0.97 on tap)
- Navigation via `.navigationDestination`

**Identity & Connection Strip (compact, below quick actions):**
```
┌─────────────────────────────────────┐
│ 🔑 npub1abc...xyz    ● Connected   │
│ 🌐 hub.example.org                 │
└─────────────────────────────────────┘
```
- Single `BrandCard` with compact layout
- `CopyableField` for npub (from Epic 269)
- Hub URL truncated with `.middle`
- `StatusDot` for connection with status text
- This is de-emphasized compared to current layout (moved down, smaller)

**Recent Notes (if any):**
- Section header "Recent Notes" with "See All" link → Notes tab
- Max 3 note previews as compact `BrandCard` rows
- Each: preview text (2 lines), time, call/conversation badge
- Tap navigates to note detail

**Error Banner (if any):**
- Uses amber `BrandCard` with warning icon
- Dismissible

**Overall layout:**
```swift
ScrollView {
    VStack(spacing: 16) {
        heroShiftCard
        activityStatsRow
        quickActionsGrid
        identityConnectionStrip
        recentNotesSection
        errorBanner
    }
    .padding(.horizontal, 16)
}
```

### 2. MainTabView — Brand Polish

- Tab bar tint: confirm `brandPrimary` is applied (already is)
- Conversations badge: style the unread count badge
- Consider: slight branded background tint on the tab bar (subtle, not distracting)

### 3. Pull-to-Refresh & Real-Time

- `.refreshable` on the ScrollView (same behavior as current)
- Event listener for real-time WebSocket updates (same as current)
- Ensure stats animate smoothly when updated via events

### 4. Toolbar

- Lock button in toolbar: keep as-is, ensure it uses `brandPrimary` tint
- Navigation title "Dashboard" with `.brand(.largeTitle)` — verify DM Sans renders in nav bar

### 5. Update XCUITests

The dashboard layout changes significantly:
- Update tests that target List-specific elements
- Verify all accessibility identifiers are preserved or remapped
- Quick actions: update from button-in-list to card-in-grid identifiers
- Shift status: update from LabeledContent to card-based assertions

## Visual Reference

The dashboard should feel like a **mission control screen** — the most important information (shift status, active calls) is the biggest and most visible. Supporting information (identity, connection) is present but secondary. Quick actions are reachable without scrolling on most devices.

Inspiration: health tracking app dashboards (large stats), aviation cockpit displays (status at a glance), ops dashboards (real-time metrics).

## Files Modified

- `Sources/Views/Dashboard/DashboardView.swift` — full rewrite
- `Sources/Views/Dashboard/MainTabView.swift` — minor brand polish
- `Tests/UI/` — dashboard test updates

## Acceptance Criteria

- [ ] Dashboard uses custom ScrollView layout (no List)
- [ ] Hero shift card is the dominant visual element with gradient, StatusDot, large timer
- [ ] Activity stats are displayed as a horizontal card row with large numbers
- [ ] Quick actions are a 2x2 card grid (not list rows)
- [ ] Identity/connection is a compact card (de-emphasized)
- [ ] Recent notes shown as compact cards (max 3)
- [ ] Pull-to-refresh and real-time updates work
- [ ] All XCUITests pass
- [ ] Light and dark mode verified via simulator screenshots
- [ ] Above-the-fold: shift status + activity stats visible without scrolling on iPhone 15/16
