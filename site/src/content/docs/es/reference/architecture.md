---
title: Arquitectura
description: Vision general de la arquitectura del sistema -- repositorios, flujo de datos, capas de cifrado y comunicacion en tiempo real.
---

Esta pagina explica como esta estructurado Llamenos, como fluyen los datos a traves del sistema y donde se aplica el cifrado.

## Estructura de repositorios

Llamenos esta dividido en tres repositorios que comparten un protocolo comun y un nucleo criptografico:

```
llamenos              llamenos-core           llamenos-hotline
(Desktop + API)       (Shared Crypto)         (Mobile App)
+--------------+      +--------------+        +--------------+
| Tauri v2     |      | Rust crate   |        | React Native |
| Vite + React |      | - Native lib |        | iOS + Android|
| CF Workers   |      | - WASM pkg   |        | UniFFI bind  |
| Durable Objs |      | - UniFFI     |        |              |
+--------------+      +--------------+        +--------------+
       |                  ^      ^                   |
       |  path dep        |      |    UniFFI         |
       +------------------+      +-------------------+
```

- **llamenos** -- La aplicacion de escritorio (Tauri v2 con webview Vite + React), el backend de Cloudflare Worker y el backend Node.js autoalojado. Este es el repositorio principal.
- **llamenos-core** -- Un crate de Rust compartido que implementa todas las operaciones criptograficas: cifrado de sobre ECIES, firmas Schnorr, derivacion de claves PBKDF2, HKDF y XChaCha20-Poly1305. Compilado a codigo nativo (Tauri), WASM (navegador) y bindings UniFFI (movil).
- **llamenos-hotline** -- La aplicacion movil React Native para iOS y Android. Usa bindings UniFFI para invocar el mismo codigo Rust de criptografia.

Las tres plataformas implementan el mismo protocolo de cable definido en `docs/protocol/PROTOCOL.md`.

## Flujo de datos

### Llamada entrante

```
Llamante (telefono)
    |
    v
Proveedor de Telefonia (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | HTTP webhook
    v
Worker API  -->  CallRouterDO
    |                |
    |                | Consulta ShiftManagerDO para voluntarios en turno
    |                | Inicia timbre simultaneo a todos los voluntarios disponibles
    |                v
    |           Proveedor de Telefonia (llamadas salientes a telefonos de voluntarios)
    |
    | Primer voluntario contesta
    v
CallRouterDO  -->  Conecta llamante y voluntario
    |
    | Llamada finaliza
    v
Cliente (navegador/app del voluntario)
    |
    | Cifra nota con clave por nota
    | Envuelve clave via ECIES para si mismo + cada admin
    v
Worker API  -->  RecordsDO  (almacena nota cifrada + claves envueltas)
```

### Mensaje entrante (SMS / WhatsApp / Signal)

```
Contacto (SMS / WhatsApp / Signal)
    |
    | Webhook del proveedor
    v
Worker API  -->  ConversationDO
    |                |
    |                | Cifra contenido del mensaje inmediatamente
    |                | Envuelve clave simetrica via ECIES para voluntario asignado + admins
    |                | Descarta texto plano
    |                v
    |           Nostr relay (evento cifrado del hub notifica clientes en linea)
    |
    v
Cliente (navegador/app del voluntario)
    |
    | Descifra mensaje con clave privada propia
    | Compone respuesta, cifra salida
    v
Worker API  -->  ConversationDO  -->  Proveedor de Mensajeria (envia respuesta)
```

## Durable Objects

El backend usa seis Cloudflare Durable Objects (o sus equivalentes PostgreSQL para despliegues autoalojados):

| Durable Object | Responsabilidad |
|---|---|
| **IdentityDO** | Gestiona identidades de voluntarios, claves publicas, nombres de visualizacion y credenciales WebAuthn. Maneja creacion y canje de invitaciones. |
| **SettingsDO** | Almacena configuracion de la linea: nombre, canales activos, credenciales de proveedores, campos personalizados de notas, configuracion anti-spam, flags de funcionalidades. |
| **RecordsDO** | Almacena notas de llamadas cifradas, reportes cifrados y metadatos de archivos adjuntos. Maneja busqueda de notas (sobre metadatos cifrados). |
| **ShiftManagerDO** | Gestiona agendas de turnos recurrentes, grupos de timbre y asignaciones de voluntarios a turnos. Determina quien esta en turno en cualquier momento. |
| **CallRouterDO** | Orquesta el enrutamiento de llamadas en tiempo real: timbre simultaneo, terminacion al primer contestar, estado de pausa, rastreo de llamadas activas. Genera respuestas TwiML/proveedor. |
| **ConversationDO** | Gestiona conversaciones con hilo entre SMS, WhatsApp y Signal. Maneja cifrado de mensajes en la ingesta, asignacion de conversaciones y respuestas salientes. |

Todos los DOs son accedidos como singletons via `idFromName()` y enrutados internamente usando un `DORouter` ligero (coincidencia de metodo + patron de ruta).

## Matriz de cifrado

