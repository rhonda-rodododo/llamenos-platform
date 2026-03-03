import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import resourcesToBackend from 'i18next-resources-to-backend'
import { LANGUAGE_CODES, DEFAULT_LANGUAGE } from '@shared/languages'

// English is bundled inline for instant first paint; all other locales are lazy-loaded
import en from '../../../packages/i18n/locales/en.json'

const savedLang = typeof window !== 'undefined'
  ? localStorage.getItem('llamenos-lang') || navigator.language.split('-')[0]
  : DEFAULT_LANGUAGE

i18n
  .use(initReactI18next)
  .use(
    resourcesToBackend((language: string) =>
      import(`../../../packages/i18n/locales/${language}.json`),
    ),
  )
  .init({
    lng: LANGUAGE_CODES.includes(savedLang) ? savedLang : DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
    partialBundledLanguages: true,
    resources: {
      en: { translation: en },
    },
  })

const RTL_LANGUAGES = ['ar']

function syncDocumentLang(lang: string) {
  document.documentElement.lang = lang
  document.documentElement.dir = RTL_LANGUAGES.includes(lang) ? 'rtl' : 'ltr'
}

// Sync on init
if (typeof window !== 'undefined') {
  syncDocumentLang(i18n.language)
}

export function setLanguage(lang: string) {
  i18n.changeLanguage(lang)
  localStorage.setItem('llamenos-lang', lang)
  syncDocumentLang(lang)
}

export default i18n
