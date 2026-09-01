---
title: Özellikler
subtitle: Bir kriz müdahale platformunun ihtiyaç duyduğu her şey — 8 telefon sağlayıcısı, 5 mesajlaşma kanalı, HPKE şifreleme (RFC 9180) ve tek denetlenebilir Rust kripto kütüphanesini paylaşan üç yerel uygulama. Bunun + PostgreSQL üzerinde kendi sunucunuzda barındırılabilir, GDPR uyumlu.
---

## Güvenlik Mimarisi

Llámenos, arayanları ve gönüllüleri iyi finanse edilmiş düşmanlara karşı — devletler, sağcı gruplar ve özel istihbarat firmaları — korumak için baştan sona tasarlanmıştır. Her kriptografik karar bilinçli, belgelenmiş ve denetlenebilirdir.

**HPKE (RFC 9180) — X25519-HKDF-SHA256-AES256-GCM** — MLS (Messaging Layer Security) ve TLS 1.3'te kullanılan aynı hibrit şifreleme standardı. Eski ECIES (secp256k1) tamamen yerini aldı. RFC 9180, resmi olarak belirtilmiş, akran incelemesinden geçmiş bir yapı sunar; geçici bir birleşim değil.

**Not başına forward secrecy** — Her not benzersiz bir rastgele anahtar kullanır, ardından bu anahtar her yetkili okuyucu (gönüllü ve her yönetici) için ayrı ayrı HPKE ile sarılır. Bir okuyucunun özel anahtarının ele geçirilmesi, ele geçirmeden önce yazılan notlar hakkında hiçbir şey açığa çıkarmaz. Anahtar hiyerarşisi: Kullanıcı Başı Anahtar (PUK) → items_key → not başına içerik anahtarı, basamaklı tembel rotasyon ile.

**Çift şifreli notlar** — Her not iki kez şifrelenir: biri yazan gönüllü için HPKE ile sarılmış, biri her yönetici için. Her ikisi de bağımsız olarak şifresini çözebilir. Sunucu dahil hiç kimse düz metni okuyamaz.

**57 alan ayrımı etiketi** — Her kriptografik işlem benzersiz bir bağlam dizesi kullanır (Albrecht savunması). İki işlem anahtar türetme yolunu paylaşmaz, böylece çapraz protokol saldırıları önlenir. Etiketler `packages/protocol/crypto-labels.json` dosyasında tanımlanır ve codegen ile TypeScript, Swift ve Kotlin'e üretilir. Kripto bağlamlarında ham string sabitleri asla kullanılmaz.

**Cihaz başına Ed25519/X25519 anahtarları** — Kullanıcıların tek bir kimlik anahtarı yerine cihaz başına anahtarları vardır. Yeni cihazlar, yalnızca ekleme yapılabilir, hash zincirli, Ed25519 ile imzalanmış bir sigchain aracılığıyla yetkilendirilir. Cihaz bağlama, 5 dakika sonra süren geçici ECDH provizyon odaları kullanır.

**PIN ile şifrelenmiş anahtar depolama** — Cihaz özel anahtarları, depolanmadan önce 600.000 PBKDF2 iterasyonu + XChaCha20-Poly1305 ile şifrelenir. Ham anahtar yalnızca bellek içi bir closure'da yaşar, kilitlendiğinde sıfırlanır. sessionStorage, IndexedDB veya diskte düz metin olarak asla bulunmaz.

**Platforma özgü güvenli depolama** — Masaüstü: Tauri Stronghold şifreli kasa. iOS: iOS Keychain. Android: EncryptedSharedPreferences üzerinden Android Keystore.

**Yalnızca istemci tarafında transkripsiyon** — Çağrı transkripsiyonu, tamamen tarayıcıda çalışan WASM Whisper (`@huggingface/transformers` ONNX runtime) kullanır. Ses, bir AudioWorklet halka tamponu → Web Worker ardışık düzeni aracılığıyla yerel olarak işlenir. Ses, şifreli formatta bile sunucuya ulaşmaz.

**SFrame ses E2EE** — Paylaşılan Rust kripto kütüphanesine entegre edilmiş anahtar türetme ile SFrame (RFC 9605) kullanan şifreli medya kanalları.

**Paylaşılan Rust kripto kütüphanesi** — `packages/crypto/` içinde tek bir denetlenebilir uygulama, üç hedefe derlenir: native (Tauri masaüstü), WASM (`@tauri-apps/api` üzerinden tarayıcı) ve UniFFI (iOS XCFramework + Android JNI). Birbirinden sapabilecek üç ayrı uygulama değil.

