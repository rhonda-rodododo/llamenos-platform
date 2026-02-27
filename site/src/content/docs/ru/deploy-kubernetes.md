---
title: "Развёртывание: Kubernetes (Helm)"
description: Развёртывание Llamenos в Kubernetes с помощью официального Helm-чарта.
---

Это руководство охватывает развёртывание Llamenos в кластере Kubernetes с помощью официального Helm-чарта. Чарт управляет приложением и опциональными сервисами MinIO/Whisper как отдельными развёртываниями. База данных PostgreSQL предоставляется вами.

## Предварительные требования

- Кластер Kubernetes (v1.24+) — управляемый (EKS, GKE, AKS) или самостоятельно размещённый
- Экземпляр PostgreSQL 14+ (рекомендуется управляемый RDS/Cloud SQL или самостоятельно размещённый)
- [Helm](https://helm.sh/) v3.10+
- [kubectl](https://kubernetes.io/docs/tasks/tools/), настроенный для вашего кластера
- Контроллер Ingress (NGINX Ingress, Traefik и т. д.)
- cert-manager (опционально, для автоматических TLS-сертификатов)
- [Bun](https://bun.sh/), установленный локально (для генерации пары ключей администратора)

## 1. Генерация пары ключей администратора

```bash
git clone https://github.com/your-org/llamenos.git
cd llamenos
bun install
bun run bootstrap-admin
```

Сохраните **nsec** в надёжном месте. Скопируйте **шестнадцатеричный публичный ключ** для значений Helm.

## 2. Установка чарта

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

Или создайте файл `values-production.yaml` для воспроизводимых развёртываний:

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

Затем выполните установку:

```bash
helm install llamenos deploy/helm/llamenos/ -f values-production.yaml
```

## 3. Проверка развёртывания

```bash
# Check pods are running
kubectl get pods -l app.kubernetes.io/instance=llamenos

# Check the app health
kubectl port-forward svc/llamenos 3000:3000
curl http://localhost:3000/api/health
# → {"status":"ok"}
```

## 4. Настройка DNS

Укажите ваш домен на внешний IP или балансировщик нагрузки контроллера Ingress:

```bash
kubectl get ingress llamenos
```

## 5. Первый вход и настройка

Откройте `https://hotline.yourdomain.com` в браузере. Войдите с nsec администратора и завершите мастер настройки.

## Справочник конфигурации чарта

### Приложение

| Параметр | Описание | По умолчанию |
|-----------|-------------|---------|
| `app.image.repository` | Образ контейнера | `ghcr.io/your-org/llamenos` |
| `app.image.tag` | Тег образа | Версия чарта |
| `app.port` | Порт приложения | `3000` |
| `app.replicas` | Реплики Pod | `2` |
| `app.resources` | Запросы и лимиты CPU/памяти | `{}` |
| `app.env` | Дополнительные переменные окружения | `{}` |

### PostgreSQL

| Параметр | Описание | По умолчанию |
|-----------|-------------|---------|
| `postgres.host` | Имя хоста PostgreSQL (обязательно) | `""` |
| `postgres.port` | Порт PostgreSQL | `5432` |
| `postgres.database` | Имя базы данных | `llamenos` |
| `postgres.user` | Пользователь базы данных | `llamenos` |
| `postgres.poolSize` | Размер пула соединений | `10` |

### Секреты

| Параметр | Описание | По умолчанию |
|-----------|-------------|---------|
| `secrets.adminPubkey` | Шестнадцатеричный публичный ключ Nostr администратора | `""` |
| `secrets.postgresPassword` | Пароль PostgreSQL (обязательно) | `""` |
| `secrets.twilioAccountSid` | Twilio Account SID | `""` |
| `secrets.twilioAuthToken` | Twilio Auth Token | `""` |
| `secrets.twilioPhoneNumber` | Номер телефона Twilio (E.164) | `""` |
| `secrets.existingSecret` | Использовать существующий K8s Secret | `""` |

> **Совет**: Для производственной среды используйте `secrets.existingSecret` для ссылки на Secret, управляемый External Secrets Operator, Sealed Secrets или Vault.

### MinIO

| Параметр | Описание | По умолчанию |
|-----------|-------------|---------|
| `minio.enabled` | Развернуть MinIO | `true` |
| `minio.image.repository` | Образ MinIO | `minio/minio` |
| `minio.image.tag` | Тег MinIO | `RELEASE.2025-01-20T14-49-07Z` |
| `minio.persistence.size` | Том данных MinIO | `50Gi` |
| `minio.persistence.storageClass` | Класс хранилища | `""` |
| `minio.credentials.accessKey` | Корневой пользователь MinIO | `""` (обязательно) |
| `minio.credentials.secretKey` | Корневой пароль MinIO | `""` (обязательно) |
| `minio.resources` | Запросы и лимиты CPU/памяти | `{}` |

### Транскрипция Whisper

| Параметр | Описание | По умолчанию |
|-----------|-------------|---------|
| `whisper.enabled` | Развернуть Whisper | `false` |
| `whisper.image.repository` | Образ Whisper | `fedirz/faster-whisper-server` |
| `whisper.image.tag` | Тег Whisper | `0.4.1` |
| `whisper.model` | Название модели Whisper | `Systran/faster-whisper-base` |
| `whisper.device` | Устройство: `cpu` или `cuda` | `cpu` |
| `whisper.resources` | Запросы и лимиты CPU/памяти | `{}` |

### Ingress

| Параметр | Описание | По умолчанию |
|-----------|-------------|---------|
| `ingress.enabled` | Создать ресурс Ingress | `true` |
| `ingress.className` | Класс Ingress | `nginx` |
| `ingress.annotations` | Аннотации Ingress | `{}` |
| `ingress.hosts` | Правила хостов | См. values.yaml |
| `ingress.tls` | Конфигурация TLS | `[]` |

### Сервисный аккаунт

| Параметр | Описание | По умолчанию |
|-----------|-------------|---------|
| `serviceAccount.create` | Создать ServiceAccount | `true` |
| `serviceAccount.annotations` | Аннотации SA (например, IRSA) | `{}` |
| `serviceAccount.name` | Переопределить имя SA | `""` |

## Использование внешних секретов

Для производственной среды избегайте хранения секретов напрямую в значениях Helm. Вместо этого создайте Secret отдельно и ссылайтесь на него:

```yaml
# values-production.yaml
secrets:
  existingSecret: llamenos-secrets
```

Создайте Secret с предпочтительным инструментом:

```bash
# Manual
kubectl create secret generic llamenos-secrets \
  --from-literal=admin-pubkey=your_key \
  --from-literal=postgres-password=your_password \
  --from-literal=minio-access-key=your_key \
  --from-literal=minio-secret-key=your_key

# Or with External Secrets Operator, Sealed Secrets, Vault, etc.
```

## Использование внешнего MinIO или S3

Если у вас уже есть MinIO или S3-совместимый сервис, отключите встроенный MinIO и передайте эндпоинт:

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

## Транскрипция на GPU

Для транскрипции Whisper с ускорением GPU на видеокартах NVIDIA:

```yaml
whisper:
  enabled: true
  device: "cuda"
  model: "Systran/faster-whisper-large-v3"
  resources:
    limits:
      nvidia.com/gpu: 1
```

Убедитесь, что в вашем кластере установлен [плагин устройств NVIDIA](https://github.com/NVIDIA/k8s-device-plugin).

## Масштабирование

Развёртывание использует стратегию `RollingUpdate` для обновлений без простоя. Масштабируйте реплики в зависимости от трафика:

```bash
kubectl scale deployment llamenos --replicas=3
```

Или задайте `app.replicas` в файле values. Консультативные блокировки PostgreSQL обеспечивают согласованность данных между репликами.

Для автоматического глобального масштабирования без управления инфраструктурой рассмотрите [развёртывание на Cloudflare Workers](/docs/getting-started).

## Мониторинг

### Проверки состояния

Чарт настраивает пробы liveness, readiness и startup для `/api/health`:

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

### Журналы

```bash
kubectl logs -l app.kubernetes.io/instance=llamenos -c app -f
```

## Обновление

```bash
helm upgrade llamenos deploy/helm/llamenos/ -f values-production.yaml
```

Стратегия `RollingUpdate` обеспечивает обновления без простоя.

## Удаление

```bash
helm uninstall llamenos
```

> **Примечание**: PersistentVolumeClaims не удаляются при `helm uninstall`. Удалите их вручную, если хотите удалить все данные:
> ```bash
> kubectl delete pvc -l app.kubernetes.io/instance=llamenos
> ```

## Устранение неполадок

### Pod завис в CrashLoopBackOff

```bash
kubectl logs llamenos-0 -c app --previous
kubectl describe pod llamenos-0
```

Распространённые причины: отсутствующие секреты, некорректный ADMIN_PUBKEY, PostgreSQL недоступен, MinIO не готов.

### Ошибки подключения к базе данных

Убедитесь, что PostgreSQL доступен из кластера:

```bash
kubectl run pg-test --rm -it --image=postgres:17-alpine -- psql postgresql://llamenos:PASSWORD@PG_HOST:5432/llamenos -c "SELECT 1"
```

### Ingress не работает

Убедитесь, что контроллер Ingress запущен и ресурс Ingress имеет адрес:

```bash
kubectl get ingress llamenos
kubectl describe ingress llamenos
```

## Следующие шаги

- [Руководство администратора](/docs/admin-guide) — настройка горячей линии
- [Обзор самостоятельного хостинга](/docs/self-hosting) — сравнение вариантов развёртывания
- [Развёртывание с Docker Compose](/docs/deploy-docker) — более простой вариант

Это руководство описывает развёртывание Llamenos в кластере Kubernetes с помощью официального Helm-чарта. Чарт управляет приложением и опциональными сервисами MinIO/Whisper как отдельными развёртываниями. Базу данных PostgreSQL предоставляете вы.

## Предварительные требования

- Кластер Kubernetes (v1.24+) — управляемый (EKS, GKE, AKS) или самостоятельный
- Экземпляр PostgreSQL 14+ (рекомендуется управляемый RDS/Cloud SQL или самостоятельный хостинг)
- [Helm](https://helm.sh/) v3.10+
- [kubectl](https://kubernetes.io/docs/tasks/tools/), настроенный для вашего кластера
- Ingress-контроллер (NGINX Ingress, Traefik и др.)
- cert-manager (опционально, для автоматических TLS-сертификатов)
- [Bun](https://bun.sh/), установленный локально (для генерации ключевой пары администратора)

## 1. Генерация ключевой пары администратора

```bash
git clone https://github.com/your-org/llamenos.git
cd llamenos
bun install
bun run bootstrap-admin
```

Сохраните **nsec** в безопасном месте. Скопируйте **шестнадцатеричный открытый ключ** для значений Helm.

## 2. Установка чарта

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

Или создайте файл `values-production.yaml` для воспроизводимых развёртываний:

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

Затем установите:

```bash
helm install llamenos deploy/helm/llamenos/ -f values-production.yaml
```

## 3. Проверка развёртывания

```bash
# Проверка работы подов
kubectl get pods -l app.kubernetes.io/instance=llamenos

# Проверка здоровья приложения
kubectl port-forward svc/llamenos 3000:3000
curl http://localhost:3000/api/health
# → {"status":"ok"}
```

## 4. Настройка DNS

Направьте ваш домен на внешний IP или балансировщик нагрузки ingress-контроллера:

```bash
kubectl get ingress llamenos
```

## 5. Первый вход и настройка

Откройте `https://hotline.yourdomain.com` в браузере. Войдите с nsec администратора и завершите мастер настройки.

## Справочник по конфигурации чарта

### Приложение

| Параметр | Описание | По умолчанию |
|----------|---------|--------------|
| `app.image.repository` | Образ контейнера | `ghcr.io/your-org/llamenos` |
| `app.image.tag` | Тег образа | Chart appVersion |
| `app.port` | Порт приложения | `3000` |
| `app.replicas` | Количество реплик подов | `2` |
| `app.resources` | Запросы и лимиты CPU/памяти | `{}` |
| `app.env` | Дополнительные переменные окружения | `{}` |

### PostgreSQL

| Параметр | Описание | По умолчанию |
|----------|---------|--------------|
| `postgres.host` | Имя хоста PostgreSQL (обязательно) | `""` |
| `postgres.port` | Порт PostgreSQL | `5432` |
| `postgres.database` | Имя базы данных | `llamenos` |
| `postgres.user` | Пользователь базы данных | `llamenos` |
| `postgres.poolSize` | Размер пула соединений | `10` |

### Секреты

| Параметр | Описание | По умолчанию |
|----------|---------|--------------|
| `secrets.adminPubkey` | Шестнадцатеричный открытый ключ Nostr администратора | `""` |
| `secrets.postgresPassword` | Пароль PostgreSQL (обязательно) | `""` |
| `secrets.twilioAccountSid` | Twilio Account SID | `""` |
| `secrets.twilioAuthToken` | Twilio Auth Token | `""` |
| `secrets.twilioPhoneNumber` | Номер телефона Twilio (E.164) | `""` |
| `secrets.existingSecret` | Использовать существующий K8s Secret | `""` |

> **Совет**: Для продакшена используйте `secrets.existingSecret` для ссылки на Secret, управляемый External Secrets Operator, Sealed Secrets или Vault.

### MinIO

| Параметр | Описание | По умолчанию |
|----------|---------|--------------|
| `minio.enabled` | Развернуть MinIO | `true` |
| `minio.image.repository` | Образ MinIO | `minio/minio` |
| `minio.image.tag` | Тег MinIO | `RELEASE.2025-01-20T14-49-07Z` |
| `minio.persistence.size` | Том данных MinIO | `50Gi` |
| `minio.persistence.storageClass` | Класс хранения | `""` |
| `minio.credentials.accessKey` | Корневой пользователь MinIO | `""` (обязательно) |
| `minio.credentials.secretKey` | Корневой пароль MinIO | `""` (обязательно) |
| `minio.resources` | Запросы и лимиты CPU/памяти | `{}` |

### Транскрипция Whisper

| Параметр | Описание | По умолчанию |
|----------|---------|--------------|
| `whisper.enabled` | Развернуть Whisper | `false` |
| `whisper.image.repository` | Образ Whisper | `fedirz/faster-whisper-server` |
| `whisper.image.tag` | Тег Whisper | `0.4.1` |
| `whisper.model` | Имя модели Whisper | `Systran/faster-whisper-base` |
| `whisper.device` | Устройство: `cpu` или `cuda` | `cpu` |
| `whisper.resources` | Запросы и лимиты CPU/памяти | `{}` |

### Ingress

| Параметр | Описание | По умолчанию |
|----------|---------|--------------|
| `ingress.enabled` | Создать ресурс Ingress | `true` |
| `ingress.className` | Класс Ingress | `nginx` |
| `ingress.annotations` | Аннотации Ingress | `{}` |
| `ingress.hosts` | Правила хостов | См. values.yaml |
| `ingress.tls` | Конфигурация TLS | `[]` |

### Сервисный аккаунт

| Параметр | Описание | По умолчанию |
|----------|---------|--------------|
| `serviceAccount.create` | Создать ServiceAccount | `true` |
| `serviceAccount.annotations` | Аннотации SA (напр., IRSA) | `{}` |
| `serviceAccount.name` | Переопределение имени SA | `""` |

## Использование внешних секретов

Для продакшена не помещайте секреты непосредственно в значения Helm. Вместо этого создайте Secret отдельно и укажите ссылку:

```yaml
# values-production.yaml
secrets:
  existingSecret: llamenos-secrets
```

Создайте Secret предпочтительным инструментом:

```bash
# Вручную
kubectl create secret generic llamenos-secrets \
  --from-literal=admin-pubkey=your_key \
  --from-literal=postgres-password=your_password \
  --from-literal=minio-access-key=your_key \
  --from-literal=minio-secret-key=your_key

# Или с помощью External Secrets Operator, Sealed Secrets, Vault и др.
```

## Использование внешнего MinIO или S3

Если у вас уже есть MinIO или S3-совместимый сервис, отключите встроенный MinIO и передайте endpoint:

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

## GPU-транскрипция

Для GPU-ускоренной транскрипции Whisper на NVIDIA GPU:

```yaml
whisper:
  enabled: true
  device: "cuda"
  model: "Systran/faster-whisper-large-v3"
  resources:
    limits:
      nvidia.com/gpu: 1
```

Убедитесь, что в кластере установлен [NVIDIA device plugin](https://github.com/NVIDIA/k8s-device-plugin).

## Масштабирование

Развёртывание использует стратегию `RollingUpdate` для обновлений без простоя. Масштабируйте реплики в зависимости от трафика:

```bash
kubectl scale deployment llamenos --replicas=3
```

Или установите `app.replicas` в файле значений. PostgreSQL advisory locks обеспечивают согласованность данных между репликами.

Для автоматического глобального масштабирования без управления инфраструктурой рассмотрите [развёртывание на Cloudflare Workers](/docs/getting-started).

## Мониторинг

### Проверки здоровья

Чарт настраивает liveness, readiness и startup пробы для `/api/health`:

```yaml
# Встроено в шаблон развёртывания
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

### Логи

```bash
kubectl logs -l app.kubernetes.io/instance=llamenos -c app -f
```

## Обновление

```bash
helm upgrade llamenos deploy/helm/llamenos/ -f values-production.yaml
```

Стратегия `RollingUpdate` обеспечивает обновления без простоя.

## Удаление

```bash
helm uninstall llamenos
```

> **Примечание**: PersistentVolumeClaims не удаляются при `helm uninstall`. Удалите их вручную, если хотите удалить все данные:
> ```bash
> kubectl delete pvc -l app.kubernetes.io/instance=llamenos
> ```

## Устранение неполадок

### Под застрял в CrashLoopBackOff

```bash
kubectl logs llamenos-0 -c app --previous
kubectl describe pod llamenos-0
```

Частые причины: отсутствующие секреты, неверный ADMIN_PUBKEY, недоступный PostgreSQL, неготовый MinIO.

### Ошибки подключения к базе данных

Проверьте доступность PostgreSQL из кластера:

```bash
kubectl run pg-test --rm -it --image=postgres:17-alpine -- psql postgresql://llamenos:PASSWORD@PG_HOST:5432/llamenos -c "SELECT 1"
```

### Ingress не работает

Проверьте, что ingress-контроллер запущен и ресурс Ingress имеет адрес:

```bash
kubectl get ingress llamenos
kubectl describe ingress llamenos
```

## Следующие шаги

- [Руководство администратора](/docs/admin-guide) — настройка горячей линии
- [Обзор самостоятельного хостинга](/docs/self-hosting) — сравнение вариантов развёртывания
- [Развёртывание с Docker Compose](/docs/deploy-docker) — более простая альтернатива
