---
title: "Налаштування: Asterisk (самостійне розгортання)"
description: Покроковий посібник із розгортання Asterisk із sip-bridge для Llamenos.
---

Asterisk — це платформа телефонії з відкритим кодом, яку ви розгортаєте на власній інфраструктурі. Це дає вам максимальний контроль над вашими даними та усуває погодинні хмарні платежі. Llamenos підключається до Asterisk через службу `sip-bridge`, використовуючи Asterisk REST Interface (ARI).

> **Примітка:** Служба `asterisk-bridge` більше не існує. Її замінено на `sip-bridge`, який підтримує Asterisk ARI, FreeSWITCH ESL і Kamailio через змінну середовища `PBX_TYPE`. Встановіть `PBX_TYPE=asterisk` для Asterisk.

Це найскладніший варіант налаштування, рекомендований для організацій із технічним персоналом, який може керувати серверною інфраструктурою.

## Передумови

- Сервер Linux (рекомендовано Ubuntu 22.04+ або Debian 12+) із публічною IP-адресою
- SIP-транк-провайдер для підключення до PSTN (наприклад, Telnyx, Flowroute, VoIP.ms)
- Ваш екземпляр Llamenos розгорнуто та доступний за публічною URL-адресою
- Базові знання адміністрування серверів Linux

## 1. Встановіть Asterisk

### Варіант А: Менеджер пакетів (простіше)

```bash
sudo apt update
sudo apt install asterisk
```

### Варіант Б: Docker (рекомендується для простішого керування)

```bash
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

## 2. Налаштуйте SIP-транк

Відредагуйте `/etc/asterisk/pjsip.conf`, щоб додати вашого SIP-транк-провайдера:

```ini
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

## 3. Увімкніть ARI

Відредагуйте `/etc/asterisk/ari.conf`:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

Відредагуйте `/etc/asterisk/http.conf`:

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

## 4. Налаштуйте план набору

Відредагуйте `/etc/asterisk/extensions.conf`:

```ini
[from-trunk]
exten => _X.,1,NoOp(Incoming call from ${CALLERID(num)})
 same => n,Stasis(llamenos,incoming)
 same => n,Hangup()
```

## 5. Розгорніть службу sip-bridge

Служба `sip-bridge` перекладає між вебхуками Llamenos та подіями ARI. Вона включена до репозиторію Llamenos і розгортається через Docker Compose за допомогою прапорця `--profile telephony`.

Додайте до вашого `.env`:

```env
PBX_TYPE=asterisk
ARI_PASSWORD=your-strong-ari-password
BRIDGE_SECRET=your-hex-bridge-secret   # openssl rand -hex 32
```

Запустіть із профілем телефонії:

```bash
docker compose -f deploy/docker/docker-compose.yml \
  -f deploy/docker/docker-compose.production.yml \
  --profile telephony up -d
```

Або запустіть автономно:

```bash
cd sip-bridge
PBX_TYPE=asterisk \
ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
ASTERISK_ARI_USERNAME=llamenos \
ARI_PASSWORD=your-strong-ari-password \
LLAMENOS_CALLBACK_URL=https://your-domain.com/api/telephony \
BRIDGE_SECRET=your-hex-bridge-secret \
bun run start
```

## 6. Налаштуйте в Llamenos

1. Увійдіть як адміністратор
2. Перейдіть до **Settings** → **Telephony Provider**
3. Оберіть **Asterisk (Self-Hosted)**
4. Введіть:
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: ваш пароль ARI
   - **Bridge Secret**: ваш секретний ключ мосту
   - **Phone Number**: номер вашого SIP-транку (формат E.164)
5. Натисніть **Save**

## 7. Перевірте налаштування

```bash
# Переконайтеся, що ARI працює
curl -u llamenos:password https://your-server:8089/ari/asterisk/info

# Перезапустіть Asterisk
sudo systemctl restart asterisk
```

Потім подзвоніть на номер гарячої лінії з телефону та перевірте журнали sip-bridge.

## Міркування щодо безпеки

### TLS і SRTP

```ini
; У pjsip.conf
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

Увімкніть SRTP на кінцевих точках:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### Мережна ізоляція

- Використовуйте брандмауер: лише ваш SIP-транк-провайдер повинен мати доступ до портів SIP (5060–5061) і RTP (10000–20000/udp)
- Обмежте доступ до ARI (8088–8089/tcp) лише для сервера sip-bridge
- Використовуйте fail2ban для захисту від SIP-сканування

## Вирішення проблем

- **ARI connection refused**: Переконайтеся, що `http.conf` має `enabled=yes`
- **Немає аудіо**: Перевірте, чи відкриті порти RTP (10000–20000/udp), і чи налаштований NAT
- **Помилки реєстрації SIP**: Перевірте облікові дані SIP-транку та DNS
- **sip-bridge не підключається**: Перевірте, чи встановлено `PBX_TYPE=asterisk`, і чи збігаються ARI_PASSWORD та BRIDGE_SECRET у мосту та налаштуваннях адміністратора Llamenos
