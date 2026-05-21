---
title: "Configurar: SignalWire"
description: Guía paso a paso nuu ke configurar SignalWire nuu proveedor telefonía.
---

SignalWire iin alternativa rentable a Twilio nuu API compatible. Usa LaML (iin lenguaje marcado compatible TwiML), asi ke migrar entre Twilio ni SignalWire es sencillo.

## Requisitos previos

- Iin [cuenta SignalWire](https://signalwire.com/signup) (prueba gratuita disponible)
- Instancia Llámenos desplegada ni accesible vía URL pública

## 1. Crear iin cuenta SignalWire

Regístrese en [signalwire.com/signup](https://signalwire.com/signup). Nu registrarse, escogerá iin **Nombre Space** (ej., `myhotline`). URL Space será `myhotline.signalwire.com`. Anote yaa nombre — lo necesitará nuu configuración.

## 2. Comprar iin número teléfono

1. Nu Panel SignalWire, vaya a **Phone Numbers**
2. Clic **Buy a Phone Number**
3. Busque iin número nuu capacidad voz
4. Compre número

## 3. Obtener credenciales

1. Vaya a **API** nuu Panel SignalWire
2. Encuentre **Project ID** (yaa funciona nuu Account SID)
3. Cree nuevo **API Token** nuu no tiene uno — yaa funciona nuu Auth Token

## 4. Ke configurar webhooks

1. Vaya a **Phone Numbers** nuu panel
2. Clic número línea caliente
3. Debajo **Voice Settings**, establezca:
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Call status callback**: `https://your-domain.com/api/telephony/status` (POST)

## 5. Ke configurar nuu Llámenos

1. Inicie sesión nuu ña'a
2. Vaya a **Configuración** > **Proveedor Telefonía**
3. Seleccione **SignalWire** nuu desplegable proveedor
4. Ke ingrese:
   - **Account SID**: Project ID del paso 3
   - **Auth Token**: API Token del paso 3
   - **SignalWire Space**: nombre Space (solo nombre, no URL completa — ej., `myhotline`)
   - **Phone Number**: número comprado (formato E.164)
5. Clic **Guardar**

## 6. Probar configuración

Llame a número línea caliente. Debería escuchar menú selección idioma seguido por flujo llamada.

## Configuración WebRTC (opcional)

SignalWire WebRTC usa mismo patrón llave API nuu Twilio:

1. Nu Panel SignalWire, cree iin **API Key** debajo **API** > **Tokens**
2. Cree iin **LaML Application**:
   - Vaya a **LaML** > **LaML Applications**
   - Establezca Voice URL a `https://your-domain.com/api/telephony/webrtc-incoming`
   - Anote Application SID
3. Nu Llámenos, vaya a **Configuración** > **Proveedor Telefonía**
4. Active **WebRTC Calling**
5. Ke ingrese API Key SID, API Key Secret, ni Application SID
6. Clic **Guardar**

## Diferencias de Twilio

- **LaML vs TwiML**: SignalWire usa LaML, ke es funcionalmente idéntico a TwiML. Llámenos gestiona yaa automáticamente.
- **Space URL**: Llamadas API van a `{space}.signalwire.com` en lugar de `api.twilio.com`. Adaptador gestiona yaa vía nombre Space ke proporciona.
- **Precios**: SignalWire generalmente 30-40% más barato que Twilio nuu llamadas voz.
- **Paridad características**: Todas características Llámenos (grabación, transcripción, CAPTCHA, buzón voz) funcionan idénticamente nuu SignalWire.

## Ke kunche'e problemas

- **Errores "Space not found"**: Verifique doble nombre Space (solo subdominio, no URL completa).
- **Fallos webhook**: Asegure URL servidor sea públicamente accesible ni use HTTPS.
- **Problemas token API**: Tokens SignalWire pueden expirar. Cree nuevo token nuu obtiene errores autenticación.
