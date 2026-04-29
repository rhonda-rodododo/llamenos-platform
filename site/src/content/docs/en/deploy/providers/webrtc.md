---
title: WebRTC Browser Calling
description: Enable in-browser call answering for volunteers using WebRTC.
---

WebRTC (Web Real-Time Communication) lets volunteers answer hotline calls directly in their browser, without needing a phone. This is useful for volunteers who prefer not to share their phone number or who work from a computer.

## How it works

1. Admin enables WebRTC in the telephony provider settings
2. Volunteers set their call preference to "Browser" in their profile
3. When a call arrives, the Llamenos app rings in the browser with a notification
4. The volunteer clicks "Answer" and the call connects through the browser using their microphone

The call audio is routed from the telephony provider through a WebRTC connection to the volunteer's browser. Call quality depends on the volunteer's internet connection.

## Prerequisites

### Admin setup

- A supported telephony provider with WebRTC enabled (Twilio, SignalWire, Vonage, or Plivo)
- Provider-specific WebRTC credentials configured (see provider setup guides)
- WebRTC toggled on in **Settings** > **Telephony Provider**

### Volunteer requirements

- A modern browser (Chrome, Firefox, Edge, or Safari 14.1+)
- A working microphone
- A stable internet connection (minimum 100 kbps up/down)
- Browser notification permissions granted

## Provider-specific setup

Each telephony provider requires different credentials for WebRTC:

### Twilio / SignalWire

1. Create an **API Key** in the provider console
2. Create a **TwiML/LaML Application** with the Voice URL set to `https://your-domain.com/api/telephony/webrtc-incoming`
3. In Llamenos, enter the API Key SID, API Key Secret, and Application SID

### Vonage

1. Your Vonage Application already includes WebRTC capability
2. In Llamenos, paste your Application's **private key** (PEM format)
3. The Application ID is already configured from initial setup

### Plivo

1. Create an **Endpoint** in the Plivo Console under **Voice** > **Endpoints**
2. WebRTC uses your existing Auth ID and Auth Token
3. Enable WebRTC in Llamenos -- no additional credentials needed

### Asterisk

Asterisk WebRTC requires SIP.js configuration with WebSocket transport. This is more involved than cloud providers:

1. Enable WebSocket transport in Asterisk's `http.conf`
2. Create PJSIP endpoints for WebRTC clients with DTLS-SRTP
3. Llamenos auto-configures the SIP.js client when Asterisk is selected

See the [Asterisk setup guide](/docs/deploy/providers/asterisk) for full details.

## Volunteer call preference setup

Volunteers configure their call preference in the app:

1. Log in to Llamenos
2. Go to **Settings** (gear icon)
3. Under **Call Preferences**, select **Browser** instead of **Phone**
4. Grant microphone and notification permissions when prompted
5. Keep the Llamenos tab open during your shift

When a call arrives, you will see a browser notification and an in-app ringing indicator. Click **Answer** to connect.

## Browser compatibility

| Browser | Desktop | Mobile | Notes |
|---|---|---|---|
| Chrome | Yes | Yes | Recommended |
| Firefox | Yes | Yes | Full support |
| Edge | Yes | Yes | Chromium-based, full support |
| Safari | Yes (14.1+) | Yes (14.1+) | Requires user interaction to start audio |
| Brave | Yes | Limited | May need to disable shields for microphone |

## Audio quality tips

- Use a headset or earbuds to prevent echo
- Close other applications that use the microphone
- Use a wired internet connection when possible
- Disable browser extensions that might interfere with WebRTC (VPN extensions, ad blockers with WebRTC leak protection)

## Troubleshooting

### No audio

- **Check microphone permissions**: Click the lock icon in the address bar and ensure microphone access is "Allow"
- **Test your microphone**: Use your browser's built-in audio test or a site like [webcamtest.com](https://webcamtest.com)
- **Check audio output**: Make sure your speakers or headset are selected as the output device

### Calls not ringing in browser

- **Notifications blocked**: Check that browser notifications are enabled for the Llamenos site
- **Tab not active**: The Llamenos tab must be open (it can be in the background, but the tab must exist)
- **Call preference**: Verify your call preference is set to "Browser" in Settings
- **WebRTC not configured**: Ask your admin to verify WebRTC is enabled and credentials are set

### Firewall and NAT issues

WebRTC uses STUN/TURN servers to traverse firewalls and NAT. If calls connect but you hear no audio:

- **Corporate firewalls**: Some firewalls block UDP traffic on non-standard ports. Ask your IT team to allow UDP traffic on ports 3478 and 10000-60000
- **Symmetric NAT**: Some routers use symmetric NAT which can prevent direct peer connections. The telephony provider's TURN servers should handle this automatically
- **VPN interference**: VPNs can interfere with WebRTC connections. Try disconnecting your VPN during shifts

### Echo or feedback

- Use headphones instead of speakers
- Reduce microphone sensitivity in your OS audio settings
- Enable echo cancellation in your browser (usually enabled by default)
- Move away from hard, reflective surfaces
