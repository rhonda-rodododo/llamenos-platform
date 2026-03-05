# Epic 255: iOS Branding & Design System

## Problem

The iOS app has no visual brand identity — it uses generic SF Symbols, system blue tint, default font sizing, and no custom colors. The web app has a polished design system (teal/cyan primary, amber accent, DM Sans font, custom logo) that the iOS app should adopt.

### Current State
1. **No logo** — LoginView uses `Image(systemName: "phone.fill")` as a placeholder
2. **No asset catalog** — no `.xcassets` directory, no app icon
3. **No brand colors** — uses SwiftUI defaults (`.tint`, `.blue`, `.green`, etc.)
4. **No custom font** — uses system fonts only
5. **No app icon** — the app has no icon on the home screen
6. **Text/UI scale issues** — fonts are too small, touch targets too cramped, insufficient spacing between elements

### Web App Brand Identity (source of truth)
From `src/client/app.css` and `public/logo.svg`:

**Colors (OKLCH → approximate hex for iOS):**
- Primary (Teal/Cyan): `oklch(0.70 0.13 195)` ≈ `#51AFAE` (light mode: `oklch(0.45 0.12 195)` ≈ `#0D7377`)
- Accent (Amber/Gold): `oklch(0.78 0.14 70)` ≈ `#D4A033`
- Background dark: `oklch(0.14 0.015 250)` ≈ `#1A1F2E`
- Background light: `oklch(0.985 0.003 90)` ≈ `#FAFAF8`
- Destructive (Red): standard system red

**Logo SVG colors:**
- `#51AFAE` — main teal
- `#5BC5C5` — bright cyan accent
- `#2D9B9B` — dark teal shadow
- `#020A12` — dark navy details

**Typography:**
- **DM Sans** — primary font (Google Fonts, weights 400/500/600/700)
- **JetBrains Mono** — monospace (for npub, pubkey, code)

**App name:** "Llamenos" (with accent: "Llámenos")

## Scope

### 1. Asset Catalog & App Icon
- Create `apps/ios/Resources/Assets.xcassets/`
- Add `AppIcon.appiconset/` with the Llamenos logo rendered at all required sizes (1024x1024 for App Store, @2x/@3x for home screen)
- Add `Logo.imageset/` with the SVG logo as a vector asset for in-app use
- Update `project.yml` to include the asset catalog

### 2. Brand Color Palette
Create a `BrandColors.swift` design token file:
```swift
// apps/ios/Sources/Design/BrandColors.swift
import SwiftUI

extension Color {
    // Primary teal/cyan — matches web oklch(0.70 0.13 195) dark / oklch(0.45 0.12 195) light
    static let brandPrimary = Color("BrandPrimary")  // From asset catalog, adaptive
    // Accent amber/gold — matches web oklch(0.78 0.14 70)
    static let brandAccent = Color("BrandAccent")

    // Convenience for common semantic uses
    static let brandTeal = Color(red: 0x51/255, green: 0xAF/255, blue: 0xAE/255)
    static let brandCyan = Color(red: 0x5B/255, green: 0xC5/255, blue: 0xC5/255)
    static let brandDarkTeal = Color(red: 0x2D/255, green: 0x9B/255, blue: 0x9B/255)
    static let brandNavy = Color(red: 0x02/255, green: 0x0A/255, blue: 0x12/255)
}
```

Add adaptive color sets in the asset catalog for light/dark mode:
- `BrandPrimary` — light: `#0D7377`, dark: `#51AFAE`
- `BrandAccent` — light: `#C09030`, dark: `#D4A033`

