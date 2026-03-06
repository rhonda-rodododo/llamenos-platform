# iOS UX Overhaul Design — "Quiet Authority"

**Date**: 2026-03-06
**Epics**: 269-273
**Branch**: `desktop`

## Context

The iOS app is functionally complete but visually stock SwiftUI. Brand fonts (DM Sans) are defined but unused. Brand colors are minimal (4 values) vs the web app's 39-token OKLCH system. Screens use `.insetGrouped` List everywhere, creating a "Settings app" feel rather than a purpose-built crisis response tool.

## Design Direction

**Tone**: Quiet Authority — refined, serious, trustworthy. A well-organized operations center, not a social media app. Reduces cognitive load for volunteers doing emotionally heavy work.

**Aesthetic Pillars**:
1. Dark-first with teal luminance (brandNavy base, brandTeal accent)
2. DM Sans typography with real weight/size hierarchy
3. Cards with depth replacing flat List rows where density matters
4. Status-driven color (green=active, amber=warning, red=critical)
5. Motion with purpose (haptics, pulse, shake, transitions)

## Epic Breakdown

### Epic 269: Design System Foundation
- Semantic color tokens (39 tokens, light/dark adaptive, matching web OKLCH)
- Typography applied everywhere via `.brand()` / `.brandMono()`
- Shared components: BrandCard, StatusDot, CopyableField, BadgeView, EmptyStateView
- Extract duplicated patterns (truncatedNpub, copy feedback, haptics)
- Updated asset catalog

### Epic 270: Auth Flow Redesign
- LoginView: branded full-screen experience with gradient accents
- OnboardingView: dramatic nsec display, amber warning, progress indicators
- PINPadView: haptics, shake animation, dot fill animation, long-press clear
- PINSetView/PINUnlockView: animated lock icon, branded headers

### Epic 271: Dashboard & Tab Bar Overhaul
- Dashboard rebuilt as custom ScrollView (no more List)
- Hero shift status card with gradient + breathing dot + large timer
- Activity stats as horizontal card row
- Quick actions as 2x2 tappable card grid
- Recent notes as compact cards
- Connection status as persistent subtle indicator

### Epic 272: Feature Screens Polish
- Notes: card rows with accent borders, better typography hierarchy
- Conversations: generated contact avatars, brand-colored bubbles
- Shifts: circular clock in/out button, day-of-week pills
- Reports: status/category color coding
- Blasts: channel pills, clear draft/sent hierarchy

### Epic 273: Settings, Admin & Shared Polish
- Settings restructured into sub-pages (Account, Preferences, Admin, Danger Zone)
- Identity card at top of settings
- Admin cards with counts
- PanicWipe multi-step confirmation
- LoadingOverlay brand-tinted
- All XCUITests updated

## Cross-Cutting Requirements
- All views use `.brand()` typography
- All colors use semantic tokens
- Dark mode verified per screen
- `.privacySensitive()` markers preserved
- Accessibility identifiers preserved/updated
- RTL tested for Arabic
- Visual confirmation via simulator screenshots during development
