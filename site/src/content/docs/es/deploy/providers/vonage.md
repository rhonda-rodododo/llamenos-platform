---
title: "Configurar Vonage"
description: Guia paso a paso para configurar Vonage como proveedor de telefonia.
---

Vonage (anteriormente Nexmo) ofrece una fuerte cobertura internacional y precios competitivos. Utiliza un modelo de API diferente al de Twilio -- las Aplicaciones de Vonage agrupan tu numero, webhooks y credenciales en un solo lugar.

## Requisitos previos

- Una [cuenta de Vonage](https://dashboard.nexmo.com/sign-up) (credito gratuito disponible)
- Tu instancia de Llamenos desplegada y accesible desde una URL publica

## 1. Crear una cuenta de Vonage

Registrate en el [Panel de API de Vonage](https://dashboard.nexmo.com/sign-up). Verifica tu cuenta y anota tu **API Key** y **API Secret** desde la pagina principal del panel.

## 2. Comprar un numero de telefono

1. Ve a **Numbers** > **Buy numbers** en el Panel de Vonage
2. Selecciona tu pais y elige un numero con capacidad de **Voz**
3. Compra el numero

## 3. Crear una Aplicacion de Vonage

Vonage agrupa la configuracion en "Aplicaciones":

1. Ve a **Applications** > **Create a new application**
2. Ingresa un nombre (por ejemplo, "Linea Llamenos")
3. En **Voice**, activalo y configura:
   - **Answer URL**: `https://tu-url-del-worker.com/telephony/incoming` (POST)
   - **Event URL**: `https://tu-url-del-worker.com/telephony/status` (POST)
4. Haz clic en **Generate new application**
5. Guarda el **Application ID** que se muestra en la pagina de confirmacion
6. Descarga el archivo de **clave privada** -- necesitaras su contenido para la configuracion

## 4. Vincular el numero de telefono

1. Ve a **Numbers** > **Your numbers**
2. Haz clic en el icono de engranaje junto a tu numero de linea
3. En **Voice**, selecciona la Aplicacion que creaste en el paso 3
4. Haz clic en **Save**

## 5. Configurar en Llamenos

1. Inicia sesion como administrador
2. Ve a **Configuracion** > **Proveedor de Telefonia**
3. Selecciona **Vonage** en el menu desplegable
4. Ingresa:
   - **API Key**: de la pagina principal del Panel de Vonage
   - **API Secret**: de la pagina principal del Panel de Vonage
   - **Application ID**: del paso 3
   - **Numero de Telefono**: el numero que compraste (formato E.164)
5. Haz clic en **Guardar**

## 6. Probar la configuracion

Llama a tu numero de linea. Deberia escucharse el menu de seleccion de idioma. Verifica que las llamadas se enruten a los voluntarios en turno.

## Configuracion de WebRTC (opcional)

Vonage WebRTC usa las credenciales de la Aplicacion que ya creaste:

1. En Llamenos, ve a **Configuracion** > **Proveedor de Telefonia**
2. Activa **Llamadas WebRTC**
3. Ingresa el contenido de la **clave privada** (el texto PEM completo del archivo que descargaste)
4. Haz clic en **Guardar**

El Application ID ya esta configurado. Vonage genera tokens JWT con RS256 usando la clave privada para la autenticacion del navegador.

## Notas especificas de Vonage

- **NCCO vs TwiML**: Vonage usa NCCO (Nexmo Call Control Objects) en formato JSON en lugar de marcado XML. El adaptador de Llamenos genera el formato correcto automaticamente.
- **Formato de Answer URL**: Vonage espera que la Answer URL devuelva JSON (NCCO), no XML. Esto es manejado por el adaptador.
- **Event URL**: Vonage envia eventos de llamada (timbrando, contestada, completada) a la Event URL como solicitudes POST en JSON.
- **Seguridad de la clave privada**: La clave privada se almacena cifrada. Nunca sale del servidor -- solo se usa para generar tokens JWT de corta duracion.

## Solucion de problemas

- **"Application not found"**: Verifica que el Application ID coincida exactamente. Puedes encontrarlo en **Applications** en el Panel de Vonage.
- **No llegan llamadas**: Asegurate de que el numero de telefono este vinculado a la Aplicacion correcta (paso 4).
- **Errores de clave privada**: Pega el contenido PEM completo incluyendo las lineas `-----BEGIN PRIVATE KEY-----` y `-----END PRIVATE KEY-----`.
- **Formato de numero internacional**: Vonage requiere formato E.164. Incluye el `+` y el codigo de pais.
