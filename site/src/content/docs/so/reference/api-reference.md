---
title: Tixraaca API
 description: Tixraaca dhammaan REST API endpoint-yada ee soo bandhigaya server-ka Llamenos.
---

Warqaddani waxay sharxaysaa endpoint kasta oo REST API ah ee soo bandhigaya server-ka Llamenos. Dhammaan endpoint-yada waxay leeyihiin horey `/api`. Codsiyada iyo jawaabaha waxay isticmaalaan JSON haddii aan si kale loo sheegin. Dhammaan timestamps-ku waa strings ISO 8601.

API-gu waa isla mid haddii backend-ku uu ku shaqeeyo **Cloudflare Workers** (iyada oo leh Durable Objects) ama **self-hosted** (Node.js + PostgreSQL). Lixda Durable Objects — Identity, Settings, Records, ShiftManager, CallRouter, iyo Conversation — waxay u qaybsamaan domains-ka API-ga ee lagu sharxayo hoose.

## Xaqiijinta

Llamenos waxay taageertaa laba hab oo xaqiijin ah. Dhammaan endpoint-yada xaqiijinta ayaa u baahan mid ka mid ah kuwan.

### Xaqiijinta saxiixa Schnorr (ugu weyn)

Codsiga kasta oo xaqiijinta leh waxay wadataa token self-signed BIP-340 Schnorr oo la xidhan habka HTTP iyo waddada.

**Qaabka madaxa:**

```
Authorization: Bearer {"pubkey":"<64_hex>","timestamp":<ms>,"token":"<128_hex>"}
```

**Dhisida token-ka:**

1. Dhiso fariinta: `llamenos:auth:<pubkey>:<timestamp_ms>:<METHOD>:<path>`
2. Hash iyada oo la isticmaalayo SHA-256
3. Saxiix hash-ka iyada oo la isticmaalayo BIP-340 Schnorr iyada oo la isticmaalayo fure sirtaada secp256k1
4. U codee sida inline JSON iyada oo leh fields-ka `pubkey`, `timestamp`, iyo `token` (saxiixa hex)

**Xeerarka xaqiijinta:**

- Token cusub: `|now() - timestamp| <= 300,000 ms` (5 daqiiqo)
- Saxiixa waxaa la xaqiijiyaa iyada oo loo marayo hash-ka fariinta la dhisay
- Pubkey-ga waxaa loo eegaa kaydka aqoonta si loo helo diiwaanka isticmaalaha

### Xaqiijinta token-ka xilliga (WebAuthn)

Kadib xafladda xaqiijinta WebAuthn, server-ku wuxuu bixiyaa token xilliga ah oo 256-bit ah oo shaqeynaya 8 saacadood.

```
Authorization: Session <token_hex>
```

Server-ku wuxuu hubiyaa `Session` auth marka hore. Haddii madaxu uu ku bilaabmo `Session `, xaqiijinta Schnorr lama isku dayo, iyo sidaas oo kale.

---

## Endpoint-yada dadweynaha

Endpoint-yadan waxay u baahan yihiin xaqiijin ma jirto.

### Hubinta caafimaadka

```
GET /api/health
```

**Jawaab:**

```json
{ "status": "ok" }
```

### Configuration

```
GET /api/config
```

Waxay soo celisaa config-ka hub-ka dadweynaha, kanaalada furan, iyo aqoonta server-ka.

**Jawaab:**

```json
{
  "hotlineName": "Hotline",
  "hotlineNumber": "+1234567890",
  "channels": {
    "voice": true, "sms": false, "whatsapp": false,
    "signal": false, "rcs": false, "reports": true
  },
  "setupCompleted": true,
  "demoMode": false,
  "demoResetSchedule": null,
  "needsBootstrap": false,
  "hubs": [{ "id": "...", "name": "...", "slug": "..." }],
  "defaultHubId": "...",
  "serverWebSocketPubkey": "hex_64",
  "WebSocketRelayUrl": "wss://..."
}
```

### Xaqiijinta dhismaha

```
GET /api/config/verify
```

Waxay soo celisaa metadata-ga dhismaha si loo xaqiijiyo in dhismuhu la soo celceli karo.

**Jawaab:**

```json
{
  "version": "1.0.0",
  "commit": "abc1234",
  "buildTime": "2024-01-01T00:00:00Z",
  "verificationUrl": "https://github.com/...",
  "trustAnchor": "GitHub Release checksums + SLSA provenance"
}
```

### Codka IVR

```
GET /api/ivr-audio/:promptType/:language
```

Waxay soo celisaa faylasha codka ee bixiyeyaasha telephony ay soo qaadaan inta lagu jiro calls-ka.

- `promptType`: `[a-z_-]+`
- `language`: `[a-z]{2,5}(-[A-Z]{2})?`
- **Jawaab:** `audio/wav` binary

### Doorashooyinka fariimaha

Endpoint-yada dadweynaha ee la xaqiijiyay token-ka ee maareynta doorashooyinka qofka isdiiwaangeliyay.

```
GET  /api/messaging/preferences?token=<hmac_token>
PATCH /api/messaging/preferences?token=<hmac_token>
```

