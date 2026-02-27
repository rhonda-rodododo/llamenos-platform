---
title: Mga Feature
subtitle: Lahat ng kailangan ng isang crisis response platform, sa isang open-source package. Voice, SMS, WhatsApp, Signal, at mga naka-encrypt na ulat — ginawa sa Cloudflare Workers na walang server na kailangang pamahalaan.
---

## Multi-Provider Telephony

**5 voice provider** — Pumili mula sa Twilio, SignalWire, Vonage, Plivo, o self-hosted Asterisk. I-configure ang iyong provider sa admin settings UI o sa setup wizard. Magpalit ng provider kahit kailan nang walang pagbabago sa code.

**WebRTC browser calling** — Maaaring sumagot ang mga volunteer ng mga tawag nang direkta sa browser nang walang telepono. Provider-specific na WebRTC token generation para sa Twilio, SignalWire, Vonage, at Plivo. Nako-configure ang call preference bawat volunteer (telepono, browser, o pareho).

## Call Routing

**Parallel ringing** — Kapag tumawag ang isang caller, sabay-sabay na tumutunog ang lahat ng on-shift at available na volunteer. Ang unang volunteer na sumagot ang kukuha ng tawag; agad na humihinto ang pag-ring sa iba.

**Shift-based scheduling** — Gumawa ng mga recurring shift na may tiyak na araw at oras. Mag-assign ng mga volunteer sa mga shift. Awtomatikong ino-route ng sistema ang mga tawag sa kung sino ang naka-duty.

**Queue na may hold music** — Kung abala ang lahat ng volunteer, pumapasok ang mga caller sa queue na may nako-configure na hold music. Adjustable ang queue timeout (30-300 segundo). Kapag walang sumasagot, pumapasok ang mga tawag sa voicemail.

**Voicemail fallback** — Maaaring mag-iwan ng voicemail ang mga caller (hanggang 5 minuto) kung walang sumasagot na volunteer. Ang mga voicemail ay tina-transcribe sa pamamagitan ng Whisper AI at ine-encrypt para sa admin review.

## Mga Naka-encrypt na Nota

**End-to-end encrypted na note-taking** — Sumusulat ang mga volunteer ng mga nota habang at pagkatapos ng mga tawag. Ine-encrypt ang mga nota sa client-side gamit ang ECIES (secp256k1 + XChaCha20-Poly1305) bago umalis sa browser. Ang server ay nag-iimbak lamang ng ciphertext.

**Dual encryption** — Bawat nota ay naka-encrypt nang dalawang beses: isang beses para sa volunteer na sumulat nito, at isang beses para sa admin. Parehong makakapag-decrypt nang hiwalay. Walang ibang makakabasa ng nilalaman.

**Custom fields** — Nagde-define ang mga admin ng custom fields para sa mga nota: text, number, select, checkbox, textarea. Naka-encrypt ang mga field kasama ng note content.

**Draft auto-save** — Awtomatikong sine-save ang mga nota bilang naka-encrypt na drafts sa browser. Kung mag-reload ang page o mag-navigate palayo ang volunteer, napapreserba ang kanilang trabaho. Nililinis ang mga draft sa pag-logout.

## AI Transcription

**Whisper-powered transcription** — Tina-transcribe ang mga call recording gamit ang Cloudflare Workers AI na may Whisper model. Nangyayari ang transcription sa server-side, pagkatapos ay ine-encrypt ang transcript bago i-store.

**Toggle controls** — Maaaring i-enable/disable ng admin ang transcription globally. Maaaring mag-opt out ang mga volunteer nang individual. Parehong toggle ay independent.

**Mga naka-encrypt na transcript** — Gumagamit ang mga transcript ng parehong ECIES encryption tulad ng mga nota. Ang naka-store na transcript ay ciphertext lamang.

## Spam Mitigation

**Voice CAPTCHA** — Opsyonal na voice bot detection: nakakarinig ang mga caller ng randomized 4-digit number at kailangan nilang i-enter ito sa keypad. Bina-block ang automated dialing habang nananatiling accessible sa mga totoong caller.

