---
title: Astaamaha
subtitle: Wax kasta oo uu u baahan yahay platform-ka jawaabta xiisadaha — 8 bixiye telefoon, 5 kanaal oo farriimeed, sirta HPKE (RFC 9180), iyo seddex ab oo dabiici ah oo wadaaga hal Rust crypto crate oo la baari karo. Is-hawlgab ku ah Bun + PostgreSQL, GDPR u hogaansama.
---

## Qaab-dhismeedka Amniga

Llámenos waxaa laga soo qaabiyay bilowga si ay u ilaaliso gacanta iyo tabaruceyaasha ka soo horjeeda cadawga si fiican u maalgeliyay — dowladaha, kooxaha midigta, iyo shirkadaha sirta gaarka ah. Go'aan kasta oo sir ah waa mid ula kac ah, oo la duubay, oo la baari karo.

**HPKE (RFC 9180) — X25519-HKDF-SHA256-AES256-GCM** — Isla heerka sirta isku-dhafka ah ee loo isticmaalo MLS (Messaging Layer Security) iyo TLS 1.3. Waxay gabi ahaanba beddeshay ECIES (secp256k1) hore. RFC 9180 wuxuu bixiyaa dhismo si rasmi ah loo qeexay, oo asxaabtu dib u eegtay halkii uu ka ahaan lahaa dhismo ku-meel-gaar ah.

**Sirta horay-u-socota ee qoraal kasta** — Qoraal kastaa wuxuu isticmaalaa fure random ah oo gaar ah, ka dibna furahaas waxaa loo duubaa HPKE si gooni gooni ah u akhriste kasta oo la oggolaaday (tabaruce iyo maamul kasta). Qalabka gaarka ah ee akhristaha oo la jabiyay waxba kama muujiyo qoraallada la qoray ka hor jabinta. Kala-saraynta furaha: Per-User Key (PUK) → items_key → furaha nuxurka qoraalka, oo leh wareejin caajis ah oo kaskado ah.

**Qoraallada laba-la-siriyay** — Qoraal kasta waa laba jeer la siriyay: hal mar HPKE loo duubay tabaruce qoray, mar maamul kasta. Labaduba si madax-bannaan bay u sir-deyjin karaan. Qof kale — oo ay ku jiraan server-ka — ma aqrin karo qoraalka cad.

**57 calaamadood oo kala-saaris sirta** — Hawlgal kasta oo sir ah wuxuu isticmaalaa xaraf xaaladeed oo gaar ah (difaaca Albrecht). Ma jiraan laba hawlgal oo wadaaga dariiqa soo-saarista furaha, taasoo ka ilaalinaysa weerarrada iskutallaabta-borotokoolka. Calaamadaha waxaa lagu qeexay `packages/protocol/crypto-labels.json` waxaana lagu soo saaraa TypeScript, Swift, iyo Kotlin iyada oo loo marayo codegen. Marna lama isticmaalo xarfo qoraal cad oo cayiman xaaladaha sirta.

**Furayaasha Ed25519/X25519 ee qalab kasta** — Isticmaalayaashu waxay leeyihiin furayaal qalab-gar ah (ma aha hal fure aqoonsi). Qalabka cusub waxaa oggolaada silsilad saxeexan oo Ed25519 ah, oo hash-xiran, oo keli-ku-bixi ah. Xidhiidhka qalabku wuxuu isticmaalaa qolal qalabayn ECDH ku-meel-gaar ah oo dhaca 5 daqiiqo ka dib.

**Kaydka furaha ee PIN-la-siriyay** — Furayaasha gaarka ah ee qalabka waxaa la siriyay 600,000 wareeg oo PBKDF2 + XChaCha20-Poly1305 ka hor kaydinta. Furaha ceyriinka ahi wuxuu ku jiraa oo keliya xiritaan xusuusta gudaha, oo la eexiyay marka la xiro. Marna ma taabto sessionStorage, IndexedDB, ama disk qoraal cad.

