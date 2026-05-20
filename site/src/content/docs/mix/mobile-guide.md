---
title: Tu'un Yaa Móvil
description: Ke instalar ni ke configurar aplicación Llámenos móvil nuu iOS ni Android.
---

Aplicación móvil Llámenos permite a voluntarios ke skaka llamadas, ke respondi mensajes, ni ke taji notas cifradas nuu teléfono. Está construida nuu React Native ni comparte mismo núcleo criptográfico Rust nuu aplicación escritorio.

## Ke'ni iin aplicación móvil?

Aplicación móvil iin complemento a aplicación escritorio. Se conecta a mismo backend Llámenos (Cloudflare Workers a autoalojado) ni usa mismo protocolo, asi ke voluntarios pueden cambiar entre escritorio ni móvil sin problemas.

Aplicación móvil vive nuu repositorio separado (`llamenos-platform`) pero comparte:

- **llamenos-core** — Mismo crate Rust nuu todas operaciones criptográficas, compilado vía UniFFI nuu iOS ni Android
- **Protocolo** — Mismo formato cable, endpoints API, ni esquema cifrado
- **Backend** — Mismo Cloudflare Worker a servidor autoalojado

## Ke descargar ni ke instalar

### Android

Aplicación móvil actualmente se distribuye nuu APK nuu instalación lateral:

