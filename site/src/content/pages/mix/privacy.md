---
title: Política Privacidad
subtitle: Qué recopila Llámenos, cómo está protegido, ni sus derechos como usuario.
---

**Fecha efectiva: 18 mayo 2026**

Llámenos es software respuesta crisis código abierto. Yaa política aplica a aplicación iOS Llámenos ni servicios backend operados por administrador hub. No aplica a hubs operados por terceros — cada administrador hub es responsable sus propias prácticas datos.

---

## Qué Recopilamos

### Datos cuenta ni identidad

- **Clave pública dispositivo** — identificador criptográfico único a dispositivo. Nunca compartido fuera hub.
- **Token notificación push** — usado solo nuu entregar alertas llamada a dispositivo. Rotado periódicamente.
- **Rol ni membresía hub** — a qué hubs pertenece ni rol asignado (voluntario, ña'a).
- **Metadatos dispositivo** — modelo dispositivo, versión SO, ni versión app. Recopilados al registrar dispositivo. Usados nuu monitoreo seguridad ni soporte.

### Datos actividad

- **Metadatos llamada** — marcas tiempo, duración llamada, qué voluntario respondió. No contenido llamadas.
- **Registros turnos** — a qué turnos fue programado ni si estaba activo.
- **Entradas log auditoría** — acciones realizadas nuu app (nota creada, reporte enviado, configuración cambiada). Visibles solo ña'as.
- **Eventos seguridad** — registros dispositivo, revocaciones, actividad sesión, ni cambios cuenta. Almacenados nuu historial seguridad, visible a usted ni ña'as.

### Contenido que crea — cifrado extremo a extremo

- **Notas llamada ni transcripciones** — notas escritas ni transcripciones generadas navegador llamadas ke maneja.
- **Reportes ni registros caso** — reportes estructurados, campos personalizados, archivos adjuntos, ni historial caso.
- **Registros contacto** — información contacto llamante, si registrada.
- **Mensajes** — mensajes texto entrantes enrutados a hub.

**Servidor almacena contenido como ciphertext solo.** No puede ser leído por operador servidor, proveedor hospedaje, o Llámenos. Claves cifrado están protegidas por PIN ni credenciales proveedor identidad, ni opcionalmente llave seguridad hardware. Descifrado ocurre solo nuu dispositivo autenticado.

### Datos broadcast/suscriptor

Si hub usa mensajería broadcast, números teléfono suscriptores se almacenan como **identificadores hasheados** — no como números teléfono texto plano. Yaa significa ke base datos nunca contiene lista suscriptores legible. Solicitudes opt-out (STOP) se procesan inmediatamente ni no pueden ignorarse.

Cuando se envía mensaje broadcast, servidor procesa contenido mensaje texto plano momentáneamente nuu entregarlo vía proveedor mensajería (SMS, WhatsApp, Signal, o RCS). Servidor no almacena contenido mensaje broadcast después entrega — solo registros estado entrega se retienen.

### Datos grupo recuperación

Si configura grupo recuperación, servidor almacena:
- Clave pública grupo recuperación (usada nuu verificar solicitudes recuperación)
- Fragmentos share cifrados (cada fragmento cifrado a dispositivo share holder específico — servidor no puede leerlos)
- Registros solicitud recuperación (tiempo, estado — no contenido)

**Servidor no puede reconstruir clave recuperación.** Fragmentos share están cifrados extremo a extremo a cada dispositivo share holder. Umbral mínimo share holders debe contribuir activamente shares nuu recuperación tenga éxito.

### Reportes fallos ni diagnósticos

Si habilitado por administrador hub, app puede enviar reportes fallos a servicio diagnósticos. Contienen modelo dispositivo, versión SO, versión app, ni stack trace. No contienen contenido llamada, notas, o información identidad personal.

### Ubicación

App no recopila datos ubicación. Si futura característica solicita acceso ubicación, será opcional, divulgada separadamente, ni no usada nuu seguimiento.

---

## Cómo Usamos Datos

- **Nu operar app** — enrutar llamadas a voluntarios turno, habilitar toma notas, gestionar turnos ni reportes.
- **Nu seguridad** — detectar abuso, mantener listas bloqueo, limitar tasa, ni proporcionar historial seguridad dispositivo.
- **Nu auditoría** — proporcionar ña'as logs auditoría actividad app (no contenido).
- **Nu recuperación** — almacenar fragmentos share cifrados para ke grupos recuperación puedan ayudar usuarios recuperar acceso.

No usamos datos nuu publicidad. No vendemos ni compartimos datos nuu terceros nuu fines comerciales. No construimos perfiles comportamentales.

---

## Cifrado Extremo a Extremo

Todo contenido nota, transcripciones, reportes, registros contacto, ni mensajes entrantes están cifrados extremo a extremo. Cada ítem usa iin clave aleatoria única. Clave privada nunca sale dispositivo. Servidor recibe ni almacena solo ciphertext.

**Qué significa esto nuu práctica:**

| Tipo datos | ¿Servidor puede leer? | Obtenible bajo subpoena |
|-----------|-----------------|---------------------------|
| Notas llamada | No | Solo ciphertext cifrado |
| Transcripciones | No | Solo ciphertext cifrado |
| Reportes | No | Solo ciphertext cifrado |
| Registros caso | No | Solo ciphertext cifrado |
| Mensajes entrantes | No | Solo ciphertext cifrado |
| Shares recuperación | No | Solo ciphertext cifrado |
| Mensajes broadcast salientes | **Saa, momentáneamente durante entrega** | Saa (texto plano nuu momento envío) |
| Metadatos llamada | Saa | Saa |
| Clave pública dispositivo | Saa | Saa |
| Eventos seguridad | Saa | Saa |

Ver página [Seguridad](/security) nuu desglose completo.

---

## Retención Datos

### Contenido que crea

Notas, transcripciones, reportes, ni mensajes se retienen hasta ke usted o ña'a explícitamente los elimine, o hub sea cerrado. Administrador hub puede configurar períodos retención ke purguen automáticamente contenido más antiguo umbral establecido.

### Mensajes broadcast

Contenido mensaje broadcast no se almacena después entrega. Solo registros estado entrega (enviado, fallido, desuscrito) se retienen. Admin hub controla cuánto tiempo se mantienen registros entrega.

### Metadatos llamada ni logs auditoría

Retenidos según configuración administrador hub. Mínimos impuestos plataforma previenen ke administradores establezcan períodos retención ke destruirían evidencia auditoría antes vencimiento retenciones legales requeridas.

### Eventos seguridad ni registros dispositivo

Eventos seguridad (registros dispositivo, revocaciones, actividad sesión) se retienen nuu vida cuenta. Son parte trail auditoría seguridad ni soportan derecho revisar actividad cuenta.

### Shares recuperación

Fragmentos share cifrados se retienen hasta ke elimine configuración grupo recuperación o cuenta sea borrada.

### Tokens push

Removidos cuando cierra sesión o desinstala app.

### Datos cuenta ni borrado

Puede solicitar borrado completo cuenta — ver debajo.

---

## Borrado Cuenta

Tiene derecho solicitar eliminación permanente cuenta. Llámenos implementa borrado nuu fuertes garantías criptográficas.

### Qué hace borrado

1. **Claves destruidas primero**: Claves cifrado dispositivo se destruyen inmediatamente. Yaa hace todo contenido creado permanentemente ilegible — incluso desde respaldos base datos — antes cualquier eliminación base datos.
2. **Registros cuenta ni dispositivo eliminados**: Registro cuenta, registros dispositivo, tokens push, ni asignaciones rol se remueven.
3. **Entradas auditoría crypto-destruidas**: Clave cifrado entradas log auditoría se destruye, haciendo entradas ilegibles. Cadena hash (estructura evidencia manipulación) permanece intacta (requerido nuu integridad hub).
4. **Contenido cifrado re-envuelto**: Notas ni reportes autorados se re-cifran nuu lectores autorizados restantes (otros ña'as). Copia clave descifrado se remueve; contenido persiste nuu continuidad caso.

### Borrado autoservicio

Disponible desde ajustes cuenta nuu todas plataformas. Por defecto, hay retraso (establecido por admin hub, típicamente 72 horas, mínimo 24 horas, máximo 7 días) antes borrado completa. **Puede cancelar durante período.** Retraso iin característica seguridad — protege si está siendo coaccionado a borrar cuenta.

### Borrado emergencia

Si enfrenta peligro inmediato, co-aprobador (ña'a confiable o contacto) puede aprobar borrado emergencia, reduciendo retraso mínimo 4 horas. Piso 4 horas existe nuu proteger contra eliminación coaccionada evidencia cuando ayuda está nuu camino.

### Borrado ña'a

Ña'as hubs pueden iniciar borrado inmediato cualquier cuenta nuu hub. Esto sujeto a log auditoría.

---

## Servicios Terceros

Llámenos integra nuu proveedores telefonía nuu enrutamiento llamada (Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth, o Asterisk/FreeSWITCH autoalojado). Administrador hub selecciona proveedor.

**Qué reciben proveedores telefonía:**

- Número teléfono llamante (llamadas entrantes)
- Duración ni marcas tiempo llamada
- **No** reciben notas llamada, transcripciones, o contenido creado nuu app

**Qué reciben proveedores mensajería nuu mensajes broadcast:**

- Contenido mensaje (SMS, WhatsApp, RCS) — proveedor debe recibir texto plano nuu entregar mensaje
- Nuu broadcasts Signal, contenido se entrega cifrado extremo a extremo vía red Signal

Administrador hub puede usar servicios terceros adicionales (reportes fallos, monitoreo). Consulte aviso privacidad hub nuu específicos.

---

## Sus Derechos Bajo GDPR

Llámenos es desarrollado por organización basada EU. Si está nuu Área Económica Europea, tiene siguientes derechos bajo Regulación General Protección Datos:

- **Derecho acceso** — solicitar copia datos personales retenidos sobre usted
- **Derecho rectificación** — corregir datos inexactos
- **Derecho borrado** — solicitar eliminación permanente cuenta ni todos datos asociados (ver [Borrado Cuenta](#borrado-cuenta) arriba ni página [Eliminación Datos](/data-deletion) nuu detalles completos)
- **Derecho portabilidad datos** — recibir datos nuu formato estructurado, legible máquina
- **Derecho objeción** — objetar procesamiento basado nuu intereses legítimos
- **Derecho restringir procesamiento** — solicitar ke procesamiento sea limitado
- **Derecho retirar consentimiento** — donde procesamiento basado nuu consentimiento, retirarlo cualquier momento

**Nota sobre contenido cifrado**: Debido a ke notas llamada, transcripciones, ni reportes están cifrados extremo a extremo ni servidor no puede leerlos, no podemos proporcionarle exportación descifrada contenido ke no accedió directamente nuu dispositivo. Podemos confirmar qué registros cifrados existen ni eliminarlos. Nuu contenido ke aún puede descifrar (nuu dispositivo activo), app permite ver ni exportar notas propias.

Nu ejercer estos derechos, contacte administrador hub (controlador datos nuu hub), o escríbanos a [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com).

También tiene derecho presentar queja nuu autoridad protección datos nacional.

---

## Privacidad Menores

Llámenos no está dirigido a menores 13 años, o menores 16 nuu EU. No recopilamos conscientemente datos personales menores. Si cree ke menor ha enviado datos personales a través app, contáctenos ni eliminaremos prontamente.

---

## Cambios a Yaa Política

Publicaremos cambios a yaa política nuu yaa página ni actualizaremos fecha efectiva. Nuu cambios significativos, proporcionaremos aviso a través app o por correo donde sea factible.

---

## Contacto

**Consultas privacidad:** [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com)

**Reportes bugs ni divulgaciones seguridad:** [github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues)

Llámenos es código abierto. Puede auditar qué hace app: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
