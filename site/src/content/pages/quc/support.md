---
title: To'onel
subtitle: Tik'ul to'onel rik'in Llámenos — ruchojmil, ruchojmil, chuqa' ruch'utik ruk'ayewal.
---

## Tach'utiwach

**Email:** [support@llamenos-platform.com](mailto:support@llamenos-platform.com)

Niq'ajoj chi niqanab'e' within 2 business q'ij. Richin urgent taq k'ayewal affecting jun active crisis line, titz'aqatisaj "URGENT" pa ri subject line.

**Bug reports chuqa' feature requests:** [github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues)

**Security disclosures:** Richin vulnerabilities, tacha' GitHub's private security advisory feature rather than opening jun public issue.

---

## Documentation

- [Deployment guide](/docs/deploy) — tiya' awachib'al self-hosted hub
- [Admin guide](/docs/admin-guide) — nuch'ajin volunteers, shifts, chuqa' settings
- [Volunteer guide](/docs/volunteer-guide) — xk'ul taq tzij, tz'ib'aj notes, tokisäx ri app
- [Reporter guide](/docs/reporter-guide) — titaq reports chuqa' case records

---

## Frequently Asked Questions

### Rutikirib'al samaj

**Achike ri Llámenos?**

Llámenos jun open-source software richin nusamaj jun secure crisis response hotline. Taq k'ayib'äl self-host ri taq ruk'u'x samaj. We jun rumaq tacha' aw hotline rajilab'al, konojel on-shift volunteers b'ey simultaneously — ri first pa xk'ul xk'ul ri tzij. Taq volunteers tz'ib'aj encrypted notes. Admins nuch'ajin shifts, volunteers, chuqa' settings.

**Achi'eta nusamaj Llámenos?**

Junjun k'ayib'äl nusamaj ri taq ruk'u'x samaj. Majun central Llámenos cloud service. Ri iOS app nok pa aw k'ayib'äl's self-hosted hub, man pa jun Llámenos-operated server.

**Achike rub'eyal nik'ul ri iOS app?**

Tiq'axaj Llámenos pa ri App Store. Richin nawokisaj, xaraj jun invitation pa ri administrator jun hub. Ri app man yetikïr ta nok majun hub connection.

**Xinuk' jun invite — achike rub'eyal niya' awachib'al?**

Tijaq ri invite link pa aw device. Ri app nub'än chawe richin nitz'uk aw encrypted device keys chuqa' nok pa ri hub. Xaraj niya' jun PIN — re' PIN nuchajij' aw encryption keys chuqa' man yetikïr ta recover we xawet.

---

### Taq tzij chuqa' shifts

**Xin pa shift pero man xinuk' ta taq tzij. Achike xb'än?**

Kek'ut chi:
- Xa xe xatz'ib'aj chi at available pa ri app
- Push notifications e enabled richin Llámenos pa iOS Settings → Notifications
- Aw hub administrator xatz'ub'aj jun telephony provider
- Xa xe xatz'ajij' pa ri active shift o ring group

We notifications samajin richin ch'aqa' chik apps pero man richin Llámenos, tach'utiwach aw hub administrator richin nitz'akaj ri push notification ruchojmil.

**Yatikïr xinuk' taq tzij pa wachib'al phone number?**

By default, taq tzij e delivered achi'el push notifications pa ri app. We aw administrator xitz'ij'ij' PSTN fallback (forwarding pa jun real phone number), aw personal number k'o chi nuk'ut pa ri telephony provider. Tach'utiwach aw administrator which ruwäch tz'aqat.

**Achike nub'án we majun xk'ul jun tzij?**

Chuwäch ri configured timeout, ri tzij b'ey pa voicemail (we configured) o disconnects. Aw administrator yetikïr ruchojmil fallback behavior pa ri hub settings.

---

### Privacy chuqa' encryption

**Yatikïr ri ruk'u'x samaj nik'ul winaq notes?**

Mani. Notes, transcriptions, reports, chuqa' taq tzij e end-to-end encrypted. Ri ruk'u'x samaj stores xa ciphertext. Aw hub operator man yetikïr ta nik'ul ri content. Katz'eto' ri [Privacy Policy](/privacy) chuqa' [Security page](/security) richin technical taq rutzijol.

**Achike nub'án we xawet aw PIN?**

Aw PIN nuchajij' aw encryption keys. We xawet, aw encrypted data man yetikïr ta recover — re' jun rutzil feature, man jun bug. Tach'utiwach aw hub administrator richin reset aw account. Xawet aw okem pa previously encrypted notes pa aw account.

**Xa xe xetz'ib'aj ri call audio?**

Recording disabled by default. We aw administrator xitz'ij'ij' recording, xk'ut chi re' pa volunteers. In-browser transcription nrokisaj on-device AI — audio majun b'ey pa aw device.

---

### Technical taq k'ayewal

**Ri app nuya' "Unable to connect to hub." Achike ninb'än?**

1. Kek'ut aw internet connection
2. Ketz'et chi aw hub administrator k'o ri server samajin
3. Tatojtob'ej tz'ap chuqa' tijaq chik ri app
4. We ri k'ayewal k'oje', tach'utiwach aw hub administrator rik'in ri error message pa ri app's diagnostics screen

**Achike rub'eyal nitaq jun bug?**

Tijaq jun issue pa [github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues). Titz'aqatisaj:
- iOS ruwäch chuqa' device model
- App ruwäch (wäch pa Settings → About)
- Steps richin reproduce ri k'ayewal
- Achike xawet vs achike xb'än
- Jun taq error messages nuk'ut

**Xinwïl jun rutzil vulnerability. Achike rub'eyal nitaq?**

Tokisäx GitHub's private security advisory: [github.com/rhonda-rodododo/llamenos-platform/security/advisories/new](https://github.com/rhonda-rodododo/llamenos-platform/security/advisories/new). Man tijaq jun public issue richin security vulnerabilities.

---

### Richin administrators

**Achike rub'eyal niya' self-hosted hub?**

Katz'eto' ri [Deployment guide](/docs/deploy). Llámenos samajin via Docker Compose pa jun standard Linux VPS. Minimum taq k'ayewal: 2 vCPU, 2 GB RAM, PostgreSQL 16.

**Achike rub'eyal nitz'aqatisaj volunteers pa w hub?**

Pa ri admin panel, katb'e pa Volunteers → Invite. Titz'uk jun invite link chuqa' tiya' securely rik'in ri volunteer. Ri link jun-use chuqa' expires.

**Achi'eta telephony providers e supported?**

Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth, Asterisk, chuqa' FreeSWITCH. Katz'eto' ri admin guide richin ruchojmil instructions richin junjun provider.

**K'o jun hosted / managed ruwäch?**

Mani chik. Llámenos jun self-hosted software. Niq'ajoj chi nik'ut managed hosting taq rucha'ik richin taq k'ayib'äl ri man yetikïr ta nik'oj ri taq ruk'u'x samaj — tach'utiwach [support@llamenos-platform.com](mailto:support@llamenos-platform.com) we re' jun blocker richin aw k'ayib'äl.
