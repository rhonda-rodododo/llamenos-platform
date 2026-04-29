---
title: "Account Recovery"
description: "What to do if you forget your PIN, lose your device, or need help regaining access."
audience: [admin, user]
task: [troubleshooting, security]
feature: "recovery"
order: 15
---

This guide covers Desktop, iOS, and Android. Where the experience differs, platform-specific instructions are noted.

Losing access to your account can be stressful, especially if you need it for your shift. This guide covers the most common situations and how to get back in.

## If you forgot your PIN

Your PIN protects the device keys stored on your device. If you forget it:

1. **Try biometric unlock (mobile only).** On iOS, Face ID or Touch ID can unlock your app even if you forget your numeric PIN. On Android, your registered fingerprint or face can unlock the app. Check your device settings to see if biometric unlock is configured.
2. **Contact your admin.** If you do not have a biometric fallback, your admin can help you through the re-enrollment process.

Your PIN cannot be reset by the server — this is a security feature. It means nobody, not even someone with access to the server, can unlock your data without your PIN or biometric.

## If you lost your device

If your phone or computer was lost or stolen:

1. **Contact your admin immediately.** They can revoke your device's authorization from the sigchain to prevent unauthorized access.
2. **Install the app on a new device.** Go through the onboarding process and link to your existing account using a device pairing code from your admin or from another device you control.
3. **Set a new PIN** on the new device.

Your new device gets new device keys. The admin re-wraps your data access for the new keys, so you can read your notes and hub data again after linking.

## Device re-linking

If you have another authorized device (for example, you linked your phone and your computer), you can use the working device to authorize a new one:

**On Desktop:** Go to **Settings → Link Device**. Generate a pairing code and scan or enter it on your new device.

**On iOS:** In Settings, open Device Management and initiate a new device link.

**On Android:** In Settings, open Device Management and generate a new device link.

## Re-enrollment (when all devices are lost)

If you have lost access to all your devices and cannot recover via biometric:

1. Your admin deactivates your current account
2. They create a new invite for you
3. You open the invite and go through onboarding with a new device
4. The admin re-establishes your access to shared hub data

**Important:** Re-enrollment creates new device keys. Data encrypted exclusively for your old keys (such as notes written during a period when your admin's keys were unavailable) may not be recoverable. Your admin still has access to all notes through their own admin keys.

## For admins: helping users

When a user is locked out:

1. Go to **Users** and find their profile
2. Revoke their current device access if their device may be compromised
3. Create a new invite link with their original role
4. Share the link through a secure channel (encrypted message, in-person, etc.)

**Verify identity before re-enrolling.** Someone pretending to be a locked-out team member is a common social engineering tactic.

## Prevention

- Enable biometric unlock on mobile as a backup to your PIN
- Link multiple devices so you have a fallback if one is unavailable
- Keep a secure record of which devices you have authorized
- Admins: periodically review and revoke access for devices no longer in use
