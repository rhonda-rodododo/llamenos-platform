---
title: Yönetici Kılavuzu
description: Her şeyi yönetin — gönüllüler, vardiyalar, kanallar, konuşmalar, raporlar, yasak listeleri ve özel alanlar.
---

Yönetici olarak, her şeyi yönetirsiniz: gönüllüler, vardiyalar, iletişim kanalları, konuşmalar, raporlar, yasak listeleri ve özel alanlar. Bu kılavuz temel yönetici iş akışlarını kapsar.

## Oturum açma

[kurulum](/docs/deploy) sırasında oluşturulan `nsec` (WebSocket gizli anahtarı) ile oturum açın. Giriş sayfası nsec formatını (`nsec1...`) kabul eder. Tarayıcınız anahtarla bir sorgu imzalar — gizli anahtar cihazı asla terk etmez.

İsteğe bağlı olarak, ek cihazlarda şifresiz oturum açma için Ayarlar'dan bir WebAuthn parola anahtarı kaydedebilirsiniz.

## Kurulum sihirbazı

İlk girişinizde uygulama sizi **kurulum sihirbazına** yönlendirir — rehberli çok adımlı bir akış:

1. **Yardım hattınıza bir ad verin** — kullanıcılara gösterilen görünen adı ayarlayın
2. **Kanalları seçin** — Ses, SMS, WhatsApp, Signal ve Raporları açıp/kapatın
3. **Sağlayıcıları yapılandırın** — her etkin kanal için kimlik bilgilerini girin
4. **Gözden geçirin** — ayarlarınızı onaylayın ve kurulumu tamamlayın

Sihirbazı tamamladıktan sonra `setupCompleted` bayrağı ayarlanır ve sihirbaz bir daha görünmez. Bu ayarları daha sonra Ayarlar sayfasından değiştirebilirsiniz.

## Gönüllüleri yönetme

Gönüllüleri yönetmek için kenar çubuğundan **Gönüllüler** bölümüne gidin:

- **Gönüllü ekle** — yeni bir WebSocket anahtar çifti oluşturur. nsec'i güvenli bir şekilde gönüllüyle paylaşın (bir kez gösterilir).
- **Davet bağlantısı oluştur** — tek kullanımlık bir bağlantı oluşturur. Davet akışı bir rol seçici içerir (gönüllü, yönetici veya muhabir).
- **Düzenle** — adı, telefon numarasını ve rolü güncelleyin.
- **Kaldır** — bir gönüllünün erişimini devre dışı bırakın.

Gönüllü telefon numaraları sadece yöneticilere görünür. Vardiyada olan gönüllüye paralel çalma yapılırken kullanılırlar.

## Muhabirleri yönetme

Muhabirler, platform üzerinden ipucu veya rapor gönderen kişiler için özel bir roldür. Kısıtlı erişimleri vardır — sadece kendi raporlarını ve yardım sayfasını görüntüleyebilirler.

Muhabir eklemek için:
1. Bir davet bağlantısı oluşturun ve **Muhabir** rolünü seçin
2. Bağlantıyı muhabirle paylaşın — kendi kimlik bilgilerini oluşturacaklar
3. Muhabirler giriş yapar ve sadece Raporlar ve Yardım içeren basitleştirilmiş bir arayüz görürler

## Vardiyaları yapılandırma

Yinelenen programlar oluşturmak için **Vardiyalar** bölümüne gidin:

1. **Vardiya Ekle**'ye tıklayın
2. Bir ad belirleyin, haftanın günlerini seçin ve başlangıç/bitiş saatlerini ayarlayın
3. Aranabilir çoklu seçim kullanarak gönüllüleri atayın
4. Kaydedin — sistem otomatik olarak aktif vardiyadaki gönüllülere çağrıları yönlendirecektir

Vardiyalar sayfasının alt kısmında bir **Yedek Grup** yapılandırın. Bu gönüllüler, planlanmış bir vardiya aktif olmadığında çalacaktır.

## Yasak listeleri

Engellenen telefon numaralarını yönetmek için **Yasaklar** bölümüne gidin:

- **Tek giriş** — E.164 formatında bir telefon numarası yazın (örn. +15551234567)
- **Toplu içe aktarma** — birden fazla numarayı yapıştırın, her satıra bir tane
- **Kaldır** — bir numaranın yasağını anında kaldırın

Yasaklar hemen etkili olur. Yasaklı arayanlar bir reddetme mesajı duyar ve bağlantısı kesilir.

## Konuşmalar

Mesajlaşma kanalları (SMS, WhatsApp, Signal) etkinleştirildiğinde, kenar çubuğunda bir **Konuşmalar** bağlantısı belirir. Bu, tüm mesajlaşma kanallarındaki tüm konuşmaları gösterir.

Her konuşma şunları gösterir:
- Zaman damgaları ve yönü (gelen/giden) ile mesaj balonları
- Mesajın geldiği kanal (SMS, WhatsApp, Signal)
- WebSocket rölesi üzerinden gerçek zamanlı güncellemeler — yeni mesajlar anında görünür

Konuşmalar, gelen bir mesaj geldiğinde otomatik olarak oluşturulur. Gönüllüler konuşma görünümünden doğrudan yanıt verebilirler.

## Raporlar

