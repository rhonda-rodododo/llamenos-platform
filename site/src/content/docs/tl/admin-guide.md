---
title: Gabay para sa Admin
description: Pamahalaan ang lahat -- mga boluntaryo, shift, mga setting ng tawag, ban list, at custom field.
---

Bilang admin, pinamamahalaan mo ang lahat: mga boluntaryo, shift, mga setting ng tawag, ban list, at custom field. Sinasaklaw ng gabay na ito ang mga pangunahing workflow ng admin.

## Pag-log in

Mag-log in gamit ang `nsec` (Nostr secret key) na nabuo sa panahon ng [pag-setup](/docs/deploy). Tinatanggap ng login page ang nsec format (`nsec1...`). Pumipirma ang iyong browser ng hamon gamit ang key -- hindi kailanman umaalis ang secret sa device.

Opsyonal, mag-register ng WebAuthn passkey sa Settings para sa passwordless login sa ibang mga device.

## Pamamahala ng mga boluntaryo

Mag-navigate sa **Volunteers** sa sidebar para:

- **Magdagdag ng boluntaryo** -- bumubuo ng bagong Nostr keypair. Ibahagi nang ligtas ang nsec sa boluntaryo (ipinapakita lamang ito nang isang beses).
- **Lumikha ng invite link** -- bumubuo ng isang beses na link na magagamit ng boluntaryo para mag-self-register.
- **I-edit** -- i-update ang pangalan, numero ng telepono, at tungkulin.
- **Alisin** -- i-deactivate ang access ng boluntaryo.

Ang mga numero ng telepono ng boluntaryo ay makikita lamang ng mga admin. Ginagamit ang mga ito para sa parallel ringing kapag nasa shift ang boluntaryo.

## Pag-configure ng mga shift

Mag-navigate sa **Shifts** para lumikha ng mga umuulit na iskedyul:

1. I-click ang **Add Shift**
2. Magtakda ng pangalan, pumili ng mga araw ng linggo, at magtakda ng oras ng simula/wakas
3. Mag-assign ng mga boluntaryo gamit ang searchable multi-select
4. I-save -- awtomatikong iru-route ng sistema ang mga tawag sa mga boluntaryo na nasa aktibong shift

I-configure ang isang **Fallback Group** sa ibaba ng shifts page. Ang mga boluntaryong ito ang tatawagan kapag walang aktibong naka-iskedyul na shift.

## Mga ban list

Mag-navigate sa **Bans** para pamahalaan ang mga naka-block na numero ng telepono:

- **Isang entry** -- i-type ang numero ng telepono sa E.164 format (hal., +15551234567)
- **Bulk import** -- i-paste ang maraming numero, isa bawat linya
- **Alisin** -- i-unban kaagad ang isang numero

Agad na nagkakabisa ang mga ban. Maririnig ng mga naka-ban na tumatawag ang isang rejection message at madi-disconnect sila.

## Mga setting ng tawag

Sa **Settings**, makikita mo ang ilang seksyon:

### Panlaban sa spam

- **Voice CAPTCHA** -- i-toggle on/off. Kapag naka-enable, kailangang mag-input ang mga tumatawag ng random na 4-digit code.
- **Rate limiting** -- i-toggle on/off. Nilimitahan ang mga tawag bawat numero ng telepono sa loob ng isang sliding time window.

### Transcription

- **Pangkalahatang toggle** -- i-enable/disable ang Whisper transcription para sa lahat ng tawag.
- Maaari ring mag-opt out ang mga indibidwal na boluntaryo sa pamamagitan ng kanilang sariling settings.

### Mga setting ng tawag

- **Queue timeout** -- gaano katagal maghihintay ang mga tumatawag bago mapunta sa voicemail (30-300 segundo).
- **Voicemail max duration** -- pinakamahaba na haba ng recording (30-300 segundo).

### Mga custom note field

Tukuyin ang mga structured field na lalabas sa note-taking form:

- Mga sinusuportahang uri: text, number, select (dropdown), checkbox, textarea
- I-configure ang validation: required, min/max na haba, min/max na halaga
- Kontrolin ang visibility: piliin kung aling mga field ang makikita at mae-edit ng mga boluntaryo
- I-reorder ang mga field gamit ang up/down arrows
- Pinakamataas na 20 field, pinakamataas na 50 opsyon bawat select field

Ang mga halaga ng custom field ay naka-encrypt kasama ng nilalaman ng nota. Hindi kailanman nakikita ng server ang mga ito.

### Mga voice prompt

Mag-record ng custom IVR audio prompt para sa bawat sinusuportahang wika. Ginagamit ng sistema ang iyong mga recording para sa greeting, CAPTCHA, queue, at voicemail flow. Kung walang recording, gumagamit ito ng text-to-speech bilang fallback.

### Patakaran sa WebAuthn

Opsyonal na i-require ang mga passkey para sa mga admin, boluntaryo, o pareho. Kapag kinakailangan, kailangang mag-register ng passkey ang mga user bago nila magamit ang app.

## Audit log

Ipinapakita ng **Audit Log** page ang isang kronolohikal na listahan ng mga event ng sistema: mga pag-login, pagsagot ng tawag, paggawa ng nota, pagbabago ng setting, at mga aksyon ng admin. Kasama sa mga entry ang naka-hash na IP address at metadata ng bansa. Gamitin ang pagination para mag-browse ng kasaysayan.

## Kasaysayan ng tawag

Ipinapakita ng **Calls** page ang lahat ng tawag na may status, tagal, at assignment ng boluntaryo. I-filter ayon sa saklaw ng petsa o maghanap ayon sa numero ng telepono. I-export ang datos sa GDPR-compliant na JSON format.
