---
title: "Konfigirasyon : SMS"
description: Aktive mesaj SMS antran ak sòtan via founisè telefoni ou a.
---

Mesaj SMS nan Llamenos reutilize kalifikasyon founisè telefoni vwa ou deja egziste a. Okenn sèvis SMS separe pa obligatwa — si ou deja konfigire Twilio, SignalWire, Vonage, oswa Plivo pou vwa, SMS fonksyone ak menm kont lan.

## Founisè sipòte

| Founisè | Sipò SMS | Nòt |
|----------|------------|-------|
| **Twilio** | Wi | SMS de-de-wout konplè via Twilio Messaging API |
| **SignalWire** | Wi | Konpatib ak Twilio API — menm entèfas |
| **Vonage** | Wi | SMS via Vonage REST API |
| **Plivo** | Wi | SMS via Plivo Message API |
| **Asterisk** | Non | Asterisk pa sipòte SMS natif |

## 1. Aktive SMS nan paramèt admin

Ale nan **Paramèt Admin > Chanèl Mesaj** (oswa itilize asistan konfigirasyon sou premye koneksyon) epi aktive **SMS**.

Konfigire paramèt SMS :
- **Mesaj repons otomatik** — mesaj bienveni opsyonèl voye bay premye kontak yo
- **Repons apre zè** — mesaj opsyonèl voye andeyò zè vire wouk

## 2. Konfigire webhook la

Pwen webhook SMS founisè telefoni ou a nan Worker ou a :

```
POST https://your-worker.your-domain.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. Ale nan Konsòl Twilio ou a > Nimewo Telefòn > Nimewo Aktif
2. Chwazi nimewo telefòn ou a
3. Anba **Mesaj**, mete URL webhook pou "Yon mesaj rive" nan URL ki anlè a
4. Mete metòd HTTP nan **POST**

### Vonage

1. Ale nan Tablo de bò Vonage API > Aplikasyon
2. Chwazi aplikasyon ou a
3. Anba **Mesaj**, mete URL antran nan URL webhook ki anlè a

### Plivo

1. Ale nan Konsòl Plivo > Mesaj > Aplikasyon
2. Kreye oswa modifye yon aplikasyon mesaj
3. Mete URL Mesaj nan URL webhook ki anlè a
4. Asiye aplikasyon an pou nimewo telefòn ou a

## 3. Teste

Voye yon SMS nan nimewo telefòn liy dèd ou a. Ou ta dwe wè konvèsasyon an parèt nan onglet **Konvèsasyon** nan panèl admin.

## Kijan sa fonksyone

1. Yon SMS rive nan founisè ou a, ki voye yon webhook nan Worker ou a
2. Worker la valide siyati webhook (HMAC espesifik founisè)
3. Mesaj la parse epi estoke nan ConversationDO
4. Vòlontè ki nan sèvis notifye via evènman relè Nostr
5. Vòlontè yo reponn soti nan onglet Konvèsasyon — repons yo voye tounen via SMS API founisè ou a

## Nòt sekirite

- Mesaj SMS travèse rezo operatè an tèks klè — founisè ou a ak operatè yo ka li yo
- Mesaj antran estoke nan ConversationDO apre yo rive
- Nimewo telefòn expéditeur hache anvan estokaj (vi prive)
- Siyati webhook valide pa founisè (HMAC-SHA1 pou Twilio, elatriye)
