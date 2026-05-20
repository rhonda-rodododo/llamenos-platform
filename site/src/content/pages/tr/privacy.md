---
title: Gizlilik Politikası
subtitle: Llámenos'un topladığı veriler, nasıl korunduğu ve kullanıcı olarak haklarınız.
---

**Yürürlük tarihi: 18 Mayıs 2026**

Llámenos, açık kaynaklı kriz müdahale yazılımıdır. Bu politika, Llámenos iOS uygulamasına ve merkez yöneticiniz tarafından işletilen arka uç hizmetlerine uygulanır. Üçüncü taraflar tarafından işletilen merkezlere uygulanmaz — her merkezin yöneticisi kendi veri uygulamalarından sorumludur.

---

## Topladıklarımız

### Hesap ve kimlik verileri

- **Cihaz açık anahtarı** — cihazınıza özgü kriptografik bir tanımlayıcı. Merkezinizin dışında asla paylaşılmaz.
- **Anlık bildirim jetonu** — yalnızca cihazınıza çağrı uyarıları iletmek için kullanılır. Periyodik olarak değiştirilir.
- **Rol ve merkez üyeliği** — ait olduğunuz merkezler ve atanmış rolünüz (gönüllü, yönetici).
- **Cihaz meta verileri** — cihaz modeli, işletim sistemi sürümü ve uygulama sürümü. Bir cihaz kaydettiğinizde toplanır. Güvenlik izleme ve destek için kullanılır.

### Etkinlik verileri

- **Çağrı meta verileri** — zaman damgaları, çağrı süresi, hangi gönüllünün yanıtladığı. Çağrı içeriği değil.
- **Vardiya kayıtları** — hangi vardiyalara zamanlandığınız ve aktif olup olmadığınız.
- **Denetim günlüğü girişleri** — uygulamada gerçekleştirilen eylemler (not oluşturuldu, rapor gönderildi, ayarlar değiştirildi). Yalnızca yöneticiler görebilir.
- **Güvenlik olayları** — cihaz kayıtları, iptal işlemleri, oturum etkinliği ve hesap değişiklikleri. Güvenlik geçmişinizde saklanır, siz ve yöneticiler tarafından görülebilir.

### Oluşturduğunuz içerik — uçtan uca şifreli

- **Çağrı notları ve transkriptler** — işlediğiniz çağrılardan yazılı notlar ve tarayıcı tarafından oluşturulan transkriptler.
- **Raporlar ve vaka kayıtları** — yapılandırılmış raporlar, özel alanlar, dosya ekleri ve vaka geçmişi.
- **İletişim kayıtları** — varsa kaydedilen arayan iletişim bilgileri.
- **Mesajlar** — merkezinize yönlendirilen gelen metin mesajları.

**Sunucu bu içeriği yalnızca şifrelenmiş metin olarak saklar.** Sunucu operatörü, barındırma sağlayıcısı veya Llámenos tarafından okunamaz. Şifreleme anahtarlarınız PIN'iniz ve kimlik sağlayıcı kimlik bilgilerinizle korunur, isteğe bağlı olarak bir donanım güvenlik anahtarıyla da. Şifre çözme yalnızca kimliği doğrulanmış cihazınızda gerçekleşir.

### Yayın/abone verileri

Merkeziniz yayın mesajlaşması kullanıyorsa, abone telefon numaraları **karma tanımlayıcılar** olarak saklanır — düz metin telefon numaraları olarak değil. Bu, veritabanının hiçbir zaman okunabilir bir abone listesi içermediği anlamına gelir. Abonelikten çıkma (DURDUR) talepleri derhal işlenir ve yoksayılamaz.

Bir yayın mesajı gönderildiğinde, sunucu mesaj sağlayıcısı aracılığıyla iletmek için düz metin mesaj içeriğini anlık olarak işler (SMS, WhatsApp, Signal veya RCS). Sunucu, teslimattan sonra yayın mesajı içeriğini saklamaz — yalnızca teslimat durumu kayıtları tutulur.

