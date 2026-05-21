---
title: Taybetmendî
subtitle: Her tiştê ku platformek bersivdana krizê hewce dike -- 8 pêşkêşkarên telefoniyê, 5 kanalên peyamên, şîfrekirina HPKE (RFC 9180), û sê sepên native ku crate-k kripto ya Rust-ê ya yekane û kontrolkirî parve dikin. Xweser li ser Bun + PostgreSQL, lihevhatî bi GDPR.
---

## Mîmarîya Ewlehiyê

Llámenos ji destpêkê ve hatiye sêwirandin da ku banger û xwebexşan li dijî dijminên bi darê xurt biparêze -- dewlet, komên rastgir, û saziyên istixbarata taybet. Her biryara kriptografîk meqseddar, hatiye belge kirin, û kontrolkirî ye.

**HPKE (RFC 9180) — X25519-HKDF-SHA256-AES256-GCM** — Heman standarda şîfrekirina hybrid ku di MLS (Messaging Layer Security) û TLS 1.3 de tê bikar anîn. Ew temamî ECIES-ya kevn (secp256k1) şûnve kir. RFC 9180 avakirinek bi awayekî fermî hatiye diyarkirin û ji hêla hevpeyman ve hatiye nirxandin, ne kompozîsyonek ad-hoc.

**Forward secrecy-ya nîşokê ya taybetî** -- Her nîşok kilîtek rasthatî ya taybetî bikar tîne, paşê ew kilît bi navgîniya HPKE ji bo her xwendevanek erêkirî (xwebexş û her rêveber) bi tenê tê wrap kirin. Tevlihevkirina kilîta veşartî ya xwendevanêk tiştek li ser nîşokên ku berî tevlihevkirinê hatine nivîsandin eşkere nake. Hiyerarîya kilîtê: Per-User Key (PUK) → items_key → kilîta naveroka nîşokê ya taybetî, bi nûvekirina tembel a pêçayî.

**Nîşokên du-car şîfrekirî** -- Her nîşok du car tê şîfre kirin: carek bi navgîniya HPKE ji bo xwebexşê ku nivîsandiye, carek ji bo her rêveber. Her du dikarin bi serbixwe veşêrin. Kesek din -- tevî server -- nikare plaintext bixwîne.

**57 labelên cuda yên cuda** -- Her operasyona kriptografîk rêzek kontekstê ya taybetî bikar tîne (parastina Albrecht). Tu du operasyon rêya derxistina kilîtê parve nakin, ku êrişên cross-protokolê asteng dike. Label di `packages/protocol/crypto-labels.json` de hatine diyarkirin û bi navgîniya codegen ji bo TypeScript, Swift, û Kotlin têne çêkirin. Di koda kriptografîk de tu carî stringên rast ne têne bikar anîn.

**Kilîtên Ed25519/X25519 yên per-amûr** -- Bikarhêner kilîtên per-amûr hene (ne kilîtek nasnameyê ya yekane). Amûrên nû bi navgîniya sigchain-ek Ed25519-îmzekirî, pêşveçûyî, hash-chained têne erêkirin. Girêdana amûran odayên provisioning-ê yên demkî yên ECDH bikar tînin ku piştî 5 deqîqan biqedin.

**Storage-a kilîtê ya şîfrekirî bi PIN** -- Kilîtên veşartî yên amûr bi 600,000 caran PBKDF2 + XChaCha20-Poly1305 berî storage têne şîfre kirin. Kilîta rast tenê di closure-ek bîrdankê de dimîne, li ser kilitkirinê zero. Ew tu carî sessionStorage, IndexedDB, an dîskê bi plaintext nagihîne.

**Storage-a ewle ya platformê-native** -- Desktop: Tauri Stronghold encrypted vault. iOS: iOS Keychain. Android: Android Keystore bi navgîniya EncryptedSharedPreferences.

