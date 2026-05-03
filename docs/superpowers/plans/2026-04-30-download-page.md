# Plan: Verification-First Download Page

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing marketing-site download page with a verification-first UX that auto-detects the visitor's OS, surfaces the primary download, and makes cryptographic verification instructions prominent and above-the-fold. The page fetches dynamic version info from the self-hosted update endpoint and links to the correct `llamenos-platform` repository.

**Spec reference:** `docs/superpowers/specs/2026-04-30-desktop-distribution-design.md` (Section 5: Download Page)

**Source references:**
- Existing download page: `site/src/pages/download.astro`
- Localized download page: `site/src/pages/[lang]/download.astro`
- Site config: `site/src/config.ts`
- i18n download translations: `site/src/i18n/translations/download.ts`
- Base layout: `site/src/layouts/BaseLayout.astro`
- Global styles: `site/src/styles/global.css`
- Tauri updater config (endpoints + pubkey): `apps/desktop/tauri.conf.json`

---

## File Map

| File | Action |
|------|--------|
| `site/src/config.ts` | Modify: Add distribution constants (update server, download server, minisign pubkey, audit repo, GPG fingerprint) |
| `site/src/i18n/translations/download.ts` | Modify: Add verification, flatpak, and GPG strings for `en`, `es`, `zh` |
| `site/src/pages/download.astro` | Rewrite: Verification-first layout with OS detection, primary CTA, verification panel, all-platforms grid, flatpak section |
| `site/src/pages/[lang]/download.astro` | Rewrite: Same layout, parameterized by `lang` |

---

## Task 1: Add Distribution Constants to Site Config

**Files:**
- Modify: `site/src/config.ts`

- [ ] **Add distribution block to `site/src/config.ts`:**

```typescript
export const siteConfig = {
  name: 'Llámenos',
  url: 'https://llamenos-platform.com',
  description: 'Secure open-source crisis response hotline software with end-to-end encryption.',

  github: {
    org: 'rhonda-rodododo',
    repo: 'llamenos-platform',
    url: 'https://github.com/rhonda-rodododo/llamenos-platform',
    releasesUrl: 'https://github.com/rhonda-rodododo/llamenos-platform/releases/latest',
    issuesUrl: 'https://github.com/rhonda-rodododo/llamenos-platform/issues',
    mobileReleasesUrl: 'https://github.com/rhonda-rodododo/llamenos-platform/releases/latest',
  },

  registry: {
    app: 'ghcr.io/rhonda-rodododo/llamenos-platform',
    signalNotifier: 'ghcr.io/rhonda-rodododo/llamenos-signal-notifier',
  },

  license: 'AGPL-3.0',

  distribution: {
    // Self-hosted update and download servers (Iceland VPS)
    updateServerUrl: 'https://updates.llamenos.org/desktop',
    downloadServerUrl: 'https://downloads.llamenos.org',

    // Minisign public key for manual signature verification
    // Key ID: E1F35E58BD83142F
    minisignPublicKey: 'RWQvFIO9WF7z4SSDEpgFWbUeUKOwbqVJeNfuIFhhhMkS/0K8XGMXJ9M2',

    // GPG fingerprint for optional CHECKSUMS.txt verification
    // Set this to the actual fingerprint once the release signing key is generated
    gpgFingerprint: 'A1B2 C3D4 E5F6 7890 1234 5678 90AB CDEF 1234 5678',

    // Public audit repository (metadata, signatures, SBOM, provenance — no binaries)
    auditRepoUrl: 'https://github.com/rhonda-rodododo/llamenos-releases',
  },
} as const;
```

- [ ] Commit: `feat(site): add distribution constants for self-hosted download/update servers`

---

## Task 2: Expand Download i18n Translations

**Files:**
- Modify: `site/src/i18n/translations/download.ts`

- [ ] **Replace the entire file with the expanded translation object:**

