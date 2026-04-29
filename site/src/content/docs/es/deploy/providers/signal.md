---
title: "Configurar Signal"
description: Configura el canal de mensajeria Signal a traves del bridge signal-cli para mensajeria enfocada en privacidad.
---

Llamenos soporta mensajeria Signal a traves de un bridge [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) autoalojado. Signal ofrece las mayores garantias de privacidad de cualquier canal de mensajeria, lo que lo hace ideal para escenarios de respuesta a crisis sensibles.

## Requisitos previos

- Un servidor Linux o VM para el bridge (puede ser el mismo servidor que Asterisk, o separado)
- Docker instalado en el servidor del bridge
- Un numero de telefono dedicado para el registro en Signal
- Acceso de red desde el bridge a tu Cloudflare Worker

## Arquitectura

```mermaid
flowchart LR
    User["Usuario Signal"] --> Servers["Servidores Signal"]
    Servers --> Bridge["Bridge signal-cli<br/>(autoalojado)"]
    Bridge --> Worker["Worker Llamenos<br/>(Cloudflare)"]
```

El bridge signal-cli se ejecuta en tu infraestructura y reenvia mensajes a tu Worker via webhooks HTTP. Esto significa que controlas toda la ruta del mensaje desde Signal hasta tu aplicacion.

## 1. Desplegar el bridge signal-cli

Ejecuta el contenedor Docker de signal-cli-rest-api:

```bash
docker run -d \
  --name signal-cli \
  --restart unless-stopped \
  -p 8080:8080 \
  -v signal-cli-data:/home/.local/share/signal-cli \
  -e MODE=json-rpc \
  bbernhard/signal-cli-rest-api:latest
```

## 2. Registrar un numero de telefono

Registra el bridge con un numero de telefono dedicado:

```bash
# Solicitar un codigo de verificacion via SMS
curl -X POST http://localhost:8080/v1/register/+1234567890

# Verificar con el codigo recibido
curl -X POST http://localhost:8080/v1/register/+1234567890/verify/123456
```

## 3. Configurar el reenvio de webhooks

Configura el bridge para reenviar mensajes entrantes a tu Worker:

```bash
curl -X PUT http://localhost:8080/v1/about \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "url": "https://tu-worker.tu-dominio.com/api/messaging/signal/webhook",
      "headers": {
        "Authorization": "Bearer tu-secreto-de-webhook"
      }
    }
  }'
```

## 4. Habilitar Signal en la configuracion de admin

Navega a **Configuracion de Admin > Canales de Mensajeria** (o usa el asistente de configuracion) y activa **Signal**.

Ingresa lo siguiente:
- **URL del Bridge** — la URL de tu bridge signal-cli (ej., `https://signal-bridge.ejemplo.com:8080`)
- **Clave API del Bridge** — un token bearer para autenticar solicitudes al bridge
- **Secreto del Webhook** — el secreto usado para validar webhooks entrantes (debe coincidir con lo configurado en el paso 3)
- **Numero Registrado** — el numero de telefono registrado con Signal

## 5. Probar

Envia un mensaje de Signal a tu numero registrado. La conversacion debera aparecer en la pestana de **Conversaciones**.

## Monitoreo de salud

Llamenos monitorea la salud del bridge signal-cli:
- Verificaciones periodicas de salud al endpoint `/v1/about` del bridge
- Degradacion elegante si el bridge no esta accesible — los demas canales continuan funcionando
- Alertas al administrador cuando el bridge se cae

## Transcripcion de mensajes de voz

Los mensajes de voz de Signal pueden transcribirse directamente en el navegador del voluntario usando Whisper del lado del cliente (WASM via `@huggingface/transformers`). El audio nunca sale del dispositivo — la transcripcion se cifra y almacena junto al mensaje de voz en la vista de conversacion. Los voluntarios pueden activar o desactivar la transcripcion en su configuracion personal.

## Notas de seguridad

- Signal proporciona cifrado de extremo a extremo entre el usuario y el bridge signal-cli
- El bridge descifra los mensajes para reenviarlos como webhooks — el servidor del bridge tiene acceso al texto plano
- La autenticacion de webhooks usa tokens bearer con comparacion de tiempo constante
- Manten el bridge en la misma red que tu servidor Asterisk (si aplica) para minima exposicion
- El bridge almacena historial de mensajes localmente en su volumen Docker — considera cifrado en reposo
- Para maxima privacidad: autoaloja tanto Asterisk (voz) como signal-cli (mensajeria) en tu propia infraestructura

## Solucion de problemas

- **El bridge no recibe mensajes**: Verifica que el numero de telefono este correctamente registrado con `GET /v1/about`
- **Fallos en la entrega de webhooks**: Verifica que la URL del webhook sea accesible desde el servidor del bridge y que el encabezado de autorizacion coincida
- **Problemas de registro**: Algunos numeros de telefono pueden necesitar ser desvinculados de una cuenta Signal existente primero
