---
title: "الإعداد: Twilio"
description: دليل خطوة بخطوة لتكوين Twilio كمزود خدمة الاتصالات.
---

Twilio هو مزود خدمة الاتصالات الافتراضي لـ Llamenos والأسهل للبدء. يرشدك هذا الدليل خلال إنشاء الحساب وإعداد رقم الهاتف وتكوين webhook.

## المتطلبات الأساسية

- [حساب Twilio](https://www.twilio.com/try-twilio) (النسخة التجريبية المجانية تعمل للاختبار)
- نسخة Llamenos منشورة ومتاحة عبر عنوان URL عام

## 1. إنشاء حساب Twilio

سجّل في [twilio.com/try-twilio](https://www.twilio.com/try-twilio). تحقق من بريدك الإلكتروني ورقم هاتفك. يوفر Twilio رصيداً تجريبياً للاختبار.

## 2. شراء رقم هاتف

1. انتقل إلى **Phone Numbers** > **Manage** > **Buy a number** في لوحة تحكم Twilio
2. ابحث عن رقم بقدرة **Voice** في رمز المنطقة المطلوب
3. انقر على **Buy** وأكد

احفظ هذا الرقم — ستدخله في إعدادات المسؤول في Llamenos.

## 3. الحصول على Account SID و Auth Token

1. انتقل إلى [لوحة تحكم Twilio](https://console.twilio.com)
2. ابحث عن **Account SID** و **Auth Token** في الصفحة الرئيسية
3. انقر على أيقونة العين لإظهار Auth Token

## 4. تكوين webhooks

في لوحة تحكم Twilio، انتقل إلى تكوين رقم هاتفك:

1. انتقل إلى **Phone Numbers** > **Manage** > **Active Numbers**
2. انقر على رقم خط الطوارئ الخاص بك
3. ضمن **Voice Configuration**، عيّن:
   - **A call comes in**: Webhook، `https://your-worker-url.com/telephony/incoming`، HTTP POST
   - **Call status changes**: `https://your-worker-url.com/telephony/status`، HTTP POST

استبدل `your-worker-url.com` بعنوان URL الفعلي لـ Cloudflare Worker الخاص بك.

## 5. التكوين في Llamenos

1. سجّل الدخول كمسؤول
2. انتقل إلى **الإعدادات** > **مزود خدمة الاتصالات**
3. اختر **Twilio** من القائمة المنسدلة
4. أدخل:
   - **Account SID**: من الخطوة 3
   - **Auth Token**: من الخطوة 3
   - **Phone Number**: الرقم الذي اشتريته (بصيغة E.164، مثال: `+15551234567`)
5. انقر على **حفظ**

## 6. اختبار الإعداد

اتصل برقم خط الطوارئ من هاتف. يجب أن تسمع قائمة اختيار اللغة. إذا كان لديك متطوعون في المناوبة، ستمر المكالمة إليهم.

## إعداد WebRTC (اختياري)

لتمكين المتطوعين من الرد على المكالمات في متصفحهم بدلاً من هاتفهم:

### إنشاء API Key

1. انتقل إلى **Account** > **API keys & tokens** في لوحة تحكم Twilio
2. انقر على **Create API Key**
3. اختر نوع المفتاح **Standard**
4. احفظ **SID** و **Secret** — يُعرض السر مرة واحدة فقط

### إنشاء TwiML App

1. انتقل إلى **Voice** > **Manage** > **TwiML Apps**
2. انقر على **Create new TwiML App**
3. عيّن **Voice Request URL** إلى `https://your-worker-url.com/telephony/webrtc-incoming`
4. احفظ ولاحظ **App SID**

### التفعيل في Llamenos

1. انتقل إلى **الإعدادات** > **مزود خدمة الاتصالات**
2. فعّل **الاتصال عبر WebRTC**
3. أدخل:
   - **API Key SID**: من مفتاح API الذي أنشأته
   - **API Key Secret**: من مفتاح API الذي أنشأته
   - **TwiML App SID**: من تطبيق TwiML الذي أنشأته
4. انقر على **حفظ**

راجع [الاتصال عبر المتصفح WebRTC](/docs/deploy/providers/webrtc) لإعداد المتطوعين واستكشاف الأخطاء وإصلاحها.

## استكشاف الأخطاء وإصلاحها

- **المكالمات لا تصل**: تحقق من صحة عنوان URL لـ webhook وأن Worker منشور. تحقق من سجلات الأخطاء في لوحة تحكم Twilio.
- **أخطاء "Invalid webhook"**: تأكد أن عنوان URL لـ webhook يستخدم HTTPS ويعيد TwiML صالحاً.
- **قيود الحساب التجريبي**: الحسابات التجريبية يمكنها الاتصال بالأرقام المحققة فقط. قم بالترقية إلى حساب مدفوع للإنتاج.
- **فشل التحقق من webhook**: تأكد أن Auth Token في Llamenos يطابق الموجود في لوحة تحكم Twilio.
