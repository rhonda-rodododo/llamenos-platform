---
title: "الإعداد: Asterisk (مستضاف ذاتياً)"
description: دليل خطوة بخطوة لنشر Asterisk مع جسر ARI لـ Llamenos.
---

Asterisk هو منصة اتصالات مفتوحة المصدر تستضيفها على بنيتك التحتية الخاصة. يمنحك هذا أقصى تحكم في بياناتك ويلغي رسوم السحابة بالدقيقة. يتصل Llamenos بـ Asterisk عبر واجهة Asterisk REST (ARI).

هذا هو خيار الإعداد الأكثر تعقيداً ويُوصى به للمؤسسات التي لديها طاقم تقني يمكنه إدارة البنية التحتية للخادم.

## المتطلبات الأساسية

- خادم Linux (يُوصى بـ Ubuntu 22.04+ أو Debian 12+) مع عنوان IP عام
- مزود خط SIP للاتصال بشبكة PSTN (مثل Telnyx أو Flowroute أو VoIP.ms)
- نسخة Llamenos منشورة ومتاحة عبر عنوان URL عام
- معرفة أساسية بإدارة خوادم Linux

## 1. تثبيت Asterisk

### الخيار أ: مدير الحزم (أبسط)

```bash
sudo apt update
sudo apt install asterisk
```

### الخيار ب: Docker (يُوصى به لسهولة الإدارة)

```bash
docker pull asterisk/asterisk:20
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

### الخيار ج: البناء من المصدر (للوحدات المخصصة)

```bash
wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz
tar xzf asterisk-20-current.tar.gz
cd asterisk-20.*/
./configure
make
sudo make install
sudo make samples
```

## 2. تكوين خط SIP

عدّل `/etc/asterisk/pjsip.conf` لإضافة مزود خط SIP الخاص بك. إليك مثال على التكوين:

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

## 3. تفعيل ARI

ARI (واجهة Asterisk REST) هي الطريقة التي يتحكم بها Llamenos في المكالمات على Asterisk.

عدّل `/etc/asterisk/ari.conf`:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

عدّل `/etc/asterisk/http.conf` لتفعيل خادم HTTP:

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

## 4. تكوين خطة الاتصال

عدّل `/etc/asterisk/extensions.conf` لتوجيه المكالمات الواردة إلى تطبيق ARI:

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

## 5. نشر خدمة جسر ARI

جسر ARI هو خدمة صغيرة تترجم بين webhooks Llamenos وأحداث ARI. يعمل بجانب Asterisk ويتصل بكل من WebSocket لـ ARI وWorker Llamenos الخاص بك.

```bash
# خدمة الجسر مضمنة في مستودع Llamenos
cd llamenos
bun run build:ari-bridge

# تشغيله
ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
ASTERISK_ARI_USERNAME=llamenos \
ASTERISK_ARI_PASSWORD=your-strong-ari-password \
LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
bun run ari-bridge
```

أو باستخدام Docker:

```bash
docker run -d \
  --name llamenos-ari-bridge \
  -e ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
  -e ASTERISK_ARI_USERNAME=llamenos \
  -e ASTERISK_ARI_PASSWORD=your-strong-ari-password \
  -e LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
  llamenos/ari-bridge
```

## 6. التكوين في Llamenos

1. سجّل الدخول كمسؤول
2. انتقل إلى **الإعدادات** > **مزود خدمة الاتصالات**
3. اختر **Asterisk (مستضاف ذاتياً)** من القائمة المنسدلة
4. أدخل:
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: كلمة مرور ARI الخاصة بك
   - **Bridge Callback URL**: عنوان URL الذي يستقبل فيه جسر ARI webhooks من Llamenos (مثال: `https://bridge.your-domain.com/webhook`)
   - **Phone Number**: رقم هاتف خط SIP الخاص بك (بصيغة E.164)
5. انقر على **حفظ**

## 7. اختبار الإعداد

1. أعد تشغيل Asterisk: `sudo systemctl restart asterisk`
2. تحقق أن ARI يعمل: `curl -u llamenos:password https://your-server:8089/ari/asterisk/info`
3. اتصل برقم خط الطوارئ من هاتف
4. تحقق من سجلات جسر ARI للاتصال وأحداث المكالمات

## اعتبارات أمنية

تشغيل خادم Asterisk الخاص بك يمنحك تحكماً كاملاً، ولكن أيضاً مسؤولية كاملة عن الأمان:

### TLS و SRTP

قم دائماً بتفعيل TLS لإشارات SIP و SRTP لتشفير الوسائط:

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

تفعيل SRTP على نقاط النهاية:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### عزل الشبكة

- ضع Asterisk في منطقة DMZ أو شريحة شبكة معزولة
- استخدم جدار حماية لتقييد الوصول:
  - SIP (5060-5061/tcp/udp): فقط من مزود خط SIP الخاص بك
  - RTP (10000-20000/udp): فقط من مزود خط SIP الخاص بك
  - ARI (8088-8089/tcp): فقط من خادم جسر ARI
  - SSH (22/tcp): فقط من عناوين IP المسؤول
- استخدم fail2ban للحماية من هجمات مسح SIP

### التحديثات المنتظمة

حافظ على تحديث Asterisk لسد الثغرات الأمنية:

```bash
sudo apt update && sudo apt upgrade asterisk
```

## WebRTC مع Asterisk

يدعم Asterisk ميزة WebRTC عبر نقل WebSocket المدمج و SIP.js في المتصفح. يتطلب هذا تكويناً إضافياً:

1. تفعيل نقل WebSocket في `http.conf`
2. إنشاء نقاط نهاية PJSIP لعملاء WebRTC
3. تكوين DTLS-SRTP لتشفير الوسائط
4. استخدام SIP.js على جانب العميل (يتم تكوينه تلقائياً بواسطة Llamenos عند اختيار Asterisk)

إعداد WebRTC مع Asterisk أكثر تعقيداً من المزودين السحابيين. راجع دليل [الاتصال عبر المتصفح WebRTC](/docs/deploy/providers/webrtc) للتفاصيل.

## استكشاف الأخطاء وإصلاحها

- **رفض اتصال ARI**: تحقق أن `http.conf` يحتوي على `enabled=yes` وأن عنوان الربط صحيح.
- **لا يوجد صوت**: تحقق أن منافذ RTP (10000-20000/udp) مفتوحة في جدار الحماية وأن NAT مكوّن بشكل صحيح.
- **فشل تسجيل SIP**: تحقق من بيانات اعتماد خط SIP وأن DNS يحل خادم SIP لمزودك.
- **الجسر لا يتصل**: تحقق أن جسر ARI يمكنه الوصول إلى نقطة نهاية ARI لـ Asterisk وعنوان URL لـ Worker Llamenos.
- **مشاكل جودة المكالمة**: تأكد أن خادمك لديه عرض نطاق كافٍ وزمن استجابة منخفض لمزود خط SIP. فكّر في الترميزات (opus لـ WebRTC، وulaw/alaw لـ PSTN).
