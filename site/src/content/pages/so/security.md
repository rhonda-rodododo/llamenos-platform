---
title: Amniga & Asturnaanta
subtitle: Waxa la ilaaliyay, waxa la arki karo, iyo waxa laga heli karo yeedhista maxkamadeed — oo loo abaabulay astaamaha aad isticmaasho.
---

## Haddii bixiyahaaga martigelinta la yeedho

| Way **bixin karaan** | Ma **bixin karaan** |
|---|---|
| Xogta wicitaanka/farriinta (wakhtiyada, muddada) | Nuxurka qoraalka, qoraal-qaadista, jidhka warbixinada |
| Goobooyin kayd xogeed oo sir ah | Magaca tabaruceyaasha (sir dhammaad-ilaa-dhammaad) |
| Akoonada tabaruceyaasha ee firfircoonaa wakhtigaas | Diiwaanada buugga xiriirka (sir dhammaad-ilaa-dhammaad) |
| Diiwaanada gudbinta farriimaha baahinta | Nuxurka farriinta (la siriyay markay soo gasho, loo kaydiyay sida qoraal sir ah) |
| | Furaha sir-dejinta (waxaa ilaaliya PIN-kaaga, akoonkaaga bixiyaha aqoonsiga, iyo ikhtiyaaran furaha amnigaaga qalabka) |
| | Furaha sir-dejinta ee qoraal kasta (ku meel gaar — waa la burriyaa ka dib duubista) |
| | Sirtaada HMAC ee rogista hashyada taleefanka |
| | Nuxurka qaybta soo-kabashada (sir ah, server-ku ma aqrin karo) |

**Server-ku wuxuu kaydiyaa xog uu aqrin karin.** Xogta (goorta, inta ay socotay, akoonada) waa la arki karaa. Nuxurka (waxa la yidhi, waxa la qoray, cidda xiriirradaagu yihiin) lama arko.

---

## Astaamo kasta

Asturnaantaadu waxay ku xiran tahay kanaalada aad shiddo:

### Wicitaannada codka

| Haddii aad isticmaasho... | Dhinacyo saddexaad ayaa heli kara | Server-ku wuu heli karaa | Nuxurka sirta ah ee dhammaad-ilaa-dhammaad |
|---|---|---|---|
| Twilio/SignalWire/Vonage/Plivo | Maqalka wicitaanka (nool), diiwaanada wicitaanka | Xogta wicitaanka | Qoraallada, qoraal-qaadista |
| Asterisk la is-hawlgabeeyay | Waxba (adaa kontoroola) | Xogta wicitaanka | Qoraallada, qoraal-qaadista |
| Browser-ka-browser-ka (WebRTC) | Waxba | Xogta wicitaanka | Qoraallada, qoraal-qaadista |

**Yeedhista bixiyaha telefoonada**: Waxay leeyihiin diiwaanada faahfaahsan ee wicitaanka (wakhtiyada, lambarrada taleefannada, muddada). Ma **helaan** qoraallada wicitaanka ama qoraal-qaadista. Duubista waa la damiyay sida caadiga ah.

**Qoraal-qaadista**: Qoraal-qaadistu waxay ku dhacdaa gabi ahaanba browser-kaaga iyadoo la isticmaalayo AI-ga qalabka. **Maqalku marna kama baxo qalabkaaga.** Oo keliya qoraalka sirta ah ayaa la kaydiyaa.

### Farriiminta qoraalka (mid-ku-mid)

| Kanaalka | Bixiyuhu wuu heli karaa | Kaydka server-ka | Xusuus |
|---|---|---|---|
| SMS | Bixiyahaaga telefoonada wuxuu akhriyaa dhammaan farriimaha | **Sir** | Bixiyuhu wuxuu hayaa farriimaha asalka ah |
| WhatsApp | Meta wuxuu akhriyaa dhammaan farriimaha | **Sir** | Bixiyuhu wuxuu hayaa farriimaha asalka ah |
| Signal | Shabakadda Signal waa sir dhammaad-ilaa-dhammaad; buundadu waxay dib u siraysaa markay soo gaarto | **Sir** | Dariiqa la door bido marka la heli karo |

