---
title: "Desplegar: Kubernetes (Helm)"
description: Despliega Llamenos en Kubernetes usando el chart oficial de Helm.
---

Esta guia cubre el despliegue de Llamenos en un cluster de Kubernetes usando el chart oficial de Helm. El chart gestiona la aplicacion, almacenamiento de objetos MinIO y transcripcion Whisper opcional como despliegues separados.

## Requisitos previos

- Un cluster de Kubernetes (v1.24+) — gestionado (EKS, GKE, AKS) o autoalojado
- [Helm](https://helm.sh/) v3.10+
- [kubectl](https://kubernetes.io/docs/tasks/tools/) configurado para tu cluster
- Un controlador de ingress (NGINX Ingress, Traefik, etc.)
- cert-manager (opcional, para certificados TLS automaticos)
- [Bun](https://bun.sh/) instalado localmente (para generar el par de claves admin)

## 1. Generar el par de claves admin

```bash
git clone https://github.com/your-org/llamenos.git
cd llamenos
bun install
bun run bootstrap-admin
```

Guarda el **nsec** de forma segura. Copia la **clave publica hex** para los valores de Helm.

## 2. Instalar el chart

```bash
helm install llamenos deploy/helm/llamenos/ \
  --set secrets.adminPubkey=TU_CLAVE_PUBLICA_HEX \
  --set secrets.minioAccessKey=tu-clave-acceso \
  --set secrets.minioSecretKey=tu-clave-secreta \
  --set ingress.hosts[0].host=linea.tudominio.com \
  --set ingress.tls[0].secretName=llamenos-tls \
  --set ingress.tls[0].hosts[0]=linea.tudominio.com
```

O crea un archivo `values-production.yaml` para despliegues reproducibles:

```yaml
# values-production.yaml
app:
  image:
    repository: ghcr.io/your-org/llamenos
    tag: "0.10.0"
  port: 3000
  persistence:
    size: 20Gi
    storageClass: "gp3"

secrets:
  adminPubkey: "tu_clave_publica_hex"
  minioAccessKey: "tu-clave-acceso"
  minioSecretKey: "tu-clave-secreta-cambiame"

minio:
  enabled: true
  persistence:
    size: 50Gi

whisper:
  enabled: true
  model: "Systran/faster-whisper-base"
  device: "cpu"

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: linea.tudominio.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: llamenos-tls
      hosts:
        - linea.tudominio.com
```

Luego instala:

```bash
helm install llamenos deploy/helm/llamenos/ -f values-production.yaml
```

## 3. Verificar el despliegue

```bash
kubectl get pods -l app.kubernetes.io/instance=llamenos
kubectl port-forward svc/llamenos 3000:3000
curl http://localhost:3000/api/health
```

## 4. Configurar DNS

Apunta tu dominio a la IP externa del controlador de ingress:

```bash
kubectl get ingress llamenos
```

## 5. Primer inicio de sesion

Abre `https://linea.tudominio.com` en tu navegador. Inicia sesion con el nsec admin y completa el asistente de configuracion.

## Referencia de configuracion del chart

### Aplicacion

| Parametro | Descripcion | Predeterminado |
|-----------|-------------|----------------|
| `app.image.repository` | Imagen del contenedor | `ghcr.io/your-org/llamenos` |
| `app.image.tag` | Etiqueta de imagen | `latest` |
| `app.port` | Puerto de la aplicacion | `3000` |
| `app.replicas` | Replicas de pods | `2` |

### Secretos

| Parametro | Descripcion | Predeterminado |
|-----------|-------------|----------------|
| `secrets.adminPubkey` | Clave publica hex Nostr del admin | `""` |
| `secrets.minioAccessKey` | Clave de acceso MinIO | `""` (requerido) |
| `secrets.minioSecretKey` | Clave secreta MinIO | `""` (requerido) |
| `secrets.existingSecret` | Usar un Secret K8s existente | `""` |

> **Consejo**: Para produccion, usa `secrets.existingSecret` para referenciar un Secret gestionado por External Secrets Operator, Sealed Secrets o Vault.

### Uso de secretos externos

Para produccion, evita poner secretos directamente en los valores de Helm:

```yaml
secrets:
  existingSecret: llamenos-secrets
```

```bash
kubectl create secret generic llamenos-secrets \
  --from-literal=ADMIN_PUBKEY=tu_clave \
  --from-literal=MINIO_ACCESS_KEY=tu_clave \
  --from-literal=MINIO_SECRET_KEY=tu_clave
```

## Escalado

El despliegue usa estrategia `RollingUpdate` para actualizaciones sin tiempo de inactividad. Escala las replicas segun tu trafico:

```bash
kubectl scale deployment llamenos --replicas=3
```

Los advisory locks de PostgreSQL garantizan la consistencia de datos entre replicas.

Para escalado global automatico sin gestionar infraestructura, considera el [despliegue en Cloudflare Workers](/docs/getting-started).

## Actualizacion

```bash
helm upgrade llamenos deploy/helm/llamenos/ -f values-production.yaml
```

## Desinstalacion

```bash
helm uninstall llamenos
```

> **Nota**: Los PersistentVolumeClaims no se eliminan con `helm uninstall`. Eliminelos manualmente si desea borrar todos los datos:
> ```bash
> kubectl delete pvc -l app.kubernetes.io/instance=llamenos
> ```

## Siguientes pasos

- [Guia del Administrador](/docs/admin-guide) — configura la linea
- [Autoalojamiento](/docs/self-hosting) — compara opciones de despliegue
- [Despliegue con Docker Compose](/docs/deploy-docker) — alternativa mas simple
