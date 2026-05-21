---
title: Gönüllü Kılavuzu
description: Gönüllü olarak bilmeniz gereken her şey — oturum açma, çağrı alma, mesajlara yanıt verme, not yazma ve transkripsiyon kullanma.
---

Bu kılavuz, gönüllü olarak bilmeniz gereken her şeyi kapsar: oturum açma, çağrı alma, mesajlara yanıt verme, not yazma ve transkripsiyon özelliğini kullanma.

## Kimlik bilgilerinizi alma

Yöneticiniz size şunlardan birini verecektir:

- Bir **nsec** (WebSocket gizli anahtarı) — `nsec1` ile başlayan bir dize
- Bir **davet bağlantısı** — sizin için kimlik bilgileri oluşturan tek kullanımlık bir URL

**nsec'inizi gizli tutun.** Kimliğiniz ve oturum açma kimlik bilginizdir. nsec'e sahip olan herkes sizi taklit edebilir. Bir parola yöneticisinde saklayın.

## Oturum açma

1. Yardım hattı uygulamasını tarayıcınızda açın
2. `nsec`'inizi giriş alanına yapıştırın
3. Uygulama kimliğinizi kriptografik olarak doğrular — gizli anahtarınız tarayıcınızı asla terk etmez

İlk girişten sonra, görünen adınızı ve tercih ettiğiniz dili ayarlamanız istenecektir.

### Parola anahtarı ile oturum açma (isteğe bağlı)

Yöneticiniz parola anahtarlarını etkinleştirdiyse, **Ayarlar** bölümünden bir donanım anahtarı veya biyometrik kaydedebilirsiniz. Bu, nsec'inizi yazmadan diğer cihazlarda oturum açmanızı sağlar.

## Panel

Oturum açtıktan sonra, şunları içeren paneli göreceksiniz:

- **Aktif çağrılar** — şu anda işlenen çağrılar
- **Vardiya durumunuz** — kenar çubuğunda gösterilir (mevcut vardiya veya bir sonraki vardiya)
- **Çevrimiçi gönüllüler** — kimlerin müsait olduğunun sayısı

## Çağrı alma

Vardiyanız sırasında bir çağrı geldiğinde, şu şekilde bilgilendirileceksiniz:

- Tarayıcıda bir **zil sesi** (Ayarlar'dan açıp/kapatın)
- İzin verdiyseniz bir **anında bildirim**
- **Yanıp sönen sekme başlığı**

Çağrıyı almak için **Yanıtla**'ya tıklayın. Telefonunuz çalar — arayanla bağlantı kurmak için yanıtlayın. Başka bir gönüllü önce alırsa, zil sesi durur.

## Çağrı sırasında

Bir çağrıdayken şunları göreceksiniz:

- Süreyi gösteren bir **çağrı zamanlayıcısı**
- Gerçek zamanlı not yazabileceğiniz bir **not alma paneli**
- Aramayı işaretlemek için bir **spam bildir** düğmesi

Notlar şifrelenmiş taslaklar olarak otomatik kaydedilir. Notu manuel olarak da kaydedebilirsiniz.

## Not yazma

Notlar sunucuya gönderilmeden önce tarayıcınızda şifrelenir. Sadece siz ve yönetici bunları okuyabilir.

Yöneticiniz özel alanları (metin, açılır menü, onay kutusu, vb.) yapılandırdıysa, not formunda görüneceklerdir. İlgili oldukları şekilde doldurun — not metninizle birlikte şifrelenirler.

Geçmiş notlarınızı gözden geçirmek, düzenlemek veya aramak için kenar çubuğundan **Notlar** bölümüne gidin. Notlarınızı şifrelenmiş bir dosya olarak dışa aktarabilirsiniz.

## Transkripsiyon

Transkripsiyon etkinleştirildiyse (yönetici tarafından ve kendi tercihinize göre), çağrılar bittikten sonra otomatik olarak transkripte edilir. Transkript, o çağrı için notunuzun yanında görünür.

Transkripsiyonu **Ayarlar** bölümünden açıp/kapatabilirsiniz. Devre dışı bırakıldığında, yöneticinin genel ayarı ne olursa olsun çağrılarınız transkripte edilmez.

Transkriptler dinlenme sırasında şifrelenir — sunucu sesi geçici olarak işler, ardından ortaya çıkan metni şifreler.

## Konuşmalar

Yöneticiniz mesajlaşma kanallarını (SMS, WhatsApp veya Signal) etkinleştirdiyse, kenar çubuğunda bir **Konuşmalar** bağlantısı göreceksiniz. Bu, yardım hattına mesaj atan kişilerden gelen konuşmalı konuşmaları gösterir.

Her konuşma şunları görüntüler:
- Kimin ne gönderdiğini gösteren zaman damgaları ile mesaj balonları
- Mesajın geldiği kanal (SMS, WhatsApp, Signal)
- Yeni mesajlar gerçek zamanlı olarak görünür

Yanıt vermek için, konuşmanın alt kısmındaki yanıt kutusuna mesajınızı yazın. Yanıtınız, kişinin size ulaşmak için kullandığı aynı kanal üzerinden geri gönderilir.

## Molaya çıkma

Gelen çağrıları vardiyanızdan ayrılmadan duraklatmak için kenar çubuğundaki **mola** anahtarını açın. Moladayken telefonunuz çalmaz. Hazır olduğunuzda tekrar açın.

## İpuçları

- Hızlı gezinme için komut paletini açmak üzere <kbd>Ctrl</kbd>+<kbd>K</kbd> (veya Mac'te <kbd>Cmd</kbd>+<kbd>K</kbd>) kullanın
- Tüm klavye kısayollarını görmek için <kbd>?</kbd> tuşuna basın
- Yerel uygulama deneyimi ve daha iyi bildirimler için uygulamayı PWA olarak kurun
- Gerçek zamanlı çağrı uyarıları için tarayıcı sekmesini vardiyanız sırasında açık tutun
- SSS, kılavuzlar ve klavye kısayolları için **Yardım** sayfasını (kenar çubuğu bağlantısı veya komut paleti) kullanın
