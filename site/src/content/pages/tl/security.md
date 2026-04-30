---
title: Seguridad at Privacy
subtitle: Ano ang protektado, ano ang nakikita, at ano ang maaaring makuha sa pamamagitan ng subpoena — inorganisa ayon sa mga feature na ginagamit mo.
---

## Kung masubpoena ang iyong hosting provider

| Maaari nilang ibigay | HINDI nila maibibigay |
|----------------------|------------------------|
| Metadata ng tawag/mensahe (oras, tagal) | Nilalaman ng notes, transcripts, report bodies |
| Encrypted na database blobs | Pangalan ng mga volunteer (end-to-end encrypted) |
| Aling mga volunteer account ang aktibo noong | Mga contact directory record (end-to-end encrypted) |
| | Nilalaman ng mensahe (naka-encrypt pagdating, naka-imbak bilang ciphertext) |
| | Mga decryption key (protektado ng iyong PIN, identity provider account, at opsyonal na hardware security key) |
| | Mga per-note encryption key (ephemeral — sinisira pagkatapos i-wrap) |
| | Ang iyong HMAC secret para sa pag-reverse ng phone hashes |

**Nag-iimbak ang server ng data na hindi nito mababasa.** Ang metadata (kailan, gaano katagal, aling mga account) ay nakikita. Ang content (ano ang sinabi, ano ang isinulat, sino ang iyong mga contact) ay hindi.

---

## Ayon sa feature

Ang iyong privacy exposure ay depende sa kung aling mga channel ang ine-enable mo:

### Mga voice call

| Kung gumagamit ka ng... | Maa-access ng third party | Maa-access ng server | End-to-end encrypted na content |
|-------------------------|---------------------------|----------------------|--------------------------------|
| Twilio/SignalWire/Vonage/Plivo | Call audio (live), call records | Call metadata | Notes, transcripts |
| Self-hosted Asterisk | Wala (ikaw ang may kontrol) | Call metadata | Notes, transcripts |
| Browser-to-browser (WebRTC) | Wala | Call metadata | Notes, transcripts |

**Subpoena sa telephony provider**: Meron silang call detail records (oras, phone number, tagal). WALA silang call notes o transcripts. Naka-disable ang recording bilang default.

**Transcription**: Nangyayari ang transcription nang buo sa iyong browser gamit ang on-device AI. **Hindi umaalis ang audio sa iyong device.** Ang encrypted transcript lang ang ini-store.

### Text messaging

| Channel | Access ng provider | Storage sa server | Notes |
|---------|--------------------|-------------------|-------|
| SMS | Nababasa ng telephony provider mo ang lahat ng mensahe | **Encrypted** | Ang provider ay nag-iimbak ng orihinal na mensahe |
| WhatsApp | Nababasa ng Meta ang lahat ng mensahe | **Encrypted** | Ang provider ay nag-iimbak ng orihinal na mensahe |
| Signal | End-to-end encrypted ang Signal network, pero dine-decrypt ng bridge pagdating | **Encrypted** | Mas maganda kaysa SMS, hindi zero-knowledge |

**Nae-encrypt ang mga mensahe pagdating sa iyong server.** Ciphertext lang ang ini-store ng server. Maaaring nasa provider pa rin ang orihinal na mensahe — limitasyon iyon ng mga platform na iyon, hindi natin mababago.

**Subpoena sa messaging provider**: Meron ang SMS provider ng buong message content. Meron ang Meta ng WhatsApp content. Ang Signal messages ay end-to-end encrypted sa bridge, pero ang bridge (tumatakbo sa iyong server) ay nagde-decrypt bago mag-re-encrypt para sa storage. Sa lahat ng kaso, **ciphertext lang ang nasa iyong server** — hindi mababasa ng hosting provider ang message content.

### Notes, transcripts, at reports

Lahat ng content na sinulat ng volunteer ay end-to-end encrypted:

