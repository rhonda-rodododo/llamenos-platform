---
title: "Deploy: Kubernetes (Helm)"
description: Deploy Llamenos to Kubernetes using the official Helm chart.
---

This guide covers deploying Llamenos to a Kubernetes cluster using the official Helm chart. The chart manages the application, MinIO storage, and optional Whisper/signal-notifier services as separate deployments. You provide a PostgreSQL database.

## Prerequisites

- A Kubernetes cluster (v1.24+) — managed (EKS, GKE, AKS) or self-hosted
- A PostgreSQL 14+ instance (managed or self-hosted)
- [Helm](https://helm.sh/) v3.10+
- [kubectl](https://kubernetes.io/docs/tasks/tools/) configured for your cluster
- An ingress controller (NGINX Ingress, Traefik, etc.)
- cert-manager (optional, for automatic TLS)

## 1. Install the chart

```bash
helm install llamenos deploy/helm/llamenos/ \
  --set secrets.postgresPassword=YOUR_PG_PASSWORD \
  --set postgres.host=YOUR_PG_HOST \
  --set minio.credentials.accessKey=your-access-key \
  --set minio.credentials.secretKey=your-secret-key \
  --set ingress.hosts[0].host=hotline.yourdomain.com \
  --set ingress.tls[0].secretName=llamenos-tls \
  --set ingress.tls[0].hosts[0]=hotline.yourdomain.com
```

Or use a `values-production.yaml` for reproducible deploys:

```yaml
# values-production.yaml
app:
  replicas: 2
  env:
    HOTLINE_NAME: "Your Hotline"

postgres:
  host: my-rds-instance.region.rds.amazonaws.com
  port: 5432
  database: llamenos
  user: llamenos
  poolSize: 10

secrets:
  postgresPassword: "your-strong-password"

minio:
  enabled: true
  persistence:
    size: 50Gi
    storageClass: "gp3"
  credentials:
    accessKey: "your-access-key"
    secretKey: "your-secret-key-change-me"

strfry:
  enabled: true

signalNotifier:
  enabled: false   # enable to add signal-notifier sidecar

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: hotline.yourdomain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: llamenos-tls
      hosts:
        - hotline.yourdomain.com
```

```bash
helm install llamenos deploy/helm/llamenos/ -f values-production.yaml
```

## 2. Verify the deployment

```bash
kubectl get pods -l app.kubernetes.io/instance=llamenos
kubectl port-forward svc/llamenos 3000:3000
curl http://localhost:3000/health/ready
# -> {"status":"ok"}
```

## 3. Configure DNS

```bash
kubectl get ingress llamenos
```

Point your domain to the ingress controller's external IP or load balancer.

## Health probes

The chart configures liveness, readiness, and startup probes:

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: http
readinessProbe:
  httpGet:
    path: /health/ready
    port: http
startupProbe:
  httpGet:
    path: /health/ready
    port: http
  failureThreshold: 30
  periodSeconds: 5
```

## Prometheus monitoring

If you use Prometheus, the chart includes a `ServiceMonitor` CRD:

```yaml
monitoring:
  enabled: true
  serviceMonitor:
    interval: 30s
```

## Using external secrets

```yaml
secrets:
  existingSecret: llamenos-secrets
```

```bash
kubectl create secret generic llamenos-secrets \
  --from-literal=postgres-password=your_password \
  --from-literal=minio-access-key=your_key \
  --from-literal=minio-secret-key=your_secret \
  --from-literal=hmac-secret=your_hmac_hex \
  --from-literal=server-nostr-secret=your_nostr_hex
```

Or use External Secrets Operator, Sealed Secrets, or Vault.

## Scaling

```bash
kubectl scale deployment llamenos --replicas=3
```

The app uses PostgreSQL advisory locks for consistency across replicas.

## Upgrading

```bash
helm upgrade llamenos deploy/helm/llamenos/ -f values-production.yaml
```

The `RollingUpdate` strategy provides zero-downtime upgrades.

## Logs

```bash
kubectl logs -l app.kubernetes.io/instance=llamenos -c app -f
```

## Troubleshooting

### Pod stuck in CrashLoopBackOff

```bash
kubectl logs llamenos-0 -c app --previous
kubectl describe pod llamenos-0
```

Common causes: missing secrets, PostgreSQL unreachable, MinIO not ready.

### Database connection errors

```bash
kubectl run pg-test --rm -it --image=postgres:17-alpine -- \
  psql postgresql://llamenos:PASSWORD@PG_HOST:5432/llamenos -c "SELECT 1"
```

## Next steps

- [Docker Compose Deployment](/docs/en/deploy/docker) — simpler single-server alternative
- [Self-Hosting Overview](/docs/en/deploy/self-hosting) — compare deployment options
