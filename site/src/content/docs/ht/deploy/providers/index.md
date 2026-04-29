---
title: Founisè Telefoni yo
description: Konpare founisè telefoni ki sipòte yo epi chwazi sa ki pi bon pou liy dirèk ou a.
---

Llamenos sipòte plizyè founisè telefoni atravè **TelephonyAdapter** interface li a. Ou ka chanje founisè nenpòt lè nan paramèt administratè yo san chanje okenn kòd aplikasyon.

## Founisè ki sipòte

| Founisè | Tip | Modèl Pri | Sipò WebRTC | Difikilte Setup | Pi Bon Pou |
|---|---|---|---|---|---|
| **Twilio** | Cloud | Pa minit | Wi | Fasil | Kòmanse rapid |
| **SignalWire** | Cloud | Pa minit (pi bon mache) | Wi | Fasil | Òganizasyon ki vle ekonomize |
| **Vonage** | Cloud | Pa minit | Wi | Mwayen | Kouvèti entènasyonal |
| **Plivo** | Cloud | Pa minit | Wi | Mwayen | Opsyon cloud ekonomik |
| **Asterisk** | Ebèje pa ou menm | Koût SIP trunk sèlman | Wi (SIP.js) | Difisil | Maksimòm konfidansyalite, deplwaman a gran echèl |

## Konparezon pri

Koût apwoksimatif pa minit pou apèl vwa US (pri varye selon rejyon ak volim):

| Founisè | Antre | Sòti | Nimewo Telefòn | Nivo Gratis |
|---|---|---|---|---|
| Twilio | $0.0085 | $0.014 | $1.15/mwa | Kredi esè |
| SignalWire | $0.005 | $0.009 | $1.00/mwa | Kredi esè |
| Vonage | $0.0049 | $0.0139 | $1.00/mwa | Kredi gratis |
| Plivo | $0.0055 | $0.010 | $0.80/mwa | Kredi esè |
| Asterisk | Tarif SIP trunk | Tarif SIP trunk | Nan men founisè SIP | N/A |

Tout founisè cloud yo fakture pa minit ak presizyon pa segonn. Koût Asterisk depann de founisè SIP trunk ou ak ebèjman sèvè.

## Matris sipò fonksyon

| Fonksyon | Twilio | SignalWire | Vonage | Plivo | Asterisk |
|---|---|---|---|---|---|
| Anrejistreman apèl | Wi | Wi | Wi | Wi | Wi |
| Transkripsyon an dirèk | Wi | Wi | Wi | Wi | Wi (atravè pon) |
| Voice CAPTCHA | Wi | Wi | Wi | Wi | Wi |
| Mesajri vokal | Wi | Wi | Wi | Wi | Wi |
| Apèl navigatè WebRTC | Wi | Wi | Wi | Wi | Wi (SIP.js) |
| Validasyon webhook | Wi | Wi | Wi | Wi | Pèsonalize (HMAC) |
| Sonnen plizyè moun anmenmtan | Wi | Wi | Wi | Wi | Wi |
| Fil datant / mizik datant | Wi | Wi | Wi | Wi | Wi |

## Kijan pou konfigire

1. Ale nan **Settings** nan ba kote administratè a
2. Ouvri seksyon **Telephony Provider** a
3. Chwazi founisè ou a nan lis dewoulant la
4. Antre idantifyan ki nesesè yo (chak founisè gen diferan chan)
5. Mete nimewo telefòn liy dirèk ou a nan fòma E.164 (pa egzanp, `+15551234567`)
6. Klike sou **Save**
7. Konfigire webhook yo nan konsòl founisè ou a pou dirije yo nan enstans Llamenos ou a

Gade gid setup endividyèl yo pou enstriksyon etap pa etap:

- [Setup: Twilio](/docs/deploy/providers/twilio)
- [Setup: SignalWire](/docs/deploy/providers/signalwire)
- [Setup: Vonage](/docs/deploy/providers/vonage)
- [Setup: Plivo](/docs/deploy/providers/plivo)
- [Setup: Asterisk (Ebèje Pa Ou Menm)](/docs/deploy/providers/asterisk)
- [Apèl nan Navigatè ak WebRTC](/docs/deploy/providers/webrtc)
