---
title: Tilmaanta Weriyeyaasha
description: Sida loo soo gudbiyo warbixin sir ah oo loo raad macquulkeeda.
---

Weriyaha ahaan, waxaad soo gudbin kartaa warbixin sir ah oo loogu talagalay ururkaaga iyada oo loo marayo platform-ka Llámenos. Warbixinadu waa sir dhammaad-ilaa-dhammaad — server-ku marna ma arko nuxurka warbixintaada.

## Bilowga

Maamulahaagu wuxuu ku siin doonaa mid ka mid ah:
- **nsec** (furaha sirta ah ee WebSocket) — xaraf ah oo ka bilaabmaya `nsec1`
- **Xiriiriye martiqaad ah** — URL hal-isticmaale ah oo aqoonsi kuu abuura

**Ka ilaali nsec-kaaga gaarka ah.** Waa aqoonsigaaga iyo aqoonsiga soo-galida. Ku kaydi maamulaha lambarrada sirta ah.

## Soo galida

1. Fur abka browser-kaaga
2. Ku dheji `nsec`-kaaga goobta soo-galida
3. Aqoonsigaaga waxaa loo xaqiijiyay si sir ah — furahaaga gaarka ah marna kama baxo browser-kaaga

Soo-galida koowaad ka dib, waxaad diiwaan gelin kartaa furaha WebAuthn passkey ee Dejinta si soo-galida mustaqbalka ugu fududaato.

## Soo gudbinta warbixin

1. Guji **Warbixin Cusub** bogga Warbixinada
2. Gali **cinwaan** warbixintaada (tani waxay ka caawisaa maamulayaasha inay kala saaraan — waxaa loo kaydiyaa qoraal cad)
3. Dooro **qayb** haddii maamulahaagu qeexay qaybaha warbixinta
4. Ku qor **nuxurka warbixintaada** jidhka goobta — kan waa la siriyay ka hor inta uusan browser-kaaga ka bixin
5. Ikhtiyaaran buuxi **goobabka caadada ah** ee maamulahaagu qaabaystay
6. Ikhtiyaaran **ku lifaaq faylal** — faylasha waa la siriyay dhinaca macmiilka ka hor soo-gelinta
7. Guji **Gudbi**

Warbixintaadu waxay ka soo baxdaa liiskaaga Warbixinada oo leh heer "Furan".

## Sirta warbixinta

- Jidhka warbixinta iyo qiyamka goobabka caadada ah waxaa la siriyay iyadoo la isticmaalayo ECIES (secp256k1 + XChaCha20-Poly1305)
- Lifaaqyada faylka waxaa si gooni ah loo siriyay iyadoo la isticmaalayo isla qorshaha
- Adiga iyo maamulaha oo keliya ayaa sir-deyjin kara nuxurka
- Server-ku wuxuu kaydiyaa oo keliya qoraal sir ah (ciphertext) — xataa haddii kaydka xogta la jabiyo, nuxurka warbixintaadu waa badbaado

## Raadinta warbixinadaada

Boggaaga Warbixinada wuxuu tusayaa dhammaan warbixinada aad soo gudbisay oo leh:
- **Cinwaan** iyo **qayb**
- **Heerka** — Furan, La Qaatay (maamul ayaa shaqeeya), ama La Xalliyay
- **Taariikhda** la soo gudbiyay

Guji warbixin si aad u aragto wada hadalka buuxa, oo ay ku jiraan jawaabaha maamulka.

## U jawaabista maamulayaasha

Marka maamuluhu ka jawaabo warbixintaada, jawaabtoodu waxay ka soo baxdaa wada hadalka warbixinta. Waad u jawaabi kartaa — dhammaan farriimaha wada hadalka waa la siriyay.

## Waxa aadan samayn karin

Weriyaha ahaan, marin-u-helistaadu waa xaddidan yahay si loo ilaaliyo qof kasta asturnaantiisa:
- Waad **kartaa** inaad aragto warbixinadaada iyo bogga Caawimada
- Ma **kar tid** inaad aragto warbixinada weriyeyaasha kale, diiwaanada wicitaanka, macluumaadka tabaruceyaasha, ama dejinta maamulka
- Ma **kar tid** inaad ka jawaabto wicitaannada ama farriimaha SMS/WhatsApp/Signal

## Talooyin

- Isticmaal cinwaano sharrax leh — waxay ka caawiyaan maamulayaasha inay kala saaraan iyada oo aan sir-deyjin nuxurka buuxa
- Ku lifaaq faylasha laxiriira (sawirro, dukumannti) markay taageerayaan warbixintaada
- Dib u soo noqo waqti-ka-waqti si aad u aragto jawaabaha maamulka — waxaad arki doontaa isbeddelada heerka liiskaaga warbixinada
- Isticmaal bogga Caawimada FAQ iyo tilmaamo
