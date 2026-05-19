---
title: Politica de Privacidad
subtitle: Que recopila Llamenos, como esta protegido y cuales son tus derechos como usuario.
---

**Fecha de vigencia: 18 de mayo de 2026**

Llamenos es software de respuesta a crisis de codigo abierto. Esta politica aplica a la aplicacion iOS de Llamenos y los servicios backend operados por tu administrador de hub. No aplica a hubs operados por terceros — cada administrador de hub es responsable de sus propias practicas de datos.

---

## Que Recopilamos

### Datos de cuenta e identidad

- **Clave publica del dispositivo** — un identificador criptografico unico a tu dispositivo. Nunca compartido fuera de tu hub.
- **Token de notificacion push** — usado solo para entregar alertas de llamadas a tu dispositivo. Rotado periodicamente.
- **Rol y membresia de hub** — a que hubs perteneces y tu rol asignado (voluntario, administrador).
- **Metadatos del dispositivo** — modelo, version de OS y version de la app. Recopilados al registrar un dispositivo.

### Datos de actividad

- **Metadatos de llamadas** — marcas de tiempo, duracion de llamadas, que voluntario respondio. No el contenido de las llamadas.
- **Registros de turnos** — que turnos estabas programado y si estabas activo.
- **Entradas de registro de auditoria** — acciones realizadas en la app. Visibles solo para administradores.
- **Eventos de seguridad** — registros de dispositivos, revocaciones, actividad de sesion y cambios de cuenta.

### Contenido que creas — cifrado de extremo a extremo

- **Notas y transcripciones de llamadas** — notas escritas y transcripciones generadas en el navegador.
- **Reportes y registros de casos** — reportes estructurados, campos personalizados, archivos adjuntos e historial de casos.
- **Registros de contactos** — informacion de contacto de llamantes, si se registra.
- **Mensajes** — mensajes de texto entrantes enrutados a tu hub.

**El servidor almacena este contenido solo como texto cifrado.** No puede ser leido por el operador del servidor, el proveedor de hosting o Llamenos. Tus claves de cifrado estan protegidas por tu PIN y credenciales del proveedor de identidad, y opcionalmente una llave de seguridad de hardware.

### Datos de difusion/suscriptores

Los numeros de telefono de suscriptores se almacenan como identificadores hasheados — no como numeros de telefono en texto plano. Cuando se envia un mensaje masivo, el servidor procesa el contenido en texto plano momentaneamente para entregarlo via el proveedor de mensajeria. El servidor no almacena el contenido de mensajes masivos despues de la entrega.

### Datos de grupos de recuperacion

Si configuras un grupo de recuperacion, el servidor almacena fragmentos de partes cifradas (cada fragmento cifrado al dispositivo de un poseedor de parte especifico — el servidor no puede leerlos). El servidor no puede reconstruir tu clave de recuperacion.

### Reportes de fallos y diagnosticos

Si esta habilitado por tu administrador de hub, la app puede enviar reportes de fallos a un servicio de diagnosticos. No contienen contenido de llamadas, notas ni informacion de identidad personal.

---

## Como Usamos los Datos

- **Para operar la app** — enrutar llamadas, habilitar toma de notas, gestionar turnos y reportes.
- **Para seguridad** — detectar abuso, mantener listas de bloqueo, limitar velocidad, y proporcionar historial de seguridad de dispositivos.
- **Para auditoria** — proporcionar a los administradores registros de auditoria de actividad de la app (no contenido).
- **Para recuperacion** — almacenar fragmentos cifrados para que los grupos de recuperacion puedan ayudar a los usuarios a recuperar acceso.

No usamos tus datos para publicidad. No vendemos ni compartimos tus datos con terceros con fines comerciales.

---

## Cifrado de Extremo a Extremo

Todo el contenido de notas, transcripciones, reportes, registros de contactos y mensajes entrantes esta cifrado de extremo a extremo. Cada elemento usa una clave aleatoria unica. Tu clave privada nunca sale de tu dispositivo.

| Tipo de dato | El servidor puede leer? | Obtenible bajo citacion |
|-------------|------------------------|------------------------|
| Notas de llamadas | No | Solo texto cifrado |
| Transcripciones | No | Solo texto cifrado |
| Reportes | No | Solo texto cifrado |
| Registros de casos | No | Solo texto cifrado |
| Mensajes entrantes | No | Solo texto cifrado |
| Fragmentos de recuperacion | No | Solo texto cifrado |
| Mensajes masivos salientes | **Si, momentaneamente durante entrega** | Si (texto plano al enviar) |
| Metadatos de llamadas | Si | Si |
| Tu clave publica del dispositivo | Si | Si |
| Eventos de seguridad | Si | Si |

