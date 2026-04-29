import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mermaid from 'astro-mermaid';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';

export default defineConfig({
  output: 'static',
  integrations: [
    mermaid({
      // Dark theme for better readability on dark backgrounds
      theme: 'dark',
    }),
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: 'en',
          es: 'es',
          zh: 'zh-Hans',
          tl: 'tl',
          vi: 'vi',
          ar: 'ar',
          fr: 'fr',
          ht: 'ht',
          ko: 'ko',
          ru: 'ru',
          hi: 'hi',
          pt: 'pt',
          de: 'de',
        },
      },
    }),
    pagefind(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  site: 'https://llamenos-hotline.com',
  i18n: {
    locales: ['en', 'es', 'zh', 'tl', 'vi', 'ar', 'fr', 'ht', 'ko', 'ru', 'hi', 'pt', 'de'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
