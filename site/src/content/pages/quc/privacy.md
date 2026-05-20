---
title: Ichinan Taq Ruk'ulem
subtitle: Achike ruk'axik Llámenos, achike rub'eyal nuchajij, chuqa' a taq ach'ojib'al chi re okisanel.
---

**Q'ijul chi re nisamajïx: 18 ruwa' iq', 2026**

Llámenos jun chokoy chi re kich'ojib'al k'axk'olil ri jun k'olib'al chuwäch ronojel. Re re ruk'ulem nrajo' pa ri Llámenos iOS app chuqa' ri ruk'ojlem services ri operated by a hub administrator. Majun nrajo' pa hubs operated by third parties — jun jun hub's administrator ruchajom richin ri own data practices.

---

## Achike Ruk'axik

### Account chuqa' identity data

- **Device public key** — jun cryptographic identifier unique to a device. Never shared outside a hub.
- **Push notification token** — used only to deliver call alerts to a device. Rotated periodically.
- **Role chuqa' hub membership** — which hubs you belong to chuqa' a assigned role (volunteer, admin).
- **Device metadata** — device model, OS version, chuqa' app version. Collected we you register jun device. Used richin security monitoring chuqa' to'ïk.

### Activity data

- **Call metadata** — timestamps, call duration, which volunteer answered. Majun ri content ri calls.
- **Shift records** — which shifts you scheduled richin chuqa' we you active.
- **Audit log entries** — actions taken pa ri app (note created, report submitted, settings changed). Visible to admins only.
- **Security events** — device registrations, revocations, session activity, chuqa' account changes. Stored pa a security history, visible to you chuqa' admins.

### Content you create — end-to-end encrypted

- **Call notes chuqa' transcripts** — written notes chuqa' browser-generated transcripts from calls you handle.
- **Reports chuqa' case records** — structured reports, custom fields, file attachments, chuqa' case history.
- **Contact records** — caller contact information, we recorded.
- **Messages** — inbound text messages routed to a hub.

**Ri server stores re re content chi re ciphertext only.** Majun tikirel nisöl by ri server operator, ri hosting provider, o Llámenos. A encryption keys protected by a PIN chuqa' identity provider credentials, chuqa' optionally jun hardware security key. Decryption happens only pa a authenticated device.

### Broadcast/subscriber data

We a hub okisax broadcast messaging, subscriber phone numbers stored chi re **hashed identifiers** — majun chi re plaintext phone numbers. Re' means ri database never contains jun readable subscriber list. Opt-out (STOP) requests processed immediately chuqa' cannot ignored.

We jun broadcast message sent, ri server processes plaintext message content momentarily to deliver it via ri messaging provider (SMS, WhatsApp, Signal, o RCS). Ri server majun stores broadcast message content chuwäch delivery — only delivery status records retained.

### Recovery group data

We you configure jun recovery group, ri server stores:
- A recovery group public key (used to verify recovery requests)
- Encrypted share fragments (jun jun fragment encrypted to jun specific share holder's device — ri server cannot read ri')
- Recovery request records (timing, status — majun content)

**Ri server cannot reconstruct a recovery key.** Share fragments encrypted end-to-end to jun jun share holder's device. Jun minimum threshold ri share holders must actively contribute ri shares richin recovery to succeed.

### Crash reports chuqa' diagnostics

We enabled by a hub administrator, ri app may send crash reports to jun diagnostics service. Re taq contain device model, OS version, app version, chuqa' jun stack trace. Majun contain call content, notes, o personal identity information.

### Location

Ri app majun collects location data. We jun future feature requests location access, it optional, disclosed separately, chuqa' majun used richin tracking.

---

## Achike Rub'eyal Nuk'ul Tzij

- **Richin nusamajij ri app** — routing calls to on-shift volunteers, enabling note-taking, managing shifts chuqa' reports.
- **Richin security** — detecting abuse, maintaining ban lists, rate limiting, chuqa' providing device security history.
- **Richin auditing** — providing administrators ruk'wan audit logs ri app activity (majun content).
- **Richin recovery** — storing encrypted share fragments richin chi re recovery groups can help users regain access.

We majun nokisäx a data richin advertising. We majun sell o share a data ruk'wan third parties richin commercial purposes. We majun build behavioral profiles.

---

## End-to-End Encryption

Ronojel note content, transcripts, reports, contact records, chuqa' inbound messages end-to-end encrypted. Jun jun item okisax jun unique random key. A private key never leaves a device. Ri server receives chuqa' stores only ciphertext.

**Achike re' means pa practice:**

| Data type | Server can read? | Obtainable chuwäch subpoena |
|-----------|-----------------|---------------------------|
| Call notes | Majun | Encrypted ciphertext only |
| Transcripts | Majun | Encrypted ciphertext only |
| Reports | Majun | Encrypted ciphertext only |
| Case records | Majun | Encrypted ciphertext only |
| Inbound messages | Majun | Encrypted ciphertext only |
| Recovery shares | Majun | Encrypted ciphertext only |
| Outbound broadcast messages | **Yes, momentarily during delivery** | Yes (plaintext pa time ri send) |
| Call metadata | Yes | Yes |
| A device public key | Yes | Yes |
| Security events | Yes | Yes |

