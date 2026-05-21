---
title: WebRTC Browser Calling
description: Titz'ij'ij' in-browser call answering richin taq volunteers rokisaxik WebRTC.
---

WebRTC (Web Real-Time Communication) nuya' chi ri volunteers yetikïr nik'ul hotline taq tzij directly pa ri browser, majun ruk'u'x samaj richin jun ch'ich'. Re' utziläj richin taq volunteers ri man nik'oj ta chi nik'ut ri phone number o ri yetikïr samajin pa jun kematz'ib'.

## Achike rub'eyal nisamäj

1. Admin nitz'ij'ij' WebRTC pa ri telephony provider ruchojmil
2. Taq volunteers tiya' ri call preference pa "Browser" pa ri profile
3. We jun tzij nok, ri Llamenos app b'ey pa ri browser rik'in jun notification
4. Ri volunteer tipitz' "Answer" chuqa' ri tzij nok via ri browser rokisaxik ri microphone

Ri call audio nub'än pa ri telephony provider through jun WebRTC connection pa ri volunteer's browser. Call quality depends pa ri volunteer's internet connection.

## Taq k'ayewal

### Admin setup

- Jun supported telephony provider rik'in WebRTC enabled (Twilio, SignalWire, Vonage, o Plivo)
- Provider-specific WebRTC taq ewan taq tzij tz'aqat (katz'eto' provider setup taq ruchojmil)
- WebRTC toggled on pa **Settings** > **Telephony Provider**

### Volunteer taq k'ayewal

- Jun modern browser (Chrome, Firefox, Edge, o Safari 14.1+)
- Jun working microphone
- Jun stable internet connection (minimum 100 kbps up/down)
- Browser notification permissions granted

## Provider-specific ruchojmil

Junjun telephony provider nrajo' different taq ewan taq tzij richin WebRTC:

### Twilio / SignalWire

1. Titz'uk jun **API Key** pa ri provider console
2. Titz'uk jun **TwiML/LaML Application** rik'in ri Voice URL tiya' pa `https://your-domain.com/api/telephony/webrtc-incoming`
3. Pa Llamenos, tiya' ri API Key SID, API Key Secret, chuqa' Application SID

### Vonage

1. Aw Vonage Application chik includes WebRTC capability
2. Pa Llamenos, tatz'ib'aj aw Application's **private key** (PEM ruwäch)
3. Ri Application ID chik tz'aqat pa initial setup

### Plivo

1. Titz'uk jun **Endpoint** pa ri Plivo Console pa **Voice** > **Endpoints**
2. WebRTC nrokisaj aw existing Auth ID chuqa' Auth Token
3. Titz'ij'ij' WebRTC pa Llamenos -- majun additional taq ewan taq tzij rajowaxik

### Asterisk

Asterisk WebRTC nrajo' SIP.js ruchojmil rik'in WebSocket transport. Re' yalan involved chuwäch cloud providers:

1. Titz'ij'ij' WebSocket transport pa Asterisk's `http.conf`
2. Titz'uk PJSIP endpoints richin WebRTC clients rik'in DTLS-SRTP
3. Llamenos auto-ruchojmil ri SIP.js client we Asterisk tz'aqat

Katz'eto' ri [Asterisk setup guide](/docs/deploy/providers/asterisk) richin full taq rutzijol.

## Volunteer call preference ruchojmil

Taq volunteers ruchojmil ri call preference pa ri app:

1. Titikirisaj molojri'ïl pa Llamenos
2. Katb'e pa **Settings** (gear icon)
3. Pa **Call Preferences**, tacha' **Browser** instead of **Phone**
4. Grant microphone chuqa' notification permissions we prompted
5. Tiya' ri Llamenos tab jaqel during aw shift

We jun tzij nok, xak'ut jun browser notification chuqa' jun in-app ringing indicator. Tipitz' **Answer** richin nok.

## Browser compatibility

| Browser | Desktop | Mobile | Taq rutzijol |
|---|---|---|---|
| Chrome | Yes | Yes | Nuchilab'ej |
| Firefox | Yes | Yes | Full support |
| Edge | Yes | Yes | Chromium-based, full support |
| Safari | Yes (14.1+) | Yes (14.1+) | Nrajo' user interaction richin titikirisaj audio |
| Brave | Yes | Limited | Yek'atzin chi nitz'ap shields richin microphone |

## Audio quality taq chilab'en

- Tokisäx jun headset o earbuds richin nich'ajïx echo
- Titz'ap ch'aqa' chik taq applications ri nrokisaj ri microphone
- Tokisäx jun wired internet connection we possible
- Titz'ap browser extensions ri yek'atzin chi nik'ul WebRTC (VPN extensions, ad blockers rik'in WebRTC leak protection)

## Ruch'utik ruk'ayewal

### Majun audio

- **Kek'ut microphone permissions**: Tipitz' ri lock icon pa ri address bar chuqa' kek'et chi microphone access k'o "Allow"
- **Tojtob'en aw microphone**: Tokisäx aw browser's built-in audio test o jun ruxaq' achi'el [webcamtest.com](https://webcamtest.com)
- **Kek'ut audio output**: Ketz'et chi aw speakers o headset e tz'aqat achi'el ri output device

### Taq tzij man b'ey ta pa browser

- **Notifications blocked**: Kek'et chi browser notifications e tz'aqat richin ri Llamenos ruxaq'
- **Tab man active ta**: Ri Llamenos tab k'o chi k'o jaqel (yatikïr k'o pa ri background, pero ri tab k'o chi k'o)
- **Call preference**: Ketz'et chi aw call preference tiya' pa "Browser" pa Settings
- **WebRTC man ruchojmil ta**: Tach'utiwach aw admin richin nitz'akaj chi WebRTC enabled chuqa' taq ewan taq tzij e tz'aqat

### Firewall chuqa' NAT taq k'ayewal

WebRTC nrokisaj STUN/TURN taq ruk'u'x samaj richin traverse firewalls chuqa' NAT. We taq tzij nok pero majan audio:

- **Corporate firewalls**: Jujun firewalls nik'at UDP traffic pa non-standard taq b'ey. Tach'utiwach aw IT team richin niya' chi UDP traffic pa taq b'ey 3478 chuqa' 10000-60000
- **Symmetric NAT**: Jujun routers nrokisaj symmetric NAT ri yek'atzin chi nik'ul direct peer connections. Ri telephony provider's TURN taq ruk'u'x samaj k'o chi nub'än re' automatically
- **VPN interference**: VPNs yek'atzin chi nik'ul WebRTC connections. Tatojtob'ej disconnect aw VPN during shifts

### Echo o feedback

- Tokisäx headphones instead of speakers
- Tiya' down microphone sensitivity pa aw OS audio settings
- Titz'ij'ij' echo cancellation pa aw browser (usually enabled by default)
- Tiyäk away from hard, reflective taq surfaces
