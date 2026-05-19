---
title: Seguridad at Privacy
subtitle: Ano ang protektado, ano ang nakikita, at ano ang maaaring makuha sa pamamagitan ng subpoena — inorganisa ayon sa mga feature na ginagamit mo.
---

## Kung ang iyong hosting provider ay makatanggap ng subpoena

| Maaari nilang ibigay | HINDI nila maaaring ibigay |
|---------------------|---------------------------|
| Call/mensahe metadata (oras, tagal) | Nilalaman ng tala, transkripsyon, katawan ng ulat |
| Naka-encrypt na database blobs | Mga pangalan ng boluntaryo (end-to-end na naka-encrypt) |
| Kung aling mga account ng boluntaryo ang aktibo noong kailan | Mga rekord ng contact directory (end-to-end na naka-encrypt) |
| Mga rekord ng paghahatid ng mass message | Nilalaman ng mensahe (naka-encrypt sa pagdating, nakaimbak bilang ciphertext) |
| | Mga decryption key (protektado ng iyong PIN, identity provider, at opsyonal na hardware security key) |
| | Mga encryption key bawat tala (pansamantala — nilipol pagkatapos ng pag-wrap) |
| | Ang iyong HMAC secret para sa pag-reverse ng mga phone hash |
| | Nilalaman ng mga recovery fragment (naka-encrypt, hindi mababasa ng server) |

**Nag-iimbak ang server ng data na hindi nito mababasa.** Ang metadata (kailan, gaano katagal, aling mga account) ay makikita. Ang nilalaman (ano ang sinabi, ano ang isinulat, sino ang iyong mga contact) ay hindi.

---

## Ayon sa feature

Ang iyong privacy exposure ay depende sa kung aling mga channel ang iyong pinagana:

### Mga voice call

| Kung ginagamit mo... | Maaaring i-access ng mga third party | Maaaring i-access ng server | End-to-end na naka-encrypt na nilalaman |
|---------------------|-------------------------------------|----------------------------|----------------------------------------|
| Twilio/SignalWire/Vonage/Plivo | Call audio (live), mga rekord | Call metadata | Mga tala, transkripsyon |
| Self-hosted na Asterisk | Wala (ikaw ang kumokontrol) | Call metadata | Mga tala, transkripsyon |
| Browser-to-browser (WebRTC) | Wala | Call metadata | Mga tala, transkripsyon |

**Subpoena sa telephony provider**: Mayroon silang mga detalyadong rekord ng tawag (oras, numero, tagal). WALA silang mga tala ng tawag o transkripsyon. Ang recording ay disabled bilang default.

**Transkripsyon**: Ang transkripsyon ay nangyayari nang buo sa iyong browser gamit ang lokal na AI. **Ang audio ay hindi kailanman umaalis sa iyong device.**

### Text messaging (isa-isa)

| Channel | Access ng provider | Imbakan ng server | Mga tala |
|---------|-------------------|------------------|---------|
| SMS | Binabasa ng iyong phone provider ang lahat ng mensahe | **Naka-encrypt** | Pinapanatili ng provider ang mga orihinal na mensahe |
| WhatsApp | Binabasa ng Meta ang lahat ng mensahe | **Naka-encrypt** | Pinapanatili ng provider ang mga orihinal na mensahe |
| Signal | Ang Signal network ay E2EE; ang bridge ay muling nag-e-encrypt sa pagdating | **Naka-encrypt** | Piniling ruta kapag available |

**Signal-first routing**: Kapag may Signal ang tatanggap, ang mga mensahe ay awtomatikong niru-route sa pamamagitan ng Signal. Para sa SMS, isang generic na abiso lamang ang ipinapadala bilang default (walang katawan ng mensahe).

**Ang mga mensahe ay naka-encrypt sa sandaling dumating sa iyong server.** Ang server ay nag-iimbak lamang ng ciphertext.

