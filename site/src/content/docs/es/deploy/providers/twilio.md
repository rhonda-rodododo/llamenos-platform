---
title: "Configurar Twilio"
description: Guia paso a paso para configurar Twilio como proveedor de telefonia.
---

Twilio es el proveedor de telefonia predeterminado de Llamenos y el mas facil para comenzar. Esta guia te lleva paso a paso por la creacion de cuenta, la configuracion del numero y los webhooks.

## Requisitos previos

- Una [cuenta de Twilio](https://www.twilio.com/try-twilio) (la prueba gratuita funciona para testing)
- Tu instancia de Llamenos desplegada y accesible desde una URL publica

## 1. Crear una cuenta de Twilio

Registrate en [twilio.com/try-twilio](https://www.twilio.com/try-twilio). Verifica tu correo electronico y numero de telefono. Twilio ofrece credito de prueba para testing.

## 2. Comprar un numero de telefono

1. Ve a **Phone Numbers** > **Manage** > **Buy a number** en la Consola de Twilio
2. Busca un numero con capacidad de **Voz** en el codigo de area deseado
3. Haz clic en **Buy** y confirma

Guarda este numero -- lo ingresaras en la configuracion de administrador de Llamenos.

## 3. Obtener tu Account SID y Auth Token

1. Ve al [panel principal de la Consola de Twilio](https://console.twilio.com)
2. Encuentra tu **Account SID** y **Auth Token** en la pagina principal
3. Haz clic en el icono del ojo para revelar el Auth Token

## 4. Configurar los webhooks

En la Consola de Twilio, navega a la configuracion de tu numero de telefono:

1. Ve a **Phone Numbers** > **Manage** > **Active Numbers**
2. Haz clic en tu numero de linea
3. En **Voice Configuration**, configura:
   - **A call comes in**: Webhook, `https://tu-url-del-worker.com/telephony/incoming`, HTTP POST
   - **Call status changes**: `https://tu-url-del-worker.com/telephony/status`, HTTP POST

Reemplaza `tu-url-del-worker.com` con la URL real de tu Cloudflare Worker.

## 5. Configurar en Llamenos

1. Inicia sesion como administrador
2. Ve a **Configuracion** > **Proveedor de Telefonia**
3. Selecciona **Twilio** en el menu desplegable de proveedores
4. Ingresa:
   - **Account SID**: del paso 3
   - **Auth Token**: del paso 3
   - **Numero de Telefono**: el numero que compraste (formato E.164, por ejemplo, `+15551234567`)
5. Haz clic en **Guardar**

## 6. Probar la configuracion

Llama a tu numero de linea desde un telefono. Deberia escucharse el menu de seleccion de idioma. Si tienes voluntarios en turno, la llamada se enrutara a ellos.

## Configuracion de WebRTC (opcional)

Para permitir que los voluntarios contesten llamadas en el navegador en lugar de su telefono:

### Crear una clave API

1. Ve a **Account** > **API keys & tokens** en la Consola de Twilio
2. Haz clic en **Create API Key**
3. Elige el tipo de clave **Standard**
4. Guarda el **SID** y el **Secret** -- el secreto solo se muestra una vez

### Crear una aplicacion TwiML

1. Ve a **Voice** > **Manage** > **TwiML Apps**
2. Haz clic en **Create new TwiML App**
3. Establece la **Voice Request URL** como `https://tu-url-del-worker.com/telephony/webrtc-incoming`
4. Guarda y anota el **App SID**

### Habilitar en Llamenos

1. Ve a **Configuracion** > **Proveedor de Telefonia**
2. Activa **Llamadas WebRTC**
3. Ingresa:
   - **API Key SID**: de la clave API que creaste
   - **API Key Secret**: de la clave API que creaste
   - **TwiML App SID**: de la aplicacion TwiML que creaste
4. Haz clic en **Guardar**

Consulta [Llamadas WebRTC en el Navegador](/docs/deploy/providers/webrtc) para la configuracion de voluntarios y solucion de problemas.

## Solucion de problemas

- **Las llamadas no llegan**: Verifica que la URL del webhook sea correcta y que tu Worker este desplegado. Revisa los registros de errores en la Consola de Twilio.
- **Errores de "Invalid webhook"**: Asegurate de que la URL del webhook use HTTPS y devuelva TwiML valido.
- **Limitaciones de cuenta de prueba**: Las cuentas de prueba solo pueden llamar a numeros verificados. Actualiza a una cuenta de pago para uso en produccion.
- **Fallos en la validacion del webhook**: Asegurate de que el Auth Token en Llamenos coincida con el de la Consola de Twilio.
