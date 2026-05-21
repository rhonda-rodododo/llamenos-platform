---
title: Rêbera Mobîlê
description: Sepana mobîl a Llamenos li ser iOS û Android saz bikin û mîheng bikin.
---

Sepana mobîl a Llamenos ji xwebexşan re dikare bangên bersiv bidin, bersiva peyan bidin, û notên şîfrekirî ji telefona xwe binivîsin. Ew bi React Native hatiye çêkirin û heman navika şîfrekirina Rust a wekî sepana sermaseyê parve dike.

## Sepana mobîl çi ye?

Sepana mobîl hevalê sepana sermaseyê ye. Ew bi heman backend a Llamenos (Cloudflare Workers an xwe-sazkirî) ve tê girêdan û heman protokolê bikar tîne, ji ber vê yekê xwebexş dikarin bêyî astengî di nav sermaseyê û mobîlê de biguherin.

Sepana mobîl di embazek cuda de dijî (`llamenos-platform`) lê van tiştan parve dike:

- **llamenos-core** — Heman crate ya Rust ji bo hemî çalakiyên şîfrekirinê, bi riya UniFFI ji bo iOS û Android hatiye kompîle kirin
- **Protokol** — Heman formata wire, endpoint API û şêwaza şîfrekirinê
- **Backend** — Heman Cloudflare Worker an servera xwe-sazkirî

## Daxistin û sazkirin

### Android

Sepana mobîl niha wekî APK ji bo sideloading belav dibe:

1. Pelê `.apk` yê herî dawî ji rûpela [GitHub Releases](https://github.com/rhonda-rodododo/llamenos-platform/releases/latest) daxistin
2. Li ser cihaza xwe ya Android, biçin **Mîhengan > Ewlehî** û **Sazkirina ji çavkaniyên nenas** çalak bikin (an jî dema ku tê pirsîn ji bo her sepanê bi cuda çalak bikin)
3. APK-ya daxistî vekin û **Sazkirin** bitikînin
4. Piştî sazkirinê, Llamenos ji drawerê sepana xwe vekin

Belavkirina App Store û Play Store ji bo versiyonek pêşerojê planekirî ye.

### iOS

Avahiyên iOS wekî versiyonên beta yên TestFlight hene:

1. [TestFlight](https://apps.apple.com/app/testflight/id899247664) ji App Store saz bikin
2. Ji rêveberê xwe lînka vexwendina TestFlight bixwazin
3. Lînk li ser cihaza xwe ya iOS vekin da ku bi betayê re beşdar bibin
4. Llamenos ji TestFlight saz bikin

Belavkirina App Store ji bo versiyonek pêşerojê planekirî ye.

## Sazkirina destpêkê

Sepana mobîl bi girêdana wê bi hesabek sermaseyê ya heyî tê mîheng kirin. Ev piştrast dike ku heman nasnameya şîfrekirinê li ser hemî cihazan tê bikaranîn bêyî ku qet veşartiya sereke bi forma textê ya pût were şandin.

### Pêşkêşkirina cihazê (têra QR-ê)

1. Sepana sermasey a Llamenos vekin û biçin **Mîhengan > Cihaz**
2. **Cihaza Nû Girêdin** bitikînin — ev kodê QR yek carekê çêdike
3. Sepana mobîl a Llamenos vekin û **Cihazê Girêdin** bitikînin
4. Koda QR bi kameraya telefona xwe bixebitînin
5. Sepan danûstandineke kurt ECDH ya demkî dikin da ku materyala kilîta we ya şîfrekirî bi ewlehî veguherînin
6. PIN-ek li ser sepana mobîl mîheng bikin ji bo parastina depoya kilît a herêmî
7. Sepana mobîl niha girêdayî ye û amade ye ji bo karanînê

Pêvajoya pêşkêşkirinê qet nsec-a we bi forma textê ya pût nade şandin. Sepana sermasey materyala kilît bi veşartiya parvekirî ya demkî dixe, û sepana mobîl ew bi xwe li cihê xwe vedixe.

### Sazkirina destan (nivîsandina nsec)

Heke hûn nikarin koda QR bixebitînin, hûn dikarin nsec-a xwe rasterast binivîsin:

1. Sepana mobîl vekin û **nsec bi destan binivîsin** bitikînin
2. `nsec1...` ya xwe bixin
3. PIN-ek ji bo parastina depoya herêmî mîheng bikin
4. Sepan kilîta we ya gelemperî derdixe û bi backend re tomar dibe

Ev rêbaz xweseriya bi nsec-a we ya rasterast hewce dike, ji ber vê yekê tenê dema ku girêdana cihazê ne gengaz be bikar bînin. Ji bo nivîsandina nsec rêvebera şîfreyê bikar bînin li şêweya nivîsandina wê.

## Berawirdkirina taybetmendiyan

| Taybetmendî | Sermasey | Mobîl |
|---|---|---|
| Bersivkirina bangên hatinê | Erê | Erê |
| Nivîsandina notên şîfrekirî | Erê | Erê |
| Qadên nota xwerû | Erê | Erê |
| Bersivdana peyman (SMS, WhatsApp, Signal) | Erê | Erê |
| Dîtinên axaftinê | Erê | Erê |
| Statûya nobet û jêgirtin | Erê | Erê |
| Transkripsiyona alîgir | Erê (WASM Whisper) | Na |
| Lêgerîna not | Erê | Erê |
| Paletteya fermanan | Erê (Ctrl+K) | Na |
| Kurterêyên klavyeyê | Erê | Na |
| Mîhengên rêveberiyê | Erê (tevahî) | Erê (sînorkirî) |
| Birêvebirina xwebexşan | Erê | Tenê dîtin |
| Dîtinên têketina çavdêriyê | Erê | Erê |
| Bangkirina gerokê ya WebRTC | Erê | Na (telefona zadî bikar tîne) |
| Agahdarkirinên push | Agahdarkirinên OS-ê | Push a zadî (FCM/APNS) |
| Xwe-nûvekirin | Nûvekerê Tauri | App Store / TestFlight |
| Pelên pêvekê (rapor) | Erê | Erê |

## Sînorkirin

- **Transkripsiyona alîgir tune** — Modela WASM Whisper ji bo bîra û hêza CPU ya giran hewce dike ku li ser mobîlê pratîkî ne. Transkripsiyona bang tenê li ser sermaseyê heye.
- **Performansa kêmtir a şîfrekirinê** — Hekarî sepana mobîl heman navika şîfrekirina Rust bi riya UniFFI bikar tîne, çalakiyên dibe ku li ser cihazên kêmtir hînîtir bin li gorî performansa zadî ya sermaseyê.
- **Taybetmendiyên sînorkirî yên rêveberiyê** — Hin çalakiyên rêveberiyê (birêvebirina girseyî ya xwebexşan, mîhengkirina sûdmend a sûk) tenê di sepana sermaseyê de hene. Sepana mobîl ji bo piraniya ekranên rêveberiyê dîtinên tenê-xwendinê pêşkêş dike.
- **Bangkirina WebRTC tune** — Xwebexşên mobîl bang li ser hejmara telefona xwe ya zadî bi riya pêşkêşkerê telefonî digirin, ne bi riya gerokê. Bangkirina WebRTC ya di-sepanê tenê li ser sermaseyê ye.
- **Pîl û girêdan** — Sepan pêwisteke domdar hewce dike da ku nûvekirinên bi-dem bistîne. Moda paşrû dikare ji hêla rêveberiya hêza OS ve sînorkirî be. Sepanê di dema nobetan de ji bo agahdarkirinên pêbawer li pêşîn bigirin.

## Çareserkirina pirsgirêkên mobîlê

### Pêşkêşkirin bi "Koda QR ya nederbasdar" têk diçe

- Piştrast bikin ku koda QR nêzî demek hate çêkirin (tokenên pêşkêşkirinê piştî 5 deqîqeyan bi dawî dibin)
- Koda QR-yek nû ji sepana sermaseyê çêbikin û dîsa biceribînin
- Piştrast bikin ku her du cihaz bi înternetê ve girêdayî ne

### Agahdarkirinên push nayên girtin

- Kontrol bikin ku agahdarkirin ji bo Llamenos di mîhengên cihaza we de çalak in
- Li ser Android: Biçin **Mîhengan > Sepan > Llamenos > Agahdarkirin** û hemî kanalan çalak bikin
- Li ser iOS: Biçin **Mîhengan > Agahdarkirin > Llamenos** û **Destûrên Agahdarkirinê** çalak bikin
- Piştrast bikin ku hûn ne di moda Do Not Disturb de ne
- Piştrast bikin ku nobeta we çalak e û hûn li ser jêgirtinê nînin

### Sepan dema vekirina têk diçe

- Piştrast bikin ku hûn versiyona herî dawî ya sepana xebitandin
- Cacheya sepana paqij bikin: **Mîhengan > Sepan > Llamenos > Depo > Cache Paqij Bike**
- Heke pirsgirêk dewam dike, jêbirin û dîsa saz bikin (hûnê hewceyî vegerandina-girêdana cihazê bibin)

### Nikanin notên kevn piştî dîsa-sazkirinê deşîfre bikin

- Dîsa-sazkirina sepana materyala kilît a herêmî jê dike
- Biçin **Cihazê bi riya Koda QR ji sepana sermaseyê xwe re girêdin** da ku gihîştê vegerînin
- Notên berî dîsa-sazkirinê dê gava ku cihaz bi heman nasnameyê re were girêdan gihîştbar bibin

### Performansa hêdî li ser cihazên kevn

- Sepanên din bigirin da ku bîrê azad bikin
- Anîmasyonan di mîhengên sepana de neçalak bikin heke hebin
- Ji bo çalakiyên giran wekî kontrolkirina notên girseyî sepana sermaseyê bifikirin
