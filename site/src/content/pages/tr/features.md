---
title: Özellikler
subtitle: Bir kriz müdahale platformunun ihtiyaç duyduğu her şey — 8 telefoni sağlayıcısı, 5 mesajlaşma kanalı, HPKE şifreleme (RFC 9180) ve tek bir denetlenebilir Rust kripto kaseti paylaşan üç yerel uygulama. Bun + PostgreSQL üzerinde kendi barındırma, GDPR uyumlu.
---

## Güvenlik Mimarisi

Llámenos, başından itibaren arayanları ve gönüllüleri iyi finanse edilmiş düşmanlara — ulus devletlere, sağcı gruplara ve özel istihbarat firmalarına — karşı korumak için tasarlanmıştır. Her kriptografik karar kasıtlı, belgelenmiş ve denetlenebilirdir.

**HPKE (RFC 9180) — X25519-HKDF-SHA256-AES256-GCM** — MLS (Mesajlaşma Katmanı Güvenliği) ve TLS 1.3'te kullanılan aynı hibrit şifreleme standardı. Eski ECIES'in (secp256k1) yerini tamamen almıştır. RFC 9180, geçici bir kompozisyon yerine resmi olarak belirlenmiş, eş tarafından incelenmiş bir yapı sağlar.

**Not başına ileri gizlilik** — Her not benzersiz bir rastgele anahtar kullanır, ardından bu anahtar her yetkili okuyucu (gönüllü ve her yönetici) için ayrı ayrı HPKE ile sarılır. Bir okuyucunun özel anahtarının ele geçirilmesi, ele geçirmeden önce yazılan notlar hakkında hiçbir şeyi açığa çıkarmaz. Anahtar hiyerarşisi: Kullanıcı Başına Anahtar (PUK) → items_key → not başına içerik anahtarı, basamaklı tembel döndürme ile.

**Çift şifreli notlar** — Her not iki kez şifrelenir: bir kez onu yazan gönüllü için HPKE ile sarılı, bir kez her yönetici için. Her ikisi de bağımsız olarak şifresini çözebilir. Sunucu dahil başka hiç kimse düz metni okuyamaz.

**57 alan ayrım etiketi** — Her kriptografik işlem benzersiz bir bağlam dizisi kullanır (Albrecht savunması). İki işlem hiçbir zaman bir anahtar türetme yolunu paylaşmaz, bu da protokoller arası saldırıları önler. Etiketler `packages/protocol/crypto-labels.json` dosyasında tanımlanır ve kod üretimi aracılığıyla TypeScript, Swift ve Kotlin'e üretilir. Ham dize literalleri hiçbir zaman kripto bağlamlarında kullanılmaz.

**Cihaz başına Ed25519/X25519 anahtarları** — Kullanıcıların cihaz başına anahtarları vardır (tek bir kimlik anahtarı değil). Yeni cihazlar yalnızca ekleme özellikli, karma zincirli, Ed25519 imzalı bir sigchain aracılığıyla yetkilendirilir. Cihaz bağlama, 5 dakika sonra sona eren geçici ECDH temin odaları kullanır.

**PIN şifreli anahtar depolama** — Cihaz özel anahtarları, depolamadan önce 600.000 PBKDF2 yinelemesi + XChaCha20-Poly1305 ile şifrelenir. Ham anahtar yalnızca bellek içi bir kapanımda yaşar, kilitlendiğinde sıfırlanır. SessionStorage, IndexedDB veya diski hiçbir zaman düz metin olarak kullanmaz.

**Platform yerel güvenli depolama** — Masaüstü: Tauri Stronghold şifreli kasa. iOS: iOS Anahtarlık. Android: EncryptedSharedPreferences aracılığıyla Android Keystore.

**Yalnızca istemci tarafı transkripsiyon** — Çağrı transkripsiyonu, tamamen tarayıcıda çalışan WASM Whisper (`@huggingface/transformers` ONNX çalışma zamanı) kullanır. Ses, AudioWorklet halka tamponu → Web Worker ardışık düzeni aracılığıyla yerel olarak işlenir. Ses hiçbir zaman sunucuya ulaşmaz — şifreli formda bile değil.

**SFrame ses E2EE** — Paylaşılan Rust kripto kasedine entegre edilmiş anahtar türetme ile SFrame (RFC 9605) kullanan şifreli medya kanalları.

