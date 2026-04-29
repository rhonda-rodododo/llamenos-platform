---
title: Documentation
description: Learn how to deploy, configure, and use Llamenos.
guidesHeading: Featured Links
guides:
  - title: Getting Started
    description: Prerequisites, installation, setup wizard, and your first deployment.
    href: /docs/deploy
  - title: Self-Hosting Overview
    description: Deploy on your own infrastructure with Docker Compose or Kubernetes.
    href: /docs/deploy/self-hosting
  - title: "Deploy: Docker Compose"
    description: Single-server self-hosted deployment with automatic HTTPS.
    href: /docs/deploy/docker
  - title: "Deploy: Kubernetes (Helm)"
    description: Deploy to Kubernetes with the official Helm chart.
    href: /docs/deploy/kubernetes
  - title: "Deploy: Co-op Cloud"
    description: Deploy as a standardized recipe for cooperative hosting collectives.
    href: /docs/deploy/coopcloud
  - title: Browse All Guides
    description: Searchable guide library — find guides by audience role or task type.
    href: /docs/guides
  - title: Telephony Providers
    description: Compare supported telephony providers and choose the best fit for your hotline.
    href: /docs/deploy/providers
  - title: Security Model
    description: Understand what's encrypted, what isn't, and the threat model.
    href: /security
---

## Architecture overview

Llamenos is a self-hosted single-page application (SPA) deployed via **Docker Compose** or **Kubernetes**. It supports voice calls, SMS, WhatsApp, and Signal — all routed to on-shift staff through a unified interface.

| Component | Technology |
|---|---|
| Frontend | Vite + React + TanStack Router |
| Backend | Bun + Hono + PostgreSQL |
| Blob Storage | RustFS (S3-compatible) |
| Identity Provider | Authentik (self-hosted OIDC) |
| Voice | Twilio, SignalWire, Vonage, Plivo, or Asterisk |
| Messaging | SMS, WhatsApp Business, Signal |
| Auth | JWT + multi-factor KEK + WebAuthn passkeys |
| Encryption | ECIES (secp256k1 + XChaCha20-Poly1305), 3 tiers |
| Transcription | Client-side Whisper (WASM) — audio never leaves browser |
| Real-time | Nostr relay (strfry) |
| i18n | i18next (13 languages) |

## Roles

| Role | Can see | Can do |
|---|---|---|
| **Caller** | Nothing (phone/SMS/WhatsApp/Signal) | Call or message the hotline |
| **Volunteer** | Own notes, assigned conversations | Answer calls, write notes, respond to messages |
| **Reporter** | Own reports only | Submit encrypted reports with file attachments |
| **Admin** | All notes, reports, conversations, audit logs | Manage volunteers, shifts, channels, bans, settings |
