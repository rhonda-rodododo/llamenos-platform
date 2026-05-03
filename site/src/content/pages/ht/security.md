---
title: Sekirite ak Vi Prive
subtitle: Sa ki pwoteje, sa ki vizib, ak sa ki ka jwenn anba sibpena — òganize pa ki fonksyon ou itilize.
---

## Si founisè ostaj ou resevwa yon sibpena

| Yo KAPAB bay | Yo PA KAPAB bay |
|------------------|---------------------|
| Metadata apèl/mesaj (lè, dire) | Kontni nòt, transkripsyon, kò rapò |
| Blòb baz done chifre | Non vòlontè (chifre de-bout-an-bout) |
| Ki vòlontè ki te aktif ak lè | Dosye repètwa kontak (chifre de-bout-an-bout) |
| | Kontni mesaj (chifre lè li rive, estoke kòm tèks chifre) |
| | Kle dechifraj (pwoteje pa PIN ou, kont founisè idantite ou, ak opsyonèlman kle sekirite materyèl ou) |
| | Kle chifraj pa nòt (efemè — detwi apre vlope) |
| | Sekrè HMAC ou pou ranvèse hash telefòn |

**Sèvè a estoke done li pa ka li.** Metadata (ki lè, pandan konbyen tan, ki kont) vizib. Kontni (sa ki te di, sa ki te ekri, ki moun ki kontak ou) pa vizib.

---

## Pa fonksyon

Ekspozisyon vi prive ou depann sou ki chanèl ou aktive :

### Apèl Vwa

| Si ou itilize... | Tiyè pati ka aksede | Sèvè ka aksede | Kontni E2EE |
|---------------|-------------------------|-------------------|--------------|
| Twilio/SignalWire/Vonage/Plivo | Odyo apèl (an dirèk), anrejistreman apèl | Metadata apèl | Nòt, transkripsyon |
| Asterisk otojere | Anyen (ou kontwole li) | Metadata apèl | Nòt, transkripsyon |
| Navigatè-a-navigatè (WebRTC) | Anyen | Metadata apèl | Nòt, transkripsyon |

**Sibpena founisè telefoni** : Yo gen dosye detay apèl (lè, nimewo telefòn, dire). Yo PA gen nòt apèl oswa transkripsyon. Anrejistreman dezaktive pa defo.

**Transkripsyon** : Transkripsyon fèt nèt nan navigatè ou avèk AI sou aparèy. **Odyo pa janm kite aparèy ou.** Sèlman transkripsyon chifre estoke.

### Mesaj Tèks

| Chanèl | Aksè founisè | Estokaj sèvè | Nòt |
|---------|-----------------|----------------|-------|
| SMS | Founisè telefoni ou li tout mesaj | **Chifre** | Founisè kenbe mesaj orijinal yo |
| WhatsApp | Meta li tout mesaj | **Chifre** | Founisè kenbe mesaj orijinal yo |
| Signal | Rezo Signal E2EE, men pon dechifre lè li rive | **Chifre** | Pi bon pase SMS, pa zewo-konesans |

**Mesaj yo chifre nan moman yo rive sou sèvè ou.** Sèvè a estoke sèlman tèks chifre. Founisè telefoni oswa mesaj ou ka toujou gen mesaj orijinal la — se yon limitasyon nan platfòm sa yo, pa yon bagay nou ka chanje.

**Sibpena founisè mesaj** : Founisè SMS gen kontni mesaj konplè. Meta gen kontni WhatsApp. Mesaj Signal E2EE nan pon, men pon (ki kouri sou sèvè ou) dechifre anvan re-chifre pou estokaj. Nan tout ka, **sèvè ou gen sèlman tèks chifre** — founisè ostaj pa ka li kontni mesaj.

### Nòt, Transkripsyon, ak Rapò

Tout kontni ekri pa vòlontè chifre de-bout-an-bout :

- Chak nòt itilize yon **kle aléatwa inik** (konfidansyalite pèsistan — konpwomèt yon nòt pa konpwomèt lòt yo)
- Kle yo vlope separe pou vòlontè ak chak admin
- Sèvè a estoke sèlman tèks chifre
- Dechifraj fèt nan navigatè a
- **Chan pèsonalize, kontni rapò, ak atachman fichye tout chifre individyèlman**