**Paylaşılan Rust kripto kasedi** — `packages/crypto/` içinde tek bir denetlenebilir uygulama, üç hedefe derlenir: yerel (Tauri masaüstü), WASM (tarayıcı, `@tauri-apps/api` aracılığıyla) ve UniFFI (iOS XCFramework + Android JNI). Ayrışabilecek üç ayrı uygulama değil.

**Karma zincirli denetim günlüğü** — Yanıtlanan her çağrı, oluşturulan not, gönderilen mesaj, değiştirilen ayar ve yönetici eylemi, müdahale tespiti için SHA-256 zinciri (`previousEntryHash` + `entryHash`) ile günlüğe kaydedilir. Yöneticiler zincir bütünlüğünü doğrulayabilir.

**Yeniden üretilebilir derlemeler** — `SOURCE_DATE_EPOCH` ile `Dockerfile.build`, içerik karma dosya adları. Her sürümde SLSA kaynağı, SBOM ve cosign imzalama. Herhangi bir derleme, `scripts/verify-build.sh` kullanılarak GitHub Sürümlerindeki `CHECKSUMS.txt` ile bayt bayt doğrulanabilir.

---

## Telefoni — 8 Sağlayıcı

**Sizi tek bir sağlayıcıya kilitleyen çoğu platformun aksine**, Llámenos 8 tam uygulamayla bir `TelephonyAdapter` arabirimi uygular. Sağlayıcıları yönetici kullanıcı arabirimi aracılığıyla değiştirin — kod değişikliği yok, kesinti yok.

### Bulut Sağlayıcıları (6)

- **Twilio** — Tam WebRTC, programlanabilir ses, SIP trunking
- **SignalWire** — Twilio uyumlu API, daha düşük maliyet, WebRTC desteği
- **Vonage** (Nexmo) — Avrupa veri yerleşimi seçeneği
- **Plivo** — Maliyet etkin, küresel kapsama
- **Telnyx** — Rekabetçi fiyatlandırma, Mission Control Portal entegrasyonu
- **Bandwidth** — Kurumsal düzeyde, ABD taşıyıcı düzeyinde güvenilirlik

### Kendi Barındırılan SIP (2)

- **Asterisk** — ARI (Asterisk REST Arabirimi) aracılığıyla. Tam çağrı kontrolü, IVR, kayıt.
- **FreeSWITCH** — ESL (Olay Soket Kütüphanesi) aracılığıyla. Yüksek performanslı, konferansa uygun.

Her ikisi de arka ucu seçen `PBX_TYPE` ortam değişkeniyle `SipBridgeAdapter` temel sınıfını kullanır. Kamailio bir SIP proxy katmanı olarak desteklenir. **Hiçbir çağrı kaydı sunucunuzu terk etmez.**

### Çağrı Yönlendirme

**Paralel çalma** — Bir arayan aradığında, vardiyada olan ve meşgul olmayan her gönüllü aynı anda çalar. İlk yanıtlayan kazanır; diğerleri hemen durur. Sıralı arama nedeniyle kaçırılan çağrı yok.

**Vardiyaya dayalı zamanlama** — Belirli günler ve zaman aralıklarıyla yinelenen vardiyalar oluşturun. Gönüllüleri atayın. Sistem çağrıları otomatik olarak nöbetteki kişiye yönlendirir. Zamanlama tanımlanmamışsa yedek çalma grubu.

**Bekleme müziğiyle kuyruk** — Tüm gönüllüler meşgulse, arayanlar yapılandırılabilir bekleme müziğiyle bir kuyruğa girer. Zaman aşımı ayarlanabilir (30–300 saniye). Yanıt alınmazsa sesli postaya geçer.

**Sesli posta yedekleme** — Arayanlar sesli mesaj bırakabilir (5 dakikaya kadar). Sesli mesajlar istemci tarafı Whisper aracılığıyla transkribe edilir ve yönetici incelemesi için şifrelenir.

**WebRTC tarayıcı araması** — Gönüllüler, telefon olmadan doğrudan tarayıcıda çağrılara yanıt verir. Twilio, SignalWire, Vonage ve Plivo için sağlayıcıya özgü WebRTC jeton oluşturma.

**Spam azaltma** — Ses CAPTCHA (rastgele 4 haneli tuş takımı girişi), telefon numarası başına kayan pencere hız sınırlaması ve gerçek zamanlı yasaklı listeler. Yöneticiler her kontrolü yeniden başlatma olmadan bağımsız olarak açıp kapatır. TTS yedekli özel IVR komut istemleri.

---

## Mesajlaşma — 5 Kanal