**Jirka PATCH:**

```json
{ "status": "active", "language": "es" }
```

---

## Endpoint-yada xaqiijinta

### Soo gal

```
POST /api/auth/login
```

**Jirka:**

```json
{ "pubkey": "hex64", "timestamp": 1709318400000, "token": "hex128" }
```

**Jawaab:**

```json
{ "ok": true, "roles": ["role-super-admin"] }
```

Xaddidan: 10 isku day per IP. Waxay soo celisaa `401` marka aqoonsigu aan sax ahayn.

### Bootstrap (admin-ka ugu horreeya)

```
POST /api/auth/bootstrap
```

Diiwaangelinta admin-ka ugu horreeya. Waxay ku guuldaraysataa `403` haddii admin horey u jiro.

**Jirka:** Isla sida login.
**Jawaab:** Isla sida login.
Xaddidan: 5 isku day per IP.

### Hel isticmaalaha hadda

```
GET /api/auth/me
```

**Auth:** Loo baahan yahay

**Jawaab:**

```json
{
  "pubkey": "hex64",
  "roles": ["role-super-admin"],
  "permissions": ["*"],
  "primaryRole": { "id": "role-super-admin", "name": "Super Admin", "slug": "super-admin" },
  "name": "Admin",
  "transcriptionEnabled": true,
  "spokenLanguages": ["en", "es"],
  "uiLanguage": "en",
  "profileCompleted": true,
  "onBreak": false,
  "callPreference": "phone",
  "webauthnRequired": false,
  "webauthnRegistered": true,
  "adminPubkey": "hex64",
  "adminDecryptionPubkey": "hex64"
}
```

### Ka bax

```
POST /api/auth/me/logout
```

**Auth:** Loo baahan yahay. Haddii la isticmaalayo Session auth, token-ka waa la joojiyaa dhinaca server-ka.

### Cusbooneysiinta profile-ka

```
PATCH /api/auth/me/profile
```

**Auth:** Loo baahan yahay

**Jirka:**

```json
{
  "name": "string",
  "phone": "+1234567890",
  "spokenLanguages": ["en", "es"],
  "uiLanguage": "en",
  "profileCompleted": true,
  "callPreference": "phone"
}
```

Dhammaan fields-ka waa ikhtiyaar. `callPreference` waxay aqbashaa `"phone"`, `"browser"`, ama `"both"`.

### Cusbooneysiinta diyaar garowga

```
PATCH /api/auth/me/availability
```

**Auth:** Loo baahan yahay

**Jirka:**

```json
{ "onBreak": true }
```

### Cusbooneysiinta doorashada qoraalka

```
PATCH /api/auth/me/transcription
```

**Auth:** Loo baahan yahay

**Jirka:**

```json
{ "enabled": false }
```

Waxay soo celisaa `403` haddii ka tagida aan la oggolyn goobaha maamulka.

---

## WebAuthn

### Dhaqanka soo galitaanka

```
POST /api/webauthn/login/options
```

**Auth:** Ma jirto. Waxay soo celisaa `publicKeyCredentialRequestOptions` iyada oo leh `challengeId`.

```
POST /api/webauthn/login/verify
```

**Auth:** Ma jirto

**Jirka:**

```json
{ "assertion": {}, "challengeId": "uuid" }
```

**Jawaab:**

```json
{ "token": "hex64", "pubkey": "hex64" }
```

### Dhaqanka diiwaangelinta

```
POST /api/webauthn/register/options
```

**Auth:** Loo baahan yahay

**Jirka:**

```json
{ "label": "My Phone" }
```

```
POST /api/webauthn/register/verify
```

**Auth:** Loo baahan yahay

**Jirka:**

```json
{ "attestation": {}, "label": "My Phone", "challengeId": "uuid" }
```

### Maareynta aqoonsiga

```
GET /api/webauthn/credentials
```

**Auth:** Loo baahan yahay. Waxay soo celisaa dhammaan aqoonsiyada la diiwaangeliyay.

```
DELETE /api/webauthn/credentials/:credId
```

**Auth:** Loo baahan yahay. Waxay ka saartaa aqoonsi.

---

## Martiqaadka

### Dadweynaha

```
GET /api/invites/validate/:code
```

Xaddidan: 5 isku day per IP.

**Jawaab:**

```json
{ "valid": true, "name": "...", "expiresAt": "..." }
```

```
POST /api/invites/redeem
```

**Jirka:**

```json
{ "code": "...", "pubkey": "hex64", "timestamp": 1709318400000, "token": "hex128" }
```

Xaddidan: 5 isku day per IP.

### Xaqiijinta

```
GET /api/invites
```

**Ogolaanshaha:** `invites:read`

```
POST /api/invites
```

**Ogolaanshaha:** `invites:create`

**Jirka:**

```json
{ "name": "Jane Doe", "phone": "+1234567890", "roleIds": ["role-volunteer"] }
```

```
DELETE /api/invites/:code
```

**Ogolaanshaha:** `invites:revoke`

---

## Isbitaallada

