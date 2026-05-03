---
title: Архитектура
description: Обзор системной архитектуры — репозитории, поток данных, уровни шифрования и коммуникация в реальном времени.
---

На этой странице описана структура Llamenos, потоки данных в системе и места применения шифрования.

## Структура репозитория

Llamenos разделён на три репозитория, которые используют общий протокол и криптографическое ядро:

```
llamenos              llamenos-core           llamenos-platform
(Desktop + API)       (Shared Crypto)         (Mobile App)
+--------------+      +--------------+        +--------------+
| Tauri v2     |      | Rust crate   |        | React Native |
| Vite + React |      | - Native lib |        | iOS + Android|
| CF Workers   |      | - WASM pkg   |        | UniFFI bind  |
| Durable Objs |      | - UniFFI     |        |              |
+--------------+      +--------------+        +--------------+
       |                  ^      ^                   |
       |  path dep        |      |    UniFFI         |
       +------------------+      +-------------------+
```

- **llamenos** — Настольное приложение (Tauri v2 с Vite + React webview), бэкенд на Cloudflare Worker и самостоятельно размещённый бэкенд на Node.js. Это основной репозиторий.
- **llamenos-core** — Общий Rust-крейт, реализующий все криптографические операции: ECIES-шифрование конвертов, подписи Schnorr, получение ключей PBKDF2, HKDF и XChaCha20-Poly1305. Компилируется в нативный код (для Tauri), WASM (для браузера) и привязки UniFFI (для мобильных устройств).
- **llamenos-platform** — Мобильное приложение React Native для iOS и Android. Использует привязки UniFFI для вызова того же криптографического кода на Rust.

Все три платформы реализуют одинаковый протокол передачи данных, определённый в `docs/protocol/PROTOCOL.md`.

## Поток данных

### Входящий звонок

```
Caller (phone)
    |
    v
Telephony Provider (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | HTTP webhook
    v
Worker API  -->  CallRouterDO
    |                |
    |                | Checks ShiftManagerDO for on-shift volunteers
    |                | Initiates parallel ring to all available volunteers
    |                v
    |           Telephony Provider (outbound calls to volunteer phones)
    |
    | First volunteer answers
    v
CallRouterDO  -->  Connects caller and volunteer
    |
    | Call ends
    v
Client (volunteer's browser/app)
    |
    | Encrypts note with per-note key
    | Wraps key via ECIES for self + each admin
    v
Worker API  -->  RecordsDO  (stores encrypted note + wrapped keys)
```

### Входящее сообщение (SMS / WhatsApp / Signal)

```
Contact (SMS / WhatsApp / Signal)
    |
    | Provider webhook
    v
Worker API  -->  ConversationDO
    |                |
    |                | Encrypts message content immediately
    |                | Wraps symmetric key via ECIES for assigned volunteer + admins
    |                | Discards plaintext
    |                v
    |           Nostr relay (encrypted hub event notifies online clients)
    |
    v
Client (volunteer's browser/app)
    |
    | Decrypts message with own private key
    | Composes reply, encrypts outbound
    v
Worker API  -->  ConversationDO  -->  Messaging Provider (sends reply)
```

## Постоянные объекты (Durable Objects)

Бэкенд использует шесть Cloudflare Durable Objects (или их эквиваленты PostgreSQL для самостоятельно размещённых инсталляций):

| Постоянный объект | Ответственность |
|---|---|
| **IdentityDO** | Управляет идентификаторами волонтёров, публичными ключами, именами для отображения и учётными данными WebAuthn. Обрабатывает создание и активацию приглашений. |
| **SettingsDO** | Хранит конфигурацию горячей линии: название, включённые каналы, учётные данные поставщика, пользовательские поля заметок, настройки защиты от спама, флаги функций. |
| **RecordsDO** | Хранит зашифрованные заметки звонков, зашифрованные отчёты и метаданные файловых вложений. Обрабатывает поиск по заметкам (по зашифрованным метаданным). |
| **ShiftManagerDO** | Управляет повторяющимися расписаниями смен, группами звонков, назначениями смен для волонтёров. Определяет, кто находится на смене в данный момент. |
| **CallRouterDO** | Организует маршрутизацию звонков в реальном времени: параллельный звонок, завершение при первом ответе, статус перерыва, отслеживание активных звонков. Генерирует ответы TwiML/провайдера. |
| **ConversationDO** | Управляет многопоточными переговорами по SMS, WhatsApp и Signal. Обрабатывает шифрование сообщений при поступлении, назначение переговоров и исходящие ответы. |

