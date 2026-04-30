export const siteConfig = {
  name: 'Llámenos',
  url: 'https://llamenos-hotline.com',
  description: 'Secure open-source crisis response hotline software with end-to-end encryption.',

  github: {
    org: 'rhonda-rodododo',
    repo: 'llamenos-platform',
    url: 'https://github.com/rhonda-rodododo/llamenos-platform',
    releasesUrl: 'https://github.com/rhonda-rodododo/llamenos-platform/releases/latest',
    issuesUrl: 'https://github.com/rhonda-rodododo/llamenos-platform/issues',
    mobileReleasesUrl: 'https://github.com/rhonda-rodododo/llamenos-mobile/releases/latest',
  },

  registry: {
    app: 'ghcr.io/rhonda-rodododo/llamenos-platform',
    signalNotifier: 'ghcr.io/rhonda-rodododo/llamenos-signal-notifier',
  },

  license: 'AGPL-3.0',
} as const;
