---
title: "Desplegar: Kubernetes (Helm)"
description: Despliega Llamenos en Kubernetes usando el chart oficial de Helm.
---

Esta guia cubre el despliegue de Llamenos en un cluster de Kubernetes usando el chart oficial de Helm. El chart gestiona la aplicacion, almacenamiento de objetos RustFS y transcripcion Whisper opcional como despliegues separados.

## Requisitos previos

- Un cluster de Kubernetes (v1.24+) — gestionado (EKS, GKE, AKS) o autoalojado
- [Helm](https://helm.sh/) v3.10+
- [kubectl](https://kubernetes.io/docs/tasks/tools/) configurado para tu cluster
- Un controlador de ingress (NGINX Ingress, Traefik, etc.)
- cert-manager (opcional, para certificados TLS automaticos)
- [Bun](https://bun.sh/) instalado localmente (para generar el par de claves admin)


## Escalado

El despliegue usa estrategia `RollingUpdate` para actualizaciones sin tiempo de inactividad. Escala las replicas segun tu trafico:

```bash
kubectl scale deployment llamenos --replicas=3
```

Los advisory locks de PostgreSQL garantizan la consistencia de datos entre replicas.


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


## cert-manager integration

If you have [cert-manager](https://cert-manager.io/) installed, configure the cluster issuer for automatic TLS:

```yaml
# cluster-issuer.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@yourdomain.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
```

Reference it in your ingress annotations:

```yaml
ingress:
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
```

## External Secrets Operator

For production, use [External Secrets Operator](https://external-secrets.io/) to sync secrets from AWS SSM, Vault, GCP Secret Manager, etc.

```yaml
# llamenos-externalsecret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: llamenos-secrets
  namespace: llamenos
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: my-secret-store
    kind: ClusterSecretStore
  target:
    name: llamenos-secrets
    creationPolicy: Owner
  data:
    - secretKey: postgres-password
      remoteRef:
        key: llamenos/postgres-password
    - secretKey: hmac-secret
      remoteRef:
        key: llamenos/hmac-secret
    - secretKey: server-nostr-secret
      remoteRef:
        key: llamenos/server-nostr-secret
    - secretKey: s3-access-key
      remoteRef:
        key: llamenos/s3-access-key
    - secretKey: s3-secret-key
      remoteRef:
        key: llamenos/s3-secret-key
```

Then reference in Helm values:

```yaml
secrets:
  existingSecret: llamenos-secrets
```

## Prometheus ServiceMonitor

Enable the `ServiceMonitor` for Prometheus Operator:

```yaml
monitoring:
  enabled: true
  serviceMonitor:
    namespace: monitoring
    interval: 30s
    scrapeTimeout: 10s
    labels:
      release: kube-prometheus-stack
```

## Production hardening checklist

Before going live:

- [ ] **Secrets via ESO or Sealed Secrets** — never commit secrets to values files
- [ ] **Resource requests and limits** set on all deployments
- [ ] **PodDisruptionBudget** configured (`minAvailable: 1`) for zero-downtime drains
- [ ] **NetworkPolicy** restricting ingress to app pod from ingress controller only
- [ ] **Read-only root filesystem** (`securityContext.readOnlyRootFilesystem: true`)
- [ ] **Non-root user** (`securityContext.runAsNonRoot: true`)
- [ ] **PostgreSQL TLS** enabled (`postgres.sslMode: require`)
- [ ] **cert-manager ClusterIssuer** configured for automatic Let's Encrypt renewal
- [ ] **Prometheus ServiceMonitor** enabled and scraping
- [ ] **Liveness/readiness probes** verified after deploy
- [ ] **Image pull policy** set to `IfNotPresent`
- [ ] **Ingress rate limiting** annotations configured


## Siguientes pasos

- [Guia del Administrador](/docs/admin-guide) — configura la linea
- [Autoalojamiento](/docs/deploy/self-hosting) — compara opciones de despliegue
- [Despliegue con Docker Compose](/docs/deploy/docker) — alternativa mas simple
