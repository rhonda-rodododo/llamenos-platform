---
title: Primeros Pasos
description: Despliega tu propia linea de Llamenos en menos de una hora.
---

Despliega tu propia linea de Llamenos en menos de una hora. Necesitaras una cuenta de Cloudflare, al menos un canal de comunicacion (voz, SMS, WhatsApp o Signal) y una maquina con Bun instalado.

## Requisitos previos

- [Bun](https://bun.sh) v1.0 o superior (entorno de ejecucion y gestor de paquetes)
- Una cuenta de [Cloudflare](https://www.cloudflare.com) (el nivel gratuito funciona para desarrollo)
- Al menos un canal de comunicacion:
  - **Voz**: [Twilio](https://www.twilio.com) es el mas facil para empezar, pero tambien se soporta [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo) y [Asterisk autoalojado](/docs/deploy/providers/asterisk). Consulta la [comparativa de proveedores](/docs/deploy/providers).
  - **SMS**: Incluido con Twilio, SignalWire, Vonage o Plivo — consulta [Configurar SMS](/docs/deploy/providers/sms).
  - **WhatsApp**: Requiere una cuenta de [Meta Business](https://business.facebook.com) — consulta [Configurar WhatsApp](/docs/deploy/providers/whatsapp).
  - **Signal**: Requiere un bridge [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) autoalojado — consulta [Configurar Signal](/docs/deploy/providers/signal).
- Git

## 1. Clonar e instalar

```bash
git clone https://github.com/rhonda-rodododo/llamenos.git
cd llamenos
bun install
```

## 2. Generar el par de claves del administrador

Genera un par de claves Nostr para la cuenta de administrador. Esto produce una clave secreta (nsec) y una clave publica (npub/hex).

```bash
bun run bootstrap-admin
```

Guarda el `nsec` de forma segura: es tu credencial de inicio de sesion como administrador. Necesitaras la clave publica en formato hex para el siguiente paso.

## 3. Configurar secretos

Crea un archivo `.dev.vars` en la raiz del proyecto para desarrollo local. Como minimo necesitas la clave publica del administrador. Las credenciales de Twilio son opcionales si planeas configurar los canales a traves del asistente de configuracion.

```bash
# .dev.vars
ADMIN_PUBKEY=tu_clave_publica_hex_del_paso_2
ENVIRONMENT=development

# Proveedor de voz (opcional — se puede configurar via interfaz de admin)
TWILIO_ACCOUNT_SID=tu_twilio_account_sid
TWILIO_AUTH_TOKEN=tu_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# WhatsApp (opcional — se puede configurar via interfaz de admin)
# WHATSAPP_ACCESS_TOKEN=tu_token_de_acceso_meta
# WHATSAPP_VERIFY_TOKEN=tu_token_de_verificacion
# WHATSAPP_PHONE_NUMBER_ID=tu_id_de_numero
```

Para produccion, configura estos como secretos de Wrangler:

```bash
bunx wrangler secret put ADMIN_PUBKEY

# Si usas Twilio como proveedor de voz por defecto via variables de entorno:
bunx wrangler secret put TWILIO_ACCOUNT_SID
bunx wrangler secret put TWILIO_AUTH_TOKEN
bunx wrangler secret put TWILIO_PHONE_NUMBER

# Si usas WhatsApp via variables de entorno:
bunx wrangler secret put WHATSAPP_ACCESS_TOKEN
bunx wrangler secret put WHATSAPP_VERIFY_TOKEN
bunx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
```

> **Nota**: Puedes configurar todos los proveedores y canales a traves de la interfaz de Configuracion del administrador o el asistente de configuracion en lugar de variables de entorno. Las variables de entorno sirven como respaldo para voz (solo Twilio). Para proveedores que no sean Twilio, SMS, WhatsApp y Signal, usa la interfaz de administracion. Consulta la [guia de configuracion de tu proveedor](/docs/deploy/providers).

## 4. Configurar los webhooks

Configura tus proveedores para enviar webhooks a tu Worker. Las URLs dependen de los canales que habilites:

**Voz** (todos los proveedores):
- **Llamada entrante**: `https://tu-worker.tu-dominio.com/telephony/incoming` (POST)
- **Callback de estado**: `https://tu-worker.tu-dominio.com/telephony/status` (POST)

**SMS** (si esta habilitado):
- **SMS entrante**: `https://tu-worker.tu-dominio.com/api/messaging/sms/webhook` (POST)

**WhatsApp** (si esta habilitado):
- **Webhook**: `https://tu-worker.tu-dominio.com/api/messaging/whatsapp/webhook` (GET para verificacion, POST para mensajes)

**Signal** (si usas el bridge):
- Configura el bridge signal-cli para reenviar a: `https://tu-worker.tu-dominio.com/api/messaging/signal/webhook`

Para configuracion especifica: [Twilio](/docs/deploy/providers/twilio), [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo), [Asterisk](/docs/deploy/providers/asterisk), [SMS](/docs/deploy/providers/sms), [WhatsApp](/docs/deploy/providers/whatsapp), [Signal](/docs/deploy/providers/signal).

Para desarrollo local, necesitaras un tunel (como Cloudflare Tunnel o ngrok) para exponer tu Worker local a tus proveedores.

## 5. Ejecutar localmente

Inicia el servidor de desarrollo del Worker (backend + frontend):

```bash
# Construir los assets del frontend primero
bun run build

# Iniciar el servidor de desarrollo del Worker
bun run dev:worker
```

La aplicacion estara disponible en `http://localhost:8787`. Inicia sesion con el nsec de administrador del paso 2.

### Asistente de configuracion del primer inicio

En tu primer inicio de sesion como administrador, la aplicacion te redirigira al **asistente de configuracion**. Este flujo guiado te ayuda a:

1. **Nombrar tu linea** — establece el nombre para mostrar
2. **Elegir canales** — habilita Voz, SMS, WhatsApp, Signal y/o Reportes
3. **Configurar proveedores** — ingresa las credenciales de cada canal habilitado
4. **Revisar y finalizar** — el asistente marca la configuracion como completada

Puedes reconfigurar todos estos ajustes despues desde **Configuracion del administrador**.

## 6. Desplegar en Cloudflare

```bash
bun run deploy
```

Esto construye el frontend y despliega el Worker con Durable Objects en Cloudflare. Despues de desplegar, actualiza las URLs de webhook de tu proveedor de telefonia para que apunten a la URL del Worker en produccion.

## Siguientes pasos

- [Guia de Administrador](/es/docs/admin-guide) — agrega voluntarios, crea turnos, configura canales y ajustes
- [Guia de Voluntario](/es/docs/volunteer-guide) — comparte con tus voluntarios
- [Guia de Reportero](/es/docs/reporter-guide) — configura el rol de reportero para envio de reportes cifrados
- [Configurar SMS](/es/docs/deploy/providers/sms) — habilita la mensajeria SMS
- [Configurar WhatsApp](/es/docs/deploy/providers/whatsapp) — conecta WhatsApp Business
- [Configurar Signal](/es/docs/deploy/providers/signal) — configura el canal de Signal
- [Proveedores de Telefonia](/es/docs/deploy/providers) — compara proveedores de voz y cambia de Twilio si lo necesitas
- [Modelo de Seguridad](/es/security) — entiende el cifrado y el modelo de amenazas