Dhammaan endpoint-yada isbitaallada waxay u baahan yihiin `volunteers:read` sida ogolaanshaha aasaasiga ah.

```
GET /api/volunteers
```

**Ogolaanshaha:** `volunteers:read`

```
POST /api/volunteers
```

**Ogolaanshaha:** `volunteers:create`

**Jirka:**

```json
{ "name": "string", "phone": "string", "roleIds": ["string"], "pubkey": "string" }
```

```
PATCH /api/volunteers/:targetPubkey
```

**Ogolaanshaha:** `volunteers:update`

**Jirka:** Fields-ka isbitaalka ee qaybta ka mid ah (`name`, `phone`, `roles`, `active`, iwm.)

```
DELETE /api/volunteers/:targetPubkey
```

**Ogolaanshaha:** `volunteers:delete`

---

## Shift-yada

```
GET /api/shifts/my-status
```

**Auth:** Loo baahan yahay (door kasta). Waxay soo celisaa xaaladda shift-ka isticmaalaha hadda.

```
GET /api/shifts
```

**Ogolaanshaha:** `shifts:read`

```
POST /api/shifts
```

**Ogolaanshaha:** `shifts:create`

**Jirka:**

```json
{
  "name": "Morning Shift",
  "startTime": "09:00",
  "endTime": "17:00",
  "days": [1, 2, 3, 4, 5],
  "volunteerPubkeys": ["hex64", "hex64"]
}
```

```
PATCH /api/shifts/:id
```

**Ogolaanshaha:** `shifts:update`

```
DELETE /api/shifts/:id
```

**Ogolaanshaha:** `shifts:delete`

### Kooxda fallback ee dhawaaqaysa

```
GET /api/shifts/fallback
```

**Ogolaanshaha:** `shifts:manage-fallback`

```
PUT /api/shifts/fallback
```

**Ogolaanshaha:** `shifts:manage-fallback`

**Jirka:**

```json
{ "fallbackPubkeys": ["hex64", "hex64"] }
```

Hub-scoped: Dhammaan endpoint-yada shift-yada waxay sidoo kale ku jiraan `/api/hubs/:hubId/shifts/*`.

---

## Xusuusinaha

Dhammaan endpoint-yada xusuusinaha waxay u baahan yihiin `notes:read-own` sida aasaasiga. Clients waa inay fureeraan xusuusinaha kahor inta aanay dirin (eeg [specification-ka protocol-ka](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/PROTOCOL.md) ee qaabka ECIES envelope).

```
GET /api/notes?callId=...&page=1&limit=50
```

**Ogolaanshaha:** `notes:read-own` (keliya taada) ama `notes:read-all` (dhammaan xusuusinaha)

**Jawaab:**

```json
{ "notes": [], "total": 0 }
```

```
POST /api/notes
```

**Ogolaanshaha:** `notes:create`

**Jirka:**

```json
{
  "callId": "uuid",
  "encryptedContent": "hex",
  "authorEnvelope": { "wrappedKey": "hex", "ephemeralPubkey": "hex" },
  "adminEnvelopes": [{ "pubkey": "hex64", "wrappedKey": "hex", "ephemeralPubkey": "hex" }]
}
```

```
PATCH /api/notes/:id
```

**Ogolaanshaha:** `notes:update-own`

**Jirka:** Isla qaabka POST (iyada oo la cusbooneysiiyay encrypted content iyo envelopes).

Hub-scoped: `/api/hubs/:hubId/notes/*`

---

## Calls-ka

```
GET /api/calls/active
```

**Ogolaanshaha:** `calls:read-active` (macluumaadka qofka wiciyay la qariyay) ama `calls:read-active-full`

```
GET /api/calls/today-count
```

**Ogolaanshaha:** `calls:read-active`

```
GET /api/calls/presence
```

**Ogolaanshaha:** `calls:read-presence`. Waxay soo celisaa xaaladda online/buzy ee isbitaallada.

```
GET /api/calls/history?page=1&limit=50&search=&dateFrom=&dateTo=
```

**Ogolaanshaha:** `calls:read-history`

```
POST /api/calls/:callId/answer
```

**Ogolaanshaha:** `calls:answer`. Waxay soo celisaa `409` haddii call-kii horey loo jawaabay.

```
POST /api/calls/:callId/hangup
```

**Ogolaanshaha:** `calls:answer`. Waxay soo celisaa `403` haddii aanu ahayn call-kaaga.

```
POST /api/calls/:callId/spam
```

**Ogolaanshaha:** `calls:answer`. Waxay calaamadeysaa call-ka sida spam.

```
GET /api/calls/:callId/recording
```

**Ogolaanshaha:** `calls:read-recording` ama isbitaalkii jawaabay.

**Jawaab:** `audio/wav` binary iyada oo leh `Cache-Control: private, no-store`.

```
GET /api/calls/debug
```

**Ogolaanshaha:** `calls:debug`. Waxay soo celisaa xaaladda gudaha ee call-ka si loo xaliyo dhibaatooyinka.

Hub-scoped: `/api/hubs/:hubId/calls/*`

---

## Wada hadallada

```
GET /api/conversations?status=&channel=&page=1&limit=50
```

