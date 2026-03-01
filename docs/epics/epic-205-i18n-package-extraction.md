# Epic 205: i18n Package Extraction

## Goal

Extract locale files and language config into `packages/i18n/`, create a codegen tool that generates iOS `.strings` and Android `strings.xml` from the JSON source of truth, and update the desktop frontend to import from the shared package.

## Context

Llamenos currently has 13 locales at `src/client/locales/*.json` (836 keys each). All translations are statically imported and bundled. This works for the desktop app but doesn't help native iOS/Android clients, which need platform-native string formats.

### Current i18n Setup

- **Framework**: i18next + react-i18next
- **Locales**: en, es, zh, tl, vi, ar, fr, ht, ko, ru, hi, pt, de (13 languages)
- **Setup file**: `src/client/lib/i18n.ts` — static imports, localStorage persistence, RTL support (Arabic)
- **Language config**: `src/shared/languages.ts` — codes, labels, phone prefixes, IVR mappings
- **Usage**: 2,166 `t()` / `useTranslation()` calls across ~117 component files
- **Key structure**: Nested JSON (e.g., `common.save`, `auth.loginTitle`, `notes.createNote`)

### Buildit Reference

Buildit's `tools/i18n-codegen/` does exactly this: JSON → Android `strings.xml` + iOS `Localizable.strings` + Swift type-safe accessors. Key patterns to adopt:
- Flatten nested keys with underscores: `auth.loginTitle` → `auth_loginTitle`
- Convert i18next interpolation: `{{name}}` → `%@` (iOS) / `%s` (Android)
- Validate key coverage across locales (warn on missing translations)
- Platform-specific locale codes: `zh` → `zh-Hans` (iOS), `zh-rCN` (Android)

## Directory Structure

```
packages/i18n/
├── locales/
│   ├── en.json              # English (source of truth)
│   ├── es.json              # Spanish
│   ├── zh.json              # Chinese (Simplified)
│   ├── tl.json              # Tagalog
│   ├── vi.json              # Vietnamese
│   ├── ar.json              # Arabic
│   ├── fr.json              # French
│   ├── ht.json              # Haitian Creole
│   ├── ko.json              # Korean
│   ├── ru.json              # Russian
│   ├── hi.json              # Hindi
│   ├── pt.json              # Portuguese
│   └── de.json              # German
├── languages.ts             # Language config (moved from src/shared/languages.ts)
├── index.ts                 # Package exports
├── generated/
│   ├── ios/                 # Generated: {lang}.lproj/Localizable.strings
│   └── android/             # Generated: values-{lang}/strings.xml
├── tools/
│   └── i18n-codegen.ts      # Bun script for iOS/Android generation
└── package.json
```

## Implementation

### Step 1: Create Package Structure

**`packages/i18n/package.json`**:
```json
{
  "name": "@llamenos/i18n",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./index.ts",
    "./locales/*": "./locales/*",
    "./languages": "./languages.ts"
  }
}
```

### Step 2: Move Locale Files

```bash
git mv src/client/locales/*.json packages/i18n/locales/
```

### Step 3: Move Language Config

Move `src/shared/languages.ts` → `packages/i18n/languages.ts`.

Update the import in `src/shared/` to re-export from the package:
```typescript
// src/shared/languages.ts (becomes a re-export)
export * from '@llamenos/i18n/languages'
```

This maintains backward compatibility — existing imports of `@shared/languages` still work.

### Step 4: Create Package Index

**`packages/i18n/index.ts`**:
```typescript
// Locale JSON files
export { default as en } from './locales/en.json'
export { default as es } from './locales/es.json'
export { default as zh } from './locales/zh.json'
export { default as tl } from './locales/tl.json'
export { default as vi } from './locales/vi.json'
export { default as ar } from './locales/ar.json'
export { default as fr } from './locales/fr.json'
export { default as ht } from './locales/ht.json'
export { default as ko } from './locales/ko.json'
export { default as ru } from './locales/ru.json'
export { default as hi } from './locales/hi.json'
export { default as pt } from './locales/pt.json'
export { default as de } from './locales/de.json'

// Language configuration
export * from './languages'
```

### Step 5: Update Desktop i18n Setup

**`src/client/lib/i18n.ts`** — Change imports from local files to package:

```typescript
// Before:
import en from '../locales/en.json'
import es from '../locales/es.json'
// ...

// After:
import { en, es, zh, tl, vi, ar, fr, ht, ko, ru, hi, pt, de } from '@llamenos/i18n'
```

The rest of the i18n setup (i18next init, localStorage persistence, RTL handling) stays unchanged.

### Step 6: Update Vite Config and TypeScript Paths

Bun workspaces create symlinks in `node_modules/@llamenos/`, but Vite's resolver may not follow them. Add both a Vite alias and tsconfig path:

**`vite.config.ts`**:
```typescript
resolve: {
  alias: {
    '@llamenos/i18n': path.resolve(__dirname, './packages/i18n/index.ts'),
  },
}
```

**`tsconfig.json`**:
```json
{
  "compilerOptions": {
    "paths": {
      "@llamenos/i18n": ["./packages/i18n/index.ts"],
      "@llamenos/i18n/*": ["./packages/i18n/*"]
    }
  }
}
```

### Step 7: Build i18n Codegen Tool

**`packages/i18n/tools/i18n-codegen.ts`** — Bun script:

