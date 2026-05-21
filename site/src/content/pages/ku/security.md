---
title: Ewlehî û Nepenî
subtitle: Çi tê parastin, çi xuya ye, û çi dikare di bin subpoena de were berdest kirin -- li gorî kîjan taybetmendiyên hûn bikar tînin rêzkirî ye.
---

## Heke pêşkêşkarê weya mêvandariyê subpoena bê şandin

| Ew DIKARIN peyda bikin | Ew NIKARIN peyda bikin |
|------------------|---------------------|
| Metadata-ya bang/peyam (dem, demjimêr) | Naveroka nîşok, transkripsiyon, laşên raporê |
| Blob-ên danegeha şîfrekirî | Navên xwebexş (end-to-end şîfrekirî) |
| Kîjan hesabên xwebexş dema ku çalak bûn | Tomarên pirtûkxaneya têkiliyê (end-to-end şîfrekirî) |
| Tomarên radestkirinê yên peyamên broadcast | Naveroka peyamê (li ser wergirtinê şîfrekirî, wekî ciphertext tê tomar kirin) |
| | Kilîtên veşêrê (ji hêla PIN, hesabê erêkirinê, û bi bijarte kilîta ewlehiya hardware ve têne parastin) |
| | Kilîtên şîfrekirinê yên nîşokê yên demkî (piştî wrap-ê têne wêrankirin) |
| | Sirêya HMAC-a we ji bo vegerandina hash-ên telefonê |
| | Naveroka parçeyên vegerê (şîfrekirî, server nikare bixwîne) |

**Server daneyên ku nikare bixwîne tomar dike.** Metadata (kengî, çiqas dem, kîjan hesab) xuya ye. Naverok (çi hatiye gotin, çi hatiye nivîsandin, kîjan têkiliyên we hene) ne xuya ye.

---

## Li gorî taybetmendiyê

Eşkerekirina nepeniya we li ser kîjan kanalan hûn çalak dikin girêdayî ye:

### Bangên dengê

| Heke hûn bikar bînin... | Aliyên sêyem dikarin bigihin | Server dikare bigihêje | Naveroka end-to-end şîfrekirî |
|---------------|-------------------------|-------------------|------------------------------|
| Twilio/SignalWire/Vonage/Plivo | Dengê bangê (zindî), tomarên bangê | Metadata-ya bangê | Nîşok, transkripsiyon |
| Asterisk-ê xweser | Tiştek (hûn kontrol dikin) | Metadata-ya bangê | Nîşok, transkripsiyon |
| Gerok-ber bi-gerok (WebRTC) | Tiştek | Metadata-ya bangê | Nîşok, transkripsiyon |

**Subpoena pêşkêşkarê telefoniyê**: Ew tomarên kîjan bang (dem, hejmar, demjimêr) hene. Ew NÎŞOK an TRANSKRİPSİYON nagirin. Tomarkirin bi xwerû ne çalak e.

**Transkripsiyon**: Transkripsiyon bi tevahî di geroka we de bi karanîna AI-ya amûrê dibe. **Deng tu carî amûra we terk nake.** Tenê transkripsiyona şîfrekirî tê tomar kirin.

### Peyamên nivîskî (yek bi yek)

| Kanal | Gihiştina pêşkêşkar | Storage-a server | Not |
|---------|-----------------|----------------|-------|
| SMS | Pêşkêşkarê we hemû peyaman dixwîne | **Şîfrekirî** | Pêşkêşkar peyamên orjînal bihêtin dike |
| WhatsApp | Meta hemû peyaman dixwîne | **Şîfrekirî** | Pêşkêşkar peyamên orjînal bihêtin dike |
| Signal | Torê Signal end-to-end şîfrekirî ye; bridge dîsa şîfre dike li ser wergirtinê | **Şîfrekirî** | Riya tercîh dema ku berdest be |

**Radestkirina pêşî Signal**: Dema ku wergir Signal hebe, peyam bi xweber bi navgîniya Signal têne rêvebirin -- pêşkêşkarê we naverokê tu carî nabîne. Ji bo SMS, tenê hişyariyek giştî ya "peyamek nû heye" bi xwerû tê şandin (ne laşê peyamê), ji ber vê yekê logên pêşkêşkarê we naveroka hesas nagire.

