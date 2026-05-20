---
title: مستندات
description: نحوه استقرار، پیکربندی و استفاده از Llámenos را بیاموزید.
guidesHeading: راهنماها
guides:
  - title: شروع کار
    description: پیش‌نیازها، نصب، جادوگر راه‌اندازی و اولین استقرار شما.
    href: /docs/getting-started
  - title: معماری
    description: نمای کلی معماری سیستم — مخازن، جریان داده، لایه‌های رمزنگاری و ارتباط بلادرنگ.
    href: /docs/architecture
  - title: نمای کلی میزبانی شخصی
    description: استقرار در زیرساخت شخصی خود با Docker Compose یا Kubernetes.
    href: /docs/self-hosting
  - title: "استقرار: Docker Compose"
    description: استقرار میزبانی شخصی روی یک سرور با HTTPS خودکار.
    href: /docs/deploy-docker
  - title: "استقرار: Kubernetes (Helm)"
    description: استقرار در Kubernetes با نمودار رسمی Helm.
    href: /docs/deploy-kubernetes
  - title: راهنمای مدیر
    description: مدیریت داوطلبان، شیفت‌ها، کانال‌ها، لیست‌های مسدود، گزارش‌ها و تنظیمات.
    href: /docs/admin-guide
  - title: راهنمای داوطلب
    description: ورود، دریافت تماس‌ها، پاسخ به پیام‌ها، نوشتن یادداشت‌ها و استفاده از رونویسی.
    href: /docs/volunteer-guide
  - title: راهنمای گزارش‌دهنده
    description: ارسال گزارش‌های رمزنگاری‌شده و پیگیری وضعیت آنها.
    href: /docs/reporter-guide
  - title: راهنمای موبایل
    description: نصب و راه‌اندازی برنامه موبایل Llámenos در iOS و Android.
    href: /docs/mobile-guide
  - title: ارائه‌دهندگان تلفنی
    description: مقایسه ارائه‌دهندگان تلفنی پشتیبانی‌شده و انتخاب بهترین گزینه برای خط تلفن شما.
    href: /docs/telephony-providers
  - title: "راه‌اندازی: SMS"
    description: فعال‌سازی پیام‌کوتاه ورودی/خروجی از طریق ارائه‌دهنده تلفنی شما.
    href: /docs/setup-sms
  - title: "راه‌اندازی: WhatsApp"
    description: اتصال WhatsApp Business از طریق Meta Cloud API.
    href: /docs/setup-whatsapp
  - title: "راه‌اندازی: Signal"
    description: راه‌اندازی کانال Signal از طریق پل signal-cli.
    href: /docs/setup-signal
  - title: "راه‌اندازی: Twilio"
    description: راهنمای گام‌به‌گام برای پیکربندی Twilio به عنوان ارائه‌دهنده تلفنی شما.
    href: /docs/setup-twilio
  - title: "راه‌اندازی: SignalWire"
    description: راهنمای گام‌به‌گام برای پیکربندی SignalWire به عنوان ارائه‌دهنده تلفنی شما.
    href: /docs/setup-signalwire
  - title: "راه‌اندازی: Vonage"
    description: راهنمای گام‌به‌گام برای پیکربندی Vonage به عنوان ارائه‌دهنده تلفنی شما.
    href: /docs/setup-vonage
  - title: "راه‌اندازی: Plivo"
    description: راهنمای گام‌به‌گام برای پیکربندی Plivo به عنوان ارائه‌دهنده تلفنی شما.
    href: /docs/setup-plivo
  - title: "راه‌اندازی: Asterisk (میزبانی شخصی)"
    description: استقرار Asterisk با پل ARI برای حداکثر حریم خصوصی و کنترل.
    href: /docs/setup-asterisk
  - title: تماس مرورگر WebRTC
    description: فعال‌سازی پاسخ‌گویی به تماس در مرورگر برای داوطلبان با استفاده از WebRTC.
    href: /docs/webrtc-calling
  - title: عیب‌یابی
    description: راه‌حل‌هایی برای مشکلات رایج استقرار، دسکتاپ، موبایل، تلفن و رمزنگاری.
    href: /docs/troubleshooting
  - title: مدل امنیتی
    description: درک آنچه رمزنگاری شده، آنچه نشده و مدل تهدید.
    href: /security
---

## نمای کلی معماری

Llámenos یک برنامه تک‌صفحه‌ای (SPA) است که می‌تواند روی **Cloudflare Workers** یا زیرساخت شخصی شما از طریق **Docker Compose / Kubernetes** اجرا شود. این برنامه از تماس‌های صوتی، پیامک، WhatsApp و Signal پشتیبانی می‌کند — همه از طریق یک رابط یکپارچه به داوطلبان شیفت فعال مسیریابی می‌شوند.

| مؤلفه | Cloudflare | میزبانی شخصی |
|---|---|---|
| فرانت‌اند | Vite + React + TanStack Router | مشابه |
| بک‌اند | Cloudflare Workers + 6 Durable Objects | Node.js + PostgreSQL |
| ذخیره‌سازی باینری | R2 | RustFS (سازگار با S3) |
| صدا | Twilio, SignalWire, Vonage, Plivo, یا Asterisk | مشابه |
| پیام‌رسانی | SMS, WhatsApp Business, Signal | مشابه |
| احراز هویت | جفت‌کلید WebSocket (BIP-340 Schnorr) + WebAuthn | مشابه |
| رمزنگاری | ECIES (secp256k1 + XChaCha20-Poly1305) | مشابه |
| رونویسی | Whisper سمت کلاینت (WASM) | Whisper سمت کلاینت (WASM) |
| بین‌المللی‌سازی | i18next (۱۳ زبان) | مشابه |

## نقش‌ها

| نقش | می‌تواند ببیند | می‌تواند انجام دهد |
|---|---|---|
| **تماس‌گیرنده** | هیچ (تلفن/SMS/WhatsApp/Signal) | تماس یا پیام به خط تلفن |
| **داوطلب** | یادداشت‌های خود، مکالمات تعیین‌شده | پاسخ به تماس‌ها، نوشتن یادداشت، پاسخ به پیام‌ها |
| **گزارش‌دهنده** | فقط گزارش‌های خود | ارسال گزارش‌های رمزنگاری‌شده با پیوست فایل |
| **مدیر** | همه یادداشت‌ها، گزارش‌ها، مکالمات، گزارش‌های حسابرسی | مدیریت داوطلبان، شیفت‌ها، کانال‌ها، مسدودها، تنظیمات |
