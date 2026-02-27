---
title: Seguridad at Privacy
subtitle: Ano ang protektado, ano ang nakikita, at ano ang maaaring makuha sa ilalim ng subpoena — nakaayos ayon sa mga feature na ginagamit mo.
---

## Kung makatanggap ng subpoena ang iyong hosting provider

| MAAARI nilang ibigay | HINDI nila maibibigay |
|---------------------|----------------------|
| Metadata ng tawag/mensahe (oras, tagal) | Nilalaman ng nota, mga transcript, nilalaman ng ulat |
| Mga naka-encrypt na database blob | Mga decryption key (naka-store sa iyong mga device) |
| Kung aling mga volunteer ang aktibo kailan | Mga per-note encryption key (ephemeral) |
| Nilalaman ng SMS/WhatsApp message | Ang iyong HMAC secret para sa pag-reverse ng phone hashes |

**Nag-iimbak ang server ng data na hindi nito mababasa.** Ang metadata (kailan, gaano katagal, sino) ay nakikita. Ang nilalaman (ano ang sinabi, ano ang sinulat) ay hindi.

---

## Ayon sa feature

Ang iyong privacy exposure ay nakadepende sa kung aling mga channel ang ie-enable mo:

### Mga voice call

| Kung gumagamit ka ng... | Maa-access ng third parties | Maa-access ng server | E2EE content |
|------------------------|---------------------------|---------------------|--------------|
| Twilio/SignalWire/Vonage/Plivo | Call audio (live), call records | Call metadata | Mga nota, transcript |
| Self-hosted Asterisk | Wala (kontrolado mo) | Call metadata | Mga nota, transcript |
| Browser-to-browser (WebRTC) | Wala | Call metadata | Mga nota, transcript |

**Subpoena sa telephony provider**: Mayroon silang call detail records (oras, phone numbers, tagal). WALA silang call notes o transcripts. Naka-disable ang recording bilang default.

**Transcription window**: Sa panahon ng ~30 segundo ng transcription, pinoproseso ng Cloudflare Workers AI ang audio. Pagkatapos ng transcription, naka-encrypt na text lamang ang naka-store.

### Text messaging

| Channel | Provider access | Server storage | Mga tala |
|---------|----------------|----------------|----------|
| SMS | Binabasa ng iyong telephony provider ang lahat ng mensahe | Plaintext | Likas na limitasyon ng SMS |
| WhatsApp | Binabasa ng Meta ang lahat ng mensahe | Plaintext | Kinakailangan ng WhatsApp Business API |
| Signal | E2EE ang Signal network, pero dine-decrypt ng signal-cli bridge | Plaintext | Mas maganda kaysa SMS, hindi zero-knowledge |

**Subpoena sa messaging provider**: Mayroon ang SMS provider ng buong message content. Mayroon ang Meta ng WhatsApp content. Ang mga Signal message ay E2EE hanggang sa bridge, pero ang bridge (tumatakbo sa iyong server) ay may plaintext.

**Pagpapabuti sa hinaharap**: Ini-explore namin ang E2EE message storage kung saan ciphertext lamang ang ini-store ng server. Tingnan ang [mga plano](#mga-plano).

### Mga nota, transcript, at ulat

Lahat ng nilalaman na sinulat ng volunteer ay end-to-end encrypted:

- Bawat nota ay gumagamit ng natatanging random key (forward secrecy)
- Hiwalay na bini-wrap ang mga key para sa volunteer at admin
- Ciphertext lamang ang ini-store ng server
- Nangyayari ang decryption sa browser

**Pag-seize ng device**: Nang walang iyong PIN, naka-encrypt na blob ang makukuha ng mga attacker. Ang 6-digit PIN na may 600K PBKDF2 iterations ay tumatagal ng maraming oras para sa brute-force sa GPU hardware.

---

## Privacy ng phone number ng volunteer

Kapag tumatanggap ang mga volunteer ng mga tawag sa kanilang personal na telepono, nai-expose ang kanilang mga numero sa iyong telephony provider.

| Senaryo | Phone number na nakikita ng |
|---------|---------------------------|
| PSTN call sa telepono ng volunteer | Telephony provider, phone carrier |
| Browser-to-browser (WebRTC) | Wala (nananatili ang audio sa browser) |
| Self-hosted Asterisk + SIP phone | Iyong Asterisk server lamang |

**Para protektahan ang phone number ng volunteer**: Gumamit ng browser-based calling (WebRTC) o magbigay ng SIP phones na konektado sa self-hosted Asterisk.

**Pagpapabuti sa hinaharap**: Native desktop at mobile apps para sa pagtanggap ng mga tawag nang hindi ine-expose ang personal na phone numbers.

---

## Mga plano

Nagtatrabaho kami sa mga pagpapabuti para mabawasan ang mga trust requirements:

| Feature | Status | Privacy benefit |
|---------|--------|-----------------|
| E2EE message storage | Planado | SMS/WhatsApp/Signal na naka-store bilang ciphertext |
| Client-side transcription | Planado | Hindi kailanman umalis ang audio sa browser |
| Native call-receiving apps | Planado | Walang nai-expose na personal na phone numbers |
| Reproducible builds | Planado | I-verify na ang deployed code ay tumutugma sa source |
| Self-hosted Signal bridge | Available | Patakbuhin ang signal-cli sa iyong sariling infrastructure |

---

## Buod na talahanayan

| Uri ng data | Naka-encrypt | Nakikita ng server | Makukuha sa ilalim ng subpoena |
|------------|-------------|-------------------|-----------------------------|
| Mga call note | Oo (E2EE) | Hindi | Ciphertext lamang |
| Mga transcript | Oo (E2EE) | Hindi | Ciphertext lamang |
| Mga ulat | Oo (E2EE) | Hindi | Ciphertext lamang |
| Mga file attachment | Oo (E2EE) | Hindi | Ciphertext lamang |
| Call metadata | Hindi | Oo | Oo |
| Mga volunteer identity | Naka-encrypt at rest | Admin lamang | Oo (na may pagsisikap) |
| Mga caller phone hash | HMAC hashed | Hash lamang | Hash (hindi mare-reverse nang wala ang iyong secret) |
| SMS content | Hindi | Oo | Oo |
| WhatsApp content | Hindi | Oo | Oo (pati mula sa Meta) |
| Signal content | Hindi | Oo | Oo (mula sa iyong server) |

---

## Para sa mga security auditor

Teknikal na dokumentasyon:

- [Protocol Specification](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/protocol/llamenos-protocol.md)
- [Threat Model](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/THREAT_MODEL.md)
- [Data Classification](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Security Audits](https://github.com/rhonda-rodododo/llamenos/tree/main/docs/security)

Ang Llamenos ay open source: [github.com/rhonda-rodododo/llamenos](https://github.com/rhonda-rodododo/llamenos)
