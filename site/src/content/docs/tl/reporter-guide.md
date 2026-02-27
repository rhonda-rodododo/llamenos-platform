---
title: Gabay para sa Reporter
description: Paano magsumite ng mga naka-encrypt na ulat at subaybayan ang kanilang katayuan.
---

Bilang isang reporter, maaari kang magsumite ng mga naka-encrypt na ulat sa iyong organisasyon sa pamamagitan ng Llamenos platform. Ang mga ulat ay end-to-end encrypted — hindi kailanman nakikita ng server ang nilalaman ng iyong ulat.

## Pagsisimula

Ibibigay sa iyo ng iyong admin ang isa sa mga sumusunod:
- Isang **nsec** (Nostr secret key) — isang string na nagsisimula sa `nsec1`
- Isang **invite link** — isang one-time URL na lumilikha ng mga credential para sa iyo

**Panatilihing pribado ang iyong nsec.** Ito ang iyong pagkakakilanlan at login credential. Itago ito sa isang password manager.

## Pag-login

1. Buksan ang app sa iyong browser
2. I-paste ang iyong `nsec` sa login field
3. Ang iyong pagkakakilanlan ay cryptographically verified — ang iyong secret key ay hindi kailanman umalis sa iyong browser

Pagkatapos ng unang pag-login, maaari kang mag-register ng WebAuthn passkey sa Settings para sa mas madaling pag-login sa hinaharap.

## Pagsusumite ng ulat

1. I-click ang **New Report** mula sa Reports page
2. Maglagay ng **pamagat** para sa iyong ulat (tumutulong ito sa mga admin na mag-triage — naka-store ito bilang plaintext)
3. Pumili ng **kategorya** kung nagtakda ang iyong admin ng mga report category
4. Isulat ang **nilalaman ng ulat** sa body field — ito ay naka-encrypt bago umalis sa iyong browser
5. Opsyonal na punan ang anumang **custom fields** na na-configure ng iyong admin
6. Opsyonal na **mag-attach ng mga file** — ang mga file ay naka-encrypt sa client-side bago i-upload
7. I-click ang **Submit**

Lalabas ang iyong ulat sa iyong listahan ng Reports na may status na "Open".

## Encryption ng ulat

- Ang report body at custom field values ay naka-encrypt gamit ang ECIES (secp256k1 + XChaCha20-Poly1305)
- Ang mga file attachment ay naka-encrypt nang hiwalay gamit ang parehong scheme
- Ikaw at ang admin lang ang makakapag-decrypt ng nilalaman
- Ang server ay nag-iimbak lamang ng ciphertext — kahit ma-compromise ang database, ligtas pa rin ang nilalaman ng iyong ulat

## Pagsubaybay ng iyong mga ulat

Ipinapakita ng iyong Reports page ang lahat ng iyong isinumiteng ulat kasama ang:
- **Pamagat** at **kategorya**
- **Katayuan** — Open, Claimed (isang admin ang gumagawa dito), o Resolved
- **Petsa** ng pagsusumite

I-click ang isang ulat para makita ang buong thread, kasama ang anumang mga tugon ng admin.

## Pagtugon sa mga admin

Kapag tumugon ang isang admin sa iyong ulat, lalabas ang kanilang sagot sa report thread. Maaari kang tumugon pabalik — lahat ng mensahe sa thread ay naka-encrypt.

## Mga bagay na hindi mo magagawa

Bilang isang reporter, limitado ang iyong access para protektahan ang privacy ng lahat:
- **Maaari** mong tingnan ang iyong sariling mga ulat at ang Help page
- **Hindi** mo makikita ang mga ulat ng ibang mga reporter, call records, impormasyon ng volunteer, o admin settings
- **Hindi** ka makakatanggap ng mga tawag o makakatugon sa SMS/WhatsApp/Signal conversations

## Mga tip

- Gumamit ng deskriptibong mga pamagat — tumutulong ito sa mga admin na mag-triage nang hindi dine-decrypt ang buong nilalaman
- Mag-attach ng mga kaugnay na file (mga screenshot, dokumento) kapag sumusuporta ito sa iyong ulat
- Regular na bumalik para tingnan ang mga tugon ng admin — makikita mo ang mga pagbabago sa status sa iyong listahan ng ulat
- Gamitin ang Help page para sa FAQ at mga gabay
