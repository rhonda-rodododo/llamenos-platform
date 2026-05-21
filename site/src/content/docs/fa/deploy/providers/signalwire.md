---
title: "راه‌اندازی: SignalWire"
description: راهنمای گام‌به‌گام برای پیکربندی SignalWire به عنوان ارائه‌دهنده تلفنی شما.
---

SignalWire یک جایگزین مقرون‌به‌صرفه برای Twilio با API سازگار است. از LaML (یک زبان نشانه‌گذاری سازگار با TwiML) استفاده می‌کند، بنابراین مهاجرت بین Twilio و SignalWire ساده است.

## پیش‌نیازها

- یک [حساب SignalWire](https://signalwire.com/signup) (نسخه آزمایشی رایگان موجود است)
- نمونه Llámenos شما مستقر شده و از طریق یک آدرس عمومی قابل دسترسی است

## ۱. ایجاد حساب SignalWire

در [signalwire.com/signup](https://signalwire.com/signup) ثبت نام کنید. در طول ثبت نام، یک **نام Space** انتخاب خواهید کرد (مثلاً `myhotline`). آدرس Space شما `myhotline.signalwire.com` خواهد بود. این نام را یادداشت کنید — در پیکربندی به آن نیاز خواهید داشت.

## ۲. خرید شماره تلفن

۱. در داشبورد SignalWire خود، به **Phone Numbers** بروید
۲. روی **Buy a Phone Number** کلیک کنید
۳. یک شماره با قابلیت صدا جستجو کنید
۴. شماره را خریداری کنید

## ۳. دریافت اعتبارنامه‌ها

۱. به **API** در داشبورد SignalWire بروید
۲. **Project ID** خود را پیدا کنید (این به عنوان Account SID عمل می‌کند)
۳. یک **API Token** جدید ایجاد کنید اگر ندارید — این به عنوان Auth Token عمل می‌کند

## ۴. پیکربندی webhookها

۱. به **Phone Numbers** در داشبورد بروید
۲. روی شماره خط تلفن خود کلیک کنید
۳. در زیر **Voice Settings**، تنظیم کنید:
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Call status callback**: `https://your-domain.com/api/telephony/status` (POST)

## ۵. پیکربندی در Llámenos

۱. به عنوان مدیر وارد شوید
۲. به **تنظیمات** > **ارائه‌دهنده تلفنی** بروید
۳. **SignalWire** را از dropdown ارائه‌دهنده انتخاب کنید
۴. وارد کنید:
   - **Account SID**: Project ID شما از مرحله ۳
   - **Auth Token**: API Token شما از مرحله ۳
   - **SignalWire Space**: نام Space شما (فقط نام، نه آدرس کامل — مثلاً `myhotline`)
   - **شماره تلفن**: شماره‌ای که خریدید (قالب E.164)
۵. روی **ذخیره** کلیک کنید

## ۶. تست راه‌اندازی

از شماره خط تلفن خود تماس بگیرید. باید منوی انتخاب زبان و سپس جریان تماس را بشنوید.

## راه‌اندازی WebRTC (اختیاری)

WebRTC SignalWire از همان الگوی کلید API Twilio استفاده می‌کند:

۱. در داشبورد SignalWire خود، یک **API Key** در زیر **API** > **Tokens** ایجاد کنید
۲. یک **LaML Application** ایجاد کنید:
   - به **LaML** > **LaML Applications** بروید
   - Voice URL را به `https://your-domain.com/api/telephony/webrtc-incoming` تنظیم کنید
   - Application SID را یادداشت کنید
۳. در Llámenos، به **تنظیمات** > **ارائه‌دهنده تلفنی** بروید
۴. **WebRTC Calling** را روشن کنید
۵. API Key SID، API Key Secret و Application SID را وارد کنید
۶. روی **ذخیره** کلیک کنید

## تفاوت‌ها از Twilio

- **LaML در مقابل TwiML**: SignalWire از LaML استفاده می‌کند که از نظر عملکردی با TwiML یکسان است. Llámenos این را به طور خودکار مدیریت می‌کند.
- **Space URL**: تماس‌های API به `{space}.signalwire.com` به جای `api.twilio.com` می‌روند. آداپتور از طریق نام Space که ارائه می‌دهید این را مدیریت می‌کند.
- **قیمت‌گذاری**: SignalWire به طور کلی ۳۰-۴۰٪ ارزان‌تر از Twilio برای تماس‌های صوتی است.
- **برابری ویژگی‌ها**: همه ویژگی‌های Llámenos (ضبط، رونویسی، CAPTCHA، پیام صوتی) به طور یکسان با SignalWire کار می‌کنند.

## عیب‌یابی

- **خطاهای «Space یافت نشد»**: نام Space را دوباره بررسی کنید (فقط زیردامنه، نه آدرس کامل).
- **شکست‌های webhook**: اطمینان حاصل کنید که آدرس سرور شما عمومی و از HTTPS استفاده می‌کند.
- **مشکلات توکن API**: توکن‌های SignalWire می‌توانند منقضی شوند. در صورت بروز خطاهای احراز هویت، یک توکن جدید ایجاد کنید.
