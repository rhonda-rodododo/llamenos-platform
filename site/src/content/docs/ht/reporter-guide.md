---
title: Gid Repòtè
description: Kijan pou soumèt rapò chifre ak swiv estati yo.
---

Kòm yon repòtè, ou ka soumèt rapò chifre nan òganizasyon ou a atravè platfòm Llamenos la. Rapò yo chifre de bout an bout — sèvè a pa janm wè kontni rapò ou a.

## Kòmanse

Admin ou a ap ba ou youn nan:
- Yon **nsec** (kle sekrè Nostr) — yon chèn ki kòmanse ak `nsec1`
- Yon **lyen envitasyon** — yon URL yon sèl fwa ki kreye kalifikasyon pou ou

**Kenbe nsec ou a prive.** Se idantite ou ak kalifikasyon koneksyon ou. Estoke li nan yon jestyon modpas.

## Konekte

1. Ouvri aplikasyon an nan navigatè ou a
2. Kole `nsec` ou a nan chanm koneksyon an
3. Idantite ou verifye kriptografikman — kle sekrè ou a pa janm kite navigatè ou a

Apre premye koneksyon, ou ka anrejistre yon passkey WebAuthn nan Paramèt pou koneksyon pi fasil nan lavni.

## Soumèt yon rapò

1. Klike **Nouvo Rapò** soti nan paj Rapò yo
2. Antre yon **tit** pou rapò ou a (sa a ede admin yo triage — li estoke nan tèks klè)
3. Chwazi yon **kategori** si admin ou a te defini kategori rapò
4. Ekri **kontni rapò** ou a nan chanm kò a — sa a chifre anvan li kite navigatè ou a
5. Opsyonèlman ranpli nenpòt **chanm pèsonalize** admin ou a te konfigire
6. Opsyonèlman **atache fichye** — fichye yo chifre bò kliyan anvan telechajman
7. Klike **Soumèt**

Rapò ou a parèt nan lis Rapò ou a ak yon estati "Ouvè".

## Chifman rapò

- Kò rapò a ak valè chanm pèsonalize chifre lè l sèvi ak ECIES (secp256k1 + XChaCha20-Poly1305)
- Atachman fichye chifre separeman lè l sèvi ak menm chema a
- Sèlman ou ak admin ka dechifre kontni an
- Sèvè a estoke sèlman sifretèks — menm si baz done a konwonpu, kontni rapò ou a an sekirite

## Swiv rapò ou yo

Paj Rapò ou a montre tout rapò soumèt ou yo ak:
- **Tit** ak **kategori**
- **Estati** — Ouvè, Reklame (yon admin ap travay dessus), oswa Rezoud
- **Dat** soumisyon

Klike sou yon rapò pou wè fil konplè a, enkli nenpòt repons admin.

## Reponn admin yo

Lè yon admin reponn rapò ou a, repons yo parèt nan fil rapò a. Ou ka reponn — tout mesaj nan fil la chifre.

## Sa ou pa ka fè

Kòm yon repòtè, aksè ou limite pou pwoteje konfidansyalite tout moun:
- Ou **kapab** wè pwòp rapò ou yo ak paj Èd la
- Ou **pa kapab** wè rapò lòt repòtè, dosye apèl, enfòmasyon volontè, oswa paramèt admin
- Ou **pa kapab** reponn apèl oswa reponn konvèsasyon SMS/WhatsApp/Signal

## Konsèy

- Itilize tit deskripsyon — yo ede admin yo triage san dechifre kontni konplè a
- Atache fichye enpòtan (ekran, dokiman) lè yo sipòte rapò ou a
- Retoune peryodikman pou repons admin — ou pral wè chanjman estati nan lis rapò ou a
- Itilize paj Èd la pou FAQ ak gid
