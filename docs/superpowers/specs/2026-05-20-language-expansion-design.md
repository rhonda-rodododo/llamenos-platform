# Language Expansion: 22 Languages + Hub-Configurable IVR + Blast Content Languages

**Date:** 2026-05-20
**Status:** Approved

## Summary

Port 9 missing languages from v1 to v2, refactor the IVR menu to be hub-configurable (not hardcoded), add blast content language support, and expand site documentation to all 22 locales.

## Languages Being Added

| Code | Name | Phone Prefix | Notes |
|------|------|-------------|-------|
| uk | Українська (Ukrainian) | +380 | Remove +380 from `ru` prefixes |
| fa | فارسی (Farsi/Persian) | +98, +93 | Covers Dari (Afghanistan) |
| tr | Türkçe (Turkish) | +90 | |
| ku | Kurdî (Kurdish) | (none) | Stateless — UI selection only |
| so | Soomaali (Somali) | +252 | |
| am | አማርኛ (Amharic) | +251 | |
| my | မြန်မာ (Burmese) | +95 | Rohingya and Myanmar refugees |
| quc | K'iche' (Maya) | (none) | Indigenous — UI selection only |
| mix | Tu'un savi (Mixtec) | (none) | Indigenous — UI selection only |

## Part 1: Language Config + Voice Prompts (mechanical port from v1)

### Files to modify

1. **`packages/i18n/languages.ts`**
   - Add 9 language entries from v1 (configs, phone prefixes, flags)
   - Move `+380` from `ru.phonePrefixes` to `uk.phonePrefixes`
   - Remove the `LanguageConfig.twilioVoice` field (was v1-only, not in v2 type)

2. **`packages/shared/voice-prompts.ts`**
   - Add all 9 languages to every existing prompt record in `VOICE_PROMPTS`
   - Add missing prompt keys from v1: `captchaRetry`, `unavailableMessage`
   - Upgrade `captchaFail` to use v1's fuller text (current v2 text is shorter)
   - Add all 9 languages to `VOICEMAIL_THANKS`
   - `IVR_PROMPTS` stays at 10 entries (the current keypad languages) — new languages don't get IVR announcements since the menu is being refactored to hub-configurable

3. **`packages/shared/languages.ts`** (re-export from i18n)
   - Verify this re-exports correctly after i18n changes

### Data source

All translations come directly from v1's `src/shared/voice-prompts.ts` and `src/shared/languages.ts`. No new translation work needed for voice prompts.

## Part 2: Locale Files (translation work)

### 9 new locale JSON files in `packages/i18n/locales/`

v1's locale files (~2000 lines) cover v1's UI. v2's en.json has ~4600 lines. Strategy:

