---
title: Mimari
description: Sistem mimarisi genel bakış — depolar, veri akışı, şifreleme katmanları ve gerçek zamanlı iletişim.
---

Bu sayfa, Llamenos'un nasıl yapılandırıldığını, verilerin sistemde nasıl aktığını ve şifrelemenin nerede uygulandığını açıklar.

## Depo yapısı

Llamenos, ortak bir protokol ve kriptografik çekirdek paylaşan üç depo arasında bölünmüştür:

```
llamenos              llamenos-core           llamenos-platform
(Masaüstü + API)      (Paylaşılan Kripto)     (Mobil Uygulama)
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

- **llamenos** — Masaüstü uygulaması (Vite + React webview ile Tauri v2), Cloudflare Worker arka ucu ve kendi sunucunuzda barındırılan Node.js arka ucu. Bu birincil depodur.
- **llamenos-core** — Tüm kriptografik işlemleri uygulayan paylaşılan bir Rust crate'i: ECIES zarf şifreleme, Schnorr imzaları, PBKDF2 anahtar türetimi, HKDF ve XChaCha20-Poly1305. Yerel koda (Tauri için), WASM'a (tarayıcı için) ve UniFFI bağlamalarına (mobil için) derlenir.
- **llamenos-platform** — iOS ve Android için React Native mobil uygulama. Aynı Rust kripto kodunu çağırmak için UniFFI bağlamalarını kullanır.

Üç platform da `docs/protocol/PROTOCOL.md` dosyasında tanımlanan aynı kablo protokolünü uygular.

## Veri akışı

### Gelen çağrı

```
Arayan (telefon)
    |
    v