**Peyam li ser wergirtinê li servera we têne şîfre kirin.** Server tenê ciphertext tomar dike. Pêşkêşkarê telefonî an peyamê dibe ku hîn jî peyama orjînal hebe -- sînorê wan platforman e, ne tiştek ku em dikarin biguherînin.

**Subpoena pêşkêşkarê peyam**: Pêşkêşkarên SMS naveroka tevahî ya peyamê tenê heke hûn bi awayekî eşkere moda SMS-a tevahî-naverok çalak bikin. Bi moda hişyariya xwerû, laşên SMS naveroka peyamê nagirin. Meta naveroka WhatsApp heye. Peyamên Signal end-to-end şîfrekirî ne heta bridge-ê (ku li ser servera we dixebite), lê bridge wan berî ku ji bo storage dîsa şîfre bike vedike. Di hemû rewşan de, **servera we tenê ciphertext heye** -- pêşkêşkarê mêvandariyê nikare naveroka peyamê bixwîne.

### Peyamên bulk û broadcast

Rêveber dikarin peyamên broadcast ji bo aboneyan bi navgîniya SMS, WhatsApp, Signal, an RCS bişînin.

**Girîng: peyamên broadcast ên derketinê li ser server end-to-end şîfrekirî nînin.** Ji bo ku peyamek bide aboneyên SMS an WhatsApp, server divê naveroka plaintext bi awayekî demkî pêvajoy bike û pêşkêşkarê peyamê bide. Pêşkêşkar paşê wê radest dike û dibe ku kopiyek bihêtin dike.

| Kanal | Gihiştina server dema şandinê | Gihiştina pêşkêşkar | Piştî radestkirinê |
|---------|--------------------------|-----------------|----------------|
| SMS blast | Plaintext (demkî, ji bo radestkirinê) | Naveroka tevahî ya peyamê | Pêşkêşkar bihêtin dike |
| WhatsApp blast | Plaintext (demkî, ji bo radestkirinê) | Naveroka tevahî ya peyamê (Meta) | Pêşkêşkar bihêtin dike |
| Signal blast | Plaintext (demkî, ji bo radestkirinê) | End-to-end şîfrekirî bi navgîniya torê Signal | Ne ji hêla pêşkêşkar ve tê bihêtin |
| RCS blast | Plaintext (demkî, ji bo radestkirinê) | Dibe ku Google naverokê bibîne | Pêşkêşkar bihêtin dike |

**Ev çi tê vateyê**: Peyamên broadcast divê naveroka hesas a bangeran nagirin. Wan ji bo ragihandin, hişyariyên bernameyê, û çavkaniyan bikar bînin -- ne ji bo hûrguliyên dozê an tiştek ku dikare banger an xwebexşan nas bike.

Hejmarên telefonê yên abone wekî nasnameyên hashed têne tomar kirin -- danegeha we tu carî lîsteyek abone ya xwendinî nagire. Daxwazên derketinê (STOP) bi rasterast têne pêvajoy kirin û statûya abone tê nûve kirin.

### Nîşok, transkripsiyon, û rapor

Hemû naveroka nivîskî ya xwebexş end-to-end şîfrekirî ye:

- Her nîşok **kilîtek rasthatî ya taybetî** bikar tîne (forward secrecy -- tevlihevkirina yek nîşokê nîşokên din tevlihev nake)
- Kilît bi tenê ji bo xwebexş û her rêveber têne wrap kirin
- Server tenê ciphertext tomar dike
- Vekirin li ser amûra we diqewime, di astek ewle de ku tu carî kilît ji UI-ya sepê re eşkere nake
- **Zeviyên xweser, naveroka raporê, û pêvekên pelê hemû bi tenê têne şîfre kirin**

**Tomarên dozê û daneyên hêlînan**: Tomarên dozê yên strukturî (têkiliyek, doz, zincîrên delîlan) heman modela şîfrekirinê bişopînin -- her hêlî bi kilîtek taybetî tê şîfre kirin, ji bo xwendevanên erêkirî tê wrap kirin. Server nikare naveroka dozê bixwîne.

