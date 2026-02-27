---
title: Guia de la aplicacion movil
description: Instala y configura la aplicacion movil Llamenos en iOS y Android.
---

La aplicacion movil Llamenos permite a los voluntarios contestar llamadas, responder mensajes y escribir notas cifradas desde su telefono. Esta construida con React Native y comparte el mismo nucleo criptografico Rust que la aplicacion de escritorio.

## Que es la aplicacion movil?

La aplicacion movil es un complemento a la aplicacion de escritorio. Se conecta al mismo backend de Llamenos (Cloudflare Workers o autoalojado) y usa el mismo protocolo, para que los voluntarios puedan alternar entre escritorio y movil sin interrupciones.

La aplicacion movil esta en un repositorio separado (`llamenos-mobile`) pero comparte:

- **llamenos-core** -- El mismo crate Rust para todas las operaciones criptograficas, compilado via UniFFI para iOS y Android
- **Protocolo** -- El mismo formato de cable, endpoints de API y esquema de cifrado
- **Backend** -- El mismo Cloudflare Worker o servidor autoalojado

## Descargar e instalar

### Android

La aplicacion movil se distribuye actualmente como APK para instalacion manual:

1. Descarga el archivo `.apk` mas reciente de la pagina de [GitHub Releases](https://github.com/rhonda-rodododo/llamenos-mobile/releases/latest)
2. En tu dispositivo Android, ve a **Configuracion > Seguridad** y activa **Instalar de fuentes desconocidas** (o activalo por aplicacion cuando se te solicite)
3. Abre el APK descargado y toca **Instalar**
4. Una vez instalado, abre Llamenos desde el cajon de aplicaciones

La distribucion via App Store y Play Store esta planeada para una version futura.

### iOS

Los builds para iOS estan disponibles como versiones beta de TestFlight:

1. Instala [TestFlight](https://apps.apple.com/app/testflight/id899247664) desde la App Store
2. Pide a tu administrador el enlace de invitacion de TestFlight
3. Abre el enlace en tu dispositivo iOS para unirte a la beta
4. Instala Llamenos desde TestFlight

La distribucion via App Store esta planeada para una version futura.

## Configuracion inicial

La aplicacion movil se configura vinculandola a una cuenta de escritorio existente. Esto asegura que la misma identidad criptografica se use en todos los dispositivos sin transmitir nunca la clave secreta en texto plano.

### Aprovisionamiento de dispositivo (escaneo QR)

1. Abre la aplicacion de escritorio Llamenos y ve a **Configuracion > Dispositivos**
2. Haz clic en **Vincular Nuevo Dispositivo** -- esto genera un codigo QR con un token de aprovisionamiento de uso unico
3. Abre la aplicacion movil Llamenos y toca **Vincular Dispositivo**
4. Escanea el codigo QR con la camara de tu telefono
5. Las aplicaciones realizan un intercambio de claves ECDH efimero para transferir de forma segura tu material de claves cifrado
6. Establece un PIN en la aplicacion movil para proteger tu almacenamiento local de claves
7. La aplicacion movil esta ahora vinculada y lista para usar

El proceso de aprovisionamiento nunca transmite tu nsec en texto plano. La aplicacion de escritorio envuelve el material de claves con el secreto compartido efimero, y la aplicacion movil lo desenvuelve localmente.

### Configuracion manual (entrada de nsec)

Si no puedes escanear un codigo QR, puedes ingresar tu nsec directamente:

1. Abre la aplicacion movil y toca **Ingresar nsec manualmente**
2. Pega tu clave `nsec1...`
3. Establece un PIN para proteger el almacenamiento local
4. La aplicacion deriva tu clave publica y se registra en el backend

Este metodo requiere manejar tu nsec directamente, asi que usalo solo si la vinculacion de dispositivo no es posible. Usa un administrador de contrasenas para pegar el nsec en vez de escribirlo.

## Comparacion de funcionalidades

| Funcionalidad | Escritorio | Movil |
|---|---|---|
| Contestar llamadas entrantes | Si | Si |
| Escribir notas cifradas | Si | Si |
| Campos personalizados de notas | Si | Si |
| Responder a mensajes (SMS, WhatsApp, Signal) | Si | Si |
| Ver conversaciones | Si | Si |
| Estado de turno y pausas | Si | Si |
| Transcripcion del lado del cliente | Si (WASM Whisper) | No |
| Busqueda de notas | Si | Si |
| Paleta de comandos | Si (Ctrl+K) | No |
| Atajos de teclado | Si | No |
| Configuracion de admin | Si (completa) | Si (limitada) |
| Gestionar voluntarios | Si | Solo visualizacion |
| Ver logs de auditoria | Si | Si |
| Llamadas WebRTC en el navegador | Si | No (usa telefono nativo) |
| Notificaciones push | Notificaciones del SO | Push nativo (FCM/APNS) |
| Actualizacion automatica | Tauri updater | App Store / TestFlight |
| Archivos adjuntos (reportes) | Si | Si |

## Limitaciones

- **Sin transcripcion del lado del cliente** -- El modelo WASM Whisper requiere recursos significativos de memoria y CPU que son impracticos en dispositivos moviles. La transcripcion de llamadas solo esta disponible en escritorio.
- **Rendimiento criptografico reducido** -- Aunque la aplicacion movil usa el mismo nucleo Rust de criptografia via UniFFI, las operaciones pueden ser mas lentas en dispositivos antiguos comparado con el rendimiento nativo de escritorio.
- **Funciones de admin limitadas** -- Algunas operaciones de administrador (gestion masiva de voluntarios, configuracion detallada) solo estan disponibles en la aplicacion de escritorio. La aplicacion movil proporciona vistas de solo lectura para la mayoria de las pantallas de administracion.
- **Sin llamadas WebRTC** -- Los voluntarios en movil reciben llamadas en su numero de telefono via el proveedor de telefonia, no a traves del navegador. Las llamadas WebRTC dentro de la app son exclusivas del escritorio.
- **Bateria y conectividad** -- La aplicacion necesita una conexion persistente para recibir actualizaciones en tiempo real. El modo en segundo plano puede estar limitado por la gestion de energia del SO. Manten la aplicacion en primer plano durante los turnos para notificaciones confiables.

## Solucion de problemas de la aplicacion movil

### Aprovisionamiento falla con "Codigo QR invalido"

- Asegurate de que el codigo QR fue generado recientemente (los tokens de aprovisionamiento expiran despues de 5 minutos)
- Genera un nuevo codigo QR desde la aplicacion de escritorio e intentalo de nuevo
- Asegurate de que ambos dispositivos esten conectados a internet

### No llegan notificaciones push

- Verifica que las notificaciones esten habilitadas para Llamenos en la configuracion del dispositivo
- En Android: Ve a **Configuracion > Apps > Llamenos > Notificaciones** y activa todos los canales
- En iOS: Ve a **Ajustes > Notificaciones > Llamenos** y activa **Permitir Notificaciones**
- Asegurate de que no estes en modo No Molestar
- Verifica que tu turno este activo y no estes en pausa

### La aplicacion se cierra al abrir

- Asegurate de estar usando la version mas reciente de la aplicacion
- Limpia la cache de la aplicacion: **Configuracion > Apps > Llamenos > Almacenamiento > Borrar Cache**
- Si el problema persiste, desinstala y reinstala (necesitaras revincular el dispositivo)

### No puedes descifrar notas antiguas despues de reinstalar

- Reinstalar la aplicacion elimina el material de claves local
- Revincula el dispositivo via codigo QR desde tu aplicacion de escritorio para restaurar el acceso
- Las notas cifradas antes de la reinstalacion seran accesibles una vez que el dispositivo sea revinculado con la misma identidad

### Rendimiento lento en dispositivos antiguos

- Cierra otras aplicaciones para liberar memoria
- Desactiva animaciones en la configuracion de la aplicacion si esta disponible
- Considera usar la aplicacion de escritorio para operaciones pesadas como revision masiva de notas