**Tenê transkripsiyona aliyê xerîdar** -- Transkripsiyona bangê Whisper-a WASM (`@huggingface/transformers` ONNX runtime) bikar tîne ku bi tevahî di gerokê de dixebite. Deng bi navgîniya pipeline-ek AudioWorklet ring buffer → Web Worker li herêmî tê pêvajoy kirin. Deng tu carî serverê nagihîne -- tevî bi formaya şîfrekirî jî.

**SFrame voice E2EE** -- Kanalên medya yên şîfrekirî bi karanîna SFrame (RFC 9605) bi derxistina kilîtê ya ku di crate-k kripto ya Rust-ê ya hevbeş de hatiye entegre kirin.

**Crate-k kripto ya Rust-ê ya hevbeş** -- Pêkanînek kontrolkirî ya yekane di `packages/crypto/` de ku ji bo sê hedefan tê berhevkirin: native (Tauri desktop), WASM (gerok bi navgîniya `@tauri-apps/api`), û UniFFI (iOS XCFramework + Android JNI). Ne sê pêkanînên cuda ku dikarin ji hev cuda bibin.

**Log-a kontrolê ya hash-chained** -- Her bangê hatiye bersivandin, nîşok hatiye çêkirin, peyam hatiye şandin, mîheng hatiye guhertin, û kiryara rêveberiyê bi zincîra SHA-256 (`previousEntryHash` + `entryHash`) ji bo kifşkirina guhartinê tê tomar kirin. Rêveber dikarin bêyî-guhartiya zincîrê piştrast bikin.

**Avakirinên dubare** -- `Dockerfile.build` bi `SOURCE_DATE_EPOCH`, navên pelên bi hash-ê naverokê. SLSA provenance, SBOM, û îmzekirina cosign li ser her release. Her avakirin dikare byte-bi-byte li hemberî `CHECKSUMS.txt` di GitHub Releases de bi karanîna `scripts/verify-build.sh` were verast kirin.

---

## Telefonî -- 8 Pêşkêşkar

**Ji bo piraniya platforman ku we di yek pêşkêşkar de digirin**, Llámenos rûyek `TelephonyAdapter` bi 8 pêkanînên temam pêk tîne. Pêşkêşkar bi navgîniya UI-ya rêveberiyê biguherin -- tu guhertina kodê, tu rawestandina xebatê.

### Pêşkêşkarên Cloud (6)

- **Twilio** -- WebRTC-a tevahî, dengê bernamekirî, SIP trunking
- **SignalWire** -- API-ya bi Twilio re hevgirtî, lêçûna kêmtir, piştgirîya WebRTC
- **Vonage** (Nexmo) -- Vebijarka cihê daneyan ya Ewropî
- **Plivo** -- Bi lêçûna kêmtir, berfirehbûna cîhanî
- **Telnyx** -- Bihayên pêşbazî, entegrasyona Mission Control Portal
- **Bandwidth** -- Kalîteya pargîdanî, pêbaweriya US carrier-grade

### SIP-a Xweser (2)

- **Asterisk** -- Bi navgîniya ARI (Asterisk REST Interface). Kontrola bangê ya tevahî, IVR, tomarkirin.
- **FreeSWITCH** -- Bi navgîniya ESL (Event Socket Library). Bilind-performans, qabîliyeta konferansê.

Her du kelasa bingehîn `SipBridgeAdapter` bi guhertoya hawirdorê `PBX_TYPE` backend hilbijêre. Kamailio wekî asta proxy-a SIP tê piştgirî kirin. **Tu tomarên bangê serverê terk nakin.**

### Rêveberiya Bangê

**Dengê parallel** -- Dema ku banger biqeyd dibe, her xwebexşek li ser şevê, ne-bizî bi heman demê deng dike. Yekem bersiv qezenc dike; yên din bi rasterast radiwestin. Tu bang ji ber nêçîra rêzokî neyê winda kirin.

**Bernameya li ser bingeha şevê** -- Şevên dubare bi roj û demjimêrên taybetî biafirînin. Xwebexşan erê bikin. Pergal bi xweber bangên di navbera kesên li ser şevê de rêve dibe. Komika fallback a dengê heke tu bername nehatibe diyarkirin.