**Hash zincirli denetim kaydı** — Yanıtlanan her çağrı, oluşturulan her not, gönderilen her mesaj, değiştirilen her ayar ve yönetici eylemi, kurcalama tespiti için SHA-256 zincirleme (`previousEntryHash` + `entryHash`) ile kaydedilir. Yöneticiler zincir bütünlüğünü doğrulayabilir.

**Tekrarlanabilir derlemeler** — `SOURCE_DATE_EPOCH` ile `Dockerfile.build`, içerik hash'li dosya adları. Her sürümde SLSA provenance, SBOM ve cosign imzalama. Her derleme, `scripts/verify-build.sh` kullanılarak GitHub Releases'teki `CHECKSUMS.txt` ile bayt bayt doğrulanabilir.

---

## Telefon — 8 Sağlayıcı

**Çoğu platformun sizi tek bir sağlayıcıya kilitlemesinin aksine**, Llámenos 8 tam uygulamalı bir `TelephonyAdapter` arayüzü sunar. Sağlayıcıyı yönetici arayüzünden değiştirin — kod değişikliği yok, kesinti yok.

### Bulut Sağlayıcılar (6)

- **Twilio** — Tam WebRTC, programlanabilir ses, SIP trunking
- **SignalWire** — Twilio uyumlu API, daha düşük maliyet, WebRTC desteği
- **Vonage** (Nexmo) — Avrupa veri ikamet seçeneği
- **Plivo** — Maliyet etkin, küresel kapsama
- **Telnyx** — Rekabetçi fiyatlandırma, Mission Control Portal entegrasyonu
- **Bandwidth** — Kurumsal düzeyde, ABD taşıyıcı düzeyinde güvenilirlik

### Kendi Sunucunuzda SIP (2)

- **Asterisk** — ARI (Asterisk REST Interface) üzerinden. Tam çağrı kontrolü, IVR, kayıt.
- **FreeSWITCH** — ESL (Event Socket Library) üzerinden. Yüksek performanslı, konferans yetenekli.

Her ikisi de `SipBridgeAdapter` temel sınıfını kullanır ve `PBX_TYPE` ortam değişkeni arka ucu seçer. Kamailio bir SIP proxy katmanı olarak desteklenir. **Hiçbir çağrı kaydı sunucunuzdan ayrılmaz.**

### Çağrı Yönlendirme

**Paralel çalma** — Bir arayan aradığında, her vardiyadaki, meşgul olmayan gönüllü aynı anda çalar. İlk yanıtlayan kazanır; diğerleri hemen durur. Ardışık avlama nedeniyle hiçbir çağrı kaçırılmaz.

**Vardiya tabanlı planlama** — Belirli günler ve saat aralıklarıyla yinelenen vardiyalar oluşturun. Gönüllüleri atayın. Sistem, görevde olanlara otomatik olarak çağrıları yönlendirir. Plan tanımlanmamışsa yedek çalma grubu.

**Bekleme müzikli kuyruk** — Tüm gönüllüler meşgulse, arayanlar yapılandırılabilir bekleme müziği olan bir kuyruğa girer. Zaman aşımı ayarlanabilir (30–300 saniye). Cevapsız kalırsa sesli mesaja düşer.

**Sesli mesaj yedekleme** — Arayanlar sesli mesaj bırakabilir (en fazla 5 dakika). Sesli mesajlar, istemci tarafı Whisper ile transkribe edilir ve yönetici incelemesi için şifrelenir.

**WebRTC tarayıcı çağrısı** — Gönüllüler, telefona gerek kalmadan doğrudan tarayıcıdan çağrıları yanıtlar. Twilio, SignalWire, Vonage ve Plivo için sağlayıcıya özgü WebRTC token üretimi.

**Spam azaltma** — Ses CAPTCHA (rastgele 4 haneli tuş takımı girişi), telefon numarası başına kayan pencere hız sınırlandırma ve gerçek zamanlı yasak listeleri. Yöneticiler her kontrolü bağımsız olarak, yeniden başlatma gerektirmeden açıp kapatabilir. TTS yedekli özel IVR komutları.

---

## Mesajlaşma — 5 Kanal

Tüm kanallar birleşik şifreli konuşma modelini paylaşır. Her gelen mesaj, webhook alındığında HPKE ile şifrelenir; sunucu düz metni hemen atar.

