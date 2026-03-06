# Epic 269: iOS Design System Foundation

**Status**: PENDING
**Depends on**: None
**Branch**: `desktop`

## Summary

Establish a comprehensive design system for the iOS app that matches the web app's 39-token OKLCH color system, enforces DM Sans typography everywhere, and provides a library of shared components to eliminate duplicated patterns across views.

## Problem Statement

The iOS app has a minimal design system: 4 brand colors and a font helper that's never used. The web app has a mature 39-token OKLCH color system with light/dark adaptive colors. The iOS app uses bare `.font(.body)` and `.foregroundStyle(.secondary)` everywhere, creating a stock SwiftUI appearance with no brand identity. Multiple views duplicate the same patterns (truncated npub, copy feedback, ViewModel resolution).

## Web App Token Reference (source of truth: `src/client/app.css`)

### Light Mode (`:root`)
| Token | OKLCH | Approx sRGB | Purpose |
|-------|-------|-------------|---------|
| background | oklch(0.985 0.003 90) | #FAFAF8 | Page background |
| foreground | oklch(0.18 0.01 250) | #1A1D24 | Primary text |
| card | oklch(1 0 0) | #FFFFFF | Card surface |
| card-foreground | oklch(0.18 0.01 250) | #1A1D24 | Card text |
| primary | oklch(0.45 0.12 195) | #0D7377 | Brand teal |
| primary-foreground | oklch(0.99 0 0) | #FCFCFC | On-primary text |
| secondary | oklch(0.96 0.015 195) | #EDF5F5 | Light teal tint |
| secondary-foreground | oklch(0.25 0.05 195) | #1A3A3D | On-secondary text |
| muted | oklch(0.96 0.005 90) | #F3F3F0 | Muted surface |
| muted-foreground | oklch(0.55 0.01 250) | #7B7F87 | Muted text |
| accent | oklch(0.75 0.15 70) | #C09030 | Amber/gold |
| accent-foreground | oklch(0.25 0.05 70) | #3D3520 | On-accent text |
| destructive | oklch(0.577 0.245 27.325) | #D93526 | Error/danger |
| border | oklch(0.92 0.005 90) | #E8E8E5 | Borders |
| input | oklch(0.92 0.005 90) | #E8E8E5 | Input borders |
| ring | oklch(0.45 0.12 195) | #0D7377 | Focus ring |

### Dark Mode (`.dark`)
| Token | OKLCH | Approx sRGB | Purpose |
|-------|-------|-------------|---------|
| background | oklch(0.14 0.015 250) | #020A12 | Page background |
| foreground | oklch(0.95 0.005 90) | #F0F0ED | Primary text |
| card | oklch(0.18 0.015 250) | #0D1520 | Card surface |
| card-foreground | oklch(0.95 0.005 90) | #F0F0ED | Card text |
| primary | oklch(0.70 0.13 195) | #51AFAE | Brand teal |
| primary-foreground | oklch(0.14 0.015 250) | #020A12 | On-primary text |
| secondary | oklch(0.25 0.01 250) | #2A2E36 | Dark surface |
| secondary-foreground | oklch(0.95 0.005 90) | #F0F0ED | On-secondary text |
| muted | oklch(0.25 0.01 250) | #2A2E36 | Muted surface |
| muted-foreground | oklch(0.65 0.01 250) | #9A9EA6 | Muted text |
| accent | oklch(0.78 0.14 70) | #D4A033 | Amber/gold |
| accent-foreground | oklch(0.14 0.015 250) | #020A12 | On-accent text |
| destructive | oklch(0.704 0.191 22.216) | #E85A4A | Error/danger |
| border | oklch(0.28 0.01 250) | #363A42 | Borders |
| input | oklch(0.30 0.01 250) | #3C4048 | Input borders |
| ring | oklch(0.70 0.13 195) | #51AFAE | Focus ring |

## Tasks

### 1. Expand BrandColors.swift — Semantic Token System

Replace the current 4-color system with a full semantic token system using light/dark adaptive Color Sets in the asset catalog.

