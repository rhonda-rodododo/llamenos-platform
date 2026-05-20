---
title: WebRTC Tarayıcı Çağrıları
description: Gönüllüler için WebRTC kullanarak tarayıcıda çağrı yanıtlamayı etkinleştirin.
---

WebRTC (Web Gerçek Zamanlı İletişim), gönüllülerin telefona ihtiyaç duymadan doğrudan tarayıcılarında yardım hattı çağrılarını yanıtlamasına olanak tanır. Bu, telefon numaralarını paylaşmak istemeyen veya bilgisayardan çalışan gönüllüler için kullanışlıdır.

## Nasıl çalışır

1. Yönetici telefon sağlayıcı ayarlarında WebRTC'yi etkinleştirir
2. Gönüllüler profillerinde arama tercihlerini "Tarayıcı" olarak ayarlar
3. Bir çağrı geldiğinde, Llamenos uygulaması bildirimle tarayıcıda çalar
4. Gönüllü "Yanıtla"ya tıklar ve çağrı mikrofonunu kullanarak tarayıcı üzerinden bağlanır

Çağrı sesi, telefon sağlayıcısından gönüllünün tarayıcısına bir WebRTC bağlantısı üzerinden yönlendirilir. Çağrı kalitesi, gönüllünün internet bağlantısına bağlıdır.

## Ön koşullar

### Yönetici kurulumu

- WebRTC etkinleştirilmiş desteklenen bir telefon sağlayıcısı (Twilio, SignalWire, Vonage veya Plivo)
- Sağlayıcıya özgü WebRTC kimlik bilgileri yapılandırıldı (sağlayıcı kurulum kılavuzlarına bakın)
- **Ayarlar** > **Telefon Sağlayıcısı** bölümünde WebRTC açık

### Gönüllü gereksinimleri

- Modern bir tarayıcı (Chrome, Firefox, Edge veya Safari 14.1+)
- Çalışan bir mikrofon
- Kararlı bir internet bağlantısı (minimum 100 kbps yukarı/aşağı)
- Tarayıcı bildirim izinleri verildi

## Sağlayıcıya özgü kurulum

Her telefon sağlayıcısı WebRTC için farklı kimlik bilgileri gerektirir:

### Twilio / SignalWire

1. Sağlayıcı konsolunda bir **API Anahtarı** oluşturun
2. Ses URL'sini `https://your-domain.com/api/telephony/webrtc-incoming` olarak ayarlanmış bir **TwiML/LaML Uygulaması** oluşturun
3. Llamenos'ta API Anahtarı SID, API Anahtarı Secret ve Uygulama SID'sini girin

### Vonage

1. Vonage Uygulamanız zaten WebRTC yeteneğini içerir
2. Llamenos'ta Uygulamanızın **özel anahtarını** (PEM formatında) yapıştırın
3. Uygulama Kimliği ilk kurulumdan zaten yapılandırılmıştır

### Plivo

1. Plivo Konsolunda **Ses** > **Uç Noktalar** altında bir **Uç Nokta** oluşturun
2. WebRTC mevcut Auth ID ve Auth Token'ınızı kullanır
3. Llamenos'ta WebRTC'yi etkinleştirin — ek kimlik bilgileri gerekmez

### Asterisk

Asterisk WebRTC, WebSocket aktarımı ile SIP.js yapılandırması gerektirir. Bu, bulut sağlayıcılardan daha karmaşıktır:

1. Asterisk'in `http.conf` dosyasında WebSocket aktarımını etkinleştirin
2. DTLS-SRTP ile WebRTC istemcileri için PJSIP uç noktaları oluşturun
3. Asterisk seçildiğinde Llamenos SIP.js istemcisini otomatik olarak yapılandırır

Tam ayrıntılar için [Asterisk kurulum kılavuzuna](/docs/deploy/providers/asterisk) bakın.

## Gönüllü arama tercihi kurulumu

Gönüllüler uygulamada arama tercihlerini yapılandırır:

