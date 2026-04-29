---
title: "Настройка: Asterisk (самостоятельный хостинг)"
description: Пошаговое руководство по развёртыванию Asterisk с мостом ARI для Llamenos.
---

Asterisk — это платформа телефонии с открытым исходным кодом, которую вы размещаете на собственной инфраструктуре. Это даёт максимальный контроль над данными и устраняет поминутную плату за облачные сервисы. Llamenos подключается к Asterisk через Asterisk REST Interface (ARI).

Это самый сложный вариант настройки, рекомендуемый для организаций с техническим персоналом, способным управлять серверной инфраструктурой.

## Предварительные требования

- Сервер Linux (рекомендуется Ubuntu 22.04+ или Debian 12+) с публичным IP-адресом
- Провайдер SIP-транка для подключения к PSTN (например, Telnyx, Flowroute, VoIP.ms)
- Ваш экземпляр Llamenos развёрнут и доступен по публичному URL
- Базовые навыки администрирования Linux-серверов

## 1. Установите Asterisk

### Вариант A: Менеджер пакетов (проще)

```bash
sudo apt update
sudo apt install asterisk
```

### Вариант B: Docker (рекомендуется для удобства управления)

```bash
docker pull asterisk/asterisk:20
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

### Вариант C: Сборка из исходников (для пользовательских модулей)

```bash
wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz
tar xzf asterisk-20-current.tar.gz
cd asterisk-20.*/
./configure
make
sudo make install
sudo make samples
```

## 2. Настройте SIP-транк

Отредактируйте `/etc/asterisk/pjsip.conf`, чтобы добавить вашего провайдера SIP-транка. Вот пример конфигурации:

```ini
; SIP trunk to your PSTN provider
[trunk-provider]
type=registration
transport=transport-tls
outbound_auth=trunk-auth
server_uri=sip:sip.your-provider.com
client_uri=sip:your-account@sip.your-provider.com

[trunk-auth]
type=auth
auth_type=userpass
username=your-account
password=your-password

[trunk-endpoint]
type=endpoint
context=from-trunk
transport=transport-tls
disallow=all
allow=ulaw
allow=alaw
allow=opus
aors=trunk-aor
outbound_auth=trunk-auth

[trunk-aor]
type=aor
contact=sip:sip.your-provider.com
```

## 3. Включите ARI

ARI (Asterisk REST Interface) — это способ, которым Llamenos управляет звонками на Asterisk.

Отредактируйте `/etc/asterisk/ari.conf`:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

Отредактируйте `/etc/asterisk/http.conf` для включения HTTP-сервера:

```ini
[general]
enabled=yes
bindaddr=0.0.0.0
bindport=8088
tlsenable=yes
tlsbindaddr=0.0.0.0:8089
tlscertfile=/etc/asterisk/keys/asterisk.pem
tlsprivatekey=/etc/asterisk/keys/asterisk.key
```

## 4. Настройте диалплан

Отредактируйте `/etc/asterisk/extensions.conf` для маршрутизации входящих звонков в приложение ARI:

```ini
[from-trunk]
exten => _X.,1,NoOp(Incoming call from ${CALLERID(num)})
 same => n,Stasis(llamenos,incoming)
 same => n,Hangup()

[llamenos-outbound]
exten => _X.,1,NoOp(Outbound call to ${EXTEN})
 same => n,Stasis(llamenos,outbound)
 same => n,Hangup()
```

## 5. Разверните сервис моста ARI

Мост ARI — это небольшой сервис, который транслирует между вебхуками Llamenos и событиями ARI. Он работает рядом с Asterisk и подключается как к WebSocket ARI, так и к вашему Llamenos Worker.

```bash
# Сервис моста включён в репозиторий Llamenos
cd llamenos
bun run build:ari-bridge

# Запустите его
ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
ASTERISK_ARI_USERNAME=llamenos \
ASTERISK_ARI_PASSWORD=your-strong-ari-password \
LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
bun run ari-bridge
```

Или с Docker:

```bash
docker run -d \
  --name llamenos-ari-bridge \
  -e ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
  -e ASTERISK_ARI_USERNAME=llamenos \
  -e ASTERISK_ARI_PASSWORD=your-strong-ari-password \
  -e LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
  llamenos/ari-bridge
```

## 6. Настройте в Llamenos

1. Войдите как администратор
2. Перейдите в **Настройки** > **Провайдер телефонии**
3. Выберите **Asterisk (самостоятельный хостинг)** из выпадающего списка
4. Введите:
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: ваш пароль ARI
   - **Bridge Callback URL**: URL, по которому мост ARI получает вебхуки от Llamenos (например, `https://bridge.your-domain.com/webhook`)
   - **Phone Number**: номер телефона вашего SIP-транка (формат E.164)
5. Нажмите **Сохранить**

## 7. Проверьте настройку

1. Перезапустите Asterisk: `sudo systemctl restart asterisk`
2. Убедитесь, что ARI работает: `curl -u llamenos:password https://your-server:8089/ari/asterisk/info`
3. Позвоните на номер горячей линии с телефона
4. Проверьте логи моста ARI на наличие событий подключения и звонков

## Вопросы безопасности

Управление собственным сервером Asterisk даёт полный контроль, но и полную ответственность за безопасность:

### TLS и SRTP

Всегда включайте TLS для SIP-сигнализации и SRTP для шифрования медиа:

```ini
; In pjsip.conf transport section
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

Включите SRTP на конечных точках:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### Сетевая изоляция

- Разместите Asterisk в DMZ или изолированном сегменте сети
- Используйте файрвол для ограничения доступа:
  - SIP (5060-5061/tcp/udp): только от вашего провайдера SIP-транка
  - RTP (10000-20000/udp): только от вашего провайдера SIP-транка
  - ARI (8088-8089/tcp): только от сервера моста ARI
  - SSH (22/tcp): только от IP-адресов администраторов
- Используйте fail2ban для защиты от атак сканирования SIP

### Регулярные обновления

Поддерживайте Asterisk в актуальном состоянии для исправления уязвимостей безопасности:

```bash
sudo apt update && sudo apt upgrade asterisk
```

## WebRTC с Asterisk

Asterisk поддерживает WebRTC через встроенный WebSocket-транспорт и SIP.js в браузере. Это требует дополнительной настройки:

1. Включите WebSocket-транспорт в `http.conf`
2. Создайте конечные точки PJSIP для WebRTC-клиентов
3. Настройте DTLS-SRTP для шифрования медиа
4. Используйте SIP.js на стороне клиента (автоматически настраивается Llamenos при выборе Asterisk)

Настройка WebRTC с Asterisk сложнее, чем с облачными провайдерами. Подробности в руководстве [Звонки через браузер (WebRTC)](/docs/deploy/providers/webrtc).

## Устранение неполадок

- **Отказ подключения ARI**: Убедитесь, что в `http.conf` установлено `enabled=yes` и адрес привязки правильный.
- **Нет звука**: Проверьте, что порты RTP (10000-20000/udp) открыты в файрволе и NAT настроен правильно.
- **Ошибки регистрации SIP**: Проверьте учётные данные SIP-транка и убедитесь, что DNS разрешает SIP-сервер вашего провайдера.
- **Мост не подключается**: Убедитесь, что мост ARI может достичь как конечной точки ARI Asterisk, так и URL вашего Llamenos Worker.
- **Проблемы с качеством звонков**: Убедитесь, что у сервера достаточная пропускная способность и низкая задержка до провайдера SIP-транка. Рассмотрите кодеки (opus для WebRTC, ulaw/alaw для PSTN).
