// SVG icon strings for feature sections (English only; other locales TODO)
const icons = {
  shield: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  lock: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  layers: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  mic: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  key: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`,
  checkVerified: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`,
  forwardSecrecy: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>`,
  phone: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.18 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  cloud: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`,
  server: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`,
  bells: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  monitor: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
  message: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  broadcast: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>`,
  smartphone: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
  cpu: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
  fileText: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  search: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  network: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><line x1="12" y1="8" x2="5.5" y2="16.5"/><line x1="12" y1="8" x2="18.5" y2="16.5"/></svg>`,
  link2: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
  docker: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="3" height="3"/><rect x="7" y="7" width="3" height="3"/><rect x="12" y="7" width="3" height="3"/><rect x="7" y="12" width="3" height="3"/><rect x="12" y="12" width="3" height="3"/><path d="M19 13c.34-1.17.23-2.4-.29-3.49A5 5 0 0 0 14.23 7H14v-.5A3.5 3.5 0 0 0 10.5 3h0A3.5 3.5 0 0 0 7 6.5V7"/></svg>`,
  gear: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  globe: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  shieldCheck: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`,
};

export type FeatureItem = { icon: string; title: string; description: string };
export type FeatureSection = {
  id: string;
  heading: string;
  oneliner: string;
  items: FeatureItem[];
};

export const home: Record<string, {
  hero: {
    badge: string;
    title: string;
    titleAccent: string;
    description: string;
    cta: string;
    ctaSecondary: string;
  };
  features: {
    heading: string;
    subtitle: string;
    sections: FeatureSection[];
  };
  screenshots: {
    heading: string;
    subtitle: string;
  };
  security: {
    heading: string;
    description: string;
    link: string;
  };
  deploy: {
    heading: string;
    description: string;
    cta: string;
    github: string;
  };
}> = {
  en: {
    hero: {
      badge: 'Open source · End-to-end encrypted',
      title: 'Secure crisis hotline',
      titleAccent: 'for the people who need it',
      description: 'Llámenos is open-source hotline software that protects callers and volunteers. HPKE-encrypted notes, 8-provider telephony, 5 messaging channels, and a zero-knowledge architecture — so sensitive conversations stay private.',
      cta: 'Download',
      ctaSecondary: 'Get started',
    },
    features: {
      heading: 'Built for crisis response',
      subtitle: 'An extraordinary depth of capability — every decision made with activists, organizers, and their adversaries in mind.',
      sections: [
        {
          id: 'security',
          heading: 'Security-first architecture',
          oneliner: 'Reviewed by a Signal cryptographer. Every cryptographic decision is intentional, documented, and auditable.',
          items: [
            {
              icon: icons.shield,
              title: 'HPKE (RFC 9180)',
              description: 'X25519-HKDF-SHA256-AES256-GCM — the same hybrid encryption standard used in MLS and TLS 1.3. Replaced ECIES entirely.',
            },
            {
              icon: icons.forwardSecrecy,
              title: 'Per-note forward secrecy',
              description: 'Every note uses a unique random key, HPKE-wrapped per authorized reader. Compromising any key reveals nothing about past notes.',
            },
            {
              icon: icons.layers,
              title: '57 domain separation labels',
              description: 'Every crypto operation has a unique context string (Albrecht defense). No two operations share a key derivation path.',
            },
            {
              icon: icons.mic,
              title: 'Client-side Whisper transcription',
              description: 'Call transcription runs entirely in the browser via WASM. Audio never reaches the server — not even the encrypted audio.',
            },
            {
              icon: icons.key,
              title: 'PIN-encrypted device keys',
              description: '600,000 PBKDF2 iterations + XChaCha20-Poly1305. Private keys live only in an in-memory closure — never in sessionStorage or disk.',
            },
            {
              icon: icons.checkVerified,
              title: 'Reproducible builds + SLSA',
              description: 'SLSA provenance, SBOM, cosign signing, SOURCE_DATE_EPOCH. Any release can be verified byte-for-byte against the published checksums.',
            },
          ],
        },
        {
          id: 'telephony',
          heading: '8 telephony providers, your choice',
          oneliner: 'Cloud or fully self-hosted. Switch providers without code changes. No CDR data forced to any third party.',
          items: [
            {
              icon: icons.cloud,
              title: '6 cloud providers',
              description: 'Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth — configure via admin UI. Mix providers across hubs.',
            },
            {
              icon: icons.server,
              title: 'Self-hosted SIP',
              description: 'Asterisk and FreeSWITCH via ARI/ESL/Kamailio bridge. No cloud dependency, no call records leaving your server.',
            },
            {
              icon: icons.bells,
              title: 'Parallel ring',
              description: 'Every on-shift volunteer rings simultaneously. First pickup wins. Queue with hold music if all are busy.',
            },
            {
              icon: icons.monitor,
              title: 'WebRTC browser calling',
              description: 'Volunteers answer calls directly in the browser. No phone required. Provider-specific WebRTC token generation.',
            },
          ],
        },
        {
          id: 'messaging',
          heading: '5 messaging channels, unified inbox',
          oneliner: 'SMS, WhatsApp, Signal, Telegram, and RCS — all routed through a single encrypted conversation view.',
          items: [
            {
              icon: icons.message,
              title: 'Full Signal integration',
              description: 'Receipts, reactions, typing indicators, identity trust, retry queue, and failover. A complete Signal client, not just send/receive.',
            },
            {
              icon: icons.phone,
              title: 'WhatsApp + SMS',
              description: 'Meta Cloud API (Graph v21) for WhatsApp. SMS via 4 providers. Template support, media messages, inbound webhooks.',
            },
            {
              icon: icons.broadcast,
              title: 'Telegram + RCS',
              description: 'Telegram Bot API and RCS/Google RBM for rich messaging. All channels share the same encrypted conversation model.',
            },
            {
              icon: icons.bells,
              title: 'Blast/broadcast',
              description: 'PostgreSQL-backed delivery queue with per-channel rate limiting, scheduled sends, and per-recipient status tracking.',
            },
          ],
        },
        {
          id: 'platforms',
          heading: 'Three native platforms, one crypto crate',
          oneliner: 'One auditable Rust implementation compiled to native, WASM, and UniFFI. Not three separate implementations.',
          items: [
            {
              icon: icons.monitor,
              title: 'Desktop (Tauri v2)',
              description: 'Windows, macOS, and Linux. Tauri Stronghold encrypted vault. Native system tray, auto-updates, single-instance enforcement.',
            },
            {
              icon: icons.smartphone,
              title: 'iOS (SwiftUI)',
              description: 'Native SwiftUI, iOS 17+. Keys in the iOS Keychain. Rust crypto via UniFFI XCFramework — same code as desktop.',
            },
            {
              icon: icons.cpu,
              title: 'Android (Kotlin/Compose)',
              description: 'Native Kotlin/Compose, minSdk 26. Android Keystore. Rust crypto via JNI — same crate, different target.',
            },
          ],
        },
        {
          id: 'case-management',
          heading: 'Template-driven case management',
          oneliner: 'Nothing is hardcoded to any use case. Entity types, report types, fields, and views are all configurable per hub.',
          items: [
            {
              icon: icons.fileText,
              title: 'Custom templates',
              description: 'Define entity types, report types, and custom fields per hub. Templates drive all forms and views — no code changes needed.',
            },
            {
              icon: icons.search,
              title: 'Encrypted blind-index search',
              description: 'Search encrypted records without exposing plaintext to the server. HMAC-indexed fields, scoped per hub.',
            },
            {
              icon: icons.network,
              title: 'Multi-hub',
              description: 'One installation, many lines. Volunteers and admins can be members of multiple hubs simultaneously.',
            },
            {
              icon: icons.link2,
              title: 'Relationships + evidence',
              description: 'Link contacts, cases, events, and evidence. Full relationship graph with encrypted fields throughout.',
            },
          ],
        },
        {
          id: 'deployment',
          heading: 'Self-hosted, GDPR-ready',
          oneliner: 'Your server, your data. Three deployment paths, from single-server to Kubernetes cluster.',
          items: [
            {
              icon: icons.docker,
              title: 'Docker Compose',
              description: 'Single-server deployment in minutes. PostgreSQL, MinIO, strfry Nostr relay, and all sidecars included.',
            },
            {
              icon: icons.gear,
              title: 'Kubernetes (Helm)',
              description: 'Production Helm chart with health probes, Prometheus ServiceMonitor, Caddy ingress, and Ansible preflight playbooks.',
            },
            {
              icon: icons.globe,
              title: 'Co-op Cloud + GDPR',
              description: 'Co-op Cloud recipe for community organizations. EU-compatible data handling, right to erasure, Cloudflare Tunnels ingress.',
            },
          ],
        },
      ],
    },
    screenshots: {
      heading: 'See it in action',
      subtitle: 'A modern, responsive interface designed for crisis response. Works on desktop and mobile.',
    },
    security: {
      heading: 'Honest about security',
      description: "We publish exactly what is encrypted, what isn't, and what the server can see. No hand-waving. HPKE (RFC 9180) replaces ECIES. Per-note forward secrecy means compromising a key can't reveal past notes. 57 domain separation labels prevent cross-protocol attacks. Audio never leaves your browser. Read the full security model.",
      link: 'Read the security model',
    },
    deploy: {
      heading: 'Ready to deploy?',
      description: 'Llámenos runs on your own servers — Docker Compose for single-server, Helm for Kubernetes. Get a hotline running in under an hour.',
      cta: 'Get started',
      github: 'View on GitHub',
    },
  },

  // TODO: translate features.sections for es
  es: {
    hero: {
      badge: 'Código abierto · Cifrado de extremo a extremo',
      title: 'Línea de crisis segura',
      titleAccent: 'para quienes la necesitan',
      description: 'Llámenos es un software de línea de ayuda de código abierto que protege a quienes llaman y a los voluntarios. Notas cifradas, enrutamiento de llamadas en tiempo real y una arquitectura de conocimiento cero — para que las conversaciones sensibles permanezcan privadas.',
      cta: 'Descargar',
      ctaSecondary: 'Comenzar',
    },
    features: {
      heading: 'Diseñado para respuesta a crisis',
      subtitle: 'Una profundidad extraordinaria de capacidades — cada decisión tomada pensando en activistas, organizadores y sus adversarios.',
      // TODO: translate sections
      sections: [],
    },
    screenshots: {
      heading: 'Véalo en acción',
      subtitle: 'Una interfaz moderna y responsiva diseñada para respuesta a crisis. Funciona en escritorio y móvil.',
    },
    security: {
      heading: 'Honestos sobre la seguridad',
      description: 'Publicamos exactamente qué está cifrado, qué no lo está y qué puede ver el servidor. Sin ambigüedades. HPKE (RFC 9180) reemplaza a ECIES. El secreto hacia adelante por nota significa que comprometer una clave no revela notas pasadas. Lee el modelo de seguridad completo.',
      link: 'Leer el modelo de seguridad',
    },
    deploy: {
      heading: '¿Listo para desplegar?',
      description: 'Llámenos funciona en tus propios servidores — Docker Compose para servidor único, Helm para Kubernetes. Pon en marcha una línea de ayuda en menos de una hora.',
      cta: 'Comenzar',
      github: 'Ver en GitHub',
    },
  },

  // TODO: translate features.sections for zh
  zh: {
    hero: {
      badge: '开源 · 端到端加密',
      title: '安全的危机热线',
      titleAccent: '为需要帮助的人而建',
      description: 'Llámenos 是保护来电者和志愿者的开源热线软件。HPKE 加密笔记、8提供商电话、5消息渠道和零知识架构——确保敏感对话保持私密。',
      cta: '下载',
      ctaSecondary: '开始使用',
    },
    features: {
      heading: '专为危机响应打造',
      subtitle: '非凡的功能深度——每个决策都考虑到活动人士、组织者及其对手。',
      // TODO: translate sections
      sections: [],
    },
    screenshots: {
      heading: '实际效果展示',
      subtitle: '为危机响应设计的现代响应式界面。支持桌面和移动设备。',
    },
    security: {
      heading: '坦诚的安全声明',
      description: '我们准确公布哪些内容已加密、哪些未加密以及服务器能看到什么。绝不含糊。HPKE（RFC 9180）取代了 ECIES。逐条前向保密意味着泄露密钥无法揭示过去的笔记。阅读完整的安全模型。',
      link: '阅读安全模型',
    },
    deploy: {
      heading: '准备好部署了吗？',
      description: 'Llámenos 运行在您自己的服务器上——单服务器用 Docker Compose，集群用 Helm。不到一小时即可启动热线。',
      cta: '开始使用',
      github: '在 GitHub 上查看',
    },
  },

  // TODO: translate features.sections for tl
  tl: {
    hero: {
      badge: 'Open source · End-to-end encrypted',
      title: 'Secure na crisis hotline',
      titleAccent: 'para sa mga nangangailangan',
      description: 'Ang Llámenos ay open-source na hotline software na nagpoprotekta sa mga tumatawag at mga volunteer. HPKE-encrypted na mga tala, 8 provider na telephony, 5 messaging channel, at zero-knowledge architecture — para manatiling pribado ang mga sensitibong usapan.',
      cta: 'I-download',
      ctaSecondary: 'Magsimula',
    },
    features: {
      heading: 'Ginawa para sa crisis response',
      subtitle: 'Napakalalim na kakayahan — bawat desisyon ay ginawa na may isip sa mga aktibista, organizer, at kanilang mga kalaban.',
      // TODO: translate sections
      sections: [],
    },
    screenshots: {
      heading: 'Tingnan ito sa aksyon',
      subtitle: 'Isang modernong, responsive na interface na dinisenyo para sa crisis response. Gumagana sa desktop at mobile.',
    },
    security: {
      heading: 'Tapat tungkol sa seguridad',
      description: 'Inilalathala namin nang eksakto kung ano ang naka-encrypt, ano ang hindi, at ano ang nakikita ng server. Walang pambubulag. Pinalitan ng HPKE (RFC 9180) ang ECIES. Per-note forward secrecy ang ibig sabihin ay hindi maibubunyag ang mga nakaraang tala. Basahin ang buong modelo ng seguridad.',
      link: 'Basahin ang modelo ng seguridad',
    },
    deploy: {
      heading: 'Handa nang mag-deploy?',
      description: 'Ang Llámenos ay tumatakbo sa iyong sariling mga server — Docker Compose para sa single server, Helm para sa Kubernetes. Magpatakbo ng hotline sa loob ng isang oras.',
      cta: 'Magsimula',
      github: 'Tingnan sa GitHub',
    },
  },

  // TODO: translate features.sections for vi
  vi: {
    hero: {
      badge: 'Mã nguồn mở · Mã hóa đầu cuối',
      title: 'Đường dây nóng khủng hoảng an toàn',
      titleAccent: 'cho những người cần nó',
      description: 'Llámenos là phần mềm đường dây nóng mã nguồn mở bảo vệ người gọi và tình nguyện viên. Ghi chú mã hóa HPKE, 8 nhà cung cấp điện thoại, 5 kênh nhắn tin và kiến trúc không tiết lộ — để các cuộc trò chuyện nhạy cảm luôn riêng tư.',
      cta: 'Tải xuống',
      ctaSecondary: 'Bắt đầu',
    },
    features: {
      heading: 'Xây dựng cho ứng phó khủng hoảng',
      subtitle: 'Chiều sâu năng lực phi thường — mọi quyết định đều được đưa ra với ý thức về các nhà hoạt động, tổ chức viên và đối thủ của họ.',
      // TODO: translate sections
      sections: [],
    },
    screenshots: {
      heading: 'Xem thực tế',
      subtitle: 'Giao diện hiện đại, responsive được thiết kế cho ứng phó khủng hoảng. Hoạt động trên máy tính và điện thoại.',
    },
    security: {
      heading: 'Trung thực về bảo mật',
      description: 'Chúng tôi công bố chính xác những gì được mã hóa, những gì không và những gì máy chủ có thể thấy. Không mập mờ. HPKE (RFC 9180) thay thế ECIES. Bảo mật chuyển tiếp theo ghi chú nghĩa là lộ khóa không thể tiết lộ ghi chú trước đó. Đọc mô hình bảo mật đầy đủ.',
      link: 'Đọc mô hình bảo mật',
    },
    deploy: {
      heading: 'Sẵn sàng triển khai?',
      description: 'Llámenos chạy trên máy chủ của riêng bạn — Docker Compose cho một máy chủ, Helm cho Kubernetes. Khởi chạy đường dây nóng trong chưa đầy một giờ.',
      cta: 'Bắt đầu',
      github: 'Xem trên GitHub',
    },
  },

  // TODO: translate features.sections for ar
  ar: {
    hero: {
      badge: 'مفتوح المصدر · تشفير من طرف إلى طرف',
      title: 'خط ساخن آمن للأزمات',
      titleAccent: 'للأشخاص الذين يحتاجونه',
      description: 'Llámenos هو برنامج خط ساخن مفتوح المصدر يحمي المتصلين والمتطوعين. ملاحظات مشفرة بـ HPKE، 8 مزودي اتصالات، 5 قنوات مراسلة، وبنية معرفة صفرية — لتبقى المحادثات الحساسة خاصة.',
      cta: 'تحميل',
      ctaSecondary: 'ابدأ الآن',
    },
    features: {
      heading: 'مصمم للاستجابة للأزمات',
      subtitle: 'عمق استثنائي من القدرات — كل قرار اتُخذ مع وضع الناشطين والمنظمين وخصومهم في الاعتبار.',
      // TODO: translate sections
      sections: [],
    },
    screenshots: {
      heading: 'شاهده أثناء العمل',
      subtitle: 'واجهة حديثة ومتجاوبة مصممة للاستجابة للأزمات. تعمل على الحاسوب والجوال.',
    },
    security: {
      heading: 'صادقون بشأن الأمان',
      description: 'ننشر بالضبط ما هو مشفر وما ليس كذلك وما يمكن للخادم رؤيته. بلا غموض. يحل HPKE (RFC 9180) محل ECIES. السرية التامة لكل ملاحظة تعني أن اختراق المفتاح لا يكشف الملاحظات السابقة. اقرأ نموذج الأمان الكامل.',
      link: 'اقرأ نموذج الأمان',
    },
    deploy: {
      heading: 'مستعد للنشر؟',
      description: 'يعمل Llámenos على خوادمك الخاصة — Docker Compose لخادم واحد، Helm لـ Kubernetes. شغّل خطاً ساخناً في أقل من ساعة.',
      cta: 'ابدأ الآن',
      github: 'عرض على GitHub',
    },
  },

  // TODO: translate features.sections for fr
  fr: {
    hero: {
      badge: 'Open source · Chiffrement de bout en bout',
      title: "Ligne d'urgence sécurisée",
      titleAccent: 'pour ceux qui en ont besoin',
      description: "Llámenos est un logiciel de ligne d'assistance open source qui protège les appelants et les bénévoles. Notes chiffrées HPKE, 8 fournisseurs téléphoniques, 5 canaux de messagerie et architecture zéro connaissance — pour que les conversations sensibles restent privées.",
      cta: 'Télécharger',
      ctaSecondary: 'Commencer',
    },
    features: {
      heading: "Conçu pour la réponse aux crises",
      subtitle: "Une profondeur de capacités extraordinaire — chaque décision prise en pensant aux militants, organisateurs et leurs adversaires.",
      // TODO: translate sections
      sections: [],
    },
    screenshots: {
      heading: 'Voyez-le en action',
      subtitle: 'Une interface moderne et responsive conçue pour la réponse aux crises. Fonctionne sur ordinateur et mobile.',
    },
    security: {
      heading: 'Honnêtes sur la sécurité',
      description: "Nous publions exactement ce qui est chiffré, ce qui ne l'est pas et ce que le serveur peut voir. Sans ambiguïté. HPKE (RFC 9180) remplace ECIES. Le secret de transfert par note signifie que compromettre une clé ne révèle pas les notes passées. Lisez le modèle de sécurité complet.",
      link: 'Lire le modèle de sécurité',
    },
    deploy: {
      heading: 'Prêt à déployer ?',
      description: "Llámenos fonctionne sur vos propres serveurs — Docker Compose pour un seul serveur, Helm pour Kubernetes. Lancez une ligne d'assistance en moins d'une heure.",
      cta: 'Commencer',
      github: 'Voir sur GitHub',
    },
  },

  // TODO: translate features.sections for ht
  ht: {
    hero: {
      badge: 'Open source · Chifre bout-an-bout',
      title: 'Liy kriz ki an sekirite',
      titleAccent: 'pou moun ki bezwen li',
      description: 'Llámenos se yon lojisyèl liy asistans open source ki pwoteje moun ki rele ak volontè yo. Nòt chifre HPKE, 8 founisè telefoni, 5 kanal mesaj, ak achitekti zewo konesans — pou konvèsasyon sansib yo rete prive.',
      cta: 'Telechaje',
      ctaSecondary: 'Kòmanse',
    },
    features: {
      heading: 'Fèt pou repons a kriz',
      subtitle: 'Yon pwofondè ekstraòdinè de kapasite — chak desizyon pran pou aktivis, òganizatè, ak advèsè yo.',
      // TODO: translate sections
      sections: [],
    },
    screenshots: {
      heading: 'Gade li an aksyon',
      subtitle: 'Yon entèfas modèn epi responsiv ki fèt pou repons a kriz. Li mache sou òdinatè ak telefòn.',
    },
    security: {
      heading: 'Onèt sou sekirite',
      description: 'Nou pibliye egzakteman sa ki chifre, sa ki pa chifre, ak sa sèvè a ka wè. San dezòd. HPKE (RFC 9180) ranplase ECIES. Sekrè alavans pou chak nòt vle di konpwomèt yon kle pa ka revele nòt pase yo. Li modèl sekirite konplè a.',
      link: 'Li modèl sekirite a',
    },
    deploy: {
      heading: 'Pare pou deplwaye?',
      description: 'Llámenos fonksyone sou pwòp sèvè ou yo — Docker Compose pou yon sèl sèvè, Helm pou Kubernetes. Lanse yon liy asistans nan mwens pase inèdtan.',
      cta: 'Kòmanse',
      github: 'Wè sou GitHub',
    },
  },

  // TODO: translate features.sections for ko
  ko: {
    hero: {
      badge: '오픈 소스 · 종단간 암호화',
      title: '안전한 위기 핫라인',
      titleAccent: '도움이 필요한 사람들을 위해',
      description: 'Llámenos는 발신자와 자원봉사자를 보호하는 오픈 소스 핫라인 소프트웨어입니다. HPKE 암호화 메모, 8개 전화 제공업체, 5개 메시징 채널, 제로 지식 아키텍처 — 민감한 대화를 비공개로 유지합니다.',
      cta: '다운로드',
      ctaSecondary: '시작하기',
    },
    features: {
      heading: '위기 대응을 위해 구축',
      subtitle: '비범한 깊이의 기능 — 활동가, 조직자 및 그들의 적대자를 염두에 두고 내려진 모든 결정.',
      // TODO: translate sections
      sections: [],
    },
    screenshots: {
      heading: '실제 동작 확인',
      subtitle: '위기 대응을 위해 설계된 현대적이고 반응형인 인터페이스. 데스크톱과 모바일에서 작동합니다.',
    },
    security: {
      heading: '보안에 대해 솔직하게',
      description: '무엇이 암호화되고, 무엇이 되지 않으며, 서버가 무엇을 볼 수 있는지 정확히 공개합니다. 모호함 없이. HPKE(RFC 9180)가 ECIES를 대체했습니다. 메모별 전방 비밀성은 키가 유출되어도 이전 메모를 볼 수 없음을 의미합니다. 전체 보안 모델을 읽어보세요.',
      link: '보안 모델 읽기',
    },
    deploy: {
      heading: '배포할 준비가 되셨나요?',
      description: 'Llámenos는 자체 서버에서 실행됩니다 — 단일 서버용 Docker Compose, Kubernetes용 Helm. 한 시간 이내에 핫라인을 가동하세요.',
      cta: '시작하기',
      github: 'GitHub에서 보기',
    },
  },

  // TODO: translate features.sections for ru
  ru: {
    hero: {
      badge: 'Открытый код · Сквозное шифрование',
      title: 'Безопасная кризисная горячая линия',
      titleAccent: 'для тех, кому это нужно',
      description: 'Llámenos — программное обеспечение горячей линии с открытым исходным кодом. HPKE-шифрование заметок, 8 провайдеров телефонии, 5 каналов обмена сообщениями и архитектура нулевого знания — чтобы конфиденциальные разговоры оставались приватными.',
      cta: 'Скачать',
      ctaSecondary: 'Начать',
    },
    features: {
      heading: 'Создано для реагирования на кризисы',
      subtitle: 'Исключительная глубина возможностей — каждое решение принималось с учётом активистов, организаторов и их противников.',
      // TODO: translate sections
      sections: [],
    },
    screenshots: {
      heading: 'Посмотрите в действии',
      subtitle: 'Современный адаптивный интерфейс для реагирования на кризисы. Работает на компьютере и мобильных устройствах.',
    },
    security: {
      heading: 'Честно о безопасности',
      description: 'Мы публикуем точно, что зашифровано, что нет, и что видит сервер. Без двусмысленности. HPKE (RFC 9180) заменил ECIES. Прямая секретность для каждой заметки означает, что компрометация ключа не раскрывает прошлые заметки. Прочитайте полную модель безопасности.',
      link: 'Прочитать модель безопасности',
    },
    deploy: {
      heading: 'Готовы к развёртыванию?',
      description: 'Llámenos работает на ваших собственных серверах — Docker Compose для одного сервера, Helm для Kubernetes. Запустите горячую линию менее чем за час.',
      cta: 'Начать',
      github: 'Смотреть на GitHub',
    },
  },

  // TODO: translate features.sections for hi
  hi: {
    hero: {
      badge: 'ओपन सोर्स · एंड-टू-एंड एन्क्रिप्टेड',
      title: 'सुरक्षित संकट हॉटलाइन',
      titleAccent: 'उन लोगों के लिए जिन्हें इसकी ज़रूरत है',
      description: 'Llámenos एक ओपन-सोर्स हॉटलाइन सॉफ़्टवेयर है। HPKE एन्क्रिप्टेड नोट्स, 8 टेलीफ़ोनी प्रदाता, 5 मैसेजिंग चैनल, और ज़ीरो-नॉलेज आर्किटेक्चर — ताकि संवेदनशील बातचीत निजी बनी रहे।',
      cta: 'डाउनलोड',
      ctaSecondary: 'शुरू करें',
    },
    features: {
      heading: 'संकट प्रतिक्रिया के लिए निर्मित',
      subtitle: 'क्षमताओं की असाधारण गहराई — हर निर्णय कार्यकर्ताओं, आयोजकों और उनके विरोधियों को ध्यान में रखकर लिया गया।',
      // TODO: translate sections
      sections: [],
    },
    screenshots: {
      heading: 'इसे क्रिया में देखें',
      subtitle: 'संकट प्रतिक्रिया के लिए डिज़ाइन किया गया आधुनिक, रिस्पॉन्सिव इंटरफ़ेस। डेस्कटॉप और मोबाइल पर काम करता है।',
    },
    security: {
      heading: 'सुरक्षा के बारे में ईमानदार',
      description: 'हम सटीक रूप से प्रकाशित करते हैं कि क्या एन्क्रिप्टेड है, क्या नहीं है, और सर्वर क्या देख सकता है। बिना अस्पष्टता के। HPKE (RFC 9180) ने ECIES की जगह ली है। प्रति-नोट फॉरवर्ड सीक्रेसी का अर्थ है कि कुंजी से समझौता पिछले नोट्स को प्रकट नहीं करता। पूरा सुरक्षा मॉडल पढ़ें।',
      link: 'सुरक्षा मॉडल पढ़ें',
    },
    deploy: {
      heading: 'तैनात करने के लिए तैयार?',
      description: 'Llámenos आपके अपने सर्वर पर चलता है — सिंगल सर्वर के लिए Docker Compose, Kubernetes के लिए Helm। एक घंटे से कम में हॉटलाइन शुरू करें।',
      cta: 'शुरू करें',
      github: 'GitHub पर देखें',
    },
  },

  // TODO: translate features.sections for pt
  pt: {
    hero: {
      badge: 'Código aberto · Criptografia de ponta a ponta',
      title: 'Linha de crise segura',
      titleAccent: 'para quem precisa',
      description: 'O Llámenos é um software de linha de ajuda de código aberto. Notas criptografadas HPKE, 8 provedores de telefonia, 5 canais de mensagens e arquitetura de conhecimento zero — para que conversas sensíveis permaneçam privadas.',
      cta: 'Baixar',
      ctaSecondary: 'Começar',
    },
    features: {
      heading: 'Construído para resposta a crises',
      subtitle: 'Uma profundidade extraordinária de capacidades — cada decisão tomada pensando em ativistas, organizadores e seus adversários.',
      // TODO: translate sections
      sections: [],
    },
    screenshots: {
      heading: 'Veja em ação',
      subtitle: 'Uma interface moderna e responsiva projetada para resposta a crises. Funciona no desktop e no celular.',
    },
    security: {
      heading: 'Honestos sobre segurança',
      description: 'Publicamos exatamente o que está criptografado, o que não está e o que o servidor pode ver. Sem ambiguidade. HPKE (RFC 9180) substituiu o ECIES. O sigilo direto por nota significa que comprometer uma chave não revela notas anteriores. Leia o modelo de segurança completo.',
      link: 'Ler o modelo de segurança',
    },
    deploy: {
      heading: 'Pronto para implantar?',
      description: 'O Llámenos roda nos seus próprios servidores — Docker Compose para servidor único, Helm para Kubernetes. Coloque uma linha de ajuda em funcionamento em menos de uma hora.',
      cta: 'Começar',
      github: 'Ver no GitHub',
    },
  },

  // TODO: translate features.sections for de
  de: {
    hero: {
      badge: 'Open Source · Ende-zu-Ende-verschlüsselt',
      title: 'Sichere Krisenhotline',
      titleAccent: 'für die Menschen, die sie brauchen',
      description: 'Llámenos ist eine Open-Source-Hotline-Software. HPKE-verschlüsselte Notizen, 8 Telefonieanbieter, 5 Messaging-Kanäle und eine Zero-Knowledge-Architektur — damit sensible Gespräche privat bleiben.',
      cta: 'Herunterladen',
      ctaSecondary: 'Erste Schritte',
    },
    features: {
      heading: 'Für Krisenreaktion entwickelt',
      subtitle: 'Eine außergewöhnliche Tiefe der Fähigkeiten — jede Entscheidung mit Blick auf Aktivisten, Organisatoren und ihre Gegner getroffen.',
      // TODO: translate sections
      sections: [],
    },
    screenshots: {
      heading: 'In Aktion sehen',
      subtitle: 'Eine moderne, responsive Oberfläche für Krisenreaktion. Funktioniert auf Desktop und Mobilgeräten.',
    },
    security: {
      heading: 'Ehrlich über Sicherheit',
      description: 'Wir veröffentlichen genau, was verschlüsselt ist, was nicht und was der Server sehen kann. Ohne Verschleierung. HPKE (RFC 9180) ersetzt ECIES. Perfect Forward Secrecy pro Notiz bedeutet, dass ein kompromittierter Schlüssel vergangene Notizen nicht preisgibt. Lesen Sie das vollständige Sicherheitsmodell.',
      link: 'Sicherheitsmodell lesen',
    },
    deploy: {
      heading: 'Bereit zur Bereitstellung?',
      description: 'Llámenos läuft auf Ihren eigenen Servern — Docker Compose für Einzelserver, Helm für Kubernetes. Starten Sie eine Hotline in weniger als einer Stunde.',
      cta: 'Erste Schritte',
      github: 'Auf GitHub ansehen',
    },
  },
};