**Gudbinta Signal-ka-horreeya**: Marka qofka la soo dirayo uu leeyahay Signal, farriimaha waxaa si toos ah loo mariyaa Signal-ka — bixiyahaaga telefoonada marna ma arko nuxurka. SMS, oo keliya ogeysiis guud oo ah "waxaad haysaa farriin cusub" ayaa la diraa sida caadiga ah (ma jiro jidhka farriinta), markaa diiwaanada bixiyahaagu kuma koobna nuxur xasaasi ah.

**Farriimaha waa la siriyay daqiiqadda ay server-kaaga soo gaaraan.** Server-ku wuxuu kaydiyaa oo keliya qoraal sir ah. Bixiyahaaga telefoonada ama farriiminta ayaa wali hayn kara farriinta asalka ah — taas waa xaddidaadda platform-yadaas, ma aha wax aan beddeli karno.

**Yeedhista bixiyaha farriiminta**: Bixiyeyaasha SMS waxay leeyihiin nuxurka farriinta buuxda oo keliya haddii aad si cad u shiddo habka SMS nuxur-buuxa. Habka ogeysiiska-keliya ee caadiga ah, jidhka SMS kuma koobna nuxur farriimeed. Meta wuxuu hayaa nuxurka WhatsApp. Farriimaha Signal waa sir dhammaad-ilaa-dhammaad ilaa buundada, laakiin buundada (oo ku shaqeysa server-kaaga) ayaa sir-deyneysa ka hor inta aan dib loo sirin kaydinta. Dhamaan xaaladaha, **server-kaagu wuxuu leeyahay oo keliya qoraal sir ah** — bixiyaha martigelintu ma aqrin karo nuxurka farriinta.

### Farriimaha baahinta

Maamulayaashu waxay u diri karaan farriimo baahin ah macaamiisha iyada oo loo marayo SMS, WhatsApp, Signal, ama RCS.

**Muhiim: farriimaha baahinta ee gudbaya kuma sirna dhammaad-ilaa-dhammaad server-ka.** Si farriin loogu gudbiyo macaamiisha SMS ama WhatsApp, server-ku waa inuu farsameeyaa nuxurka qoraalka cad si ku meel gaar ah wuxuuna u dhiibaa bixiyaha farriiminta. Bixiyuhu markaas wuu gudbiyaa wuxuuna hayn karaa nuqul.

| Kanaalka | Server-ku wuu heli karaa marka la dirayo | Bixiyuhu wuu heli karaa | Ka dib gudbinta |
|---|---|---|---|
| SMS baahin | Qoraal cad (ku meel gaar, gudbinta) | Nuxurka farriinta buuxda | Bixiyuhu wuu hayaa |
| WhatsApp baahin | Qoraal cad (ku meel gaar, gudbinta) | Nuxurka farriinta buuxda (Meta) | Bixiyuhu wuu hayaa |
| Signal baahin | Qoraal cad (ku meel gaar, gudbinta) | Sir dhammaad-ilaa-dhammaad iyada oo loo marayo shabakadda Signal | Bixiyuhu ma hayo |
| RCS baahin | Qoraal cad (ku meel gaar, gudbinta) | Google ayaa arki kara nuxurka | Bixiyuhu wuu hayaa |

**Macnaha tan**: Farriimaha baahinta waa inaysan ku koobnayn macluumaadka xasaasiga ah ee gacanta. U isticmaal ku-ogaysiisyada, ogeysiisyada jadwalka, iyo kheyraadka — ma aha faahfaahinta kiiska ama wax aqoonsan kara gacanta ama tabaruceyaasha.

Lambarrada taleefannada macaamiisha waxaa loo kaydiyaa sida aqoonsiyeyaasha la hasheeyay — kaydkaagu marna kuma koobna liis macaamiil oo qoraal cad ah. Codsiyada joojinta (STOP) waa la farsameeyaa isla markiiba heerka macaamiishana waa la cusboonaysiiyaa.

### Qoraallada, qoraal-qaadista, iyo warbixinada

