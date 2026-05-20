---
title: Bixiyeyaasha Telefoonada
description: Isbarbar dhig bixiyeyaasha telefoonada ee la taageero oo dooro kan ugu habboon khadkaaga gurmadka.
---

Llámenos wuxuu taageeraa bixiyeyaasho telefoon oo badan iyada oo loo marayo interface-ka **TelephonyAdapter**. Waad beddeli kartaa bixiyeyaasha wakhti kasta dejinta maamulka iyada oo aan la beddelin koodka abka.

## Bixiyeyaasha la taageero

| Bixiyaha | Nooca | Qaabka Qiimaynta | Taageerada WebRTC | Kakanta Dejinta | Ugu Wanaagsan |
|---|---|---|---|---|---|
| **Twilio** | Daruura | Daqiiqad kasta | Haa | Fudud | Bilowga degdegga ah |
| **SignalWire** | Daruura | Daqiiqad kasta (ka jaban) | Haa | Fudud | Ururrada miisaamiyaya kharashka |
| **Vonage** | Daruura | Daqiiqad kasta | Haa | Dhexdhexaad | Daboolka caalamiga ah |
| **Plivo** | Daruura | Daqiiqad kasta | Haa | Dhexdhexaad | Ikhtiyaarka kaydka miisaaniyadda |
| **Telnyx** | Daruura | Daqiiqad kasta | Haa | Dhexdhexaad | Soo-saare-saaxiibtinimo |
| **Bandwidth** | Daruura | Daqiiqad kasta | Haa | Dhexdhexaad | Heerka sidaha Mareykanka |
| **Asterisk** | Is-hawlgab | Qiimaha SIP trunk oo keliya | Haa (sip-bridge) | Adag | Qarsoonnimada ugu badan |
| **FreeSWITCH** | Is-hawlgab | Qiimaha SIP trunk oo keliya | Haa (sip-bridge) | Adag | Mugga sare |

## Isbarbardhigga qiimaynta

Qiimaha qiyaasta daqiiqad kasta wicitaannada codka Mareykanka (way ku kala duwan yihiin gobolka iyo mugga):

| Bixiyaha | Soo-gala | Kac-bax | Lambarka Taleefanka | Heerka Bilaashka |
|---|---|---|---|---|
| Twilio | $0.0085 | $0.014 | $1.15/bishii | Tijaabo amaano |
| SignalWire | $0.005 | $0.009 | $1.00/bishii | Tijaabo amaano |
| Vonage | $0.0049 | $0.0139 | $1.00/bishii | Amaano bilaash ah |
| Plivo | $0.0055 | $0.010 | $0.80/bishii | Tijaabo amaano |
| Telnyx | $0.005 | $0.009 | $1.00/bishii | Tijaabo amaano |
| Asterisk | Heerka SIP trunk | Heerka SIP trunk | Bixiyaha SIP | N/A |

## Shaxda taageerada astaamaha

| Astaanta | Twilio | SignalWire | Vonage | Plivo | Asterisk |
|---|---|---|---|---|---|
| Duubista wicitaanka | Haa | Haa | Haa | Haa | Haa |
| Qoraal-qaadista tooska ah | Haa | Haa | Haa | Haa | Haa (buundada) |
| CAPTCHA codka | Haa | Haa | Haa | Haa | Haa |
| Farriinta codka | Haa | Haa | Haa | Haa | Haa |
| Wicitaannada WebRTC ee browserka | Haa | Haa | Haa | Haa | Haa (SIP.js) |
| Xaqiijinta webhook-ka | Haa | Haa | Haa | Haa | Gaar (HMAC) |
| Dhawaq isku mar ah | Haa | Haa | Haa | Haa | Haa |

## Buundada SIP

Bixiyeyaasha la is-hawlgabeeyay (Asterisk, FreeSWITCH, Kamailio) waxaa loo maraa adeegga `sip-bridge`. Ku deji doorsoomaha deegaanka `PBX_TYPE` si aad u doorato backend-ka:

```env
PBX_TYPE=asterisk      # Asterisk ARI
PBX_TYPE=freeswitch    # FreeSWITCH ESL
PBX_TYPE=kamailio      # Kamailio
```

## Sida loo qaabeeyo

1. U gudub **Settings** liiska dhinaca maamulka
2. Fur qaybta **Telephony Provider**
3. Dooro bixiyahaaga hoos-u-dhaca
4. Gali aqoonsiyaha loo baahan yahay
5. Deji lambarka taleefanka khadkaaga gurmadka qaabka E.164 (tusaale, `+15551234567`)
6. Guji **Save**
7. Qaabee webhooks-ka console-ka bixiyahaaga

Ka eeg tilmaamaha bixiye kasta:

- [Deji: Twilio](/docs/en/deploy/providers/twilio)
- [Deji: SignalWire](/docs/en/deploy/providers/signalwire)
- [Deji: Vonage](/docs/en/deploy/providers/vonage)
- [Deji: Plivo](/docs/en/deploy/providers/plivo)
- [Deji: Asterisk (Is-hawlgab)](/docs/en/deploy/providers/asterisk)
- [Deji: SMS](/docs/en/deploy/providers/sms)
- [Deji: WhatsApp](/docs/en/deploy/providers/whatsapp)
- [Deji: Signal](/docs/en/deploy/providers/signal)
- [Wicitaannada WebRTC ee Browserka](/docs/en/deploy/providers/webrtc)