**Rêz bi muzîka bihîstinê** -- Heke hemû xwebexş bizîn bin, bangeran dikevin rêzek bi muzîka bihîstinê ya mîhengkirî. Dema betilandinê mîhengkirî ye (30-300 saniye). Heke bê bersiv, diçe peyama dengî.

**Peyama dengî ya fallback** -- Banger dikarin peyamek dengî bihêlin (heta 5 deqîqe). Peyamên dengî bi navgîniya Whisper-a aliyê xerîdar têne transkripsiyon kirin û ji bo nirxandina rêveber şîfrekirî ne.

**Bangên gerokê WebRTC** -- Xwebexş bangên bi rasterast di gerokê de bêyî telefon bersiv dikin. Çêkirina tokena WebRTC ya taybetî ji bo Twilio, SignalWire, Vonage, û Plivo.

**Spam mitigation** -- Voice CAPTCHA (têketina 4-rəqəmlî ya klavyeyê ya rasthatî), sînorkirina rêjeyê ya per-telefon bi pencereya sliding-window, û lîsteyên qedexe yên dem-rast. Rêveber her kontrol bi serbixwe bêyî rawestandina xebatê toggle dikin. Promptên IVR-ê yên xweser bi alternatîfa TTS.

---

## Peyam -- 5 Kanal

Hemû kanal modela dîalogê ya şîfrekirî ya yekbûyî parve dikin. Her peyama hatî bi navgîniya HPKE li ser wergirtina webhook şîfre dibe; server plaintext bi rasterast jê dide.

### Signal

Entegrasyona herî temam a ne-Twilio. Adaptera Signal vê dihewîne:

- Şandin/wergirtina tevahî bi receiptên radestkirinê
- Receiptên xwendinê û nîşanên nivîsandinê
- Reaksiyon û threading-a bersivê
- Qeydkirin û girêdan bi navgîniya bridge-a signal-cli-rest-api
- Verastkirina baweriya nasnameyê û rêveberiya hejmara ewlehiyê
- Rêza retry bi exponential backoff
- Failover ji bo veguhastina alternatîf dema ku bridge têk biçe
- Transkripsiyona peyama dengî bi navgîniya Whisper-a aliyê xerîdar
- Çavdêriya tenduristiyê bi jêbûna bi rûmet

### WhatsApp Business

- Meta Cloud API (Graph API v21.0)
- Piştgirîya peyama şablonê ji bo lihevhatina pencereya 24-saatî
- Peyamên medya: wêne, belge, deng, vîdeo
- Erêkirina îmaza webhook
- Receiptên xwendinê û statûya radestkirinê

### SMS

- Hatî û çûyî bi navgîniya Twilio, SignalWire, Vonage, an Plivo
- Bersiva otomatîk bi peyamên xêrhatina mîhengkirî ji bo her ziman
- Piştgirîya MMS li ku derê berdest be
- Erêkirina îmaza webhook ji bo her pêşkêşkar

### Telegram

- Telegram Bot API
- Piştgirîya medya: wêne, belge, peyamên dengî
- Klavyeyên inline û reply markup
- Moda webhook an polling

### RCS (Rich Communication Services)

- Google RBM (Rich Business Messaging) API
- Kartên dewlemend, kiryarên pêşniyazkirî, û carousels
- Receiptên radestkirinê û xwendinê
- Fallback ji bo SMS li ku derê RCS ne berdest be

### Blast/Broadcast

Rêza radestkirinê ya li ser bingeha PostgreSQL ji bo peyamên bulk:

- Sînorkirina rêjeyê ya per-kanal (sînorên pêşkêşkar rêz dike)
- Şandinên plankirî bi piştgirîya timezone
- Şopandina statûya per-wergir (li rêzê, şandin, radestkirin, têkstûr)
- Lojîka retry bi rêza mirî-çûyî
- Radestkirina batch bi mezinahiya batch-ê ya mîhengkirî
- Dashboard-a rêveberiyê ku pêşveçûna radestkirinê di dem-rast de nîşan dide