```typescript
export const download: Record<string, {
  title: string;
  subtitle: string;
  recommended: string;
  allPlatforms: string;
  version: string;
  releaseNotes: string;
  checksum: string;
  verifyTitle: string;
  verifySubtitle: string;
  verifyMinisign: string;
  verifySha256: string;
  verifyCosign: string;
  verifyAudit: string;
  copyCommand: string;
  copied: string;
  platforms: {
    windows: { name: string; description: string };
    macos: { name: string; description: string };
    linuxAppImage: { name: string; description: string };
    linuxDeb: { name: string; description: string };
    linuxFlatpak: { name: string; description: string };
    mobile: { name: string; description: string };
  };
  systemReqs: string;
  reqItems: string[];
  flatpakTitle: string;
  flatpakInstall: string;
  flatpakRun: string;
  flatpakFlathub: string;
  gpgTitle: string;
  gpgFingerprint: string;
  gpgVerify: string;
}> = {
  en: {
    title: 'Download Hotline',
    subtitle: 'Secure, encrypted crisis response software for your desktop. Verify every build.',
    recommended: 'Recommended for your system',
    allPlatforms: 'All platforms',
    version: 'Latest version',
    releaseNotes: 'Release notes',
    checksum: 'Verify checksums',
    verifyTitle: 'Verify your download',
    verifySubtitle: 'All binaries are signed offline with an Ed25519 key that never touches cloud infrastructure. Verify before you install.',
    verifyMinisign: 'Minisign signature',
    verifySha256: 'SHA-256 checksum',
    verifyCosign: 'Cosign attestation (SBOM)',
    verifyAudit: 'Full audit trail',
    copyCommand: 'Copy',
    copied: 'Copied',
    platforms: {
      windows: { name: 'Windows', description: 'Windows 10+ (64-bit) installer' },
      macos: { name: 'macOS', description: 'macOS 11+ universal binary (Intel + Apple Silicon)' },
      linuxAppImage: { name: 'Linux AppImage', description: 'Portable, runs on most distributions' },
      linuxDeb: { name: 'Linux .deb', description: 'Debian, Ubuntu, and derivatives' },
      linuxFlatpak: { name: 'Linux Flatpak', description: 'Sandboxed, auto-updating via Flathub' },
      mobile: { name: 'Mobile', description: 'Early access — Android APK and iOS TestFlight available' },
    },
    systemReqs: 'System requirements',
    reqItems: [
      'Windows 10+, macOS 11+, or Linux with WebKitGTK 4.1',
      'Network connection to your hotline server',
      '4-digit PIN for key encryption',
    ],
    flatpakTitle: 'Install via Flatpak',
    flatpakInstall: 'flatpak install flathub org.llamenos.hotline',
    flatpakRun: 'flatpak run org.llamenos.hotline',
    flatpakFlathub: 'View on Flathub',
    gpgTitle: 'GPG verification',
    gpgFingerprint: 'GPG fingerprint',
    gpgVerify: 'gpg --verify CHECKSUMS.txt.sig CHECKSUMS.txt',
  },
  es: {
    title: 'Descargar Hotline',
    subtitle: 'Software seguro y cifrado de respuesta a crisis para tu escritorio. Verifica cada compilación.',
    recommended: 'Recomendado para tu sistema',
    allPlatforms: 'Todas las plataformas',
    version: 'Ultima version',
    releaseNotes: 'Notas de la version',
    checksum: 'Verificar checksums',
    verifyTitle: 'Verifica tu descarga',
    verifySubtitle: 'Todos los binarios están firmados offline con una clave Ed25519 que nunca toca la infraestructura en la nube. Verifica antes de instalar.',
    verifyMinisign: 'Firma Minisign',
    verifySha256: 'Suma de verificación SHA-256',
    verifyCosign: 'Atestación Cosign (SBOM)',
    verifyAudit: 'Auditoría completa',
    copyCommand: 'Copiar',
    copied: 'Copiado',
    platforms: {
      windows: { name: 'Windows', description: 'Windows 10+ (64 bits) instalador' },
      macos: { name: 'macOS', description: 'macOS 11+ binario universal (Intel + Apple Silicon)' },
      linuxAppImage: { name: 'Linux AppImage', description: 'Portable, funciona en la mayoria de distribuciones' },
      linuxDeb: { name: 'Linux .deb', description: 'Debian, Ubuntu y derivados' },
      linuxFlatpak: { name: 'Linux Flatpak', description: 'Aislado, actualizacion automatica via Flathub' },
      mobile: { name: 'Movil', description: 'Acceso anticipado — APK Android y TestFlight iOS disponibles' },
    },
    systemReqs: 'Requisitos del sistema',
    reqItems: [
      'Windows 10+, macOS 11+, o Linux con WebKitGTK 4.1',
      'Conexion de red a tu servidor de linea de ayuda',
      'PIN de 4 digitos para cifrado de claves',
    ],
    flatpakTitle: 'Instalar via Flatpak',
    flatpakInstall: 'flatpak install flathub org.llamenos.hotline',
    flatpakRun: 'flatpak run org.llamenos.hotline',
    flatpakFlathub: 'Ver en Flathub',
    gpgTitle: 'Verificación GPG',
    gpgFingerprint: 'Huella GPG',
    gpgVerify: 'gpg --verify CHECKSUMS.txt.sig CHECKSUMS.txt',
  },
  zh: {
    title: '\u4E0B\u8F7D Hotline',
    subtitle: '\u5B89\u5168\u52A0\u5BC6\u7684\u5371\u673A\u54CD\u5E94\u684C\u9762\u8F6F\u4EF6\u3002\u9A8C\u8BC1\u6BCF\u4E2A\u6784\u5EFA\u3002',
    recommended: '\u63A8\u8350\u9002\u5408\u60A8\u7684\u7CFB\u7EDF',
    allPlatforms: '\u6240\u6709\u5E73\u53F0',
    version: '\u6700\u65B0\u7248\u672C',
    releaseNotes: '\u53D1\u5E03\u8BF4\u660E',
    checksum: '\u9A8C\u8BC1\u6821\u9A8C\u548C',
    verifyTitle: '\u9A8C\u8BC1\u60A8\u7684\u4E0B\u8F7D',
    verifySubtitle: '\u6240\u6709\u4E8C\u8FDB\u5236\u6587\u4EF6\u5747\u4F7F\u7528\u4ECE\u4E0D\u89E6\u53CA\u4E91\u57FA\u7840\u8BBE\u65BD\u7684 Ed25519 \u5BC6\u94A5\u79BB\u7EBF\u7B7E\u540D\u3002\u5B89\u88C5\u524D\u8BF7\u9A8C\u8BC1\u3002',
    verifyMinisign: 'Minisign \u7B7E\u540D',
    verifySha256: 'SHA-256 \u6821\u9A8C\u548C',
    verifyCosign: 'Cosign \u8BC1\u660E (SBOM)',
    verifyAudit: '\u5B8C\u6574\u5BA1\u8BA1\u8BB0\u5F55',
    copyCommand: '\u590D\u5236',
    copied: '\u5DF2\u590D\u5236',
    platforms: {
      windows: { name: 'Windows', description: 'Windows 10+ (64\u4F4D) \u5B89\u88C5\u7A0B\u5E8F' },
      macos: { name: 'macOS', description: 'macOS 11+ \u901A\u7528\u4E8C\u8FDB\u5236 (Intel + Apple Silicon)' },
      linuxAppImage: { name: 'Linux AppImage', description: '\u4FBF\u643A\u5F0F\uFF0C\u9002\u7528\u4E8E\u5927\u591A\u6570\u53D1\u884C\u7248' },
      linuxDeb: { name: 'Linux .deb', description: 'Debian\u3001Ubuntu \u53CA\u5176\u884D\u751F\u7248' },
      linuxFlatpak: { name: 'Linux Flatpak', description: '\u6C99\u7BB1\u5316\uFF0C\u901A\u8FC7 Flathub \u81EA\u52A8\u66F4\u65B0' },
      mobile: { name: '\u79FB\u52A8\u7AEF', description: '\u5373\u5C06\u63A8\u51FA \u2014 iOS \u548C Android \u5E94\u7528\u6B63\u5728\u5F00\u53D1\u4E2D' },
    },
    systemReqs: '\u7CFB\u7EDF\u8981\u6C42',
    reqItems: [
      'Windows 10+\u3001macOS 11+ \u6216\u5E26\u6709 WebKitGTK 4.1 \u7684 Linux',
      '\u4E0E\u70ED\u7EBF\u670D\u52A1\u5668\u7684\u7F51\u7EDC\u8FDE\u63A5',
      '\u7528\u4E8E\u5BC6\u94A5\u52A0\u5BC6\u7684 4 \u4F4D PIN \u7801',
    ],
    flatpakTitle: '\u901A\u8FC7 Flatpak \u5B89\u88C5',
    flatpakInstall: 'flatpak install flathub org.llamenos.hotline',
    flatpakRun: 'flatpak run org.llamenos.hotline',
    flatpakFlathub: '\u5728 Flathub \u4E0A\u67E5\u770B',
    gpgTitle: 'GPG \u9A8C\u8BC1',
    gpgFingerprint: 'GPG \u6307\u7EB9',
    gpgVerify: 'gpg --verify CHECKSUMS.txt.sig CHECKSUMS.txt',
  },
  // Other languages fall back to English via getTranslation()
};
```

- [ ] Commit: `feat(site/i18n): add verification-first download page translations`

---

## Task 3: Rewrite Root Download Page (`download.astro`)

**Files:**
- Modify: `site/src/pages/download.astro`

- [ ] **Replace the entire file:**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { getTranslation } from '../i18n/utils';
import { download } from '../i18n/translations/download';
import { siteConfig } from '../config';

const t = getTranslation(download, 'en');

const {
  downloadServerUrl,
  updateServerUrl,
  minisignPublicKey,
  gpgFingerprint,
  auditRepoUrl,
} = siteConfig.distribution;

const LATEST_JSON = `${updateServerUrl}/latest.json`;
const GITHUB_RELEASES = siteConfig.github.releasesUrl;
---