**Kaydka amniga ee platform-ka-dabiiciga ah** — Desktop: Tauri Stronghold vault sir ah. iOS: iOS Keychain. Android: Android Keystore iyada oo loo marayo EncryptedSharedPreferences.

**Qoraal-qaadista dhinaca macmiilka oo keliya** — Qoraal-qaadista wicitaanku waxay isticmaashaa WASM Whisper (`@huggingface/transformers` ONNX runtime) oo gabi ahaanba browser-ka ku shaqeeya. Maqalka waxaa si maxalli ah loo farsameeyaa iyada oo loo marayo AudioWorklet ring buffer → Web Worker. Maqalku marna ma gaaro server-ka — xataa qaab sir ah.

**SFrame codka E2EE** — Kanaalada warbaahinta sirta ah iyadoo la isticmaalayo SFrame (RFC 9605) oo leh soo-saarista furaha oo lagu daray Rust crypto crate la wadaago.

**Rust crypto crate la wadaago** — Hal hirgelin oo la baari karo gudaha `packages/crypto/` oo loo diyaariyay seddex bartilmaameed: dabiici (Tauri desktop), WASM (browser iyada oo loo marayo `@tauri-apps/api`), iyo UniFFI (iOS XCFramework + Android JNI). Ma aha seddex hirgelin oo kala duwan oo kala bixi karta.

**Diiwaanka hubinta silsilad-hashyeedka** — Wicitaan kasta oo laga jawaabay, qoraal kasta oo la sameeyay, farriin kasta oo la dirtay, dejinta kasta oo la beddelay, iyo ficil kasta oo maamul ah waa la duubay iyadoo la isticmaalayo silsiladda SHA-256 (`previousEntryHash` + `entryHash` ) si loo ogaado wax ka beddelka. Maamulayaashu waxay xaqiijin karaan daacadnimada silsiladda.

**Dhismayaal la soo celin karo** — `Dockerfile.build` oo leh `SOURCE_DATE_EPOCH`, magacyo fayl oo hash-ku-qoran. SLSA provenance, SBOM, iyo cosign saxiixa sii-dayn kasta. Dhismaha kasta waa la xaqiijin karaa bayt-by-bayt ka dhanka ah `CHECKSUMS.txt` ee GitHub Releases iyadoo la isticmaalayo `scripts/verify-build.sh`.

---

## Telefoonada — 8 Bixiye

**Si ka duwan inta badan platform-yada oo ku xira hal bixiye**, Llámenos wuxuu hirgeliyaa interface-ka `TelephonyAdapter` oo leh 8 hirgelin oo dhammaystiran. Ku beddel bixiyeyaasha UI-ga maamulka — ma jiro isbeddel kood, ma jiro wakhti-dhimaad.

### Bixiyeyaasha Daruuraha (6)

- **Twilio** — WebRTC buuxda, cod barnaamij-kar ah, SIP trunking
- **SignalWire** — API la jaan-qaadi kara Twilio, qiimo jaban, taageerada WebRTC
- **Vonage** (Nexmo) — Ikhtiyaarka deganaanshaha xogta Yurub
- **Plivo** — Qiimo-ku-ool ah, dabool caalami ah
- **Telnyx** — Qiimo tartan leh, isdhexgalka Mission Control Portal
- **Bandwidth** — Heerka shirkadda, isku halaynta shabakadda heerka sida Mareykanka

### SIP Is-hawlgab (2)

- **Asterisk** — Iyada oo loo marayo ARI (Asterisk REST Interface). Kontorool wicitaan buuxda, IVR, duubis.
- **FreeSWITCH** — Iyada oo loo marayo ESL (Event Socket Library). Waxqabad sarreeya, karti shir qabsi.

