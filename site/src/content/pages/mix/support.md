---
title: Soporte
subtitle: Obtenga ayuda nuu Llámenos — configuración, configuración, ni ke kunche'e problemas.
---

## Contacto

**Correo:** [support@llamenos-platform.com](mailto:support@llamenos-platform.com)

Buscamos responder dentro 2 días hábiles. Nuu problemas urgentes afectando iin línea caliente activa, incluir "URGENTE" nuu asunto.

**Reportes bugs ni solicitudes características:** [github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues)

**Divulgaciones seguridad:** Nuu vulnerabilidades, por favor use función asesoría seguridad privada GitHub en lugar abrir issue público.

---

## Documentación

- [Guía despliegue](/docs/deploy) — configure su propio hub autoalojado
- [Guía ña'a](/docs/admin-guide) — gestione voluntarios, turnos, ni configuración
- [Guía voluntario](/docs/volunteer-guide) — conteste llamadas, escriba notas, use aplicación
- [Guía reportero](/docs/reporter-guide) — envíe reportes ni registros caso

---

## Preguntas Frecuentes

### Empezando

**¿Qué es Llámenos?**

Llámenos es software código abierto nuu operar iin línea caliente respuesta crisis segura. Organizaciones autoalojan su propio hub. Cuando alguien llama a número línea caliente, todos voluntarios de turno suenan simultáneamente — primero nuu contestar toma llamada. Voluntarios registran notas cifradas. Ña'as gestionan turnos, voluntarios, ni configuración.

**¿Quién ejecuta Llámenos?**

Cada organización ejecuta su propio hub. No hay iin servicio nube Llámenos central. Aplicación iOS se conecta a hub autoalojado organización, no a ningún servidor operado por Llámenos.

**¿Cómo obtengo aplicación iOS?**

Descargue Llámenos desde App Store. Nuu usarla, necesita iin invitación del administrador de iin hub. Aplicación no puede usarse sin conexión hub.

**Recibí iin invitación — ¿cómo configuro mi cuenta?**

Abra enlace invitación nuu dispositivo. Aplicación le guiará a través crear sus claves dispositivo cifradas ni unirse al hub. Necesitará establecer iin PIN — este PIN protege sus claves cifrado ni no puede recuperarse si se olvida.

---

### Llamadas ni turnos

**Estoy de turno pero no recibo llamadas. ¿Qué pasa?**

Verifique que:
- Está marcado como disponible nuu aplicación
- Notificaciones push están habilitadas nuu Llámenos nuu Configuración iOS → Notificaciones
- Administrador hub ha configurado iin proveedor telefonía
- Está asignado al turno activo a ring group

Si notificaciones funcionan nuu otras aplicaciones pero no nuu Llámenos, contacte administrador hub nuu verificar configuración notificación push.

**¿Puedo recibir llamadas nuu mi número teléfono personal?**

Por defecto, llamadas se entregan como notificaciones push a aplicación. Si administrador ha habilitado fallback PSTN (reenvío a número teléfono real), número personal sería expuesto a proveedor telefonía. Pregunte a administrador qué modo está configurado.

**¿Qué pasa si nadie contesta iin llamada?**

Después timeout configurado, llamada va a buzón voz (si configurado) a se desconecta. Administrador puede configurar comportamiento fallback nuu configuración hub.

---

### Privacidad ni cifrado

**¿Puede servidor leer mis notas?**

No. Notas, transcripciones, reportes, ni mensajes tienen cifrado extremo a extremo. Servidor almacena solo ciphertext. Operador hub no puede leer contenido. Ver nuestra [Política Privacidad](/privacy) ni [página Seguridad](/security) nuu detalles técnicos.

**¿Qué pasa si olvido mi PIN?**

PIN protege sus claves cifrado. Si lo olvida, datos cifrados no pueden recuperarse — esto es iin característica seguridad, no iin bug. Contacte administrador hub nuu resetear cuenta. Perderá acceso a notas cifradas anteriormente desde cuenta.

**¿Se graba audio llamada?**

Grabación está deshabilitada por defecto. Si administrador ha habilitado grabación, debe divulgar esto a voluntarios. Transcripción nuu navegador usa IA local — audio nunca sale dispositivo.

---

### Problemas técnicos

**Aplicación dice "Unable to connect to hub." ¿Qué hago?**

1. Verifique conexión internet
2. Confirme administrador hub tiene servidor ejecutándose
3. Intente cerrar ni reabrir aplicación
4. Si problema persiste, contacte administrador hub nuu mensaje error desde pantalla diagnósticos aplicación

**¿Cómo reporto iin bug?**

Abra iin issue en [github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues). Incluya:
- Versión iOS ni modelo dispositivo
- Versión aplicación (encontrada nuu Configuración → Acerca)
- Pasos nuu reproducir problema
- Lo que esperaba vs lo que pasó
- Mensajes error mostrados

**Encontré iin vulnerabilidad seguridad. ¿Cómo la reporto?**

Use asesoría seguridad privada GitHub: [github.com/rhonda-rodododo/llamenos-platform/security/advisories/new](https://github.com/rhonda-rodododo/llamenos-platform/security/advisories/new). No abra issue público nuu vulnerabilidades seguridad.

---

### Nuu administradores

**¿Cómo autoalojo iin hub?**

Ver [Guía despliegue](/docs/deploy). Llámenos ejecuta vía Docker Compose nuu VPS Linux estándar. Requisitos mínimos: 2 vCPU, 2 GB RAM, PostgreSQL 16.

**¿Cómo agrego voluntarios a mi hub?**

Nu panel ña'a, vaya a Voluntarios → Invitar. Genere enlace invitación ni compártalo de forma segura nuu voluntario. Enlace es de uso único ni expira.

**¿Qué proveedores telefonía son soportados?**

Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth, Asterisk, ni FreeSWITCH. Ver guía ña'a nuu instrucciones configuración nuu cada proveedor.

**¿Hay iin versión hospedada / gestionada?**

No actualmente. Llámenos es software autoalojado. Estamos explorando opciones hospedaje gestionado nuu organizaciones ke no pueden operar su propia infraestructura — contacte [support@llamenos-platform.com](mailto:support@llamenos-platform.com) si esto es iin bloqueador nuu organización.