**Ogolaanshaha:** `conversations:read-all` ama `conversations:read-assigned` (taada + sugaya)

**Jawaab:**

```json
{
  "conversations": [],
  "total": 0,
  "assignedCount": 0,
  "waitingCount": 0,
  "claimableChannels": ["sms", "whatsapp"]
}
```

```
GET /api/conversations/stats
```

**Auth:** Loo baahan yahay

**Jawaab:**

```json
{ "total": 0, "active": 0, "waiting": 0, "closed": 0 }
```

```
GET /api/conversations/load
```

**Ogolaanshaha:** `conversations:read-all`. Waxay soo celisaa tirada wada hadallada per isbitaale.

```
GET /api/conversations/:id
```

**Auth:** Loo baahan yahay (la hubiyaa helitaanka per wada hadal).

```
GET /api/conversations/:id/messages?page=1&limit=50
```

**Auth:** Loo baahan yahay (la hubiyaa helitaanka). Waxay soo celisaa fariimaha fureeran.

```
POST /api/conversations/:id/messages
```

**Ogolaanshaha:** `conversations:send` ama `conversations:send-any`

**Jirka:**

```json
{
  "encryptedContent": "hex",
  "readerEnvelopes": [{ "pubkey": "hex64", "wrappedKey": "hex", "ephemeralPubkey": "hex" }],
  "plaintextForSending": "Hello"
}
```

Field-ka `plaintextForSending` waxaa loo isticmaalaa kanaalada dibadda (SMS, WhatsApp, Signal). Server-ku wuxuu diraa fariinta via channel adapter kadibna wuu tuuraa plaintext-ka.

```
PATCH /api/conversations/:id
```

**Ogolaanshaha:** `conversations:update` ama isbitaalka loo xilsaarnay

**Jirka:**

```json
{ "status": "closed", "assignedTo": "hex64" }
```

```
POST /api/conversations/:id/claim
```

**Ogolaanshaha:** `conversations:claim` + gaar kanaal (tusaale, `conversations:claim-sms`)

Hub-scoped: `/api/hubs/:hubId/conversations/*`

---

## Warbixinnada

Warbixinnadu waa nooc gaar ah oo wada hadal ah iyada oo leh `metadata.type = "report"`.

```
GET /api/reports?status=&category=&page=1&limit=50
```

**Ogolaanshaha:** `reports:read-all`, `reports:read-assigned`, ama `reports:read-own`

```
POST /api/reports
```

**Ogolaanshaha:** `reports:create`

**Jirka:**

```json
{
  "title": "Report title",
  "category": "safety",
  "encryptedContent": "hex",
  "readerEnvelopes": [{ "pubkey": "hex64", "wrappedKey": "hex", "ephemeralPubkey": "hex" }]
}
```

```
GET /api/reports/:id
```

**Ogolaanshaha:** `reports:read-all`, `reports:read-assigned`, ama warbixintaada

```
GET /api/reports/:id/messages?page=1&limit=100
```

**Auth:** Loo baahan yahay (la hubiyaa helitaanka)

```
POST /api/reports/:id/messages
```

**Ogolaanshaha:** `reports:send-message`, `reports:send-message-own`, ama kii loo xilsaarnay

**Jirka:**

```json
{
  "encryptedContent": "hex",
  "readerEnvelopes": [],
  "attachmentIds": ["uuid"]
}
```

```
POST /api/reports/:id/assign
```

**Ogolaanshaha:** `reports:assign`

**Jirka:**

```json
{ "assignedTo": "hex64" }
```

```
PATCH /api/reports/:id
```

**Ogolaanshaha:** `reports:update`

```
GET /api/reports/categories
```

**Auth:** Loo baahan yahay

```
GET /api/reports/:id/files
```

**Auth:** Loo baahan yahay (la hubiyaa helitaanka)

Hub-scoped: `/api/hubs/:hubId/reports/*`

---

## Mamnuucyada

```
POST /api/bans
```

**Ogolaanshaha:** `bans:report`

**Jirka:**

```json
{ "phone": "+1234567890", "reason": "Spam caller" }
```

```
GET /api/bans
```

**Ogolaanshaha:** `bans:read`

```
POST /api/bans/bulk
```

**Ogolaanshaha:** `bans:bulk-create`

**Jirka:**

```json
{ "phones": ["+1234567890", "+0987654321"], "reason": "Imported ban list" }
```

```
DELETE /api/bans/:phone
```

**Ogolaanshaha:** `bans:delete`

Parameter-ka `:phone` waa E.164 oo URL-encoded (tusaale, `%2B12125551234`).

Hub-scoped: `/api/hubs/:hubId/bans/*`

---

## Goobaha

### Bixiyaha telephony

```
GET /api/settings/telephony-provider
```

**Ogolaanshaha:** `settings:manage-telephony`

```
PATCH /api/settings/telephony-provider
```

**Ogolaanshaha:** `settings:manage-telephony`

**Jirka:** `TelephonyProviderConfig` (nooca bixiyaha + aqoonsiga)

```
POST /api/settings/telephony-provider/test
```