### Signal

Mevcut en eksiksiz Twilio dışı entegrasyon. Signal adaptörü şunları içerir:

- Teslimat onaylarıyla tam gönderme/alma
- Okundu onayları ve yazma göstergeleri
- Tepkiler ve yanıt dizisi
- signal-cli-rest-api köprüsü üzerinden kayıt ve bağlama
- Kimlik güveni doğrulama ve güvenlik numarası yönetimi
- Üstel geri çekilme ile yeniden deneme kuyruğu
- Köprü arızasında alternatif taşımaya yük devretme
- İstemci tarafı Whisper ile sesli mesaj transkripsiyonu
- Zarif bozulma ile sağlık izleme

### WhatsApp Business

- Meta Cloud API (Graph API v21.0)
- 24 saatlik pencere uyumu için şablon mesaj desteği
- Medya mesajları: resimler, belgeler, ses, video
- Webhook imza doğrulama
- Okundu onayları ve teslimat durumu

### SMS

- Twilio, SignalWire, Vonage veya Plivo üzerinden gelen ve giden
- Dil başına yapılandırılabilir karşılama mesajlarıyla otomatik yanıt
- Mümkün olduğunda MMS desteği
- Sağlayıcı başına webhook imza doğrulama

### Telegram

- Telegram Bot API
- Medya desteği: fotoğraflar, belgeler, sesli mesajlar
- Satır içi klavyeler ve yanıt biçimlendirme
- Webhook veya polling modu

### RCS (Rich Communication Services)

- Google RBM (Rich Business Messaging) API
- Zengin kartlar, önerilen eylemler ve karuseller
- Teslimat ve okundu onayları
- RCS kullanılamadığında SMS'e yedekleme

### Toplu Yayın (Blast/Broadcast)

Toplu mesajlaşma için PostgreSQL destekli teslimat kuyruğu:

- Kanal başına hız sınırlandırma (sağlayıcı limitlerine saygı gösterir)
- Saat dilimi desteği ile planlı gönderimler
- Alıcı başına durum takibi (kuyrukta, gönderildi, teslim edildi, başarısız)
- Ölü mektup kuyruğu ile yeniden deneme mantığı
- Yapılandırılabilir toplu boyutlarla toplu teslimat
- Yönetici panelinde gerçek zamanlı teslimat ilerlemesi

---

## Çok Platformlu — Üç Yerel Uygulama, Bir Kripto Kütüphanesi

Çoğu platform, ince bir yerel sarmalayıcı ile bir web uygulaması sunar. Llámenos, tek bir denetlenebilir Rust kripto uygulamasını paylaşan üç tamamen yerel uygulama sunar.

### Masaüstü (Tauri v2)

- Windows, macOS, Linux yerel ikili dosyalar
- Anahtar depolama için Tauri Stronghold şifreli kasa
- Gelen çağrı göstergesi ile yerel sistem tepsisi
- Tauri updater üzerinden otomatik güncellemeler
- Tek örnek zorlaması
- İzolasyon deseni + İçerik Güvenliği Politikası
- Tüm kripto işlemleri Rust IPC üzerinden yönlendirilir — özel anahtarlar asla webview'e girmez
- E2E testler için PLAYWRIGHT_TEST derleme modu, sahte IPC katmanı ile

### iOS (SwiftUI)

- Yerel SwiftUI, iOS 17+ `@Observable` ile
- Anahtarlar iOS Keychain'de saklanır
- UniFFI XCFramework aracılığıyla Rust kripto (`LlamenosCoreFFI`)
- Birim ve entegrasyon testleri için XCTest + XCUITest
- Şifreli yüklerle APNs üzerinden push bildirimleri
- Çoklu merkez: arka plan işleyicileri hiçbir zaman aktif merkez durumuna bağlı değildir

### Android (Kotlin/Compose)

- Jetpack Compose, Material 3 ile yerel Kotlin 2.3
- minSdk 26, AGP 9.1, Gradle 9.4
- EncryptedSharedPreferences üzerinden Android Keystore'taki anahtarlar
- JNI paylaşılan kütüphanesi aracılığıyla Rust kripto (aynı Rust kütüphanesinden `.so` dosyaları)
- Hilt bağımlılık enjeksiyonu + KSP anotasyon işleme
- Compose UI testleri + Cucumber BDD E2E testleri
- Çoklu merkez: merkez başına ViewModel yeniden yükleme, merkez anahtarı önbellekleme, WebSocket yönlendirme