### Bulk at broadcast na mga mensahe

Maaaring magpadala ang mga admin ng bulk na mensahe sa mga subscriber sa pamamagitan ng SMS, WhatsApp, Signal, o RCS.

**Mahalaga: ang mga papalabas na bulk na mensahe ay HINDI end-to-end na naka-encrypt sa server.** Para maihatid ang mensahe sa mga subscriber ng SMS o WhatsApp, ang server ay kailangang pansamantalang iproseso ang nilalaman sa plaintext at ipasa ito sa messaging provider.

| Channel | Access ng server sa pagpapadala | Access ng provider | Pagkatapos ng paghahatid |
|---------|--------------------------------|--------------------|--------------------------|
| SMS bulk | Plaintext (pansamantala, para sa paghahatid) | Buong nilalaman | Pinapanatili ng provider |
| WhatsApp bulk | Plaintext (pansamantala, para sa paghahatid) | Buong nilalaman (Meta) | Pinapanatili ng provider |
| Signal bulk | Plaintext (pansamantala, para sa paghahatid) | E2EE sa pamamagitan ng Signal network | Hindi pinapanatili ng provider |
| RCS bulk | Plaintext (pansamantala, para sa paghahatid) | Maaaring makita ng Google ang nilalaman | Pinapanatili ng provider |

**Ano ang ibig sabihin nito**: Ang mga bulk na mensahe ay hindi dapat maglaman ng sensitibong impormasyon ng tatawag. Gamitin ang mga ito para sa mga anunsyo at abiso — hindi para sa mga detalye ng kaso.

Ang mga numero ng telepono ng subscriber ay nakaimbak bilang mga hashed na identifier — ang iyong database ay hindi kailanman naglalaman ng plaintext na listahan ng subscriber.

### Mga tala, transkripsyon, at ulat

Lahat ng nilalaman na isinulat ng mga boluntaryo ay end-to-end na naka-encrypt:

- Ang bawat tala ay gumagamit ng **natatanging random na key** (forward secrecy — ang pagkompromiso sa isang tala ay hindi nakompromiso ang iba)
- Ang mga key ay nakabalot nang hiwalay para sa boluntaryo at bawat admin
- Ang server ay nag-iimbak lamang ng ciphertext
- Ang pag-decrypt ay nangyayari sa iyong device, sa isang secure na layer na hindi kailanman nagbubunyag ng mga key sa interface ng app
- **Ang mga custom field, nilalaman ng ulat, at mga file attachment ay lahat naka-encrypt nang isa-isa**

**Mga rekord ng kaso at data ng entity**: Sumusunod sa parehong modelo ng encryption — ang bawat item ay naka-encrypt ng natatanging key.

**Pagkumpiska ng device**: Nang walang iyong PIN **at** access sa iyong identity provider account, ang mga umaatake ay nakakakuha ng naka-encrypt na blob na protektado ng Argon2id. Sa isang hardware security key, **tatlong independent na factor** ang nagpoprotekta sa iyong data.

---

## Ang iyong mga device

### Tingnan at bawiin ang mga device

Pinapanatili ng app ang isang listahan ng bawat device na naka-log in ka. Maaari mong tingnan ang listahang ito at bawiin ang anumang device na hindi mo nakikilala.

**Kapag binawi mo ang isang device:**
- Ang device na iyon ay agad na naba-block mula sa pag-access sa iyong account
- Ang iyong mga encryption key ay inuulit para hindi ma-decrypt ng binawing device ang mga nilalaman sa hinaharap
- Ang pagbawi ay naitala sa kasaysayan ng seguridad ng iyong account

### SAS emoji verification

Para sa mga organisasyon na may mataas na pangangailangan sa seguridad, maaaring i-verify ng mga admin ang pagkakakilanlan ng isang device gamit ang SAS (Short Authentication String) na verification — ipinapakita bilang isang pagkakasunud-sunod ng 7 emoji.

