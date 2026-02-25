---
title: Seguridad y Privacidad
subtitle: Que esta protegido, que es visible, y que puede obtenerse bajo citacion judicial — organizado por las funciones que uses.
---

## Si tu proveedor de hosting recibe una citacion

| Pueden proporcionar | NO pueden proporcionar |
|---------------------|------------------------|
| Metadatos de llamadas/mensajes (horarios, duraciones) | Contenido de notas, transcripciones, cuerpos de reportes |
| Blobs de base de datos cifrados | Claves de descifrado (almacenadas en tus dispositivos) |
| Que voluntarios estaban activos cuando | Claves de cifrado por nota (efimeras) |
| Contenido de mensajes SMS/WhatsApp | Tu secreto HMAC para revertir hashes de telefonos |

**El servidor almacena datos que no puede leer.** Los metadatos (cuando, cuanto tiempo, quien) son visibles. El contenido (que se dijo, que se escribio) no lo es.

---

## Por funcion

Tu exposicion de privacidad depende de que canales habilites:

### Llamadas de voz

| Si usas... | Terceros pueden acceder | Servidor puede acceder | Contenido E2EE |
|------------|------------------------|------------------------|----------------|
| Twilio/SignalWire/Vonage/Plivo | Audio de llamadas (en vivo), registros | Metadatos de llamadas | Notas, transcripciones |
| Asterisk autoalojado | Nada (tu lo controlas) | Metadatos de llamadas | Notas, transcripciones |
| Navegador a navegador (WebRTC) | Nada | Metadatos de llamadas | Notas, transcripciones |

**Citacion al proveedor de telefonia**: Tienen registros detallados de llamadas (horarios, numeros, duraciones). NO tienen notas de llamadas ni transcripciones. La grabacion esta deshabilitada por defecto.

**Ventana de transcripcion**: Durante los ~30 segundos de transcripcion, el audio es procesado por Cloudflare Workers AI. Despues de la transcripcion, solo se almacena texto cifrado.

### Mensajeria de texto

| Canal | Acceso del proveedor | Almacenamiento en servidor | Notas |
|-------|---------------------|---------------------------|-------|
| SMS | Tu proveedor de telefonia lee todos los mensajes | Texto plano | Limitacion inherente de SMS |
| WhatsApp | Meta lee todos los mensajes | Texto plano | Requisito de WhatsApp Business API |
| Signal | La red Signal es E2EE, pero el bridge signal-cli descifra | Texto plano | Mejor que SMS, no es conocimiento cero |

**Citacion al proveedor de mensajeria**: El proveedor de SMS tiene el contenido completo de mensajes. Meta tiene el contenido de WhatsApp. Los mensajes de Signal son E2EE hasta el bridge, pero el bridge (ejecutandose en tu servidor) tiene texto plano.

**Mejora futura**: Estamos explorando almacenamiento E2EE de mensajes donde el servidor solo almacena texto cifrado. Ver [que esta planeado](#que-esta-planeado).

### Notas, transcripciones y reportes

Todo el contenido escrito por voluntarios esta cifrado de extremo a extremo:

- Cada nota usa una clave aleatoria unica (secreto hacia adelante)
- Las claves se envuelven separadamente para el voluntario y el administrador
- El servidor almacena solo texto cifrado
- El descifrado ocurre en el navegador

**Incautacion de dispositivo**: Sin tu PIN, los atacantes obtienen un blob cifrado. Un PIN de 6 digitos con 600K iteraciones de PBKDF2 toma horas de fuerza bruta en hardware GPU.

---

## Privacidad del numero de telefono del voluntario

Cuando los voluntarios reciben llamadas en sus telefonos personales, sus numeros quedan expuestos a tu proveedor de telefonia.

| Escenario | Numero de telefono visible para |
|-----------|--------------------------------|
| Llamada PSTN al telefono del voluntario | Proveedor de telefonia, operador movil |
| Navegador a navegador (WebRTC) | Nadie (el audio permanece en el navegador) |
| Asterisk autoalojado + telefono SIP | Solo tu servidor Asterisk |

**Para proteger numeros de telefono de voluntarios**: Usa llamadas basadas en navegador (WebRTC) o proporciona telefonos SIP conectados a Asterisk autoalojado.

**Mejora futura**: Aplicaciones nativas de escritorio y movil para recibir llamadas sin exponer numeros de telefono personales.

---

## Que esta planeado

Estamos trabajando en mejoras para reducir los requisitos de confianza:

| Funcion | Estado | Beneficio de privacidad |
|---------|--------|------------------------|
| Almacenamiento E2EE de mensajes | Planeado | SMS/WhatsApp/Signal almacenados como texto cifrado |
| Transcripcion del lado del cliente | Planeado | El audio nunca sale del navegador |
| Aplicaciones nativas para recibir llamadas | Planeado | No se exponen numeros de telefono personales |
| Builds reproducibles | Planeado | Verificar que el codigo desplegado coincide con el fuente |
| Bridge Signal autoalojado | Disponible | Ejecutar signal-cli en tu propia infraestructura |

---

## Tabla resumen

| Tipo de dato | Cifrado | Visible al servidor | Obtenible bajo citacion |
|--------------|---------|--------------------|-----------------------|
| Notas de llamadas | Si (E2EE) | No | Solo texto cifrado |
| Transcripciones | Si (E2EE) | No | Solo texto cifrado |
| Reportes | Si (E2EE) | No | Solo texto cifrado |
| Archivos adjuntos | Si (E2EE) | No | Solo texto cifrado |
| Metadatos de llamadas | No | Si | Si |
| Identidades de voluntarios | Cifrado en reposo | Solo admin | Si (con esfuerzo) |
| Hashes de telefonos de llamantes | HMAC hasheado | Solo hash | Hash (no reversible sin tu secreto) |
| Contenido SMS | No | Si | Si |
| Contenido WhatsApp | No | Si | Si (tambien de Meta) |
| Contenido Signal | No | Si | Si (de tu servidor) |

---

## Para auditores de seguridad

Documentacion tecnica:

- [Especificacion del Protocolo](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/protocol/llamenos-protocol.md)
- [Modelo de Amenazas](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/THREAT_MODEL.md)
- [Clasificacion de Datos](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Auditorias de Seguridad](https://github.com/rhonda-rodododo/llamenos/tree/main/docs/security)

Llamenos es codigo abierto: [github.com/rhonda-rodododo/llamenos](https://github.com/rhonda-rodododo/llamenos)
