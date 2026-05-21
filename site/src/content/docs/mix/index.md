---
title: Tu'un Yaa
description: Kavi ke kunkaa va'a, ke konfigurar, ni ke kuu Llámenos.
guidesHeading: Tu'un Yaa
guides:
  - title: Kunta'an Ini
    description: Kunta'an tu'un, ke instalar, asistente de configuración, ni ke kunta'an yoo
    href: /docs/getting-started
  - title: Arquitectura
    description: Saa ka'vi kuña'a sistema — repositorios, flujo de datos, capas de cifrado, ni comunicación en tiempo real
    href: /docs/architecture
  - title: Saa Ñuu Yoo Ini
    description: Ke kunu'i nu iin servidor nuu ka̱'a Docker Compose a Kubernetes
    href: /docs/self-hosting
  - title: "Kunu'i: Docker Compose"
    description: Ke kunu'i nu iin servidor nuu Docker Compose ni HTTPS automático
    href: /docs/deploy-docker
  - title: "Kunu'i: Kubernetes (Helm)"
    description: Ke kunu'i nu Kubernetes nuu chart Helm oficial
    href: /docs/deploy-kubernetes
  - title: Tu'un Yaa Ña'a
    description: Ke kunche'e voluntarios, turnos, canales, lista de bloqueo, reportes, ni configuración
    href: /docs/admin-guide
  - title: Tu'un Yaa Voluntario
    description: Ke iniciar sesión, ke skaka llamadas, ke respondi mensajes, ke taji notas, ni ke ku'ni transcripción
    href: /docs/volunteer-guide
  - title: Tu'un Yaa Reportero
    description: Ke enviar reportes cifrados ni ke kunche'e estado
    href: /docs/reporter-guide
  - title: Tu'un Yaa Móvil
    description: Ke instalar ni ke configurar aplicación móvil Llámenos nu iOS ni Android
    href: /docs/mobile-guide
  - title: Proveedores de Telefonía
    description: Ke comparar proveedores de telefonía soportados ni ke kuni kuaiyo ka'an va'a
    href: /docs/telephony-providers
  - title: "Configurar: SMS"
    description: Ke habilitar mensajes SMS entrada/salida nuu proveedor telefonía
    href: /docs/setup-sms
  - title: "Configurar: WhatsApp"
    description: Ke conectar WhatsApp Business nuu Meta Cloud API
    href: /docs/setup-whatsapp
  - title: "Configurar: Signal"
    description: Ke configurar canal Signal nuu signal-cli bridge
    href: /docs/setup-signal
  - title: "Configurar: Twilio"
    description: Guía paso a paso ke configurar Twilio nuu proveedor telefonía
    href: /docs/setup-twilio
  - title: "Configurar: SignalWire"
    description: Guía paso a paso ke configurar SignalWire nuu proveedor telefonía
    href: /docs/setup-signalwire
  - title: "Configurar: Vonage"
    description: Guía paso a paso ke configurar Vonage nuu proveedor telefonía
    href: /docs/setup-vonage
  - title: "Configurar: Plivo"
    description: Guía paso a paso ke configurar Plivo nuu proveedor telefonía
    href: /docs/setup-plivo
  - title: "Configurar: Asterisk (Autoalojado)"
    description: Ke kunu'i Asterisk nuu ARI bridge nuu máxima privacidad ni control
    href: /docs/setup-asterisk
  - title: Llamadas WebRTC nu Navegador
    description: Ke habilitar ke skaka llamadas nu navegador nuu voluntarios nuu WebRTC
    href: /docs/webrtc-calling
  - title: Ke Kunche'e Problemas
    description: Soluciones nuu problemas comunes nuu despliegue, escritorio, móvil, telefonía, ni criptografía
    href: /docs/troubleshooting
  - title: Modelo de Seguridad
    description: Ke entender ke'ni cifrado, ke'ni no cifrado, ni modelo de amenazas
    href: /security
---

## Saa ka'vi kuña'a arquitectura

Llámenos iin aplicación de página única (SPA) ke ku'ni funcionar nu **Cloudflare Workers** a nu servidor nuu **Docker Compose / Kubernetes**. Soporta llamadas voz, SMS, WhatsApp, ni Signal — todo enrutado a voluntarios de turno nuu iin interfaz unificada.

| Componente | Cloudflare | Autoalojado |
|---|---|---|
| Frontend | Vite + React + TanStack Router | Saa |
| Backend | Cloudflare Workers + 6 Durable Objects | Node.js + PostgreSQL |
| Almacenamiento | R2 | RustFS (compatible S3) |
| Voz | Twilio, SignalWire, Vonage, Plivo, a Asterisk | Saa |
| Mensajería | SMS, WhatsApp Business, Signal | Saa |
| Autenticación | WebSocket keypairs (Schnorr BIP-340) + WebAuthn | Saa |
| Cifrado | ECIES (secp256k1 + XChaCha20-Poly1305) | Saa |
| Transcripción | Whisper lado cliente (WASM) | Whisper lado cliente (WASM) |
| i18n | i18next (13 idiomas) | Saa |

## Roles

| Rol | Ka'vi | Ka'ni |
|---|---|---|
| **Llamante** | Ndee'i (teléfono/SMS/WhatsApp/Signal) | Llamar a enviar mensaje a línea caliente |
| **Voluntario** | Notas propias, conversaciones asignadas | Ke skaka llamadas, ke taji notas, ke respondi mensajes |
| **Reportero** | Ña'a reportes propios | Ke enviar reportes cifrados nuu archivos adjuntos |
| **Ña'a** | Todas notas, reportes, conversaciones, logs auditoría | Ke kunche'e voluntarios, turnos, canales, bloqueos, configuración |
