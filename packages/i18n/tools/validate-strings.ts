#!/usr/bin/env bun
/**
 * Cross-platform string reference validator.
 *
 * Validates that string references in platform code match the canonical keys
 * generated from en.json. Catches mismatches at CI time before they become
 * runtime crashes or empty strings.
 *
 * Usage:
 *   bun run packages/i18n/tools/validate-strings.ts android
 *   bun run packages/i18n/tools/validate-strings.ts ios
 *   bun run packages/i18n/tools/validate-strings.ts desktop
 *   bun run packages/i18n/tools/validate-strings.ts all
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve, dirname, relative } from 'path'
import { fileURLToPath } from 'url'
import { LANGUAGE_CODES } from '../languages'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const ROOT_DIR = resolve(__dirname, '../../..')
const LOCALES_DIR = resolve(__dirname, '../locales')

// ---------------------------------------------------------------------------
// Shared infrastructure
// ---------------------------------------------------------------------------

interface Mismatch {
  file: string
  line: number
  ref: string
  kind: 'missing' | 'warning'
}

/** Convert camelCase to snake_case (e.g. callHistory → call_history) */
function camelToSnake(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

/** Flatten nested JSON to snake_case underscore-separated keys (matches i18n-codegen) */
function flattenKeysUnderscore(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = camelToSnake(key)
    const fullKey = prefix ? `${prefix}_${snakeKey}` : snakeKey
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenKeysUnderscore(value as Record<string, unknown>, fullKey))
    } else if (typeof value === 'string') {
      result[fullKey] = value
    }
  }
  return result
}

/** Flatten nested JSON to dot-separated keys (for desktop i18next) */
function flattenKeysDotted(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenKeysDotted(value as Record<string, unknown>, fullKey))
    } else if (typeof value === 'string') {
      result[fullKey] = value
    }
  }
  return result
}

/** Load canonical keys from en.json */
function loadCanonicalKeysUnderscore(): Set<string> {
  const data = JSON.parse(readFileSync(join(LOCALES_DIR, 'en.json'), 'utf-8'))
  return new Set(Object.keys(flattenKeysUnderscore(data)))
}

function loadCanonicalKeysDotted(): Set<string> {
  const data = JSON.parse(readFileSync(join(LOCALES_DIR, 'en.json'), 'utf-8'))
  return new Set(Object.keys(flattenKeysDotted(data)))
}

/** Load allowlist for a given platform */
function loadAllowlist(platform: 'android' | 'ios' | 'desktop'): Set<string> {
  try {
    const data = JSON.parse(readFileSync(join(__dirname, 'validate-allowlist.json'), 'utf-8'))
    const list = data[platform]
    return new Set(Array.isArray(list) ? (list as string[]) : [])
  } catch {
    return new Set()
  }
}

/** Recursively collect files matching given extensions */
function collectFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = []
  function walk(d: string) {
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(d, entry)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        walk(full)
      } else if (extensions.some(ext => entry.endsWith(ext))) {
        results.push(full)
      }
    }
  }
  walk(dir)
  return results
}

/** Check if a position in a line is inside a line comment */
function isInLineComment(line: string, matchIndex: number, commentPrefix: string): boolean {
  const commentStart = line.indexOf(commentPrefix)
  return commentStart !== -1 && commentStart < matchIndex
}

/** Check if a line is inside a block comment (simple heuristic) */
function isInBlockComment(lines: string[], lineIndex: number): boolean {
  let inBlock = false
  for (let i = 0; i <= lineIndex; i++) {
    const line = lines[i]
    let pos = 0
    while (pos < line.length) {
      if (inBlock) {
        const end = line.indexOf('*/', pos)
        if (end === -1) break
        inBlock = false
        pos = end + 2
      } else {
        const start = line.indexOf('/*', pos)
        if (start === -1) break
        const end = line.indexOf('*/', start + 2)
        if (end === -1) {
          inBlock = true
          break
        }
        pos = end + 2
      }
    }
  }
  return inBlock
}

/** Format and print mismatches, return count of errors */
function reportMismatches(platform: string, mismatches: Mismatch[]): number {
  const errors = mismatches.filter(m => m.kind === 'missing')
  const warnings = mismatches.filter(m => m.kind === 'warning')

  if (errors.length === 0 && warnings.length === 0) {
    console.log(`  ${platform}: all references valid`)
    return 0
  }

  if (errors.length > 0) {
    console.error(`  ${platform}: ${errors.length} invalid reference(s):`)
    for (const m of errors) {
      const relPath = relative(ROOT_DIR, m.file)
      console.error(`    ${relPath}:${m.line} -- "${m.ref}" not found in en.json`)
    }
  }

  if (warnings.length > 0) {
    console.warn(`  ${platform}: ${warnings.length} dynamic key warning(s) (skipped):`)
    for (const m of warnings) {
      const relPath = relative(ROOT_DIR, m.file)
      console.warn(`    ${relPath}:${m.line} -- dynamic key: "${m.ref}"`)
    }
  }

  return errors.length
}

