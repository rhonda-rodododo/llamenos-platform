---
title: Tilmaanta Maamulka
description: Maamul wax kasta — tabaruceyaasha, shiftooyinka, kanaalada, wada hadalada, warbixinada, liisaska mamnuuca, iyo goobabka caadada ah.
---

Maamul ahaan, waxaad maamushaa wax kasta: tabaruceyaasha, shiftooyinka, kanaalada isgaadhsiinta, wada hadalada, warbixinada, liisaska mamnuuca, iyo goobabka caadada ah. Tilmaantani waxay daboolaysaa hababka maamulka ee muhiimka ah.

## Soo galida

Soo gal iyadoo la isticmaalayo `nsec` (furaha sirta ah ee WebSocket) oo la sameeyay inta lagu guda jiro [dejinta](/docs/deploy). Bogga soo-galida wuxuu aqbalayaa qaabka nsec (`nsec1...`). Browser-ku wuxuu saxeexaa caqabad (challenge) furaha — sirta marna kama baxdo qalabka.

Ikhtiyaaran, ka diiwaan geli furaha WebAuthn passkey ee Dejinta si aad u soo gasho iyada oo aan loo baahnayn lambar sir ah qalabka kale.

## Qalabka dejinta

Soo-galidaada koowaad, abku wuxuu kugu hagaajiyaa **qalabka dejinta** — hab tallaabo-tallaabo ah oo la hagayo:

1. **Ku magacaw khadkaaga gurmadka** — dejiso magaca muujinta ee la tuso isticmaalayaasha
2. **Dooro kanaalada** — shid/dami Codka, SMS, WhatsApp, Signal, iyo Warbixinada
3. **Qaabee bixiyeyaasha** — gali aqoonsiyaha kanaal kasta oo la shiday
4. **Dib-u-eegis** — xaqiiji dejintaada oo dhammaystir dejinta

Ka dib markaad dhammaystirto qalabka, calanka `setupCompleted` waa la dejiyaa qalabkuna mar dambe kuma soo bixi doono. Had iyo jeer waad isbeddeli kartaa dejintan gadaal ka bogga Dejinta.

## Maamulida tabaruceyaasha

U gudub **Tabaruceyaasha** liiska dhinaca si aad:

- **Tabaruce ku dar** — wuxuu abuuraa furaha WebSocket cusub. La wadaag nsec-ka si ammaan ah tabaruce (hal mar oo keliya ayaa la muujiyay).
- **Abuur xiriiriye martiqaad ah** — wuxuu abuuraa xiriiriye hal-isticmaale ah. Habka martiqaadku wuxuu ku jiraa sooc doorka (tabaruce, maamul, ama weriye).
- **Tafatir** — cusboonaysii magaca, lambarka taleefanka, iyo doorka.
- **Saar** — hawlgelin tabaruce keliya.

Lambarrada taleefannada tabaruceyaasha waxaa arki kara oo keliya maamulayaasha. Waxaa loo isticmaalaa wicitaanada isku-marrada ah marka tabarucehu shifta ku jiro.

## Maamulida weriyeyaasha

Weriyeyaashu waa door gaar ah oo loogu talagalay dadka soo gudbiya talooyin ama warbixin iyada oo loo marayo platform-ka. Waxay leeyihiin marin u helis xaddidan — waxay arki karaan oo keliya warbixinadooda iyo bogga caawimada.

Si aad u soo gudbiso weriye:
1. Abuur xiriiriye martiqaad ah oo dooro doorka **Weriyaha**
2. La wadaag xiriiriyaha weriyaha — waxay abuuri doonaan aqoonsigooda
3. Weriyeyaashu way soo galaan waxayna arkaan interface fudud oo leh Warbixinada iyo Caawimada oo keliya

## Qaabeynta shiftooyinka

U gudub **Shiftooyinka** si aad u abuurto jadwal cel-cel ah:

1. Guji **Ku Dar Shif**
2. Deji magac, dooro maalmaha todobaadka, oo deji wakhtiyada bilowga/dhammaadka
3. Qoondee tabaruceyaasha iyadoo la isticmaalayo xulashada badan ee la raadin karo
4. Kaydi — nidaamku wuxuu si toos ah u mariyaa wicitaannada tabaruceyaasha shifta firfircoon