### Paylaşılan Rust Kripto Kütüphanesi

`packages/crypto/` şunları uygular:

- HPKE (RFC 9180): X25519-HKDF-SHA256-AES256-GCM
- Ed25519 imzaları (WebSocket uyumluluğu için BIP-340 Schnorr)
- X25519 anahtar anlaşması
- PBKDF2 anahtar türetme (600K iterasyon)
- HKDF (RFC 5869)
- XChaCha20-Poly1305 kimliği doğrulanmış şifreleme
- SFrame (RFC 9605) ses E2EE
- OpenMLS aracılığıyla MLS (Messaging Layer Security) — `mls` özellik bayrağının arkasında
- iOS/Android bağlamaları için UniFFI iskelesi
- Tarayıcı kullanımı için WASM derlemesi

---

## Vaka Yönetimi

Llámenos, herhangi bir spesifik kullanım durumuna sabit kodlanmış değildir. Her şey şablon tabanlıdır.

**Şablon tabanlı varlık sistemi** — Yöneticiler, merkez başına varlık türlerini (kişiler, vakalar, raporlar, olaylar), özel alanları (metin, sayı, seçim, onay kutusu, metin alanı, tarih, dosya) ve rapor türlerini tanımlar. Şablonlar tüm formları ve görünümleri yönlendirir. Yeni bir iş akışı yapılandırmak için kod değişikliği gerekmez.

**Özel rapor türleri** — Şablonlar, tür başına özel alanlarla, `allowCaseConversion` ve `mobileOptimized` bayraklarıyla `reportTypes[]` tanımlar. Rapor türleri, varlık türlerinden tamamen farklıdır.

**Kör indeksli şifreli arama** — Kayıtlar şifreli olarak saklanır, ancak HMAC indeksli alanlar sunucu tarafında düz metni açığa çıkarmadan aramayı mümkün kılar. İndeksler merkez başına kapsamlıdır ve asla merkez sınırlarını aşmaz.

**Kişiler ve ilişkiler** — Tam kişi rehberi ile ilişki grafiği. Kişileri vakalara, olaylara ve kanıtlara bağlayın. İlişkiler türlüdür (örneğin, "tanık olduğu", "hukuki gözlemcisi olduğu") ve şablon başına yapılandırılabilir.

**Kanıt yönetimi** — Vakalara dosya ekleyin. Dosyalar, yüklemeden önce şifrelenir (yetkili okuyucu başına HPKE ile sarılmış). Kanıt zinciri, denetim izinde kaydedilir.

**RBAC** — Rol tabanlı erişim kontrolü: Gönüllü (yalnızca kendi notları), Yönetici (tüm veriler), Muhabir (yalnızca gönderimler). Şablon başına özel roller. Yöneticiler, gönüllüye özel notları göremez.

**Çoklu merkez** — Tek bir Llámenos kurulumu, birden fazla bağımsız merkezi (kuruluş, hat veya kullanım durumu) hizmet verir. Herhangi bir kullanıcı aynı anda birden fazla merkezin üyesi olabilir. TÜM üye merkezlerden gelen çağrılar, bildirimler ve aktarım olayları her zaman aktiftir — şu anda hangi merkezin görüntülendiğine bağlı değildir.

---

## Kimlik Doğrulama ve Anahtar Yönetimi

**WebSocket anahtar çiftleri** — Kullanıcılar, WebSocket uyumlu Ed25519 anahtar çiftleri ile kimlik doğrular. BIP-340 Schnorr imza doğrulaması. Kimlik doğrulama için şifre veya e-posta adresi gerekmez.

**WebAuthn passkey'leri** — Çoklu cihaz girişi için isteğe bağlı passkey desteği. Bir donanım güvenlik anahtarı veya platform biyometriği kaydedin, ardından PIN girmeden oturum açın.

**Kullanıcı sigchain'i** — Yalnızca ekleme yapılabilir, hash zincirli cihaz yetkilendirme kayıtları. Her kayıt, yetkilendiren cihazın Ed25519 anahtarı ile imzalanır. Bir kullanıcı için hangi cihazların yetkili olduğunun kriptografik geçmişini sağlar.

