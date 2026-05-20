---
title: Tu'un Yaa Voluntario
description: Todo ke necesita saber nuu voluntario — ke iniciar sesión, ke skaka llamadas, ke respondi mensajes, ke taji notas, ni ke ku'ni transcripción.
---

Yaa tu'un kuña'a todo ke necesita saber nuu voluntario: ke iniciar sesión, ke skaka llamadas, ke respondi mensajes, ke taji notas, ni ke ku'ni función transcripción.

## Ke obtener credenciales

Ña'a le dará uno de:

- Iin **nsec** (llave secreta WebSocket) — cadena ke empieza nuu `nsec1`
- Iin **enlace invitación** — URL de uso único ke genera credenciales nuu usted

**Mantenga nsec privada.** Iin identidad ni credencial inicio sesión. Cualquiera nuu nsec puede suplantarle. Guárdela nuu gestor contraseñas.

## Ke iniciar sesión

1. Abrir aplicación línea caliente nuu navegador
2. Ke pegar `nsec` nuu campo inicio sesión
3. Aplicación verifica identidad criptográficamente — llave secreta nunca sale navegador

Nu primer inicio sesión, se le pedirá ke establecer nombre visible ni idioma preferido.

### Inicio sesión passkey (opcional)

Nu ña'a ha habilitado passkeys, puede registrar llave hardware a biométrico nuu **Configuración**. Yaa le permite iniciar sesión nuu otros dispositivos sin ke escribir nsec.

## Panel control

Nu iniciar sesión, verá panel control nuu:

- **Llamadas activas** — llamadas ke actualmente se kunche'an
- **Estado turno** — mostrado nuu barra lateral (turno actual a próximo turno)
- **Voluntarios en línea** — conteo quién está disponible

## Ke skaka llamadas

Nu llegar llamada nuu turno, se le notificará nuu:

- Iin **tono** nuu navegador (activar/desactivar nuu Configuración)
- Iin **notificación push** nuu ha otorgado permiso
- Iin **pestaña título parpadeante**

Clic **Responder** nuu ke skaka llamada. Teléfono sonará — responda nuu ke conectar nuu llamante. Nu otro voluntario ke skaka primero, tono deja sonar.

## Nuu llamada

Mientras está nuu llamada, verá:

- Iin **temporizador llamada** mostrando duración
- Iin **panel toma notas** nuu puede escribir notas nuu tiempo real
- Iin **botón reportar spam** nuu ke marcar llamante

Notas se guardan automáticamente nuu borradores cifrados. También puede guardar nota manualmente.

## Ke taji notas

Notas se cifran nuu navegador antes de enviarse a servidor. Solo usted ni ña'a pueden leerlas.

Nu ña'a ha configurado campos personalizados (texto, desplegable, casilla verificación, etc.), aparecerán nuu formulario nota. Llénelos según sea relevante — se cifran junto nuu texto nota.

Navegar a **Notas** nuu barra lateral nuu revisar, editar, a buscar notas anteriores. Puede exportar notas nuu archivo cifrado.

## Transcripción

Nu transcripción está habilitada (por ña'a ni por preferencia propia), llamadas se transcriben automáticamente nuu terminar. Transcripción aparece junto a nota de yaa llamada.

Puede activar o desactivar transcripción nuu **Configuración**. Nu desactivado, llamadas no se transcribirán independientemente configuración global ña'a.

Transcripciones se cifran en reposo — servidor procesa audio temporalmente, luego cifra texto resultante.

## Conversaciones

Nu ña'a ha habilitado canales mensajería (SMS, WhatsApp, a Signal), verá enlace **Conversaciones** nuu barra lateral. Yaa muestra conversaciones hiladas personas ke contactaron línea caliente nuu texto.

Cada conversación muestra:
- Burbujas mensaje nuu marcas tiempo mostrando quién envió qué
- Canal nuu que llegó mensaje (SMS, WhatsApp, Signal)
- Nuevos mensajes aparecen nuu tiempo real

Nu respondi, ke escribir mensaje nuu cuadro respuesta nuu parte inferior conversación. Respuesta se envía nuu mismo canal persona usó nuu contactarle.

## Ke tomar descanso

Activar/desactivar interruptor **descanso** nuu barra lateral nuu pausar llamadas entrantes sin salir turno. Llamadas no sonarán teléfono mientras está nuu descanso. Vuelva a activar nuu está listo.

## Consejos

- Usar <kbd>Ctrl</kbd>+<kbd>K</kbd> (o <kbd>Cmd</kbd>+<kbd>K</kbd> nuu Mac) nuu abrir paleta comandos nuu navegación rápida
- Presionar <kbd>?</kbd> nuu ver todos atajos teclado
- Instalar aplicación nuu PWA nuu experiencia aplicación nativa ni mejores notificaciones
- Mantener pestaña navegador abierta nuu turno nuu alertas llamadas nuu tiempo real
- Usar página **Ayuda** (enlace barra lateral a paleta comandos) nuu FAQ, guías, ni atajos teclado