Qaabee **Kooxda Khasabka ah** xagga hoose ee bogga shifta. Tabaruceyaashani way dhawaqli doonaan marka uusan jirin shif qorsheysan oo firfircoon.

## Liisaska mamnuuca

U gudub **Mamnuuca** si aad u maamusho lambarrada taleefannada ee la xannibay:

- **Gelid keli ah** — ku qor lambar taleefan oo qaabka E.164 ah (tusaale, +15551234567)
- **Soo-dejin dad kooban** — ku dhejiso lambarro badan, hal lambar sadar kasta
- **Saar** — ka xannib lambar isla markiiba

Mamnuucadu waxay dhaqangalaan isla markiiba. Gacanta mamnuucan waxay maqlaan farriin diidmo ah oo waa laga xiraa.

## Wada hadalada

Marka kanaalada farriiminta (SMS, WhatsApp, Signal) la shido, xiriiriyaha **Wada Hadalada** ayaa ka soo baxa liiska dhinaca. Tani waxay tusaysaa dhammaan wada hadalada qaab wada hadal ah ee dhammaan kanaalada farriiminta.

Wada hadal kastaa wuxuu muujinayaa:
- Goobooyin farriimeed oo leh wakhtiyo iyo jihada (soo-gal/kac-bax)
- Kanaalka farriintu ku soo martay (SMS, WhatsApp, Signal)
- Cusboonaysiinta wakhtiga-dhabta ah iyada oo loo marayo WebSocket relay — farriimaha cusubi waxay soo baxaan isla markiiba

Wada hadalada waxaa si toos ah loo abuuraa marka farriin soo gasho. Tabaruceyaashu si toos ah ugama jawaabi karaan wada hadalada.

## Warbixinada

Marka kanaalka Warbixinada la shido, maamulayaashu waxay arki karaan dhammaan warbixinada la soo gudbiyay:

- **Liiska warbixinada** — wuxuu muujinayaa dhammaan warbixinada oo leh cinwaan, qayb, heer, iyo taariikhda gudbinta
- **Raadinta heerka** — warbixinadu waxay u socdaan furan → la qaatay → la xalliyay
- **Qaado warbixin** — naftaada u qoondee si aad u maamusho warbixin
- **Jawaabaha wada hadalka ah** — uga jawaab weriyeyaasha farriimaha sirta ah
- **Lifaaqyada faylka** — weriyeyaashu waxay soo gelin karaan faylal sir ah oo ay la socdaan warbixinadooda

Nuxurka jidhka warbixinta iyo lifaaqyada faylka waxaa la siriyay iyadoo la isticmaalayo ECIES — server-ku marna ma arko nuxurka warbixinta qoraalka cad.

## Dejinta wicitaanka

**Dejinta**, waxaad ka heli doontaa qaybo dhowr ah:

### Yareynta spam-ka

- **CAPTCHA codka** — shid/dami. Marka la shido, gacantu waa inay gashaa lambar 4-god ah oo random ah.
- **Xaddidida heerka** — shid/dami. Waxay xaddidaysaa wicitaannada lambar taleefan kasta wakhti go'an gudihiis.

### Qoraal-qaadista

- **Shididda guud** — shid/dami qoraal-qaadista Whisper dhammaan wicitaannada.
- Tabaruceyaasha shaqsiga ahi waxay sidoo kale iska sii qaadi karaan iyaga oo isticmaalaya dejintooda.

### Dejinta wicitaanka

- **Wakhtiga suga** — inta gacantu sugi karto ka hor inta aan loo dirin farriinta codka (30-300 ilbiriqsi).
- **Muddada ugu badnaan ee farriinta codka** — dhererka duubista ugu badnaan (30-300 ilbiriqsi).

### Goobabka caadada ah ee qoraalka

Qeex goobab qaabeysan oo ka soo baxa foomka qoraal-qaadista:

