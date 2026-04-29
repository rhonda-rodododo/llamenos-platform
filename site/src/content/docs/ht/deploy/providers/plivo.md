---
title: "Setup: Plivo"
description: Gid etap pa etap pou konfigire Plivo kòm founisè telefoni ou.
---

Plivo se yon founisè telefoni cloud ki bon mache ak yon API senp. Li itilize kontwòl apèl ki baze sou XML ki sanble ak TwiML, sa ki fè entegrasyon ak Llamenos fasil.

## Kondisyon Prealab

- Yon [kont Plivo](https://console.plivo.com/accounts/register/) (kredi esè disponib)
- Enstans Llamenos ou deplwaye epi aksesib atravè yon URL piblik

## 1. Kreye yon kont Plivo

Enskri nan [console.plivo.com](https://console.plivo.com/accounts/register/). Apre verifikasyon, ou ka jwenn **Auth ID** ak **Auth Token** ou sou paj dakèy tablo bò a.

## 2. Achte yon nimewo telefòn

1. Ale nan **Phone Numbers** > **Buy Numbers** nan Plivo Console
2. Chwazi peyi ou epi chèche nimewo ki gen kapasite vwa
3. Achte yon nimewo

## 3. Kreye yon aplikasyon XML

Plivo itilize "XML Applications" pou dirije apèl yo:

1. Ale nan **Voice** > **XML Applications**
2. Klike sou **Add New Application**
3. Konfigire:
   - **Application Name**: Llamenos Hotline
   - **Answer URL**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Hangup URL**: `https://your-worker-url.com/telephony/status` (POST)
4. Sere aplikasyon an

## 4. Lye nimewo telefòn nan

1. Ale nan **Phone Numbers** > **Your Numbers**
2. Klike sou nimewo liy dirèk ou a
3. Anba **Voice**, chwazi XML Application ou te kreye nan etap 3 la
4. Sere

## 5. Konfigire nan Llamenos

1. Konekte kòm administratè
2. Ale nan **Settings** > **Telephony Provider**
3. Chwazi **Plivo** nan lis dewoulant founisè a
4. Antre:
   - **Auth ID**: nan tablo bò Plivo Console
   - **Auth Token**: nan tablo bò Plivo Console
   - **Phone Number**: nimewo ou te achte a (fòma E.164)
5. Klike sou **Save**

## 6. Teste konfigirasyon an

Rele nimewo liy dirèk ou a. Ou ta dwe tande meni seleksyon lang la epi pase nan pwosesis apèl nòmal la.

## WebRTC setup (opsyonèl)

Plivo WebRTC itilize Browser SDK ak idantifyan ou deja genyen yo:

1. Ale nan **Voice** > **Endpoints** nan Plivo Console
2. Kreye yon nouvo endpoint (sa aji kòm idantite telefòn navigatè a)
3. Nan Llamenos, ale nan **Settings** > **Telephony Provider**
4. Aktive **WebRTC Calling**
5. Klike sou **Save**

Adaptatè a jenere jeton HMAC ki gen limite tan soti nan Auth ID ak Auth Token ou pou otantifikasyon navigatè an sekirite.

## Nòt espesifik pou Plivo

- **XML vs TwiML**: Plivo itilize pwòp fòma XML pa li pou kontwòl apèl, ki sanble men pa idantik ak TwiML. Adaptatè Llamenos a jenere bon XML Plivo a otomatikman.
- **Answer URL vs Hangup URL**: Plivo separe jesyonè apèl inisyal la (Answer URL) de jesyonè fen apèl la (Hangup URL), kontrèman ak Twilio ki itilize yon sèl status callback.
- **Limit frekans**: Plivo gen limit frekans API ki varye selon nivo kont. Pou liy dirèk ki gen anpil volim, kontakte sipò Plivo pou ogmante limit yo.

## Depannaj

- **"Auth ID invalid"**: Auth ID a pa adrès imèl ou. Jwenn li nan paj dakèy tablo bò Plivo Console.
- **Apèl pa dirije**: Verifye ke nimewo telefòn nan lye ak bon XML Application an.
- **Erè Answer URL**: Plivo atann repons XML valid. Tcheke jounal Worker ou pou erè repons.
- **Restriksyon apèl sòti**: Kont esè yo gen limitasyon sou apèl sòti. Amelyore pou itilizasyon pwodiksyon.
