---
title: "Browser and In-App Calling"
description: "Answering calls in the desktop app or mobile app instead of via your personal phone, and why this protects your number."
audience: [admin, user]
task: [setup, daily-use]
feature: "webrtc"
order: 12
---

In-app calling lets you answer hotline calls without exposing your personal phone number. The audio goes directly to your device through the app.

## Why use in-app calling

When calls are routed to your personal phone number, that number is involved in the telephony connection. With in-app calling, the audio travels over the internet to your app. Your personal phone number is never exposed to the caller or to the telephony system.

This is especially important for hotlines where user safety is a concern.

## Desktop: browser-based WebRTC calling

On Desktop, the app uses WebRTC to connect call audio directly in the browser.

**Setting it up:**

Browser calling requires your admin to configure a compatible telephony provider (Twilio, SignalWire, or a SIP provider with WebRTC support). Once enabled:

1. Open the hotline app in your browser
2. Grant **microphone permission** when prompted
3. Make sure you have a stable internet connection and a working microphone/headset

When a call comes in, you will answer it directly in the browser window — no external phone required.

**During a browser call:** The call timer and note-taking panel appear alongside the call. Audio comes through your headset or speakers. Speak into your computer microphone or headset mic.

**Tips for call quality:**
- Use a wired internet connection if possible — Wi-Fi can cause audio dropouts
- Use a headset to reduce echo and background noise
- Close bandwidth-heavy applications during your shift
- Keep the browser tab visible — some browsers reduce audio quality for background tabs

## iOS and Android: native in-app calling

On iOS and Android, the app uses the device's native calling integration. Calls ring through the app and connect using your internet connection.

**On iOS:** Calls may appear as VoIP calls integrated with the iOS call screen. Grant microphone permission when prompted on first use.

**On Android:** Calls ring through the app notification system. Grant microphone permission when prompted on first use. Calls connect using your mobile or Wi-Fi data.

## Troubleshooting

If you cannot hear the caller or they cannot hear you:

- Check that the app has microphone permission in your device's system settings
- Make sure the correct audio output is selected (if using a Bluetooth headset, check that it is connected)
- Try ending and re-answering the call
- If problems persist, contact your admin
