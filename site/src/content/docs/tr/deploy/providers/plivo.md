---
title: "Kurulum: Plivo"
description: Plivo'yu telefon sağlayıcınız olarak yapılandırmak için adım adım kılavuz.
---

Plivo, basit bir API ile bütçe dostu bir bulut telefon sağlayıcısıdır. TwiML'e benzer XML tabanlı çağrı kontrolü kullanır, bu da Llamenos ile entegrasyonu sorunsuz hale getirir.

## Ön koşullar

- Bir [Plivo hesabı](https://console.plivo.com/accounts/register/) (deneme kredisi mevcut)
- Herkese açık bir URL üzerinden dağıtılmış ve erişilebilir Llamenos örneğiniz

## 1. Plivo hesabı oluşturun

[console.plivo.com](https://console.plivo.com/accounts/register/) adresinden kaydolun. Doğrulamadan sonra, panel ana sayfasında **Auth ID** ve **Auth Token**'ınızı bulabilirsiniz.

## 2. Telefon numarası satın alın

1. Plivo Konsolunda **Telefon Numaraları** > **Numara Satın Al** bölümüne gidin
2. Ülkenizi seçin ve ses yeteneğine sahip numaralar arayın
3. Bir numara satın alın

## 3. Bir XML uygulaması oluşturun

Plivo, çağrıları yönlendirmek için "XML Uygulamaları" kullanır:

1. **Ses** > **XML Uygulamaları** bölümüne gidin
2. **Yeni Uygulama Ekle**'ye tıklayın
3. Yapılandırın:
   - **Uygulama Adı**: Llamenos Yardım Hattı
   - **Yanıt URL'si**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Kapatma URL'si**: `https://your-domain.com/api/telephony/status` (POST)
4. Uygulamayı kaydedin

## 4. Telefon numarasını bağlayın

1. **Telefon Numaraları** > **Numaralarınız** bölümüne gidin
2. Yardım hattı numaranıza tıklayın
3. **Ses** altında, 3. adımda oluşturduğunuz XML Uygulamasını seçin
4. Kaydedin

## 5. Llamenos'ta yapılandırın

1. Yönetici olarak oturum açın
2. **Ayarlar** > **Telefon Sağlayıcısı** bölümüne gidin
3. Sağlayıcı açılır menüsünden **Plivo**'yu seçin
4. Şunları girin:
   - **Auth ID**: Plivo Konsol panelinden
   - **Auth Token**: Plivo Konsol panelinden
   - **Telefon Numarası**: satın aldığınız numara (E.164 formatında)
5. **Kaydet**'e tıklayın

## 6. Kurulumu test edin

Yardım hattı numaranızı arayın. Dil seçimi menüsünü ve normal çağrı akışı üzerinden yönlendirildiğinizi duymalısınız.

## WebRTC kurulumu (isteğe bağlı)

Plivo WebRTC, mevcut kimlik bilgilerinizle Tarayıcı SDK'sını kullanır:

1. Plivo Konsolunda **Ses** > **Uç Noktalar** bölümüne gidin
2. Yeni bir uç nokta oluşturun (bu, tarayıcı telefon kimliği olarak işlev görür)
3. Llamenos'ta, **Ayarlar** > **Telefon Sağlayıcısı** bölümüne gidin
4. **WebRTC Çağrısı**'nı açın
5. **Kaydet**'e tıklayın

Adaptör, güvenli tarayıcı kimlik doğrulaması için Auth ID ve Auth Token'ınızdan zaman sınırlı HMAC tokenları oluşturur.

## Plivo'ya özel notlar

- **XML vs TwiML**: Plivo, çağrı kontrolü için kendi XML formatını kullanır; bu, TwiML'e benzer ancak aynı değildir. Llamenos adaptörü doğru Plivo XML'ini otomatik olarak oluşturur.
- **Yanıt URL'si vs Kapatma URL'si**: Plivo, ilk çağrı işleyicisini (Yanıt URL'si) çağrı sonu işleyicisinden (Kapatma URL'si) ayırır; bu, Twilio'nun tek bir durum geri çağrısı kullanmasından farklıdır.
- **Hız limitleri**: Plivo'nun hesap katmanına göre değişen API hız limitleri vardır. Yüksek hacimli yardım hatları için, limitleri artırmak için Plivo desteğiyle iletişime geçin.

## Sorun giderme

- **"Auth ID geçersiz"**: Auth ID, e-posta adresiniz değildir. Plivo Konsol paneli ana sayfasında bulabilirsiniz.
- **Çağrılar yönlendirilmiyor**: Telefon numarasının doğru XML Uygulamasına bağlı olduğunu doğrulayın.
- **Yanıt URL'si hataları**: Plivo, geçerli XML yanıtları bekler. Sunucu günlüklerinizi yanıt hataları için kontrol edin.
- **Giden çağrı kısıtlamaları**: Deneme hesapları giden aramalarla ilgili sınırlamalara sahiptir. Üretim kullanımı için yükseltin.