<BaseLayout title={t.title} description={t.subtitle}>
  <section class="pt-32 pb-20 md:pt-40">
    <div class="mx-auto max-w-6xl px-6">
      <!-- Header -->
      <div class="max-w-2xl mb-10">
        <h1 class="text-3xl font-bold tracking-tight text-fg sm:text-4xl lg:text-5xl">{t.title}</h1>
        <p class="mt-4 text-lg text-fg-muted leading-relaxed">{t.subtitle}</p>
      </div>

      <!-- Two-column hero: download + verification -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
        <!-- Left: detected platform download -->
        <div class="flex flex-col gap-6">
          <div id="recommended-section" class="hidden rounded-2xl border border-accent/30 bg-accent/5 p-6">
            <h2 class="text-sm font-medium text-accent-bright uppercase tracking-wider mb-4">{t.recommended}</h2>
            <div class="flex items-center gap-4 mb-4">
              <div id="recommended-icon" class="h-12 w-12 text-fg"></div>
              <div>
                <h3 id="recommended-name" class="text-xl font-semibold text-fg"></h3>
                <p id="recommended-desc" class="text-fg-muted text-sm mt-0.5"></p>
              </div>
            </div>
            <a
              id="recommended-link"
              href="#"
              class="inline-flex items-center justify-center w-full rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-bright"
            >
              <svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Download
            </a>
          </div>

          <!-- Fallback when no OS detected or fetch fails -->
          <div id="fallback-section" class="rounded-2xl border border-border bg-bg-card p-6">
            <h2 class="text-sm font-medium text-fg-muted uppercase tracking-wider mb-4">{t.allPlatforms}</h2>
            <p class="text-fg-muted text-sm mb-4">Choose your platform below or download from GitHub Releases.</p>
            <a
              href={GITHUB_RELEASES}
              class="inline-flex items-center justify-center w-full rounded-lg border border-border bg-bg-soft px-6 py-3 text-sm font-medium text-fg transition-colors hover:bg-bg-card"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg class="h-4 w-4 mr-2" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              View all releases
            </a>
          </div>
        </div>

        <!-- Right: verification panel (prominent, above the fold) -->
        <div class="rounded-2xl border border-border bg-bg-card p-6">
          <div class="flex items-center gap-3 mb-4">
            <svg class="h-6 w-6 text-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <div>
              <h2 class="text-lg font-semibold text-fg">{t.verifyTitle}</h2>
              <p class="text-sm text-fg-muted">{t.verifySubtitle}</p>
            </div>
          </div>

          <!-- Verification tabs -->
          <div class="flex gap-2 mb-4 border-b border-border pb-1">
            <button class="verify-tab active text-sm font-medium px-3 py-1.5 rounded-t-lg text-accent-bright border-b-2 border-accent-bright" data-tab="minisign">{t.verifyMinisign}</button>
            <button class="verify-tab text-sm font-medium px-3 py-1.5 rounded-t-lg text-fg-muted hover:text-fg transition-colors" data-tab="sha256">{t.verifySha256}</button>
            <button class="verify-tab text-sm font-medium px-3 py-1.5 rounded-t-lg text-fg-muted hover:text-fg transition-colors" data-tab="cosign">{t.verifyCosign}</button>
          </div>

          <!-- Minisign tab -->
          <div id="tab-minisign" class="verify-panel">
            <div class="mb-3">
              <p class="text-xs text-fg-dim mb-1.5 font-mono">Public key</p>
              <div class="flex items-center gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
                <code class="text-sm font-mono text-fg-muted truncate flex-1">{minisignPublicKey}</code>
                <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors" data-text={minisignPublicKey} aria-label={t.copyCommand}>
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </button>
              </div>
            </div>
            <div class="mb-3">
              <p class="text-xs text-fg-dim mb-1.5 font-mono">Command</p>
              <div class="flex items-start gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
                <code class="text-sm font-mono text-fg-muted break-all flex-1" id="minisign-cmd">minisign -Vm llamenos-desktop_0.0.0_amd64.AppImage -P {minisignPublicKey}</code>
                <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors mt-0.5" data-text="" id="minisign-copy" aria-label={t.copyCommand}>
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </button>
              </div>
            </div>
          </div>

          <!-- SHA-256 tab -->
          <div id="tab-sha256" class="verify-panel hidden">
            <div class="mb-3">
              <p class="text-xs text-fg-dim mb-1.5 font-mono">Download CHECKSUMS.txt</p>
              <div class="flex items-start gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
                <code class="text-sm font-mono text-fg-muted break-all flex-1" id="sha256-cmd">curl -O {downloadServerUrl}/v0.0.0/CHECKSUMS.txt</code>
                <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors mt-0.5" data-text="" id="sha256-copy" aria-label={t.copyCommand}>
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </button>
              </div>
            </div>
            <div class="mb-3">
              <p class="text-xs text-fg-dim mb-1.5 font-mono">Verify</p>
              <div class="flex items-start gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
                <code class="text-sm font-mono text-fg-muted break-all flex-1">sha256sum -c CHECKSUMS.txt</code>
                <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors mt-0.5" data-text="sha256sum -c CHECKSUMS.txt" aria-label={t.copyCommand}>
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Cosign tab -->
          <div id="tab-cosign" class="verify-panel hidden">
            <div class="mb-3">
              <p class="text-xs text-fg-dim mb-1.5 font-mono">Verify SBOM attestation</p>
              <div class="flex items-start gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
                <code class="text-sm font-mono text-fg-muted break-all flex-1" id="cosign-cmd">cosign verify-blob --signature CHECKSUMS.txt.sig --certificate-identity-regexp '.*' --certificate-oidc-issuer-regexp '.*' CHECKSUMS.txt</code>
                <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors mt-0.5" data-text="" id="cosign-copy" aria-label={t.copyCommand}>
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Audit link -->
          <a
            href={auditRepoUrl}
            class="inline-flex items-center gap-2 text-sm text-accent-bright hover:text-accent transition-colors mt-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            {t.verifyAudit}
          </a>
        </div>
      </div>

      <!-- All platforms grid -->
      <h2 class="text-sm font-medium text-fg-muted uppercase tracking-wider mb-6">{t.allPlatforms}</h2>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-16">
        <!-- Windows -->
        <div class="rounded-xl border border-border bg-bg-card p-5 flex flex-col" data-platform="windows">
          <div class="flex items-center gap-3 mb-3">
            <svg class="h-8 w-8 text-fg-muted" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
            <div>
              <h3 class="font-semibold text-fg">{t.platforms.windows.name}</h3>
              <p class="text-xs text-fg-muted">{t.platforms.windows.description}</p>
            </div>
          </div>
          <a id="dl-windows" href={GITHUB_RELEASES} class="mt-auto inline-flex items-center justify-center rounded-lg border border-border bg-bg-soft px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-bg-card">
            Download .exe
          </a>
        </div>

        <!-- macOS -->
        <div class="rounded-xl border border-border bg-bg-card p-5 flex flex-col" data-platform="macos">
          <div class="flex items-center gap-3 mb-3">
            <svg class="h-8 w-8 text-fg-muted" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
            <div>
              <h3 class="font-semibold text-fg">{t.platforms.macos.name}</h3>
              <p class="text-xs text-fg-muted">{t.platforms.macos.description}</p>
            </div>
          </div>
          <a id="dl-macos" href={GITHUB_RELEASES} class="mt-auto inline-flex items-center justify-center rounded-lg border border-border bg-bg-soft px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-bg-card">
            Download .dmg
          </a>
        </div>

        <!-- Linux AppImage -->
        <div class="rounded-xl border border-border bg-bg-card p-5 flex flex-col" data-platform="linux-appimage">
          <div class="flex items-center gap-3 mb-3">
            <svg class="h-8 w-8 text-fg-muted" viewBox="0 0 24 24" fill="currentColor"><path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.368 1.884 1.368.39 0 .739-.134 1.107-.465 1.196-.676 1.167-1.677.745-2.553-.224-.47-.396-.845-.406-1.081-.018-.291.05-.527.136-.822.04-.099.094-.196.149-.295l.048-.09c.326-.652.478-1.202.39-1.75a1.6 1.6 0 00-.093-.286c.146-.234.308-.47.479-.744.574-.87 1.07-2.105 1.182-3.67.042-.533.006-1.071-.094-1.581 0-.006-.001-.012-.001-.018-.005-.032-.012-.065-.02-.099a3.97 3.97 0 00-.12-.505c-.29-.984-.78-1.84-1.35-2.526-.57-.685-1.22-1.2-1.82-1.487-.6-.29-1.18-.395-1.58-.395h-.046c-.576.016-.755.093-1.04.272-.33-.036-.66-.048-.99-.036z"/></svg>
            <div>
              <h3 class="font-semibold text-fg">{t.platforms.linuxAppImage.name}</h3>
              <p class="text-xs text-fg-muted">{t.platforms.linuxAppImage.description}</p>
            </div>
          </div>
          <a id="dl-linux-appimage" href={GITHUB_RELEASES} class="mt-auto inline-flex items-center justify-center rounded-lg border border-border bg-bg-soft px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-bg-card">
            Download .AppImage
          </a>
        </div>

        <!-- Linux .deb -->
        <div class="rounded-xl border border-border bg-bg-card p-5 flex flex-col" data-platform="linux-deb">
          <div class="flex items-center gap-3 mb-3">
            <svg class="h-8 w-8 text-fg-muted" viewBox="0 0 24 24" fill="currentColor"><path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.368 1.884 1.368.39 0 .739-.134 1.107-.465 1.196-.676 1.167-1.677.745-2.553-.224-.47-.396-.845-.406-1.081-.018-.291.05-.527.136-.822.04-.099.094-.196.149-.295l.048-.09c.326-.652.478-1.202.39-1.75a1.6 1.6 0 00-.093-.286c.146-.234.308-.47.479-.744.574-.87 1.07-2.105 1.182-3.67.042-.533.006-1.071-.094-1.581 0-.006-.001-.012-.001-.018-.005-.032-.012-.065-.02-.099a3.97 3.97 0 00-.12-.505c-.29-.984-.78-1.84-1.35-2.526-.57-.685-1.22-1.2-1.82-1.487-.6-.29-1.18-.395-1.58-.395h-.046c-.576.016-.755.093-1.04.272-.33-.036-.66-.048-.99-.036z"/></svg>
            <div>
              <h3 class="font-semibold text-fg">{t.platforms.linuxDeb.name}</h3>
              <p class="text-xs text-fg-muted">{t.platforms.linuxDeb.description}</p>
            </div>
          </div>
          <a id="dl-linux-deb" href={GITHUB_RELEASES} class="mt-auto inline-flex items-center justify-center rounded-lg border border-border bg-bg-soft px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-bg-card">
            Download .deb
          </a>
        </div>

        <!-- Linux Flatpak -->
        <div class="rounded-xl border border-border bg-bg-card p-5 flex flex-col" data-platform="linux-flatpak">
          <div class="flex items-center gap-3 mb-3">
            <svg class="h-8 w-8 text-fg-muted" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            <div>
              <h3 class="font-semibold text-fg">{t.platforms.linuxFlatpak.name}</h3>
              <p class="text-xs text-fg-muted">{t.platforms.linuxFlatpak.description}</p>
            </div>
          </div>
          <a id="dl-linux-flatpak" href={GITHUB_RELEASES} class="mt-auto inline-flex items-center justify-center rounded-lg border border-border bg-bg-soft px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-bg-card">
            Download .flatpak
          </a>
        </div>

        <!-- Mobile (early access) -->
        <div class="rounded-xl border border-border bg-bg-card p-5 flex flex-col" data-platform="mobile">
          <div class="flex items-center gap-3 mb-3">
            <svg class="h-8 w-8 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
            <div>
              <h3 class="font-semibold text-fg">{t.platforms.mobile.name}</h3>
              <p class="text-xs text-fg-muted">{t.platforms.mobile.description}</p>
            </div>
          </div>
          <a href="/docs/mobile-guide" class="mt-auto inline-flex items-center justify-center rounded-lg border border-border bg-bg-soft px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-bg-card">
            Mobile Guide
          </a>
        </div>
      </div>

      <!-- Flatpak / Flathub section -->
      <div class="rounded-xl border border-border bg-bg-card p-6 mb-12 max-w-2xl">
        <h3 class="font-semibold text-fg mb-3">{t.flatpakTitle}</h3>
        <div class="space-y-3">
          <div class="flex items-start gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
            <code class="text-sm font-mono text-fg-muted break-all flex-1">{t.flatpakInstall}</code>
            <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors mt-0.5" data-text={t.flatpakInstall} aria-label={t.copyCommand}>
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
          </div>
          <div class="flex items-start gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
            <code class="text-sm font-mono text-fg-muted break-all flex-1">{t.flatpakRun}</code>
            <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors mt-0.5" data-text={t.flatpakRun} aria-label={t.copyCommand}>
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
          </div>
        </div>
        <a
          href="https://flathub.org/apps/org.llamenos.hotline"
          class="inline-flex items-center gap-2 text-sm text-accent-bright hover:text-accent transition-colors mt-4"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t.flatpakFlathub} &rarr;
        </a>
      </div>

      <!-- GPG fingerprint section -->
      <div class="rounded-xl border border-border bg-bg-card p-6 mb-12 max-w-2xl">
        <h3 class="font-semibold text-fg mb-3">{t.gpgTitle}</h3>
        <p class="text-sm text-fg-muted mb-3">
          Optionally verify CHECKSUMS.txt with GPG. The fingerprint should match the one published in the audit repository.
        </p>
        <div class="mb-3">
          <p class="text-xs text-fg-dim mb-1.5 font-mono">{t.gpgFingerprint}</p>
          <div class="flex items-center gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
            <code class="text-sm font-mono text-fg-muted truncate flex-1">{gpgFingerprint}</code>
            <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors" data-text={gpgFingerprint} aria-label={t.copyCommand}>
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
          </div>
        </div>
        <div class="flex items-start gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
          <code class="text-sm font-mono text-fg-muted break-all flex-1">{t.gpgVerify}</code>
          <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors mt-0.5" data-text={t.gpgVerify} aria-label={t.copyCommand}>
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </button>
        </div>
      </div>

      <!-- System requirements -->
      <div class="rounded-xl border border-border bg-bg-card p-6 max-w-2xl">
        <h3 class="font-semibold text-fg mb-3">{t.systemReqs}</h3>
        <ul class="space-y-2 text-sm text-fg-muted">
          {t.reqItems.map(item => (
            <li class="flex items-start gap-2">
              <svg class="h-4 w-4 text-accent mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <!-- Links -->
      <div class="flex flex-wrap gap-6 mt-8 text-sm">
        <a href={GITHUB_RELEASES} class="text-accent-bright hover:text-accent transition-colors" target="_blank" rel="noopener noreferrer">
          {t.releaseNotes} &rarr;
        </a>
        <a href={`${GITHUB_RELEASES}/download/CHECKSUMS.txt`} class="text-accent-bright hover:text-accent transition-colors" target="_blank" rel="noopener noreferrer">
          {t.checksum} &rarr;
        </a>
        <a href={auditRepoUrl} class="text-accent-bright hover:text-accent transition-colors" target="_blank" rel="noopener noreferrer">
          {t.verifyAudit} &rarr;
        </a>
      </div>
    </div>
  </section>
</BaseLayout>

<script define:vars={{ LATEST_JSON, GITHUB_RELEASES, downloadServerUrl, minisignPublicKey }}>
  // ── OS detection ───────────────────────────────────────────────
  const ua = navigator.userAgent.toLowerCase();
  let detectedOS = 'linux';
  if (ua.includes('win')) detectedOS = 'windows';
  else if (ua.includes('mac')) detectedOS = 'macos';

  const section = document.getElementById('recommended-section');
  const fallback = document.getElementById('fallback-section');
  const nameEl = document.getElementById('recommended-name');
  const descEl = document.getElementById('recommended-desc');
  const linkEl = document.getElementById('recommended-link');
  const iconEl = document.getElementById('recommended-icon');

  const platformIcons = {
    windows: '<svg class="h-12 w-12" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>',
    macos: '<svg class="h-12 w-12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>',
    linux: '<svg class="h-12 w-12" viewBox="0 0 24 24" fill="currentColor"><path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.368 1.884 1.368.39 0 .739-.134 1.107-.465 1.196-.676 1.167-1.677.745-2.553-.224-.47-.396-.845-.406-1.081-.018-.291.05-.527.136-.822.04-.099.094-.196.149-.295l.048-.09c.326-.652.478-1.202.39-1.75a1.6 1.6 0 00-.093-.286c.146-.234.308-.47.479-.744.574-.87 1.07-2.105 1.182-3.67.042-.533.006-1.071-.094-1.581 0-.006-.001-.012-.001-.018-.005-.032-.012-.065-.02-.099a3.97 3.97 0 00-.12-.505c-.29-.984-.78-1.84-1.35-2.526-.57-.685-1.22-1.2-1.82-1.487-.6-.29-1.18-.395-1.58-.395h-.046c-.576.016-.755.093-1.04.272-.33-.036-.66-.048-.99-.036z"/></svg>',
  };

  // Highlight the detected platform card in the grid
  const cards = document.querySelectorAll('[data-platform]');
  cards.forEach(card => {
    if (card.dataset.platform === detectedOS ||
        (detectedOS === 'linux' && card.dataset.platform === 'linux-appimage')) {
      card.classList.add('ring-1', 'ring-accent/30');
    }
  });

  // ── Fetch latest.json for dynamic version + URLs ──────────────
  fetch(LATEST_JSON)
    .then(r => r.ok ? r.json() : Promise.reject('No releases'))
    .then(data => {
      const version = data.version;
      const dlBase = `${downloadServerUrl}/v${version}`;

      // Artifact filename map
      const artifacts = {
        windows: `llamenos-desktop_${version}_x64-setup.exe`,
        macos: `llamenos-desktop_${version}_universal.dmg`,
        'linux-appimage': `llamenos-desktop_${version}_amd64.AppImage`,
        'linux-deb': `llamenos-desktop_${version}_amd64.deb`,
        'linux-flatpak': `llamenos-desktop_${version}_amd64.flatpak`,
      };

      // Map platform keys to download links and buttons
      const platformMap = {
        'windows': { jsonKey: 'windows-x86_64', btn: 'dl-windows' },
        'macos': { jsonKey: 'darwin-universal', btn: 'dl-macos', fallbackKey: 'darwin-x86_64' },
        'linux-appimage': { jsonKey: 'linux-x86_64', btn: 'dl-linux-appimage' },
      };

      // Update grid download buttons with self-hosted URLs
      for (const [platform, info] of Object.entries(platformMap)) {
        const platformData = data.platforms[info.jsonKey] || (info.fallbackKey && data.platforms[info.fallbackKey]);
        if (platformData?.url) {
          const btn = document.getElementById(info.btn);
          if (btn) btn.href = platformData.url;
        } else if (artifacts[platform]) {
          const btn = document.getElementById(info.btn);
          if (btn) btn.href = `${dlBase}/${artifacts[platform]}`;
        }
      }

      // Update .deb and .flatpak buttons (not in Tauri updater manifest)
      if (artifacts['linux-deb']) {
        const btn = document.getElementById('dl-linux-deb');
        if (btn) btn.href = `${dlBase}/${artifacts['linux-deb']}`;
      }
      if (artifacts['linux-flatpak']) {
        const btn = document.getElementById('dl-linux-flatpak');
        if (btn) btn.href = `${dlBase}/${artifacts['linux-flatpak']}`;
      }

      // Set recommended section
      if (section && nameEl && descEl && linkEl && iconEl) {
        const recMap = {
          windows: { name: 'Windows', desc: `v${version} — 64-bit installer`, key: 'windows-x86_64', artifact: artifacts.windows },
          macos: { name: 'macOS', desc: `v${version} — Universal (Intel + Apple Silicon)`, key: 'darwin-universal', fallback: 'darwin-x86_64', artifact: artifacts.macos },
          linux: { name: 'Linux AppImage', desc: `v${version} — Portable, runs on most distributions`, key: 'linux-x86_64', artifact: artifacts['linux-appimage'] },
        };
        const rec = recMap[detectedOS];
        if (rec) {
          const platformData = data.platforms[rec.key] || (rec.fallback && data.platforms[rec.fallback]);
          nameEl.textContent = rec.name;
          descEl.textContent = rec.desc;
          iconEl.innerHTML = platformIcons[detectedOS] || platformIcons.linux;
          if (platformData?.url) {
            linkEl.href = platformData.url;
          } else if (rec.artifact) {
            linkEl.href = `${dlBase}/${rec.artifact}`;
          }
          section.classList.remove('hidden');
          if (fallback) fallback.classList.add('hidden');
        }
      }

      // Update verification command placeholders with version
      const minisignCmd = document.getElementById('minisign-cmd');
      const minisignCopy = document.getElementById('minisign-copy');
      if (minisignCmd && minisignCopy) {
        const cmd = `minisign -Vm llamenos-desktop_${version}_amd64.AppImage -P ${minisignPublicKey}`;
        minisignCmd.textContent = cmd;
        minisignCopy.dataset.text = cmd;
      }

      const sha256Cmd = document.getElementById('sha256-cmd');
      const sha256Copy = document.getElementById('sha256-copy');
      if (sha256Cmd && sha256Copy) {
        const cmd = `curl -O ${downloadServerUrl}/v${version}/CHECKSUMS.txt`;
        sha256Cmd.textContent = cmd;
        sha256Copy.dataset.text = cmd;
      }

      const cosignCmd = document.getElementById('cosign-cmd');
      const cosignCopy = document.getElementById('cosign-copy');
      if (cosignCmd && cosignCopy) {
        const cmd = `cosign verify-blob --signature ${downloadServerUrl}/v${version}/CHECKSUMS.txt.sig --certificate-identity-regexp '.*' --certificate-oidc-issuer-regexp '.*' CHECKSUMS.txt`;
        cosignCmd.textContent = cmd;
        cosignCopy.dataset.text = cmd;
      }
    })
    .catch(() => {
      // No releases yet — show fallback, all grid links point to GitHub releases
      if (section) section.classList.add('hidden');
      if (fallback) fallback.classList.remove('hidden');
    });

  // ── Verification tab switching ────────────────────────────────
  document.querySelectorAll('.verify-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.verify-tab').forEach(t => {
        t.classList.remove('active', 'text-accent-bright', 'border-b-2', 'border-accent-bright');
        t.classList.add('text-fg-muted');
      });
      tab.classList.add('active', 'text-accent-bright', 'border-b-2', 'border-accent-bright');
      tab.classList.remove('text-fg-muted');

      document.querySelectorAll('.verify-panel').forEach(p => p.classList.add('hidden'));
      const target = document.getElementById(`tab-${tab.dataset.tab}`);
      if (target) target.classList.remove('hidden');
    });
  });

  // ── Copy-to-clipboard ─────────────────────────────────────────
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.text;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        const original = btn.innerHTML;
        btn.innerHTML = '<svg class="h-4 w-4 text-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
        setTimeout(() => { btn.innerHTML = original; }, 1500);
      } catch {}
    });
  });