**Basamaklı PUK rotasyonu** — Kullanıcı Başı Anahtar (PUK) → items_key → not başına içerik anahtarı. Bir cihaz yetkisiz hale getirildiğinde veya bir kullanıcı PIN'ini değiştirdiğinde, etkilenen anahtarlar tembel olarak döner — kayıtları toplu bir işlemde değil, erişildikçe yeniden şifreler.

**Cihaz provizyonu** — Özel anahtarı açığa çıkarmadan yeni cihazları bağlayın. Bir QR kodu tarayın veya kısa bir provizyon kodu girin. Geçici ECDH anahtar değişimi kullanır. Provisyon odaları 5 dakika sonra süre dolar.

**Kurtarma anahtarları** — Katılım sırasında, Base32 formatında bir kurtarma anahtarı (128-bit entropy) üretilir. İlerlemeden önce zorunlu şifreli yedekleme indirmesi. Bu, tek kurtarma yoludur — tasarım gereği yönetici kurtarması yok.

**Otomatik kilit** — Anahtar yöneticisi, boşta kalma zaman aşımında veya tarayıcı sekmesi gizlendiğinde otomatik olarak kilitlenir. Yapılandırılabilir boşta kalma süresi. Kilidi açmak için PIN'i yeniden girin.

**Oturum modeli** — İki katmanlı: "kimliği doğrulanmış ancak kilitli" (yalnızca oturum tokeni, salt okunur görünümler) ile "kimliği doğrulanmış ve kilidi açık" (PIN girildi, tam kripto erişimi). Boşta kalma zaman aşımı uyarıları ile 8 saatlik oturum tokenleri.

---

## Gerçek Zamanlı Altyapı

**WebSocket aktarımı** — Gerçek zamanlı olay dağıtımı için kendi kendine barındırılan WebSocket aktarımı (veya Cloudflare üzerinde Nosflare). Tüm olay içeriği merkez anahtarı ile şifrelenir. Genel etiketler (`["t", "llamenos:event"]`) aktarım düzeyinde olay türleri hakkında meta veri çıkarımını engeller.

**Merkez anahtarı** — Rastgele 32 bayt (`crypto.getRandomValues`), `LABEL_HUB_KEY_WRAP` üzerinden merkez üyesi başına ayrı ayrı HPKE ile sarılmış. Üye ayrılığında döndürülür — ayrılan üyeler gelecek olayları şifresini çözemez.

**WebSocket** — Gerçek zamanlı çağrı durumu, gönüllü varlığı, konuşma güncellemeleri ve yönetici izleme WebSocket üzerinden. Üstel geri çekilme ile yeniden bağlanma.

**WebSocket gerçek zamanlı senkronizasyon** — Çapraz cihaz ve çapraz merkez durum senkronizasyonu için geçici kind 20001 olayları. İçerik şifreli; aktarım olay türlerini ayırt edemez.

---

## Yönetici ve Gönüllü Deneyimi

**Kurulum sihirbazı** — İlk yönetici girişinde rehberli çok adımlı kurulum. Kanalları seçin, sağlayıcıları yapılandırın, yardım hattı adını belirleyin. İlk merkez anahtar çiftini üretir ve merkez anahtarını ilk yöneticiye dağıtır.

**Başlangıç kontrol listesi** — Kurulum ilerlemesini izleyen kontrol paneli widget'ı: kanal yapılandırması, gönüllü katılımı, vardiya oluşturma.

**Gerçek zamanlı izleme** — Aktif çağrılar, kuyruktaki arayanlar, konuşmalar ve gönüllü durumu WebSocket üzerinden gerçek zamanlı olarak güncellenir.

**Komut paleti** — Anında gezinme, arama, hızlı not oluşturma ve tema değiştirme için Ctrl+K (veya Cmd+K). Yönetici-özel komutlar role göre filtrelenir.

**Gönüllü varlığı** — Yöneticiler, çevrimiçi/çevrimdışı/mola sayılarını gerçek zamanlı olarak görür. Gönüllüler, vardiyalarından ayrılmadan gelen çağrıları duraklatmak için bir mola anahtarı kullanır.

**Klavye kısayolları** — Tüm kısayollar için `?` tuşuna basın. Sayfalar arasında gezinin, komut paletini açın, yaygın eylemleri fare olmadan gerçekleştirin.

**Koyu/açık temalar** — Sistem takibi, koyu veya açık. Oturum başına kalıcı.

**GDPR veri dışa aktarımı** — Notları GDPR uyumlu şifreli bir dosya (`.enc`) olarak dışa aktarın. Yalnızca orijinal yazar şifresini çözebilir.

