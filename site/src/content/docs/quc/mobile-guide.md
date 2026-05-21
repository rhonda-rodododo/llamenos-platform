---
title: Ruk'amonik Chapb'äl
description: Tikojo chuqa' tawokisaj ri Llamenos chapb'äl pa iOS chuqa' Android.
---

Ri Llamenos chapb'äl kuya' b'ey chike ajpatanib' kekisipon tak'ul, ke'atak b'aq' chike taq tzijob'äl, chuqa' ketz'ib'aj taq ch'ab'äl etz'apwach pa kichapb'äl. Tikojo ruk' React Native chuqa' kuk'ay ri junam Rust etz'apwach ruk' ri desktop runik'oj.

## Jas ri chapb'äl?

Ri chapb'äl jun toq'ob' ri kidk'oj che ri desktop runik'oj. Kuk'ay ri junam Llamenos ajk'ayb'al (Cloudflare Workers o tikojo tik'otob') chuqa' kuk'ay ri junam protocolo, rumal ri ajpatanib' kitkowin kek'ay uxe'k chikij kichapb'äl chuqa' kidesktop.

Ri chapb'äl k'oj pa jun repositorio chik (`llamenos-platform`) chuwach kuk'ay:

- **llamenos-core** — Ri junam Rust crate chi kij ronojel taq etz'apwach chak, tik'otob' ruk' UniFFI chike iOS chuqa' Android
- **Protocolo** — Ri junam rub'anikil tzij, API endpoints, chuqa' rub'anikil etz'apwach
- **Ajk'ayb'al** — Ri junam Cloudflare Worker o tikojo tik'otob' servidor

## Tak'aj chuqa' tikojo

### Android

Ri chapb'äl tak'aj je' APK chike tikaq:

1. Tatz'aj ri k'ak' `.apk` wuj pa ri [GitHub Releases](https://github.com/rhonda-rodododo/llamenos-platform/releases/latest) ruxak
2. Pa ri AAndroid chapb'äl, tab'e pa **Runik'oj > Chajinik** chuqa' tajaq **Tikojo pa taq ruk'utb'al majun keta'm** (o tajaq pa jachonik runik'oj toq k'ut)
3. Tajaq ri APK tz'aj chuqa' tatz'aq pa **Tikojo**
4. Toq tikojo, tajaq Llamenos pa ri aruxak runik'oj

Ri App Store chuqa' Play Store tak'ajik k'ot chwech pa jun k'ak' k'axik.

### iOS

Ri iOS taq tikojo e k'oj je' TestFlight beta:

