---
title: "Ban Lists and Spam Prevention"
description: "Managing banned numbers, voice CAPTCHA, and rate limiting to protect your hotline from abuse."
audience: [admin]
task: [configuration, troubleshooting]
feature: "bans"
order: 10
---

This guide covers Desktop, iOS, and Android. Where the experience differs, platform-specific instructions are noted.

Spam and abusive callers can overwhelm a hotline. The system gives you several tools to deal with this, all manageable in real time.

## Managing the ban list

Go to the **Bans** section to block specific phone numbers.

**To ban a single number:** Enter the phone number in international format (for example, +15551234567) and add it. The ban takes effect immediately — the caller will hear a rejection message and be disconnected.

**To ban multiple numbers at once:** Use the bulk import feature on Desktop or paste a list of numbers on mobile. This is useful if you have a list of known abusive numbers from a previous incident.

**To unban a number:** Find it in the ban list and remove it. The change is instant.

### Ban list by platform

**On Desktop:** The Bans page provides a table view of banned numbers, a bulk import text area, and a search bar for finding specific numbers.

**On iOS:** Open the Bans section (admin only). Tap **+** to add a number. Tap any entry to view or remove it.

**On Android:** Open Bans from the admin navigation. Tap the floating action button to add a number. Long-press an entry to remove it.

## Voice CAPTCHA

Voice CAPTCHA adds a simple verification step before a caller reaches your team. When enabled, the caller hears a randomly generated 4-digit code and must enter it on their keypad. This stops automated robocalls and simple spam bots.

Turn it on or off in **Settings** under Spam Mitigation. You can toggle it at any time — for example, turn it on during a spam attack and off when things calm down.

## Rate limiting

Rate limiting restricts how many times a single phone number can call within a set time window. This prevents a single caller from flooding your line.

Configure rate limiting in **Settings**:

- Set the **call window** — how many minutes to look back
- Set the **maximum calls** — how many calls from one number are allowed in that window
- Choose the **action** — reject the call silently, send to voicemail, or play a message

## Real-time controls

All spam mitigation features take effect immediately. There is no need to restart the server or wait for changes to propagate. This means you can respond to an active spam attack in real time.
