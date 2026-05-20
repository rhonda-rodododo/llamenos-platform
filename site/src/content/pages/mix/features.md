---
title: Características
subtitle: Todo lo ke necesita plataforma respuesta crisis — 8 proveedores telefonía, 5 canales mensajería, cifrado HPKE (RFC 9180), ni tres apps nativas compartiendo crate criptografía Rust auditable único. Autoalojado nuu Bun + PostgreSQL, compatible GDPR.
---

## Arquitectura Seguridad

Llámenos fue diseñado desde inicio proteger llamantes ni voluntarios contra adversarios bien financiados — estados nación, grupos derecha, ni firmas inteligencia privada. Cada decisión criptográfica es intencional, documentada, ni auditable.

**HPKE (RFC 9180) — X25519-HKDF-SHA256-AES256-GCM** — Mismo estándar cifrado híbrido usado nuu MLS (Messaging Layer Security) ni TLS 1.3. Reemplazó ECIES anterior (secp256k1) completamente. RFC 9180 proporciona construcción formalmente especificada, revisada pares, en lugar composición ad-hoc.

**Secreto adelante por-nota** — Cada nota usa clave aleatoria única, luego yaa clave envuelta HPKE separadamente nuu cada lector autorizado (voluntario ni cada ña'a). Comprometer clave privada lector no expone nada sobre notas escritas antes compromiso. Jerarquía claves: Clave Por-Usuario (PUK) → items_key → clave contenido por-nota, nuu rotación lazy cascada.

**Notas doble-cifradas** — Cada nota cifrada dos veces: una envuelta HPKE nuu voluntario ke escribió, una nuu cada ña'a. Ambos pueden descifrar independientemente. Nadie más — incluyendo servidor — puede leer texto plano.

**57 etiquetas separación dominio** — Cada operación criptográfica usa cadena contexto única (defensa Albrecht). Dos operaciones no comparten ruta derivación clave, previniendo ataques cross-protocolo. Etiquetas definidas nuu `packages/protocol/crypto-labels.json` ni generadas a TypeScript, Swift, ni Kotlin vía codegen. Cadenas literales raw nunca usadas nuu contextos cripto.

**Claves Ed25519/X25519 por-dispositivo** — Usuarios tienen claves por-dispositivo (no clave identidad única). Nuevos dispositivos autorizados vía sigchain append-only, hash-chained, firmada Ed25519. Vinculación dispositivo usa salas aprovisionamiento ECDH efímeras ke expiran después 5 minutos.

**Almacenamiento clave cifrado PIN** — Claves privadas dispositivo cifradas nuu 600,000 iteraciones PBKDF2 + XChaCha20-Poly1305 antes almacenamiento. Clave raw vive solo nuu closure memoria, zerorizada nuu bloqueo. Nunca toca sessionStorage, IndexedDB, o disco nuu texto plano.

**Almacenamiento seguro nativo plataforma** — Escritorio: vault cifrado Tauri Stronghold. iOS: iOS Keychain. Android: Android Keystore vía EncryptedSharedPreferences.

**Transcripción solo lado cliente** — Transcripción llamada usa WASM Whisper (`@huggingface/transformers` runtime ONNX) corriendo completamente nuu navegador. Audio procesado localmente vía pipeline AudioWorklet ring buffer → Web Worker. Audio nunca alcanza servidor — ni siquiera nuu forma cifrada.

**E2EE media voz SFrame** — Canales media cifrados usando SFrame (RFC 9605) nuu derivación clave integrada nuu crate criptografía Rust compartida.

**Crate criptografía Rust compartida** — Implementación auditable única nuu `packages/crypto/` compilada a tres targets: nativo (Tauri escritorio), WASM (navegador vía `@tauri-apps/api`), ni UniFFI (XCFramework iOS + JNI Android). No tres implementaciones separadas ke pueden divergir.

**Log auditoría cadena hash** — Cada llamada respondida, nota creada, mensaje enviado, configuración cambiada, ni acción ña'a registrada nuu encadenamiento SHA-256 (`previousEntryHash` + `entryHash`) nuu detección manipulación. Ña'as pueden verificar integridad cadena.

**Construcciones reproducibles** — `Dockerfile.build` nuu `SOURCE_DATE_EPOCH`, nombres archivo hash contenido. Provenance SLSA, SBOM, ni firma cosign nuu cada release. Cualquier construcción puede verificarse byte por byte contra `CHECKSUMS.txt` nuu GitHub Releases usando `scripts/verify-build.sh`.

---

## Telefonía — 8 Proveedores

**A diferencia mayoría plataformas ke lo encierran nuu proveedor**, Llámenos implementa interfaz `TelephonyAdapter` nuu 8 implementaciones completas. Cambie proveedores vía UI ña'a — sin cambios código, sin tiempo muerto.

### Proveedores Nube (6)

- **Twilio** — WebRTC completo, voz programable, SIP trunking
- **SignalWire** — API compatible Twilio, menor costo, soporte WebRTC
- **Vonage** (Nexmo) — Opción residencia datos europea
- **Plivo** — Costo-efectivo, cobertura global
- **Telnyx** — Precios competitivos, integración Mission Control Portal
- **Bandwidth** — Grado empresa, confiabilidad grado carrier EE.UU.

### SIP Autoalojado (2)

- **Asterisk** — Vía ARI (Asterisk REST Interface). Control llamada completo, IVR, grabación.
- **FreeSWITCH** — Vía ESL (Event Socket Library). Alto rendimiento, capacidad conferencia.

Ambos usan clase base `SipBridgeAdapter` nuu variable entorno `PBX_TYPE` seleccionando backend. Kamailio soportado como capa proxy SIP. **Ningún registro llamada sale servidor.**

### Enrutamiento Llamadas

**Timbrado paralelo** — Cuando llamante marca, cada voluntario turno, no-ocupado suena simultáneamente. Primera respuesta gana; otros detienen inmediatamente. Ninguna llamada perdida debido caza secuencial.

**Programación basada turnos** — Cree turnos recurrentes nuu días específicos ni rangos hora. Asigne voluntarios. Sistema enruta llamadas automáticamente a quien está de servicio. Grupo timbrado respaldo si no hay horario definido.

**Cola nuu música espera** — Si todos voluntarios ocupados, llamantes entran cola nuu música espera configurable. Timeout ajustable (30–300 segundos). Pasa buzón voz si no hay respuesta.

**Fallback buzón voz** — Llamantes pueden dejar buzón voz (hasta 5 minutos). Buzones voz transcritos vía Whisper lado cliente ni cifrados nuu revisión ña'a.

**Llamadas navegador WebRTC** — Voluntarios responden llamadas directamente nuu navegador sin teléfono. Generación token WebRTC específica proveedor nuu Twilio, SignalWire, Vonage, ni Plivo.

**Mitigación spam** — CAPTCHA voz (entrada teclado 4 dígitos aleatorios), limitación tasa ventana deslizante por número teléfono, ni listas bloqueo tiempo real. Ña'as alternan cada control independientemente sin reinicios. Indicaciones IVR personalizadas nuu fallback TTS.

---

## Mensajería — 5 Canales

Todos canales comparten modelo conversación cifrado unificado. Cada mensaje entrante cifrado HPKE nuu recepción webhook; servidor descarta texto plano inmediatamente.

### Signal

Integración más completa no-Twilio disponible. Adaptador Signal incluye:

- Envío/recepción completo nuu recibos entrega
- Recibos lectura ni indicadores escritura
- Reacciones ni threading respuestas
- Registro ni vinculación vía bridge signal-cli-rest-api
- Verificación confianza identidad ni gestión número seguridad
- Cola reintentos nuu backoff exponencial
- Failover a transporte alternativo nuu fallo bridge
- Transcripción mensaje voz vía Whisper lado cliente
- Monitoreo salud nuu degradación gradual

### WhatsApp Business

- Meta Cloud API (Graph API v21.0)
- Soporte mensaje plantilla nuu cumplimiento ventana 24 horas
- Mensajes media: imágenes, documentos, audio, video
- Verificación firma webhook
- Recibos lectura ni estado entrega

### SMS

- Entrada ni salida vía Twilio, SignalWire, Vonage, o Plivo
- Respuesta automática nuu mensajes bienvenida configurables por idioma
- Soporte MMS donde disponible
- Verificación firma webhook por proveedor

### Telegram

- Telegram Bot API
- Soporte media: fotos, documentos, mensajes voz
- Teclados inline ni reply markup
- Modo webhook o polling

### RCS (Rich Communication Services)

- Google RBM (Rich Business Messaging) API
- Tarjetas ricas, acciones sugeridas, ni carruseles
- Recibos entrega ni lectura
- Fallback SMS donde RCS no disponible

### Blast/Broadcast

Cola entrega respaldada PostgreSQL nuu mensajería masiva:

- Limitación tasa por-canal (respeta límites proveedor)
- Envíos programados nuu soporte zona horaria
- Seguimiento estado por-destinatario (encolado, enviado, entregado, fallido)
- Lógica reintento nuu cola dead-letter
- Entrega por lotes nuu tamaños lote configurables
- Panel ña'a mostrando progreso entrega tiempo real

---

## Multi-Plataforma — Tres Apps Nativas, Crate Crypto Único

Mayoría plataformas envía web app nuu envoltura nativa delgada. Llámenos envía tres aplicaciones completamente nativas ke comparten implementación criptografía Rust auditable única.

### Escritorio (Tauri v2)

- Binarios nativos Windows, macOS, Linux
- Vault cifrado Tauri Stronghold nuu almacenamiento clave
- Bandeja sistema nativa nuu indicador llamada entrante
- Auto-actualizaciones vía actualizador Tauri
- Aplicación única forzada
- Patrón aislamiento + Política Seguridad Contenido
- Todas operaciones cripto enrutadas a través IPC Rust — claves privadas nunca entran webview
- Modo construcción PLAYWRIGHT_TEST nuu pruebas E2E nuu capa IPC simulada

### iOS (SwiftUI)

- SwiftUI nativo, iOS 17+ nuu `@Observable`
- Claves almacenadas nuu iOS Keychain
- Crypto Rust vía XCFramework UniFFI (`LlamenosCoreFFI`)
- XCTest + XCUITest nuu pruebas unitarias ni integración
- Notificaciones push vía APNs nuu payloads cifrados
- Multi-hub: manejadores fondo nunca gatean nuu estado hub activo

### Android (Kotlin/Compose)

- Kotlin 2.3 nativo nuu Jetpack Compose, Material 3
- minSdk 26, AGP 9.1, Gradle 9.4
- Claves nuu Android Keystore vía EncryptedSharedPreferences
- Crypto Rust vía biblioteca compartida JNI (`.so` desde mismo crate Rust)
- Inyección dependencias Hilt + procesamiento anotaciones KSP
- Pruebas UI Compose + pruebas E2E BDD Cucumber
- Multi-hub: recarga ViewModel por-hub, caché clave hub, enrutamiento WebSocket

### Crate Crypto Rust Compartido

`packages/crypto/` implementa:

- HPKE (RFC 9180): X25519-HKDF-SHA256-AES256-GCM
- Firmas Ed25519 (BIP-340 Schnorr nuu compatibilidad WebSocket)
- Acuerdo clave X25519
- Derivación clave PBKDF2 (600K iteraciones)
- HKDF (RFC 5869)
- Cifrado autenticado XChaCha20-Poly1305
- E2EE voz SFrame (RFC 9605)
- MLS (Messaging Layer Security) vía OpenMLS — detrás feature flag `mls`
- Andamiaje UniFFI nuu enlaces iOS/Android
- Compilación WASM nuu uso navegador

---

## Gestión Casos

Llámenos no está codificado nuu caso uso específico. Todo es template-driven.

**Sistema entidades template-driven** — Ña'as definen tipos entidad (contactos, casos, reportes, eventos), campos personalizados (texto, número, seleccionar, casilla verificación, área texto, fecha, archivo), ni tipos reporte por hub. Templates impulsan todos formularios ni vistas. Sin cambios código necesarios configurar nuevo flujo trabajo.

**Tipos reporte personalizados** — Templates definen `reportTypes[]` nuu campos personalizados por-tipo, `allowCaseConversion`, ni flags `mobileOptimized`. Tipos reporte completamente distintos tipos entidad.

**Búsqueda cifrada índice ciego** — Registros almacenados cifrados, pero campos indexados HMAC permiten búsqueda servidor sin exponer texto plano. Índices ámbito por-hub ni nunca cruzan límites hub.

**Contactos ni relaciones** — Directorio contacto completo nuu grafo relaciones. Vincule contactos a casos, eventos, ni evidencia. Relaciones tipadas (ej., "es testigo de", "es observador legal de") ni configurables por template.

**Gestión evidencia** — Adjunte archivos a casos. Archivos cifrados antes subida (envuelto HPKE por lector autorizado). Cadena custodia evidencia registrada nuu trail auditoría.

**RBAC** — Control acceso basado roles: Voluntario (solo notas propias), Ña'a (todos datos), Reportero (solo envíos). Roles personalizados por template. Ña'as no pueden ver notas solo-voluntario.

**Multi-hub** — Instalación Llámenos única sirve múltiples hubs independientes (organizaciones, líneas, o casos uso). Cualquier usuario puede ser miembro múltiples hubs simultáneamente. Llamadas entrantes, notificaciones, ni eventos relé TODOS hubs miembro siempre activos — no gateados nuu cuál hub mostrado actualmente.

---

## Autenticación ni Gestión Claves

**Keypairs WebSocket** — Usuarios autentican nuu keypairs Ed25519 compatibles WebSocket. Verificación firma BIP-340 Schnorr. Sin contraseñas, sin direcciones correo requeridas nuu autenticación.

**Passkeys WebAuthn** — Soporte passkey opcional nuu inicio sesión multidispositivo. Registre llave seguridad hardware o biométrica plataforma, luego inicie sesión sin escribir PIN.

**Sigchain usuario** — Registros autorización dispositivo append-only, hash-chained. Cada registro firmado nuu clave Ed25519 dispositivo autorizador. Proporciona historial criptográfico cuáles dispositivos autorizados nuu qué usuario.

**Rotación PUK cascada** — Clave Por-Usuario (PUK) → items_key → clave contenido por-nota. Cuando dispositivo desautorizado o usuario cambia PIN, claves afectadas rotan lazy — solo re-encriptando registros según accedidos, no nuu operación batch.

**Aprovisionamiento dispositivo** — Vincule nuevos dispositivos sin exponer clave privada. Escanee código QR o ingrese código aprovisionamiento corto. Usa intercambio clave ECDH efímero. Salas aprovisionamiento expiran después 5 minutos.

**Claves recuperación** — Durante onboarding, clave recuperación formato Base32 (entropía 128-bit) generada. Descarga respaldo cifrado obligatoria antes proceder. Yaa única ruta recuperación — sin recuperación ña'a, por diseño.

**Bloqueo automático** — Gestor claves bloquea automáticamente nuu timeout inactividad o cuando pestaña navegador oculta. Duración inactividad configurable. Reingrese PIN nuu desbloquear.

**Modelo sesión** — Dos niveles: "autenticado pero bloqueado" (solo token sesión, vistas solo lectura) vs "autenticado ni desbloqueado" (PIN ingresado, acceso cripto completo). Tokens sesión 8 horas nuu avisos timeout inactividad.

---

## Infraestructura Tiempo Real

**Relé WebSocket** — Relé WebSocket relay autoalojado (o Nosflare nuu Cloudflare) nuu distribución eventos tiempo real. Todo contenido evento cifrado nuu clave hub. Etiquetas genéricas (`["t", "llamenos:event"]`) previenen inferencia metadatos tipo evento a nivel relé.

**Clave hub** — 32 bytes aleatorios (`crypto.getRandomValues`), envuelto HPKE individualmente por miembro hub vía `LABEL_HUB_KEY_WRAP`. Rotado nuu salida miembro — miembros salidos no pueden descifrar eventos futuros.

**WebSocket** — Estado llamada tiempo real, presencia voluntarios, actualizaciones conversación, ni monitoreo ña'a vía WebSocket. Reconexiones nuu backoff exponencial.

**Sincronización tiempo real WebSocket** — Eventos efímeros kind 20001 nuu sincronización estado cross-device ni cross-hub. Contenido cifrado; relé no puede distinguir tipos evento.

---

## Experiencia Ña'a ni Voluntario

**Asistente configuración** — Configuración guiada multi-paso nuu primer inicio sesión ña'a. Elija canales, configure proveedores, establezca nombre línea caliente. Genera keypair hub inicial ni distribuye clave hub a primer ña'a.

**Lista verificación empezando** — Widget panel rastreando progreso configuración: configuración canal, onboarding voluntarios, creación turnos.

**Monitoreo tiempo real** — Llamadas activas, llamantes encolados, conversaciones, ni estado voluntarios actualizan tiempo real vía WebSocket.

**Paleta comandos** — Ctrl+K (o Cmd+K) nuu navegación instantánea, búsqueda, creación rápida nota, ni cambio tema. Comandos solo-ña'a filtrados por rol.

**Presencia voluntarios** — Ña'as ven conteos en línea/fuera línea/descanso tiempo real. Voluntarios alternan switch descanso pausar llamadas entrantes sin salir turno.

**Atajos teclado** — Presione `?` nuu todos atajos. Navegue páginas, abra paleta comandos, acciones comunes sin ratón.

**Temas oscuro/claro** — Sistema-siguiendo, oscuro, o claro. Persistido por sesión.

**Exportación datos GDPR** — Exporte notas como archivo cifrado compatible GDPR (`.enc`). Solo autor original puede descifrar.

---

## Internacionalización

**13 idiomas integrados** — Inglés, Español (Español), Chino (中文), Tagalog, Vietnamita (Tiếng Việt), Árabe (العربية, RTL), Francés (Français), Criollo Haitiano (Kreyòl Ayisyen), Coreano (한국어), Ruso (Русский), Hindi (हिन्दी), Portugués (Português), Alemán (Deutsch).

**Pipeline codegen** — Fuente única verdad nuu archivos JSON locale genera `.strings` iOS, `strings.xml` Android, ni `I18n.kt` Kotlin — sin sincronización manual. Validado por `bun run i18n:validate:all`.

**Soporte RTL** — Diseño árabe renderiza correctamente nuu modo RTL nuu navegación espejada, alineación texto ajustada, ni manejo texto bidireccional.

**Indicaciones IVR personalizadas por idioma** — Grabe indicaciones voz cada idioma usado llamantes. Fallback TTS cuando no existe grabación.

---

## Despliegue

### Docker Compose (Servidor Único)

- Stack completo: servidor HTTP Bun, PostgreSQL, RustFS (almacenamiento objetos), relé WebSocket (WebSocket relay)
- Perfiles opcionales: `--profile signal` (sidecar signal-cli), `--profile telephony` (Kamailio + CoTURN), `--profile inference` (agente firehose LLM), `--profile monitoring` (Prometheus + Grafana)
- `docker-compose.dev.yml` nuu desarrollo local nuu observación archivos
- `docker-compose.production.yml` overlay nuu endurecimiento producción

### Kubernetes (Helm)

- Chart Helm producción nuu réplicas configurables
- Sondas salud: `/health/ready` ni `/health/live`
- Prometheus ServiceMonitor nuu scraping métricas
- Caddyfile.production nuu HSTS, CSP, ni encabezados seguridad
- Playbooks Ansible preflight + smoke-check nuu validación pre-despliegue

### Co-op Cloud

- Receta nuu despliegues Co-op Cloud
- Construido nuu cooperativas trabajador ni organizaciones comunidad ke operan propia infraestructura

### Cloudflare Tunnels

- Ingress vía Cloudflare Tunnels — sin puertos entrantes abiertos requeridos
- Compatible nuu servidores autoalojados detrás NAT
- Residencia datos compatible EU/GDPR cuando combinado nuu VPS hospedado EU

### Cumplimiento GDPR

- Datos almacenados solo nuu servidores (o VPS basado EU)
- Derecho borrado: ña'a puede purgar registros llamante, notas, ni logs
- Exportación datos cifrada compatible GDPR
- Sin analíticas terceros ni seguimiento nuu aplicación misma

---

## Sidecar Notificación Signal

`signal-notifier/` corre nuu puerto 3100 como proceso separado. Es **conocimiento-cero**: contactos resueltos vía identificadores hasheados HMAC — sidecar nunca almacena números teléfono texto plano. `SIGNAL_NOTIFIER_BEARER_TOKEN` compartido autentica app principal a sidecar.

---

## Protocolo ni Codegen

Todos tipos fluyen desde fuente única verdad:

- **Esquemas Zod** nuu `packages/protocol/schemas/` definen todos tipos API ni cable
- **Codegen** (`bun run codegen`) genera structs Swift Codable, clases datos Kotlin `@Serializable`, ni snapshot OpenAPI
- **Etiquetas cripto** nuu `packages/protocol/crypto-labels.json` (57 constantes) generan a TypeScript, Swift, ni Kotlin — sin cadenas raw nuu código cripto
- **Codegen i18n** (`bun run i18n:codegen`) genera `.strings` iOS, `strings.xml` Android, ni `I18n.kt` Kotlin desde archivos JSON locale

Esto significa ke cambio esquema o protocolo se propaga automáticamente a tres plataformas.
