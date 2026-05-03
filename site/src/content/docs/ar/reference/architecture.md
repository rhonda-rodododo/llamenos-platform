---
title: البنية
description: نظرة عامة على بنية النظام — المستودعات، تدفق البيانات، طبقات التشفير، والاتصال في الوقت الفعلي.
---

تشرح هذه الصفحة كيف تم هيكلة Llamenos، وكيف تتدفق البيانات عبر النظام، وأين يُطبق التشفير.

## هيكل المستودعات

ينقسم Llamenos عبر ثلاثة مستودعات تشترك في بروتوكول مشترك ونواة تشفيرية:

```
llamenos              llamenos-core           llamenos-hotline
(Desktop + API)       (Shared Crypto)         (Mobile App)
+--------------+      +--------------+        +--------------+
| Tauri v2     |      | Rust crate   |        | React Native |
| Vite + React |      | - Native lib |        | iOS + Android|
| CF Workers   |      | - WASM pkg   |        | UniFFI bind  |
| Durable Objs |      | - UniFFI     |        |              |
+--------------+      +--------------+        +--------------+
       |                  ^      ^                   |
       |  path dep        |      |    UniFFI         |
       +------------------+      +-------------------+
```

- **llamenos** — تطبيق سطح المكتب (Tauri v2 مع واجهة Vite + React)، خلفية Cloudflare Worker، وخلفية Node.js المستضافة ذاتياً. هذا هو المستودع الرئيسي.
- **llamenos-core** — حزمة Rust مشتركة تنفذ جميع العمليات التشفيرية: تشفير ظرف ECIES، توقيعات Schnorr، اشتقاق مفاتيح PBKDF2، HKDF، و XChaCha20-Poly1305. تُجمع لكود أصلي (لـ Tauri)، WASM (للمتصفح)، وروابط UniFFI (للموبايل).
- **llamenos-hotline** — تطبيق React Native للموبايل لنظامي iOS و Android. يستخدم روابط UniFFI لاستدعاء نفس كود Rust التشفيري.

تنفذ جميع المنصات الثلاث نفس بروتوكول السلك المحدد في `docs/protocol/PROTOCOL.md`.

## تدفق البيانات

### مكالمة واردة

```
Caller (phone)
    |
    v
Telephony Provider (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | HTTP webhook
    v
Worker API  -->  CallRouterDO
    |                |
    |                | Checks ShiftManagerDO for on-shift volunteers
    |                | Initiates parallel ring to all available volunteers
    |                v
    |           Telephony Provider (outbound calls to volunteer phones)
    |
    | First volunteer answers
    v
CallRouterDO  -->  Connects caller and volunteer
    |
    | Call ends
    v
Client (volunteer's browser/app)
    |
    | Encrypts note with per-note key
    | Wraps key via ECIES for self + each admin
    v
Worker API  -->  RecordsDO  (stores encrypted note + wrapped keys)
```

### رسالة واردة (SMS / WhatsApp / Signal)

```
Contact (SMS / WhatsApp / Signal)
    |
    | Provider webhook
    v
Worker API  -->  ConversationDO
    |                |
    |                | Encrypts message content immediately
    |                | Wraps symmetric key via ECIES for assigned volunteer + admins
    |                | Discards plaintext
    |                v
    |           Nostr relay (encrypted hub event notifies online clients)
    |
    v
Client (volunteer's browser/app)
    |
    | Decrypts message with own private key
    | Composes reply, encrypts outbound
    v
Worker API  -->  ConversationDO  -->  Messaging Provider (sends reply)
```

## Durable Objects

تستخدم الخلفية ستة Cloudflare Durable Objects (أو مكافئاتها PostgreSQL للنشر المستضاف ذاتياً):

