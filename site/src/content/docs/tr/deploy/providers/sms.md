---
title: "Kurulum: SMS"
description: Telefon sağlayıcınız üzerinden gelen ve giden SMS mesajlaşmayı etkinleştirin.
---

Llamenos'taki SMS mesajlaşma, mevcut ses telefon sağlayıcı kimlik bilgilerinizi yeniden kullanır. Ayrı bir SMS hizmeti gerekmez — ses için Twilio, SignalWire, Vonage veya Plivo'yu zaten yapılandırdıysanız, SMS aynı hesapla çalışır.

## Desteklenen sağlayıcılar

| Sağlayıcı | SMS Desteği | Notlar |
|----------|------------|-------|
| **Twilio** | Evet | Twilio Mesajlaşma API'si aracılığıyla tam çift yönlü SMS |
| **SignalWire** | Evet | Twilio API'siyle uyumlu — aynı arayüz |
| **Vonage** | Evet | Vonage REST API'si aracılığıyla SMS |
| **Plivo** | Evet | Plivo Mesaj API'si aracılığıyla SMS |
| **Asterisk** | Hayır | Asterisk yerel SMS'i desteklemez |

## 1. Yönetici ayarlarında SMS'i etkinleştirin

**Yönetici Ayarları > Mesajlaşma Kanalları** bölümüne gidin (veya ilk girişte kurulum sihirbazını kullanın) ve **SMS**'i açın.

SMS ayarlarını yapılandırın:
- **Otomatik yanıt mesajı** — ilk kez iletişime geçenlere gönderilen isteğe bağlı karşılama mesajı
- **Mesai saatleri dışı yanıtı** — mesai saatleri dışında gönderilen isteğe bağlı mesaj

## 2. Webhook'u yapılandırın

Telefon sağlayıcınızın SMS webhook'unu sunucunuza yönlendirin:

```
POST https://your-domain.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. Twilio Konsolu > Telefon Numaraları > Aktif Numaralar bölümüne gidin
2. Telefon numaranızı seçin
3. **Mesajlaşma** altında, "Bir mesaj geldiğinde" için webhook URL'sini yukarıdaki URL olarak ayarlayın
4. HTTP yöntemini **POST** olarak ayarlayın

### Vonage

1. Vonage API Paneli > Uygulamalar bölümüne gidin
2. Uygulamanızı seçin
3. **Mesajlar** altında, Gelen URL'yi yukarıdaki webhook URL'si olarak ayarlayın

### Plivo

1. Plivo Konsolu > Mesajlaşma > Uygulamalar bölümüne gidin
2. Bir mesajlaşma uygulaması oluşturun veya düzenleyin
3. Mesaj URL'sini yukarıdaki webhook URL'si olarak ayarlayın
4. Uygulamayı telefon numaranıza atayın

## 3. Test edin

Yardım hattı telefon numaranıza bir SMS gönderin. Mesajın yönetici panelindeki **Konuşmalar** sekmesinde görünmesi gerekir.

## Nasıl çalışır

1. Bir SMS sağlayıcınıza ulaşır, bu da sunucunuza bir webhook gönderir
2. Sunucu webhook imzasını doğrular (sağlayıcıya özgü HMAC)
3. Mesaj ayrıştırılır ve ConversationService'de saklanır
4. Vardiyadaki gönüllüler WebSocket rölesi olayları aracılığıyla bilgilendirilir
5. Gönüllüler Konuşmalar sekmesinden yanıt verir — yanıtlar sağlayıcınızın SMS API'si aracılığıyla geri gönderilir

## Güvenlik notları

- SMS mesajları taşıyıcı ağı üzerinden düz metin olarak iletilir — sağlayıcınız ve taşıyıcılar bunları okuyabilir
- Gelen mesajlar alındığında şifrelenir ve veritabanında saklanır
- Gönderen telefon numaraları depolamadan önce hashlenir (gizlilik)
- Webhook imzaları sağlayıcı başına doğrulanır (Twilio için HMAC-SHA1, vb.)
