---
title: "Configurar Plivo"
description: Guia paso a paso para configurar Plivo como proveedor de telefonia.
---

Plivo es un proveedor de telefonia en la nube economico con una API sencilla. Utiliza control de llamadas basado en XML similar a TwiML, lo que hace que la integracion con Llamenos sea fluida.

## Requisitos previos

- Una [cuenta de Plivo](https://console.plivo.com/accounts/register/) (credito de prueba disponible)
- Tu instancia de Llamenos desplegada y accesible desde una URL publica

## 1. Crear una cuenta de Plivo

Registrate en [console.plivo.com](https://console.plivo.com/accounts/register/). Despues de la verificacion, puedes encontrar tu **Auth ID** y **Auth Token** en la pagina principal del panel.

## 2. Comprar un numero de telefono

1. Ve a **Phone Numbers** > **Buy Numbers** en la Consola de Plivo
2. Selecciona tu pais y busca numeros con capacidad de voz
3. Compra un numero

## 3. Crear una aplicacion XML

Plivo usa "Aplicaciones XML" para enrutar llamadas:

1. Ve a **Voice** > **XML Applications**
2. Haz clic en **Add New Application**
3. Configura:
   - **Application Name**: Linea Llamenos
   - **Answer URL**: `https://tu-url-del-worker.com/telephony/incoming` (POST)
   - **Hangup URL**: `https://tu-url-del-worker.com/telephony/status` (POST)
4. Guarda la aplicacion

## 4. Vincular el numero de telefono

1. Ve a **Phone Numbers** > **Your Numbers**
2. Haz clic en tu numero de linea
3. En **Voice**, selecciona la Aplicacion XML que creaste en el paso 3
4. Guarda

## 5. Configurar en Llamenos

1. Inicia sesion como administrador
2. Ve a **Configuracion** > **Proveedor de Telefonia**
3. Selecciona **Plivo** en el menu desplegable
4. Ingresa:
   - **Auth ID**: del panel de la Consola de Plivo
   - **Auth Token**: del panel de la Consola de Plivo
   - **Numero de Telefono**: el numero que compraste (formato E.164)
5. Haz clic en **Guardar**

## 6. Probar la configuracion

Llama a tu numero de linea. Deberia escucharse el menu de seleccion de idioma y ser enrutado a traves del flujo normal de llamada.

## Configuracion de WebRTC (opcional)

Plivo WebRTC usa el SDK de navegador con tus credenciales existentes:

1. Ve a **Voice** > **Endpoints** en la Consola de Plivo
2. Crea un nuevo endpoint (esto actua como la identidad del telefono en el navegador)
3. En Llamenos, ve a **Configuracion** > **Proveedor de Telefonia**
4. Activa **Llamadas WebRTC**
5. Haz clic en **Guardar**

El adaptador genera tokens HMAC de duracion limitada a partir de tu Auth ID y Auth Token para una autenticacion segura en el navegador.

## Notas especificas de Plivo

- **XML vs TwiML**: Plivo usa su propio formato XML para el control de llamadas, que es similar pero no identico a TwiML. El adaptador de Llamenos genera el XML de Plivo correcto automaticamente.
- **Answer URL vs Hangup URL**: Plivo separa el manejador de llamada inicial (Answer URL) del manejador de fin de llamada (Hangup URL), a diferencia de Twilio que usa un unico callback de estado.
- **Limites de frecuencia**: Plivo tiene limites de frecuencia en la API que varian segun el nivel de cuenta. Para lineas de alto volumen, contacta al soporte de Plivo para aumentar los limites.

## Solucion de problemas

- **"Auth ID invalid"**: El Auth ID no es tu correo electronico. Encuentralo en la pagina principal del panel de la Consola de Plivo.
- **Las llamadas no se enrutan**: Verifica que el numero de telefono este vinculado a la Aplicacion XML correcta.
- **Errores en la Answer URL**: Plivo espera respuestas XML validas. Revisa los registros de tu Worker para ver errores de respuesta.
- **Restricciones en llamadas salientes**: Las cuentas de prueba tienen limitaciones para llamadas salientes. Actualiza para uso en produccion.
