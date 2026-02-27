---
title: Sekirite ak Vi Prive
subtitle: Sa ki pwoteje, sa ki vizib, ak sa ki ka jwenn anba sibpena — òganize pa ki fonksyon ou itilize.
---

## Si founisè ostaj ou resevwa yon sibpena

| Yo KAPAB bay | Yo PA KAPAB bay |
|------------------|---------------------|
| Metadata apèl/mesaj (lè, dire) | Kontni nòt, transkripsyon, kò rapò |
| Blòb baz done chifre | Kle dechifraj (estoke sou aparèy ou yo) |
| Ki vòlontè ki te aktif ak lè | Kle chifraj pa nòt (efemè) |
| Kontni mesaj SMS/WhatsApp | Sekrè HMAC ou pou ranvèse hash telefòn |

**Sèvè a estoke done li pa ka li.** Metadata (ki lè, pandan konbyen tan, ki moun) vizib. Kontni (sa ki te di, sa ki te ekri) pa vizib.

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

**Fenèt transkripsyon** : Pandan ~30 segonn transkripsyon an, odyo trete pa Cloudflare Workers AI. Apre transkripsyon, sèlman tèks chifre estoke.

### Mesaj Tèks

| Chanèl | Aksè founisè | Estokaj sèvè | Nòt |
|---------|-----------------|----------------|-------|
| SMS | Founisè telefoni ou li tout mesaj | Tèks klè | Limitasyon inik nan SMS |
| WhatsApp | Meta li tout mesaj | Tèks klè | Egzijans API WhatsApp Business |
| Signal | Rezo Signal E2EE, men pon signal-cli dechifre | Tèks klè | Pi bon pase SMS, pa zewo-konesans |

**Sibpena founisè mesaj** : Founisè SMS gen kontni mesaj konplè. Meta gen kontni WhatsApp. Mesaj Signal E2EE nan pon, men pon (ki kouri sou sèvè ou) gen tèks klè.

**Amelyorasyon alavni** : Nou ap eksplore estokaj mesaj E2EE kote sèvè a estoke sèlman tèks chifre. Gade [fèy wout](#whats-planned).

### Nòt, Transkripsyon, ak Rapò

Tout kontni ekri pa vòlontè chifre de-de-wout :

- Chak nòt itilize yon kle aléatwa inik (konfidansyalite pèsistan)
- Kle yo vlope separe pou vòlontè ak admin
- Sèvè a estoke sèlman tèks chifre
- Dechifraj fèt nan navigatè a

**Sezi aparèy** : San PIN ou, atakan jwenn yon blòb chifre. Yon PIN 6 chif ak 600K iterasyon PBKDF2 pran plizyè zè pou fòse-brital sou materyèl GPU.

---

## Vi Prive Nimewo Telefòn Vòlontè

Lè vòlontè resevwa apèl sou telefòn pèsonèl yo, nimewo yo ekspoze nan founisè telefoni ou a.

| Sènayo | Nimewo telefòn vizib pou |
|----------|------------------------|
| Apèl PSTN nan telefòn vòlontè | Founisè telefoni, operatè telefòn |
| Navigatè-a-navigatè (WebRTC) | Pèsonn (odyo rete nan navigatè) |
| Asterisk otojere + telefòn SIP | Sèlman sèvè Asterisk ou a |

**Pou pwoteje nimewo telefòn vòlontè** : Itilize apèl baze sou navigatè (WebRTC) oswa bay telefòn SIP konekte ak Asterisk otojere.

**Amelyorasyon alavni** : Aplikasyon biwo ak mobil natif pou resevwa apèl san ekspoze nimewo telefòn pèsonèl.

---

## Sa Ki Planifye

Nou ap travay sou amelyorasyon pou redwi egzijans konfyans :

| Fonksyon | Estati | Benefis vi prive |
|---------|--------|-----------------|
| Estokaj mesaj E2EE | Planifye | SMS/WhatsApp/Signal estoke kòm tèks chifre |
| Transkripsyon kote kliyan | Planifye | Odyo pa janm kite navigatè |
| Aplikasyon natif pou resevwa apèl | Planifye | Pa gen nimewo telefòn pèsonèl ekspoze |
| Build repwodiksib | Planifye | Verifye kòd deplwaye matche sous |
| Pon Signal otojere | Disponib | Kouri signal-cli sou pwòp enfrastriktirè ou |

---

## Tab Rezime

| Tip done | Chifre | Vizib pou sèvè | Kapab jwenn anba sibpena |
|-----------|-----------|-------------------|---------------------------|
| Nòt apèl | Wi (E2EE) | Non | Sèlman tèks chifre |
| Transkripsyon | Wi (E2EE) | Non | Sèlman tèks chifre |
| Rapò | Wi (E2EE) | Non | Sèlman tèks chifre |
| Atachman fichye | Wi (E2EE) | Non | Sèlman tèks chifre |
| Metadata apèl | Non | Wi | Wi |
| Idantite vòlontè | Chifre nan repo | Admin sèlman | Wi (ak efò) |
| Hash telefòn moun k ap rele | HMAC hache | Hash sèlman | Hash (pa ranvèsab san sekrè ou) |
| Kontni SMS | Non | Wi | Wi |
| Kontni WhatsApp | Non | Wi | Wi (tou soti nan Meta) |
| Kontni Signal | Non | Wi | Wi (soti nan sèvè ou) |

---

## Pou Oditè Sekirite

Dokimantasyon teknik :

- [Espesifikasyon Protokòl](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/protocol/llamenos-protocol.md)
- [Modèl Menas](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/THREAT_MODEL.md)
- [Klasifikasyon Done](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Odit Sekirite](https://github.com/rhonda-rodododo/llamenos/tree/main/docs/security)

Llamenos sous louvri : [github.com/rhonda-rodododo/llamenos](https://github.com/rhonda-rodododo/llamenos)
