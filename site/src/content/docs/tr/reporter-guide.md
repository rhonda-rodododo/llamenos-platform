---
title: Muhabir Kılavuzu
description: Şifrelenmiş raporlar nasıl gönderilir ve durumları nasıl takip edilir.
---

Muhabir olarak, Llamenos platformu aracılığıyla kuruluşunuza şifrelenmiş raporlar gönderebilirsiniz. Raporlar uçtan uca şifrelidir — sunucu rapor içeriğinizi asla görmez.

## Başlangıç

Yöneticiniz size şunlardan birini verecektir:
- Bir **nsec** (WebSocket gizli anahtarı) — `nsec1` ile başlayan bir dize
- Bir **davet bağlantısı** — sizin için kimlik bilgileri oluşturan tek kullanımlık bir URL

**nsec'inizi gizli tutun.** Kimliğiniz ve oturum açma kimlik bilginizdir. Bir parola yöneticisinde saklayın.

## Oturum açma

1. Uygulamayı tarayıcınızda açın
2. `nsec`'inizi giriş alanına yapıştırın
3. Kimliğiniz kriptografik olarak doğrulanır — gizli anahtarınız tarayıcınızı asla terk etmez

İlk girişten sonra, daha kolay gelecekteki girişler için Ayarlar'dan bir WebAuthn parola anahtarı kaydedebilirsiniz.

## Rapor gönderme

1. Raporlar sayfasından **Yeni Rapor**'a tıklayın
2. Raporunuz için bir **başlık** girin (bu, yöneticilerin triyaj yapmasına yardımcı olur — düz metin olarak saklanır)
3. Yöneticiniz rapor kategorileri tanımladıysa bir **kategori** seçin
4. Rapor içeriğinizi gövde alanına yazın — bu, tarayıcınızdan ayrılmadan önce şifrelenir
5. İsteğe bağlı olarak yöneticinizin yapılandırdığı **özel alanları** doldurun
6. İsteğe bağlı olarak **dosya ekleyin** — dosyalar yüklemeden önce istemci tarafında şifrelenir
7. **Gönder**'e tıklayın

Raporunuz, durumu "Açık" olan Raporlar listenizde görünür.

## Rapor şifreleme

- Rapor gövdesi ve özel alan değerleri ECIES (secp256k1 + XChaCha20-Poly1305) kullanılarak şifrelenir
- Dosya ekleri aynı şema kullanılarak ayrıca şifrelenir
- Sadece siz ve yönetici içeriğin şifresini çözebilir
- Sunucu sadece şifreli metin saklar — veritabanı ele geçirilse bile rapor içeriğiniz güvendedir

## Raporlarınızı takip etme

Raporlar sayfanız, şunları içeren tüm gönderilen raporlarınızı gösterir:
- **Başlık** ve **kategori**
- **Durum** — Açık, Üstlenildi (bir yönetici üzerinde çalışıyor) veya Çözüldü
- **Tarih** gönderildi

Bir raporu tıklayarak tam konuşmayı, yönetici yanıtları dahil, görüntüleyin.

## Yöneticilere yanıt verme

Bir yönetici raporunuza yanıt verdiğinde, yanıt rapor konuşmasında görünür. Geri yanıt verebilirsiniz — konuşmadaki tüm mesajlar şifrelidir.

## Yapamayacaklarınız

Muhabir olarak, erişiminiz herkesin gizliliğini korumak için sınırlıdır:
- Kendi raporlarınızı ve Yardım sayfasını görüntüleyebilirsiniz
- Diğer muhabirlerin raporlarını, çağrı kayıtlarını, gönüllü bilgilerini veya yönetici ayarlarını göremezsiniz
- Çağrıları yanıtlayamaz veya SMS/WhatsApp/Signal konuşmalarına yanıt veremezsiniz

## İpuçları

- Açıklayıcı başlıklar kullanın — yöneticilerin tam içeriğin şifresini çözmeden triyaj yapmasına yardımcı olurlar
- Raporunuzu destekleyen dosyalar (ekran görüntüleri, belgeler) ekleyin
- Yönetici yanıtları için düzenli olarak kontrol edin — rapor listenizde durum değişikliklerini göreceksiniz
- SSS ve kılavuzlar için Yardım sayfasını kullanın
