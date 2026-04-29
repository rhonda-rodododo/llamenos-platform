---
title: Gid pou Administratè
description: Jere tout bagay -- volontè, ekip travay, paramèt apèl, lis entèdi, ak chan pèsonalize.
---

Antanke administratè, ou jere tout bagay: volontè, ekip travay, paramèt apèl, lis entèdi, ak chan pèsonalize. Gid sa a kouvri pi enpòtan pwosesis administratè yo.

## Koneksyon

Konekte ak `nsec` (kle sekrè Nostr) ki te jenere pandan [enstalasyon](/docs/deploy) an. Paj koneksyon an aksepte fòma nsec (`nsec1...`). Navigatè ou a siyen yon defi ak kle a -- sekrè a pa janm kite aparèy la.

Opsyonèlman, anrejistre yon passkey WebAuthn nan Settings pou koneksyon san modpas sou lòt aparèy.

## Jesyon volontè yo

Ale nan **Volunteers** nan ba kote a pou:

- **Ajoute yon volontè** -- sa jenere yon nouvo Nostr keypair. Pataje nsec la ak volontè a an sekirite (li parèt yon sèl fwa).
- **Kreye yon lyen envitasyon** -- sa jenere yon lyen yon sèl fwa ke yon volontè ka itilize pou enskri tèt li.
- **Modifye** -- mete ajou non, nimewo telefòn, ak wòl.
- **Retire** -- dezaktive aksè yon volontè.

Nimewo telefòn volontè yo vizib sèlman pou administratè yo. Yo itilize pou sonnen plizyè moun anmenmtan lè volontè a nan ekip travay.

## Konfigire ekip travay yo

Ale nan **Shifts** pou kreye orè ki repete:

1. Klike sou **Add Shift**
2. Mete yon non, chwazi jou nan semèn nan, epi mete lè kòmanse/fini
3. Chwazi volontè yo ak rechèch multi-seleksyon
4. Sere -- sistèm nan ap otomatikman dirije apèl yo bay volontè ki nan ekip travay aktif la

Konfigire yon **Fallback Group** anba paj ekip travay la. Volontè sa yo ap sonnen lè pa gen okenn ekip travay pwograme ki aktif.

## Lis entèdi

Ale nan **Bans** pou jere nimewo telefòn bloke yo:

- **Yon sèl antre** -- tape yon nimewo telefòn nan fòma E.164 (pa egzanp, +15551234567)
- **Enpòtasyon an gwo** -- kole plizyè nimewo, youn pa liy
- **Retire** -- debloke yon nimewo imedyatman

Entèdiksyon yo pran efè imedyatman. Moun ki entèdi tande yon mesaj rejè epi yo dekonekte.

## Paramèt apèl

Nan **Settings**, w ap jwenn plizyè seksyon:

### Pwoteksyon kont spam

- **Voice CAPTCHA** -- aktive/dezaktive. Lè li aktive, moun k ap rele yo dwe antre yon kòd 4 chif owaza.
- **Limitasyon frekans** -- aktive/dezaktive. Limite apèl pa nimewo telefòn nan yon fenèt tan glisan.

### Transkripsyon

- **Baskil jeneral** -- aktive/dezaktive transkripsyon Whisper pou tout apèl.
- Chak volontè kapab tou refize nan pwòp paramèt pa yo.

### Paramèt apèl

- **Delè fil datant** -- konbyen tan moun k ap rele a tann anvan li ale nan mesajri vokal (30-300 segonn).
- **Dire maksimòm mesajri vokal** -- longè anrejistreman maksimòm (30-300 segonn).

### Chan nòt pèsonalize

Defini chan estriktire ki parèt nan fòmilè pou pran nòt:

- Tip ki sipòte: text, number, select (dropdown), checkbox, textarea
- Konfigire validasyon: obligatwa, longè min/max, valè min/max
- Kontwole vizibilite: chwazi ki chan volontè yo ka wè ak modifye
- Reyòdone chan yo ak flèch monte/desann
- Maksimòm 20 chan, maksimòm 50 opsyon pa chan select

Valè chan pèsonalize yo chifre ansanm ak kontni nòt la. Sèvè a pa janm wè yo.

### Envit vokal

Anrejistre envit odyo IVR pèsonalize pou chak lang ki sipòte. Sistèm nan itilize anrejistreman ou yo pou akèy, CAPTCHA, fil datant, ak mesajri vokal. Kote ki pa gen anrejistreman, li itilize text-to-speech.

### Règ WebAuthn

Opsyonèlman egzije passkey pou administratè, volontè, oswa toude. Lè sa obligatwa, itilizatè yo dwe anrejistre yon passkey anvan yo ka itilize aplikasyon an.

## Jounal odit

Paj **Audit Log** la montre yon lis kwonolojik evènman sistèm yo: koneksyon, repons apèl, kreyasyon nòt, chanjman paramèt, ak aksyon administratè. Antre yo gen ladann adrès IP ki hache ak metadone peyi. Itilize paj yo pou navige nan istwa a.

## Istwa apèl

Paj **Calls** la montre tout apèl yo ak estati, dire, ak asiyasyon volontè. Filtre pa dat oswa chèche pa nimewo telefòn. Ekspòte done nan fòma JSON konfòm GDPR.
