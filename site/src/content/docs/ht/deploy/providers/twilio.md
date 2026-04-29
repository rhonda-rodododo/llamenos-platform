---
title: "Setup: Twilio"
description: Gid etap pa etap pou konfigire Twilio kòm founisè telefoni ou.
---

Twilio se founisè telefoni default pou Llamenos epi se sa ki pi fasil pou kòmanse. Gid sa a montre ou kijan pou kreye kont, konfigire nimewo telefòn, ak konfigire webhook.

## Kondisyon Prealab

- Yon [kont Twilio](https://www.twilio.com/try-twilio) (esè gratis la mache pou tès)
- Enstans Llamenos ou deplwaye epi aksesib atravè yon URL piblik

## 1. Kreye yon kont Twilio

Enskri nan [twilio.com/try-twilio](https://www.twilio.com/try-twilio). Verifye imèl ou ak nimewo telefòn ou. Twilio bay kredi esè pou fè tès.

## 2. Achte yon nimewo telefòn

1. Ale nan **Phone Numbers** > **Manage** > **Buy a number** nan Twilio Console
2. Chèche yon nimewo ki gen kapasite **Voice** nan kòd zòn ou vle a
3. Klike sou **Buy** epi konfime

Sere nimewo sa a -- w ap antre li nan paramèt administratè Llamenos.

## 3. Jwenn Account SID ak Auth Token ou

1. Ale nan [Twilio Console dashboard](https://console.twilio.com)
2. Jwenn **Account SID** ou ak **Auth Token** ou sou paj prensipal la
3. Klike sou ikòn je a pou revele Auth Token an

## 4. Konfigire webhook yo

Nan Twilio Console, ale nan konfigirasyon nimewo telefòn ou a:

1. Ale nan **Phone Numbers** > **Manage** > **Active Numbers**
2. Klike sou nimewo liy dirèk ou a
3. Anba **Voice Configuration**, mete:
   - **A call comes in**: Webhook, `https://your-worker-url.com/telephony/incoming`, HTTP POST
   - **Call status changes**: `https://your-worker-url.com/telephony/status`, HTTP POST

Ranplase `your-worker-url.com` ak URL Cloudflare Worker reyèl ou a.

## 5. Konfigire nan Llamenos

1. Konekte kòm administratè
2. Ale nan **Settings** > **Telephony Provider**
3. Chwazi **Twilio** nan lis dewoulant founisè a
4. Antre:
   - **Account SID**: nan etap 3
   - **Auth Token**: nan etap 3
   - **Phone Number**: nimewo ou te achte a (fòma E.164, pa egzanp, `+15551234567`)
5. Klike sou **Save**

## 6. Teste konfigirasyon an

Rele nimewo liy dirèk ou a soti nan yon telefòn. Ou ta dwe tande meni seleksyon lang la. Si gen volontè nan ekip travay, apèl la ap pase.

## WebRTC setup (opsyonèl)

Pou pèmèt volontè yo reponn apèl nan navigatè yo olye ke nan telefòn yo:

### Kreye yon API Key

1. Ale nan **Account** > **API keys & tokens** nan Twilio Console
2. Klike sou **Create API Key**
3. Chwazi tip kle **Standard**
4. Sere **SID** ak **Secret** -- sekrè a montre yon sèl fwa

### Kreye yon TwiML App

1. Ale nan **Voice** > **Manage** > **TwiML Apps**
2. Klike sou **Create new TwiML App**
3. Mete **Voice Request URL** a `https://your-worker-url.com/telephony/webrtc-incoming`
4. Sere epi note **App SID** a

### Aktive nan Llamenos

1. Ale nan **Settings** > **Telephony Provider**
2. Aktive **WebRTC Calling**
3. Antre:
   - **API Key SID**: nan API key ou te kreye a
   - **API Key Secret**: nan API key ou te kreye a
   - **TwiML App SID**: nan TwiML App ou te kreye a
4. Klike sou **Save**

Gade [Apèl nan Navigatè ak WebRTC](/docs/deploy/providers/webrtc) pou konfigirasyon volontè ak depannaj.

## Depannaj

- **Apèl pa rive**: Verifye ke URL webhook la kòrèk epi Worker ou a deplwaye. Tcheke jounal erè Twilio Console.
- **Erè "Invalid webhook"**: Asire ke URL webhook la itilize HTTPS epi retounen TwiML valid.
- **Limitasyon kont esè**: Kont esè ka sèlman rele nimewo ki verifye. Amelyore nan yon kont peye pou itilizasyon pwodiksyon.
- **Echèk validasyon webhook**: Asire ke Auth Token nan Llamenos koresponn ak sa ki nan Twilio Console.