// ---------------------------------------------------------------------------
// Android validator
// ---------------------------------------------------------------------------

function validateAndroid(): number {
  const canonicalKeys = loadCanonicalKeysUnderscore()
  const allowlist = loadAllowlist('android')
  const files = collectFiles(
    join(ROOT_DIR, 'apps/android/app/src/main/java'),
    ['.kt']
  )

  const mismatches: Mismatch[] = []
  const pattern = /R\.string\.(\w+)/g

  for (const file of files) {
    const content = readFileSync(file, 'utf-8')
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      pattern.lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = pattern.exec(line)) !== null) {
        if (isInLineComment(line, match.index, '//')) continue
        if (isInBlockComment(lines, i)) continue

        const ref = match[1]
        if (!canonicalKeys.has(ref) && !allowlist.has(ref)) {
          mismatches.push({ file, line: i + 1, ref, kind: 'missing' })
        }
      }
    }
  }

  return reportMismatches('Android', mismatches)
}

// ---------------------------------------------------------------------------
// iOS validator
// ---------------------------------------------------------------------------

function validateIOS(): number {
  const canonicalKeys = loadCanonicalKeysUnderscore()
  const allowlist = loadAllowlist('ios')
  const files = collectFiles(
    join(ROOT_DIR, 'apps/ios/Sources'),
    ['.swift']
  )

  const mismatches: Mismatch[] = []

  const patterns: RegExp[] = [
    /NSLocalizedString\("([^"]+)"/g,
    /String\(localized:\s*"([^"]+)"/g,
    /LocalizedStringKey\("([^"]+)"/g,
  ]

  for (const file of files) {
    const content = readFileSync(file, 'utf-8')
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      const trimmed = line.trimStart()
      if (trimmed.startsWith('//')) continue
      if (isInBlockComment(lines, i)) continue

      for (const p of patterns) {
        p.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = p.exec(line)) !== null) {
          if (isInLineComment(line, match.index, '//')) continue

          const ref = match[1]
          if (!canonicalKeys.has(ref) && !allowlist.has(ref)) {
            mismatches.push({ file, line: i + 1, ref, kind: 'missing' })
          }
        }
      }
    }
  }

  return reportMismatches('iOS', mismatches)
}

// ---------------------------------------------------------------------------
// Desktop validator
// ---------------------------------------------------------------------------

function validateDesktop(): number {
  const canonicalKeys = loadCanonicalKeysDotted()
  const allowlist = loadAllowlist('desktop')
  const files = collectFiles(
    join(ROOT_DIR, 'src/client'),
    ['.ts', '.tsx']
  )

  const mismatches: Mismatch[] = []

  // Match t('key') and t("key")
  const staticPattern = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g
  // Match t(`...${...}...`) template literals — dynamic keys
  const dynamicPattern = /\bt\(\s*`([^`]*\$\{[^`]*)`/g

  for (const file of files) {
    const content = readFileSync(file, 'utf-8')
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      const trimmed = line.trimStart()
      if (trimmed.startsWith('//')) continue
      if (isInBlockComment(lines, i)) continue

      // Check static keys
      staticPattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = staticPattern.exec(line)) !== null) {
        if (isInLineComment(line, match.index, '//')) continue

        const ref = match[1]
        // Keys ending with '.' are prefixes used with concatenation — treat as dynamic
        if (ref.endsWith('.')) {
          mismatches.push({ file, line: i + 1, ref, kind: 'warning' })
          continue
        }
        if (!canonicalKeys.has(ref) && !allowlist.has(ref)) {
          mismatches.push({ file, line: i + 1, ref, kind: 'missing' })
        }
      }

      // Check dynamic keys (warn only)
      dynamicPattern.lastIndex = 0
      while ((match = dynamicPattern.exec(line)) !== null) {
        if (isInLineComment(line, match.index, '//')) continue

        const ref = match[1]
        mismatches.push({ file, line: i + 1, ref, kind: 'warning' })
      }
    }
  }

  return reportMismatches('Desktop', mismatches)
}

// ---------------------------------------------------------------------------
// Key casing validator — en.json keys must be camelCase, never snake_case
// ---------------------------------------------------------------------------

function validateKeyCasing(): number {
  const data = JSON.parse(readFileSync(join(LOCALES_DIR, 'en.json'), 'utf-8'))
  const violations: string[] = []

  function check(obj: Record<string, unknown>, path: string) {
    for (const key of Object.keys(obj)) {
      const fullPath = path ? `${path}.${key}` : key
      // snake_case = contains underscore between lowercase letters/digits
      if (/_[a-z0-9]/.test(key)) {
        const camelSuggestion = key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
        violations.push(`  ${fullPath} → ${path ? path + '.' : ''}${camelSuggestion}`)
      }
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        check(obj[key] as Record<string, unknown>, fullPath)
      }
    }
  }

  check(data, '')

  if (violations.length > 0) {
    console.error(`  en.json: ${violations.length} snake_case key(s) (must be camelCase):`)
    for (const v of violations) {
      console.error(v)
    }
  }

  return violations.length
}

