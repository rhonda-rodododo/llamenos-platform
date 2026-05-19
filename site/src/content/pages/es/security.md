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
| Registros de entrega de mensajes masivos | Contenido de mensajes (cifrado al llegar, almacenado como texto cifrado) |
| | Claves de descifrado (protegidas por tu PIN, tu proveedor de identidad y opcionalmente tu llave de seguridad de hardware) |
| | Claves de cifrado por nota (efimeras — destruidas despues de envolver) |
| | Tu secreto HMAC para revertir hashes de telefonos |
| | Contenido de fragmentos de recuperacion (cifrado, el servidor no puede leerlos) |

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

### Mensajeria de texto (uno a uno)

| Canal | Acceso del proveedor | Almacenamiento en servidor | Notas |
|-------|---------------------|---------------------------|-------|
| SMS | Tu proveedor de telefonia lee todos los mensajes | **Cifrado** | El proveedor retiene los mensajes originales |
| WhatsApp | Meta lee todos los mensajes | **Cifrado** | El proveedor retiene los mensajes originales |
| Signal | La red Signal es E2EE; el bridge re-cifra al llegar | **Cifrado** | Ruta preferida cuando esta disponible |

**Entrega priorizando Signal**: Cuando un destinatario tiene Signal, los mensajes se enrutan automaticamente por Signal — tu proveedor de telefonia nunca ve el contenido. Para SMS, solo se envia una notificacion generica "tienes un nuevo mensaje" por defecto (sin cuerpo del mensaje).

**Los mensajes se cifran en el momento en que llegan a tu servidor.** El servidor almacena solo texto cifrado.

### Mensajes masivos y difusion

Los administradores pueden enviar mensajes masivos a suscriptores via SMS, WhatsApp, Signal o RCS.

**Importante: los mensajes masivos salientes NO estan cifrados de extremo a extremo en el servidor.** Para entregar un mensaje a suscriptores de SMS o WhatsApp, el servidor debe procesar el contenido en texto plano momentaneamente y enviarlo al proveedor de mensajeria. El proveedor lo entrega y puede retener una copia.

| Canal | Acceso del servidor al enviar | Acceso del proveedor | Despues de la entrega |
|-------|------------------------------|---------------------|-----------------------|
| SMS masivo | Texto plano (momentaneo, para entrega) | Contenido completo | El proveedor retiene |
| WhatsApp masivo | Texto plano (momentaneo, para entrega) | Contenido completo (Meta) | El proveedor retiene |
| Signal masivo | Texto plano (momentaneo, para entrega) | Cifrado E2EE via red Signal | No retenido por proveedor |
| RCS masivo | Texto plano (momentaneo, para entrega) | Google puede ver contenido | El proveedor retiene |

**Que significa esto**: Los mensajes masivos no deben contener informacion sensible de llamantes. Usalos para anuncios, avisos de horarios y recursos — no para detalles de casos ni informacion que pudiera identificar a llamantes o voluntarios.

Los numeros de telefono de suscriptores se almacenan como identificadores hasheados — tu base de datos nunca contiene una lista de suscriptores en texto plano.

### Notas, transcripciones y reportes

Todo el contenido escrito por voluntarios esta cifrado de extremo a extremo:

- Cada nota usa una **clave aleatoria unica** (secreto hacia adelante — comprometer una nota no compromete otras)
- Las claves se envuelven separadamente para el voluntario y cada administrador
- El servidor almacena solo texto cifrado
- El descifrado ocurre en tu dispositivo, en una capa segura que nunca expone claves a la interfaz de usuario
- **Los campos personalizados, contenido de reportes y archivos adjuntos se cifran individualmente**

**Registros de casos y datos de entidades**: Los registros de casos estructurados siguen el mismo modelo de cifrado — cada elemento cifrado con una clave unica, envuelta para los visores autorizados.

**Incautacion de dispositivo**: Sin tu PIN **y** acceso a tu cuenta de proveedor de identidad, los atacantes obtienen un blob cifrado protegido por Argon2id. Si tambien usas una llave de seguridad de hardware, **tres factores independientes** protegen tus datos.

---

## Tus dispositivos

### Ver y revocar dispositivos

La aplicacion mantiene una lista de cada dispositivo desde el que has iniciado sesion. Puedes ver esta lista y revocar cualquier dispositivo que no reconozcas.

**Cuando revocas un dispositivo:**
- Ese dispositivo queda bloqueado inmediatamente del acceso a tu cuenta
- Tus claves de cifrado rotan para que el dispositivo revocado no pueda descifrar contenido futuro
- La revocacion se registra en el historial de seguridad de tu cuenta

### Verificacion de emoji SAS

