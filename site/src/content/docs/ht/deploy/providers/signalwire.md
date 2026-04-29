---
title: "Setup: SignalWire"
description: Gid etap pa etap pou konfigire SignalWire kòm founisè telefoni ou.
---

SignalWire se yon altènativ ekonomik a Twilio ki gen yon API konpatib. Li itilize LaML (yon langaj baliz konpatib ak TwiML), kidonk migrasyon ant Twilio ak SignalWire fasil.

## Kondisyon Prealab

- Yon [kont SignalWire](https://signalwire.com/signup) (esè gratis disponib)
- Enstans Llamenos ou deplwaye epi aksesib atravè yon URL piblik

## 1. Kreye yon kont SignalWire

Enskri nan [signalwire.com/signup](https://signalwire.com/signup). Pandan enskripsyon, w ap chwazi yon **Space name** (pa egzanp, `myhotline`). URL Space ou a ap `myhotline.signalwire.com`. Note non sa a -- w ap bezwen li nan konfigirasyon an.

## 2. Achte yon nimewo telefòn

1. Nan SignalWire Dashboard ou a, ale nan **Phone Numbers**
2. Klike sou **Buy a Phone Number**
3. Chèche yon nimewo ki gen kapasite vwa
4. Achte nimewo a

## 3. Jwenn idantifyan ou yo

1. Ale nan **API** nan SignalWire Dashboard
2. Jwenn **Project ID** ou (sa fonksyone kòm Account SID)
3. Kreye yon nouvo **API Token** si ou pa genyen -- sa fonksyone kòm Auth Token

## 4. Konfigire webhook yo

1. Ale nan **Phone Numbers** nan tablo bò a
2. Klike sou nimewo liy dirèk ou a
3. Anba **Voice Settings**, mete:
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Call status callback**: `https://your-worker-url.com/telephony/status` (POST)

## 5. Konfigire nan Llamenos

1. Konekte kòm administratè
2. Ale nan **Settings** > **Telephony Provider**
3. Chwazi **SignalWire** nan lis dewoulant founisè a
4. Antre:
   - **Account SID**: Project ID ou nan etap 3
   - **Auth Token**: API Token ou nan etap 3
   - **SignalWire Space**: non Space ou (sèlman non an, pa URL konplè a -- pa egzanp, `myhotline`)
   - **Phone Number**: nimewo ou te achte a (fòma E.164)
5. Klike sou **Save**

## 6. Teste konfigirasyon an

Rele nimewo liy dirèk ou a. Ou ta dwe tande meni seleksyon lang la ak tout pwosesis apèl la.

## WebRTC setup (opsyonèl)

SignalWire WebRTC itilize menm modèl API key tankou Twilio:

1. Nan SignalWire Dashboard ou a, kreye yon **API Key** anba **API** > **Tokens**
2. Kreye yon **LaML Application**:
   - Ale nan **LaML** > **LaML Applications**
   - Mete Voice URL a `https://your-worker-url.com/telephony/webrtc-incoming`
   - Note Application SID a
3. Nan Llamenos, ale nan **Settings** > **Telephony Provider**
4. Aktive **WebRTC Calling**
5. Antre API Key SID, API Key Secret, ak Application SID
6. Klike sou **Save**

## Diferans ak Twilio

- **LaML vs TwiML**: SignalWire itilize LaML, ki fonksyonèlman idantik ak TwiML. Llamenos jere sa otomatikman.
- **URL Space**: Apèl API ale nan `{space}.signalwire.com` olye ke `api.twilio.com`. Adaptatè a jere sa atravè non Space ou bay la.
- **Pri**: SignalWire jeneralman 30-40% pi bon mache pase Twilio pou apèl vwa.
- **Parite fonksyon**: Tout fonksyon Llamenos (anrejistreman, transkripsyon, CAPTCHA, mesajri vokal) fonksyone idantikman ak SignalWire.

## Depannaj

- **Erè "Space not found"**: Verifye byen non Space la (sèlman sou-domèn nan, pa URL konplè a).
- **Echèk webhook**: Asire ke URL Worker ou a aksesib piblikman epi itilize HTTPS.
- **Pwoblèm jeton API**: Jeton SignalWire ka ekspire. Kreye yon nouvo jeton si ou jwenn erè otantifikasyon.