Все постоянные объекты доступны как одиночки через `idFromName()` и маршрутизируются внутри с помощью лёгкого `DORouter` (сопоставление метода и шаблона пути).

## Матрица шифрования

| Данные | Зашифрованы? | Алгоритм | Кто может расшифровать |
|---|---|---|---|
| Заметки звонков | Да (E2EE) | XChaCha20-Poly1305 + ECIES-конверт | Автор заметки + все администраторы |
| Пользовательские поля заметок | Да (E2EE) | Как и заметки | Автор заметки + все администраторы |
| Отчёты | Да (E2EE) | Как и заметки | Автор отчёта + все администраторы |
| Вложения отчётов | Да (E2EE) | XChaCha20-Poly1305 (потоковое) | Автор отчёта + все администраторы |
| Содержимое сообщений | Да (E2EE) | XChaCha20-Poly1305 + ECIES-конверт | Назначенный волонтёр + все администраторы |
| Транскрипты | Да (в покое) | XChaCha20-Poly1305 | Создатель транскрипта + все администраторы |
| Хаб-события (Nostr) | Да (симметричное) | XChaCha20-Poly1305 с хаб-ключом | Все текущие члены хаба |
| nsec волонтёра | Да (в покое) | PBKDF2 + XChaCha20-Poly1305 (PIN) | Только волонтёр |
| Записи журнала аудита | Нет (защищено целостностью) | Цепочка хешей SHA-256 | Администраторы (чтение), система (запись) |
| Номера телефонов звонящих | Нет (только на стороне сервера) | Нет | Сервер + администраторы |
| Номера телефонов волонтёров | Хранятся в IdentityDO | Нет | Только администраторы |

### Прямая секретность для каждой заметки

Каждая заметка или сообщение получает уникальный случайный симметричный ключ. Этот ключ оборачивается через ECIES (эфемерный ключ secp256k1 + HKDF + XChaCha20-Poly1305) отдельно для каждого авторизованного читателя. Компрометация ключа одной заметки не раскрывает информацию о других заметках. Долгоживущих симметричных ключей для шифрования содержимого нет.

### Иерархия ключей

```
Volunteer nsec (BIP-340 Schnorr / secp256k1)
    |
    +-- Derives npub (x-only public key, 32 bytes)
    |
    +-- Used for ECIES key agreement (prepend 02 for compressed form)
    |
    +-- Signs Nostr events (Schnorr signature)

Hub key (random 32 bytes, NOT derived from any identity)
    |
    +-- Encrypts real-time Nostr hub events
    |
    +-- ECIES-wrapped per member via LABEL_HUB_KEY_WRAP
    |
    +-- Rotated on member departure

Per-note key (random 32 bytes)
    |
    +-- Encrypts note content via XChaCha20-Poly1305
    |
    +-- ECIES-wrapped per reader (volunteer + each admin)
    |
    +-- Never reused across notes
```

## Коммуникация в реальном времени

Обновления в реальном времени (новые звонки, сообщения, изменения смен, присутствие) проходят через Nostr-релей:

- **Самостоятельный хостинг**: релей strfry, работающий рядом с приложением в Docker/Kubernetes
- **Cloudflare**: Nosflare (релей на базе Cloudflare Workers)

Все события эфемерны (kind 20001) и зашифрованы хаб-ключом. События используют общие теги (`["t", "llamenos:event"]`), поэтому релей не может различить типы событий. Поле содержимого содержит шифртекст XChaCha20-Poly1305.

### Поток событий

```
Client A (volunteer action)
    |
    | Encrypt event content with hub key
    | Sign as Nostr event (Schnorr)
    v
Nostr relay (strfry / Nosflare)
    |
    | Broadcast to subscribers
    v
Client B, C, D...
    |
    | Verify Schnorr signature
    | Decrypt content with hub key
    v
Update local UI state
```

Релей видит зашифрованные блобы и действительные подписи, но не может читать содержимое событий или определять выполняемые действия.

## Уровни безопасности

### Транспортный уровень