Labaduba waxay isticmaalaan heerka asaasiga ah ee `SipBridgeAdapter` oo leh doorsoome `PBX_TYPE` oo dooranaya backend-ka. Kamailio waa la taageeroo sida lakabka wakiilka SIP. **Ma jiraan diiwaanno wicitaan oo server-kaaga ka baxa.**

### Marinta Wicitaanka

**Dhawaq isku mar ah** — Marka gacantu soo wacdo, tabaruce kasta oo shifta ku jira oo aan mashquul ahayn ayaa isla mar dhawaqlaya. Kii ugu horreeya ee qaata ayaa guuleysta; kuwa kale dhammaantood isla markiiba way joogsadaan. Ma jiraan wicitaano la seegay oo u horseeda raadinta taxanaha ah.

**Jadwalka shifta ku-saleysan** — Abuur shifto cel-cel ah oo leh maalmo iyo wakhtiyo gaar ah. U qoondee tabaruceyaasha. Nidaamku wuxuu si toos ah u mariyaa wicitaannada cidda shaqeysa. Kooxda khasabka ah ayaa dhawaqlaya haddii aan shif la qorsheyn.

**Saf oo leh muusig suga** — Haddii dhammaan tabaruceyaashu mashquul yihiin, gacantu waxay gashaa saf leh muusig suga oo la qaabeyn karo. Wakhtigu waa la hagaajin karaa (30-300 ilbiriqsi). Wuxuu u gudbaa farriinta codka haddii aan wax laga jawaabin.

**Ku-dhaca farriinta codka** — Gacantu waxay ka tagi kartaa farriin cod ah (ilaa 5 daqiiqo). Farriimaha codka waxaa qoraa Whisper-ka dhinaca macmiilka waxaana loo siriyay dib-u-eegista maamulka.

**Wicitaannada WebRTC ee browser-ka** — Tabaruceyaashu waxay si toos ah ugaga jawaabaan wicitaannada browser-ka iyada oo aan taleefan loo baahnayn. Soo-saarista calanka WebRTC ee bixiye-gaar ah Twilio, SignalWire, Vonage, iyo Plivo.

**Xakamaynta spam-ka** — CAPTCHA codka (geli 4-god oo random ah), xaddidida heerka daaqad-simbeerta ah ee lambar taleefan kasta, iyo liisaska mamnuuca wakhtiga-dhabta ah. Maamulayaashu waxay shidi/kari karaan kontorool kasta si madax-bannaan iyada oo aan dib-u-bilow loo baahnayn. Codadka IVR ee caadada ah oo leh ku-dhaca TTS.

---

## Farriiminta — 5 Kanaal

Dhammaan kanaaladu waxay wadaagaan qaab wada hadal oo sir ah oo midaysan. Farriin kasta oo soo gala waxaa HPKE la siriyay marka webhook-ka la helo; server-ku wuxuu isla markiiba tuuraa qoraalka cad.

### Signal

Is-dhexgalka ugu dhammaystirsan ee Twilio ka baxsan. Adapter-ka Signal wuxuu ku jiraa:

- Dir/hel buuxa oo leh rasiidh-gudbin
- Rasiidh-akhris iyo tilmaamayaasha qorista
- Dareen-celin iyo wada hadal jawaab celin ah
- Diiwaangelin iyo xidhiidhin iyada oo loo marayo buundada signal-cli-rest-api
- Xaqiijinta kalsoonida aqoonsiga iyo maamulka nambarada badbaadada
- Saf suga oo leh gadaal-u-gaabsi jibbaaran
- Failover-ka gaadiidka kale marka buundadu fashilanto
- Qoraal-qaadista farriimaha codka iyada oo loo marayo Whisper-ka dhinaca macmiilka
- La socodka caafimaadka oo leh hoos-u-dhac quruxsan

### WhatsApp Business

- Meta Cloud API (Graph API v21.0)
- Taageerada farriimaha qaabka (template) si loo waafajiyo daaqadda 24-saac
- Farriimaha warbaahinta: sawirro, dukumannti, maqal, fiidiyoow
- Xaqiijinta saxiixa webhook-ka
- Rasiidhyada akhriska iyo heerka gudbinta

