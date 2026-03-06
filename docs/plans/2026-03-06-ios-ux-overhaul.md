# iOS UX Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the iOS app from stock SwiftUI appearance to a branded "Quiet Authority" design system across all screens — foundation, auth, dashboard, features, settings.

**Architecture:** Five epics executed in dependency order: Epic 269 (design system foundation) first, then Epics 270-273 in parallel. Each epic modifies SwiftUI views in `apps/ios/Sources/Views/`, adds shared components to `apps/ios/Sources/Views/Components/`, and updates XCUITests in `apps/ios/Tests/UI/`. Asset catalog color sets live in `apps/ios/Resources/Assets.xcassets/`.

**Tech Stack:** SwiftUI (iOS 17+), `@Observable`, DM Sans custom font, XCUITest, xcodebuild, xcodegen

**Epics:** `docs/epics/epic-269-ios-design-system-foundation.md` through `docs/epics/epic-273-ios-settings-admin-polish.md`

**Build command:** `cd /Users/rhonda/projects/llamenos/apps/ios && xcodebuild build -project Llamenos.xcodeproj -scheme Llamenos -destination "platform=iOS Simulator,name=iPhone 17" 2>&1 | tee /tmp/build-output.log | grep --line-buffered -E '(BUILD|error:|warning:)'`

**Test command:** `cd /Users/rhonda/projects/llamenos/apps/ios && xcodebuild test -project Llamenos.xcodeproj -scheme Llamenos -destination "platform=iOS Simulator,name=iPhone 17" -only-testing:LlamenosUITests 2>&1 | tee /tmp/uitest-output.log | grep --line-buffered -E '(Test Case|Executed|error:)'`

**Regenerate xcodeproj after adding files:** `cd /Users/rhonda/projects/llamenos/apps/ios && xcodegen generate`

---

## Epic 269: Design System Foundation

### Task 1: Asset Catalog Color Sets

**Files:**
- Create: `apps/ios/Resources/Assets.xcassets/Background.colorset/Contents.json`
- Create: `apps/ios/Resources/Assets.xcassets/Foreground.colorset/Contents.json`
- Create: `apps/ios/Resources/Assets.xcassets/Card.colorset/Contents.json`
- Create: `apps/ios/Resources/Assets.xcassets/CardForeground.colorset/Contents.json`
- Create: `apps/ios/Resources/Assets.xcassets/PrimaryForeground.colorset/Contents.json`
- Create: `apps/ios/Resources/Assets.xcassets/Secondary.colorset/Contents.json`
- Create: `apps/ios/Resources/Assets.xcassets/SecondaryForeground.colorset/Contents.json`
- Create: `apps/ios/Resources/Assets.xcassets/Muted.colorset/Contents.json`
- Create: `apps/ios/Resources/Assets.xcassets/MutedForeground.colorset/Contents.json`
- Create: `apps/ios/Resources/Assets.xcassets/AccentForeground.colorset/Contents.json`
- Create: `apps/ios/Resources/Assets.xcassets/Destructive.colorset/Contents.json`
- Create: `apps/ios/Resources/Assets.xcassets/DestructiveForeground.colorset/Contents.json`
- Create: `apps/ios/Resources/Assets.xcassets/Border.colorset/Contents.json`
- Create: `apps/ios/Resources/Assets.xcassets/InputBorder.colorset/Contents.json`

**Step 1: Create all 14 color set directories and Contents.json files**

Each file follows this template (example for Background):
```json
{
  "colors": [
    {
      "color": {
        "color-space": "srgb",
        "components": {
          "red": "0xFA",
          "green": "0xFA",
          "blue": "0xF8",
          "alpha": "1.000"
        }
      },
      "idiom": "universal",
      "appearances": [
        { "appearance": "luminosity", "value": "light" }
      ]
    },
    {
      "color": {
        "color-space": "srgb",
        "components": {
          "red": "0x02",
          "green": "0x0A",
          "blue": "0x12",
          "alpha": "1.000"
        }
      },
      "idiom": "universal",
      "appearances": [
        { "appearance": "luminosity", "value": "dark" }
      ]
    }
  ],
  "info": { "author": "xcode", "version": 1 }
}
```

**Full color mapping (light hex / dark hex):**

| Color Set | Light | Dark |
|-----------|-------|------|
| Background | #FAFAF8 | #020A12 |
| Foreground | #1A1D24 | #F0F0ED |
| Card | #FFFFFF | #0D1520 |
| CardForeground | #1A1D24 | #F0F0ED |
| PrimaryForeground | #FCFCFC | #020A12 |
| Secondary | #EDF5F5 | #2A2E36 |
| SecondaryForeground | #1A3A3D | #F0F0ED |
| Muted | #F3F3F0 | #2A2E36 |
| MutedForeground | #7B7F87 | #9A9EA6 |
| AccentForeground | #3D3520 | #020A12 |
| Destructive | #D93526 | #E85A4A |
| DestructiveForeground | #D93526 | #E85A4A |
| Border | #E8E8E5 | #363A42 |
| InputBorder | #E8E8E5 | #3C4048 |

**Step 2: Verify build compiles with new color sets**

Run: `cd /Users/rhonda/projects/llamenos/apps/ios && xcodegen generate && xcodebuild build -project Llamenos.xcodeproj -scheme Llamenos -destination "platform=iOS Simulator,name=iPhone 17" 2>&1 | tail -5`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
cd /Users/rhonda/projects/llamenos && git add apps/ios/Resources/Assets.xcassets/ && git commit -m "feat(ios): add 14 semantic color sets to asset catalog (Epic 269)"
```

---

### Task 2: Expand BrandColors.swift

**Files:**
- Modify: `apps/ios/Sources/Design/BrandColors.swift`

**Step 1: Rewrite BrandColors.swift with full semantic token system**

```swift
import SwiftUI

extension Color {
    // Semantic tokens (adaptive light/dark via asset catalog)
    static let brandBackground = Color("Background")
    static let brandForeground = Color("Foreground")
    static let brandCard = Color("Card")
    static let brandCardForeground = Color("CardForeground")
    static let brandPrimary = Color("BrandPrimary")             // existing
    static let brandPrimaryForeground = Color("PrimaryForeground")
    static let brandSecondary = Color("Secondary")
    static let brandSecondaryForeground = Color("SecondaryForeground")
    static let brandMuted = Color("Muted")
    static let brandMutedForeground = Color("MutedForeground")
    static let brandAccent = Color("BrandAccent")               // existing
    static let brandAccentForeground = Color("AccentForeground")
    static let brandDestructive = Color("Destructive")
    static let brandDestructiveForeground = Color("DestructiveForeground")
    static let brandBorder = Color("Border")
    static let brandInput = Color("InputBorder")
    static let brandRing = Color("BrandPrimary")                // same as primary

