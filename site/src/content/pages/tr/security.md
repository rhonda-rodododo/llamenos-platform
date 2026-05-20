---
title: Güvenlik ve Gizlilik
subtitle: Neyin korunduğu, neyin görünür olduğu ve mahkeme celbiyle neyin elde edilebileceği — kullandığınız özelliklere göre düzenlenmiş.
---

## Barındırma sağlayıcınıza mahkeme celbi gönderilirse

| Sağlayabilecekleri | Sağlayamayacakları |
|-------------------|--------------------|
| Çağrı/mesaj meta verileri (saatler, süreler) | Not içeriği, transkriptler, rapor gövdeleri |
| Şifreli veritabanı blobları | Gönüllü isimleri (uçtan uca şifreli) |
| Hangi gönüllü hesaplarının ne zaman aktif olduğu | İletişim dizin kayıtları (uçtan uca şifreli) |
| Yayın mesajı teslimat kayıtları | Mesaj içeriği (gelişte şifreli, şifrelenmiş metin olarak saklanır) |
| | Şifre çözme anahtarları (PIN'inizle, kimlik sağlayıcı hesabınızla ve isteğe bağlı olarak donanım güvenlik anahtarınızla korunur) |
| | Not başına şifreleme anahtarları (geçici — sarma sonrası yok edilir) |
| | Telefon karma değerlerini tersine çevirmek için HMAC sırrınız |
| | Kurtarma payı içeriği (şifreli, sunucu okuyamaz) |

**Sunucu, okuyamadığı verileri saklar.** Meta veriler (ne zaman, ne kadar süre, hangi hesaplar) görünürdür. İçerik (ne söylendiği, ne yazıldığı, kişilerinin kim olduğu) görünür değildir.

---

## Özelliğe göre

Gizlilik maruziyetiniz, hangi kanalları etkinleştirdiğinize bağlıdır:

### Sesli aramalar

| Kullandığınız... | Üçüncü taraflar erişebilir | Sunucu erişebilir | Uçtan uca şifreli içerik |
|-----------------|---------------------------|-------------------|--------------------------|
| Twilio/SignalWire/Vonage/Plivo | Çağrı sesi (canlı), çağrı kayıtları | Çağrı meta verileri | Notlar, transkriptler |
| Kendi barındırılan Asterisk | Hiçbir şey (siz kontrol ediyorsunuz) | Çağrı meta verileri | Notlar, transkriptler |
| Tarayıcıdan tarayıcıya (WebRTC) | Hiçbir şey | Çağrı meta verileri | Notlar, transkriptler |

**Telefoni sağlayıcısı mahkeme celbi**: Çağrı detay kayıtlarına (saatler, telefon numaraları, süreler) sahipler. Çağrı notlarına veya transkriptlere sahip DEĞİLLER. Kayıt varsayılan olarak devre dışıdır.

**Transkripsiyon**: Transkripsiyon, cihaz üstü yapay zeka kullanan tarayıcınızda tamamen gerçekleşir. **Ses hiçbir zaman cihazınızı terk etmez.** Yalnızca şifreli transkript saklanır.

### Metin mesajlaşması (birebir)

| Kanal | Sağlayıcı erişimi | Sunucu depolama | Notlar |
|-------|------------------|-----------------|--------|
| SMS | Telefoni sağlayıcınız tüm mesajları okur | **Şifreli** | Sağlayıcı orijinal mesajları saklar |
| WhatsApp | Meta tüm mesajları okur | **Şifreli** | Sağlayıcı orijinal mesajları saklar |
| Signal | Signal ağı uçtan uca şifreli; köprü gelişte yeniden şifreler | **Şifreli** | Uygun olduğunda tercih edilen rota |

**Signal öncelikli teslimat**: Bir alıcının Signal'ı varsa, mesajlar otomatik olarak Signal üzerinden yönlendirilir — telefoni sağlayıcınız içeriği hiçbir zaman görmez. SMS için varsayılan olarak yalnızca genel bir "yeni mesajınız var" bildirimi gönderilir (mesaj gövdesi yok), bu nedenle sağlayıcınızın günlükleri hassas içerik içermez.

**Mesajlar sunucunuza ulaştığı anda şifrelenir.** Sunucu yalnızca şifrelenmiş metin saklar. Telefoni veya mesajlaşma sağlayıcınız hâlâ orijinal mesaja sahip olabilir — bu o platformların bir sınırlaması, değiştirebileceğimiz bir şey değil.

**Mesajlaşma sağlayıcısı mahkeme celbi**: SMS sağlayıcıları tam mesaj içeriğine yalnızca tam içerikli SMS modunu açıkça etkinleştirirseniz sahiptir. Varsayılan yalnızca bildirim modunda, SMS gövdeleri mesaj içeriği içermez. Meta WhatsApp içeriğine sahiptir. Signal mesajları köprüye uçtan uca şifreli olarak iletilir, ancak köprü (sunucunuzda çalışan) depolama için yeniden şifrelemeden önce bunların şifresini çözer. Her durumda, **sunucunuz yalnızca şifrelenmiş metne sahiptir** — barındırma sağlayıcısı mesaj içeriğini okuyamaz.

### Toplu ve yayın mesajları

Yöneticiler abonelere SMS, WhatsApp, Signal veya RCS aracılığıyla yayın mesajları gönderebilir.

**Önemli: giden yayın mesajları sunucuda uçtan uca şifreli değildir.** SMS veya WhatsApp abonelerine bir mesaj iletmek için, sunucu düz metin içeriği anlık olarak işlemeli ve mesajlaşma sağlayıcısına iletmelidir. Sağlayıcı daha sonra iletir ve bir kopyasını saklayabilir.

| Kanal | Gönderme sırasında sunucu erişimi | Sağlayıcı erişimi | Teslimattan sonra |
|-------|----------------------------------|-------------------|-------------------|
| SMS toplu | Düz metin (anlık, teslimat için) | Tam mesaj içeriği | Sağlayıcı saklar |
| WhatsApp toplu | Düz metin (anlık, teslimat için) | Tam mesaj içeriği (Meta) | Sağlayıcı saklar |
| Signal toplu | Düz metin (anlık, teslimat için) | Signal ağı üzerinden uçtan uca şifreli | Sağlayıcı saklamaz |
| RCS toplu | Düz metin (anlık, teslimat için) | Google içeriği görebilir | Sağlayıcı saklar |

**Bu ne anlama gelir**: Yayın mesajları hassas arayan bilgileri içermemelidir. Duyurular, zamanlama bildirimleri ve kaynaklar için kullanın — arayanları veya gönüllüleri tanımlayabilecek vaka ayrıntıları veya herhangi bir şey için değil.

Abone telefon numaraları karma tanımlayıcılar olarak saklanır — veritabanınız hiçbir zaman düz metin abone listesi içermez. Abonelikten çıkma (DURDUR) talepleri derhal işlenir ve abone durumu güncellenir.

### Notlar, transkriptler ve raporlar

Tüm gönüllü tarafından yazılan içerik uçtan uca şifrelenir:

- Her not, **benzersiz rastgele anahtar** kullanır (ileri gizlilik — bir notu tehlikeye atmak diğerlerini tehlikeye atmaz)
- Anahtarlar gönüllü ve her yönetici için ayrı ayrı sarılır
- Sunucu yalnızca şifrelenmiş metin saklar
- Şifre çözme, anahtarları asla uygulamanın kullanıcı arabirimine açmayan güvenli bir katmanda cihazınızda gerçekleşir
- **Özel alanlar, rapor içeriği ve dosya ekleri hepsi ayrı ayrı şifrelenir**

**Vaka kayıtları ve varlık verileri**: Yapılandırılmış vaka kayıtları (kişiler, vakalar, kanıt zincirleri) aynı şifreleme modelini izler — her öğe benzersiz bir anahtarla şifrelenir, yetkili görüntüleyiciler için sarılır. Sunucu vaka içeriğini okuyamaz.

**Cihaz el koyma**: PIN'iniz **ve** kimlik sağlayıcı hesabınıza erişim olmadan, saldırganlar Argon2id — özel donanımla (GPU'lar, ASIC'ler) kaba kuvvet saldırılarını geleneksel yaklaşımlardan kat kat daha pahalı hale getiren bellek yoğun bir anahtar türetme işlevi — ile korunan şifreli bir blob alır. Ayrıca bir donanım güvenlik anahtarı kullanıyorsanız, **üç bağımsız faktör** verilerinizi korur.

---

## Cihazlarınız

### Cihazları görüntüleme ve iptal etme

Uygulama, giriş yaptığınız her cihazın listesini tutar. Bu listeyi görüntüleyebilir ve tanımadığınız herhangi bir cihazı iptal edebilirsiniz.

**Bir cihazı iptal ettiğinizde:**
- O cihaz hesabınıza erişimden hemen engellenir
- İptal edilen cihaz gelecekteki hiçbir içeriğin şifresini çözemesin diye şifreleme anahtarlarınız döner
- İptal işlemi hesabınızın güvenlik geçmişine kaydedilir

Bu, birinin iptal öncesinden şifreli verilerinizin bir kopyasına sahip olsa bile, iptal sonrasında oluşturulan yeni içeriği okuyamayacağı anlamına gelir.

### SAS emoji doğrulama

Yüksek güvenlik ihtiyacı olan kuruluşlar için yöneticiler, SAS (Kısa Kimlik Doğrulama Dizesi) doğrulamasını kullanarak bir cihazın kimliğini doğrulayabilir — 7 emoji dizisi olarak görüntülenir.

**Nasıl çalışır:**
1. Yönetici ve cihaz sahibi emoji dizilerini karşılaştırır (yüz yüze, telefonla veya güvenilir bir kanal aracılığıyla)
2. Emojiler eşleşirse, cihazın kayıtlı sahibine ait olduğu doğrulanır
3. Doğrulama kaydedilir — yöneticiler hangi cihazların doğrulandığını görebilir

Bu, başka birinin hesabı altında sahte bir cihaz kaydeden saldırgana karşı koruma sağlar. Emoji dizisi, her iki cihazın kriptografik kimlik anahtarlarından ve tek kullanımlık bir koddan türetilir — sunucu onu manipüle edemez veya tahmin edemez.

---

## Hesap silme

### Kendi kendine silme

Hesabınızın ve bununla ilişkili tüm verilerin kalıcı olarak silinmesini talep edebilirsiniz. Varsayılan olarak silme tamamlanmadan önce bir gecikme vardır (merkez yöneticiniz tarafından belirlenir, genellikle 72 saat) — bu, talep baskı altında yapıldıysa iptal etmeniz için size zaman tanır.

**Silinen şeyler:**
- Cihaz anahtarlarınız (tüm şifreli içeriği yedeklerden bile kalıcı olarak okunamaz hale getirir)
- Hesap kaydınız, rol atamalarınız ve vardiya geçmişiniz
- Anlık bildirim jetonlarınız

**Oluşturduğunuz şifreli içeriğe ne olur**: Yazdığınız notlar, transkriptler ve raporlar, kalan yetkili okuyucular (diğer yöneticiler) için yeniden şifrelenir. Şifre çözme anahtarınızın kopyası yok edilir. İçeriğin kendisi diğer yetkili görüntüleyiciler için devam eder — arayanlar ve vaka geçmişi merkeze ait olduğu için toplu olarak silinmez, size değil.

**Denetim günlükleri**: Denetim günlüğü girişleriniz kripto parçalanır — kullanıcı başına şifreleme anahtarı yok edilerek girişleriniz okunamaz hale getirilir. Karma zinciri (müdahale kanıtlayan yapı) bozulmadan kalır.

### Acil silme

Hesabınızın anlık tehdit altında olduğuna inanıyorsanız, bir ortak onaylayıcıyla acil silme talep edebilirsiniz — aciliyeti onaylayan başka güvenilir bir kişi (yönetici veya güvenilir kişi). Bu, gecikmeyi minimum 4 saate indirir. 4 saatlik taban, zorla silmeye karşı koruma sağlamak için mevcuttur (yardım gelirken kanıtların silinmeye zorlanması).

### Silinemeyen şeyler

Çağrı meta verileri (kimin yanıtladığı, ne zaman, ne kadar süre) merkezin denetim kaydının bir parçasıdır. Merkez yöneticiniz bunun ne kadar süre tutulduğunu kontrol eder. GDPR kapsamında düzeltme veya silme talep etme hakkınız var — merkez yöneticinizle iletişime geçin.

---

## Kurtarma grupları

Tüm cihazlarınızı kaybederseniz (telefon kırıldı, dizüstü bilgisayar çalındı, her şey), normalde tüm şifreli verilerinize erişimi kaybederdiniz. Kurtarma grupları bunu çözer.

### Kurtarma nasıl çalışır

Kurtarma grubunuz olarak güvenilir kişilerden oluşan bir grup (genellikle 3–5 kişi) belirlersiniz. Her kişi bir kurtarma anahtarının bir "payını" tutar — bir bulmacının parçasını.

**Hesabınızı kurtarmak için:**
1. Yeni bir cihaz kaydeder ve bir kurtarma talebi başlatırsınız
2. Kurtarma kişilerinizin her biri bir bildirim alır
3. Yapılandırılabilir bir gecikmeden sonra (zorla yapılan talebi iptal etmek için size zaman tanımak amacıyla), eşik sayıda kişi (örneğin, 3'ten 2'si) talebi onaylar
4. Her onaylayan kişi, doğrudan yeni cihazınıza şifreli olarak paylarını gönderir
5. Yeni cihazınız, şifreli verilerinize erişimi geri yükleyen kurtarma anahtarını yeniden oluşturmak için payları birleştirir

**Sunucunun görebildikleri**: Sunucu, cihazlar arasında şifreli parça bölümlerini iletir. Payları okuyamaz, kendi başına kurtarma anahtarını yeniden oluşturamaz ve eşik gereksinimini atlayamaz.

### Kurtarma gruplarının güvenlik özellikleri

- **Eşik güvenliği**: Eşik altı paylar sır hakkında hiçbir şey ortaya koymaz — tek bir pay sahibi hesabınızı yalnız kurtaramaz
- **Sırda sunucu katılımı yok**: Paylar doğrudan yeni cihazınızın açık anahtarına şifrelenir; sunucu yalnızca şifrelenmiş metin saklar ve iletir
- **Merkez başına kapsam**: Kurtarma, belirli bir merkeze erişiminizi geri yükler. Birden fazla merkezinizdeyseniz, her merkezin kendi kurtarma grubu vardır
- **İptallerle gecikme**: Gecikme süresi boyunca bir kurtarma talebini iptal edebilirsiniz — sizin bilginiz olmadan adınıza kurtarma talebi başlatan birine karşı koruma
- **Signal doğrulama**: Kurtarma talepleri, kimliğinizle ilişkili Signal hesabını kontrol ettiğinizi doğrulamak için Signal aracılığıyla doğrulanır

### Kurtarma kişilerini seçme

Güvendiğiniz kişileri seçin:
- Bağımsız olarak ulaşılabilir (hepsi aynı konumda veya kuruluşta değil)
- Kendileri Signal kullanıyor (doğrulama adımı için gerekli)
- Zaman zaman kurtarma taleplerini onaylamaları istenebileceğini anlıyorlar

Kurtarma kişileriniz bir payı tutarak şifreli verilerinize erişim kazanmaz — yalnızca siz talep başlattığınızda kurtarmanıza yardımcı olabilirler.

---

## Gönüllü telefon numarası gizliliği

Gönüllüler kişisel telefonlarına çağrı aldığında, numaraları telefoni sağlayıcınıza açıktır.

| Senaryo | Telefon numarası kimin için görünür |
|---------|-----------------------------------|
| Gönüllünün telefonuna PSTN araması | Telefoni sağlayıcısı, telefon operatörü |
| Tarayıcıdan tarayıcıya (WebRTC) | Kimse (ses tarayıcıda kalır) |
| Kendi barındırılan Asterisk + SIP telefon | Yalnızca Asterisk sunucunuz |

**Gönüllü telefon numaralarını korumak için**: Tarayıcı tabanlı arama (WebRTC) kullanın veya kendi barındırılan Asterisk'e bağlı SIP telefonlar sağlayın.

---

## Son eklenenler

Bu iyileştirmeler bugün yayında:

| Özellik | Gizlilik faydası |
|---------|-----------------|
| Cihaz yönetimi | Oturum açılmış herhangi bir cihazı görüntüleyin ve iptal edin; iptal, kaldırılan cihazın yeni içeriği okuyamaması için anahtar döndürmeyi tetikler |
| SAS emoji cihaz doğrulama | Yöneticiler, 7 emoji olarak görüntülenen kriptografik parmak izi kullanarak cihazları şahsen doğrulayabilir — sunucu tarafından taklit edilemez |
| Gecikmeli hesap silme | Hesabınızın silinmesini talep edin; yapılandırılabilir gecikme, talep zorla yapıldıysa iptal etmenizi sağlar |
| Acil silme | 4 saatlik minimum tabanlı ortak onaylı hızlı silme |
| Silmede kripto parçalama | Şifreleme anahtarlarınız önce yok edilir, herhangi bir veritabanı silmesinden önce içeriği kalıcı olarak okunamaz hale getirir |
| Kurtarma grupları (Shamir) | Tüm cihazları kaybederseniz kurtarmanıza yardımcı olabilecek güvenilir kişiler belirleyin — eşik altı paylar hiçbir şey ortaya koymaz |
| Dürüst açıklama ile yayın mesajlaşması | Yöneticiler toplu mesaj gönderebilir; sunucu teslimat için anlık olarak düz metin işler (kullanıcı arabiriminde açıkça açıklanır) |
| Abone karma | Yayın abone telefon numaraları karma tanımlayıcılar olarak saklanır — veritabanında düz metin abone listesi yok |
| Argon2id anahtar koruması | Cihaz anahtarlarınız, GPU'lar ve özel donanımla kaba kuvvet saldırılarına direnen bellek yoğun bir işlev tarafından korunur |
| Signal öncelikli mesaj yönlendirme | Mesajlar, mümkün olduğunda otomatik olarak Signal üzerinden yönlendirilerek içeriği SMS sağlayıcı günlüklerinden uzak tutar |
| Yalnızca SMS bildirim modu | SMS alıcıları yalnızca "yeni mesajınız var" görür — sağlayıcı günlüklerinde hassas içerik yok |
| Trafik analizi direnci | Gerçek zamanlı etkinlik boyutları dolgu yapılır, böylece gözlemciler kısa mesajları uzun olanlardan ayırt edemez |
| Veritabanında düz metin telefon numarası yok | Arayan numaraları geri döndürülemez karma değerleri olarak saklanır — veritabanınız hiçbir zaman gerçek telefon numarasını içermez |
| İleri gizlilikle merkez başına şifreleme | Her merkezin gerçek zamanlı etkinlikleri, her 24 saatte bir dönen anahtarlarla şifrelenir — eski anahtarlar yeni etkinliklerin şifresini çözemez |
| Tüm platformlarda Rust kriptografisi | Masaüstü, iOS ve Android, denetlenmiş aynı Rust kriptografi kütüphanesini çalıştırır — anahtarlar hiçbir zaman JavaScript, Swift veya Kotlin koduna girmez |
| Kısıtlı aktarma erişimi | WebSocket aktarmanız yalnızca sunucunuzdan etkinlikleri kabul eder — dışarıdan hiç kimse sahte bildirim enjekte edemez |
| Şifreli mesaj depolama | SMS, WhatsApp ve Signal mesajları sunucunuzda şifrelenmiş metin olarak saklanır |
| Cihaz üstü transkripsiyon | Ses hiçbir zaman cihazınızı terk etmez — yerel yapay zeka kullanılarak tamamen cihaz üzerinde işlenir |
| Çok faktörlü anahtar koruması | Şifreleme anahtarlarınız PIN'iniz, kimlik sağlayıcınız ve isteğe bağlı olarak bir donanım güvenlik anahtarıyla korunur |
| Donanım güvenlik anahtarları | Fiziksel anahtarlar, uzaktan tehlikeye atılamayan üçüncü bir faktör ekler |
| Yeniden üretilebilir derlemeler | Dağıtılan kodun genel kaynakla eşleştiğini doğrulayın |
| Şifreli iletişim dizini | İletişim kayıtları, ilişkiler ve notlar uçtan uca şifrelenir |

## Hâlâ planlanıyor

| Özellik | Gizlilik faydası | Durum |
|---------|-----------------|-------|
| Yerel çağrı alma uygulamaları | Kişisel telefon numarası açığa çıkmaz | Geliştirme aşamasında |
| Sertifika sabitleme (mobil) | Sahte CA TLS ele geçirilmesine karşı savunma | İskelet tamamlandı; ilk dağıtım bekleniyor |
| SFrame ses medya şifreleme | Uçtan uca şifreli sesli aramalar | Anahtar türetme tamamlandı; çerçeve başına şifreleme planlandı |

---

## Özet tablosu

| Veri türü | Şifreli | Sunucuya görünür | Mahkeme celbiyle elde edilebilir |
|-----------|---------|-----------------|--------------------------------|
| Çağrı notları | Evet (uçtan uca) | Hayır | Yalnızca şifrelenmiş metin |
| Transkriptler | Evet (uçtan uca) | Hayır | Yalnızca şifrelenmiş metin |
| Raporlar | Evet (uçtan uca) | Hayır | Yalnızca şifrelenmiş metin |
| Vaka kayıtları / varlık verileri | Evet (uçtan uca) | Hayır | Yalnızca şifrelenmiş metin |
| Dosya ekleri | Evet (uçtan uca) | Hayır | Yalnızca şifrelenmiş metin |
| İletişim kayıtları | Evet (uçtan uca) | Hayır | Yalnızca şifrelenmiş metin |
| Gönüllü kimlikleri | Evet (uçtan uca) | Hayır | Yalnızca şifrelenmiş metin |
| Takım/rol meta verileri | Evet (şifreli) | Hayır | Yalnızca şifrelenmiş metin |
| Özel alan tanımları | Evet (şifreli) | Hayır | Yalnızca şifrelenmiş metin |
| Gelen SMS/WhatsApp/Signal içeriği | Evet (sunucunuzda) | Hayır | Sunucunuzdan şifrelenmiş metin; sağlayıcı orijinale sahip olabilir |
| Giden yayın mesajları | **Hayır — teslimat sırasında düz metin** | **Evet, anlık olarak** | Evet (gönderim anında düz metin) |
| Kurtarma payları | Evet (alıcı cihaza uçtan uca) | Hayır | Yalnızca şifrelenmiş metin |
| Gerçek zamanlı etkinlikler | Evet (merkez başına, dönen anahtarlar) | Hayır | Yalnızca şifrelenmiş metin |
| Çağrı meta verileri | Hayır | Evet | Evet |
| Yayın teslimat kayıtları | Hayır | Evet | Evet |
| Arayan telefon karmaları | HMAC karma | Yalnızca karma | Karma (sırrınız olmadan geri döndürülemez) |
| Abone telefon karmaları | HMAC karma | Yalnızca karma | Karma (sırrınız olmadan geri döndürülemez) |
| Kullanıcı-Ajan dizeleri | SHA-256 karma | Yalnızca karma | Karma (geri döndürülemez) |

---

## Güvenlik denetçileri için

Teknik belgeler:

- [Protokol Spesifikasyonu](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/PROTOCOL.md)
- [Tehdit Modeli](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/THREAT_MODEL.md)
- [Veri Sınıflandırması](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Güvenlik Açıkları ve Yol Haritası](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/SECURITY_GAPS_AND_ROADMAP.md)
- [Güvenlik Denetimleri](https://github.com/rhonda-rodododo/llamenos-platform/tree/main/docs/security)
- [API Belgeleri](/api/docs)

Llamenos açık kaynaktır: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
