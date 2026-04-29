---
title: "Triển khai: Kubernetes (Helm)"
description: Triển khai Llamenos lên Kubernetes sử dụng Helm chart chính thức.
---

Hướng dẫn này bao gồm việc triển khai Llamenos lên cụm Kubernetes sử dụng Helm chart chính thức. Chart quản lý ứng dụng và các dịch vụ MinIO/Whisper tùy chọn dưới dạng các deployment riêng biệt. Bạn cung cấp cơ sở dữ liệu PostgreSQL.

## Yêu cầu tiên quyết

- Một cụm Kubernetes (v1.24+) — được quản lý (EKS, GKE, AKS) hoặc tự lưu trữ
- Một phiên bản PostgreSQL 14+ (khuyến nghị RDS/Cloud SQL được quản lý, hoặc tự lưu trữ)
- [Helm](https://helm.sh/) v3.10+
- [kubectl](https://kubernetes.io/docs/tasks/tools/) đã cấu hình cho cụm của bạn
- Một ingress controller (NGINX Ingress, Traefik, v.v.)
- cert-manager (tùy chọn, cho chứng chỉ TLS tự động)
- [Bun](https://bun.sh/) cài đặt trên máy cục bộ (để tạo cặp khóa quản trị)

## 1. Tạo cặp khóa quản trị

```bash
git clone https://github.com/your-org/llamenos-platform.git
cd llamenos-platform
bun install
bun run bootstrap-admin
```

Lưu **nsec** an toàn. Sao chép **khóa công khai hex** cho Helm values.

## 2. Cài đặt chart

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

Hoặc tạo file `values-production.yaml` để triển khai tái lập:

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

Sau đó cài đặt:

```bash
helm install llamenos deploy/helm/llamenos/ -f values-production.yaml
```

## 3. Xác minh triển khai

```bash
kubectl get pods -l app.kubernetes.io/instance=llamenos
kubectl port-forward svc/llamenos 3000:3000
curl http://localhost:3000/api/health
# → {"status":"ok"}
```

## 4. Cấu hình DNS

Trỏ tên miền đến IP bên ngoài hoặc load balancer của ingress controller:

```bash
kubectl get ingress llamenos
```

## 5. Đăng nhập và thiết lập lần đầu

Mở `https://hotline.yourdomain.com` trong trình duyệt. Đăng nhập bằng nsec quản trị và hoàn thành trình hướng dẫn thiết lập.

## Tham chiếu cấu hình Chart

### Ứng dụng

| Tham số | Mô tả | Mặc định |
|---------|-------|----------|
| `app.image.repository` | Container image | `ghcr.io/your-org/llamenos` |
| `app.image.tag` | Image tag | Chart appVersion |
| `app.port` | Cổng ứng dụng | `3000` |
| `app.replicas` | Số bản sao Pod | `2` |
| `app.resources` | Yêu cầu và giới hạn CPU/bộ nhớ | `{}` |
| `app.env` | Biến môi trường bổ sung | `{}` |

### PostgreSQL

| Tham số | Mô tả | Mặc định |
|---------|-------|----------|
| `postgres.host` | Tên máy chủ PostgreSQL (bắt buộc) | `""` |
| `postgres.port` | Cổng PostgreSQL | `5432` |
| `postgres.database` | Tên cơ sở dữ liệu | `llamenos` |
| `postgres.user` | Người dùng cơ sở dữ liệu | `llamenos` |
| `postgres.poolSize` | Kích thước connection pool | `10` |

### Secrets

| Tham số | Mô tả | Mặc định |
|---------|-------|----------|
| `secrets.adminPubkey` | Khóa công khai hex Nostr quản trị | `""` |
| `secrets.postgresPassword` | Mật khẩu PostgreSQL (bắt buộc) | `""` |
| `secrets.twilioAccountSid` | Twilio Account SID | `""` |
| `secrets.twilioAuthToken` | Twilio Auth Token | `""` |
| `secrets.twilioPhoneNumber` | Số điện thoại Twilio (E.164) | `""` |
| `secrets.existingSecret` | Sử dụng K8s Secret hiện có | `""` |

> **Mẹo**: Cho production, sử dụng `secrets.existingSecret` để tham chiếu Secret được quản lý bởi External Secrets Operator, Sealed Secrets hoặc Vault.

### MinIO

| Tham số | Mô tả | Mặc định |
|---------|-------|----------|
| `minio.enabled` | Triển khai MinIO | `true` |
| `minio.persistence.size` | Dung lượng MinIO | `50Gi` |
| `minio.credentials.accessKey` | MinIO root user | `""` (bắt buộc) |
| `minio.credentials.secretKey` | MinIO root password | `""` (bắt buộc) |

### Whisper

| Tham số | Mô tả | Mặc định |
|---------|-------|----------|
| `whisper.enabled` | Triển khai Whisper | `false` |
| `whisper.model` | Tên mô hình Whisper | `Systran/faster-whisper-base` |
| `whisper.device` | Thiết bị: `cpu` hoặc `cuda` | `cpu` |

## Sử dụng external secrets

Cho production, tránh đặt secrets trực tiếp trong Helm values. Tạo Secret riêng và tham chiếu:

```yaml
secrets:
  existingSecret: llamenos-secrets
```

```bash
kubectl create secret generic llamenos-secrets \
  --from-literal=admin-pubkey=your_key \
  --from-literal=postgres-password=your_password \
  --from-literal=minio-access-key=your_key \
  --from-literal=minio-secret-key=your_key
```

## GPU transcription

```yaml
whisper:
  enabled: true
  device: "cuda"
  model: "Systran/faster-whisper-large-v3"
  resources:
    limits:
      nvidia.com/gpu: 1
```

Đảm bảo [NVIDIA device plugin](https://github.com/NVIDIA/k8s-device-plugin) đã được cài đặt trong cụm.

## Mở rộng

```bash
kubectl scale deployment llamenos --replicas=3
```

Hoặc đặt `app.replicas` trong values file. PostgreSQL advisory locks đảm bảo tính nhất quán dữ liệu qua các bản sao.

## Nâng cấp

```bash
helm upgrade llamenos deploy/helm/llamenos/ -f values-production.yaml
```

## Gỡ cài đặt

```bash
helm uninstall llamenos
```

> **Lưu ý**: `helm uninstall` không xóa PersistentVolumeClaim. Xóa thủ công nếu muốn loại bỏ tất cả dữ liệu:
> ```bash
> kubectl delete pvc -l app.kubernetes.io/instance=llamenos
> ```

## Khắc phục sự cố

### Pod bị kẹt ở CrashLoopBackOff

```bash
kubectl logs llamenos-0 -c app --previous
kubectl describe pod llamenos-0
```

Nguyên nhân phổ biến: thiếu secrets, ADMIN_PUBKEY không đúng, không thể kết nối PostgreSQL, MinIO chưa sẵn sàng.

### Lỗi kết nối cơ sở dữ liệu

```bash
kubectl run pg-test --rm -it --image=postgres:17-alpine -- psql postgresql://llamenos:PASSWORD@PG_HOST:5432/llamenos -c "SELECT 1"
```

### Ingress không hoạt động

```bash
kubectl get ingress llamenos
kubectl describe ingress llamenos
```

## Bước tiếp theo

- [Hướng dẫn quản trị viên](/docs/admin-guide) — cấu hình đường dây nóng
- [Tổng quan tự lưu trữ](/docs/deploy/self-hosting) — so sánh các tùy chọn triển khai
- [Triển khai Docker Compose](/docs/deploy/docker) — phương án đơn giản hơn
