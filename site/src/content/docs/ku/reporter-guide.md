---
title: Rêbera Raporkerê
description: Çawa raporên şîfrekirî bişînin û statûya wan şop bikin.
---

Wekî raporker, hûn dikarin raporên şîfrekirî bi rêya platforma Llamenos re ji rêxistina xwe bişînin. Rapor ji dawî-dawî şîfrekirî ne — server qet naveroka rapora we nabînê.

## Destpêkirin

Rêveberê we dê ji we re yek ji van bide:
- **nsec** (veşartiya sereke ya WebSocket) — rêzek ku bi `nsec1` dest pê dike
- **lînkeke vexwendinê** — URL-yek carekê ku erkdanên ji bo we çêdike

**nsec-a xwe bi ewlehî bigrin.** Ev nasname û erkdanên têketina we ye. Di rêvebera şîfreyê de tomar bikin.

## Têketin

1. Sepanê di geroka xwe de vekin
2. `nsec`-a xwe di qada têketinê de bixin
3. Nasnameya we bi riya şîfrekirinê tê piştrast kirin — veşartiya we ya sereke qet geroka we terk nake

Piştî têketina yekem, hûn dikarin ji bo têketinên hêsantir di pêşerojê de peyvalek WebAuthn di Mîhengan de qeyd bikin.

## Şandina raporê

1. Ji rûpela Raportan **Raporê Nû** bitikînin
2. **Sernav**ek ji bo rapora xwe binivîsin (ev alîkariya rêveberan dike ji bo sereke bike — ew wekî textê ya pût tê tomar kirin)
3. **Kategorî**yek hilbijêrin heke rêveberê we kategoriyên raporê mîheng kiriye
4. Naveroka rapora xwe di qada laşê de binivîsin — ev berî ku geroka we terk bike tê şîfrekirin
5. Bixwece hemî **qadên xwerû** ku rêveberê we mîheng kiriye dagirin
6. Bixwece **pelan pêve bikin** — pelên li alîgirê şîfrekirî berî ku bişînin
7. **Bişîne** bitikînin

Rapora we bi statûya "Vekirî" di lîsteya Raportên we de xuyang dibe.

## Şîfrekirina raporê

- Laşê rapor û nirxên qadên xwerû bi ECIES (secp256k1 + XChaCha20-Poly1305) têne şîfrekirin
- Pelên pêvekê bi heman şêwazê bi cuda têne şîfrekirin
- Tenê hûn û rêveber dikarin naverokê deşîfre bikin
- Server tenê ciphertext tomar dike — heke danegeh were kompromîze kirin, naveroka rapora we ewle ye

## Şopandina raporên we

Rûpela Raportên we hemî raporên we yên şandî bi:
- **Sernav** û **kategorî**
- **Statû** — Vekirî, Xwestin (rêveber li ser dixebitîne), an Çareser Bûye
- **Dema** şandinê

Bişkojkekek raporê da ku girêdana tevahî bibînin, tê de hemî bersivên rêveberê jî.

## Bersivdana rêveberan

Gava ku rêveber bersiva rapora we dide, bersiva wî di girêdana raporê de xuyang dibe. Hûn dikarin vegerin bersiv bidin — hemî peyamên di girêdanê de şîfrekirî ne.

## Tiştên ku hûn nikarîn bikin

Wekî raporker, gihîştina we sînorkirî ye ji bo parastina taybetiya her kesî:
- Hûn **dikarîn** raporên xwe û rûpela Alîkariyê bibînin
- Hûn **nikarin** raporên raporkerên din, tomarên bang, agahdariya xwebexş, an mîhengên rêveberiyê bibînin
- Hûn **nikarin** bangên bersiv bidin an jî bersiva axaftinên SMS/WhatsApp/Signal bidin

## Şîret

- Sernavên ravekirî bikar bînin — ew alîkariya rêveberan dikin ku bêyî ku naveroka tevahî deşîfre bikin sereke bikin
- Pelên têkildar (wêneyên ekran, belge) bixin dema ku rapora we piştgirî dikin
- Dîrokî ji bo bersivên rêveberê kontrol bikin — hûnê guherînên statûyê di lîsteya raporên xwe de bibînin
- Ji bo FAQ û rêberan rûpela Alîkarîyê bikar bînin