**Sezi aparèy** : San PIN ou **ak** aksè nan kont founisè idantite ou, atakan jwenn yon blòb chifre ki enposib pou dechifre. Si ou itilize tou yon kle sekirite materyèl, **twa faktè endepandan** pwoteje done ou.

---

## Vi Prive Nimewo Telefòn Vòlontè

Lè vòlontè resevwa apèl sou telefòn pèsonèl yo, nimewo yo ekspoze nan founisè telefoni ou a.

| Sènayo | Nimewo telefòn vizib pou |
|----------|------------------------|
| Apèl PSTN nan telefòn vòlontè | Founisè telefoni, operatè telefòn |
| Navigatè-a-navigatè (WebRTC) | Pèsonn (odyo rete nan navigatè) |
| Asterisk otojere + telefòn SIP | Sèlman sèvè Asterisk ou a |

**Pou pwoteje nimewo telefòn vòlontè** : Itilize apèl baze sou navigatè (WebRTC) oswa bay telefòn SIP konekte ak Asterisk otojere.

---

## Resaman Livre

Amelyorasyon sa yo disponib jodi a :

| Fonksyon | Benefis vi prive |
|---------|-----------------|
| Estokaj mesaj chifre | Mesaj SMS, WhatsApp ak Signal estoke kòm tèks chifre sou sèvè ou |
| Transkripsyon sou aparèy | Odyo pa janm kite navigatè ou — trete nèt sou aparèy ou |
| Pwoteksyon kle milti-faktè | Kle chifraj ou pwoteje pa PIN ou, founisè idantite ou, ak opsyonèlman kle sekirite materyèl |
| Kle sekirite materyèl | Kle fizik ajoute yon twazyèm faktè ki pa ka konpwomèt adistans |
| Build repwodiksib | Verifye kòd deplwaye matche sous piblik |
| Repètwa kontak chifre | Dosye kontak, relasyon, ak nòt chifre de-bout-an-bout |

## Toujou Planifye

| Fonksyon | Benefis vi prive |
|---------|-----------------|
| Aplikasyon natif pou resevwa apèl | Pa gen nimewo telefòn pèsonèl ekspoze |

---

## Tab Rezime

| Tip done | Chifre | Vizib pou sèvè | Kapab jwenn anba sibpena |
|-----------|-----------|-------------------|---------------------------|
| Nòt apèl | Wi (E2EE) | Non | Sèlman tèks chifre |
| Transkripsyon | Wi (E2EE) | Non | Sèlman tèks chifre |
| Rapò | Wi (E2EE) | Non | Sèlman tèks chifre |
| Atachman fichye | Wi (E2EE) | Non | Sèlman tèks chifre |
| Dosye kontak | Wi (E2EE) | Non | Sèlman tèks chifre |
| Idantite vòlontè | Wi (E2EE) | Non | Sèlman tèks chifre |
| Metadata ekip/wòl | Wi (chifre) | Non | Sèlman tèks chifre |
| Definisyon chan pèsonalize | Wi (chifre) | Non | Sèlman tèks chifre |
| Kontni SMS/WhatsApp/Signal | Wi (sou sèvè ou) | Non | Tèks chifre sou sèvè ou; founisè ka gen orijinal |
| Metadata apèl | Non | Wi | Wi |
| Hash telefòn moun k ap rele | HMAC hache | Hash sèlman | Hash (pa ranvèsab san sekrè ou) |

---

## Pou Oditè Sekirite

Dokimantasyon teknik :

- [Espesifikasyon Protokòl](https://github.com/rhonda-rodododo/llamenos-hotline/blob/main/docs/protocol/llamenos-protocol.md)
- [Modèl Menas](https://github.com/rhonda-rodododo/llamenos-hotline/blob/main/docs/security/THREAT_MODEL.md)
- [Klasifikasyon Done](https://github.com/rhonda-rodododo/llamenos-hotline/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Odit Sekirite](https://github.com/rhonda-rodododo/llamenos-hotline/tree/main/docs/security)
- [Dokimantasyon API](/api/docs)

Llamenos sous louvri : [github.com/rhonda-rodododo/llamenos-hotline](https://github.com/rhonda-rodododo/llamenos-hotline)
