---
title: Mobil Kılavuz
description: Llamenos mobil uygulamasını iOS ve Android'e kurun ve yapılandırın.
---

Llamenos mobil uygulaması, gönüllülerin telefonlarından çağrı yanıtlamasına, mesajlara yanıt vermesine ve şifrelenmiş not yazmasına olanak tanır. React Native ile oluşturulmuştur ve masaüstü uygulamasıyla aynı Rust kriptografik çekirdeğini paylaşır.

## Mobil uygulama nedir?

Mobil uygulama, masaüstü uygulamasının bir tamamlayıcısıdır. Aynı Llamenos arka ucuna (Cloudflare Workers veya kendi sunucunuzda) bağlanır ve aynı protokolü kullanır, böylece gönüllüler masaüstü ve mobil arasında sorunsuzca geçiş yapabilir.

Mobil uygulama ayrı bir depoda (`llamenos-platform`) bulunur ancak şunları paylaşır:

- **llamenos-core** — Tüm kriptografik işlemler için aynı Rust crate'i, iOS ve Android için UniFFI aracılığıyla derlenmiş
- **Protokol** — Aynı kablo formatı, API uç noktaları ve şifreleme şeması
- **Arka Uç** — Aynı Cloudflare Worker veya kendi sunucunuzda barındırılan sunucu

## İndirme ve kurulum

### Android

Mobil uygulama şu anda yan yükleme için bir APK olarak dağıtılmaktadır:

