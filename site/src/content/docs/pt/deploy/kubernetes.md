---
title: "Implantar: Kubernetes (Helm)"
description: Implante o Llamenos no Kubernetes usando o chart oficial do Helm.
---

Este guia abrange a implantacao do Llamenos em um cluster Kubernetes usando o chart oficial do Helm. O chart gerencia o aplicativo e servicos opcionais de RustFS/Whisper como deployments separados. Voce fornece o banco de dados PostgreSQL.

## Pre-requisitos

- Um cluster Kubernetes (v1.24+) -- gerenciado (EKS, GKE, AKS) ou auto-hospedado
- Uma instancia PostgreSQL 14+ (RDS/Cloud SQL gerenciado recomendado, ou auto-hospedado)
- [Helm](https://helm.sh/) v3.10+
- [kubectl](https://kubernetes.io/docs/tasks/tools/) configurado para seu cluster
- Um ingress controller (NGINX Ingress, Traefik, etc.)
- cert-manager (opcional, para certificados TLS automaticos)
- [Bun](https://bun.sh/) instalado localmente (para gerar o par de chaves do administrador)


## 2. Instalar o chart

```bash
helm install llamenos deploy/helm/llamenos/ \
  --set secrets.postgresPassword=YOUR_PG_PASSWORD \
  --set secrets.hmacSecret=YOUR_HMAC_HEX \
  --set secrets.serverNostrSecret=YOUR_NOSTR_HEX \
  --set postgres.host=YOUR_PG_HOST \
  --set rustfs.credentials.accessKey=your-access-key \
  --set rustfs.credentials.secretKey=your-secret-key \
  --set ingress.hosts[0].host=hotline.yourdomain.com \
  --set ingress.tls[0].secretName=llamenos-tls \
  --set ingress.tls[0].hosts[0]=hotline.yourdomain.com
```

Ou crie um arquivo `values-production.yaml` para implantacoes reproduziveis:

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

rustfs:
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

Em seguida, instale:

```bash
helm install llamenos deploy/helm/llamenos/ -f values-production.yaml
```

## 3. Verificar a implantacao

```bash
# Verificar se os pods estao em execucao
kubectl get pods -l app.kubernetes.io/instance=llamenos

# Verificar a saude do aplicativo
kubectl port-forward svc/llamenos 3000:3000
curl http://localhost:3000/health/ready
# → {"status":"ok"}
```

## 4. Configurar DNS

Aponte seu dominio para o IP externo ou load balancer do ingress controller:

```bash
kubectl get ingress llamenos
```

## 5. Primeiro login e configuracao

Abra `https://hotline.seudominio.com` no seu navegador. Faca login com o nsec de administrador e complete o assistente de configuracao.

## Referencia de configuracao do chart

### Aplicacao

| Parametro | Descricao | Padrao |
|-----------|-----------|--------|
| `app.image.repository` | Imagem do container | `ghcr.io/rhonda-rodododo/llamenos` |
| `app.image.tag` | Tag da imagem | appVersion do chart |
| `app.port` | Porta do aplicativo | `3000` |
| `app.replicas` | Replicas do pod | `2` |
| `app.resources` | Requests e limits de CPU/memoria | `{}` |
| `app.env` | Variaveis de ambiente extras | `{}` |

### PostgreSQL

| Parametro | Descricao | Padrao |
|-----------|-----------|--------|
| `postgres.host` | Hostname do PostgreSQL (obrigatorio) | `""` |
| `postgres.port` | Porta do PostgreSQL | `5432` |
| `postgres.database` | Nome do banco de dados | `llamenos` |
| `postgres.user` | Usuario do banco de dados | `llamenos` |
| `postgres.poolSize` | Tamanho do pool de conexoes | `10` |

### Secrets

| Parametro | Descricao | Padrao |
|-----------|-----------|--------|
| `secrets.hmacSecret` | HMAC signing key — 64 hex chars (required) | `""` |
| `secrets.serverNostrSecret` | Server Nostr identity key — 64 hex chars (required) | `""` |
| `secrets.postgresPassword` | Senha do PostgreSQL (obrigatorio) | `""` |
| `secrets.twilioAccountSid` | Twilio Account SID | `""` |
| `secrets.twilioAuthToken` | Twilio Auth Token | `""` |
| `secrets.twilioPhoneNumber` | Numero de telefone Twilio (E.164) | `""` |
| `secrets.existingSecret` | Usar um Secret K8s existente | `""` |

> **Dica**: Para producao, use `secrets.existingSecret` para referenciar um Secret gerenciado pelo External Secrets Operator, Sealed Secrets ou Vault.

### RustFS

| Parametro | Descricao | Padrao |
|-----------|-----------|--------|
| `rustfs.enabled` | Implantar RustFS | `true` |
| `rustfs.image.repository` | Imagem do RustFS | `rustfs/rustfs` |
| `rustfs.image.tag` | Tag do RustFS | `RELEASE.2025-01-20T14-49-07Z` |
| `rustfs.persistence.size` | Volume de dados do RustFS | `50Gi` |
| `rustfs.persistence.storageClass` | Classe de armazenamento | `""` |
| `rustfs.credentials.accessKey` | Usuario root do RustFS | `""` (obrigatorio) |
| `rustfs.credentials.secretKey` | Senha root do RustFS | `""` (obrigatorio) |
| `rustfs.resources` | Requests e limits de CPU/memoria | `{}` |

### Transcricao Whisper

| Parametro | Descricao | Padrao |
|-----------|-----------|--------|
| `whisper.enabled` | Implantar Whisper | `false` |
| `whisper.image.repository` | Imagem do Whisper | `fedirz/faster-whisper-server` |
| `whisper.image.tag` | Tag do Whisper | `0.4.1` |
| `whisper.model` | Nome do modelo Whisper | `Systran/faster-whisper-base` |
| `whisper.device` | Dispositivo: `cpu` ou `cuda` | `cpu` |
| `whisper.resources` | Requests e limits de CPU/memoria | `{}` |

### Ingress

| Parametro | Descricao | Padrao |
|-----------|-----------|--------|
| `ingress.enabled` | Criar recurso Ingress | `true` |
| `ingress.className` | Classe do Ingress | `nginx` |
| `ingress.annotations` | Anotacoes do Ingress | `{}` |
| `ingress.hosts` | Regras de host | Veja values.yaml |
| `ingress.tls` | Configuracao TLS | `[]` |

### Service account

| Parametro | Descricao | Padrao |
|-----------|-----------|--------|
| `serviceAccount.create` | Criar um ServiceAccount | `true` |
| `serviceAccount.annotations` | Anotacoes do SA (ex.: IRSA) | `{}` |
| `serviceAccount.name` | Sobrescrever nome do SA | `""` |

## Usando secrets externos

Para producao, evite colocar secrets diretamente nos valores do Helm. Em vez disso, crie o Secret separadamente e referencie-o:

```yaml
# values-production.yaml
secrets:
  existingSecret: llamenos-secrets
```

Crie o Secret com sua ferramenta preferida:

```bash
# Manual
kubectl create secret generic llamenos-secrets \
  --from-literal=admin-pubkey=sua_chave \
  --from-literal=postgres-password=sua_senha \
  --from-literal=s3-access-key=sua_chave \
  --from-literal=s3-secret-key=sua_chave

# Ou com External Secrets Operator, Sealed Secrets, Vault, etc.
```

## Usando um RustFS ou S3 externo

Se voce ja tem RustFS ou um servico compativel com S3, desative o RustFS integrado e passe o endpoint:

```yaml
rustfs:
  enabled: false

app:
  env:
    S3_ENDPOINT: "https://seu-s3.exemplo.com"
    S3_ACCESS_KEY: "sua-chave"
    S3_SECRET_KEY: "seu-segredo"
    S3_BUCKET: "llamenos"
```

## Transcricao com GPU

Para transcricao Whisper acelerada por GPU em GPUs NVIDIA:

```yaml
whisper:
  enabled: true
  device: "cuda"
  model: "Systran/faster-whisper-large-v3"
  resources:
    limits:
      nvidia.com/gpu: 1
```

Certifique-se de que o [NVIDIA device plugin](https://github.com/NVIDIA/k8s-device-plugin) esteja instalado no seu cluster.

## Escalabilidade

O deployment usa a estrategia `RollingUpdate` para atualizacoes sem tempo de inatividade. Escale as replicas de acordo com seu trafego:

```bash
kubectl scale deployment llamenos --replicas=3
```

Ou defina `app.replicas` no seu arquivo de valores. Os advisory locks do PostgreSQL garantem a consistencia dos dados entre replicas.


## Monitoramento

### Verificacoes de saude

O chart configura probes de liveness, readiness e startup contra `/api/health`:

```yaml
# Integrado ao template do deployment
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

## Atualizacao

```bash
helm upgrade llamenos deploy/helm/llamenos/ -f values-production.yaml
```

A estrategia `RollingUpdate` garante atualizacoes sem tempo de inatividade.

## Desinstalacao

```bash
helm uninstall llamenos
```

> **Nota**: PersistentVolumeClaims nao sao removidos pelo `helm uninstall`. Exclua-os manualmente se desejar remover todos os dados:
> ```bash
> kubectl delete pvc -l app.kubernetes.io/instance=llamenos
> ```

## Solucao de problemas

### Pod preso em CrashLoopBackOff

```bash
kubectl logs llamenos-0 -c app --previous
kubectl describe pod llamenos-0
```

Causas comuns: secrets ausentes, ADMIN_PUBKEY incorreto, PostgreSQL inacessivel, RustFS nao pronto.

### Erros de conexao com o banco de dados

Verifique se o PostgreSQL esta acessivel a partir do cluster:

```bash
kubectl run pg-test --rm -it --image=postgres:17-alpine -- psql postgresql://llamenos:SENHA@HOST_PG:5432/llamenos -c "SELECT 1"
```

### Ingress nao funciona

Verifique se o ingress controller esta em execucao e se o recurso Ingress tem um endereco:

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
    - secretKey: s3-access-key
      remoteRef:
        key: llamenos/s3-access-key
    - secretKey: s3-secret-key
      remoteRef:
        key: llamenos/s3-secret-key
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


## Proximos passos

- [Guia do administrador](/docs/admin-guide) -- configurar a linha
- [Visao geral do auto-hospedagem](/docs/deploy/self-hosting) -- comparar opcoes de implantacao
- [Implantacao com Docker Compose](/docs/deploy/docker) -- alternativa mais simples
