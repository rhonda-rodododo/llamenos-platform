---
title: "Deploy: Kubernetes (Helm)"
description: I-deploy ang Llamenos sa Kubernetes gamit ang opisyal na Helm chart.
---

Saklaw ng gabay na ito ang pag-deploy ng Llamenos sa isang Kubernetes cluster gamit ang opisyal na Helm chart. Pinamamahalaan ng chart ang application at mga opsyonal na MinIO/Whisper service bilang mga hiwalay na deployment. Kailangan mong magbigay ng PostgreSQL database.

## Mga kinakailangan

- Isang Kubernetes cluster (v1.24+) — managed (EKS, GKE, AKS) o self-hosted
- Isang PostgreSQL 14+ instance (inirerekomenda ang managed RDS/Cloud SQL, o self-hosted)
- [Helm](https://helm.sh/) v3.10+
- [kubectl](https://kubernetes.io/docs/tasks/tools/) na naka-configure para sa iyong cluster
- Isang ingress controller (NGINX Ingress, Traefik, atbp.)
- cert-manager (opsyonal, para sa automatic TLS certificates)
- [Bun](https://bun.sh/) na naka-install sa lokal (para sa paggawa ng admin keypair)

## 1. Gumawa ng admin keypair

```bash
git clone https://github.com/your-org/llamenos.git
cd llamenos
bun install
bun run bootstrap-admin
```

I-save ang **nsec** nang ligtas. Kopyahin ang **hex public key** para sa Helm values.

## 2. I-install ang chart

```bash
helm install llamenos deploy/helm/llamenos/ \
  --set secrets.adminPubkey=YOUR_HEX_PUBLIC_KEY \
  --set secrets.postgresPassword=YOUR_PG_PASSWORD \
  --set postgres.host=YOUR_PG_HOST \
  --set minio.credentials.accessKey=your-access-key \
  --set minio.credentials.secretKey=your-secret-key \
  --set ingress.hosts[0].host=hotline.yourdomain.com \
  --set ingress.tls[0].secretName=llamenos-tls \
  --set ingress.tls[0].hosts[0]=hotline.yourdomain.com
```

O gumawa ng `values-production.yaml` file para sa mga reproducible deploy:

```yaml
# values-production.yaml
app:
  image:
    repository: ghcr.io/your-org/llamenos
    tag: "0.14.0"
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
  adminPubkey: "your_hex_public_key"
  postgresPassword: "your-strong-password"
  # twilioAccountSid: ""
  # twilioAuthToken: ""
  # twilioPhoneNumber: ""

minio:
  enabled: true
  persistence:
    size: 50Gi
    storageClass: "gp3"
  credentials:
    accessKey: "your-access-key"
    secretKey: "your-secret-key-change-me"

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

Pagkatapos ay i-install:

```bash
helm install llamenos deploy/helm/llamenos/ -f values-production.yaml
```

## 3. I-verify ang deployment

```bash
# Suriin kung tumatakbo ang mga pod
kubectl get pods -l app.kubernetes.io/instance=llamenos

# Suriin ang app health
kubectl port-forward svc/llamenos 3000:3000
curl http://localhost:3000/api/health
# → {"status":"ok"}
```

## 4. I-configure ang DNS

Ituro ang iyong domain sa external IP o load balancer ng ingress controller:

```bash
kubectl get ingress llamenos
```

## 5. Unang pag-login at setup

Buksan ang `https://hotline.yourdomain.com` sa iyong browser. Mag-login gamit ang admin nsec at kumpletuhin ang setup wizard.

## Sanggunian sa configuration ng Chart

### Application

| Parameter | Paglalarawan | Default |
|-----------|-------------|---------|
| `app.image.repository` | Container image | `ghcr.io/your-org/llamenos` |
| `app.image.tag` | Image tag | Chart appVersion |
| `app.port` | Application port | `3000` |
| `app.replicas` | Pod replicas | `2` |
| `app.resources` | CPU/memory requests at limits | `{}` |
| `app.env` | Karagdagang environment variables | `{}` |

### PostgreSQL

| Parameter | Paglalarawan | Default |
|-----------|-------------|---------|
| `postgres.host` | PostgreSQL hostname (kinakailangan) | `""` |
| `postgres.port` | PostgreSQL port | `5432` |
| `postgres.database` | Pangalan ng database | `llamenos` |
| `postgres.user` | Database user | `llamenos` |
| `postgres.poolSize` | Connection pool size | `10` |

### Mga Secret

| Parameter | Paglalarawan | Default |
|-----------|-------------|---------|
| `secrets.adminPubkey` | Admin Nostr hex public key | `""` |
| `secrets.postgresPassword` | PostgreSQL password (kinakailangan) | `""` |
| `secrets.twilioAccountSid` | Twilio Account SID | `""` |
| `secrets.twilioAuthToken` | Twilio Auth Token | `""` |
| `secrets.twilioPhoneNumber` | Twilio phone number (E.164) | `""` |
| `secrets.existingSecret` | Gumamit ng umiiral na K8s Secret | `""` |

> **Tip**: Para sa production, gamitin ang `secrets.existingSecret` para mag-reference ng Secret na pinamamahalaan ng External Secrets Operator, Sealed Secrets, o Vault.

### MinIO

| Parameter | Paglalarawan | Default |
|-----------|-------------|---------|
| `minio.enabled` | I-deploy ang MinIO | `true` |
| `minio.image.repository` | MinIO image | `minio/minio` |
| `minio.image.tag` | MinIO tag | `RELEASE.2025-01-20T14-49-07Z` |
| `minio.persistence.size` | MinIO data volume | `50Gi` |
| `minio.persistence.storageClass` | Storage class | `""` |
| `minio.credentials.accessKey` | MinIO root user | `""` (kinakailangan) |
| `minio.credentials.secretKey` | MinIO root password | `""` (kinakailangan) |
| `minio.resources` | CPU/memory requests at limits | `{}` |

### Whisper transcription

| Parameter | Paglalarawan | Default |
|-----------|-------------|---------|
| `whisper.enabled` | I-deploy ang Whisper | `false` |
| `whisper.image.repository` | Whisper image | `fedirz/faster-whisper-server` |
| `whisper.image.tag` | Whisper tag | `0.4.1` |
| `whisper.model` | Pangalan ng Whisper model | `Systran/faster-whisper-base` |
| `whisper.device` | Device: `cpu` o `cuda` | `cpu` |
| `whisper.resources` | CPU/memory requests at limits | `{}` |

### Ingress

| Parameter | Paglalarawan | Default |
|-----------|-------------|---------|
| `ingress.enabled` | Gumawa ng Ingress resource | `true` |
| `ingress.className` | Ingress class | `nginx` |
| `ingress.annotations` | Ingress annotations | `{}` |
| `ingress.hosts` | Host rules | Tingnan ang values.yaml |
| `ingress.tls` | TLS configuration | `[]` |

### Service account

| Parameter | Paglalarawan | Default |
|-----------|-------------|---------|
| `serviceAccount.create` | Gumawa ng ServiceAccount | `true` |
| `serviceAccount.annotations` | SA annotations (hal. IRSA) | `{}` |
| `serviceAccount.name` | I-override ang pangalan ng SA | `""` |

## Paggamit ng external secrets

Para sa production, iwasan ang paglagay ng mga secret nang direkta sa Helm values. Sa halip, gumawa ng Secret nang hiwalay at i-reference ito:

```yaml
# values-production.yaml
secrets:
  existingSecret: llamenos-secrets
```

Gumawa ng Secret gamit ang napiling tool:

```bash
# Manual
kubectl create secret generic llamenos-secrets \
  --from-literal=admin-pubkey=your_key \
  --from-literal=postgres-password=your_password \
  --from-literal=minio-access-key=your_key \
  --from-literal=minio-secret-key=your_key

# O gamit ang External Secrets Operator, Sealed Secrets, Vault, atbp.
```

## Paggamit ng external MinIO o S3

Kung mayroon ka nang MinIO o S3-compatible service, i-disable ang built-in MinIO at ipasa ang endpoint:

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

Para sa GPU-accelerated Whisper transcription sa NVIDIA GPUs:

```yaml
whisper:
  enabled: true
  device: "cuda"
  model: "Systran/faster-whisper-large-v3"
  resources:
    limits:
      nvidia.com/gpu: 1
```

Siguraduhing naka-install ang [NVIDIA device plugin](https://github.com/NVIDIA/k8s-device-plugin) sa iyong cluster.

## Pag-scale

Gumagamit ang deployment ng `RollingUpdate` strategy para sa zero-downtime upgrades. I-scale ang mga replica batay sa iyong traffic:

```bash
kubectl scale deployment llamenos --replicas=3
```

O itakda ang `app.replicas` sa iyong values file. Tinitiyak ng PostgreSQL advisory locks ang data consistency sa mga replica.

Para sa automatic global scaling nang hindi kinakailangang pamahalaan ang infrastructure, isaalang-alang ang [Cloudflare Workers deployment](/docs/deploy).

## Monitoring

### Health checks

Nag-co-configure ang chart ng liveness, readiness, at startup probes laban sa `/api/health`:

```yaml
# Built into the deployment template
livenessProbe:
  httpGet:
    path: /api/health
    port: http
  initialDelaySeconds: 15
  periodSeconds: 15
readinessProbe:
  httpGet:
    path: /api/health
    port: http
  initialDelaySeconds: 10
  periodSeconds: 10
startupProbe:
  httpGet:
    path: /api/health
    port: http
  failureThreshold: 30
  periodSeconds: 5
```

### Mga log

```bash
kubectl logs -l app.kubernetes.io/instance=llamenos -c app -f
```

## Pag-upgrade

```bash
helm upgrade llamenos deploy/helm/llamenos/ -f values-production.yaml
```

Nagbibigay ang `RollingUpdate` strategy ng zero-downtime upgrades.

## Pag-uninstall

```bash
helm uninstall llamenos
```

> **Paalala**: Hindi dine-delete ng `helm uninstall` ang mga PersistentVolumeClaim. I-delete ang mga ito nang mano-mano kung gusto mong alisin ang lahat ng data:
> ```bash
> kubectl delete pvc -l app.kubernetes.io/instance=llamenos
> ```

## Troubleshooting

### Pod na naka-stuck sa CrashLoopBackOff

```bash
kubectl logs llamenos-0 -c app --previous
kubectl describe pod llamenos-0
```

Mga karaniwang sanhi: kulang na mga secret, maling ADMIN_PUBKEY, hindi maabot ang PostgreSQL, hindi pa handa ang MinIO.

### Mga error sa database connection

I-verify na maabot ang PostgreSQL mula sa cluster:

```bash
kubectl run pg-test --rm -it --image=postgres:17-alpine -- psql postgresql://llamenos:PASSWORD@PG_HOST:5432/llamenos -c "SELECT 1"
```

### Hindi gumagana ang Ingress

I-verify na tumatakbo ang ingress controller at may address ang Ingress resource:

```bash
kubectl get ingress llamenos
kubectl describe ingress llamenos
```

## Mga susunod na hakbang

- [Gabay para sa Admin](/docs/admin-guide) — i-configure ang hotline
- [Pangkalahatang-tanaw ng Self-Hosting](/docs/deploy/self-hosting) — ihambing ang mga opsyon sa deployment
- [Docker Compose Deployment](/docs/deploy/docker) — mas simpleng alternatibo
