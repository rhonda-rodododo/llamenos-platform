---
title: Tilmaanta Mobilka
description: Ku rakib oo dejiso abka mobilka Llámenos ee iOS iyo Android.
---

Abka mobilka Llámenos wuxuu u ogolaanayaa tabaruceyaasha inay ka jawaabaan wicitaannada, ka jawaabaan farriimaha, oo ay qoraan qoraallo sir ah taleefankooda gacanta. Waxaa lagu dhisay React Native wuxuuna la wadaagaa isla xudunta sirta Rust sida abka desktop-ka.

## Waa maxay abka mobilka?

Abka mobilku waa wehel ka mid ah abka desktop-ka. Wuxuu ku xirmaa isla backend-ka Llámenos (Cloudflare Workers ama is-hawlgab) wuxuuna isticmaalaa isla borotokoolka, markaa tabaruceyaashu waxay u kala beddeli karaan desktop-ka iyo mobilka si habsami leh.

Abka mobilku wuxuu ku jiraa kayd gooni ah (`llamenos-platform`) laakiin wuxuu la wadaagaa:

- **llamenos-core** — Isla Rust crate-ka dhammaan hawlgallada sirta, oo loo diyaariyay iyada oo loo marayo UniFFI iOS iyo Android
- **Borotokool** — Isla qaabka silaca, dhammaadka API, iyo qorshaha sirta
- **Backend** — Isla Cloudflare Worker ama server is-hawlgab

## Soo deji oo rakib

### Android

Abka mobilka hadda waxaa loo qaybiyaa sida APK loogu talagalay soo-dejinta dhinaca:

