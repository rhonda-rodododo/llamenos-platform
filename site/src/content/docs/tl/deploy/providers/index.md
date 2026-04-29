---
title: Mga Telephony Provider
description: Ihambing ang mga sinusuportahang telephony provider at piliin ang pinakamainam para sa iyong hotline.
---

Sinusuportahan ng Llamenos ang maraming telephony provider sa pamamagitan ng **TelephonyAdapter** interface nito. Maaari kang lumipat ng provider anumang oras mula sa admin settings nang hindi binabago ang anumang application code.

## Mga sinusuportahang provider

| Provider | Uri | Modelo ng Presyo | WebRTC Support | Kahirapan ng Setup | Pinakamainam Para Sa |
|---|---|---|---|---|---|
| **Twilio** | Cloud | Bawat minuto | Oo | Madali | Mabilis na pagsisimula |
| **SignalWire** | Cloud | Bawat minuto (mas mura) | Oo | Madali | Mga organisasyong nagtitipid |
| **Vonage** | Cloud | Bawat minuto | Oo | Katamtaman | Internasyonal na saklaw |
| **Plivo** | Cloud | Bawat minuto | Oo | Katamtaman | Murang cloud na opsyon |
| **Asterisk** | Self-hosted | Gastos lang ng SIP trunk | Oo (SIP.js) | Mahirap | Pinakamataas na privacy, deployment sa malaking sukat |

## Paghahambing ng presyo

Tinatayang gastos bawat minuto para sa US voice call (nagbabago ang presyo ayon sa rehiyon at dami):

| Provider | Papasok | Papalabas | Numero ng Telepono | Libreng Tier |
|---|---|---|---|---|
| Twilio | $0.0085 | $0.014 | $1.15/buwan | Trial credit |
| SignalWire | $0.005 | $0.009 | $1.00/buwan | Trial credit |
| Vonage | $0.0049 | $0.0139 | $1.00/buwan | Libreng credit |
| Plivo | $0.0055 | $0.010 | $0.80/buwan | Trial credit |
| Asterisk | Presyo ng SIP trunk | Presyo ng SIP trunk | Mula sa SIP provider | N/A |

Lahat ng cloud provider ay singil bawat minuto na may per-second granularity. Ang gastos ng Asterisk ay depende sa iyong SIP trunk provider at server hosting.

## Matrix ng suportang feature

| Feature | Twilio | SignalWire | Vonage | Plivo | Asterisk |
|---|---|---|---|---|---|
| Pag-record ng tawag | Oo | Oo | Oo | Oo | Oo |
| Live transcription | Oo | Oo | Oo | Oo | Oo (sa pamamagitan ng bridge) |
| Voice CAPTCHA | Oo | Oo | Oo | Oo | Oo |
| Voicemail | Oo | Oo | Oo | Oo | Oo |
| WebRTC browser calling | Oo | Oo | Oo | Oo | Oo (SIP.js) |
| Webhook validation | Oo | Oo | Oo | Oo | Custom (HMAC) |
| Parallel ringing | Oo | Oo | Oo | Oo | Oo |
| Queue / hold music | Oo | Oo | Oo | Oo | Oo |

## Paano i-configure

1. Mag-navigate sa **Settings** sa admin sidebar
2. Buksan ang seksyong **Telephony Provider**
3. Piliin ang iyong provider mula sa dropdown
4. Ilagay ang kinakailangang mga kredensyal (iba-iba ang mga field sa bawat provider)
5. Itakda ang numero ng telepono ng iyong hotline sa E.164 format (hal., `+15551234567`)
6. I-click ang **Save**
7. I-configure ang mga webhook sa console ng iyong provider para tumuro sa iyong Llamenos instance

Tingnan ang mga indibidwal na setup guide para sa hakbang-hakbang na mga tagubilin:

- [Setup: Twilio](/docs/deploy/providers/twilio)
- [Setup: SignalWire](/docs/deploy/providers/signalwire)
- [Setup: Vonage](/docs/deploy/providers/vonage)
- [Setup: Plivo](/docs/deploy/providers/plivo)
- [Setup: Asterisk (Self-Hosted)](/docs/deploy/providers/asterisk)
- [WebRTC Browser Calling](/docs/deploy/providers/webrtc)
