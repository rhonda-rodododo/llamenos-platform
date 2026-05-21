---
title: "راه‌اندازی: Asterisk (میزبانی شخصی)"
description: راهنمای گام‌به‌گام برای استقرار Asterisk با sip-bridge برای Llámenos.
---

Asterisk یک پلتفرم تلفنی متن‌باز است که روی زیرساخت خودتان میزبانی می‌کنید. این به شما حداکثر کنترل بر داده‌هایتان را می‌دهد و هزینه‌های ابری دقیقه‌ای را حذف می‌کند. Llámenos از طریق سرویس `sip-bridge` با استفاده از رابط REST Asterisk (ARI) به Asterisk متصل می‌شود.

> **نکته:** سرویس `asterisk-bridge` دیگر وجود ندارد. با `sip-bridge` جایگزین شده است که از ARI Asterisk، ESL FreeSWITCH و Kamailio از طریق متغیر محیطی `PBX_TYPE` پشتیبانی می‌کند. برای Asterisk، `PBX_TYPE=asterisk` را تنظیم کنید.

این پیچیده‌ترین گزینه راه‌اندازی است و برای سازمان‌هایی که کارکنان فنی برای مدیریت زیرساخت سرور دارند توصیه می‌شود.

## پیش‌نیازها

- یک سرور لینوکس (Ubuntu 22.04+ یا Debian 12+ توصیه می‌شود) با آدرس IP عمومی
- یک ارائه‌دهنده SIP trunk برای اتصال PSTN (مثلاً Telnyx، Flowroute، VoIP.ms)
- نمونه Llámenos شما مستقر شده و از طریق یک آدرس عمومی قابل دسترسی است
- آشنایی اولیه با مدیریت سرور لینوکس

## ۱. نصب Asterisk

### گزینه الف: مدیر بسته (ساده‌تر)

```bash
sudo apt update
sudo apt install asterisk
```

### گزینه ب: Docker (توصیه می‌شود برای مدیریت آسان‌تر)

```bash
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

## ۲. پیکربندی SIP trunk

`/etc/asterisk/pjsip.conf` را ویرایش کنید تا ارائه‌دهنده SIP trunk خود را اضافه کنید:

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

## ۳. فعال‌سازی ARI

`/etc/asterisk/ari.conf` را ویرایش کنید:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

`/etc/asterisk/http.conf` را ویرایش کنید:

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

## ۴. پیکربندی dialplan

`/etc/asterisk/extensions.conf` را ویرایش کنید:

```ini
[from-trunk]
exten => _X.,1,NoOp(Incoming call from ${CALLERID(num)})
 same => n,Stasis(llamenos,incoming)
 same => n,Hangup()
```

## ۵. استقرار سرویس sip-bridge

سرویس `sip-bridge` بین webhookهای Llámenos و رویدادهای ARI ترجمه می‌کند. این سرویس در مخزن Llámenos گنجانده شده و از طریق Docker Compose با استفاده از پرچم `--profile telephony` مستقر می‌شود.

به `.env` خود اضافه کنید:

```env
PBX_TYPE=asterisk
ARI_PASSWORD=your-strong-ari-password
BRIDGE_SECRET=your-hex-bridge-secret   # openssl rand -hex 32
```

با پروفایل تلفنی شروع کنید:

```bash
docker compose -f deploy/docker/docker-compose.yml \
  -f deploy/docker/docker-compose.production.yml \
  --profile telephony up -d
```

یا به صورت مستقل اجرا کنید:

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

## ۶. پیکربندی در Llámenos

۱. به عنوان مدیر وارد شوید
۲. به **تنظیمات** > **ارائه‌دهنده تلفنی** بروید
۳. **Asterisk (میزبانی شخصی)** را انتخاب کنید
۴. وارد کنید:
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: رمز عبور ARI شما
   - **Bridge Secret**: راز پل شما
   - **شماره تلفن**: شماره SIP trunk شما (قالب E.164)
۵. روی **ذخیره** کلیک کنید

## ۷. تست راه‌اندازی

```bash
# بررسی کنید ARI در حال اجراست
curl -u llamenos:password https://your-server:8089/ari/asterisk/info

# راه‌اندازی مجدد Asterisk
sudo systemctl restart asterisk
```

سپس از یک تلفن با شماره خط تلفن خود تماس بگیرید و لاگ‌های sip-bridge را بررسی کنید.

## ملاحظات امنیتی

### TLS و SRTP

```ini
; در pjsip.conf
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

SRTP را روی endpointها فعال کنید:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### جداسازی شبکه

- از فایروال استفاده کنید: فقط ارائه‌دهنده SIP trunk شما باید به پورت‌های SIP (5060-5061) و RTP (10000-20000/udp) دسترسی داشته باشد
- ARI (8088-8089/tcp) را فقط به سرور sip-bridge محدود کنید
- از fail2ban برای محافظت در برابر حملات اسکن SIP استفاده کنید

## عیب‌یابی

- **اتصال ARI رد شد**: بررسی کنید `http.conf` دارای `enabled=yes` باشد
- **بدون صدا**: بررسی کنید پورت‌های RTP (10000-20000/udp) باز هستند و NAT پیکربندی شده است
- **شکست‌های ثبت SIP**: اعتبارنامه SIP trunk و DNS را تأیید کنید
- **sip-bridge متصل نمی‌شود**: بررسی کنید `PBX_TYPE=asterisk` تنظیم شده باشد و ARI_PASSWORD و BRIDGE_SECRET در هر دو پل و تنظیمات مدیر Llámenos مطابقت داشته باشند
