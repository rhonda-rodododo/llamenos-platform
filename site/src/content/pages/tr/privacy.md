---
title: Gizlilik Politikası
subtitle: Llámenos'un ne topladığı, nasıl korunduğu ve kullanıcı olarak haklarınız.
---

**Yürürlük tarihi: 18 Mayıs 2026**

Llámenos, açık kaynaklı bir kriz müdahale yazılımıdır. Bu politika, Llámenos iOS uygulaması ve merkez yöneticiniz tarafından işletilen arka uç hizmetleri için geçerlidir. Üçüncü taraflar tarafından işletilen merkezler için geçerli değildir — her merkezin yöneticisi, kendi veri uygulamalarından sorumludur.

---

## Ne Topluyoruz

### Hesap ve kimlik verileri

- **Cihaz genel anahtarı** — cihazınıza özgü bir kriptografik tanımlayıcı. Merkeziniz dışında asla paylaşılmaz.
- **Push bildirim tokeni** — yalnızca cihazınıza çağrı uyarıları iletmek için kullanılır. Periyodik olarak döndürülür.
- **Rol ve merkez üyeliği** — hangi merkezlere ait olduğunuz ve atanan rolünüz (gönüllü, yönetici).
- **Cihaz meta verileri** — cihaz modeli, işletim sistemi sürümü ve uygulama sürümü. Bir cihaz kaydettiğinizde toplanır. Güvenlik izleme ve destek için kullanılır.

### Etkinlik verileri

- **Çağrı meta verileri** — zaman damgaları, çağrı süresi, hangi gönüllünün yanıtladığı. Çağrı içeriği değil.
- **Vardiya kayıtları** — hangi vardiyalara planlandığınız ve aktif olup olmadığınız.
- **Denetim kayıtları** — uygulamada gerçekleştirilen eylemler (not oluşturma, rapor gönderme, ayar değiştirme). Yalnızca yöneticiler tarafından görülebilir.
- **Güvenlik olayları** — cihaz kayıtları, yetki kaldırmalar, oturum etkinliği ve hesap değişiklikleri. Güvenlik geçmişinizde saklanır, size ve yöneticilere görünür.

### Oluşturduğunuz içerik — uçtan uca şifreli

- **Çağrı notları ve transkripsiyonlar** — yönettiğiniz çağrılardan yazılı notlar ve tarayıcı tarafından oluşturulan transkripsiyonlar.
- **Raporlar ve vaka kayıtları** — yapılandırılmış raporlar, özel alanlar, dosya ekleri ve vaka geçmişi.
- **İletişim kayıtları** — kaydedilmişse, arayanın iletişim bilgileri.
- **Mesajlar** — merkezinize yönlendirilen gelen metin mesajları.

**Sunucu bu içeriği yalnızca şifreli metin olarak saklar.** Sunucu operatörü, barındırma sağlayıcısı veya Llámenos tarafından okunamaz. Şifreleme anahtarlarınız PIN'iniz ve kimlik sağlayıcı kimlik bilgilerinizle korunur ve isteğe bağlı olarak bir donanım güvenlik anahtarıyla. Şifre çözme yalnızca kimliği doğrulanmış cihazınızda gerçekleşir.

### Yayın/abone verileri

Merkeziniz toplu mesajlaşma kullanıyorsa, abone telefon numaraları **hash'li tanımlayıcılar** olarak saklanır — düz metin telefon numaraları olarak değil. Bu, veritabanının asla okunabilir bir abone listesi içermediği anlamına gelir. İptal (STOP) talepleri anında işlenir ve göz ardı edilemez.

Bir toplu mesaj gönderildiğinde, sunucu mesaj içeriğini anlık olarak mesajlaşma sağlayıcısı (SMS, WhatsApp, Signal veya RCS) üzerinden iletmek için düz metin olarak işler. Sunucu, teslimattan sonra toplu mesaj içeriğini saklamaz — yalnızca teslimat durumu kayıtları tutulur.