1. Llamenos'a giriş yapın
2. **Ayarlar** (dişli simgesi) bölümüne gidin
3. **Arama Tercihleri** altında, **Telefon** yerine **Tarayıcı** seçeneğini seçin
4. İstendiğinde mikrofon ve bildirim izinleri verin
5. Vardiyanız sırasında Llamenos sekmesini açık tutun

Bir çağrı geldiğinde, bir tarayıcı bildirimi ve uygulama içi çalma göstergesi göreceksiniz. Bağlanmak için **Yanıtla**'ya tıklayın.

## Tarayıcı uyumluluğu

| Tarayıcı | Masaüstü | Mobil | Notlar |
|---|---|---|---|
| Chrome | Evet | Evet | Önerilen |
| Firefox | Evet | Evet | Tam destek |
| Edge | Evet | Evet | Chromium tabanlı, tam destek |
| Safari | Evet (14.1+) | Evet (14.1+) | Ses başlatmak için kullanıcı etkileşimi gerektirir |
| Brave | Evet | Sınırlı | Mikrofon için kalkanları devre dışı bırakması gerekebilir |

## Ses kalitesi ipuçları

- Yankıyı önlemek için kulaklık veya kulak içi kulaklık kullanın
- Mikrofonu kullanan diğer uygulamaları kapatın
- Mümkünse kablolu internet bağlantısı kullanın
- WebRTC'yi engelleyebilecek tarayıcı uzantılarını devre dışı bırakın (VPN uzantıları, WebRTC sızıntı koruması olan reklam engelleyiciler)

## Sorun giderme

### Ses yok

- **Mikrofon izinlerini kontrol edin**: Adres çubuğundaki kilit simgesine tıklayın ve mikrofon erişiminin "İzin Ver" olduğundan emin olun
- **Mikrofonunuzu test edin**: Tarayıcınızın yerleşik ses testini veya [webcamtest.com](https://webcamtest.com) gibi bir siteyi kullanın
- **Ses çıkışını kontrol edin**: Hoparlörlerinizin veya kulaklığınızın çıkış cihazı olarak seçildiğinden emin olun

### Çağrılar tarayıcıda çalmıyor

- **Bildirimler engellendi**: Llamenos sitesi için tarayıcı bildirimlerinin etkinleştirildiğini kontrol edin
- **Sekme aktif değil**: Llamenos sekmesi açık olmalıdır (arka planda olabilir, ancak sekme var olmalıdır)
- **Arama tercihi**: Ayarlar'da arama tercihinizin "Tarayıcı" olarak ayarlandığını doğrulayın
- **WebRTC yapılandırılmadı**: Yöneticinizden WebRTC'nin etkinleştirildiğini ve kimlik bilgilerinin ayarlandığını doğrulamasını isteyin

### Güvenlik duvarı ve NAT sorunları

WebRTC, güvenlik duvarlarını ve NAT'yi geçmek için STUN/TURN sunucuları kullanır. Çağrılar bağlanıyor ancak ses duyamıyorsanız:

- **Kurumsal güvenlik duvarları**: Bazı güvenlik duvarları standart dışı bağlantı noktalarındaki UDP trafiğini engeller. BT ekibinizden 3478 ve 10000-60000 numaralı bağlantı noktalarındaki UDP trafiğine izin vermesini isteyin
- **Simetrik NAT**: Bazı yönlendiriciler simetrik NAT kullanır; bu, doğrudan eş bağlantılarını engelleyebilir. Telefon sağlayıcınızın TURN sunucuları bunu otomatik olarak işlemelidir
- **VPN müdahalesi**: VPN'ler WebRTC bağlantılarını engelleyebilir. Vardiyalar sırasında VPN'nizi bağlantısını kesmeyi deneyin

### Yankı veya geri bildirim

- Hoparlörler yerine kulaklık kullanın
- İşletim sistemi ses ayarlarınızda mikrofon hassasiyetini azaltın
- Tarayıcınızda yankı gidermeyi etkinleştirin (genellikle varsayılan olarak etkindir)
- Sert, yansıtıcı yüzeylerden uzaklaşın
