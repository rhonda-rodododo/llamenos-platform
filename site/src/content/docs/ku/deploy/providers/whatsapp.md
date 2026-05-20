---
title: "Sazkirin: WhatsApp"
description: WhatsApp Business bi navgîniya Meta Cloud API ji bo peyamên şîfrekirî girêbidin.
---

Llamenos peyamên WhatsApp Business bi navgîniya Meta Cloud API (Graph API v21.0) piştgirî dike. WhatsApp peyamên dewlemend bi piştgirîya nivîs, wêne, belge, deng, û peyamên têkildar peyda dike.

## Pêşdibistan

- [Hesabek Meta Business](https://business.facebook.com)
- Hejmarek telefonê ya WhatsApp Business API
- Sepaneke pêşvebira Meta bi hilbera WhatsApp-ê ya çalak

## Modên têkiliyê

Llamenos du modên têkiliyê yên WhatsApp piştgirî dike:

### Meta Direct (tê pêşniyaz kirin)

Bi rasterast bi Meta Cloud API ve girêbidin. Kontrola tevahî û hemû taybetmendiyan peyda dike.

**Nasnameyên pêwîst:**
- **Phone Number ID** — ID-ya hejmara telefonê ya WhatsApp Business-a we
- **Business Account ID** — ID-ya Hesabê Meta Business-a we
- **Access Token** — tokenek dirêj-dem a API-ya Meta
- **Verify Token** — rêzek xweser ku hûn ji bo verastkirina webhook hilbijêrin
- **App Secret** — sirêya sepana Meta (ji bo erêkirina îmaza webhook)

### Moda Twilio

Heke hûn berê ji bo dengê Twilio bikar tînin, hûn dikarin WhatsApp bi navgîniya hesabê Twilio ya xwe bi rê ve bibin. Sazkirin hêsantir e, lê hin taybetmendî dibe ku sînorkirî bin.

**Nasnameyên pêwîst:**
- Hesabê heyî ya Twilio Account SID, Auth Token, û sender-ê WhatsApp-ê ku bi Twilio ve girêdayî ye

## 1. Sepanek Meta çêbikin

1. Biçin [developers.facebook.com](https://developers.facebook.com)
2. Sepanek nû çêbikin (cure: Business)
3. **WhatsApp** hilbijêrin
4. Di WhatsApp > Getting Started de, **Phone Number ID** û **Business Account ID** ya xwe not bikin
5. Tokenek gihiştina daîmî çêbikin (Settings > Access Tokens)

## 2. Webhook saz bikin

Di panela pêşvebira Meta de:

1. Biçin WhatsApp > Configuration > Webhook
2. Callback URL saz bikin li:
   ```
   https://your-domain.com/api/messaging/whatsapp/webhook
   ```
3. Verify Token saz bikin ku bi ya ku hûn ê di mîhengên rêveberiya Llamenos de têkevin re heman e
4. Ji bo qada webhookê `messages` abone bibin

Meta daxwazek GET ji bo verastkirina webhookê dişîne. Servera we bi challenge ve bersivê dide heke verify token li hev bê.

## 3. WhatsApp di mîhengên rêveberiyê de çalak bikin

Biçin **Admin Settings > Messaging Channels** (an jî sihêrbara sazkirinê bikar bînin) û **WhatsApp** çalak bikin.

**Meta Direct** an jî **Twilio** hilbijêrin û nasnameyên pêwîst têkevin.

Mîhengên bijarte saz bikin:
- **Auto-response message** — ji bo têkiliyên cara yekem tê şandin
- **After-hours response** — ji derveyî demên şevê tê şandin

## 4. Biceribînin

Peyamek WhatsAppê bişînin hejmara telefonê ya Business-a xwe. Dîalog divê di taba **Conversations** de xuya bibe.

## Pencereya peyamên 24-saatî

WhatsApp pencereyek peyamên 24-saatî ferz dike:
- Hûn dikarin di nav 24 saetan ji peyama dawîn a bikarhêner bersiv bidin
- Piştî 24 saetan, divê hûn ji bo destpêkirina dîalogê dîsa **template message**-ek erêkirî bikar bînin
- Llamenos bi xweber vê rêve dibe -- heke pencere biqede, peyamek şablonek ji bo destpêkirina dîalogê dide şandin

## Piştgirîya medyayê

WhatsApp peyamên medya dewlemend piştgirî dike:
- **Wêne** (JPEG, PNG)
- **Belge** (PDF, Word, hwd.)
- **Deng** (MP3, OGG)
- **Vîdeo** (MP4)
- **Parvekirin** cihê
- **Têkildar** bişkok û peyamên lîsteyê

Pêvekên medyayê di dîmena dîalogê de inline xuya dibin.

## Notên ewlehiyê

- WhatsApp şîfrekirina end-to-end di navbera bikarhêner û înfrastruktura Meta de bikar tîne
- Meta bi teknîkî dikare naveroka peyamê li ser serverên xwe bigihîne
- Peyamên hatî şîfrekirî ne û di danegehê de têne tomar kirin
- Îmazên webhook bi karanîna HMAC-SHA256 bi sirêya sepana we têne erêkirin
- Ji bo nepeniya herî zêde, li şûna WhatsApp Signal bifikirin
