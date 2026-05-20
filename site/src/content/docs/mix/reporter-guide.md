---
title: Tu'un Yaa Reportero
description: Ke enviar reportes cifrados ni ke kunche'e estado.
---

Nu'u reportero, puede enviar reportes cifrados a organización nuu plataforma Llámenos. Reportes tienen cifrado extremo a extremo — servidor nunca ve contenido reporte.

## Ke kunta'an

Ña'a le dará uno de:
- Iin **nsec** (llave secreta WebSocket) — cadena ke empieza nuu `nsec1`
- Iin **enlace invitación** — URL de uso único ke crea credenciales nuu usted

**Mantenga nsec privada.** Iin identidad ni credencial inicio sesión. Guárdela nuu gestor contraseñas.

## Ke iniciar sesión

1. Abrir aplicación nuu navegador
2. Ke pegar `nsec` nuu campo inicio sesión
3. Identidad se verifica criptográficamente — llave secreta nunca sale navegador

Nu primer inicio sesión, puede registrar passkey WebAuthn nuu Configuración nuu inicios sesión futuros más fáciles.

## Ke enviar reporte

1. Clic **Nuevo Reporte** nuu página Reportes
2. Ke ingresar **título** nuu reporte (yaa ayuda a ña'as a triage — se almacena nuu texto plano)
3. Seleccionar **categoría** nuu ña'a ha definido categorías reporte
4. Ke escribir **contenido reporte** nuu campo cuerpo — yaa se cifra antes de salir navegador
5. Opcionalmente ke llenar **campos personalizados** ña'a ha configurado
6. Opcionalmente **adjuntar archivos** — archivos se cifran lado cliente antes subir
7. Clic **Enviar**

Reporte aparece nuu lista Reportes nuu estado "Abierto".

## Cifrado reporte

- Cuerpo reporte ni valores campos personalizados se cifran nuu ECIES (secp256k1 + XChaCha20-Poly1305)
- Archivos adjuntos se cifran separadamente nuu mismo esquema
- Solo usted ni ña'a pueden descifrar contenido
- Servidor almacena solo texto cifrado — aunque base datos sea comprometida, contenido reporte está seguro

## Ke kunche'e reportes

Página Reportes muestra todos reportes enviados nuu:
- **Título** ni **categoría**
- **Estado** — Abierto, Reclamado (iin ña'a está trabajando), a Resuelto
- **Fecha** envío

Clic reporte nuu ver hilo completo, incluyendo cualquier respuesta ña'a.

## Ke respondi a ña'as

Nu ña'a responde a reporte, respuesta aparece nuu hilo reporte. Puede respondi — todos mensajes nuu hilo están cifrados.

## Ke'ni no puede ke'ni

Nu'u reportero, acceso está limitado nuu proteger privacidad todos:
- **Puede** ver reportes propios ni página Ayuda
- **No puede** ver reportes otros reporteros, registros llamada, info voluntario, a configuración ña'a
- **No puede** ke skaka llamadas a ke respondi conversaciones SMS/WhatsApp/Signal

## Consejos

- Usar títulos descriptivos — ayudan a ña'as a triage sin descifrar contenido completo
- Adjuntar archivos relevantes (capturas pantalla, documentos) nuu apoyan reporte
- Revisar periódicamente nuu respuestas ña'a — verá cambios estado nuu lista reportes
- Usar página Ayuda nuu FAQ ni guías