### Kurtarma grubu verileri

Bir kurtarma grubu yapılandırırsanız, sunucu şunları saklar:
- Kurtarma grubu açık anahtarınız (kurtarma taleplerini doğrulamak için kullanılır)
- Şifreli parça bölümleri (her parça belirli bir pay sahibinin cihazına şifreli — sunucu bunları okuyamaz)
- Kurtarma talebi kayıtları (zamanlama, durum — içerik değil)

**Sunucu kurtarma anahtarınızı yeniden oluşturamaz.** Parça bölümleri her pay sahibinin cihazına uçtan uca şifrelenir. Kurtarmanın başarılı olabilmesi için minimum eşik sayıda pay sahibinin aktif olarak paylarını katkılaması gerekir.

### Çökme raporları ve tanılama

Merkez yöneticiniz tarafından etkinleştirilmişse, uygulama bir tanılama hizmetine çökme raporları gönderebilir. Bunlar cihaz modelini, işletim sistemi sürümünü, uygulama sürümünü ve bir yığın izini içerir. Çağrı içeriği, notlar veya kişisel kimlik bilgileri içermez.

### Konum

Uygulama konum verisi toplamaz. Gelecekteki bir özellik konum erişimi talep ederse, isteğe bağlı olacak, ayrıca açıklanacak ve izleme için kullanılmayacaktır.

---

## Verileri Nasıl Kullanırız

- **Uygulamayı çalıştırmak için** — çağrıları vardiyalı gönüllülere yönlendirmek, not almayı etkinleştirmek, vardiyaları ve raporları yönetmek.
- **Güvenlik için** — kötüye kullanımı tespit etmek, yasaklı listeleri sürdürmek, hız sınırlamak ve cihaz güvenlik geçmişi sağlamak.
- **Denetim için** — yöneticilere uygulama etkinliğinin denetim günlüklerini sunmak (içerik değil).
- **Kurtarma için** — kurtarma gruplarının kullanıcıların erişimi yeniden kazanmalarına yardımcı olabilmesi için şifreli parça bölümleri saklamak.

Verilerinizi reklam için kullanmıyoruz. Verilerinizi ticari amaçlarla üçüncü taraflara satmıyor veya paylaşmıyoruz. Davranışsal profil oluşturmuyoruz.

---

## Uçtan Uca Şifreleme

Tüm not içeriği, transkriptler, raporlar, iletişim kayıtları ve gelen mesajlar uçtan uca şifrelenir. Her öğe benzersiz bir rastgele anahtar kullanır. Özel anahtarınız asla cihazınızı terk etmez. Sunucu yalnızca şifrelenmiş metin alır ve saklar.

**Pratikte ne anlama gelir:**

| Veri türü | Sunucu okuyabilir mi? | Mahkeme celbiyle elde edilebilir mi? |
|-----------|----------------------|---------------------------------------|
| Çağrı notları | Hayır | Yalnızca şifrelenmiş metin |
| Transkriptler | Hayır | Yalnızca şifrelenmiş metin |
| Raporlar | Hayır | Yalnızca şifrelenmiş metin |
| Vaka kayıtları | Hayır | Yalnızca şifrelenmiş metin |
| Gelen mesajlar | Hayır | Yalnızca şifrelenmiş metin |
| Kurtarma payları | Hayır | Yalnızca şifrelenmiş metin |
| Giden yayın mesajları | **Evet, teslim sırasında anlık olarak** | Evet (gönderim anında düz metin) |
| Çağrı meta verileri | Evet | Evet |
| Cihaz açık anahtarınız | Evet | Evet |
| Güvenlik olayları | Evet | Evet |

Tam dökümü için [Güvenlik sayfamıza](/security) bakın.

---

## Veri Saklama

### Oluşturduğunuz içerik

Notlar, transkriptler, raporlar ve mesajlar siz veya bir yönetici açıkça silene ya da merkeziniz kapatılana kadar saklanır. Merkez yöneticiniz, belirli bir eşikten eski içeriği otomatik olarak temizleyen saklama süreleri yapılandırabilir.