1. Copy v1 locale files as a base (they cover ~40-50% of v2's keys)
2. For keys that exist in v1, use v1's translations
3. For keys new to v2 (the other 50-60%), generate translations
4. Validate all locale files have 100% key coverage against en.json using `bun run i18n:validate`

### Affected files
- `packages/i18n/locales/uk.json` (new)
- `packages/i18n/locales/fa.json` (new)
- `packages/i18n/locales/tr.json` (new)
- `packages/i18n/locales/ku.json` (new)
- `packages/i18n/locales/so.json` (new)
- `packages/i18n/locales/am.json` (new)
- `packages/i18n/locales/my.json` (new)
- `packages/i18n/locales/quc.json` (new)
- `packages/i18n/locales/mix.json` (new)

## Part 3: Hub-Configurable IVR Menu

### Current state
- `IVR_LANGUAGES` is a hardcoded 10-element array in `packages/shared/languages.ts`
- `system_settings.ivr_languages` column exists (text array) but is system-wide
- UI component `ivr-languages-section.tsx` toggles languages on/off from the hardcoded list
- `ivrIndexToDigit()` / `languageFromDigit()` map array indices to phone digits

### Target state
- IVR language list is stored per-hub in `hub_settings.settings` JSONB (key: `ivrLanguages`)
- `system_settings.ivr_languages` becomes the default when a hub has no override
- Admin UI shows ALL 22 supported languages (not just the hardcoded 10), with drag-to-reorder
- Hub admin picks which languages to offer and in what order
- If a hub enables <=9 languages: single-level digit menu (1-9)
- If a hub enables >9 languages: first 8 get digits 1-8, digit 9 = "for more languages, press 9" sub-menu, digit 0 = repeat menu
- `IVR_PROMPTS` entries needed for all 22 languages (each language announces itself)
- `ivrIndexToDigit()` and `languageFromDigit()` updated to support the two-level scheme

### Schema changes
- `hub_settings.settings` JSONB gains `ivrLanguages: string[]` field
- Protocol schema: add `ivrLanguages` to hub settings response/update schemas
- Settings service: fall back to `system_settings.ivr_languages` when hub has no override
- Telephony adapters: read IVR language list from hub config, not from hardcoded constant

### IVR prompt generation
Each telephony adapter's `handleLanguageMenu()` must:
1. Fetch the hub's enabled IVR languages (ordered)
2. Generate TTS for each language in its native voice
3. If >9: generate the sub-menu layer
4. Languages not in IVR menu still work via phone-prefix auto-detection

### New IVR_PROMPTS for all 22 languages
Currently only 10 languages have IVR self-announcement prompts. Need to add:
- hi: 'हिन्दी के लिए, [N] दबाएं।'
- pt: 'Para português, pressione [N].'
- de: 'Für Deutsch, drücken Sie [N].'
- uk: 'Для української мови натисніть [N].'
- fa: 'برای فارسی، [N] را فشار دهید.'
- tr: 'Türkçe için [N] tuşuna basın.'
- ku: 'Ji bo Kurdî, [N] bikirtînin.'
- so: 'Soomaaliga, riix [N].'
- am: 'ለአማርኛ [N] ይጫኑ።'
- my: 'မြန်မာဘာသာအတွက် [N] ကိုနှိပ်ပါ။'
- quc: "Ri K'iche', tachapa' [N]."
- mix: "Tu'un savi, koto chu'un [N]."

The `[N]` placeholder is replaced at runtime based on the language's position in the hub's ordered list.

## Part 4: Blast Content Languages

### Current state
- `createBlastBodySchema` has a single `content.body` field (one language)
- `subscriberResponseSchema` has a `language` field per subscriber
- `targetLanguages` filter exists on blast responses

### Target state
- Blast creation supports multi-language content: `content` becomes a record of `{ [langCode]: { body, mediaUrl? } }`
- When sending, each subscriber receives content in their preferred language, falling back to the blast's default language, then to English
- Blast UI shows a language tab picker for content authoring
- Existing single-body blasts continue to work (treated as the default language)

### Schema changes
- `createBlastBodySchema.content` becomes a union: either the current `{ body, mediaUrl? }` (single-language, backward compat) or `Record<string, { body, mediaUrl? }>` (multi-language)
- `blastResponseSchema.content` same union
- Delivery logic: resolve subscriber language → look up content in that language → fallback chain

## Part 5: Site Documentation

### Current state
13 locale directories under `site/src/content/docs/` and `site/src/content/pages/`

### Target state
22 locale directories. For each new locale (uk, fa, tr, ku, so, am, my, quc, mix):
- Copy `en/` directory structure as base
- Translate all pages (features, admin-guide, API reference, etc.)

## Part 6: i18n Codegen

After all locale files are in place:
- Run `bun run i18n:codegen` to regenerate iOS `.strings` + Android `strings.xml` + Kotlin `I18n.kt`
- Run `bun run i18n:validate:all` to verify completeness
- Run `bun run codegen` if protocol schemas changed (Part 3/4)

## Work Decomposition

These are independent workstreams that can be dispatched in parallel:

### Worker A: Language Config + Voice Prompts (Part 1)
- Modify `packages/i18n/languages.ts`
- Modify `packages/shared/voice-prompts.ts`
- Add IVR_PROMPTS for all 22 languages with `[N]` placeholder
- Commit

### Worker B: Locale Files (Part 2) — 9 workers or batched
- For each new language: create locale JSON with full key coverage
- Validate with `bun run i18n:validate`

### Worker C: Hub-Configurable IVR (Part 3)
- Schema changes (protocol + DB)
- Settings service changes
- Telephony adapter changes
- Admin UI refactor (drag-to-reorder, sub-menu support)
- Migration

### Worker D: Blast Content Languages (Part 4)
- Schema changes
- Service layer multi-language delivery
- UI language tab picker
- Backward compatibility

### Worker E: Site Documentation (Part 5)
- 9 new locale directories with translated content

### Worker F: Codegen + Validation (Part 6)
- Runs after A+B complete
- Codegen for iOS/Android/Kotlin
- Full validation suite

## Out of Scope

- TTS voice code mappings per provider per language (follow-up)
- Professional translation review (initial translations are machine-generated, flagged for review)
- Additional languages beyond 22 (Mam, Nahuatl, Zapotec, Bengali — future expansion)