1. Ka soo de qaybta `.apk` ee ugu dambeysay bogga [GitHub Releases](https://github.com/rhonda-rodododo/llamenos-platform/releases/latest)
2. Qalabkaaga Android, tag **Settings > Security** oo shid **Install from unknown sources** (ama u shid ab kasta marka lagu faro)
3. Fur APK-ga la soo dejiyay oo taabo **Install**
4. Marka la rakibo, fur Llámenos sanduuqaaga abka

Qaybinta App Store iyo Play Store waa la qorsheeyay sii daynta mustaqbalka.

### iOS

Dhismaha iOS waxaa loo heli karaa sida sii dayn beta ee TestFlight:

1. Ku rakib [TestFlight](https://apps.apple.com/app/testflight/id899247664) App Store-ka
2. Weydii maamulahaaga xiriiriyaha martiqaadka TestFlight
3. Fur xiriiriyaha qalabkaaga iOS si aad ugu biirto beta-ka
4. Ku rakib Llámenos TestFlight-ka

Qaybinta App Store waa la qorsheeyay sii daynta mustaqbalka.

## Dejinta bilowga ah

Abka mobilka waxaa la dejiyaa iyadoo lagu xirayo akoon desktop-ka jira. Tani waxay hubinaysaa in isla aqoonsiga sirta la isticmaalayo dhammaan qalabka iyada oo aan marna la gudbin furaha sirta ah qoraal cad.

### Qalabaynta qalabka (QR scan)

1. Fur abka Llámenos desktop-ka oo tag **Settings > Devices**
2. Guji **Link New Device** — tani waxay abuurtaa QR code ay ku jiraan calan qalabaynta hal-isticmaale ah
3. Fur abka Llámenos mobilka oo taabo **Link Device**
4. Scan QR code-ka kamaradda taleefankaaga
5. Abku waxay sameeyaan is-weydaarsiga furaha ECDH ku meel gaar ah si ay u gudbiyaan qalabkaaga furaha sirta ah si ammaan ah
6. Deji PIN abka mobilka si aad u ilaaliso kaydkaaga furaha maxalliga ah
7. Abka mobilka hadda waa la xiray oo waa diyaar yahay

Habka qalabayntu marna kuma gudbiyo nsec-kaaga qoraal cad. Abka desktop-ku wuxuu ku duwayaa qalabka furaha sirta ah ee la wadaago, abka mobilkuna wuxuu ku sir-deyjiyaa gudaha.

### Dejinta gacanta (nsec entry)

Haddii aadan scan gareyn karin QR code, waxaad si toos ah u gelin kartaa nsec-kaaga:

1. Fur abka mobilka oo taabo **Enter nsec manually**
2. Ku dheji furahaaga `nsec1...`
3. Deji PIN si aad u ilaaliso kaydka maxalliga ah
4. Abku wuxuu soo saaraa furahaaga dadweynaha wuxuuna ka diiwaan geliyaa backend-ka

Habkani wuxuu u baahan yahay inaad si toos ah u maamusho nsec-kaaga, markaa kaliya isticmaal haddii qalabaynta qalabku aan suurtagal ahayn. Isticmaal maamulaha lambarrada sirta ah si aad u dhejiso nsec-ka halkii aad qori lahayd.

## Isbarbardhigga astaamaha

| Astaanta | Desktop | Mobile |
|---|---|---|
| Ka jawaab wicitaannada soo gala | Haa | Haa |
| Qor qoraallo sir ah | Haa | Haa |
| Goobabka caadada ah ee qoraalka | Haa | Haa |
| U jawaab farriimaha (SMS, WhatsApp, Signal) | Haa | Haa |
| Daavo wada hadalada | Haa | Haa |
| Heerka shifta iyo fasaxyada | Haa | Haa |
| Qoraal-qaadista dhinaca macmiilka | Haa (WASM Whisper) | Maya |
| Raadinta qoraalka | Haa | Haa |
| Qalabka amarrada | Haa (Ctrl+K) | Maya |
| Taakulaynta kiiboodhka | Haa | Maya |
| Dejinta maamulka | Haa (buuxda) | Haa (xaddidan) |
| Maamul tabaruceyaasha | Haa | Daavo oo keliya |
| Daavo diiwaanada hubinta | Haa | Haa |
| Wicitaannada WebRTC ee browserka | Haa | Maya (isticmaalo taleefanka dabiiciga ah) |
| Ogeysiisyada riixista | Ogeysiisyada OS | Riixis dabiici ah (FCM/APNS) |
| Cusboonaysiinta tooska ah | Tauri updater | App Store / TestFlight |
| Lifaaqyada faylka (warbixinada) | Haa | Haa |

## Xaddidaadyada

- **Ma jiro qoraal-qaadista dhinaca macmiilka** — Moodhka WASM Whisper wuxuu u baahan yahay xusuus iyo kheyraad CPU oo muhiim ah oo aan ku habboonayn mobilka. Qoraal-qaadista wicitaanka waxaa laga heli karaa oo keliya desktop-ka.
- **Waxqabadka sirta oo yaraaday** — In kasta oo abka mobilku isticmaalo isla xudunta Rust sirta iyada oo loo marayo UniFFI, hawlgalladu way gaabin karaan qalabka hoose marka la barbar dhigo waxqabadka desktop-ka dabiiciga ah.
- **Astaamaha maamulka oo xaddidan** — Hawlgallada maamulka qaar (maamulka tabaruceyaasha ee badan, qaabeynta dejinta faahfaahsan) waxaa laga heli karaa oo keliya abka desktop-ka. Abka mobilku wuxuu bixiyaa aragtida akhriska oo keliya inta badan muraayadaha maamulka.
- **Ma jiro wicitaannada WebRTC** — Tabaruceyaasha mobilku waxay ku helaan wicitaannada lambarka taleefankooda iyada oo loo marayo bixiyaha telefoonada, ma aha browser-ka. Wicitaannada WebRTC ee abka dhexdiisa waa desktop oo keliya.
- **Battery iyo xiriirka** — Abku wuxuu u baahan yahay xiriir joogto ah si uu u helo cusboonaysiinta wakhtiga-dhabta ah. Habka asalka (background) waxaa xaddidi kara maamulka tamarta OS-ka. Ha ku hay abka horudhaca inta aad shifta ku jirto si aad u hesho ogeysiisyo la isku halayn karo.

## Cillad-xallinta arrimaha mobilka

### Qalabayntu way fashilantaa "QR code aan sax ahayn"

- Hubi in QR code-ka la sameeyay dhawaan (calamada qalabayntu waxay dhacaan 5 daqiiqo ka dib)
- Abuur QR code cusub oo ka yimid abka desktop-ka oo isku day mar kale
- Hubi in labada qalabba ay ku xiran yihiin internet-ka

### Ma helayo ogeysiisyada riixista

- Hubi in ogeysiisyada loo oggolaaday Llámenos dejinta qalabkaaga
- Android: Tag **Settings > Apps > Llamenos > Notifications** oo shid dhammaan kanaalada
- iOS: Tag **Settings > Notifications > Llamenos** oo shid **Allow Notifications**
- Hubi inaadan ku jirin habka Ha Qalqalin (Do Not Disturb)
- Xaqiiji in shiftaadu firircoon tahay oo aadan fasax ku jirin

### Abku wuxuu fashilmaa marka la furo (crash)

- Hubi inaad waddo nooca abka ugu dambeeyay
- Nadiifi kaydka abka: **Settings > Apps > Llamenos > Storage > Clear Cache**
- Haddii dhibta sii jirto, tirtir oo dib u rakib (waxaad u baahan doontaa inaad dib u xirto qalabka)

### Ma sir-deyjin karo qoraalladii hore ka dib dib-u-rakibidda

- Dib-u-rakibidda abka waxay saaraysaa qalabka furaha maxalliga ah
- Dib u xir qalabka iyada oo loo marayo QR code abkaaga desktop-ka si aad u soo celiso marin u helista
- Qoraallada la siriyay ka hor dib-u-rakibidda waa la heli karaa mar haddii qalabka dib loo xiro isla aqoonsiga

### Waxqabadka gaabiska ah ee qalabka da'da ah

- Xidh abka kale si aad u sii daysso xusuusta
- Dami animation-yada dejinta abka haddii ay jiraan
- Ka fiirso isticmaalka abka desktop-ka hawlgallada culus sida dib-u-eegista qoraallada badan
