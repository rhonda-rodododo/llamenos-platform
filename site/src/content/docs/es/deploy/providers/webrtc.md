---
title: Llamadas WebRTC en el Navegador
description: Habilita la atencion de llamadas en el navegador para voluntarios usando WebRTC.
---

WebRTC (Web Real-Time Communication) permite a los voluntarios contestar llamadas de la linea directamente en su navegador, sin necesidad de un telefono. Esto es util para voluntarios que prefieren no compartir su numero personal o que trabajan desde una computadora.

## Como funciona

1. El administrador habilita WebRTC en la configuracion del proveedor de telefonia
2. Los voluntarios configuran su preferencia de llamada a "Navegador" en su perfil
3. Cuando llega una llamada, la aplicacion Llamenos timbra en el navegador con una notificacion
4. El voluntario hace clic en "Contestar" y la llamada se conecta a traves del navegador usando su microfono

El audio de la llamada se enruta desde el proveedor de telefonia a traves de una conexion WebRTC al navegador del voluntario. La calidad de la llamada depende de la conexion a internet del voluntario.

## Requisitos previos

### Configuracion del administrador

- Un proveedor de telefonia soportado con WebRTC habilitado (Twilio, SignalWire, Vonage o Plivo)
- Credenciales WebRTC especificas del proveedor configuradas (consulta las guias de configuracion de cada proveedor)
- WebRTC activado en **Configuracion** > **Proveedor de Telefonia**

### Requisitos del voluntario

- Un navegador moderno (Chrome, Firefox, Edge o Safari 14.1+)
- Un microfono funcional
- Una conexion a internet estable (minimo 100 kbps de subida/bajada)
- Permisos de notificaciones del navegador concedidos

## Configuracion por proveedor

Cada proveedor de telefonia requiere credenciales diferentes para WebRTC:

### Twilio / SignalWire

1. Crea una **clave API** en la consola del proveedor
2. Crea una **aplicacion TwiML/LaML** con la URL de voz configurada como `https://tu-url-del-worker.com/telephony/webrtc-incoming`
3. En Llamenos, ingresa el API Key SID, API Key Secret y Application SID

### Vonage

1. Tu Aplicacion de Vonage ya incluye capacidad WebRTC
2. En Llamenos, pega la **clave privada** de tu Aplicacion (formato PEM)
3. El Application ID ya esta configurado desde la configuracion inicial

### Plivo

1. Crea un **Endpoint** en la Consola de Plivo en **Voice** > **Endpoints**
2. WebRTC usa tu Auth ID y Auth Token existentes
3. Habilita WebRTC en Llamenos -- no se necesitan credenciales adicionales

### Asterisk

Asterisk WebRTC requiere configuracion de SIP.js con transporte WebSocket. Es mas complejo que con los proveedores en la nube:

1. Habilita el transporte WebSocket en `http.conf` de Asterisk
2. Crea endpoints PJSIP para clientes WebRTC con DTLS-SRTP
3. Llamenos configura automaticamente el cliente SIP.js cuando se selecciona Asterisk

Consulta la [guia de configuracion de Asterisk](/docs/deploy/providers/asterisk) para los detalles completos.

## Configuracion de preferencia de llamada del voluntario

Los voluntarios configuran su preferencia de llamada en la aplicacion:

1. Inicia sesion en Llamenos
2. Ve a **Configuracion** (icono de engranaje)
3. En **Preferencias de Llamada**, selecciona **Navegador** en lugar de **Telefono**
4. Concede los permisos de microfono y notificaciones cuando se te solicite
5. Mantiene la pestana de Llamenos abierta durante tu turno

Cuando llegue una llamada, veras una notificacion del navegador y un indicador de timbre en la aplicacion. Haz clic en **Contestar** para conectar.

## Compatibilidad de navegadores

| Navegador | Escritorio | Movil | Notas |
|---|---|---|---|
| Chrome | Si | Si | Recomendado |
| Firefox | Si | Si | Soporte completo |
| Edge | Si | Si | Basado en Chromium, soporte completo |
| Safari | Si (14.1+) | Si (14.1+) | Requiere interaccion del usuario para iniciar el audio |
| Brave | Si | Limitado | Puede necesitar desactivar los escudos para el microfono |

## Consejos de calidad de audio

- Usa auriculares o audifonos para prevenir el eco
- Cierra otras aplicaciones que usen el microfono
- Usa una conexion a internet por cable cuando sea posible
- Desactiva extensiones del navegador que puedan interferir con WebRTC (extensiones de VPN, bloqueadores de anuncios con proteccion contra filtracion WebRTC)

## Solucion de problemas

### Sin audio

- **Verificar permisos del microfono**: Haz clic en el icono del candado en la barra de direcciones y asegurate de que el acceso al microfono este en "Permitir"
- **Probar tu microfono**: Usa la prueba de audio integrada en tu navegador o un sitio como [webcamtest.com](https://webcamtest.com)
- **Verificar la salida de audio**: Asegurate de que tus altavoces o auriculares esten seleccionados como dispositivo de salida

### Las llamadas no timbran en el navegador

- **Notificaciones bloqueadas**: Verifica que las notificaciones del navegador esten habilitadas para el sitio de Llamenos
- **Pestana no activa**: La pestana de Llamenos debe estar abierta (puede estar en segundo plano, pero la pestana debe existir)
- **Preferencia de llamada**: Verifica que tu preferencia de llamada este configurada en "Navegador" en Configuracion
- **WebRTC no configurado**: Pide a tu administrador que verifique que WebRTC este habilitado y las credenciales esten configuradas

### Problemas de firewall y NAT

WebRTC usa servidores STUN/TURN para atravesar firewalls y NAT. Si las llamadas se conectan pero no escuchas audio:

- **Firewalls corporativos**: Algunos firewalls bloquean el trafico UDP en puertos no estandar. Pide a tu equipo de TI que permita el trafico UDP en los puertos 3478 y 10000-60000
- **NAT simetrico**: Algunos routers usan NAT simetrico que puede impedir conexiones directas entre pares. Los servidores TURN del proveedor de telefonia deberian manejar esto automaticamente
- **Interferencia de VPN**: Las VPN pueden interferir con las conexiones WebRTC. Intenta desconectar tu VPN durante los turnos

### Eco o retroalimentacion

- Usa auriculares en lugar de altavoces
- Reduce la sensibilidad del microfono en la configuracion de audio de tu sistema operativo
- Habilita la cancelacion de eco en tu navegador (generalmente esta habilitada por defecto)
- Alejate de superficies duras y reflectantes
