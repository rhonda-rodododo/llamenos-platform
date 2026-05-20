---
title: Siyaseta Nepeniyê
subtitle: Çi Llámenos kom dike, çawa tê parastin, û mafên we wekî bikarhêner.
---

**Roja derbasdar: 18ê Gulanê 2026**

Llámenos sepana bersivdana krizê ya open-source ye. Ev siyaset ji bo sepa iOS-ê ya Llámenos û karûbarên backend ên ji hêla rêveberê hub-a we ve têne xebitandin derbasdar e. Ew li ser hub-ên ku ji hêla aliyên sêyem ve têne xebitandin derbasdar nabe -- her rêveberê hub berpirsiyarê pratîkên daneyên xwe ye.

---

## Çi Em Kom Dikin

### Daneyên hesab û nasnameyê

- **Kilîta giştî ya amûrê** -- nasinek kriptografîk ya taybetî ya ji bo amûra we. Tu carî li derveyî hub-a we parve nabe.
- **Tokena hişyariya push** -- tenê ji bo şandina hişyariyên bangê ber bi amûra we. Bi rêkûpêk tê nûve kirin.
- **Rol û endametiya hub** -- kîjan hub-an hûn endamê wan in û rola we ya erêkirî (xwebexş, rêveber).
- **Metadata-ya amûrê** -- modela amûrê, guhertoya OS, û guhertoya sepê. Dema ku hûn amûrek tomar dikin tê kom kirin. Ji bo çavdêriya ewlehiyê û piştevaniyê tê bikar anîn.

### Daneyên çalakiyê

- **Metadata-ya bangê** -- timestamp, dema bangê, kîjan xwebexş bersivand. Ne naveroka bangê.
- **Tomarên şevê** -- kîjan şev hûn ji bo wan hatine bernamekirin û gelo çalak bûn.
- **Tomarên log-a kontrolê** -- kiryarên di sepê de hatine kirin (nîşok hatiye çêkirin, rapor hatiye şandin, mîheng hatiye guhertin). Tenê ji bo rêveberan xuya ye.
- **Bûyerên ewlehiyê** -- tomarên amûrê, betalkirin, çalakiya danişînê, û guherînên hesabê. Di dîroka ewlehiya we de têne tomar kirin, ji bo we û rêveberan xuya ye.

### Naveroka ku hûn çêdikin -- end-to-end şîfrekirî

- **Nîşok û transkripsiyonên bangê** -- nîşokên nivîskî û transkripsiyonên ji bangên ku hûn bi rê ve dibin.
- **Rapor û tomarên dozê** -- raporên strukturî, zeviyên xweser, pêvekên pel, û dîroka dozê.
- **Tomarên têkiliyê** -- agahiya têkiliya banger, heke hatibe tomar kirin.
- **Peyam** -- peyamên nivîskî yên ku ber bi hub-a we ve hatine rêvebirin.

**Server ev naverok tenê wekî ciphertext tomar dike.** Ew nikare ji hêla operatorê server, pêşkêşkarê mêvandariyê, an jî Llámenos ve bixwîne. Kilîtên şîfrekirinê we ji hêla PIN û nasnameyên erêkirinê ve têne parastin, û bi bijarte kilîtek ewlehiya hardware. Vekirin tenê li ser amûra weya erêkirî diqewime.

### Daneyên broadcast/abone

Heke hub-a we peyamên broadcast bikar tîne, hejmarên telefonê yên abone wekî **nasnameyên hashed** têne tomar kirin -- ne wekî hejmarên telefonê yên plaintext. Ev tê vê wateyê ku danegeh tu carî lîsteyek abone ya xwendinî nagire. Daxwazên derketinê (STOP) bi rasterast têne pêvajoy kirin û nayên bêbandor kirin.

Dema ku peyamek broadcast tê şandin, server naveroka peyamê bi awayekî demkî pêvajoy dike da ku bi navgîniya pêşkêşkarê peyam (SMS, WhatsApp, Signal, an RCS) radest bike. Server naveroka peyamên broadcast piştî radestkirinê tomar nake -- tenê tomarên statûya radestkirinê têne bihêtin.

### Daneyên komika vegerê