### Yayın mesajları

Yayın mesajı içeriği teslimattan sonra saklanmaz. Yalnızca teslimat durumu kayıtları (gönderildi, başarısız, abonelik iptal edildi) tutulur. Merkez yöneticiniz, teslimat kayıtlarının ne kadar süre tutulacağını kontrol eder.

### Çağrı meta verileri ve denetim günlükleri

Merkez yöneticinizin yapılandırmasına göre tutulur. Platform tarafından zorunlu kılınan minimumlar, yöneticilerin gerekli yasal beklemelerin sona ermesinden önce denetim kanıtlarını yok edecek saklama süreleri belirlemesini engeller.

### Güvenlik olayları ve cihaz kayıtları

Güvenlik olayları (cihaz kayıtları, iptaller, oturum etkinliği) hesabınızın ömrü boyunca saklanır. Bunlar güvenlik denetim izinin bir parçasıdır ve hesap etkinliğini inceleme hakkınızı destekler.

### Kurtarma payları

Şifreli parça bölümleri, kurtarma grubu yapılandırmanızı silene veya hesabınız silinene kadar saklanır.

### Anlık bildirim jetonları

Oturumu kapattığınızda veya uygulamayı kaldırdığınızda kaldırılır.

### Hesap verileri ve silme

Hesabınızın tamamen silinmesini talep edebilirsiniz — aşağıya bakın.

---

## Hesap Silme

Hesabınızın kalıcı olarak silinmesini talep etme hakkına sahipsiniz. Llámenos, güçlü kriptografik garantilerle silme işlemi uygular.

### Silme işlemi ne yapar

1. **Önce anahtarlar yok edilir**: Cihaz şifreleme anahtarlarınız derhal yok edilir. Bu, herhangi bir veritabanı silme işlemi gerçekleşmeden önce, oluşturduğunuz tüm içeriği — veritabanı yedeklerinden bile — kalıcı olarak okunamaz hale getirir.
2. **Hesap ve cihaz kayıtları silinir**: Hesap kaydınız, cihaz kayıtlarınız, anlık bildirim jetonlarınız ve rol atamalarınız kaldırılır.
3. **Denetim girişleri kripto-parçalanır**: Denetim günlüğü girişleriniz için şifreleme anahtarı yok edilerek girişleriniz okunamaz hale getirilir. Denetim zincirinin müdahale kanıtlayan yapısı bozulmadan kalır (merkez bütünlüğü için gereklidir).
4. **Şifreli içerik yeniden sarılır**: Yazdığınız notlar ve raporlar, kalan yetkili okuyucular (diğer yöneticiler) için yeniden şifrelenir. Şifre çözme anahtarınızın kopyası kaldırılır; içerik vaka sürekliliği için devam eder.

### Kendi kendine silme

Tüm platformlarda hesap ayarlarınızdan mevcuttur. Varsayılan olarak, silme tamamlanmadan önce bir gecikme vardır (merkez yöneticiniz tarafından belirlenir, genellikle 72 saat, minimum 24 saat, maksimum 7 gün). **Bu süre zarfında iptal edebilirsiniz.** Gecikme bir güvenlik özelliğidir — hesabınızı silmeye zorlanıyorsanız sizi korur.

### Acil silme

Anlık tehlikeyle karşılaşırsanız, bir ortak onaylayıcı (güvenilir bir yönetici veya kişi) acil silmeyi onaylayabilir ve gecikmeyi minimum 4 saate indirabilir. 4 saatlik taban, yardım yoldayken kanıtların zorla silinmesine karşı koruma sağlamak için mevcuttur.

### Yönetici tarafından silme

Merkez yöneticileri, merkezlerindeki herhangi bir hesabın anlık silinmesini başlatabilir. Bu işlem denetim günlüğüne kaydedilir.

---

## Üçüncü Taraf Hizmetler

