---
title: Начало работы
description: Разверните свою горячую линию Llamenos менее чем за час.
---

Разверните свою горячую линию Llamenos менее чем за час. Вам понадобится учётная запись Cloudflare, учётная запись провайдера телефонии и машина с установленным Bun.

## Предварительные требования

- [Bun](https://bun.sh) v1.0 или новее (среда выполнения и менеджер пакетов)
- Учётная запись [Cloudflare](https://www.cloudflare.com) (бесплатный тариф подходит для разработки)
- Учётная запись провайдера телефонии — [Twilio](https://www.twilio.com) проще всего для начала, но Llamenos также поддерживает [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo) и [самостоятельно размещённый Asterisk](/docs/deploy/providers/asterisk). Для помощи в выборе смотрите [сравнение провайдеров телефонии](/docs/deploy/providers).
- Git

## 1. Клонирование и установка

```bash
git clone https://github.com/rhonda-rodododo/llamenos.git
cd llamenos
bun install
```

## 2. Создание ключевой пары администратора

Сгенерируйте ключевую пару Nostr для учётной записи администратора. Команда создаст секретный ключ (nsec) и публичный ключ (npub/hex).

```bash
bun run bootstrap-admin
```

Сохраните `nsec` в безопасном месте — это ваши учётные данные для входа администратора. Для следующего шага вам понадобится публичный ключ в формате hex.

## 3. Настройка секретов

Создайте файл `.dev.vars` в корне проекта для локальной разработки. В этом примере используется Twilio — если вы используете другого провайдера, можете пропустить переменные Twilio и настроить своего провайдера через интерфейс администратора после первого входа.

```bash
# .dev.vars
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
ADMIN_PUBKEY=your_hex_public_key_from_step_2
ENVIRONMENT=development
```

Для продакшена установите их как секреты Wrangler:

```bash
bunx wrangler secret put ADMIN_PUBKEY
# Если используете Twilio как провайдера по умолчанию через переменные окружения:
bunx wrangler secret put TWILIO_ACCOUNT_SID
bunx wrangler secret put TWILIO_AUTH_TOKEN
bunx wrangler secret put TWILIO_PHONE_NUMBER
```

> **Примечание**: Вы также можете полностью настроить провайдера телефонии через интерфейс настроек администратора вместо использования переменных окружения. Это обязательно для провайдеров, отличных от Twilio. Смотрите [руководство по настройке вашего провайдера](/docs/deploy/providers).

## 4. Настройка вебхуков телефонии

Настройте вашего провайдера телефонии для отправки голосовых вебхуков на ваш Worker. URL-адреса вебхуков одинаковы для всех провайдеров:

- **URL входящего вызова**: `https://your-worker.your-domain.com/telephony/incoming` (POST)
- **URL обратного вызова статуса**: `https://your-worker.your-domain.com/telephony/status` (POST)

Инструкции по настройке вебхуков для конкретных провайдеров смотрите в: [Twilio](/docs/deploy/providers/twilio), [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo) или [Asterisk](/docs/deploy/providers/asterisk).

Для локальной разработки вам понадобится туннель (например, Cloudflare Tunnel или ngrok), чтобы сделать ваш локальный Worker доступным для провайдера телефонии.

## 5. Локальный запуск

Запустите сервер разработки Worker (бэкенд + фронтенд):

```bash
# Сначала соберите фронтенд-ресурсы
bun run build

# Запустите сервер разработки Worker
bun run dev:worker
```

Приложение будет доступно по адресу `http://localhost:8787`. Войдите с помощью nsec администратора из шага 2.

## 6. Развёртывание на Cloudflare

```bash
bun run deploy
```

Эта команда собирает фронтенд и развёртывает Worker с Durable Objects на Cloudflare. После развёртывания обновите URL-адреса вебхуков у вашего провайдера телефонии, указав на URL рабочего Worker.

## Следующие шаги

- [Руководство администратора](/docs/admin-guide) — добавление волонтёров, создание смен, настройка параметров
- [Руководство волонтёра](/docs/volunteer-guide) — поделитесь с вашими волонтёрами
- [Провайдеры телефонии](/docs/deploy/providers) — сравнение провайдеров и переход с Twilio при необходимости
- [Модель безопасности](/security) — понимание шифрования и модели угроз