---

## Pir-Platform -- Sê Sepên Native, Crate-k Kripto

Piraniya platforman sepaneke web bi wrapper-ek native ya tenik radest dikin. Llámenos sê serîlêdanên bi tevahî native radest dike ku pêkanînek kontrolkirî ya kripto ya Rust-ê ya yekane parve dikin.

### Desktop (Tauri v2)

- Binaryên native ji bo Windows, macOS, Linux
- Tauri Stronghold encrypted vault ji bo storage-a kilîtê
- Tray-a pergala native bi nîşana bangê hatî
- Nûvekirinên otomatîk bi navgîniya nûvekera Tauri
- Ferzkirina instance-ya yekane
- Parastina îzolasyonê + Siyaseta Naveroka Ewle
- Hemû operasyonên kripto bi navgîniya IPC ya Rust-ê têne rêvebirin -- kilîtên veşartî tu carî webview nagihin
- Moda avakirina PLAYWRIGHT_TEST ji bo testên E2E bi mock layer-a IPC

### iOS (SwiftUI)

- Native SwiftUI, iOS 17+ bi `@Observable`
- Kilît di iOS Keychain de têne tomar kirin
- Kripto ya Rust bi navgîniya UniFFI XCFramework (`LlamenosCoreFFI`)
- XCTest + XCUITest ji bo testên yekî û entegrasyonê
- Hişyariyên push bi navgîniya APNs bi payloads-ên şîfrekirî
- Pir-hub: rêveberên paşnavê tu carî li ser statûya hub-a çalak nabin

### Android (Kotlin/Compose)

- Native Kotlin 2.3 bi Jetpack Compose, Material 3
- minSdk 26, AGP 9.1, Gradle 9.4
- Kilît di Android Keystore de bi navgîniya EncryptedSharedPreferences
- Kripto ya Rust bi navgîniya pirtûkxaneya parvekirî ya JNI (`.so` ji heman crate-k Rust)
- Hilt dependency injection + KSP annotation processing
- Testên UI-ê Compose + testên E2E-yê Cucumber BDD
- Pir-hub: nûvekirina ViewModel-ê per-hub, caching-a kilîta hub, rêveberiya WebSocket

### Crate-k Kripto ya Rust-ê ya Hevbeş

`packages/crypto/` vê pêk tîne:

- HPKE (RFC 9180): X25519-HKDF-SHA256-AES256-GCM
- Îmazên Ed25519 (BIP-340 Schnorr ji bo lihevhatina WebSocket)
- Peymana kilîtê X25519
- Derxistina kilîtê PBKDF2 (600K caran)
- HKDF (RFC 5869)
- Şîfrekirina authenticated XChaCha20-Poly1305
- SFrame (RFC 9605) voice E2EE
- MLS (Messaging Layer Security) bi navgîniya OpenMLS -- li paş alamara taybetmendiyê `mls`
- Scaffolding-a UniFFI ji bo bindings-ên iOS/Android
- Berhevkirina WASM ji bo karanîna gerok

---

## Rêveberiya Dozê

Llámenos bi tu senaryoyekî taybetî ve ne hatiye kodandin. Her tişt bi şablonê tê rêvebirin.

**Sîstema şablonê ya hêlînan** -- Rêveber cureyên hêlînan diyar dikin (têkiliyek, doz, rapor, bûyer), zeviyên xweser (nivîs, hejmar, hilbijartin, checkbox, textarea, roj, pel), û cureyên raporê per hub. Şablon hemû form û dîmenan rêve dibe. Tu guhertina kodê ji bo mîhengkirina workflow-ek nû pêwîst nîne.

**Cureyên raporên xweser** -- Şablon `reportTypes[]` bi zeviyên xweser ên per-cure, `allowCaseConversion`, û alamarên `mobileOptimized` diyar dike. Cureyên raporê bi tevahî ji cureyên hêlînan cuda ne.