### 3. Custom Font (DM Sans)
- Add DM Sans font files (`.ttf` or `.otf`, weights: Regular, Medium, SemiBold, Bold) to `apps/ios/Resources/Fonts/`
- Register in `Info.plist` under `UIAppFonts`
- Create font extension:
```swift
// apps/ios/Sources/Design/BrandFonts.swift
import SwiftUI

extension Font {
    static func brand(_ style: Font.TextStyle) -> Font {
        switch style {
        case .largeTitle: return .custom("DMSans-Bold", size: 34, relativeTo: .largeTitle)
        case .title: return .custom("DMSans-Bold", size: 28, relativeTo: .title)
        case .title2: return .custom("DMSans-SemiBold", size: 22, relativeTo: .title2)
        case .title3: return .custom("DMSans-SemiBold", size: 20, relativeTo: .title3)
        case .headline: return .custom("DMSans-SemiBold", size: 17, relativeTo: .headline)
        case .body: return .custom("DMSans-Regular", size: 17, relativeTo: .body)
        case .callout: return .custom("DMSans-Regular", size: 16, relativeTo: .callout)
        case .subheadline: return .custom("DMSans-Medium", size: 15, relativeTo: .subheadline)
        case .footnote: return .custom("DMSans-Regular", size: 13, relativeTo: .footnote)
        case .caption: return .custom("DMSans-Regular", size: 12, relativeTo: .caption)
        case .caption2: return .custom("DMSans-Regular", size: 11, relativeTo: .caption2)
        default: return .custom("DMSans-Regular", size: 17, relativeTo: .body)
        }
    }

    static func brandMono(_ style: Font.TextStyle) -> Font {
        // Use JetBrains Mono for npub/pubkey display, fallback to system monospaced
        .system(style, design: .monospaced)
        // TODO: Add JetBrains Mono if we want full brand consistency for mono text
    }
}
```

**Important:** Use `.custom(_:size:relativeTo:)` which supports Dynamic Type scaling. The `relativeTo:` parameter ensures DM Sans scales with the user's accessibility text size preference.

### 4. Text & UI Scale Fixes
The app has undersized text and cramped touch targets. Apply these fixes globally:

**Minimum touch target:** 44x44 points (Apple HIG requirement)
- All buttons, toggles, and tappable rows must meet this
- List rows are fine (SwiftUI List rows default to 44pt height)

**Font size adjustments:**
- Dashboard title: `.title` (28pt) not `.title2` (22pt)
- Section headers in cards: `.headline` (17pt bold) — currently correct
- Body text: `.body` (17pt) — currently correct
- Metadata/timestamps: `.footnote` (13pt) not `.caption2` (11pt) — too small currently
- Badge text: `.caption` (12pt) minimum — `.caption2` (11pt) is too small for readability
- Tab labels: system default — correct

**Spacing adjustments:**
- Section spacing: 16pt minimum between sections (some views use 12pt)
- Card internal padding: 16pt minimum (some use 12pt)
- Row vertical padding: 8pt minimum (some use 4pt)

**Specific fixes needed:**
- `NoteRowView` vertical padding: `4` → `8`
- `ConversationRowView` vertical padding: `4` → `8`
- `ReportRowView` vertical padding: `4` → `8`
- `BlastRowView` vertical padding: `4` → `8`
- `ContactRowView` vertical padding: `4` → `8`
- All `.caption2` badge text → `.caption` minimum
- All `.caption2` timestamp text in rows → `.footnote`
- Connection status pill text: `.caption2` → `.caption`

### 5. Apply Brand Colors Throughout

Replace generic SwiftUI colors with brand colors:

| Current | Replacement | Used For |
|---------|-------------|----------|
| `.tint` (system blue) | `.brandPrimary` | Primary actions, tappable text, active states |
| `.blue` (hardcoded) | `.brandPrimary` | Active calls, phone icons |
| `.green` (shift active) | Keep `.green` | On-shift status (semantic: active/success) |
| `.orange` (notes) | `.brandAccent` | Notes icon, alert accents |
| `.purple` (admin) | `.brandDarkTeal` | Admin role badge |
| `.indigo` (reports) | `.brandPrimary` | Reports icon |
| `.pink` (blasts) | `.brandAccent` | Blasts icon |
| `.teal` (contacts) | `.brandCyan` | Contacts icon |

**Keep system semantic colors for:**
- `.red` — destructive actions, errors
- `.green` — success, active/on-shift
- `.secondary` / `.tertiary` — text hierarchy
- `Color(.systemGray6)` — card backgrounds (until Epic 253 replaces cards with Lists)

### 6. Login Screen Logo
Replace the SF Symbol placeholder with the actual brand logo:
```swift
// BEFORE
Image(systemName: "phone.fill")
    .font(.system(size: 48))
    .foregroundStyle(.tint)

// AFTER
Image("Logo")  // From asset catalog
    .resizable()
    .scaledToFit()
    .frame(width: 80, height: 80)
```

