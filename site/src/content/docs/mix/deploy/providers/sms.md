---
title: "Configurar: SMS"
description: Habilitar mensajes SMS entrada/salida nuu proveedor telefonía.
---

Mensajería SMS nuu Llámenos reutiliza credenciales proveedor telefonía voz existente. No se requiere servicio SMS separado — si ya configuró Twilio, SignalWire, Vonage, o Plivo nuu voz, SMS funciona nuu misma cuenta.

## Proveedores soportados

| Proveedor | Soporte SMS | Notas |
|-----------|------------|-------|
| **Twilio** | Saa | SMS bidireccional completo vía Twilio Messaging API |
| **SignalWire** | Saa | Compatible nuu API Twilio — misma interfaz |
| **Vonage** | Saa | SMS vía Vonage REST API |
| **Plivo** | Saa | SMS vía Plivo Message API |
| **Asterisk** | No | Asterisk no soporta SMS nativo |

## 1. Habilitar SMS nuu configuración ña'a

Navegue a **Configuración Ña'a > Canales Mensajería** (o use asistente configuración nuu primer inicio sesión) ni active **SMS**.

Configure ajustes SMS:
- **Mensaje respuesta automática** — mensaje bienvenida opcional enviado a contactos primera vez
- **Respuesta fuera horario** — mensaje opcional enviado fuera horas turno

## 2. Configurar webhook

Apunte webhook SMS proveedor telefonía a servidor:

```
POST https://your-domain.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. Vaya a Consola Twilio > Phone Numbers > Active Numbers
2. Seleccione número teléfono
3. Debajo **Messaging**, establezca URL webhook nuu "A message comes in" a URL arriba
4. Establezca método HTTP a **POST**

### Vonage

1. Vaya a Panel API Vonage > Applications
2. Seleccione aplicación
3. Debajo **Messages**, establezca Inbound URL a webhook URL arriba

### Plivo

1. Vaya a Consola Plivo > Messaging > Applications
2. Cree o edite aplicación mensajería
3. Establezca Message URL a webhook URL arriba
4. Asigne aplicación a número teléfono

## 3. Probar

Envíe SMS a número teléfono línea caliente. Debería ver conversación aparecer nuu pestaña **Conversaciones** nuu panel ña'a.

## Cómo funciona

1. SMS llega a proveedor, ke envía webhook a servidor
2. Servidor valida firma webhook (HMAC específico proveedor)
3. Mensaje se analiza ni almacena nuu ConversationService
4. Voluntarios de turno son notificados vía eventos relé WebSocket
5. Voluntarios responden desde pestaña Conversaciones — respuestas se envían vuelta vía API SMS proveedor

## Notas seguridad

- Mensajes SMS atraviesan red carrier nuu texto plano — proveedor ni carriers pueden leerlos
- Mensajes entrantes se cifran nuu recepción ni almacenan nuu base datos
- Números teléfono remitente se hashean antes almacenamiento (privacidad)
- Firmas webhook se validan por proveedor (HMAC-SHA1 nuu Twilio, etc.)