**Lêgerîna encrypted blind-index** -- Tomar şîfrekirî têne tomar kirin, lê zeviyên HMAC-indexed lêgerîna aliyê serverê bêyî eşkerekirina plaintext-ê destûr didin. Index li gorî hub têne sînorkirin û tu carî sînorên hub-ê derbas nakin.

**Têkiliyek û têkiliyek** -- Pirtûkxaneya têkiliyek bi grafîka têkiliyek. Têkiliyan bi dozan, bûyeran, û delîlan girêbidin. Têkiliyên curekirî ne (mînak, "şahid e", "çavdêrê qanûnî ye") û per şablon mîhengkirî ne.

**Rêveberiya delîlan** -- Pelan bi dozan girêbidin. Pel berî barkirinê têne şîfre kirin (HPKE-wrapped ji bo her xwendevanek erêkirî). Zincîra parastina delîlan di log-a kontrolê de tê tomar kirin.

**RBAC** -- Kontrola gihiştina li ser bingeha rol: Xwebexş (tenê nîşokên xwe), Rêveber (hemû daney), Raporter (tenê şandin). Rolên xweser per şablon. Rêveber nikarin nîşokên tenê-xwebexş bibînin.

**Pir-hub** -- Sazkirek Llamenos-ê pir hub-ên serbixwe (sazî, rêz, an senaryoyên karanînê) xizmet dike. Her bikarhêner dikare bi heman demê endamê pir hub-an be. Bangên hatî, hişyariyek, û bûyerên relay ji hemû hub-ên endamê her dem çalak in -- ne li ser bingeba ku kîjan hub niha tê nîşandan.

---

## Erêkirin û Rêveberiya Kilîtê

**Keypair-ên WebSocket** -- Bikarhêner bi keypair-ên Ed25519-ê yên lihevhatî bi WebSocket erê dibin. Erêkirina îmaza BIP-340 Schnorr. Tu şîfre, tu navnîşana e-nameyê ji bo erêkirinê pêwîst nîne.

**Passkey-ên WebAuthn** -- Piştgirîya passkey-ê ya bijarte ji bo têketina pir-amûrî. Kilîtek ewlehiya hardware an jî biometrîka platformê tomar bikin, paşê bêyî ku PIN binivîsin têkevin.

**Sigchain-a bikarhêner** -- Tomarên erêkirina amûrê yên pêşveçûyî, hash-chained. Her tomar bi kilîta Ed25519 ya amûra erêkirinê tê îmze kirin. Dîrokek kriptografîk ya kîjan amûr ji bo kîjan bikarhêner hatine erêkirin peyda dike.

**Nûvekirina PUK-ê ya pêçayî** -- Per-User Key (PUK) → items_key → kilîta naveroka nîşokê ya taybetî. Dema ku amûrek were betalkirin an jî bikarhêner PIN-a xwe biguherîne, kilîtên bandor bi awayekî tembel têne nûve kirin -- tenê dema ku têne gihiştin re-şîfrekirî ne, ne wekî operasyonek batch.

**Provisioninga amûrê** -- Amûrên nû bêyî eşkerekirina kilîta veşartî girêbidin. Kod-ek QR-ê bişopînin an jî kodek provizyona kurt têkevin. Bi navgîniya guhertoyek ECDH-ê ya demkî. Odeyên provisioning piştî 5 deqîqan biqedin.

**Kilîtên vegerê** -- Di dema onboarding-ê de, kilîtek vegerê ya bi formata Base32 (entropy-ê 128-bit) tê çêkirin. Daxistina backup-ê ya mecbûrî ya şîfrekirî berî berdewamkirinê. Ev tenê rêya vegerê ye -- tu vegera rêveber, bi sêwirandinê.

**Kilîtkirina otomatîk** -- Rêvebera kilîtê bi xweber li ser dema betilandinê an dema ku taba gerokê veşartî ye kilît dike. Dema betilandinê ya mîhengkirî. Ji bo vekirinê dîsa PIN têkevin.

