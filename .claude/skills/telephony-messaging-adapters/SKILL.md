---
name: telephony-messaging-adapters
description: Use when adding a new telephony or messaging provider, implementing webhook validation, working with IVR flows, or modifying call routing. Also use when the user mentions "telephony adapter", "messaging adapter", "webhook validation", "TwiML", "NCCO", "Plivo XML", "Asterisk", "SMS", "WhatsApp", "Signal", "provider", or needs to understand the multi-provider abstraction layer.
---

# Telephony & Messaging Adapters

## Architecture

TelephonyAdapter interface (apps/worker/telephony/adapter.ts): 17 methods covering IVR, call control, webhook parsing, validation, and recordings.

MessagingAdapter interface (apps/worker/messaging/adapter.ts): 6 methods for inbound/outbound messaging + webhook validation.

All methods return provider-agnostic types. Business logic never touches provider formats.

## Existing Providers

| Provider | Format | Lines | Extends | Notes |
|----------|--------|-------|---------|-------|
| Twilio | TwiML XML | 492 | — | Base implementation, most features |
| SignalWire | TwiML XML | 60 | TwilioAdapter | Override base URL + webhook header |
| Vonage | NCCO JSON | 495 | — | JWT auth, different action names |
| Plivo | Plivo XML | 449 | — | Similar to TwiML, different elements |
| Asterisk | ARI JSON | 543 | — | Self-hosted, needs bridge service |

## Adding a New Voice Provider - Checklist

1. Create `apps/worker/telephony/provider.ts` implementing `TelephonyAdapter`
2. Add `'provider'` to `TelephonyProviderType` union in `packages/shared/types.ts`
3. Add to `TELEPHONY_PROVIDER_LABELS` map (display name)
4. Add config fields to `TelephonyProviderConfig` interface
5. Add to `PROVIDER_REQUIRED_FIELDS` map (credential field names)
6. Add `case 'provider':` in `createAdapterFromConfig()` in `apps/worker/lib/do-access.ts`
7. Add cases in `webrtc-tokens.ts` and `sip-tokens.ts`
8. UI auto-discovers from type maps — NO UI changes needed

## Webhook Validation Reference

| Provider | Algorithm | Header | Data String | Constant-Time? |
|----------|-----------|--------|-------------|----------------|
| Twilio | HMAC-SHA1 | X-Twilio-Signature | url + sorted form params concat | Yes (XOR) |
| SignalWire | HMAC-SHA1 | X-SignalWire-Signature or X-Twilio-Signature | same as Twilio | Yes |
| Vonage Voice | JWT | Authorization: Bearer | JWT claims verification | N/A |
| Vonage SMS | HMAC-SHA256 | X-Vonage-Signature | raw request body (hex) | Yes (XOR) |
| Plivo | MD5 | X-Plivo-Signature | form body (base64) | NO — needs fix |
| Asterisk | HMAC-SHA256 | X-Asterisk-Signature | callId+timestamp+nonce (hex) | Yes (XOR) |
| WhatsApp Meta | HMAC-SHA256 | X-Hub-Signature | request body (sha256=hex) | Yes |
| Signal | HMAC-SHA256 | X-Signal-Signature | request body (hex) | Yes |

CRITICAL: Always use constant-time comparison (XOR loop). Never use `===` for signature comparison.

## IVR Format Comparison

Show equivalent for "speak text, gather DTMF digits, route call" in each format:

**Twilio (TwiML):**
```xml
<Response>
  <Gather numDigits="1" action="/api/telephony/captcha-response">
    <Say language="en-US">Press 1 to continue</Say>
  </Gather>
</Response>
```

**Vonage (NCCO):**
```json
[
  { "action": "talk", "text": "Press 1 to continue", "language": "en-US" },
  { "action": "input", "type": ["dtmf"], "dtmf": { "maxDigits": 1 }, "eventUrl": ["/api/telephony/captcha-response"] }
]
```

**Plivo XML:**
```xml
<Response>
  <GetDigits numDigits="1" action="/api/telephony/captcha-response">
    <Speak language="en-US">Press 1 to continue</Speak>
  </GetDigits>
</Response>
```

**Asterisk (ARI bridge):**
```json
{ "actions": [
  { "action": "speak", "text": "Press 1 to continue", "language": "en-US" },
  { "action": "gather", "numDigits": 1, "callbackEvent": "captcha-response" }
]}
```

## Adding SMS Support

1. Create `apps/worker/messaging/sms/provider.ts` implementing `MessagingAdapter`
2. Add `case 'provider':` in `apps/worker/messaging/sms/factory.ts`
3. SMS adapters reuse telephony credentials — no separate config needed
4. Use `hashPhone()` from `apps/worker/lib/crypto` for consistent phone number hashing

## WhatsApp Integration

Two modes:
- **Meta Cloud API** (direct): Graph API v18.0, HMAC-SHA256 webhook validation, media requires separate fetch
- **Twilio** (wrapper): whatsapp: prefix on phone numbers, delegates to SMS-like API

## Common Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| Non-constant-time signature comparison | Timing attack vulnerability | Use XOR loop, never === |
| Wrong signature data string | All webhooks rejected | Check provider docs for exact construction |
| Missing phone normalization | Lookup failures | Always E.164 format with + prefix |
| Provider-specific voice codes | Wrong language spoken | Map to provider's language code format |
| Hardcoded Twilio-specific field names | Crashes on other providers | Use adapter method return types |
| Missing bridge service for Asterisk | No self-hosted voice | Deploy asterisk-bridge alongside app |
