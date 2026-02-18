---
title: Funcionalidades
subtitle: Todo lo que una plataforma de respuesta a crisis necesita, en un paquete de codigo abierto. Voz, SMS, WhatsApp, Signal y reportes cifrados — construido sobre Cloudflare Workers sin servidores que administrar.
---

## Telefonia multiproveedor

**5 proveedores de voz** — Elige entre Twilio, SignalWire, Vonage, Plivo o Asterisk autoalojado. Configura tu proveedor en la interfaz de administracion o durante el asistente de configuracion. Cambia de proveedor en cualquier momento sin cambios en el codigo.

**Llamadas WebRTC en el navegador** — Los voluntarios pueden contestar llamadas directamente en el navegador sin un telefono. Generacion de tokens WebRTC especificos por proveedor para Twilio, SignalWire, Vonage y Plivo. Preferencia de llamada configurable por voluntario (telefono, navegador o ambos).

## Enrutamiento de llamadas

**Timbre en paralelo** — Cuando un llamante marca, todos los voluntarios en turno y disponibles suenan simultaneamente. El primer voluntario que conteste toma la llamada; el timbre de los demas se detiene de inmediato.

**Turnos programados** — Crea turnos recurrentes con dias y rangos horarios especificos. Asigna voluntarios a turnos. El sistema enruta las llamadas automaticamente a quien este de servicio.

**Cola con musica de espera** — Si todos los voluntarios estan ocupados, los llamantes entran en una cola con musica de espera configurable. El tiempo de espera es ajustable (30-300 segundos). Cuando nadie responde, las llamadas pasan al buzon de voz.

**Buzon de voz como respaldo** — Los llamantes pueden dejar un mensaje de voz (hasta 5 minutos) si ningun voluntario responde. Los mensajes de voz se transcriben con Whisper AI y se cifran para revision del administrador.

## Notas cifradas

**Notas con cifrado de extremo a extremo** — Los voluntarios escriben notas durante y despues de las llamadas. Las notas se cifran en el navegador usando ECIES (secp256k1 + XChaCha20-Poly1305) antes de salir del navegador. El servidor almacena solo texto cifrado.

**Doble cifrado** — Cada nota se cifra dos veces: una para el voluntario que la escribio y otra para el administrador. Ambos pueden descifrar de forma independiente. Nadie mas puede leer el contenido.

**Campos personalizados** — Los administradores definen campos personalizados para las notas: texto, numero, seleccion, casilla de verificacion, area de texto. Los campos se cifran junto con el contenido de la nota.

**Autoguardado de borradores** — Las notas se guardan automaticamente como borradores cifrados en el navegador. Si la pagina se recarga o el voluntario navega a otro lugar, su trabajo se conserva. Los borradores se eliminan al cerrar sesion.

## Transcripcion con IA

**Transcripcion con Whisper** — Las grabaciones de llamadas se transcriben usando Cloudflare Workers AI con el modelo Whisper. La transcripcion ocurre en el servidor y luego se cifra antes del almacenamiento.

**Controles de activacion** — El administrador puede habilitar o deshabilitar la transcripcion de forma global. Los voluntarios pueden desactivarla individualmente. Ambos controles son independientes.

**Transcripciones cifradas** — Las transcripciones usan el mismo cifrado ECIES que las notas. Lo que se almacena es solo texto cifrado.

## Mitigacion de spam

**CAPTCHA por voz** — Deteccion opcional de bots por voz: los llamantes escuchan un numero aleatorio de 4 digitos y deben ingresarlo en el teclado. Bloquea llamadas automatizadas mientras permanece accesible para llamantes reales.

**Limite de frecuencia** — Limite de frecuencia por ventana deslizante por numero de telefono, persistido en almacenamiento de Durable Object. Sobrevive a reinicios del Worker. Umbrales configurables.

