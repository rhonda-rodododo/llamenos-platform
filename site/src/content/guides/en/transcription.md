---
title: "Call Transcription"
description: "How transcription works, how to enable it, and how to review transcripts alongside your notes."
audience: [admin, user]
task: [configuration, daily-use]
feature: "transcription"
order: 11
---

This guide covers Desktop, iOS, and Android. Where the experience differs, platform-specific instructions are noted.

The hotline can automatically transcribe phone calls into text. What makes this different from most transcription services is that **the audio never leaves your device**. Transcription runs entirely on-device using a WASM-based speech recognition model.

## How it works

When a call ends, the audio is processed by a speech recognition model running directly on your device. The resulting text is then encrypted and saved alongside your call notes. At no point does the audio travel to an external server.

This design protects caller privacy — even the hotline server never hears the audio.

### Platform notes

**On Desktop:** Transcription uses a WebAssembly (WASM) version of Whisper running in a background Web Worker. Processing happens in your browser, isolated from the webview. Audio data is discarded after the transcript is generated.

**On iOS and Android:** Transcription is available when enabled by your admin. The model runs on-device using the same WASM pipeline. Older or lower-powered devices may experience slower processing.

## For admins: enabling transcription

Go to **Settings** and find the Transcription section. Toggle the global switch to enable transcription for your organization.

Even when enabled globally, individual users can opt out through their own preferences.

## For users: your transcription preferences

Go to **Preferences** (or Settings on mobile) to control whether your calls are transcribed. If you turn transcription off, your calls will not be transcribed regardless of the global setting.

You might want to disable transcription if:

- Your device is slower and transcription affects performance
- You prefer to write notes manually
- A caller has asked not to be recorded

## Reviewing transcripts

Transcripts appear alongside call notes. When you open a call from the **Calls** section, the transcript (if available) is displayed alongside your notes for that call.

## Language support

The transcription model supports multiple languages and will attempt to detect the language being spoken automatically. Quality varies by language — widely-spoken languages tend to produce better results.

## Privacy note

Audio data is discarded after the transcript is generated — it is not stored anywhere on your device or on the server. The resulting transcript is encrypted before being sent to the server, just like your call notes.
