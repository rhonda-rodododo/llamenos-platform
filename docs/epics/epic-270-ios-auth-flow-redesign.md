# Epic 270: iOS Auth Flow Redesign

**Status**: PENDING
**Depends on**: Epic 269 (Design System Foundation)
**Branch**: `desktop`

## Summary

Redesign the authentication flow (Login, Onboarding, PIN screens) to create a striking first impression that conveys security, trust, and brand identity. The auth flow is the user's introduction to the app — it should feel like opening a secure vault, not filling out a settings form.

## Problem Statement

Current auth screens are plain ScrollViews with standard SwiftUI controls. The login uses a generic `phone.fill` SF Symbol as the logo. The nsec backup screen doesn't convey the gravity of "this key will never be shown again." The PIN pad uses flat `systemGray6` circles with no haptic feedback or error animations.

## Current Files

- `Sources/Views/Auth/LoginView.swift` (+ ImportKeyView) — 257 lines
- `Sources/Views/Auth/OnboardingView.swift` — 171 lines
- `Sources/Views/Auth/PINSetView.swift` — 113 lines
- `Sources/Views/Auth/PINUnlockView.swift` — 158 lines
- `Sources/Views/Auth/BiometricPrompt.swift` — utility, minimal changes
- `Sources/Views/Components/PINPadView.swift` — 152 lines
- `Sources/Views/Components/SecureTextField.swift` — 81 lines

## Tasks

### 1. LoginView — Branded Welcome Experience

**Layout overhaul:**
- Replace `phone.fill` with app wordmark: large "Llamenos" text in DM Sans bold + a custom teal shield/phone composite icon (SF Symbol `phone.badge.checkmark` or custom asset)
- Subtle teal-to-navy gradient at the top (15% of screen height) bleeding into the background
- Hub URL field: custom styled with `brandBorder` outline, `brandCard` background, teal focus ring — not `.roundedBorder`
- "Create New Identity" button: full-width, `brandPrimary` fill, white text, 14pt corner radius, medium shadow
- "Import Key" button: full-width, outlined with `brandPrimary` border, teal text, no fill
- Security tagline at bottom: small lock icon + "End-to-end encrypted" in `brandMutedForeground`
- Subtle background pattern or noise texture (optional — only if it adds, not clutters)

**ImportKeyView updates:**
- Same branded header treatment
- Security note card uses `brandCard` background with `brandPrimary` left accent border
- Green lock icon stays but uses brand styling

### 2. OnboardingView — Dramatic Key Backup

**Layout overhaul:**
- Step indicator at top: 3 dots showing progress (1. Create Key, 2. Backup, 3. Set PIN) — current step highlighted in `brandPrimary`
- Key icon: animated entrance (scale from 0.8 to 1.0 with spring, orange glow effect)
- nsec display: dark card (`brandNavy` background in light mode, `brandCard` in dark mode) with monospaced text, subtle inner shadow. The card should feel precious/important.
- Copy button: prominent, changes to green checkmark after copy with smooth transition
- Warning banner: uses `brandAccent` (amber) background with higher opacity (0.2 not 0.1), bold "WARNING" prefix, the exclamation icon should pulse gently once on appear
- Confirmation checkbox: custom styled with `brandPrimary` fill when checked, subtle scale animation
- Continue button: matches LoginView CTA styling

### 3. PINPadView — Haptic & Animated

**Interaction improvements:**
- Haptic feedback on every digit tap: `UIImpactFeedbackGenerator(.light)`
- Haptic on backspace: `UIImpactFeedbackGenerator(.rigid)`
- Haptic on complete PIN: `UINotificationFeedbackGenerator(.success)`
- Haptic on wrong PIN: `UINotificationFeedbackGenerator(.error)`

**Visual improvements:**
- PIN dots: scale-up animation when filled (1.0 → 1.3 → 1.0 spring), color transition from `brandBorder` to `brandPrimary`
- Wrong PIN: shake animation on the dots row (horizontal offset oscillation, 3 cycles, 0.4s) + dots flash red briefly
- Digit buttons: `brandCard` background (not `systemGray6`), subtle press-down scale (0.95) on tap, `brandBorder` ring
- Backspace: long-press gesture (0.5s) clears entire PIN with haptic
- Active digit area glow: subtle `brandPrimary` shadow behind the next empty dot

### 4. PINSetView — Animated Flow

**Improvements:**
- Lock icon animates between `lock.open.fill` and `lock.fill` with a smooth rotation + scale transition
- Phase transition (enter → confirm): cross-dissolve animation on title/subtitle text
- Loading overlay during encryption: uses brand-tinted spinner (from Epic 269)
- Progress: reuse the step indicator from OnboardingView (step 3 of 3 highlighted)

### 5. PINUnlockView — Branded Lock Screen

**Improvements:**
- Large lock icon with subtle breathing animation (scale 1.0 → 1.02 → 1.0, 3s cycle)
- Identity display: npub in a `BrandCard` with copy button (using new `CopyableField`)
- Biometric button: subtle pulse animation on the Face ID/Touch ID icon (draws attention once)
- Background: very subtle gradient from `brandBackground` to slightly darker at bottom
- Wrong PIN triggers the PINPadView shake animation (from Task 3)

### 6. SecureTextField — Branded Container

**Improvements:**
- Background: `brandNavy` in light mode (makes the key feel secure/dark), `brandCard` in dark mode
- Border: `brandAccent` (amber) — signals importance
- Monospaced text: slightly larger (16pt instead of 17pt body) for readability
- Label text uses `.brand(.caption)`

### 7. Update XCUITests

All existing auth flow tests must pass with the redesigned layouts:
- Verify accessibility identifiers are preserved
- Update any tests that depend on specific layout positions
- Add haptic-related assertions if applicable (likely not testable, just verify no crashes)

## Visual Reference

The auth flow should feel like:
- **Login**: A secure portal — clean, serious, branded. Think banking app login but warmer.
- **Onboarding**: A key ceremony — the nsec display should feel like being handed something precious.
- **PIN Entry**: A vault door — the dots filling up feel like tumblers clicking into place.
- **PIN Unlock**: A quick, confident unlock — biometric or PIN, minimal friction.

## Files Modified

- `Sources/Views/Auth/LoginView.swift` — full rewrite
- `Sources/Views/Auth/OnboardingView.swift` — full rewrite
- `Sources/Views/Auth/PINSetView.swift` — major updates
- `Sources/Views/Auth/PINUnlockView.swift` — major updates
- `Sources/Views/Components/PINPadView.swift` — haptics + animations
- `Sources/Views/Components/SecureTextField.swift` — brand styling
- `Tests/UI/` — auth flow test updates

## Acceptance Criteria

- [ ] LoginView has branded wordmark, gradient header, custom-styled hub URL field, branded CTA buttons
- [ ] OnboardingView has step indicator, dramatic nsec card, animated warning, styled checkbox
- [ ] PINPadView has haptic feedback on all interactions (digit, backspace, complete, error)
- [ ] PINPadView has shake animation on wrong PIN
- [ ] PIN dots animate on fill (scale spring + color transition)
- [ ] PINUnlockView has breathing lock icon + branded identity card
- [ ] SecureTextField uses branded dark card styling
- [ ] All existing XCUITests pass
- [ ] Both light and dark mode look correct (verify via simulator screenshots)
