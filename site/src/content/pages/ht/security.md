---
title: Sekirite ak Vi Prive
subtitle: Sa ki pwoteje, sa ki vizib, ak sa ki ka jwenn anba sibpena — òganize pa ki fonksyon ou itilize.
---

## Si founisè eèjman ou a resevwa yon sibpena

| Yo KAPAB bay | Yo PA KAPAB bay |
|-------------|----------------|
| Metadata apèl/mesaj (lè, dire) | Kontni nòt, transkripyon, kò rapò |
| Blob baz done ki chiffre | Non volontè (chiffre bout-a-bout) |
| Ki kont volontè ki te aktif ki lè | Dosye anyè kontak (chiffre bout-a-bout) |
| Dosye livrezon mesaj masif | Kontni mesaj (chiffre lè li rive, estoke kòm sifreteks) |
| | Kle dechiffrement (pwoteje pa PIN ou, founisè idantite ou, ak opsyonèlman kle sekirite hardware) |
| | Kle chiffrement chak nòt (tanporè — detwi apre anbalaj) |
| | Sekrè HMAC ou pou ranvèse hash nimewo telefòn |
| | Kontni fragman rekiperasyon (chiffre, sèvè a pa ka li) |

**Sèvè a estoke done li pa kapab li.** Metadata (ki lè, konbyen tan, ki kont) vizib. Kontni (sa yo te di, sa yo te ekri, ki moun ki kontak ou yo) pa.

---

## Pa fonksyon

Ekspozisyon vi prive ou depann de ki chanèl ou aktive:

### Apèl vwa

| Si ou itilize... | Twazyèm pati ka jwenn | Sèvè ka jwenn | Kontni chiffre bout-a-bout |
|----------------|----------------------|--------------|--------------------------|
| Twilio/SignalWire/Vonage/Plivo | Odyo apèl (an dirèk), dosye | Metadata apèl | Nòt, transkripyon |
| Asterisk otojere | Anyen (ou kontwole li) | Metadata apèl | Nòt, transkripyon |
| Navigatè-a-navigatè (WebRTC) | Anyen | Metadata apèl | Nòt, transkripyon |

**Sibpena founisè telefoni**: Yo gen dosye apèl detaye (lè, nimewo, dire). Yo PA gen nòt apèl oswa transkripyon. Anrejistreman dezaktive pa defò.

**Transkripyon**: Transkripyon fèt nèt nan navigatè ou a avèk AI lokal. **Odyo pa janm kite aparèy ou.**

### Mesaj tèks (youn-a-youn)

| Chanèl | Aksè founisè | Estokaj sèvè | Nòt |
|--------|-------------|-------------|-----|
| SMS | Founisè telefòn ou a li tout mesaj | **Chiffre** | Founisè a konsève mesaj orijinal yo |
| WhatsApp | Meta li tout mesaj | **Chiffre** | Founisè a konsève mesaj orijinal yo |
| Signal | Rezo Signal se E2EE; pon an rechiffre lè li rive | **Chiffre** | Wout preferans lè disponib |

**Routaj Signal-an-premye**: Lè yon destinatè gen Signal, mesaj yo otomatikman riwote atravè Signal. Pou SMS, sèlman yon notifikasyon jeneral voye pa defò (san kò mesaj).

**Mesaj yo chiffre depi yo rive nan sèvè ou a.** Sèvè a estoke sèlman sifreteks.

### Mesaj masif ak difizyon

Administratè yo ka voye mesaj masif bay abòne yo atravè SMS, WhatsApp, Signal, oswa RCS.

**Enpòtan: mesaj masif k ap soti yo PA chiffre bout-a-bout nan sèvè a.** Pou livre yon mesaj bay abòne SMS oswa WhatsApp, sèvè a dwe pwosese kontni an tanporèman an tèks klè epi pase l bay founisè mesaj la.

| Chanèl | Aksè sèvè lè ap voye | Aksè founisè | Apre livrezon |
|--------|---------------------|-------------|--------------|
| SMS masif | Tèks klè (tanporèman, pou livrezon) | Kontni konplè | Founisè konsève |
| WhatsApp masif | Tèks klè (tanporèman, pou livrezon) | Kontni konplè (Meta) | Founisè konsève |
| Signal masif | Tèks klè (tanporèman, pou livrezon) | E2EE atravè rezo Signal | Founisè pa konsève |
| RCS masif | Tèks klè (tanporèman, pou livrezon) | Google ka wè kontni | Founisè konsève |

