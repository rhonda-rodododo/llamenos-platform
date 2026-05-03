---
title: Gid Mobil
description: Enstale ak konfigire aplikasyon mobil Llamenos sou iOS ak Android.
---

Aplikasyon mobil Llamenos pèmèt volontè reponn apèl, reponn mesaj, ak ekri nòt chifre soti nan telefòn yo. Li bati ak React Native epi pataje menm kè kriptografik Rust la ak aplikasyon desktop la.

## Kisa aplikasyon mobil la ye?

Aplikasyon mobil la se yon konpanyon pou aplikasyon desktop la. Li konekte nan menm backend Llamenos (Cloudflare Workers oswa otojere) epi itilize menm pwotokòl la, konsa volontè ka chanje ant desktop ak mobil san pwoblèm.

Aplikasyon mobil la viv nan yon depo separe (`llamenos-hotline`) men pataje:

- **llamenos-core** — Menm krate Rust pou tout operasyon kriptografik, konpile via UniFFI pou iOS ak Android
- **Pwotokòl** — Menm fòma fil, pwen final API, ak chema chifman
- **Backend** — Menm Cloudflare Worker oswa sèvè otojere

## Telechaje ak enstale

### Android

Aplikasyon mobil la aktyèlman distribiye kòm APK pou chajman lateral:

