---
title: "Kurulum: WhatsApp"
description: Şifrelenmiş mesajlaşma için Meta Cloud API üzerinden WhatsApp Business'ı bağlayın.
---

Llamenos, Meta Cloud API (Graph API v21.0) aracılığıyla WhatsApp Business mesajlaşmayı destekler. WhatsApp, metin, görüntü, belge, ses ve etkileşimli mesajları destekleyerek zengin mesajlaşma olanağı tanır.

## Ön koşullar

- Bir [Meta Business hesabı](https://business.facebook.com)
- Bir WhatsApp Business API telefon numarası
- WhatsApp ürünü etkinleştirilmiş bir Meta geliştirici uygulaması

## Entegrasyon modları

Llamenos iki WhatsApp entegrasyon modunu destekler:

### Meta Direct (önerilen)

Doğrudan Meta Cloud API'ye bağlanın. Tam kontrol ve tüm özellikleri sunar.

**Gerekli kimlik bilgileri:**
- **Telefon Numarası Kimliği** — WhatsApp Business telefon numaranızın kimliği
- **Business Hesap Kimliği** — Meta Business Hesap Kimliğiniz
- **Erişim Anahtarı** — uzun ömürlü bir Meta API erişim anahtarı
- **Doğrulama Anahtarı** — webhook doğrulaması için seçtiğiniz özel bir dize
- **Uygulama Gizli Anahtarı** — webhook imza doğrulaması için Meta uygulama gizli anahtarınız

### Twilio modu

Ses için Twilio kullanıyorsanız, WhatsApp'ı Twilio hesabınız üzerinden yönlendirebilirsiniz. Daha basit kurulum, ancak bazı özellikler sınırlı olabilir.

**Gerekli kimlik bilgileri:**
- Mevcut Twilio Hesap SID'niz, Auth Token'ınız ve Twilio bağlı WhatsApp göndericiniz

## 1. Bir Meta uygulaması oluşturun

1. [developers.facebook.com](https://developers.facebook.com) adresine gidin
2. Yeni bir uygulama oluşturun (tür: İşletme)
3. **WhatsApp** ürününü ekleyin
4. WhatsApp > Başlangıç bölümünde **Telefon Numarası Kimliğinizi** ve **Business Hesap Kimliğinizi** not edin
5. Kalıcı bir erişim anahtarı oluşturun (Ayarlar > Erişim Anahtarları)

## 2. Webhook'u yapılandırın

Meta geliştirici panelinde:

1. WhatsApp > Yapılandırma > Webhook bölümüne gidin
2. Geri Çağrı URL'sini şu şekilde ayarlayın:
   ```
   https://your-domain.com/api/messaging/whatsapp/webhook
   ```
3. Doğrulama Anahtarını, Llamenos yönetici ayarlarına gireceğiniz aynı dizeye ayarlayın
4. `messages` webhook alanına abone olun

Meta, webhook'u doğrulamak için bir GET isteği gönderecektir. Doğrulama anahtarı eşleşirse sunucunuz zorlukla yanıt verecektir.

## 3. Yönetici ayarlarında WhatsApp'ı etkinleştirin

**Yönetici Ayarları > Mesajlaşma Kanalları** bölümüne gidin (veya kurulum sihirbazını kullanın) ve **WhatsApp**'ı açın.

**Meta Direct** veya **Twilio** modunu seçin ve gerekli kimlik bilgilerini girin.

İsteğe bağlı ayarları yapılandırın:
- **Otomatik yanıt mesajı** — ilk kez iletişime geçenlere gönderilir
- **Mesai saatleri dışı yanıtı** — mesai saatleri dışında gönderilir

## 4. Test edin

Business telefon numaranıza bir WhatsApp mesajı gönderin. Konuşmanın **Konuşmalar** sekmesinde görünmesi gerekir.

## 24 saatlik mesajlaşma penceresi

WhatsApp 24 saatlik bir mesajlaşma penceresi uygular:
- Kullanıcının son mesajından sonraki 24 saat içinde yanıt verebilirsiniz
- 24 saat sonra, konuşmayı yeniden başlatmak için onaylanmış bir **şablon mesajı** kullanmalısınız
- Llamenos bunu otomatik olarak işler — pencere süresi dolarsa, konuşmayı yeniden başlatmak için bir şablon mesaj gönderir

## Medya desteği

WhatsApp zengin medya mesajlarını destekler:
- **Görüntüler** (JPEG, PNG)
- **Belgeler** (PDF, Word, vb.)
- **Ses** (MP3, OGG)
- **Video** (MP4)
- **Konum** paylaşımı
- **Etkileşimli** düğmeler ve liste mesajları

Medya ekleri konuşma görünümünde satır içinde görünür.

## Güvenlik notları

- WhatsApp, kullanıcı ile Meta'nın altyapısı arasında uçtan uca şifreleme kullanır
- Meta teknik olarak sunucularındaki mesaj içeriğine erişebilir
- Mesajlar alındığında şifrelenir ve veritabanında saklanır
- Webhook imzaları, uygulama gizli anahtarınızla HMAC-SHA256 kullanılarak doğrulanır
- Maksimum gizlilik için WhatsApp yerine Signal kullanmayı düşünün
