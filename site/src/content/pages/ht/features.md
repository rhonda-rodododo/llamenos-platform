---
title: Fonksyonalite
subtitle: Tout sa yon platfòm repons kriz bezwen, nan yon sèl pakèt sous louvri. Vwa, SMS, WhatsApp, Signal, ak rapò chifre — bati sou Cloudflare Workers san sèvè pou jere.
---

## Telefoni Miltifounisè

**5 founisè vwa** — Chwazi pami Twilio, SignalWire, Vonage, Plivo, oswa Asterisk otojere. Konfigire founisè ou nan UI paramèt admin oswa pandan asistan konfigirasyon an. Chanje founisè nenpòt ki lè san chanjman kòd.

**Apèl WebRTC via navigatè** — Vòlontè yo ka reponn apèl dirèkteman nan navigatè san telefòn. Jenerasyon jeton WebRTC espesifik founisè pou Twilio, SignalWire, Vonage, ak Plivo. Preferans apèl konfigurab pa vòlontè (telefòn, navigatè, oswa tou de).

## Routaj Apèl

**Sonn an paralèl** — Lè yon moun rele, chak vòlontè ki nan sèvis ki pa okipe sonne an menm tan. Premye vòlontè ki pran apèl a jwenn li ; lòt sonn yo kanpe imedyatman.

**Planifikasyon baze sou vire wouk** — Kreye vire wouk rekiran ak jou ak plaj tan espesifik. Asiye vòlontè pou vire wouk. Sistèm nan otomatikman route apèl yo pou moun ki nan sèvis.

**Fil datant ak mizik datant** — Si tout vòlontè okipe, moun k ap rele yo antre nan yon fil datant ak mizik datant konfigurab. Timeout fil la ajistab (30-300 segonn). Lè pèsonn pa reponn, apèl yo tonbe nan mesaj vokal.

**Repli mesaj vokal** — Moun k ap rele yo ka kite yon mesaj vokal (jiska 5 minit) si okenn vòlontè pa reponn. Mesaj vokal yo transkrip via Whisper AI epi chifre pou revizyon admin.

## Nòt Chifre

**Pran nòt chifre de-de-wout** — Vòlontè yo ekri nòt pandan ak apre apèl. Nòt yo chifre kote kliyan lè l sèvi ak ECIES (secp256k1 + XChaCha20-Poly1305) anvan yo kite navigatè a. Sèvè a estoke sèlman tèks chifre.

**Doub chifraj** — Chak nòt chifre de fwa : yon fwa pou vòlontè ki ekri li, ak yon fwa pou admin. Tou de ka dechifre endepandamman. Pèsonn lòt pa ka li kontni an.

**Chan pèsonalize** — Admin yo defini chan pèsonalize pou nòt : tèks, nimewo, seleksyon, bwat a kocher, zòn tèks. Chan yo chifre akote kontni nòt yo.

**Sove brouyon otomatik** — Nòt yo sove otomatikman kòm brouyon chifre nan navigatè a. Si paj la rechaje oswa vòlontè navige yon lòt kote, travay li konsève. Brouyon yo efase sou dekoneksyon.

## Transkripsyon AI

**Transkripsyon alimenté pa Whisper** — Anrejistreman apèl yo transkrip lè l sèvi ak Cloudflare Workers AI ak modèl Whisper. Transkripsyon fèt kote sèvè, epi transkripsyon an chifre anvan estokaj.

**Kontwòl baskil** — Admin ka aktive/dezaktive transkripsyon an global. Vòlontè yo ka dezabòne endividyèlman. Tou de baskil yo endepandan.

**Transkripsyon chifre** — Transkripsyon yo itilize menm chifraj ECIES ak nòt yo. Transkripsyon ki estoke a sèlman tèks chifre.

## Atenyasyon Spam

**CAPTCHA vwa** — Deteksyon bot vwa opsyonèl : moun k ap rele yo tande yon nimewo 4 chif aléatwa epi dwe antre li sou klavye. Bloke rele otomatize tout an rete aksesib pou vrè moun k ap rele.

**Limit debit** — Limit debit fenèt glisan pa nimewo telefòn, pèsiste nan estokaj Durable Object. Siviv restan Worker. Seuil konfigurab.

