---
title: Telefon Sağlayıcıları
description: Desteklenen telefon sağlayıcılarını karşılaştırın ve yardım hattınız için en uygun olanı seçin.
---

Llamenos, **TelephonyAdapter** arayüzü aracılığıyla birden fazla telefon sağlayıcısını destekler. Uygulama kodunu değiştirmeden yönetici ayarlarından istediğiniz zaman sağlayıcı değiştirebilirsiniz.

## Desteklenen sağlayıcılar

| Sağlayıcı | Tür | Fiyatlandırma Modeli | WebRTC Desteği | Kurulum Zorluğu | En İyi Şu Durumlar İçin |
|---|---|---|---|---|---|
| **Twilio** | Bulut | Dakika başına | Evet | Kolay | Hızlı başlangıç |
| **SignalWire** | Bulut | Dakika başına (daha ucuz) | Evet | Kolay | Maliyet bilinçli kuruluşlar |
| **Vonage** | Bulut | Dakika başına | Evet | Orta | Uluslararası kapsama |
| **Plivo** | Bulut | Dakika başına | Evet | Orta | Bütçe dostu bulut seçeneği |
| **Telnyx** | Bulut | Dakika başına | Evet | Orta | Geliştirici dostu |
| **Bandwidth** | Bulut | Dakika başına | Evet | Orta | ABD taşıyıcı kalitesi |
| **Asterisk** | Kendi sunucunuzda | Sadece SIP trunk maliyeti | Evet (sip-bridge aracılığıyla) | Zor | Maksimum gizlilik |
| **FreeSWITCH** | Kendi sunucunuzda | Sadece SIP trunk maliyeti | Evet (sip-bridge aracılığıyla) | Zor | Yüksek hacim |

## Fiyat karşılaştırması

ABD sesli aramaları için yaklaşık dakika başına maliyetler (bölge ve hacme göre değişir):

| Sağlayıcı | Gelen | Giden | Telefon Numarası | Ücretsiz Katman |
|---|---|---|---|---|
| Twilio | $0,0085 | $0,014 | $1,15/ay | Deneme kredisi |
| SignalWire | $0,005 | $0,009 | $1,00/ay | Deneme kredisi |
| Vonage | $0,0049 | $0,0139 | $1,00/ay | Ücretsiz kredi |
| Plivo | $0,0055 | $0,010 | $0,80/ay | Deneme kredisi |
| Telnyx | $0,005 | $0,009 | $1,00/ay | Deneme kredisi |
| Asterisk | SIP trunk oranı | SIP trunk oranı | SIP sağlayıcısından | Yok |

## Özellik destek matrisi

| Özellik | Twilio | SignalWire | Vonage | Plivo | Asterisk |
|---|---|---|---|---|---|
| Çağrı kaydı | Evet | Evet | Evet | Evet | Evet |
| Canlı transkripsiyon | Evet | Evet | Evet | Evet | Evet (köprü aracılığıyla) |
| Sesli CAPTCHA | Evet | Evet | Evet | Evet | Evet |
| Sesli mesaj | Evet | Evet | Evet | Evet | Evet |
| WebRTC tarayıcı çağrısı | Evet | Evet | Evet | Evet | Evet (SIP.js) |
| Webhook doğrulama | Evet | Evet | Evet | Evet | Özel (HMAC) |
| Paralel çalma | Evet | Evet | Evet | Evet | Evet |

## SIP köprüsü

Kendi sunucunuzda barındırılan sağlayıcılar (Asterisk, FreeSWITCH, Kamailio) `sip-bridge` hizmeti aracılığıyla erişilir. Arka ucu seçmek için `PBX_TYPE` ortam değişkenini ayarlayın:

```env
PBX_TYPE=asterisk      # Asterisk ARI
PBX_TYPE=freeswitch    # FreeSWITCH ESL
PBX_TYPE=kamailio      # Kamailio
```

## Nasıl yapılandırılır

1. Yönetici kenar çubuğundan **Ayarlar** bölümüne gidin
2. **Telefon Sağlayıcısı** bölümünü açın
3. Açılır menüden sağlayıcınızı seçin
4. Gerekli kimlik bilgilerini girin
5. Yardım hattı telefon numaranızı E.164 formatında ayarlayın (örn. `+15551234567`)
6. **Kaydet**'e tıklayın
7. Sağlayıcınızın konsolunda webhook'ları yapılandırın

Bireysel kurulum kılavuzlarına bakın:

- [Kurulum: Twilio](/docs/en/deploy/providers/twilio)
- [Kurulum: SignalWire](/docs/en/deploy/providers/signalwire)
- [Kurulum: Vonage](/docs/en/deploy/providers/vonage)
- [Kurulum: Plivo](/docs/en/deploy/providers/plivo)
- [Kurulum: Asterisk (Kendi Sunucunuzda)](/docs/en/deploy/providers/asterisk)
- [Kurulum: SMS](/docs/en/deploy/providers/sms)
- [Kurulum: WhatsApp](/docs/en/deploy/providers/whatsapp)
- [Kurulum: Signal](/docs/en/deploy/providers/signal)
- [WebRTC Tarayıcı Çağrıları](/docs/en/deploy/providers/webrtc)
