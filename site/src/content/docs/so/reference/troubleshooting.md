---
title: Xalinta dhibaatooyinka
 description: Xalal loogu talagalay dhibaatooyinka caanka ah ee la xiriira soo saarista, app-ka desktop-ka, app-ka mobile-ka, telephony, iyo ficillada cryptographic-ka.
---

Halkan waxaa ku qoran dhibaatooyinka caanka ah iyo xalalkooda dhammaan hababka soo saarista Llamenos iyo platform-yada.

## Dhibaatooyinka soo saarista Docker

### Containers-ka ma bilaabmaan

**Doorsoomeyo deegaan maqan:**

Docker Compose waxay xaqiijisaa dhammaan adeegyada marka la bilaabo, xitaa kuwa profile-ka leh. Haddii aad aragto khaladaad ku saabsan doorsoomeyo maqan, hubi in faylkaaga `.env` uu leeyahay dhammaan qiimayaasha loo baahan yahay:

```bash
# Loo baahan yahay .env Docker Compose
PG_PASSWORD=your_postgres_password
STORAGE_ACCESS_KEY=your_rustfs_access_key
STORAGE_SECRET_KEY=your_rustfs_secret_key
HMAC_SECRET=your_hmac_secret
ARI_PASSWORD=your_ari_password       # Loo baahan yahay xitaa haddii aan la isticmaalin Asterisk
BRIDGE_SECRET=your_bridge_secret     # Loo baahan yahay xitaa haddii aan la isticmaalin Asterisk
ADMIN_PUBKEY=your_admin_hex_pubkey
```

Xitaa haddii aadan isticmaalin bridge-ka Asterisk, Docker Compose waxay xaqiijisaa qeexidda adeegga oo waxay u baahan tahay in `ARI_PASSWORD` iyo `BRIDGE_SECRET` la dejiyo.

**Isdiiddiyada alaabada:**

Haddii alaabadu horey u isticmaashan:

```bash
# Hubi waxa isticmaalaya alaabada 8787 (Worker)
sudo lsof -i :8787

# Hubi waxa isticmaalaya alaabada 5432 (PostgreSQL)
sudo lsof -i :5432

# Hubi waxa isticmaalaya alaabada 9000 (RustFS)
sudo lsof -i :9000
```

Jooji habka isdiidda ama beddel alaabada `docker-compose.yml`.

### Dhibaatooyinka isku xirka xogta

Haddii app-ku uu ku xirmi waayo PostgreSQL:

- Xaqiiji in `PG_PASSWORD` ee `.env` uu waafaqsan yahay kan la isticmaalay marka container-ka ugu horreeyay la abuuray
- Hubi in container-ka PostgreSQL uu caafimaad qaba: `docker compose ps`
- Haddii furaha la beddelay, waxaad u baahan tahay inaad ka saarto volume-ka oo aad dib u abuurto: `docker compose down -v && docker compose up -d`

### Strfry relay ma isku xirayo

WebSocket relay (WebSocket relay) waa adeeg aasaasi ah, ma aha ikhtiyaar. Haddii relay-ka aanu shaqeyn:

```bash
# Hubi xaaladda relay-ga
docker compose logs WebSocket relay

# Dib u bilaab relay-ga
docker compose restart WebSocket relay
```

Haddii relay-ka uu ku guuldaraysto inuu bilaabo, hubi isdiidda alaabada 7777 ama ogolaanshaha yar ee directory-ga xogta.

### Khaladaadka kaydinta RustFS / S3

- Xaqiiji in `STORAGE_ACCESS_KEY` iyo `STORAGE_SECRET_KEY` ay yihiin kuwa saxda ah
- Hubi in container-ka RustFS uu shaqeynayo: `docker compose ps rustfs`
- Hel console-ka RustFS ee `http://localhost:9001` si aad u xaqiijiso abuurista bucket-ka

## Dhibaatooyinka soo saarista Cloudflare

### Khaladaadka Durable Object

**"Durable Object laga helin" ama khaladaadka binding-ka:**

