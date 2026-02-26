---
title: التوثيق
description: تعلّم كيفية نشر Llamenos وتكوينه واستخدامه.
guidesHeading: الأدلة
guides:
  - title: البدء
    description: المتطلبات الأساسية، التثبيت، إعداد الاتصالات الهاتفية، وأول عملية نشر.
    href: /docs/getting-started
  - title: دليل المسؤول
    description: إدارة المتطوعين، المناوبات، قوائم الحظر، الحقول المخصصة، والإعدادات.
    href: /docs/admin-guide
  - title: دليل المتطوع
    description: تسجيل الدخول، استقبال المكالمات، كتابة الملاحظات، واستخدام النسخ التلقائي.
    href: /docs/volunteer-guide
  - title: مزودو خدمات الاتصالات
    description: مقارنة مزودي خدمات الاتصالات المدعومين واختيار الأنسب لخط الطوارئ الخاص بك.
    href: /docs/telephony-providers
  - title: "الإعداد: Twilio"
    description: دليل خطوة بخطوة لتكوين Twilio كمزود خدمة الاتصالات.
    href: /docs/setup-twilio
  - title: "الإعداد: SignalWire"
    description: دليل خطوة بخطوة لتكوين SignalWire كمزود خدمة الاتصالات.
    href: /docs/setup-signalwire
  - title: "الإعداد: Vonage"
    description: دليل خطوة بخطوة لتكوين Vonage كمزود خدمة الاتصالات.
    href: /docs/setup-vonage
  - title: "الإعداد: Plivo"
    description: دليل خطوة بخطوة لتكوين Plivo كمزود خدمة الاتصالات.
    href: /docs/setup-plivo
  - title: "الإعداد: Asterisk (مستضاف ذاتياً)"
    description: نشر Asterisk مع جسر ARI للحصول على أقصى درجات الخصوصية والتحكم.
    href: /docs/setup-asterisk
  - title: الاتصال عبر المتصفح باستخدام WebRTC
    description: تمكين المتطوعين من الرد على المكالمات مباشرة من المتصفح باستخدام WebRTC.
    href: /docs/webrtc-calling
  - title: نموذج الأمان
    description: فهم ما هو مشفر وما ليس كذلك، ونموذج التهديدات.
    href: /security
---

## نظرة عامة على البنية

Llamenos هو تطبيق صفحة واحدة (SPA) مدعوم بـ Cloudflare Workers و Durable Objects. لا توجد خوادم تقليدية تحتاج إلى إدارتها.

| المكوّن | التقنية |
|---|---|
| الواجهة الأمامية | Vite + React + TanStack Router |
| الواجهة الخلفية | Cloudflare Workers + Durable Objects |
| الاتصالات الهاتفية | Twilio أو SignalWire أو Vonage أو Plivo أو Asterisk (عبر واجهة TelephonyAdapter) |
| المصادقة | مفاتيح Nostr (BIP-340 Schnorr) + WebAuthn |
| التشفير | ECIES (secp256k1 + XChaCha20-Poly1305) |
| النسخ التلقائي | Whisper من جانب العميل (WASM) |
| تعدد اللغات | i18next (أكثر من 12 لغة) |

## الأدوار

| الدور | ما يمكنه رؤيته | ما يمكنه فعله |
|---|---|---|
| **المتصل** | لا شيء (هاتف GSM) | الاتصال برقم خط الطوارئ |
| **المتطوع** | ملاحظاته فقط | الرد على المكالمات، كتابة الملاحظات أثناء المناوبة |
| **المسؤول** | جميع الملاحظات، سجلات التدقيق، بيانات المكالمات | إدارة المتطوعين، المناوبات، الحظر، الإعدادات |