Tüm kanallar birleşik şifreli bir konuşma modeli paylaşır. Her gelen mesaj webhook alımında HPKE şifreli; sunucu düz metni hemen atar.

### Signal

Mevcut en eksiksiz Twilio olmayan entegrasyon. Signal bağdaştırıcısı şunları içerir:

- Teslimat makbuzlarıyla tam gönderme/alma
- Okunma makbuzları ve yazma göstergeleri
- Tepkiler ve yanıt dizisi
- signal-cli-rest-api köprüsü aracılığıyla kayıt ve bağlama
- Kimlik güveni doğrulaması ve güvenlik numarası yönetimi
- Üstel geri çekilmeli yeniden deneme kuyruğu
- Köprü arızasında alternatif taşımaya yük devretme
- İstemci tarafı Whisper aracılığıyla sesli mesaj transkripsiyonu
- Zarif düşürme ile sağlık izleme

### WhatsApp Business

- Meta Cloud API (Graph API v21.0)
- 24 saatlik pencere uyumu için şablon mesaj desteği
- Medya mesajları: görüntüler, belgeler, ses, video
- Webhook imza doğrulama
- Okunma makbuzları ve teslimat durumu

### SMS

- Twilio, SignalWire, Vonage veya Plivo aracılığıyla gelen ve giden
- Dil başına yapılandırılabilir karşılama mesajlarıyla otomatik yanıt
- Uygun yerlerde MMS desteği
- Sağlayıcı başına webhook imza doğrulama

### Telegram

- Telegram Bot API
- Medya desteği: fotoğraflar, belgeler, sesli mesajlar
- Satır içi klavyeler ve yanıt işaretlemesi
- Webhook veya yoklama modu

### RCS (Zengin İletişim Hizmetleri)

- Google RBM (Zengin İş Mesajlaşması) API
- Zengin kartlar, önerilen eylemler ve karuseller
- Teslimat ve okunma makbuzları
- RCS'nin kullanılamadığı yerlerde SMS'e geri dönüş

### Toplu/Yayın

Toplu mesajlaşma için PostgreSQL destekli teslimat kuyruğu:

- Kanal başına hız sınırlaması (sağlayıcı sınırlarına saygı gösterir)
- Saat dilimi desteğiyle zamanlanmış göndermeler
- Alıcı başına durum takibi (sıraya alındı, gönderildi, teslim edildi, başarısız)
- Ölü mektup kuyruğuyla yeniden deneme mantığı
- Yapılandırılabilir toplu boyutlarla toplu teslimat
- Gerçek zamanlı teslimat ilerlemesini gösteren yönetici panosu

---

## Çok Platform — Üç Yerel Uygulama, Bir Kripto Kasedi

Çoğu platform, ince bir yerel sarmalayıcıyla bir web uygulaması yayımlar. Llámenos, tek bir denetlenebilir Rust kripto uygulamasını paylaşan üç tam yerel uygulama yayımlar.

### Masaüstü (Tauri v2)

- Windows, macOS, Linux yerel ikili dosyalar
- Anahtar depolama için Tauri Stronghold şifreli kasa
- Gelen çağrı göstergeli yerel sistem tepsisi
- Tauri güncelleyici aracılığıyla otomatik güncellemeler
- Tek örnek zorunluluğu
- Yalıtım kalıbı + İçerik Güvenlik Politikası
- Tüm kripto işlemleri Rust IPC üzerinden yönlendirilir — özel anahtarlar hiçbir zaman web görünümüne girmez
- Sahte IPC katmanıyla E2E testi için PLAYWRIGHT_TEST derleme modu

### iOS (SwiftUI)

- `@Observable` ile yerel SwiftUI, iOS 17+
- iOS Anahtarlık'ta saklanan anahtarlar
- UniFFI XCFramework aracılığıyla Rust kripto (`LlamenosCoreFFI`)
- Birim ve entegrasyon testi için XCTest + XCUITest
- Şifreli yüklerle APNs aracılığıyla anlık bildirimler
- Çok merkez: arka plan işleyicileri hiçbir zaman aktif merkez durumuna bağlı değildir

### Android (Kotlin/Compose)

- Jetpack Compose, Material 3 ile yerel Kotlin 2.3
- minSdk 26, AGP 9.1, Gradle 9.4
- EncryptedSharedPreferences aracılığıyla Android Keystore'daki anahtarlar
- JNI paylaşılan kütüphanesi aracılığıyla Rust kripto (aynı Rust kasetinden `.so` dosyaları)
- Hilt bağımlılık enjeksiyonu + KSP açıklama işleme
- Compose UI testleri + Cucumber BDD E2E testleri
- Çok merkez: merkez başına ViewModel yeniden yükleme, merkez anahtarı önbellekleme, WebSocket yönlendirme

