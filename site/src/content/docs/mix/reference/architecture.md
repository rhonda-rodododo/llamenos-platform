---
title: Arquitectura
description: Saa ka'vi kuña'a sistema — repositorios, flujo datos, capas cifrado, ni comunicación tiempo real.
---

Yaa página explica cómo Llámenos está estructurado, cómo fluyen datos a través sistema, ni dónde se aplica cifrado.

## Estructura repositorio

Llámenos está dividido a través tres repositorios ke comparten protocolo común ni núcleo criptográfico:

```
llamenos              llamenos-core           llamenos-platform
(Escritorio + API)    (Crypto Compartido)     (App Móvil)
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

- **llamenos** — Aplicación escritorio (Tauri v2 nuu webview Vite + React), backend Cloudflare Worker, ni backend Node.js autoalojado. Yaa iin repositorio primario.
- **llamenos-core** — Crate Rust compartido ke implementa todas operaciones criptográficas: cifrado sobre ECIES, firmas Schnorr, derivación clave PBKDF2, HKDF, ni XChaCha20-Poly1305. Compilado a código nativo (nuu Tauri), WASM (nuu navegador), ni enlaces UniFFI (nuu móvil).
- **llamenos-platform** — Aplicación móvil React Native nuu iOS ni Android. Usa enlaces UniFFI nuu llamar mismo código crypto Rust.

Tres plataformas implementan mismo protocolo cable definido nuu `docs/protocol/PROTOCOL.md`.

## Flujo datos

### Llamada entrante

```
Llamante (teléfono)
    |
    v
