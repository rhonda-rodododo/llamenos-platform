---
title: "الإعداد: WhatsApp"
description: ربط WhatsApp Business عبر Meta Cloud API للمراسلة المشفرة.
---

يدعم Llamenos رسائل WhatsApp Business عبر Meta Cloud API (Graph API v21.0). يتيح WhatsApp مراسلة غنية تدعم النصوص والصور والمستندات والصوت والرسائل التفاعلية.

## المتطلبات الأساسية

- [حساب Meta Business](https://business.facebook.com)
- رقم هاتف WhatsApp Business API
- تطبيق مطور Meta مع تفعيل منتج WhatsApp

## أوضاع التكامل

يدعم Llamenos وضعين لتكامل WhatsApp:

### Meta Direct (مُوصى به)

اتصل مباشرة بـ Meta Cloud API. يوفر تحكماً كاملاً وجميع الميزات.

**بيانات الاعتماد المطلوبة:**
- **Phone Number ID** — معرّف رقم هاتف WhatsApp Business الخاص بك
- **Business Account ID** — معرّف حساب Meta Business الخاص بك
- **Access Token** — رمز وصول Meta API طويل الأمد
- **Verify Token** — سلسلة مخصصة تختارها للتحقق من الـ webhook
- **App Secret** — سر تطبيق Meta الخاص بك (للتحقق من توقيع الـ webhook)

### وضع Twilio

إذا كنت تستخدم Twilio بالفعل للصوت، يمكنك توجيه WhatsApp عبر حساب Twilio الخاص بك. إعداد أبسط، لكن بعض الميزات قد تكون محدودة.

**بيانات الاعتماد المطلوبة:**
- Twilio Account SID و Auth Token الموجودين لديك، ومرسل WhatsApp متصل بـ Twilio

## 1. إنشاء تطبيق Meta

1. اذهب إلى [developers.facebook.com](https://developers.facebook.com)
2. أنشئ تطبيقاً جديداً (النوع: Business)
3. أضف منتج **WhatsApp**
4. في WhatsApp > Getting Started، دوّن **Phone Number ID** و **Business Account ID**
5. أنشئ رمز وصول دائم (Settings > Access Tokens)

## 2. تكوين الـ webhook

في لوحة تحكم مطور Meta:

1. اذهب إلى WhatsApp > Configuration > Webhook
2. عيّن Callback URL إلى:
   ```
   https://your-worker.your-domain.com/api/messaging/whatsapp/webhook
   ```
3. عيّن Verify Token إلى نفس السلسلة التي ستدخلها في إعدادات مسؤول Llamenos
4. اشترك في حقل webhook `messages`

سترسل Meta طلب GET للتحقق من الـ webhook. سيرد Worker الخاص بك بالتحدي إذا تطابق رمز التحقق.

## 3. تفعيل WhatsApp في إعدادات المسؤول

انتقل إلى **إعدادات المسؤول > قنوات المراسلة** (أو استخدم معالج الإعداد) وفعّل **WhatsApp**.

اختر وضع **Meta Direct** أو **Twilio** وأدخل بيانات الاعتماد المطلوبة.

كوّن الإعدادات الاختيارية:
- **رسالة الرد التلقائي** — تُرسل لجهات الاتصال لأول مرة
- **رد خارج ساعات العمل** — تُرسل خارج ساعات المناوبة

## 4. الاختبار

أرسل رسالة WhatsApp إلى رقم هاتف Business الخاص بك. يجب أن تظهر المحادثة في علامة تبويب **المحادثات**.

## نافذة المراسلة لمدة 24 ساعة

يفرض WhatsApp نافذة مراسلة مدتها 24 ساعة:
- يمكنك الرد على مستخدم خلال 24 ساعة من آخر رسالة له
- بعد 24 ساعة، يجب استخدام **رسالة قالب** معتمدة لإعادة بدء المحادثة
- يتعامل Llamenos مع هذا تلقائياً — إذا انتهت النافذة، يرسل رسالة قالب لإعادة تشغيل المحادثة

## دعم الوسائط

يدعم WhatsApp رسائل الوسائط الغنية:
- **الصور** (JPEG، PNG)
- **المستندات** (PDF، Word، إلخ)
- **الصوت** (MP3، OGG)
- **الفيديو** (MP4)
- مشاركة **الموقع**
- الأزرار ورسائل القوائم **التفاعلية**

تظهر مرفقات الوسائط مضمنة في عرض المحادثة.

## ملاحظات أمنية

- يستخدم WhatsApp تشفيراً من طرف إلى طرف بين المستخدم وبنية Meta التحتية
- يمكن لـ Meta تقنياً الوصول إلى محتوى الرسائل على خوادمهم
- تُخزن الرسائل في Llamenos بعد استلامها من الـ webhook
- يتم التحقق من توقيعات الـ webhook باستخدام HMAC-SHA256 مع سر تطبيقك
- لأقصى خصوصية، فكر في استخدام Signal بدلاً من WhatsApp