---

## Retencion de Datos

### Contenido que creas

Retenido hasta que tu o un administrador lo elimine explicitamente, o tu hub sea cerrado. Tu administrador puede configurar periodos de retencion que purgan automaticamente el contenido antiguo.

### Mensajes masivos

El contenido de mensajes masivos no se almacena despues de la entrega. Solo se retienen registros de estado de entrega.

### Metadatos de llamadas y registros de auditoria

Retenidos segun la configuracion de tu administrador de hub.

### Fragmentos de recuperacion

Retenidos hasta que elimines la configuracion de tu grupo de recuperacion o tu cuenta sea borrada.

### Tokens push

Eliminados cuando cierras sesion o desinstala la app.

---

## Borrado de Cuenta

Tienes derecho a solicitar la eliminacion permanente de tu cuenta.

### Que hace el borrado

1. **Claves destruidas primero**: Las claves de cifrado de tu dispositivo se destruyen inmediatamente, haciendo todo el contenido permanentemente ilegible.
2. **Registros de cuenta eliminados**: Tu registro de cuenta, registros de dispositivos, tokens push y asignaciones de roles se eliminan.
3. **Entradas de auditoria crypto-destruidas**: La clave de cifrado para tus entradas de registro de auditoria se destruye.
4. **Contenido cifrado re-envuelto**: Las notas y reportes que escribiste se re-cifran para los lectores autorizados restantes. Tu acceso se elimina; el contenido persiste para continuidad del caso.

### Borrado por el usuario

Disponible desde la configuracion de tu cuenta en todas las plataformas. Por defecto hay un retraso (configurado por tu administrador de hub, minimo 24 horas, maximo 7 dias, tipicamente 72 horas). Puedes cancelar durante este periodo.

### Borrado de emergencia

Un co-aprobador puede aprobar el borrado de emergencia, reduciendo el retraso a un minimo de 4 horas.

---

## Servicios de Terceros

Llamenos se integra con proveedores de telefonia para el enrutamiento de llamadas. Tu administrador de hub selecciona el proveedor.

**Lo que reciben los proveedores de telefonia**: El numero de telefono del llamante (llamadas entrantes), duracion y marcas de tiempo. No reciben notas de llamadas, transcripciones ni ningun contenido que crees en la app.

**Lo que reciben los proveedores de mensajeria para mensajes masivos**: Contenido del mensaje (SMS, WhatsApp, RCS) — el proveedor debe recibir texto plano para entregar el mensaje. Para difusiones de Signal, el contenido se entrega cifrado de extremo a extremo via la red Signal.

---

## Tus Derechos bajo el RGPD

Llamenos es desarrollado por una organizacion con sede en la UE. Si eres del Espacio Economico Europeo, tienes los siguientes derechos:

- **Derecho de acceso** — solicitar una copia de datos personales que se tienen sobre ti
- **Derecho de rectificacion** — corregir datos inexactos
- **Derecho al borrado** — solicitar la eliminacion permanente de tu cuenta y todos los datos asociados (ver seccion de Borrado de Cuenta arriba)
- **Derecho a la portabilidad de datos** — recibir tus datos en un formato legible por maquina
- **Derecho a oponerte** — oponerte al procesamiento basado en intereses legitimos
- **Derecho a restringir el procesamiento** — solicitar que el procesamiento sea limitado
- **Derecho a retirar el consentimiento** — donde el procesamiento se basa en consentimiento, retirarlo en cualquier momento

Para ejercer estos derechos, contacta a tu administrador de hub o escribenos a [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com).

---

## Privacidad de Menores

Llamenos no esta dirigido a menores de 13 anos, o menores de 16 en la UE. No recopilamos datos personales de menores a sabiendas.

---

## Cambios a esta Politica

Publicaremos cualquier cambio en esta pagina y actualizaremos la fecha de vigencia.

---

## Contacto

**Consultas de privacidad:** [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com)

**Reportes de errores y divulgaciones de seguridad:** [github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues)

Llamenos es de codigo abierto: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
