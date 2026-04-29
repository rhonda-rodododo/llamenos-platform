---
title: "Messaging Channels"
description: "Setting up SMS, WhatsApp, Signal, and other text channels so your team can receive and respond to messages."
audience: [admin]
task: [setup, configuration]
feature: "messaging"
order: 8
---

This guide covers Desktop, iOS, and Android. Where the experience differs, platform-specific instructions are noted.

Your hotline can receive messages over SMS, WhatsApp, Signal, Telegram, and RCS in addition to voice calls. Messages arrive in a unified **Conversations** view where your team can read and respond.

## Setting up SMS

SMS uses the same telephony provider as your voice calls (Twilio, SignalWire, Vonage, or Plivo). To enable it:

1. Go to **Settings** and find the messaging section
2. Toggle **SMS** on
3. Configure a welcome message — this is the automatic reply sent when someone texts your number for the first time
4. Point your provider's SMS webhook to your hotline's SMS endpoint (shown in settings)

## Setting up WhatsApp

WhatsApp requires a Meta Cloud API account. To enable it:

1. Toggle **WhatsApp** on in settings
2. Enter your Meta Cloud API credentials: access token, verify token, and phone number ID
3. Configure your WhatsApp webhook in the Meta dashboard to point to your hotline's WhatsApp endpoint

WhatsApp has a 24-hour messaging window — you can only reply to someone within 24 hours of their last message. After that, you need to use a pre-approved template message to restart the conversation.

## Setting up Signal

Signal is handled by the signal-notifier sidecar service. To enable it:

1. Set up the signal-notifier service (see the deploy documentation)
2. Toggle **Signal** on in settings and enter the shared bearer token
3. Configure the Signal bridge to forward messages to your hotline's Signal webhook endpoint

Incoming Signal messages are end-to-end encrypted and arrive in the Conversations view like any other channel.

## Setting up Telegram and RCS

Telegram and RCS (Google RBM) can be enabled similarly to WhatsApp. Contact your admin or see the provider setup guides for credentials and webhook configuration.

## Responding to messages

All channels feed into the unified **Conversations** view. Incoming messages are assigned to users based on your routing rules.

### Responding by platform

**On Desktop:** Open the Conversations section from the sidebar. Claimed conversations appear in your queue. Type your reply and press Enter or click Send.

**On iOS:** Open the Conversations tab. Tap a conversation to open it. Type your reply at the bottom of the screen.

**On Android:** Open the Conversations section. Tap a conversation to open the thread. Type and send your reply.

## Message encryption

All incoming messages are encrypted as soon as they arrive on the server. The server processes the plaintext only long enough to encrypt it — the plaintext is never stored. Only users with access to the conversation can read the content.