1. [GitHub Releases](https://github.com/rhonda-rodododo/llamenos-platform/releases/latest) sayfasından en son `.apk` dosyasını indirin
2. Android cihazınızda **Ayarlar > Güvenlik** bölümüne gidin ve **Bilinmeyen kaynaklardan yükle** seçeneğini etkinleştirin (veya istendiğinde uygulama bazında etkinleştirin)
3. İndirilen APK'yi açın ve **Yükle**'ye dokunun
4. Kurulum tamamlandıktan sonra uygulama çekmecenizden Llamenos'u açın

App Store ve Play Store dağıtımı gelecek bir sürüm için planlanmaktadır.

### iOS

iOS yapıları TestFlight beta sürümleri olarak mevcuttur:

1. App Store'dan [TestFlight](https://apps.apple.com/app/testflight/id899247664)'ı yükleyin
2. Yöneticinizden TestFlight davet bağlantısını isteyin
3. Bağlantıyı iOS cihazınızda açarak betaya katılın
4. TestFlight'tan Llamenos'u yükleyin

App Store dağıtımı gelecek bir sürüm için planlanmaktadır.

## İlk kurulum

Mobil uygulama, mevcut bir masaüstü hesabına bağlanarak kurulur. Bu, aynı kriptografik kimliğin cihazlar arasında kullanılmasını sağlar, gizli anahtarın düz metin olarak iletilmemesini sağlar.

### Cihaz hazırlama (QR tarama)

1. Llamenos masaüstü uygulamasını açın ve **Ayarlar > Cihazlar** bölümüne gidin
2. **Yeni Cihaz Bağla**'ya tıklayın — bu, tek kullanımlık bir hazırlama anahtarı içeren bir QR kodu oluşturur
3. Llamenos mobil uygulamasını açın ve **Cihaz Bağla**'ya dokunun
4. Telefonunuzun kamerasıyla QR kodunu tarayın
5. Uygulamalar, şifrelenmiş anahtar materyalinizi güvenli bir şekilde aktarmak için geçici bir ECDH anahtar değişimi gerçekleştirir
6. Mobil uygulamada yerel anahtar depolamanızı korumak için bir PIN ayarlayın
7. Mobil uygulama artık bağlı ve kullanıma hazır

Hazırlama süreci nsec'inizi asla düz metin olarak iletmez. Masaüstü uygulaması anahtar materyalini geçici paylaşılan gizli anahtarla sarar ve mobil uygulama bunu yerel olarak açar.

### Manuel kurulum (nsec girişi)

Bir QR kodu tarayamazsanız, nsec'inizi doğrudan girebilirsiniz:

1. Mobil uygulamayı açın ve **nsec'i manuel olarak gir**'e dokunun
2. `nsec1...` anahtarınızı yapıştırın
3. Yerel depolamayı korumak için bir PIN ayarlayın
4. Uygulama genel anahtarınızı türetir ve arka uçla kaydeder

Bu yöntem nsec'inizi doğrudan işlemenizi gerektirir, bu nedenle cihaz bağlama mümkün değilse kullanın. Yazmak yerine bir parola yöneticisi kullanarak nsec'i yapıştırın.

## Özellik karşılaştırması

| Özellik | Masaüstü | Mobil |
|---|---|---|
| Gelen çağrıları yanıtlama | Evet | Evet |
| Şifrelenmiş not yazma | Evet | Evet |
| Özel not alanları | Evet | Evet |
| Mesajlara yanıt verme (SMS, WhatsApp, Signal) | Evet | Evet |
| Konuşmaları görüntüleme | Evet | Evet |
| Vardiya durumu ve molalar | Evet | Evet |
| İstemci tarafı transkripsiyon | Evet (WASM Whisper) | Hayır |
| Not arama | Evet | Evet |
| Komut paleti | Evet (Ctrl+K) | Hayır |
| Klavye kısayolları | Evet | Hayır |
| Yönetici ayarları | Evet (tam) | Evet (sınırlı) |
| Gönüllüleri yönetme | Evet | Sadece görüntüleme |
| Denetim kayıtlarını görüntüleme | Evet | Evet |
| WebRTC tarayıcı çağrıları | Evet | Hayır (yerel telefon kullanır) |
| Anında bildirimler | OS bildirimleri | Yerel anında bildirim (FCM/APNS) |
| Otomatik güncelleme | Tauri güncelleyici | App Store / TestFlight |
| Dosya ekleri (raporlar) | Evet | Evet |

## Sınırlamalar

- **İstemci tarafı transkripsiyon yok** — WASM Whisper modeli, mobilde pratik olmayan önemli bellek ve CPU kaynakları gerektirir. Çağrı transkripsiyonu sadece masaüstünde mevcuttur.
- **Düşük kripto performansı** — Mobil uygulama aynı Rust kripto çekirdeğini UniFFI aracılığıyla kullanırken, işlemler düşük kaliteli cihazlarda masaüstü yerel performansına göre daha yavaş olabilir.
- **Sınırlı yönetici özellikleri** — Bazı yönetici işlemleri (toplu gönüllü yönetimi, ayrıntılı ayar yapılandırması) sadece masaüstü uygulamasında mevcuttur. Mobil uygulama çoğu yönetici ekranı için salt okunur görünümler sağlar.
- **WebRTC çağrısı yok** — Mobil gönüllüler çağrıları telefon numaraları üzerinden telefon sağlayıcısı aracılığıyla alır, tarayıcı üzerinden değil. WebRTC uygulama içi çağrısı sadece masaüstündedir.
- **Pil ve bağlantı** — Uygulama, gerçek zamanlı güncellemeleri almak için kalıcı bir bağlantıya ihtiyaç duyar. Arka plan modu, OS güç yönetimi tarafından sınırlanabilir. Güvenilir bildirimler için vardiyalar sırasında uygulamayı ön planda tutun.

## Mobil sorunları giderme

### Hazırlama "Geçersiz QR kodu" ile başarısız oluyor

- QR kodunun yakın zamanda oluşturulduğundan emin olun (hazırlama anahtarları 5 dakika sonra sona erer)
- Masaüstü uygulamasından yeni bir QR kodu oluşturun ve tekrar deneyin
- Her iki cihazın da internete bağlı olduğundan emin olun

### Anında bildirimler alınmıyor

- Cihaz ayarlarınızda Llamenos için bildirimlerin etkinleştirildiğini kontrol edin
- Android'de: **Ayarlar > Uygulamalar > Llamenos > Bildirimler** bölümüne gidin ve tüm kanalları etkinleştirin
- iOS'ta: **Ayarlar > Bildirimler > Llamenos** bölümüne gidin ve **Bildirimlere İzin Ver** seçeneğini etkinleştirin
- Rahatsız Etmeyin modunda olmadığınızdan emin olun
- Vardiyanızın aktif olduğunu ve molada olmadığınızı doğrulayın

### Uygulama başlatmada çöküyor

- Uygulamanın en son sürümünü çalıştırdığınızdan emin olun
- Uygulama önbelleğini temizleyin: **Ayarlar > Uygulamalar > Llamenos > Depolama > Önbelleği Temizle**
- Sorun devam ederse, kaldırın ve yeniden yükleyin (cihazı yeniden bağlamanız gerekecektir)

### Yeniden kurulumdan sonra eski notların şifresi çözülemiyor

- Uygulamayı yeniden kurmak yerel anahtar materyalini kaldırır
- Erişimi geri yüklemek için masaüstü uygulamanızdan QR kodu aracılığıyla cihazı yeniden bağlayın
- Yeniden kurulumdan önce şifrelenen notlar, cihaz aynı kimlikle yeniden bağlandığında erişilebilir olacaktır

### Eski cihazlarda yavaş performans

- Belleği boşaltmak için diğer uygulamaları kapatın
- Varsa, uygulama ayarlarında animasyonları devre dışı bırakın
- Toplu not inceleme gibi yoğun işlemler için masaüstü uygulamasını kullanmayı düşünün
