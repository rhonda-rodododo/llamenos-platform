# Llámenos — Android Play Store Metadata

## App Identity

**App Name:** Llamenos
*(Note: Play Store does not support accented characters in the app name field. Use "Llamenos"; the in-app display name retains "Llámenos".)*
*(10 characters — well within the 30-character limit)*

**Package Name:** `com.llamenos.app`

**Category:** Productivity

**Tags (optional, up to 5):** crisis response, encrypted, volunteer, hotline, secure

---

## Short Description (80 chars max)

```
Secure crisis response coordination with end-to-end encryption
```
*(62 characters)*

**Alternate short descriptions to A/B test:**
- `E2EE crisis hotline coordination for volunteer organizations` (59 chars)
- `Encrypted hotline coordination for crisis response volunteers` (61 chars)

---

## Full Description (4000 chars max)

```
Llamenos is open-source software for operating secure crisis response hotlines — built for organizations that need to protect caller and volunteer identities against serious adversaries.

END-TO-END ENCRYPTED BY DESIGN

Every note, transcript, report, and message is end-to-end encrypted. The server stores only ciphertext — your hosting provider, your hub administrator, and Llamenos itself cannot read the content of your calls. Encryption happens on your device. Decryption happens only on authenticated volunteer devices.

Each note uses a unique random key with forward secrecy: compromising one note does not compromise others. Keys are wrapped separately for the volunteer and each admin using HPKE (RFC 9180), a modern standard also used in TLS 1.3.

HOW IT WORKS

When someone calls your organization's hotline number, all on-shift volunteers receive simultaneous push notifications. The first volunteer to answer takes the call. Other notifications are cleared automatically.

During the call, volunteers write encrypted notes in real-time. Optional on-device transcription uses AI running entirely on your phone — audio never leaves your device. After the call, notes are sealed and stored as ciphertext on your self-hosted server.

FOR VOLUNTEER TEAMS

• Shift scheduling — admins define recurring shifts and ring groups
• Parallel ringing — all on-shift volunteers ring simultaneously
• Encrypted notes — per-call forward-secret note encryption
• Case management — template-driven reports with custom fields
• Contact records — encrypted caller contact directory
• Multi-hub support — volunteers can belong to multiple hubs and receive calls from all simultaneously

FOR ADMINISTRATORS

• Volunteer management — invite, assign roles, manage shifts
• Real-time ban lists — block abusive callers instantly
• Spam mitigation — rate limiting, voice bot detection
• Audit logs — tamper-evident hash-chained activity log
• Configurable telephony — works with Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth, Asterisk, or FreeSWITCH

PRIVACY FIRST

• Server cannot read encrypted content (zero-knowledge design)
• On-device transcription — audio never transmitted to any server
• No advertising, no tracking, no behavioral profiling
• GDPR-compliant — EU organization, data processing agreements available
• Reproducible builds — verify the published app matches the public source code
• Android Keystore-backed encryption keys — device private keys never leave secure hardware

SELF-HOSTED INFRASTRUCTURE

Your organization runs its own hub. There is no central Llamenos cloud. Your data stays on infrastructure you control, in the jurisdiction you choose. Deploy via Docker Compose on any Linux VPS.

13 LANGUAGES

The app is available in English, Spanish, Chinese, Tagalog, Vietnamese, Arabic, French, Haitian Creole, Korean, Russian, Hindi, Portuguese, and German — designed for multilingual volunteer teams serving diverse communities.

OPEN SOURCE

Llamenos is fully open source under the AGPL-3.0 license. Audit the code, run your own instance, or contribute at github.com/rhonda-rodododo/llamenos-platform.

---

Llamenos is software for organizations that operate crisis response services. The app requires an invitation from an administrator of a self-hosted hub to use. It is not a consumer crisis service — if you are in crisis, please contact your local emergency services or a crisis helpline in your region.
```

*(Character count: approximately 2,900 — well within the 4,000 character limit)*

---

## Store Listing Localization

### Spanish (es-419)

