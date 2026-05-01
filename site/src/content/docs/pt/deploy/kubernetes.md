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

## 1. Gerar o par de chaves do administrador

```bash
git clone https://github.com/your-org/llamenos.git
cd llamenos
bun install
bun run bootstrap-admin
```

Guarde o **nsec** com seguranca. Copie a **chave publica hexadecimal** para os valores do Helm.

## 2. Instalar o chart

```bash
helm install llamenos deploy/helm/llamenos/ \
  --set secrets.adminPubkey=SUA_CHAVE_PUBLICA_HEX \
  --set secrets.postgresPassword=SUA_SENHA_PG \
  --set postgres.host=SEU_HOST_PG \
  --set rustfs.credentials.accessKey=sua-chave-de-acesso \
  --set rustfs.credentials.secretKey=sua-chave-secreta \
  --set ingress.hosts[0].host=hotline.seudorustfs.com \
  --set ingress.tls[0].secretName=llamenos-tls \
  --set ingress.tls[0].hosts[0]=hotline.seudorustfs.com
```

Ou crie um arquivo `values-production.yaml` para implantacoes reproduziveis:

```yaml
# values-production.yaml
app:
  image:
    repository: ghcr.io/your-org/llamenos
    tag: "0.14.0"
  replicas: 2
  env:
    HOTLINE_NAME: "Sua Linha"

postgres:
  host: minha-instancia-rds.regiao.rds.amazonaws.com
  port: 5432
  database: llamenos
  user: llamenos
  poolSize: 10

secrets:
  adminPubkey: "sua_chave_publica_hex"
  postgresPassword: "sua-senha-forte"
  # twilioAccountSid: ""
  # twilioAuthToken: ""
  # twilioPhoneNumber: ""

rustfs:
  enabled: true
  persistence:
    size: 50Gi
    storageClass: "gp3"
  credentials:
    accessKey: "sua-chave-de-acesso"
    secretKey: "sua-chave-secreta-altere"

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
    - host: hotline.seudorustfs.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: llamenos-tls
      hosts:
        - hotline.seudorustfs.com
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
curl http://localhost:3000/api/health
# → {"status":"ok"}
```

## 4. Configurar DNS

Aponte seu dorustfs para o IP externo ou load balancer do ingress controller:

```bash
kubectl get ingress llamenos
```

## 5. Primeiro login e configuracao

Abra `https://hotline.seudorustfs.com` no seu navegador. Faca login com o nsec de administrador e complete o assistente de configuracao.

## Referencia de configuracao do chart

### Aplicacao

| Parametro | Descricao | Padrao |
|-----------|-----------|--------|
| `app.image.repository` | Imagem do container | `ghcr.io/your-org/llamenos` |
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
| `secrets.adminPubkey` | Chave publica hex Nostr do admin | `""` |
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
  --from-literal=rustfs-access-key=sua_chave \
  --from-literal=rustfs-secret-key=sua_chave

# Ou com External Secrets Operator, Sealed Secrets, Vault, etc.
```

## Usando um RustFS ou S3 externo

Se voce ja tem RustFS ou um servico compativel com S3, desative o RustFS integrado e passe o endpoint:

```yaml
rustfs:
  enabled: false

app:
  env:
    STORAGE_ENDPOINT: "https://seu-rustfs.exemplo.com"
    STORAGE_ACCESS_KEY: "sua-chave"
    STORAGE_SECRET_KEY: "seu-segredo"
    STORAGE_BUCKET: "llamenos"
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

Para escalabilidade global automatica sem gerenciar infraestrutura, considere a [implantacao no Cloudflare Workers](/docs/getting-started).

## Monitoramento

### Verificacoes de saude

O chart configura probes de liveness, readiness e startup contra `/api/health`:

```yaml
# Integrado ao template do deployment
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

## Proximos passos

- [Guia do administrador](/docs/admin-guide) -- configurar a linha
- [Visao geral do auto-hospedagem](/docs/self-hosting) -- comparar opcoes de implantacao
- [Implantacao com Docker Compose](/docs/deploy-docker) -- alternativa mais simples