**Tevlihevkirina amûrê**: Bêyî PIN-a we **Û** gihiştina hesabê erêkirinê, êrişvan blob-ek şîfrekirî bi parastina Argon2id werdigire -- fonksiyonek derxistina kilîtê ya bîrdank-hard ku êrişên brute-force bi amûrên taybetî (GPU, ASIC) ji rêbazên kevn bi qatên mezintir biha dike. Heke hûn her weha kilîtek ewlehiya hardware bikar bînin, **sê faktorên serbixwe** daneyên we diparêzin.

---

## Amûrên we

### Dîtin û betalkirina amûran

Sep lîsteyek her amûrek ku hûn ji wê têketine digire. Hûn dikarin vê lîsteyê bibînin û her amûrek ku hûn nas nakin betal bikin.

**Dema ku hûn amûrek betal dikin:**
- Ew amûr bi rasterast ji gihiştina hesabê we tê asteng kirin
- Kilîtên we yên şîfrekirinê têne nûve kirin da ku amûra betalkirî nikare naveroka pêşerojê veşêre
- Betalkirin di dîroka ewlehiya hesabê we de tê tomar kirin

Ev tê vê wateyê ku tevî ku kesek kopiyek ji daneyên we yên şîfrekirî ji berê hebe, nikare naveroka nû ya piştî betalkirinê bixwîne.

### Verastkirina emoji SAS

Ji bo saziyên bi hewceyên ewlehiyê bilind, rêveber dikarin nasnameya amûrek bi karanîna verastkirina SAS (Short Authentication String) -- wekî rêzekek 7 emoji -- piştrast bikin.

**Çawa dixebite:**
1. Rêveber û xwediyê amûrê rêzeyên emoji yên xwe berhev dikin (bi şexsî, bi telefon, an bi kanalek bawer)
2. Heke emoji li hev bên, amûr wekî xwediyê xwe hatiye tomar kirin piştrast dibe
3. Verastkirin tê tomar kirin -- rêveber dikarin bibînin kîjan amûr hatine verast kirin

Ev ji êrişvanek ku amûrek sexte li bin hesabê kesek din tomar kiriye diparêze. Rêzeya emoji ji her du kilîtên nasnameya kriptografîk ên amûran û kod-ek carekî hatiye derxistin -- server nikare wê manipule bike an pêşbînî bike.

---

## Jêbirinê hesabê

### Jêbirinê xizmeta xweser

Hûn dikarin bixwazin ku hesabê we û hemû daneyên têkildar bi temamî jê bibin. Bi xwerû demek heye (ji hêla rêveberê hub ve hatî mîhengkirin, bi gelemperî 72 saet) berî ku jêbirin temam bibe -- ev demek didin we da ku betal bikin heke daxwaz bi zorê hatibe kirin.

**Çi tê jêbirin:**
- Kilîtên amûra we (hemû naveroka şîfrekirî daîmî ne xwendin dike, tevî ji backup-an)
- Tomara hesabê, erêkirinên rol, û dîroka şevê
- Tokenên hişyariya push

**Çi li ser naveroka şîfrekirî ya weya çêkirî diqewime**: Nîşok, transkripsiyon, û raporên ku we nivîsandine ji bo xwendevanên mayî (rêveberên din) dîsa têne şîfre kirin. Kopiya weya kilîta veşêrê têne wêrankirin. Naveroka xwe ji bo xwendevanên din ên erêkirî berdewam dike -- ne bi tevahî tê jêbirin, ji ber ku banger û dîroka dozê ji hub re ne, ne ji we re bi şexsî.

**Log-a kontrolê**: Tomarên log-a kontrolê ya we crypto-shredded dibin -- kilîta şîfrekirinê ya per-bikarhêner têne wêrankirin, ku tomarên we ne xwendin dike. Zincîra hash-ê (struktûra bêyî-guhartinê) saxlem dimîne.

### Jêbirinê acil

Heke hûn bawer dikin ku hesabê we rûyê xeteriyek bilez e, hûn dikarin jêbirinê acil bi erêkirek hevkar -- kesek bawer din (rêveber an têkiliyek bawer) ku li ser lezgîniyê îmze dike -- bixwazin. Ev demê kêm dike heta kêmtirîn 4 saetan. Sînora 4-saet ji bo parastina jêbirinê ya bi zorê (mecbûrkirina jêbirinê ya delîl berî ku alîkarî bê) heye.