**Rate limiting** — Sliding-window rate limiting bawat phone number, naka-persist sa Durable Object storage. Nakakaligtas sa Worker restarts. Nako-configure ang mga threshold.

**Real-time ban lists** — Pinamamahalaan ng mga admin ang phone number ban lists na may single-entry o bulk import. Agad na tumatalab ang mga ban. Nakakarinig ang mga banned caller ng rejection message.

**Custom IVR prompts** — Mag-record ng custom voice prompts para sa bawat sinusuportahang wika. Ginagamit ng sistema ang iyong mga recording para sa IVR flows, bumabalik sa text-to-speech kapag walang recording.

## Multi-Channel Messaging

**SMS** — Inbound at outbound SMS messaging sa pamamagitan ng Twilio, SignalWire, Vonage, o Plivo. Auto-response na may nako-configure na welcome messages. Dumadaan ang mga mensahe sa threaded conversation view.

**WhatsApp Business** — Kumokonekta sa pamamagitan ng Meta Cloud API (Graph API v21.0). Template message support para simulan ang mga conversation sa loob ng 24-hour messaging window. Media message support para sa mga larawan, dokumento, at audio.

**Signal** — Privacy-focused messaging sa pamamagitan ng self-hosted signal-cli-rest-api bridge. Health monitoring na may graceful degradation. Voice message transcription sa pamamagitan ng Workers AI Whisper.

**Threaded conversations** — Lahat ng messaging channel ay dumadaan sa isang unified conversation view. Message bubbles na may timestamps at direction indicators. Real-time updates sa pamamagitan ng WebSocket.

## Mga Naka-encrypt na Ulat

**Reporter role** — Isang dedikadong role para sa mga taong nagsusumite ng mga tip o ulat. Nakikita ng mga reporter ang simplified interface na may reports at help lamang. Ini-invite sa pamamagitan ng parehong flow tulad ng mga volunteer, na may role selector.

**Mga naka-encrypt na submission** — Ine-encrypt ang report body content gamit ang ECIES bago umalis sa browser. Plaintext na mga pamagat para sa triage, naka-encrypt na nilalaman para sa privacy. Hiwalay na ine-encrypt ang mga file attachment.

**Report workflow** — Mga kategorya para sa pag-organize ng mga ulat. Status tracking (open, claimed, resolved). Maaaring mag-claim ang mga admin ng mga ulat at tumugon na may threaded, naka-encrypt na mga reply.

## Admin Dashboard

**Setup wizard** — Guided multi-step setup sa unang admin login. Piliin kung aling mga channel ang ie-enable (Voice, SMS, WhatsApp, Signal, Reports), i-configure ang mga provider, at itakda ang pangalan ng hotline.

**Getting Started checklist** — Dashboard widget na sumusubaybay sa setup progress: channel configuration, volunteer onboarding, shift creation.

**Real-time monitoring** — Tingnan ang mga active call, queued caller, conversation, at volunteer status nang real time sa pamamagitan ng WebSocket. Agad na nag-a-update ang mga metric.

**Volunteer management** — Magdagdag ng mga volunteer na may generated keypairs, pamahalaan ang mga role (volunteer, admin, reporter), tingnan ang online status. Invite links para sa self-registration na may role selection.

**Audit logging** — Bawat tawag na sinagot, notang ginawa, mensaheng ipinadala, ulat na isinumite, setting na binago, at admin action ay nilo-log. Paginated viewer para sa mga admin.

**Call history** — Searchable, filterable na call history na may date ranges, phone number search, at volunteer assignment. GDPR-compliant na data export.

**In-app help** — FAQ sections, role-specific guides, quick reference cards para sa keyboard shortcuts at security. Accessible mula sa sidebar at command palette.

## Karanasan ng Volunteer

**Command palette** — Pindutin ang Ctrl+K (o Cmd+K sa Mac) para sa instant access sa navigation, search, mabilis na note creation, at theme switching. Ang admin-only commands ay na-filter ayon sa role.