- Всё взаимодействие клиент-сервер через HTTPS (TLS 1.3)
- Подключения WebSocket к Nostr-релею через WSS
- Политика безопасности содержимого (CSP) ограничивает источники скриптов, соединения и предков фреймов
- Шаблон изоляции Tauri отделяет IPC от webview

### Уровень приложения

- Аутентификация через пары ключей Nostr (подписи BIP-340 Schnorr)
- Токены сессии WebAuthn для удобства на нескольких устройствах
- Управление доступом на основе ролей (звонящий, волонтёр, репортёр, администратор)
- Все 25 констант разделения криптографических доменов, определённые в `crypto-labels.ts`, предотвращают межпротокольные атаки

### Шифрование в покое

- Заметки звонков, отчёты, сообщения и транскрипты шифруются перед хранением
- Секретные ключи волонтёров шифруются с ключами, производными от PIN (PBKDF2)
- Tauri Stronghold обеспечивает зашифрованное хранилище на настольном компьютере
- Целостность журнала аудита защищена цепочкой хешей SHA-256

### Верификация сборки

- Воспроизводимые сборки через `Dockerfile.build` с `SOURCE_DATE_EPOCH`
- Имена файлов фронтенда с хешем содержимого
- `CHECKSUMS.txt` публикуется вместе с релизами GitHub
- Аттестации происхождения SLSA
- Скрипт верификации: `scripts/verify-build.sh`

## Различия между платформами

| Функция | Настольный (Tauri) | Мобильный (React Native) | Браузер (Cloudflare) |
|---|---|---|---|
| Бэкенд криптографии | Нативный Rust (через IPC) | Нативный Rust (через UniFFI) | WASM (llamenos-core) |
| Хранилище ключей | Tauri Stronghold (зашифрованное) | Secure Enclave / Keystore | localStorage браузера (зашифрованное PIN) |
| Транскрипция | Клиентский Whisper (WASM) | Недоступно | Клиентский Whisper (WASM) |
| Автообновление | Tauri updater | App Store / Play Store | Автоматически (CF Workers) |
| Push-уведомления | ОС-нативные (уведомление Tauri) | ОС-нативные (FCM/APNS) | Уведомления браузера |
| Офлайн-поддержка | Ограниченно (нужен API) | Ограниченно (нужен API) | Ограниченно (нужен API) |

На этой странице описана структура Llamenos, потоки данных в системе и места применения шифрования.

## Структура репозитория

Llamenos разделён на три репозитория, которые используют общий протокол и криптографическое ядро:

```
llamenos              llamenos-core           llamenos-platform
(Desktop + API)       (Shared Crypto)         (Mobile App)
+--------------+      +--------------+        +--------------+
| Tauri v2     |      | Rust crate   |        | React Native |
| Vite + React |      | - Native lib |        | iOS + Android|
| CF Workers   |      | - WASM pkg   |        | UniFFI bind  |
| Durable Objs |      | - UniFFI     |        |              |
+--------------+      +--------------+        +--------------+
       |                  ^      ^                   |
       |  path dep        |      |    UniFFI         |
       +------------------+      +-------------------+
```

- **llamenos** — Настольное приложение (Tauri v2 с Vite + React webview), бэкенд на Cloudflare Worker и самостоятельно размещённый бэкенд на Node.js. Это основной репозиторий.
- **llamenos-core** — Общий Rust-крейт, реализующий все криптографические операции: ECIES-шифрование конвертов, подписи Schnorr, получение ключей PBKDF2, HKDF и XChaCha20-Poly1305. Компилируется в нативный код (для Tauri), WASM (для браузера) и привязки UniFFI (для мобильных устройств).
- **llamenos-platform** — Мобильное приложение React Native для iOS и Android. Использует привязки UniFFI для вызова того же криптографического кода на Rust.

Все три платформы реализуют одинаковый протокол передачи данных, определённый в `docs/protocol/PROTOCOL.md`.

## Поток данных

### Входящий звонок

```
Caller (phone)
    |
    v
Telephony Provider (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | HTTP webhook
    v
Worker API  -->  CallRouterDO
    |                |
    |                | Checks ShiftManagerDO for on-shift volunteers
    |                | Initiates parallel ring to all available volunteers
    |                v
    |           Telephony Provider (outbound calls to volunteer phones)
    |
    | First volunteer answers
    v
CallRouterDO  -->  Connects caller and volunteer
    |
    | Call ends
    v
Client (volunteer's browser/app)
    |
    | Encrypts note with per-note key
    | Wraps key via ECIES for self + each admin
    v
Worker API  -->  RecordsDO  (stores encrypted note + wrapped keys)
```

