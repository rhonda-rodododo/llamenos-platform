---
title: "Deploy: Kubernetes (Helm)"
description: Deploy Llamenos to Kubernetes using the official Helm chart.
---

This guide covers deploying Llamenos to a Kubernetes cluster using the official Helm chart. The chart manages the application, MinIO object storage, and optional Whisper transcription as separate deployments.

## Prerequisites

- A Kubernetes cluster (v1.24+) — managed (EKS, GKE, AKS) or self-hosted
- [Helm](https://helm.sh/) v3.10+
- [kubectl](https://kubernetes.io/docs/tasks/tools/) configured for your cluster
- An ingress controller (NGINX Ingress, Traefik, etc.)
- cert-manager (optional, for automatic TLS certificates)
- [Bun](https://bun.sh/) installed locally (for generating the admin keypair)

## 1. Generate the admin keypair

```bash
git clone https://github.com/your-org/llamenos.git
cd llamenos
bun install
bun run bootstrap-admin
```

Save the **nsec** securely. Copy the **hex public key** for the Helm values.

## 2. Install the chart

```bash
helm install llamenos deploy/helm/llamenos/ \
  --set secrets.adminPubkey=YOUR_HEX_PUBLIC_KEY \
  --set secrets.minioAccessKey=your-access-key \
  --set secrets.minioSecretKey=your-secret-key \
  --set ingress.hosts[0].host=hotline.yourdomain.com \
  --set ingress.tls[0].secretName=llamenos-tls \
  --set ingress.tls[0].hosts[0]=hotline.yourdomain.com
```

Or create a `values-production.yaml` file for reproducible deploys:

```yaml
# values-production.yaml
app:
  image:
    repository: ghcr.io/your-org/llamenos
    tag: "0.10.0"
  port: 3000
  persistence:
    size: 20Gi
    storageClass: "gp3"   # AWS EBS, adjust for your provider
  env:
    HOTLINE_NAME: "Your Hotline"
    PLATFORM: "node"

secrets:
  adminPubkey: "your_hex_public_key"
  minioAccessKey: "your-access-key"
  minioSecretKey: "your-secret-key-change-me"
  # twilioAccountSid: ""
  # twilioAuthToken: ""
  # twilioPhoneNumber: ""

minio:
  enabled: true
  persistence:
    size: 50Gi
    storageClass: "gp3"

whisper:
  enabled: true
  model: "Systran/faster-whisper-base"
  device: "cpu"
  resources:
    requests:
      memory: "2Gi"
      cpu: "1"
    limits:
      memory: "4Gi"
      cpu: "2"

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

Then install:

```bash
helm install llamenos deploy/helm/llamenos/ -f values-production.yaml
```

## 3. Verify the deployment

```bash
# Check pods are running
kubectl get pods -l app.kubernetes.io/instance=llamenos

# Check the app health
kubectl port-forward svc/llamenos 3000:3000
curl http://localhost:3000/api/health
# → {"status":"ok","platform":"node","timestamp":"...","uptime":...}
```

## 4. Configure DNS

Point your domain to the ingress controller's external IP or load balancer:

```bash
kubectl get ingress llamenos
```

## 5. First login and setup

Open `https://hotline.yourdomain.com` in your browser. Log in with the admin nsec and complete the setup wizard.

## Chart configuration reference

### Application

| Parameter | Description | Default |
|-----------|-------------|---------|
| `app.image.repository` | Container image | `ghcr.io/your-org/llamenos` |
| `app.image.tag` | Image tag | `latest` |
| `app.port` | Application port | `3000` |
| `app.replicas` | Pod replicas (must be 1 — SQLite) | `1` |
| `app.persistence.size` | SQLite data volume size | `10Gi` |
| `app.persistence.storageClass` | Storage class | `""` (default) |
| `app.resources` | CPU/memory requests and limits | `{}` |
| `app.env` | Extra environment variables | `{}` |

### Secrets

| Parameter | Description | Default |
|-----------|-------------|---------|
| `secrets.adminPubkey` | Admin Nostr hex public key | `""` |
| `secrets.minioAccessKey` | MinIO access key | `""` (required) |
| `secrets.minioSecretKey` | MinIO secret key | `""` (required) |
| `secrets.twilioAccountSid` | Twilio Account SID | `""` |
| `secrets.twilioAuthToken` | Twilio Auth Token | `""` |
| `secrets.twilioPhoneNumber` | Twilio phone number (E.164) | `""` |
| `secrets.existingSecret` | Use an existing K8s Secret | `""` |

> **Tip**: For production, use `secrets.existingSecret` to reference a Secret managed by External Secrets Operator, Sealed Secrets, or Vault.

### MinIO

| Parameter | Description | Default |
|-----------|-------------|---------|
| `minio.enabled` | Deploy MinIO | `true` |
| `minio.image.repository` | MinIO image | `minio/minio` |
| `minio.image.tag` | MinIO tag | `RELEASE.2025-01-20T14-49-07Z` |
| `minio.persistence.size` | MinIO data volume | `50Gi` |
| `minio.persistence.storageClass` | Storage class | `""` |
| `minio.credentials.accessKey` | MinIO root user | `""` (required) |
| `minio.credentials.secretKey` | MinIO root password | `""` (required) |
| `minio.resources` | CPU/memory requests and limits | `{}` |

### Whisper transcription

| Parameter | Description | Default |
|-----------|-------------|---------|
| `whisper.enabled` | Deploy Whisper | `false` |
| `whisper.image.repository` | Whisper image | `fedirz/faster-whisper-server` |
| `whisper.image.tag` | Whisper tag | `latest` |
| `whisper.model` | Whisper model name | `Systran/faster-whisper-base` |
| `whisper.device` | Device: `cpu` or `cuda` | `cpu` |
| `whisper.resources` | CPU/memory requests and limits | `{}` |

### Ingress

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ingress.enabled` | Create Ingress resource | `true` |
| `ingress.className` | Ingress class | `nginx` |
| `ingress.annotations` | Ingress annotations | `{}` |
| `ingress.hosts` | Host rules | See values.yaml |
| `ingress.tls` | TLS configuration | `[]` |

### Service account

| Parameter | Description | Default |
|-----------|-------------|---------|
| `serviceAccount.create` | Create a ServiceAccount | `true` |
| `serviceAccount.annotations` | SA annotations (e.g., IRSA) | `{}` |
| `serviceAccount.name` | Override SA name | `""` |

## Using external secrets

For production, avoid putting secrets directly in Helm values. Instead, create the Secret separately and reference it:

```yaml
# values-production.yaml
secrets:
  existingSecret: llamenos-secrets
```

Create the Secret with your preferred tool:

```bash
# Manual
kubectl create secret generic llamenos-secrets \
  --from-literal=ADMIN_PUBKEY=your_key \
  --from-literal=MINIO_ACCESS_KEY=your_key \
  --from-literal=MINIO_SECRET_KEY=your_key

# Or with External Secrets Operator, Sealed Secrets, Vault, etc.
```

## Using an external MinIO or S3

If you already have MinIO or an S3-compatible service, disable the built-in MinIO and pass the endpoint:

```yaml
minio:
  enabled: false

app:
  env:
    MINIO_ENDPOINT: "https://your-minio.example.com"
    MINIO_ACCESS_KEY: "your-key"
    MINIO_SECRET_KEY: "your-secret"
    MINIO_BUCKET: "llamenos"
```

## GPU transcription

For GPU-accelerated Whisper transcription on NVIDIA GPUs:

```yaml
whisper:
  enabled: true
  device: "cuda"
  model: "Systran/faster-whisper-large-v3"
  resources:
    limits:
      nvidia.com/gpu: 1
```

Ensure the [NVIDIA device plugin](https://github.com/NVIDIA/k8s-device-plugin) is installed in your cluster.

## Scaling considerations

Llamenos uses SQLite for data storage, which requires a **single writer**. The Helm chart enforces `replicas: 1` with a `Recreate` deployment strategy. This is appropriate for crisis hotline workloads.

If you need horizontal scaling:
- Use the [Cloudflare Workers deployment](/docs/getting-started) instead
- Or put a read-replica in front of SQLite (advanced, not officially supported)

## Monitoring

### Health checks

The chart configures liveness, readiness, and startup probes against `/api/health`:

```yaml
# Built into the deployment template
livenessProbe:
  httpGet:
    path: /api/health
    port: http
  initialDelaySeconds: 10
  periodSeconds: 15
readinessProbe:
  httpGet:
    path: /api/health
    port: http
  initialDelaySeconds: 5
  periodSeconds: 10
startupProbe:
  httpGet:
    path: /api/health
    port: http
  failureThreshold: 30
  periodSeconds: 5
```

### Logs

```bash
kubectl logs -l app.kubernetes.io/instance=llamenos -c app -f
```

## Upgrading

```bash
helm upgrade llamenos deploy/helm/llamenos/ -f values-production.yaml
```

The `Recreate` strategy ensures the old pod terminates before the new one starts (SQLite single-writer requirement).

## Uninstalling

```bash
helm uninstall llamenos
```

> **Note**: PersistentVolumeClaims are not deleted by `helm uninstall`. Delete them manually if you want to remove all data:
> ```bash
> kubectl delete pvc -l app.kubernetes.io/instance=llamenos
> ```

## Troubleshooting

### Pod stuck in CrashLoopBackOff

```bash
kubectl logs llamenos-0 -c app --previous
kubectl describe pod llamenos-0
```

Common causes: missing secrets, incorrect ADMIN_PUBKEY, MinIO not ready.

### PVC not binding

Check that your storage class exists and has available capacity:

```bash
kubectl get sc
kubectl get pvc -l app.kubernetes.io/instance=llamenos
```

### Ingress not working

Verify the ingress controller is running and the Ingress resource has an address:

```bash
kubectl get ingress llamenos
kubectl describe ingress llamenos
```

## Next steps

- [Admin Guide](/docs/admin-guide) — configure the hotline
- [Self-Hosting Overview](/docs/self-hosting) — compare deployment options
- [Docker Compose Deployment](/docs/deploy-docker) — simpler alternative
