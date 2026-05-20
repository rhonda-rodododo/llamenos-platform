---
title: Ruk'amonik K'amalb'e
description: Tak'axaj ronojel — ajpatanib', ch'akul taq ri', b'eyab', ch'awib'al, q'axeb'al taq tzij, q'atej taq ruxak, chuqa' taq ruk'utb'al etz'apwach.
---

Je' ri k'amalb'e, tak'axaj ronojel: ajpatanib', ch'akul taq ri', b'eyab' ch'awib'al, ch'awib'al, q'axeb'al taq tzij, q'atej taq ruxak, chuqa' taq ruk'utb'al etz'apwach. Ri ruk'amonik re' kuk'ut ri key taq chak ri k'amalb'e.

## Tak'ij

Tak'ij ruk' ri `nsec` (WebSocket etz'apwach clave) ri xb'an pa [nik'oj](/docs/deploy). Ri uxojik ruxak tak'ul ri nsec rub'anikil (`nsec1...`). Ri nuk'samaj chib'äl tichertz'ib'aj jun retal ruk' ri clave — ri etz'apwach man tiel ta pa ri nuk'samaj chib'äl.

We nawaj, tatz'ib'aj jun WebAuthn passkey pa ri Runik'oj chike ri tak'ij majun clave chi k'u'x chik pa taq chapb'äl chik.

## Runik'oj wokisaxik

Pa ri nab'ej atak'ij, ri runik'oj k'ayew ri **runik'oj wokisaxik** — jun ruk'amonik ruk' jujun taq b'ey:

1. **Taya' jun b'ij che ri ruch'awib'al** — taya' ri b'ij ri tik'ut pa ruwachib'äl chike taq ajk'ayb'al
2. **Tacha' taq b'eyal** — tajaq/tachup Ch'ab'äl, SMS, WhatsApp, Signal, chuqa' Q'axeb'al Tzij
3. **Tawokisaj taq k'utunela'** — tak'oj etz'apwach taq ruxak chi kij ri taq b'eyal e tijaq
4. **Tak'utj** — taya' utzil chi kij ri awokisaxik chuqa' tak'oj ri nik'oj

Toq xat b'an ri wokisaxik, ri retal `setupCompleted` tik'oj pa rub'ey chuqa' ri wokisaxik man tik'ut chik. Tatikir tatikir ri taq runik'oj re' chi kij pa jachonik Runik'oj.

## Tak'axaj ajpatanib'

Tab'e pa **Ajpatanib'** pa ruch'i b'ey chike:

- **Titz'aq jun ajpatan** — tik'otob' jun k'ak' WebSocket clave pair. Taya' ri nsec pa ruchajinik che ri ajpatan (xwi jun b'ey tik'ut).
- **Tikojo jun sipan b'ey** — tik'otob' jun sipan b'ey wakami. Ri sipan b'ey kuk'ay jun ruwachib'al chike ri chapoj (ajpatan, k'amalb'e, o ajal q'axeb'al tzij).
- **Tanik'oj** — tanik'aj b'ij, rajilab'al teléfono, chuqa' patanijel.
- **Tiyuj** — tachup ri rokiyik ajpatan.

Rajilab'al teléfono taq ajpatanib' e k'ut chwech k'amalb'e xwi. E k'ayew chike ri ch'awib'al ruk' ch'awonik toq ri ajpatan pa ch'akul ri'.

## Tak'axaj taq ajal q'axeb'al tzij

Ri ajal q'axeb'al tzij jun patanijel k'ayew chike ri winak ri e kak'ay taq na'oj o q'axeb'al tzij pa ri plataforma. E k'oj ri okiyik — xwi kikowin kik'ut ri kiq'axeb'al tzij chuqa' ri ruxak Toq'ob'.

Chike ri titz'aq jun ajal q'axeb'al tzij:
1. Tikojo jun sipan b'ey chuqa' tacha' ri patanijel **Ajal Q'axeb'al Tzij**
2. Taya' li sipan b'ey che ri ajal q'axeb'al tzij — karek'aj ri retalib'al
3. Ri ajal q'axeb'al tzij tak'ij chuqa' kak'ut jun k'utb'al ruk' Q'axeb'al Tzij chuqa' Toq'ob' xwi

## Tanik'oj taq ch'akul ri'

Tab'e pa **Ch'akul taq Ri'** chike ri tikojo taq ch'akul ri' ri e kitzolin chik:

1. Tatz'aq pa **Titz'aq Ch'akul**
2. Taya' jun b'ij, tacha' taq q'ij ri ch'akul, taya' ri q'otij tik'otob' / tichup
3. Taya' ajpatanib' ruk' ri chapoj ruk' jujun taq rucha'
4. Tiyak — ri runik'oj tik'ayew ri siponik chwech taq ajpatanib' pa ri ch'akul ri'

Tawokisaj jun **Tzolinik Moloj Ruk'** chi k'aj ri ruxak taq ch'akul ri'. Re ajpatanib' re' kekisiponik toq maj ch'akul ri' tik'ayew.

## Q'atej taq Ruxak

Tab'e pa **Q'atej** chike tak'axaj taq rajilab'al teléfono e q'at:

- **Jun okisan** — tatz'ib'aj jun rajilab'al teléfono pa rub'anikil E.164 (je' +15551234567)
- **Okisaxik pa jujun oyob'al** — tapaq'apij jujun rajilab'al, jun pa jachonik ruxak
- **Tiyuj** — tachup ri q'atej pa ri q'otij

Ri q'atej tik'ayew pa ri q'otij ri'. Ri ajoyonib' e q'at kik'ax jun tzij ruk' q'atej chuqa' e ch'uptajik.

## Ch'awib'al

Toq ri b'eyab' tzijob'exik (SMS, WhatsApp, Signal) e tijaq, jun **Ch'awib'al** sipan tik'ut pa ruch'i b'ey. Ri re' kuk'ut konojel taq ch'awib'al ruk' tzijob'äl pa ronojel taq b'eyal tzijob'exik.

Chi jujun ch'awib'al tik'ut:
- T'ujul taq tzijob'äl ruk' retalib'al q'otij chuqa' b'ey (okisan/elsan)
- Ri b'eyal ri xapon wi ri tzijob'äl (SMS, WhatsApp, Signal)
- K'ak' taq tzijob'äl kexoj pa ri q'otij ri' ruk' WebSocket relay

Ri ch'awib'al e b'an wi toq jun tzijob'äl okisan kapon. Ri ajpatanib' kitkowin ketak b'aq' tzijob'al pa ri k'utb'al ch'awib'al.

## Q'axeb'al Tzij

Toq ri b'eyal Q'axeb'al Tzij tijaq, ri k'amalb'e kikowin kik'ut konojel taq q'axeb'al tzij e ya'on:

- **Ruxak q'axeb'al tzij** — kuk'ut ronojel q'axeb'al tzij ruk' b'ij, ruwachib'al, rajal, chuqa' q'ij ya'onik
- **Rajal nik'oj** — ri q'axeb'al tzij kakoj pa b'ey: jaq → ya'on kij → xchojmir
- **Taya' kij chi kij jun q'axeb'al tzij** — taya' awib' chike ri ak'axaj ri q'axeb'al tzij
- **Tzijob'äl ruk' tzuj** — tatak b'aq' chike ri ajal q'axeb'al tzij ruk' tzijob'äl etz'apwach
- **Taq wuj e tz'aq** — ri ajal q'axeb'al tzij kikowin kik'ay taq wuj etz'apwach ruk' ri kiq'axeb'al tzij

Ri okisaxik q'axeb'al tzij chuqa' taq wuj e tz'aq etz'apwach ruk' ECIES — ri ajk'ayb'al man tits'il ta ri tzij k'ux.

## Runik'oj Siponik

Pa **Runik'oj**, katiktik' jujun taq k'ayewal:

### Tich'op ri tz'ilan tzij

- **Voice CAPTCHA** — tajaq/tachup. Toq tijaq, ri ajoyonib' kak'oj jun rajilab'al 4 tzij ri kakiq'axij.
- **Rajal nik'oj b'ey** — tajaq/tachup. Kuchup ri siponik pa jachonik retalib'al rajilab'al.

### Tzijtz'ib'axik

- **K'o pa ronojel** — tajaq/tachup ri Whisper tzijtz'ib'axik chi kij konojel taq siponik.
- Ri ajpatanib' kakowin kekak' ri achi'el okisaxik pa kipetik.

### Runik'oj Siponik

- **Q'otij ch'awib'al** — janipa q'otij royonik koch'awin chi k'a majun tak'ul ch'ab'äl yakb'äl (30-300 segundos).
- **Nim raqän ch'ab'äl yakb'äl** — ri nim raqän koch'awik (30-300 segundos).

### Taq ruk'utb'al tz'ib'axik etz'apwach

Tawokisaj taq ruk'utb'al ri e jachonik pa ri ch'aloj tz'ib'axik:

- Taq rub'anikil: tzij, rajilab'al, tacha' (b'anel), retal, ruxak tz'ib'axik
- Tawokisaj ri ch'ob'onik: k'atz'in, ch'in/nim raqän tzij, ch'in/nim rajil
- Tachajij ri k'utb'al: tacha' jas taq ruk'utb'al e k'ut chwech ajpatanib'
- Tacha' ri uxe'k b'ey ruk' ruk'ayb'al pa ruwi' / chi k'aj
- Nim raqän 20 ruk'utb'al, nim raqän 50 wokisaxik pa jachonik ruk'utb'al tacha'

Ri ruk'utb'al etz'apwach e tz'aq etz'apwach ruk' ri okisaxik tz'ib'axik. Ri ajk'ayb'al man tits'il ta.

### Ch'ab'äl taq sipan

Tatz'ib'aj ch'ab'äl IVR awi' chike chi jujun ch'ab'äl. Ri qasamaj kuk'ay ri awoyonik chike ri tzolijik rutzijol, CAPTCHA, ch'awib'al, chuqa' ch'ab'äl yakb'äl. Jawi' majun qasamaj, kuk'ay ri ch'ab'äl pa tzij.

### B'eyab' tzijob'exik

Tawokisaj SMS, WhatsApp, chuqa' Signal b'eyab':

- **SMS** — tajaq/tachup, tawokisaj rutzijol chik jun ruk'ayb'al. Kuk'ay ri junam k'utunel je' ri awokisaxik ch'ab'äl (Twilio, SignalWire, Vonage, o Plivo).
- **WhatsApp** — tajaq/tachup, tak'oj Meta Cloud API retalib'al (token okisan, token ch'ob'onik, rajilab'al teléfono). Kuk'ay taq tzijob'äl rub'anikil chike ri tik'otob' ch'awib'al pa ri 24 hora' ch'awib'al.
- **Signal** — tajaq/tachup, tawokisaj ri signal-cli-rest-api puerta URL chuqa' rajilab'al teléfono. Kuk'ay chajinik ruk' utzil k'ojik.

Chi jujun b'eyal k'oj ri uxe'k Webhook — tatz'eta ri [Tik'otob'](/docs/deploy) chike ri URL taq nik'oj.

### WebAuthn runik'oj

We nawaj, tak'oj passkey chike k'amalb'e, ajpatanib', o kakib'. Toq k'atz'in, ri winak kakik'oj jun passkey chi k'a chwech kikowin kik'ay ri runik'oj.

## Toq'ob' pa ri runik'oj

Ri **Toq'ob'** ruxak kuk'ay:
- FAQ: Tik'otob', Siponik chuqa' Ch'akul taq Ri', Tz'ib'axik chuqa' Etz'apwach, K'amb'ej
- Ruk'amonik chi kij taq patanijel chwech k'amalb'e, ajpatanib', chuqa' ajal q'axeb'al tzij
- Taq wuj chike ri ukojik majtani' kib'ey chawib'al chuqa' chajinik
- FAQ ri takowin tajaq/tachup

Ri k'utb'al k'amalb'e kuk'ut jun **ch'ob'onik ruk' wokisaxik** ri kuk'ut ri rach'ik wokisaxik (tawokisaj b'eyab', tatz'aq ajpatanib', tikojo ch'akul taq ri', etc.).

## Etal raqan chajinik

Ri **Etal Raqan** ruxak kuk'ut jun ruxak k'olol taq jastaq pa ri runik'oj: taq tak'ij, taq k'ulik siponik, taq b'anik tz'ib'axik, taq nik'oj taq runik'oj, chuqa' taq b'anik k'amalb'e. Ri okisan e tz'aq ruk' rajilab'al IP etz'apwach chuqa' retalib'al tinamit. Tacha' uxe'k ruk' taq uxojik chike ri e chik.

## Etal taq siponik

Ri **Siponik** ruxak kuk'ut konojel taq siponik ruk' rajal, q'otij, chuqa' ajpatan ya'on. Tacha' ruk' q'ij o takanoj chik rij rajilab'al teléfono. Taya' ri tzij pa GDPR-compliant JSON rub'anikil.