### Çi nayê jêbirin

Metadata-ya bangê (kî bersivand, kengî, çiqas dem) beşek ji tomara kontrolê ya hub-ê ye. Rêveberê hub-a we kontrol dike ku çiqas dem ev tê bihêtin. Li binê GDPR, mafê we heye ku daxwaza rastkirinê an jêbirinê bikin -- bi rêveberê hub-a xwe re têkilî daynin.

---

## Komikên vegerê

Heke hûn hemû amûrên xwe ji dest dabin (telefon wêrankirî, laptop hatiye dizîn, her tişt), hûn bi gelemperî gihiştina hemû daneyên xwe yên şîfrekirî ji dest didin. Komikên vegerê vê çareser dikin.

### Çawa veger dixebite

Hûn komikek têkiliyên bawer (bi gelemperî 3-5 kes) wekî komika vegerê ya xwe diyar dikin. Her têkiliyek yek "parçe" ji kilîtek vegerê digire -- parçeyek ji puzzle-ê.

**Ji bo vegera hesabê:**
1. Hûn amûrek nû tomar dikin û daxwazek vegerê dest pê dikin
2. Her têkiliyek weya vegerê hişyariyek werdigire
3. Piştî demek mîhengkirî (da ku hûn demek bistînin da ku daxwazek bi zorê betal bikin), hejmarek asteng (mînak, 2 ji 3) daxwazê erê dikin
4. Her têkiliyek erêkirî parçeya xwe bişîne, bi rasterast şîfrekirî ber bi amûra nû ya we
5. Amûra nû ya we parçeyan kom dike da ku kilîta vegerê ji nû ve ava bike, ku gihiştina we ji bo daneyên we yên şîfrekirî vedigere

**Server çi dikare bibîne**: Server parçeyên şîfrekirî di navbera amûran de ragihîne. Ew nikare parçeyan bixwîne, nikare kilîta vegerê ji nû ve ava bike bi tenê, û nikare astengê derbas bike.

### Taybetmendiyên ewlehiyê yên komikên vegerê

- **Ewlehiya astengê**: Parçeyên bin-asteng tiştek li ser sirê eşkere nakin -- xwediyek parçe yekane nikare hesabê we ji nû ve bide vegerandin
- **Nebeşdariya serverê di sirê de**: Parçeyan bi rasterast ber bi kilîta giştî ya amûra nû ya we têne şîfre kirin; server tenê ciphertext tomar dike û ragihîne
- **Qada per-hub**: Veger gihiştina we ji bo yek hub-ek taybetî vedigere. Heke hûn di pir hub-an de bin, her hub komika vegerê ya xwe heye
- **Dem bi betalkirinê**: Hûn dikarin daxwazek vegerê di dema demê de betal bikin -- parastin li dijî kesek ku bêyî zanîna we daxwazek vegerê dest pê dike
- **Verastkirina Signal**: Daxwazên vegerê bi navgîniya Signal têne erêkirin da ku were piştrast kirin ku hûn kontrola hesabê Signal-ê yê têkildar dikin

### Hilbijartina têkiliyên vegerê

Kesên ku hûn bawer dikin hilbijêrin ku:
- Bi serbixwe gihîştî ne (ne hemû li heman cih an sazî de)
- Xwe Signal bikar tînin (ji bo gava verastkirinê pêwîst e)
- Fêm dikin ku dê carinan ji wan were xwestin ku daxwazên vegerê erê bikin

Têkiliyên weya vegerê bi girtina parçeyek gihiştina we ji bo daneyên şîfrekirî nabînin -- ew tenê dikarin alîkariya we bikin dema ku hûn daxwazek dest pê dikin.

---

## Nepeniya hejmara telefonê ya xwebexş

Dema ku xwebexş bangên ber bi telefonên xwe yên şexsî werdigirin, hejmarên wan ji pêşkêşkarê telefoniyê re xuya dibin.

| Senaryo | Hejmara telefonê xuya dibe ji bo |
|----------|------------------------|
| Bang PSTN ber bi telefona xwebexş | Pêşkêşkarê telefoniyê, operatorê telefonê |
| Gerok-ber bi-gerok (WebRTC) | Kesek (deng di gerokê de dimîne) |
| Asterisk-ê xweser + telefona SIP | Tenê servera Asterisk-a we |

