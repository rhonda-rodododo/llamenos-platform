---
title: Apèl nan Navigatè ak WebRTC
description: Aktive repons apèl nan navigatè pou volontè yo ak WebRTC.
---

WebRTC (Web Real-Time Communication) pèmèt volontè yo reponn apèl liy dirèk dirèkteman nan navigatè yo, san yo pa bezwen yon telefòn. Sa itil pou volontè ki prefere pa pataje nimewo telefòn yo oswa ki travay sou yon òdinatè.

## Kijan li fonksyone

1. Administratè a aktive WebRTC nan paramèt founisè telefoni a
2. Volontè yo mete preferans apèl yo sou "Browser" nan pwofil yo
3. Lè yon apèl rive, aplikasyon Llamenos nan sonnen nan navigatè a ak yon notifikasyon
4. Volontè a klike sou "Answer" epi apèl la konekte atravè navigatè a ak mikwofòn li

Odyo apèl la dirije soti nan founisè telefoni a atravè yon koneksyon WebRTC nan navigatè volontè a. Kalite apèl la depann de koneksyon entènèt volontè a.

## Kondisyon Prealab

### Konfigirasyon administratè

- Yon founisè telefoni ki sipòte ak WebRTC aktive (Twilio, SignalWire, Vonage, oswa Plivo)
- Idantifyan WebRTC espesifik pou founisè a konfigire (gade gid setup founisè yo)
- WebRTC aktive nan **Settings** > **Telephony Provider**

### Egzijans volontè

- Yon navigatè modèn (Chrome, Firefox, Edge, oswa Safari 14.1+)
- Yon mikwofòn ki fonksyone
- Yon koneksyon entènèt estab (minimòm 100 kbps monte/desann)
- Pèmisyon notifikasyon navigatè akòde

## Konfigirasyon espesifik pou founisè

Chak founisè telefoni mande diferan idantifyan pou WebRTC:

### Twilio / SignalWire

1. Kreye yon **API Key** nan konsòl founisè a
2. Kreye yon **TwiML/LaML Application** ak Voice URL mete sou `https://your-worker-url.com/telephony/webrtc-incoming`
3. Nan Llamenos, antre API Key SID, API Key Secret, ak Application SID

### Vonage

1. Application Vonage ou a deja gen kapasite WebRTC
2. Nan Llamenos, kole **private key** Application ou a (fòma PEM)
3. Application ID a deja konfigire depi premye setup a

### Plivo

1. Kreye yon **Endpoint** nan Plivo Console anba **Voice** > **Endpoints**
2. WebRTC itilize Auth ID ak Auth Token ou deja genyen
3. Aktive WebRTC nan Llamenos -- pa gen idantifyan adisyonèl ki nesesè

### Asterisk

Asterisk WebRTC mande konfigirasyon SIP.js ak transpò WebSocket. Sa pi konplike pase founisè cloud yo:

1. Aktive transpò WebSocket nan `http.conf` Asterisk
2. Kreye endpoint PJSIP pou kliyan WebRTC ak DTLS-SRTP
3. Llamenos konfigire kliyan SIP.js otomatikman lè Asterisk chwazi

Gade [gid setup Asterisk](/docs/deploy/providers/asterisk) pou tout detay yo.

## Konfigirasyon preferans apèl volontè

Volontè yo konfigire preferans apèl yo nan aplikasyon an:

1. Konekte nan Llamenos
2. Ale nan **Settings** (ikòn angrenaj)
3. Anba **Call Preferences**, chwazi **Browser** olye ke **Phone**
4. Akòde pèmisyon mikwofòn ak notifikasyon lè yo mande ou
5. Kenbe onglè Llamenos a ouvè pandan ekip travay ou

Lè yon apèl rive, w ap wè yon notifikasyon navigatè ak yon endikatè sonri nan aplikasyon an. Klike sou **Answer** pou konekte.

## Konpatibilite navigatè

| Navigatè | Desktop | Mobil | Nòt |
|---|---|---|---|
| Chrome | Wi | Wi | Rekòmande |
| Firefox | Wi | Wi | Sipò konplè |
| Edge | Wi | Wi | Baze sou Chromium, sipò konplè |
| Safari | Wi (14.1+) | Wi (14.1+) | Mande entèraksyon itilizatè pou kòmanse odyo |
| Brave | Wi | Limite | Ka bezwen dezaktive boukliye pou mikwofòn |

## Konsèy pou kalite odyo

- Itilize yon kasèt oswa ekoutè pou anpeche eko
- Fèmen lòt aplikasyon ki itilize mikwofòn nan
- Itilize yon koneksyon entènèt ak fil lè sa posib
- Dezaktive ekstansyon navigatè ki ka entèfere ak WebRTC (ekstansyon VPN, blokè reklam ak pwoteksyon fuit WebRTC)

## Depannaj

### Pa gen odyo

- **Tcheke pèmisyon mikwofòn**: Klike sou ikòn kadna nan ba adrès la epi asire ke aksè mikwofòn nan se "Allow"
- **Teste mikwofòn ou**: Itilize tès odyo entegre navigatè ou a oswa yon sit tankou [webcamtest.com](https://webcamtest.com)
- **Tcheke sòti odyo**: Asire ke opalè oswa kasèt ou chwazi kòm aparèy sòti

### Apèl pa sonnen nan navigatè

- **Notifikasyon bloke**: Tcheke ke notifikasyon navigatè aktive pou sit Llamenos la
- **Onglè pa aktif**: Onglè Llamenos la dwe ouvè (li ka nan fon, men onglè a dwe egziste)
- **Preferans apèl**: Verifye ke preferans apèl ou mete sou "Browser" nan Settings
- **WebRTC pa konfigire**: Mande administratè ou verifye ke WebRTC aktive epi idantifyan yo mete

### Pwoblèm firewall ak NAT

WebRTC itilize sèvè STUN/TURN pou travèse firewall ak NAT. Si apèl konekte men ou pa tande odyo:

- **Firewall antrepriz**: Kèk firewall bloke trafik UDP sou pò ki pa estanda. Mande ekip IT ou pèmèt trafik UDP sou pò 3478 ak 10000-60000
- **NAT simetrik**: Kèk routeur itilize NAT simetrik ki ka anpeche koneksyon dirèk ant pè. Sèvè TURN founisè telefoni a ta dwe jere sa otomatikman
- **Entèferans VPN**: VPN ka entèfere ak koneksyon WebRTC. Eseye dekonekte VPN ou pandan ekip travay

### Eko oswa retou son

- Itilize ekoutè olye ke opalè
- Diminye sansibilite mikwofòn nan paramèt odyo OS ou a
- Aktive anilasyon eko nan navigatè ou a (jeneralman aktive pa defo)
- Deplase lwen sifas di ak reflechisan
