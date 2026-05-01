---
title: "Bereitstellung: Kubernetes (Helm)"
description: Stellen Sie Llamenos in Kubernetes mit dem offiziellen Helm-Chart bereit.
---

Diese Anleitung behandelt die Bereitstellung von Llamenos in einem Kubernetes-Cluster mit dem offiziellen Helm-Chart. Das Chart verwaltet die Anwendung und optionale MinIO/Whisper-Dienste als separate Deployments. Sie stellen die PostgreSQL-Datenbank bereit.

## Voraussetzungen

- Ein Kubernetes-Cluster (v1.24+) -- verwaltet (EKS, GKE, AKS) oder selbst gehostet
- Eine PostgreSQL-14+-Instanz (verwaltetes RDS/Cloud SQL empfohlen, oder selbst gehostet)
- [Helm](https://helm.sh/) v3.10+
- [kubectl](https://kubernetes.io/docs/tasks/tools/) fuer Ihren Cluster konfiguriert
- Ein Ingress-Controller (NGINX Ingress, Traefik, etc.)
- cert-manager (optional, fuer automatische TLS-Zertifikate)
- [Bun](https://bun.sh/) lokal installiert (zur Generierung des Admin-Schluesselpaars)


## 2. Chart installieren

```bash
helm install llamenos deploy/helm/llamenos/ \
  --set secrets.postgresPassword=YOUR_PG_PASSWORD \
  --set secrets.hmacSecret=YOUR_HMAC_HEX \
  --set secrets.serverNostrSecret=YOUR_NOSTR_HEX \
  --set postgres.host=YOUR_PG_HOST \
  --set minio.credentials.accessKey=your-access-key \
  --set minio.credentials.secretKey=your-secret-key \
  --set ingress.hosts[0].host=hotline.yourdomain.com \
  --set ingress.tls[0].secretName=llamenos-tls \
  --set ingress.tls[0].hosts[0]=hotline.yourdomain.com
```

Oder erstellen Sie eine `values-production.yaml`-Datei fuer reproduzierbare Bereitstellungen:

```yaml
# values-production.yaml
app:
  image:
    repository: ghcr.io/rhonda-rodododo/llamenos-platform
    tag: "1.0.0"
    pullPolicy: IfNotPresent
  replicas: 2
  resources:
    requests:
      cpu: "500m"
      memory: "512Mi"
    limits:
      cpu: "2"
      memory: "1Gi"
  env:
    HOTLINE_NAME: "Your Hotline"
    NODE_ENV: "production"

postgres:
  host: my-rds-instance.region.rds.amazonaws.com
  port: 5432
  database: llamenos
  user: llamenos
  poolSize: 10

secrets:
  postgresPassword: "your-strong-password"
  hmacSecret: "64-hex-chars-hmac-signing-key"
  serverNostrSecret: "64-hex-chars-nostr-identity-key"
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

strfry:
  enabled: true

signalNotifier:
  enabled: false

monitoring:
  enabled: true
  serviceMonitor:
    interval: 30s

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

Dann installieren:

```bash
helm install llamenos deploy/helm/llamenos/ -f values-production.yaml
```

## 3. Bereitstellung ueberpruefen

```bash
# Pruefen, ob Pods laufen
kubectl get pods -l app.kubernetes.io/instance=llamenos

# App-Gesundheit pruefen
kubectl port-forward svc/llamenos 3000:3000
curl http://localhost:3000/health/ready
# → {"status":"ok"}
```

## 4. DNS konfigurieren

Verweisen Sie Ihre Domain auf die externe IP-Adresse oder den Load Balancer des Ingress-Controllers:

```bash
kubectl get ingress llamenos
```

## 5. Erste Anmeldung und Einrichtung

Oeffnen Sie `https://hotline.ihredomain.com` in Ihrem Browser. Melden Sie sich mit dem Admin-nsec an und schliessen Sie den Einrichtungsassistenten ab.

## Chart-Konfigurationsreferenz

### Anwendung

| Parameter | Beschreibung | Standard |
|-----------|-------------|----------|
| `app.image.repository` | Container-Image | `ghcr.io/rhonda-rodododo/llamenos-platform` |
| `app.image.tag` | Image-Tag | Chart appVersion |
| `app.port` | Anwendungsport | `3000` |
| `app.replicas` | Pod-Replikate | `2` |
| `app.resources` | CPU/Speicher Requests und Limits | `{}` |
| `app.env` | Zusaetzliche Umgebungsvariablen | `{}` |

### PostgreSQL

| Parameter | Beschreibung | Standard |
|-----------|-------------|----------|
| `postgres.host` | PostgreSQL-Hostname (erforderlich) | `""` |
| `postgres.port` | PostgreSQL-Port | `5432` |
| `postgres.database` | Datenbankname | `llamenos` |
| `postgres.user` | Datenbankbenutzer | `llamenos` |
| `postgres.poolSize` | Verbindungspool-Groesse | `10` |

### Secrets

| Parameter | Beschreibung | Standard |
|-----------|-------------|----------|
| `secrets.hmacSecret` | HMAC signing key — 64 hex chars (required) | `""` |
| `secrets.serverNostrSecret` | Server Nostr identity key — 64 hex chars (required) | `""` |
| `secrets.postgresPassword` | PostgreSQL-Passwort (erforderlich) | `""` |
| `secrets.twilioAccountSid` | Twilio Account SID | `""` |
| `secrets.twilioAuthToken` | Twilio Auth Token | `""` |
| `secrets.twilioPhoneNumber` | Twilio-Telefonnummer (E.164) | `""` |
| `secrets.existingSecret` | Vorhandenes K8s-Secret verwenden | `""` |

> **Tipp**: Verwenden Sie fuer den Produktivbetrieb `secrets.existingSecret`, um ein Secret zu referenzieren, das vom External Secrets Operator, Sealed Secrets oder Vault verwaltet wird.

### MinIO

| Parameter | Beschreibung | Standard |
|-----------|-------------|----------|
| `minio.enabled` | MinIO bereitstellen | `true` |
| `minio.image.repository` | MinIO-Image | `minio/minio` |
| `minio.image.tag` | MinIO-Tag | `RELEASE.2025-01-20T14-49-07Z` |
| `minio.persistence.size` | MinIO-Datenvolumen | `50Gi` |
| `minio.persistence.storageClass` | Speicherklasse | `""` |
| `minio.credentials.accessKey` | MinIO-Root-Benutzer | `""` (erforderlich) |
| `minio.credentials.secretKey` | MinIO-Root-Passwort | `""` (erforderlich) |
| `minio.resources` | CPU/Speicher Requests und Limits | `{}` |

### Whisper-Transkription

| Parameter | Beschreibung | Standard |
|-----------|-------------|----------|
| `whisper.enabled` | Whisper bereitstellen | `false` |
| `whisper.image.repository` | Whisper-Image | `fedirz/faster-whisper-server` |
| `whisper.image.tag` | Whisper-Tag | `0.4.1` |
| `whisper.model` | Whisper-Modellname | `Systran/faster-whisper-base` |
| `whisper.device` | Geraet: `cpu` oder `cuda` | `cpu` |
| `whisper.resources` | CPU/Speicher Requests und Limits | `{}` |

### Ingress

| Parameter | Beschreibung | Standard |
|-----------|-------------|----------|
| `ingress.enabled` | Ingress-Ressource erstellen | `true` |
| `ingress.className` | Ingress-Klasse | `nginx` |
| `ingress.annotations` | Ingress-Annotationen | `{}` |
| `ingress.hosts` | Host-Regeln | Siehe values.yaml |
| `ingress.tls` | TLS-Konfiguration | `[]` |

### Service Account

| Parameter | Beschreibung | Standard |
|-----------|-------------|----------|
| `serviceAccount.create` | ServiceAccount erstellen | `true` |
| `serviceAccount.annotations` | SA-Annotationen (z.B. IRSA) | `{}` |
| `serviceAccount.name` | SA-Name ueberschreiben | `""` |

## Externe Secrets verwenden

Vermeiden Sie im Produktivbetrieb, Secrets direkt in Helm-Werten zu platzieren. Erstellen Sie stattdessen das Secret separat und referenzieren Sie es:

```yaml
# values-production.yaml
secrets:
  existingSecret: llamenos-secrets
```

Erstellen Sie das Secret mit Ihrem bevorzugten Werkzeug:

```bash
# Manuell
kubectl create secret generic llamenos-secrets \
  --from-literal=admin-pubkey=ihr_schluessel \
  --from-literal=postgres-password=ihr_passwort \
  --from-literal=minio-access-key=ihr_schluessel \
  --from-literal=minio-secret-key=ihr_schluessel

# Oder mit External Secrets Operator, Sealed Secrets, Vault, etc.
```

## Externes MinIO oder S3 verwenden

Wenn Sie bereits MinIO oder einen S3-kompatiblen Dienst haben, deaktivieren Sie das integrierte MinIO und uebergeben Sie den Endpunkt:

```yaml
minio:
  enabled: false

app:
  env:
    MINIO_ENDPOINT: "https://ihr-minio.beispiel.com"
    MINIO_ACCESS_KEY: "ihr-schluessel"
    MINIO_SECRET_KEY: "ihr-geheimnis"
    MINIO_BUCKET: "llamenos"
```

## GPU-Transkription

Fuer GPU-beschleunigte Whisper-Transkription auf NVIDIA-GPUs:

```yaml
whisper:
  enabled: true
  device: "cuda"
  model: "Systran/faster-whisper-large-v3"
  resources:
    limits:
      nvidia.com/gpu: 1
```

Stellen Sie sicher, dass das [NVIDIA Device Plugin](https://github.com/NVIDIA/k8s-device-plugin) in Ihrem Cluster installiert ist.

## Skalierung

Das Deployment verwendet die `RollingUpdate`-Strategie fuer Aktualisierungen ohne Ausfallzeit. Skalieren Sie die Replikate basierend auf Ihrem Traffic:

```bash
kubectl scale deployment llamenos --replicas=3
```

Oder setzen Sie `app.replicas` in Ihrer Wertedatei. PostgreSQL Advisory Locks stellen die Datenkonsistenz ueber Replikate hinweg sicher.


## Ueberwachung

### Gesundheitspruefungen

Das Chart konfiguriert Liveness-, Readiness- und Startup-Probes gegen `/api/health`:

```yaml
# In das Deployment-Template integriert
livenessProbe:
  httpGet:
    path: /health/live
    port: http
  initialDelaySeconds: 15
  periodSeconds: 15
readinessProbe:
  httpGet:
    path: /health/live
    port: http
  initialDelaySeconds: 10
  periodSeconds: 10
startupProbe:
  httpGet:
    path: /health/live
    port: http
  failureThreshold: 30
  periodSeconds: 5
```

### Logs

```bash
kubectl logs -l app.kubernetes.io/instance=llamenos -c app -f
```

## Aktualisierung

```bash
helm upgrade llamenos deploy/helm/llamenos/ -f values-production.yaml
```

Die `RollingUpdate`-Strategie bietet Aktualisierungen ohne Ausfallzeit.

## Deinstallation

```bash
helm uninstall llamenos
```

> **Hinweis**: PersistentVolumeClaims werden durch `helm uninstall` nicht geloescht. Loeschen Sie sie manuell, wenn Sie alle Daten entfernen moechten:
> ```bash
> kubectl delete pvc -l app.kubernetes.io/instance=llamenos
> ```

## Fehlerbehebung

### Pod haengt in CrashLoopBackOff

```bash
kubectl logs llamenos-0 -c app --previous
kubectl describe pod llamenos-0
```

Haeufige Ursachen: fehlende Secrets, falscher ADMIN_PUBKEY, PostgreSQL nicht erreichbar, MinIO nicht bereit.

### Datenbankverbindungsfehler

Ueberpruefen Sie, ob PostgreSQL vom Cluster aus erreichbar ist:

```bash
kubectl run pg-test --rm -it --image=postgres:17-alpine -- psql postgresql://llamenos:PASSWORT@PG_HOST:5432/llamenos -c "SELECT 1"
```

### Ingress funktioniert nicht

Ueberpruefen Sie, ob der Ingress-Controller laeuft und die Ingress-Ressource eine Adresse hat:

```bash
kubectl get ingress llamenos
kubectl describe ingress llamenos
```


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
    - secretKey: minio-access-key
      remoteRef:
        key: llamenos/minio-access-key
    - secretKey: minio-secret-key
      remoteRef:
        key: llamenos/minio-secret-key
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


## Naechste Schritte

- [Administratorhandbuch](/docs/admin-guide) -- die Hotline konfigurieren
- [Uebersicht Selbst-Hosting](/docs/deploy/self-hosting) -- Bereitstellungsoptionen vergleichen
- [Docker Compose-Bereitstellung](/docs/deploy/docker) -- einfachere Alternative