---

## Uluslararasılaştırma

**13 dil built in** — İngilizce, İspanyolca (Español), Çince (中文), Tagalog, Vietnamca (Tiếng Việt), Arapça (العربية, RTL), Fransızca (Français), Haiti Kreyolu (Kreyòl Ayisyen), Korece (한국어), Rusça (Русский), Hintçe (हिन्दी), Portekizce (Português), Almanca (Deutsch).

**Codegen ardışık düzeni** — JSON yerel dosyalarındaki tek kaynak, iOS `.strings`, Android `strings.xml` ve Kotlin `I18n.kt` üretir — elle senkronizasyon yok. `bun run i18n:validate:all` ile doğrulanır.

**RTL desteği** — Arapça düzeni, aynalanmış gezinme, ayarlanmış metin hizalama ve çift yönlü metin işleme ile RTL modunda doğru şekilde görüntülenir.

**Dil başına özel IVR komutları** — Arayanlarınızın kullandığı her dil için ses komutları kaydedin. Kayıt yoksa metin-ses'e yedekleme yapılır.

---

## Dağıtım

### Docker Compose (Tek Sunucu)

- Tam yığın: Bun HTTP sunucusu, PostgreSQL, RustFS (nesne depolama), WebSocket aktarımı
- İsteğe bağlı profiller: `--profile signal` (signal-cli yan hizmeti), `--profile telephony` (Kamailio + CoTURN), `--profile inference` (LLM firehose agent), `--profile monitoring` (Prometheus + Grafana)
- Dosya izleme ile yerel geliştirme için `docker-compose.dev.yml`
- Üretim sertleştirme için `docker-compose.production.yml` katmanı

### Kubernetes (Helm)

- Yapılandırılabilir replikalar ile üretim Helm şablonu
- Sağlık sondaları: `/health/ready` ve `/health/live`
- Metrik kazıma için Prometheus ServiceMonitor
- HSTS, CSP ve güvenlik başlıkları ile Caddyfile.production
- Dağıtım öncesi doğrulama için Ansible ön uçuş + duman kontrolü playbook'ları

### Co-op Cloud

- Co-op Cloud dağıtımları için tarif
- Kendi altyapılarını işleten işçi kooperatifleri ve topluluk kuruluşları için tasarlandı

### Cloudflare Tunnels

- Cloudflare Tunnels üzerinden giriş — açık gelen bağlantı noktaları gerekmez
- NAT arkasındaki kendi kendine barındırılan sunucularla uyumlu
- AB/GDPR uyumlu veri ikameti, AB barındırılan VPS ile birleştirildiğinde

### GDPR Uyumu

- Veriler yalnızca sunucularınızda (veya AB tabanlı VPS'te) saklanır
- Silme hakkı: yönetici, arayan kayıtlarını, notları ve günlükleri temizleyebilir
- GDPR uyumlu şifreli veri dışa aktarımı
- Uygulamanın kendisinde üçüncü taraf analitik veya izleme yok

---

## Signal Bildirim Yan Hizmeti

`signal-notifier/`, ayrı bir işlem olarak 3100 numaralı bağlantı noktasında çalışır. Bu **sıfır bilgi**dir: kişiler HMAC hash'li tanımlayıcılar üzerinden çözülür — yan hizmet asla düz metin telefon numaraları saklamaz. Paylaşılan `SIGNAL_NOTIFIER_BEARER_TOKEN`, ana uygulamanın yan hizmete kimlik doğrulamasını sağlar.

---

## Protokol ve Codegen

Tüm türler tek bir kaynaktan akar:

- `packages/protocol/schemas/` içindeki **Zod şemaları**, tüm API ve kablo türlerini tanımlar
- **Codegen** (`bun run codegen`), Swift Codable struct'ları, Kotlin `@Serializable` veri sınıfları ve bir OpenAPI anlık görüntüsü üretir
- `packages/protocol/crypto-labels.json` içindeki **Kripto etiketleri** (57 sabit), TypeScript, Swift ve Kotlin'e üretilir — kripto kodunda ham string yok
- **i18n codegen** (`bun run i18n:codegen`), JSON yerel dosyalarından iOS `.strings`, Android `strings.xml` ve Kotlin `I18n.kt` üretir

Bu, bir şema veya protokol değişikliğinin otomatik olarak üç platforma da yansıması anlamına gelir.