1. Descargar archivo `.apk` más reciente nuu página [GitHub Releases](https://github.com/rhonda-rodododo/llamenos-platform/releases/latest)
2. Nu dispositivo Android, ir a **Configuración > Seguridad** ni ke habilitar **Instalar fuentes desconocidas** (a ke habilitarlo por aplicación nuu se le solicita)
3. Abrir APK descargado ni tocar **Instalar**
4. Una vez instalada, abrir Llámenos nuu cajón aplicaciones

Distribución nuu App Store ni Play Store está planeada nuu futuro.

### iOS

Compilaciones iOS están disponibles nuu versiones beta TestFlight:

1. Instalar [TestFlight](https://apps.apple.com/app/testflight/id899247664) nuu App Store
2. Pedir a ña'a enlace invitación TestFlight
3. Abrir enlace nuu dispositivo iOS nuu unirse a beta
4. Instalar Llámenos nuu TestFlight

Distribución nuu App Store está planeada nuu futuro.

## Configuración inicial

Aplicación móvil se configura vinculándola a iin cuenta escritorio existente. Yaa asegura ke misma identidad criptográfica se use nuu todos dispositivos sin transmitir llave secreta nuu texto plano.

### Aprovisionamiento dispositivo (escaneo QR)

1. Abrir aplicación Llámenos escritorio ni ir a **Configuración > Dispositivos**
2. Clic **Vincular Nuevo Dispositivo** — yaa genera código QR nuu token aprovisionamiento de uso único
3. Abrir aplicación Llámenos móvil ni tocar **Vincular Dispositivo**
4. Escanear código QR nuu cámara teléfono
5. Aplicaciones realizan intercambio llaves ECDH efímero nuu transferir de forma segura material llave cifrado
6. Ke establecer PIN nuu aplicación móvil nuu proteger almacenamiento llave local
7. Aplicación móvil ahora está vinculada ni lista nuu usar

Proceso aprovisionamiento nunca transmite nsec nuu texto plano. Aplicación escritorio envuelve material llave nuu secreto compartido efímero, ni aplicación móvil lo desenvuelve localmente.

### Configuración manual (ingreso nsec)

Nu no puede escanear código QR, puede ke ingresar nsec directamente:

1. Abrir aplicación móvil ni tocar **Ingresar nsec manualmente**
2. Ke pegar llave `nsec1...`
3. Ke establecer PIN nuu proteger almacenamiento local
4. Aplicación deriva llave pública ni registra nuu backend

Yaa método requiere ke kunche'e nsec directamente, asi ke úselo solo nuu vinculación dispositivo no es posible. Use gestor contraseñas nuu ke pegar nsec en lugar de ke escribirlo.

## Comparación características

| Característica | Escritorio | Móvil |
|---|---|---|
| Ke skaka llamadas entrantes | Saa | Saa |
| Ke taji notas cifradas | Saa | Saa |
| Campos nota personalizados | Saa | Saa |
| Ke respondi mensajes (SMS, WhatsApp, Signal) | Saa | Saa |
| Ver conversaciones | Saa | Saa |
| Estado turno ni descansos | Saa | Saa |
| Transcripción lado cliente | Saa (WASM Whisper) | No |
| Búsqueda notas | Saa | Saa |
| Paleta comandos | Saa (Ctrl+K) | No |
| Atajos teclado | Saa | No |
| Configuración ña'a | Saa (completo) | Saa (limitado) |
| Ke kunche'e voluntarios | Saa | Solo ver |
| Ver logs auditoría | Saa | Saa |
| Llamadas WebRTC navegador | Saa | No (usa teléfono nativo) |
| Notificaciones push | Notificaciones SO | Push nativo (FCM/APNS) |
| Actualización automática | Actualizador Tauri | App Store / TestFlight |
| Archivos adjuntos (reportes) | Saa | Saa |

## Limitaciones

- **No transcripción lado cliente** — Modelo WASM Whisper requiere recursos memoria ni CPU significativos ke son imprácticos nuu móvil. Transcripción llamadas solo está disponible nuu escritorio.
- **Rendimiento criptográfico reducido** — Aunque aplicación móvil usa mismo núcleo criptográfico Rust vía UniFFI, operaciones pueden ser más lentas nuu dispositivos gama baja comparado nuu rendimiento nativo escritorio.
- **Características ña'a limitadas** — Algunas operaciones ña'a (gestión masiva voluntarios, configuración detallada) solo están disponibles nuu aplicación escritorio. Aplicación móvil proporciona vistas solo lectura nuu mayoría pantallas ña'a.
- **No llamadas WebRTC** — Voluntarios móviles reciben llamadas nuu número telefónico vía proveedor telefonía, no nuu navegador. Llamadas WebRTC nuu aplicación son solo escritorio.
- **Batería ni conectividad** — Aplicación necesita conexión persistente nuu recibir actualizaciones nuu tiempo real. Modo segundo plano puede estar limitado por gestión energía SO. Mantener aplicación nuu primer plano nuu turnos nuu notificaciones confiables.

## Ke kunche'e problemas móviles

### Aprovisionamiento falla nuu "Código QR inválido"

- Asegúrese ke código QR fue generado recientemente (tokens aprovisionamiento expiran después 5 minutos)
- Generar nuevo código QR nuu aplicación escritorio ni intentar de nuevo
- Asegurar ke ambos dispositivos están conectados a internet

### No se reciben notificaciones push

- Verificar ke notificaciones están habilitadas nuu Llámenos nuu configuración dispositivo
- Nu Android: Ir a **Configuración > Aplicaciones > Llámenos > Notificaciones** ni ke habilitar todos canales
- Nu iOS: Ir a **Configuración > Notificaciones > Llámenos** ni ke habilitar **Permitir Notificaciones**
- Asegurar ke no está nuu modo No Molestar
- Verificar ke turno está activo ni no está nuu descanso

### Aplicación se bloquea al iniciar

- Asegurar ke está ejecutando versión más reciente aplicación
- Borrar caché aplicación: **Configuración > Aplicaciones > Llámenos > Almacenamiento > Borrar Caché**
- Nu problema persiste, desinstalar ni reinstalar (necesitará revincular dispositivo)

### No puede descifrar notas antiguas después reinstalar

- Reinstalar aplicación elimina material llave local
- Revincular dispositivo vía código QR nuu aplicación escritorio nuu restaurar acceso
- Notas cifradas antes reinstalación serán accesibles una vez dispositivo está revinculado nuu misma identidad

### Rendimiento lento nuu dispositivos antiguos

- Cerrar otras aplicaciones nuu liberar memoria
- Desactivar animaciones nuu configuración aplicación nuu está disponible
- Considerar usar aplicación escritorio nuu operaciones pesadas nuu revisión masiva notas
