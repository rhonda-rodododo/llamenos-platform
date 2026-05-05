# packages/i18n

Localization package for Llamenos. Manages translations across 13 locales and generates platform-specific string files.

## Supported Locales

`en`, `es`, `zh`, `tl`, `vi`, `ar`, `fr`, `ht`, `ko`, `ru`, `hi`, `pt`, `de`

`en` is the reference locale. All other locales are complete translations.

## Structure

```
locales/          # 13 JSON locale files (en.json, es.json, …)
languages.ts      # Language metadata (codes, display labels, Twilio voice IDs)
tools/
  i18n-codegen.ts          # Generates iOS .strings + Android strings.xml + Kotlin I18n.kt
  validate-strings.ts      # Cross-platform string reference validator
```

## Commands

```bash
bun run i18n:codegen           # Generate iOS .strings + Android strings.xml + Kotlin I18n.kt
bun run i18n:validate          # Check all locales for completeness
bun run i18n:validate:all      # Run all three validators (desktop, iOS, Android)
bun run i18n:validate:desktop  # Validate t('key') calls match en.json
bun run i18n:validate:ios      # Validate localized string refs in Swift
bun run i18n:validate:android  # Validate R.string.* refs match codegen output
```

## Adding a new string

1. Add the key and English value to `locales/en.json`
2. Add translations to all other locale files (or mark as TODO)
3. Run `bun run i18n:codegen` to regenerate platform files
4. Run `bun run i18n:validate:all` to check for missing keys

## Adding a new locale

1. Copy `locales/en.json` to `locales/<code>.json`
2. Translate all values
3. Add the locale entry to `languages.ts` (code, label, Twilio voice ID)
4. Run `bun run i18n:codegen` and `bun run i18n:validate:all`

## Platform output

Codegen writes to:
- `apps/ios/Sources/Generated/` — iOS `.strings` files
- `apps/android/app/src/main/res/values-*/strings.xml` — Android string resources
- `apps/android/app/src/main/java/.../I18n.kt` — Kotlin I18n constants

Generated output is gitignored in those directories — always regenerate via `bun run i18n:codegen`.
