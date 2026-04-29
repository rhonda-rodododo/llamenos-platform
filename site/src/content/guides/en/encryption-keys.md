---
title: "Your Data Protection"
description: "How your data is kept safe, what your PIN does, device keys, and what happens if you lose access."
audience: [admin, user]
task: [security, setup]
feature: "encryption"
order: 7
---

This guide covers Desktop, iOS, and Android. Where the experience differs, platform-specific instructions are noted.

Your hotline encrypts sensitive data so that even the server cannot read it. This guide explains what that means for you in plain terms — no technical background needed.

## Your device keys

When you set up your account, the app creates a pair of cryptographic keys that live only on your device. Think of them as a lock and a key: one key encrypts data, the other decrypts it. These are called your **device keys**.

Your device keys are unique to your device. If you use the hotline on a second device, that device gets its own keys — linked to your identity through the device authorization process (see [Device Linking](#device-linking) below).

**Your device keys never leave your device.** The server never sees them. When you read your notes or messages, the decryption happens entirely on your device.

## Your PIN protects your keys

Your **PIN** encrypts your device keys in storage. When you lock the app or your device, your keys are sealed. When you enter your PIN, they are unlocked so you can read your data.

**Choose a strong PIN and remember it.** Without it, your keys stay locked.

### Platform-specific key storage

**On Desktop:** Your device keys are stored in Tauri Stronghold — an encrypted vault built into the desktop app. The Stronghold is sealed with your PIN. Keys never enter the webview or browser context.

**On iOS:** Your device keys are stored in the iOS Keychain, protected by your PIN and optionally by Face ID or Touch ID.

**On Android:** Your device keys are stored in Android Keystore via EncryptedSharedPreferences, protected by your PIN and optionally by biometric unlock.

## What is encrypted

- **Call notes** — encrypted on your device before being sent to the server. Only you and your admins can read them.
- **Contact information** — names, phone numbers, and personal details are encrypted.
- **Messages** — conversations over SMS, WhatsApp, Signal, and other channels are encrypted when stored.
- **Reports** — report content and attachments are encrypted before upload.
- **Hub data** — shift names, role names, and other internal labels are encrypted with a shared hub key.

The server stores only scrambled data. Even if someone gained access to the database, they would not be able to read your content.

## How note encryption works

Each note is encrypted with a unique random key (not derived from your identity). This key is then wrapped (encrypted) separately for each authorized reader — you and each admin. This design means:

- If one reader's keys are compromised, other readers' copies remain secure
- Compromising a past key does not expose past notes (forward secrecy)
- Admins can read notes without users needing to share their keys

This system uses **HPKE** (Hybrid Public Key Encryption, RFC 9180) with X25519 key exchange and AES-256-GCM content encryption.

## Hub key

Organization-level data (shift schedules, role names, hub settings) is encrypted with a **hub key** — a random 32-byte key shared among all hub members. Each member receives the hub key wrapped for their individual device key.

When a member leaves the hub, the hub key is rotated and re-wrapped for all remaining members. The departed member's copy becomes useless.

## Device linking

If you use the hotline on more than one device — for example, your computer and your phone — you can link them. Each new device gets its own device keys, authorized through a secure linking process.

**On Desktop:** Go to **Settings** and use the **Link Device** option. A QR code or pairing code is displayed. Scan or enter it on your other device to authorize it.

**On iOS and Android:** During onboarding, you can link to an existing account by scanning the pairing code shown on your desktop or another mobile device.

The device authorization chain (sigchain) keeps a record of which devices are authorized for your account. If a device is lost or stolen, an admin can revoke its authorization.

## Domain separation

All cryptographic operations use unique context labels — 57 of them — that prevent one type of operation's output from being reused in another context. This is a technical defense against certain classes of attacks. You do not need to understand the details, but it is why your data remains secure even if an attacker has some knowledge of the system.

## What happens if you lose access

If you forget your PIN or lose your device, see the [Account Recovery](/guides/en/account-recovery) guide. The short version: an admin can help you re-enroll on a new device.

## For admins

You hold a special responsibility — your device keys can decrypt team members' notes and data. Keep your credentials secure, enable biometric unlock on mobile, and follow your organization's security procedures. Consider registering a backup device through device linking so you are not locked out if your primary device is unavailable.
