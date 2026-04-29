---
title: "배포: Kubernetes (Helm)"
description: 공식 Helm 차트를 사용하여 Kubernetes에 Llamenos를 배포합니다.
---

이 가이드는 공식 Helm 차트를 사용하여 Kubernetes 클러스터에 Llamenos를 배포하는 방법을 다룹니다. 차트는 애플리케이션과 선택적 MinIO/Whisper 서비스를 별도의 배포로 관리합니다. PostgreSQL 데이터베이스는 사용자가 제공해야 합니다.

## 사전 요구 사항

- Kubernetes 클러스터 (v1.24+) — 관리형 (EKS, GKE, AKS) 또는 자체 호스팅
- PostgreSQL 14+ 인스턴스 (관리형 RDS/Cloud SQL 권장, 또는 자체 호스팅)
- [Helm](https://helm.sh/) v3.10+
- [kubectl](https://kubernetes.io/docs/tasks/tools/) 클러스터에 맞게 설정
- 인그레스 컨트롤러 (NGINX Ingress, Traefik 등)
- cert-manager (선택 사항, 자동 TLS 인증서용)
- [Bun](https://bun.sh/) 로컬 설치 (관리자 키 쌍 생성용)

## 1. 관리자 키 쌍 생성

```bash
git clone https://github.com/your-org/llamenos.git
cd llamenos
bun install
bun run bootstrap-admin
```

**nsec**을 안전하게 저장하세요. **16진수 공개 키**를 Helm 값에 사용하기 위해 복사하세요.

## 2. 차트 설치

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

또는 재현 가능한 배포를 위해 `values-production.yaml` 파일을 만드세요:

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

그런 다음 설치하세요:

```bash
helm install llamenos deploy/helm/llamenos/ -f values-production.yaml
```

## 3. 배포 확인

```bash
# 파드 실행 상태 확인
kubectl get pods -l app.kubernetes.io/instance=llamenos

# 앱 건강 상태 확인
kubectl port-forward svc/llamenos 3000:3000
curl http://localhost:3000/api/health
# → {"status":"ok"}
```

## 4. DNS 설정

도메인을 인그레스 컨트롤러의 외부 IP 또는 로드 밸런서로 설정하세요:

```bash
kubectl get ingress llamenos
```

## 5. 첫 로그인 및 설정

브라우저에서 `https://hotline.yourdomain.com`을 여세요. 관리자 nsec으로 로그인하고 설정 마법사를 완료하세요.

## 차트 설정 참조

### 애플리케이션

| 파라미터 | 설명 | 기본값 |
|----------|------|--------|
| `app.image.repository` | 컨테이너 이미지 | `ghcr.io/your-org/llamenos` |
| `app.image.tag` | 이미지 태그 | Chart appVersion |
| `app.port` | 애플리케이션 포트 | `3000` |
| `app.replicas` | 파드 복제 수 | `2` |
| `app.resources` | CPU/메모리 요청 및 제한 | `{}` |
| `app.env` | 추가 환경 변수 | `{}` |

### PostgreSQL

| 파라미터 | 설명 | 기본값 |
|----------|------|--------|
| `postgres.host` | PostgreSQL 호스트명 (필수) | `""` |
| `postgres.port` | PostgreSQL 포트 | `5432` |
| `postgres.database` | 데이터베이스 이름 | `llamenos` |
| `postgres.user` | 데이터베이스 사용자 | `llamenos` |
| `postgres.poolSize` | 커넥션 풀 크기 | `10` |

### Secrets

| 파라미터 | 설명 | 기본값 |
|----------|------|--------|
| `secrets.adminPubkey` | 관리자 Nostr 16진수 공개 키 | `""` |
| `secrets.postgresPassword` | PostgreSQL 비밀번호 (필수) | `""` |
| `secrets.twilioAccountSid` | Twilio Account SID | `""` |
| `secrets.twilioAuthToken` | Twilio Auth Token | `""` |
| `secrets.twilioPhoneNumber` | Twilio 전화번호 (E.164) | `""` |
| `secrets.existingSecret` | 기존 K8s Secret 사용 | `""` |

> **팁**: 프로덕션 환경에서는 `secrets.existingSecret`을 사용하여 External Secrets Operator, Sealed Secrets 또는 Vault로 관리되는 Secret을 참조하세요.

### MinIO

| 파라미터 | 설명 | 기본값 |
|----------|------|--------|
| `minio.enabled` | MinIO 배포 | `true` |
| `minio.image.repository` | MinIO 이미지 | `minio/minio` |
| `minio.image.tag` | MinIO 태그 | `RELEASE.2025-01-20T14-49-07Z` |
| `minio.persistence.size` | MinIO 데이터 볼륨 | `50Gi` |
| `minio.persistence.storageClass` | 스토리지 클래스 | `""` |
| `minio.credentials.accessKey` | MinIO 루트 사용자 | `""` (필수) |
| `minio.credentials.secretKey` | MinIO 루트 비밀번호 | `""` (필수) |
| `minio.resources` | CPU/메모리 요청 및 제한 | `{}` |

### Whisper 음성 변환

| 파라미터 | 설명 | 기본값 |
|----------|------|--------|
| `whisper.enabled` | Whisper 배포 | `false` |
| `whisper.image.repository` | Whisper 이미지 | `fedirz/faster-whisper-server` |
| `whisper.image.tag` | Whisper 태그 | `0.4.1` |
| `whisper.model` | Whisper 모델 이름 | `Systran/faster-whisper-base` |
| `whisper.device` | 디바이스: `cpu` 또는 `cuda` | `cpu` |
| `whisper.resources` | CPU/메모리 요청 및 제한 | `{}` |

### Ingress

| 파라미터 | 설명 | 기본값 |
|----------|------|--------|
| `ingress.enabled` | Ingress 리소스 생성 | `true` |
| `ingress.className` | Ingress 클래스 | `nginx` |
| `ingress.annotations` | Ingress 어노테이션 | `{}` |
| `ingress.hosts` | 호스트 규칙 | values.yaml 참조 |
| `ingress.tls` | TLS 설정 | `[]` |

### 서비스 계정

| 파라미터 | 설명 | 기본값 |
|----------|------|--------|
| `serviceAccount.create` | ServiceAccount 생성 | `true` |
| `serviceAccount.annotations` | SA 어노테이션 (예: IRSA) | `{}` |
| `serviceAccount.name` | SA 이름 오버라이드 | `""` |

## 외부 시크릿 사용

프로덕션 환경에서는 Helm 값에 시크릿을 직접 넣지 마세요. 대신 Secret을 별도로 만들고 참조하세요:

```yaml
# values-production.yaml
secrets:
  existingSecret: llamenos-secrets
```

원하는 도구로 Secret을 만드세요:

```bash
# 수동
kubectl create secret generic llamenos-secrets \
  --from-literal=admin-pubkey=your_key \
  --from-literal=postgres-password=your_password \
  --from-literal=minio-access-key=your_key \
  --from-literal=minio-secret-key=your_key

# 또는 External Secrets Operator, Sealed Secrets, Vault 등 사용
```

## 외부 MinIO 또는 S3 사용

이미 MinIO나 S3 호환 서비스가 있다면, 내장 MinIO를 비활성화하고 엔드포인트를 전달하세요:

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

## GPU 음성 변환

NVIDIA GPU에서 GPU 가속 Whisper 음성 변환을 사용하려면:

```yaml
whisper:
  enabled: true
  device: "cuda"
  model: "Systran/faster-whisper-large-v3"
  resources:
    limits:
      nvidia.com/gpu: 1
```

클러스터에 [NVIDIA device plugin](https://github.com/NVIDIA/k8s-device-plugin)이 설치되어 있는지 확인하세요.

## 스케일링

배포는 무중단 업그레이드를 위해 `RollingUpdate` 전략을 사용합니다. 트래픽에 따라 복제본을 조정하세요:

```bash
kubectl scale deployment llamenos --replicas=3
```

또는 values 파일에서 `app.replicas`를 설정하세요. PostgreSQL advisory lock이 복제본 간 데이터 일관성을 보장합니다.

인프라 관리 없이 자동 글로벌 스케일링을 원한다면, [Cloudflare Workers 배포](/docs/deploy)를 고려하세요.

## 모니터링

### 건강 상태 확인

차트는 `/api/health`에 대한 liveness, readiness, startup 프로브를 설정합니다:

```yaml
# 배포 템플릿에 내장
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

### 로그

```bash
kubectl logs -l app.kubernetes.io/instance=llamenos -c app -f
```

## 업그레이드

```bash
helm upgrade llamenos deploy/helm/llamenos/ -f values-production.yaml
```

`RollingUpdate` 전략으로 무중단 업그레이드가 제공됩니다.

## 삭제

```bash
helm uninstall llamenos
```

> **참고**: PersistentVolumeClaim은 `helm uninstall`로 삭제되지 않습니다. 모든 데이터를 제거하려면 수동으로 삭제하세요:
> ```bash
> kubectl delete pvc -l app.kubernetes.io/instance=llamenos
> ```

## 문제 해결

### 파드가 CrashLoopBackOff 상태

```bash
kubectl logs llamenos-0 -c app --previous
kubectl describe pod llamenos-0
```

일반적인 원인: 누락된 시크릿, 잘못된 ADMIN_PUBKEY, PostgreSQL 연결 불가, MinIO 미준비.

### 데이터베이스 연결 오류

클러스터에서 PostgreSQL에 접근 가능한지 확인하세요:

```bash
kubectl run pg-test --rm -it --image=postgres:17-alpine -- psql postgresql://llamenos:PASSWORD@PG_HOST:5432/llamenos -c "SELECT 1"
```

### 인그레스 작동하지 않음

인그레스 컨트롤러가 실행 중이고 Ingress 리소스에 주소가 있는지 확인하세요:

```bash
kubectl get ingress llamenos
kubectl describe ingress llamenos
```

## 다음 단계

- [관리자 가이드](/docs/admin-guide) — 핫라인 설정
- [자체 호스팅 개요](/docs/deploy/self-hosting) — 배포 옵션 비교
- [Docker Compose 배포](/docs/deploy/docker) — 더 간단한 대안
