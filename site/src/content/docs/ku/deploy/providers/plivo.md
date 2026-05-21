---
title: "Sazkirin: Plivo"
description: Rêbera gav-bi-gav ji bo sazkirina Plivo wekî pêşkêşkarê telefoniya xwe.
---

Plivo pêşkêşkarek telefoniya cloud-a erzan e ku API-ya wê ya rastîn e. Ew kontrola bangê ya li ser bingeha XML bikar tîne ku bi TwiML re hevseng e, ku têkiliya bi Llamenos re hêsan dike.

## Pêşdibistan

- [Hesabek Plivo](https://console.plivo.com/accounts/register/) (krediya ceribandinê heye)
- Enstansiya Llamenos we hatiye sazkirin û bi URL-yek giştî gihîştî ye

## 1. Hesabek Plivo çêbikin

Li [console.plivo.com](https://console.plivo.com/accounts/register/) qeyd bibin. Piştî verastkirinê, hûn dikarin **Auth ID** û **Auth Token** xwe li ser rûpela sereke ya dashboard bibînin.

## 2. Hejmarek telefonê bikirin

1. Biçin **Phone Numbers** > **Buy Numbers** di Console-a Plivo de
2. Welatê xwe hilbijêrin û ji bo hejmarên bi qabîliyeta dengê lê bigerin
3. Hejmarek bikirin

## 3. Sepaneke XML çêbikin

Plivo "XML Applications" bikar tîne da ku bangan bi rê ve bibe:

1. Biçin **Voice** > **XML Applications**
2. **Add New Application** bikirtînin
3. Saz bikin:
   - **Application Name**: Llamenos Hotline
   - **Answer URL**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Hangup URL**: `https://your-domain.com/api/telephony/status` (POST)
4. Sepanê tomar bikin

## 4. Hejmara telefonê girêbikin

1. Biçin **Phone Numbers** > **Your Numbers**
2. Li ser hejmara hotline ya xwe bikirtînin
3. Di bin **Voice** de, Sepana XML ku di gava 3 de çêkirî hilbijêrin
4. Tomar bikin

## 5. Di Llamenos de Saz bikin

1. Weke rêveber têkevin
2. Biçin **Settings** > **Telephony Provider**
3. **Plivo** ji menuya daketinê ya pêşkêşkar hilbijêrin
4. Têkevin:
   - **Auth ID**: ji dashboard-a Console-a Plivo
   - **Auth Token**: ji dashboard-a Console-a Plivo
   - **Phone Number**: hejmare ku we kirî (formata E.164)
5. **Save** bikirtînin

## 6. Sazkirinê Biceribînin

Ji hejmara hotline ya xwe bang bikin. Hûn divê menuya hilbijartina zimanê bibihîzin û bi riya riya normal a bangê were rêvebirin.

## Sazkirina WebRTC (bijarte)

Plivo WebRTC Browser SDK bi nasnameyên heyî yên we bikar tîne:

1. Biçin **Voice** > **Endpoints** di Console-a Plivo de
2. Endpointek nû çêbikin (ev wekî nasnameya telefona gerokê tevdigere)
3. Di Llamenos de, biçin **Settings** > **Telephony Provider**
4. **WebRTC Calling** çalak bikin
5. **Save** bikirtînin

Adapter ji Auth ID û Auth Token-a we tokenên HMAC bi dema sînorkirî ji bo erêkirina gerokê ya ewle çêdike.

## Notên taybet ên Plivo

- **XML vs TwiML**: Plivo ji bo kontrola bangê formata xwe ya XML bikar tîne, ku bi TwiML re hevseng e lê ne yek e. Adaptera Llamenos bi xweber XML-a rast a Plivo çêdike.
- **Answer URL vs Hangup URL**: Plivo rêvebera destpêka bangê (Answer URL) ji rêvebera dawiya bangê (Hangup URL) cuda dike, ji Twilio cuda ku tenê callback-a statûyê bikar tîne.
- **Sînorên rêjeyê**: Plivo sînorên rêjeya API hene ku li gorî asta hesabê diguherin. Ji bo hotlineyên bi hêjmara bilind, bi piştevaniya Plivo re têkilî daynin da ku sînoran zêde bikin.

## Çareserkirina Arîşeyan

- **"Auth ID invalid"**: Auth ID navnîşana e-nameya we nîne. Li ser rûpela sereke ya dashboard-a Console-a Plivo wê bibînin.
- **Bangan ne tên rêvebirin**: Piştrast bikin ku hejmara telefonê bi Sepana XML-a rast hatiye girêdan.
- **Çewtiyên Answer URL**: Plivo bersivên XML-a derbasdar hêvî dike. Ji bo çewtiyên bersivê logên serverê kontrol bikin.
- **Sînorên bangên derketinê**: Hesabên ceribandinê sînorên li ser bangên derketinê hene. Ji bo karanîna hilberînê bilind bikin.