1. Tikojo [TestFlight](https://apps.apple.com/app/testflight/id899247664) pa ri App Store
2. Takanoj che ri ak'amalb'e ri TestFlight sipan b'ey
3. Tajaq ri sipan b'ey pa ri AiOS chapb'äl chike tak'ij pa ri beta
4. Tikojo Llamenos pa TestFlight

Ri App Store tak'ajik k'ot chwech pa jun k'ak' k'axik.

## Nab'ej nik'oj

Ri chapb'äl tik'otob' ruk' k'ayb'al ruk' jun k'ojik desktop cuenta. Ri re' kuk'ut chi ri junam etz'apwach achi'el tik'ayew chi chi kij taq chapb'äl majun uxojik ri etz'apwach clave pa tzij.

### Nik'oj chapb'äl (QR scan)

1. Tajaq ri Llamenos desktop runik'oj chuqa' tab'e pa **Runik'oj > Taq Chapb'äl**
2. Tatz'aq pa **Tak'ay K'ak' Chapb'äl** — re' kuk'otob' jun QR chib'äl ri kuk'ay jun sipan token
3. Tajaq ri Llamenos chapb'äl chuqa' tatz'aq pa **Tak'ay Chapb'äl**
4. Tach'aj ri QR chib'äl ruk' ri achateléfono
5. Ri taq runik'oj keb'an jun ECDH etz'apwach k'ayb'al chike kik'ay ri aetz'apwach wuj
6. Taya' jun PIN pa ri chapb'äl chike tachajij ri yakb'al etz'apwach
7. Ri chapb'äl tz'aq chuqa' k'oj chike okisaxik

Ri nik'oj man kutik ta ri ansec pa tzij. Ri desktop runik'oj k'ayew ri wuj ruk' ri etz'apwach k'ayb'al, chuqa' ri chapb'äl kujaq pa rokiyonel.

### Nik'oj ruk' aq'ab' (nsec okisan)

We man takowin tak' ch'aj ri QR chib'äl, takowin tak'oj ri nsec:

1. Tajaq ri chapb'äl chuqa' tatz'aq pa **Tak'oj nsec ruk' aq'ab'**
2. Tapaq'apij ri `nsec1...` clave
3. Taya' jun PIN chike tachajij ri yakb'al
4. Ri runik'oj kuk'otob' ri apública clave chuqa' tik'ay' ri' ruk' ri ajk'ayb'al

Ri b'ey re' k'atz'in chike tach'aj ri nsec, rumal ri xwi tik'oj we man k'oj ta ri nik'oj chapb'äl. Tach'ab'ej jun chajinik tzij chike tapoq'opij ri nsec.

## Tatz'eqelaj ri taq patan

| Patan | Desktop | Chapb'äl |
|---|---|---|
| Tak'ul siponik ri e k'ayew | Je' | Je' |
| Tatz'ib'aj taq ch'ab'äl etz'apwach | Je' | Je' |
| Taq ruk'utb'al tz'ib'axik | Je' | Je' |
| Tab'aq' chike taq tzijob'äl (SMS, WhatsApp, Signal) | Je' | Je' |
| Tak'ut taq ch'awib'al | Je' | Je' |
| Rajal ch'akul ri' chuqa' q'uq'j | Je' | Je' |
| Tzijtz'ib'axik pa rokiyonel nuk'samaj chib'äl | Je' (WASM Whisper) | Maj |
| Kanolaj tz'ib'axik | Je' | Je' |
| Wokisaxik chib'äl | Je' (Ctrl+K) | Maj |
| Kib'ey chawib'al | Je' | Maj |
| Runik'oj k'amalb'e | Je' (konojel) | Je' (xwi) |
| Tak'axaj ajpatanib' | Je' | Xwi k'utik |
| Tak'ut etal raqan | Je' | Je' |
| WebRTC siponik pa nuk'samaj chib'äl | Je' | Maj (ruxwach ateléfono) |
| Tzijol okisan | OS taq tzijol | Native push (FCM/APNS) |
| Tik'otob' chik | Tauri updater | App Store / TestFlight |
| Taq wuj e tz'aq (q'axeb'al tzij) | Je' | Je' |

## Taq ruch'ijik

- **Majun tzijtz'ib'axik pa rokiyonel nuk'samaj chib'äl** — Ri WASM Whisper k'atz'in nim raqän ch'obonic chuqa' CPU chak ri man k'oj ta pa chapb'äl. Ri tzijtz'ib'axik siponik xwi k'oj pa desktop.
- **Ch'in etz'apwach chak** — We taq chapb'äl kuk'ay ri junam Rust etz'apwach ruk' UniFFI, ri taq chak kakowin keb'e ch'in uxe'k pa taq chapb'äl ri majun nim raqän.
- **Xwi taq patan k'amalb'e** — Jujun taq chak k'amalb'e (tak'axaj ajpatanib' ruk' oyob'al, nik'oj taq runik'oj) xwi k'oj pa desktop. Ri chapb'äl kuk'ay k'utik xwi.
- **Majun WebRTC siponik** — Ri ajpatanib' ruk' chapb'äl kek'ul taq siponik pa kichapb'äl ruk' ri k'utunel telefonía, man pa nuk'samaj chib'äl ta.
- **Ch'alku' chuqa' k'ayb'al** — Ri runik'oj k'atz'in jun k'oj k'ayb'al chike k'ulik taq k'ak' tzij. Ri k'olol chak pa ruxak tikowin tik'otob' chike ri k'olol Chajinik Ch'alku'. Tachajij ri runik'oj pa ri nuk'samaj chib'äl pa ri ach'akul ri' chike k'oj taq tzijol.

## Ruchojmil taq jastaq ruk' chapb'äl

### Nik'oj ch'ayik ruk' "QR chib'äl majun utzil"

- Tachajij chi ri QR chib'äl xb'an chik (taq nik'oj token e kedox 5 minutos)
- Tikojo jun k'ak' QR chib'äl pa ri desktop runik'oj chuqa' tach'aj jumul chik
- Tachajij chi ri taq chapb'äl e k'ayew pa internet

### Man k'ul ta tzijol okisan

- Tachajij chi ri tzijol okisan e tijaq chwech Llamenos pa ri aruxak runik'oj
- Pa Android: Tab'e pa **Runik'oj > Runik'oj > Llamenos > Tzijol** chuqa' tajaq konojel taq b'eyab'
- Pa iOS: Tab'e pa **Runik'oj > Tzijol > Llamenos** chuqa' tajaq **Taya' b'ey Tzijol**
- Tachajij chi man k'o ta pa modoj Do Not Disturb
- Tachajij chi ri ach'akul ri' k'oj chuqa' man k'o ta pa q'uq'j

### Runik'oj koch'ayik pa ri tik'otob'

- Tachajij chi ri k'ak' rub'anikil ri runik'oj tik'otob'
- Tachup ri runik'oj cache: **Runik'oj > Runik'oj > Llamenos > Yakb'al > Tachup Cache**
- We ri mak k'oj chik, tiyuj chuqa' tikojo jumul chik (tak'atzin tatzolin tak'ay ri chapb'äl)

### Man takowin ta tak'ektaj ri etz'apwach tz'ib'axik chrij tiyujik

- Ri tiyujik ri runik'oj kuyuj ri etz'apwach wuj
- Tak'ay jumul ri chapb'äl ruk' QR chib'äl pa ri desktop runik'oj
- Ri tz'ib'axik etz'apwach chi k'a chwech ri tiyujik e k'ol wi toq ri chapb'äl tak'ay jumul ruk' ri junam achi'el

### K'ayew chak pa taq chapb'äl e ch'in

- Tach'apij chi nik'aj taq runik'oj chike kejotaj ri ch'obonic
- Tachup animaciones pa ri runik'oj we k'oj
- K'ot pa ri desktop runik'oj chike taq chak ri e k'atz'in je' ch'ajoj tz'ib'axik ruk' oyob'al