**Ogolaanshaha:** `settings:manage-telephony`

Waxay tijaabisaa aqoonsiga bixiyaha kahor inta aan la kaydin.

### Fariimaha

```
GET /api/settings/messaging
```

**Ogolaanshaha:** `settings:manage-messaging`

```
PATCH /api/settings/messaging
```

**Ogolaanshaha:** `settings:manage-messaging`

### Yareynta spam-ka

```
GET /api/settings/spam
```

**Ogolaanshaha:** `settings:manage-spam`

```
PATCH /api/settings/spam
```

**Ogolaanshaha:** `settings:manage-spam`

### Goobaha call-ka

```
GET /api/settings/call
```

**Ogolaanshaha:** `settings:manage`

```
PATCH /api/settings/call
```

**Ogolaanshaha:** `settings:manage`

### Luuqadaha IVR

```
GET /api/settings/ivr-languages
```

**Ogolaanshaha:** `settings:manage-ivr`

```
PATCH /api/settings/ivr-languages
```

**Ogolaanshaha:** `settings:manage-ivr`

**Jirka:**

```json
{ "enabledLanguages": ["en", "es", "zh"] }
```

### Codka IVR

```
GET /api/settings/ivr-audio
```

**Ogolaanshaha:** `settings:manage-ivr`

```
PUT /api/settings/ivr-audio/:promptType/:language
```

**Ogolaanshaha:** `settings:manage-ivr`
**Content-Type:** `application/octet-stream` (bytes-ka codka tooska ah)

```
DELETE /api/settings/ivr-audio/:promptType/:language
```

**Ogolaanshaha:** `settings:manage-ivr`

### Qoraalka

```
GET /api/settings/transcription
```

**Auth:** Loo baahan yahay (door kasta)

**Jawaab:**

```json
{ "globalEnabled": true, "allowVolunteerOptOut": false }
```

```
PATCH /api/settings/transcription
```

**Ogolaanshaha:** `settings:manage-transcription`

### Fields-ka gaarka ah

```
GET /api/settings/custom-fields
```

**Auth:** Loo baahan yahay (waxay soo celisaa fields-ka la sifeeyay iyadoo ku saleysan door-ka)

```
PUT /api/settings/custom-fields
```

**Ogolaanshaha:** `settings:manage-fields`

**Jirka:**

```json
{ "fields": [{ "id": "uuid", "name": "severity", "label": "Severity Rating", "type": "select", "required": true, "options": ["low", "medium", "high"], "visibleToVolunteers": true, "editableByVolunteers": true, "context": "call-notes", "order": 0 }] }
```

### Goobaha WebAuthn

```
GET /api/settings/webauthn
```

**Ogolaanshaha:** `settings:manage`

```
PATCH /api/settings/webauthn
```

**Ogolaanshaha:** `settings:manage`

**Jirka:**

```json
{ "requireForAdmins": true, "requireForVolunteers": false }
```

### Doorarka (PBAC)

```
GET /api/settings/roles
```

**Auth:** Loo baahan yahay

```
POST /api/settings/roles
```

**Ogolaanshaha:** `system:manage-roles`

**Jirka:**

```json
{
  "name": "Supervisor",
  "slug": "supervisor",
  "permissions": ["notes:read-all", "calls:read-history"],
  "description": "Can read all notes and call history"
}
```

```
PATCH /api/settings/roles/:id
```

**Ogolaanshaha:** `system:manage-roles`

```
DELETE /api/settings/roles/:id
```

**Ogolaanshaha:** `system:manage-roles`

### Catalog-ga ogolaanshaha

```
GET /api/settings/permissions
```

**Ogolaanshaha:** `system:manage-roles`

Waxay soo celisaa dhammaan ogolaanshaha ee la heli karo oo la kala saaray iyadoo ku saleysan domain.

### Xaaladda setup-ka

```
GET /api/settings/setup
```

**Ogolaanshaha:** `settings:manage`

```
PATCH /api/settings/setup
```

**Ogolaanshaha:** `settings:manage`

---

## Faylasha

### Dhaqanka soo gelinta

Soo gelin qayb-qayb ah oo loogu talagalay lifaaqayaasha faylasha fureeran.

```
POST /api/uploads/init
```

**Ogolaanshaha:** `files:upload`

**Jirka:**

```json
{
  "totalSize": 1048576,
  "totalChunks": 4,
  "conversationId": "uuid",
  "recipientEnvelopes": [],
  "encryptedMetadata": [{ "pubkey": "hex64", "encryptedContent": "hex", "ephemeralPubkey": "hex" }]
}
```

**Jawaab:**

```json
{ "uploadId": "uuid", "totalChunks": 4 }
```

```
PUT /api/uploads/:id/chunks/:chunkIndex
```

**Ogolaanshaha:** `files:upload`
**Content-Type:** `application/octet-stream` (bytes-ka qaybta fureeran)

**Jawaab:**

```json
{ "chunkIndex": 0, "completedChunks": 1, "totalChunks": 4 }
```

```
POST /api/uploads/:id/complete
```

**Ogolaanshaha:** `files:upload`

**Jawaab:**

