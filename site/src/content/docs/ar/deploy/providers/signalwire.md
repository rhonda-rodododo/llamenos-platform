---
title: "الإعداد: SignalWire"
description: دليل خطوة بخطوة لتكوين SignalWire كمزود خدمة الاتصالات.
---

SignalWire هو بديل فعال من حيث التكلفة لـ Twilio مع واجهة برمجة تطبيقات متوافقة. يستخدم LaML (لغة ترميز متوافقة مع TwiML)، لذا فإن الانتقال بين Twilio و SignalWire سهل ومباشر.

## المتطلبات الأساسية

- [حساب SignalWire](https://signalwire.com/signup) (نسخة تجريبية مجانية متاحة)
- نسخة Llamenos منشورة ومتاحة عبر عنوان URL عام

## 1. إنشاء حساب SignalWire

سجّل في [signalwire.com/signup](https://signalwire.com/signup). أثناء التسجيل، ستختار اسم **Space** (مثال: `myhotline`). سيكون عنوان URL لمساحتك `myhotline.signalwire.com`. لاحظ هذا الاسم — ستحتاجه في التكوين.

## 2. شراء رقم هاتف

1. في لوحة تحكم SignalWire، انتقل إلى **Phone Numbers**
2. انقر على **Buy a Phone Number**
3. ابحث عن رقم بقدرة صوتية
4. اشترِ الرقم

## 3. الحصول على بيانات الاعتماد

1. انتقل إلى **API** في لوحة تحكم SignalWire
2. ابحث عن **Project ID** (يعمل كـ Account SID)
3. أنشئ **API Token** جديداً إذا لم يكن لديك واحد — يعمل كـ Auth Token

## 4. تكوين webhooks

1. انتقل إلى **Phone Numbers** في لوحة التحكم
2. انقر على رقم خط الطوارئ الخاص بك
3. ضمن **Voice Settings**، عيّن:
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Call status callback**: `https://your-worker-url.com/telephony/status` (POST)

## 5. التكوين في Llamenos

1. سجّل الدخول كمسؤول
2. انتقل إلى **الإعدادات** > **مزود خدمة الاتصالات**
3. اختر **SignalWire** من القائمة المنسدلة
4. أدخل:
   - **Account SID**: معرّف المشروع من الخطوة 3
   - **Auth Token**: رمز API من الخطوة 3
   - **SignalWire Space**: اسم المساحة الخاص بك (الاسم فقط، وليس عنوان URL الكامل — مثال: `myhotline`)
   - **Phone Number**: الرقم الذي اشتريته (بصيغة E.164)
5. انقر على **حفظ**

## 6. اختبار الإعداد

اتصل برقم خط الطوارئ. يجب أن تسمع قائمة اختيار اللغة متبوعة بتدفق المكالمة.

## إعداد WebRTC (اختياري)

يستخدم SignalWire WebRTC نفس نمط مفتاح API كـ Twilio:

1. في لوحة تحكم SignalWire، أنشئ **API Key** ضمن **API** > **Tokens**
2. أنشئ **تطبيق LaML**:
   - انتقل إلى **LaML** > **LaML Applications**
   - عيّن Voice URL إلى `https://your-worker-url.com/telephony/webrtc-incoming`
   - لاحظ Application SID
3. في Llamenos، انتقل إلى **الإعدادات** > **مزود خدمة الاتصالات**
4. فعّل **الاتصال عبر WebRTC**
5. أدخل API Key SID و API Key Secret و Application SID
6. انقر على **حفظ**

## الاختلافات عن Twilio

- **LaML مقابل TwiML**: يستخدم SignalWire لغة LaML، وهي مطابقة وظيفياً لـ TwiML. يتعامل Llamenos مع هذا تلقائياً.
- **عنوان URL للمساحة**: تذهب استدعاءات API إلى `{space}.signalwire.com` بدلاً من `api.twilio.com`. يتعامل المحول مع هذا عبر اسم المساحة الذي تقدمه.
- **التسعير**: SignalWire عادةً أرخص بنسبة 30-40% من Twilio للمكالمات الصوتية.
- **تكافؤ الميزات**: جميع ميزات Llamenos (التسجيل، النسخ التلقائي، CAPTCHA، البريد الصوتي) تعمل بشكل مطابق مع SignalWire.

## استكشاف الأخطاء وإصلاحها

- **أخطاء "Space not found"**: تحقق مرتين من اسم المساحة (النطاق الفرعي فقط، وليس عنوان URL الكامل).
- **فشل webhook**: تأكد أن عنوان URL لـ Worker متاح للعامة ويستخدم HTTPS.
- **مشاكل رمز API**: يمكن أن تنتهي صلاحية رموز SignalWire. أنشئ رمزاً جديداً إذا حصلت على أخطاء مصادقة.