**Ji bo parastina hejmarên telefonê yên xwebexş**: Bersiva bangên li ser bingeha gerokê (WebRTC) bikar bînin an jî telefonên SIP-ê yên girêdayî Asterisk-ê xweser peyda bikin.

---

## Niha hatiye şandin

Ev baştirkirin îro zindî ne:

| Taybetmendî | Berjewendiya nepeniyê |
|---------|-----------------|
| Rêveberiya amûrê | Bibînin û her amûrek betal bikin; betalkirin nûvekirina kilîtê destpê dike da ku amûra jêbûyî nikare naveroka nû bixwîne |
| Verastkirina amûrê bi emoji SAS | Rêveber dikarin bi şexsî amûran bi karanîna fingerprint-ek kriptografîk ku wekî 7 emoji tê xuyang kirin verast bikin -- nikare ji hêla server ve were sextekirin |
| Jêbirinê hesabê bi dem | Daxwaza jêbirinê ya hesabê xwe bikin; dema mîhengkirî destûrê dide we ku betal bikin heke daxwaz bi zorê hatibe kirin |
| Jêbirinê acil | Jêbirinê acil a bi erêkirina hevkar bi kêmtirîn sînora 4-saet |
| Crypto-shredding li ser jêbirinê | Kilîtên şîfrekirinê ya we pêşî têne wêrankirin, ku naverok berî tu jêbirinana danegehê daîmî ne xwendin dike |
| Komikên vegerê (Shamir) | Têkiliyên bawer diyar bikin ku dikarin alîkariya we bikin heke hûn hemû amûr ji dest dabin -- parçeyên bin-asteng tiştek eşkere nakin |
| Peyamên broadcast bi eşkerekirina rastdar | Rêveber dikarin peyamên bulk bişînin; server naveroka plaintext bi awayekî demkî pêvajoy dike (di UI de bi eşkere were nîşandan) |
| Hash-kirina abone | Hejmarên telefonê yên aboneyên broadcast wekî nasnameyên hashed têne tomar kirin -- tu lîsteya abone ya xwendinî di danegehê de tune |
| Parastina kilîtê bi Argon2id | Kilîtên amûra we ji hêla fonksiyonek bîrdank-hard ve têne parastin ku êrişên brute-force bi GPU û amûrên taybetî asteng dike |
| Rêveberiya peyamê ya pêşî Signal | Peyam bi xweber bi navgîniya Signal têne rêvebirin dema ku berdest be, ku naverok ji logên pêşkêşkarê SMS dûr dike |
| Moda hişyariya tenê SMS | Wergirên SMS tenê "peyamek nû heye" dibînin -- tu naveroka hesas di logên pêşkêşkar de |
| Berxwedana analîza trafîkê | Mezinahiyên bûyerên dem-rast têne padding kirin da ku çavdêr nikarin peyamên kurt ji yên dirêj cuda bikin |
| Tu hejmarên telefonê yên plaintext di danegehê de | Hejmarên banger wekî hash-ên bêveger têne tomar kirin -- danegeha we tu carî hejmara rastîn nagire |
| Şîfrekirina per-hub bi forward secrecy | Bûyerên dem-rast ên her hub bi kilîtên ku her 24 saetan têne nûve kirin têne şîfre kirin -- kilîtên kevn nikarin bûyerên nû veşêrin |
| Kriptografî di Rust de li ser hemû platforman | Desktop, iOS, û Android hemû pirtûkxaneya kriptografî ya kontrolkirî ya Rust-ê dixebitînin -- kilît tu carî koda JavaScript, Swift, an Kotlin nagihin |
| Gihiştina sînorkirî ya relay | WebSocket relay-a we tenê bûyeran ji servera we werdigire -- tu aliyek derve nikare hişyariyên sexte têxe |
| Storage-a peyamên şîfrekirî | Peyamên SMS, WhatsApp, û Signal wekî ciphertext li ser servera we têne tomar kirin |
| Transkripsiyona li ser amûrê | Deng tu carî amûra we terk nake -- bi tevahî li ser amûrê bi karanîna AI-ya herêmî tê pêvajoy kirin |
| Parastina kilîtê ya pir-faktor | Kilîtên şîfrekirinê ya we ji hêla PIN, erêkirinê, û bi bijarte kilîtek ewlehiya hardware ve têne parastin |
| Kilîtên ewlehiya hardware | Kilîtên fizîkî faktorê sêyem lê zêde dikin ku nikare ji dûr ve were tevlihev kirin |
| Avakirinên dubare | Piştrast bikin ku kodê hatiye deploy kirin bi çavkaniya giştî re li hev tê |
| Pirtûkxaneya têkiliyê ya şîfrekirî | Tomarên têkiliyê, têkiliyek, û nîşok end-to-end şîfrekirî ne |