</script>
```

- [ ] Commit: `feat(site): verification-first download page with OS detection and crypto verification panel`

---

## Task 4: Rewrite Localized Download Page (`[lang]/download.astro`)

**Files:**
- Modify: `site/src/pages/[lang]/download.astro`

- [ ] **Replace the entire file.** The markup is identical to `download.astro` except:
  - Imports use `../../` instead of `../`
  - `lang` is read from `Astro.params.lang`
  - `BaseLayout` receives `lang={lang}`
  - `getStaticPaths()` is preserved
  - Mobile guide link uses `/${lang}/docs/mobile-guide`

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import { type Lang, nonDefaultLocales } from '../../i18n/config';
import { getTranslation } from '../../i18n/utils';
import { download } from '../../i18n/translations/download';
import { siteConfig } from '../../config';

export function getStaticPaths() {
  return nonDefaultLocales.map(lang => ({ params: { lang } }));
}

const lang = Astro.params.lang as Lang;
const t = getTranslation(download, lang);

const {
  downloadServerUrl,
  updateServerUrl,
  minisignPublicKey,
  gpgFingerprint,
  auditRepoUrl,
} = siteConfig.distribution;

const LATEST_JSON = `${updateServerUrl}/latest.json`;
const GITHUB_RELEASES = siteConfig.github.releasesUrl;
---

<BaseLayout title={t.title} description={t.subtitle} lang={lang}>
  <section class="pt-32 pb-20 md:pt-40">
    <div class="mx-auto max-w-6xl px-6">
      <!-- Header -->
      <div class="max-w-2xl mb-10">
        <h1 class="text-3xl font-bold tracking-tight text-fg sm:text-4xl lg:text-5xl">{t.title}</h1>
        <p class="mt-4 text-lg text-fg-muted leading-relaxed">{t.subtitle}</p>
      </div>

      <!-- Two-column hero: download + verification -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
        <!-- Left: detected platform download -->
        <div class="flex flex-col gap-6">
          <div id="recommended-section" class="hidden rounded-2xl border border-accent/30 bg-accent/5 p-6">
            <h2 class="text-sm font-medium text-accent-bright uppercase tracking-wider mb-4">{t.recommended}</h2>
            <div class="flex items-center gap-4 mb-4">
              <div id="recommended-icon" class="h-12 w-12 text-fg"></div>
              <div>
                <h3 id="recommended-name" class="text-xl font-semibold text-fg"></h3>
                <p id="recommended-desc" class="text-fg-muted text-sm mt-0.5"></p>
              </div>
            </div>
            <a
              id="recommended-link"
              href="#"
              class="inline-flex items-center justify-center w-full rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-bright"
            >
              <svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Download
            </a>
          </div>

          <div id="fallback-section" class="rounded-2xl border border-border bg-bg-card p-6">
            <h2 class="text-sm font-medium text-fg-muted uppercase tracking-wider mb-4">{t.allPlatforms}</h2>
            <p class="text-fg-muted text-sm mb-4">Choose your platform below or download from GitHub Releases.</p>
            <a
              href={GITHUB_RELEASES}
              class="inline-flex items-center justify-center w-full rounded-lg border border-border bg-bg-soft px-6 py-3 text-sm font-medium text-fg transition-colors hover:bg-bg-card"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg class="h-4 w-4 mr-2" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              View all releases
            </a>
          </div>
        </div>

        <!-- Right: verification panel -->
        <div class="rounded-2xl border border-border bg-bg-card p-6">
          <div class="flex items-center gap-3 mb-4">
            <svg class="h-6 w-6 text-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <div>
              <h2 class="text-lg font-semibold text-fg">{t.verifyTitle}</h2>
              <p class="text-sm text-fg-muted">{t.verifySubtitle}</p>
            </div>
          </div>

          <div class="flex gap-2 mb-4 border-b border-border pb-1">
            <button class="verify-tab active text-sm font-medium px-3 py-1.5 rounded-t-lg text-accent-bright border-b-2 border-accent-bright" data-tab="minisign">{t.verifyMinisign}</button>
            <button class="verify-tab text-sm font-medium px-3 py-1.5 rounded-t-lg text-fg-muted hover:text-fg transition-colors" data-tab="sha256">{t.verifySha256}</button>
            <button class="verify-tab text-sm font-medium px-3 py-1.5 rounded-t-lg text-fg-muted hover:text-fg transition-colors" data-tab="cosign">{t.verifyCosign}</button>
          </div>

          <div id="tab-minisign" class="verify-panel">
            <div class="mb-3">
              <p class="text-xs text-fg-dim mb-1.5 font-mono">Public key</p>
              <div class="flex items-center gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
                <code class="text-sm font-mono text-fg-muted truncate flex-1">{minisignPublicKey}</code>
                <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors" data-text={minisignPublicKey} aria-label={t.copyCommand}>
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </button>
              </div>
            </div>
            <div class="mb-3">
              <p class="text-xs text-fg-dim mb-1.5 font-mono">Command</p>
              <div class="flex items-start gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
                <code class="text-sm font-mono text-fg-muted break-all flex-1" id="minisign-cmd">minisign -Vm llamenos-desktop_0.0.0_amd64.AppImage -P {minisignPublicKey}</code>
                <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors mt-0.5" data-text="" id="minisign-copy" aria-label={t.copyCommand}>
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </button>
              </div>
            </div>
          </div>

          <div id="tab-sha256" class="verify-panel hidden">
            <div class="mb-3">
              <p class="text-xs text-fg-dim mb-1.5 font-mono">Download CHECKSUMS.txt</p>
              <div class="flex items-start gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
                <code class="text-sm font-mono text-fg-muted break-all flex-1" id="sha256-cmd">curl -O {downloadServerUrl}/v0.0.0/CHECKSUMS.txt</code>
                <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors mt-0.5" data-text="" id="sha256-copy" aria-label={t.copyCommand}>
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </button>
              </div>
            </div>
            <div class="mb-3">
              <p class="text-xs text-fg-dim mb-1.5 font-mono">Verify</p>
              <div class="flex items-start gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
                <code class="text-sm font-mono text-fg-muted break-all flex-1">sha256sum -c CHECKSUMS.txt</code>
                <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors mt-0.5" data-text="sha256sum -c CHECKSUMS.txt" aria-label={t.copyCommand}>
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </button>
              </div>
            </div>
          </div>

          <div id="tab-cosign" class="verify-panel hidden">
            <div class="mb-3">
              <p class="text-xs text-fg-dim mb-1.5 font-mono">Verify SBOM attestation</p>
              <div class="flex items-start gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
                <code class="text-sm font-mono text-fg-muted break-all flex-1" id="cosign-cmd">cosign verify-blob --signature CHECKSUMS.txt.sig --certificate-identity-regexp '.*' --certificate-oidc-issuer-regexp '.*' CHECKSUMS.txt</code>
                <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors mt-0.5" data-text="" id="cosign-copy" aria-label={t.copyCommand}>
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </button>
              </div>
            </div>
          </div>

          <a
            href={auditRepoUrl}
            class="inline-flex items-center gap-2 text-sm text-accent-bright hover:text-accent transition-colors mt-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            {t.verifyAudit}
          </a>
        </div>
      </div>

      <!-- All platforms grid -->
      <h2 class="text-sm font-medium text-fg-muted uppercase tracking-wider mb-6">{t.allPlatforms}</h2>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-16">
        <!-- Windows -->
        <div class="rounded-xl border border-border bg-bg-card p-5 flex flex-col" data-platform="windows">
          <div class="flex items-center gap-3 mb-3">
            <svg class="h-8 w-8 text-fg-muted" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
            <div>
              <h3 class="font-semibold text-fg">{t.platforms.windows.name}</h3>
              <p class="text-xs text-fg-muted">{t.platforms.windows.description}</p>
            </div>
          </div>
          <a id="dl-windows" href={GITHUB_RELEASES} class="mt-auto inline-flex items-center justify-center rounded-lg border border-border bg-bg-soft px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-bg-card">
            Download .exe
          </a>
        </div>

        <!-- macOS -->
        <div class="rounded-xl border border-border bg-bg-card p-5 flex flex-col" data-platform="macos">
          <div class="flex items-center gap-3 mb-3">
            <svg class="h-8 w-8 text-fg-muted" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
            <div>
              <h3 class="font-semibold text-fg">{t.platforms.macos.name}</h3>
              <p class="text-xs text-fg-muted">{t.platforms.macos.description}</p>
            </div>
          </div>
          <a id="dl-macos" href={GITHUB_RELEASES} class="mt-auto inline-flex items-center justify-center rounded-lg border border-border bg-bg-soft px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-bg-card">
            Download .dmg
          </a>
        </div>

        <!-- Linux AppImage -->
        <div class="rounded-xl border border-border bg-bg-card p-5 flex flex-col" data-platform="linux-appimage">
          <div class="flex items-center gap-3 mb-3">
            <svg class="h-8 w-8 text-fg-muted" viewBox="0 0 24 24" fill="currentColor"><path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.368 1.884 1.368.39 0 .739-.134 1.107-.465 1.196-.676 1.167-1.677.745-2.553-.224-.47-.396-.845-.406-1.081-.018-.291.05-.527.136-.822.04-.099.094-.196.149-.295l.048-.09c.326-.652.478-1.202.39-1.75a1.6 1.6 0 00-.093-.286c.146-.234.308-.47.479-.744.574-.87 1.07-2.105 1.182-3.67.042-.533.006-1.071-.094-1.581 0-.006-.001-.012-.001-.018-.005-.032-.012-.065-.02-.099a3.97 3.97 0 00-.12-.505c-.29-.984-.78-1.84-1.35-2.526-.57-.685-1.22-1.2-1.82-1.487-.6-.29-1.18-.395-1.58-.395h-.046c-.576.016-.755.093-1.04.272-.33-.036-.66-.048-.99-.036z"/></svg>
            <div>
              <h3 class="font-semibold text-fg">{t.platforms.linuxAppImage.name}</h3>
              <p class="text-xs text-fg-muted">{t.platforms.linuxAppImage.description}</p>
            </div>
          </div>
          <a id="dl-linux-appimage" href={GITHUB_RELEASES} class="mt-auto inline-flex items-center justify-center rounded-lg border border-border bg-bg-soft px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-bg-card">
            Download .AppImage
          </a>
        </div>

        <!-- Linux .deb -->
        <div class="rounded-xl border border-border bg-bg-card p-5 flex flex-col" data-platform="linux-deb">
          <div class="flex items-center gap-3 mb-3">
            <svg class="h-8 w-8 text-fg-muted" viewBox="0 0 24 24" fill="currentColor"><path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.368 1.884 1.368.39 0 .739-.134 1.107-.465 1.196-.676 1.167-1.677.745-2.553-.224-.47-.396-.845-.406-1.081-.018-.291.05-.527.136-.822.04-.099.094-.196.149-.295l.048-.09c.326-.652.478-1.202.39-1.75a1.6 1.6 0 00-.093-.286c.146-.234.308-.47.479-.744.574-.87 1.07-2.105 1.182-3.67.042-.533.006-1.071-.094-1.581 0-.006-.001-.012-.001-.018-.005-.032-.012-.065-.02-.099a3.97 3.97 0 00-.12-.505c-.29-.984-.78-1.84-1.35-2.526-.57-.685-1.22-1.2-1.82-1.487-.6-.29-1.18-.395-1.58-.395h-.046c-.576.016-.755.093-1.04.272-.33-.036-.66-.048-.99-.036z"/></svg>
            <div>
              <h3 class="font-semibold text-fg">{t.platforms.linuxDeb.name}</h3>
              <p class="text-xs text-fg-muted">{t.platforms.linuxDeb.description}</p>
            </div>
          </div>
          <a id="dl-linux-deb" href={GITHUB_RELEASES} class="mt-auto inline-flex items-center justify-center rounded-lg border border-border bg-bg-soft px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-bg-card">
            Download .deb
          </a>
        </div>

        <!-- Linux Flatpak -->
        <div class="rounded-xl border border-border bg-bg-card p-5 flex flex-col" data-platform="linux-flatpak">
          <div class="flex items-center gap-3 mb-3">
            <svg class="h-8 w-8 text-fg-muted" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            <div>
              <h3 class="font-semibold text-fg">{t.platforms.linuxFlatpak.name}</h3>
              <p class="text-xs text-fg-muted">{t.platforms.linuxFlatpak.description}</p>
            </div>
          </div>
          <a id="dl-linux-flatpak" href={GITHUB_RELEASES} class="mt-auto inline-flex items-center justify-center rounded-lg border border-border bg-bg-soft px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-bg-card">
            Download .flatpak
          </a>
        </div>

        <!-- Mobile (early access) -->
        <div class="rounded-xl border border-border bg-bg-card p-5 flex flex-col" data-platform="mobile">
          <div class="flex items-center gap-3 mb-3">
            <svg class="h-8 w-8 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
            <div>
              <h3 class="font-semibold text-fg">{t.platforms.mobile.name}</h3>
              <p class="text-xs text-fg-muted">{t.platforms.mobile.description}</p>
            </div>
          </div>
          <a href={`/${lang}/docs/mobile-guide`} class="mt-auto inline-flex items-center justify-center rounded-lg border border-border bg-bg-soft px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-bg-card">
            Mobile Guide
          </a>
        </div>
      </div>

      <!-- Flatpak / Flathub section -->
      <div class="rounded-xl border border-border bg-bg-card p-6 mb-12 max-w-2xl">
        <h3 class="font-semibold text-fg mb-3">{t.flatpakTitle}</h3>
        <div class="space-y-3">
          <div class="flex items-start gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
            <code class="text-sm font-mono text-fg-muted break-all flex-1">{t.flatpakInstall}</code>
            <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors mt-0.5" data-text={t.flatpakInstall} aria-label={t.copyCommand}>
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
          </div>
          <div class="flex items-start gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
            <code class="text-sm font-mono text-fg-muted break-all flex-1">{t.flatpakRun}</code>
            <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors mt-0.5" data-text={t.flatpakRun} aria-label={t.copyCommand}>
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
          </div>
        </div>
        <a
          href="https://flathub.org/apps/org.llamenos.hotline"
          class="inline-flex items-center gap-2 text-sm text-accent-bright hover:text-accent transition-colors mt-4"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t.flatpakFlathub} &rarr;
        </a>
      </div>

      <!-- GPG fingerprint section -->
      <div class="rounded-xl border border-border bg-bg-card p-6 mb-12 max-w-2xl">
        <h3 class="font-semibold text-fg mb-3">{t.gpgTitle}</h3>
        <p class="text-sm text-fg-muted mb-3">
          Optionally verify CHECKSUMS.txt with GPG. The fingerprint should match the one published in the audit repository.
        </p>
        <div class="mb-3">
          <p class="text-xs text-fg-dim mb-1.5 font-mono">{t.gpgFingerprint}</p>
          <div class="flex items-center gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
            <code class="text-sm font-mono text-fg-muted truncate flex-1">{gpgFingerprint}</code>
            <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors" data-text={gpgFingerprint} aria-label={t.copyCommand}>
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
          </div>
        </div>
        <div class="flex items-start gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
          <code class="text-sm font-mono text-fg-muted break-all flex-1">{t.gpgVerify}</code>
          <button class="copy-btn shrink-0 text-fg-muted hover:text-accent-bright transition-colors mt-0.5" data-text={t.gpgVerify} aria-label={t.copyCommand}>
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </button>
        </div>
      </div>

      <!-- System requirements -->
      <div class="rounded-xl border border-border bg-bg-card p-6 max-w-2xl">
        <h3 class="font-semibold text-fg mb-3">{t.systemReqs}</h3>
        <ul class="space-y-2 text-sm text-fg-muted">
          {t.reqItems.map(item => (
            <li class="flex items-start gap-2">
              <svg class="h-4 w-4 text-accent mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <!-- Links -->
      <div class="flex flex-wrap gap-6 mt-8 text-sm">
        <a href={GITHUB_RELEASES} class="text-accent-bright hover:text-accent transition-colors" target="_blank" rel="noopener noreferrer">
          {t.releaseNotes} &rarr;
        </a>
        <a href={`${GITHUB_RELEASES}/download/CHECKSUMS.txt`} class="text-accent-bright hover:text-accent transition-colors" target="_blank" rel="noopener noreferrer">
          {t.checksum} &rarr;
        </a>
        <a href={auditRepoUrl} class="text-accent-bright hover:text-accent transition-colors" target="_blank" rel="noopener noreferrer">
          {t.verifyAudit} &rarr;
        </a>
      </div>
    </div>
  </section>
</BaseLayout>

<script define:vars={{ LATEST_JSON, GITHUB_RELEASES, downloadServerUrl, minisignPublicKey }}>
  const ua = navigator.userAgent.toLowerCase();
  let detectedOS = 'linux';
  if (ua.includes('win')) detectedOS = 'windows';
  else if (ua.includes('mac')) detectedOS = 'macos';

  const section = document.getElementById('recommended-section');
  const fallback = document.getElementById('fallback-section');
  const nameEl = document.getElementById('recommended-name');
  const descEl = document.getElementById('recommended-desc');
  const linkEl = document.getElementById('recommended-link');
  const iconEl = document.getElementById('recommended-icon');

  const platformIcons = {
    windows: '<svg class="h-12 w-12" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>',
    macos: '<svg class="h-12 w-12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>',
    linux: '<svg class="h-12 w-12" viewBox="0 0 24 24" fill="currentColor"><path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.368 1.884 1.368.39 0 .739-.134 1.107-.465 1.196-.676 1.167-1.677.745-2.553-.224-.47-.396-.845-.406-1.081-.018-.291.05-.527.136-.822.04-.099.094-.196.149-.295l.048-.09c.326-.652.478-1.202.39-1.75a1.6 1.6 0 00-.093-.286c.146-.234.308-.47.479-.744.574-.87 1.07-2.105 1.182-3.67.042-.533.006-1.071-.094-1.581 0-.006-.001-.012-.001-.018-.005-.032-.012-.065-.02-.099a3.97 3.97 0 00-.12-.505c-.29-.984-.78-1.84-1.35-2.526-.57-.685-1.22-1.2-1.82-1.487-.6-.29-1.18-.395-1.58-.395h-.046c-.576.016-.755.093-1.04.272-.33-.036-.66-.048-.99-.036z"/></svg>',
  };

  const cards = document.querySelectorAll('[data-platform]');
  cards.forEach(card => {
    if (card.dataset.platform === detectedOS ||
        (detectedOS === 'linux' && card.dataset.platform === 'linux-appimage')) {
      card.classList.add('ring-1', 'ring-accent/30');
    }
  });

  fetch(LATEST_JSON)
    .then(r => r.ok ? r.json() : Promise.reject('No releases'))
    .then(data => {
      const version = data.version;
      const dlBase = `${downloadServerUrl}/v${version}`;

      const artifacts = {
        windows: `llamenos-desktop_${version}_x64-setup.exe`,
        macos: `llamenos-desktop_${version}_universal.dmg`,
        'linux-appimage': `llamenos-desktop_${version}_amd64.AppImage`,
        'linux-deb': `llamenos-desktop_${version}_amd64.deb`,
        'linux-flatpak': `llamenos-desktop_${version}_amd64.flatpak`,
      };

      const platformMap = {
        'windows': { jsonKey: 'windows-x86_64', btn: 'dl-windows' },
        'macos': { jsonKey: 'darwin-universal', btn: 'dl-macos', fallbackKey: 'darwin-x86_64' },
        'linux-appimage': { jsonKey: 'linux-x86_64', btn: 'dl-linux-appimage' },
      };

      for (const [platform, info] of Object.entries(platformMap)) {
        const platformData = data.platforms[info.jsonKey] || (info.fallbackKey && data.platforms[info.fallbackKey]);
        if (platformData?.url) {
          const btn = document.getElementById(info.btn);
          if (btn) btn.href = platformData.url;
        } else if (artifacts[platform]) {
          const btn = document.getElementById(info.btn);
          if (btn) btn.href = `${dlBase}/${artifacts[platform]}`;
        }
      }

      if (artifacts['linux-deb']) {
        const btn = document.getElementById('dl-linux-deb');
        if (btn) btn.href = `${dlBase}/${artifacts['linux-deb']}`;
      }
      if (artifacts['linux-flatpak']) {
        const btn = document.getElementById('dl-linux-flatpak');
        if (btn) btn.href = `${dlBase}/${artifacts['linux-flatpak']}`;
      }

      if (section && nameEl && descEl && linkEl && iconEl) {
        const recMap = {
          windows: { name: 'Windows', desc: `v${version} — 64-bit installer`, key: 'windows-x86_64', artifact: artifacts.windows },
          macos: { name: 'macOS', desc: `v${version} — Universal (Intel + Apple Silicon)`, key: 'darwin-universal', fallback: 'darwin-x86_64', artifact: artifacts.macos },
          linux: { name: 'Linux AppImage', desc: `v${version} — Portable, runs on most distributions`, key: 'linux-x86_64', artifact: artifacts['linux-appimage'] },
        };
        const rec = recMap[detectedOS];
        if (rec) {
          const platformData = data.platforms[rec.key] || (rec.fallback && data.platforms[rec.fallback]);
          nameEl.textContent = rec.name;
          descEl.textContent = rec.desc;
          iconEl.innerHTML = platformIcons[detectedOS] || platformIcons.linux;
          if (platformData?.url) {
            linkEl.href = platformData.url;
          } else if (rec.artifact) {
            linkEl.href = `${dlBase}/${rec.artifact}`;
          }
          section.classList.remove('hidden');
          if (fallback) fallback.classList.add('hidden');
        }
      }

      const minisignCmd = document.getElementById('minisign-cmd');
      const minisignCopy = document.getElementById('minisign-copy');
      if (minisignCmd && minisignCopy) {
        const cmd = `minisign -Vm llamenos-desktop_${version}_amd64.AppImage -P ${minisignPublicKey}`;
        minisignCmd.textContent = cmd;
        minisignCopy.dataset.text = cmd;
      }

      const sha256Cmd = document.getElementById('sha256-cmd');
      const sha256Copy = document.getElementById('sha256-copy');
      if (sha256Cmd && sha256Copy) {
        const cmd = `curl -O ${downloadServerUrl}/v${version}/CHECKSUMS.txt`;
        sha256Cmd.textContent = cmd;
        sha256Copy.dataset.text = cmd;
      }

      const cosignCmd = document.getElementById('cosign-cmd');
      const cosignCopy = document.getElementById('cosign-copy');
      if (cosignCmd && cosignCopy) {
        const cmd = `cosign verify-blob --signature ${downloadServerUrl}/v${version}/CHECKSUMS.txt.sig --certificate-identity-regexp '.*' --certificate-oidc-issuer-regexp '.*' CHECKSUMS.txt`;
        cosignCmd.textContent = cmd;
        cosignCopy.dataset.text = cmd;
      }
    })
    .catch(() => {
      if (section) section.classList.add('hidden');
      if (fallback) fallback.classList.remove('hidden');
    });

  document.querySelectorAll('.verify-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.verify-tab').forEach(t => {
        t.classList.remove('active', 'text-accent-bright', 'border-b-2', 'border-accent-bright');
        t.classList.add('text-fg-muted');
      });
      tab.classList.add('active', 'text-accent-bright', 'border-b-2', 'border-accent-bright');
      tab.classList.remove('text-fg-muted');

      document.querySelectorAll('.verify-panel').forEach(p => p.classList.add('hidden'));
      const target = document.getElementById(`tab-${tab.dataset.tab}`);
      if (target) target.classList.remove('hidden');
    });
  });

  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.text;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        const original = btn.innerHTML;
        btn.innerHTML = '<svg class="h-4 w-4 text-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
        setTimeout(() => { btn.innerHTML = original; }, 1500);
      } catch {}
    });
  });
</script>
```