**Paano ito gumagana:**
1. Ang admin at ang may-ari ng device ay nagkukumpara ng kanilang mga pagkakasunud-sunod ng emoji (personal, sa telepono, o sa pamamagitan ng pinagkakatiwalaang channel)
2. Kung ang mga emoji ay magkakatugma, ang device ay nakumpirma bilang pag-aari ng nakarehistrong may-ari nito
3. Ang pag-verify ay naitala — maaaring makita ng mga admin kung aling mga device ang na-verify

Pinangangalagaan nito laban sa isang umaatake na nagrehistro ng pekeng device sa ilalim ng account ng ibang tao.

---

## Pagtanggal ng account

### Self-service na pagtanggal

Maaari kang humiling ng permanenteng pagtanggal ng iyong account at lahat ng nauugnay na data. Bilang default, mayroong pagkaantala (ini-configure ng iyong hub admin, karaniwang 72 oras) bago makumpleto ang pagtanggal — nagbibigay ito sa iyo ng oras para kanselahin kung ang kahilingan ay ginawa sa ilalim ng pamimilit.

**Ang tinatanggal:**
- Ang iyong mga device key (ginagawang permanenteng hindi mababasa ang lahat ng naka-encrypt na nilalaman, kahit mula sa mga backup)
- Ang iyong rekord ng account, mga takdang papel, at kasaysayan ng shift
- Ang iyong mga push notification token

**Ano ang mangyayari sa mga naka-encrypt na nilalaman na iyong nilikha**: Ang mga tala at ulat na iyong isinulat ay muling naka-encrypt para sa mga natitirang awtorisadong mambabasa. Ang iyong kopya ng decryption key ay nililipol.

**Mga audit log**: Ang iyong mga entry sa audit log ay "crypto-destroyed" — ang per-user encryption key ay nililipol, na ginagawang hindi mababasa ang iyong mga entry. Ang hash chain ay nananatiling buo.

### Emergency na pagtanggal

Kung naniniwala kang ang iyong account ay nasa agarang panganib, maaari kang humiling ng emergency na pagtanggal na may co-approver — binabawasan ang pagkaantala sa minimum na 4 na oras. Ang minimum na 4 na oras ay umiiral upang maprotektahan laban sa sapilitang pagtanggal.

---

## Mga recovery group

Kung mawawala mo ang lahat ng iyong mga device, karaniwan kang mawawalan ng access sa lahat ng iyong naka-encrypt na data. Nilulutas ng mga recovery group ang problemang ito.

### Paano gumagana ang recovery

Nagtatalagang isang grupo ng mga pinagkakatiwalaang contact (karaniwang 3-5 tao) bilang iyong recovery group. Ang bawat contact ay nagtataglay ng isang "piraso" ng isang recovery key.

**Para mabawi ang iyong account:**
1. Nagrerehistro ka ng bagong device at nagpapasimula ng kahilingan sa recovery
2. Ang iyong mga recovery contact ay nakakatanggap ng abiso
3. Pagkatapos ng nako-configure na pagkaantala, isang threshold na bilang ng mga contact (hal., 2 sa 3) ang pumipirma sa kahilingan
4. Ang bawat approving contact ay nagpapadala ng kanilang piraso, direktang naka-encrypt sa iyong bagong device
5. Pinagsasama ng iyong bagong device ang mga piraso upang mabuo muli ang recovery key

**Ano ang makikita ng server**: Nagre-relay ang server ng mga naka-encrypt na piraso sa pagitan ng mga device. Hindi nito mababasa ang mga piraso at hindi nito mabubuo muli ang recovery key nang mag-isa.

### Mga katangian ng seguridad ng mga recovery group