Para organizaciones con altas necesidades de seguridad, los administradores pueden verificar la identidad de un dispositivo usando verificacion SAS (Cadena de Autenticacion Corta) — mostrada como una secuencia de 7 emoji.

**Como funciona:**
1. El administrador y el propietario del dispositivo comparan sus secuencias de emoji (en persona, por telefono o via un canal de confianza)
2. Si los emoji coinciden, el dispositivo se confirma como perteneciente a su propietario registrado
3. La verificacion se registra — los administradores pueden ver que dispositivos han sido verificados

Esto protege contra un atacante que ha registrado un dispositivo falso bajo la cuenta de otra persona. La secuencia de emoji se deriva de las claves de identidad criptograficas de ambos dispositivos — el servidor no puede manipularla ni predecirla.

---

## Borrado de cuenta

### Borrado por el propio usuario

Puedes solicitar que tu cuenta y todos los datos asociados sean eliminados permanentemente. Por defecto hay un retraso (configurado por tu administrador de hub, tipicamente 72 horas) antes de que se complete el borrado — esto te da tiempo para cancelar si la solicitud fue hecha bajo coercion.

**Que se elimina:**
- Tus claves de dispositivo (haciendo todo el contenido cifrado permanentemente ilegible, incluso desde copias de seguridad)
- Tu registro de cuenta, asignaciones de rol e historial de turnos
- Tus tokens de notificacion push

**Que pasa con el contenido cifrado que creaste**: Las notas, transcripciones y reportes que escribiste se re-cifran para los lectores autorizados restantes (otros administradores). Tu copia de la clave de descifrado se destruye.

**Registros de auditoria**: Tus entradas de registro de auditoria son "crypto-destruidas" — la clave de cifrado por usuario se destruye, haciendo tus entradas ilegibles. La cadena de hash (la estructura a prueba de manipulaciones) permanece intacta.

### Borrado de emergencia

Si crees que tu cuenta esta bajo amenaza inmediata, puedes solicitar borrado de emergencia con un co-aprobador — una persona de confianza que aprueba la urgencia. Esto reduce el retraso a un minimo de 4 horas. El minimo de 4 horas existe para proteger contra borrado coercitivo (ser forzado a eliminar evidencia antes de que llegue ayuda).

---

## Grupos de recuperacion

Si pierdes todos tus dispositivos, normalmente perderas acceso a todos tus datos cifrados. Los grupos de recuperacion resuelven esto.

### Como funciona la recuperacion

Designas un grupo de contactos de confianza (tipicamente 3–5 personas) como tu grupo de recuperacion. Cada contacto tiene un "fragmento" de una clave de recuperacion — una pieza del rompecabezas.

**Para recuperar tu cuenta:**
1. Registras un nuevo dispositivo e inicias una solicitud de recuperacion
2. Tus contactos de recuperacion reciben una notificacion
3. Despues de un retraso configurable, un numero umbral de contactos (ej. 2 de 3) aprueban la solicitud
4. Cada contacto aprobador envia su fragmento, cifrado directamente a tu nuevo dispositivo
5. Tu nuevo dispositivo combina los fragmentos para reconstruir la clave de recuperacion

**Que puede ver el servidor**: El servidor retransmite fragmentos cifrados entre dispositivos. No puede leer los fragmentos, no puede reconstruir la clave de recuperacion por si solo.

### Propiedades de seguridad de los grupos de recuperacion

