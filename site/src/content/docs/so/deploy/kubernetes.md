---
title: "Soo saar: Kubernetes (Helm)"
description: Soo saar Llamenos Kubernetes iyada oo la isticmaalayo Helm chart-ka rasmiga ah.
---

Halkan waxaa ku qoran habka lagu soo saaro Llamenos cluster Kubernetes iyada oo la isticmaalayo Helm chart-ka rasmiga ah. Chart-ku waxay maareysaa codsiga, kaydinta RustFS, relay-ga WebSocket, iyo adeegyada ikhtiyaarka ah ee signal-notifier/sip-bridge sidii deployments kala duwan. Waxaad bixisaa xogta PostgreSQL.

## Shuruudaha hore

- Cluster Kubernetes (v1.24+) — la maareeyo (EKS, GKE, AKS) ama gacanta lagu hayo
- PostgreSQL 14+ instance (waxaa lagu talinayaa RDS/Cloud SQL la maareeyo, ama gacanta lagu hayo)
- [Helm](https://helm.sh/) v3.10+
- [kubectl](https://kubernetes.io/docs/tasks/tools/) oo loo habeeyay cluster-kaaga
- Controller ingress (NGINX Ingress, Traefik, iwm.)
- cert-manager (ikhtiyaar ah, shahaadado TLS otomaatig ah)

## 1. Ku rakib chart-ka

```bash
helm install llamenos deploy/helm/llamenos/ \
  --set secrets.postgresPassword=YOUR_PG_PASSWORD \
  --set secrets.hmacSecret=YOUR_HMAC_HEX \
  --set secrets.serverWebSocketSecret=YOUR_NOSTR_HEX \
  --set postgres.host=YOUR_PG_HOST \
  --set RustFS.credentials.accessKey=your-access-key \
  --set RustFS.credentials.secretKey=your-secret-key \
  --set ingress.hosts[0].host=hotline.yourdomain.com \
  --set ingress.tls[0].secretName=llamenos-tls \
  --set ingress.tls[0].hosts[0]=hotline.yourdomain.com
```

Ama abuur fayl `values-production.yaml` si aad u soo saarto la soo celceli karo:

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
  serverWebSocketSecret: "64-hex-chars-WebSocket-identity-key"
  # Telephony (oo ugu yaraan mid ayaa loo baahan yahay codka):
  # twilioAccountSid: ""
  # twilioAuthToken: ""
  # twilioPhoneNumber: ""

RustFS:
  enabled: true
  persistence:
    size: 50Gi
    storageClass: "gp3"
  credentials:
    accessKey: "your-access-key"
    secretKey: "your-secret-key-change-me"
  resources:
    requests:
      cpu: "100m"
      memory: "256Mi"
    limits:
      cpu: "500m"
      memory: "512Mi"

WebSocket relay:
  enabled: true
  resources:
    requests:
      cpu: "50m"
      memory: "64Mi"
    limits:
      cpu: "200m"
      memory: "128Mi"

signalNotifier:
  enabled: false   # beddel true si aad u furto signal-notifier sidecar

sipBridge:
  enabled: false   # beddel true si aad u furto SIP bridge (Asterisk/FreeSWITCH/Kamailio)
  # pbxType: asterisk

monitoring:
  enabled: true
  serviceMonitor:
    interval: 30s
    scrapeTimeout: 10s

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
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

Kadib ku rakib:

```bash
helm install llamenos deploy/helm/llamenos/ -f values-production.yaml
```

## 2. Xaqiiji soo saarista

```bash
# Hubi in pods-ka ay shaqeynayaan
kubectl get pods -l app.kubernetes.io/instance=llamenos

# Hubi caafimaadka app-ka
kubectl port-forward svc/llamenos 3000:3000
curl http://localhost:3000/health/ready
# -> {"status":"ok"}
```

## 3. Tafatir DNS

U jeedi domain-kaaga IP-ga dibadda ee controller-ka ingress ama load balancer-ka:

```bash
kubectl get ingress llamenos
```

## 4. Tafatirka ugu horreeya

Fur `https://hotline.yourdomain.com` browser-kaaga oo raac setup wizard:

1. **Abuur akoonkaaga admin** — deji magac muujin iyo PIN-kaaga
2. **Magac bixi hotline-kaaga** — deji magaca muujinta ee lagu arko app-ka
3. **Dooro kanaalada** — fur Voice, SMS, WhatsApp, Signal, iyo/ama Reports
4. **Tafatir bixiyeyaasha** — geli aqoonsiga kanaal kasta oo la furay
5. **Dib u eeg oo dhammeystir**

## Isdhexgalka cert-manager

Haddii aad leedahay [cert-manager](https://cert-manager.io/) oo ku rakiban, tafatir cluster issuer si aad u hesho TLS otomaatig ah:

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

Celi, kadib tixraac annotations-ka ingress-kaaga (horeyba ku jira `values-production.yaml` ee kor ku qoran):

```yaml
ingress:
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
```

cert-manager waxay si otomaatig ah u bixisaa oo dib u cusbooneysiisaa shahaadado TLS via Let's Encrypt.

## External Secrets Operator

Production-ka, ka fogaadi inaad sirta ku darto Helm values si toos ah. Isticmaal [External Secrets Operator](https://external-secrets.io/) si aad u isku xirto sirta kaydkaaga (AWS SSM, Vault, GCP Secret Manager, iwm.).

### 1. Abuur ExternalSecret

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
    name: my-secret-store   # ClusterSecretStore-kaaga ama SecretStore
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
    - secretKey: server-WebSocket-secret
      remoteRef:
        key: llamenos/server-WebSocket-secret
    - secretKey: RustFS-access-key
      remoteRef:
        key: llamenos/RustFS-access-key
    - secretKey: RustFS-secret-key
      remoteRef:
        key: llamenos/RustFS-secret-key
```

### 2. Tixraac Helm values

```yaml
secrets:
  existingSecret: llamenos-secrets
```

Xulasho kale, abuur sir gacan ku ah oo tixraac isla sidaas:

```bash
kubectl create secret generic llamenos-secrets \
  --from-literal=postgres-password=your_password \
  --from-literal=hmac-secret=your_hmac_hex \
  --from-literal=server-WebSocket-secret=your_WebSocket_hex \
  --from-literal=RustFS-access-key=your_key \
  --from-literal=RustFS-secret-key=your_secret
```

## Kormeerka Prometheus

### ServiceMonitor

Haddii aad ku shaqeysato [Prometheus Operator](https://prometheus-operator.dev/), fur `ServiceMonitor` values-kaaga:

```yaml
monitoring:
  enabled: true
  serviceMonitor:
    namespace: monitoring    # namespace-ga meesha Prometheus uu ku rakiban yahay
    interval: 30s
    scrapeTimeout: 10s
    labels:
      release: kube-prometheus-stack
```

Chart-ku waxay soo bandhigaysaa `/metrics` adeegga app-ka oo ay u habeysaa `ServiceMonitor` si uu u waafaqsano doorsoome-kaaga Prometheus.

### Health probes

Chart-ku waxay u habeysaa liveness, readiness, iyo startup probes iyaga oo loo jeediyo `/health/live` iyo `/health/ready`:

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: http
  initialDelaySeconds: 15
  periodSeconds: 15
readinessProbe:
  httpGet:
    path: /health/ready
    port: http
  initialDelaySeconds: 10
  periodSeconds: 10
startupProbe:
  httpGet:
    path: /health/ready
    port: http
  failureThreshold: 30
  periodSeconds: 5
```

### Log-yada

```bash
kubectl logs -l app.kubernetes.io/instance=llamenos -c app -f
```

## Tixraaca configuration-ka chart-ka

### Codsiga

| Parameter | Sharaxaad | Default |
|-----------|-------------|---------|
| `app.image.repository` | Image-ga container-ka | `ghcr.io/rhonda-rodododo/llamenos-platform` |
| `app.image.tag` | Tag-ga image-ga | Chart appVersion |
| `app.image.pullPolicy` | Siyaasadda pull-ka | `IfNotPresent` |
| `app.port` | Alaabada codsiga | `3000` |
| `app.replicas` | Replicas-ka pod-ka | `2` |
| `app.resources` | Codsiyada CPU/memory iyo xadka | `{}` |
| `app.env` | Doorsoomeyo deegaan dheeraad ah | `{}` |

### PostgreSQL

| Parameter | Sharaxaad | Default |
|-----------|-------------|---------|
| `postgres.host` | Magaca host-ka PostgreSQL (loo baahan yahay) | `""` |
| `postgres.port` | Alaabada PostgreSQL | `5432` |
| `postgres.database` | Magaca xogta | `llamenos` |
| `postgres.user` | Isticmaalaha xogta | `llamenos` |
| `postgres.poolSize` | Cabbirka pool-ka isku xirka | `10` |

### Sirta

| Parameter | Sharaxaad | Default |
|-----------|-------------|---------|
| `secrets.postgresPassword` | Furaha PostgreSQL (loo baahan yahay) | `""` |
| `secrets.hmacSecret` | Fure saxiixa HMAC — 64 xaraf hex (loo baahan yahay) | `""` |
| `secrets.serverWebSocketSecret` | Fure aqoonta WebSocket ee server-ka — 64 xaraf hex (loo baahan yahay) | `""` |
| `secrets.twilioAccountSid` | Twilio Account SID | `""` |
| `secrets.twilioAuthToken` | Twilio Auth Token | `""` |
| `secrets.twilioPhoneNumber` | Lambarka Twilio (E.164) | `""` |
| `secrets.existingSecret` | Isticmaal Kubernetes Secret oo horey u jiray | `""` |

> **Talo**: Production-ka, isticmaal `secrets.existingSecret` iyada oo la wadaago External Secrets Operator, Sealed Secrets, ama Vault.

### RustFS

| Parameter | Sharaxaad | Default |
|-----------|-------------|---------|
| `RustFS.enabled` | Soo saar RustFS | `true` |
| `RustFS.image.repository` | Image-ga RustFS | `RustFS/RustFS` |
| `RustFS.image.tag` | Tag-ga RustFS | `latest` |
| `RustFS.persistence.size` | Cabbirka volume-ka xogta | `50Gi` |
| `RustFS.persistence.storageClass` | Class-ga kaydka | `""` |
| `RustFS.credentials.accessKey` | Isticmaalaha root-ka RustFS (loo baahan yahay) | `""` |
| `RustFS.credentials.secretKey` | Furaha root-ka RustFS (loo baahan yahay) | `""` |
| `RustFS.resources` | Codsiyada CPU/memory iyo xadka | `{}` |

### WebSocket relay (WebSocket relay)

| Parameter | Sharaxaad | Default |
|-----------|-------------|---------|
| `WebSocket relay.enabled` | Soo saar WebSocket relay | `true` |
| `WebSocket relay.image.repository` | Image-ga WebSocket relay | `dockurr/WebSocket relay` |
| `WebSocket relay.image.tag` | Tag-ga WebSocket relay | `latest` |
| `WebSocket relay.resources` | Codsiyada CPU/memory iyo xadka | `{}` |

> WebSocket relay waa adeeg aasaasi ah — dhacdooyinka waqti-dhabta ah (calls, fariimaha, xaaladda hub) ayaa u baahan. Sii `WebSocket relay.enabled: true`.

### signal-notifier

| Parameter | Sharaxaad | Default |
|-----------|-------------|---------|
| `signalNotifier.enabled` | Soo saar signal-notifier sidecar | `false` |
| `signalNotifier.image.repository` | Image-ga signal-notifier | `ghcr.io/rhonda-rodododo/llamenos-signal-notifier` |
| `signalNotifier.resources` | Codsiyada CPU/memory iyo xadka | `{}` |

### SIP bridge

| Parameter | Sharaxaad | Default |
|-----------|-------------|---------|
| `sipBridge.enabled` | Soo saar sip-bridge | `false` |
| `sipBridge.pbxType` | Backend: `asterisk`, `freeswitch`, ama `kamailio` | `asterisk` |
| `sipBridge.resources` | Codsiyada CPU/memory iyo xadka | `{}` |

### Kormeerka

| Parameter | Sharaxaad | Default |
|-----------|-------------|---------|
| `monitoring.enabled` | Abuur ServiceMonitor | `false` |
| `monitoring.serviceMonitor.interval` | Xilli-goorka scrape | `30s` |
| `monitoring.serviceMonitor.scrapeTimeout` | Scrape timeout | `10s` |
| `monitoring.serviceMonitor.namespace` | Namespace-ga ServiceMonitor | Isla sida release-ka |
| `monitoring.serviceMonitor.labels` | Labels dheeraad ah oo doorsoome-ka Prometheus | `{}` |

### Ingress

| Parameter | Sharaxaad | Default |
|-----------|-------------|---------|
| `ingress.enabled` | Abuur Ingress resource | `true` |
| `ingress.className` | Class-ka ingress | `nginx` |
| `ingress.annotations` | Ingress annotations | `{}` |
| `ingress.hosts` | Xeerarka host-ka | Eeg values.yaml |
| `ingress.tls` | Configuration-ka TLS | `[]` |

### Service account

| Parameter | Sharaxaad | Default |
|-----------|-------------|---------|
| `serviceAccount.create` | Abuur ServiceAccount | `true` |
| `serviceAccount.annotations` | SA annotations (tusaale, IRSA AWS) | `{}` |
| `serviceAccount.name` | Beddel magaca SA | `""` |

## Isticmaalka kayd S3 dibadda

Haddii aad horey u leedahay RustFS, RustFS, ama adeeg kale oo la midka ah S3, jooji RustFS-ka gudaha:

```yaml
RustFS:
  enabled: false

app:
  env:
    STORAGE_ENDPOINT: "https://your-storage.example.com"
    STORAGE_ACCESS_KEY: "your-key"
    STORAGE_SECRET_KEY: "your-secret"
    STORAGE_BUCKET: "llamenos"
```

## Liiska xaqiijinta production-ka

Kahor inta aanad bilaabin:

- [ ] **Sirta via ESO ama Sealed Secrets** — marnaba ha ku darto sirta faylalada values
- [ ] **Codsiyada resources iyo xadka** oo lagu dejiyay dhammaan deployments-ka
- [ ] **PodDisruptionBudget** oo la habeeyay (`minAvailable: 1`) si loo yareeyo waqti-dhaca drains-ka
- [ ] **NetworkPolicy** oo xaddidaya ingress-ga app pod-ka oo kaliya ka yimid controller-ka ingress
- [ ] **Read-only root filesystem** container-ka app-ka (`securityContext.readOnlyRootFilesystem: true`)
- [ ] **Isticmaale aan root ahayn** container-ka (`securityContext.runAsNonRoot: true`)
- [ ] **PostgreSQL TLS** oo la furay (deji `postgres.sslMode: require` values-ka)
- [ ] **RustFS TLS** ama mTLS u dhexeeya app iyo RustFS
- [ ] **cert-manager ClusterIssuer** oo la habeeyay si loo cusbooneysiiyo Let's Encrypt si otomaatig ah
- [ ] **Prometheus ServiceMonitor** oo la furay oo scraping
- [ ] **Liveness/readiness probes** oo la xaqiijiyay kadib soo saarista
- [ ] **RBAC** — ServiceAccount iyada oo leh permissions ugu yaraan
- [ ] **Siyaasadda pull-ka image-ga** oo lagu dejiyay `IfNotPresent` (ma aha `Always`) si soo saarista loo hubiyo
- [ ] **Ingress rate limiting** annotations oo lagu dejiyay si loo yareeyo dhaqan xun

Tusaale NetworkPolicy:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: llamenos-app
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: llamenos
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - port: 3000
```

## Kordhinta

Deployment-ku waxay isticmaashaa siyaasadda `RollingUpdate` si loo hubiyo inaanu jirin waqti-dhac cusbooneysiinta. Kordhi replicas iyadoo ku saleysan traffic-kaaga:

```bash
kubectl scale deployment llamenos --replicas=3
```

Ama deji `app.replicas` faylkaaga values. PostgreSQL advisory locks waxay hubiyaan isku-xirka xogta ee dhexmara replicas.

## Cusbooneysiinta

```bash
helm upgrade llamenos deploy/helm/llamenos/ -f values-production.yaml
```

Siyaasadda `RollingUpdate` waxay bixisaa cusbooneysiin aan waqti-dhac lahayn.

## Ka saarista

```bash
helm uninstall llamenos
```

> **Xusuusin**: PersistentVolumeClaims ma laga tirtiro `helm uninstall`. Tirtir gacan ku haddii aad rabto inaad ka saarto dhammaan xogta:
> ```bash
> kubectl delete pvc -l app.kubernetes.io/instance=llamenos
> ```

## Xalinta dhibaatooyinka

### Pod ku jira CrashLoopBackOff

```bash
kubectl logs llamenos-0 -c app --previous
kubectl describe pod llamenos-0
```

Sababaha caanka ah: sirta maqan (`hmacSecret`, `serverWebSocketSecret`), PostgreSQL aan la gaari karin, RustFS aan diyaar ahayn.

### Dhibaatooyinka isku xirka xogta

Xaqiiji in PostgreSQL uu ka mid yahay cluster-ka:

```bash
kubectl run pg-test --rm -it --image=postgres:17-alpine -- \
  psql postgresql://llamenos:PASSWORD@PG_HOST:5432/llamenos -c "SELECT 1"
```

### Ingress aan shaqeyn

Xaqiiji in controller-ka ingress uu shaqeynayo iyo in Ingress resource uu leeyahay cinwaan:

```bash
kubectl get ingress llamenos
kubectl describe ingress llamenos
```

### Shahaadada la bixin

Hubi xaaladda shahaadada cert-manager:

```bash
kubectl get certificate llamenos-tls
kubectl describe certificate llamenos-tls
kubectl get certificaterequest
kubectl describe certificaterequest
```

Sababaha caanka ah: DNS ma aha inuu faafiyo, alaabada 80/443 ma fura, ClusterIssuer si khalad ah loo habeeyay.

## Tallaabooyinka xiga

- [Soo saarista Docker Compose](/docs/en/deploy/docker) — xulasho fudud oo hal-server ah
- [Guud ahaan Self-Hosting](/docs/en/deploy/self-hosting) — isbarbardhig xulashooyinka soo saarista
- [Bixiyeyaasha Telephony](/docs/en/deploy/providers/) — tafatir bixiyeyaasha codka
