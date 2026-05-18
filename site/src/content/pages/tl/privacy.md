---
title: Patakaran sa Privacy
subtitle: Ano ang kinokolekta ng Llámenos, paano ito pinoprotektahan, at ang iyong mga karapatan bilang gumagamit.
---

**Petsa ng Bisa: Mayo 18, 2026**

Ang Llámenos ay open-source na software para sa pagtugon sa krisis. Nalalapat ang patakarang ito sa iOS app ng Llámenos at sa mga serbisyong backend na pinapatakbo ng iyong hub administrator. Hindi ito nalalapat sa mga hub na pinapatakbo ng mga third party — ang bawat hub administrator ay responsable sa kanilang sariling mga gawi sa data.

---

## Ano ang Kinokolekta Namin

### Data ng account at pagkakakilanlan

- **Public key ng device** — isang cryptographic identifier na natatangi sa iyong device. Hindi kailanman ibinabahagi sa labas ng iyong hub.
- **Token ng push notification** — ginagamit lamang para maihatid ang mga alerto ng tawag sa iyong device. Pana-panahong nirereplace.
- **Papel at membership sa hub** — kung saang mga hub ka kabilang at ang iyong itinalagang papel (boluntaryo, administrator).
- **Metadata ng device** — modelo ng device, bersyon ng OS, at bersyon ng app.

### Data ng aktibidad

- **Metadata ng tawag** — mga timestamp, tagal ng tawag, kung aling boluntaryo ang sumagot. Hindi ang nilalaman ng mga tawag.
- **Mga rekord ng shift** — kung saang mga shift ka nakatakda at kung aktibo ka ba.
- **Mga entry ng audit log** — mga aksyon na ginawa sa app. Nakikita lamang ng mga administrator.
- **Mga kaganapan ng seguridad** — mga pagpaparehistro ng device, pagbabawi, aktibidad ng session, at mga pagbabago sa account.

### Nilalaman na iyong nililikha — end-to-end encrypted

- **Mga tala at transcript ng tawag** — mga nakasulat na tala at mga transcript na ginawa ng browser.
- **Mga ulat at rekord ng kaso** — mga nakabalangkas na ulat, mga custom na field, mga file attachment, at kasaysayan ng kaso.
- **Mga rekord ng contact** — impormasyon ng pakikipag-ugnayan ng tumatawag, kung naitala.
- **Mga mensahe** — mga papasok na text message na iniruruta sa iyong hub.

**Iniimbak lamang ng server ang nilalamang ito bilang ciphertext.** Hindi ito mababasa ng operator ng server, hosting provider, o Llámenos.

### Data ng broadcast/subscriber

Ang mga numero ng telepono ng subscriber ay iniimbak bilang mga hashed identifier — hindi bilang mga plaintext na numero ng telepono. Kapag nagpadala ng mass message, pansamantalang pinoproseso ng server ang nilalaman bilang plaintext para sa paghahatid. Ang nilalaman ay hindi iniimbak pagkatapos ng paghahatid.

### Data ng recovery group

Kung nagse-set up ka ng recovery group, iniimbak ng server ang mga encrypted share fragment (ang bawat fragment ay naka-encrypt para sa device ng isang partikular na share holder — hindi ito mababasa ng server). Hindi maaaring i-reconstruct ng server ang iyong recovery key.

---

## Paano Namin Ginagamit ang Data

- **Para patakbuhin ang app** — pag-route ng mga tawag, pagpapagana ng pagkuha ng tala, pamamahala ng mga shift at ulat.
- **Para sa seguridad** — pagtuklas ng pang-aabuso, pagpapanatili ng mga block list, paglilimita ng rate.
- **Para sa audit** — pagbibigay sa mga administrator ng mga audit log ng aktibidad ng app (walang nilalaman).
- **Para sa recovery** — pag-iimbak ng mga encrypted fragment para matulungan ng mga recovery group ang mga gumagamit na mabawi ang access.

Hindi namin ginagamit ang iyong data para sa advertising. Hindi namin ibinebenta o ibinabahagi ang iyong data sa mga third party para sa mga layuning komersyal.

---

## End-to-End Encryption

Lahat ng nilalaman ng tala, transcript, ulat, rekord ng contact, at mga papasok na mensahe ay end-to-end encrypted.

| Uri ng data | Mababasa ba ng server? | Makukuha sa ilalim ng subpoena? |
|-----------|----------------------|--------------------------------|
| Mga tala ng tawag | Hindi | Encrypted ciphertext lamang |
| Mga transcript | Hindi | Encrypted ciphertext lamang |
| Mga ulat | Hindi | Encrypted ciphertext lamang |
| Mga rekord ng kaso | Hindi | Encrypted ciphertext lamang |
| Mga papasok na mensahe | Hindi | Encrypted ciphertext lamang |
| Mga recovery fragment | Hindi | Encrypted ciphertext lamang |
| Mga papalabas na mass message | **Oo, pansamantala sa panahon ng paghahatid** | Oo (plaintext sa oras ng pagpapadala) |
| Metadata ng tawag | Oo | Oo |
| Ang iyong public key ng device | Oo | Oo |
| Mga kaganapan ng seguridad | Oo | Oo |