Raporlar kanalı etkinleştirildiğinde, yöneticiler tüm gönderilen raporları görüntüleyebilir:

- **Rapor listesi** — başlık, kategori, durum ve gönderim tarihi ile tüm raporları gösterir
- **Durum takibi** — raporlar açık → üstlenildi → çözüldü olarak ilerler
- **Rapor üstlen** — bir raporu kendinize atayın
- **Konuşmalı yanıtlar** — muhabirlerle şifrelenmiş mesajlarla yanıt verin
- **Dosya ekleri** — muhabirler raporlarına şifrelenmiş dosya ekleyebilirler

Rapor gövdesi içeriği ve dosya ekleri ECIES kullanılarak şifrelenir — sunucu düz metin rapor içeriğini asla görmez.

## Çağrı ayarları

**Ayarlar** bölümünde birkaç bölüm bulacaksınız:

### Spam önleme

- **Sesli CAPTCHA** — açıp/kapatın. Etkinleştirildiğinde, arayanlar rastgele 4 haneli bir kod girmelidir.
- **Hız sınırlama** — açıp/kapatın. Bir telefon numarasından kayan zaman penceresi içindeki çağrıları sınırlar.

### Transkripsiyon

- **Genel açma/kapatma** — tüm çağrılar için Whisper transkripsiyonunu etkinleştirin/devre dışı bırakın.
- Bireysel gönüllüler kendi ayarları aracılığıyla da devre dışı bırakabilir.

### Çağrı ayarları

- **Kuyruk zaman aşımı** — arayanların sesli mesaja gitmeden önce ne kadar bekleyeceği (30-300 saniye).
- **Sesli mesaj maksimum süresi** — maksimum kayıt uzunluğu (30-300 saniye).

### Özel not alanları

Not alma formunda görünen yapılandırılmış alanları tanımlayın:

- Desteklenen türler: metin, sayı, seçim (açılır menü), onay kutusu, metin alanı
- Doğrulamayı yapılandırın: zorunlu, min/maks uzunluk, min/maks değer
- Görünürlüğü kontrol edin: gönüllülerin hangi alanları görebileceğini ve düzenleyebileceğini seçin
- Alanları yukarı/aşağı oklar kullanarak yeniden sıralayın
- Maksimum 20 alan, seçim alanı başına maksimum 50 seçenek

Özel alan değerleri not içeriğiyle birlikte şifrelenir. Sunucu bunları asla görmez.

### Sesli komutlar

Desteklenen her dil için özel IVR sesli komutları kaydedin. Sistem kayıtlarınızı karşılama, CAPTCHA, kuyruk ve sesli mesaj akışları için kullanır. Kayıt bulunmadığında metinden konuşmaya geçiş yapar.

### Mesajlaşma kanalları

SMS, WhatsApp ve Signal kanallarını yapılandırın:

- **SMS** — etkinleştirin/devre dışı bırakın, otomatik yanıtlar için karşılama mesajını yapılandırın. Ses telefonunuzla aynı sağlayıcıyı kullanır (Twilio, SignalWire, Vonage veya Plivo).
- **WhatsApp** — etkinleştirin/devre dışı bırakın, Meta Cloud API kimlik bilgilerini girin (erişim anahtarı, doğrulama anahtarı, telefon numarası kimliği). 24 saatlik mesajlaşma penceresi içinde konuşma başlatmak için şablon mesajları destekler.
- **Signal** — etkinleştirin/devre dışı bırakın, signal-cli-rest-api köprü URL'sini ve telefon numarasını yapılandırın. Yumuşak bozulma ile sağlık izlemeyi içerir.

Her kanalın kendi webhook uç noktası vardır — yapılandırılacak URL'ler için [Başlangıç](/docs/deploy) bölümüne bakın.

### WebAuthn politikası

İsteğe bağlı olarak yöneticiler, gönüllüler veya her ikisi için parola anahtarları zorunlu kılın. Zorunlu kılındığında, kullanıcılar uygulamayı kullanmadan önce bir parola anahtarı kaydetmelidir.

## Uygulama içi yardım

**Yardım** sayfası şunları sağlar:
- SSS bölümleri: Başlangıç, Çağrılar ve Vardiyalar, Notlar ve Şifreleme, Yönetim
- Yöneticiler, gönüllüler ve muhabirler için rol bazlı kılavuzlar
- Klavye kısayolları ve güvenlik için hızlı referans kartları
- Genişletilebilir/daraltılabilir SSS öğeleri

Yönetici paneli ayrıca kurulum ilerlemesini izleyen bir **Başlangıç kontrol listesi** gösterir (kanalları yapılandırma, gönüllü ekleme, vardiya oluşturma, vb.).

## Denetim kaydı

**Denetim Kaydı** sayfası, kronolojik bir sistem olayları listesi gösterir: girişler, çağrı yanıtları, not oluşturma, ayar değişiklikleri ve yönetici eylemleri. Girişler hashlenmiş IP adresleri ve ülke meta verileri içerir. Geçmişe göz atmak için sayfalama kullanın.

## Çağrı geçmişi

**Çağrılar** sayfası, durum, süre ve gönüllü ataması ile tüm çağrıları gösterir. Tarih aralığına göre filtreleyin veya telefon numarasına göre arama yapın. Verileri GDPR uyumlu JSON formatında dışa aktarın.
