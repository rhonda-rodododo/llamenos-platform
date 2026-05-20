---
title: "Sazkirin: Vonage"
description: Rêbera gav-bi-gav ji bo sazkirina Vonage wekî pêşkêşkarê telefoniya xwe.
---

Vonage (berê Nexmo) berfirehbûna navneteweyî ya xurt û bihayên pêşbazî peyda dike. Ew modelek API-yê ya cuda ji Twilio bikar tîne -- Sepanên Vonage hejmara we, webhookên we, û nasnameyên we kom dikin.

## Pêşdibistan

- [Hesabek Vonage](https://dashboard.nexmo.com/sign-up) (krediya belaş heye)
- Enstansiya Llamenos we hatiye sazkirin û bi URL-yek giştî gihîştî ye

## 1. Hesabek Vonage çêbikin

Li [Vonage API Dashboard](https://dashboard.nexmo.com/sign-up) qeyd bibin. Hesabê xwe verast bikin û **API Key** û **API Secret** xwe ji rûpela sereke ya dashboard not bikin.

## 2. Hejmarek telefonê bikirin

1. Biçin **Numbers** > **Buy numbers** di Dashboard-a Vonage de
2. Welatê xwe hilbijêrin û hejmarek bi qabîliyeta **Voice** hilbijêrin
3. Hejmarê bikirin

## 3. Sepanek Vonage çêbikin

Vonage mîhengê di nav "Applications" de kom dike:

1. Biçin **Applications** > **Create a new application**
2. Navek têkevin (mînak, "Llamenos Hotline")
3. Di bin **Voice** de, çalak bikin û saz bikin:
   - **Answer URL**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Event URL**: `https://your-domain.com/api/telephony/status` (POST)
4. **Generate new application** bikirtînin
5. **Application ID** ya ku li ser rûpela piştrastkirinê hatiye nîşandan tomar bikin
6. Pelê **private key** daxûstandin -- hûn ê ji bo mîhengkirinê pêwîstî bi naveroka wê bibin

## 4. Hejmara telefonê girêbikin

1. Biçin **Numbers** > **Your numbers**
2. Li ikona gerê li kêleka hejmara hotline ya xwe bikirtînin
3. Di bin **Voice** de, Sepana ku di gava 3 de çêkirî hilbijêrin
4. **Save** bikirtînin

## 5. Di Llamenos de Saz bikin

1. Weke rêveber têkevin
2. Biçin **Settings** > **Telephony Provider**
3. **Vonage** ji menuya daketinê ya pêşkêşkar hilbijêrin
4. Têkevin:
   - **API Key**: ji rûpela sereke ya Dashboard-a Vonage
   - **API Secret**: ji rûpela sereke ya Dashboard-a Vonage
   - **Application ID**: ji gava 3
   - **Phone Number**: hejmare ku we kirî (formata E.164)
5. **Save** bikirtînin

## 6. Sazkirinê Biceribînin

Ji hejmara hotline ya xwe bang bikin. Hûn divê menuya hilbijartina zimanê bibihîzin. Piştrast bikin ku bangan ber bi xwebexşên li ser şevê tên rêvebirin.

## Sazkirina WebRTC (bijarte)

WebRTC-ya Vonage nasnameyên Sepanê ku we berê çêkirî bikar tîne:

1. Di Llamenos de, biçin **Settings** > **Telephony Provider**
2. **WebRTC Calling** çalak bikin
3. Naveroka **Private Key** têkevin (nivîsa PEM-a tevahî ji pelê ku we daxûstand)
4. **Save** bikirtînin

Application ID berê hatiye mîhengkirin. Vonage JWT-ên RS256 bi karanîna private key ji bo erêkirina gerokê çêdike.

## Notên taybet ên Vonage

- **NCCO vs TwiML**: Vonage NCCO (Nexmo Call Control Objects) di formata JSON de li şûna nîşankirina XML bikar tîne. Adaptera Llamenos bi xweber formata rast çêdike.
- **Formata Answer URL**: Vonage hêvî dike ku answer URL JSON (NCCO) vedigere, ne XML. Ev ji hêla adapter ve tê rêvebirin.
- **Event URL**: Vonage bûyerên bangê (ringing, answered, completed) wekî daxwazên JSON POST ber bi event URL ve dişîne.
- **Ewlehiya private key**: Private key şîfrekirî tê tomar kirin. Ew ji serverê derdikeve -- tenê ji bo çêkirina tokenên JWT bi dema kurt tê bikar anîn.

## Çareserkirina Arîşeyan

- **"Application not found"**: Piştrast bikin ku Application ID bi tevahî li hev tê. Hûn dikarin wê di bin **Applications** de di Dashboard-a Vonage de bibînin.
- **Bangan nagihin**: Piştrast bikin ku hejmara telefonê bi Sepana rast hatiye girêdan (gava 4).
- **Çewtiyên private key**: Naveroka PEM-a tevahî paste bikin ku bi `-----BEGIN PRIVATE KEY-----` û `-----END PRIVATE KEY-----` dest pê dike û biqedîne.
- **Formata hejmarên navneteweyî**: Vonage formata E.164 hewce dike. `+` û koda welatê tê de bibin.