- [ ] Commit: `feat(site): localized verification-first download page`

---

## Verification Checklist

After all tasks:
- [ ] `cd site && bun run build` exits 0 (Astro static build succeeds)
- [ ] No TypeScript errors in `site/src/` (run `cd site && bunx tsc --noEmit` if a tsconfig exists)
- [ ] Download page renders correctly at `/download`
- [ ] Localized download pages render at `/es/download`, `/zh/download`, etc.
- [ ] OS detection highlights the correct platform card
- [ ] `latest.json` fetch populates version, download URLs, and verification commands
- [ ] Verification tab switching works
- [ ] Copy-to-clipboard buttons work
- [ ] Fallback state displays when `latest.json` is unreachable
- [ ] All external links point to `llamenos-platform` or `llamenos-releases` (never `llamenos-platform`)

---

## Architecture Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Verification placement | Side-by-side with download CTA on desktop, stacked on mobile | Makes verification visible without scrolling while keeping the primary action accessible |
| Command copy UX | Inline copy buttons on every code block | Reduces friction for power users who want to paste into terminal |
| Dynamic commands | Fetched from `latest.json`, not hardcoded | Commands reference the actual current version and server URLs |
| Fallback state | GitHub releases link when `latest.json` fails | Page is functional before the self-hosted update server is live |
| i18n scope | `en`, `es`, `zh` fully translated; others fallback to English | Covers the three largest user bases; remaining locales can be added incrementally |
| GPG fingerprint | Config constant with placeholder value | Real fingerprint is set when the release signing key is generated; page gracefully handles the placeholder |