### SMS

- Soo-gala iyo gudbaha iyada oo loo marayo Twilio, SignalWire, Vonage, ama Plivo
- Jawaab toos ah oo leh farriimo soo dhaweyn oo la qaabeyn karo luqad kasta
- Taageerada MMS halka laga heli karo
- Xaqiijinta saxiixa webhook-ka bixiye kasta

### Telegram

- Telegram Bot API
- Taageerada warbaahinta: sawirro, dukumannti, farriimaha codka
- Kiiboodhadhka khadka iyo calaamadaynta jawaabta
- Habka webhook ama codeynta polling

### RCS (Rich Communication Services)

- Google RBM (Rich Business Messaging) API
- Kaadhadhka qaniga ah, ficillada la soo jeediyay, iyo carousels
- Rasiidhyada gudbinta iyo akhriska
- Ku dhaca SMS halka RCS aan laga helin karin

### Baahinta

Safka gudbinta ee PostgreSQL-ku-tiirsan ee farriimaha badan:

- Xaddidida heerka kanaal kasta (ixtiraamaysa xaddidaadda bixiyaha)
- Dirista jadwalka leh taageerada aagga wakhtiga
- Raadinta heerka qof kasta (saf ku jira, la diray, la gudbiyay, fashilmay)
- Caqli-celinta safka oo leh safka dhinta
- Gudbinta koox koox ah oo leh cabbirro koox oo la qaabeyn karo
- Dashboard-ka maamulka oo muujinaya horumarka gudbinta wakhtiga-dhabta ah

---

## Multi-Platform — Saddex Ab oo Dabiici ah, Hal Crypto Crate

Inta badan platform-yadu waxay diraan ab web ah oo leh dahaar dabiici ah oo khafiif ah. Llámenos wuxuu diraa saddex ab oo gabi ahaanba dabiici ah oo wadaaga hal hirgelin Rust sir ah oo la baari karo.

### Desktop (Tauri v2)

- Windows, macOS, Linux binaries dabiici ah
- Tauri Stronghold vault sir ah oo loogu talagalay kaydinta furaha
- Tusaha nidaamka dabiiciga ah oo leh tilmaamaha wicitaanka soo gala
- Cusboonaysiinta tooska ah iyada oo loo marayo Tauri updater
- Dhaqangelinta hal-matoor
- Qaabka goonid goosashada + Siyaasadda Nuxurka Amniga
- Dhammaan hawlgallada sirta waxay maraan Rust IPC — furayaasha gaarka ah marna ma galaan webview
- Habka dhismaha `PLAYWRIGHT_TEST` ee tijaabada E2E oo leh lakabka IPC-ee-mock ah

### iOS (SwiftUI)

- SwiftUI dabiici ah, iOS 17+ oo leh `@Observable`
- Furayaasha waxaa lagu kaydiyaa iOS Keychain
- Rust sirta iyada oo loo marayo UniFFI XCFramework (`LlamenosCoreFFI`)
- XCTest + XCUITest tijaabada cutubka iyo is-dhexgalka
- Ogeysiisyada riixista iyada oo loo marayo APNs oo leh rarka la siriyay
- Xarumo badan: maamulayaasha asalka marna kama xiraan heerka xarunta firfircoon

### Android (Kotlin/Compose)

- Kotlin 2.3 dabiici ah oo leh Jetpack Compose, Material 3
- minSdk 26, AGP 9.1, Gradle 9.4
- Furayaasha Android Keystore iyada oo loo marayo EncryptedSharedPreferences
- Rust sirta iyada oo loo marayo maktabadda la wadaago JNI (faylasha `.so` oo ka yimid isla Rust crate)
- Hilt duritaanka qabatinka + KSP farsamaynta calaamadaynta
- Tijaabada Compose UI + tijaabada Cucumber BDD E2E
- Xarumo badan: ViewModel xarun kasta oo dib-u-soo-dejin ah, kaydinta furaha xarunta, marinta WebSocket

