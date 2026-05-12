---
title: Gabay para sa Boluntaryo
description: Lahat ng kailangan mong malaman bilang boluntaryo -- pag-log in, pagtanggap ng mga tawag, pagsulat ng mga nota, at paggamit ng transcription.
---

Sinasaklaw ng gabay na ito ang lahat ng kailangan mong malaman bilang boluntaryo: pag-log in, pagtanggap ng mga tawag, pagsulat ng mga nota, at paggamit ng feature na transcription.

## Pagkuha ng iyong mga kredensyal

Ibibigay sa iyo ng iyong admin ang isa sa mga sumusunod:

- Isang **nsec** (WebSocket secret key) -- isang string na nagsisimula sa `nsec1`
- Isang **invite link** -- isang isang-beses na URL na bumubuo ng mga kredensyal para sa iyo

**Panatilihing pribado ang iyong nsec.** Ito ang iyong pagkakakilanlan at login credential. Sinumang may hawak ng iyong nsec ay maaaring magpanggap bilang ikaw. Itago ito sa isang password manager.

## Pag-log in

1. Buksan ang hotline app sa iyong browser
2. I-paste ang iyong `nsec` sa login field
3. Bine-verify ng app ang iyong pagkakakilanlan sa pamamagitan ng cryptography -- hindi kailanman umaalis ang iyong secret key sa iyong browser

Pagkatapos ng unang pag-log in, ipo-prompt kang magtakda ng iyong display name at gustong wika.

### Passkey login (opsyonal)

Kung na-enable ng iyong admin ang mga passkey, maaari kang mag-register ng hardware key o biometric sa **Settings**. Ito ay nagbibigay-daan sa iyo na mag-log in sa ibang device nang hindi kailangang i-type ang iyong nsec.

## Ang dashboard

Pagkatapos mag-log in, makikita mo ang dashboard na may:

- **Mga aktibong tawag** -- mga tawag na kasalukuyang pinoproseso
- **Status ng iyong shift** -- ipinapakita sa sidebar (kasalukuyang shift o susunod na paparating na shift)
- **Mga online na boluntaryo** -- bilang ng mga available

## Pagtanggap ng mga tawag

Kapag may pumasok na tawag sa panahon ng iyong shift, maa-abisuhan ka sa pamamagitan ng:

- Isang **ringtone** sa browser (i-toggle sa Settings)
- Isang **push notification** kung binigyan mo ng pahintulot
- Isang **kumikislap na tab title**

I-click ang **Answer** para sagutin ang tawag. Tutunog ang iyong telepono -- sagutin ito para makakonekta sa tumatawag. Kung may ibang boluntaryo na naunang sumagot, titigil ang pag-ring.

## Sa panahon ng tawag

Habang nasa tawag, makikita mo ang:

- Isang **call timer** na nagpapakita ng tagal
- Isang **note-taking panel** kung saan makakapagsulat ka ng mga nota nang real time
- Isang **report spam** button para i-flag ang tumatawag

Awtomatikong nase-save ang mga nota bilang encrypted draft. Maaari mo ring i-save nang manu-mano ang nota.

## Pagsulat ng mga nota

Ang mga nota ay naka-encrypt sa iyong browser bago ipadala sa server. Ikaw at ang admin lamang ang makakabasa nito.

Kung nag-configure ang iyong admin ng mga custom field (text, dropdown, checkbox, atbp.), lalabas ang mga ito sa note form. Punan ang mga ito kung kinakailangan -- naka-encrypt ang mga ito kasama ng teksto ng iyong nota.

Mag-navigate sa **Notes** sa sidebar para suriin, i-edit, o maghanap ng iyong mga nakaraang nota. Maaari mong i-export ang iyong mga nota bilang isang encrypted file.

## Transcription

Kung naka-enable ang transcription (ng admin at ng iyong sariling kagustuhan), awtomatikong tina-transcribe ang mga tawag pagkatapos ng mga ito. Lalabas ang transcript kasama ng iyong nota para sa tawag na iyon.

Maaari mong i-toggle ang transcription on o off sa **Settings**. Kapag naka-disable, hindi ita-transcribe ang iyong mga tawag anuman ang global setting ng admin.

Ang mga transcript ay naka-encrypt at rest -- pansamantalang pinoproseso ng server ang audio, pagkatapos ay ine-encrypt ang resultang teksto.

## Pag-break

I-toggle ang **break** switch sa sidebar para i-pause ang mga papasok na tawag nang hindi umaalis sa iyong shift. Hindi tutunog ang iyong telepono habang nasa break ka. I-toggle ito pabalik kapag handa ka na.

## Mga Tip

- Gamitin ang <kbd>Ctrl</kbd>+<kbd>K</kbd> (o <kbd>Cmd</kbd>+<kbd>K</kbd> sa Mac) para buksan ang command palette para sa mabilis na nabigasyon
- Pindutin ang <kbd>?</kbd> para makita ang lahat ng keyboard shortcut
- I-install ang app bilang PWA para sa native app experience at mas magandang mga notification
- Panatilihing nakabukas ang iyong browser tab sa panahon ng iyong shift para sa real-time na mga alerto ng tawag