### Kurtarma grubu verileri

Bir kurtarma grubu yapılandırırsanız, sunucu şunları saklar:
- Kurtarma grubu genel anahtarınız (kurtarma taleplerini doğrulamak için kullanılır)
- Şifreli paylaşım parçaları (her parça belirli bir pay sahibinin cihazına şifreli — sunucu bunları okuyamaz)
- Kurtarma talebi kayıtları (zamanlama, durum — içerik değil)

**Sunucu kurtarma anahtarınızı yeniden oluşturamaz.** Paylaşım parçaları her pay sahibinin cihazına uçtan uca şifrelenir. Kurtarmanın başarılı olabilmesi için minimum eşik sayıda pay sahibinin aktif olarak paylarına katkıda bulunması gerekir.

### Çökme raporları ve tanılama

Merkez yöneticiniz tarafından etkinleştirilirse, uygulama bir tanılama hizmetine çökme raporları gönderebilir. Bunlar cihaz modeli, işletim sistemi sürümü, uygulama sürümü ve bir yığın izi içerir. Çağrı içeriği, notlar veya kişisel kimlik bilgisi içermezler.

### Konum

Uygulama konum verisi toplamaz. Gelecekte bir özellik konum erişimi talep ederse, isteğe bağlı olacak, ayrıca açıklanacak ve izleme için kullanılmayacaktır.

---

## Verileri Nasıl Kullanıyoruz

- **Uygulamayı çalıştırmak için** — çağrıları vardiyadaki gönüllülere yönlendirmek, not almayı etkinleştirmek, vardiyaları ve raporları yönetmek.
- **Güvenlik için** — kötüye kullanımı tespit etmek, yasak listelerini sürdürmek, hız sınırlandırma yapmak ve cihaz güvenlik geçmişi sağlamak.
- **Denetim için** — yöneticilere uygulama etkinliğinin denetim kayıtlarını sunmak (içerik değil).
- **Kurtarma için** — kurtarma gruplarının kullanıcıların erişimini yeniden kazanmalarına yardımcı olmak için şifreli paylaşım parçalarını saklamak.

Verilerinizi reklam için kullanmıyoruz. Verilerinizi ticari amaçlarla üçüncü taraflara satmıyor veya paylaşmıyoruz. Davranışsal profil oluşturmuyoruz.

---

## Uçtan Uca Şifreleme

Tüm not içeriği, transkripsiyonlar, raporlar, iletişim kayıtları ve gelen mesajlar uçtan uca şifrelenir. Her öğe benzersiz bir rastgele anahtar kullanır. Özel anahtarınız cihazınızdan asla ayrılmaz. Sunucu yalnızca şifreli metin alır ve saklar.

**Pratikte bu ne anlama gelir:**

| Veri türü | Sunucu okuyabilir mi? | Mahkeme celbi ile elde edilebilir mi |
|-----------|----------------------|-------------------------------------|
| Çağrı notları | Hayır | Yalnızca şifreli metin |
| Transkripsiyonlar | Hayır | Yalnızca şifreli metin |
| Raporlar | Hayır | Yalnızca şifreli metin |
| Vaka kayıtları | Hayır | Yalnızca şifreli metin |
| Gelen mesajlar | Hayır | Yalnızca şifreli metin |
| Kurtarma payları | Hayır | Yalnızca şifreli metin |
| Giden toplu mesajlar | **Evet, teslimat sırasında anlık olarak** | Evet (gönderim anında düz metin) |
| Çağrı meta verileri | Evet | Evet |
| Cihaz genel anahtarınız | Evet | Evet |
| Güvenlik olayları | Evet | Evet |

Tam ayrıntı için [Güvenlik sayfamıza](/security) bakın.

---

## Veri Saklama

### Oluşturduğunuz içerik

Notlar, transkripsiyonlar, raporlar ve mesajlar, siz veya bir yönetici açıkça silene veya merkeziniz kapatılana kadar saklanır. Merkez yöneticiniz, belirli bir eşikten eski içeriği otomatik olarak temizleyen saklama süreleri yapılandırabilir.