## Hîn plankirî ye

| Taybetmendî | Berjewendiya nepeniyê | Statû |
|---------|-----------------|--------|
| Sepên natîf ên wergirtina bangê | Tu hejmarên telefonê yên şexsî xuya nabin | Di pêşveçûnê de |
| Certificate pinning (mobîl) | Parastin li dijî TLS interception-ê ya CA-ya sexte | Scaffolding temam; pins li benda yekem deploy |
| Şîfrekirina medya dengê ya SFrame | Bangên dengê yên end-to-end şîfrekirî | Derxistina kilîtê temam; şîfrekirina per-frame plankirî |

---

## Tabloya kurteyê

| Cureyê daneyê | Şîfrekirî | Xuya ye ji bo server | Di bin subpoena de berdest e |
|-----------|-----------|-------------------|---------------------------|
| Nîşokên bangê | Erê (end-to-end) | Na | Tenê ciphertext |
| Transkripsiyon | Erê (end-to-end) | Na | Tenê ciphertext |
| Rapor | Erê (end-to-end) | Na | Tenê ciphertext |
| Tomarên dozê / daneyên hêlînan | Erê (end-to-end) | Na | Tenê ciphertext |
| Pêvekên pelê | Erê (end-to-end) | Na | Tenê ciphertext |
| Tomarên têkiliyê | Erê (end-to-end) | Na | Tenê ciphertext |
| Nasnameyên xwebexş | Erê (end-to-end) | Na | Tenê ciphertext |
| Metadata-ya tîm/rol | Erê (şîfrekirî) | Na | Tenê ciphertext |
| Pênaseyên zeviyên xweser | Erê (şîfrekirî) | Na | Tenê ciphertext |
| Naveroka SMS/WhatsApp/Signal-a hatî | Erê (li ser servera we) | Na | Ciphertext ji servera we; dibe ku pêşkêşkar orjînal hebe |
| Peyamên broadcast ên derketinê | **Na -- plaintext dema radestkirinê** | **Erê, bi awayekî demkî** | Erê (plaintext dema şandinê) |
| Parçeyên vegerê | Erê (end-to-end ber bi amûra wergir) | Na | Tenê ciphertext |
| Bûyerên dem-rast | Erê (per-hub, kilîtên nûvebûyî) | Na | Tenê ciphertext |
| Metadata-ya bangê | Na | Erê | Erê |
| Tomarên radestkirinê yên broadcast | Na | Erê | Erê |
| Hash-ên hejmara telefonê ya banger | HMAC hashed | Tenê hash | Hash (ne vegera bêyî sirê we) |
| Hash-ên hejmara telefonê ya abone | HMAC hashed | Tenê hash | Hash (ne vegera bêyî sirê we) |
| String-ên User-Agent | SHA-256 hashed | Tenê hash | Hash (ne vegera) |

---

## Ji bo kontrolorên ewlehiyê

Belgeya teknîkî:

- [Specîfîkasyona Protokolê](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/PROTOCOL.md)
- [Modela Tehdîtê](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/THREAT_MODEL.md)
- [Sernavkirina Daneyan](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Valahiyên Ewlehiyê û Rêya Pêşerojê](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/SECURITY_GAPS_AND_ROADMAP.md)
- [Kontrolên Ewlehiyê](https://github.com/rhonda-rodododo/llamenos-platform/tree/main/docs/security)
- [Belgeya API](/api/docs)

Llámenos open source e: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
