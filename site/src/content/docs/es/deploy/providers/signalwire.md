---
title: "Configurar SignalWire"
description: Guia paso a paso para configurar SignalWire como proveedor de telefonia.
---

SignalWire es una alternativa a Twilio mas economica y con una API compatible. Utiliza LaML (un lenguaje de marcado compatible con TwiML), por lo que migrar entre Twilio y SignalWire es sencillo.

## Requisitos previos

- Una [cuenta de SignalWire](https://signalwire.com/signup) (prueba gratuita disponible)
- Tu instancia de Llamenos desplegada y accesible desde una URL publica

## 1. Crear una cuenta de SignalWire

Registrate en [signalwire.com/signup](https://signalwire.com/signup). Durante el registro, elegiras un **nombre de Space** (por ejemplo, `milinea`). La URL de tu Space sera `milinea.signalwire.com`. Anota este nombre -- lo necesitaras en la configuracion.

## 2. Comprar un numero de telefono

1. En tu panel de SignalWire, ve a **Phone Numbers**
2. Haz clic en **Buy a Phone Number**
3. Busca un numero con capacidad de voz
4. Compra el numero

## 3. Obtener tus credenciales

1. Ve a **API** en el panel de SignalWire
2. Encuentra tu **Project ID** (este funciona como el Account SID)
3. Crea un nuevo **API Token** si no tienes uno -- este funciona como el Auth Token

## 4. Configurar los webhooks

1. Ve a **Phone Numbers** en el panel
2. Haz clic en tu numero de linea
3. En **Voice Settings**, configura:
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://tu-url-del-worker.com/telephony/incoming` (POST)
   - **Call status callback**: `https://tu-url-del-worker.com/telephony/status` (POST)

## 5. Configurar en Llamenos

1. Inicia sesion como administrador
2. Ve a **Configuracion** > **Proveedor de Telefonia**
3. Selecciona **SignalWire** en el menu desplegable
4. Ingresa:
   - **Account SID**: tu Project ID del paso 3
   - **Auth Token**: tu API Token del paso 3
   - **SignalWire Space**: el nombre de tu Space (solo el nombre, no la URL completa -- por ejemplo, `milinea`)
   - **Numero de Telefono**: el numero que compraste (formato E.164)
5. Haz clic en **Guardar**

## 6. Probar la configuracion

Llama a tu numero de linea. Deberia escucharse el menu de seleccion de idioma seguido del flujo de llamada.

## Configuracion de WebRTC (opcional)

SignalWire WebRTC usa el mismo patron de claves API que Twilio:

1. En tu panel de SignalWire, crea una **clave API** en **API** > **Tokens**
2. Crea una **aplicacion LaML**:
   - Ve a **LaML** > **LaML Applications**
   - Establece la URL de voz como `https://tu-url-del-worker.com/telephony/webrtc-incoming`
   - Anota el Application SID
3. En Llamenos, ve a **Configuracion** > **Proveedor de Telefonia**
4. Activa **Llamadas WebRTC**
5. Ingresa el API Key SID, API Key Secret y Application SID
6. Haz clic en **Guardar**

## Diferencias con Twilio

- **LaML vs TwiML**: SignalWire usa LaML, que es funcionalmente identico a TwiML. Llamenos lo maneja automaticamente.
- **URL del Space**: Las llamadas API van a `{space}.signalwire.com` en lugar de `api.twilio.com`. El adaptador lo gestiona mediante el nombre de Space que proporcionas.
- **Precios**: SignalWire es generalmente entre un 30-40% mas barato que Twilio para llamadas de voz.
- **Paridad de funcionalidades**: Todas las funciones de Llamenos (grabacion, transcripcion, CAPTCHA, buzon de voz) funcionan de forma identica con SignalWire.

## Solucion de problemas

- **Errores de "Space not found"**: Verifica el nombre del Space (solo el subdominio, no la URL completa).
- **Fallos en webhooks**: Asegurate de que la URL de tu Worker sea accesible publicamente y use HTTPS.
- **Problemas con el token API**: Los tokens de SignalWire pueden expirar. Crea un nuevo token si recibes errores de autenticacion.