**New color sets to add to `Resources/Assets.xcassets/`:**
- `Background.colorset` (light: #FAFAF8, dark: #020A12)
- `Foreground.colorset` (light: #1A1D24, dark: #F0F0ED)
- `Card.colorset` (light: #FFFFFF, dark: #0D1520)
- `CardForeground.colorset` (light: #1A1D24, dark: #F0F0ED)
- `Secondary.colorset` (light: #EDF5F5, dark: #2A2E36)
- `SecondaryForeground.colorset` (light: #1A3A3D, dark: #F0F0ED)
- `Muted.colorset` (light: #F3F3F0, dark: #2A2E36)
- `MutedForeground.colorset` (light: #7B7F87, dark: #9A9EA6)
- `AccentForeground.colorset` (light: #3D3520, dark: #020A12)
- `Destructive.colorset` (light: #D93526, dark: #E85A4A)
- `Border.colorset` (light: #E8E8E5, dark: #363A42)
- `InputBorder.colorset` (light: #E8E8E5, dark: #3C4048)
- Update existing `BrandPrimary.colorset` → keep as-is (already correct)
- Update existing `BrandAccent.colorset` → keep as-is (already correct)

**Update `BrandColors.swift`:**
```swift
extension Color {
    // Semantic tokens (adaptive light/dark via asset catalog)
    static let brandBackground = Color("Background")
    static let brandForeground = Color("Foreground")
    static let brandCard = Color("Card")
    static let brandCardForeground = Color("CardForeground")
    static let brandPrimary = Color("BrandPrimary")         // existing
    static let brandPrimaryForeground = Color("PrimaryForeground")
    static let brandSecondary = Color("Secondary")
    static let brandSecondaryForeground = Color("SecondaryForeground")
    static let brandMuted = Color("Muted")
    static let brandMutedForeground = Color("MutedForeground")
    static let brandAccent = Color("BrandAccent")            // existing
    static let brandAccentForeground = Color("AccentForeground")
    static let brandDestructive = Color("Destructive")
    static let brandBorder = Color("Border")
    static let brandInput = Color("InputBorder")
    static let brandRing = Color("BrandPrimary")             // same as primary

    // Semantic convenience — status colors
    static let statusActive = Color.green
    static let statusWarning = Color("BrandAccent")
    static let statusDanger = Color("Destructive")
    static let statusInfo = Color("BrandPrimary")

    // Keep legacy direct-value colors for now (used in tests)
    static let brandTeal = Color(red: 0x51/255.0, green: 0xAF/255.0, blue: 0xAE/255.0)
    static let brandCyan = Color(red: 0x5B/255.0, green: 0xC5/255.0, blue: 0xC5/255.0)
    static let brandDarkTeal = Color(red: 0x2D/255.0, green: 0x9B/255.0, blue: 0x9B/255.0)
    static let brandNavy = Color(red: 0x02/255.0, green: 0x0A/255.0, blue: 0x12/255.0)
}
```

### 2. Enforce DM Sans Typography

Update `BrandFonts.swift` and apply `.brand()` calls throughout every view.

**Audit every view file** — replace:
- `.font(.body)` → `.font(.brand(.body))`
- `.font(.title2)` → `.font(.brand(.title2))`
- `.font(.caption)` → `.font(.brand(.caption))`
- `.font(.footnote)` → `.font(.brand(.footnote))`
- etc.

Exception: `.font(.system(.body, design: .monospaced))` stays as-is for cryptographic identifiers, but should use `.brandMono()` wrapper.

### 3. Shared Components Library

Create `Sources/Views/Components/` shared components:

**BrandCard.swift** — Reusable card container with brand styling:
```swift
struct BrandCard<Content: View>: View {
    let content: Content
    var padding: CGFloat = 16
    init(padding: CGFloat = 16, @ViewBuilder content: () -> Content)
    // Uses brandCard background, brandBorder stroke, 12pt corner radius, subtle shadow
}
```

**StatusDot.swift** — Animated status indicator:
```swift
struct StatusDot: View {
    enum Status { case active, warning, inactive, error }
    let status: Status
    var animated: Bool = true
    // Renders a colored circle with optional pulse animation
    // active=green pulse, warning=amber steady, inactive=gray, error=red
}
```

**CopyableField.swift** — Monospaced text with copy button and feedback:
```swift
struct CopyableField: View {
    let label: String
    let value: String
    var truncated: Bool = true
    // Shows label, truncated mono value, copy button
    // Haptic + toast feedback on copy
    // Extracts the duplicated pattern from SettingsView/NoteDetailView
}
```

**BadgeView.swift** — Capsule badge with icon + text:
```swift
struct BadgeView: View {
    let text: String
    var icon: String? = nil
    var color: Color = .brandPrimary
    var style: BadgeStyle = .filled // .filled, .outlined, .subtle
    // Capsule with icon + text, colored per style
}
```

**EmptyStateView.swift** — Branded empty state:
```swift
struct BrandEmptyState: View {
    let icon: String
    let title: String
    let message: String
    var action: (() -> Void)? = nil
    var actionLabel: String? = nil
    // Replaces ContentUnavailableView usage with branded styling
}
```

**CopyConfirmationBanner.swift** — Shared copy feedback banner:
```swift
struct CopyConfirmationBanner: View { ... }
// Extract duplicated banner from SettingsView + NoteDetailView
```

### 4. Utility Extensions

**String+Truncation.swift:**
```swift
extension String {
    func truncatedNpub() -> String { ... }
    func truncatedPubkey() -> String { ... }
    func truncatedHash(_ prefixLen: Int = 8, suffixLen: Int = 6) -> String { ... }
}
```

**Haptics.swift:**
```swift
enum Haptics {
    static func success() { ... }
    static func warning() { ... }
    static func error() { ... }
    static func selection() { ... }
    static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .medium) { ... }
}
```

**View+CopyToClipboard.swift:**
```swift
extension View {
    func copyToClipboard(_ value: String, showConfirmation: Binding<Bool>) -> some View { ... }
}
```

### 5. Update Asset Catalog

Add all new color sets listed in Task 1 to `Resources/Assets.xcassets/`.

Each `.colorset/Contents.json` needs light and dark appearance entries matching the sRGB hex values from the token table.

### 6. Verify and Test

- Build the app with `xcodebuild build` to confirm all new colors/components compile
- Run existing XCUITests to confirm nothing is broken by the foundation changes
- Visually inspect in both light and dark mode via simulator screenshots

## Files Modified

- `Sources/Design/BrandColors.swift` — expanded token system
- `Sources/Design/BrandFonts.swift` — no API change, just verify coverage
- `Sources/Views/Components/BrandCard.swift` — NEW
- `Sources/Views/Components/StatusDot.swift` — NEW
- `Sources/Views/Components/CopyableField.swift` — NEW
- `Sources/Views/Components/BadgeView.swift` — NEW
- `Sources/Views/Components/EmptyStateView.swift` — NEW
- `Sources/Views/Components/CopyConfirmationBanner.swift` — NEW
- `Sources/Utilities/StringTruncation.swift` — NEW
- `Sources/Utilities/Haptics.swift` — NEW
- `Resources/Assets.xcassets/` — 13 new color sets
- ALL view files — `.font()` → `.brand()` migration
- `project.yml` — add new source files to target

## Acceptance Criteria

- [ ] All 16 semantic color tokens available as `Color.brand*` with light/dark variants
- [ ] Every `.font()` call in the app uses `.brand()` or `.brandMono()`
- [ ] BrandCard, StatusDot, CopyableField, BadgeView, EmptyStateView components compile and render
- [ ] `truncatedNpub()` removed from DashboardView, PINUnlockView, SettingsView — uses String extension
- [ ] Copy feedback pattern extracted to shared component
- [ ] Haptics utility used where appropriate
- [ ] XCUITests still pass
- [ ] Dark mode renders correctly