- Ordi `bun run deploy` (marnaba `wrangler deploy` si toos ah) si aad u hubiso in DO bindings-ka ay yihiin kuwa saxda ah
- Hubi `wrangler.jsonc` ee magacyada saxda ah ee class-ka DO iyo bindings-ka
- Kadib marka la daroo DO cusub, waa inaad deploy si aad u hesho

**Xadidaadyada kaydinta DO:**

Cloudflare Durable Objects waxay leeyihiin xadidaad 128 KB per key-value pair. Haddii aad aragto khaladaad kaydinta:

- Hubi in macluumaadka xusuusinaha uusan ka badan xadidaadka (xusuusin aad u weyn iyada oo leh lifaaqo badan)
- Hubi in ECIES envelopes aysan la duubin

### Khaladaadka Worker (jawaabaha 500)

Hubi log-yada Worker:

```bash
bunx wrangler tail
```

Sababaha caanka ah:
- Sirta maqan (isticmaal `bunx wrangler secret list` si aad u xaqiijiso)
- Qaabka khaldan ee `ADMIN_PUBKEY` (waa inuu ahaadaa 64 xaraf hex, ma jiro horey `npub`)
- Xaddidaadda tier-ka bilaasha (1,000 codsida/daqiiqo tier-ka Workers Free)

### Soo saarista waxay ku guuldaraysataa khaladaadka "Pages deploy"

Marnaba ha oran `wrangler pages deploy` ama `wrangler deploy` si toos ah. Mar kasta isticmaal scripts-ka `package.json` ee root-ka:

```bash
bun run deploy          # Soo saar wax kasta (app + goobka marketing-ka)
bun run deploy:demo     # Soo saar app Worker keliya
bun run deploy:site     # Soo saar goobka marketing-ka keliya
```

Ordi `wrangler pages deploy dist` directory-ga khaldan waxay soo saartaa Vite app build ee Pages halkii Astro site, jebinaysa goobka marketing-ka khaladaadka 404.

## Dhibaatooyinka app-ka desktop-ka

### Cusbooneysiinta otomaatig ah ma shaqeynayso

App-ka desktop-ku waxay isticmaashaa Tauri updater si ay u hubiyaan version-yada cusub. Haddii cusbooneysiinta aan la helin:

- Hubi isku xirkaaga internet-ka
- Xaqiiji in endpoint-ka cusbooneysiinta uu la mid yahay: `https://github.com/rhonda-rodododo/llamenos-platform/releases/latest/download/latest.json`
- Linux, AppImage cusbooneysiinta otomaatig ah waxay u baahan tahay in faylu leeyahay ogolaansho qoritaan directory-ga
- macOS, app-ku waa inuu ku jiraa `/Applications` (ma aha inuu ka shaqeeyo DMG si toos ah)

Si aad u cusbooneysiiso gacan, soo deji version-ka ugu dambeeya ee [Bogga Soo Dejinta](/download).

### Fureynta PIN-ka ma shaqeynayso

Haddii PIN-kaaga la diido app-ka desktop-ka:

- Hubi inaad gelinayso PIN-ka saxda ah (ma jiro soo celcelin "illaa PIN-ka")
- PIN-yadu waxay xaddidan yihiin haddii ay leeyihiin xarfayaal
- Haddii aad illoobtay PIN-kaaga, waa inaad dib u gelisaa nsec-gaaga si aad u dejiso mid cusub. Xusuusinahaaga fureeran way sii wadaagaan waayo waxay ku xiran yihiin aqoontaada, ma aha PIN-kaaga
- Tauri Stronghold waxay fureysaa nsec-gaaga iyada oo la isticmaalayo fure laga soo saaro PIN (PBKDF2). PIN khaldan waxay soo saartaa fureynta aan saxnayn, ma aha fariin khalad — app-ku waxay tan garto iyada oo la xaqiijiyo public key-ga laga soo saaro

### Soo celinta furaha

Haddii aad lumisay helitaanka qalabkaaga:

1. Isticmaal nsec-gaaga (oo aad u baahan tahay inaad kaydsato password manager) si aad u soo gasho qalab cusub
2. Haddii aad diiwaangelisay passkey WebAuthn, waxaad isticmaali kartaa qalabka cusub halkii
3. Xusuusinahaaga fureeran waxay ku kaydsan yihiin dhinaca server-ka — marka aad soo gasho iyada oo la isticmaalayo isla aqoonta, waxaad furi kartaa
4. Haddii aad lumisay nsec-gaaga iyo passkey-gaaga, la xiriir admin-kaaga. Ma soo celin karaan nsec-gaaga, laakiin waxay abuuri karaan aqoonta cusub. Xusuusinaha loo fureeyay aqoontaada hore ma akhriyi doontid

### App-ku ma bilaabmo (daaqad madhan)

- Hubi in nidaamkaagu uu buuxiyo shuruudaha ugu yar (eeg [Soo Dejinta](/download))
- Linux, hubi in WebKitGTK uu ku rakiban yahay: `sudo apt install libwebkit2gtk-4.1-0` (Debian/Ubuntu) ama mid la mid ah
- Isku day inaad ka bilaabto terminal-ka si aad u aragto fariimaha khaladaadka: `./llamenos` (AppImage) ama hubi log-yada nidaamka
- Haddii aad isticmaalayo Wayland, isku day `GDK_BACKEND=x11` sida xal ugu dambeya

### Isdiidda single instance

Llamenos waxay xakameysaa habka single-instance. Haddii app-ku sheego inuu horey u shaqeynayo laakiin aadan helin daaqadda:

- Hubi hababka dambe: `ps aux | grep llamenos`
- Dil hababka aan la rabin: `pkill llamenos`
- Linux, hubi fayl quful oo jira oo ka saar haddii app-ku dhacay

## Dhibaatooyinka app-ka mobile-ka

### Khaladaadka provisioning-ka

