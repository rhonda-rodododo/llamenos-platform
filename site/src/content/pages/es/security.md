---
title: Seguridad y Privacidad
subtitle: Que esta protegido, que es visible, y que puede obtenerse bajo citacion judicial — organizado por las funciones que uses.
---

## Si tu proveedor de hosting recibe una citacion

| Pueden proporcionar | NO pueden proporcionar |
|---------------------|------------------------|
| Metadatos de llamadas/mensajes (horarios, duraciones) | Contenido de notas, transcripciones, cuerpos de reportes |
| Blobs de base de datos cifrados | Nombres de voluntarios (cifrado de extremo a extremo) |
| Que cuentas de voluntarios estaban activas cuando | Registros del directorio de contactos (cifrado de extremo a extremo) |
| | Contenido de mensajes (cifrado al llegar, almacenado como texto cifrado) |
| | Claves de descifrado (protegidas por tu PIN, tu proveedor de identidad y opcionalmente tu llave de seguridad de hardware) |
| | Claves de cifrado por nota (efimeras — destruidas despues de envolver) |
| | Tu secreto HMAC para revertir hashes de telefonos |

**El servidor almacena datos que no puede leer.** Los metadatos (cuando, cuanto tiempo, que cuentas) son visibles. El contenido (que se dijo, que se escribio, quienes son tus contactos) no lo es.

---

## Por funcion

Tu exposicion de privacidad depende de que canales habilites:

### Llamadas de voz

| Si usas... | Terceros pueden acceder | Servidor puede acceder | Contenido cifrado de extremo a extremo |
|------------|------------------------|------------------------|-----------------------------------------|
| Twilio/SignalWire/Vonage/Plivo | Audio de llamadas (en vivo), registros | Metadatos de llamadas | Notas, transcripciones |
| Asterisk autoalojado | Nada (tu lo controlas) | Metadatos de llamadas | Notas, transcripciones |
| Navegador a navegador (WebRTC) | Nada | Metadatos de llamadas | Notas, transcripciones |

**Citacion al proveedor de telefonia**: Tienen registros detallados de llamadas (horarios, numeros, duraciones). NO tienen notas de llamadas ni transcripciones. La grabacion esta deshabilitada por defecto.

**Transcripcion**: La transcripcion ocurre completamente en tu navegador usando IA en el dispositivo. **El audio nunca sale de tu dispositivo.** Solo se almacena la transcripcion cifrada.

### Mensajeria de texto

| Canal | Acceso del proveedor | Almacenamiento en servidor | Notas |
|-------|---------------------|---------------------------|-------|
| SMS | Tu proveedor de telefonia lee todos los mensajes | **Cifrado** | El proveedor retiene los mensajes originales |
| WhatsApp | Meta lee todos los mensajes | **Cifrado** | El proveedor retiene los mensajes originales |
| Signal | La red Signal es E2EE, pero el bridge descifra al llegar | **Cifrado** | Mejor que SMS, no es conocimiento cero |

**Los mensajes se cifran en el momento en que llegan a tu servidor.** El servidor almacena solo texto cifrado. Tu proveedor de telefonia o mensajeria puede aun tener el mensaje original — eso es una limitacion de esas plataformas, no algo que podamos cambiar.

**Citacion al proveedor de mensajeria**: El proveedor de SMS tiene el contenido completo de mensajes. Meta tiene el contenido de WhatsApp. Los mensajes de Signal son E2EE hasta el bridge, pero el bridge (ejecutandose en tu servidor) descifra antes de re-cifrar para almacenamiento. En todos los casos, **tu servidor solo tiene texto cifrado** — el proveedor de hosting no puede leer el contenido de los mensajes.

### Notas, transcripciones y reportes

Todo el contenido escrito por voluntarios esta cifrado de extremo a extremo:

- Cada nota usa una **clave aleatoria unica** (secreto hacia adelante — comprometer una nota no compromete otras)
- Las claves se envuelven separadamente para el voluntario y cada administrador
- El servidor almacena solo texto cifrado
- El descifrado ocurre en el navegador
- **Los campos personalizados, contenido de reportes y archivos adjuntos se cifran individualmente**

