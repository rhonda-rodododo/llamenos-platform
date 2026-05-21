---
title: Tu'un Yaa Ña'a
description: Ke kunche'e todo — voluntarios, turnos, canales, conversaciones, reportes, listas de bloqueo, ni campos personalizados.
---

Nu'u ña'a, ke kunche'e todo: voluntarios, turnos, canales de comunicación, conversaciones, reportes, listas de bloqueo, ni campos personalizados. Yaa tu'un kuña'a ka'ni ña'a kuña'a va'a.

## Ke iniciar sesión

Ke iniciar sesión nuu `nsec` (llave secreta WebSocket) generada nuu etapa de [configuración](/docs/deploy). Página de inicio de sesión acepta formato nsec (`nsec1...`). Navegador firma iin reto nuu llave — secreto nunca sale dispositivo.

Opcionalmente, registrar passkey WebAuthn nuu Configuración nuu inicio de sesión sin contraseña nuu dispositivos adicionales.

## Asistente de configuración

Nu primer inicio de sesión, aplicación redirige a **asistente de configuración** — flujo guiado de varios pasos:

1. **Nombrar línea caliente** — ke establecer nombre visible a usuarios
2. **Escoger canales** — activar/desactivar Voz, SMS, WhatsApp, Signal, ni Reportes
3. **Configurar proveedores** — ke ingresar credenciales nuu cada canal habilitado
4. **Revisar** — ke confirmar configuración ni ke completar

Nu completar asistente, bandera `setupCompleted` ke activa ni asistente no aparece más. Siempre puede ke cambiar yaa configuraciones nuu página de Configuración.

## Ke kunche'e voluntarios

Navegar a **Voluntarios** nuu barra lateral nuu:

