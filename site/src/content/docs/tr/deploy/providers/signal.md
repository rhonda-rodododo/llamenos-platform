---
title: "Kurulum: Signal"
description: Gizlilik odaklı mesajlaşma için signal-cli köprüsü üzerinden Signal mesajlaşma kanalını kurun.
---

Llamenos, kendi sunucunuzda barındırılan [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) köprüsü aracılığıyla Signal mesajlaşmayı destekler. Signal, herhangi bir mesajlaşma kanalının en güçlü gizlilik garantilerini sunar; bu da onu hassas kriz müdahale senaryoları için ideal kılar.

## Ön koşullar

- Köprü için bir Linux sunucusu veya VM (Asterisk ile aynı sunucu veya ayrı olabilir)
- Köprü sunucusunda Docker yüklü
- Signal kaydı için özel bir telefon numarası
- Köprüden Llamenos sunucunuza ağ erişimi

## Mimari

![Signal Köprü Mimarisi](/diagrams/signal-bridge.svg)

signal-cli köprüsü altyapınızda çalışır ve mesajları HTTP webhook'ları aracılığıyla sunucunuza iletir. Bu, Signal'dan uygulamanıza kadar tüm mesaj yolunu kontrol ettiğiniz anlamına gelir.

## 1. signal-cli köprüsünü dağıtın

signal-cli-rest-api Docker konteynerini çalıştırın:

```bash
docker run -d \
  --name signal-cli \
  --restart unless-stopped \
  -p 8080:8080 \
  -v signal-cli-data:/home/.local/share/signal-cli \
  -e MODE=json-rpc \
  bbernhard/signal-cli-rest-api:latest
```

## 2. Bir telefon numarası kaydedin

Köprüyü özel bir telefon numarasıyla kaydedin:

```bash
# SMS aracılığıyla bir doğrulama kodu isteyin
curl -X POST http://localhost:8080/v1/register/+1234567890

# Aldığınız kodla doğrulayın
curl -X POST http://localhost:8080/v1/register/+1234567890/verify/123456
```

## 3. Webhook yönlendirmesini yapılandırın

Köprüyü gelen mesajları sunucunuza iletecek şekilde ayarlayın:

```bash
curl -X PUT http://localhost:8080/v1/about \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "url": "https://your-domain.com/api/messaging/signal/webhook",
      "headers": {
        "Authorization": "Bearer your-webhook-secret"
      }
    }
  }'
```

## 4. Yönetici ayarlarında Signal'i etkinleştirin

**Yönetici Ayarları > Mesajlaşma Kanalları** bölümüne gidin (veya kurulum sihirbazını kullanın) ve **Signal**'i açın.

Şunları girin:
- **Köprü URL'si** — signal-cli köprünüzün URL'si (örn. `https://signal-bridge.example.com:8080`)
- **Köprü API Anahtarı** — köprüye yapılan isteklerin kimliğini doğrulamak için bir bearer token
- **Webhook Gizli Anahtarı** — gelen webhook'ları doğrulamak için kullanılan gizli anahtar (3. adımda yapılandırdığınızla eşleşmeli)
- **Kayıtlı Numara** — Signal ile kaydedilen telefon numarası

## 5. Test edin

Kayıtlı telefon numaranıza bir Signal mesajı gönderin. Konuşmanın **Konuşmalar** sekmesinde görünmesi gerekir.

## Sağlık izleme

Llamenos, signal-cli köprüsünün sağlığını izler:
- Köprünün `/v1/about` uç noktasına periyodik sağlık kontrolleri
- Köprüye erişilemezse zarif bozulma — diğer kanallar çalışmaya devam eder
- Köprü çöktüğünde yönetici uyarıları

## Sesli mesaj transkripsiyonu

Signal sesli mesajları, gönüllünün tarayıcısında istemci tarafı Whisper ( `@huggingface/transformers` aracılığıyla WASM) kullanılarak doğrudan transkripte edilebilir. Ses cihazı asla terk etmez — transkript, konuşma görünümündeki sesli mesajın yanında şifrelenir ve saklanır. Gönüllüler transkripsiyonu kişisel ayarlarında etkinleştirebilir veya devre dışı bırakabilir.

## Güvenlik notları

- Signal, kullanıcı ile signal-cli köprüsü arasında uçtan uca şifreleme sağlar
- Köprü, mesajları webhook olarak iletmek için şifresini çözer — köprü sunucusu düz metin erişimine sahiptir
- Webhook kimlik doğrulaması, sabit zamanlı karşılaştırma ile bearer token'ları kullanır
- Köprüyü mümkünse Asterisk sunucunuzla aynı ağda tutun (minimum maruz kalma)
- Köprü, mesaj geçmişini yerel olarak Docker biriminde saklar — bekleyen şifrelemeyi düşünün
- Maksimum gizlilik için: hem Asterisk'i (ses) hem de signal-cli'yi (mesajlaşma) kendi altyapınızda barındırın

## Sorun giderme

- **Köprü mesaj almıyor**: Telefon numarasının `GET /v1/about` ile doğru kaydedildiğini kontrol edin
- **Webhook teslim hataları**: Webhook URL'sinin köprü sunucusundan erişilebilir olduğunu ve yetkilendirme başlığının eşleştiğini doğrulayın
- **Kayıt sorunları**: Bazı telefon numaraları önce mevcut bir Signal hesabından bağlantısının kesilmesi gerekebilir
