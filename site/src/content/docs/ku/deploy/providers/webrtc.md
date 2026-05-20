---
title: WebRTC Browser Calling
description: Bersiva bangên di gerokê de ji bo xwebexşan bi karanîna WebRTC çalak bikin.
---

WebRTC (Web Real-Time Communication) ji xwebexşan re dihêle ku bangan bi rasterast di geroka xwe de bibersivînin, bêyî ku hewceyê telefonekê bin. Ev ji bo xwebexşên ku naxwazin hejmara telefona xwe parve bikin an ku ji kompîyuterekê dixebitin kêrhatî ye.

## Çawa dixebite

1. Rêveber WebRTC di mîhengên pêşkêşkarê telefoniyê de çalak dike
2. Xwebexş tercîha bangê ya xwe di profîla xwe de li "Browser" saz dikin
3. Dema ku bangek tê, sepana Llamenos di gerokê de bi hişyariyekê deng dike
4. Xwebexş "Bersiv" bikirtînin û bang bi karanîna mikrofona xwe bi gerokê ve girêdide

Dengê bangê ji pêşkêşkarê telefoniyê re bi navgîniya girêdanek WebRTC ber bi geroka xwebexş ve tê rêvebirin. Kalîteya bangê li ser girêdana înternetê ya xwebexşê girêdayî ye.

## Pêşdibistan

### Sazkirina rêveber

- Pêşkêşkarek telefoniyê bi WebRTC-ya çalak (Twilio, SignalWire, Vonage, an Plivo)
- Nasnameyên WebRTC-yê yên taybetî ji bo pêşkêşkar hatine mîhengkirin (rêberên sazkirina pêşkêşkar bibînin)
- WebRTC di **Settings** > **Telephony Provider** de çalak e

### Pêwîstiyên xwebexş

- Gerokek nûjen (Chrome, Firefox, Edge, an Safari 14.1+)
- Mikrofonek kar dik
- Girêdanek înternetê ya sabît (kêmtirîn 100 kbps jor/jêr)
- Mafên hişyariyên gerokê hatine dayîn

## Sazkirina taybetî ji bo pêşkêşkar

Her pêşkêşkarê telefoniyê ji bo WebRTC nasnameyên cuda hewce dike:

### Twilio / SignalWire

1. **API Key**-ek di panela pêşkêşkar de çêbikin
2. **TwiML/LaML Application** çêbikin ku Voice URL li `https://your-domain.com/api/telephony/webrtc-incoming` hatiye sazkirin
3. Di Llamenos de, API Key SID, API Key Secret, û Application SID têkevin

### Vonage

1. Sepana Vonage-a we berê qabîliyeta WebRTC dihewîne
2. Di Llamenos de, **private key**-a Sepana xwe paste bikin (formata PEM)
3. Application ID berê ji sazkirina destpêkê hatiye mîhengkirin

### Plivo

1. **Endpoint**-ek di Console-a Plivo de di bin **Voice** > **Endpoints** de çêbikin
2. WebRTC nasnameyên heyî yên we Auth ID û Auth Token bikar tîne
3. WebRTC di Llamenos de çalak bikin -- tu nasnameyên zêdetir pêwîst nînin

### Asterisk

WebRTC-ya Asterisk sazkirina SIP.js bi WebSocket transport hewce dike. Ev ji pêşkêşkarên cloud zêdetir têkildar e:

1. WebSocket transport di `http.conf` ya Asterisk de çalak bikin
2. Endpointên PJSIP ji bo xerîdarên WebRTC bi DTLS-SRTP çêbikin
3. Llamenos bi xweber xerîdarê SIP.js saz dike dema ku Asterisk tê hilbijartin

Ji bo hûrguliyên tevahî, [rêbera sazkirina Asterisk](/docs/deploy/providers/asterisk) bibînin.

## Sazkirina tercîha bangê ya xwebexş

Xwebexş tercîha bangê ya xwe di sepê de mîheng dikin:

1. Têkevin Llamenos
2. Biçin **Settings** (îkona gerê)
3. Di bin **Call Preferences** de, **Browser** li şûna **Phone** hilbijêrin
4. Dema ku hatiye xwestin, mafên mikrofon û hişyarî bidin
5. Di dema şevê de taba Llamenos vekirî bihêlin

Dema ku bangek tê, hûn ê hişyariyek gerok û nîşanek dengê di sepê de bibînin. Ji bo girêdanê **Bersiv** bikirtînin.

## Hevgirtina gerokê

| Gerok | Sermase | Mobîl | Not |
|---|---|---|---|
| Chrome | Erê | Erê | Tê pêşniyaz kirin |
| Firefox | Erê | Erê | Piştgirîya tevahî |
| Edge | Erê | Erê | Li ser bingeha Chromium, piştgirîya tevahî |
| Safari | Erê (14.1+) | Erê (14.1+) | Ji bo destpêkirina dengê têkiliya bikarhêner hewce dike |
| Brave | Erê | Sînorkirî | Dibe ku ji bo mikrofonê divê shields were neçalak kirin |

## Serişteyên kalîteya dengê

- Ji bo pêşîlêgirtina dengê, headset an earbuds bikar bînin
- Sepanên din ku mikrofonê bikar tînin bigirin
- Dema ku gengaz e, girêdana înternetê ya bi kabel bikar bînin
- Eklentiyên gerokê ku dikarin bi WebRTC re astengiyê çêbikin neçalak bikin (eklentiyên VPN, astengkerên reklaman bi parastina leak-a WebRTC)

## Çareserkirina Arîşeyan

### Deng tune

- **Mafên mikrofonê kontrol bikin**: Li ser îkona kilîtê li darikê navnîşanê bikirtînin û piştrast bikin ku gihiştina mikrofonê "Allow" e
- **Mikrofona xwe biceribînin**: Testa dengê ya gerokê an malperek wekî [webcamtest.com](https://webcamtest.com) bikar bînin
- **Derana dengê kontrol bikin**: Piştrast bikin ku dengder an headset wekî amûra deranê hatiye hilbijartin

### Bangan di gerokê de deng nakin

- **Hişyarî hatine astengkirin**: Kontrol bikin ku hişyariyên gerokê ji bo malpera Llamenos çalak in
- **Tab ne çalak e**: Taba Llamenos divê vekirî be (dikare li paşnavê be, lê tab divê hebe)
- **Tercîha bangê**: Tercîha bangê ya xwe piştrast bikin ku li "Browser" hatiye sazkirin di Settings de
- **WebRTC nehatiye mîhengkirin**: Ji rêveberê xwe bixwazin ku piştrast bike ku WebRTC çalak e û nasnameyên hatine sazkirin

### Arîşeyên firewall û NAT

WebRTC serverên STUN/TURN ji bo derbasbûna firewall û NAT bikar tîne. Heke bangan girêdidin lê hûn deng nabihîzin:

- **Firewallên sazî**: Hin firewallan trafîka UDP li ser portên ne-standard asteng dikin. Ji tîma IT ya xwe bixwazin ku trafîka UDP li ser portên 3478 û 10000-60000 destûr bidin
- **NAT-a simetrîk**: Hin router NAT-a simetrîk bikar tînin ku dikare girêdanên rasterast asteng bike. Serverên TURN ên pêşkêşkar divê bi xweber vê rêve bibin
- **Astengiya VPN**: VPN dikarin bi girêdanên WebRTC re astengiyê çêbikin. Di dema şevê de VPN-ê xwe qut bikin

### Dengê dubare an feedback

- Li şûna dengderan, headphone bikar bînin
- Hesasiya mikrofonê di mîhengên dengê ya OS-ê de kêm bikin
- Ji bo pêşîlêgirtina dengê di gerokê de çalak bikin (bi gelemperî bi xweber çalak e)
- Ji ber çînên zehf, refleksîf dûr bixin