**Sa sa vle di**: Mesaj masif pa dwe gen enfòmasyon sansib sou moun ki rele yo. Itilize yo pou anons ak avi — pa pou detay ka.

Nimewo telefòn abòne yo estoke kòm identifyan ki hache — baz done ou a pa janm gen lis abòne an tèks klè.

### Nòt, transkripyon, ak rapò

Tout kontni ekri pa volontè yo chiffre bout-a-bout:

- Chak nòt itilize yon **kle o aza inik** (sekrè an avans — konpwomèt yon nòt pa konpwomèt lòt yo)
- Kle yo anbalaj separeman pou volontè a ak chak administratè
- Sèvè a estoke sèlman sifreteks
- Dechiffrement fèt nan aparèy ou a, nan yon kouch sekirize ki pa janm ekspòze kle yo nan entèfas aplikasyon an
- **Chanm pèsonalize, kontni rapò, ak fichye tache tout chiffre endividyèlman**

**Dosye ka ak done antite**: Swiv menm modèl chiffrement — chak atik chiffre ak yon kle inik.

**Sezi aparèy**: San PIN ou **ak** aksè nan kont founisè idantite ou, atak yo jwenn yon blob chiffre pwoteje pa Argon2id. Ak yon kle sekirite hardware, **twa faktè endepandan** pwoteje done ou yo.

---

## Aparèy ou yo

### Wè ak revoke aparèy yo

Aplikasyon an kenbe yon lis chak aparèy ou te konekte ladan li. Ou ka wè lis sa a epi revoke nenpòt aparèy ou pa rekonèt.

**Lè ou revoke yon aparèy:**
- Aparèy sa a imedyatman bloke aksè nan kont ou a
- Kle chiffrement ou yo woule pou aparèy revoke a pa ka dechiffre kontni nan lavni
- Revokasyon an anrejistre nan istwa sekirite kont ou a

### Verifikasyon emoji SAS

Pou òganizasyon ak bezwen sekirite wo, administratè yo ka verifye idantite yon aparèy lè yo itilize verifikasyon SAS (Chèn Otantifikasyon Kout) — montre kòm yon sekans 7 emoji.

**Kijan li travay:**
1. Administratè a ak pwopriyetè aparèy la konpare sekans emoji yo (an pèsòn, pa telefòn, oswa atravè yon chanèl konfiyans)
2. Si emoji yo matche, aparèy la konfime pou pwopriyetè anrejistre li
3. Verifikasyon an anrejistre — administratè yo ka wè ki aparèy ki verifye

Sa a pwoteje kont yon atak ki anrejistre yon fo aparèy anba kont yon lòt moun.

---

## Efase kont

### Efase pa itilizatè a

Ou ka mande efasaj pèmanan kont ou ak tout done ki asosye ak li. Pa defò gen yon reta (konfigire pa administratè hub ou, tipikman 72 è) anvan efasaj konplète — sa ban ou tan pou anile si demann nan fèt anba presyon.

**Sa yo efase:**
- Kle aparèy ou yo (ki rann tout kontni chiffre pèmananman ilizib, menm nan backup)
- Dosye kont ou, afektasyon wòl, ak istwa travay
- Jeton notifikasyon push ou yo

**Sa ki rive ak kontni chiffre ou te kreye**: Nòt ak rapò ou te ekri yo rechiffre pou lektè otorize ki rete yo. Kopi kle dechiffrement ou a detwi.

**Jounal odit**: Antre jounal odit ou yo "krypto-detwi" — kle chiffrement pou chak itilizatè detwi, ki rann antre ou yo ilizib. Chèn hash la rete entakt.

### Efasaj ijans

Si ou kwè kont ou anba menas imedya, ou ka mande efasaj ijans ak yon ko-apwouve — redui reta a nan yon minimòm 4 è. Minimòm 4 è a egziste pou pwoteje kont efasaj fòse.

---

## Gwoup rekiperasyon