**Short description (80 chars max):**
```
Coordinación segura de respuesta a crisis con cifrado de extremo a extremo
```
*(74 characters)*

**Full description:**
```
Llamenos es software de código abierto para operar líneas de ayuda en crisis de forma segura — diseñado para organizaciones que necesitan proteger la identidad de las personas que llaman y de los voluntarios contra adversarios serios.

CIFRADO DE EXTREMO A EXTREMO POR DISEÑO

Cada nota, transcripción, informe y mensaje está cifrado de extremo a extremo. El servidor almacena solo texto cifrado — su proveedor de alojamiento, el administrador de su hub y Llamenos en sí no pueden leer el contenido de sus llamadas.

CÓMO FUNCIONA

Cuando alguien llama al número de su organización, todos los voluntarios de turno reciben notificaciones simultáneas. El primer voluntario en responder toma la llamada. Las demás notificaciones se eliminan automáticamente.

PARA EQUIPOS DE VOLUNTARIOS

• Programación de turnos — los administradores definen turnos recurrentes
• Llamadas en paralelo — todos los voluntarios de turno suenan simultáneamente
• Notas cifradas — cifrado de notas con secreto hacia adelante por llamada
• Gestión de casos — informes basados en plantillas con campos personalizados
• Soporte multi-hub — los voluntarios pueden pertenecer a múltiples hubs

PARA ADMINISTRADORES

• Gestión de voluntarios — invitar, asignar roles, gestionar turnos
• Listas de bloqueo en tiempo real — bloquear llamadas abusivas al instante
• Registros de auditoría — registro de actividad en cadena de hash a prueba de manipulaciones

INFRAESTRUCTURA AUTOALOJADA

Su organización gestiona su propio hub. No existe una nube central de Llamenos. Sus datos permanecen en la infraestructura que usted controla.

Código abierto bajo licencia AGPL-3.0.

---

Llamenos es software para organizaciones que operan servicios de respuesta a crisis. La aplicación requiere una invitación de un administrador de un hub autoalojado.
```

---

### French (fr-FR)

**Short description (80 chars max):**
```
Coordination sécurisée de réponse aux crises avec chiffrement de bout en bout
```
*(78 characters)*

**Full description:**
```
Llamenos est un logiciel open source pour opérer des lignes d'assistance en crise de manière sécurisée — conçu pour les organisations qui doivent protéger l'identité des appelants et des bénévoles contre des adversaires sérieux.

CHIFFREMENT DE BOUT EN BOUT PAR CONCEPTION

Chaque note, transcription, rapport et message est chiffré de bout en bout. Le serveur ne stocke que du texte chiffré — votre hébergeur, l'administrateur de votre hub et Llamenos lui-même ne peuvent pas lire le contenu de vos appels.

COMMENT ÇA FONCTIONNE

Lorsque quelqu'un appelle le numéro de votre organisation, tous les bénévoles en service reçoivent des notifications simultanées. Le premier bénévole à répondre prend l'appel. Les autres notifications sont effacées automatiquement.

POUR LES ÉQUIPES DE BÉNÉVOLES

• Planification des permanences — les administrateurs définissent des permanences récurrentes
• Appels en parallèle — tous les bénévoles en service sonnent simultanément
• Notes chiffrées — chiffrement des notes avec confidentialité persistante par appel
• Gestion des cas — rapports basés sur des modèles avec champs personnalisés
• Support multi-hub — les bénévoles peuvent appartenir à plusieurs hubs

POUR LES ADMINISTRATEURS

• Gestion des bénévoles — inviter, attribuer des rôles, gérer les permanences
• Listes de blocage en temps réel — bloquer les appelants abusifs instantanément
• Journaux d'audit — journal d'activité chaîné par hachage infalsifiable

INFRASTRUCTURE AUTO-HÉBERGÉE

Votre organisation gère son propre hub. Il n'existe pas de cloud Llamenos central. Vos données restent sur l'infrastructure que vous contrôlez.

Logiciel libre sous licence AGPL-3.0.

---

Llamenos est un logiciel destiné aux organisations qui opèrent des services de réponse aux crises. L'application nécessite une invitation d'un administrateur d'un hub auto-hébergé.
```