**Modela danişînê** -- Du-ast: "erêkirî lê kilîtkirî" (tenê tokena danişînê, dîmenên tenê-xwendin) li dijî "erêkirî û vekirî" (PIN hatiye têketin, gihiştina kripto ya tevahî). Tokenên danişînê yên 8-saet bi hişyariyên dema betilandinê.

---

## Înfrastruktura Dem-Rast

**WebSocket relay** -- WebSocket relay relay xweser (an Nosflare li ser Cloudflare) ji bo belavkirina bûyerên dem-rast. Hemû naveroka bûyerê bi kilîta hub tê şîfre kirin. Tag-ên giştî (`["t", "llamenos:event"]`) asteng dikin ku relay li asta metadata nikaribe cureyên bûyerê ji hev cuda bike.

**Kilîta hub** -- 32 byteyên rasthatî (`crypto.getRandomValues`), bi navgîniya HPKE ji bo her endamê hub bi tenê tê wrap kirin bi navgîniya `LABEL_HUB_KEY_WRAP`. Dema ku endamek derdikeve tê nûve kirin -- endamên derketî nikarin bûyerên pêşerojê veşêrin.

**WebSocket** -- Statûya bangê dem-rast, berdestiya xwebexş, nûvekirinên dîalogê, û çavdêriya rêveberiyê bi navgîniya WebSocket. Bi exponential backoff dîsa girêdide.

**Sync-a dem-rast a WebSocket** -- Bûyerên demkî yên cureyê 20001 ji bo hevsengkirina statûya cross-amûr û cross-hub. Naverok şîfrekirî ye; relay nikare cureyên bûyerê ji hev cuda bike.

---

## Tecrûbeya Rêveber û Xwebexş

**Sihêrbara sazkirinê** -- Rêveberiya gav-bi-gav dema têketina yekem a rêveber. Kanalan hilbijêrin, pêşkêşkaran mîheng bikin, navê hotline saz bikin. Keypair-a hub-ê ya destpêkê çêdike û kilîta hub-ê ji bo rêveberê yekem belav dike.

**Lîsteya kontrola Getting Started** -- Widget-a dashboard-ê ku pêşveçûna sazkirinê şop dike: mîhengkirina kanalê, onboarding-a xwebexş, çêkirina şevê.

**Çavdêriya dem-rast** -- Bangên çalak, bangerên li rêzê, dîalog, û statûya xwebexş bi navgîniya WebSocket di dem-rast de nûve dibin.

**Paletteya fermanê** -- Ctrl+K (an Cmd+K) ji bo navîgasyona bilez, lêgerîn, çêkirina nîşokê ya bilez, û guhertina temayê. Fermanên tenê-rêveber li gorî rolê têne parzûn kirin.

**Berdestiya xwebexş** -- Rêveber hejmarên online/offline/li ser betilandinê yên dem-rast dibînin. Xwebexş bişkojek betilandinê toggle dikin da ku bangên hatî bêyî ku şevê biterikînin rawestînin.

**Kurtefîlmên klavyeyê** -- `?` bikirtînin ji bo hemû kurtefîlman. Rûpelan bişopînin, paletteya fermanê vekin, kiryarên hevpar bêyî mişk.

**Temayên tarî/rûnî** -- Şopandina pergalê, tarî, an rûnî. Ji bo her danişînê tê bihêtin.

**Derxistina daneyan a lihevhatî bi GDPR** -- Nîşokan wekî pel-ek şîfrekirî ya lihevhatî bi GDPR (`.enc`) derxînin. Tenê nivîskarê orjînal dikare veşêre.

---

## Navneteweyîbûn

**13 zimanên avakirî** -- English, Spanish (Español), Chinese (中文), Tagalog, Vietnamese (Tiếng Việt), Arabic (العربية, RTL), French (Français), Haitian Creole (Kreyòl Ayisyen), Korean (한국어), Russian (Русский), Hindi (हिन्दी), Portuguese (Português), German (Deutsch).

**Pipeline-a codegen** -- Yek çavkaniya rastîn di pelên locale-ê yên JSON de iOS `.strings`, Android `strings.xml`, û Kotlin `I18n.kt` çêdike -- tu hevdemkirina destan. Ji hêla `bun run i18n:validate:all` ve tê erêkirin.

