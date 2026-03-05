# Epic 252: iOS Localization Integration

## Problem

Every `NSLocalizedString` call in the iOS app displays raw key strings (`dashboard_title`, `tab_notes`, `settings_hub_url`) because:

1. **No `.strings` files exist in the bundle.** The i18n codegen pipeline (`packages/i18n/tools/i18n-codegen.ts`) generates `Localizable.strings` files to `packages/i18n/generated/ios/{locale}.lproj/Localizable.strings`, but this has never been run, and the output directory doesn't exist.
2. **`project.yml` has no resource references** for `.strings` files, so even if generated, xcodegen wouldn't include them in the Xcode project.
3. **The app uses ~120 unique `NSLocalizedString` keys** across 33 Swift view files, all showing raw keys in the UI.

This is the single highest-impact fix — the entire app displays raw localization keys instead of English text (let alone the other 12 locales).

## Scope

- Run and verify `bun run i18n:codegen` generates iOS `.strings` files
- Wire generated `.strings` files into `apps/ios/project.yml` as resources
- Verify all 13 locales are included in the bundle
- Audit every `NSLocalizedString` key in Swift sources against `en.json` keys
- Add any missing keys to `packages/i18n/locales/en.json`
- Re-run codegen and verify xcodebuild succeeds with localized text

## Research: i18n Codegen Pipeline

### Source of truth
`packages/i18n/locales/en.json` — nested JSON:
```json
{
  "common": { "appName": "Llamenos", "cancel": "Cancel", "retry": "Retry" },
  "auth": { "login": "Login", "createIdentity": "Create New Identity" },
  "dashboard": { "title": "Dashboard", "shiftStatus": "Shift Status" }
}
```

### Codegen output
`packages/i18n/tools/i18n-codegen.ts` flattens nested keys with `_` separator:
- `common.appName` → `"common_appName" = "Llamenos";`
- `dashboard.title` → `"dashboard_title" = "Dashboard";`
- Output path: `packages/i18n/generated/ios/{locale}.lproj/Localizable.strings`

### Key format mismatch audit needed
The Swift code uses keys like:
- `dashboard_title` — should map to `dashboard.title` in JSON
- `tab_dashboard` — needs `tab.dashboard` in JSON (may not exist)
- `settings_npub` — needs `settings.npub` in JSON
- `badge_on_shift` — needs `badge.onShift` or similar

Many keys used in Swift likely DON'T exist in `en.json` yet. This epic must add all missing keys.

## Implementation Plan

### Step 1: Run codegen, assess gaps
```bash
bun run i18n:codegen
```
If the generated directory doesn't exist, the codegen should create it. Verify output.

### Step 2: Audit Swift keys vs generated keys
Extract all `NSLocalizedString` keys from Swift:
```bash
grep -roh 'NSLocalizedString("[^"]*"' apps/ios/Sources/ | sort -u
```
Compare against generated `.strings` keys. Document missing keys.

### Step 3: Add missing keys to en.json
For each missing key, add to the appropriate section in `packages/i18n/locales/en.json`. Use the `comment:` parameter from `NSLocalizedString` as the English value (these were intentionally written as English fallback comments).

### Step 4: Propagate to other locales
Add the same keys (with English values as placeholders) to all 12 other locale files. Mark with a `// TODO: translate` convention or leave English as fallback.

### Step 5: Wire into project.yml
Add to `apps/ios/project.yml`:
```yaml
targets:
  Llamenos:
    sources:
      - path: Sources
    resources:
      - path: Resources/Localizable
        type: folder
```

Create a symlink or copy step from `packages/i18n/generated/ios/` to `apps/ios/Resources/Localizable/`.

Alternatively, add a build phase script that runs the codegen and copies files.

### Step 6: Verify build + visual check
```bash
cd apps/ios && xcodegen generate
xcodebuild build -scheme Llamenos-Package -destination "platform=iOS Simulator,name=iPhone 17"
```
Launch simulator, verify English text displays correctly in all screens.

### Step 7: Update XCUITests — MANDATORY

After localization, raw key strings disappear from the UI. Tests that match on text content MUST be updated:

**ShiftFlowUITests.swift line 94-98:**
```swift
// BEFORE: matches raw key text
let text = statusLabel.label
XCTAssertTrue(text.contains("Shift") || text.contains("shift"), ...)
// AFTER: matches localized English text
XCTAssertTrue(text.contains("Shift") || text.contains("shift"), ...)
// This particular test still works because the English values contain "Shift"
```

**Key areas to audit:**
- Any `statusLabel.label` or `.value` assertions that check for English text
- Any `getByText()` equivalent patterns matching hardcoded strings
- Tab bar label assertions — currently tab labels show raw keys like `tab_dashboard`, after localization they'll show "Dashboard"
- Any test that navigates by tapping text rather than accessibility identifiers (none found — all use identifiers, which is safe)

**Safe patterns (no changes needed):**
- All `find("identifier")` calls — accessibility identifiers don't change
- All `anyElementExists(["id1", "id2"])` calls — checking identifiers not text
- All `scrollToFind("identifier")` calls — identifier-based

**Run full test suite after localization:**
```bash
xcodebuild test -scheme Llamenos -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:LlamenosUITests 2>&1 | grep --line-buffered -E '(Test Case|FAIL|pass|error:)'
```
All 107 tests must pass (106 currently passing + 1 pre-existing SettingsUITests failure).

## Files Modified
- `packages/i18n/locales/en.json` — add ~80+ missing keys
- `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json` — add same keys (English placeholders)
- `apps/ios/project.yml` — add `.strings` resource references
- Possibly `apps/ios/Package.swift` — add resource bundle if SPM-based
- Any XCUITest files that assert on raw key text

## Success Criteria
- App displays proper English text on all screens, not raw localization keys
- All 13 locale `.strings` files are included in the app bundle
- `bun run i18n:validate` passes (if it checks iOS completeness)
- XCUITests still pass (106/107+)

## Dependencies
- None — this is foundational and should be done first

## Security Considerations
- None — localization is UI-only, no crypto or auth changes