### Paylaşılan Rust Kripto Kasedi

`packages/crypto/` şunları uygular:

- HPKE (RFC 9180): X25519-HKDF-SHA256-AES256-GCM
- Ed25519 imzaları (WebSocket uyumluluğu için BIP-340 Schnorr)
- X25519 anahtar anlaşması
- PBKDF2 anahtar türetme (600K yineleme)
- HKDF (RFC 5869)
- XChaCha20-Poly1305 kimlik doğrulamalı şifreleme
- SFrame (RFC 9605) ses E2EE
- OpenMLS aracılığıyla MLS (Mesajlaşma Katmanı Güvenliği) — `mls` özellik bayrağının arkasında
- iOS/Android bağlamaları için UniFFI iskeleti
- Tarayıcı kullanımı için WASM derleme

---

## Vaka Yönetimi

Llámenos herhangi bir belirli kullanım durumuna sabit kodlanmamıştır. Her şey şablon güdümlüdür.

**Şablon güdümlü varlık sistemi** — Yöneticiler merkez başına varlık türleri (kişiler, vakalar, raporlar, etkinlikler), özel alanlar (metin, sayı, seç, onay kutusu, metin alanı, tarih, dosya) ve rapor türleri tanımlar. Şablonlar tüm formları ve görünümleri yönlendirir. Yeni bir iş akışı yapılandırmak için kod değişikliği gerekmez.

**Özel rapor türleri** — Şablonlar, tür başına özel alanlarla, `allowCaseConversion` ve `mobileOptimized` bayraklarıyla `reportTypes[]` tanımlar. Rapor türleri varlık türlerinden tamamen farklıdır.

**Kör dizin şifreli arama** — Kayıtlar şifreli olarak saklanır, ancak HMAC dizinli alanlar düz metin açığa çıkarmadan sunucu tarafı aramasını etkinleştirir. Dizinler merkez başına kapsamlandırılır ve hiçbir zaman merkez sınırlarını geçmez.

**Kişiler ve ilişkiler** — İlişki grafiğiyle tam kişi dizini. Kişileri vakalarla, etkinliklerle ve kanıtlarla ilişkilendirin. İlişkiler türlendirilmiş (örneğin, "tanığıdır", "yasal gözlemcisidir") ve şablon başına yapılandırılabilir.

**Kanıt yönetimi** — Vakalara dosya ekleyin. Dosyalar yüklemeden önce şifrelenir (her yetkili okuyucu için HPKE sarılı). Kanıt gözetim zinciri denetim izinde günlüğe kaydedilir.

**RBAC** — Rol tabanlı erişim kontrolü: Gönüllü (yalnızca kendi notları), Yönetici (tüm veriler), Raporlayıcı (yalnızca gönderiler). Şablon başına özel roller. Yöneticiler yalnızca gönüllü notlarını göremez.

**Çok merkez** — Tek bir Llámenos kurulumu birden fazla bağımsız merkeze (kuruluşlar, hatlar veya kullanım durumları) hizmet eder. Herhangi bir kullanıcı aynı anda birden fazla merkeze üye olabilir. TÜM üye merkezlerden gelen çağrılar, bildirimler ve aktarma etkinlikleri her zaman aktiftir — şu anda görüntülenen merkeze bağlı değildir.

---

## Kimlik Doğrulama ve Anahtar Yönetimi

**WebSocket anahtar çiftleri** — Kullanıcılar WebSocket uyumlu Ed25519 anahtar çiftleriyle kimlik doğrular. BIP-340 Schnorr imza doğrulaması. Kimlik doğrulama için parola veya e-posta adresi gerekmez.

**WebAuthn parolasız giriş** — Çok cihazlı giriş için isteğe bağlı parolasız giriş desteği. Bir donanım güvenlik anahtarı veya platform biyometrik kaydederek PIN yazmadan giriş yapın.

**Kullanıcı sigchain'i** — Yalnızca ekleme, karma zincirli cihaz yetkilendirme kayıtları. Her kayıt, yetkilendiren cihazın Ed25519 anahtarıyla imzalanır. Hangi cihazların hangi kullanıcı için yetkilendirildiğinin kriptografik geçmişini sağlar.