Telefon Sağlayıcısı (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | HTTP webhook
    v
Worker API  -->  CallRouterDO
    |                |
    |                | ShiftManagerDO'dan vardiyadaki gönüllüleri kontrol eder
    |                | Tüm müsait gönüllülere paralel çalma başlatır
    |                v
    |           Telefon Sağlayıcısı (gönüllü telefonlarına giden çağrılar)
    |
    | İlk gönüllü yanıtlar
    v
CallRouterDO  -->  Arayan ve gönüllüyü bağlar
    |
    | Çağrı biter
    v
İstemci (gönüllünün tarayıcısı/uygulaması)
    |
    | Notu not başına anahtarla şifreler
    | Anahtarı ECIES ile kendisi + her yönetici için sarar
    v
Worker API  -->  RecordsDO  (şifrelenmiş not + sarılmış anahtarları saklar)
```

### Gelen mesaj (SMS / WhatsApp / Signal)

```
Kişi (SMS / WhatsApp / Signal)
    |
    | Sağlayıcı webhook'u
    v
Worker API  -->  ConversationDO
    |                |
    |                | Mesaj içeriğini hemen şifreler
    |                | Simetrik anahtarı ECIES ile atanan gönüllü + yöneticiler için sarar
    |                | Düz metni atar
    |                v
    |           WebSocket rölesi (şifrelenmiş hub olayı çevrimiçi istemcileri bilgilendirir)
    |
    v
İstemci (gönüllünün tarayıcısı/uygulaması)
    |
    | Mesajı kendi özel anahtarıyla şifresini çözer
    | Yanıt oluşturur, giden mesajı şifreler
    v
Worker API  -->  ConversationDO  -->  Mesajlaşma Sağlayıcısı (yanıtı gönderir)
```

## Dayanıklı Nesneler

Arka uç, altı Cloudflare Dayanıklı Nesnesi (veya kendi sunucunuzda barındırılan dağıtımlar için PostgreSQL eşdeğerleri) kullanır:

| Dayanıklı Nesne | Sorumluluk |
|---|---|
| **IdentityDO** | Gönüllü kimliklerini, genel anahtarları, görünen adları ve WebAuthn kimlik bilgilerini yönetir. Davet oluşturma ve kullanma işlemlerini gerçekleştirir. |
| **SettingsDO** | Yardım hattı yapılandırmasını saklar: ad, etkin kanallar, sağlayıcı kimlik bilgileri, özel not alanları, spam önleme ayarları, özellik bayrakları. |
| **RecordsDO** | Şifrelenmiş çağrı notlarını, şifrelenmiş raporları ve dosya eki meta verilerini saklar. Not aramasını işler (şifrelenmiş meta veri üzerinden). |
| **ShiftManagerDO** | Yinelenen vardiya programlarını, çalma gruplarını, gönüllü vardiya atamalarını yönetir. Herhangi bir anda kimlerin vardiyada olduğunu belirler. |
| **CallRouterDO** | Gerçek zamanlı çağrı yönlendirmesini düzenler: paralel çalma, ilk yanıtlama sonlandırma, mola durumu, aktif çağrı takibi. TwiML/sağlayıcı yanıtları oluşturur. |
| **ConversationDO** | SMS, WhatsApp ve Signal arasındaki konuşmalı mesajlaşma konuşmalarını yönetir. Alım sırasında mesaj şifreleme, konuşma atama ve giden yanıtları işler. |

Tüm DO'lar `idFromName()` aracılığıyla singleton olarak erişilir ve dahili yönlendirme hafif bir `DORouter` (yöntem + yol deseni eşleştirme) kullanır.

## Şifreleme matrisi

| Veri | Şifreli mi? | Algoritma | Kim şifresini çözebilir |
|---|---|---|---|
| Çağrı notları | Evet (E2EE) | XChaCha20-Poly1305 + ECIES zarfı | Not yazarı + tüm yöneticiler |
| Not özel alanları | Evet (E2EE) | Notlarla aynı | Not yazarı + tüm yöneticiler |
| Raporlar | Evet (E2EE) | Notlarla aynı | Rapor yazarı + tüm yöneticiler |
| Rapor ekleri | Evet (E2EE) | XChaCha20-Poly1305 (akış) | Rapor yazarı + tüm yöneticiler |
| Mesaj içeriği | Evet (E2EE) | XChaCha20-Poly1305 + ECIES zarfı | Atanan gönüllü + tüm yöneticiler |
| Transkriptler | Evet (bekleyen) | XChaCha20-Poly1305 | Transkript oluşturucu + tüm yöneticiler |
| Hub olayları (WebSocket) | Evet (simetrik) | Hub anahtarıyla XChaCha20-Poly1305 | Tüm mevcut hub üyeleri |
| Gönüllü nsec | Evet (bekleyen) | PBKDF2 + XChaCha20-Poly1305 (PIN) | Sadece gönüllü |
| Denetim kaydı girişleri | Hayır (bütünlük korumalı) | SHA-256 hash zinciri | Yöneticiler (okuma), sistem (yazma) |
| Arayan telefon numaraları | Hayır (yalnızca sunucu tarafı) | Yok | Sunucu + yöneticiler |
| Gönüllü telefon numaraları | IdentityDO'da saklanır | Yok | Sadece yöneticiler |

### Not başına ileri gizlilik

Her not veya mesaj benzersiz bir rastgele simetrik anahtar alır. Bu anahtar, her yetkili okuyucu için ayrı ayrı ECIES (secp256k1 geçici anahtar + HKDF + XChaCha20-Poly1305) ile sarılır. Bir notun anahtarının ele geçirilmesi, diğer notlar hakkında hiçbir şey açıklamaz. İçerik şifrelemesi için uzun ömürlü simetrik anahtarlar yoktur.

### Anahtar hiyerarşisi

```
Gönüllü nsec (BIP-340 Schnorr / secp256k1)
    |
    +-- npub türetir (x-only genel anahtar, 32 bayt)
    |
    +-- ECIES anahtar anlaşması için kullanılır (sıkıştırılmış form için 02 önek ekler)
    |
    +-- WebSocket olaylarını imzalar (Schnorr imzası)

Hub anahtarı (rastgele 32 bayt, herhangi bir kimlikten TÜRETİLMEZ)
    |
    +-- Gerçek zamanlı WebSocket hub olaylarını şifreler
    |
    +-- LABEL_HUB_KEY_WRAP aracılığıyla üye başına ECIES ile sarılır
    |
    +-- Üye ayrılığında döndürülür

Not başına anahtar (rastgele 32 bayt)
    |
    +-- XChaCha20-Poly1305 aracılığıyla not içeriğini şifreler
    |
    +-- Okuyucu başına ECIES ile sarılır (gönüllü + her yönetici)
    |
    +-- Notlar arasında asla yeniden kullanılmaz
```

## Gerçek zamanlı iletişim

Gerçek zamanlı güncellemeler (yeni çağrılar, mesajlar, vardiya değişiklikleri, varlık) bir WebSocket rölesi üzerinden akar:

- **Kendi sunucunuzda**: Uygulamanın yanında Docker/Kubernetes'te çalışan WebSocket rölesi rölesi
- **Cloudflare**: Nosflare (Cloudflare Workers tabanlı röle)

Tüm olaylar geçicidir (tür 20001) ve hub anahtarıyla şifrelenir. Olaylar, rölenin olay türlerini ayırt edememesi için genel etiketler (`["t", "llamenos:event"]`) kullanır. İçerik alanı XChaCha20-Poly1305 şifreli metin içerir.

### Olay akışı

```
İstemci A (gönüllü eylemi)
    |
    | Olay içeriğini hub anahtarıyla şifreler
    | WebSocket olayı olarak imzalar (Schnorr)
    v
WebSocket rölesi (WebSocket rölesi / Nosflare)
    |
    | Abonelere yayınlar
    v
İstemci B, C, D...
    |
    | Schnorr imzasını doğrular
    | İçeriği hub anahtarıyla şifresini çözer
    v
Yerel UI durumunu güncelle
```

Röle, şifreli blob'ları ve geçerli imzaları görür ancak olay içeriğini okuyamaz veya hangi eylemlerin gerçekleştirildiğini belirleyemez.

## Güvenlik katmanları

### Aktarım katmanı

- Tüm istemci-sunucu iletişimi HTTPS üzerinden (TLS 1.3)
- WebSocket rölesine WebSocket bağlantıları WSS üzerinden
- İçerik Güvenlik Politikası (CSP) betik kaynaklarını, bağlantıları ve çerçeve atalarını kısıtlar
- Tauri izolasyon deseni IPC'yi webview'dan ayırır

### Uygulama katmanı

- WebSocket anahtar çiftleri aracılığıyla kimlik doğrulama (BIP-340 Schnorr imzaları)
- Çok cihazlı kolaylık için WebAuthn oturum belirteçleri
- Rol tabanlı erişim kontrolü (arayan, gönüllü, muhabir, yönetici)
- `crypto-labels.ts` dosyasında tanımlanan tüm 25 kriptografik alan ayrımı sabiti, çapraz protokol saldırılarını önler

### Bekleyen şifreleme

- Çağrı notları, raporlar, mesajlar ve transkriptler depolamadan önce şifrelenir
- Gönüllü gizli anahtarları PIN ile türetilen anahtarlarla şifrelenir (PBKDF2)
- Tauri Stronghold, masaüstünde şifrelenmiş kasa depolama sağlar
- Denetim kaydı bütünlüğü SHA-256 hash zinciri ile korunur

### Derleme doğrulama

- `SOURCE_DATE_EPOCH` ile `Dockerfile.build` aracılığıyla tekrarlanabilir derlemeler
- Ön uç varlıkları için içerik hash'li dosya adları
- GitHub Sürümleri ile yayınlanan `CHECKSUMS.txt`
- SLSA kaynak kanıtlamaları
- Doğrulama betiği: `scripts/verify-build.sh`

## Platform farklılıkları

| Özellik | Masaüstü (Tauri) | Mobil (React Native) | Tarayıcı (Cloudflare) |
|---|---|---|---|
| Kripto arka ucu | Yerel Rust (IPC aracılığıyla) | Yerel Rust (UniFFI aracılığıyla) | WASM (llamenos-core) |
| Anahtar depolama | Tauri Stronghold (şifrelenmiş) | Secure Enclave / Keystore | Tarayıcı localStorage (PIN ile şifrelenmiş) |
| Transkripsiyon | İstemci tarafı Whisper (WASM) | Mevcut değil | İstemci tarafı Whisper (WASM) |
| Otomatik güncelleme | Tauri güncelleyici | App Store / Play Store | Otomatik (CF Workers) |
| Anında bildirimler | OS-yerel (Tauri bildirimi) | OS-yerel (FCM/APNS) | Tarayıcı bildirimleri |
| Çevrimdışı destek | Sınırlı (API gerektirir) | Sınırlı (API gerektirir) | Sınırlı (API gerektirir) |