| Durable Object | المسؤولية |
|---|---|
| **IdentityDO** | إدارة هويات المتطوعين، المفاتيح العامة، أسماء العرض، وبيانات اعتماد WebAuthn. التعامل مع إنشاء واسترداد الدعوات. |
| **SettingsDO** | تخزين تكوين خط الطوارئ: الاسم، القنوات المفعلة، بيانات اعتماد المزودين، حقول الملاحظات المخصصة، إعدادات مكافحة البريد المزعج، أعلام الميزات. |
| **RecordsDO** | تخزين ملاحظات المكالمات المشفرة، التقارير المشفرة، وبيانات تعريف المرفقات. التعامل مع البحث في الملاحظات (عبر البيانات الوصفية المشفرة). |
| **ShiftManagerDO** | إدارة جداول المناوبات المتكررة، مجموعات الرنين، تعيينات مناوبات المتطوعين. تحديد من في المناوبة في أي وقت. |
| **CallRouterDO** | تنسيق توجيه المكالمات في الوقت الفعلي: الرنين المتوازي، إنهاء أول رد، حالة الاستراحة، تتبع المكالمات النشطة. إنشاء استجابات TwiML/المزود. |
| **ConversationDO** | إدارة محادثات المراسلة المترابطة عبر SMS و WhatsApp و Signal. التعامل مع تشفير الرسائل عند الاستيعاب، تعيين المحادثات، والردود الصادرة. |

يتم الوصول إلى جميع DOs كمفردات عبر `idFromName()` وتُوجّه داخلياً باستخدام `DORouter` خفيف الوزن (مطابقة الطريقة + نمط المسار).

## مصفوفة التشفير

| البيانات | مشفرة؟ | الخوارزمية | من يمكنه فك التشفير |
|---|---|---|---|
| ملاحظات المكالمات | نعم (E2EE) | XChaCha20-Poly1305 + ظرف ECIES | كاتب الملاحظة + جميع المسؤولين |
| الحقول المخصصة للملاحظات | نعم (E2EE) | نفس الملاحظات | كاتب الملاحظة + جميع المسؤولين |
| التقارير | نعم (E2EE) | نفس الملاحظات | كاتب التقرير + جميع المسؤولين |
| مرفقات التقارير | نعم (E2EE) | XChaCha20-Poly1305 (متدفق) | كاتب التقرير + جميع المسؤولين |
| محتوى الرسائل | نعم (E2EE) | XChaCha20-Poly1305 + ظرف ECIES | المتطوع المعين + جميع المسؤولين |
| النسخ التلقائي | نعم (في السكون) | XChaCha20-Poly1305 | منشئ النسخة + جميع المسؤولين |
| أحداث Hub (Nostr) | نعم (متماثل) | XChaCha20-Poly1305 مع مفتاح hub | جميع أعضاء hub الحاليين |
| nsec المتطوع | نعم (في السكون) | PBKDF2 + XChaCha20-Poly1305 (PIN) | المتطوع فقط |
| إدخالات سجل التدقيق | لا (محمية السلامة) | سلسلة تجزئة SHA-256 | المسؤولون (قراءة)، النظام (كتابة) |
| أرقام هواتف المتصلين | لا (جانب الخادم فقط) | غير متاح | الخادم + المسؤولون |
| أرقام هواتف المتطوعين | مخزنة في IdentityDO | غير متاح | المسؤولون فقط |

### سرية التقدم لكل ملاحظة

تحصل كل ملاحظة أو رسالة على مفتاح متماثل عشوائي فريد. يُلف هذا المفتاح عبر ECIES (مفتاح سريع الزوال secp256k1 + HKDF + XChaCha20-Poly1305) بشكل فردي لكل قارئ مصرح. اختراق مفتاح ملاحظة واحدة لا يكشف شيئاً عن الملاحظات الأخرى. لا توجد مفاتيح متماثلة طويلة الأمد لتشفير المحتوى.

### تسلسل المفاتيح

```
Volunteer nsec (BIP-340 Schnorr / secp256k1)
    |
    +-- Derives npub (x-only public key, 32 bytes)
    |
    +-- Used for ECIES key agreement (prepend 02 for compressed form)
    |
    +-- Signs Nostr events (Schnorr signature)

Hub key (random 32 bytes, NOT derived from any identity)
    |
    +-- Encrypts real-time Nostr hub events
    |
    +-- ECIES-wrapped per member via LABEL_HUB_KEY_WRAP
    |
    +-- Rotated on member departure

Per-note key (random 32 bytes)
    |
    +-- Encrypts note content via XChaCha20-Poly1305
    |
    +-- ECIES-wrapped per reader (volunteer + each admin)
    |
    +-- Never reused across notes
```

