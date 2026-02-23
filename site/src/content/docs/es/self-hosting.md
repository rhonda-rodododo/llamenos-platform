---
title: Autoalojamiento
description: Despliega Llamenos en tu propia infraestructura con Docker Compose o Kubernetes.
---

Llamenos puede ejecutarse en Cloudflare Workers **o** en tu propia infraestructura. El autoalojamiento te da control total sobre la residencia de datos, el aislamiento de red y las decisiones de infraestructura — importante para organizaciones que no pueden usar plataformas cloud de terceros o necesitan cumplir requisitos estrictos de cumplimiento.

## Opciones de despliegue

| Opcion | Ideal para | Complejidad | Escalabilidad |
|--------|-----------|-------------|---------------|
| [Cloudflare Workers](/docs/getting-started) | Inicio mas facil, edge global | Baja | Automatica |
| [Docker Compose](/docs/deploy-docker) | Autoalojamiento en un servidor | Media | Nodo unico |
| [Kubernetes (Helm)](/docs/deploy-kubernetes) | Orquestacion multi-servicio | Alta | Horizontal (multi-replica) |

## Diferencias de arquitectura

Ambos objetivos de despliegue ejecutan **exactamente el mismo codigo de aplicacion**. La diferencia esta en la capa de infraestructura:

| Componente | Cloudflare | Autoalojado |
|------------|------------|-------------|
| **Runtime del backend** | Cloudflare Workers | Node.js (via Hono) |
| **Almacenamiento de datos** | Durable Objects (KV) | PostgreSQL |
| **Almacenamiento de archivos** | R2 | MinIO (compatible con S3) |
| **Transcripcion** | Workers AI (Whisper) | Contenedor faster-whisper |
| **Archivos estaticos** | Workers Assets | Caddy / Hono serveStatic |
| **WebSocket** | Hibernatable WebSockets | Paquete ws (persistente) |
| **Terminacion TLS** | Edge de Cloudflare | Caddy (HTTPS automatico) |
| **Costo** | Basado en uso (plan gratuito disponible) | Costos de tu servidor |

## Que necesitas

### Requisitos minimos

- Un servidor Linux (2 nucleos CPU, 2 GB RAM minimo)
- Docker y Docker Compose v2 (o un cluster Kubernetes para Helm)
- Un nombre de dominio apuntando a tu servidor
- Un par de claves admin (generado con `bun run bootstrap-admin`)
- Al menos un canal de comunicacion (proveedor de voz, SMS, etc.)

### Componentes opcionales

- **Transcripcion Whisper** — requiere 4 GB+ de RAM (CPU) o una GPU para procesamiento mas rapido
- **Asterisk** — para telefonia SIP autoalojada (ver [configuracion de Asterisk](/docs/setup-asterisk))
- **Bridge Signal** — para mensajeria Signal (ver [configuracion de Signal](/docs/setup-signal))

## Comparacion rapida

**Elige Docker Compose si:**
- Ejecutas en un solo servidor o VPS
- Quieres la configuracion autoalojada mas simple posible
- Te sientes comodo con los basicos de Docker

**Elige Kubernetes (Helm) si:**
- Ya tienes un cluster K8s
- Necesitas escalado horizontal (multiples replicas)
- Quieres integrarte con herramientas K8s existentes (cert-manager, external-secrets, etc.)

## Consideraciones de seguridad

El autoalojamiento te da mas control pero tambien mas responsabilidad:

- **Datos en reposo**: Los datos de PostgreSQL se almacenan sin cifrar por defecto. Usa cifrado de disco completo (LUKS, dm-crypt) en tu servidor, o habilita PostgreSQL TDE si esta disponible. Ten en cuenta que las notas de llamadas y transcripciones ya son E2EE — el servidor nunca ve texto plano.
- **Seguridad de red**: Usa un firewall para restringir acceso. Solo los puertos 80/443 deben ser accesibles publicamente.
- **Secretos**: Nunca pongas secretos en archivos Docker Compose o control de versiones. Usa archivos `.env` (excluidos de imagenes) o secretos de Docker/Kubernetes.
- **Actualizaciones**: Descarga nuevas imagenes regularmente. Consulta el [changelog](https://github.com/your-org/llamenos/blob/main/CHANGELOG.md) para correcciones de seguridad.
- **Respaldos**: Respalda la base de datos PostgreSQL y el almacenamiento MinIO regularmente. Consulta la seccion de respaldos en cada guia de despliegue.

## Siguientes pasos

- [Despliegue con Docker Compose](/docs/deploy-docker) — funcionando en 10 minutos
- [Despliegue en Kubernetes](/docs/deploy-kubernetes) — despliega con Helm
- [Primeros Pasos](/docs/getting-started) — despliegue en Cloudflare Workers
