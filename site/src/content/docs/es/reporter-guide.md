---
title: Guia de Reportero
description: Como enviar reportes cifrados y dar seguimiento a su estado.
---

Como reportero, puedes enviar reportes cifrados a tu organizacion a traves de la plataforma Llamenos. Los reportes estan cifrados de extremo a extremo — el servidor nunca ve el contenido de tu reporte.

## Primeros pasos

Tu administrador te dara una de las siguientes opciones:
- Un **nsec** (clave secreta WebSocket) — una cadena que comienza con `nsec1`
- Un **enlace de invitacion** — una URL de uso unico que crea credenciales para ti

**Manten tu nsec en privado.** Es tu identidad y credencial de inicio de sesion. Guardalo en un gestor de contrasenas.

## Iniciar sesion

1. Abre la aplicacion en tu navegador
2. Pega tu `nsec` en el campo de inicio de sesion
3. Tu identidad se verifica criptograficamente — tu clave secreta nunca sale de tu navegador

Despues del primer inicio de sesion, puedes registrar una passkey de WebAuthn en Configuracion para futuros inicios de sesion mas faciles.

## Enviar un reporte

1. Haz clic en **Nuevo Reporte** desde la pagina de Reportes
2. Ingresa un **titulo** para tu reporte (ayuda a los administradores a clasificar — se almacena en texto plano)
3. Selecciona una **categoria** si tu administrador ha definido categorias de reportes
4. Escribe el **contenido de tu reporte** en el campo del cuerpo — se cifra antes de salir de tu navegador
5. Opcionalmente llena cualquier **campo personalizado** que tu administrador haya configurado
6. Opcionalmente **adjunta archivos** — los archivos se cifran en el navegador antes de subirse
7. Haz clic en **Enviar**

Tu reporte aparece en tu lista de Reportes con estado "Abierto".

## Cifrado de reportes

- El cuerpo del reporte y los valores de campos personalizados se cifran usando ECIES (secp256k1 + XChaCha20-Poly1305)
- Los archivos adjuntos se cifran por separado usando el mismo esquema
- Solo tu y el administrador pueden descifrar el contenido
- El servidor almacena solo texto cifrado — incluso si la base de datos es comprometida, el contenido de tu reporte esta seguro

## Seguimiento de tus reportes

Tu pagina de Reportes muestra todos tus reportes enviados con:
- **Titulo** y **categoria**
- **Estado** — Abierto, Reclamado (un administrador esta trabajando en el), o Resuelto
- **Fecha** de envio

Haz clic en un reporte para ver el hilo completo, incluyendo las respuestas del administrador.

## Responder a administradores

Cuando un administrador responde a tu reporte, su respuesta aparece en el hilo del reporte. Puedes responder de vuelta — todos los mensajes en el hilo estan cifrados.

## Lo que no puedes hacer

Como reportero, tu acceso esta limitado para proteger la privacidad de todos:
- **Puedes** ver tus propios reportes y la pagina de Ayuda
- **No puedes** ver reportes de otros reporteros, registros de llamadas, informacion de voluntarios ni configuracion de admin
- **No puedes** contestar llamadas ni responder a conversaciones de SMS/WhatsApp/Signal

## Consejos

- Usa titulos descriptivos — ayudan a los administradores a clasificar sin descifrar el contenido completo
- Adjunta archivos relevantes (capturas de pantalla, documentos) cuando apoyen tu reporte
- Revisa periodicamente las respuestas del administrador — veras cambios de estado en tu lista de reportes
- Usa la pagina de Ayuda para preguntas frecuentes y guias