### Rust Crypto Crate La Wadaago

`packages/crypto/` waxay hirgelineysaa:

- HPKE (RFC 9180): X25519-HKDF-SHA256-AES256-GCM
- Saxiixyada Ed25519 (BIP-340 Schnorr isku-qaabsiga WebSocket)
- Heshiiska furaha X25519
- Soo-saarista furaha PBKDF2 (600K wareeg)
- HKDF (RFC 5869)
- Sirta la xaqiijiyay ee XChaCha20-Poly1305
- SFrame (RFC 9605) codka E2EE
- MLS (Messaging Layer Security) iyada oo loo marayo OpenMLS — gadaasha calanka `mls`
- Qaab-dhismeedka UniFFI ee xidhiidhada iOS/Android
- Diyaarinta WASM ee isticmaalka browser-ka

---

## Maamulka Kiisaska

Llámenos kuma xidhna mid kasta oo isticmaal oo gaar ah. Wax walba waa qaab-dhaliye (template-driven).

**Nidaamka hay'adda ee qaab-dhaliyaha kiciya** — Maamulayaashu waxay qeexaan noocyada hay'adda (xiriirrada, kiisaska, warbixinada, dhacdooyinka), goobabka caadada ah (qoraal, lambar, xul, sanduuqa calaamadaynta, goobta qoraalka, taariikhda, faylka), iyo noocyada warbixinta xarun kasta. Qaab-dhaliyeyaashu waxay wadaan dhammaan foomamka iyo aragtida. Maja jiraan isbeddel kood oo loo baahan yahay si loo qaabeeyo qorshe shaqo oo cusub.

**Noocyada warbixinta ee caadada ah** — Qaab-dhaliyeyaashu waxay qeexaan `reportTypes[]` oo leh goobab caadi ah oo nooc kasta leh, `allowCaseConversion`, iyo calamada `mobileOptimized`. Noocyada warbixintu gabi ahaanba way ka duwan yihiin noocyada hay'adda.

**Raadinta sirta ah ee blind-index** — Diiwaanada waxaa loo kaydiyaa iyagoo sir ah, laakiin goobabka HMAA-ku-tilmaamantay ayaa u ogolaanaya raadinta dhinaca server-ka iyada oo aan la soo bandhigayn qoraal cad. Tilmaamayaashu waxay ku xiran yihiin xarun kasta marnana kama gudbaan xuduudaha xarumaha.

**Xiriirrada iyo xiriirrada** — Buug xiriir oo buuxa oo leh garaaf xiriir. Ku xidh xiriirrada kiisaska, dhacdooyinka, iyo caddaynta. Xiriirrada waa la qeexaa (tusaale, "wuxuu markhaati u yahay", "wuxuu kormeer sharci u yahay") waana la qaabeyn karaa qaab-dhaliye kasta.

**Maamulka caddaynta** — Ku lifaaq faylasha kiisaska. Faylasha waxaa la siriyay ka hor soo-dejinta (HPKE loo duubay akhristaha la oggolaaday). Silsiladda haynta caddaynta waxaa lagu duubaa raadka hubinta.

**RBAC** — Kontorool marin-u-helista doorka: Tabaruce (qoraalladiisa oo keliya), Maamul (dhammaan xogta), Weriyaha (gudbinta oo keliya). Doorka caadada ah ee qaab-dhaliye kasta. Maamulayaashu ma arki karaan qoraallada tabaruce-keliya.

**Xarumo badan** — Hal rakibaad oo Llámenos ah waxay u adeegtaa xarumo madax-bannaan oo badan (ururro, khadad, ama isticmaallo). Isticmaale kastaa wuxuu xubin ka noqon karaa xarumo badan isla mar. Wicitaannada soo gala, ogeysiisyada, iyo dhacdooyinka relay-ga ee DHAMMAAN xarumaha xubnaha ah had iyo jeer waa firfircoon yihiin — kuma xiran xarunta hadda la soo bandhigay.