## الاتصال في الوقت الفعلي

تتدفق التحديثات في الوقت الفعلي (مكالمات جديدة، رسائل، تغييرات المناوبة، الحضور) عبر مرحّل Nostr:

- **مستضاف ذاتياً**: مرحّل strfry يعمل بجانب التطبيق في Docker/Kubernetes
- **Cloudflare**: Nosflare (مرحّل قائم على Cloudflare Workers)

جميع الأحداث سريعة الزوال (kind 20001) ومشفرة بمفتاح hub. تستخدم الأحداث وسوماً عامة (`["t", "llamenos:event"]`) حتى لا يستطيع المرحّل تمييز أنواع الأحداث. يحتوي حقل المحتوى على نص مشفر بـ XChaCha20-Poly1305.

### تدفق الأحداث

```
Client A (volunteer action)
    |
    | Encrypt event content with hub key
    | Sign as Nostr event (Schnorr)
    v
Nostr relay (strfry / Nosflare)
    |
    | Broadcast to subscribers
    v
Client B, C, D...
    |
    | Verify Schnorr signature
    | Decrypt content with hub key
    v
Update local UI state
```

يرى المرحّل كتلاً مشفرة وتوقيعات صالحة لكنه لا يستطيع قراءة محتوى الأحداث أو تحديد الإجراءات المنفذة.

## طبقات الأمان

### طبقة النقل

- جميع الاتصالات بين العميل والخادم عبر HTTPS (TLS 1.3)
- اتصالات WebSocket بمرحّل Nostr عبر WSS
- سياسة أمان المحتوى (CSP) تقيد مصادر السكريبت والاتصالات وأسلاف الإطارات
- نمط عزل Tauri يفصل IPC عن الـ webview

### طبقة التطبيق

- المصادقة عبر أزواج مفاتيح Nostr (توقيعات BIP-340 Schnorr)
- رموز جلسة WebAuthn لراحة الأجهزة المتعددة
- التحكم في الوصول القائم على الأدوار (متصل، متطوع، مُبلّغ، مسؤول)
- جميع ثوابت فصل النطاق التشفيرية الـ 25 محددة في `crypto-labels.ts` تمنع الهجمات عبر البروتوكولات

### التشفير في السكون

- ملاحظات المكالمات، التقارير، الرسائل، والنسخ التلقائي مشفرة قبل التخزين
- مفاتيح المتطوعين السرية مشفرة بمفاتيح مشتقة من PIN (PBKDF2)
- يوفر Tauri Stronghold تخزين خزنة مشفر على سطح المكتب
- سلامة سجل التدقيق محمية عبر سلسلة تجزئة SHA-256

### التحقق من البناء

- بناء قابل للتكرار عبر `Dockerfile.build` مع `SOURCE_DATE_EPOCH`
- أسماء ملفات مجزأة المحتوى لأصول الواجهة الأمامية
- `CHECKSUMS.txt` منشور مع إصدارات GitHub
- شهادات مصدر SLSA
- سكريبت التحقق: `scripts/verify-build.sh`

## اختلافات المنصات

| الميزة | سطح المكتب (Tauri) | الموبايل (React Native) | المتصفح (Cloudflare) |
|---|---|---|---|
| خلفية التشفير | Rust أصلي (عبر IPC) | Rust أصلي (عبر UniFFI) | WASM (llamenos-core) |
| تخزين المفاتيح | Tauri Stronghold (مشفر) | Secure Enclave / Keystore | localStorage في المتصفح (مشفر بـ PIN) |
| النسخ التلقائي | Whisper من جانب العميل (WASM) | غير متاح | Whisper من جانب العميل (WASM) |
| التحديث التلقائي | محدّث Tauri | App Store / Play Store | تلقائي (CF Workers) |
| الإشعارات | أصلية نظام التشغيل (إشعار Tauri) | أصلية نظام التشغيل (FCM/APNS) | إشعارات المتصفح |
| الدعم بدون اتصال | محدود (يحتاج API) | محدود (يحتاج API) | محدود (يحتاج API) |