Si ou pèdi tout aparèy ou yo, nòmalman ou pèdi aksè nan tout done chiffre ou yo. Gwoup rekiperasyon rezoud sa.

### Kijan rekiperasyon travay

Ou deziyen yon gwoup kontak konfyans (tipikman 3-5 moun) kòm gwoup rekiperasyon ou. Chak kontak kenbe yon "moso" nan yon kle rekiperasyon.

**Pou rekipere kont ou:**
1. Ou anrejistre yon nouvo aparèy epi inisye yon demann rekiperasyon
2. Kontak rekiperasyon ou yo resevwa yon notifikasyon
3. Apre yon reta ki konfigirab, yon kantite sèy kontak (egzanp 2 pami 3) apwouve demann nan
4. Chak kontak ki apwouve voye moso yo, chiffre dirèkteman pou nouvo aparèy ou a
5. Nouvo aparèy ou a konbine moso yo pou rekonstitye kle rekiperasyon an

**Sa sèvè a ka wè**: Sèvè a relee moso chiffre ant aparèy yo. Li pa ka li moso yo epi li pa ka rekonstitye kle rekiperasyon an poukont li.

### Pwopriete sekirite gwoup rekiperasyon yo

- **Sekirite sèy**: Moso anba sèy la pa revele anyen sou sekrè a
- **Pa gen patisipasyon sèvè nan sekrè a**: Moso yo chiffre dirèkteman nan kle piblik nouvo aparèy ou a
- **Pòte hub**: Rekiperasyon restore aksè ou nan yon hub espesifik
- **Reta ki ka anile**: Ou ka anile yon demann rekiperasyon pandan peryòd reta a
- **Verifikasyon Signal**: Demann rekiperasyon yo verifye atravè Signal

---

## Vi prive nimewo telefòn volontè

Lè volontè yo resevwa apèl sou telefòn pèsonèl yo, nimewo yo ekspòze bay founisè telefoni ou a.

| Sena | Nimewo telefòn vizib pou |
|------|------------------------|
| Apèl PSTN nan telefòn volontè | Founisè telefoni, operatè selilè |
| Navigatè-a-navigatè (WebRTC) | Pèsonn (odyo rete nan navigatè) |
| Asterisk otojere + telefòn SIP | Sèlman sèvè Asterisk ou a |

**Pou pwoteje nimewo telefòn volontè**: Itilize apèl ki baze sou navigatè (WebRTC) oswa bay telefòn SIP ki konekte ak Asterisk otojere.

---

## Resamman ekspedye

Amelyorasyon sa yo disponib jodi a:

| Fonksyon | Benefis vi prive |
|---------|-----------------|
| Jesyon aparèy | Wè ak revoke nenpòt aparèy ki konekte; revokasyon deklanche woulman kle |
| Verifikasyon emoji SAS aparèy | Administratè yo ka verifye aparèy an pèsòn ak yon anprent kriptografik 7 emoji |
| Efasaj kont ak reta | Mande efasaj; reta ki konfigirab pèmèt anilasyon anba presyon |
| Efasaj ijans | Efasaj rapid ko-apwouve ak minimòm 4 è |
| Krypto-destriksyon lè efasaj | Kle chiffrement detwi anvan, ki rann kontni pèmananman ilizib |
| Gwoup rekiperasyon (Shamir) | Deziyen kontak konfyans ki ka ede w rekipere si ou pèdi tout aparèy |
| Mesaj masif ak divilgasyon onèt | Administratè yo ka voye mesaj masif; sèvè pwosese tèks klè tanporèman pou livrezon |
| Hashaj abòne | Nimewo telefòn abòne yo estoke kòm identifyan hache |
| Pwoteksyon kle Argon2id | Kle aparèy pwoteje pa yon fonksyon ki egzije anpil memwa |
| Routaj Signal-an-premye | Mesaj yo otomatikman riwote atravè Signal lè disponib |
| Mòd SMS notifikasyon sèlman | Destinatè SMS wè sèlman "ou gen yon nouvo mesaj" |
| Rezistans analiz trafik | Gwosè evènman yo ranpli pou obsèvatè pa ka distenge |
| Pa gen nimewo telefòn an tèks klè nan baz done | Nimewo moun k ap rele yo estoke kòm hash ki pa revevsib |
| Chiffrement pa hub ak sekrè an avans | Kle woule chak 24 è |
| Kriptografi an Rust sou tout platfòm | Menm bibliyotèk Rust kriptografi ki verifye sou òdinatè, iOS, ak Android |
| Aksè rele restrenn | WebSocket rele aksepte evènman sèlman nan sèvè ou a |
| Estokaj mesaj chiffre | SMS, WhatsApp ak Signal estoke kòm sifreteks |
| Transkripyon sou aparèy | Odyo pa janm kite aparèy ou |
| Pwoteksyon kle miltifaktè | PIN, founisè idantite, ak opsyonèlman kle sekirite hardware |
| Kle sekirite hardware | Twazyèm faktè ki pa ka konpwomèt a distans |
| Build repwodizib | Verifye ke kòd deploye a matche ak sous piblik la |
| Anyè kontak chiffre | Dosye kontak, relasyon, ak nòt chiffre bout-a-bout |