**Listas de bloqueo en tiempo real** — Los administradores gestionan listas de bloqueo de numeros telefonicos con entrada individual o importacion masiva. Los bloqueos surten efecto de inmediato. Los llamantes bloqueados escuchan un mensaje de rechazo.

**Mensajes IVR personalizados** — Graba mensajes de voz personalizados para cada idioma soportado. El sistema usa tus grabaciones para los flujos IVR, recurriendo a texto a voz cuando no existe una grabacion.

## Mensajeria multicanal

**SMS** — Mensajeria SMS entrante y saliente via Twilio, SignalWire, Vonage o Plivo. Auto-respuesta con mensajes de bienvenida configurables. Los mensajes fluyen hacia la vista de conversaciones con hilos.

**WhatsApp Business** — Conexion via la API Cloud de Meta (Graph API v21.0). Soporte de mensajes de plantilla para iniciar conversaciones dentro de la ventana de 24 horas. Soporte de mensajes multimedia para imagenes, documentos y audio.

**Signal** — Mensajeria enfocada en la privacidad a traves de un bridge signal-cli-rest-api autoalojado. Monitoreo de salud con degradacion elegante. Transcripcion de mensajes de voz via Workers AI Whisper.

**Conversaciones con hilos** — Todos los canales de mensajeria fluyen hacia una vista de conversaciones unificada. Burbujas de mensajes con marcas de tiempo e indicadores de direccion. Actualizaciones en tiempo real via WebSocket.

## Reportes cifrados

**Rol de reportero** — Un rol dedicado para personas que envian informes o denuncias. Los reporteros ven una interfaz simplificada con solo reportes y ayuda. Invitados a traves del mismo flujo que los voluntarios, con un selector de rol.

**Envios cifrados** — El contenido de los reportes se cifra usando ECIES antes de salir del navegador. Titulos en texto plano para clasificacion, contenido cifrado para privacidad. Los archivos adjuntos se cifran por separado.

**Flujo de trabajo de reportes** — Categorias para organizar reportes. Seguimiento de estado (abierto, reclamado, resuelto). Los administradores pueden reclamar reportes y responder con mensajes cifrados en hilo.

## Panel de administracion

**Asistente de configuracion** — Configuracion guiada paso a paso en el primer inicio de sesion del administrador. Elige que canales habilitar (Voz, SMS, WhatsApp, Signal, Reportes), configura proveedores y establece el nombre de tu linea.

**Lista de verificacion de inicio** — Widget en el panel que da seguimiento al progreso de configuracion: configuracion de canales, incorporacion de voluntarios, creacion de turnos.

**Monitoreo en tiempo real** — Ve las llamadas activas, los llamantes en cola, las conversaciones y el estado de los voluntarios en tiempo real via WebSocket. Las metricas se actualizan al instante.

**Gestion de voluntarios** — Agrega voluntarios con pares de claves generados, gestiona roles (voluntario, administrador, reportero), consulta el estado en linea. Enlaces de invitacion para autoregistro con seleccion de rol.

**Registro de auditoria** — Cada llamada respondida, nota creada, mensaje enviado, reporte enviado, configuracion modificada y accion de administrador queda registrada. Visor paginado para administradores.

**Historial de llamadas** — Historial de llamadas con busqueda, filtros por rango de fechas, busqueda por numero de telefono y asignacion de voluntarios. Exportacion de datos compatible con GDPR.

**Ayuda dentro de la aplicacion** — Secciones de preguntas frecuentes, guias por rol, tarjetas de referencia rapida para atajos de teclado y seguridad. Accesible desde la barra lateral y la paleta de comandos.

## Experiencia del voluntario

**Paleta de comandos** — Presiona Ctrl+K (o Cmd+K en Mac) para acceso instantaneo a navegacion, busqueda, creacion rapida de notas y cambio de tema. Los comandos exclusivos de administrador se filtran segun el rol.

