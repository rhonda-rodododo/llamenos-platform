---
title: Saa Ñuu Yoo Ini
description: Ke desplegar Llámenos nuu infraestructura propia nuu Docker Compose, Kubernetes, a Co-op Cloud.
---

Llámenos está diseñado nuu correr nuu infraestructura propia. Autoalojamiento le da control total sobre residencia datos, aislamiento red, ni elecciones infraestructura — crítico nuu organizaciones ke protegen contra adversarios bien financiados.

## Opciones despliegue

| Opción | Mejor nuu | Complejidad | Escalado |
|--------|----------|------------|---------|
| [Docker Compose](/docs/en/deploy/docker) | Servidor único, inicio recomendado | Baja | Nodo único |
| [Kubernetes (Helm)](/docs/en/deploy/kubernetes) | Orquestación multiservicio | Media | Horizontal (multiréplica) |
| [Co-op Cloud](/docs/en/deploy/coopcloud) | Colectivos hospedaje cooperativos | Baja | Nodo único (Swarm) |

## Archivos Docker Compose

Docker Compose usa enfoque por capas:

| Archivo | Propósito |
|------|---------|
| `deploy/docker/docker-compose.yml` | Configuración base — todos servicios, redes, volúmenes |
| `deploy/docker/docker-compose.production.yml` | Superposición producción — TLS vía Let's Encrypt, rotación logs, límites recursos, CSP estricto |
| `deploy/docker/docker-compose.dev.yml` | Superposición desarrollo — observación archivos, puertos expuestos |
| `deploy/docker/docker-compose.ci.yml` | Superposición CI — ambiente pruebas determinista |

Nu **desarrollo local**, use superposición dev. Nu **producción**, apile superposición producción:

```bash
# Local (servicios respaldo únicamente + bun run dev:server)
docker compose -f deploy/docker/docker-compose.dev.yml up -d

# Producción
docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/docker-compose.production.yml up -d
```

O use script configuración:

```bash
./scripts/docker-setup.sh                                     # local
./scripts/docker-setup.sh --domain hotline.org --email a@b   # producción
```

## Servicios núcleo

Todos objetivos despliegue corren yaa servicios núcleo:

| Componente | Propósito |
|-----------|---------|
| **Aplicación Bun** | Servidor API Hono + servicio archivos estáticos |
| **PostgreSQL** | Base datos primaria |
| **RustFS** | Almacenamiento blob compatible S3 (buzón voz, adjuntos, exportaciones) |
| **Relé WebSocket** | Relé WebSocket nuu eventos tiempo real (siempre requerido) |
| **Caddy** | Proxy inverso + TLS automático (Docker Compose) |

## Servicios opcionales

| Componente | Perfil | Propósito |
|-----------|---------|---------|
| **signal-notifier** | `signal` | Sidecar notificación Signal conocimiento cero (puerto 3100) |
| **sip-bridge** | `telephony` | SIP bridge nuu Asterisk/FreeSWITCH/Kamailio (PBX_TYPE selecciona backend) |
| **Ollama/vLLM** | `inference` | Inferencia LLM nuu extracción mensajes |
| **Prometheus + Grafana** | `monitoring` | Métricas ni alertas |

## Ke'ni necesita

### Requisitos mínimos

- Iin servidor Linux (2 núcleos CPU, 2 GB RAM mínimo)
- Docker ni Docker Compose v2 (a iin clúster Kubernetes nuu Helm)
- Iin nombre dominio apuntando a servidor
- `openssl` (nuu generar secretos)
- Al menos iin canal comunicación configurado

### Componentes opcionales

- **Transcripción** — Whisper WASM lado cliente; no se necesita componente servidor adicional
- **SIP bridge** — nuu PBX autoalojado (Asterisk/FreeSWITCH/Kamailio)
- **Signal bridge** — nuu mensajería Signal

## Cloudflare Tunnels (ingress alternativo)

En lugar de exponer puertos 80/443 directamente, puede usar [Cloudflare Tunnels](https://www.cloudflare.com/products/tunnel/) nuu ingress. Yaa oculta IP servidor ni proporciona protección DDoS:

```bash
cloudflared tunnel create llamenos
cloudflared tunnel route dns llamenos hotline.yourorg.com
cloudflared tunnel run llamenos
```

Configure tunnel nuu reenviar a `http://localhost:3000`.

## Consideraciones seguridad

Autoalojamiento le da más control pero también más responsabilidad:

- **Datos en reposo**: Datos PostgreSQL se almacenan sin cifrar por defecto. Use cifrado disco completo (LUKS, dm-crypt) nuu servidor. Notas llamada, transcripciones, ni mensajes tienen E2EE — servidor nunca ve texto plano.
- **Seguridad red**: Use firewall. Solo puertos 80/443 deben ser públicamente accesibles.
- **Secretos**: Nunca ponga secretos nuu archivos Docker Compose a control versiones. Use archivos `.env` (gitignored) a secretos Docker/Kubernetes.
- **Actualizaciones**: Extraer nuevas imágenes regularmente. Ver changelog nuu correcciones seguridad.
- **Respaldos**: Respaldar base datos PostgreSQL ni almacenamiento RustFS regularmente.

## Playbooks Ansible

Directorio `deploy/ansible/` contiene playbooks preflight ni verificación humo:

```bash
# Verificación sistema previo despliegue
ansible-playbook deploy/ansible/preflight.yml -i your_inventory

# Verificación humo posterior despliegue
ansible-playbook deploy/ansible/smoke-check.yml -i your_inventory
```

## Siguientes pasos

- [Despliegue Docker Compose](/docs/en/deploy/docker) — guía servidor único
- [Despliegue Kubernetes](/docs/en/deploy/kubernetes) — chart Helm
- [Despliegue Co-op Cloud](/docs/en/deploy/coopcloud) — hospedaje cooperativo
- [Proveedores Telefonía](/docs/en/deploy/providers/) — configurar proveedores voz
