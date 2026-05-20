---
title: WebRTC Browser Calling
description: Fur in-browser call answering oo loogu talagalay isbitaallada iyada oo la isticmaalayo WebRTC.
---

WebRTC (Web Real-Time Communication) waxay u oggolaanaysaa isbitaallada inay ka jawaabaan calls-ka hotline-ka si toos ah browser-kooda, iyada oo aan loo baahanayn taleefan. Tani waxay faa'iido u leedahay isbitaallada aan rabin inay la wadaagaan lambarkaaga taleefanka ama kuwa ka shaqeeya kombiyuutar.

## Sida uu u shaqeeyo

1. Maamuluhu wuxuu furayaa WebRTC goobaha bixiyaha telephony
2. Isbitaalladu waxay dejiyaan doorashadooda call-ka "Browser" profile-kooda
3. Marka call uu yimaado, app-ka Llamenos wuxuu ku dhawaaqaa browser-ka iyada oo leh digniin
4. Isbitaalku wuxuu gujiyaa "Answer" oo call-ku wuxuu isku xiraa browser-ka iyada oo la isticmaalayo mikrofoonkiisa

Codka call-ka waxaa loo gudbiyaa bixiyaha telephony iyada oo loo marayo isku xirka WebRTC ilaa browser-ka isbitaalka. Tayada call-ka waxay ku xiran tahay isku xirka internet-ka isbitaalka.

## Shuruudaha hore

### Tafatirka maamulka

- Bixiye telephony oo taageero WebRTC leh (Twilio, SignalWire, Vonage, ama Plivo)
- Aqoonsiga WebRTC ee gaarka ah ee bixiyaha (eeg hagga tafatirka bixiyaha)
- WebRTC oo la beddelay ON **Settings** > **Telephony Provider**

### Shuruudaha isbitaalka

- Browser cusub (Chrome, Firefox, Edge, ama Safari 14.1+)
- Mikroofan shaqeeya
- Isku xir internet oo adag (ugu yaraan 100 kbps kor/hoos)
- Ogolaanshaha digniinada browser-ka la bixiyay

## Tafatirka gaarka ah ee bixiyaha

Bixiye kasta oo telephony ah waxay u baahan tahay aqoonsi kala duwan oo WebRTC:

### Twilio / SignalWire

1. Abuur **API Key** console-ka bixiyaha
2. Abuur **TwiML/LaML Application** iyada oo Voice URL loo dejiyo `https://your-domain.com/api/telephony/webrtc-incoming`
3. Llamenos, geli API Key SID, API Key Secret, iyo Application SID

### Vonage

1. Vonage Application-kaagu horeyba wuxuu leeyahay awood WebRTC
2. Llamenos, ku dhaji **fure gaarka ah** ee Application-kaaga (format-ka PEM)
3. Application ID waa horeyba loo habeeyay setup-ka ugu horreeya

### Plivo

1. Abuur **Endpoint** Plivo Console iyada oo loo jeediyo **Voice** > **Endpoints**
2. WebRTC waxay isticmaashaa Auth ID iyo Auth Token-kaaga ee horey u jiray
3. Fur WebRTC Llamenos — aqoonsi dheeraad ah ma loo baahan yahay

### Asterisk

Asterisk WebRTC waxay u baahan tahay tafatirka SIP.js iyada oo loo marayo WebSocket transport. Tani waxay ka badan tahay bixiyeyaasha cloud:

1. Fur WebSocket transport `http.conf` ee Asterisk
2. Abuur PJSIP endpoints ee WebRTC clients iyada oo leh DTLS-SRTP
3. Llamenos si otomaatig ah ayay u tafatirtaa SIP.js client marka Asterisk la doorto

Eeg [hagga tafatirka Asterisk](/docs/deploy/providers/asterisk) si aad u hesho faahfaahin oo dhan.

## Tafatirka doorashada call-ka ee isbitaalka

Isbitaalladu waxay tafatiraan doorashadooda call-ka app-ka:

1. Soo gal Llamenos
2. U gudub **Settings** (icon-ka gear)
3. Hoos **Call Preferences**, dooro **Browser** halkii **Phone**
4. Bixi ogolaanshaha mikroofanka iyo digniinta marka la weydiiyo
5. Sii tab-ka Llamenos furan inta lagu jiro shift-kaaga

Marka call uu yimaado, waxaad arki doontaa digniin browser-ka iyo calaamad dhawaaqaysa app-ka. Guji **Answer** si aad u isku xirto.

## Iswaafaqida browser-ka

| Browser | Desktop | Mobile | Xusuusin |
|---|---|---|---|
| Chrome | Haa | Haa | La talinayo |
| Firefox | Haa | Haa | Taageerada oo dhan |
| Edge | Haa | Haa | Ku salaysan Chromium, taageerada oo dhan |
| Safari | Haa (14.1+) | Haa (14.1+) | Waxay u baahan tahay ficil isticmaale si codka u bilaawdo |
| Brave | Haa | Xaddidan | Waxay u baahan tahay in shields-ka mikroofanka la joojiyo |

## Talooyinka tayada codka

- Isticmaal headset ama earbuds si aad u yareysato dhago-dhac
- Xidh apps-ka kale ee isticmaala mikroofanka
- Isticmaal isku xir internet oo xadhig leh haddii suurtagal tahay
- Jooji kordhinta browser-ka waxyeelo u geysan karta WebRTC (VPN extensions, ad blockers iyada oo leh WebRTC leak protection)

## Xalinta dhibaatooyinka

### Ma jiro cod

- **Hubi ogolaanshaha mikroofanka**: Guji icon-ka qufulka cinwaanka bar-ka oo hubi in helitaanka mikroofanku yahay "Allow"
- **Tijaabi mikroofankaaga**: Isticmaal tijaabada codka ee browser-kaaga ama goob sida [webcamtest.com](https://webcamtest.com)
- **Hubi soo saarista codka**: Hubi in speakers-kaaga ama headset-kaaga ay yihiin qalabka soo saarida ee la doortay

### Calls ma dhawaaqayaan browser-ka

- **Digniinada la xiray**: Hubi in digniinada browser-ka ay furan yihiin goobta Llamenos
- **Tab ma shaqeynayo**: Tab-ka Llamenos waa inuu furan yahay (wuxuu ku jiri karaa dambe, laakiin tab-ku waa inuu jiraa)
- **Doorashada call-ka**: Xaqiiji in doorashadaada call-ka ay tahay "Browser" goobaha
- **WebRTC ma tafatirna**: Weydii maamulkaaga inuu xaqiijiyo in WebRTC uu furan yahay oo aqoonsiyadu ay deggan yihiin

### Dhibaatooyinka Firewall iyo NAT

WebRTC waxay isticmaashaa server-ka STUN/TURN si ay u gudbaan firewalls iyo NAT. Haddii calls-ka ay isku xiraan laakiin aadan maqlin cod:

- **Firewalls-ka shirkadda**: Qaar ka mid ah firewalls-ka waxay xiraan traffic-ga UDP ee alaabada aan caanka ahayn. Weydii kooxdaaga IT inay u ogolaadaan traffic-ga UDP ee alaabada 3478 iyo 10000-60000
- **Symmetric NAT**: Qaar ka mid ah routers-ka waxay isticmaalaan symmetric NAT taasoo ka hortagi karta isku xirka tooska ah. Server-ka TURN ee bixiyaha telephony waa inuu si otomaatig ah u maareeyaa
- **Isdhexgalka VPN**: VPN-yadu waxay ka hortagi karaan isku xirka WebRTC. Isku day inaad ka go'do VPN-kaaga inta lagu jiro shift-ka

### Dhago-dhac ama soo celcelinta

- Isticmaal headphones halkii speakers
- Yaree dareeraha mikroofanka goobaha codka OS-ka
- Fur echo cancellation browser-kaaga (badanaa si toos ah u furan)
- Ka fogow dabeecadaha adag, soo celcelinta leh