**Real-time notifications** — Ang mga papasok na tawag ay nagti-trigger ng browser ringtone, push notification, at flashing tab title. I-toggle ang bawat notification type nang independent sa settings.

**Volunteer presence** — Nakikita ng mga admin ang real-time na online, offline, at on-break counts. Maaaring mag-toggle ng break switch sa sidebar ang mga volunteer para i-pause ang mga papasok na tawag nang hindi umaalis sa kanilang shift.

**Keyboard shortcuts** — Pindutin ang ? para makita ang lahat ng available na shortcuts. Mag-navigate ng mga page, buksan ang command palette, at magsagawa ng mga karaniwang aksyon nang hindi ginagalaw ang mouse.

**Note draft auto-save** — Awtomatikong sine-save ang mga nota bilang naka-encrypt na drafts sa browser. Nililinis ang mga draft mula sa localStorage sa pag-logout.

**Naka-encrypt na data export** — I-export ang mga nota bilang GDPR-compliant na naka-encrypt na file (.enc) gamit ang key ng volunteer. Ang orihinal na author lang ang makakapag-decrypt ng export.

**Dark/light themes** — Magpalipat-lipat sa dark mode, light mode, o sundin ang system theme. Naka-persist ang preference bawat session.

## Multi-Language at Mobile

**12+ na wika** — Buong UI translations: English, Spanish, Chinese, Tagalog, Vietnamese, Arabic, French, Haitian Creole, Korean, Russian, Hindi, Portuguese, at German. RTL support para sa Arabic.

**Progressive Web App** — Nai-install sa kahit anong device sa pamamagitan ng browser. Kine-cache ng service worker ang app shell para sa offline launch. Push notifications para sa mga papasok na tawag.

**Mobile-first design** — Responsive layout na ginawa para sa mga phone at tablet. Nako-collapse na sidebar, touch-friendly controls, at adaptive layouts.

## Authentication at Key Management

**PIN-protected local key store** — Ine-encrypt ang iyong secret key gamit ang 6-digit PIN sa pamamagitan ng PBKDF2 (600,000 iterations) + XChaCha20-Poly1305. Ang raw key ay hindi kailanman dumadaan sa sessionStorage o anumang browser API — nabubuhay lamang ito sa isang in-memory closure, zine-zero sa pag-lock.

**Auto-lock** — Awtomatikong nagla-lock ang key manager pagkatapos ng idle timeout o kapag naka-hide ang browser tab. Muling ilagay ang iyong PIN para i-unlock. Nako-configure ang idle duration.

**Device linking** — Mag-set up ng bagong mga device nang hindi ine-expose ang iyong secret key. Mag-scan ng QR code o maglagay ng maikling provisioning code. Gumagamit ng ephemeral ECDH key exchange para ligtas na ilipat ang iyong encrypted key sa pagitan ng mga device. Nag-e-expire ang mga provisioning room pagkatapos ng 5 minuto.

**Recovery keys** — Sa pag-onboard, makakatanggap ka ng Base32-formatted recovery key (128-bit entropy). Pinapalitan nito ang lumang nsec-display flow. Mandatory na i-download ang encrypted backup bago ka makapagpatuloy.

**Per-note forward secrecy** — Bawat nota ay naka-encrypt gamit ang natatanging random key, pagkatapos ang key na iyon ay bini-wrap sa pamamagitan ng ECIES para sa bawat awtorisadong reader. Ang pag-compromise sa identity key ay hindi magbubunyag ng mga nakaraang nota.

**Nostr keypair auth** — Nagpa-authenticate ang mga volunteer gamit ang Nostr-compatible keypairs (nsec/npub). BIP-340 Schnorr signature verification. Walang mga password, walang email addresses.

**WebAuthn passkeys** — Opsyonal na passkey support para sa multi-device login. Mag-register ng hardware key o biometric, pagkatapos ay mag-sign in nang hindi tina-type ang iyong secret key.

**Session management** — Two-tier access model: "authenticated but locked" (session token lamang) vs "authenticated and unlocked" (nailagay na ang PIN, buong crypto access). 8-hour session tokens na may idle timeout warnings.