### Toplu mesajlar

Toplu mesaj içeriği teslimattan sonra saklanmaz. Yalnızca teslimat durumu kayıtları (gönderildi, başarısız, abonelikten çıkıldı) tutulur. Merkez yöneticiniz, teslimat kayıtlarının ne kadar süre tutulacağını kontrol eder.

### Çağrı meta verileri ve denetim kayıtları

Merkez yöneticinizin yapılandırmasına göre tutulur. Platform tarafından zorunlu kılınan minimumlar, yöneticilerin gerekli yasal tutmaların sona ermesinden önce denetim kanıtlarını yok edecek saklama süreleri belirlemesini engeller.

### Güvenlik olayları ve cihaz kayıtları

Güvenlik olayları (cihaz kayıtları, yetki kaldırmalar, oturum etkinliği) hesabınızın ömrü boyunca saklanır. Bunlar güvenlik denetim izinin bir parçasıdır ve hesap etkinliğinizi inceleme hakkınızı destekler.

### Kurtarma payları

Şifreli paylaşım parçaları, kurtarma grubu yapılandırmanızı silene veya hesabınız silinene kadar saklanır.

### Push tokenleri

Oturumunuzu kapattığınızda veya uygulamayı kaldırdığınızda kaldırılır.

### Hesap verileri ve silme

Hesabınızın tamamen silinmesini talep edebilirsiniz — aşağıya bakın.

---

## Hesap Silme

Hesabınızın kalıcı olarak silinmesini talep etme hakkına sahipsiniz. Llámenos, güçlü kriptografik garantilerle silme işlemi uygular.

### Silme işlemi ne yapar

1. **Önce anahtarlar yok edilir**: Cihaz şifreleme anahtarlarınız anında yok edilir. Bu, herhangi bir veritabanı silme işlemi gerçekleşmeden önce, oluşturduğunuz tüm içeriği — veritabanı yedeklerinden bile — kalıcı olarak okunamaz hale getirir.
2. **Hesap ve cihaz kayıtları silinir**: Hesap kaydınız, cihaz kayıtlarınız, push tokenleriniz ve rol atamalarınız kaldırılır.
3. **Denetim kayıtları kripto-parçalanır**: Denetim kayıtlarınız için şifreleme anahtarı yok edilerek kayıtlarınız okunamaz hale getirilir. Denetim zincirinin kurcalamaya karşı korunmuş yapısı bozulmadan kalır (merkez bütünlüğü için gereklidir).
4. **Şifreli içerik yeniden sarılır**: Yazdığınız notlar ve raporlar, kalan yetkili okuyucular (diğer yöneticiler) için yeniden şifrelenir. Şifre çözme anahtarınızın kopyası kaldırılır; içerik vaka sürekliliği için kalır.

### Kendi kendine silme

Tüm platformlardaki hesap ayarlarınızdan kullanılabilir. Varsayılan olarak, silme tamamlanmadan önce bir gecikme vardır (merkez yöneticiniz tarafından belirlenir, tipik olarak 72 saat, minimum 24 saat, maksimum 7 gün). **Bu süre içinde iptal edebilirsiniz.** Gecikme, hesabınızı silmeye zorlanıyorsanız sizi koruyan bir güvenlik özelliğidir.

### Acil silme

Acil bir tehlike altındaysanız, güvenilir bir yönetici veya kişi acil silmeyi onaylayabilir ve gecikmeyi minimum 4 saate indirebilir. 4 saatlik alt sınır, yardım yoldayken kanıtların zorla silinmesine karşı koruma sağlamak için vardır.

### Yönetici tarafından silme

Merkez yöneticileri, merkezlerindeki herhangi bir hesabın anında silinmesini başlatabilir. Bu işlem denetim kaydına kaydedilir.

---

## Üçüncü Taraf Hizmetleri