---

## Aqoonsiga & Maamulka Furaha

**Furaha WebSocket** — Isticmaalayaashu waxay ku xaqiijiyaan aqoonsiga iyagoo isticmaalaya furaha Ed25519 u janjeera WebSocket. Xaqiijinta saxiixa BIP-340 Schnorr. Ma jiraan lambarro sir ah, ma jiraan ciwaanno iimayl oo looga baahan yahay aqoonsiga.

**Furaha marin-u-helista WebAuthn** — Taageerada passkey ikhtiyaariga ah si loogu soo galo qalabyo badan. Diiwaan geli furaha amniga qalabka ama biometric-ka platform-ka, ka dibna soo gal iyada oo aan la qorayn PIN.

**Silsilad saxeexa isticmaalaha** — Diiwaannada oggolaanshaha qalabka ee keli-ku-bixi ah, hash-xiran. Diiwaan kasta waxaa saxeexay furaha Ed25519 ee qalabka oggolaanaya. Waxay bixisaa taariikh sir ah oo qalabka loo oggolaaday isticmaale kasta.

**Wareejinta PUK kaskada** — Per-User Key (PUK) → items_key → furaha nuxurka qoraalka. Marka qalabka laga saaro oggolaanshaha ama isticmaaluhu beddelo PIN-ka, furayaasha saameeyay waxay ku wareejiyaan si caajis ah — oo keliya dib-u-sirista diiwaannada marka la helo, ma aha hawlgal koox ah.

**Qalabaynta qalabka** — Ku xidh qalab cusub iyada oo aan la soo bandhigayn furaha gaarka ah. Scan QR code ama gali kood qalabayn oo gaaban. Waxay isticmaashaa is-weydaarsiga furaha ECDH ku-meel-gaar ah. Qolalka qalabayntu way dhacaan 5 daqiiqo ka dib.

**Furayaasha soo-kabashada** — Inta lagu jiro soo-gal-qaadista, fure soo-kabasho oo qaabka Base32 ah (128-bit entropy) ayaa la soo saaraa. Soo-dejinta kaydka sirta ah ee qasabka ah ka hor inta aan la sii wadin. Kani waa dariiqa keliya ee soo-kabashada — ma jiro soo-kabasho maamul, naqshad ahaan.

**Xiritaan toos ah** — Maamulaha furaha wuxuu iskiis u xidhmaa marka uu wakhtigu dhammaado ama taabka browser-ka la qariyo. Muddada firfircoonaanta la qaabeyn karo. Dib u gali PIN-ka si aad u furto.

**Qaabka kalfadhiyada** — Laba heer: "la xaqiijiyay laakin la xir" (calanka kalfadhiga oo keliya, aragtida akhriska oo keliya) vs "la xaqiijiyay oo la furay" (PIN la galiyay, marin u helista sirta buuxda). Calamaha kalfadhiga 8-saac oo leh digniin wakhti-dhimaad ah.

---

## Kaabayaasha Wakhtiga-Dhabta ah

**WebSocket relay** — WebSocket relay is-hawlgab (ama Nosflare Cloudflare) loogu talagalay qaybinta dhacdooyinka wakhtiga-dhabta ah. Dhammaan nuxurka dhacdada waxaa lagu siriyay furaha xarunta. Calamada guud (`["t", "llamenos:event"]`) waxay ka hortagaan soo-saarka xogta heerka relay-ga ee noocyada dhacdooyinka.

**Furaha xarunta** — 32 bayt oo random ah (`crypto.getRandomValues`), HPKE loo duubay xubin kasta oo xarunta iyada oo loo marayo `LABEL_HUB_KEY_WRAP`. Waa la wareejiyaa marka xubinta baxdo — xubnaha baxay ma sir-deyjin karaan dhacdooyinka mustaqbalka.

