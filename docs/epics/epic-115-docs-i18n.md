# Epic 115: Docs Site — i18n Completion

**Status: PENDING**
**Repo**: llamenos (site/)
**Priority**: Medium — completes internationalization coverage
**Depends on**: Epic 114 (new pages must exist before translating)

## Summary

Translate all untranslated docs and new pages into the remaining 11 languages (all except en and es, which are already done). This completes the docs site's i18n coverage.

## Current Translation Status

### Fully Translated (en + 12 languages)
- getting-started
- admin-guide
- volunteer-guide
- telephony-providers
- setup-twilio, setup-signalwire, setup-vonage, setup-plivo, setup-asterisk
- webrtc-calling

### Only en + es (missing 11 languages)
- self-hosting
- deploy-docker
- deploy-kubernetes
- reporter-guide
- setup-sms
- setup-whatsapp
- setup-signal

### New from Epic 114 (en only, missing 12 languages)
- mobile-guide
- architecture
- troubleshooting

### Target Languages (11)
zh, tl, vi, ar, fr, ht, ko, ru, hi, pt, de

## File Count

| Category | Docs | Languages | Files |
|----------|------|-----------|-------|
| Existing untranslated | 7 | 11 | 77 |
| New from Epic 114 | 3 | 12 (all except en) | 36 |
| **Total** | **10** | — | **113** |

Note: es translations already exist for the 7 existing docs. The 3 new docs from Epic 114 need es translations too (3 additional files).

**Revised total: 116 new translation files.**

## Translation Approach

Each translated doc file follows the same frontmatter format as the English original, with `title` and `description` translated:

```yaml
---
title: Título Traducido
description: Descripción traducida del documento.
---
```

The content body is translated with these conventions:
- Code blocks remain in English (CLI commands, config examples)
- Technical terms keep English in parentheses on first use: "Objetos Durables (Durable Objects)"
- Links point to the language-specific version where available
- Screenshots/diagrams are not translated (English UI)

## File Structure

Files are created at:
```
site/src/content/docs/{lang}/{slug}.md
```

Example for Chinese (zh):
```
site/src/content/docs/zh/mobile-guide.md
site/src/content/docs/zh/architecture.md
site/src/content/docs/zh/troubleshooting.md
site/src/content/docs/zh/self-hosting.md
site/src/content/docs/zh/deploy-docker.md
site/src/content/docs/zh/deploy-kubernetes.md
site/src/content/docs/zh/reporter-guide.md
site/src/content/docs/zh/setup-sms.md
site/src/content/docs/zh/setup-whatsapp.md
site/src/content/docs/zh/setup-signal.md
```

Repeated for: tl, vi, ar, fr, ht, ko, ru, hi, pt, de.
Plus es for the 3 new docs from Epic 114.

## Arabic (ar) RTL Considerations

Arabic translations need no special file-level handling — the site's `DocsLayout.astro` already applies `dir="rtl"` for Arabic via the i18n config. The Markdown content itself is written in Arabic and renders correctly with RTL direction.

## Execution Strategy

Generate all 116 files programmatically. Each file:
1. Starts from the English source
2. Translates title, description, and all prose content
3. Preserves code blocks, command examples, and URLs
4. Preserves Markdown structure (headings, lists, tables, links)

## Files to Create

### Per language (11 languages × 10 docs each = 110 files)

Languages: zh, tl, vi, ar, fr, ht, ko, ru, hi, pt, de

Docs per language:
- mobile-guide.md
- architecture.md
- troubleshooting.md
- self-hosting.md
- deploy-docker.md
- deploy-kubernetes.md
- reporter-guide.md
- setup-sms.md
- setup-whatsapp.md
- setup-signal.md

### es (3 new docs from Epic 114)
- es/mobile-guide.md
- es/architecture.md
- es/troubleshooting.md

### Spanish index page
- es/index.md (if not already complete — verify)

### Total: 113 + 3 = 116 files

## Verification

1. `cd site && bun run build` — site builds with all 116 new files
2. Navigate to each language variant of each doc — pages render without 404
3. Arabic pages render with RTL layout
4. Sidebar shows all pages in all languages
5. Language switcher navigates between translations of the same doc
6. Code blocks remain in English across all translations
