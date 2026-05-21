---
title: Pêşkêşkarên Telefoniyê
description: Pêşkêşkarên telefoniya piştgirî berhev bikin û ya herî baş ji bo hotline ya we hilbijêrin.
---

Llamenos bi navgîniya rûyê **TelephonyAdapter** xwe ji gelek pêşkêşkarên telefoniyê re piştgirî dide. Hûn dikarin bi kêmanî ji mîhengên rêveberiyê pêşkêşkar biguherin bêyî ku kodê serîlêdanê biguherin.

## Pêşkêşkarên piştgirî

| Pêşkêşkar | Cure | Modela Bihayê | Piştgirîya WebRTC | Zehmetiya Sazkirinê | Herî Baş Ji Bo |
|---|---|---|---|---|---|
| **Twilio** | Cloud | Li gorî deqîqe | Erê | Hesan | Bi lez dest pê kirin |
| **SignalWire** | Cloud | Li gorî deqîqe (erzantir) | Erê | Hesan | Saziyên li ser lêçûnê |
| **Vonage** | Cloud | Li gorî deqîqe | Erê | Navîn | Berfirehbûna navneteweyî |
| **Plivo** | Cloud | Li gorî deqîqe | Erê | Navîn | Vebijarka cloud-a erzan |
| **Telnyx** | Cloud | Li gorî deqîqe | Erê | Navîn | Ji bo pêşvebiran hêsan |
| **Bandwidth** | Cloud | Li gorî deqîqe | Erê | Navîn | Kalîteya US carrier-grade |
| **Asterisk** | Xweser | Tenê lêçûna SIP trunk | Erê (bi sip-bridge) | Zehmet | Ewlehiya herî zêde |
| **FreeSWITCH** | Xweser | Tenê lêçûna SIP trunk | Erê (bi sip-bridge) | Zehmet | Bilind-hêjmara bangên |

## Berawirdkirina bihan

Lêçûnên texmînbûyî ji bo bangên dengê li DYA (li gorî herêm û hêjmara bangên diguherin):

| Pêşkêşkar | Hatî | Çûyî | Hejmara Telefonê | Asteya Belaş |
|---|---|---|---|---|
| Twilio | $0.0085 | $0.014 | $1.15/heyv | Krediya ceribandinê |
| SignalWire | $0.005 | $0.009 | $1.00/heyv | Krediya ceribandinê |
| Vonage | $0.0049 | $0.0139 | $1.00/heyv | Krediya belaş |
| Plivo | $0.0055 | $0.010 | $0.80/heyv | Krediya ceribandinê |
| Telnyx | $0.005 | $0.009 | $1.00/heyv | Krediya ceribandinê |
| Asterisk | Rêjeya SIP trunk | Rêjeya SIP trunk | Ji pêşkêşkarê SIP | N/A |

## Matrîksa piştgirîya taybetmendiyan

| Taybetmendî | Twilio | SignalWire | Vonage | Plivo | Asterisk |
|---|---|---|---|---|---|
| Tomarkirina bangê | Erê | Erê | Erê | Erê | Erê |
| Transkripsiyona zindî | Erê | Erê | Erê | Erê | Erê (bi bridge) |
| Voice CAPTCHA | Erê | Erê | Erê | Erê | Erê |
| Peyama dengî | Erê | Erê | Erê | Erê | Erê |
| WebRTC browser calling | Erê | Erê | Erê | Erê | Erê (SIP.js) |
| Webhook validation | Erê | Erê | Erê | Erê | Xweser (HMAC) |
| Parallel ringing | Erê | Erê | Erê | Erê | Erê |

## SIP bridge

Pêşkêşkarên xweser (Asterisk, FreeSWITCH, Kamailio) bi navgîniya karûbarek `sip-bridge` têne gihiştin. Guhertoya hawirdorê `PBX_TYPE` saz bikin da ku backend hilbijêrin:

```env
PBX_TYPE=asterisk      # Asterisk ARI
PBX_TYPE=freeswitch    # FreeSWITCH ESL
PBX_TYPE=kamailio      # Kamailio
```

## Çawa were sazkirin

1. Biçin **Settings** di sidebar-a rêveber de
2. Beşa **Telephony Provider** vekin
3. Pêşkêşkarê xwe ji menuya daketinê hilbijêrin
4. Nasnameyên pêwîst têkevin
5. Hejmara hotline ya xwe di formata E.164 de saz bikin (mînak, `+15551234567`)
6. **Save** bikirtînin
7. Webhookan di panela pêşkêşkarê xwe de saz bikin

Rêberên sazkirina takekesî bibînin:

- [Sazkirin: Twilio](/docs/en/deploy/providers/twilio)
- [Sazkirin: SignalWire](/docs/en/deploy/providers/signalwire)
- [Sazkirin: Vonage](/docs/en/deploy/providers/vonage)
- [Sazkirin: Plivo](/docs/en/deploy/providers/plivo)
- [Sazkirin: Asterisk (Xweser)](/docs/en/deploy/providers/asterisk)
- [Sazkirin: SMS](/docs/en/deploy/providers/sms)
- [Sazkirin: WhatsApp](/docs/en/deploy/providers/whatsapp)
- [Sazkirin: Signal](/docs/en/deploy/providers/signal)
- [WebRTC Browser Calling](/docs/en/deploy/providers/webrtc)
