---
title: Rêbera Rêveberê
description: Her tiştî birêve bibe — xwebexş, nobet, kanal, axaftin, rapor, lîsteyên qedexekirinê, û qadên taybet.
---

Weke rêveber, tu her tiştî birêve dibî: xwebexş, nobet, kanalên ragihandinê, axaftin, rapor, lîsteyên qedexekirinê, û qadên taybet. Ev rêber karûbarên sereke yên rêveberiyê di nav de ye.

## Têketin

Bi `nsec` (veşartiya sereke ya WebSocket) re têkeve ku di dema [sazkirinê](/docs/deploy) de hatiye çêkirin. Rûpela têketinê formata nsec qebûl dike (`nsec1...`). Geroka te bi veşartiya te îmze dike — veşartî qet cîhazê terk nake.

Bixwece, di Mîhengan de kilîta WebAuthn-ê tomar bike ji bo têketina bêparol li ser cîhazên din.

## Sihîrbaza sazkirinê

Di têketina yekemîn de, sepana te ber bi **sihîrbaza sazkirinê** vedigere — herikek pir-gavî ya rêvebirinê:

1. **Navê xeta germê binivîse** — navê nîşandanê ku ji bo bikarhêneran tê nîşandan mîheng bike
2. **Kanal hilbijêre** — Deng, SMS, WhatsApp, Signal, û Raporkirinê çalak/neçalak bike
3. **Pêşkêşkan mîheng bike** — ji bo her kanala çalak bawernameyan têkeve
4. **Kontrol bike** — mîhengan piştrast bike û sazkirinê temam bike

Piştî temamkirina sihîrbazê, ala `setupCompleted` tê danîn û sihîrbaz dîsa nayê nîşandan. Tu her dem dikarî van mîhengan ji rûpela Mîhengan biguherînî.

## Rêveberiya xwebexşan

Biçe **Xwebexş** di panela kêlekê de ji bo:

- **Xwebexşek lê zêde bike** — kilîteke nû ya WebSocket çêdike. nsec bi ewlehiya bi xwebexşê re parve bike (tenê carek tê nîşandan).
- **Lînkê vexwendinê çêbike** — lînkek carekî çêdike. Herika vexwendinê hilbijartek rolê di nav de ye (xwebexş, rêveber, an raporger).
- **Biguherîne** — nav, hejmara telefonê, û rola nûve bike.
- **Rake** — gihîştiya xwebexşek neçalak bike.

Hejmarên telefonê yên xwebexşan tenê ji bo rêveberan têne dîtin. Ji bo dengkirina hevdem dema ku xwebexş li ser nobetê ye têne bikaranîn.

## Rêveberiya raporgeran

Raporger rolê taybet in ji bo kesên ku ji bo rêxistinê agahdarî an rapor pêşkêş dikin. Gihîştiya wan sînorkirî ye — ew tenê dikarin raporên xwe û rûpela alîkariyê bibînin.

Ji bo lêzêdekirina raporgerek:
1. Lînkek vexwendinê çêbike û rola **Raporger** hilbijêre
2. Lînk bi raporgerê re parve bike — ew ê bawernameyên xwe çêbikin
3. Raporger têkevinê û navgîniyek sade bi tenê Rapor û Alîkarî dibînin

## Mîhengkirina nobetan

Biçe **Nobet** ji bo çêkirina bernameyên dubare:

1. **Nobet lê zêde bike** bitikîne
2. Navekî binivîse, rojên hefteyê hilbijêre, û demên destpêk/dawî mîheng bike
3. Xwebexş bi riya hilbijartina pir-hilbijartinê ya lêgerînê tayîn bike
4. Tomar bike — pergal bixwe bangên ji bo xwebexşên li ser nobeta çalak rêve dibe

**Komika Veguhestinê** li binê rûpela nobetan mîheng bike. Ev xwebexş dema ku tu nobeta bernamekirî neçalak be deng dibin.

## Lîsteyên qedexekirinê

Biçe **Qedexekirin** ji bo rêveberiya hejmarên telefonê yên astengkirî:

- **Têketina yekane** — hejmara telefonê bi formata E.164 binivîse (mînak, +15551234567)
- **Importa komî** — hejmarên pirjimar paste bike, her yek li ser rêzekê
- **Rake** — hejmarekê bê astengkirin

Qedexekirin bê derengî bandorê dikin. Bangkerên hatine qedexekirin peyamek redkirinê dibihîzin û têne qut kirin.

## Axftin

Dema ku kanalên peyamê (SMS, WhatsApp, Signal) têne çalak kirin, lînkek **Axaftin** di panela kêlekê de xuya dibe. Ev hemû axaftinên girêdayî ji hemû kanalên peyamê nîşan dide.

Her axaftin nîşan dide:
- Balonên peyam bi demjimêran û aliyê (hundir/derva)
- Kanala ku peyam lê hatiye (SMS, WhatsApp, Signal)
- Nûvekirinên rast-dem bi riya WebSocket relay — peyamên nû bê derengî xuya dibin

Axaftin dema ku peyamek hundir tê gîhîştin bixwe çêdibin. Xwebexş dikarin rasterast ji rûyê axaftinê bersiv bidin.

## Rapor

Dema ku kanala Raporan têne çalak kirin, rêveber dikarin hemû raporên hatine şandin bibînin:

