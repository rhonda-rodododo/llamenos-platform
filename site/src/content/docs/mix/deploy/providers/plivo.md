---
title: "Configurar: Plivo"
description: Guía paso a paso nuu ke configurar Plivo nuu proveedor telefonía.
---

Plivo iin proveedor telefonía nube económico nuu API sencilla. Usa XML nuu control llamadas similar a TwiML, haciendo integración con Llámenos fluida.

## Requisitos previos

- Iin [cuenta Plivo](https://console.plivo.com/accounts/register/) (crédito prueba disponible)
- Instancia Llámenos desplegada ni accesible vía URL pública

## 1. Crear iin cuenta Plivo

Regístrese en [console.plivo.com](https://console.plivo.com/accounts/register/). Después verificación, encontrará **Auth ID** ni **Auth Token** nuu página principal panel.

## 2. Comprar iin número teléfono

1. Vaya a **Phone Numbers** > **Buy Numbers** nuu Consola Plivo
2. Seleccione país ni busque números nuu capacidad voz
3. Compre número

## 3. Crear iin Aplicación XML

Plivo usa "Aplicaciones XML" nuu enrutar llamadas:

1. Vaya a **Voice** > **XML Applications**
2. Clic **Add New Application**
3. Configure:
   - **Application Name**: Llamenos Hotline
   - **Answer URL**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Hangup URL**: `https://your-domain.com/api/telephony/status` (POST)
4. Guarde aplicación

## 4. Vincular número teléfono

1. Vaya a **Phone Numbers** > **Your Numbers**
2. Clic número línea caliente
3. Debajo **Voice**, seleccione Aplicación XML creada nuu paso 3
4. Guarde

## 5. Ke configurar nuu Llámenos

1. Inicie sesión nuu ña'a
2. Vaya a **Configuración** > **Proveedor Telefonía**
3. Seleccione **Plivo** nuu desplegable proveedor
4. Ke ingrese:
   - **Auth ID**: nuu panel consola Plivo
   - **Auth Token**: nuu panel consola Plivo
   - **Phone Number**: número comprado (formato E.164)
5. Clic **Guardar**

## 6. Probar configuración

Llame a número línea caliente. Debería escuchar menú selección idioma ni ser enrutado nuu flujo llamada normal.

## Configuración WebRTC (opcional)

Plivo WebRTC usa Browser SDK nuu credenciales existentes:

1. Vaya a **Voice** > **Endpoints** nuu Consola Plivo
2. Cree nuevo endpoint (actúa como identidad teléfono navegador)
3. Nu Llámenos, vaya a **Configuración** > **Proveedor Telefonía**
4. Active **WebRTC Calling**
5. Clic **Guardar**

Adaptador genera tokens HMAC de duración limitada desde Auth ID ni Auth Token nuu autenticación navegador segura.

## Notas específicas Plivo

- **XML vs TwiML**: Plivo usa formato XML propio nuu control llamadas, similar pero no idéntico a TwiML. Adaptador Llámenos genera XML Plivo correcto automáticamente.
- **Answer URL vs Hangup URL**: Plivo separa manejador llamada inicial (Answer URL) de manejador fin llamada (Hangup URL), a diferencia Twilio ke usa callback estado único.
- **Límites tasa**: Plivo tiene límites API tasa ke varían por nivel cuenta. Nuu líneas calientes alto volumen, contacte soporte Plivo nuu aumentar límites.

## Ke kunche'e problemas

- **"Auth ID inválido"**: Auth ID no es dirección correo. Encuéntrelo nuu página principal panel consola Plivo.
- **Llamadas no enrutan**: Verifique ke número teléfono esté vinculado a Aplicación XML correcta.
- **Errores Answer URL**: Plivo espera respuestas XML válidas. Verifique logs servidor nuu errores respuesta.
- **Restricciones llamadas salientes**: Cuentas prueba tienen limitaciones llamadas salientes. Actualice nuu uso producción.
