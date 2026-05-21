---
title: "Розгортання: Docker Compose"
description: Розгорніть Llamenos на власному сервері за допомогою Docker Compose.
---

Цей посібник проведе вас через розгортання Llamenos за допомогою Docker Compose на одному сервері. Ви отримаєте повнофункціональну гарячу лінію з автоматичним HTTPS, базою даних PostgreSQL, об'єктним сховищем, релеєм WebSocket та опціональною транскрипцією — усе керується через Docker Compose.

## Передумови

- Сервер Linux (Ubuntu 22.04+, Debian 12+ або аналогічний)
- [Docker Engine](https://docs.docker.com/engine/install/) v24+ з Docker Compose v2
- `openssl` (попередньо встановлено на більшості систем)
- Доменне ім'я з DNS, вказаним на IP вашого сервера

## Швидкий старт (локальний)

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
./scripts/docker-setup.sh
```

Відвідайте **http://localhost:8000** та дотримуйтесь інструкцій майстра налаштування.

## Продуктивне розгортання

```bash
./scripts/docker-setup.sh --domain hotline.yourorg.com --email admin@yourorg.com
```

Скрипт налаштування:
1. Генерує надійні випадкові секрети (пароль бази даних, HMAC-ключ, облікові дані сховища, секрет релея WebSocket)
2. Записує їх у `deploy/docker/.env`
3. Збирає та запускає всі служби з використанням продуктивного накладання
4. Очікує, поки додаток стане працездатним

Продуктивне накладання (`docker-compose.production.yml`) додає:
- **Завершення TLS** через Let's Encrypt (Caddy)
- **Ротацію журналів** для всіх служб (макс. 10 МБ, 5 файлів)
- **Обмеження ресурсів** (1 ГБ пам'яті для додатка)
- **Сувору CSP** — лише з'єднання `wss://` WebSocket

Відвідайте `https://hotline.yourorg.com` та дотримуйтесь інструкцій майстра налаштування.

### Ручне налаштування

```bash
cd deploy/docker
cp .env.example .env
```

Відредагуйте `.env` та заповніть необхідні секрети:

```bash
# Шістнадцяткові секрети (HMAC_SECRET, SERVER_SECRET):
openssl rand -hex 32

# Паролі (PG_PASSWORD, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY):
openssl rand -base64 24
```

```env
DOMAIN=hotline.yourorg.com
ACME_EMAIL=admin@yourorg.com
ADMIN_PUBKEY=ваш_hex_публічний_ключ   # з bun run bootstrap-admin
```

Запустіть з продуктивним накладанням:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

## Файли Docker Compose

| Файл | Призначення |
|------|-------------|
| `deploy/docker/docker-compose.yml` | Базова конфігурація — всі служби, мережі, томи |
| `deploy/docker/docker-compose.production.yml` | Продуктивне накладання — TLS Caddyfile, ротація журналів, обмеження ресурсів |
| `deploy/docker/docker-compose.dev.yml` | Накладання для розробки — відкриває порт додатка, відстеження файлів |
| `deploy/docker/docker-compose.ci.yml` | Накладання для CI — детерміноване тестове середовище |

**Локальна розробка** використовує накладання для розробки. **Продукція** використовує продуктивне накладання поверх базового.

## Основні служби

| Служба | Призначення | Порт |
|--------|-------------|------|
| **app** | Додаток Llamenos (Bun + Hono) | 3000 (внутрішній) |
| **postgres** | База даних PostgreSQL | 5432 (внутрішній) |
| **caddy** | Зворотний проксі + автоматичний TLS | 8000 (локальний), 80/443 (продуктивний) |
| **RustFS** | S3-сумісне файлове сховище | 9000 (внутрішній) |
| **WebSocket relay** | Релей WebSocket для подій у реальному часі | 7777 (внутрішній) |

## Додаткові профілі

Запустіть додаткові служби за допомогою `--profile`:

```bash
# Сайдкар Signal messaging
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile signal up -d

# SIP міст Asterisk/FreeSWITCH/Kamailio (PBX_TYPE вибирає бекенд)
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile telephony up -d

# Інференс Ollama/vLLM для вилучення повідомлень
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile inference up -d

# Моніторинг Prometheus + Grafana
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile monitoring up -d
```

## SIP міст

Служба `sip-bridge` з'єднує Llamenos із самостійно розміщеною АТС. Встановіть `PBX_TYPE` у `.env`, щоб вибрати бекенд:

```env
PBX_TYPE=asterisk      # Asterisk ARI
# PBX_TYPE=freeswitch  # FreeSWITCH ESL
# PBX_TYPE=kamailio    # Kamailio
```

Також потрібні: `ARI_PASSWORD` та `BRIDGE_SECRET`.

## Сайдкар Signal notifier

Служба `signal-notifier` працює на порту 3100. Вона знаходить контакти Signal через HMAC-хешовані ідентифікатори — ніколи не зберігає номери телефонів у відкритому вигляді. Налаштуйте:

```env
SIGNAL_NOTIFIER_BEARER_TOKEN=ваш_спільний_токен  # має збігатися в додатку та сайдкарі
```

## Перевірки справності

Додаток надає:
- `GET /health/ready` — готовий, коли БД підключено та міграції застосовано
- `GET /health/live` — перевірка живості

```bash
curl https://hotline.yourorg.com/health/ready
# {"status":"ok"}
```

## Перевірка розгортання

```bash
cd deploy/docker
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
docker compose -f docker-compose.yml -f docker-compose.production.yml logs app --tail 50
curl https://hotline.yourorg.com/health/ready
```

## Налаштування вебхуків

Вкажіть вебхуки вашого телефонного провайдера на ваш домен:

| Вебхук | URL |
|--------|-----|
| Голос (вхідний) | `https://hotline.yourorg.com/api/telephony/incoming` |
| Голос (статус) | `https://hotline.yourorg.com/api/telephony/status` |
| SMS | `https://hotline.yourorg.com/api/messaging/sms/webhook` |
| WhatsApp | `https://hotline.yourorg.com/api/messaging/whatsapp/webhook` |
| Signal | Перенаправити на `https://hotline.yourorg.com/api/messaging/signal/webhook` |

## Оновлення

```bash
cd deploy/docker
git -C ../.. pull
docker compose -f docker-compose.yml -f docker-compose.production.yml build
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

Дані зберігаються в томах Docker (`postgres-data`, `RustFS-data` тощо) під час перезапусків та перезбирань.

## Резервне копіювання

### PostgreSQL

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec postgres \
  pg_dump -U llamenos llamenos > backup-$(date +%Y%m%d).sql
```

Відновлення:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  psql -U llamenos llamenos < backup-20250101.sql
```

### Автоматизоване резервне копіювання (cron)

```bash
# /etc/cron.d/llamenos-backup
0 3 * * * root cd /opt/llamenos/deploy/docker && \
  docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  pg_dump -U llamenos llamenos | gzip > /backups/llamenos-$(date +\%Y\%m\%d).sql.gz
```

## Журнали

```bash
cd deploy/docker

# Всі служби
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f

# Конкретна служба
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f app

# Останні 100 рядків
docker compose -f docker-compose.yml -f docker-compose.production.yml logs --tail 100 app
```

## Усунення несправностей

### Додаток не запускається

```bash
docker compose logs app
docker compose config   # перевірити завантаження .env
docker compose ps       # перевірити справність служб
```

### Проблеми з сертифікатами

Caddy потребує відкритих портів 80 і 443 для викликів ACME:

```bash
docker compose logs caddy
curl -I http://hotline.yourorg.com
```

## Архітектура служб

![Архітектура Docker](/diagrams/docker-architecture.svg)

## Наступні кроки

- [Розгортання Kubernetes](/docs/en/deploy/kubernetes) — горизонтальне масштабування з Helm
- [Розгортання Co-op Cloud](/docs/en/deploy/coopcloud) — кооперативний хостинг
- [Телефонні провайдери](/docs/en/deploy/providers/) — налаштування голосових провайдерів