**Notificaciones en tiempo real** — Las llamadas entrantes activan un tono de timbre en el navegador, notificacion push y titulo de pestana parpadeante. Activa o desactiva cada tipo de notificacion de forma independiente en la configuracion.

**Presencia de voluntarios** — Los administradores ven conteos en tiempo real de voluntarios en linea, desconectados y en descanso. Los voluntarios pueden activar un interruptor de descanso en la barra lateral para pausar las llamadas entrantes sin dejar su turno.

**Atajos de teclado** — Presiona ? para ver todos los atajos disponibles. Navega entre paginas, abre la paleta de comandos y realiza acciones comunes sin tocar el raton.

**Autoguardado de borradores de notas** — Las notas se guardan automaticamente como borradores cifrados en el navegador. Si la pagina se recarga o el voluntario navega a otro lugar, su trabajo se conserva. Los borradores se eliminan de localStorage al cerrar sesion.

**Exportacion de datos cifrada** — Exporta notas como un archivo cifrado compatible con GDPR (.enc) usando la clave del voluntario. Solo el autor original puede descifrar la exportacion.

**Temas claro/oscuro** — Alterna entre modo oscuro, modo claro o seguir el tema del sistema. La preferencia se mantiene por sesion.

## Multilenguaje y movil

**12+ idiomas** — Traducciones completas de la interfaz: ingles, espanol, chino, tagalo, vietnamita, arabe, frances, criollo haitiano, coreano, ruso, hindi, portugues y aleman. Soporte RTL para arabe.

**Aplicacion web progresiva** — Instalable en cualquier dispositivo desde el navegador. El service worker almacena en cache la estructura de la app para lanzamiento sin conexion. Notificaciones push para llamadas entrantes.

**Diseno mobile-first** — Diseno responsivo construido para telefonos y tabletas. Barra lateral plegable, controles tactiles y disenos adaptables.

## Autenticacion y gestion de claves

**Almacen de claves protegido por PIN** — Tu clave secreta se cifra con un PIN de 6 digitos usando PBKDF2 (600,000 iteraciones) + XChaCha20-Poly1305. La clave sin cifrar nunca toca sessionStorage ni ninguna API del navegador — solo existe en una variable en memoria, que se borra al bloquear.

**Bloqueo automatico** — El administrador de claves se bloquea automaticamente despues de inactividad o cuando la pestana del navegador se oculta. Reingresa tu PIN para desbloquear.

**Vinculacion de dispositivos** — Configura nuevos dispositivos sin exponer tu clave secreta. Escanea un codigo QR o ingresa un codigo de aprovisionamiento. Usa intercambio de claves ECDH efimero para transferir tu clave cifrada de forma segura entre dispositivos. Las salas de aprovisionamiento expiran despues de 5 minutos.

**Claves de recuperacion** — Durante la incorporacion, recibes una clave de recuperacion en formato Base32 (128 bits de entropia). Esto reemplaza el flujo anterior de mostrar el nsec. Es obligatorio descargar una copia de seguridad cifrada antes de continuar.

**Secreto hacia adelante por nota** — Cada nota se cifra con una clave aleatoria unica, que luego se envuelve via ECIES para cada lector autorizado. Comprometer la clave de identidad no revela notas anteriores.

**Autenticacion con claves Nostr** — Los voluntarios se autentican con pares de claves compatibles con Nostr (nsec/npub). Verificacion de firma BIP-340 Schnorr. Sin contrasenas, sin direcciones de correo electronico.

**Passkeys con WebAuthn** — Soporte opcional de passkeys para inicio de sesion en multiples dispositivos. Registra una llave de hardware o biometria, y luego inicia sesion sin escribir tu clave secreta.

**Gestion de sesiones** — Modelo de acceso en dos niveles: "autenticado pero bloqueado" (solo token de sesion) vs "autenticado y desbloqueado" (PIN ingresado, acceso criptografico completo). Tokens de sesion de 8 horas con avisos de inactividad.