```json
{ "fileId": "uuid", "status": "complete" }
```

Waxay soo celisaa `400` haddii aan dhammaan qaybaha la soo gelin.

```
GET /api/uploads/:id/status
```

**Ogolaanshaha:** `files:upload`

### Soo dejinta

```
GET /api/files/:id/content
```

**Ogolaanshaha:** `files:download-own` (haddii qofka qaadata) ama `files:download-all`

**Jawaab:** `application/octet-stream` (bytes-ka faylka fureeran)

```
GET /api/files/:id/envelopes
```

**Ogolaanshaha:** `files:download-own` ama `files:download-all`

Isticmaalaha aan adminka ahayn waxay heli doontaa keliya envelope-kooda.

```
GET /api/files/:id/metadata
```

**Ogolaanshaha:** `files:download-own` ama `files:download-all`

```
POST /api/files/:id/share
```

**Ogolaanshaha:** `files:share`

Waxay dib u fureysaa fure faylka qof cusub.

---

## Blasts (faafinta fariimaha)

### Qofka isdiiwaangeliyay

```
GET /api/blasts/subscribers?page=&limit=&tag=&status=
```

**Auth:** Loo baahan yahay

```
DELETE /api/blasts/subscribers/:id
```

**Auth:** Loo baahan yahay

```
GET /api/blasts/subscribers/stats
```

**Auth:** Loo baahan yahay

```
POST /api/blasts/subscribers/import
```

**Auth:** Loo baahan yahay

**Jirka:**

```json
{ "subscribers": [{ "phone": "+1234567890", "tags": ["alerts"] }] }
```

### Blasts

```
GET /api/blasts
```

**Auth:** Loo baahan yahay

```
POST /api/blasts
```

**Auth:** Loo baahan yahay

**Jirka:**

```json
{
  "name": "Emergency alert",
  "content": { "sms": "Alert text", "whatsapp": "Alert text" },
  "targetChannels": ["sms", "whatsapp"],
  "targetTags": ["alerts"],
  "targetLanguages": ["en", "es"]
}
```

```
GET /api/blasts/:id
```

**Auth:** Loo baahan yahay

```
PATCH /api/blasts/:id
```

**Auth:** Loo baahan yahay

```
DELETE /api/blasts/:id
```

**Auth:** Loo baahan yahay

```
POST /api/blasts/:id/send
```

**Auth:** Loo baahan yahay. Waxay diraa blast-ka si toos ah.

```
POST /api/blasts/:id/schedule
```

**Auth:** Loo baahan yahay

**Jirka:**

```json
{ "scheduledAt": "2026-03-01T12:00:00Z" }
```

```
POST /api/blasts/:id/cancel
```

**Auth:** Loo baahan yahay. Waxay joojisaa blast la jadwalay.

### Goobaha blast-ka

```
GET /api/blasts/settings
```

**Auth:** Loo baahan yahay

```
PATCH /api/blasts/settings
```

**Auth:** Loo baahan yahay

Hub-scoped: `/api/hubs/:hubId/blasts/*`

---

## Hub-yada

Maareynta hub-yada multi-tenant.

```
GET /api/hubs
```

**Auth:** Loo baahan yahay (la sifeeyay iyadoo ku saleysan xubinnimada; super admin waxay arki doontaa dhammaan)

```
POST /api/hubs
```

**Ogolaanshaha:** `system:manage-hubs`

**Jirka:**

```json
{ "name": "NYC Hub", "slug": "nyc", "description": "New York City operations", "phoneNumber": "+1234567890" }
```

```
GET /api/hubs/:hubId
```

**Auth:** Loo baahan yahay (la hubiyaa xubinnimada)

```
PATCH /api/hubs/:hubId
```

**Ogolaanshaha:** `system:manage-hubs`

### Xubnaha hub-ka

```
POST /api/hubs/:hubId/members
```

**Ogolaanshaha:** `volunteers:manage-roles`

**Jirka:**

```json
{ "pubkey": "hex64", "roleIds": ["role-volunteer"] }
```

```
DELETE /api/hubs/:hubId/members/:pubkey
```

**Ogolaanshaha:** `volunteers:manage-roles`

### Maareynta fure ee hub-ka

```
GET /api/hubs/:hubId/key
```

**Auth:** Loo baahan yahay (xubin hub). Waxay soo celisaa keliya envelope-ka hub key-ka ECIES-wrapped ee isticmaalaha codsanaya.

```
PUT /api/hubs/:hubId/key
```

**Ogolaanshaha:** `system:manage-hubs`

**Jirka:**

```json
{ "envelopes": [{ "pubkey": "hex64", "wrappedKey": "hex", "ephemeralPubkey": "hex" }] }
```

---

## Setup wizard

```
GET /api/setup/state
```

**Auth:** Loo baahan yahay

```
PATCH /api/setup/state
```

**Ogolaanshaha:** `settings:manage`

```
POST /api/setup/complete
```

**Ogolaanshaha:** `settings:manage`

**Jirka:**

```json
{ "demoMode": false }
```

Waxay sidoo kale abuurtaa hub default haddii aanu jirin.

