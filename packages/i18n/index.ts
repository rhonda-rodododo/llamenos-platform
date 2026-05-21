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
export { default as uk } from './locales/uk.json'
export { default as fa } from './locales/fa.json'
export { default as tr } from './locales/tr.json'
export { default as ku } from './locales/ku.json'
export { default as so } from './locales/so.json'
export { default as am } from './locales/am.json'
export { default as my } from './locales/my.json'
export { default as quc } from './locales/quc.json'
export { default as mix } from './locales/mix.json'

// Language configuration
export * from './languages'

// Locale data map for server-side lookups (keyed by language code)
import _en from './locales/en.json'
import _es from './locales/es.json'
import _zh from './locales/zh.json'
import _tl from './locales/tl.json'
import _vi from './locales/vi.json'
import _ar from './locales/ar.json'
import _fr from './locales/fr.json'
import _ht from './locales/ht.json'
import _ko from './locales/ko.json'
import _ru from './locales/ru.json'
import _hi from './locales/hi.json'
import _pt from './locales/pt.json'
import _de from './locales/de.json'
import _uk from './locales/uk.json'
import _fa from './locales/fa.json'
import _tr from './locales/tr.json'
import _ku from './locales/ku.json'
import _so from './locales/so.json'
import _am from './locales/am.json'
import _my from './locales/my.json'
import _quc from './locales/quc.json'
import _mix from './locales/mix.json'

/** All locale data indexed by language code, for server-side key lookups */
export const locales: Record<string, Record<string, unknown>> = {
  en: _en, es: _es, zh: _zh, tl: _tl, vi: _vi, ar: _ar, fr: _fr, ht: _ht,
  ko: _ko, ru: _ru, hi: _hi, pt: _pt, de: _de, uk: _uk, fa: _fa, tr: _tr,
  ku: _ku, so: _so, am: _am, my: _my, quc: _quc, mix: _mix,
}

/** Look up a dot-separated key (e.g. "voice.greeting") from a locale */
export function getLocaleString(lang: string, key: string): string | undefined {
  const locale = locales[lang]
  if (!locale) return undefined
  const parts = key.split('.')
  let current: unknown = locale
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'string' ? current : undefined
}