Dhammaan nuxurka tabaruce-gu qoray waa sir dhammaad-ilaa-dhammaad:

- Qoraal kastaa wuxuu isticmaalaa **fure random ah oo gaar ah** (sirta horay-u-socota — hal qoraal oo la jabiyay kuma dhaco kuwa kale)
- Furayaasha waxaa si gooni ah loogu duubay tabaruce iyo maamul kasta
- Server-ku wuxuu kaydiyaa oo keliya qoraal sir ah
- Sir-dejintu waxay ku dhacdaa qalabkaaga, lakab ammaan ah oo aan marna u bandhigayn furayaasha interface-ka isticmaalaha abka
- **Goobabka caadada ah, nuxurka warbixinta, iyo lifaaqyada faylka dhammaantood waa si gooni ah loo siriyay**

**Diiwaanada kiisaska iyo xogta hay'adda**: Diiwaanada kiisaska qaabeysan (xiriirrada, kiisaska, silsiladaha caddaynta) waxay raacaan isla qaabka sirta — shay kasta oo leh fure gaar ah, oo loo duubay daawadayaasha la oggolaaday. Server-ku ma aqrin karo nuxurka kiiska.

**Qabashada qalabka**: La'aanteed PIN-kaaga **iyo** marin u helista akoonkaaga bixiyaha aqoonsiga, weerarayaashu waxay helaan goobo sir ah oo uu ilaaliyo Argon2id — shaqo soo-saarista furaha xusuusta-adag taas oo ka dhigaysa weerarrada xoog-ku-dirista (brute-force) oo leh qalab gaar ah (GPUs, ASICs) mid aad qiimo ugu weyn marka la barbar dhigo hababka caadiga ah. Haddii aad sidoo kale isticmaasho furaha amniga qalabka, **saddex arrimood oo madax-bannaan** ayaa ilaaliya xogtaada.

---

## Qalabkaaga

### Daawashada iyo burinta qalabka

Abku wuxuu hayaa liis qalab kasta oo aad ka soo gashay. Waad daawan kartaa liiskan oo waxaad burin kartaa qalab kasta oo aadan aqoonsan.

**Markaad qalab buriso:**
- Qalabkaas isla markiiba waa laga xannibaa inuu galaako onkaaga
- Furayaashaaga sirta waa la wareejiyaa si qalabka la buriyay ugu sir-deyjin karin nuxur mustaqbal ah
- Burintu waxay ku duuban tahay taariikhda amniga akoonkaaga

Tan macneheedu waa in xataa haddii qof haysto nuqul ka mid ah xogtaada sirta ah ka hor burinta, ma aqrin karaan nuxurka cusub ee la abuuray ka dib burinta.

### Xaqiijinta SAS emoji

Ururrada leh baahiyo amnigeed oo sarreeya, maamulayaashu waxay xaqiijin karaan aqoonsiga qalabka iyagoo isticmaalaya xaqiijinta SAS (Short Authentication String) — oo loo muujiyay sida taxane 7 emoji ah.

**Sida ay u shaqeyso:**
1. Maamulaha iyo milkiilaha qalabka ayaa isbarbar dhigaya taxanahooda emoji (qof ahaan, taleefanka, ama kanaal la aaminaa)
2. Haddii emoji-yadu isku mid yihiin, qalabka waxaa loo xaqiijiyay inuu ka tirsan yahay milkiilahiisa diiwaan gashan
3. Xaqiijinta waa la duubay — maamulayaashu waxay arki karaan qalabka la xaqiijiyay

Tani waxay ka ilaalisaa weerarka qof ku diiwaan geliyay qalab been abuur ah akoonka qof kale. Taxanaha emoji wuxuu ka yimid furaha aqoonsiga sirta ah ee labada qalab iyo kood hal-isticmaale ah — server-ku ma maanipuleyn karo una saadaalin karo.

---

## Tirtirista akoonka

### Tirtirista is-saacidda ah