    // Semantic convenience — status colors
    static let statusActive = Color.green
    static let statusWarning = Color("BrandAccent")
    static let statusDanger = Color("Destructive")
    static let statusInfo = Color("BrandPrimary")

    // Legacy direct-value colors (used in tests, GeneratedAvatar)
    static let brandTeal = Color(red: 0x51 / 255.0, green: 0xAF / 255.0, blue: 0xAE / 255.0)
    static let brandCyan = Color(red: 0x5B / 255.0, green: 0xC5 / 255.0, blue: 0xC5 / 255.0)
    static let brandDarkTeal = Color(red: 0x2D / 255.0, green: 0x9B / 255.0, blue: 0x9B / 255.0)
    static let brandNavy = Color(red: 0x02 / 255.0, green: 0x0A / 255.0, blue: 0x12 / 255.0)
}
```

**Step 2: Build to verify**

Run: build command from header
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add apps/ios/Sources/Design/BrandColors.swift && git commit -m "feat(ios): expand BrandColors to 18 semantic tokens (Epic 269)"
```

---

### Task 3: Utility Extensions

**Files:**
- Create: `apps/ios/Sources/Utilities/StringTruncation.swift`
- Create: `apps/ios/Sources/Utilities/Haptics.swift`
- Create: `apps/ios/Sources/Utilities/ConnectionStateColor.swift`
- Create: `apps/ios/Tests/Unit/StringTruncationTests.swift`

**Step 1: Write StringTruncation unit tests**

```swift
// Tests/Unit/StringTruncationTests.swift
import XCTest
@testable import Llamenos

final class StringTruncationTests: XCTestCase {

    func testTruncatedNpubShortString() {
        let short = "npub1abc"
        XCTAssertEqual(short.truncatedNpub(), "npub1abc")
    }

    func testTruncatedNpubLongString() {
        let long = "npub1qqqsyqcyq5rqwzqfhg9scnmcesgvse3s43jy5wdxkfhmyzxhldqqu69m0z"
        XCTAssertEqual(long.truncatedNpub(), "npub1qqqsyqc...u69m0z")
    }

    func testTruncatedNpubEmptyString() {
        XCTAssertEqual("".truncatedNpub(), "")
    }

    func testTruncatedPubkeyLongString() {
        let long = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
        XCTAssertEqual(long.truncatedPubkey(), "abcdef12...567890")
    }

    func testTruncatedHashCustomLengths() {
        let hash = "abcdef1234567890"
        XCTAssertEqual(hash.truncatedHash(4, suffixLen: 3), "abcd...890")
    }

    func testTruncatedHashExactLength() {
        let hash = "abcdefgh"
        // 8 chars with prefix 4 + suffix 3 + "..." = needs > 7+3=10 to truncate
        XCTAssertEqual(hash.truncatedHash(4, suffixLen: 3), "abcdefgh")
    }
}
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/rhonda/projects/llamenos/apps/ios && xcodebuild test -project Llamenos.xcodeproj -scheme Llamenos -destination "platform=iOS Simulator,name=iPhone 17" -only-testing:LlamenosTests/StringTruncationTests 2>&1 | grep -E '(Test Case|error:|Executed)'`
Expected: Compilation error — `truncatedNpub()` not defined

**Step 3: Implement StringTruncation.swift**

```swift
// Sources/Utilities/StringTruncation.swift
import Foundation

extension String {
    func truncatedNpub() -> String {
        truncatedHash(12, suffixLen: 6)
    }

    func truncatedPubkey() -> String {
        truncatedHash(8, suffixLen: 6)
    }

    func truncatedHash(_ prefixLen: Int = 8, suffixLen: Int = 6) -> String {
        guard count > prefixLen + suffixLen + 3 else { return self }
        let pre = prefix(prefixLen)
        let suf = suffix(suffixLen)
        return "\(pre)...\(suf)"
    }
}
```

**Step 4: Implement Haptics.swift**

```swift
// Sources/Utilities/Haptics.swift
import UIKit

enum Haptics {
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func warning() {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }

    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }

    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }

    static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .medium) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }
}
```

**Step 5: Implement ConnectionStateColor.swift**

Read `apps/ios/Sources/Services/WebSocketService.swift` to find the exact `WebSocketConnectionState` enum name and cases. Then implement:

```swift
// Sources/Utilities/ConnectionStateColor.swift
import SwiftUI

extension WebSocketConnectionState {
    var color: Color {
        switch self {
        case .connected: return .statusActive
        case .connecting, .reconnecting: return .statusWarning
        case .disconnected: return .brandDestructive
        }
    }
}
```

**Step 6: Run unit tests**

Run: unit test command for StringTruncationTests
Expected: All 6 tests PASS

**Step 7: Regenerate xcodeproj and build**

Run: `cd /Users/rhonda/projects/llamenos/apps/ios && xcodegen generate && xcodebuild build -project Llamenos.xcodeproj -scheme Llamenos -destination "platform=iOS Simulator,name=iPhone 17" 2>&1 | tail -5`
Expected: BUILD SUCCEEDED

**Step 8: Commit**

```bash
git add apps/ios/Sources/Utilities/ apps/ios/Tests/Unit/StringTruncationTests.swift && git commit -m "feat(ios): add String+Truncation, Haptics, ConnectionState+Color utilities (Epic 269)"
```

---

### Task 4: Shared Components Library (Part 1 — BrandCard, StatusDot, BadgeView)

**Files:**
- Create: `apps/ios/Sources/Views/Components/BrandCard.swift`
- Create: `apps/ios/Sources/Views/Components/StatusDot.swift`
- Create: `apps/ios/Sources/Views/Components/BadgeView.swift`

**Step 1: Implement BrandCard**

```swift
// Sources/Views/Components/BrandCard.swift
import SwiftUI

struct BrandCard<Content: View>: View {
    let content: Content
    var padding: CGFloat

    init(padding: CGFloat = 16, @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.content = content()
    }

    var body: some View {
        content
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.brandCard)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.brandBorder, lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.04), radius: 2, y: 1)
    }
}
```

**Step 2: Implement StatusDot**