```typescript
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

const LOCALES_DIR = resolve(__dirname, '../locales')
const GENERATED_DIR = resolve(__dirname, '../generated')

// Locale code mapping for platform-specific formats
const IOS_LOCALE_MAP: Record<string, string> = {
  zh: 'zh-Hans',
  pt: 'pt-BR',
}

const ANDROID_LOCALE_MAP: Record<string, string> = {
  zh: 'zh-rCN',
  pt: 'pt-rBR',
}

// Flatten nested JSON to dot-notation keys
function flattenKeys(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}_${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenKeys(value as Record<string, unknown>, fullKey))
    } else if (typeof value === 'string') {
      result[fullKey] = value
    }
  }
  return result
}

// Convert i18next interpolation to iOS format
function toIOSString(value: string): string {
  let index = 0
  return value.replace(/\{\{(\w+)\}\}/g, () => {
    index++
    return index === 1 ? '%@' : `%${index}$@`
  })
}

// Convert i18next interpolation to Android format
function toAndroidString(value: string): string {
  let index = 0
  return value
    .replace(/\{\{(\w+)\}\}/g, () => {
      index++
      return index === 1 ? '%s' : `%${index}$s`
    })
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
}

// Generate iOS Localizable.strings
function generateIOS(locale: string, keys: Record<string, string>): string {
  const lines = Object.entries(keys)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `"${key}" = "${toIOSString(value)}";`)
  return lines.join('\n') + '\n'
}

// Generate Android strings.xml
function generateAndroid(locale: string, keys: Record<string, string>): string {
  const entries = Object.entries(keys)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `    <string name="${key}">${toAndroidString(value)}</string>`)
  return `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${entries.join('\n')}\n</resources>\n`
}

// Main codegen
function main() {
  const validate = process.argv.includes('--validate')
  const verbose = process.argv.includes('--verbose')

  // Read English as reference
  const enKeys = flattenKeys(JSON.parse(readFileSync(join(LOCALES_DIR, 'en.json'), 'utf-8')))
  const enKeyCount = Object.keys(enKeys).length

  console.log(`Source: ${enKeyCount} keys in English`)

  const localeFiles = readdirSync(LOCALES_DIR).filter(f => f.endsWith('.json'))
  let hasErrors = false

  for (const file of localeFiles) {
    const locale = file.replace('.json', '')
    const data = JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf-8'))
    const keys = flattenKeys(data)

    // Validate coverage
    if (locale !== 'en') {
      const missing = Object.keys(enKeys).filter(k => !(k in keys))
      if (missing.length > 0) {
        console.warn(`  ${locale}: ${missing.length} missing keys`)
        if (verbose) missing.slice(0, 10).forEach(k => console.warn(`    - ${k}`))
        hasErrors = true
      }
    }

    if (validate) continue

    // Generate iOS
    const iosLocale = IOS_LOCALE_MAP[locale] || locale
    const iosDir = join(GENERATED_DIR, 'ios', `${iosLocale}.lproj`)
    mkdirSync(iosDir, { recursive: true })
    writeFileSync(join(iosDir, 'Localizable.strings'), generateIOS(locale, keys))

    // Generate Android
    const androidLocale = ANDROID_LOCALE_MAP[locale] || locale
    const androidDir = join(GENERATED_DIR, 'android', locale === 'en' ? 'values' : `values-${androidLocale}`)
    mkdirSync(androidDir, { recursive: true })
    writeFileSync(join(androidDir, 'strings.xml'), generateAndroid(locale, keys))
  }

  if (validate && hasErrors) {
    process.exit(1)
  }

  if (!validate) {
    console.log(`Generated strings for ${localeFiles.length} locales`)
  }
}

main()
```

### Step 8: Root Scripts

**`package.json`**:
```json
{
  "scripts": {
    "i18n:codegen": "bun run packages/i18n/tools/i18n-codegen.ts",
    "i18n:validate": "bun run packages/i18n/tools/i18n-codegen.ts --validate"
  }
}
```

### Step 9: Add Generated Directories to `.gitignore`

```
packages/i18n/generated/
```

Generated iOS/Android strings are build artifacts, not source. They're regenerated on each build.

## What Stays In Place

- **`src/client/lib/i18n.ts`** — Still configures i18next, just imports from package instead of local files
- **RTL handling** — Arabic direction logic stays in the desktop app (platform-specific DOM manipulation)
- **IVR language mappings** — Move with `languages.ts` to the package
- **`useTranslation()` hooks** — All 2,166 call sites are unchanged

## Verification Checklist

1. `bun install` — workspace resolution works for `@llamenos/i18n`
2. `bun run typecheck` — no import errors from locale changes
3. `bun run build` — Vite build succeeds with package imports
4. `bun run test` — Playwright E2E tests pass (translations load correctly)
5. `bun run i18n:validate` — all locales have complete coverage vs. English
6. `bun run i18n:codegen` — generates valid iOS `.strings` and Android `strings.xml`
7. Language switching in the app still works (localStorage persistence)

## Risk Assessment

- **Low risk**: Moving JSON files — no code changes in the files themselves
- **Low risk**: Re-exporting `languages.ts` — existing imports still work
- **Low risk**: i18n codegen — additive tool, doesn't affect existing build
- **Medium risk**: Vite/TypeScript resolution of workspace package — may need path alias

## Dependencies

- Epic 200 (Monorepo Foundation) — for `packages/` directory

## Blocks

- Epic 206 (iOS Foundation) — iOS localization strings
- Epic 207 (Android Foundation) — Android localization strings