Heke hûn komikek vegerê saz bikin, server vê tomar dike:
- Kilîta giştî ya komika vegerê (ji bo erêkirina daxwazên vegerê tê bikar anîn)
- Parçeyên parvekirinê yên şîfrekirî (her parçe ji bo amûra xwediyê parçe ya taybetî tê şîfre kirin -- server nikare wan bixwîne)
- Tomarên daxwazên vegerê (dem, statû -- ne naverok)

**Server nikare kilîta vegerê ya we ji nû ve ava bike.** Parçeyên parvekirinê bi end-to-end ji bo her amûra xwediyê parçe têne şîfre kirin. Kêmtirîn astek ji xwediyên parçe divê bi çalakî beşdar bibin da ku veger biser bikeve.

### Raportên qeza û dîagnostîk

Heke ji hêla rêveberê hub-a we ve hatibe çalak kirin, sep dikare raportên qeza bişîne karûbarek dîagnostîk. Ev modela amûrê, guhertoya OS, guhertoya sepê, û stack trace dihewîne. Naveroka bangê, nîşok, an agahiya nasnameya kesane nagire.

### Cih

Sep daneyên cih kom nake. Heke taybetmendiyek pêşerojê gihiştina cihê bixwaze, ew dê bijarte be, bi cuda were eşkere kirin, û ne ji bo şopandinê were bikar anîn.

---

## Çawa Em Daneyan Bikaranîn

- **Ji bo xebitandina sepê** -- rêveberiya bangên ber bi xwebexşên li ser şevê, çalakkirina nivîsandina nîşok, rêveberiya şev û raporan.
- **Ji bo ewlehiyê** -- kifşkirina sûdwergirtinê, parastina lîsteyên qedexe, sînorkirina rêjeyê, û pêşkêşkirina dîroka ewlehiya amûrê.
- **Ji bo kontrolê** -- pêşkêşkirina logan ji rêveberan (ne naverok).
- **Ji bo vegerê** -- tomarkirina parçeyên parvekirinê yên şîfrekirî da ku komikên vegerê bikaribin alîkariya bikarhêneran bikin ku gihiştina xwe ji nû ve bistînin.

Em daneyên we ji bo reklaman bikar natin. Em daneyên we bi aliyên sêyem re ji bo mebestên bazirganî parve nakin. Em profîlên tevgerê ava nakin.

---

## Şîfrekirina End-to-End

Hemû naveroka nîşok, transkripsiyon, rapor, tomarên têkiliyê, û peyamên hatî end-to-end şîfrekirî ne. Her hêlî kilîtek simetrîk a rasthatî ya taybetî digire. Kilîta weya veşartî tu carî amûra we terk nake. Server tenê ciphertext werdigire û tomar dike.

**Ev di pratîkê de çi tê vateyê:**

| Cureyê daneyê | Server dikare bixwîne? | Di bin subpoena de berdest e |
|-----------|-----------------|---------------------------|
| Nîşokên bangê | Na | Tenê ciphertext |
| Transkripsiyon | Na | Tenê ciphertext |
| Rapor | Na | Tenê ciphertext |
| Tomarên dozê | Na | Tenê ciphertext |
| Peyamên hatî | Na | Tenê ciphertext |
| Parçeyên vegerê | Na | Tenê ciphertext |
| Peyamên broadcast ên derketinê | **Erê, bi awayekî demkî dema radestkirinê** | Erê (plaintext dema şandinê) |
| Metadata-ya bangê | Erê | Erê |
| Kilîta giştî ya amûra we | Erê | Erê |
| Bûyerên ewlehiyê | Erê | Erê |

Ji bo kurteya tevahî, [rûpela Ewlehiyê](/security) ya me bibînin.

---

## Bihêtinê Daneyan

### Naveroka ku hûn çêdikin

Nîşok, transkripsiyon, rapor, û peyam heta ku hûn an jî rêveber bi awayekî eşkere jê nabin, an jî hub-a we were girtin, têne bihêtin. Rêveberê hub-a we dikare demên bihêtinê mîheng bike ku naveroka ji temenekî mezintir bi xweber paqij bike.

### Peyamên broadcast