**WebSocket** — Heerka wicitaanka wakhtiga-dhabta ah, joogista tabaruceyaasha, cusboonaysiinta wada hadalada, iyo la socodka maamulka iyada oo loo marayo WebSocket. Wuxuu dib u xirma oo leh gadaal-u-gaabsi jibaaran.

**Isku-dhafka wakhtiga-dhabta ah ee WebSocket** — Dhacdooyinka ku-meel-gaarka ah ee nooca 20001 loogu talagalay isku-dhafka heerka qalabka iyo xarunta. Nuxurka waa sir ah; relay-ku ma kala saari karo noocyada dhacdooyinka.

---

## Khibrada Maamulka & Tabaruceyaasha

**Qalabka dejinta** — Dejin tallaabo-tallaabo ah oo la hagayo marka maamuluhu soo galo marka koowaad. Dooro kanaalada, qaabee bixiyeyaasha, deji magaca khadka gurmadka. Wuxuu soo saaraa furaha bilowga ah ee xarunta wuxuuna u qaybiyaa furaha xarunta maamulaha koowaad.

**Liiska hubinta Bilowga** — Widget-ka dashboard-ka oo raadraaca horumarka dejinta: qaabeynta kanaalka, soo-gal-qaadista tabaruceyaasha, abuurista shifta.

**La socodka wakhtiga-dhabta ah** — Wicitaannada firfircoon, gacanta safka ku jira, wada hadalada, iyo heerka tabaruceyaasha ayaa ku cusboonaada wakhtiga-dhabta ah iyada oo loo marayo WebSocket.

**Qalabka amarrada** — Ctrl+K (ama Cmd+K) marimaha degdegga ah, raadinta, abuurista degdegga ah ee qoraalka, iyo beddelka mawduuca. Amarrada maamulka-keliya waxaa sifeeyay doorka.

**Joogista tabaruceyaasha** — Maamulayaashu waxay arkaan tirada wakhtiga-dhabta ah ee ku-xiran/ka-xiran/fasaxa ku jira. Tabaruceyaashu waxay shidaan badhanka fasaxa si ay u joojiyaan wicitaannada soo gala iyada oo aan shifta ka baxayn.

**Taakulaynta kiiboodhka** — Riix `?` dhammaan taakulaynta. U gudub bogagga, fur qalabka amarrada, ficillada caadiga ah iyada oo aan la isticmaalin jiirka.

**Mawduucyada mugdiga/iftiinka** — Nidaamka-raaca, mugdi, ama iftiin. Waa la sii hayaa kalfadhi kasta.

**Dhoofinta xogta GDPR** — Dhoofi qoraallada sida fayl sir ah oo u hogaansama GDPR (`.enc`). Oo keliya qoraha asalka ah ayaa sir-deyjin kara.

---

## Caalamiyeynta

**13 luqadood oo abka ku dhex jira** — Ingiriisi (English), Isbaanish (Español), Shiinees (中文), Tagalog, Fiyatnaamiis (Tiếng Việt), Carabi (العربية, RTL), Faransiis (Français), Haitian Creole (Kreyòl Ayisyen), Kuuriyaan (한국어), Ruush (Русский), Hindi (हिन्दी), Bortugiis (Português), Jarmal (Deutsch).

**Khadka soo-saarista koodka** — Hal il oo run ah oo faylasha JSON ee luqadda ayaa soo saara iOS `.strings`, Android `strings.xml`, iyo Kotlin `I18n.kt` — ma jiro isku-duubni gacanta. Waxaa xaqiijiyay `bun run i18n:validate:all`.

**Taageerada RTL** — Qaabka Carabigu wuxuu si sax ah u soo baxaa habka RTL oo leh marinta muraayadda oo la miiqay, hagaajinta toosinta qoraalka, iyo maaraynta qoraalka labada jihood.