**Basamaklı PUK döndürme** — Kullanıcı Başına Anahtar (PUK) → items_key → not başına içerik anahtarı. Bir cihaz yetki dışı bırakıldığında veya kullanıcı PIN'ini değiştirdiğinde, etkilenen anahtarlar tembel olarak döner — kayıtlara erişildikçe yeniden şifrelenir, toplu işlemde değil.

**Cihaz temin etme** — Özel anahtarı açığa çıkarmadan yeni cihazları bağlayın. QR kodu tarayın veya kısa bir temin kodu girin. Geçici ECDH anahtar değişimi kullanır. Temin odaları 5 dakika sonra sona erer.

**Kurtarma anahtarları** — Ekleme sırasında, Base32 biçimli bir kurtarma anahtarı (128 bit entropi) oluşturulur. Devam etmeden önce zorunlu şifreli yedek indirme. Bu tek kurtarma yoludur — tasarım gereği yönetici kurtarması yok.

**Otomatik kilitleme** — Anahtar yöneticisi boşta kalma zaman aşımında veya tarayıcı sekmesi gizlendiğinde otomatik olarak kilitlenir. Yapılandırılabilir boşta kalma süresi. Kilidi açmak için PIN girin.

**Oturum modeli** — İki kademeli: "kimliği doğrulanmış ancak kilitli" (yalnızca oturum jetonu, salt okunur görünümler) ve "kimliği doğrulanmış ve kilidi açık" (PIN girildi, tam kripto erişimi). Boşta kalma zaman aşımı uyarılarıyla 8 saatlik oturum jetonları.

---

## Gerçek Zamanlı Altyapı