Naveroka peyamên broadcast piştî radestkirinê tomar nake. Tenê tomarên statûya radestkirinê (şandin, têkstûr, aboneyê derket) têne bihêtin. Rêveberê hub kontrol dike ku çiqas dem tomarên radestkirinê bihêtin.

### Metadata-ya bangê û log-a kontrolê

Li gorî mîhengkirina rêveberê hub-a we têne bihêtin. Kêmtirînên platformê ji bo rêveberan asteng dikin ku demên bihêtinê bi awayekî saz bikin ku delîlên kontrolê berî ku qedexeyên qanûnî qediyan bin tune bibin.

### Bûyerên ewlehiyê û tomarên amûrê

Bûyerên ewlehiyê (tomarên amûrê, betalkirin, çalakiya danişînê) ji bo jiyana hesabê we têne bihêtin. Ev beşek ji rêya kontrolê ya ewlehiyê ne û mafê we ya nirxandina çalakiya hesabê piştgirî dikin.

### Parçeyên vegerê

Parçeyên parvekirinê yên şîfrekirî heta ku hûn mîhengkirina komika vegerê ya xwe jê bibin an jî hesabê we were jêbirin têne bihêtin.

### Tokenên push

Dema ku hûn derkevin an jî sepê jê bibin têne jêbirin.

### Daneyên hesabê û jêbirin

Hûn dikarin jêbirinê ya tevahî ya hesabê xwe bixwazin -- li jêr bibînin.

---

## Jêbirinê Hesabê

Mafê we heye ku daxwaza jêbirinê ya daîmî ya hesabê xwe bikin. Llámenos jêbirinê bi garantiyên kriptografîkên xurt pêk tîne.

### Jêbirin çi dike

1. **Kilît pêşî têne wêrankirin**: Kilîtên şîfrekirinê yên amûra we bi rasterast têne wêrankirin. Ev hemû naveroka ku we çêkiriye daîmî ne xwendin dike -- tevî ji backup-ên danegehê -- berî ku tu jêbirinana danegehê bibe.
2. **Tomarên hesabê û amûrê têne jêbirin**: Tomara hesabê, tomarên amûrê, tokenên push, û erêkirinên rol têne jêbirin.
3. **Tomarên kontrolê crypto-shredded dibin**: Kilîta şîfrekirinê ya tomarên log-a kontrolê ya we têne wêrankirin, ku tomarên we ne xwendin dike. Struktûra zincîra hash-ê ya bêyî-guhartinê saxlem dimîne (ji bo bêyî-guhartiya hub-ê pêwîst e).
4. **Naveroka şîfrekirî dîsa tê şîfre kirin**: Nîşok û raporên ku we nivîsandine ji bo xwendevanên mayî (rêveberên din) dîsa têne şîfre kirin. Kopiya weya kilîta veşêrê têne jêbirin; naverok ji bo berdewamiya dozê berdewam dike.

### Jêbirinê xizmeta xweser

Ji mîhengên hesabê we li ser hemû platforman berdest e. Bi xwerû, demek heye (ji hêla rêveberê hub ve hatî mîhengkirin, bi gelemperî 72 saet, kêmtirîn 24 saet, zêdetirîn 7 roj) berî ku jêbirin temam bibe. **Hûn dikarin di vê demê de betal bikin.** Demek ewlehiyek e -- ew ji we diparêze heke hûn bi zorê têne mecbûr kirin ku hesabê xwe jê bibin.

### Jêbirinê acil