**Lis entèdiksyon an tan reyèl** — Admin yo jere lis entèdiksyon nimewo telefòn ak antre sèl oswa enpòtasyon an mas. Entèdiksyon yo pran efè imedyatman. Moun k ap rele entèdi tande yon mesaj rejè.

**Envit IVR pèsonalize** — Anrejistre envit vwa pèsonalize pou chak lang sipòte. Sistèm nan itilize anrejistreman ou yo pou fliks IVR, tounen nan sentèz vwa lè pa gen anrejistreman.

## Mesaj Miltichanèl

**SMS** — Mesaj SMS antran ak sòtan via Twilio, SignalWire, Vonage, oswa Plivo. Repons otomatik ak mesaj byenveni konfigurab. Mesaj yo koule nan vi konvèsasyon an fil.

**WhatsApp Business** — Konekte via Meta Cloud API (Graph API v21.0). Sipò mesaj modèl pou kòmanse konvèsasyon nan fenèt mesaj 24-zè. Sipò mesaj medya pou imaj, dokiman, ak odyo.

**Signal** — Mesaj aksan sou vi prive via yon pon signal-cli-rest-api otojere. Siveyans sante ak degradasyon pwogresif. Transkripsyon mesaj vwa via Workers AI Whisper.

**Konvèsasyon an fil** — Tout chanèl mesaj koule nan yon vi konvèsasyon inifye. Bil mesaj ak timestamp ak endikatè direksyon. Mizajou an tan reyèl via WebSocket.

## Rapò Chifre

**Wòl rapòtè** — Yon wòl dedye pou moun ki soumèt tuyò oswa rapò. Rapòtè yo wè yon entèfas senplifye ak sèlman rapò ak èd. Envite via menm fliks ak vòlontè, ak yon selektè wòl.

**Soumisyon chifre** — Kontni kò rapò a chifre lè l sèvi ak ECIES anvan li kite navigatè a. Tit an tèks klè pou triaj, kontni chifre pou vi prive. Atachman fichye chifre separe.

**Fliks travay rapò** — Kategori pou òganize rapò. Swivi estati (ouvè, reklame, rezoud). Admin yo ka reklame rapò yo epi reponn ak repons an fil chifre.

## Tablo de Bò Admin

**Asistan konfigirasyon** — Konfigirasyon gide an plizyè etap sou premye koneksyon admin. Chwazi ki chanèl pou aktive (Vwa, SMS, WhatsApp, Signal, Rapò), konfigire founisè, ak mete non liy dèd ou a.

**Lis verifikasyon Kòmanse** — Widget tablo de bò ki swivi pwogrè konfigirasyon : konfigirasyon chanèl, entegrasyon vòlontè, kreyasyon vire wouk.

**Siveyans an tan reyèl** — Gade apèl aktif, moun k ap rele ki nan fil datant, konvèsasyon, ak estati vòlontè an tan reyèl via WebSocket. Metrik yo mete ajou imedyatman.

**Jesyon vòlontè** — Ajoute vòlontè ak pè kle jenere, jere wòl (vòlontè, admin, rapòtè), wè estati an liy. Lyen envitasyon pou otoanrejistreman ak seleksyon wòl.

**Jounal odit** — Chak apèl reponn, nòt kreye, mesaj voye, rapò soumèt, paramèt chanje, ak aksyon admin jounen. Visionneur paginé pou admin.

**Istwa apèl** — Istwa apèl rechèchab, filtrab ak plaj dat, rechèch nimewo telefòn, ak afektasyon vòlontè. Ekspòtasyon done konfòm ak RGPD.

**Èd entegre** — Seksyon FAQ, gid espesifik wòl, kat referans rapid pou rakoursi klavye ak sekirite. Aksesib soti nan ba latera ak palèt kòmand.

## Eksperyans Vòlontè

**Palèt kòmand** — Peze Ctrl+K (oswa Cmd+K sou Mac) pou aksè imedya nan navigasyon, rechèch, kreyasyon nòt rapid, ak chanjman tèm. Kòmand rezève pou admin filtre pa wòl.

**Notifikasyon an tan reyèl** — Apèl antran deklanche yon sonn navigatè, notifikasyon push, ak yon tit onglet k ap klignote. Aktive chak tip notifikasyon endepandamman nan paramèt.

