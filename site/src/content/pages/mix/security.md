---
title: Seguridad ni Privacidad
subtitle: Qué está protegido, qué es visible, ni qué puede obtenerse bajo subpoena — organizado por características ke usa.
---

## Si proveedor hospedaje es subpoenado

| Pueden proporcionar | No pueden proporcionar |
|------------------|---------------------|
| Metadatos llamada/mensaje (tiempos, duraciones) | Contenido nota, transcripciones, cuerpos reporte |
| Blobs base datos cifrados | Nombres voluntarios (cifrado extremo a extremo) |
| Qué cuentas voluntarios estaban activas cuándo | Registros directorio contacto (cifrado extremo a extremo) |
| Registros entrega mensaje broadcast | Contenido mensaje (cifrado nuu llegada, almacenado como ciphertext) |
| | Claves descifrado (protegidas por PIN, cuenta proveedor identidad, ni opcionalmente llave seguridad hardware) |
| | Claves cifrado por-nota (efímeras — destruidas después envolver) |
| | Secreto HMAC nuu revertir hashes teléfono |
| | Contenido share recuperación (cifrado, servidor no puede leer) |

**Servidor almacena datos ke no puede leer.** Metadatos (cuándo, cuánto tiempo, qué cuentas) son visibles. Contenido (qué se dijo, qué se escribió, quiénes son contactos) no lo es.

---

## Por característica

Exposición privacidad depende canales ke habilita:

### Llamadas voz

| Si usa... | Terceros pueden acceder | Servidor puede acceder | Contenido cifrado extremo a extremo |
|---------------|-------------------------|-------------------|------------------------------|
| Twilio/SignalWire/Vonage/Plivo | Audio llamada (tiempo real), registros llamada | Metadatos llamada | Notas, transcripciones |
| Asterisk autoalojado | Nada (usted lo controla) | Metadatos llamada | Notas, transcripciones |
| Navegador-a-navegador (WebRTC) | Nada | Metadatos llamada | Notas, transcripciones |

**Subpoena proveedor telefonía**: Tienen registros detalle llamada (tiempos, números teléfono, duraciones). No tienen notas llamada ni transcripciones. Grabación está deshabilitada por defecto.

**Transcripción**: Transcripción ocurre completamente nuu navegador usando IA dispositivo. **Audio nunca sale dispositivo.** Solo transcripción cifrada se almacena.

### Mensajería texto (uno a uno)

| Canal | Acceso proveedor | Almacenamiento servidor | Notas |
|---------|-----------------|----------------|-------|
| SMS | Proveedor telefonía lee todos mensajes | **Cifrado** | Proveedor retiene mensajes originales |
| WhatsApp | Meta lee todos mensajes | **Cifrado** | Proveedor retiene mensajes originales |
| Signal | Red Signal es cifrado extremo a extremo; bridge re-cifra nuu llegada | **Cifrado** | Ruta preferida cuando disponible |

**Entrega preferida Signal**: Cuando destinatario tiene Signal, mensajes se enrutan automáticamente a través Signal — proveedor telefonía nunca ve contenido. Nuu SMS, solo notificación genérica "tiene nuevo mensaje" se envía por defecto (sin cuerpo mensaje), asi ke logs proveedor no contienen contenido sensible.

**Mensajes se cifran momento llegan a servidor.** Servidor almacena solo ciphertext. Proveedor telefonía o mensajería puede aún tener mensaje original — yaa iin limitación esas plataformas, no algo ke podamos cambiar.

**Subpoena proveedor mensajería**: Proveedores SMS tienen contenido mensaje completo solo si habilita explícitamente modo SMS contenido completo. Nu modo notificación por defecto, cuerpos SMS no contienen contenido mensaje. Meta tiene contenido WhatsApp. Mensajes Signal son cifrados extremo a extremo al bridge, pero bridge (corriendo nuu servidor) los descifra antes re-cifrar nuu almacenamiento. Nu todos casos, **servidor solo tiene ciphertext** — proveedor hospedaje no puede leer contenido mensaje.

### Mensajes masivos ni broadcast

Ña'as pueden enviar mensajes broadcast a suscriptores vía SMS, WhatsApp, Signal, o RCS.

**Importante: mensajes broadcast salientes no están cifrados extremo a extremo servidor.** Nuu entregar mensaje a suscriptores SMS o WhatsApp, servidor debe procesar contenido texto plano momentáneamente ni entregarlo a proveedor mensajería. Proveedor luego lo entrega ni puede retener copia.

