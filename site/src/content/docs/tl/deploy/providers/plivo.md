---
title: "Setup: Plivo"
description: Hakbang-hakbang na gabay para i-configure ang Plivo bilang iyong telephony provider.
---

Ang Plivo ay isang budget-friendly na cloud telephony provider na may simple na API. Gumagamit ito ng XML-based na call control na katulad ng TwiML, kaya seamless ang integration sa Llamenos.

## Mga Kinakailangan

- Isang [Plivo account](https://console.plivo.com/accounts/register/) (may trial credit)
- Ang iyong Llamenos instance na naka-deploy at naa-access sa pamamagitan ng pampublikong URL

## 1. Lumikha ng Plivo account

Mag-sign up sa [console.plivo.com](https://console.plivo.com/accounts/register/). Pagkatapos ng verification, mahahanap mo ang iyong **Auth ID** at **Auth Token** sa dashboard home page.

## 2. Bumili ng numero ng telepono

1. Pumunta sa **Phone Numbers** > **Buy Numbers** sa Plivo Console
2. Piliin ang iyong bansa at maghanap ng mga numero na may voice capability
3. Bumili ng numero

## 3. Lumikha ng XML application

Gumagamit ang Plivo ng "XML Applications" para i-route ang mga tawag:

1. Pumunta sa **Voice** > **XML Applications**
2. I-click ang **Add New Application**
3. I-configure ang:
   - **Application Name**: Llamenos Hotline
   - **Answer URL**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Hangup URL**: `https://your-worker-url.com/telephony/status` (POST)
4. I-save ang application

## 4. I-link ang numero ng telepono

1. Pumunta sa **Phone Numbers** > **Your Numbers**
2. I-click ang iyong numero ng hotline
3. Sa ilalim ng **Voice**, piliin ang XML Application na ginawa mo sa hakbang 3
4. I-save

## 5. I-configure sa Llamenos

1. Mag-log in bilang admin
2. Pumunta sa **Settings** > **Telephony Provider**
3. Piliin ang **Plivo** mula sa provider dropdown
4. Ilagay ang:
   - **Auth ID**: mula sa Plivo Console dashboard
   - **Auth Token**: mula sa Plivo Console dashboard
   - **Phone Number**: ang binili mong numero (E.164 format)
5. I-click ang **Save**

## 6. Subukan ang setup

Tawagan ang numero ng iyong hotline. Dapat marinig mo ang menu ng pagpili ng wika at ma-route ka sa normal na daloy ng tawag.

## WebRTC setup (opsyonal)

Ang Plivo WebRTC ay gumagamit ng Browser SDK kasama ang iyong kasalukuyang mga kredensyal:

1. Pumunta sa **Voice** > **Endpoints** sa Plivo Console
2. Lumikha ng bagong endpoint (ito ang nagsisilbing pagkakakilanlan ng browser phone)
3. Sa Llamenos, pumunta sa **Settings** > **Telephony Provider**
4. I-toggle on ang **WebRTC Calling**
5. I-click ang **Save**

Ang adapter ay bumubuo ng time-limited na HMAC token mula sa iyong Auth ID at Auth Token para sa secure na browser authentication.

## Mga tala na tiyak sa Plivo

- **XML vs TwiML**: Gumagamit ang Plivo ng sarili nitong XML format para sa call control, na katulad pero hindi eksaktong kapareho ng TwiML. Awtomatikong bumubuo ang Llamenos adapter ng tamang Plivo XML.
- **Answer URL vs Hangup URL**: Hinahiwalay ng Plivo ang initial call handler (Answer URL) sa call end handler (Hangup URL), di tulad ng Twilio na gumagamit ng isang status callback.
- **Mga rate limit**: May API rate limit ang Plivo na nagbabago ayon sa account tier. Para sa mga high-volume na hotline, makipag-ugnayan sa Plivo support para dagdagan ang mga limit.

## Pag-troubleshoot

- **"Auth ID invalid"**: Ang Auth ID ay hindi ang iyong email address. Hanapin ito sa Plivo Console dashboard home page.
- **Hindi naru-route ang mga tawag**: I-verify na naka-link ang numero ng telepono sa tamang XML Application.
- **Mga error sa Answer URL**: Ang Plivo ay umaasa ng valid na XML response. Suriin ang iyong Worker log para sa mga response error.
- **Mga restriksyon sa outbound call**: May mga limitasyon ang mga trial account sa outbound calling. Mag-upgrade para sa production use.
