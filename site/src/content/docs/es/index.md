---
title: Documentacion
description: Aprende a desplegar, configurar y usar Llamenos.
guidesHeading: Guías
guides:
  - title: Primeros Pasos
    description: Requisitos previos, instalacion, asistente de configuracion y tu primer despliegue.
    href: /docs/getting-started
  - title: Autoalojamiento
    description: Despliega en tu propia infraestructura con Docker Compose o Kubernetes.
    href: /docs/self-hosting
  - title: "Desplegar: Docker Compose"
    description: Despliegue autoalojado en un solo servidor con HTTPS automatico.
    href: /docs/deploy-docker
  - title: "Desplegar: Kubernetes (Helm)"
    description: Despliega en Kubernetes con el chart oficial de Helm.
    href: /docs/deploy-kubernetes
  - title: Guia de Administrador
    description: Gestiona voluntarios, turnos, canales, conversaciones, reportes, bloqueos y configuracion.
    href: /docs/admin-guide
  - title: Guia de Voluntario
    description: Inicia sesion, recibe llamadas, responde mensajes, escribe notas y usa la transcripcion.
    href: /docs/volunteer-guide
  - title: Guia de Reportero
    description: Envia reportes cifrados y da seguimiento a su estado.
    href: /docs/reporter-guide
  - title: Proveedores de Telefonia
    description: Compara los proveedores de telefonia soportados y elige el mejor para tu linea.
    href: /docs/telephony-providers
  - title: "Configurar SMS"
    description: Habilita la mensajeria SMS entrante y saliente a traves de tu proveedor de telefonia.
    href: /docs/setup-sms
  - title: "Configurar WhatsApp"
    description: Conecta WhatsApp Business a traves de la API Cloud de Meta.
    href: /docs/setup-whatsapp
  - title: "Configurar Signal"
    description: Configura el canal de Signal a traves del bridge signal-cli.
    href: /docs/setup-signal
  - title: "Configurar Twilio"
    description: Guia paso a paso para configurar Twilio como proveedor de telefonia.
    href: /docs/setup-twilio
  - title: "Configurar SignalWire"
    description: Guia paso a paso para configurar SignalWire como proveedor de telefonia.
    href: /docs/setup-signalwire
  - title: "Configurar Vonage"
    description: Guia paso a paso para configurar Vonage como proveedor de telefonia.
    href: /docs/setup-vonage
  - title: "Configurar Plivo"
    description: Guia paso a paso para configurar Plivo como proveedor de telefonia.
    href: /docs/setup-plivo
  - title: "Configurar Asterisk (Autoalojado)"
    description: Despliega Asterisk con el bridge ARI para maxima privacidad y control.
    href: /docs/setup-asterisk
  - title: Llamadas WebRTC en el Navegador
    description: Habilita la atencion de llamadas en el navegador para voluntarios usando WebRTC.
    href: /docs/webrtc-calling
  - title: Modelo de Seguridad
    description: Entiende que esta cifrado, que no lo esta y el modelo de amenazas.
    href: /security
---

## Arquitectura general

Llamenos es una aplicacion de pagina unica (SPA) que puede ejecutarse en **Cloudflare Workers** o en tu propia infraestructura via **Docker Compose / Kubernetes**. Soporta llamadas de voz, SMS, WhatsApp y Signal — todo enrutado a voluntarios en turno a traves de una interfaz unificada.

| Componente | Cloudflare | Autoalojado |
|---|---|---|
| Frontend | Vite + React + TanStack Router | Igual |
| Backend | Cloudflare Workers + 6 Durable Objects | Node.js + PostgreSQL |
| Almacenamiento | R2 | MinIO (compatible con S3) |
| Voz | Twilio, SignalWire, Vonage, Plivo o Asterisk | Igual |
| Mensajeria | SMS, WhatsApp Business, Signal | Igual |
| Autenticacion | Claves Nostr (BIP-340 Schnorr) + WebAuthn | Igual |
| Cifrado | ECIES (secp256k1 + XChaCha20-Poly1305) | Igual |
| Transcripcion | Workers AI (Whisper) | Contenedor faster-whisper |
| i18n | i18next (13 idiomas) | Igual |

## Roles

| Rol | Puede ver | Puede hacer |
|---|---|---|
| **Persona que llama** | Nada (telefono/SMS/WhatsApp/Signal) | Llamar o enviar mensajes a la linea |
| **Voluntario** | Sus propias notas, conversaciones asignadas | Contestar llamadas, escribir notas, responder mensajes |
| **Reportero** | Solo sus propios reportes | Enviar reportes cifrados con archivos adjuntos |
| **Administrador** | Todas las notas, reportes, conversaciones, registros de auditoria | Gestionar voluntarios, turnos, canales, bloqueos, configuracion |