```swift
// Sources/Views/Components/StatusDot.swift
import SwiftUI

struct StatusDot: View {
    enum Status { case active, warning, inactive, error }

    let status: Status
    var animated: Bool = true

    @State private var isPulsing = false

    var body: some View {
        Circle()
            .fill(dotColor)
            .frame(width: 8, height: 8)
            .scaleEffect(isPulsing && animated && status == .active ? 1.3 : 1.0)
            .opacity(isPulsing && animated && status == .active ? 0.7 : 1.0)
            .animation(
                animated && status == .active
                    ? .easeInOut(duration: 1.2).repeatForever(autoreverses: true)
                    : .default,
                value: isPulsing
            )
            .onAppear {
                if animated && status == .active {
                    isPulsing = true
                }
            }
    }

    private var dotColor: Color {
        switch status {
        case .active: return .statusActive
        case .warning: return .statusWarning
        case .inactive: return .brandMutedForeground
        case .error: return .statusDanger
        }
    }
}
```

**Step 3: Implement BadgeView**

```swift
// Sources/Views/Components/BadgeView.swift
import SwiftUI

struct BadgeView: View {
    let text: String
    var icon: String? = nil
    var color: Color = .brandPrimary
    var style: BadgeStyle = .filled

    enum BadgeStyle { case filled, outlined, subtle }

    var body: some View {
        HStack(spacing: 4) {
            if let icon {
                Image(systemName: icon)
                    .font(.caption2)
            }
            Text(text)
                .font(.brand(.caption2))
                .fontWeight(.medium)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .foregroundStyle(foregroundColor)
        .background(
            Capsule()
                .fill(backgroundColor)
        )
        .overlay(
            Capsule()
                .stroke(borderColor, lineWidth: style == .outlined ? 1 : 0)
        )
    }

    private var foregroundColor: Color {
        switch style {
        case .filled: return .brandPrimaryForeground
        case .outlined: return color
        case .subtle: return color
        }
    }

    private var backgroundColor: Color {
        switch style {
        case .filled: return color
        case .outlined: return .clear
        case .subtle: return color.opacity(0.12)
        }
    }

    private var borderColor: Color {
        switch style {
        case .outlined: return color
        default: return .clear
        }
    }
}
```

**Step 4: Build**

Run: `xcodegen generate && xcodebuild build` (abbreviated)
Expected: BUILD SUCCEEDED

**Step 5: Commit**

```bash
git add apps/ios/Sources/Views/Components/BrandCard.swift apps/ios/Sources/Views/Components/StatusDot.swift apps/ios/Sources/Views/Components/BadgeView.swift && git commit -m "feat(ios): add BrandCard, StatusDot, BadgeView shared components (Epic 269)"
```

---

### Task 5: Shared Components Library (Part 2 — CopyableField, CopyConfirmationBanner, BrandEmptyState, GeneratedAvatar, StepIndicator)

**Files:**
- Create: `apps/ios/Sources/Views/Components/CopyableField.swift`
- Create: `apps/ios/Sources/Views/Components/CopyConfirmationBanner.swift`
- Create: `apps/ios/Sources/Views/Components/BrandEmptyState.swift`
- Create: `apps/ios/Sources/Views/Components/GeneratedAvatar.swift`
- Create: `apps/ios/Sources/Views/Components/StepIndicator.swift`

**Step 1: Implement CopyableField**

```swift
// Sources/Views/Components/CopyableField.swift
import SwiftUI

struct CopyableField: View {
    let label: String
    let value: String
    var truncated: Bool = true

    @State private var showCopied = false

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.brand(.caption))
                    .foregroundStyle(.brandMutedForeground)
                Text(truncated ? value.truncatedHash() : value)
                    .font(.brandMono(.caption))
                    .foregroundStyle(.brandForeground)
                    .lineLimit(1)
            }

            Spacer()

            Button {
                UIPasteboard.general.string = value
                Haptics.impact(.light)
                withAnimation { showCopied = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    withAnimation { showCopied = false }
                }
            } label: {
                Image(systemName: showCopied ? "checkmark" : "doc.on.doc")
                    .font(.caption)
                    .foregroundStyle(showCopied ? .statusActive : .brandPrimary)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.plain)
        }
    }
}
```

**Step 2: Implement CopyConfirmationBanner**

```swift
// Sources/Views/Components/CopyConfirmationBanner.swift
import SwiftUI

struct CopyConfirmationBanner: View {
    let message: String

    init(_ message: String = "Copied to clipboard") {
        self.message = message
    }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.statusActive)
            Text(message)
                .font(.brand(.subheadline))
                .foregroundStyle(.brandForeground)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            Capsule()
                .fill(Color.brandCard)
                .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
        )
        .overlay(
            Capsule()
                .stroke(Color.brandBorder, lineWidth: 1)
        )
        .padding(.bottom, 16)
    }
}
```

**Step 3: Implement BrandEmptyState**

```swift
// Sources/Views/Components/BrandEmptyState.swift
import SwiftUI

struct BrandEmptyState: View {
    let icon: String
    let title: String
    let message: String
    var action: (() -> Void)? = nil
    var actionLabel: String? = nil

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 48))
                .foregroundStyle(.brandMutedForeground)

            Text(title)
                .font(.brand(.headline))
                .foregroundStyle(.brandForeground)

            Text(message)
                .font(.brand(.subheadline))
                .foregroundStyle(.brandMutedForeground)
                .multilineTextAlignment(.center)

            if let action, let actionLabel {
                Button(action: action) {
                    Text(actionLabel)
                        .font(.brand(.subheadline))
                        .fontWeight(.semibold)
                }
                .buttonStyle(.borderedProminent)
                .tint(.brandPrimary)
            }
        }
        .padding(32)
    }
}
```

**Step 4: Implement GeneratedAvatar**

```swift
// Sources/Views/Components/GeneratedAvatar.swift
import SwiftUI

struct GeneratedAvatar: View {
    let hash: String
    var size: CGFloat = 40

    var body: some View {
        ZStack {
            Circle()
                .fill(avatarColor)
                .frame(width: size, height: size)

            Text(initials)
                .font(.system(size: size * 0.35, weight: .semibold, design: .monospaced))
                .foregroundStyle(.white)
        }
    }

    private var avatarColor: Color {
        guard hash.count >= 6 else { return .brandMutedForeground }
        let hexPrefix = String(hash.suffix(from: hash.index(hash.startIndex, offsetBy: max(0, hash.count >= 10 ? 4 : 0))).prefix(6))
        let hue = hexPrefix.unicodeScalars.reduce(0) { sum, char in sum + Int(char.value) } % 360
        return Color(hue: Double(hue) / 360.0, saturation: 0.55, brightness: 0.75)
    }

    private var initials: String {
        guard hash.count >= 2 else { return "?" }
        // Skip the "npub1" prefix if present
        let start = hash.hasPrefix("npub1") ? hash.index(hash.startIndex, offsetBy: 5) : hash.startIndex
        return String(hash[start...].prefix(2)).uppercased()
    }
}
```

