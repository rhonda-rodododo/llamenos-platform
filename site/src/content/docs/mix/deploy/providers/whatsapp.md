---
title: "Configurar: WhatsApp"
description: Conectar WhatsApp Business vía Meta Cloud API nuu mensajería cifrada.
---

Llámenos soporta mensajería WhatsApp Business vía Meta Cloud API (Graph API v21.0). WhatsApp permite mensajería rica nuu soporte nuu texto, imágenes, documentos, audio, ni mensajes interactivos.

## Requisitos previos

- Iin [cuenta Meta Business](https://business.facebook.com)
- Iin número teléfono WhatsApp Business API
- Iin aplicación desarrollador Meta nuu producto WhatsApp habilitado

## Modos integración

Llámenos soporta dos modos integración WhatsApp:

### Meta Directo (recomendado)

Conecte directamente a Meta Cloud API. Ofrece control completo ni todas características.

**Credenciales requeridas:**
- **Phone Number ID** — ID número teléfono WhatsApp Business
- **Business Account ID** — ID cuenta Meta Business
- **Access Token** — token acceso larga duración Meta API
- **Verify Token** — cadena personalizada ke escoge nuu verificación webhook
- **App Secret** — secreto aplicación Meta (nuu validación firma webhook)

### Modo Twilio

Si ya usa Twilio nuu voz, puede enrutar WhatsApp vía cuenta Twilio. Configuración más simple, pero algunas características pueden estar limitadas.

**Credenciales requeridas:**
- Twilio Account SID, Auth Token, ni remitente WhatsApp conectado Twilio existentes

## 1. Crear aplicación Meta

1. Vaya a [developers.facebook.com](https://developers.facebook.com)
2. Cree nueva aplicación (tipo: Business)
3. Añada producto **WhatsApp**
4. Nu WhatsApp > Getting Started, anote **Phone Number ID** ni **Business Account ID**
5. Genere token acceso permanente (Settings > Access Tokens)

## 2. Configurar webhook

Nu panel desarrollador Meta:

1. Vaya a WhatsApp > Configuration > Webhook
2. Establezca Callback URL a:
   ```
   https://your-domain.com/api/messaging/whatsapp/webhook
   ```
3. Establezca Verify Token a misma cadena ke ingresará nuu configuración ña'a Llámenos
4. Suscriba a campo webhook `messages`

Meta enviará solicitud GET nuu verificar webhook. Servidor responderá nuu desafío si verify token coincide.

## 3. Habilitar WhatsApp nuu configuración ña'a

Navegue a **Configuración Ña'a > Canales Mensajería** (o use asistente configuración) ni active **WhatsApp**.

Seleccione **Meta Directo** o **Twilio** ni ingrese credenciales requeridas.

Configure ajustes opcionales:
- **Mensaje respuesta automática** — enviado a contactos primera vez
- **Respuesta fuera horario** — enviado fuera horas turno

## 4. Probar

Envíe mensaje WhatsApp a número Business. Conversación debería aparecer nuu pestaña **Conversaciones**.

## Ventana mensajería 24 horas

WhatsApp impone ventana mensajería 24 horas:
- Puede responder a usuario dentro 24 horas último mensaje
- Después 24 horas, debe usar mensaje **plantilla** aprobado nuu reiniciar conversación
- Llámenos maneja yaa automáticamente — si ventana expiró, envía mensaje plantilla nuu reiniciar conversación

## Soporte media

WhatsApp soporta mensajes media ricos:
- **Imágenes** (JPEG, PNG)
- **Documentos** (PDF, Word, etc.)
- **Audio** (MP3, OGG)
- **Video** (MP4)
- **Ubicación** compartida
- **Mensajes interactivos** botones ni listas

Archivos adjuntos media aparecen inline nuu vista conversación.

## Notas seguridad

- WhatsApp usa cifrado extremo a extremo entre usuario ni infraestructura Meta
- Meta técnicamente puede acceder contenido mensaje nuu servidores
- Mensajes se cifran nuu recepción ni almacenan nuu base datos
- Firmas webhook se validan usando HMAC-SHA256 nuu app secret
- Nuu máxima privacidad, considere usar Signal en lugar WhatsApp
