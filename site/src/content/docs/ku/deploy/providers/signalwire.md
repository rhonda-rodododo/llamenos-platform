---
title: "Sazkirin: SignalWire"
description: Rêbera gav-bi-gav ji bo sazkirina SignalWire wekî pêşkêşkarê telefoniya xwe.
---

SignalWire vebijarkek bi lêçûna kêmtir ji Twilio ye ku API-ya wê ya hevgirtî heye. Ew LaML (zimanek nîşankirinê ya bi TwiML re hevgirtî) bikar tîne, ji ber vê yekê koçberkirina navbera Twilio û SignalWire hêsan e.

## Pêşdibistan

- [Hesabek SignalWire](https://signalwire.com/signup) (ceribandina belaş heye)
- Enstansiya Llamenos we hatiye sazkirin û bi URL-yek giştî gihîştî ye

## 1. Hesabek SignalWire çêbikin

Li [signalwire.com/signup](https://signalwire.com/signup) qeyd bibin. Di dema qeydkirinê de, hûn ê navek **Space** hilbijêrin (mînak, `myhotline`). URL-ya Space-a we dê `myhotline.signalwire.com` be. Vê navê not bikin — hûn ê di sazkirinê de pêwîstî bi wê bibin.

## 2. Hejmarek telefonê bikirin

1. Di Dashboard-a SignalWire ya xwe de, biçin **Phone Numbers**
2. **Buy a Phone Number** bikirtînin
3. Hejmarek bi qabîliyeta dengê lê bigerin
4. Hejmarê bikirin

## 3. Nasnameyên xwe bistînin

1. Biçin **API** di Dashboard-a SignalWire de
2. **Project ID** ya xwe bibînin (ev wekî Account SID tevdigere)
3. **API Token**-ek nû çêbikin heke hûn yek tune ne -- ev wekî Auth Token tevdigere

## 4. Webhookan saz bikin

1. Biçin **Phone Numbers** di dashboard de
2. Li hejmara hotline ya xwe bikirtînin
3. Di bin **Voice Settings** de, saz bikin:
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Call status callback**: `https://your-domain.com/api/telephony/status` (POST)

## 5. Di Llamenos de Saz bikin

1. Weke rêveber têkevin
2. Biçin **Settings** > **Telephony Provider**
3. **SignalWire** ji menuya daketinê ya pêşkêşkar hilbijêrin
4. Têkevin:
   - **Account SID**: Project ID-a we ji gava 3
   - **Auth Token**: API Token-a we ji gava 3
   - **SignalWire Space**: navê Space-a we (tenê nav, ne URL-a tevahî -- mînak, `myhotline`)
   - **Phone Number**: hejmare ku we kirî (formata E.164)
5. **Save** bikirtînin

## 6. Sazkirinê Biceribînin

Ji hejmara hotline ya xwe bang bikin. Hûn divê menuya hilbijartina zimanê bibihîzin û paşê riya bangê were rêvebirin.

## Sazkirina WebRTC (bijarte)

WebRTC-ya SignalWire heman nîşana API-ya ku Twilio bikar tîne:

1. Di Dashboard-a SignalWire ya xwe de, **API Key**-ek di bin **API** > **Tokens** de çêbikin
2. **LaML Application** çêbikin:
   - Biçin **LaML** > **LaML Applications**
   - Voice URL saz bikin li `https://your-domain.com/api/telephony/webrtc-incoming`
   - Application SID not bikin
3. Di Llamenos de, biçin **Settings** > **Telephony Provider**
4. **WebRTC Calling** çalak bikin
5. API Key SID, API Key Secret, û Application SID têkevin
6. **Save** bikirtînin

## Cudahiyên ji Twilio

- **LaML vs TwiML**: SignalWire LaML bikar tîne, ku bi fonksiyonalîteyî bi TwiML re yek e. Llamenos bi xweber vê rêve dibe.
- **Space URL**: Daxwazên API ber bi `{space}.signalwire.com` diçin li şûna `api.twilio.com`. Adapter vê bi navgîniya navê Space-a ku hûn pêşkêş dikin rêve dibe.
- **Bihayê**: SignalWire bi gelemperî 30-40% ji Twilio erzantir e ji bo bangên dengê.
- **Parîteya taybetmendiyan**: Hemû taybetmendiyên Llamenos (tomarkirin, transkripsiyon, CAPTCHA, peyama dengî) bi SignalWire re bi heman awayî dixebitin.

## Çareserkirina Arîşeyan

- **Çewtiyên "Space not found"**: Navek Space-ê ji nû ve kontrol bikin (tenê subdomain, ne URL-a tevahî).
- **Têkiliyên webhook**: Piştrast bikin ku URL-ya servera we gihîştî ye û HTTPS bikar tîne.
- **Arîşeyên tokena API**: Tokenên SignalWire dikarin biqedin. Heke hûn çewtiyên erêkirinê bistînin, tokenek nû çêbikin.