**Step 5: Implement StepIndicator**

```swift
// Sources/Views/Components/StepIndicator.swift
import SwiftUI

struct StepIndicator: View {
    let totalSteps: Int
    let currentStep: Int

    var body: some View {
        HStack(spacing: 8) {
            ForEach(1...totalSteps, id: \.self) { step in
                Circle()
                    .fill(step <= currentStep ? Color.brandPrimary : Color.brandBorder)
                    .frame(width: 8, height: 8)
                    .scaleEffect(step == currentStep ? 1.2 : 1.0)
                    .animation(.easeInOut(duration: 0.2), value: currentStep)
            }
        }
    }
}
```

**Step 6: Build**

Run: `xcodegen generate && xcodebuild build`
Expected: BUILD SUCCEEDED

**Step 7: Commit**

```bash
git add apps/ios/Sources/Views/Components/ && git commit -m "feat(ios): add CopyableField, CopyConfirmationBanner, BrandEmptyState, GeneratedAvatar, StepIndicator (Epic 269)"
```

---

### Task 6: UINavigationBar DM Sans + LoadingOverlay Brand Tinting

**Files:**
- Modify: `apps/ios/Sources/App/LlamenosApp.swift`
- Modify: `apps/ios/Sources/Views/Components/LoadingOverlay.swift`

**Step 1: Add UINavigationBar.appearance() to LlamenosApp.init()**

Add an `init()` to LlamenosApp before the `body` property:

```swift
init() {
    let largeTitleAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont(name: "DMSans-Bold", size: 34) ?? UIFont.systemFont(ofSize: 34, weight: .bold)
    ]
    let inlineTitleAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont(name: "DMSans-SemiBold", size: 17) ?? UIFont.systemFont(ofSize: 17, weight: .semibold)
    ]
    UINavigationBar.appearance().largeTitleTextAttributes = largeTitleAttrs
    UINavigationBar.appearance().titleTextAttributes = inlineTitleAttrs
}
```

**Step 2: Update LoadingOverlay with brand tinting**

Replace LoadingOverlay body with:
- Spinner: `.tint(.brandPrimary)` instead of `.tint(.white)`
- Background card: `.fill(Color.brandCard)` with `.ultraThinMaterial`
- Message text: `.font(.brand(.subheadline))` + `.foregroundStyle(.brandForeground)`

```swift
var body: some View {
    ZStack {
        Color.black.opacity(0.3)
            .ignoresSafeArea()

        VStack(spacing: 16) {
            ProgressView()
                .progressViewStyle(.circular)
                .scaleEffect(1.2)
                .tint(.brandPrimary)

            if let message {
                Text(message)
                    .font(.brand(.subheadline))
                    .foregroundStyle(.brandForeground)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(24)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.brandBorder, lineWidth: 1)
        )
    }
    .accessibilityIdentifier("loading-overlay")
    .accessibilityLabel(message ?? NSLocalizedString("loading", comment: "Loading"))
    .accessibilityAddTraits(.isModal)
    .allowsHitTesting(true)
    .transition(.opacity.animation(.easeInOut(duration: 0.2)))
}
```

**Step 3: Build and verify**

