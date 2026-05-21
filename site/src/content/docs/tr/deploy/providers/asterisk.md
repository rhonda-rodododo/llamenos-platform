---
title: "Kurulum: Asterisk (Kendi Sunucunuzda)"
description: Llamenos için sip-bridge ile Asterisk'i dağıtmak için adım adım kılavuz.
---

Asterisk, kendi altyapınızda barındırdığınız açık kaynaklı bir telefon platformudur. Bu, verileriniz üzerinde maksimum kontrol sağlar ve dakika başına bulut ücretlerini ortadan kaldırır. Llamenos, Asterisk REST Arayüzü (ARI) kullanarak `sip-bridge` hizmeti aracılığıyla Asterisk'e bağlanır.

> **Not:** `asterisk-bridge` hizmeti artık mevcut değildir. Asterisk ARI, FreeSWITCH ESL ve Kamailio'yu `PBX_TYPE` ortam değişkeni aracılığıyla destekleyen `sip-bridge` ile değiştirilmiştir. Asterisk için `PBX_TYPE=asterisk` olarak ayarlayın.

Bu, en karmaşık kurulum seçeneğidir ve sunucu altyapısını yönetebilecek teknik personeli olan kuruluşlar için önerilir.

## Ön koşullar

- Herkese açık bir IP adresi olan bir Linux sunucusu (Ubuntu 22.04+ veya Debian 12+ önerilir)
- PSTN bağlantısı için bir SIP trunk sağlayıcısı (örn. Telnyx, Flowroute, VoIP.ms)
- Herkese açık bir URL üzerinden dağıtılmış ve erişilebilir Llamenos örneğiniz
- Temel Linux sunucu yönetimi bilgisi

## 1. Asterisk'i yükleyin

### Seçenek A: Paket yöneticisi (daha basit)

```bash
sudo apt update
sudo apt install asterisk
```

### Seçenek B: Docker (daha kolay yönetim için önerilir)

```bash
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

## 2. SIP trunk'ı yapılandırın

SIP trunk sağlayıcınızı eklemek için `/etc/asterisk/pjsip.conf` dosyasını düzenleyin:

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

## 3. ARI'yi etkinleştirin

`/etc/asterisk/ari.conf` dosyasını düzenleyin:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

`/etc/asterisk/http.conf` dosyasını düzenleyin:

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

## 4. Arama planını yapılandırın

`/etc/asterisk/extensions.conf` dosyasını düzenleyin:

```ini
[from-trunk]
exten => _X.,1,NoOp(Gelen çağrı ${CALLERID(num)} numarasından)
 same => n,Stasis(llamenos,incoming)
 same => n,Hangup()
```

## 5. sip-bridge hizmetini dağıtın

`sip-bridge` hizmeti, Llamenos webhook'ları ile ARI olayları arasında çeviri yapar. Llamenos deposuna dahildir ve `--profile telephony` bayrağı kullanılarak Docker Compose aracılığıyla dağıtılır.

`.env` dosyanıza ekleyin:

```env
PBX_TYPE=asterisk
ARI_PASSWORD=your-strong-ari-password
BRIDGE_SECRET=your-hex-bridge-secret   # openssl rand -hex 32
```

Telefon profiliyle başlatın:

```bash
docker compose -f deploy/docker/docker-compose.yml \
  -f deploy/docker/docker-compose.production.yml \
  --profile telephony up -d
```

Veya bağımsız olarak çalıştırın:

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

## 6. Llamenos'ta yapılandırın

1. Yönetici olarak oturum açın
2. **Ayarlar** → **Telefon Sağlayıcısı** bölümüne gidin
3. **Asterisk (Kendi Sunucunuzda)** seçeneğini seçin
4. Şunları girin:
   - **ARI URL'si**: `https://your-asterisk-server:8089/ari`
   - **ARI Kullanıcı Adı**: `llamenos`
   - **ARI Parolası**: ARI parolanız
   - **Köprü Gizli Anahtarı**: köprü gizli anahtarınız
   - **Telefon Numarası**: SIP trunk numaranız (E.164 formatında)
5. **Kaydet**'e tıklayın

## 7. Kurulumu test edin

```bash
# ARI'nin çalıştığını doğrulayın
curl -u llamenos:password https://your-server:8089/ari/asterisk/info

# Asterisk'i yeniden başlatın
sudo systemctl restart asterisk
```

Ardından bir telefondan yardım hattı numaranızı arayın ve sip-bridge günlüklerini kontrol edin.

## Güvenlik değerlendirmeleri

### TLS ve SRTP

```ini
; pjsip.conf içinde
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

Uç noktalarda SRTP'yi etkinleştirin:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### Ağ izolasyonu

- Bir güvenlik duvarı kullanın: yalnızca SIP trunk sağlayıcınız SIP (5060-5061) ve RTP (10000-20000/udp) bağlantı noktalarına ulaşabilmelidir
- ARI'yi (8088-8089/tcp) yalnızca sip-bridge sunucusuna kısıtlayın
- SIP tarama saldırılarına karşı korunmak için fail2ban kullanın

## Sorun giderme

- **ARI bağlantısı reddedildi**: `http.conf` dosyasının `enabled=yes` içerdiğini doğrulayın
- **Ses yok**: RTP bağlantı noktalarının (10000-20000/udp) açık olduğunu ve NAT'in yapılandırıldığını kontrol edin
- **SIP kayıt hataları**: SIP trunk kimlik bilgilerini ve DNS'i doğrulayın
- **sip-bridge bağlanmıyor**: `PBX_TYPE=asterisk` ayarlandığını ve ARI_PASSWORD ile BRIDGE_SECRET'in hem köprüde hem de Llamenos yönetici ayarlarında eşleştiğini kontrol edin
