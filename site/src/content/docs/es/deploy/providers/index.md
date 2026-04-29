---
title: Proveedores de Telefonia
description: Compara los proveedores de telefonia soportados y elige el mejor para tu linea de ayuda.
---

Llamenos soporta multiples proveedores de telefonia a traves de su interfaz **TelephonyAdapter**. Puedes cambiar de proveedor en cualquier momento desde la configuracion de administrador sin modificar el codigo de la aplicacion.

## Proveedores soportados

| Proveedor | Tipo | Modelo de Precios | Soporte WebRTC | Dificultad | Ideal Para |
|---|---|---|---|---|---|
| **Twilio** | Nube | Por minuto | Si | Facil | Comenzar rapidamente |
| **SignalWire** | Nube | Por minuto (mas barato) | Si | Facil | Organizaciones con presupuesto limitado |
| **Vonage** | Nube | Por minuto | Si | Medio | Cobertura internacional |
| **Plivo** | Nube | Por minuto | Si | Medio | Opcion economica en la nube |
| **Asterisk** | Autoalojado | Solo costo del trunk SIP | Si (SIP.js) | Dificil | Maxima privacidad, despliegue a escala |

## Comparacion de precios

Costos aproximados por minuto para llamadas de voz en EE.UU. (los precios varian segun la region y el volumen):

| Proveedor | Entrante | Saliente | Numero de Telefono | Nivel Gratuito |
|---|---|---|---|---|
| Twilio | $0.0085 | $0.014 | $1.15/mes | Credito de prueba |
| SignalWire | $0.005 | $0.009 | $1.00/mes | Credito de prueba |
| Vonage | $0.0049 | $0.0139 | $1.00/mes | Credito gratuito |
| Plivo | $0.0055 | $0.010 | $0.80/mes | Credito de prueba |
| Asterisk | Tarifa del trunk SIP | Tarifa del trunk SIP | Del proveedor SIP | N/A |

Todos los proveedores en la nube facturan por minuto con granularidad por segundo. Los costos de Asterisk dependen de tu proveedor de trunk SIP y el alojamiento del servidor.

## Matriz de funcionalidades

| Funcionalidad | Twilio | SignalWire | Vonage | Plivo | Asterisk |
|---|---|---|---|---|---|
| Grabacion de llamadas | Si | Si | Si | Si | Si |
| Transcripcion en vivo | Si | Si | Si | Si | Si (via bridge) |
| CAPTCHA de voz | Si | Si | Si | Si | Si |
| Buzon de voz | Si | Si | Si | Si | Si |
| Llamadas WebRTC en navegador | Si | Si | Si | Si | Si (SIP.js) |
| Validacion de webhooks | Si | Si | Si | Si | Personalizada (HMAC) |
| Timbre en paralelo | Si | Si | Si | Si | Si |
| Cola / musica en espera | Si | Si | Si | Si | Si |

## Como configurar

1. Navega a **Configuracion** en la barra lateral de administrador
2. Abre la seccion **Proveedor de Telefonia**
3. Selecciona tu proveedor del menu desplegable
4. Ingresa las credenciales requeridas (cada proveedor tiene campos diferentes)
5. Establece el numero de telefono de tu linea en formato E.164 (por ejemplo, `+15551234567`)
6. Haz clic en **Guardar**
7. Configura los webhooks en la consola de tu proveedor para que apunten a tu instancia de Llamenos

Consulta las guias individuales de configuracion para instrucciones paso a paso:

- [Configurar Twilio](/docs/deploy/providers/twilio)
- [Configurar SignalWire](/docs/deploy/providers/signalwire)
- [Configurar Vonage](/docs/deploy/providers/vonage)
- [Configurar Plivo](/docs/deploy/providers/plivo)
- [Configurar Asterisk (Autoalojado)](/docs/deploy/providers/asterisk)
- [Llamadas WebRTC en el Navegador](/docs/deploy/providers/webrtc)
