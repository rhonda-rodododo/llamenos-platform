---
title: "Kurulum: Vonage"
description: Vonage'ı telefon sağlayıcınız olarak yapılandırmak için adım adım kılavuz.
---

Vonage (eski adıyla Nexmo), güçlü uluslararası kapsama ve rekabetçi fiyatlandırma sunar. Twilio'dan farklı bir API modeli kullanır — Vonage Uygulamaları, numaranızı, webhook'larınızı ve kimlik bilgilerinizi bir araya getirir.

## Ön koşullar

- Bir [Vonage hesabı](https://dashboard.nexmo.com/sign-up) (ücretsiz kredi mevcut)
- Herkese açık bir URL üzerinden dağıtılmış ve erişilebilir Llamenos örneğiniz

## 1. Vonage hesabı oluşturun

[Vonage API Paneli](https://dashboard.nexmo.com/sign-up) adresinden kaydolun. Hesabınızı doğrulayın ve panel ana sayfasından **API Anahtarınızı** ve **API Secret**'ınızı not edin.

## 2. Telefon numarası satın alın

1. Vonage Panelinde **Numaralar** > **Numara satın al** bölümüne gidin
2. Ülkenizi seçin ve **Ses** yeteneğine sahip bir numara seçin
3. Numarayı satın alın

## 3. Bir Vonage Uygulaması oluşturun

Vonage, yapılandırmayı "Uygulamalar" halinde gruplandırır:

1. **Uygulamalar** > **Yeni uygulama oluştur** bölümüne gidin
2. Bir ad girin (örn. "Llamenos Yardım Hattı")
3. **Ses** altında, açın ve şunları ayarlayın:
   - **Yanıt URL'si**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Olay URL'si**: `https://your-domain.com/api/telephony/status` (POST)
4. **Yeni uygulama oluştur**'a tıklayın
5. Onay sayfasında gösterilen **Uygulama Kimliğini** kaydedin
6. **Özel anahtar** dosyasını indirin — yapılandırma için içeriğine ihtiyacınız olacak

## 4. Telefon numarasını bağlayın

1. **Numaralar** > **Numaralarınız** bölümüne gidin
2. Yardım hattı numaranızın yanındaki dişli simgesine tıklayın
3. **Ses** altında, 3. adımda oluşturduğunuz Uygulamayı seçin
4. **Kaydet**'e tıklayın

## 5. Llamenos'ta yapılandırın

1. Yönetici olarak oturum açın
2. **Ayarlar** > **Telefon Sağlayıcısı** bölümüne gidin
3. Sağlayıcı açılır menüsünden **Vonage**'ı seçin
4. Şunları girin:
   - **API Anahtarı**: Vonage Paneli ana sayfasından
   - **API Secret**: Vonage Paneli ana sayfasından
   - **Uygulama Kimliği**: 3. adımdan
   - **Telefon Numarası**: satın aldığınız numara (E.164 formatında)
5. **Kaydet**'e tıklayın

## 6. Kurulumu test edin

Yardım hattı numaranızı arayın. Dil seçimi menüsünü duymalısınız. Çağrıların vardiyadaki gönüllülere yönlendirildiğini doğrulayın.

## WebRTC kurulumu (isteğe bağlı)

Vonage WebRTC, zaten oluşturduğunuz Uygulama kimlik bilgilerini kullanır:

1. Llamenos'ta, **Ayarlar** > **Telefon Sağlayıcısı** bölümüne gidin
2. **WebRTC Çağrısı**'nı açın
3. **Özel Anahtar** içeriğini girin (indirdiğiniz dosyadan tam PEM metni)
4. **Kaydet**'e tıklayın

Uygulama Kimliği zaten yapılandırılmıştır. Vonage, tarayıcı kimlik doğrulaması için özel anahtarı kullanarak RS256 JWT'leri oluşturur.

## Vonage'a özel notlar

- **NCCO vs TwiML**: Vonage, XML işaretleme yerine JSON formatında NCCO (Nexmo Çağrı Kontrol Nesneleri) kullanır. Llamenos adaptörü doğru formatı otomatik olarak oluşturur.
- **Yanıt URL formatı**: Vonage, yanıt URL'sinin XML (TwiML) değil JSON (NCCO) döndürmesini bekler. Bu, adaptör tarafından işlenir.
- **Olay URL'si**: Vonage, çağrı olaylarını (çalma, yanıtlama, tamamlanma) JSON POST istekleri olarak olay URL'sine gönderir.
- **Özel anahtar güvenliği**: Özel anahtar şifrelenmiş olarak saklanır. Sunucuyu asla terk etmez — yalnızca kısa ömürlü JWT tokenları oluşturmak için kullanılır.

## Sorun giderme

- **"Uygulama bulunamadı"**: Uygulama Kimliğinin tam olarak eşleştiğini doğrulayın. Vonage Panelinde **Uygulamalar** altında bulabilirsiniz.
- **Gelen çağrı yok**: Telefon numarasının doğru Uygulamaya bağlı olduğundan emin olun (4. adım).
- **Özel anahtar hataları**: `-----BEGIN PRIVATE KEY-----` ve `-----END PRIVATE KEY-----` satırları dahil tam PEM içeriğini yapıştırın.
- **Uluslararası numara formatlama**: Vonage, E.164 formatını gerektirir. `+` ve ülke kodunu dahil edin.
