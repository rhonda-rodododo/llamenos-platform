---
title: Mobile Guide
description: Install and set up the Llamenos mobile app on iOS and Android.
---

The Llamenos mobile app lets volunteers answer calls, respond to messages, and write encrypted notes from their phone. It is built with React Native and shares the same Rust cryptographic core as the desktop app.

## What is the mobile app?

The mobile app is a companion to the desktop application. It connects to the same Llamenos backend (Cloudflare Workers or self-hosted) and uses the same protocol, so volunteers can switch between desktop and mobile seamlessly.

The mobile app lives in a separate repository (`llamenos-platform`) but shares:

- **llamenos-core** — The same Rust crate for all cryptographic operations, compiled via UniFFI for iOS and Android
- **Protocol** — The same wire format, API endpoints, and encryption scheme
- **Backend** — The same Cloudflare Worker or self-hosted server

## Download and install

### Android

The mobile app is currently distributed as an APK for sideloading:

1. Download the latest `.apk` file from the [GitHub Releases](https://github.com/rhonda-rodododo/llamenos-platform/releases/latest) page
2. On your Android device, go to **Settings > Security** and enable **Install from unknown sources** (or enable it per-app when prompted)
3. Open the downloaded APK and tap **Install**
4. Once installed, open Llamenos from your app drawer

App Store and Play Store distribution is planned for a future release.

### iOS

iOS builds are available as TestFlight beta releases:

1. Install [TestFlight](https://apps.apple.com/app/testflight/id899247664) from the App Store
2. Ask your admin for the TestFlight invite link
3. Open the link on your iOS device to join the beta
4. Install Llamenos from TestFlight

App Store distribution is planned for a future release.

## Initial setup

The mobile app is set up by linking it to an existing desktop account. This ensures that the same cryptographic identity is used across devices without ever transmitting the secret key in plaintext.

### Device provisioning (QR scan)

1. Open the Llamenos desktop app and go to **Settings > Devices**
2. Click **Link New Device** — this generates a QR code containing a one-time provisioning token
3. Open the Llamenos mobile app and tap **Link Device**
4. Scan the QR code with your phone's camera
5. The apps perform an ephemeral ECDH key exchange to securely transfer your encrypted key material
6. Set a PIN on the mobile app to protect your local key storage
7. The mobile app is now linked and ready to use

The provisioning process never transmits your nsec in plaintext. The desktop app wraps the key material with the ephemeral shared secret, and the mobile app unwraps it locally.

### Manual setup (nsec entry)

If you cannot scan a QR code, you can enter your nsec directly:

1. Open the mobile app and tap **Enter nsec manually**
2. Paste your `nsec1...` key
3. Set a PIN to protect local storage
4. The app derives your public key and registers with the backend

This method requires handling your nsec directly, so only use it if device linking is not possible. Use a password manager to paste the nsec rather than typing it.

## Feature comparison

| Feature | Desktop | Mobile |
|---|---|---|
| Answer incoming calls | Yes | Yes |
| Write encrypted notes | Yes | Yes |
| Custom note fields | Yes | Yes |
| Respond to messages (SMS, WhatsApp, Signal) | Yes | Yes |
| View conversations | Yes | Yes |
| Shift status and breaks | Yes | Yes |
| Client-side transcription | Yes (WASM Whisper) | No |
| Note search | Yes | Yes |
| Command palette | Yes (Ctrl+K) | No |
| Keyboard shortcuts | Yes | No |
| Admin settings | Yes (full) | Yes (limited) |
| Manage volunteers | Yes | View only |
| View audit logs | Yes | Yes |
| WebRTC browser calling | Yes | No (uses native phone) |
| Push notifications | OS notifications | Native push (FCM/APNS) |
| Auto-update | Tauri updater | App Store / TestFlight |
| File attachments (reports) | Yes | Yes |

## Limitations

- **No client-side transcription** — The WASM Whisper model requires significant memory and CPU resources that are impractical on mobile. Call transcription is only available on desktop.
- **Reduced crypto performance** — While the mobile app uses the same Rust crypto core via UniFFI, operations may be slower on lower-end devices compared to desktop native performance.
- **Limited admin features** — Some admin operations (bulk volunteer management, detailed settings configuration) are only available in the desktop app. The mobile app provides read-only views for most admin screens.
- **No WebRTC calling** — Mobile volunteers receive calls on their phone number via the telephony provider, not through the browser. WebRTC in-app calling is desktop-only.
- **Battery and connectivity** — The app needs a persistent connection to receive real-time updates. Background mode may be limited by OS power management. Keep the app in the foreground during shifts for reliable notifications.

## Troubleshooting mobile issues

### Provisioning fails with "Invalid QR code"

- Make sure the QR code was generated recently (provisioning tokens expire after 5 minutes)
- Generate a new QR code from the desktop app and try again
- Ensure both devices are connected to the internet

### Not receiving push notifications

- Check that notifications are enabled for Llamenos in your device settings
- On Android: Go to **Settings > Apps > Llamenos > Notifications** and enable all channels
- On iOS: Go to **Settings > Notifications > Llamenos** and enable **Allow Notifications**
- Make sure you are not in Do Not Disturb mode
- Verify that your shift is active and you are not on break

### App crashes on launch

- Ensure you are running the latest version of the app
- Clear the app cache: **Settings > Apps > Llamenos > Storage > Clear Cache**
- If the issue persists, uninstall and reinstall (you will need to re-link the device)

### Cannot decrypt old notes after reinstall

- Reinstalling the app removes local key material
- Re-link the device via QR code from your desktop app to restore access
- Notes encrypted before the reinstall will be accessible once the device is re-linked with the same identity

### Slow performance on older devices

- Close other apps to free memory
- Disable animations in the app settings if available
- Consider using the desktop app for heavy operations like bulk note review
