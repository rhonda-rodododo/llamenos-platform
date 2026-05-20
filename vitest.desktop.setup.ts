import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './packages/i18n/locales/en.json'

// Initialize i18n synchronously with English translations for all desktop unit tests.
// Without this, t('some.key') returns the raw key string instead of the translated text,
// breaking any test that asserts on user-visible strings.
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    resources: {
      en: { translation: en },
    },
  })
}
