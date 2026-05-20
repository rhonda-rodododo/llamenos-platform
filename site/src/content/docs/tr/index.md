---
title: Dokümantasyon
description: Llamenos'u nasıl dağıtacağınızı, yapılandıracağınızı ve kullanacağınızı öğrenin.
guidesHeading: Kılavuzlar
guides:
  - title: Başlangıç
    description: Ön koşullar, kurulum, kurulum sihirbazı ve ilk dağıtımınız.
    href: /docs/getting-started
  - title: Mimari
    description: Sistem mimarisi genel bakış — depolar, veri akışı, şifreleme katmanları ve gerçek zamanlı iletişim.
    href: /docs/architecture
  - title: Kendi Sunucunuzda Barındırma Genel Bakış
    description: Docker Compose veya Kubernetes ile kendi altyapınızda dağıtın.
    href: /docs/self-hosting
  - title: "Dağıtım: Docker Compose"
    description: Otomatik HTTPS ile tek sunucu kendi sunucunuzda barındırma.
    href: /docs/deploy-docker
  - title: "Dağıtım: Kubernetes (Helm)"
    description: Resmi Helm grafiği ile Kubernetes'e dağıtın.
    href: /docs/deploy-kubernetes
  - title: Yönetici Kılavuzu
    description: Gönüllüleri, vardiyaları, kanalları, yasak listelerini, raporları ve ayarları yönetin.
    href: /docs/admin-guide
  - title: Gönüllü Kılavuzu
    description: Oturum açma, çağrı alma, mesajlara yanıt verme, not yazma ve transkripsiyon kullanma.
    href: /docs/volunteer-guide
  - title: Muhabir Kılavuzu
    description: Şifrelenmiş raporlar gönderin ve durumlarını takip edin.
    href: /docs/reporter-guide
  - title: Mobil Kılavuz
    description: Llamenos mobil uygulamasını iOS ve Android'e kurun ve yapılandırın.
    href: /docs/mobile-guide
  - title: Telefon Sağlayıcıları
    description: Desteklenen telefon sağlayıcılarını karşılaştırın ve yardım hattınız için en uygun olanı seçin.
    href: /docs/telephony-providers
  - title: "Kurulum: SMS"
    description: Telefon sağlayıcınız üzerinden gelen/giden SMS mesajlaşmayı etkinleştirin.
    href: /docs/setup-sms
  - title: "Kurulum: WhatsApp"
    description: Meta Cloud API üzerinden WhatsApp Business'ı bağlayın.
    href: /docs/setup-whatsapp
  - title: "Kurulum: Signal"
    description: signal-cli köprüsü üzerinden Signal kanalını kurun.
    href: /docs/setup-signal
  - title: "Kurulum: Twilio"
    description: Telefon sağlayıcınız olarak Twilio'yu yapılandırmak için adım adım kılavuz.
    href: /docs/setup-twilio
  - title: "Kurulum: SignalWire"
    description: Telefon sağlayıcınız olarak SignalWire'ı yapılandırmak için adım adım kılavuz.
    href: /docs/setup-signalwire
  - title: "Kurulum: Vonage"
    description: Telefon sağlayıcınız olarak Vonage'ı yapılandırmak için adım adım kılavuz.
    href: /docs/setup-vonage
  - title: "Kurulum: Plivo"
    description: Telefon sağlayıcınız olarak Plivo'yu yapılandırmak için adım adım kılavuz.
    href: /docs/setup-plivo
  - title: "Kurulum: Asterisk (Kendi Sunucunuzda)"
    description: Maksimum gizlilik ve kontrol için ARI köprüsü ile Asterisk'i dağıtın.
    href: /docs/setup-asterisk
  - title: WebRTC Tarayıcı Çağrıları
    description: Gönüllüler için WebRTC kullanarak tarayıcıda çağrı yanıtlamayı etkinleştirin.
    href: /docs/webrtc-calling
  - title: Sorun Giderme
    description: Dağıtım, masaüstü, mobil, telefon ve şifreleme ile ilgili yaygın sorunların çözümleri.
    href: /docs/troubleshooting
  - title: Güvenlik Modeli
    description: Nelerin şifrelendiğini, nelerin şifrelenmediğini ve tehdit modelini anlayın.
    href: /security
---

## Mimari genel bakış

Llamenos, **Cloudflare Workers** üzerinde veya **Docker Compose / Kubernetes** aracılığıyla kendi altyapınızda çalışabilen tek sayfalık bir uygulamadır (SPA). Sesli aramalar, SMS, WhatsApp ve Signal'i destekler — hepsi tek bir arayüz üzerinden vardiyadaki gönüllülere yönlendirilir.

| Bileşen | Cloudflare | Kendi Sunucunuzda |
|---|---|---|
| Ön Yüz | Vite + React + TanStack Router | Aynı |
| Arka Yüz | Cloudflare Workers + 6 Durable Objects | Node.js + PostgreSQL |
| Blob Depolama | R2 | RustFS (S3-uyumlu) |
| Ses | Twilio, SignalWire, Vonage, Plivo veya Asterisk | Aynı |
| Mesajlaşma | SMS, WhatsApp Business, Signal | Aynı |
| Kimlik Doğrulama | WebSocket anahtar çiftleri (BIP-340 Schnorr) + WebAuthn | Aynı |
| Şifreleme | ECIES (secp256k1 + XChaCha20-Poly1305) | Aynı |
| Transkripsiyon | İstemci tarafı Whisper (WASM) | İstemci tarafı Whisper (WASM) |
| i18n | i18next (13 dil) | Aynı |

## Roller

| Rol | Görebilir | Yapabilir |
|---|---|---|
| **Arayan** | Hiçbir şey (telefon/SMS/WhatsApp/Signal) | Yardım hattını arayabilir veya mesaj gönderebilir |
| **Gönüllü** | Kendi notları, atanan konuşmalar | Çağrı yanıtlama, not yazma, mesajlara yanıt verme |
| **Muhabir** | Sadece kendi raporları | Dosya ekleri ile şifrelenmiş raporlar gönderme |
| **Yönetici** | Tüm notlar, raporlar, konuşmalar, denetim kayıtları | Gönüllüleri, vardiyaları, kanalları, yasakları, ayarları yönetme |