### Входящее сообщение (SMS / WhatsApp / Signal)

```
Contact (SMS / WhatsApp / Signal)
    |
    | Provider webhook
    v
Worker API  -->  ConversationDO
    |                |
    |                | Encrypts message content immediately
    |                | Wraps symmetric key via ECIES for assigned volunteer + admins
    |                | Discards plaintext
    |                v
    |           Nostr relay (encrypted hub event notifies online clients)
    |
    v
Client (volunteer's browser/app)
    |
    | Decrypts message with own private key
    | Composes reply, encrypts outbound
    v
Worker API  -->  ConversationDO  -->  Messaging Provider (sends reply)
```

## Постоянные объекты (Durable Objects)

Бэкенд использует шесть Cloudflare Durable Objects (или их эквиваленты PostgreSQL для самостоятельно размещённых инсталляций):

| Постоянный объект | Ответственность |
|---|---|
| **IdentityDO** | Управляет идентификаторами волонтёров, публичными ключами, именами для отображения и учётными данными WebAuthn. Обрабатывает создание и активацию приглашений. |
| **SettingsDO** | Хранит конфигурацию горячей линии: название, включённые каналы, учётные данные поставщика, пользовательские поля заметок, настройки защиты от спама, флаги функций. |
| **RecordsDO** | Хранит зашифрованные заметки звонков, зашифрованные отчёты и метаданные файловых вложений. Обрабатывает поиск по заметкам (по зашифрованным метаданным). |
| **ShiftManagerDO** | Управляет повторяющимися расписаниями смен, группами звонков, назначениями смен для волонтёров. Определяет, кто находится на смене в данный момент. |
| **CallRouterDO** | Организует маршрутизацию звонков в реальном времени: параллельный звонок, завершение при первом ответе, статус перерыва, отслеживание активных звонков. Генерирует ответы TwiML/провайдера. |
| **ConversationDO** | Управляет многопоточными переговорами по SMS, WhatsApp и Signal. Обрабатывает шифрование сообщений при поступлении, назначение переговоров и исходящие ответы. |

Все постоянные объекты доступны как одиночки (singleton) через `idFromName()` и маршрутизируются внутри с помощью лёгкого `DORouter` (сопоставление метода и шаблона пути).

## Матрица шифрования

| Данные | Зашифрованы? | Алгоритм | Кто может расшифровать |
|---|---|---|---|
| Заметки звонков | Да (E2EE) | XChaCha20-Poly1305 + ECIES-конверт | Автор заметки + все администраторы |
| Пользовательские поля заметок | Да (E2EE) | Как и заметки | Автор заметки + все администраторы |
| Отчёты | Да (E2EE) | Как и заметки | Автор отчёта + все администраторы |
| Вложения отчётов | Да (E2EE) | XChaCha20-Poly1305 (потоковое) | Автор отчёта + все администраторы |
| Содержимое сообщений | Да (E2EE) | XChaCha20-Poly1305 + ECIES-конверт | Назначенный волонтёр + все администраторы |
| Транскрипты | Да (в покое) | XChaCha20-Poly1305 | Создатель транскрипта + все администраторы |
| Хаб-события (Nostr) | Да (симметричное) | XChaCha20-Poly1305 с хаб-ключом | Все текущие члены хаба |
| nsec волонтёра | Да (в покое) | PBKDF2 + XChaCha20-Poly1305 (PIN) | Только волонтёр |
| Записи журнала аудита | Нет (защищено целостностью) | Цепочка хешей SHA-256 | Администраторы (чтение), система (запись) |
| Номера телефонов звонящих | Нет (только на стороне сервера) | Нет | Сервер + администраторы |
| Номера телефонов волонтёров | Хранятся в IdentityDO | Нет | Только администраторы |

### Прямая секретность для каждой заметки

Каждая заметка или сообщение получает уникальный случайный симметричный ключ. Этот ключ оборачивается через ECIES (эфемерный ключ secp256k1 + HKDF + XChaCha20-Poly1305) отдельно для каждого авторизованного читателя. Компрометация ключа одной заметки не раскрывает информацию о других заметках. Долгоживущих симметричных ключей для шифрования содержимого нет.