Waxaad codsan kartaa in akoonkaaga iyo dhammaan xogta la xiriirta si joogto ah loo tirtiro. Sida caadiga ah waxaa jira dib u dhac (oo uu dejiyay maamulaha xaruntaada, caadi ahaan 72 saacadood) ka hor inta aan tirtiristu dhamaystirin — tani waxay ku siinaysaa wakhti aad ku joojiso haddii codsiga lagu sameeyay qasab.

**Waxa la tirtiraa:**
- Furayaashaaga qalabka (oo ka dhigaya dhammaan nuxurka sirta ah mid si joogto ah loo aqrin karin, xataa kaydka kaydka)
- Diiwaanka akoonkaaga, qoondeynta doorka, iyo taariikhda shifta
- Calamadaaga ogeysiiska riixista

**Waxa ku dhaca nuxurka sirta ah ee aad abuurtay**: Qoraallada, qoraal-qaadista, iyo warbixinada aad qortay waxaa dib loogu siriyay akhristayaasha la oggolaaday ee hadhay (maamulayaasha kale). Nuqulkaaga furaha sir-dejinta waa la burriyaa. Nuxurka laftiisu wuxuu sii jiraa daawadayaasha kale ee la oggolaaday — si wadajir ah looma tirtiro, sababtoo ah gacanta iyo taariikhda kiisku waxay ka tirsan yihiin xarunta, ma aha adiga shakhsi ahaan.

**Diiwaanada hubinta**: Gelistaada diiwaanka hubinta waa sir-la-burburiyay — furaha sir-dejinta isticmaale kasta waa la burriyaa, taasoo ka dhigaysa gelistaada mid aan la aqrin karin. Silsiladda hashyada (qaab-dhismeedka caddayn-karista) waa hagaagsan.

### Tirtirista degdegga ah

Haddii aad rumaysan tahay in akoonkaagu khatar degdeg ah ku jiro, waxaad codsan kartaa tirtirista degdegga ah oo leh ansixiye wadaag ah — qof kale oo la aaminaa (maamul ama xiriir la aamino) oo saxeexa degdegga. Tani waxay yaraynaysaa dib u dhaca ugu yaraan 4 saacadood. Heerka 4-sacadood ee ugu yar wuxuu u jiraa inuu ka ilaaliyo tirtirista qasabka ah (lagu qasbay inaad tirtirto caddaynta ka hor inta gargaar aan iman).

### Waxa lama tirtiri karo

Xogta wicitaanka (cidda ka jawaabtay, goorta, inta ay socotay) waa qayb ka mid ah diiwaanka hubinta xarunta. Maamulaha xaruntaada ayaa kontoroola inta muddada ah ee tan la ilaaliyo. GDPR, waxaad xaq u leedahay inaad codsato sixid ama tirtiris — la xiriir maamulaha xaruntaada.

---

## Kooxaha soo-kabashada

Haddii aad lumiso dhammaan qalabkaaga (taleefanka la burburiyay, laptop-ka la xaday, wax walba), caadi ahaan waxaad waayi doontaa dhammaan xogtaada sirta ah. Kooxaha soo-kabashada ayaa xalliya arrintan.

### Sida soo-kabashadu u shaqeyso

Waxaad u qoondeysaa koox dad ah oo la aamin karo (caadi ahaan 3-5 qof) sida kooxdaada soo-kabashada. Xiriir kastaa wuxuu hayaa hal "qayb" oo ka mid ah furaha soo-kabashada — qayb ka mid ah halxiraalaha.

**Si aad u soo kabato akoonkaaga:**
1. Waxaad diiwaan gelisaa qalab cusub oo waxaad bilaabaysaa codsi soo-kabasho
2. Xiriirradaada soo-kabashada mid kastaa wuxuu helaa ogeysiis
3. Ka dib dib u dhac la qaabeyn karo (si aad u hesho wakhti aad ku joojiso codsi qasab ah), tirada ugu yar ee xiriirrada (tusaale, 2 ka mid ah 3) ayaa ansixiya codsiga
4. Xiriir kasta oo ansixiya wuxuu dirayaa qaybtooda, oo si toos ah loogu siriyay qalabkaaga cusub
5. Qalabkaaga cusub wuxuu isku daraa qaybaha si uu dib ugu dhiso furaha soo-kabashada, kaas oo soo celinaya marin u helista xogtaada sirta ah