Run: build command
Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add apps/ios/Sources/App/LlamenosApp.swift apps/ios/Sources/Views/Components/LoadingOverlay.swift && git commit -m "feat(ios): DM Sans nav bar + brand-tinted LoadingOverlay (Epic 269)"
```

---

### Task 7: DM Sans Typography Migration — Replace ALL .font() calls

**Files:**
- Modify: ALL view files under `apps/ios/Sources/Views/`

**Step 1: Find all bare .font() calls**

Run: `cd /Users/rhonda/projects/llamenos/apps/ios && grep -rn '\.font(\.' Sources/Views/ | grep -v '.brand(' | grep -v 'brandMono' | grep -v '.system(' | head -50`

This identifies every `.font(.body)`, `.font(.title)`, `.font(.caption)`, etc. that needs conversion to `.font(.brand(...))`.

**Step 2: Replace all .font(.textStyle) with .font(.brand(.textStyle))**

Systematically go through each file and replace:
- `.font(.body)` → `.font(.brand(.body))`
- `.font(.title)` → `.font(.brand(.title))`
- `.font(.title2)` → `.font(.brand(.title2))`
- `.font(.title2.bold())` → `.font(.brand(.title2))`
- `.font(.headline)` → `.font(.brand(.headline))`
- `.font(.subheadline)` → `.font(.brand(.subheadline))`
- `.font(.caption)` → `.font(.brand(.caption))`
- `.font(.caption2)` → `.font(.brand(.caption2))`
- `.font(.footnote)` → `.font(.brand(.footnote))`
- `.font(.callout)` → `.font(.brand(.callout))`
- `.font(.largeTitle)` → `.font(.brand(.largeTitle))`

**Do NOT replace:**
- `.font(.system(.body, design: .monospaced))` → `.font(.brandMono(.body))` (for crypto identifiers)
- `.font(.system(size: N))` → leave as-is (specific sizes for icons/special elements)
- `.font(.title)` on `Image(systemName:)` → leave as-is (SF Symbol sizing)

**Step 3: Replace duplicated truncatedNpub/truncatedPubkey/connectionColor**

In `DashboardView.swift`:
- Remove private `truncatedNpub()` function
- Remove private `connectionColor` computed property
- Replace `truncatedNpub(npub)` calls with `npub.truncatedNpub()`
- Replace `connectionColor` usage with `appState.webSocketService.connectionState.color`

In `SettingsView.swift`:
- Remove private `truncatedNpub()` function
- Remove private `truncatedPubkey()` function
- Remove private `connectionColor` computed property
- Replace calls accordingly

In `PINUnlockView.swift`:
- Remove private `truncatedNpub()` function (lines 117-123)
- Replace `truncatedNpub(npub)` with `npub.truncatedNpub()`

**Step 4: Build and run all XCUITests**

Run: build command then test command
Expected: BUILD SUCCEEDED, all tests pass (no accessibility ID changes yet)

**Step 5: Commit**

```bash
git add apps/ios/Sources/ && git commit -m "feat(ios): migrate all views to DM Sans typography + extract shared utilities (Epic 269)"
```

---

### Task 8: Run Full Test Suite

**Step 1: Run all XCUITests**

Run: full test command from header
Expected: All tests pass

**Step 2: Run unit tests**

Run: `cd /Users/rhonda/projects/llamenos/apps/ios && xcodebuild test -project Llamenos.xcodeproj -scheme Llamenos -destination "platform=iOS Simulator,name=iPhone 17" -only-testing:LlamenosTests 2>&1 | tee /tmp/unittest-output.log | grep --line-buffered -E '(Test Case|Executed|error:)'`
Expected: All tests pass (including new StringTruncationTests)

**Step 3: Commit if any test fixes were needed**

---

## Epic 270: Auth Flow Redesign

### Task 9: LoginView — Branded Welcome

**Files:**
- Modify: `apps/ios/Sources/Views/Auth/LoginView.swift`

**Step 1: Read the current LoginView.swift fully**

Read `apps/ios/Sources/Views/Auth/LoginView.swift` completely to understand all accessibility IDs and behavior.

**Step 2: Rewrite LoginView with branded design**

Key changes:
- Replace `phone.fill` with "Llamenos" text in DM Sans bold + `phone.badge.checkmark` icon
- Add subtle teal gradient at top (15% of screen)
- Hub URL field: custom styled with `brandBorder` outline, `brandCard` background, teal focus ring (remove `.roundedBorder`)
- "Create New Identity": full-width, `brandPrimary` fill, white text, 14pt corner radius
- "Import Key": full-width outlined with `brandPrimary` border
- Security tagline at bottom: lock icon + "End-to-end encrypted" in `brandMutedForeground`
- **Preserve ALL accessibility identifiers:** `hub-url-input`, `create-identity`, `import-key`, `login-error`, `auth-error`

**Step 3: Update ImportKeyView with branded header**

- Same branded header treatment
- Security note: `brandCard` background with `brandPrimary` left accent border
- **Preserve:** `nsec-input`, `submit-import`, `cancel-import`

**Step 4: Build and run auth flow tests**

Run: `xcodebuild test -only-testing:LlamenosUITests/AuthFlowUITests` + `SecurityUITests`
Expected: All pass

**Step 5: Commit**

```bash
git add apps/ios/Sources/Views/Auth/LoginView.swift && git commit -m "feat(ios): branded LoginView + ImportKeyView (Epic 270)"
```

---

### Task 10: OnboardingView — Dramatic Key Backup

**Files:**
- Modify: `apps/ios/Sources/Views/Auth/OnboardingView.swift`

**Step 1: Read and rewrite OnboardingView**

Key changes:
- Add `StepIndicator(totalSteps: 3, currentStep: 2)` at top
- Key icon: animated entrance (scale from 0.8 → 1.0 with spring)
- nsec display: dark `brandNavy` background in light mode, `brandCard` in dark mode, monospaced, inner shadow
- Copy button: prominent, transitions to green checkmark after copy
- Warning: `brandAccent` background at 0.2 opacity, bold "WARNING" prefix, pulse on appear
- Checkbox: `brandPrimary` fill when checked, scale animation
- Continue: matches LoginView CTA style
- **Preserve:** `copy-nsec`, `npub-display`, `confirm-backup`, `continue-to-pin`, `back-button`

**Step 2: Build and run auth tests**

Expected: All pass

**Step 3: Commit**

```bash
git add apps/ios/Sources/Views/Auth/OnboardingView.swift && git commit -m "feat(ios): dramatic OnboardingView with StepIndicator (Epic 270)"
```

---

### Task 11: PINPadView — Haptics & Animations

**Files:**
- Modify: `apps/ios/Sources/Views/Components/PINPadView.swift`

**Step 1: Add haptics and visual improvements to PINPadView**

Key changes:
- **Haptics:** `Haptics.impact(.light)` on every digit tap, `Haptics.impact(.rigid)` on backspace, `Haptics.success()` on complete
- **PIN dots:** scale-up animation when filled (1.0 → 1.3 → 1.0 spring), color transition from `brandBorder` to `brandPrimary`
- **Wrong PIN shake:** Add a `@Binding var shake: Bool` parameter. When `shake` is true, apply horizontal offset oscillation on the dots row (3 cycles, 0.4s), dots flash red briefly. Reset `shake` to false after animation.
- **Digit buttons:** `brandCard` background instead of `systemGray6`, subtle press scale (0.95), `brandBorder` ring
- **Long-press backspace:** `.simultaneousGesture(LongPressGesture(minimumDuration: 0.5))` clears entire PIN with haptic
- **Preserve:** `pin-pad`, `pin-dots`, `pin-0` through `pin-9`, `pin-backspace`

**Step 2: Update PINSetView and PINUnlockView to pass shake binding**

Add `@State private var shakeOnError = false` to both views. Wire PINViewModel error to trigger shake.

**Step 3: Build and run PIN-related tests**

Run: SecurityUITests + AuthFlowUITests
Expected: All pass

**Step 4: Commit**

```bash
git add apps/ios/Sources/Views/Components/PINPadView.swift apps/ios/Sources/Views/Auth/PINSetView.swift apps/ios/Sources/Views/Auth/PINUnlockView.swift && git commit -m "feat(ios): PINPad haptics, shake animation, brand styling (Epic 270)"
```

---

### Task 12: PINSetView + PINUnlockView — Brand Polish

**Files:**
- Modify: `apps/ios/Sources/Views/Auth/PINSetView.swift`
- Modify: `apps/ios/Sources/Views/Auth/PINUnlockView.swift`

**Step 1: PINSetView improvements**

- Add `StepIndicator(totalSteps: 3, currentStep: 3)` at top
- Lock icon animated between `lock.open.fill` and `lock.fill` with rotation + scale
- Phase transition: cross-dissolve on title/subtitle
- **Preserve:** `pin-error`, `back-button`

**Step 2: PINUnlockView improvements**

- Large lock icon with breathing animation (scale 1.0 → 1.02 → 1.0, 3s cycle)
- npub in `BrandCard` using `CopyableField`
- Biometric button: subtle pulse
- Background: subtle gradient
- **Preserve:** `locked-npub`, `pin-error`, `biometric-unlock`, `pin-pad`

**Step 3: SecureTextField brand styling**

Modify `apps/ios/Sources/Views/Components/SecureTextField.swift`:
- Background: `brandNavy` in light mode, `brandCard` in dark mode
- Border: `brandAccent` (amber)
- Label: `.brand(.caption)`
- **Preserve:** `nsec-display`

**Step 4: Build and test**

Expected: All auth + security tests pass

**Step 5: Commit**

```bash
git add apps/ios/Sources/Views/Auth/ apps/ios/Sources/Views/Components/SecureTextField.swift && git commit -m "feat(ios): branded PINSet, PINUnlock, SecureTextField (Epic 270)"
```

---

## Epic 271: Dashboard & Tab Bar Overhaul

### Task 13: DashboardView — Full Rebuild

**Files:**
- Modify: `apps/ios/Sources/Views/Dashboard/DashboardView.swift`

**Step 1: Read the full DashboardView.swift**

Read the entire file to understand all sections, accessibility IDs, and ViewModel integration.

**Step 2: Rewrite DashboardView as custom ScrollView**

Replace the entire `List(.insetGrouped)` with a `ScrollView` containing:

```
ScrollView {
    VStack(spacing: 16) {
        heroShiftCard          // Full-width BrandCard, gradient, StatusDot, timer, clock button
        activityStatsRow       // HStack of 3 compact BrandCards (calls, notes, messages)
        quickActionsGrid       // 2-column LazyVGrid of tappable BrandCards
        identityConnectionStrip // Compact BrandCard with CopyableField + StatusDot
        recentNotesSection     // "Recent Notes" with max 3 compact BrandCard rows
        errorBanner            // Amber BrandCard for errors
    }
    .padding(.horizontal, 16)
}
```

Key details:
- **Hero shift card:** conditional gradient bg (teal 10% when on shift), `StatusDot(.active, animated: true)`, `.brandMono(.title)` timer with `.contentTransition(.numericText())`, full-width clock button
- **Activity stats:** 3 `BrandCard` in `HStack`, large `.brand(.title)` numbers, `.brand(.caption)` labels
- **Quick actions:** `LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())])`, SF Symbol + label. Volunteer: Reports + Help. Admin: Reports + Contacts + Blasts + Help. **Add `case help` to `QuickActionDestination`** and navigation destination for `HelpView`.
- **Identity strip:** `CopyableField` for npub, StatusDot for connection, hub URL truncated
- **Recent notes:** max 3 note previews as compact rows, "See All" link
- **.refreshable** on ScrollView
- **Preserve:** `dashboard-title`, `dashboard-npub`, `connection-status`, `shift-status-card`, `shift-status-text`, `shift-elapsed-timer`, `active-calls-card`, `active-call-count`, `recent-notes-card`, `recent-note-count`, `dashboard-error`, `lock-app`, `dashboard-connection-card`

**Step 3: Add Help to QuickActionDestination**

In DashboardView, find the `QuickActionDestination` enum and add `case help`. Add navigation destination handling.

**Step 4: Build and run dashboard tests**

Run: DashboardUITests
Expected: All pass (accessibility IDs preserved)

**Step 5: Commit**

```bash
git add apps/ios/Sources/Views/Dashboard/DashboardView.swift && git commit -m "feat(ios): rebuild DashboardView as branded command center (Epic 271)"
```

---

### Task 14: MainTabView — Brand Polish

**Files:**
- Modify: `apps/ios/Sources/Views/Dashboard/MainTabView.swift`

**Step 1: Read and update MainTabView**

- Confirm `brandPrimary` tint is applied
- Style the unread conversations badge

**Step 2: Build and test**

**Step 3: Commit**

```bash
git add apps/ios/Sources/Views/Dashboard/MainTabView.swift && git commit -m "feat(ios): MainTabView brand polish (Epic 271)"
```

---

## Epic 272: Feature Screens Polish

### Task 15: Notes — Card Rows with Accent Borders

**Files:**
- Modify: `apps/ios/Sources/Views/Notes/NotesView.swift`
- Modify: `apps/ios/Sources/Views/Notes/NoteCreateView.swift`
- Modify: `apps/ios/Sources/Views/Notes/NoteDetailView.swift`

**Step 1: Read all three notes files**

**Step 2: NotesView — BrandCard rows with colored left accent borders**

- Note rows become `BrandCard` with left accent border (call=teal, conversation=green, standalone=brandBorder)
- Preview text: `.brand(.body)`, bold first line
- Author/badges: use `BadgeView`
- Date: `.brand(.footnote)`, `brandMutedForeground`
- "Load More": `brandPrimary` text

**Step 3: NoteCreateView — branded form**

- Form sections: `BrandCard` containers
- TextEditor: `brandCard` bg, `brandBorder` outline, `brandPrimary` focus ring
- Save button: `brandPrimary` fill

**Step 4: NoteDetailView — branded cards**

- Note text: full-width, `.brand(.body)`
- Custom fields: `BrandCard` with label-value pairs
- Metadata: collapsible `BrandCard`
- Call/Conversation IDs: `CopyableField`

**Step 5: Build and test NoteFlowUITests**

**Step 6: Commit**

```bash
git add apps/ios/Sources/Views/Notes/ && git commit -m "feat(ios): branded Notes views with accent borders (Epic 272)"
```

---

### Task 16: Conversations — Brand Bubbles & Generated Avatars

**Files:**
- Modify: `apps/ios/Sources/Views/Conversations/ConversationsView.swift`
- Modify: `apps/ios/Sources/Views/Conversations/ConversationDetailView.swift`

**Step 1: Read both conversation files**

**Step 2: ConversationsView — GeneratedAvatar + BrandCard rows**

- Contact identifier: `GeneratedAvatar(hash: conversation.contactDisplayHash, size: 36)`
- Unread badge: `brandDestructive` background
- Status: `BadgeView` with semantic colors

**Step 3: ConversationDetailView — brand-colored bubbles**

- Outbound: `brandPrimary` background (not `.accentColor`)
- Inbound: `brandCard` background with `brandBorder` outline
- Timestamps: `.brand(.caption2)`, `brandMutedForeground`
- Reply bar: `brandCard` bg, send button `brandPrimary`

**Step 4: Build and test ConversationFlowUITests**

**Step 5: Commit**

```bash
git add apps/ios/Sources/Views/Conversations/ && git commit -m "feat(ios): branded conversations with GeneratedAvatar + brand bubbles (Epic 272)"
```

---

### Task 17: Shifts — Circular Clock Button & Day Pills

**Files:**
- Modify: `apps/ios/Sources/Views/Shifts/ShiftsView.swift`

**Step 1: Read ShiftsView.swift**

**Step 2: Replace rectangular clock button with circular (80x80)**

- Clock in: green circle, white play icon, shadow, scale 0.9 on press
- Clock out: red circle, white stop icon
- Haptic on tap
- StatusDot with pulse when on shift
- Timer: `.brandMono(.title2)`, green when active
- Day pills: horizontal scroll, today highlighted with `brandPrimary`
- Shift rows: `BrandCard` with time range, volunteer count as `BadgeView`
- **Preserve:** `clock-in-button`, `clock-out-button`

**Step 3: Build and test ShiftFlowUITests**

**Step 4: Commit**

```bash
git add apps/ios/Sources/Views/Shifts/ShiftsView.swift && git commit -m "feat(ios): circular clock button + day pills for shifts (Epic 272)"
```

---

### Task 18: Reports, Blasts, Contacts — Brand Polish

**Files:**
- Modify: `apps/ios/Sources/Views/Reports/ReportsView.swift`
- Modify: `apps/ios/Sources/Views/Reports/ReportCreateView.swift`
- Modify: `apps/ios/Sources/Views/Reports/ReportDetailView.swift`
- Modify: `apps/ios/Sources/Views/Blasts/BlastsView.swift`
- Modify: `apps/ios/Sources/Views/Blasts/CreateBlastView.swift`
- Modify: `apps/ios/Sources/Views/Contacts/ContactsView.swift`
- Modify: `apps/ios/Sources/Views/Contacts/ContactTimelineView.swift`

**Step 1: Read all files**

**Step 2: Reports — status-coded BrandCard rows**

- Report rows as `BrandCard`
- Status badge: open=`statusActive`, pending=`statusWarning`, closed=`brandMutedForeground`
- Category: `brandPrimary` subtle badge
- ReportCreate/Detail: branded forms

**Step 3: Blasts — channel pills + status hierarchy**

- Subscriber stats: compact `BrandCard` with metrics
- Blast rows: `BrandCard` with status badge + channel pills
- "Send Now": `brandPrimary` compact button

**Step 4: Contacts — branded search + timeline**

- Contact rows: `BrandCard` with `GeneratedAvatar`, interaction badges, last seen
- ContactTimelineView: vertical timeline with colored dots + connecting line, `BrandCard` for event content

**Step 5: Build and test all related tests**

Run: ReportFlowUITests, BlastsUITests, ContactsUITests
Expected: All pass

**Step 6: Commit**

```bash
git add apps/ios/Sources/Views/Reports/ apps/ios/Sources/Views/Blasts/ apps/ios/Sources/Views/Contacts/ && git commit -m "feat(ios): branded Reports, Blasts, Contacts views (Epic 272)"
```

---

## Epic 273: Settings, Admin & Shared Polish

### Task 19: SettingsView — Restructure into Sub-Pages

**Files:**
- Modify: `apps/ios/Sources/Views/Settings/SettingsView.swift`
- Create: `apps/ios/Sources/Views/Settings/AccountSettingsView.swift`
- Create: `apps/ios/Sources/Views/Settings/PreferencesSettingsView.swift`

**Step 1: Read the full SettingsView.swift**

Read all 667 lines to understand every section and accessibility ID.

**Step 2: Create AccountSettingsView — extract identity, hub, connection, device link sections**

```swift
// Sources/Views/Settings/AccountSettingsView.swift
struct AccountSettingsView: View {
    @Environment(AppState.self) private var appState
    // ... extract existing identity, hub, connection, device link sections
    // Preserve all accessibility IDs: settings-npub, copy-npub, settings-pubkey, copy-pubkey,
    // settings-role, settings-hub-url, settings-connection, settings-link-device
}
```

**Step 3: Create PreferencesSettingsView — extract notifications, language, security sections**

```swift
// Sources/Views/Settings/PreferencesSettingsView.swift
struct PreferencesSettingsView: View {
    @Environment(AppState.self) private var appState
    // ... extract notification, language, security sections
    // Preserve: settings-call-sounds, settings-message-alerts,
    // settings-language-picker, settings-auto-lock-picker, settings-biometric-toggle
}
```

**Step 4: Rewrite SettingsView as navigation hub**

New layout:
```
#if DEBUG test-panic-wipe shortcut (PRESERVE)
Identity Card (GeneratedAvatar + CopyableField for npub + role BadgeView + hub + StatusDot)
NavigationLink "Account" → AccountSettingsView
NavigationLink "Preferences" → PreferencesSettingsView
NavigationLink "Admin Panel" (admin only) → AdminTabView
NavigationLink "Help & FAQ" → HelpView
--- separator ---
Lock App button (settings-lock-app)
Logout button (settings-logout)
--- separator ---
Emergency Wipe (red, visually separated) → PanicWipeConfirmationView
Version footer (settings-version)
```

**Accessibility IDs to preserve at top level:**
- `test-panic-wipe`, `settings-lock-app`, `settings-logout`, `settings-version`

**New accessibility IDs:**
- `settings-account-link`, `settings-preferences-link`, `settings-admin-link`

**Step 5: Build**

Run: build command
Expected: BUILD SUCCEEDED

**Step 6: Commit**

```bash
git add apps/ios/Sources/Views/Settings/ && git commit -m "feat(ios): restructure SettingsView into sub-pages with identity card (Epic 273)"
```

---

### Task 20: PanicWipeConfirmationView — Multi-Step Friction Gate

**Files:**
- Modify: `apps/ios/Sources/Views/Settings/PanicWipeConfirmationView.swift`

**Step 1: Add text input friction gate**

Changes:
- Add `@State private var confirmationText = ""` and `@State private var showFinalAlert = false`
- Add "Type WIPE to confirm" `TextField` with `.accessibilityIdentifier("panic-wipe-confirmation-input")`
- Confirm button disabled until `confirmationText.uppercased() == "WIPE"`
- On confirm tap: show system alert "This cannot be undone. Are you absolutely sure?" with destructive "Yes, Wipe Everything" + Cancel
- Haptic: `.warning` on entering screen, `.error` on final wipe
- **Preserve:** `confirm-panic-wipe`, `cancel-panic-wipe`
- **Add:** `panic-wipe-confirmation-input`

**Step 2: Build and run PanicWipeUITests**

The existing tests will need updates since `confirm-panic-wipe` is now disabled until text is typed. Update tests in Task 22.

**Step 3: Commit**

```bash
git add apps/ios/Sources/Views/Settings/PanicWipeConfirmationView.swift && git commit -m "feat(ios): PanicWipe multi-step friction gate (Epic 273)"
```

---

### Task 21: Admin + Help + DeviceLink — Brand Polish

**Files:**
- Modify: `apps/ios/Sources/Views/Admin/AdminTabView.swift`
- Modify: `apps/ios/Sources/Views/Admin/VolunteersView.swift`
- Modify: `apps/ios/Sources/Views/Admin/BanListView.swift`
- Modify: `apps/ios/Sources/Views/Admin/AuditLogView.swift`
- Modify: `apps/ios/Sources/Views/Admin/InviteView.swift`
- Modify: `apps/ios/Sources/Views/Admin/CustomFieldsView.swift`
- Modify: `apps/ios/Sources/Views/Admin/CustomFieldEditView.swift`
- Modify: `apps/ios/Sources/Views/Help/HelpView.swift`
- Modify: `apps/ios/Sources/Views/Settings/DeviceLinkView.swift`

**Step 1: AdminTabView — card layout with counts**

- Replace plain NavigationLink list with `BrandCard`-based navigation
- Each card: icon + name + count as `BadgeView(style: .subtle, color: .brandMutedForeground)`
- Counts load async on appear (spinner until loaded)

**Step 2: Admin sub-views — BrandCard styling**

Apply `BrandCard`, `BadgeView`, brand typography across all admin views.

**Step 3: HelpView — branded accordions**

- Section headers: `.brand(.headline)` with teal icon
- DisclosureGroup: `brandCard` background for expanded content
- E2EE indicator: `BadgeView`

**Step 4: DeviceLinkView — brand colors**

- QR scanner overlay: `brandPrimary` border corners
- SAS code: `brandCard` bg, `brandPrimary` active text
- Confirm/Reject: green=`statusActive`, red=`brandDestructive`

**Step 5: Build and test admin + help tests**

Run: AdminFlowUITests, AdminCustomFieldsUITests, HelpUITests, SecurityUITests (device link)
Expected: All pass

**Step 6: Commit**

```bash
git add apps/ios/Sources/Views/Admin/ apps/ios/Sources/Views/Help/ apps/ios/Sources/Views/Settings/DeviceLinkView.swift && git commit -m "feat(ios): admin cards, help accordions, device link brand styling (Epic 273)"
```

---

### Task 22: Update All XCUITests

**Files:**
- Modify: `apps/ios/Tests/UI/SettingsUITests.swift`
- Modify: `apps/ios/Tests/UI/PanicWipeUITests.swift`
- Modify: `apps/ios/Tests/UI/SecurityUITests.swift`
- Modify: `apps/ios/Tests/UI/DashboardUITests.swift`
- Modify: `apps/ios/Tests/UI/AdminFlowUITests.swift`

**Step 1: Update SettingsUITests navigation paths**

Tests that previously found elements directly in Settings now need sub-navigation:

```swift
// Elements now in AccountSettingsView:
// settings-npub, settings-hub-url, settings-connection, settings-link-device
// → Navigate: Settings > tap "settings-account-link" > then find element