**Prezans vòlontè** — Admin yo wè kont an liy, dekonekte, ak an poz an tan reyèl. Vòlontè yo ka aktive yon baskil poz nan ba latera pou sispann apèl antran san kite vire wouk yo.

**Rakoursi klavye** — Peze ? pou wè tout rakoursi disponib. Navige paj yo, ouvri palèt kòmand, ak fè aksyon kouran san manyen sourit.

**Sove brouyon nòt otomatik** — Nòt yo sove otomatikman kòm brouyon chifre nan navigatè a. Si paj la rechaje oswa vòlontè navige yon lòt kote, travay li konsève. Brouyon yo efase soti nan localStorage sou dekoneksyon.

**Ekspòtasyon done chifre** — Ekspòte nòt kòm yon fichye chifre konfòm ak RGPD (.enc) lè l sèvi ak pwòp kle vòlontè a. Sèlman otè orijinal la ka dechifre ekspòtasyon an.

**Tèm fènwa/klè** — Baskile ant mòd fènwa, mòd klè, oswa suiv tèm sistèm. Preferans pèsiste pa sesyon.

## Miltilang ak Mobil

**12+ lang** — Tradiksyon UI konplè : Angle, Panyòl, Chinwa, Tagalog, Vyètnàmyèn, Arab, Fransè, Kreyòl Ayisyen, Koreyen, Ris, Endyen, Pòtigè, ak Alman. Sipò RTL pou Arab.

**Aplikasyon Entènèt Pwogresif** — Enstalabl sou nenpòt aparèy via navigatè a. Travayè sèvis mete an kach kòk aplikasyon an pou lanse dekonekte. Notifikasyon push pou apèl antran.

**Konsepsyon mobil-premiè** — Mizanpaj responsif bati pou telefòn ak tablèt. Ba latera ki ka efondre, kontwòl ki adapte ak touche, ak mizanpaj adaptatif.

## Otantifikasyon ak Jesyon Kle

**Depo kle lokal pwoteje pa PIN** — Kle sekrè ou chifre ak yon PIN 6 chif lè l sèvi ak PBKDF2 (600,000 iterasyon) + XChaCha20-Poly1305. Kle brut la pa janm touche sessionStorage oswa nenpòt API navigatè — li viv sèlman nan yon fèmti an memwa, zewo sou vèrouye.

**Vèrouye otomatik** — Jestyon kle a vèrouye otomatikman apre timeout inaktivite oswa lè onglet navigatè a kache. Resaisi PIN ou pou devèrouye. Dire inaktivite konfigurab.

**Liaison aparèy** — Konfigire nouvo aparèy san janm ekspoze kle sekrè ou. Eskane yon kòd QR oswa antre yon kout kòd pwovizyon. Itilize echanj kle ECDH efemè pou transfere materyèl kle chifre ou an sekirite ant aparèy. Chanm pwovizyon yo ekspire apre 5 minit.

**Kle rekiperasyon** — Pandan entegrasyon, ou resevwa yon kle rekiperasyon fòma Base32 (128-bit entropie). Sa ranplase ansyen fliks afichaj nsec la. Telechajman backup chifre obligatwa anvan ou ka kontinye.

**Konfidansyalite pèsistan pa nòt** — Chak nòt chifre ak yon kle aléatwa inik, epi kle sa a vlope via ECIES pou chak lektè otorize. Konpwomèt kle idantite a pa révèle ansyen nòt yo.

**Otantifikasyon pè kle Nostr** — Vòlontè yo otantifye ak pè kle konpatib Nostr (nsec/npub). Verifikasyon siyati Schnorr BIP-340. Pa gen modpas, pa gen adrès imèl.

**Paskey WebAuthn** — Sipò paskey opsyonèl pou koneksyon miltidispozitif. Anrejistre yon kle materyèl oswa byometrik, epi konekte san tape kle sekrè ou.

**Jesyon sesyon** — Modèl aksè de-nivo : "otantifye men vèrouye" (sèlman jeton sesyon) vs "otantifye ak devèrouye" (PIN antre, aksè kriptografik konplè). Jeton sesyon 8-zè ak avètisman timeout inaktivite.