Eeg [Hagga Mobile-ka](/docs/mobile-guide#troubleshooting-mobile-issues) si aad u hesho faahfaahin oo ku saabsan xalinta dhibaatooyinka provisioning-ka.

Sababaha caanka ah:
- QR code dhacay (tokens-ka way dhacaan kadib 5 daqiiqo)
- Isku xir internet ma jiro labada qalab
- App-ka desktop iyo app-ka mobile waxay ku shaqeeyaan version-yada protocol ee kala duwan

### Digniinada push ma imaanayaan

- Xaqiiji in ogolaanshaha digniinta la bixiyay goobaha OS-ka
- Android, hubi in optimization-ka battery uusan dilin app-ka dambe
- iOS, xaqiiji in Background App Refresh uu furan yahay Llamenos
- Hubi inaad leedahay shift firfircoon oo aadan ku jirin nasasho

## Dhibaatooyinka telephony-ga

### Tafatirka webhook-ka Twilio

Haddii calls-ka aanu u gudbin isbitaallada:

1. Xaqiiji in URL-yadaaga webhook ay yihiin kuwa saxda ah console-ka Twilio:
   - Voice webhook: `https://your-worker.your-domain.com/telephony/incoming` (POST)
   - Status callback: `https://your-worker.your-domain.com/telephony/status` (POST)
2. Hubi in aqoonsiga Twilio ee goobahaaga uu waafaqsan yahay console-ka:
   - Account SID
   - Auth Token
   - Lambarka taleefanka (waa inuu leeyahay koodhka dalka, tusaale, `+1234567890`)
3. Hubi debugger-ka Twilio khaladaadka: [twilio.com/console/debugger](https://www.twilio.com/console/debugger)

### Tafatirka lambarka

- Lambarka taleefanku waa inuu ahaadaa mid Twilio leedahay ama caller ID la xaqiijiyay
- Horumarinta goobta, isticmaal Cloudflare Tunnel ama ngrok si aad u soo bandhigto Worker-kaaga gudaha Twilio
- Xaqiiji in tafatirka Voice-ga lambarku uu u jeediyo URL-kaaga webhook, ma aha TwiML Bin-ka default-ka

### Calls-ka ay isku xiraan laakiin ma jiro cod

- Hubi in server-ka media ee bixiyaha telephony uu gaari karo taleefanka isbitaalka
- Hubi dhibaatooyinka NAT/firewall ee xiraya traffic-ka RTP
- Haddii aad isticmaalayo WebRTC, xaqiiji in server-ka STUN/TURN uu la habeeyay
- Qaar ka mid ah VPN-yadu waxay xiraan traffic-ka VoIP — isku day iyada oo VPN la'aan

### Fariimaha SMS/WhatsApp ma imaanayaan

- Xaqiiji in URL-yada webhook-ka fariimaha ay la habeysan yihiin console-ka bixiyahaaga
- WhatsApp, hubi in token-ka xaqiijinta webhook-ka Meta uu waafaqsan yahay goobahaaga
- Hubi in kanaalka fariimaha uu furan yahay **Admin Settings > Channels**
- Signal, xaqiiji in bridge-ka signal-cli uu shaqeynayo oo uu u gudbiyo webhook-kaaga

## Khaladaadka crypto-ga

### Khaladaadka iswaafaqida furaha

**"Fureynta ma guulaysan" ama "Fure khaldan" marka la furayo xusuusinaha:**

- Tani macnaheedu waa xusuusintu waxay loo fureeyay aqoonta kale ee kan aad hadda ku jirto
- Xaqiiji inaad isticmaalayo nsec-ga saxda ah (hubi npub-kaaga goobaha uu waafaqsan yahay kan admin-ku arka)
- Haddii aad dib u abuuray aqoontaada, xusuusinaha hore ee loo fureeyay public key-kaaga hore ma furi doontid fure cusub

**"Saxiixa khaldan" marka la soo galo:**

- Nsec-ga waxaa laga yaabaa inuu burburay — isku day inaad dib u geliso password manager-kaaga
- Hubi in nsec-ga oo dhan la paste gareeyay (wuxuu ku bilaabmaa `nsec1`, 63 xaraf guud ahaan)
- Hubi meelaha bannaan ama xariiqyo cusub

### Khaladaadka xaqiijinta saxiixa

Haddii dhacdooyinka hub-ka ay guuldaraystaan xaqiijinta saxiixa:

- Hubi in saacadda nidaamku ay isku xiran tahay (NTP). Isku dhac weyn ee saacadda waxay keeni kartaa dhibaatooyin timestamps-ka
- Xaqiiji in WebSocket relay uusan u gudbin dhacdooyin pubkeys aan la aqoon
- Dib u bilaab app-ka si aad dib u qaaddo liiska xubnaha hub-ka hadda jira

### Khaladaadka ECIES envelope

**"Furaha duubidda ma guulaysan" marka la furayo xusuusin:**

- ECIES envelope waxaa laga yaabaa inuu la sameeyay public key khaldan
- Tani waxay dhici kartaa haddii admin-ku daray isbitaale iyada oo leh typo pubkey-ga
- Admin-ku waa inuu xaqiijiyo pubkey-ga isbitaalka oo uu dib u martiqaado haddii loo baahan yahay

**"Dhererka ciphertext-ka khaldan":**

- Tani waxay muujinaysaa burbur xog, laga yaabee ka soo jeeda jawaab shabakad oo yaraatay
- Isku day ficilka mar kale. Haddii uu sii wado, xogta fureeran waxaa laga yaabaa inay si joogto ah u burburtay
- Hubi dhibaatooyinka proxy ama CDN ee laga yaabee inay yareeyaan jirka jawaabaha

### Khaladaadka furaha hub-ka

**"Dhacdo hub-ka ma furi karo":**

- Hub key waxaa laga yaabaa inuu beddelay tan iyo markii ugu horreysay ee aad isku xirtay
- Xidh oo dib u fur app-ka si aad u hesho hub key-ka ugu dambeeya
- Haddii aad dhawaan ka saaranaa oo dib ugu soo biirtay hub-ka, fure-ka waxaa laga yaabaa inuu beddelay xilligaaga maqnaanshaha

## Helitaanka caawimaad

Haddii dhibaatadaadu aanay ku jirin halkan:

- Hubi [GitHub Issues](https://github.com/rhonda-rodododo/llamenos-platform/issues) khaladaadka la yaqaan iyo xalalka
- Raadi issues-ka hore intaadan abuurin mid cusub
- Marka aad sheegto khalad, ku dar: habka soo saaristaada (Cloudflare/Docker/Kubernetes), platform-kaaga (Desktop/Mobile), iyo fariimaha khaladaadka ee console-ka browser-ka ama terminal-ka
