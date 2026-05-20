---
title: Destek
subtitle: Llámenos ile ilgili yardım alın — kurulum, yapılandırma ve sorun giderme.
---

## İletişim

**E-posta:** [support@llamenos-platform.com](mailto:support@llamenos-platform.com)

2 iş günü içinde yanıt vermeyi hedefliyoruz. Aktif bir kriz hattını etkileyen acil sorunlar için konu satırına "ACİL" yazın.

**Hata raporları ve özellik istekleri:** [github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues)

**Güvenlik açıklamaları:** Güvenlik açıkları için, lütfen herkese açık bir konu açmak yerine GitHub'ın özel güvenlik danışma özelliğini kullanın.

---

## Belgeler

- [Dağıtım kılavuzu](/docs/deploy) — kendi barındırılan merkezinizi kurun
- [Yönetici kılavuzu](/docs/admin-guide) — gönüllüleri, vardiyaları ve ayarları yönetin
- [Gönüllü kılavuzu](/docs/volunteer-guide) — çağrılara yanıt verin, not alın, uygulamayı kullanın
- [Raporlayıcı kılavuzu](/docs/reporter-guide) — raporlar ve vaka kayıtları gönderin

---

## Sık Sorulan Sorular

### Başlarken

**Llámenos nedir?**

Llámenos, güvenli bir kriz müdahale hattı işletmek için açık kaynaklı yazılımdır. Kuruluşlar kendi merkezlerini kendi barındırır. Birisi acil hat numaranızı aradığında, vardiyada olan tüm gönüllüler aynı anda çalar — ilk yanıtlayan çağrıyı alır. Gönüllüler şifreli notlar kaydeder. Yöneticiler vardiyaları, gönüllüleri ve ayarları yönetir.

**Llámenos'u kim çalıştırır?**

Her kuruluş kendi merkezini çalıştırır. Merkezi bir Llámenos bulut hizmeti yoktur. iOS uygulaması, kuruluşunuzun kendi barındırdığı merkezine bağlanır, herhangi bir Llámenos tarafından işletilen sunucuya değil.

**iOS uygulamasını nasıl edinebilirim?**

Llámenos'u App Store'dan indirin. Kullanmak için bir merkezin yöneticisinden davet almanız gerekir. Uygulama merkez bağlantısı olmadan kullanılamaz.

**Davet aldım — hesabımı nasıl kurarım?**

Davet bağlantısını cihazınızda açın. Uygulama sizi şifreli cihaz anahtarlarınızı oluşturma ve merkeze katılma konusunda yönlendirecektir. Bir PIN belirlemeniz gerekecek — bu PIN şifreleme anahtarlarınızı korur ve unutulursa kurtarılamaz.

---

### Çağrılar ve vardiyalar

**Vardiyadayım ama çağrı almıyorum. Ne yanlış gidiyor?**

Şunları kontrol edin:
- Uygulamada müsait olarak işaretlendiniz
- iOS Ayarları → Bildirimler'de Llámenos için anlık bildirimler etkinleştirildi
- Merkez yöneticiniz bir telefoni sağlayıcısı yapılandırdı
- Aktif vardiyaya veya çalma grubuna atandınız

Bildirimler diğer uygulamalar için çalışıyorsa ancak Llámenos için çalışmıyorsa, anlık bildirim yapılandırmasını doğrulamak için merkez yöneticinizle iletişime geçin.

**Kişisel telefon numarama çağrı alabilir miyim?**

Varsayılan olarak, çağrılar uygulamaya anlık bildirim olarak iletilir. Yöneticiniz PSTN geri dönüşünü (gerçek bir telefon numarasına yönlendirme) etkinleştirdiyse, kişisel numaranız telefoni sağlayıcısına açılırdı. Hangi modun yapılandırıldığını yöneticinize sorun.

**Kimse bir çağrıyı yanıtlamazsa ne olur?**

Yapılandırılmış zaman aşımından sonra, çağrı sesli postaya gider (yapılandırıldıysa) veya bağlantısı kesilir. Yöneticiniz merkez ayarlarında yedek davranışı yapılandırabilir.

---

### Gizlilik ve şifreleme

**Sunucu notlarımı okuyabilir mi?**

Hayır. Notlar, transkriptler, raporlar ve mesajlar uçtan uca şifrelenir. Sunucu yalnızca şifrelenmiş metin saklar. Merkez operatörünüz içeriği okuyamaz. Teknik ayrıntılar için [Gizlilik Politikamıza](/privacy) ve [Güvenlik sayfamıza](/security) bakın.

**PIN'imi unutursam ne olur?**

PIN'iniz şifreleme anahtarlarınızı korur. Unutursanız, şifreli verileriniz kurtarılamaz — bu bir güvenlik özelliğidir, hata değil. Hesabınızı sıfırlamak için merkez yöneticinizle iletişime geçin. Hesabınızdaki önceden şifrelenmiş notlara erişimi kaybedeceksiniz.

**Çağrı sesim kaydediliyor mu?**

Kayıt varsayılan olarak devre dışıdır. Yöneticiniz kaydı etkinleştirdiyse, bunu gönüllülere açıklaması gerekir. Tarayıcı içi transkripsiyon cihaz üstü yapay zeka kullanır — ses asla cihazınızı terk etmez.

---

### Teknik sorunlar

**Uygulama "Merkeze bağlanılamıyor" diyor. Ne yapmalıyım?**

1. İnternet bağlantınızı kontrol edin
2. Merkez yöneticinizin sunucuyu çalıştırdığını doğrulayın
3. Uygulamayı kapatıp yeniden açmayı deneyin
4. Sorun devam ederse, uygulamanın tanılama ekranındaki hata mesajıyla merkez yöneticinizle iletişime geçin

**Hata nasıl bildiririm?**

[github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues) adresinden bir konu açın. Şunları dahil edin:
- iOS sürümü ve cihaz modeli
- Uygulama sürümü (Ayarlar → Hakkında'da bulunur)
- Sorunu yeniden oluşturma adımları
- Ne beklediğiniz ve ne olduğu
- Görüntülenen hata mesajları

**Bir güvenlik açığı buldum. Nasıl bildiririm?**

GitHub'ın özel güvenlik danışmasını kullanın: [github.com/rhonda-rodododo/llamenos-platform/security/advisories/new](https://github.com/rhonda-rodododo/llamenos-platform/security/advisories/new). Güvenlik açıkları için herkese açık konu açmayın.

---

### Yöneticiler için

**Bir merkezi nasıl kendi barındırırım?**

[Dağıtım kılavuzuna](/docs/deploy) bakın. Llámenos, standart bir Linux VPS'de Docker Compose aracılığıyla çalışır. Minimum gereksinimler: 2 vCPU, 2 GB RAM, PostgreSQL 16.

**Merketime gönüllüleri nasıl eklerim?**

Yönetici panelinde Gönüllüler → Davet'e gidin. Bir davet bağlantısı oluşturun ve güvenli bir şekilde gönüllüyle paylaşın. Bağlantı tek kullanımlıktır ve süresi dolar.

**Hangi telefoni sağlayıcıları destekleniyor?**

Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth, Asterisk ve FreeSWITCH. Her sağlayıcı için yapılandırma talimatları için yönetici kılavuzuna bakın.

**Barındırılan / yönetilen bir sürüm var mı?**

Şu anda yok. Llámenos, kendi barındırılan yazılımdır. Kendi altyapısını işletemeyen kuruluşlar için yönetilen barındırma seçenekleri araştırıyoruz — bu kuruluşunuz için bir engelse [support@llamenos-platform.com](mailto:support@llamenos-platform.com) ile iletişime geçin.