See ri [Security ruwuj](/security) richin jun full breakdown.

---

## Data Retention

### Content you create

Notes, transcripts, reports, chuqa' messages retained toq you o jun admin explicitly deletes ri', o a hub shut down. A hub administrator can configure retention periods ri automatically purge content older than jun set threshold.

### Broadcast messages

Broadcast message content majun stored chuwäch delivery. Only delivery status records (sent, failed, unsubscribed) retained. A hub admin controls how long delivery records kept.

### Call metadata chuqa' audit logs

Retained per a hub administrator's configuration. Platform-enforced minimums prevent administrators from setting retention periods ri would destroy audit evidence chuwäch required legal holds expire.

### Security events chuqa' device records

Security events (device registrations, revocations, session activity) retained richin ri lifetime ri a account. Re taq part ri security audit trail chuqa' support a right to review account activity.

### Recovery shares

Encrypted share fragments retained toq you delete a recovery group configuration o a account erased.

### Push tokens

Removed we you log out o uninstall ri app.

### Account data chuqa' erasure

You can request complete erasure ri a account — see below.

---

## Account Erasure

You jun right to request permanent deletion ri a account. Llámenos implements erasure ruk'wan strong cryptographic guarantees.

### Achike nub'än erasure

1. **Keys destroyed first**: A device encryption keys destroyed immediately. Re' renders ronojel content you created permanently unreadable — even from database backups — chuwäch any database deletion occurs.
2. **Account chuqa' device records deleted**: A account record, device registrations, push tokens, chuqa' role assignments removed.
3. **Audit entries crypto-shredded**: Ri encryption key richin a audit log entries destroyed, making a entries unreadable. Ri audit chain's tamper-evident structure remains intact (required richin hub integrity).
4. **Encrypted content re-wrapped**: Notes chuqa' reports you authored re-encrypted richin remaining authorized readers (other admins). A copy ri decryption key removed; ri content persists richin case continuity.

### Self-service erasure

Available from a account settings pa ronojel platforms. By default, k'o jun delay (set by a hub admin, typically 72 hours, minimum 24 hours, maximum 7 days) chuwäch erasure completes. **You can cancel during re re period.** Ri delay jun safety feature — it protects you we you coerced into erasing a account.

### Emergency erasure

We you face immediate danger, jun co-approver (jun trusted admin o contact) can approve emergency erasure, reducing ri delay to jun minimum ri 4 hours. Ri 4-hour floor exists to protect against coerced deletion ri evidence we help pa ri q'ijul.

### Admin erasure

Hub admins can initiate immediate erasure ri any account pa ri hub. Re' subject to audit logging.

---

## Third-Party Services

Llámenos integrates ruk'wan telephony providers richin call routing (Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth, o self-hosted Asterisk/FreeSWITCH). A hub administrator selects ri provider.

**Achike telephony providers receive:**

- Ri phone number ri caller (inbound calls)
- Call duration chuqa' timestamps
- Ri do **majun** receive call notes, transcripts, o any content you create pa ri app

**Achike messaging providers receive richin broadcast messages:**

- Message content (SMS, WhatsApp, RCS) — ri provider must receive plaintext to deliver ri message
- Richin Signal broadcasts, content delivered end-to-end encrypted via ri Signal network

A hub administrator may okisax additional third-party services (crash reporting, monitoring). Consult a hub's privacy notice richin specifics.

---

## A Rights Under GDPR

Llámenos developed by jun EU-based organization. We you pa ri European Economic Area, you ri following rights under ri General Data Protection Regulation:

- **Right ri access** — request jun copy ri personal data held about you
- **Right to rectification** — correct inaccurate data
- **Right to erasure** — request permanent deletion ri a account chuqa' ronojel associated data (see [Account Erasure](#account-erasure) above chuqa' ri [Data Deletion ruwuj](/data-deletion) richin full details)
- **Right to data portability** — receive a data pa jun structured, machine-readable format
- **Right to object** — object to processing based pa legitimate interests
- **Right to restrict processing** — request chi re processing limited
- **Right to withdraw consent** — where processing based pa consent, withdraw it pa any time

**Note pa encrypted content**: Ruma call notes, transcripts, chuqa' reports end-to-end encrypted chuqa' ri server cannot read ri', we cannot provide you ruk'wan jun decrypted export ri content you majun directly access pa a device. We can confirm achike encrypted records exist chuqa' delete ri'. Richin content you can still decrypt (pa jun active device), ri app allows you to view chuqa' export a own notes.

To exercise re re rights, contact a hub administrator (ri data controller richin a hub), o reach us pa [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com).

You also jun right to lodge jun complaint ruk'wan a national data protection authority.

---

## Children's Privacy

Llámenos majun directed at children under 13, o under 16 pa ri EU. We majun knowingly collect personal data from children. We you believe jun child has submitted personal data through ri app, contact us chuqa' we will delete it promptly.

---

## Changes to Re re Policy

We will post any changes to re re policy pa re re ruwuj chuqa' update ri effective date. Richin significant changes, we will provide notice through ri app o by email where feasible.

---

## Contact

**Privacy inquiries:** [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com)

**Bug reports chuqa' security disclosures:** [github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues)

Llámenos jun k'olib'al chuwäch ronojel. You can audit achike ri app nub'än: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