### Иерархия ключей

```
Volunteer nsec (BIP-340 Schnorr / secp256k1)
    |
    +-- Derives npub (x-only public key, 32 bytes)
    |
    +-- Used for ECIES key agreement (prepend 02 for compressed form)
    |
    +-- Signs Nostr events (Schnorr signature)

Hub key (random 32 bytes, NOT derived from any identity)
    |
    +-- Encrypts real-time Nostr hub events
    |
    +-- ECIES-wrapped per member via LABEL_HUB_KEY_WRAP
    |
    +-- Rotated on member departure

Per-note key (random 32 bytes)
    |
    +-- Encrypts note content via XChaCha20-Poly1305
    |
    +-- ECIES-wrapped per reader (volunteer + each admin)
    |
    +-- Never reused across notes
```

## Коммуникация в реальном времени

Обновления в реальном времени (новые звонки, сообщения, изменения смен, присутствие) проходят через Nostr-релей:

- **Самостоятельный хостинг**: релей strfry, работающий рядом с приложением в Docker/Kubernetes
- **Cloudflare**: Nosflare (релей на базе Cloudflare Workers)

Все события эфемерны (kind 20001) и зашифрованы хаб-ключом. События используют общие теги (`["t", "llamenos:event"]`), поэтому релей не может различить типы событий. Поле содержимого содержит шифртекст XChaCha20-Poly1305.

### Поток событий

```
Client A (volunteer action)
    |
    | Encrypt event content with hub key
    | Sign as Nostr event (Schnorr)
    v
Nostr relay (strfry / Nosflare)
    |
    | Broadcast to subscribers
    v
Client B, C, D...
    |
    | Verify Schnorr signature
    | Decrypt content with hub key
    v
Update local UI state
```

Релей видит зашифрованные блобы и действительные подписи, но не может читать содержимое событий или определять выполняемые действия.

## Уровни безопасности

### Транспортный уровень

- Всё взаимодействие клиент-сервер через HTTPS (TLS 1.3)
- Подключения WebSocket к Nostr-релею через WSS
- Политика безопасности содержимого (CSP) ограничивает источники скриптов, соединения и предков фреймов
- Шаблон изоляции Tauri отделяет IPC от webview

### Уровень приложения

- Аутентификация через пары ключей Nostr (подписи BIP-340 Schnorr)
- Токены сессии WebAuthn для удобства на нескольких устройствах
- Управление доступом на основе ролей (звонящий, волонтёр, репортёр, администратор)
- Все 25 констант разделения криптографических доменов, определённые в `crypto-labels.ts`, предотвращают межпротокольные атаки

### Шифрование в покое

- Заметки звонков, отчёты, сообщения и транскрипты шифруются перед хранением
- Секретные ключи волонтёров шифруются с ключами, производными от PIN (PBKDF2)
- Tauri Stronghold обеспечивает зашифрованное хранилище на настольном компьютере
- Целостность журнала аудита защищена цепочкой хешей SHA-256

### Верификация сборки

- Воспроизводимые сборки через `Dockerfile.build` с `SOURCE_DATE_EPOCH`
- Имена файлов фронтенда с хешем содержимого
- `CHECKSUMS.txt` публикуется вместе с релизами GitHub
- Аттестации происхождения SLSA
- Скрипт верификации: `scripts/verify-build.sh`

## Различия между платформами

| Функция | Настольный (Tauri) | Мобильный (React Native) | Браузер (Cloudflare) |
|---|---|---|---|
| Бэкенд криптографии | Нативный Rust (через IPC) | Нативный Rust (через UniFFI) | WASM (llamenos-core) |
| Хранилище ключей | Tauri Stronghold (зашифрованное) | Secure Enclave / Keystore | localStorage браузера (зашифрованное PIN) |
| Транскрипция | Клиентский Whisper (WASM) | Недоступно | Клиентский Whisper (WASM) |
| Автообновление | Tauri updater | App Store / Play Store | Автоматически (CF Workers) |
| Push-уведомления | ОС-нативные (уведомление Tauri) | ОС-нативные (FCM/APNS) | Уведомления браузера |
| Офлайн-поддержка | Ограниченно (нужен API) | Ограниченно (нужен API) | Ограниченно (нужен API) |
