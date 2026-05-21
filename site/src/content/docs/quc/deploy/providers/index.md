---
title: Telephony Providers
description: Rucha'ik taq telephony providers nik'oj chuqa' tacha' ri utziläj richin awachib'al.
---

Llamenos nrokisaj k'ïy taq telephony providers via ri **TelephonyAdapter** interface. Yatikïr najäl providers pa jub'ey k'ak'a' samajib'äl pa admin ruchojmil majun rujal rucholaj samaj.

## Taq providers nik'oj

| Provider | Ruwäch | Rutz'aqat Model | WebSocket Support | Ruchojmil Ruk'ayewal | Utziläj richin |
|---|---|---|---|---|---|
| **Twilio** | Cloud | Per-minute | Yes | Easy | Rutikirib'al samaj anin |
| **SignalWire** | Cloud | Per-minute (yalan) | Yes | Easy | Taq k'ayib'äl nik'oj ruk'ayewal |
| **Vonage** | Cloud | Per-minute | Yes | Medium | International coverage |
| **Plivo** | Cloud | Per-minute | Yes | Medium | Budget cloud rucha'ik |
| **Telnyx** | Cloud | Per-minute | Yes | Medium | Developer-friendly |
| **Bandwidth** | Cloud | Per-minute | Yes | Medium | US carrier-grade |
| **Asterisk** | Self-hosted | Xa SIP trunk toj | Yes (via sip-bridge) | Hard | Ruk'u'x samaj rutzil |
| **FreeSWITCH** | Self-hosted | Xa SIP trunk toj | Yes (via sip-bridge) | Hard | High-volume |

## Rutz'aqat rucha'ik

Approximate per-minute taq toj richin US voice calls (yalan pa region chuqa' volume):

| Provider | Inbound | Outbound | Phone Number | Free Tier |
|---|---|---|---|---|
| Twilio | $0.0085 | $0.014 | $1.15/month | Trial credit |
| SignalWire | $0.005 | $0.009 | $1.00/month | Trial credit |
| Vonage | $0.0049 | $0.0139 | $1.00/month | Free credit |
| Plivo | $0.0055 | $0.010 | $0.80/month | Trial credit |
| Telnyx | $0.005 | $0.009 | $1.00/month | Trial credit |
| Asterisk | SIP trunk rate | SIP trunk rate | Pa SIP provider | N/A |

## Feature support matrix

| Feature | Twilio | SignalWire | Vonage | Plivo | Asterisk |
|---|---|---|---|---|---|
| Call recording | Yes | Yes | Yes | Yes | Yes |
| Live transcription | Yes | Yes | Yes | Yes | Yes (via bridge) |
| Voice CAPTCHA | Yes | Yes | Yes | Yes | Yes |
| Voicemail | Yes | Yes | Yes | Yes | Yes |
| WebRTC browser calling | Yes | Yes | Yes | Yes | Yes (SIP.js) |
| Webhook validation | Yes | Yes | Yes | Yes | Custom (HMAC) |
| Parallel ringing | Yes | Yes | Yes | Yes | Yes |

## SIP bridge

Self-hosted taq providers (Asterisk, FreeSWITCH, Kamailio) ye'ok via ri `sip-bridge` samaj. Tiya' ri `PBX_TYPE` ruk'u'x samaj ruchojmil richin nucha' ri backend:

```env
PBX_TYPE=asterisk      # Asterisk ARI
PBX_TYPE=freeswitch    # FreeSWITCH ESL
PBX_TYPE=kamailio      # Kamailio
```

## Achike rub'eyal ruchojmil

1. Katb'e pa **Settings** pa ri admin sidebar
2. Tijaq ri **Telephony Provider** peraj
3. Tacha' aw provider pa ri dropdown
4. Tiya' ri ruk'utun taq ewan taq tzij
5. Tiya' awachib'al hotline rajilab'al pa E.164 ruwäch (achike, `+15551234567`)
6. Tipitz' **Save**
7. Ruchojmil taq webhooks pa aw provider's console

Katz'eto' junjun taq ruchojmil taq ruchojmil:

- [Ruchojmil: Twilio](/docs/en/deploy/providers/twilio)
- [Ruchojmil: SignalWire](/docs/en/deploy/providers/signalwire)
- [Ruchojmil: Vonage](/docs/en/deploy/providers/vonage)
- [Ruchojmil: Plivo](/docs/en/deploy/providers/plivo)
- [Ruchojmil: Asterisk (Self-Hosted)](/docs/en/deploy/providers/asterisk)
- [Ruchojmil: SMS](/docs/en/deploy/providers/sms)
- [Ruchojmil: WhatsApp](/docs/en/deploy/providers/whatsapp)
- [Ruchojmil: Signal](/docs/en/deploy/providers/signal)
- [WebRTC Browser Calling](/docs/en/deploy/providers/webrtc)
