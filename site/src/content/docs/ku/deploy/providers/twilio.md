---
title: "Sazkirin: Twilio"
description: Rêbera gav-bi-gav ji bo sazkirina Twilio wekî pêşkêşkarê telefoniya xwe.
---

Twilio pêşkêşkarê telefoniya xwerû ye ji bo Llamenos û ya herî hêsan e ku were dest pê kirin. Ev rêber rêveberiya çêkirina hesabê, sazkirina hejmara telefonê, û mîhengkirina webhookan nîşan dide.

## Pêşdibistan

- [Hesabek Twilio](https://www.twilio.com/try-twilio) (ceribandina belaş ji bo ceribandinê dixebite)
- Enstansiya Llamenos we hatiye sazkirin û bi URL-yek giştî gihîştî ye

## 1. Hesabek Twilio çêbikin

Li [twilio.com/try-twilio](https://www.twilio.com/try-twilio) qeyd bibin. E-name û hejmara telefonê xwe verast bikin. Twilio ji bo ceribandinê krediya ceribandinê peyda dike.

## 2. Hejmarek telefonê bikirin

1. Biçin **Phone Numbers** > **Manage** > **Buy a number** di Console-a Twilio de
2. Ji bo hejmarek bi qabîliyeta **Voice** li koda herêma xwe lê bigerin
3. **Buy** bikirtînin û piştrast bikin

Vê hejmarê tomar bikin -- hûn ê wê di mîhengên rêveberiya Llamenos de têkevin.

## 3. Account SID û Auth Token-a xwe bistînin

1. Biçin [Twilio Console dashboard](https://console.twilio.com)
2. **Account SID** û **Auth Token** xwe li ser rûpela sereke bibînin
3. Li ser îkona çav bikirtînin da ku Auth Token were nîşandan

## 4. Webhookan saz bikin

Di Console-a Twilio de, biçin mîhengkirina hejmara telefonê ya xwe:

1. Biçin **Phone Numbers** > **Manage** > **Active Numbers**
2. Li hejmara hotline ya xwe bikirtînin
3. Di bin **Voice Configuration** de, saz bikin:
   - **A call comes in**: Webhook, `https://your-domain.com/api/telephony/incoming`, HTTP POST
   - **Call status changes**: `https://your-domain.com/api/telephony/status`, HTTP POST

`your-domain.com` bi URL-ya rastîn a sazkirina Llamenos ya xwe biguherînin.

## 5. Di Llamenos de Saz bikin

1. Weke rêveber têkevin
2. Biçin **Settings** > **Telephony Provider**
3. **Twilio** ji menuya daketinê ya pêşkêşkar hilbijêrin
4. Têkevin:
   - **Account SID**: ji gava 3
   - **Auth Token**: ji gava 3
   - **Phone Number**: hejmare ku we kirî (formata E.164, mînak, `+15551234567`)
5. **Save** bikirtînin

## 6. Sazkirinê Biceribînin

Ji telefonekê hejmara hotline ya xwe biqeyd bikin. Hûn divê menuya hilbijartina zimanê bibihîzin. Heke hûn xwebexş li ser şevê ne, bang dê were rêvebirin.

## Sazkirina WebRTC (bijarte)

Ji bo çalakkirina bersiva bangên xwebexş di geroka xwe de li şûna telefona xwe:

### API Key çêbikin

1. Biçin **Account** > **API keys & tokens** di Console-a Twilio de
2. **Create API Key** bikirtînin
3. Cureyê kilîtê **Standard** hilbijêrin
4. **SID** û **Secret** tomar bikin -- sir tenê carekê tê nîşandan

### TwiML App çêbikin

1. Biçin **Voice** > **Manage** > **TwiML Apps**
2. **Create new TwiML App** bikirtînin
3. **Voice Request URL** saz bikin li `https://your-domain.com/api/telephony/webrtc-incoming`
4. Tomar bikin û **App SID** not bikin

### Di Llamenos de Çalak bikin

1. Biçin **Settings** > **Telephony Provider**
2. **WebRTC Calling** çalak bikin
3. Têkevin:
   - **API Key SID**: ji API key-a ku we çêkir
   - **API Key Secret**: ji API key-a ku we çêkir
   - **TwiML App SID**: ji TwiML App-a ku we çêkir
4. **Save** bikirtînin

Ji bo sazkirina xwebexş û çareserkirina arîşeyan, [WebRTC Browser Calling](/docs/deploy/providers/webrtc) bibînin.

## Çareserkirina Arîşeyan

- **Bangan nagihin**: URL-ya webhookê piştrast bikin û servera we hatiye sazkirin. Logên çewtiyên Console-a Twilio kontrol bikin.
- **Çewtiyên "Invalid webhook"**: Piştrast bikin ku URL-ya webhookê HTTPS bikar tîne û TwiML-a derbasdar vedigere.
- **Sînorên hesabê ceribandinê**: Hesabên ceribandinê tenê dikarin bi hejmarên verastkirî re biaxivin. Ji bo karanîna hilberînê bilind bikin.
- **Têkiliyên erêkirina webhook**: Piştrast bikin ku Auth Token di Llamenos de bi ya ku di Console-a Twilio de ye re li hev tê.