### Tijaabada kanaalada

```
POST /api/setup/test/signal
```

**Ogolaanshaha:** `settings:manage-messaging`

**Jirka:**

```json
{ "bridgeUrl": "http://signal-cli:8080", "bridgeApiKey": "secret" }
```

```
POST /api/setup/test/whatsapp
```

**Ogolaanshaha:** `settings:manage-messaging`

**Jirka:**

```json
{ "phoneNumberId": "123456", "accessToken": "EAAx..." }
```

---

## Log-ka baaritaanka

```
GET /api/audit?page=1&limit=50&actorPubkey=&eventType=&dateFrom=&dateTo=&search=
```

**Ogolaanshaha:** `audit:read`

**Jawaab:**

```json
{
  "entries": [{
    "id": "uuid",
    "event": "note.created",
    "actorPubkey": "hex64",
    "details": {},
    "createdAt": "2026-01-01T00:00:00Z",
    "previousEntryHash": "hex64",
    "entryHash": "hex64"
  }],
  "total": 100
}
```

Log-ka baaritaanku waxay isticmaashaa hash chain SHA-256 (`previousEntryHash` + `entryHash`) si loo hubiyo inaan la wax beddelin.

Hub-scoped: `/api/hubs/:hubId/audit/*`

---

## WebRTC

```
GET /api/telephony/webrtc-token
```

**Auth:** Loo baahan yahay

Waxay soo celisaa token WebRTC ee gaarka ah ee bixiyaha si loo jawaabo call-ka browser-ka.

**Jawaab:**

```json
{ "token": "string", "provider": "twilio", "identity": "hex64" }
```

Waxay soo celisaa `400` haddii doorashada call-ka ay tahay taleefan keliya.

```
GET /api/telephony/webrtc-status
```

**Auth:** Loo baahan yahay

**Jawaab:**

```json
{ "available": true, "provider": "twilio" }
```

---

## Bixinta qalabka

Loogu talagalay in la isku xiro qalab cusub oo koontada horey u jirta via isbeddelka fudud ee ECDH.

```
POST /api/provision/rooms
```

**Auth:** Ma jirto (qalabka cusub ma leh xaqiijin)

**Jirka:**

```json
{ "ephemeralPubkey": "hex66" }
```

**Jawaab:**

```json
{ "roomId": "uuid", "token": "random_string" }
```

```
GET /api/provision/rooms/:id?token=<token>
```

**Auth:** Ma jirto

**Jawaab:**

```json
{
  "status": "waiting",
  "encryptedNsec": "hex",
  "primaryPubkey": "hex64",
  "ephemeralPubkey": "hex66"
}
```

Xaaladda waxay u gudubtaa: `waiting` -> `ready` -> consumed. Rooms-ka way dhacaan kadib ~5 daqiiqo.

```
POST /api/provision/rooms/:id/payload
```

**Auth:** Loo baahan yahay (qalabka ugu weyn waa inuu xaqiijiyay)

**Jirka:**

```json
{
  "token": "string",
  "encryptedNsec": "hex",
  "primaryPubkey": "hex64"
}
```

---

## Digniinada push (mobile)

```
POST /api/devices/register
```

**Auth:** Loo baahan yahay

**Jirka:**

```json
{
  "platform": "ios",
  "pushToken": "apns_device_token",
  "voipToken": "ios_voip_push_token",
  "wakeKeyEnvelope": { "wrappedKey": "hex", "ephemeralPubkey": "hex" }
}
```

**Jawaab:**

```json
{ "deviceId": "uuid" }
```

Digniinada push waxay isticmaalaan qaab encryption laba-heer ah: wake key (ma loo baahan PIN) ee metadata-ga digniinta, iyo fure aqoonta (PIN loo baahan yahay) ee macluumaadka gaarka ah.

---

## Webhooks-ka telephony

Endpoint-yadan waxaa yeedha bixiyeyaasha telephony, ma aha clients. Codsiga kasta waxaa xaqiijiyaa saxiixa webhook-ka bixiyaha.

```
POST /api/telephony/incoming
POST /api/telephony/language-selected
POST /api/telephony/captcha
POST /api/telephony/volunteer-answer
POST /api/telephony/call-status
POST /api/telephony/wait-music          (sidoo kale GET)
POST /api/telephony/queue-exit
POST /api/telephony/voicemail-complete
POST /api/telephony/call-recording
POST /api/telephony/voicemail-recording
```

Hub routing-ga waxaa lagu sameeyaa query parameter-ka `?hub=<hubId>`.

---

## Webhooks-ka fariimaha

Waxaa yeedha bixiyeyaasha fariimaha. Adapter kasta waxay xaqiijisaa saxiixeeda webhook.

```
GET  /api/messaging/whatsapp/webhook    (xaqiijinta webhook-ka Meta)
GET  /api/messaging/rcs/webhook         (xaqiijinta webhook-ka Google RBM)
POST /api/messaging/:channel/webhook?hub=<hubId>
```

Kanaalada la taageero: `sms`, `whatsapp`, `signal`, `rcs`.

---

## Waddooyinka hub-scoped