**Waxa server-ku arki karo**: Server-ku wuxuu gudbiyaa qaybaha furaha ee la siriyay ee u dhexeeya qalabka. Ma aqrin karo qaybaha, ma dhisto furaha soo-kabashada keligiis, kana gudbi karo shuruudda tirada ugu yar.

### Guryaha amniga ee kooxaha soo-kabashada

- **Amniga tirada**: Qaybaha ka hooseeya tirada ugu yar waxba kama muujiyaan sirta — hal qayb-hayste kaliya ma soo kabin karo akoonkaaga
- **Ma jiro ku lug lahaanshaha server-ka sirta**: Qaybaha waxaa si toos ah loogu siriyay furaha dadweynaha ee qalabkaaga cusub; server-ku wuxuu kaydiyaa oo gudbiyaa oo keliya qoraal sir ah
- **Baaxadda xarunta kasta**: Soo-kabashadu waxay soo celisaa marin u helistaaga hal xarun oo gaar ah. Haddii aad ku jirto xarumo badan, xarun kastaa waxay leedahay koox soo-kabasho u gaar ah
- **Dib u dhac iyo joojin**: Waxaad joojin kartaa codsi soo-kabasho inta lagu jiro muddada dib u dhaca — ilaalin ka dhan ah qof bilaabaya codsi soo-kabasho magacaaga iyada oo aan adiga ogayn
- **Xaqiijinta Signal**: Codsiyada soo-kabashada waxaa lagu xaqiijiyaa Signal si loo xaqiijiyo inaad kontoroolo akoonka Signal ee ku xiran aqoonsigaaga

### Doorashada xiriirrada soo-kabashada

Dooro dad aad ku kalsoon tahay oo:
- Loo gaari karo si madax-bannaan (dhamaantood kuma sugnayn isla goobta ama ururka)
- Isticmaala Signal (looga baahan yahay tallaabada xaqiijinta)
- Fahmay in mararka qaar laga codsan doono inay ansixiyaan codsiyada soo-kabashada

Xiriirradaada soo-kabashada ma helaan marin u helista xogtaada sirta ah iyaga oo haysta qayb — waxay kaa caawin karaan oo keliya markaad bilaabato codsi.

---

## Asturnaanta lambarka taleefanka tabaruceyaasha

Marka tabaruceyaashu ku helaan wicitaannada taleefankooda shakhsiga ah, lambarradooda waxaa u arkaa bixiyahaaga telefoonada.

| Heerka | Lambarka taleefanka waxaa arka |
|---|---|
| Wicitaanka PSTN ee taleefanka tabaruce | Bixiyaha telefoonada, sidaha taleefanka |
| Browser-ka-browser-ka (WebRTC) | Qofna (maqalku wuxuu ku jiraa browser-ka) |
| Asterisk la is-hawlgabeeyay + taleefanka SIP | Server-kaaga Asterisk oo keliya |

**Si loo ilaaliyo lambarrada taleefannada tabaruceyaasha**: Isticmaal wicitaannada browser-ka ku-saleysan (WebRTC) ama bixi taleefannada SIP oo ku xiran Asterisk la is-hawlgabeeyay.

---

## Dhowaan la diray

Horumarintan ayaa maanta nool:

