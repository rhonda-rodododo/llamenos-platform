---
title: Proveedores Telefonía
description: Comparar proveedores telefonía soportados ni escoger mejor opción nuu línea caliente.
---

Llámenos soporta múltiples proveedores telefonía través interfaz **TelephonyAdapter**. Puede cambiar proveedores en cualquier momento nuu configuración ña'a sin ke cambiar código aplicación.

## Proveedores soportados

| Proveedor | Tipo | Modelo Precios | Soporte WebRTC | Dificultad Configuración | Mejor nuu |
|---|---|---|---|---|---|
| **Twilio** | Nube | Por minuto | Saa | Fácil | Inicio rápido |
| **SignalWire** | Nube | Por minuto (más barato) | Saa | Fácil | Organizaciones conscientes costos |
| **Vonage** | Nube | Por minuto | Saa | Media | Cobertura internacional |
| **Plivo** | Nube | Por minuto | Saa | Media | Opción nube económica |
| **Telnyx** | Nube | Por minuto | Saa | Media | Amigable desarrolladores |
| **Bandwidth** | Nube | Por minuto | Saa | Media | Grado operador EE.UU. |
| **Asterisk** | Autoalojado | Solo costo SIP trunk | Saa (vía sip-bridge) | Difícil | Máxima privacidad |
| **FreeSWITCH** | Autoalojado | Solo costo SIP trunk | Saa (vía sip-bridge) | Difícil | Alto volumen |

## Comparación precios

Costos aproximados por minuto nuu llamadas voz EE.UU. (varían por región ni volumen):

| Proveedor | Entrante | Saliente | Número Teléfono | Nivel Gratuito |
|---|---|---|---|---|
| Twilio | $0.0085 | $0.014 | $1.15/mes | Crédito prueba |
| SignalWire | $0.005 | $0.009 | $1.00/mes | Crédito prueba |
| Vonage | $0.0049 | $0.0139 | $1.00/mes | Crédito gratis |
| Plivo | $0.0055 | $0.010 | $0.80/mes | Crédito prueba |
| Telnyx | $0.005 | $0.009 | $1.00/mes | Crédito prueba |
| Asterisk | Tarifa SIP trunk | Tarifa SIP trunk | Desde proveedor SIP | N/A |

## Matriz soporte características

| Característica | Twilio | SignalWire | Vonage | Plivo | Asterisk |
|---|---|---|---|---|---|
| Grabación llamada | Saa | Saa | Saa | Saa | Saa |
| Transcripción en vivo | Saa | Saa | Saa | Saa | Saa (vía bridge) |
| CAPTCHA voz | Saa | Saa | Saa | Saa | Saa |
| Buzón voz | Saa | Saa | Saa | Saa | Saa |
| Llamadas WebRTC navegador | Saa | Saa | Saa | Saa | Saa (SIP.js) |
| Validación webhook | Saa | Saa | Saa | Saa | Personalizado (HMAC) |
| Timbrado paralelo | Saa | Saa | Saa | Saa | Saa |

## SIP bridge

Proveedores autoalojados (Asterisk, FreeSWITCH, Kamailio) se acceden través servicio `sip-bridge`. Establezca variable entorno `PBX_TYPE` nuu seleccionar backend:

```env
PBX_TYPE=asterisk      # Asterisk ARI
PBX_TYPE=freeswitch    # FreeSWITCH ESL
PBX_TYPE=kamailio      # Kamailio
```

## Ke configurar

1. Navegar a **Configuración** nuu barra lateral ña'a
2. Abrir sección **Proveedor Telefonía**
3. Seleccionar proveedor nuu desplegable
4. Ke ingresar credenciales requeridas
5. Ke establecer número teléfono línea caliente nuu formato E.164 (ej., `+15551234567`)
6. Clic **Guardar**
7. Ke configurar webhooks nuu consola proveedor

Ver guías configuración individuales:

- [Configurar: Twilio](/docs/en/deploy/providers/twilio)
- [Configurar: SignalWire](/docs/en/deploy/providers/signalwire)
- [Configurar: Vonage](/docs/en/deploy/providers/vonage)
- [Configurar: Plivo](/docs/en/deploy/providers/plivo)
- [Configurar: Asterisk (Autoalojado)](/docs/en/deploy/providers/asterisk)
- [Configurar: SMS](/docs/en/deploy/providers/sms)
- [Configurar: WhatsApp](/docs/en/deploy/providers/whatsapp)
- [Configurar: Signal](/docs/en/deploy/providers/signal)
- [Llamadas WebRTC Navegador](/docs/en/deploy/providers/webrtc)
