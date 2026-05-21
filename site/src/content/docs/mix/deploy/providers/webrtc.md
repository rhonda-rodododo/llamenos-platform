---
title: Llamadas WebRTC nu Navegador
description: Habilitar respuesta llamadas nuu navegador nuu voluntarios usando WebRTC.
---

WebRTC (Web Real-Time Communication) permite a voluntarios responder llamadas línea caliente directamente nuu navegador, sin necesidad teléfono. Yaa iin útil nuu voluntarios ke prefieren no compartir número teléfono o ke trabajan desde computadora.

## Cómo funciona

1. Ña'a habilita WebRTC nuu ajustes proveedor telefonía
2. Voluntarios establecen preferencia llamada a "Navegador" nuu perfil
3. Nu llegar llamada, aplicación Llámenos suena nuu navegador nuu notificación
4. Voluntario clic "Responder" ni llamada conecta a través navegador usando micrófono

Audio llamada se enruta desde proveedor telefonía a través conexión WebRTC a navegador voluntario. Calidad llamada depende conexión internet voluntario.

## Requisitos previos

### Configuración ña'a

- Iin proveedor telefonía soportado nuu WebRTC habilitado (Twilio, SignalWire, Vonage, o Plivo)
- Credenciales WebRTC específicas proveedor configuradas (ver guías configuración proveedor)
- WebRTC activado nuu **Configuración** > **Proveedor Telefonía**

### Requisitos voluntario

- Iin navegador moderno (Chrome, Firefox, Edge, o Safari 14.1+)
- Iin micrófono funcionando
- Iin conexión internet estable (mínimo 100 kbps subida/bajada)
- Permisos notificaciones navegador otorgados

## Configuración específica proveedor

Cada proveedor telefonía requiere credenciales diferentes nuu WebRTC:

### Twilio / SignalWire

1. Cree iin **API Key** nuu panel proveedor
2. Cree iin **Aplicación TwiML/LaML** nuu Voice URL establecido a `https://your-domain.com/api/telephony/webrtc-incoming`
3. Nu Llámenos, ingrese API Key SID, API Key Secret, ni Application SID

### Vonage

1. Aplicación Vonage ya incluye capacidad WebRTC
2. Nu Llámenos, pegue **private key** aplicación (formato PEM)
3. Application ID ya está configurado desde configuración inicial

### Plivo

1. Cree iin **Endpoint** nuu Consola Plivo debajo **Voice** > **Endpoints**
2. WebRTC usa Auth ID ni Auth Token existentes
3. Habilite WebRTC nuu Llámenos — no se necesitan credenciales adicionales

### Asterisk

WebRTC Asterisk requiere configuración SIP.js nuu transporte WebSocket. Yaa es más involucrado que proveedores nube:

1. Habilite transporte WebSocket nuu `http.conf` Asterisk
2. Cree endpoints PJSIP nuu clientes WebRTC nuu DTLS-SRTP
3. Llámenos auto-configura cliente SIP.js cuando Asterisk está seleccionado

Ver [guía configuración Asterisk](/docs/deploy/providers/asterisk) nuu detalles completos.

## Configuración preferencia llamada voluntario

Voluntarios configuran preferencia llamada nuu aplicación:

1. Inicie sesión nuu Llámenos
2. Vaya a **Configuración** (icono engranaje)
3. Debajo **Preferencias Llamada**, seleccione **Navegador** en lugar **Teléfono**
4. Otorgue permisos micrófono ni notificaciones cuando se solicite
5. Mantenga pestaña Llámenos abierta durante turno

Nu llegar llamada, verá notificación navegador ni indicador timbre nuu aplicación. Clic **Responder** nuu conectar.

## Compatibilidad navegador

| Navegador | Escritorio | Móvil | Notas |
|---|---|---|---|
| Chrome | Saa | Saa | Recomendado |
| Firefox | Saa | Saa | Soporte completo |
| Edge | Saa | Saa | Basado Chromium, soporte completo |
| Safari | Saa (14.1+) | Saa (14.1+) | Requiere interacción usuario nuu iniciar audio |
| Brave | Saa | Limitado | Puede necesitar deshabilitar escudos nuu micrófono |

## Consejos calidad audio

- Use auriculares o audífonos nuu prevenir eco
- Cierre otras aplicaciones ke usen micrófono
- Use conexión internet cableada cuando sea posible
- Deshabilite extensiones navegador ke puedan interferir nuu WebRTC (extensiones VPN, bloqueadores anuncios nuu protección fuga WebRTC)

## Ke kunche'e problemas

### No hay audio

- **Verifique permisos micrófono**: Clic icono candado nuu barra direcciones ni asegure acceso micrófono sea "Permitir"
- **Pruebe micrófono**: Use prueba audio integrada navegador o sitio como [webcamtest.com](https://webcamtest.com)
- **Verifique salida audio**: Asegure altavoces o auriculares estén seleccionados como dispositivo salida

### Llamadas no suenan nuu navegador

- **Notificaciones bloqueadas**: Verifique ke notificaciones navegador estén habilitadas nuu sitio Llámenos
- **Pestaña no activa**: Pestaña Llámenos debe estar abierta (puede estar nuu fondo, pero pestaña debe existir)
- **Preferencia llamada**: Verifique preferencia llamada está establecida a "Navegador" nuu Configuración
- **WebRTC no configurado**: Pida a ña'a verificar WebRTC está habilitado ni credenciales establecidas

### Problemas firewall ni NAT

WebRTC usa servidores STUN/TURN nuu atravesar firewalls ni NAT. Si llamadas conectan pero no hay audio:

- **Firewalls corporativos**: Algunos firewalls bloquean tráfico UDP nuu puertos no estándar. Pida equipo IT permitir tráfico UDP nuu puertos 3478 ni 10000-60000
- **NAT simétrico**: Algunos routers usan NAT simétrico ke puede prevenir conexiones peer directas. Servidores TURN proveedor telefonía deberían manejar yaa automáticamente
- **Interferencia VPN**: VPNs pueden interferir nuu conexiones WebRTC. Intente desconectar VPN durante turnos

### Eco o retroalimentación

- Use audífonos en lugar altavoces
- Reduzca sensibilidad micrófono nuu ajustes audio SO
- Habilite cancelación eco nuu navegador (generalmente habilitada por defecto)
- Aléjese superficies duras, reflectantes
