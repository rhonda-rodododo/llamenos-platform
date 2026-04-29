---
title: Telephony Providers
description: Compare supported telephony providers and choose the best fit for your hotline.
---

Llamenos supports multiple telephony providers through its **TelephonyAdapter** interface. You can switch providers at any time from admin settings without changing application code.

## Supported providers

| Provider | Type | Pricing Model | WebRTC Support | Setup Difficulty | Best For |
|---|---|---|---|---|---|
| **Twilio** | Cloud | Per-minute | Yes | Easy | Getting started quickly |
| **SignalWire** | Cloud | Per-minute (cheaper) | Yes | Easy | Cost-conscious organizations |
| **Vonage** | Cloud | Per-minute | Yes | Medium | International coverage |
| **Plivo** | Cloud | Per-minute | Yes | Medium | Budget cloud option |
| **Telnyx** | Cloud | Per-minute | Yes | Medium | Developer-friendly |
| **Bandwidth** | Cloud | Per-minute | Yes | Medium | US carrier-grade |
| **Asterisk** | Self-hosted | SIP trunk cost only | Yes (via sip-bridge) | Hard | Maximum privacy |
| **FreeSWITCH** | Self-hosted | SIP trunk cost only | Yes (via sip-bridge) | Hard | High-volume |

## Pricing comparison

Approximate per-minute costs for US voice calls (vary by region and volume):

| Provider | Inbound | Outbound | Phone Number | Free Tier |
|---|---|---|---|---|
| Twilio | $0.0085 | $0.014 | $1.15/month | Trial credit |
| SignalWire | $0.005 | $0.009 | $1.00/month | Trial credit |
| Vonage | $0.0049 | $0.0139 | $1.00/month | Free credit |
| Plivo | $0.0055 | $0.010 | $0.80/month | Trial credit |
| Telnyx | $0.005 | $0.009 | $1.00/month | Trial credit |
| Asterisk | SIP trunk rate | SIP trunk rate | From SIP provider | N/A |

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

Self-hosted providers (Asterisk, FreeSWITCH, Kamailio) are accessed via the `sip-bridge` service. Set the `PBX_TYPE` environment variable to select the backend:

```env
PBX_TYPE=asterisk      # Asterisk ARI
PBX_TYPE=freeswitch    # FreeSWITCH ESL
PBX_TYPE=kamailio      # Kamailio
```

## How to configure

1. Navigate to **Settings** in the admin sidebar
2. Open the **Telephony Provider** section
3. Select your provider from the dropdown
4. Enter the required credentials
5. Set your hotline phone number in E.164 format (e.g., `+15551234567`)
6. Click **Save**
7. Configure webhooks in your provider's console

See individual setup guides:

- [Setup: Twilio](/docs/en/deploy/providers/twilio)
- [Setup: SignalWire](/docs/en/deploy/providers/signalwire)
- [Setup: Vonage](/docs/en/deploy/providers/vonage)
- [Setup: Plivo](/docs/en/deploy/providers/plivo)
- [Setup: Asterisk (Self-Hosted)](/docs/en/deploy/providers/asterisk)
- [Setup: SMS](/docs/en/deploy/providers/sms)
- [Setup: WhatsApp](/docs/en/deploy/providers/whatsapp)
- [Setup: Signal](/docs/en/deploy/providers/signal)
- [WebRTC Browser Calling](/docs/en/deploy/providers/webrtc)