- **Lîsteya raporan** — hemû raporan bi sernav, kategorî, statû, û dîroka şandinê nîşan dide
- **Şopandina statûyê** — rapor pêşve diçin vekirî → hatiye xwestin → çareserkirî
- **Raporek bixwaze** — xwe ji bo rêveberiya raporekê tayîn bike
- **Bersivên girêdayî** — bi raporgeran re bi peyamên şîfrekirî bersiv bide
- **Pelên pêvekê** — raporger dikarin pelên şîfrekirî bi raporên xwe re bar bikin

Naveroka raporê û pelên pêvekê bi ECIES têne şîfrekirin — server qet naveroka rapora plaintext nabîne.

## Mîhengên bangê

Di **Mîhengan** de, tu çend beşan dibînî:

### Pêşiya spamê

- **Voice CAPTCHA** — çalak/neçalak bike. Gava çalak be, bangker divê koda 4-rqamî ya ketober bibijêre.
- **Sînorkirina rêjeyê** — çalak/neçalak bike. Bangên li gorî hejmara telefonê di nav pencereya demê ya dilivîn de sînordar dike.

### Transkrîpsiyon

- **Veguheztina gerdûnî** — transkrîpsiyona Whisper ji bo hemû bangan çalak/neçalak bike.
- Xwebexşên takekesî jî dikarin bi riya mîhengan xwe derkevin.

### Mîhengên bangê

- **Dema li benda rêzê** — bangker çiqas li benda voicemailê bimînin (30-300 saniye).
- **Dirêjahiya herî zêde ya voicemailê** — dirêjahiya tomarkirinê ya herî zêde (30-300 saniye).

### Qadên nota taybet

Qadên strukturkirî ku di formê not-girtinê de xuya dibin pênase bike:

- Cureyên piştgirî: text, hejmar, hilbijartin (dropdown), checkbox, textarea
- Kontrola rastdanînê: pêwîst, dirêjahiya min/max, nirxa min/max mîheng bike
- Kontrola dîtinê: hilbijêre ku kîjan qad xwebexş dikarin bibînin û biguherînin
- Qadan bi riya tîrên jor/jêr rêz bike
- Herî zêde 20 qad, herî zêde 50 vebijêrk ji bo her qada hilbijartinê

Nirxên qada taybet bi naveroka notê re têne şîfrekirin. Server qet wan nabîne.

### Peyamên dengî

Ji bo her zimanek piştgirî tomarkirina IVR-ya xwerû tomar bike. Pergal tomarkirinên te ji bo silav, CAPTCHA, rêz, û herikên voicemailê bi kar tîne. Li ku derê tuşek tune be, vegere text-to-speech.

### Kanalên peyamê

SMS, WhatsApp, û Signal mîheng bike:

- **SMS** — çalak/neçalak bike, peyama silavê ji bo bersivên otomatîk mîheng bike. Pêşkêşkara dengê ya we ya heman (Twilio, SignalWire, Vonage, an Plivo) bi kar tîne.
- **WhatsApp** — çalak/neçalak bike, bawernameyên Meta Cloud API têkeve (tokena gihîştinê, tokena piştrastkirinê, ID-ya hejmara telefonê). Ji bo destpêkirina axaftinê di nav pencereya 24-saetî ya peyamê de peyamên şablonê piştgirî dike.
- **Signal** — çalak/neçalak bike, URL-ya piraya signal-cli-rest-api û hejmara telefonê mîheng bike. Bi çavdêriya tenduristiyê re tê ku bi kêmkirinê re baş bibe.

Her kanal xwedan xala xwe ya webhook-ê ye — ji bo URL-yan ji bo mîhengkirinê li [Destpêkirinê](/docs/deploy) binêre.

### Siyaseta WebAuthn

Bixwece ji bo rêveberan, xwebexşan, an herduyan jî passkey-ê pêwîst bike. Gava pêwîst be, bikarhêner divê berî ku bikaribin sepanê bikar bînin kilîtek tomar bikin.

## Alîkariya di sepanê de

Rûpela **Alîkarî** pêşkêş dike:
- Beşên FAQ: Destpêkirin, Bang û Nobet, Not û Şîfrekirin, Rêveberî
- Rêberên taybet ji bo rêveberan, xwebexşan, û raporgeran
- Kartên referansa lez ji bo kurteriyên klavyeyê û ewlehiyê
- Babetên FAQ-yê yên ku dikarin bên berfirehkirin/kêmkirin

Panela rêveberiyê jî **Lîsteya Kontrola Destpêkirinê** nîşan dide ku pêşveçûna sazkirinê bişopîne (kanal mîheng bike, xwebexş lê zêde bike, nobet çêbike, hwd.).

## Tomara kontrolê

Rûpela **Tomara Kontrolê** lîsteyek kronolojîk ya bûyerên pergalê nîşan dide: têketin, bersivdayîna bangê, çêkirina notê, guherandina mîhengê, û çalakiyên rêveberiyê. Têketin navnîşanên IP-yên hashkirî û metadataya welêt di nav de ne. Ji bo gerîna dîrokê rûpelkirinê bi kar bîne.

## Dîroka bangên

Rûpela **Bang** hemû bang bi statû, dirêjahî, û tayînkirina xwebexşê nîşan dide. Bi rangeya dîrokê veqetîne an bi hejmara telefonê lê bigere. Daneyan bi formata JSON-a li gorî GDPR-ê derxe.