1. Telechaje dènye fichye `.apk` soti nan paj [GitHub Releases](https://github.com/rhonda-rodododo/llamenos-hotline/releases/latest) la
2. Sou aparèy Android ou a, ale nan **Paramèt > Sekirite** epi aktive **Enstale soti nan sous enkoni** (oswa aktive l pou aplikasyon lè yo mande)
3. Ouvri APK telechaje a epi tape **Enstale**
4. Yon fwa enstale, ouvri Llamenos soti nan tiwa aplikasyon ou a

Distribisyon App Store ak Play Store planifye pou yon vèsyon nan lavni.

### iOS

Build iOS disponib kòm beta TestFlight:

1. Enstale [TestFlight](https://apps.apple.com/app/testflight/id899247664) soti nan App Store
2. Mande admin ou a pou lyen envitasyon TestFlight la
3. Ouvri lyen an sou aparèy iOS ou a pou rejwenn beta a
4. Enstale Llamenos soti nan TestFlight

Distribisyon App Store planifye pou yon vèsyon nan lavni.

## Konfigirasyon inisyal

Aplikasyon mobil la konfigire lè w lye li nan yon kont desktop egzistan. Sa a asire ke menm idantite kriptografik la itilize nan tout aparèy san yo pa janm transmèt kle sekrè a nan tèks klè.

### Pwovizyon aparèy (eskan QR)

1. Ouvri aplikasyon desktop Llamenos epi ale nan **Paramèt > Aparèy**
2. Klike **Lye Nouvo Aparèy** — sa a jenere yon kòd QR ki gen yon jeton pwovizyon yon sèl fwa
3. Ouvri aplikasyon mobil Llamenos epi tape **Lye Aparèy**
4. Eskan kòd QR la ak kamera telefòn ou a
5. Aplikasyon yo fè yon echanj kle ECDH efemerèl pou transfere materyèl kle chifre ou a an sekirite
6. Mete yon PIN sou aplikasyon mobil la pou pwoteje depo kle lokal ou a
7. Aplikasyon mobil la kounye a lye epi pare pou itilize

Pwosesis pwovizyon an pa janm transmèt nsec ou a nan tèks klè. Aplikasyon desktop la vlope materyèl kle a ak sekrè pataje efemerèl la, epi aplikasyon mobil la devlope li lokalman.

### Konfigirasyon manyèl (antre nsec)

Si ou pa ka eskan yon kòd QR, ou ka antre nsec ou a dirèkteman:

1. Ouvri aplikasyon mobil la epi tape **Antre nsec manyèlman**
2. Kole kle `nsec1...` ou a
3. Mete yon PIN pou pwoteje depo lokal
4. Aplikasyon an derive kle piblik ou a epi anrejistre ak backend la

Metòd sa a mande pou jere nsec ou dirèkteman, konsa sèlman itilize li si lye aparèy pa posib. Itilize yon jestyon modpas pou kole nsec la olye pou tape li.

## Konparezon karakteristik

| Karakteristik | Desktop | Mobil |
|---|---|---|
| Reponn apèl rantre | Wi | Wi |
| Ekri nòt chifre | Wi | Wi |
| Chanm nòt pèsonalize | Wi | Wi |
| Reponn mesaj (SMS, WhatsApp, Signal) | Wi | Wi |
| Wè konvèsasyon | Wi | Wi |
| Estati sèvis ak repo | Wi | Wi |
| Trankskripsyon bò kliyan | Wi (WASM Whisper) | Non |
| Rechèch nòt | Wi | Wi |
| Palèt kòmand | Wi (Ctrl+K) | Non |
| Rakousi klavye | Wi | Non |
| Paramèt admin | Wi (konplè) | Wi (limite) |
| Jere volontè | Wi | Gade sèlman |
| Wè jounal odite | Wi | Wi |
| Apèl navigatè WebRTC | Wi | Non (itilize telefòn natif natal) |
| Notifikasyon pousif | Notifikasyon OS | Pousif natif natal (FCM/APNS) |
| Mizajou otomatik | Updater Tauri | App Store / TestFlight |
| Atachman fichye (rapò) | Wi | Wi |

## Limitasyon

- **Pa gen trankskripsyon bò kliyan** — Modèl WASM Whisper la bezwen resous memwa ak CPU enpòtan ki enpratikal sou mobil. Trankskripsyon apèl sèlman disponib sou desktop.
- **Pèfòmans kripto redui** — Pandan aplikasyon mobil la itilize menm kè kripto Rust via UniFFI, operasyon ka pi lant sou aparèy ba nivo konpare ak pèfòmans natif natal desktop.
- **Karakteristik admin limite** — Kèk operasyon admin (jesyon volontè an vrac, konfigirasyon paramèt detaye) sèlman disponib nan aplikasyon desktop la. Aplikasyon mobil la bay vit li sèlman pou pifò ekran admin.
- **Pa gen apèl WebRTC** — Volontè mobil resevwa apèl sou nimewo telefòn yo via founisè telefoni a, pa atravè navigatè a. Apèl nan aplikasyon WebRTC se pou desktop sèlman.
- **Batri ak konektivite** — Aplikasyon an bezwen yon koneksyon pèsistan pou resevwa mizajou an tan reyèl. Mòd background ka limite pa jesyon enèji OS. Kenbe aplikasyon an nan premye plan pandan sèvis pou notifikasyon fyab.

## Depannaj pwoblèm mobil

### Pwovizyon echwe ak "Kòd QR Invalide"

- Asire kòd QR la te jenere resamman (jeton pwovizyon ekspire apre 5 minit)
- Jenere yon nouvo kòd QR soti nan aplikasyon desktop epi eseye ankò
- Asire tou de aparèy yo konekte nan entènèt

### Pa resevwa notifikasyon pousif

- Tcheke ke notifikasyon aktive pou Llamenos nan paramèt aparèy ou a
- Sou Android: Ale nan **Paramèt > Aplikasyon > Llamenos > Notifikasyon** epi aktive tout chanèl
- Sou iOS: Ale nan **Paramèt > Notifikasyon > Llamenos** epi aktive **Pèmèt Notifikasyon**
- Asire ou pa nan mòd Pa Deranje
- Verifye ke sèvis ou a aktif epi ou pa nan repo

### Aplikasyon krache nan lanse

- Asire ou ap kouri dènye vèsyon aplikasyon an
- Netwaye kach aplikasyon an: **Paramèt > Aplikasyon > Llamenos > Depo > Netwaye Kach**
- Si pwoblèm lan kontinye, dezenstale epi reenstale (ou pral bezwen relye aparèy la)

### Pa ka dechifre ansyen nòt apre reenstale

- Reenstale aplikasyon an retire materyèl kle lokal
- Relye aparèy la via kòd QR soti nan aplikasyon desktop ou a pou restore aksè
- Nòt chifre anvan reenstale la pral aksesib yon fwa aparèy la relye ak menm idantite a

### Pèfòmans lan sou ansyen aparèy

- Fèmen lòt aplikasyon pou libere memwa
- Deaktive animasyon nan paramèt aplikasyon si disponib
- Konsidere itilize aplikasyon desktop pou operasyon lou tankou revizyon nòt an vrac