- Noocyada la taageero: qoraal, lambar, xul (hoos-u-dhac), sanduuqa calaamadaynta, goobta qoraalka weyn
- Qaabee xaqiijinta: loo baahan yahay, dhererka ugu min/ugu badnaan, qiimaha ugu min/ugu badnaan
- Xakamaynta aragga: dooro goobabka tabaruceyaashu arki karaan oo tafatiri karaan
- Dib-u-habayn goobabka iyadoo la isticmaalayo fallaadhaha kor/hoos
- Ugu badnaan 20 goob, ugu badnaan 50 ikhtiyaar xul kasta

Qiyamka goobabka caadada ah waa la siriyay oo ay weheliso nuxurka qoraalka. Server-ku marna ma arko.

### Codadka IVR

Duub codadka IVR ee caadada ah oo loogu talagalay luqad kasta oo la taageero. Nidaamku wuxuu isticmaalaa duubistaada salaanta, CAPTCHA, suga, iyo hababka farriinta codka. Halka ayna jirin duubis, wuxuu ku dhacaa qoraal-u-cod.

### Kanaalada farriiminta

Qaabee kanaalada SMS, WhatsApp, iyo Signal:

- **SMS** — shid/dami, qaabee farriinta soo-dhaweynta ee jawaabaha tooska ah. Wuxuu isticmaalaa isla bixiyaha telefoonada ee codkaaga (Twilio, SignalWire, Vonage, ama Plivo).
- **WhatsApp** — shid/dami, gali aqoonsiyaha Meta Cloud API (calanka marin u helista, calanka xaqiijinta, aqoonsiga lambarka taleefanka). Wuxuu taageeraa farriimaha qaabka (template messages) si uu u bilaabo wada hadalada 24-saac gudahood.
- **Signal** — shid/dami, qaabee xiriiriyaha buundada signal-cli-rest-api iyo lambarka taleefanka. Waxaa ku jira la socodka caafimaadka oo leh hoos-u-dhac qurux badan.

Kanaal kastaa wuxuu leeyahay dhammaadkiisa webhook — ka eeg [Bilowga](/docs/deploy) xiriiriyeyaasha si aad u qaabeyso.

### Siyaasadda WebAuthn

Ikhtiyaaran u baahan furaha marin u helista (passkeys) maamulayaasha, tabaruceyaasha, ama labadaba. Marka loo baahdo, isticmaalayaashu waa inay diiwaan geliyaan furaha ka hor inta aysan isticmaali karin abka.

## Caawimada abka ku dhex jirta

Bogga **Caawimada** wuxuu bixiyaa:
- Qaybaha FAQ: Bilowga, Wicitaannada & Shiftooyinka, Qoraallada & Sirta, Maamulka
- Tilmaamo door-gaar ah oo loogu talagalay maamulayaasha, tabaruceyaasha, iyo weriyeyaasha
- Kaadhadhka tixraaca degdegga ah ee taakulaynta kiiboodhka iyo amniga
- Waxyaalaha FAQ ee la rogrogayo oo leh balaadhi/ciribtir

Dashboard-ka maamulku wuxuu sidoo kale tusayaa **Liiska hubinta Bilowga** kaas oo raadraaca horumarka dejinta (qaabeynta kanaalada, ku darista tabaruceyaasha, abuurista shiftooyinka, iwm).

## Diiwaanka hubinta

Bogga **Diiwaanka Hubinta** wuxuu tusayaa liis taariikheed oo dhacdooyinka nidaamka: soo-gelista, jawaabista wicitaanka, abuurista qoraalka, isbeddelada dejinta, iyo ficillada maamulka. Gelista waxaa ku jira cinwaannada IP ee la hasheeyay iyo xogta waddanka. Isticmaal tirada bogagga si aad u baadho taariikhda.

## Taariikhda wicitaanka

Bogga **Wicitaannada** wuxuu tusayaa dhammaan wicitaannada oo leh heerka, muddada, iyo qoondeynta tabaruce. Ku sifee taariikhda ama ku raadi lambarka taleefanka. Dhoofi xogta qaabka JSON ee u hogaansama GDPR.