### 7. Accent Color Configuration
Set the app's global accent color to brand teal in the asset catalog:
- `AccentColor.colorset` → brand primary teal
- This makes `.tint` and `.accentColor` use the brand color everywhere automatically

## XCUITest Migration — MANDATORY

### Color changes: NO test impact
XCUITests don't assert on colors. Accessibility identifiers are unaffected.

### Font changes: Potential text matching impact
Tests that check `statusLabel.label.contains("Shift")` still work — the text content doesn't change, only the font rendering.

### Logo change on LoginView: NO test impact
Tests identify elements by `accessibilityIdentifier`, not by image content.

### UI scale changes: Potential scroll behavior impact
- Increasing row padding from 4pt to 8pt makes content taller
- Elements that were previously visible without scrolling may now require scrolling
- Tests using `find()` (which checks existence, not visibility) are safe
- Tests using `scrollToFind()` and `scrollToVisible()` are safe
- Tests using `isHittable` checks may need `scrollToVisible()` if element moves below fold

**Specific tests to verify:**
- `DashboardUITests` — dashboard content is now taller with proper spacing
- `BlastsUITests.testBlastsQuickActionVisibleForAdmin()` — blasts action may need scroll
- `ContactsUITests.testContactsQuickActionVisibleForAdmin()` — already uses `scrollToFind`
- All tests should pass — but run full suite to verify

### Test count target
All **107 XCUITests** must pass. Run:
```bash
xcodebuild test -scheme Llamenos -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:LlamenosUITests 2>&1 | grep --line-buffered -E '(Test Case|FAIL|pass|error:)'
```

## Files Modified/Created
- New: `apps/ios/Resources/Assets.xcassets/` — asset catalog with app icon, logo, brand colors
- New: `apps/ios/Resources/Fonts/DMSans-*.ttf` — DM Sans font files (4 weights)
- New: `apps/ios/Sources/Design/BrandColors.swift` — color extensions
- New: `apps/ios/Sources/Design/BrandFonts.swift` — font extensions
- Modified: `apps/ios/project.yml` — add resources (asset catalog, fonts)
- Modified: `apps/ios/Sources/App/Info.plist` — register custom fonts (`UIAppFonts`)
- Modified: `apps/ios/Sources/Views/Auth/LoginView.swift` — replace SF Symbol with logo
- Modified: `apps/ios/Sources/Views/Dashboard/DashboardView.swift` — brand colors + scale
- Modified: `apps/ios/Sources/Views/Dashboard/MainTabView.swift` — tint color
- Modified: `apps/ios/Sources/Views/Notes/NotesView.swift` — row padding, badge sizing
- Modified: `apps/ios/Sources/Views/Conversations/ConversationsView.swift` — row padding, badge sizing
- Modified: `apps/ios/Sources/Views/Shifts/ShiftsView.swift` — brand colors + scale
- Modified: `apps/ios/Sources/Views/Settings/SettingsView.swift` — brand colors
- Modified: `apps/ios/Sources/Views/Reports/ReportsView.swift` — row padding
- Modified: `apps/ios/Sources/Views/Blasts/BlastsView.swift` — row padding, brand colors
- Modified: `apps/ios/Sources/Views/Contacts/ContactsView.swift` — row padding
- Modified: `apps/ios/Sources/Views/Admin/AdminTabView.swift` — brand colors

## Dependencies
- **Epic 252 (Localization)** — should be done first so text is visible during visual review
- **Epic 253 (Dashboard/Navigation)** — can be done in parallel or after. If done after, brand colors apply to the new List layout instead of the old card layout. If done before, brand colors apply to old layout then get preserved in the rewrite.
- **Recommended order:** 252 → 255 → 253 → 254 (localization → branding → layout → polish)

## Security Considerations
- Font files are static assets, no security impact
- Logo SVG is a static asset, no code execution risk
- Color changes are UI-only
- No crypto, auth, or API changes

## DM Sans Font Licensing
DM Sans is licensed under the SIL Open Font License 1.1 — free for use in apps including commercial distribution. Include the license file in `apps/ios/Resources/Fonts/OFL.txt`.
