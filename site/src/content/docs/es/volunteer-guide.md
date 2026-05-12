---
title: Guia de Voluntario
description: Todo lo que necesitas saber como voluntario — iniciar sesion, recibir llamadas, responder mensajes, escribir notas y usar la transcripcion.
---

Esta guia cubre todo lo que necesitas saber como voluntario: iniciar sesion, recibir llamadas, responder mensajes, escribir notas y usar la funcion de transcripcion.

## Obtener tus credenciales

Tu administrador te dara una de las siguientes opciones:

- Un **nsec** (clave secreta WebSocket) -- una cadena que comienza con `nsec1`
- Un **enlace de invitacion** -- una URL de uso unico que genera credenciales para ti

**Mantén tu nsec en privado.** Es tu identidad y credencial de inicio de sesion. Cualquier persona con tu nsec puede hacerse pasar por ti. Guardalo en un gestor de contrasenas.

## Iniciar sesion

1. Abre la aplicacion de la linea en tu navegador
2. Pega tu `nsec` en el campo de inicio de sesion
3. La aplicacion verifica tu identidad criptograficamente: tu clave secreta nunca sale de tu navegador

Despues del primer inicio de sesion, se te pedira que establezcas tu nombre para mostrar y tu idioma preferido.

### Inicio de sesion con passkey (opcional)

Si tu administrador ha habilitado passkeys, puedes registrar una llave de hardware o biometrico en **Configuracion**. Esto te permite iniciar sesion en otros dispositivos sin escribir tu nsec.

## El panel principal

Despues de iniciar sesion, veras el panel principal con:

- **Llamadas activas** -- llamadas que se estan atendiendo en este momento
- **Estado de tu turno** -- mostrado en la barra lateral (turno actual o proximo turno programado)
- **Voluntarios en linea** -- cantidad de voluntarios disponibles

## Recibir llamadas

Cuando entra una llamada durante tu turno, seras notificado mediante:

- Un **tono de llamada** en el navegador (se puede activar/desactivar en Configuracion)
- Una **notificacion push** si has dado permiso
- Un **titulo de pestana parpadeante**

Haz clic en **Contestar** para tomar la llamada. Tu telefono sonara: contestalo para conectarte con la persona que llama. Si otro voluntario contesta primero, el timbre se detiene.

## Durante una llamada

Mientras estas en una llamada, veras:

- Un **temporizador de llamada** mostrando la duracion
- Un **panel de notas** donde puedes escribir notas en tiempo real
- Un **boton de reportar spam** para marcar a la persona que llama

Las notas se guardan automaticamente como borradores cifrados. Tambien puedes guardar la nota manualmente.

## Escribir notas

Las notas se cifran en tu navegador antes de enviarse al servidor. Solo tu y el administrador pueden leerlas.

Si tu administrador ha configurado campos personalizados (texto, desplegable, casilla de verificacion, etc.), apareceran en el formulario de notas. Llenalos segun sea relevante: se cifran junto con el texto de tu nota.

Navega a **Notas** en la barra lateral para revisar, editar o buscar tus notas anteriores. Puedes exportar tus notas como un archivo cifrado.

## Transcripcion

Si la transcripcion esta habilitada (por el administrador y por tu propia preferencia), las llamadas se transcriben automaticamente despues de que terminan. La transcripcion aparece junto a tu nota para esa llamada.

Puedes activar o desactivar la transcripcion en **Configuracion**. Cuando esta desactivada, tus llamadas no se transcribiran sin importar la configuracion global del administrador.

Las transcripciones se cifran en reposo: el servidor procesa el audio temporalmente y luego cifra el texto resultante.

## Conversaciones

Si tu administrador ha habilitado canales de mensajeria (SMS, WhatsApp o Signal), veras un enlace de **Conversaciones** en la barra lateral. Esto muestra las conversaciones con hilos de personas que contactaron la linea por texto.

Cada conversacion muestra:
- Burbujas de mensajes con marcas de tiempo mostrando quien envio que
- El canal por el que llego el mensaje (SMS, WhatsApp, Signal)
- Los nuevos mensajes aparecen en tiempo real

Para responder, escribe tu mensaje en el cuadro de respuesta en la parte inferior de la conversacion. Tu respuesta se envia por el mismo canal que la persona uso para contactarte.

## Tomar un descanso

Activa el interruptor de **descanso** en la barra lateral para pausar las llamadas entrantes sin abandonar tu turno. Las llamadas no sonaran en tu telefono mientras estes en descanso. Desactivalo cuando estes listo.

## Consejos

- Usa <kbd>Ctrl</kbd>+<kbd>K</kbd> (o <kbd>Cmd</kbd>+<kbd>K</kbd> en Mac) para abrir la paleta de comandos y navegar rapidamente
- Presiona <kbd>?</kbd> para ver todos los atajos de teclado
- Instala la aplicacion como PWA para una experiencia nativa y mejores notificaciones
- Manten tu pestana del navegador abierta durante tu turno para recibir alertas de llamadas en tiempo real
- Usa la pagina de **Ayuda** (enlace en la barra lateral o paleta de comandos) para preguntas frecuentes, guias y atajos de teclado