| Canal | Acceso servidor durante envío | Acceso proveedor | Después entrega |
|---------|--------------------------|-----------------|----------------|
| Blast SMS | Texto plano (momentáneo, nuu entrega) | Contenido mensaje completo | Proveedor retiene |
| Blast WhatsApp | Texto plano (momentáneo, nuu entrega) | Contenido mensaje completo (Meta) | Proveedor retiene |
| Blast Signal | Texto plano (momentáneo, nuu entrega) | Cifrado extremo a extremo vía red Signal | No retenido por proveedor |
| Blast RCS | Texto plano (momentáneo, nuu entrega) | Google puede ver contenido | Proveedor retiene |

**Qué significa yaa**: Mensajes broadcast no deben contener información sensible llamante. Úselos nuu anuncios, avisos programación, ni recursos — no nuu detalles caso o cualquier cosa ke pueda identificar llamantes o voluntarios.

Números teléfono suscriptores se almacenan como identificadores hasheados — base datos nunca contiene lista suscriptores texto plano. Solicitudes opt-out (STOP) se procesan inmediatamente ni estado suscriptor actualizado.

### Notas, transcripciones, ni reportes

Todo contenido escrito voluntario está cifrado extremo a extremo:

- Cada nota usa **clave aleatoria única** (secreto adelante — comprometer una nota no compromete otras)
- Claves se envuelven separadamente nuu voluntario ni cada ña'a
- Servidor almacena solo ciphertext
- Descifrado ocurre nuu dispositivo, nuu capa segura ke nunca expone claves a interfaz usuario app
- **Campos personalizados, contenido reporte, ni archivos adjuntos están individualmente cifrados**

**Registros caso ni datos entidad**: Registros caso estructurados (contactos, casos, cadenas evidencia) siguen mismo modelo cifrado — cada ítem cifrado nuu clave única, envuelto nuu lectores autorizados. Servidor no puede leer contenido caso.

**Decomiso dispositivo**: Sin PIN **ni** acceso cuenta proveedor identidad, atacantes obtienen blob cifrado protegido por Argon2id — función derivación clave memory-hard ke hace ataques fuerza bruta nuu hardware especializado (GPUs, ASICs) órdenes magnitud más costosos que enfoques tradicionales. Si también usa llave seguridad hardware, **tres factores independientes** protegen datos.

---

## Dispositivos

### Ver ni revocar dispositivos

App mantiene lista cada dispositivo desde ke ha iniciado sesión. Puede ver yaa lista ni revocar cualquier dispositivo ke no reconozca.

**Cuando revoca dispositivo:**
- Ese dispositivo es inmediatamente bloqueado acceso cuenta
- Claves cifrado se rotan asi ke dispositivo revocado no puede descifrar contenido futuro
- Revocación se registra nuu historial seguridad cuenta

Esto significa ke incluso si alguien tiene copia datos cifrados desde antes revocación, no puede leer contenido nuevo creado después revocación.

### Verificación SAS emoji

Nuu organizaciones nuu alta seguridad, ña'as pueden verificar identidad dispositivo usando verificación SAS (Short Authentication String) — mostrada como secuencia 7 emoji.

**Cómo funciona:**
1. Ña'a ni dueño dispositivo comparan secuencias emoji (nuu persona, por teléfono, o vía canal confiable)
2. Si emoji coinciden, dispositivo confirmado como perteneciente a dueño registrado
3. Verificación registrada — ña'as pueden ver qué dispositivos han sido verificados

Yaa protege contra atacante ke ha registrado dispositivo falso bajo cuenta otra persona. Secuencia emoji derivada claves identidad criptográficas ambos dispositivos ni código único — servidor no puede manipularla ni predecirla.

---

## Borrado cuenta

### Borrado autoservicio

Puede solicitar ke cuenta ni todos datos asociados sean permanentemente eliminados. Por defecto hay retraso (establecido por admin hub, típicamente 72 horas) antes borrado completa — yaa le da tiempo cancelar si solicitud fue hecha bajo coerción.

**Qué se elimina:**
- Claves dispositivo (haciendo todo contenido cifrado permanentemente ilegible, incluso desde respaldos)
- Registro cuenta, asignaciones rol, ni historial turnos
- Tokens notificación push