## Planifye toujou

| Fonksyon | Benefis vi prive | Estati |
|---------|-----------------|--------|
| Aplikasyon natif pou resevwa apèl | Pa gen nimewo telefòn pèsonèl ki ekspòze | Ap devlope |
| Eplenaj sètifika (mobil) | Defans kont entèsepsyon TLS pa CA malonèt | Estrikti konplè; eplen an atant |
| Chiffrement medya vwa SFrame | Apèl vwa chiffre bout-a-bout | Derivasyon kle konplè; chiffrement pa kad planifye |

---

## Tablo rezime

| Tip done | Chiffre | Vizib pou sèvè | Obtinab anba sibpena |
|---------|---------|----------------|---------------------|
| Nòt apèl | Wi (bout-a-bout) | Non | Sifreteks sèlman |
| Transkripyon | Wi (bout-a-bout) | Non | Sifreteks sèlman |
| Rapò | Wi (bout-a-bout) | Non | Sifreteks sèlman |
| Dosye ka / done antite | Wi (bout-a-bout) | Non | Sifreteks sèlman |
| Atachman fichye | Wi (bout-a-bout) | Non | Sifreteks sèlman |
| Dosye kontak | Wi (bout-a-bout) | Non | Sifreteks sèlman |
| Idantite volontè | Wi (bout-a-bout) | Non | Sifreteks sèlman |
| Metadata ekip/wòl | Wi (chiffre) | Non | Sifreteks sèlman |
| Definisyon chan pèsonalize | Wi (chiffre) | Non | Sifreteks sèlman |
| Kontni SMS/WhatsApp/Signal antre | Wi (nan sèvè ou a) | Non | Sifreteks nan sèvè; founisè ka gen orijinal |
| Mesaj masif k ap soti | **Non — tèks klè pandan livrezon** | **Wi, tanporèman** | Wi (tèks klè nan moman voye) |
| Fragman rekiperasyon | Wi (bout-a-bout nan aparèy) | Non | Sifreteks sèlman |
| Evènman an tan reyèl | Wi (pa hub, kle k ap woule) | Non | Sifreteks sèlman |
| Metadata apèl | Non | Wi | Wi |
| Dosye livrezon masif | Non | Wi | Wi |
| Hash nimewo moun k ap rele | Hash HMAC | Hash sèlman | Hash (pa revevsib san sekrè ou) |
| Hash nimewo abòne | Hash HMAC | Hash sèlman | Hash (pa revevsib san sekrè ou) |
| Chèn User-Agent | Hash SHA-256 | Hash sèlman | Hash (pa revevsib) |

---

## Pou odyitè sekirite

Dokimantasyon teknik:

- [Espesifikasyon Pwotokòl](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/PROTOCOL.md)
- [Modèl Menas](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/THREAT_MODEL.md)
- [Klasifikasyon Done](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Mank Sekirite ak Fèy Wout](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/SECURITY_GAPS_AND_ROADMAP.md)
- [Odyit Sekirite](https://github.com/rhonda-rodododo/llamenos-platform/tree/main/docs/security)
- [Dokimantasyon API](/api/docs)

Llamenos se kòd louvri: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