- Bawat note ay gumagamit ng **unique random key** (forward secrecy — ang pag-kompromiso ng isang note ay hindi nangangahulugang nakompromiso na rin ang iba)
- Ang mga key ay hiwalay na naka-wrap para sa volunteer at bawat admin
- Ciphertext lang ang ini-store ng server
- Nangyayari ang decryption sa browser
- **Ang custom fields, report content, at file attachments ay lahat individually encrypted**

**Pag-seize ng device**: Kung walang iyong PIN **at** access sa iyong identity provider account, ang makukuha ng attacker ay encrypted blob na computationally infeasible i-decrypt. Kung gumagamit ka rin ng hardware security key, **tatlong independent na factor** ang nagpoprotekta sa iyong data.

---

## Privacy ng phone number ng volunteer

Kapag tumatanggap ng tawag sa kanilang personal na phone ang mga volunteer, ang numero nila ay nakalantad sa iyong telephony provider.

| Senaryo | Phone number nakikita ng |
|---------|--------------------------|
| PSTN call sa phone ng volunteer | Telephony provider, phone carrier |
| Browser-to-browser (WebRTC) | Walang makakakita (nananatili ang audio sa browser) |
| Self-hosted Asterisk + SIP phone | Ang iyong Asterisk server lang |

**Para protektahan ang phone number ng volunteer**: Gumamit ng browser-based calling (WebRTC) o magbigay ng SIP phones na konektado sa self-hosted Asterisk.

---

## Kamakailan lang na-ship

Ang mga pagpapabuti na ito ay live na ngayon:

| Feature | Privacy benefit |
|---------|-----------------|
| Encrypted message storage | Ang SMS, WhatsApp, at Signal messages ay naka-store bilang ciphertext sa iyong server |
| On-device transcription | Hindi umaalis ang audio sa iyong browser — pinoproseso nang buo sa iyong device |
| Multi-factor key protection | Ang iyong encryption keys ay protektado ng iyong PIN, identity provider, at opsyonal na hardware security key |
| Hardware security keys | Ang physical key ay nagdadagdag ng third factor na hindi mako-kompromiso nang remote |
| Reproducible builds | I-verify na ang deployed code ay tumutugma sa public source |
| Encrypted contact directory | Ang contact records, relationships, at notes ay end-to-end encrypted |

## Naplano pa

| Feature | Privacy benefit |
|---------|-----------------|
| Native call-receiving apps | Walang personal phone number ang malelantad |

---

## Summary table

| Uri ng data | Encrypted | Nakikita ng server | Makukuha sa subpoena |
|-------------|-----------|--------------------|-----------------------|
| Call notes | Oo (end-to-end) | Hindi | Ciphertext lang |
| Transcripts | Oo (end-to-end) | Hindi | Ciphertext lang |
| Reports | Oo (end-to-end) | Hindi | Ciphertext lang |
| File attachments | Oo (end-to-end) | Hindi | Ciphertext lang |
| Contact records | Oo (end-to-end) | Hindi | Ciphertext lang |
| Volunteer identities | Oo (end-to-end) | Hindi | Ciphertext lang |
| Team/role metadata | Oo (encrypted) | Hindi | Ciphertext lang |
| Custom field definitions | Oo (encrypted) | Hindi | Ciphertext lang |
| SMS/WhatsApp/Signal content | Oo (sa iyong server) | Hindi | Ciphertext mula sa iyong server; maaaring nasa provider ang orihinal |
| Call metadata | Hindi | Oo | Oo |
| Caller phone hashes | HMAC hashed | Hash lang | Hash (hindi mare-reverse nang wala ang iyong secret) |

---

## Para sa mga security auditor

Technical documentation:

- [Protocol Specification](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/llamenos-protocol.md)
- [Threat Model](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/THREAT_MODEL.md)
- [Data Classification](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Security Audits](https://github.com/rhonda-rodododo/llamenos-platform/tree/main/docs/security)
- [API Documentation](/api/docs)

Open source ang Llamenos: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
