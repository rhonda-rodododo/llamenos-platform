---
title: "部署：Kubernetes (Helm)"
description: 使用官方 Helm Chart 将 Llamenos 部署到 Kubernetes。
---

本指南介绍如何使用官方 Helm Chart 将 Llamenos 部署到 Kubernetes 集群。Chart 将应用程序和可选的 MinIO/Whisper 服务作为独立部署进行管理。您需要自行提供 PostgreSQL 数据库。

## 前置条件

- 一个 Kubernetes 集群（v1.24+）—— 托管（EKS、GKE、AKS）或自托管
- PostgreSQL 14+ 实例（推荐使用托管的 RDS/Cloud SQL，或自托管）
- [Helm](https://helm.sh/) v3.10+
- [kubectl](https://kubernetes.io/docs/tasks/tools/) 已配置到您的集群
- Ingress 控制器（NGINX Ingress、Traefik 等）
- cert-manager（可选，用于自动 TLS 证书）
- 本地安装了 [Bun](https://bun.sh/)（用于生成管理员密钥对）

## 1. 生成管理员密钥对

```bash
git clone https://github.com/your-org/llamenos.git
cd llamenos
bun install
bun run bootstrap-admin
```

安全保存 **nsec**。复制**十六进制公钥**用于 Helm 配置。

## 2. 安装 Chart

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

或者创建一个 `values-production.yaml` 文件以实现可重复部署：

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

然后安装：

```bash
helm install llamenos deploy/helm/llamenos/ -f values-production.yaml
```

## 3. 验证部署

```bash
# 检查 Pod 是否正在运行
kubectl get pods -l app.kubernetes.io/instance=llamenos

# 检查应用健康状态
kubectl port-forward svc/llamenos 3000:3000
curl http://localhost:3000/api/health
# → {"status":"ok"}
```

## 4. 配置 DNS

将您的域名指向 Ingress 控制器的外部 IP 或负载均衡器：

```bash
kubectl get ingress llamenos
```

## 5. 首次登录和配置

在浏览器中打开 `https://hotline.yourdomain.com`。使用管理员 nsec 登录并完成设置向导。

## Chart 配置参考

### 应用程序

| 参数 | 描述 | 默认值 |
|------|------|--------|
| `app.image.repository` | 容器镜像 | `ghcr.io/your-org/llamenos` |
| `app.image.tag` | 镜像标签 | Chart appVersion |
| `app.port` | 应用程序端口 | `3000` |
| `app.replicas` | Pod 副本数 | `2` |
| `app.resources` | CPU/内存请求和限制 | `{}` |
| `app.env` | 额外环境变量 | `{}` |

### PostgreSQL

| 参数 | 描述 | 默认值 |
|------|------|--------|
| `postgres.host` | PostgreSQL 主机名（必填） | `""` |
| `postgres.port` | PostgreSQL 端口 | `5432` |
| `postgres.database` | 数据库名称 | `llamenos` |
| `postgres.user` | 数据库用户 | `llamenos` |
| `postgres.poolSize` | 连接池大小 | `10` |

### 密钥

| 参数 | 描述 | 默认值 |
|------|------|--------|
| `secrets.adminPubkey` | 管理员 Nostr 十六进制公钥 | `""` |
| `secrets.postgresPassword` | PostgreSQL 密码（必填） | `""` |
| `secrets.twilioAccountSid` | Twilio Account SID | `""` |
| `secrets.twilioAuthToken` | Twilio Auth Token | `""` |
| `secrets.twilioPhoneNumber` | Twilio 电话号码 (E.164) | `""` |
| `secrets.existingSecret` | 使用已有的 K8s Secret | `""` |

> **提示**：在生产环境中，使用 `secrets.existingSecret` 引用由 External Secrets Operator、Sealed Secrets 或 Vault 管理的 Secret。

### MinIO

| 参数 | 描述 | 默认值 |
|------|------|--------|
| `minio.enabled` | 部署 MinIO | `true` |
| `minio.image.repository` | MinIO 镜像 | `minio/minio` |
| `minio.image.tag` | MinIO 标签 | `RELEASE.2025-01-20T14-49-07Z` |
| `minio.persistence.size` | MinIO 数据卷 | `50Gi` |
| `minio.persistence.storageClass` | 存储类 | `""` |
| `minio.credentials.accessKey` | MinIO root 用户 | `""`（必填） |
| `minio.credentials.secretKey` | MinIO root 密码 | `""`（必填） |
| `minio.resources` | CPU/内存请求和限制 | `{}` |

### Whisper 语音转文字

| 参数 | 描述 | 默认值 |
|------|------|--------|
| `whisper.enabled` | 部署 Whisper | `false` |
| `whisper.image.repository` | Whisper 镜像 | `fedirz/faster-whisper-server` |
| `whisper.image.tag` | Whisper 标签 | `0.4.1` |
| `whisper.model` | Whisper 模型名称 | `Systran/faster-whisper-base` |
| `whisper.device` | 设备：`cpu` 或 `cuda` | `cpu` |
| `whisper.resources` | CPU/内存请求和限制 | `{}` |

### Ingress

| 参数 | 描述 | 默认值 |
|------|------|--------|
| `ingress.enabled` | 创建 Ingress 资源 | `true` |
| `ingress.className` | Ingress 类 | `nginx` |
| `ingress.annotations` | Ingress 注解 | `{}` |
| `ingress.hosts` | 主机规则 | 参见 values.yaml |
| `ingress.tls` | TLS 配置 | `[]` |

### Service Account

| 参数 | 描述 | 默认值 |
|------|------|--------|
| `serviceAccount.create` | 创建 ServiceAccount | `true` |
| `serviceAccount.annotations` | SA 注解（例如 IRSA） | `{}` |
| `serviceAccount.name` | 覆盖 SA 名称 | `""` |

## 使用外部密钥

在生产环境中，避免将密钥直接放入 Helm values 中。应单独创建 Secret 并引用它：

```yaml
# values-production.yaml
secrets:
  existingSecret: llamenos-secrets
```

使用您偏好的工具创建 Secret：

```bash
# 手动创建
kubectl create secret generic llamenos-secrets \
  --from-literal=admin-pubkey=your_key \
  --from-literal=postgres-password=your_password \
  --from-literal=minio-access-key=your_key \
  --from-literal=minio-secret-key=your_key

# 或使用 External Secrets Operator、Sealed Secrets、Vault 等
```

## 使用外部 MinIO 或 S3

如果您已有 MinIO 或兼容 S3 的服务，可以禁用内置 MinIO 并传入端点：

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

## GPU 语音转文字

要在 NVIDIA GPU 上使用 GPU 加速 Whisper 语音转文字：

```yaml
whisper:
  enabled: true
  device: "cuda"
  model: "Systran/faster-whisper-large-v3"
  resources:
    limits:
      nvidia.com/gpu: 1
```

确保集群中已安装 [NVIDIA device plugin](https://github.com/NVIDIA/k8s-device-plugin)。

## 扩展

部署使用 `RollingUpdate` 策略实现零停机升级。根据流量扩展副本数：

```bash
kubectl scale deployment llamenos --replicas=3
```

或在 values 文件中设置 `app.replicas`。PostgreSQL 咨询锁确保跨副本的数据一致性。

如需自动全球扩展且无需管理基础设施，请考虑使用 [Cloudflare Workers 部署](/docs/deploy)。

## 监控

### 健康检查

Chart 针对 `/api/health` 配置了存活、就绪和启动探针：

```yaml
# 内置于部署模板中
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

### 日志

```bash
kubectl logs -l app.kubernetes.io/instance=llamenos -c app -f
```

## 升级

```bash
helm upgrade llamenos deploy/helm/llamenos/ -f values-production.yaml
```

`RollingUpdate` 策略提供零停机升级。

## 卸载

```bash
helm uninstall llamenos
```

> **注意**：`helm uninstall` 不会删除 PersistentVolumeClaim。如果需要删除所有数据，请手动删除：
> ```bash
> kubectl delete pvc -l app.kubernetes.io/instance=llamenos
> ```

## 故障排除

### Pod 卡在 CrashLoopBackOff

```bash
kubectl logs llamenos-0 -c app --previous
kubectl describe pod llamenos-0
```

常见原因：缺少密钥、ADMIN_PUBKEY 不正确、无法连接 PostgreSQL、MinIO 未就绪。

### 数据库连接错误

验证从集群内是否可以访问 PostgreSQL：

```bash
kubectl run pg-test --rm -it --image=postgres:17-alpine -- psql postgresql://llamenos:PASSWORD@PG_HOST:5432/llamenos -c "SELECT 1"
```

### Ingress 不工作

验证 Ingress 控制器是否正在运行以及 Ingress 资源是否有地址：

```bash
kubectl get ingress llamenos
kubectl describe ingress llamenos
```

## 后续步骤

- [管理员指南](/docs/admin-guide) —— 配置热线
- [自托管概览](/docs/deploy/self-hosting) —— 比较部署选项
- [Docker Compose 部署](/docs/deploy/docker) —— 更简单的替代方案
