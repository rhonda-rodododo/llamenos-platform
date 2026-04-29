---
title: "Configurar WhatsApp"
description: Conecta WhatsApp Business a traves de la API Cloud de Meta para mensajeria cifrada.
---

Llamenos soporta mensajeria de WhatsApp Business a traves de la API Cloud de Meta (Graph API v21.0). WhatsApp permite mensajeria enriquecida con soporte para texto, imagenes, documentos, audio y mensajes interactivos.

## Requisitos previos

- Una [cuenta de Meta Business](https://business.facebook.com)
- Un numero de telefono de la API de WhatsApp Business
- Una aplicacion de desarrollador Meta con el producto WhatsApp habilitado

## Modos de integracion

Llamenos soporta dos modos de integracion con WhatsApp:

### Meta Directo (recomendado)

Conecta directamente a la API Cloud de Meta. Ofrece control total y todas las funcionalidades.

**Credenciales requeridas:**
- **Phone Number ID** — el ID de tu numero de telefono de WhatsApp Business
- **Business Account ID** — el ID de tu cuenta de Meta Business
- **Access Token** — un token de acceso de larga duracion de la API de Meta
- **Verify Token** — una cadena personalizada que eliges para la verificacion del webhook
- **App Secret** — el secreto de tu aplicacion Meta (para validacion de firma del webhook)

### Modo Twilio

Si ya usas Twilio para voz, puedes enrutar WhatsApp a traves de tu cuenta de Twilio. Configuracion mas simple, pero algunas funcionalidades pueden ser limitadas.

**Credenciales requeridas:**
- Tu Account SID de Twilio existente, Auth Token y un remitente de WhatsApp conectado a Twilio

## 1. Crear una aplicacion Meta

1. Ve a [developers.facebook.com](https://developers.facebook.com)
2. Crea una nueva aplicacion (tipo: Business)
3. Agrega el producto **WhatsApp**
4. En WhatsApp > Getting Started, anota tu **Phone Number ID** y **Business Account ID**
5. Genera un token de acceso permanente (Settings > Access Tokens)

## 2. Configurar el webhook

En el panel de desarrolladores de Meta:

1. Ve a WhatsApp > Configuration > Webhook
2. Establece la Callback URL en:
   ```
   https://tu-worker.tu-dominio.com/api/messaging/whatsapp/webhook
   ```
3. Establece el Verify Token con la misma cadena que ingresaras en la configuracion de admin de Llamenos
4. Suscribete al campo de webhook `messages`

Meta enviara una solicitud GET para verificar el webhook. Tu Worker respondera con el desafio si el token de verificacion coincide.

## 3. Habilitar WhatsApp en la configuracion de admin

Navega a **Configuracion de Admin > Canales de Mensajeria** (o usa el asistente de configuracion) y activa **WhatsApp**.

Selecciona el modo **Meta Directo** o **Twilio** e ingresa las credenciales requeridas.

Configura ajustes opcionales:
- **Mensaje de auto-respuesta** — enviado a contactos nuevos
- **Respuesta fuera de horario** — enviada fuera del horario de turnos

## 4. Probar

Envia un mensaje de WhatsApp a tu numero de telefono Business. La conversacion debera aparecer en la pestana de **Conversaciones**.

## Ventana de mensajeria de 24 horas

WhatsApp impone una ventana de mensajeria de 24 horas:
- Puedes responder a un usuario dentro de las 24 horas de su ultimo mensaje
- Despues de 24 horas, debes usar un **mensaje de plantilla** aprobado para reiniciar la conversacion
- Llamenos maneja esto automaticamente — si la ventana ha expirado, envia un mensaje de plantilla para reiniciar la conversacion

## Soporte de multimedia

WhatsApp soporta mensajes multimedia:
- **Imagenes** (JPEG, PNG)
- **Documentos** (PDF, Word, etc.)
- **Audio** (MP3, OGG)
- **Video** (MP4)
- **Ubicacion** compartida
- **Mensajes interactivos** con botones y listas

Los archivos adjuntos aparecen en linea en la vista de conversacion.

## Notas de seguridad

- WhatsApp usa cifrado de extremo a extremo entre el usuario y la infraestructura de Meta
- Meta puede tecnicamente acceder al contenido de los mensajes en sus servidores
- Los mensajes se almacenan en Llamenos despues de recibirse del webhook
- Las firmas de webhook se validan usando HMAC-SHA256 con tu app secret
- Para maxima privacidad, considera usar Signal en lugar de WhatsApp