Llámenos, çağrı yönlendirmesi için telefon sağlayıcılarıyla entegre olur (Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth veya kendi sunucunuzda Asterisk/FreeSWITCH). Sağlayıcıyı merkez yöneticiniz seçer.

**Telefon sağlayıcılarının aldıkları:**

- Arayanın telefon numarası (gelen çağrılar)
- Çağrı süresi ve zaman damgaları
- Çağrı notlarını, transkripsiyonları veya uygulamada oluşturduğunuz herhangi bir içeriği **almazlar**

**Toplu mesajlar için mesajlaşma sağlayıcılarının aldıkları:**

- Mesaj içeriği (SMS, WhatsApp, RCS) — sağlayıcı mesajı iletmek için düz metin almalıdır
- Signal toplu mesajları için içerik, Signal ağı üzerinden uçtan uca şifreli olarak iletilir

Merkez yöneticiniz ek üçüncü taraf hizmetler kullanabilir (çökme raporlama, izleme). Ayrıntılar için merkezinizin gizlilik bildirimine bakın.

---

## GDPR Kapsamındaki Haklarınız

Llámenos, AB merkezli bir kuruluş tarafından geliştirilmiştir. Avrupa Ekonomik Bölgesi'ndaysanız, Genel Veri Koruma Yönetmeliği kapsamında aşağıdaki haklara sahipsiniz:

- **Erişim hakkı** — hakkınızda tutulan kişisel verilerin bir kopyasını talep etme
- **Düzeltme hakkı** — hatalı verileri düzeltme
- **Silme hakkı** — hesabınızın ve tüm ilişkili verilerin kalıcı olarak silinmesini talep etme (ayrıntılar için yukarıdaki [Hesap Silme](#hesap-silme) bölümüne ve [Veri Silme sayfamıza](/data-deletion) bakın)
- **Veri taşınabilirliği hakkı** — verilerinizi yapılandırılmış, makine tarafından okunabilir bir formatta alma
- **İtiraz hakkı** — meşru menfaatlere dayalı işlemeye itiraz etme
- **İşlemeyi sınırlama hakkı** — işlemenin sınırlandırılmasını talep etme
- **Rıza geri çekme hakkı** — işleme rızaya dayalıysa, istediğiniz zaman geri çekme

**Şifreli içerik notu**: Çağrı notları, transkripsiyonlar ve raporlar uçtan uca şifreli olduğundan ve sunucu bunları okuyamaz; bu nedenle, doğrudan cihazınızda erişmediğiniz içeriğin şifresi çözülmüş bir dışa aktarımını sunamayız. Hangi şifreli kayıtların var olduğunu doğrulayabilir ve bunları silebiliriz. Hâlâ şifresini çözebileceğiniz içerik için (aktif bir cihazda), uygulama kendi notlarınızı görüntülemenize ve dışa aktarmanıza olanak tanır.

Bu hakları kullanmak için merkez yöneticinize (merkeziniz için veri sorumlusu) başvurun veya [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com) adresinden bize ulaşın.

Ayrıca ulusal veri koruma otoritenize şikayette bulunma hakkına sahipsiniz.

---

## Çocukların Gizliliği

Llámenos, 13 yaş altındaki çocuklara veya AB'de 16 yaş altındakilere yönelik değildir. Bilerek çocuklardan kişisel veri toplamıyoruz. Bir çocuğun uygulama aracılığıyla kişisel veri gönderdiğine inanıyorsanız, bizimle iletişime geçin ve bunu derhal sileceğiz.

---

## Bu Politikadaki Değişiklikler

Bu politikadaki değişiklikleri bu sayfada yayınlayacağız ve yürürlük tarihini güncelleyeceğiz. Önemli değişiklikler için, mümkün olduğunda uygulama veya e-posta yoluyla bildirim sağlayacağız.

---

## İletişim

**Gizlilik soruları:** [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com)

**Hata raporları ve güvenlik açıklamaları:** [github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues)

Llámenos açık kaynaktır. Uygulamanın ne yaptığını denetleyebilirsiniz: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