**Qué pasa nuu contenido cifrado creado**: Notas, transcripciones, ni reportes autorados se re-cifran nuu lectores autorizados restantes (otros ña'as). Copia clave descifrado se destruye. Contenido persiste nuu otros espectadores autorizados — no se elimina masivamente, porque llamantes ni historial caso pertenecen al hub, no a usted personalmente.

**Logs auditoría**: Entradas log auditoría se crypto-destruyen — clave cifrado por-usuario se destruye, haciendo entradas ilegibles. Cadena hash (estructura evidencia manipulación) permanece intacta.

### Borrado emergencia

Si cree cuenta está bajo amenaza inmediata, puede solicitar borrado emergencia nuu co-aprobador — otra persona confiable (ña'a o contacto confiable) ke aprueba urgencia. Yaa reduce retraso mínimo 4 horas. Piso 4 horas existe nuu proteger contra borrado coaccionado (siendo forzado eliminar evidencia antes ke ayuda llegue).

### Qué no puede borrarse

Metadatos llamada (quién respondió, cuándo, cuánto tiempo) son parte registro auditoría hub. Admin hub controla cuánto tiempo se retienen. Bajo GDPR, tiene derecho solicitar corrección o eliminación — contacte admin hub.

---

## Grupos recuperación

Si pierde todos dispositivos (teléfono destruido, laptop robada, todo), normalmente perdería acceso todos datos cifrados. Grupos recuperación solucionan yaa.

### Cómo funciona recuperación

Designa grupo contactos confiables (típicamente 3–5 personas) como grupo recuperación. Cada contacto mantiene "share" — pieza rompecabezas.

**Nu recuperar cuenta:**
1. Registra nuevo dispositivo ni inicia solicitud recuperación
2. Contactos recuperación reciben notificación
3. Después retraso configurable (nuu darle tiempo cancelar solicitud coaccionada), umbral número contactos (ej., 2 de 3) aprueban solicitud
4. Cada contacto aprobante envía share, cifrado directamente a nuevo dispositivo
5. Nuevo dispositivo combina shares nuu reconstruir clave recuperación, ke restaura acceso datos cifrados

**Qué puede ver servidor**: Servidor retransmite fragmentos share cifrados entre dispositivos. No puede leer shares, no puede reconstruir clave recuperación solo, ni no puede evadir requisito umbral.

### Propiedades seguridad grupos recuperación

- **Seguridad umbral**: Shares bajo umbral no revelan nada sobre secreto — share holder único no puede recuperar cuenta solo
- **Sin involucramiento servidor nuu secreto**: Shares cifrados directamente a clave pública nuevo dispositivo; servidor almacena ni retransmite solo ciphertext
- **Ámbito por-hub**: Recuperación restaura acceso a hub específico. Si está nuu múltiples hubs, cada hub tiene grupo recuperación propio
- **Retraso nuu cancelación**: Puede cancelar solicitud recuperación durante período retraso — protección contra alguien iniciando solicitud recuperación su nombre sin conocimiento
- **Verificación Signal**: Solicitudes recuperación verificadas vía Signal nuu confirmar control cuenta Signal asociada identidad

### Elegir contactos recuperación

Elija personas confiables ke:
- Son alcanzables independientemente (no todos nuu misma ubicación u organización)
- Usan Signal ellos mismos (requerido nuu paso verificación)
- Entienden ke ocasionalmente se les pedirá aprobar solicitudes recuperación

Contactos recuperación no ganan acceso datos cifrados manteniendo share — solo pueden ayudarle recuperar cuando usted inicia solicitud.

---

## Privacidad número teléfono voluntario

Cuando voluntarios reciben llamadas a teléfonos personales, números expuestos a proveedor telefonía.

| Escenario | Número teléfono visible a |
|----------|------------------------|
| Llamada PSTN a teléfono voluntario | Proveedor telefonía, carrier teléfono |
| Navegador-a-navegador (WebRTC) | Nadie (audio permanece nuu navegador) |
| Asterisk autoalojado + teléfono SIP | Solo servidor Asterisk |

**Nu proteger números teléfono voluntarios**: Use llamadas basadas navegador (WebRTC) o proporcione teléfonos SIP conectados a Asterisk autoalojado.

---

## Enviado recientemente

Estas mejoras están activas hoy:

| Característica | Beneficio privacidad |
|---------|-----------------|
| Gestión dispositivos | Ver ni revocar cualquier dispositivo conectado; revocación activa rotación clave asi ke dispositivo removido no puede leer contenido nuevo |
| Verificación dispositivo SAS emoji | Ña'as pueden verificar dispositivos nuu persona usando huella criptográfica mostrada como 7 emoji — no puede ser falsificada por servidor |
| Borrado cuenta nuu retraso | Solicitar eliminación cuenta; retraso configurable permite cancelar si solicitud fue coaccionada |
| Borrado emergencia | Borrado acelerado co-aprobado nuu piso mínimo 4 horas |
| Crypto-destrucción nuu borrado | Claves cifrado destruidas primero, haciendo contenido permanentemente ilegible antes cualquier eliminación base datos |
| Grupos recuperación (Shamir) | Designe contactos confiables ke pueden ayudarle recuperar si pierde todos dispositivos — shares bajo umbral no revelan nada |
| Mensajería broadcast nuu divulgación honesta | Ña'as pueden enviar mensajes masivos; servidor procesa texto plano momentáneamente nuu entrega (divulgado claramente nuu UI) |
| Hashing suscriptores | Números teléfono suscriptores broadcast almacenados como identificadores hasheados — no lista suscriptores texto plano nuu base datos |
| Protección clave Argon2id | Claves dispositivo protegidas por función memory-hard ke resiste ataques fuerza bruta nuu GPUs ni hardware especializado |
| Enrutamiento preferente Signal | Mensajes automáticamente enrutados a través Signal cuando disponible, manteniendo contenido fuera logs proveedor SMS |
| Modo notificación SMS | Destinatarios SMS ven solo "tiene nuevo mensaje" — sin contenido sensible nuu logs proveedor |
| Resistencia análisis tráfico | Tamaños evento tiempo real rellenados asi ke observadores no pueden distinguir mensajes cortos largos |
| Sin números teléfono texto plano nuu base datos | Números llamante almacenados como hashes irreversibles — base datos nunca contiene número teléfono real |
| Cifrado por-hub nuu secreto adelante | Eventos tiempo real cada hub cifrados nuu claves rotadas cada 24 horas — claves antiguas no pueden descifrar eventos nuevos |
| Criptografía nuu Rust nuu todas plataformas | Escritorio, iOS, ni Android corren misma biblioteca criptografía Rust auditada — claves nunca entran JavaScript, Swift, o Kotlin |
| Acceso relé restringido | Relé WebSocket acepta eventos solo desde servidor — ninguna parte externa puede inyectar notificaciones falsas |
| Almacenamiento mensajes cifrado | Mensajes SMS, WhatsApp, ni Signal almacenados como ciphertext nuu servidor |
| Transcripción dispositivo | Audio nunca sale dispositivo — procesado completamente dispositivo usando IA local |
| Protección clave multifactor | Claves cifrado protegidas por PIN, proveedor identidad, ni opcionalmente llave seguridad hardware |
| Llaves seguridad hardware | Llaves físicas añaden tercer factor ke no puede comprometerse remotamente |
| Construcciones reproducibles | Verifique ke código desplegado coincide nuu fuente pública |
| Directorio contacto cifrado | Registros contacto, relaciones, ni notas cifrados extremo a extremo |

## Aún planeado

| Característica | Beneficio privacidad | Estado |
|---------|-----------------|--------|
| Apps nativas recepción llamadas | Sin números teléfono personales expuestos | Nu desarrollo |
| Certificate pinning (móvil) | Defensa contra interceptación TLS CA rogue | Andamiaje completo; pins pendientes primer despliegue |
| Cifrado media voz SFrame | Llamadas voz cifradas extremo a extremo | Derivación clave completa; cifrado por-frame planeado |

---

## Tabla resumen

| Tipo datos | Cifrado | Visible servidor | Obtenible bajo subpoena |
|-----------|-----------|-------------------|---------------------------|
| Notas llamada | Saa (extremo a extremo) | No | Solo ciphertext |
| Transcripciones | Saa (extremo a extremo) | No | Solo ciphertext |
| Reportes | Saa (extremo a extremo) | No | Solo ciphertext |
| Registros caso / datos entidad | Saa (extremo a extremo) | No | Solo ciphertext |
| Archivos adjuntos | Saa (extremo a extremo) | No | Solo ciphertext |
| Registros contacto | Saa (extremo a extremo) | No | Solo ciphertext |
| Identidades voluntarios | Saa (extremo a extremo) | No | Solo ciphertext |
| Metadatos equipo/rol | Saa (cifrado) | No | Solo ciphertext |
| Definiciones campos personalizados | Saa (cifrado) | No | Solo ciphertext |
| Contenido SMS/WhatsApp/Signal entrante | Saa (nuu servidor) | No | Ciphertext desde servidor; proveedor puede tener original |
| Mensajes broadcast salientes | **No — texto plano durante entrega** | **Saa, momentáneamente** | Saa (texto plano nuu momento envío) |
| Shares recuperación | Saa (extremo a extremo a dispositivo destinatario) | No | Solo ciphertext |
| Eventos tiempo real | Saa (por-hub, claves rotadas) | No | Solo ciphertext |
| Metadatos llamada | No | Saa | Saa |
| Registros entrega broadcast | No | Saa | Saa |
| Hashes teléfono llamante | Hash HMAC | Solo hash | Hash (no reversible sin secreto) |
| Hashes teléfono suscriptor | Hash HMAC | Solo hash | Hash (no reversible sin secreto) |
| Cadenas User-Agent | Hash SHA-256 | Solo hash | Hash (no reversible) |

---

## Nuu auditores seguridad

Documentación técnica:

- [Especificación Protocolo](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/PROTOCOL.md)
- [Modelo Amenazas](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/THREAT_MODEL.md)
- [Clasificación Datos](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Brechas Seguridad ni Hoja Ruta](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/SECURITY_GAPS_AND_ROADMAP.md)
- [Auditorías Seguridad](https://github.com/rhonda-rodododo/llamenos-platform/tree/main/docs/security)
- [Documentación API](/api/docs)

Llámenos es código abierto: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