// Elements now in PreferencesSettingsView:
// settings-call-sounds, settings-message-alerts, settings-auto-lock-picker, settings-biometric-toggle
// → Navigate: Settings > tap "settings-preferences-link" > then find element

// Elements still at top level:
// settings-lock-app, settings-logout, settings-version — no navigation change
```

Add helper methods:
```swift
private func navigateToAccountSettings() {
    let accountLink = find("settings-account-link")
    XCTAssertTrue(accountLink.waitForExistence(timeout: 5))
    accountLink.tap()
}

private func navigateToPreferencesSettings() {
    let prefsLink = find("settings-preferences-link")
    XCTAssertTrue(prefsLink.waitForExistence(timeout: 5))
    prefsLink.tap()
}
```

**Step 2: Update PanicWipeUITests for friction gate**

Update `navigateToPanicWipe()` and `testPanicWipeReturnsToLogin()`:
```swift
// After navigating to PanicWipeConfirmationView:
// 1. Confirm button is disabled
// 2. Type "WIPE" into panic-wipe-confirmation-input
// 3. Tap confirm button
// 4. Handle the final alert ("Yes, Wipe Everything")

let inputField = find("panic-wipe-confirmation-input")
XCTAssertTrue(inputField.waitForExistence(timeout: 5))
inputField.tap()
inputField.typeText("WIPE")

