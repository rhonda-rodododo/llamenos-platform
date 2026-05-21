---
title: WebRTC Browser Calling
description: Enable in-browser call answering for volunteers using WebRTC.
---

WebRTC (Web Real-Time Communication) waxay awood u siisaa volunteers inay jawaabayaan hotline calls directly in their browser, without needing a phone. Tani waxay fudud u tahay volunteers prefer not to share their phone number ama kuwa ku shaqeeya from a computer.

## How it works

1. Admin enable gareysaa WebRTC in telephony provider settings
2. Volunteers set call preference-ka to "Browser" in their profile
3. Marka call yimaado, Llamenos app-ka wuu dhex-muuqanayaa in browser with a notification
4. Volunteer gujiyaa "Answer" oo call-ka wuu isku xiran yahay through browser iyadoo isticmaalayo microphone-ka

Call audio waxaa loo gudbinayaa from telephony provider through WebRTC connection to volunteer's browser. Call quality waxay ku xiran tahay internet connection-ka volunteer-ka.

## Prerequisites

### Admin setup

- Telephony provider supported with WebRTC enabled (Twilio, SignalWire, Vonage, ama Plivo)
- Provider-specific WebRTC credentials configured (eeg provider setup guides)
- WebRTC toggled on in **Settings** > **Telephony Provider**

### Volunteer requirements

- Modern browser (Chrome, Firefox, Edge, ama Safari 14.1+)
- Microphone shaqeeya
- Internet connection stable (ugu yaraan 100 kbps up/down)
- Browser notification permissions granted

## Provider-specific setup

Each telephony provider waxay u baahan tahay credentials kala duwan for WebRTC:

### Twilio / SignalWire

1. Create an **API Key** in provider console
2. Create a **TwiML/LaML Application** with Voice URL set to `https://your-domain.com/api/telephony/webrtc-incoming`
3. In Llamenos, geli API Key SID, API Key Secret, iyo Application SID

### Vonage

1. Your Vonage Application horey ayaa u jirta WebRTC capability
2. In Llamenos, paste your Application's **private key** (PEM format)
3. Application ID horey ayaa la configure gareeyay from initial setup

### Plivo

1. Create an **Endpoint** in Plivo Console under **Voice** > **Endpoints**
2. WebRTC waxay isticmaashaa your existing Auth ID and Auth Token
3. Enable WebRTC in Llamenos -- ma u baahnato additional credentials

### Asterisk

Asterisk WebRTC waxay u baahan tahay SIP.js configuration with WebSocket transport. Tani waxay ka badan tahay cloud providers:

1. Enable WebSocket transport in Asterisk's `http.conf`
2. Create PJSIP endpoints for WebRTC clients with DTLS-SRTP
3. Llamenos auto-configure gareysaa SIP.js client marka Asterisk la doorato

Eeg [Asterisk setup guide](/docs/deploy/providers/asterisk) for full details.

## Volunteer call preference setup

Volunteers waxay configure gareyaan call preference-ka in app-ka:

1. Log in to Llamenos
2. Aad u guur **Settings** (gear icon)
3. Under **Call Preferences**, dooro **Browser** beddelka **Phone**
4. Grant microphone and notification permissions marka la weydiiyo
5. Soo koob Llamenos tab open during your shift

Marka call yimaado, waxaad arki doontaa browser notification iyo in-app ringing indicator. Guji **Answer** si aad u connect gareyso.

## Browser compatibility

| Browser | Desktop | Mobile | Notes |
|---|---|---|---|
| Chrome | Yes | Yes | Recommended |
| Firefox | Yes | Yes | Full support |
| Edge | Yes | Yes | Chromium-based, full support |
| Safari | Yes (14.1+) | Yes (14.1+) | Requires user interaction si loo bilaabo audio |
| Brave | Yes | Limited | Waxay u baahan tahay disabling shields for microphone |

## Audio quality tips

- Isticmaal headset ama earbuds si aad uga hortagto echo
- Xir applications kale oo isticmaala microphone
- Isticmaal wired internet connection marka suurtagalka ah
- Disable browser extensions kuwa interfere gareya WebRTC (VPN extensions, ad blockers with WebRTC leak protection)

## Troubleshooting

### No audio

- **Check microphone permissions**: Guji lock icon-ka in address bar oo hubi in microphone access uu yahay "Allow"
- **Test your microphone**: Isticmaal browser-kaaga built-in audio test ama site sida [webcamtest.com](https://webcamtest.com)
- **Check audio output**: Hubi in speakers-kaaga ama headset uu yahay selected as output device

### Calls not ringing in browser

- **Notifications blocked**: Hubi in browser notifications enabled yihiin for Llamenos site
- **Tab not active**: Llamenos tab waa inuu furan yahay (wuuna karaa inuu ahaado background, laakiin tab waa inuu jiraa)
- **Call preference**: Verify in call preference-kaagu yahay "Browser" in Settings
- **WebRTC not configured**: Weydiiso admin-kaaga inuu verify gareyo WebRTC enabled yahay oo credentials set yihiin

### Firewall and NAT issues

WebRTC waxay isticmaashaa STUN/TURN servers si ay u gudbaan firewalls iyo NAT. Haddii calls connect laakiin aadan maqlin audio:

- **Corporate firewalls**: Qaar firewalls waxay xirayaan UDP traffic on non-standard ports. Weydiiso IT team-kaaga inay oggolaadaan UDP traffic on ports 3478 and 10000-60000
- **Symmetric NAT**: Qaar routers waxay isticmaalaan symmetric NAT taasoo ka hortagta direct peer connections. Telephony provider's TURN servers waxay ku maamuli karaan tani si otomaatig ah
- **VPN interference**: VPNs waxay interfere gareyaan WebRTC connections. Isku day inaad ka go'daan VPN during shifts

### Echo ama feedback

- Isticmaal headphones beddelka speakers
- Yaree microphone sensitivity in your OS audio settings
- Enable echo cancellation in your browser (guud ahaan enabled by default)
- Ka fogow hard, reflective surfaces
