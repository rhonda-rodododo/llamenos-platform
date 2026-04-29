---
title: "Setup: Vonage"
description: Gid etap pa etap pou konfigire Vonage kòm founisè telefoni ou.
---

Vonage (ansyen Nexmo) ofri bon kouvèti entènasyonal ak pri konpetitif. Li itilize yon modèl API diferan de Twilio -- Vonage Applications regwoupe nimewo ou, webhook, ak idantifyan ou ansanm.

## Kondisyon Prealab

- Yon [kont Vonage](https://dashboard.nexmo.com/sign-up) (kredi gratis disponib)
- Enstans Llamenos ou deplwaye epi aksesib atravè yon URL piblik

## 1. Kreye yon kont Vonage

Enskri nan [Vonage API Dashboard](https://dashboard.nexmo.com/sign-up). Verifye kont ou epi note **API Key** ak **API Secret** ou nan paj dakèy tablo bò a.

## 2. Achte yon nimewo telefòn

1. Ale nan **Numbers** > **Buy numbers** nan Vonage Dashboard
2. Chwazi peyi ou epi chwazi yon nimewo ki gen kapasite **Voice**
3. Achte nimewo a

## 3. Kreye yon Vonage Application

Vonage regwoupe konfigirasyon nan "Applications":

1. Ale nan **Applications** > **Create a new application**
2. Antre yon non (pa egzanp, "Llamenos Hotline")
3. Anba **Voice**, aktive li epi mete:
   - **Answer URL**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Event URL**: `https://your-worker-url.com/telephony/status` (POST)
4. Klike sou **Generate new application**
5. Sere **Application ID** ki parèt sou paj konfimasyon an
6. Telechaje fichye **private key** a -- w ap bezwen kontni li pou konfigirasyon

## 4. Lye nimewo telefòn nan

1. Ale nan **Numbers** > **Your numbers**
2. Klike sou ikòn angrenaj la akote nimewo liy dirèk ou a
3. Anba **Voice**, chwazi Application ou te kreye nan etap 3 la
4. Klike sou **Save**

## 5. Konfigire nan Llamenos

1. Konekte kòm administratè
2. Ale nan **Settings** > **Telephony Provider**
3. Chwazi **Vonage** nan lis dewoulant founisè a
4. Antre:
   - **API Key**: nan paj dakèy Vonage Dashboard la
   - **API Secret**: nan paj dakèy Vonage Dashboard la
   - **Application ID**: nan etap 3
   - **Phone Number**: nimewo ou te achte a (fòma E.164)
5. Klike sou **Save**

## 6. Teste konfigirasyon an

Rele nimewo liy dirèk ou a. Ou ta dwe tande meni seleksyon lang la. Verifye ke apèl yo dirije bay volontè ki nan ekip travay.

## WebRTC setup (opsyonèl)

Vonage WebRTC itilize idantifyan Application ou te deja kreye yo:

1. Nan Llamenos, ale nan **Settings** > **Telephony Provider**
2. Aktive **WebRTC Calling**
3. Antre kontni **Private Key** a (tèks PEM konplè nan fichye ou te telechaje a)
4. Klike sou **Save**

Application ID a deja konfigire. Vonage jenere JWT RS256 ki itilize kle prive a pou otantifikasyon navigatè.

## Nòt espesifik pou Vonage

- **NCCO vs TwiML**: Vonage itilize NCCO (Nexmo Call Control Objects) nan fòma JSON olye ke XML markup. Adaptatè Llamenos a jenere fòma ki kòrèk otomatikman.
- **Fòma Answer URL**: Vonage atann ke answer URL a retounen JSON (NCCO), pa XML. Adaptatè a jere sa.
- **Event URL**: Vonage voye evènman apèl (sonnen, reponn, fini) nan event URL a kòm demann POST JSON.
- **Sekirite kle prive**: Kle prive a estoke chifre. Li pa janm kite sèvè a -- li sèvi sèlman pou jenere jeton JWT kout dire.

## Depannaj

- **"Application not found"**: Verifye ke Application ID a koresponn egzakteman. Ou ka jwenn li anba **Applications** nan Vonage Dashboard.
- **Pa gen apèl antre**: Asire ke nimewo telefòn nan lye ak bon Application an (etap 4).
- **Erè kle prive**: Kole tout kontni PEM an ansanm ak liy `-----BEGIN PRIVATE KEY-----` ak `-----END PRIVATE KEY-----` yo.
- **Fòmataj nimewo entènasyonal**: Vonage egzije fòma E.164. Mete `+` ak kòd peyi a.