---

## Pagpapanatili ng Data

### Nilalamang iyong nililikha

Pinapanatili hanggang sa iyong o ng isang administrator ay tahasang burahin ito, o isara ang iyong hub.

### Mga mass message

Ang nilalaman ay hindi iniimbak pagkatapos ng paghahatid. Ang mga rekord ng status ng paghahatid lamang ang pinapanatili.

### Metadata ng tawag at mga audit log

Pinapanatili ayon sa configuration ng iyong hub administrator.

### Mga recovery fragment

Pinapanatili hanggang sa burahin mo ang iyong recovery group configuration o mabura ang iyong account.

### Mga push token

Tinatanggal kapag nag-log out ka o nag-uninstall ng app.

---

## Pagbubura ng Account

Mayroon kang karapatang humiling ng permanenteng pagbubura ng iyong account.

### Ano ang ginagawa ng pagbubura

1. **Una, sinisira ang mga susi**: Ang mga encryption key ng iyong device ay kaagad na sinisira, na ginagawang hindi na mababasa ang lahat ng nilalamang iyong nilikha.
2. **Tinatanggal ang mga rekord ng account**: Tinatanggal ang iyong rekord ng account, mga pagpaparehistro ng device, mga push token, at mga pagtatalaga ng papel.
3. **Crypto-sinisira ang mga audit entry**: Sinisira ang encryption key para sa iyong mga audit log entry.
4. **Muling binalot ang encrypted na nilalaman**: Ang mga tala at ulat na iyong sinulat ay muling ine-encrypt para sa mga natitirang awtorisadong mambabasa.

### Pagbubura ng gumagamit

Available mula sa mga setting ng account sa lahat ng platform. May default na pagkaantala (na-configure ng iyong hub administrator, minimum na 24 na oras, maximum na 7 araw). Maaari kang mag-cancel sa panahong ito.

### Emergency na pagbubura

Ang isang co-approver ay maaaring mag-approve ng emergency na pagbubura, na nagbabawas ng pagkaantala sa minimum na 4 na oras.

---

## Mga Serbisyo ng Third Party

Ang Llámenos ay nag-iintegrate sa mga provider ng telepono para sa pag-route ng tawag.

**Ano ang natatanggap ng mga telephony provider**: Ang numero ng telepono ng tumatawag, tagal, at mga timestamp. Hindi sila nakatanggap ng mga tala, transcript, o anumang nilalamang iyong nilikha sa app.

**Ano ang natatanggap ng mga messaging provider para sa mass message**: Nilalaman ng mensahe (SMS, WhatsApp, RCS) — dapat makatanggap ang provider ng plaintext para maihatid. Para sa mga Signal broadcast, ang nilalaman ay inihahatid na end-to-end encrypted.

---

## Ang Iyong Mga Karapatan sa ilalim ng GDPR

Ang Llámenos ay binuo ng isang organisasyong nakabase sa EU. Kung ikaw ay nasa European Economic Area:

- **Karapatan sa access** — humiling ng kopya ng personal na data na hawak tungkol sa iyo
- **Karapatan sa pagwawasto** — itama ang hindi tumpak na data
- **Karapatan sa pagbubura** — humiling ng permanenteng pagbubura ng iyong account at lahat ng nauugnay na data
- **Karapatan sa portability ng data** — makatanggap ng iyong data sa format na nababasa ng makina
- **Karapatan sa pagtutol** — tumutol sa pagpoproseso batay sa mga lehitimong interes
- **Karapatan na paghigpitan ang pagpoproseso** — humiling na limitahan ang pagpoproseso
- **Karapatan na bawiin ang pahintulot** — bawiin ang pahintulot sa anumang oras

Para gamitin ang mga karapatang ito, makipag-ugnayan sa iyong hub administrator o sulatan kami sa [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com).

---

## Privacy ng mga Bata

Ang Llámenos ay hindi naglalayong makaabot sa mga batang wala pang 13 taong gulang (o wala pang 16 sa EU).

---

## Mga Pagbabago sa Patakarang Ito

Mag-post kami ng anumang pagbabago sa pahinang ito at ia-update ang petsa ng bisa.

---

## Makipag-ugnayan

**Mga tanong sa privacy:** [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com)

**Mga ulat ng bug at pagsisiwalat ng seguridad:** [github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues)

Ang Llámenos ay open source: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