// ---------------------------------------------------------------------------
// Locale coverage guard
//
// The single source of truth for "which locales exist" is the filesystem
// (packages/i18n/locales/*.json) and packages/i18n/languages.ts. Every other
// place that needs a locale list — CI guards, codegen, the exported locale
// map, the skills docs — must derive from one of those two, never hardcode
// its own list. This check is the regression guard for that rule: it fails
// loudly the moment a locale file and languages.ts (or the exported locale
// map in packages/i18n/index.ts) drift apart, which is exactly the failure
// mode that let 9 of 22 locales (am, fa, ku, mix, my, quc, so, tr, uk) go
// unvalidated for a long time.
// ---------------------------------------------------------------------------

function validateLocaleCoverage(): number {
  const localeCodes = readdirSync(LOCALES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace(/\.json$/, ''))
    .sort()

  const languageCodes = [...LANGUAGE_CODES].sort()

  const errors: string[] = []

  const missingFromLanguages = localeCodes.filter(c => !languageCodes.includes(c))
  if (missingFromLanguages.length > 0) {
    errors.push(
      `  locale file(s) with no entry in packages/i18n/languages.ts: ${missingFromLanguages.join(', ')}`
    )
  }

  const missingLocaleFile = languageCodes.filter(c => !localeCodes.includes(c))
  if (missingLocaleFile.length > 0) {
    errors.push(
      `  languages.ts entries with no packages/i18n/locales/*.json file: ${missingLocaleFile.join(', ')}`
    )
  }

  // packages/i18n/index.ts hand-exports each locale (for server-side lookups via
  // `locales`). Verify every locale file actually shows up as a bare-word
  // `export ... from './locales/<code>.json'` line, so a new locale can't be
  // added to the filesystem without also being wired into that export map.
  const indexSource = readFileSync(resolve(__dirname, '../index.ts'), 'utf-8')
  const missingFromIndex = localeCodes.filter(
    c => !new RegExp(`['"]\\./locales/${c}\\.json['"]`).test(indexSource)
  )
  if (missingFromIndex.length > 0) {
    errors.push(
      `  locale file(s) not exported from packages/i18n/index.ts: ${missingFromIndex.join(', ')}`
    )
  }

  if (errors.length > 0) {
    console.error(`  Locale coverage: ${errors.length} drift issue(s) found:`)
    for (const e of errors) console.error(e)
  } else {
    console.log(`  Locale coverage: ${localeCodes.length} locales, all covered`)
  }

  return errors.length
}

// ---------------------------------------------------------------------------
// Locale key completeness
//
// packages/i18n/tools/i18n-codegen.ts already computes this (and prints the
// same warnings) but only fails the process when invoked with --validate
// (`bun run i18n:validate`) — CI's "Validate i18n strings" step instead runs
// `bun run i18n:validate:all` (this script), which previously never checked
// per-locale key completeness at all. That meant a locale missing keys could
// pass CI outright (the plain `bun run i18n:codegen` step that does run in
// CI only warns and keeps going). Checking it here too closes that gap for
// every entry point into this script.
// ---------------------------------------------------------------------------

function validateLocaleCompleteness(): number {
  const enKeys = loadCanonicalKeysDotted()
  const localeFiles = readdirSync(LOCALES_DIR).filter(f => f.endsWith('.json') && f !== 'en.json')

  let totalMissing = 0
  for (const file of localeFiles) {
    const locale = file.replace(/\.json$/, '')
    const data = JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf-8'))
    const keys = new Set(Object.keys(flattenKeysDotted(data)))
    const missing = [...enKeys].filter(k => !keys.has(k))
    if (missing.length > 0) {
      console.error(`  ${locale}: ${missing.length} missing key(s) relative to en.json`)
      totalMissing += missing.length
    }
  }

  if (totalMissing === 0) {
    console.log(`  Locale completeness: all ${localeFiles.length} non-English locales have full key coverage`)
  }

  return totalMissing
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const command = process.argv[2]

  if (!command || !['android', 'ios', 'desktop', 'all'].includes(command)) {
    console.error('Usage: validate-strings.ts <android|ios|desktop|all>')
    process.exit(1)
  }

  console.log('Validating string references...')

  let totalErrors = 0

  // Always check key casing convention, locale-list coverage, and per-locale
  // key completeness first — these apply regardless of which platform is
  // being validated.
  totalErrors += validateKeyCasing()
  totalErrors += validateLocaleCoverage()
  totalErrors += validateLocaleCompleteness()

  if (command === 'android' || command === 'all') {
    totalErrors += validateAndroid()
  }
  if (command === 'ios' || command === 'all') {
    totalErrors += validateIOS()
  }
  if (command === 'desktop' || command === 'all') {
    totalErrors += validateDesktop()
  }

  if (totalErrors > 0) {
    console.error(`\n${totalErrors} string reference error(s) found.`)
    process.exit(1)
  } else {
    console.log('\nAll string references valid.')
  }
}

main()