| Astaanta | Faa'iidada asturnaanta |
|---|---|
| Maamulka qalabka | Daavo oo buri qalab kasta oo soo galay; burintu waxay kiciyaa wareejinta furaha si qalabka la saaray u aqrin karin nuxur cusub |
| Xaqiijinta qalabka SAS emoji | Maamulayaashu waxay xaqiijin karaan qalabka qof ahaan iyagoo isticmaalaya sawir sir ah oo ah 7 emoji — server-ku ma been abuuri karo |
| Tirtirista akoonka oo leh dib u dhac | Codsii tirtirista akoonkaaga; dib u dhac la qaabeyn karaa ayaa kuu ogolaanaya inaad joojiso haddii codsigu qasab ahaa |
| Tirtirista degdegga ah | Tirtirista degdegga ah ee la ansixiyay oo leh ugu yaraan 4 saacadood |
| Sir-burburinta tirtirista | Furayaashaaga sirta ayaa marka hore la burriyaa, taasoo ka dhigaysa nuxurka mid si joogto ah aan loo aqrin karin ka hor inta aan kaydka laga tirtirin |
| Kooxaha soo-kabashada (Shamir) | U qoondee xiriirro la aamin karo oo kaa caawin kara soo-kabashada haddii aad lumiso dhammaan qalabka — qaybaha ka hooseeya tirada waxba kama muujiyaan |
| Farriiminta baahinta oo leh daacadnimo | Maamulayaashu waxay diri karaan farriimo badan; server-ku wuxuu farsameeyaa qoraal cad si ku meel gaar ah gudbinta (si cad loogu sheegay UI-ka) |
| Hashaynta macaamiisha | Lambarrada taleefannada macaamiisha baahinta waxaa loo kaydiyaa sida aqoonsiyeyaasha la hasheeyay — ma jiro liis macaamiil oo qoraal cad kaydka |
| Ilaalinta furaha Argon2id | Furayaashaaga qalabka waxaa ilaaliya shaqo xusuusta-adag oo iska caabisa weerarrada xoog-ku-dirista ee GPUs iyo qalab gaar ah |
| Marinta farriinta ee Signal-ka-horreeya | Farriimaha si toos ah ayaa loo mariyaa Signal-ka marka la heli karo, taasoo ka ilaalinaysa nuxurka inuu ku jiro diiwaanada bixiyaha SMS |
| Habka ogeysiiska SMS-keliya | Macaamiisha SMS waxay arkaan oo keliya "waxaad haysaa farriin cusub" — ma jiro nuxur xasaasi ah diiwaanada bixiyaha |
| Iska caabbinta falanqaynta taraafikada | Cabbirrada dhacdooyinka wakhtiga-dhabta ah waa la buuxiyaa si goob-joogayaashu u aqoonsan karin farriimaha gaaban kuwa dhaadheer |
| Ma jiro lambarro taleefan oo qoraal cad kaydka | Lambarrada gacanta waxaa loo kaydiyaa sida hashyo aan laga soo celin karin — kaydkaagu marna kuma koobna lambarka taleefanka dhabta ah |
| Sirta xarun kasta oo leh sirta horay-u-socota | Dhacdooyinka wakhtiga-dhabta ah ee xarun kasta waxaa lagu siriyay furayaal ka wareejiya 24 saacadood kasta — furayaashii hore ma sir-deyjin karaan dhacdooyinka cusub |
| Sirta Rust ee dhammaan platform-yada | Desktop, iOS, iyo Android dhammaantood waxay wadaan isla maktabadda Rust sirta ah ee la baaray — furayaasha marna ma galaan JavaScript, Swift, ama Kotlin code |
| Marin-u-helista xaddidan ee relay-ga | WebSocket relay-kaagu wuxuu aqbalaa dhacdooyinka oo keliya server-kaaga — ma jiro qayb dibadeed oo soo gelin karta ogeysiisyo been ah |
| Kaydinta farriinta sirta ah | Farriimaha SMS, WhatsApp, iyo Signal waxaa loo kaydiyaa sida qoraal sir ah server-kaaga |
| Qoraal-qaadista qalabka | Maqalku marna kama baxo qalabkaaga — gabi ahaanba qalabka ayaa lagu farsameeyaa iyadoo la isticmaalayo AI maxalli ah |
| Ilaalinta furaha arrimo-badan | Furayaashaaga sirta waxaa ilaaliya PIN-kaaga, bixiyahaaga aqoonsiga, iyo ikhtiyaaran furaha amniga qalabka |
| Furayaasha amniga qalabka | Furayaasha jireed waxay ku daraan arrin saddexaad oo aan fogaan lagaga xadgudbi karin |
| Dhismayaal la soo celin karo | Xaqiiji in koodka la hawlgaliyay uu waafaqsanyahay koodka dadweynaha |
| Buugga xiriirka sirta ah | Diiwaanada xiriirka, xiriirrada, iyo qoraallada waa sir dhammaad-ilaa-dhammaad |

