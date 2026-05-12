---
title: Reporter Guide
description: How to submit encrypted reports and track their status.
---

As a reporter, you can submit encrypted reports to your organization through the Llamenos platform. Reports are end-to-end encrypted — the server never sees your report content.

## Getting started

Your admin will give you one of:
- An **nsec** (WebSocket secret key) — a string starting with `nsec1`
- An **invite link** — a one-time URL that creates credentials for you

**Keep your nsec private.** It's your identity and login credential. Store it in a password manager.

## Logging in

1. Open the app in your browser
2. Paste your `nsec` into the login field
3. Your identity is verified cryptographically — your secret key never leaves your browser

After first login, you can register a WebAuthn passkey in Settings for easier future logins.

## Submitting a report

1. Click **New Report** from the Reports page
2. Enter a **title** for your report (this helps admins triage — it's stored in plaintext)
3. Select a **category** if your admin has defined report categories
4. Write your **report content** in the body field — this is encrypted before leaving your browser
5. Optionally fill in any **custom fields** your admin has configured
6. Optionally **attach files** — files are encrypted client-side before upload
7. Click **Submit**

Your report appears in your Reports list with a status of "Open".

## Report encryption

- The report body and custom field values are encrypted using ECIES (secp256k1 + XChaCha20-Poly1305)
- File attachments are encrypted separately using the same scheme
- Only you and the admin can decrypt the content
- The server stores only ciphertext — even if the database is compromised, your report content is safe

## Tracking your reports

Your Reports page shows all your submitted reports with:
- **Title** and **category**
- **Status** — Open, Claimed (an admin is working on it), or Resolved
- **Date** submitted

Click a report to view the full thread, including any admin replies.

## Replying to admins

When an admin responds to your report, their reply appears in the report thread. You can reply back — all messages in the thread are encrypted.

## What you can't do

As a reporter, your access is limited to protect everyone's privacy:
- You **can** view your own reports and the Help page
- You **cannot** see other reporters' reports, call records, volunteer info, or admin settings
- You **cannot** answer calls or respond to SMS/WhatsApp/Signal conversations

## Tips

- Use descriptive titles — they help admins triage without decrypting the full content
- Attach relevant files (screenshots, documents) when they support your report
- Check back periodically for admin responses — you'll see status changes in your report list
- Use the Help page for FAQ and guides