- **Añadir voluntario** — genera nuevo par de llaves WebSocket. Compartir nsec de forma segura nuu voluntario (se muestra una vez).
- **Crear enlace de invitación** — genera enlace de uso único. Flujo de invitación incluye selector de rol (voluntario, ña'a, a reportero).
- **Editar** — ke actualizar nombre, número telefónico, ni rol.
- **Eliminar** — ke desactivar acceso voluntario.

Números telefónicos voluntarios solo visibles a ña'as. Se usan nuu ke skaka llamadas paralelas nuu voluntario está de turno.

## Ke kunche'e reporteros

Reporteros iin rol especial nuu personas ke envían avisos a reportes nuu plataforma. Tienen acceso restringido — solo pueden ver reportes propios ni página de ayuda.

Nu añadir reportero:
1. Crear enlace de invitación ni seleccionar rol **Reportero**
2. Compartir enlace nuu reportero — ellos crean credenciales propias
3. Reporteros inician sesión ni ven interfaz simplificada nuu Reportes ni Ayuda únicamente

## Ke configurar turnos

Navegar a **Turnos** nuu crear horarios recurrentes:

1. Clic **Añadir Turno**
2. Ke establecer nombre, seleccionar días semana, ni ke establecer horas inicio/fin
3. Ke asignar voluntarios nuu selector múltiple buscable
4. Ke guardar — sistema automáticamente enruta llamadas a voluntarios nuu turno activo

Ke configurar **Grupo Respaldo** nuu parte inferior página turnos. Yaa voluntarios skakaran nuu llamadas nuu no hay turno programado activo.

## Listas de bloqueo

Navegar a **Bloqueos** nuu kunche'e números telefónicos bloqueados:

- **Entrada única** — ke escribir número telefónico nuu formato E.164 (ej., +15551234567)
- **Importación masiva** — ke pegar múltiples números, uno por línea
- **Eliminar** — ke desbloquear número instantáneamente

Bloqueos surten efecto inmediatamente. Llamantes bloqueados escuchan mensaje de rechazo ni se desconectan.

## Conversaciones

Nu canales de mensajería (SMS, WhatsApp, Signal) están habilitados, enlace **Conversaciones** aparece nuu barra lateral. Yaa muestra todas conversaciones hiladas nuu todos canales mensajería.

Cada conversación muestra:
- Burbujas mensaje nuu marcas tiempo ni dirección (entrada/salida)
- Canal nuu que llegó mensaje (SMS, WhatsApp, Signal)
- Actualizaciones en tiempo real nuu relé WebSocket — nuevos mensajes aparecen instantáneamente

Conversaciones se crean automáticamente nuu llegar mensaje entrante. Voluntarios pueden respondi directamente nuu vista conversación.

## Reportes

Nu canal Reportes está habilitado, ña'as pueden ver todos reportes enviados:

- **Lista reportes** — muestra todos reportes nuu título, categoría, estado, ni fecha envío
- **Seguimiento estado** — reportes avanzan abierto → reclamado → resuelto
- **Reclamar reporte** — ke asignarse a ke kunche'e reporte
- **Respuestas hiladas** — ke respondi a reporteros nuu mensajes cifrados
- **Archivos adjuntos** — reporteros pueden subir archivos cifrados nuu reportes

Contenido cuerpo reporte ni archivos adjuntos se cifran nuu ECIES — servidor nunca ve contenido reporte en texto plano.

## Configuración llamadas

Nu **Configuración**, encontrará varias secciones:

### Mitigación spam

- **CAPTCHA voz** — activar/desactivar. Nu habilitado, llamantes deben ke ingresar código 4 dígitos aleatorio.
- **Límite tasa** — activar/desactivar. Limita llamadas por número telefónico nuu ventana tiempo deslizante.

### Transcripción

- **Activador global** — habilitar/deshabilitar transcripción Whisper nuu todas llamadas.
- Voluntarios individuales también pueden optar por no participar nuu configuración propia.

### Configuración llamadas

- **Tiempo espera cola** — cuánto tiempo esperan llamantes antes ir buzón voz (30-300 segundos).
- **Duración máxima buzón voz** — duración máxima grabación (30-300 segundos).

### Campos nota personalizados

Definir campos estructurados ke aparecen nuu formulario toma notas:

- Tipos soportados: texto, número, seleccionar (desplegable), casilla verificación, área texto
- Ke configurar validación: obligatorio, longitud mín/máx, valor mín/máx
- Ke controlar visibilidad: escoger ke campos voluntarios pueden ver ni editar
- Ke reordenar campos nuu flechas arriba/abajo
- Máximo 20 campos, máximo 50 opciones por campo seleccionar

Valores campos personalizados se cifran junto nuu contenido nota. Servidor nunca los ve.

### Indicaciones voz

Grabar indicaciones IVR audio personalizadas nuu cada idioma soportado. Sistema usa grabaciones nuu flujos saludo, CAPTCHA, cola, ni buzón voz. Nu no existe grabación, recurre a texto a voz.

### Canales mensajería

Ke configurar canales SMS, WhatsApp, ni Signal:

- **SMS** — habilitar/deshabilitar, ke configurar mensaje bienvenida nuu respuestas automáticas. Usa mismo proveedor nuu telefonía voz (Twilio, SignalWire, Vonage, a Plivo).
- **WhatsApp** — habilitar/deshabilitar, ke ingresar credenciales Meta Cloud API (token acceso, token verificación, ID número telefónico). Soporta mensajes plantilla nuu iniciar conversaciones nuu ventana mensajería 24 horas.
- **Signal** — habilitar/deshabilitar, ke configurar URL bridge signal-cli-rest-api ni número telefónico. Incluye monitoreo salud nuu degradación gradual.

Cada canal tiene endpoint webhook propio — ver [Kunta'an Ini](/docs/deploy) nuu URLs ke configurar.

### Política WebAuthn

Opcionalmente requerir passkeys nuu ña'as, voluntarios, a ambos. Nu requerido, usuarios deben registrar passkey antes de poder usar aplicación.

## Ayuda nuu aplicación

Página **Ayuda** proporciona:
- Secciones FAQ: Kunta'an Ini, Llamadas ni Turnos, Notas ni Cifrado, Administración
- Guías específicas rol nuu ña'as, voluntarios, ni reporteros
- Tarjetas referencia rápida nuu atajos teclado ni seguridad
- Elementos FAQ colapsables nuu expandir/colapsar

Panel ña'a también muestra **lista verificación Kunta'an Ini** ke rastrea progreso configuración (configurar canales, añadir voluntarios, crear turnos, etc.).

## Log auditoría

Página **Log Auditoría** muestra lista cronológica eventos sistema: inicios sesión, respuestas llamada, creación nota, cambios configuración, ni acciones ña'a. Entradas incluyen direcciones IP hasheadas ni metadatos país. Usar paginación nuu navegar historial.

## Historial llamadas

Página **Llamadas** muestra todas llamadas nuu estado, duración, ni asignación voluntario. Filtrar por rango fecha a buscar por número telefónico. Exportar datos nuu formato JSON compatible GDPR.