- **Threshold security**: Ang mga piraso sa ibaba ng threshold ay walang ibubunyag tungkol sa secret
- **Walang partisipasyon ng server sa secret**: Ang mga piraso ay direktang naka-encrypt sa public key ng iyong bagong device
- **Hub scope**: Ibinabalik ng recovery ang iyong access sa isang partikular na hub
- **Cancellable delay**: Maaari kang kanselahin ang isang kahilingan sa recovery sa panahon ng pagkaantala
- **Signal verification**: Ang mga kahilingan sa recovery ay na-verify sa pamamagitan ng Signal

---

## Privacy ng numero ng telepono ng boluntaryo

Kapag natanggap ng mga boluntaryo ang mga tawag sa kanilang personal na mga telepono, ang kanilang mga numero ay nalantad sa iyong telephony provider.

| Sitwasyon | Numero ng telepono na nakikita ng |
|-----------|----------------------------------|
| PSTN na tawag sa telepono ng boluntaryo | Telephony provider, carrier ng telepono |
| Browser-to-browser (WebRTC) | Walang sinuman (nananatili ang audio sa browser) |
| Self-hosted na Asterisk + SIP na telepono | Ang iyong Asterisk server lamang |

**Upang maprotektahan ang mga numero ng telepono ng boluntaryo**: Gumamit ng browser-based na pagtawag (WebRTC) o magbigay ng mga SIP na telepono na konektado sa self-hosted na Asterisk.

---

## Kamakailan lang na nailabas

Ang mga pagpapabuting ito ay available ngayon:

| Feature | Benepisyo sa privacy |
|---------|---------------------|
| Pamamahala ng device | Tingnan at bawiin ang anumang naka-log in na device; ang pagbawi ay nagti-trigger ng key rotation |
| SAS emoji device verification | Maaaring i-verify ng mga admin ang mga device nang personal gamit ang 7-emoji na cryptographic fingerprint |
| Pagtanggal ng account na may pagkaantala | Humingi ng pagtanggal; ang nako-configure na pagkaantala ay nagbibigay-daan sa pagkansela sa ilalim ng pamimilit |
| Emergency na pagtanggal | Mabilis na co-approved na pagtanggal na may minimum na 4 na oras |
| Crypto-destruction sa pagtanggal | Ang mga encryption key ay nililipol muna, na ginagawang permanenteng hindi mababasa ang nilalaman |
| Mga recovery group (Shamir) | Magtalagang mga pinagkakatiwalaang contact na makakatulong sa pag-recover kung mawala ang lahat ng device |
| Bulk messaging na may tapat na disclosure | Maaaring magpadala ng bulk na mensahe ang mga admin; pansamantalang pinoproseso ng server ang plaintext para sa paghahatid |
| Pag-hash ng subscriber | Ang mga numero ng telepono ng subscriber ay nakaimbak bilang hashed na identifier |
| Proteksyon ng key ng Argon2id | Ang mga device key ay protektado ng memory-intensive na function |
| Signal-first routing | Ang mga mensahe ay awtomatikong niru-route sa pamamagitan ng Signal kapag available |
| SMS notification-only mode | Ang mga tatanggap ng SMS ay nakakakita lamang ng "mayroon kang bagong mensahe" |
| Paglaban sa traffic analysis | Ang mga sukat ng event ay nilalagyan ng padding para hindi makilala ng mga observer |
| Walang plaintext na numero ng telepono sa database | Ang mga numero ng tumatawag ay nakaimbak bilang mga hindi mababaligtad na hash |
| Bawat-hub encryption na may forward secrecy | Ang mga key ay inuulit tuwing 24 na oras |
| Cryptography sa Rust sa lahat ng platform | Ang parehong na-audit na Rust cryptography library sa desktop, iOS, at Android |
| Limitadong relay access | Ang WebSocket relay ay tumatanggap ng mga event mula sa iyong server lamang |
| Naka-encrypt na imbakan ng mensahe | Ang SMS, WhatsApp, at Signal ay nakaimbak bilang ciphertext |
| Transkripsyon sa device | Ang audio ay hindi kailanman umaalis sa iyong device |
| Multi-factor na proteksyon ng key | PIN, identity provider, at opsyonal na hardware security key |
| Mga hardware security key | Ikatlong factor na hindi maaaring maikompromiso nang malayuan |
| Mga reproducible build | I-verify na ang naka-deploy na code ay tumutugma sa pampublikong source |
| Naka-encrypt na contact directory | Ang mga rekord ng contact, relasyon, at tala ay end-to-end na naka-encrypt |