Llámenos, çağrı yönlendirmesi için telefoni sağlayıcılarıyla entegre olur (Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth veya kendi barındırılan Asterisk/FreeSWITCH). Merkez yöneticiniz sağlayıcıyı seçer.

**Telefoni sağlayıcılarının aldıkları:**

- Arayanın telefon numarası (gelen çağrılar)
- Çağrı süresi ve zaman damgaları
- Çağrı notlarını, transkriptleri veya uygulamada oluşturduğunuz herhangi bir içeriği **almaz**lar

**Yayın mesajları için mesajlaşma sağlayıcılarının aldıkları:**

- Mesaj içeriği (SMS, WhatsApp, RCS) — sağlayıcı mesajı iletmek için düz metin almalıdır
- Signal yayınları için içerik, Signal ağı üzerinden uçtan uca şifreli olarak iletilir

Merkez yöneticiniz ek üçüncü taraf hizmetler kullanıyor olabilir (çökme raporlama, izleme). Ayrıntılar için merkezinizin gizlilik bildirimini inceleyin.

---

## GDPR Kapsamındaki Haklarınız

Llámenos, AB merkezli bir kuruluş tarafından geliştirilmektedir. Avrupa Ekonomik Alanı'ndaysanız, Genel Veri Koruma Yönetmeliği kapsamında aşağıdaki haklara sahipsiniz:

- **Erişim hakkı** — hakkınızda tutulan kişisel verilerin bir kopyasını talep etme
- **Düzeltme hakkı** — yanlış verileri düzeltme
- **Silme hakkı** — hesabınızın ve tüm ilgili verilerin kalıcı olarak silinmesini talep etme (ayrıntılar için yukarıdaki [Hesap Silme](#hesap-silme) bölümüne ve [Veri Silme sayfamıza](/data-deletion) bakın)
- **Veri taşınabilirliği hakkı** — verilerinizi yapılandırılmış, makine tarafından okunabilir bir formatta alma
- **İtiraz hakkı** — meşru çıkarlara dayalı işlemeye itiraz etme
- **İşlemeyi kısıtlama hakkı** — işlemenin sınırlandırılmasını talep etme
- **Rızayı geri çekme hakkı** — işleme rızaya dayalıysa, her zaman geri çekme

**Şifreli içerik notu**: Çağrı notları, transkriptler ve raporlar uçtan uca şifreli olduğundan ve sunucu bunları okuyamadığından, cihazınızda doğrudan erişmediğiniz içeriğin şifresi çözülmüş bir dışa aktarımını sunamayız. Hangi şifreli kayıtların mevcut olduğunu onaylayabilir ve bunları silebiliriz. Hâlâ şifresini çözebileceğiniz içerik için (aktif bir cihazda), uygulama kendi notlarınızı görüntülemenize ve dışa aktarmanıza olanak tanır.

Bu hakları kullanmak için merkez yöneticinize (merkezinizin veri denetleyicisi) başvurun veya [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com) adresinden bize ulaşın.

Ayrıca ulusal veri koruma otoritenize şikayette bulunma hakkına sahipsiniz.

---

## Çocukların Gizliliği

Llámenos, 13 yaşın altındaki çocuklara veya AB'de 16 yaşın altındakilere yönelik değildir. Çocuklardan bilerek kişisel veri toplamıyoruz. Bir çocuğun uygulama üzerinden kişisel veri gönderdiğine inanıyorsanız, bize ulaşın ve derhal sileceğiz.

---

## Bu Politikadaki Değişiklikler

Bu politikadaki değişiklikleri bu sayfada yayınlayacak ve yürürlük tarihini güncelleyeceğiz. Önemli değişiklikler için, mümkün olduğunda uygulama üzerinden veya e-posta yoluyla bildirim sağlayacağız.

---

## İletişim

**Gizlilik sorguları:** [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com)

**Hata raporları ve güvenlik açıklamaları:** [github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues)

Llámenos açık kaynaktır. Uygulamanın ne yaptığını denetleyebilirsiniz: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
