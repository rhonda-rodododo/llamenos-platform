---
title: "النشر: Kubernetes (Helm)"
description: نشر Llamenos على Kubernetes باستخدام مخطط Helm الرسمي.
---

يغطي هذا الدليل نشر Llamenos على مجموعة Kubernetes باستخدام مخطط Helm الرسمي. يدير المخطط التطبيق وخدمات MinIO/Whisper الاختيارية كعمليات نشر منفصلة. أنت توفر قاعدة بيانات PostgreSQL.

## المتطلبات الأساسية

- مجموعة Kubernetes (الإصدار 1.24+) — مُدارة (EKS، GKE، AKS) أو مستضافة ذاتياً
- مثيل PostgreSQL 14+ (يُوصى بـ RDS/Cloud SQL المُدار، أو مستضاف ذاتياً)
- [Helm](https://helm.sh/) الإصدار 3.10+
- [kubectl](https://kubernetes.io/docs/tasks/tools/) مكوّن لمجموعتك
- وحدة تحكم Ingress (NGINX Ingress، Traefik، إلخ)
- cert-manager (اختياري، لشهادات TLS تلقائية)
- [Bun](https://bun.sh/) مثبت محلياً (لإنشاء زوج مفاتيح المسؤول)


## 2. تثبيت المخطط

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

أو أنشئ ملف `values-production.yaml` لعمليات نشر قابلة للتكرار:

```yaml
# values-production.yaml
app:
  image:
    repository: ghcr.io/rhonda-rodododo/llamenos
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

ثم ثبّت:

```bash
helm install llamenos deploy/helm/llamenos/ -f values-production.yaml
```

## 3. التحقق من النشر

```bash
# تحقق من أن الـ pods تعمل
kubectl get pods -l app.kubernetes.io/instance=llamenos

# تحقق من صحة التطبيق
kubectl port-forward svc/llamenos 3000:3000
curl http://localhost:3000/health/ready
# → {"status":"ok"}
```

## 4. تكوين DNS

وجّه نطاقك إلى عنوان IP الخارجي لوحدة تحكم Ingress أو موازن التحميل:

```bash
kubectl get ingress llamenos
```

## 5. تسجيل الدخول الأول والإعداد

افتح `https://hotline.yourdomain.com` في متصفحك. سجّل الدخول باستخدام nsec المسؤول وأكمل معالج الإعداد.

## مرجع تكوين المخطط

### التطبيق

| المعامل | الوصف | الافتراضي |
|---------|--------|-----------|
| `app.image.repository` | صورة الحاوية | `ghcr.io/rhonda-rodododo/llamenos` |
| `app.image.tag` | وسم الصورة | إصدار المخطط |
| `app.port` | منفذ التطبيق | `3000` |
| `app.replicas` | نسخ Pod | `2` |
| `app.resources` | طلبات وحدود CPU/الذاكرة | `{}` |
| `app.env` | متغيرات بيئة إضافية | `{}` |

### PostgreSQL

| المعامل | الوصف | الافتراضي |
|---------|--------|-----------|
| `postgres.host` | اسم مضيف PostgreSQL (مطلوب) | `""` |
| `postgres.port` | منفذ PostgreSQL | `5432` |
| `postgres.database` | اسم قاعدة البيانات | `llamenos` |
| `postgres.user` | مستخدم قاعدة البيانات | `llamenos` |
| `postgres.poolSize` | حجم مجمع الاتصالات | `10` |

### الأسرار

| المعامل | الوصف | الافتراضي |
|---------|--------|-----------|
| `secrets.hmacSecret` | HMAC signing key — 64 hex chars (required) | `""` |
| `secrets.serverNostrSecret` | Server Nostr identity key — 64 hex chars (required) | `""` |
| `secrets.postgresPassword` | كلمة مرور PostgreSQL (مطلوب) | `""` |
| `secrets.twilioAccountSid` | Twilio Account SID | `""` |
| `secrets.twilioAuthToken` | Twilio Auth Token | `""` |
| `secrets.twilioPhoneNumber` | رقم هاتف Twilio (E.164) | `""` |
| `secrets.existingSecret` | استخدام Secret K8s موجود | `""` |

> **نصيحة**: للإنتاج، استخدم `secrets.existingSecret` للإشارة إلى Secret يُدار بواسطة External Secrets Operator أو Sealed Secrets أو Vault.

### MinIO

| المعامل | الوصف | الافتراضي |
|---------|--------|-----------|
| `minio.enabled` | نشر MinIO | `true` |
| `minio.image.repository` | صورة MinIO | `minio/minio` |
| `minio.image.tag` | وسم MinIO | `RELEASE.2025-01-20T14-49-07Z` |
| `minio.persistence.size` | وحدة تخزين بيانات MinIO | `50Gi` |
| `minio.persistence.storageClass` | فئة التخزين | `""` |
| `minio.credentials.accessKey` | مستخدم MinIO الرئيسي | `""` (مطلوب) |
| `minio.credentials.secretKey` | كلمة مرور MinIO الرئيسية | `""` (مطلوب) |
| `minio.resources` | طلبات وحدود CPU/الذاكرة | `{}` |

### نسخ Whisper التلقائي

| المعامل | الوصف | الافتراضي |
|---------|--------|-----------|
| `whisper.enabled` | نشر Whisper | `false` |
| `whisper.image.repository` | صورة Whisper | `fedirz/faster-whisper-server` |
| `whisper.image.tag` | وسم Whisper | `0.4.1` |
| `whisper.model` | اسم نموذج Whisper | `Systran/faster-whisper-base` |
| `whisper.device` | الجهاز: `cpu` أو `cuda` | `cpu` |
| `whisper.resources` | طلبات وحدود CPU/الذاكرة | `{}` |

### Ingress

| المعامل | الوصف | الافتراضي |
|---------|--------|-----------|
| `ingress.enabled` | إنشاء مورد Ingress | `true` |
| `ingress.className` | فئة Ingress | `nginx` |
| `ingress.annotations` | تعليقات Ingress | `{}` |
| `ingress.hosts` | قواعد المضيف | راجع values.yaml |
| `ingress.tls` | تكوين TLS | `[]` |

### حساب الخدمة

| المعامل | الوصف | الافتراضي |
|---------|--------|-----------|
| `serviceAccount.create` | إنشاء ServiceAccount | `true` |
| `serviceAccount.annotations` | تعليقات SA (مثلاً IRSA) | `{}` |
| `serviceAccount.name` | تجاوز اسم SA | `""` |

## استخدام أسرار خارجية

للإنتاج، تجنب وضع الأسرار مباشرة في قيم Helm. بدلاً من ذلك، أنشئ Secret منفصلاً وأشر إليه:

```yaml
# values-production.yaml
secrets:
  existingSecret: llamenos-secrets
```

أنشئ Secret باستخدام أداتك المفضلة:

```bash
# يدوي
kubectl create secret generic llamenos-secrets \
  --from-literal=hmac-secret=your_hmac_hex \
  --from-literal=server-nostr-secret=your_nostr_hex \
  --from-literal=postgres-password=your_password \
  --from-literal=minio-access-key=your_key \
  --from-literal=minio-secret-key=your_key

# أو باستخدام External Secrets Operator أو Sealed Secrets أو Vault، إلخ.
```

## استخدام MinIO خارجي أو S3

إذا كان لديك MinIO أو خدمة متوافقة مع S3 بالفعل، عطّل MinIO المدمج ومرر نقطة النهاية:

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

## نسخ تلقائي بتسريع GPU

للنسخ التلقائي Whisper المسرّع بـ GPU على بطاقات NVIDIA:

```yaml
whisper:
  enabled: true
  device: "cuda"
  model: "Systran/faster-whisper-large-v3"
  resources:
    limits:
      nvidia.com/gpu: 1
```

تأكد من تثبيت [إضافة أجهزة NVIDIA](https://github.com/NVIDIA/k8s-device-plugin) في مجموعتك.

## التوسع

يستخدم النشر استراتيجية `RollingUpdate` للترقيات بدون توقف. وسّع النسخ بناءً على حجم حركة المرور:

```bash
kubectl scale deployment llamenos --replicas=3
```

أو عيّن `app.replicas` في ملف القيم. تضمن أقفال PostgreSQL الاستشارية تناسق البيانات عبر النسخ.


## المراقبة

### فحوصات الصحة

يكوّن المخطط فحوصات الحياة والجاهزية والبدء ضد `/api/health`:

```yaml
# مدمج في قالب النشر
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

### السجلات

```bash
kubectl logs -l app.kubernetes.io/instance=llamenos -c app -f
```

## الترقية

```bash
helm upgrade llamenos deploy/helm/llamenos/ -f values-production.yaml
```

توفر استراتيجية `RollingUpdate` ترقيات بدون توقف.

## إلغاء التثبيت

```bash
helm uninstall llamenos
```

> **ملاحظة**: لا يتم حذف PersistentVolumeClaims بواسطة `helm uninstall`. احذفها يدوياً إذا أردت إزالة جميع البيانات:
> ```bash
> kubectl delete pvc -l app.kubernetes.io/instance=llamenos
> ```

## استكشاف الأخطاء

### Pod عالق في CrashLoopBackOff

```bash
kubectl logs llamenos-0 -c app --previous
kubectl describe pod llamenos-0
```

الأسباب الشائعة: أسرار مفقودة، ADMIN_PUBKEY غير صحيح، PostgreSQL غير قابل للوصول، MinIO غير جاهز.

### أخطاء اتصال قاعدة البيانات

تحقق من إمكانية الوصول إلى PostgreSQL من المجموعة:

```bash
kubectl run pg-test --rm -it --image=postgres:17-alpine -- psql postgresql://llamenos:PASSWORD@PG_HOST:5432/llamenos -c "SELECT 1"
```

### Ingress لا يعمل

تحقق من أن وحدة تحكم Ingress تعمل وأن مورد Ingress له عنوان:

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


## الخطوات التالية

- [دليل المسؤول](/docs/admin-guide) — تكوين خط الطوارئ
- [نظرة عامة على الاستضافة الذاتية](/docs/deploy/self-hosting) — مقارنة خيارات النشر
- [نشر Docker Compose](/docs/deploy/docker) — بديل أبسط
