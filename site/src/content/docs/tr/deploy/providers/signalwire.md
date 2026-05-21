---
title: "Kurulum: SignalWire"
description: SignalWire'ı telefon sağlayıcınız olarak yapılandırmak için adım adım kılavuz.
---

SignalWire, uyumlu bir API ile Twilio'ya uygun maliyetli bir alternatiftir. LaML (TwiML-uyumlu bir işaretleme dili) kullanır, bu nedenle Twilio ve SignalWire arasında geçiş yapmak kolaydır.

## Ön koşullar

- Bir [SignalWire hesabı](https://signalwire.com/signup) (ücretsiz deneme mevcut)
- Herkese açık bir URL üzerinden dağıtılmış ve erişilebilir Llamenos örneğiniz

## 1. SignalWire hesabı oluşturun

[signalwire.com/signup](https://signalwire.com/signup) adresinden kaydolun. Kayıt sırasında bir **Alan adı** seçeceksiniz (örn. `myhotline`). Alan adı URL'niz `myhotline.signalwire.com` olacaktır. Bu adı not edin — yapılandırmada ihtiyacınız olacak.

## 2. Telefon numarası satın alın

1. SignalWire Panelinizde **Telefon Numaraları** bölümüne gidin
2. **Telefon Numarası Satın Al**'a tıklayın
3. Ses yeteneğine sahip bir numara arayın
4. Numarayı satın alın

## 3. Kimlik bilgilerinizi alın

1. SignalWire Panelinde **API** bölümüne gidin
2. **Proje Kimliğinizi** bulun (bu, Hesap SID olarak işlev görür)
3. Henüz yoksa yeni bir **API Token** oluşturun — bu, Auth Token olarak işlev görür

## 4. Webhook'ları yapılandırın

1. Panelde **Telefon Numaraları** bölümüne gidin
2. Yardım hattı numaranıza tıklayın
3. **Ses Ayarları** altında şunları ayarlayın:
   - **Çağrıları şunu kullanarak yönet**: LaML Webhook'ları
   - **Bir çağrı geldiğinde**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Çağrı durumu geri çağrısı**: `https://your-domain.com/api/telephony/status` (POST)

## 5. Llamenos'ta yapılandırın

1. Yönetici olarak oturum açın
2. **Ayarlar** > **Telefon Sağlayıcısı** bölümüne gidin
3. Sağlayıcı açılır menüsünden **SignalWire**'ı seçin
4. Şunları girin:
   - **Hesap SID**: 3. adımdaki Proje Kimliğiniz
   - **Auth Token**: 3. adımdaki API Token'ınız
   - **SignalWire Alanı**: Alan adınız (sadece ad, tam URL değil — örn. `myhotline`)
   - **Telefon Numarası**: satın aldığınız numara (E.164 formatında)
5. **Kaydet**'e tıklayın

## 6. Kurulumu test edin

Yardım hattı numaranızı arayın. Dil seçimi menüsünü ve ardından çağrı akışını duymalısınız.

## WebRTC kurulumu (isteğe bağlı)

SignalWire WebRTC, Twilio ile aynı API anahtarı modelini kullanır:

1. SignalWire Panelinizde, **API** > **Tokenlar** altında bir **API Anahtarı** oluşturun
2. Bir **LaML Uygulaması** oluşturun:
   - **LaML** > **LaML Uygulamaları** bölümüne gidin
   - Ses URL'sini `https://your-domain.com/api/telephony/webrtc-incoming` olarak ayarlayın
   - Uygulama SID'sini not edin
3. Llamenos'ta, **Ayarlar** > **Telefon Sağlayıcısı** bölümüne gidin
4. **WebRTC Çağrısı**'nı açın
5. API Anahtarı SID, API Anahtarı Secret ve Uygulama SID'sini girin
6. **Kaydet**'e tıklayın

## Twilio'dan farklılıklar

- **LaML vs TwiML**: SignalWire, işlevsel olarak TwiML ile aynı olan LaML kullanır. Llamenos bunu otomatik olarak işler.
- **Alan URL'si**: API çağrıları `api.twilio.com` yerine `{space}.signalwire.com` adresine gider. Adaptör, sağladığınız Alan adı aracılığıyla bunu işler.
- **Fiyatlandırma**: SignalWire, sesli aramalar için genellikle Twilio'dan %30-40 daha ucuzdur.
- **Özellik eşliği**: Tüm Llamenos özellikleri (kayıt, transkripsiyon, CAPTCHA, sesli mesaj) SignalWire ile aynı şekilde çalışır.

## Sorun giderme

- **"Alan bulunamadı" hataları**: Alan adını (sadece alt alan adı, tam URL değil) iki kez kontrol edin.
- **Webhook hataları**: Sunucu URL'nizin herkese açık olduğundan ve HTTPS kullandığından emin olun.
- **API token sorunları**: SignalWire tokenlarının süresi dolabilir. Kimlik doğrulama hataları alırsanız yeni bir token oluşturun.
