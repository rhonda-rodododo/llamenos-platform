---
title: "Configurar: Twilio"
description: Guía paso a paso nuu ke configurar Twilio nuu proveedor telefonía.
---

Twilio iin proveedor telefonía predeterminado nuu Llámenos ni más fácil nuu ke comenzar. Yaa guía recorre creación cuenta, configuración número teléfono, ni configuración webhook.

## Requisitos previos

- Iin [cuenta Twilio](https://www.twilio.com/try-twilio) (prueba gratuita funciona nuu pruebas)
- Instancia Llámenos desplegada ni accesible vía URL pública

## 1. Crear iin cuenta Twilio

Regístrese en [twilio.com/try-twilio](https://www.twilio.com/try-twilio). Verifique correo electrónico ni número teléfono. Twilio proporciona crédito prueba nuu pruebas.

## 2. Comprar iin número teléfono

1. Vaya a **Phone Numbers** > **Manage** > **Buy a number** nuu Consola Twilio
2. Busque iin número nuu capacidad **Voice** nuu código área deseado
3. Clic **Buy** ni confirme

Guarde yaa número — lo ingresará nuu configuración ña'a Llámenos.

## 3. Obtener Account SID ni Auth Token

1. Vaya a [panel consola Twilio](https://console.twilio.com)
2. Encuentre **Account SID** ni **Auth Token** nuu página principal
3. Clic icono ojo nuu revelar Auth Token

## 4. Ke configurar webhooks

Nu Consola Twilio, navegue a configuración número teléfono:

1. Vaya a **Phone Numbers** > **Manage** > **Active Numbers**
2. Clic número línea caliente
3. Debajo **Voice Configuration**, establezca:
   - **A call comes in**: Webhook, `https://your-domain.com/api/telephony/incoming`, HTTP POST
   - **Call status changes**: `https://your-domain.com/api/telephony/status`, HTTP POST

Reemplace `your-domain.com` nuu URL despliegue Llámenos real.

## 5. Ke configurar nuu Llámenos

1. Inicie sesión nuu ña'a
2. Vaya a **Configuración** > **Proveedor Telefonía**
3. Seleccione **Twilio** nuu desplegable proveedor
4. Ke ingrese:
   - **Account SID**: del paso 3
   - **Auth Token**: del paso 3
   - **Phone Number**: número comprado (formato E.164, ej., `+15551234567`)
5. Clic **Guardar**

## 6. Probar configuración

Llame a número línea caliente nuu iin teléfono. Debería escuchar menú selección idioma. Nu tiene voluntarios de turno, llamada sonará través.

## Configuración WebRTC (opcional)

Nu habilitar voluntarios a ke skaka llamadas nuu navegador en lugar de teléfono:

### Crear Iin API Key

1. Vaya a **Account** > **API keys & tokens** nuu Consola Twilio
2. Clic **Create API Key**
3. Escoja tipo llave **Standard**
4. Guarde **SID** ni **Secret** — secreto se muestra solo una vez

### Crear iin TwiML App

1. Vaya a **Voice** > **Manage** > **TwiML Apps**
2. Clic **Create new TwiML App**
3. Establezca **Voice Request URL** a `https://your-domain.com/api/telephony/webrtc-incoming`
4. Guarde ni anote **App SID**

### Habilitar nuu Llámenos

1. Vaya a **Configuración** > **Proveedor Telefonía**
2. Active **WebRTC Calling**
3. Ke ingrese:
   - **API Key SID**: del API key creado
   - **API Key Secret**: del API key creado
   - **TwiML App SID**: del TwiML App creado
4. Clic **Guardar**

Ver [Llamadas WebRTC Navegador](/docs/deploy/providers/webrtc) nuu configuración voluntario ni ke kunche'e problemas.

## Ke kunche'e problemas

- **Llamadas no llegan**: Verifique URL webhook es correcta ni servidor está desplegado. Verifique logs error Consola Twilio.
- **Errores "Invalid webhook"**: Asegure URL webhook usa HTTPS ni devuelve TwiML válido.
- **Limitaciones cuenta prueba**: Cuentas prueba solo pueden llamar números verificados. Actualice a cuenta pagada nuu uso producción.
- **Fallos validación webhook**: Asegure Auth Token nuu Llámenos coincida nuu Consola Twilio.