Dhammaan waddooyinka soo socda waxay sidoo kale ku heli karaan horey `/api/hubs/:hubId/`, taasoo ay u qaybsanayaan hub gaar ah:

- `/api/hubs/:hubId/shifts/*`
- `/api/hubs/:hubId/bans/*`
- `/api/hubs/:hubId/notes/*`
- `/api/hubs/:hubId/calls/*`
- `/api/hubs/:hubId/audit/*`
- `/api/hubs/:hubId/conversations/*`
- `/api/hubs/:hubId/reports/*`
- `/api/hubs/:hubId/blasts/*`

Marka la isticmaalayo waddooyinka hub-scoped, middleware-ka `hubContext` waxay xallisaa ogolaanshaha hub-ga ee gaarka ah ee isticmaalaha.

---

## Jawaabaha khaladaadka

Dhammaan jawaabaha khaladaadka waxay raacayaan qaabkan:

```json
{ "error": "Fariin khalad oo la fahmi karo" }
```

Koodhayaasha HTTP-ga ee caanka ah:

| Koodh | Macnaha |
|------|---------|
| `400` | Codsiga khaldan (jir qalalan, fields maqan, xaqiijin guuldaraysatay) |
| `401` | Aan la oggolyn (token xaqiijin maqan ama khaldan) |
| `403` | Rejisteysan (xaqiijin sax ah laakiin ogolaansho yar) |
| `404` | Laga helin |
| `409` | Isdiiddi (tusaale, call horey loo jawaabay, hantida horey u jirta) |
| `429` | Codsiyo badan (xaddidan) |
| `500` | Khalad gudaha server-ka |

---

## Tixraaca ogolaanshaha

Ogolaanshaha waxay raacayaan qaabka `domain:action`. Isticmaalayaasha waxay lahaadaan doorar, oo door kasta waxay ku xiran tahay set ogolaanshaha. Ogolaanshaha dhabta ah waa isku darka dhammaan doorarka la bixiyay.

Wildcard `*` waxay bixisaa dhammaan ogolaanshaha. Wildcard domain-ka `domain:*` waxay bixisaa dhammaan ficillada domain-kaas.

| Domain | Ogolaanshaha |
|--------|-------------|
| **calls** | `answer`, `read-active`, `read-active-full`, `read-history`, `read-presence`, `read-recording`, `debug` |
| **notes** | `create`, `read-own`, `read-all`, `read-assigned`, `update-own` |
| **reports** | `create`, `read-own`, `read-all`, `read-assigned`, `assign`, `update`, `send-message-own`, `send-message` |
| **conversations** | `read-assigned`, `read-all`, `claim`, `claim-sms`, `claim-whatsapp`, `claim-signal`, `claim-rcs`, `claim-web`, `claim-any`, `send`, `send-any`, `update` |
| **volunteers** | `read`, `create`, `update`, `delete`, `manage-roles` |
| **shifts** | `read-own`, `read`, `create`, `update`, `delete`, `manage-fallback` |
| **bans** | `report`, `read`, `create`, `bulk-create`, `delete` |
| **invites** | `read`, `create`, `revoke` |
| **settings** | `read`, `manage`, `manage-telephony`, `manage-messaging`, `manage-spam`, `manage-ivr`, `manage-fields`, `manage-transcription` |
| **audit** | `read` |
| **blasts** | `read`, `send`, `manage`, `schedule` |
| **files** | `upload`, `download-own`, `download-all`, `share` |
| **system** | `manage-roles`, `manage-hubs`, `manage-instance` |

### Doorarka default-ka

| Door | Slug | Ogolaanshaha muhiimka ah |
|------|------|-----------------|
| **Super Admin** | `role-super-admin` | `*` (dhammaan ogolaanshaha) |
| **Hub Admin** | `role-hub-admin` | `volunteers:*`, `shifts:*`, `settings:*`, `audit:read`, `bans:*`, `invites:*`, `notes:read-all`, `reports:*`, `conversations:*`, `calls:*`, `blasts:*`, `files:*` |
| **Reviewer** | `role-reviewer` | `notes:read-assigned`, `reports:read-assigned`, `reports:assign`, `reports:update`, `conversations:read-assigned`, `conversations:send`, `files:download-own`, `files:upload` |
| **Volunteer** | `role-volunteer` | `calls:answer`, `calls:read-active`, `notes:create`, `notes:read-own`, `notes:update-own`, `conversations:claim`, `conversations:send`, `conversations:read-assigned`, `bans:report`, `files:upload`, `files:download-own` |
| **Reporter** | `role-reporter` | `reports:create`, `reports:read-own`, `reports:send-message-own`, `files:upload`, `files:download-own` |

---

## Endpoint-yada horumarinta / tijaabada

La heli karaa kaliya deegaannada horumarinta.

```
POST /api/test-reset            (dib u bilaabida oo dhan, waxay u baahan tahay madaxa X-Test-Secret)
POST /api/test-reset-no-admin   (dib u bilaabida admin la'aan)
POST /api/test-reset-records    (dib u bilaabida fudud, ilaaliya aqoonta/goobaha)
```
