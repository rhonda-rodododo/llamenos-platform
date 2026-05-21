---
title: "Configurar: Vonage"
description: Guía paso a paso nuu ke configurar Vonage nuu proveedor telefonía.
---

Vonage (anteriormente Nexmo) ofrece fuerte cobertura internacional ni precios competitivos. Usa iin modelo API diferente a Twilio — Aplicaciones Vonage agrupan número, webhooks, ni credenciales.

## Requisitos previos

- Iin [cuenta Vonage](https://dashboard.nexmo.com/sign-up) (crédito gratuito disponible)
- Instancia Llámenos desplegada ni accesible vía URL pública

## 1. Crear iin cuenta Vonage

Regístrese en [Panel API Vonage](https://dashboard.nexmo.com/sign-up). Verifique cuenta ni anote **API Key** ni **API Secret** nuu página inicio panel.

## 2. Comprar iin número teléfono

1. Vaya a **Numbers** > **Buy numbers** nuu Panel Vonage
2. Seleccione país ni escoja iin número nuu capacidad **Voice**
3. Compre número

## 3. Crear iin Aplicación Vonage

Vonage agrupa configuración en "Aplicaciones":

1. Vaya a **Applications** > **Create a new application**
2. Ke ingrese iin nombre (ej., "Llamenos Hotline")
3. Debajo **Voice**, actívelo ni establezca:
   - **Answer URL**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Event URL**: `https://your-domain.com/api/telephony/status` (POST)
4. Clic **Generate new application**
5. Guarde **Application ID** mostrado nuu página confirmación
6. Descargue archivo **private key** — necesitará contenido nuu configuración

## 4. Vincular número teléfono

1. Vaya a **Numbers** > **Your numbers**
2. Clic icono engranaje junto a número línea caliente
3. Debajo **Voice**, seleccione Aplicación creada nuu paso 3
4. Clic **Guardar**

## 5. Ke configurar nuu Llámenos

1. Inicie sesión nuu ña'a
2. Vaya a **Configuración** > **Proveedor Telefonía**
3. Seleccione **Vonage** nuu desplegable proveedor
4. Ke ingrese:
   - **API Key**: nuu página inicio Panel Vonage
   - **API Secret**: nuu página inicio Panel Vonage
   - **Application ID**: del paso 3
   - **Phone Number**: número comprado (formato E.164)
5. Clic **Guardar**

## 6. Probar configuración

Llame a número línea caliente. Debería escuchar menú selección idioma. Verifique ke llamadas se enrutan a voluntarios de turno.

## Configuración WebRTC (opcional)

Vonage WebRTC usa credenciales Aplicación ya creadas:

1. Nu Llámenos, vaya a **Configuración** > **Proveedor Telefonía**
2. Active **WebRTC Calling**
3. Ke pegue contenido **Private Key** (texto PEM completo del archivo descargado)
4. Clic **Guardar**

Application ID ya está configurado. Vonage genera JWT RS256 usando llave privada nuu autenticación navegador.

## Notas específicas Vonage

- **NCCO vs TwiML**: Vonage usa NCCO (Nexmo Call Control Objects) nuu formato JSON en lugar de marcado XML. Adaptador Llámenos genera formato correcto automáticamente.
- **Formato Answer URL**: Vonage espera ke answer URL devuelva JSON (NCCO), no XML. Yaa se gestiona por adaptador.
- **Event URL**: Vonage envía eventos llamada (timbrando, respondida, completada) a event URL nuu solicitudes POST JSON.
- **Seguridad llave privada**: Llave privada se almacena cifrada. Nunca sale servidor — solo se usa nuu generar tokens JWT corta duración.

## Ke kunche'e problemas

- **"Application not found"**: Verifique Application ID coincida exactamente. Puede encontrarlo debajo **Applications** nuu Panel Vonage.
- **No hay llamadas entrantes**: Asegure número teléfono esté vinculado a Aplicación correcta (paso 4).
- **Errores llave privada**: Pegue contenido PEM completo incluyendo líneas `-----BEGIN PRIVATE KEY-----` ni `-----END PRIVATE KEY-----`.
- **Formato números internacionales**: Vonage requiere formato E.164. Incluya `+` ni código país.