## Wali waa la qorsheeyay

| Astaanta | Faa'iidada asturnaanta | Heerka |
|---|---|---|
| Abka helista wicitaanka dabiiciga ah | Ma jiraan lambarro taleefan oo shakhsiyeed oo la soo bandhigay | Horumarinta ku jiraa |
| Certificate pinning (mobile) | Difaac ka dhan ah ka-hadista TLS CA-been ah | Qaab-dhismeedku waa dhammaystiran yahay; pins-ku waxay sugaan hawlgalka koowaad |
| SFrame sirta codka wicitaanka | Wicitaannada codka oo sir dhammaad-ilaa-dhammaad ah | Soo-saarista furaha waa dhammaystiran tahay; sir-dejinta farram kasta waa la qorsheeyay |

---

## Jadwalka soo koobida

| Nooca xogta | Sir ah | U muuqata server-ka | Laga heli karaa yeedhista maxkamadeed |
|---|---|---|---|
| Qoraallada wicitaanka | Haa (dhammaad-ilaa-dhammaad) | Maya | Sir qarsoon oo keliya |
| Qoraal-qaadista | Haa (dhammaad-ilaa-dhammaad) | Maya | Sir qarsoon oo keliya |
| Warbixinada | Haa (dhammaad-ilaa-dhammaad) | Maya | Sir qarsoon oo keliya |
| Diiwaanada kiisaska / xogta hay'adda | Haa (dhammaad-ilaa-dhammaad) | Maya | Sir qarsoon oo keliya |
| Lifaaqyada faylka | Haa (dhammaad-ilaa-dhammaad) | Maya | Sir qarsoon oo keliya |
| Diiwaanada xiriirka | Haa (dhammaad-ilaa-dhammaad) | Maya | Sir qarsoon oo keliya |
| Aqoonsiyada tabaruceyaasha | Haa (dhammaad-ilaa-dhammaad) | Maya | Sir qarsoon oo keliya |
| Xogta kooxda/doorka | Haa (sir) | Maya | Sir qarsoon oo keliya |
| Qeexitaannada goobabka caadada ah | Haa (sir) | Maya | Sir qarsoon oo keliya |
| Nuxurka soo-gala SMS/WhatsApp/Signal | Haa (server-kaaga) | Maya | Sir qarsoon server-kaaga; bixiyuhu wuxuu hayn karaa asalka |
| Farriimaha baahinta ee gudbaya | **Maya — qoraal cad inta la gudbinayo** | **Haa, si ku meel gaar ah** | Haa (qoraal cad wakhtiga dirista) |
| Qaybaha soo-kabashada | Haa (dhammaad-ilaa-dhammaad qalabka helaya) | Maya | Sir qarsoon oo keliya |
| Dhacdooyinka wakhtiga-dhabta ah | Haa (xarun kasta, furayaal wareegaya) | Maya | Sir qarsoon oo keliya |
| Xogta wicitaanka | Maya | Haa | Haa |
| Diiwaanada gudbinta baahinta | Maya | Haa | Haa |
| Hashyada taleefanka gacanta | HMAC hashed | Hash oo keliya | Hash (lama rogi karo sirtaada la'aan) |
| Hashyada taleefanka macaamiisha | HMAC hashed | Hash oo keliya | Hash (lama rogi karo sirtaada la'aan) |
| Xargaha User-Agent | SHA-256 hashed | Hash oo keliya | Hash (lama rogi karo) |

---

## Baarayaasha amniga

Dukumentiyada farsamada:

- [Qeexitaanka Borotokoolka](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/PROTOCOL.md)
- [Qaabka Khatarta](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/THREAT_MODEL.md)
- [Kala-saaridda Xogta](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Farqiyada Amniga iyo Khariidadda Jidka](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/SECURITY_GAPS_AND_ROADMAP.md)
- [Baaritaanka Amniga](https://github.com/rhonda-rodododo/llamenos-platform/tree/main/docs/security)
- [Documentation-ka API](/api/docs)

Llámenos waa fure-furan: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
