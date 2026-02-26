---
title: "Configurar SMS"
description: Habilita la mensajeria SMS entrante y saliente a traves de tu proveedor de telefonia.
---

La mensajeria SMS en Llamenos reutiliza las credenciales de tu proveedor de telefonia de voz existente. No se necesita un servicio SMS separado — si ya configuraste Twilio, SignalWire, Vonage o Plivo para voz, el SMS funciona con la misma cuenta.

## Proveedores soportados

| Proveedor | Soporte SMS | Notas |
|-----------|------------|-------|
| **Twilio** | Si | SMS bidireccional via Twilio Messaging API |
| **SignalWire** | Si | Compatible con la API de Twilio — misma interfaz |
| **Vonage** | Si | SMS via Vonage REST API |
| **Plivo** | Si | SMS via Plivo Message API |
| **Asterisk** | No | Asterisk no soporta SMS nativo |

## 1. Habilitar SMS en la configuracion de admin

Navega a **Configuracion de Admin > Canales de Mensajeria** (o usa el asistente de configuracion en el primer inicio) y activa **SMS**.

Configura los ajustes de SMS:
- **Mensaje de auto-respuesta** — mensaje de bienvenida opcional enviado a contactos nuevos
- **Respuesta fuera de horario** — mensaje opcional enviado fuera del horario de turnos

## 2. Configurar el webhook

Apunta el webhook de SMS de tu proveedor de telefonia a tu Worker:

```
POST https://tu-worker.tu-dominio.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. Ve a tu consola de Twilio > Phone Numbers > Active Numbers
2. Selecciona tu numero de telefono
3. En **Messaging**, configura la URL del webhook para "A message comes in" con la URL de arriba
4. Establece el metodo HTTP en **POST**

### Vonage

1. Ve al panel de la API de Vonage > Applications
2. Selecciona tu aplicacion
3. En **Messages**, configura la URL entrante con la URL del webhook de arriba

### Plivo

1. Ve a la consola de Plivo > Messaging > Applications
2. Crea o edita una aplicacion de mensajeria
3. Configura la URL de mensaje con la URL del webhook de arriba
4. Asigna la aplicacion a tu numero de telefono

## 3. Probar

Envia un SMS al numero de telefono de tu linea. Deberas ver la conversacion aparecer en la pestana de **Conversaciones** en el panel de administracion.

## Como funciona

1. Un SMS llega a tu proveedor, que envia un webhook a tu Worker
2. El Worker valida la firma del webhook (HMAC especifico del proveedor)
3. El mensaje se analiza y almacena en el ConversationDO
4. Los voluntarios en turno son notificados via eventos del relay Nostr
5. Los voluntarios responden desde la pestana de Conversaciones — las respuestas se envian via la API SMS de tu proveedor

## Notas de seguridad

- Los mensajes SMS atraviesan la red del operador en texto plano — tu proveedor y los operadores pueden leerlos
- Los mensajes entrantes se almacenan en el ConversationDO despues de llegar
- Los numeros de telefono del remitente se hashean antes del almacenamiento (privacidad)
- Las firmas de webhook se validan por proveedor (HMAC-SHA1 para Twilio, etc.)