**Incautacion de dispositivo**: Sin tu PIN **y** acceso a tu cuenta de proveedor de identidad, los atacantes obtienen un blob cifrado que es computacionalmente imposible de descifrar. Si tambien usas una llave de seguridad de hardware, **tres factores independientes** protegen tus datos.

---

## Privacidad del numero de telefono del voluntario

Cuando los voluntarios reciben llamadas en sus telefonos personales, sus numeros quedan expuestos a tu proveedor de telefonia.

| Escenario | Numero de telefono visible para |
|-----------|--------------------------------|
| Llamada PSTN al telefono del voluntario | Proveedor de telefonia, operador movil |
| Navegador a navegador (WebRTC) | Nadie (el audio permanece en el navegador) |
| Asterisk autoalojado + telefono SIP | Solo tu servidor Asterisk |

**Para proteger numeros de telefono de voluntarios**: Usa llamadas basadas en navegador (WebRTC) o proporciona telefonos SIP conectados a Asterisk autoalojado.

---

## Enviado recientemente

Estas mejoras estan disponibles hoy:

| Funcion | Beneficio de privacidad |
|---------|------------------------|
| Almacenamiento cifrado de mensajes | SMS, WhatsApp y Signal almacenados como texto cifrado en tu servidor |
| Transcripcion en el dispositivo | El audio nunca sale de tu navegador — procesado completamente en tu dispositivo |
| Proteccion de claves multifactor | Tus claves de cifrado estan protegidas por tu PIN, tu proveedor de identidad y opcionalmente una llave de seguridad de hardware |
| Llaves de seguridad de hardware | Las llaves fisicas agregan un tercer factor que no puede ser comprometido remotamente |
| Builds reproducibles | Verifica que el codigo desplegado coincide con el fuente publico |
| Directorio de contactos cifrado | Registros de contactos, relaciones y notas estan cifrados de extremo a extremo |

## Aun planeado

| Funcion | Beneficio de privacidad |
|---------|------------------------|
| Aplicaciones nativas para recibir llamadas | No se exponen numeros de telefono personales |

---

## Tabla resumen

| Tipo de dato | Cifrado | Visible al servidor | Obtenible bajo citacion |
|--------------|---------|--------------------|-----------------------|
| Notas de llamadas | Si (extremo a extremo) | No | Solo texto cifrado |
| Transcripciones | Si (extremo a extremo) | No | Solo texto cifrado |
| Reportes | Si (extremo a extremo) | No | Solo texto cifrado |
| Archivos adjuntos | Si (extremo a extremo) | No | Solo texto cifrado |
| Registros de contactos | Si (extremo a extremo) | No | Solo texto cifrado |
| Identidades de voluntarios | Si (extremo a extremo) | No | Solo texto cifrado |
| Metadatos de equipo/roles | Si (cifrado) | No | Solo texto cifrado |
| Definiciones de campos personalizados | Si (cifrado) | No | Solo texto cifrado |
| Contenido SMS/WhatsApp/Signal | Si (en tu servidor) | No | Texto cifrado de tu servidor; proveedor puede tener original |
| Metadatos de llamadas | No | Si | Si |
| Hashes de telefonos de llamantes | HMAC hasheado | Solo hash | Hash (no reversible sin tu secreto) |

---

## Para auditores de seguridad

Documentacion tecnica:

- [Especificacion del Protocolo](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/protocol/llamenos-protocol.md)
- [Modelo de Amenazas](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/THREAT_MODEL.md)
- [Clasificacion de Datos](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Auditorias de Seguridad](https://github.com/rhonda-rodododo/llamenos/tree/main/docs/security)
- [Documentacion API](/api/docs)

Llamenos es codigo abierto: [github.com/rhonda-rodododo/llamenos](https://github.com/rhonda-rodododo/llamenos)