| Dato | Cifrado? | Algoritmo | Quien puede descifrar |
|---|---|---|---|
| Notas de llamada | Si (E2EE) | XChaCha20-Poly1305 + sobre ECIES | Autor de la nota + todos los admins |
| Campos personalizados de notas | Si (E2EE) | Igual que notas | Autor de la nota + todos los admins |
| Reportes | Si (E2EE) | Igual que notas | Autor del reporte + todos los admins |
| Adjuntos de reportes | Si (E2EE) | XChaCha20-Poly1305 (streaming) | Autor del reporte + todos los admins |
| Contenido de mensajes | Si (E2EE) | XChaCha20-Poly1305 + sobre ECIES | Voluntario asignado + todos los admins |
| Transcripciones | Si (en reposo) | XChaCha20-Poly1305 | Creador de la transcripcion + todos los admins |
| Eventos del hub (Nostr) | Si (simetrico) | XChaCha20-Poly1305 con clave del hub | Todos los miembros actuales del hub |
| nsec del voluntario | Si (en reposo) | PBKDF2 + XChaCha20-Poly1305 (PIN) | Solo el voluntario |
| Entradas de auditoria | No (integridad protegida) | Cadena de hash SHA-256 | Admins (lectura), sistema (escritura) |
| Numeros de telefono de llamantes | No (solo servidor) | N/A | Servidor + admins |
| Numeros de telefono de voluntarios | Almacenados en IdentityDO | N/A | Solo admins |

### Secreto hacia adelante por nota

Cada nota o mensaje recibe una clave simetrica aleatoria unica. Esa clave se envuelve via ECIES (clave efimera secp256k1 + HKDF + XChaCha20-Poly1305) individualmente para cada lector autorizado. Comprometer la clave de una nota no revela nada sobre otras notas. No existen claves simetricas de larga duracion para cifrado de contenido.

### Jerarquia de claves

```
nsec del voluntario (BIP-340 Schnorr / secp256k1)
    |
    +-- Deriva npub (clave publica x-only, 32 bytes)
    |
    +-- Usada para acuerdo de claves ECIES (prefija 02 para formato comprimido)
    |
    +-- Firma eventos Nostr (firma Schnorr)

Clave del hub (32 bytes aleatorios, NO derivada de ninguna identidad)
    |
    +-- Cifra eventos Nostr del hub en tiempo real
    |
    +-- Envuelta via ECIES por miembro via LABEL_HUB_KEY_WRAP
    |
    +-- Rotada al salir un miembro

Clave por nota (32 bytes aleatorios)
    |
    +-- Cifra contenido de la nota via XChaCha20-Poly1305
    |
    +-- Envuelta via ECIES por lector (voluntario + cada admin)
    |
    +-- Nunca reutilizada entre notas
```

## Comunicacion en tiempo real

Las actualizaciones en tiempo real (nuevas llamadas, mensajes, cambios de turno, presencia) fluyen a traves de un relay Nostr:

- **Autoalojado**: relay strfry ejecutandose junto a la app en Docker/Kubernetes
- **Cloudflare**: Nosflare (relay basado en Cloudflare Workers)

Todos los eventos son efimeros (kind 20001) y cifrados con la clave del hub. Los eventos usan tags genericos (`["t", "llamenos:event"]`) para que el relay no pueda distinguir tipos de evento. El campo de contenido contiene texto cifrado XChaCha20-Poly1305.

### Flujo de eventos

```
Cliente A (accion del voluntario)
    |
    | Cifra contenido del evento con clave del hub
    | Firma como evento Nostr (Schnorr)
    v
Nostr relay (strfry / Nosflare)
    |
    | Transmite a suscriptores
    v
Cliente B, C, D...
    |
    | Verifica firma Schnorr
    | Descifra contenido con clave del hub
    v
Actualiza estado local de la interfaz
```

El relay ve blobs cifrados y firmas validas, pero no puede leer el contenido de los eventos ni determinar que acciones se estan realizando.

## Capas de seguridad

### Capa de transporte

- Toda comunicacion cliente-servidor sobre HTTPS (TLS 1.3)
- Conexiones WebSocket al relay Nostr sobre WSS
- Content Security Policy (CSP) restringe fuentes de scripts, conexiones y ancestros de frames
- Patron de aislamiento de Tauri separa IPC del webview

### Capa de aplicacion

- Autenticacion via pares de claves Nostr (firmas BIP-340 Schnorr)
- Tokens de sesion WebAuthn para conveniencia multi-dispositivo
- Control de acceso basado en roles (llamante, voluntario, reportero, admin)
- Las 25 constantes de separacion de dorustfs criptografico definidas en `crypto-labels.ts` previenen ataques entre protocolos

### Cifrado en reposo

- Notas de llamadas, reportes, mensajes y transcripciones cifrados antes del almacenamiento
- Claves secretas de voluntarios cifradas con claves derivadas de PIN (PBKDF2)
- Tauri Stronghold proporciona almacenamiento seguro cifrado en escritorio
- Integridad del log de auditoria protegida via cadena de hash SHA-256

### Verificacion de build

- Builds reproducibles via `Dockerfile.build` con `SOURCE_DATE_EPOCH`
- Nombres de archivo con hash de contenido para activos del frontend
- `CHECKSUMS.txt` publicado con GitHub Releases
- Atestaciones de procedencia SLSA
- Script de verificacion: `scripts/verify-build.sh`

## Diferencias entre plataformas

| Caracteristica | Desktop (Tauri) | Movil (React Native) | Navegador (Cloudflare) |
|---|---|---|---|
| Backend de criptografia | Rust nativo (via IPC) | Rust nativo (via UniFFI) | WASM (llamenos-core) |
| Almacenamiento de claves | Tauri Stronghold (cifrado) | Secure Enclave / Keystore | localStorage del navegador (cifrado con PIN) |
| Transcripcion | Whisper del lado del cliente (WASM) | No disponible | Whisper del lado del cliente (WASM) |
| Actualizacion automatica | Tauri updater | App Store / Play Store | Automatica (CF Workers) |
| Notificaciones push | Nativas del SO (Tauri notification) | Nativas del SO (FCM/APNS) | Notificaciones del navegador |
| Soporte offline | Limitado (necesita API) | Limitado (necesita API) | Limitado (necesita API) |
