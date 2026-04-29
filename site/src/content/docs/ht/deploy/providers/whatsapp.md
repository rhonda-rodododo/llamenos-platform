---
title: "Konfigirasyon: WhatsApp"
description: Konekte WhatsApp Business via Meta Cloud API pou mesaj chifre.
---

Llamenos sipòte mesaj WhatsApp Business via Meta Cloud API (Graph API v21.0). WhatsApp pèmèt mesaj rich ak sipò pou tèks, imaj, dokiman, odyo, ak mesaj entèraktif.

## Prérequi

- Yon [kont Meta Business](https://business.facebook.com)
- Yon nimewo telefòn API WhatsApp Business
- Yon aplikasyon devlopè Meta ak pwodui WhatsApp aktive

## Mòd entegrasyon

Llamenos sipòte de mòd entegrasyon WhatsApp:

### Meta Dirèk (rekòmande)

Konekte dirèkteman nan Meta Cloud API. Ofri kontwòl konplè ak tout karakteristik yo.

**Kalifikasyon obligatwa:**
- **ID Nimewo Telefòn** — ID nimewo telefòn WhatsApp Business ou a
- **ID Kont Business** — ID Kont Meta Business ou a
- **Jeton Aksè** — yon jeton aksè Meta API ki dire lontan
- **Jeton Verifikasyon** — yon chèn pèsonalize ou chwazi pou verifikasyon webhook
- **Sekrè Aplikasyon** — sekrè aplikasyon Meta ou a (pou validasyon siyati webhook)

### Mòd Twilio

Si ou deja itilize Twilio pou vwa, ou ka dirije WhatsApp atravè kont Twilio ou a. Konfigirasyon pi senp, men kèk karakteristik ka limite.

**Kalifikasyon obligatwa:**
- SID Kont Twilio egzistan ou a, Jeton Otantifikasyon, ak yon expéditeur WhatsApp konekte nan Twilio

## 1. Kreye yon aplikasyon Meta

1. Ale nan [developers.facebook.com](https://developers.facebook.com)
2. Kreye yon nouvo aplikasyon (tip: Business)
3. Ajoute pwodui **WhatsApp** la
4. Nan WhatsApp > Kòmanse, note **ID Nimewo Telefòn** ak **ID Kont Business** ou a
5. Jenere yon jeton aksè pèmanan (Paramèt > Jeton Aksè)

## 2. Konfigire webhook la

Nan tablo bò devlopè Meta:

1. Ale nan WhatsApp > Konfigirasyon > Webhook
2. Mete URL Rappèl la nan:
   ```
   https://your-worker.your-domain.com/api/messaging/whatsapp/webhook
   ```
3. Mete Jeton Verifikasyon an nan menm chèn ou pral antre nan paramèt admin Llamenos
4. Abòne nan chanm webhook `messages` la

Meta pral voye yon demann GET pou verifye webhook la. Worker ou a pral reponn ak defi a si jeton verifikasyon an matche.

## 3. Aktive WhatsApp nan paramèt admin

Ale nan **Paramèt Admin > Chanèl Mesaj** (oswa itilize asistan konfigirasyon) epi aktive **WhatsApp**.

Chwazi mòd **Meta Dirèk** oswa **Twilio** epi antre kalifikasyon ki obligatwa yo.

Konfigire paramèt opsyonèl:
- **Mesaj repons otomatik** — voye nan premye kontak yo
- **Repons apre lè** — voye andeyò lè sèvis yo

## 4. Teste

Voye yon mesaj WhatsApp nan nimewo telefòn Business ou a. Konvèsasyon an ta dwe parèt nan onglèt **Konvèsasyon** yo.

## Fenèt mesaj 24 è

WhatsApp plike yon fenèt mesaj 24 è:
- Ou ka reponn yon itilizatè nan 24 è apre dènye mesaj yo a
- Apre 24 è, ou dwe itilize yon **mesaj modèl** apwouve pou retabli konvèsasyon an
- Llamenos jere sa a otomatikman — si fenèt la ekspire, li voye yon mesaj modèl pou rekòmanse konvèsasyon an

## Sipò medya

WhatsApp sipòte mesaj medya rich:
- **Imaj** (JPEG, PNG)
- **Dokiman** (PDF, Word, elatriye)
- **Odyo** (MP3, OGG)
- **Videyo** (MP4)
- **Lokalizasyon** pataje
- **Bouton entèraktif** ak mesaj lis

Atachman medya parèt anba nan vit konvèsasyon.

## Nòt sekirite

- WhatsApp itilize chifman de bout an bout ant itilizatè a ak enfrastriktirè Meta a
- Meta ka teknikalman aksede kontni mesaj sou sèvè yo
- Mesaj estoke nan Llamenos apre resepsyon soti nan webhook la
- Siyati webhook valide lè l sèvi ak HMAC-SHA256 ak sekrè aplikasyon ou a
- Pou konfidansyalite maksimòm, konsidere itilize Signal olye de WhatsApp