let confirmButton = find("confirm-panic-wipe")
XCTAssertTrue(confirmButton.waitForExistence(timeout: 3))
confirmButton.tap()

// Handle final confirmation alert
let alert = app.alerts.firstMatch
if alert.waitForExistence(timeout: 3) {
    // Tap the destructive action
    let wipeButton = alert.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Wipe'")).firstMatch
    if wipeButton.exists { wipeButton.tap() }
}
```

Add new test scenarios:
```swift
func testPanicWipeConfirmButtonDisabledUntilTyped() { ... }
func testPanicWipeLowercaseWipeAlsoWorks() { ... }
```

**Step 3: Update SecurityUITests**

- Biometric toggle is now under Settings > Preferences
- Auto-lock picker is under Settings > Preferences

**Step 4: Add new test scenarios for sub-page navigation**

```swift
func testSettingsAccountSubPageNavigation() {
    // Tap Account → verify identity section visible
}
func testSettingsPreferencesSubPageNavigation() {
    // Tap Preferences → verify notification toggles visible
}
```

**Step 5: Run full test suite**

Run: `xcodebuild test -only-testing:LlamenosUITests`
Expected: All tests pass

**Step 6: Commit**

```bash
git add apps/ios/Tests/UI/ && git commit -m "feat(ios): update all XCUITests for restructured navigation (Epics 270-273)"
```

---

### Task 23: Final Verification & Cleanup

**Step 1: Run ALL tests (unit + UI)**

Run: `cd /Users/rhonda/projects/llamenos/apps/ios && xcodebuild test -project Llamenos.xcodeproj -scheme Llamenos -destination "platform=iOS Simulator,name=iPhone 17" 2>&1 | tee /tmp/final-test-output.log | grep --line-buffered -E '(Test Case|Executed|error:)'`
Expected: All tests pass

**Step 2: Check for any leftover bare .font() calls**

Run: `grep -rn '\.font(\.' apps/ios/Sources/Views/ | grep -v '.brand(' | grep -v 'brandMono' | grep -v '.system(' | grep -v '\.font(.title)' | head -20`
Expected: No results (except `.system()` calls on Image for SF Symbol sizing)

**Step 3: Update epic status**

Edit `docs/epics/epic-269-ios-design-system-foundation.md` through `epic-273-ios-settings-admin-polish.md`: change `**Status**: PENDING` to `**Status**: COMPLETE`

**Step 4: Update backlog**

Update `docs/NEXT_BACKLOG.md` and `docs/COMPLETED_BACKLOG.md`.

**Step 5: Final commit**

```bash
git add docs/ && git commit -m "docs: mark Epics 269-273 complete, update backlog"
```
