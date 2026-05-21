---
title: Документація
description: Дізнайтеся, як розгортати, налаштовувати та використовувати Llamenos.
guidesHeading: Посібники
guides:
  - title: Початок роботи
    description: Передумови, встановлення, майстер налаштування та перше розгортання.
    href: /docs/getting-started
  - title: Архітектура
    description: Огляд архітектури системи — репозиторії, потік даних, рівні шифрування та зв'язок у реальному часі.
    href: /docs/architecture
  - title: Огляд самостійного хостингу
    description: Розгорніть на власній інфраструктурі за допомогою Docker Compose або Kubernetes.
    href: /docs/self-hosting
  - title: "Розгортання: Docker Compose"
    description: Самостійне розгортання на одному сервері з автоматичним HTTPS.
    href: /docs/deploy-docker
  - title: "Розгортання: Kubernetes (Helm)"
    description: Розгорніть у Kubernetes за допомогою офіційного Helm-чарту.
    href: /docs/deploy-kubernetes
  - title: Посібник адміністратора
    description: Керуйте волонтерами, змінами, каналами, списками блокувань, звітами та налаштуваннями.
    href: /docs/admin-guide
  - title: Посібник волонтера
    description: Увійдіть, приймайте дзвінки, відповідайте на повідомлення, пишіть нотатки та використовуйте транскрипцію.
    href: /docs/volunteer-guide
  - title: Посібник репортера
    description: Надсилайте зашифровані звіти та відстежуйте їхній статус.
    href: /docs/reporter-guide
  - title: Посібник з мобільного додатка
    description: Встановіть та налаштуйте мобільний додаток Llamenos на iOS та Android.
    href: /docs/mobile-guide
  - title: Телефонні провайдери
    description: Порівняйте підтримуваних телефонних провайдерів та оберіть найкращого для вашої гарячої лінії.
    href: /docs/telephony-providers
  - title: "Налаштування: SMS"
    description: Увімкніть вхідні/вихідні SMS-повідомлення через вашого телефонного провайдера.
    href: /docs/setup-sms
  - title: "Налаштування: WhatsApp"
    description: Під'єднайте WhatsApp Business через Meta Cloud API.
    href: /docs/setup-whatsapp
  - title: "Налаштування: Signal"
    description: Налаштуйте канал Signal через міст signal-cli.
    href: /docs/setup-signal
  - title: "Налаштування: Twilio"
    description: Покрокова інструкція з налаштування Twilio як вашого телефонного провайдера.
    href: /docs/setup-twilio
  - title: "Налаштування: SignalWire"
    description: Покрокова інструкція з налаштування SignalWire як вашого телефонного провайдера.
    href: /docs/setup-signalwire
  - title: "Налаштування: Vonage"
    description: Покрокова інструкція з налаштування Vonage як вашого телефонного провайдера.
    href: /docs/setup-vonage
  - title: "Налаштування: Plivo"
    description: Покрокова інструкція з налаштування Plivo як вашого телефонного провайдера.
    href: /docs/setup-plivo
  - title: "Налаштування: Asterisk (самостійний хостинг)"
    description: Розгорніть Asterisk з ARI-мостом для максимальної конфіденційності та контролю.
    href: /docs/setup-asterisk
  - title: Веб-дзвінки через WebRTC
    description: Увімкніть відповіді на дзвінки в браузері для волонтерів за допомогою WebRTC.
    href: /docs/webrtc-calling
  - title: Усунення несправностей
    description: Вирішення поширених проблем із розгортанням, десктопом, мобільним додатком, телефонією та криптографією.
    href: /docs/troubleshooting
  - title: Модель безпеки
    description: Дізнайтеся, що зашифровано, що ні, та яка модель загроз.
    href: /security
---

## Огляд архітектури

Llamenos — це односторінковий додаток (SPA), який може працювати на **Cloudflare Workers** або на вашій власній інфраструктурі через **Docker Compose / Kubernetes**. Він підтримує голосові дзвінки, SMS, WhatsApp та Signal — усі вони маршрутизуються до чергових волонтерів через єдиний інтерфейс.

| Компонент | Cloudflare | Самостійний хостинг |
|---|---|---|
| Фронтенд | Vite + React + TanStack Router | Те саме |
| Бекенд | Cloudflare Workers + 6 Durable Objects | Node.js + PostgreSQL |
| Сховище blob | R2 | RustFS (S3-сумісне) |
| Голосовий зв'язок | Twilio, SignalWire, Vonage, Plivo або Asterisk | Те саме |
| Обмін повідомленнями | SMS, WhatsApp Business, Signal | Те саме |
| Аутентифікація | WebSocket ключові пари (BIP-340 Schnorr) + WebAuthn | Те саме |
| Шифрування | ECIES (secp256k1 + XChaCha20-Poly1305) | Те саме |
| Транскрипція | Клієнтська Whisper (WASM) | Клієнтська Whisper (WASM) |
| i18n | i18next (13 мов) | Те саме |

## Ролі

| Роль | Може бачити | Може робити |
|---|---|---|
| **Абонент** | Нічого (телефон/SMS/WhatsApp/Signal) | Телефонувати або писати на гарячу лінію |
| **Волонтер** | Власні нотатки, призначені розмови | Відповідати на дзвінки, писати нотатки, відповідати на повідомлення |
| **Репортер** | Лише власні звіти | Надсилати зашифровані звіти з файлами |
| **Адміністратор** | Усі нотатки, звіти, розмови, журнали аудиту | Керувати волонтерами, змінами, каналами, блокуваннями, налаштуваннями |
