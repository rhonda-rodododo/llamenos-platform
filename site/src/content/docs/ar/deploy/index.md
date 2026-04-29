---
title: البدء
description: انشر خط الطوارئ الخاص بك باستخدام Llamenos في أقل من ساعة.
---

انشر خط الطوارئ الخاص بك باستخدام Llamenos في أقل من ساعة. ستحتاج إلى حساب Cloudflare، وحساب لدى مزود خدمة الاتصالات الهاتفية، وجهاز مثبت عليه Bun.

## المتطلبات الأساسية

- [Bun](https://bun.sh) الإصدار 1.0 أو أحدث (بيئة التشغيل ومدير الحزم)
- حساب [Cloudflare](https://www.cloudflare.com) (الخطة المجانية تكفي للتطوير)
- حساب لدى مزود خدمة اتصالات هاتفية — [Twilio](https://www.twilio.com) هو الأسهل للبدء، لكن Llamenos يدعم أيضاً [SignalWire](/docs/deploy/providers/signalwire) و[Vonage](/docs/deploy/providers/vonage) و[Plivo](/docs/deploy/providers/plivo) و[Asterisk المستضاف ذاتياً](/docs/deploy/providers/asterisk). راجع [مقارنة مزودي خدمات الاتصالات](/docs/deploy/providers) للمساعدة في الاختيار.
- Git

## 1. استنساخ المشروع والتثبيت

```bash
git clone https://github.com/rhonda-rodododo/llamenos.git
cd llamenos
bun install
```

## 2. إنشاء مفتاح المسؤول

أنشئ زوج مفاتيح Nostr لحساب المسؤول. ينتج هذا الأمر مفتاحاً سرياً (nsec) ومفتاحاً عاماً (npub/hex).

```bash
bun run bootstrap-admin
```

احفظ `nsec` بشكل آمن — هذا هو بيانات اعتماد تسجيل دخول المسؤول. ستحتاج إلى المفتاح العام بصيغة hex للخطوة التالية.

## 3. تكوين المتغيرات السرية

أنشئ ملف `.dev.vars` في جذر المشروع للتطوير المحلي. يستخدم هذا المثال Twilio — إذا كنت تستخدم مزوداً مختلفاً، يمكنك تخطي متغيرات Twilio وتكوين مزودك من خلال واجهة المسؤول بعد أول تسجيل دخول.

```bash
# .dev.vars
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
ADMIN_PUBKEY=your_hex_public_key_from_step_2
ENVIRONMENT=development
```

للإنتاج، قم بتعيين هذه كمتغيرات سرية في Wrangler:

```bash
bunx wrangler secret put ADMIN_PUBKEY
# إذا كنت تستخدم Twilio كمزود افتراضي عبر متغيرات البيئة:
bunx wrangler secret put TWILIO_ACCOUNT_SID
bunx wrangler secret put TWILIO_AUTH_TOKEN
bunx wrangler secret put TWILIO_PHONE_NUMBER
```

> **ملاحظة**: يمكنك أيضاً تكوين مزود خدمة الاتصالات بالكامل من خلال واجهة إعدادات المسؤول بدلاً من استخدام متغيرات البيئة. هذا مطلوب للمزودين غير Twilio. راجع [دليل الإعداد لمزودك](/docs/deploy/providers).

## 4. تكوين webhooks الاتصالات الهاتفية

قم بتكوين مزود خدمة الاتصالات لإرسال webhooks الصوتية إلى Worker الخاص بك. عناوين URL لـ webhook هي نفسها بغض النظر عن المزود:

- **عنوان URL للمكالمات الواردة**: `https://your-worker.your-domain.com/telephony/incoming` (POST)
- **عنوان URL لإشعار الحالة**: `https://your-worker.your-domain.com/telephony/status` (POST)

لتعليمات إعداد webhook الخاصة بكل مزود، راجع: [Twilio](/docs/deploy/providers/twilio)، [SignalWire](/docs/deploy/providers/signalwire)، [Vonage](/docs/deploy/providers/vonage)، [Plivo](/docs/deploy/providers/plivo)، أو [Asterisk](/docs/deploy/providers/asterisk).

للتطوير المحلي، ستحتاج إلى نفق (مثل Cloudflare Tunnel أو ngrok) لكشف Worker المحلي لمزود خدمة الاتصالات.

## 5. التشغيل محلياً

ابدأ خادم Worker للتطوير (الواجهة الخلفية + الأمامية):

```bash
# بناء أصول الواجهة الأمامية أولاً
bun run build

# بدء خادم Worker للتطوير
bun run dev:worker
```

سيكون التطبيق متاحاً على `http://localhost:8787`. سجّل الدخول باستخدام nsec المسؤول من الخطوة 2.

## 6. النشر على Cloudflare

```bash
bun run deploy
```

يقوم هذا ببناء الواجهة الأمامية ونشر Worker مع Durable Objects على Cloudflare. بعد النشر، حدّث عناوين URL لـ webhook لدى مزود الاتصالات للإشارة إلى عنوان URL الخاص بـ Worker في الإنتاج.

## الخطوات التالية

- [دليل المسؤول](/docs/admin-guide) — إضافة متطوعين، إنشاء مناوبات، تكوين الإعدادات
- [دليل المتطوع](/docs/volunteer-guide) — شاركه مع متطوعيك
- [مزودو خدمات الاتصالات](/docs/deploy/providers) — مقارنة المزودين والتبديل من Twilio إذا لزم الأمر
- [نموذج الأمان](/security) — فهم التشفير ونموذج التهديدات
