---
title: Volunteer Guide
description: Everything you need to know as a volunteer — logging in, receiving calls, responding to messages, writing notes, and using transcription.
---

This guide covers everything you need to know as a volunteer: logging in, receiving calls, responding to messages, writing notes, and using the transcription feature.

## Getting your credentials

Your admin will give you one of:

- An **nsec** (WebSocket secret key) — a string starting with `nsec1`
- An **invite link** — a one-time URL that generates credentials for you

**Keep your nsec private.** It's your identity and login credential. Anyone with your nsec can impersonate you. Store it in a password manager.

## Logging in

1. Open the hotline app in your browser
2. Paste your `nsec` into the login field
3. The app verifies your identity cryptographically — your secret key never leaves your browser

After first login, you'll be prompted to set your display name and preferred language.

### Passkey login (optional)

If your admin has enabled passkeys, you can register a hardware key or biometric in **Settings**. This lets you log in on other devices without typing your nsec.

## The dashboard

After logging in, you'll see the dashboard with:

- **Active calls** — calls currently being handled
- **Your shift status** — shown in the sidebar (current shift or next upcoming shift)
- **Online volunteers** — count of who's available

## Receiving calls

When a call comes in during your shift, you'll be notified via:

- A **ringtone** in the browser (toggle in Settings)
- A **push notification** if you've granted permission
- A **flashing tab title**

Click **Answer** to pick up the call. Your phone will ring — answer it to connect with the caller. If another volunteer picks up first, the ringing stops.

## During a call

While on a call, you'll see:

- A **call timer** showing duration
- A **note-taking panel** where you can write notes in real time
- A **report spam** button to flag the caller

Notes are auto-saved as encrypted drafts. You can also save the note manually.

## Writing notes

Notes are encrypted in your browser before being sent to the server. Only you and the admin can read them.

If your admin has configured custom fields (text, dropdown, checkbox, etc.), they'll appear in the note form. Fill them in as relevant — they're encrypted alongside your note text.

Navigate to **Notes** in the sidebar to review, edit, or search your past notes. You can export your notes as an encrypted file.

## Transcription

If transcription is enabled (by the admin and by your own preference), calls are automatically transcribed after they end. The transcript appears alongside your note for that call.

You can toggle transcription on or off in **Settings**. When disabled, your calls won't be transcribed regardless of the admin's global setting.

Transcripts are encrypted at rest — the server processes the audio temporarily, then encrypts the resulting text.

## Conversations

If your admin has enabled messaging channels (SMS, WhatsApp, or Signal), you'll see a **Conversations** link in the sidebar. This shows threaded conversations from people who contacted the hotline via text.

Each conversation displays:
- Message bubbles with timestamps showing who sent what
- The channel the message came from (SMS, WhatsApp, Signal)
- New messages appear in real time

To respond, type your message in the reply box at the bottom of the conversation. Your response is sent back through the same channel the person used to contact you.

## Going on break

Toggle the **break** switch in the sidebar to pause incoming calls without leaving your shift. Calls won't ring your phone while you're on break. Toggle it back when you're ready.

## Tips

- Use <kbd>Ctrl</kbd>+<kbd>K</kbd> (or <kbd>Cmd</kbd>+<kbd>K</kbd> on Mac) to open the command palette for quick navigation
- Press <kbd>?</kbd> to see all keyboard shortcuts
- Install the app as a PWA for a native app experience and better notifications
- Keep your browser tab open during your shift for real-time call alerts
- Use the **Help** page (sidebar link or command palette) for FAQ, guides, and keyboard shortcuts