**WebSocket aktarması** — Gerçek zamanlı etkinlik dağıtımı için kendi barındırılan WebSocket aktarması (veya Cloudflare'de Nosflare). Tüm etkinlik içeriği merkez anahtarıyla şifrelenir. Genel etiketler (`["t", "llamenos:event"]`), aktarma düzeyinde etkinlik türleri hakkında meta veri çıkarımını engeller.

**Merkez anahtarı** — Rastgele 32 bayt (`crypto.getRandomValues`), `LABEL_HUB_KEY_WRAP` aracılığıyla merkez üyesi başına ayrı ayrı HPKE sarılı. Üye ayrılığında döner — ayrılan üyeler gelecekteki etkinliklerin şifresini çözemez.

**WebSocket** — WebSocket aracılığıyla gerçek zamanlı çağrı durumu, gönüllü varlığı, konuşma güncellemeleri ve yönetici izleme. Üstel geri çekilmeli yeniden bağlanır.

**WebSocket gerçek zamanlı eşitleme** — Cihazlar arası ve merkezler arası durum eşitlemesi için geçici tür 20001 etkinlikleri. İçerik şifreli; aktarma etkinlik türlerini ayırt edemez.

---

## Yönetici ve Gönüllü Deneyimi

**Kurulum sihirbazı** — İlk yönetici girişinde rehberli çok adımlı kurulum. Kanalları seçin, sağlayıcıları yapılandırın, acil hat adını ayarlayın. İlk merkez anahtar çiftini oluşturur ve merkez anahtarını ilk yöneticiye dağıtır.

**Başlangıç denetim listesi** — Kurulum ilerlemesini izleyen pano widget'ı: kanal yapılandırması, gönüllü ekleme, vardiya oluşturma.

**Gerçek zamanlı izleme** — Aktif çağrılar, sıraya alınan arayanlar, konuşmalar ve gönüllü durumu WebSocket aracılığıyla gerçek zamanlı olarak güncellenir.

**Komut paleti** — Anlık gezinme, arama, hızlı not oluşturma ve tema değiştirme için Ctrl+K (veya Cmd+K). Role göre filtrelenmiş yalnızca yöneticiye özel komutlar.

**Gönüllü varlığı** — Yöneticiler gerçek zamanlı çevrimiçi/çevrimdışı/molada sayılarını görür. Gönüllüler vardiyalarını terk etmeden gelen çağrıları duraklatmak için bir mola anahtarını açıp kapatır.

**Klavye kısayolları** — Tüm kısayollar için `?` tuşuna basın. Fareyi kullanmadan sayfalarda gezinin, komut paletini açın, yaygın eylemleri gerçekleştirin.

**Koyu/açık temalar** — Sistemle uyumlu, koyu veya açık. Oturum başına kalıcı.

**GDPR veri dışa aktarma** — Notları GDPR uyumlu şifreli dosya olarak dışa aktarın (`.enc`). Yalnızca orijinal yazar şifresini çözebilir.

---

## Uluslararasılaştırma

**13 yerleşik dil** — İngilizce, İspanyolca (Español), Çince (中文), Tagalog, Vietnamca (Tiếng Việt), Arapça (العربية, RTL), Fransızca (Français), Haiti Kreolü (Kreyòl Ayisyen), Korece (한국어), Rusça (Русский), Hintçe (हिन्दी), Portekizce (Português), Almanca (Deutsch).

**Kod üretimi ardışık düzeni** — JSON yerel ayar dosyalarındaki tek bir gerçek kaynağı iOS `.strings`, Android `strings.xml` ve Kotlin `I18n.kt` oluşturur — manuel eşitleme yok. `bun run i18n:validate:all` tarafından doğrulanır.

**RTL desteği** — Arapça düzeni, yansıtılmış gezinme, ayarlanmış metin hizalaması ve çift yönlü metin işlemeyle RTL modunda doğru şekilde işlenir.

**Dil başına özel IVR komut istemleri** — Arayanlarınız tarafından kullanılan her dil için sesli komut istemleri kaydedin. Kayıt yoksa metinden sese'ye geri döner.

---

## Dağıtım

### Docker Compose (Tek Sunucu)

- Tam yığın: Bun HTTP sunucusu, PostgreSQL, RustFS (nesne depolama), WebSocket aktarması
- İsteğe bağlı profiller: `--profile signal` (signal-cli yan arabası), `--profile telephony` (Kamailio + CoTURN), `--profile inference` (LLM hortum ajanı), `--profile monitoring` (Prometheus + Grafana)
- Dosya izleme ile yerel geliştirme için `docker-compose.dev.yml`
- Üretim sertleştirme için `docker-compose.production.yml` katmanı

### Kubernetes (Helm)

- Yapılandırılabilir çoğaltmalarla üretim Helm grafiği
- Sağlık araştırmaları: `/health/ready` ve `/health/live`
- Metrik kazıma için Prometheus ServiceMonitor
- HSTS, CSP ve güvenlik başlıklarıyla Caddyfile.production
- Dağıtım öncesi doğrulama için Ansible ön kontrol + duman testi oyun kitabı

### Co-op Cloud

- Co-op Cloud dağıtımları için tarif
- Kendi altyapısını çalıştıran işçi kooperatifleri ve topluluk kuruluşları için tasarlanmış

### Cloudflare Tunnels

- Cloudflare Tunnels aracılığıyla giriş — açık gelen bağlantı noktası gerekmiyor
- NAT'ın arkasındaki kendi barındırılan sunucularla uyumlu
- AB/GDPR uyumlu veri yerleşimi, AB barındırılan VPS ile birleştirildiğinde

### GDPR Uyumu

- Veriler yalnızca sunucularınızda saklanır (veya AB merkezli VPS)
- Silme hakkı: yönetici arayan kayıtlarını, notları ve günlükleri temizleyebilir
- GDPR uyumlu şifreli veri dışa aktarma
- Uygulama üzerinde üçüncü taraf analitik veya izleme yok

---

## Signal Bildirim Yan Arabası

`signal-notifier/`, ayrı bir süreç olarak 3100 numaralı bağlantı noktasında çalışır. **Sıfır bilgi**dir: kişiler HMAC karma tanımlayıcılar aracılığıyla çözülür — yan araba hiçbir zaman düz metin telefon numaraları saklamaz. Paylaşılan `SIGNAL_NOTIFIER_BEARER_TOKEN`, ana uygulamayı yan arabaya doğrular.

---

## Protokol ve Kod Üretimi

Tüm türler tek bir gerçek kaynağından akar:

- `packages/protocol/schemas/` içindeki **Zod şemaları** tüm API ve kablo türlerini tanımlar
- **Kod üretimi** (`bun run codegen`), Swift Codable yapıları, Kotlin `@Serializable` veri sınıfları ve bir OpenAPI anlık görüntüsü oluşturur
- `packages/protocol/crypto-labels.json` içindeki **Kripto etiketleri** (57 sabit), TypeScript, Swift ve Kotlin'e üretilir — kripto kodunda ham dize yok
- **i18n kod üretimi** (`bun run i18n:codegen`), JSON yerel ayar dosyalarından iOS `.strings`, Android `strings.xml` ve Kotlin `I18n.kt` oluşturur

Bu, bir şema veya protokol değişikliğinin otomatik olarak üç platforma yansıdığı anlamına gelir.