## Planado pa

| Feature | Benepisyo sa privacy | Katayuan |
|---------|---------------------|---------|
| Mga native na app sa pagtanggap ng tawag | Walang personal na numero ng telepono na nalantad | Sa pag-unlad |
| Certificate pinning (mobile) | Depensa laban sa TLS interception ng rogue CA | Kumpleto ang scaffolding; mga pin ay nakabinbin |
| SFrame voice media encryption | End-to-end na naka-encrypt na mga voice call | Kumpleto ang key derivation; naplanong per-frame encryption |

---

## Buod na talahanayan

| Uri ng data | Naka-encrypt | Nakikita ng server | Nakukuha sa ilalim ng subpoena |
|-------------|-------------|-------------------|-------------------------------|
| Mga tala ng tawag | Oo (dulo-sa-dulo) | Hindi | Ciphertext lamang |
| Mga transkripsyon | Oo (dulo-sa-dulo) | Hindi | Ciphertext lamang |
| Mga ulat | Oo (dulo-sa-dulo) | Hindi | Ciphertext lamang |
| Mga rekord ng kaso / data ng entity | Oo (dulo-sa-dulo) | Hindi | Ciphertext lamang |
| Mga file attachment | Oo (dulo-sa-dulo) | Hindi | Ciphertext lamang |
| Mga rekord ng contact | Oo (dulo-sa-dulo) | Hindi | Ciphertext lamang |
| Mga pagkakakilanlan ng boluntaryo | Oo (dulo-sa-dulo) | Hindi | Ciphertext lamang |
| Metadata ng team/papel | Oo (naka-encrypt) | Hindi | Ciphertext lamang |
| Mga kahulugan ng custom field | Oo (naka-encrypt) | Hindi | Ciphertext lamang |
| Papasok na nilalaman ng SMS/WhatsApp/Signal | Oo (sa iyong server) | Hindi | Ciphertext mula sa server; maaaring may orihinal ang provider |
| Papalabas na bulk na mensahe | **Hindi — plaintext sa panahon ng paghahatid** | **Oo, pansamantala** | Oo (plaintext sa oras ng pagpapadala) |
| Mga recovery fragment | Oo (dulo-sa-dulo sa device) | Hindi | Ciphertext lamang |
| Mga real-time na event | Oo (bawat hub, umuulit na mga key) | Hindi | Ciphertext lamang |
| Metadata ng tawag | Hindi | Oo | Oo |
| Mga rekord ng bulk na paghahatid | Hindi | Oo | Oo |
| Mga hash ng numero ng tumatawag | HMAC hash | Hash lamang | Hash (hindi mababaligtad nang walang iyong secret) |
| Mga hash ng numero ng subscriber | HMAC hash | Hash lamang | Hash (hindi mababaligtad nang walang iyong secret) |
| Mga User-Agent string | SHA-256 hash | Hash lamang | Hash (hindi mababaligtad) |

---

## Para sa mga security auditor

Teknikal na dokumentasyon:

- [Protocol Specification](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/PROTOCOL.md)
- [Threat Model](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/THREAT_MODEL.md)
- [Data Classification](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Security Gaps and Roadmap](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/SECURITY_GAPS_AND_ROADMAP.md)
- [Security Audits](https://github.com/rhonda-rodododo/llamenos-platform/tree/main/docs/security)
- [API Documentation](/api/docs)

Ang Llamenos ay open source: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
