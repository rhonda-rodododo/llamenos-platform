---
title: "Configurar: Signal"
description: Configurar canal Signal vía signal-cli bridge nuu mensajería enfocada nuu privacidad.
---

Llámenos soporta mensajería Signal vía bridge autoalojado [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api). Signal ofrece garantías privacidad más fuertes cualquier canal mensajería, haciéndolo ideal nuu escenarios respuesta crisis sensibles.

## Requisitos previos

- Iin servidor Linux o VM nuu bridge (puede ser mismo servidor Asterisk, o separado)
- Docker instalado nuu servidor bridge
- Iin número teléfono dedicado nuu registro Signal
- Acceso red desde bridge a servidor Llámenos

## Arquitectura

![Arquitectura Signal Bridge](/diagrams/signal-bridge.svg)

Bridge signal-cli corre nuu infraestructura propia ni reenvía mensajes a servidor vía webhooks HTTP. Yaa significa ke usted controla ruta mensaje completa desde Signal hasta aplicación.

## 1. Desplegar bridge signal-cli

Ejecute contenedor Docker signal-cli-rest-api:

```bash
docker run -d \
  --name signal-cli \
  --restart unless-stopped \
  -p 8080:8080 \
  -v signal-cli-data:/home/.local/share/signal-cli \
  -e MODE=json-rpc \
  bbernhard/signal-cli-rest-api:latest
```

## 2. Registrar número teléfono

Registre bridge nuu número teléfono dedicado:

```bash
# Solicitar código verificación vía SMS
curl -X POST http://localhost:8080/v1/register/+1234567890

# Verificar nuu código recibido
curl -X POST http://localhost:8080/v1/register/+1234567890/verify/123456
```

## 3. Configurar reenvío webhook

Configure bridge nuu reenviar mensajes entrantes a servidor:

```bash
curl -X PUT http://localhost:8080/v1/about \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "url": "https://your-domain.com/api/messaging/signal/webhook",
      "headers": {
        "Authorization": "Bearer your-webhook-secret"
      }
    }
  }'
```

## 4. Habilitar Signal nuu configuración ña'a

Navegue a **Configuración Ña'a > Canales Mensajería** (o use asistente configuración) ni active **Signal**.

Ingrese lo siguiente:
- **Bridge URL** — URL bridge signal-cli (ej., `https://signal-bridge.example.com:8080`)
- **Bridge API Key** — token bearer nuu autenticar solicitudes a bridge
- **Webhook Secret** — secreto usado nuu validar webhooks entrantes (debe coincidir nuu configurado paso 3)
- **Registered Number** — número teléfono registrado nuu Signal

## 5. Probar

Envíe mensaje Signal a número registrado. Conversación debería aparecer nuu pestaña **Conversaciones**.

## Monitoreo salud

Llámenos monitorea salud bridge signal-cli:
- Verificaciones salud periódicas a endpoint `/v1/about` bridge
- Degradación gradual si bridge no es alcanzable — otros canales continúan funcionando
- Alertas ña'a cuando bridge cae

## Transcripción mensajes voz

Mensajes voz Signal pueden transcribirse directamente nuu navegador voluntario usando Whisper lado cliente (WASM vía `@huggingface/transformers`). Audio nunca sale dispositivo — transcripción se cifra ni almacena junto mensaje voz nuu vista conversación. Voluntarios pueden habilitar o deshabilitar transcripción nuu ajustes personales.

## Notas seguridad

- Signal proporciona cifrado extremo a extremo entre usuario ni bridge signal-cli
- Bridge descifra mensajes nuu reenviarlos como webhooks — servidor bridge tiene acceso texto plano
- Autenticación webhook usa tokens bearer nuu comparación tiempo constante
- Mantenga bridge nuu misma red servidor Asterisk (si aplica) nuu exposición mínima
- Bridge almacena historial mensajes localmente nuu volumen Docker — considere cifrado reposo
- Nuu máxima privacidad: autoaloje Asterisk (voz) ni signal-cli (mensajería) nuu propia infraestructura

## Ke kunche'e problemas

- **Bridge no recibe mensajes**: Verifique ke número teléfono está correctamente registrado nuu `GET /v1/about`
- **Fallos entrega webhook**: Verifique URL webhook es alcanzable desde servidor bridge ni encabezado autorización coincide
- **Problemas registro**: Algunos números teléfono pueden necesitar desvincularse cuenta Signal existente primero