Proveedor Telefonía (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | HTTP webhook
    v
Worker API  -->  CallRouterDO
    |                |
    |                | Verifica ShiftManagerDO nuu voluntarios turno
    |                | Inicia timbrado paralelo a todos voluntarios disponibles
    |                v
    |           Proveedor Telefonía (llamadas salientes a teléfonos voluntarios)
    |
    | Primer voluntario responde
    v
CallRouterDO  -->  Conecta llamante ni voluntario
    |
    | Llamada termina
    v
Cliente (navegador/app voluntario)
    |
    | Cifra nota nuu clave por-nota
    | Envuelve clave vía ECIES nuu self + cada ña'a
    v
Worker API  -->  RecordsDO  (almacena nota cifrada + claves envueltas)
```

### Mensaje entrante (SMS / WhatsApp / Signal)

```
Contacto (SMS / WhatsApp / Signal)
    |
    | Webhook proveedor
    v
Worker API  -->  ConversationDO
    |                |
    |                | Cifra contenido mensaje inmediatamente
    |                | Envuelve clave simétrica vía ECIES nuu voluntario asignado + ña'as
    |                | Descarta texto plano
    |                v
    |           Relé WebSocket (evento hub cifrado notifica clientes en línea)
    |
    v
Cliente (navegador/app voluntario)
    |
    | Descifra mensaje nuu propia llave privada
    | Compone respuesta, cifra saliente
    v
Worker API  -->  ConversationDO  -->  Proveedor Mensajería (envía respuesta)
```

## Durable Objects

Backend usa seis Cloudflare Durable Objects (o equivalentes PostgreSQL nuu despliegues autoalojados):

| Durable Object | Responsabilidad |
|---|---|
| **IdentityDO** | Gestiona identidades voluntarios, claves públicas, nombres visibles, ni credenciales WebAuthn. Maneja creación ni canje invitaciones. |
| **SettingsDO** | Almacena configuración línea caliente: nombre, canales habilitados, credenciales proveedor, campos nota personalizados, ajustes mitigación spam, feature flags. |
| **RecordsDO** | Almacena notas llamada cifradas, reportes cifradas, ni metadatos archivos adjuntos. Maneja búsqueda notas (sobre metadatos cifrados). |
| **ShiftManagerDO** | Gestiona horarios turnos recurrentes, grupos timbrado, asignaciones turno voluntarios. Determina quién está turno nuu cualquier momento. |
| **CallRouterDO** | Orquesta enrutamiento llamada tiempo real: timbrado paralelo, terminación primera respuesta, estado descanso, seguimiento llamada activa. Genera respuestas TwiML/proveedor. |
| **ConversationDO** | Gestiona conversaciones mensajería hiladas a través SMS, WhatsApp, ni Signal. Maneja cifrado mensaje nuu ingestión, asignación conversación, ni respuestas salientes. |

Todos DOs se acceden como singletons vía `idFromName()` ni enrutan internamente usando `DORouter` ligero (coincidencia método + patrón ruta).

## Matriz cifrado

| Datos | ¿Cifrado? | Algoritmo | Quién puede descifrar |
|---|---|---|---|
| Notas llamada | Saa (E2EE) | XChaCha20-Poly1305 + sobre ECIES | Autor nota + todos ña'as |
| Campos nota personalizados | Saa (E2EE) | Mismo que notas | Autor nota + todos ña'as |
| Reportes | Saa (E2EE) | Mismo que notas | Autor reporte + todos ña'as |
| Archivos adjuntos reporte | Saa (E2EE) | XChaCha20-Poly1305 (streamed) | Autor reporte + todos ña'as |
| Contenido mensaje | Saa (E2EE) | XChaCha20-Poly1305 + sobre ECIES | Voluntario asignado + todos ña'as |
| Transcripciones | Saa (reposo) | XChaCha20-Poly1305 | Creador transcripción + todos ña'as |
| Eventos hub (WebSocket) | Saa (simétrico) | XChaCha20-Poly1305 nuu clave hub | Todos miembros hub actuales |
| Volunteer nsec | Saa (reposo) | PBKDF2 + XChaCha20-Poly1305 (PIN) | Solo voluntario |
| Entradas log auditoría | No (protegido integridad) | Cadena hash SHA-256 | Ña'as (lectura), sistema (escritura) |
| Números teléfono llamantes | No (solo servidor) | N/A | Servidor + ña'as |
| Números teléfono voluntarios | Almacenado nuu IdentityDO | N/A | Solo ña'as |

### Secreto adelante por-nota

Cada nota o mensaje obtiene iin clave simétrica aleatoria única. Yaa clave se envuelve vía ECIES (clave efímera secp256k1 + HKDF + XChaCha20-Poly1305) individualmente nuu cada lector autorizado. Comprometer iin clave nota no revela nada sobre otras notas. No hay claves simétricas de larga duración nuu cifrado contenido.

### Jerarquía claves

```
Volunteer nsec (BIP-340 Schnorr / secp256k1)
    |
    +-- Deriva npub (clave pública x-only, 32 bytes)
    |
    +-- Usado nuu acuerdo clave ECIES (preponer 02 nuu forma comprimida)
    |
    +-- Firma eventos WebSocket (firma Schnorr)

Clave hub (32 bytes aleatorios, NO derivada ninguna identidad)
    |
    +-- Cifra eventos hub WebSocket tiempo real
    |
    +-- Envuelto ECIES por miembro vía LABEL_HUB_KEY_WRAP
    |
    +-- Rotado nuu salida miembro

Clave por-nota (32 bytes aleatorios)
    |
    +-- Cifra contenido nota vía XChaCha20-Poly1305
    |
    +-- Envuelto ECIES por lector (voluntario + cada ña'a)
    |
    +-- Nunca reutilizado a través notas
```

## Comunicación tiempo real

Actualizaciones tiempo real (nuevas llamadas, mensajes, cambios turno, presencia) fluyen a través relé WebSocket:

- **Autoalojado**: Relé WebSocket relay corriendo junto aplicación nuu Docker/Kubernetes
- **Cloudflare**: Nosflare (relé basado Cloudflare Workers)

Todos eventos son efímeros (kind 20001) ni cifrados nuu clave hub. Eventos usan etiquetas genéricas (`["t", "llamenos:event"]`) asi ke relé no puede distinguir tipos evento. Campo contenido contiene ciphertext XChaCha20-Poly1305.

### Flujo evento

```
Cliente A (acción voluntario)
    |
    | Cifra contenido evento nuu clave hub
    | Firma como evento WebSocket (Schnorr)
    v
Relé WebSocket (WebSocket relay / Nosflare)
    |
    | Difunde a suscriptores
    v
Cliente B, C, D...
    |
    | Verifica firma Schnorr
    | Descifra contenido nuu clave hub
    v
Actualiza estado UI local
```

Relé ve blobs cifrados ni firmas válidas pero no puede leer contenido evento ni determinar qué acciones se realizan.

## Capas seguridad

### Capa transporte

- Toda comunicación cliente-servidor sobre HTTPS (TLS 1.3)
- Conexiones WebSocket a relé WebSocket sobre WSS
- Política Seguridad Contenido (CSP) restringe fuentes script, conexiones, ni ancestros frame
- Patrón aislamiento Tauri separa IPC del webview

### Capa aplicación

- Autenticación vía keypairs WebSocket (firmas BIP-340 Schnorr)
- Tokens sesión WebAuthn nuu conveniencia multidispositivo
- Control acceso basado roles (llamante, voluntario, reportero, ña'a)
- 25 constantes separación dominio criptográfico definidas nuu `crypto-labels.ts` previenen ataques cross-protocolo

### Cifrado reposo

- Notas llamada, reportes, mensajes, ni transcripciones cifradas antes almacenamiento
- Claves secretas voluntarios cifradas nuu claves derivadas PIN (PBKDF2)
- Tauri Stronghold proporciona almacenamiento vault cifrado nuu escritorio
- Integridad log auditoría protegida vía cadena hash SHA-256

### Verificación construcción

- Construcciones reproducibles vía `Dockerfile.build` nuu `SOURCE_DATE_EPOCH`
- Nombres archivo hash contenido nuu assets frontend
- `CHECKSUMS.txt` publicado nuu GitHub Releases
- Atestaciones provenance SLSA
- Script verificación: `scripts/verify-build.sh`

## Diferencias plataforma

| Característica | Escritorio (Tauri) | Móvil (React Native) | Navegador (Cloudflare) |
|---|---|---|---|
| Backend crypto | Rust nativo (vía IPC) | Rust nativo (vía UniFFI) | WASM (llamenos-core) |
| Almacenamiento clave | Tauri Stronghold (cifrado) | Secure Enclave / Keystore | Browser localStorage (cifrado PIN) |
| Transcripción | Whisper lado cliente (WASM) | No disponible | Whisper lado cliente (WASM) |
| Auto-actualización | Actualizador Tauri | App Store / Play Store | Automático (CF Workers) |
| Notificaciones push | SO-nativo (notificación Tauri) | SO-nativo (FCM/APNS) | Notificaciones navegador |
| Soporte offline | Limitado (necesita API) | Limitado (necesita API) | Limitado (necesita API) |