**Codadka IVR ee caadada ah ee luqad kasta** — Duub codadka luqad kasta oo ay isticmaalaan gacantaada. Wuxuu ku dhacaa qoraal-u-cod marka ayna jirin duubis.

---

## Hawlgalka

### Docker Compose (Hal Server)

- Qaybta buuxda: Bun HTTP server, PostgreSQL, RustFS (kaydinta shayga), WebSocket relay
- Profiles-ka ikhtiyaariga ah: `--profile signal` (signal-cli sidecar), `--profile telephony` (Kamailio + CoTURN), `--profile inference` (LLM firehose agent), `--profile monitoring` (Prometheus + Grafana)
- `docker-compose.dev.yml` horumarinta maxalliga ah oo leh daawashada faylka
- `docker-compose.production.yml` daboolka adaynta wax-soo-saarka

### Kubernetes (Helm)

- Jaantuska Helm wax-soo-saarka oo leh nuqullo la qaabeyn karo
- Baaritaannada caafimaadka: `/health/ready` iyo `/health/live`
- Prometheus ServiceMonitor soo-qaadista cabbirada
- Caddyfile.production oo leh HSTS, CSP, iyo madaxyada amniga
- Heesaha Ansible ee hubinta ka-hor-hawlgalka iyo hubinta ka-dib-hawlgalka

### Co-op Cloud

- Recipe hawlgalka Co-op Cloud
- Loo dhisay iskaashiga shaqaalaha iyo ururrada bulshada ee shaqeeya kaabayaashooda

### Cloudflare Tunnels

- Ingress iyada oo loo marayo Cloudflare Tunnels — ma jiraan port-yada soo-gala oo furan
- La jaan-qaadi kara server-yada is-hawlgabka ee gadaasha NAT ku jira
- EU/GDPR u hogaansama deganaanshaha xogta marka lagu daro VPS-ka Yurub

### U Hogaansamista GDPR

- Xogta waxaa lagu kaydiyaa oo keliya server-yadaaga (ama VPS-ka Yurub ku yaal)
- Xuquuqda tirtirista: maamuluhu wuu nadiifin karaa diiwaanada gacanta, qoraallada, iyo log-ga
- Dhoofinta xogta sirta ah ee u hogaansama GDPR
- Ma jiro falanqayt ama raadraac dhinac saddexaad oo ku jira abka laftiisa

---

## Signal Notification Sidecar

`signal-notifier/` waxay ku shaqeysaa port 3100 sida geedi-socod gooni ah. Waa **eber-aqoon**: xiriirrada waxaa lagu xalliyaa aqoonsiyayaal HMAC-lahasheeyay — sidecar-ku marna kuma kaydiyo lambarrada taleefannada qoraalka cad. `SIGNAL_NOTIFIER_BEARER_TOKEN` la wadaago ayaa xaqiijiya abka weyn ee sidecar-ka.

---

## Borotokoolka & Codegen

Dhammaan noocyadu waxay ka yimaadaan il run ah:

- **Zod schemas** gudaha `packages/protocol/schemas/` waxay qeexaan dhammaan noocyada API iyo silaca
- **Codegen** (`bun run codegen`) wuxuu soo saaraa Swift Codable structs, Kotlin `@Serializable` data classes, iyo sawir OpenAPI
- **Calaamadaha sirta** gudaha `packages/protocol/crypto-labels.json` (57 xeer) waxay u soo saaraan TypeScript, Swift, iyo Kotlin — ma jiraan xarfo qoraal cad oo koodka sirta ku jira
- **i18n codegen** (`bun run i18n:codegen`) wuxuu soo saaraa iOS `.strings`, Android `strings.xml`, iyo Kotlin `I18n.kt` oo ka yimid faylasha JSON ee luqadda

Tan macneheedu waa isbeddel qaab-dhismeed ama borotokool ah si toos ah ayuu ugu faafiyaa dhammaan seddexda platform.
