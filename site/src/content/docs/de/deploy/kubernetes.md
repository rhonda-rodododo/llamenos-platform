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

## 1. Admin-Schluesselpaar generieren

```bash
git clone https://github.com/your-org/llamenos.git
cd llamenos
bun install
bun run bootstrap-admin
```

Bewahren Sie den **nsec** sicher auf. Kopieren Sie den **hexadezimalen oeffentlichen Schluessel** fuer die Helm-Werte.

## 2. Chart installieren

```bash
helm install llamenos deploy/helm/llamenos/ \
  --set secrets.adminPubkey=IHR_HEX_OEFFENTLICHER_SCHLUESSEL \
  --set secrets.postgresPassword=IHR_PG_PASSWORT \
  --set postgres.host=IHR_PG_HOST \
  --set minio.credentials.accessKey=ihr-zugangsschluessel \
  --set minio.credentials.secretKey=ihr-geheimschluessel \
  --set ingress.hosts[0].host=hotline.ihredomain.com \
  --set ingress.tls[0].secretName=llamenos-tls \
  --set ingress.tls[0].hosts[0]=hotline.ihredomain.com
```

Oder erstellen Sie eine `values-production.yaml`-Datei fuer reproduzierbare Bereitstellungen:

```yaml
# values-production.yaml
app:
  image:
    repository: ghcr.io/your-org/llamenos
    tag: "0.14.0"
  replicas: 2
  env:
    HOTLINE_NAME: "Ihre Hotline"

postgres:
  host: meine-rds-instanz.region.rds.amazonaws.com
  port: 5432
  database: llamenos
  user: llamenos
  poolSize: 10

secrets:
  adminPubkey: "ihr_hex_oeffentlicher_schluessel"
  postgresPassword: "ihr-starkes-passwort"
  # twilioAccountSid: ""
  # twilioAuthToken: ""
  # twilioPhoneNumber: ""

minio:
  enabled: true
  persistence:
    size: 50Gi
    storageClass: "gp3"
  credentials:
    accessKey: "ihr-zugangsschluessel"
    secretKey: "ihr-geheimschluessel-aendern"

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
    - host: hotline.ihredomain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: llamenos-tls
      hosts:
        - hotline.ihredomain.com
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
curl http://localhost:3000/api/health
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
| `app.image.repository` | Container-Image | `ghcr.io/your-org/llamenos` |
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
| `secrets.adminPubkey` | Admin-Nostr-Hex-oeffentlicher-Schluessel | `""` |
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

Fuer automatische globale Skalierung ohne Infrastrukturverwaltung sollten Sie die [Cloudflare Workers-Bereitstellung](/docs/deploy) in Betracht ziehen.

## Ueberwachung

### Gesundheitspruefungen

Das Chart konfiguriert Liveness-, Readiness- und Startup-Probes gegen `/api/health`:

```yaml
# In das Deployment-Template integriert
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

## Naechste Schritte

- [Administratorhandbuch](/docs/admin-guide) -- die Hotline konfigurieren
- [Uebersicht Selbst-Hosting](/docs/deploy/self-hosting) -- Bereitstellungsoptionen vergleichen
- [Docker Compose-Bereitstellung](/docs/deploy/docker) -- einfachere Alternative