- **Seguridad por umbral**: Los fragmentos por debajo del umbral no revelan nada sobre el secreto
- **Sin participacion del servidor en el secreto**: Los fragmentos se cifran directamente a la clave publica de tu nuevo dispositivo
- **Alcance por hub**: La recuperacion restaura tu acceso a un hub especifico
- **Retraso con cancelacion**: Puedes cancelar una solicitud de recuperacion durante el periodo de retraso
- **Verificacion por Signal**: Las solicitudes de recuperacion se verifican via Signal

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
| Gestion de dispositivos | Ver y revocar cualquier dispositivo con sesion iniciada; la revocacion activa la rotacion de claves |
| Verificacion de emoji SAS de dispositivos | Los administradores pueden verificar dispositivos en persona usando una huella criptografica de 7 emoji |
| Borrado de cuenta con retraso | Solicita la eliminacion de tu cuenta; el retraso configurable permite cancelar si fue coercitiva |
| Borrado de emergencia | Borrado rapido co-aprobado con minimo de 4 horas |
| Crypto-destruccion al borrar | Tus claves de cifrado se destruyen primero, haciendo el contenido permanentemente ilegible |
| Grupos de recuperacion (Shamir) | Designa contactos de confianza que pueden ayudarte a recuperar si pierdes todos los dispositivos |
| Mensajeria masiva con divulgacion honesta | Los administradores pueden enviar mensajes masivos; el servidor procesa texto plano momentaneamente para la entrega (indicado claramente) |
| Hash de suscriptores | Numeros de telefono de suscriptores almacenados como identificadores hasheados |
| Proteccion de claves Argon2id | Las claves de tu dispositivo estan protegidas por una funcion resistente a la memoria |
| Enrutamiento priorizando Signal | Los mensajes se enrutan automaticamente por Signal cuando esta disponible |
| Modo SMS solo notificacion | Los destinatarios SMS solo ven "tienes un nuevo mensaje" |
| Resistencia al analisis de trafico | Los tamanos de eventos se rellenan para que los observadores no puedan distinguir mensajes |
| Sin numeros de telefono en texto plano | Los numeros de llamantes se almacenan como hashes irreversibles |
| Cifrado por hub con secreto hacia adelante | Claves que rotan cada 24 horas |
| Criptografia en Rust en todas las plataformas | La misma biblioteca criptografica auditada en Rust en escritorio, iOS y Android |
| Acceso restringido al relay | Tu relay WebSocket acepta eventos solo de tu servidor |
| Almacenamiento cifrado de mensajes | SMS, WhatsApp y Signal almacenados como texto cifrado |
| Transcripcion en el dispositivo | El audio nunca sale de tu dispositivo |
| Proteccion de claves multifactor | PIN, proveedor de identidad y opcionalmente llave de seguridad de hardware |
| Llaves de seguridad de hardware | Tercer factor que no puede ser comprometido remotamente |
| Builds reproducibles | Verifica que el codigo desplegado coincide con el fuente publico |
| Directorio de contactos cifrado | Registros, relaciones y notas cifrados de extremo a extremo |

## Aun planeado

| Funcion | Beneficio de privacidad | Estado |
|---------|------------------------|--------|
| Apps nativas para recibir llamadas | No se exponen numeros de telefono personales | En desarrollo |
| Fijacion de certificados (movil) | Defensa contra intercepcion TLS por CA fraudulenta | Estructura completa; fijacion pendiente |
| Cifrado de medios de voz SFrame | Llamadas de voz cifradas de extremo a extremo | Derivacion de claves completa; cifrado por cuadro planificado |

---

## Tabla resumen

| Tipo de dato | Cifrado | Visible al servidor | Obtenible bajo citacion |
|--------------|---------|--------------------|-----------------------|
| Notas de llamadas | Si (extremo a extremo) | No | Solo texto cifrado |
| Transcripciones | Si (extremo a extremo) | No | Solo texto cifrado |
| Reportes | Si (extremo a extremo) | No | Solo texto cifrado |
| Registros de casos / datos de entidades | Si (extremo a extremo) | No | Solo texto cifrado |
| Archivos adjuntos | Si (extremo a extremo) | No | Solo texto cifrado |
| Registros de contactos | Si (extremo a extremo) | No | Solo texto cifrado |
| Identidades de voluntarios | Si (extremo a extremo) | No | Solo texto cifrado |
| Metadatos de equipo/roles | Si (cifrado) | No | Solo texto cifrado |
| Definiciones de campos personalizados | Si (cifrado) | No | Solo texto cifrado |
| Mensajes SMS/WhatsApp/Signal entrantes | Si (en tu servidor) | No | Texto cifrado de tu servidor; proveedor puede tener original |
| Mensajes masivos salientes | **No — texto plano durante entrega** | **Si, momentaneamente** | Si (texto plano al enviar) |
| Fragmentos de recuperacion | Si (extremo a extremo al dispositivo) | No | Solo texto cifrado |
| Eventos en tiempo real | Si (por hub, claves rotativas) | No | Solo texto cifrado |
| Metadatos de llamadas | No | Si | Si |
| Registros de entrega masiva | No | Si | Si |
| Hashes de telefonos de llamantes | HMAC hasheado | Solo hash | Hash (no reversible sin tu secreto) |
| Hashes de telefonos de suscriptores | HMAC hasheado | Solo hash | Hash (no reversible sin tu secreto) |
| Cadenas User-Agent | SHA-256 hasheado | Solo hash | Hash (no reversible) |

---

## Para auditores de seguridad

Documentacion tecnica:

- [Especificacion del Protocolo](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/PROTOCOL.md)
- [Modelo de Amenazas](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/THREAT_MODEL.md)
- [Clasificacion de Datos](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Brechas de Seguridad y Hoja de Ruta](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/SECURITY_GAPS_AND_ROADMAP.md)
- [Auditorias de Seguridad](https://github.com/rhonda-rodododo/llamenos-platform/tree/main/docs/security)
- [Documentacion API](/api/docs)

Llamenos es codigo abierto: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