**Piştgirîya RTL** -- Layout-a Erebî bi rastî di moda RTL de tê xuyang kirin bi navîgasyona vajokirî, rêzkirina nivîsê ya sererastkirî, û rêveberiya nivîsa bidirectional.

**Promptên IVR-ê yên xweser per ziman** -- Dengê bangeran ji bo her zimanê ku bangerên we bikar tînin tomar bikin. Dema ku tomar tune be, bi text-to-speech ve dibe alternatîf.

---

## Sazkirin

### Docker Compose (Serverek Yekane)

- Pergala tevahî: Bun HTTP server, PostgreSQL, RustFS (storage-a objekt), WebSocket relay (WebSocket relay)
- Profîlên bijarte: `--profile signal` (sidecar-a signal-cli), `--profile telephony` (Kamailio + CoTURN), `--profile inference` (ajana firehose-ê ya LLM), `--profile monitoring` (Prometheus + Grafana)
- `docker-compose.dev.yml` ji bo pêşvebirinê ya herêmî bi şopandina pel
- `docker-compose.production.yml` overlay ji bo zehfkirina hilberînê

### Kubernetes (Helm)

- Chart-a Helm ya hilberînê bi replîkayên mîhengkirî
- Probes-ên tenduristiyê: `/health/ready` û `/health/live`
- Prometheus ServiceMonitor ji bo scraping-a metrîkan
- Caddyfile.production bi HSTS, CSP, û header-ên ewlehiyê
- Playbook-ên Ansible preflight + smoke-check ji bo erêkirina berî-sazkirinê

### Co-op Cloud

- Reçete ji bo sazkirinên Co-op Cloud
- Ji bo kooperatîfên karker û saziyên civakê ku înfrastruktura xwe bi xwe bi rê ve dibin hatiye sêwirandin

### Cloudflare Tunnels

- Ingress bi navgîniya Cloudflare Tunnels -- tu portên inbound-ê yên vekirî pêwîst nînin
- Lihevhatî bi serverên xweser li paş NAT
- Cihê daneyan a lihevhatî bi GDPR dema ku bi VPS-ya YE-ê ya mêvandarkirî were kombin kirin

### Lihevhatina GDPR

- Daney tenê li ser serverên we (an VPS-ya YE-ê ya mêvandarkirî) têne tomar kirin
- Mafê jêbirinê: rêveber dikarin tomarên banger, nîşok, û logan paqij bikin
- Derxistina daneyan a şîfrekirî ya lihevhatî bi GDPR
- Tu analîtîk an şopandina aliyê sêyem li ser sepê xwe

---

## Sidecar-a Hişyariya Signal

`signal-notifier/` li ser port 3100 wekî pêvajoyek cuda dixebite. Ew **zero-knowledge** ye: têkiliyek bi navgîniya nasnameyên HMAC-hashed têne çareser kirin -- sidecar tu carî hejmarên telefonê yên plaintext tomar nake. `SIGNAL_NOTIFIER_BEARER_TOKEN` ya hevbeş sepanê bi sidecar erê dike.

---

## Protokol û Codegen

Hemû cureyek ji yek çavkaniya rastîn têne:

- **Skêmên Zod** di `packages/protocol/schemas/` de hemû cureyên API û wire diyar dikin
- **Codegen** (`bun run codegen`) struct-ên Swift Codable, data class-ên Kotlin `@Serializable`, û snapshot-ek OpenAPI çêdike
- **Labelên kripto** di `packages/protocol/crypto-labels.json` de (57 sabît) ji bo TypeScript, Swift, û Kotlin têne çêkirin -- tu stringên rast di koda kripto de
- **i18n codegen** (`bun run i18n:codegen`) iOS `.strings`, Android `strings.xml`, û Kotlin `I18n.kt` ji pelên locale-ê yên JSON çêdike

Ev tê vê wateyê ku guhertinek skema an protokolê bi xweber ber bi sê platforman jî diherike.
