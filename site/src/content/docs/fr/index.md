---
title: Documentation
description: Apprenez a deployer, configurer et utiliser Llamenos.
guidesHeading: Guides
guides:
  - title: Premiers pas
    description: Prerequis, installation, configuration telephonique et premier deploiement.
    href: /docs/getting-started
  - title: Guide administrateur
    description: Gerez les benevoles, les equipes, les listes de blocage, les champs personnalises et les parametres.
    href: /docs/admin-guide
  - title: Guide du benevole
    description: Connectez-vous, recevez des appels, redigez des notes et utilisez la transcription.
    href: /docs/volunteer-guide
  - title: Fournisseurs de telephonie
    description: Comparez les fournisseurs de telephonie pris en charge et choisissez celui qui convient le mieux a votre ligne.
    href: /docs/telephony-providers
  - title: "Configuration : Twilio"
    description: Guide etape par etape pour configurer Twilio comme fournisseur de telephonie.
    href: /docs/setup-twilio
  - title: "Configuration : SignalWire"
    description: Guide etape par etape pour configurer SignalWire comme fournisseur de telephonie.
    href: /docs/setup-signalwire
  - title: "Configuration : Vonage"
    description: Guide etape par etape pour configurer Vonage comme fournisseur de telephonie.
    href: /docs/setup-vonage
  - title: "Configuration : Plivo"
    description: Guide etape par etape pour configurer Plivo comme fournisseur de telephonie.
    href: /docs/setup-plivo
  - title: "Configuration : Asterisk (auto-heberge)"
    description: Deployez Asterisk avec le bridge ARI pour un maximum de confidentialite et de controle.
    href: /docs/setup-asterisk
  - title: Appels WebRTC dans le navigateur
    description: Activez la prise d'appels dans le navigateur pour les benevoles via WebRTC.
    href: /docs/webrtc-calling
  - title: Modele de securite
    description: Comprenez ce qui est chiffre, ce qui ne l'est pas et le modele de menaces.
    href: /security
---

## Vue d'ensemble de l'architecture

Llamenos est une application monopage (SPA) reposant sur Cloudflare Workers et Durable Objects. Il n'y a pas de serveurs traditionnels a gerer.

| Composant | Technologie |
|---|---|
| Frontend | Vite + React + TanStack Router |
| Backend | Cloudflare Workers + Durable Objects |
| Telephonie | Twilio, SignalWire, Vonage, Plivo ou Asterisk (via l'interface TelephonyAdapter) |
| Authentification | Cles Nostr (BIP-340 Schnorr) + WebAuthn |
| Chiffrement | ECIES (secp256k1 + XChaCha20-Poly1305) |
| Transcription | Whisper cote client (WASM) |
| i18n | i18next (12+ langues) |

## Roles

| Role | Peut voir | Peut faire |
|---|---|---|
| **Appelant** | Rien (telephone GSM) | Appeler le numero de la ligne |
| **Benevole** | Ses propres notes uniquement | Repondre aux appels, rediger des notes pendant son equipe |
| **Administrateur** | Toutes les notes, journaux d'audit, donnees d'appels | Gerer les benevoles, les equipes, les blocages, les parametres |