Heke hûn rûyê xeteriyek bilez in, erêkirek hevkar (rêveberek an têkiliyek bawer dikare jêbirinê acil erê bike, ku demê kêm dike heta kêmtirîn 4 saetan. Sînora 4-saet ji bo parastina jêbirinê ya bi zorê (mecbûrkirina jêbirinê ya delîl berî ku alîkarî bê) heye.

### Jêbirinê ji hêla rêveber ve

Rêveberên hub dikarin jêbirinê ya bilez ji bo her hesabek di hub-a xwe de dest pê bikin. Ev tê tomar kirin di log-a kontrolê de.

---

## Karûbarên Aliyê Sêyem

Llámenos bi pêşkêşkarên telefoniyê re ji bo rêveberiya bangê (Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth, an jî Asterisk/FreeSWITCH-ê xweser) entegre dibe. Rêveberê hub-a we pêşkêşkar hilbijêre.

**Pêşkêşkarên telefoniyê çi werdigirin:**

- Hejmara telefonê ya banger (bangên hatî)
- Dema bangê û timestamp
- Ew **nîşok, transkripsiyon, an naveroka ku hûn di sepê de çêdikin nagirin**

**Pêşkêşkarên peyamê ji bo peyamên broadcast çi werdigirin:**

- Naveroka peyamê (SMS, WhatsApp, RCS) -- pêşkêşkar divê plaintext bistîne da ku peyamê radest bike
- Ji bo broadcast-ên Signal, naverok bi navgîniya torê Signal end-to-end şîfrekirî tê radest kirin

Rêveberê hub-a we dibe ku karûbarên zêdetir yên aliyê sêyem (raportkirina qeza, çavdêri) bikar bîne. Ji bo hûrguliyan siyaseta nepeniya hub-a xwe kontrol bikin.

---

## Mafên We Li Binê GDPR

Llámenos ji hêla saziyek li ser bingeba YE ve hatiye pêşve xistin. Heke hûn li Herêma Aborî ya Ewropî ne, mafên li jêr li binê Rêziknameya Giştî ya Parastina Daneyan hene:

- **Mafê gihiştinê** -- daxwaza kopiyek ji daneyên kesane yên li ser we bikin
- **Mafê rastkirinê** -- daneyên çewt rast bikin
- **Mafê jêbirinê** -- daxwaza jêbirinê ya daîmî ya hesabê û hemû daneyên têkildar bikin (ji bo hûrguliyên tevahî li jor [Jêbirinê Hesabê](#jêbirinê-hesabê) û [rûpela Jêbirinê Daneyan](/data-deletion) bibînin)
- **Mafê portebilîteya daneyan** -- daneyên xwe di formatekê strukturî, ji bo makîneyê xwendinî de bistînin
- **Mafê protestoyê** -- li dijî pêvajoyê li ser bingeha berjewendiyên rewa protesto bikin
- **Mafê sînorkirina pêvajoyê** -- daxwaza ku pêvajoy were sînorkirin bikin
- **Mafê vekişandina razîbûnê** -- li ku derê pêvajoy li ser bingeha razîbûnê ye, her dem vekişînin

**Not li ser naveroka şîfrekirî**: Ji ber ku nîşok, transkripsiyon, û rapor end-to-end şîfrekirî ne û server nikare wan bixwîne, em nikarin ji bo we derxistinek şîfrekirî ya naverokê ku hûn rasterast li ser amûra xwe nedîtine pêşkêş bikin. Em dikarin piştrast bikin ku kîjan tomarên şîfrekirî hene û wan jê bibin. Ji bo naveroka ku hûn hîn dikarin veşêrin (li ser amûrek çalak), sep destûrê dide we ku nîşokên xwe bibînin û derxînin.

Ji bo karanîna van mafan, bi rêveberê hub-a xwe re (kontrolorê daneyan ji bo hub-a we) têkilî daynin, an jî bi me re têkilî daynin: [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com).

Hûn her weha mafê şikayetê li ber desthilata parastina daneyên neteweyî ya xwe hene.

---

## Nepeniya Zarokan

Llámenos ne ji bo zarokên bin 13 salî, an jî bin 16 salî li YE ye. Em bi zanîstî daneyên kesane ji zarokan kom nakin. Heke hûn bawer dikin ku zarokek daneyên kesane ji navgîniya sepê şandine, bi me re têkilî daynin û em ê bi lez jê bibin.

---

## Guherînên li ser vê Siyasetê

Em ê her guherîn li ser vê rûpelê bişînin û dîroka derbasdarê nûve bikin. Ji bo guherînên girîng, em ê ji navgîniya sepê an jî bi e-nameyê (li ku derê gengaz be) agahdarî bidin.

---

## Têkilî

**Pirsên têkildar bi nepeniyê:** [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com)

**Raportên çewtiyê û eşkerekirina ewlehiyê:** [github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues)

Llámenos open source e. Hûn dikarin kontrol bikin ku sep çi dike: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
