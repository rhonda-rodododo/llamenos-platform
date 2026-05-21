---
title: "Kurulum: Twilio"
description: Twilio'yu telefon sağlayıcınız olarak yapılandırmak için adım adım kılavuz.
---

Twilio, Llamenos için varsayılan telefon sağlayıcısıdır ve başlamak için en kolayıdır. Bu kılavuz, hesap oluşturma, telefon numarası kurulumu ve webhook yapılandırması sürecinde size yol gösterir.

## Ön koşullar

- Bir [Twilio hesabı](https://www.twilio.com/try-twilio) (test için ücretsiz deneme çalışır)
- Herkese açık bir URL üzerinden dağıtılmış ve erişilebilir Llamenos örneğiniz

## 1. Twilio hesabı oluşturun

[twilio.com/try-twilio](https://www.twilio.com/try-twilio) adresinden kaydolun. E-postanızı ve telefon numaranızı doğrulayın. Twilio, test için deneme kredisi sağlar.

## 2. Telefon numarası satın alın

1. Twilio Konsolunda **Telefon Numaraları** > **Yönet** > **Numara satın al** bölümüne gidin
2. İstediğiniz alan kodunda **Ses** yeteneğine sahip bir numara arayın
3. **Satın al**'a tıklayın ve onaylayın

Bu numarayı kaydedin — Llamenos yönetici ayarlarına gireceksiniz.

## 3. Hesap SID'nizi ve Auth Token'ınızı alın

1. [Twilio Konsol paneline](https://console.twilio.com) gidin
2. Ana sayfada **Hesap SID'nizi** ve **Auth Token'ınızı** bulun
3. Auth Token'ı görmek için göz simgesine tıklayın

## 4. Webhook'ları yapılandırın

Twilio Konsolunda telefon numaranızın yapılandırmasına gidin:

1. **Telefon Numaraları** > **Yönet** > **Aktif Numaralar** bölümüne gidin
2. Yardım hattı numaranıza tıklayın
3. **Ses Yapılandırması** altında şunları ayarlayın:
   - **Bir çağrı geldiğinde**: Webhook, `https://your-domain.com/api/telephony/incoming`, HTTP POST
   - **Çağrı durumu değiştiğinde**: `https://your-domain.com/api/telephony/status`, HTTP POST

`your-domain.com` kısmını gerçek Llamenos dağıtım URL'nizle değiştirin.

## 5. Llamenos'ta yapılandırın

1. Yönetici olarak oturum açın
2. **Ayarlar** > **Telefon Sağlayıcısı** bölümüne gidin
3. Sağlayıcı açılır menüsünden **Twilio**'yu seçin
4. Şunları girin:
   - **Hesap SID**: 3. adımdan
   - **Auth Token**: 3. adımdan
   - **Telefon Numarası**: satın aldığınız numara (E.164 formatında, örn. `+15551234567`)
5. **Kaydet**'e tıklayın

## 6. Kurulumu test edin

Bir telefondan yardım hattı numaranızı arayın. Dil seçimi menüsünü duymalısınız. Vardiyada gönüllüleriniz varsa, çağrı yönlendirilecektir.

## WebRTC kurulumu (isteğe bağlı)

Gönüllülerin çağrıları telefonları yerine tarayıcılarında yanıtlamasını sağlamak için:

### Bir API Anahtarı oluşturun

1. Twilio Konsolunda **Hesap** > **API anahtarları ve tokenlar** bölümüne gidin
2. **API Anahtarı Oluştur**'a tıklayın
3. **Standart** anahtar türünü seçin
4. **SID** ve **Secret**'ı kaydedin — secret sadece bir kez gösterilir

### Bir TwiML Uygulaması oluşturun

1. **Ses** > **Yönet** > **TwiML Uygulamaları** bölümüne gidin
2. **Yeni TwiML Uygulaması Oluştur**'a tıklayın
3. **Ses İstek URL'sini** `https://your-domain.com/api/telephony/webrtc-incoming` olarak ayarlayın
4. Kaydedin ve **Uygulama SID**'sini not edin

### Llamenos'ta etkinleştirin

1. **Ayarlar** > **Telefon Sağlayıcısı** bölümüne gidin
2. **WebRTC Çağrısı**'nı açın
3. Şunları girin:
   - **API Anahtarı SID**: oluşturduğunuz API anahtarından
   - **API Anahtarı Secret**: oluşturduğunuz API anahtarından
   - **TwiML Uygulama SID**: oluşturduğunuz TwiML Uygulamasından
4. **Kaydet**'e tıklayın

Gönüllü kurulumu ve sorun giderme için [WebRTC Tarayıcı Çağrıları](/docs/deploy/providers/webrtc) bölümüne bakın.

## Sorun giderme

- **Çağrılar gelmiyor**: Webhook URL'sinin doğru olduğunu ve sunucunuzun dağıtıldığını doğrulayın. Twilio Konsol hata günlüklerini kontrol edin.
- **"Geçersiz webhook" hataları**: Webhook URL'sinin HTTPS kullandığından ve geçerli TwiML döndürdüğünden emin olun.
- **Deneme hesabı sınırlamaları**: Deneme hesapları yalnızca doğrulanmış numaraları arayabilir. Üretim kullanımı için ücretli bir hesaba yükseltin.
- **Webhook doğrulama hataları**: Llamenos'taki Auth Token'ın Twilio Konsolundakiyle eşleştiğinden emin olun.