---

## Content Rating

**Rating system:** IARC (International Age Rating Coalition)

| Question | Answer |
|----------|--------|
| Does this app contain violence? | No |
| Does this app contain sexual content? | No |
| Does this app contain profanity or crude humor? | No |
| Does this app reference or depict controlled substances? | No |
| Does this app allow users to interact? | Yes — text messaging between volunteers and admins (not with callers) |
| Does this app share users' location with other users? | No |
| Does this app contain user-generated content visible to others? | No — all notes are E2EE, only accessible to authorized admins and the authoring volunteer |
| Is this app designed for children? | No |

**Expected rating:** Everyone / PEGI 3

---

## Graphic Assets

### App Icon
- **Size:** 512 × 512 px
- **Format:** PNG, no alpha channel (transparency not allowed)
- **Requirements:** No rounded corners (Google applies rounding automatically)

### Feature Graphic (required)
- **Size:** 1024 × 500 px
- **Format:** PNG or JPG
- **Purpose:** Displayed in the Play Store listing header and promotional placements
- **Content guidance:** Should show app name + tagline. Suggested: dark background, app logo centered, tagline "Secure crisis response" or "End-to-end encrypted hotline coordination"

### Screenshots

**Phone screenshots (required — min 2, max 8):**
- **Aspect ratio:** 16:9 or 9:16 (portrait or landscape)
- **Minimum dimension:** 320 px per side
- **Maximum dimension:** 3840 px per side
- **Format:** PNG or JPG
- **Recommended:** 1080 × 1920 px (portrait, 9:16)

Recommended screenshot sequence:
1. Home / dashboard — showing on-shift status and incoming call state
2. Incoming call notification — Android notification or in-app call answer screen
3. Note-taking screen — during or after a call, showing the encrypted note editor
4. Case report form — template-driven fields
5. Shift schedule — shift management interface
6. Admin panel — volunteer list or ban management
7. Settings / encryption status — showing security settings or key info

Screenshot overlay text suggestions:
- "End-to-end encrypted"
- "Server cannot read your notes"
- "Audio never leaves your device" (transcription screen)
- "Self-hosted — your data, your infrastructure"

**7-inch tablet screenshots (optional):**
- Same aspect ratio and dimension rules as phone
- Recommended: 1200 × 1920 px

**10-inch tablet screenshots (optional):**
- Same aspect ratio and dimension rules as phone
- Recommended: 1920 × 1200 px (landscape) or 1200 × 1920 px (portrait)

---

## Store Listing Contact Details

**Email:** `support@llamenos-platform.com`
**Website:** `https://llamenos-platform.com`
**Privacy policy URL:** `https://llamenos-platform.com/privacy`

---

## What's New (first release)

```
Initial release of Llamenos for Android.

• End-to-end encrypted call notes and reports
• Shift management and parallel call routing
• Template-driven case management
• On-device transcription (audio never leaves your device)
• Support for 13 languages
• Android Keystore-backed encryption keys
• Self-hosted — your data stays on your infrastructure
```

---

## Notes for Legal Review Before Submission

- [ ] Confirm privacy policy URL is live and accessible: `https://llamenos-platform.com/privacy`
- [ ] Confirm support URL is live: `https://llamenos-platform.com/support`
- [ ] Confirm "Llamenos" is acceptable as app name (no trademark conflicts)
- [ ] Confirm contact email addresses (`support@`, `privacy@`, `legal@`) are active
- [ ] Confirm test hub URL and credentials are ready for Google review
- [ ] Review export compliance: HPKE / AES-256-GCM encryption — standard encryption algorithms, not proprietary; qualifies for EAR encryption exemption (ENC unrestricted)
- [ ] Confirm AGPL-3.0 license acknowledgment in Settings → About is present and links to license text
- [ ] Verify app does not target minors (ensure `targetSdkVersion` age settings are correct in Play Console)
