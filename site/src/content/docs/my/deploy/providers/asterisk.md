---
title: "သတ်မှတ်နည်း: Asterisk (ကိုယ်တိုင်လက်ခံ)"
description: Llamenos အတွက် sip-bridge ဖြင့် Asterisk ကို ဖြန့်ကျက်ရန် အဆင့်ဆင့်လမ်းညွှန်။
---

Asterisk သည် သင့်ကိုယ်ပိုင်အခြေခံအဆောက်အအုံပေါ်တွင် လက်ခံထားသော open-source တယ်လီဖုန်းပလက်ဖောင်းတစ်ခုဖြစ်သည်။ ၎င်းသည် သင့်ဒေတာအပေါ် အမြင့်ဆုံးထိန်းချုပ်မှုကိုပေးပြီး တစ်မိနစ်အလိုက်ကလောက်အခကြေးငွေများကို ဖယ်ရှားပေးသည်။ Llamenos သည် `sip-bridge` ဝန်ဆောင်မှုမှတစ်ဆင့် Asterisk REST Interface (ARI) ကိုအသုံးပြု၍ Asterisk နှင့် ချိတ်ဆက်သည်။

> **မှတ်ချက်:** `asterisk-bridge` ဝန်ဆောင်မှု မရှိတော့ပါ။ ၎င်းကို `sip-bridge` ဖြင့် အစားထိုးထားပြီး၊ ၎င်းသည် Asterisk ARI၊ FreeSWITCH ESL နှင့် Kamailio တို့ကို `PBX_TYPE` ပတ်ဝန်းကျင်ပြောင်းကိန်းမှတစ်ဆင့် ပံ့ပိုးသည်။ Asterisk အတွက် `PBX_TYPE=asterisk` ဟု သတ်မှတ်ပါ။

၎င်းသည် အရှုပ်ထွေးဆုံးသော သတ်မှတ်ရွေးချယ်မှုဖြစ်ပြီး ဆာဗာအခြေခံအဆောက်အအုံကို စီမံခန့်ခွဲနိုင်သော နည်းပညာဝန်ထမ်းများရှိသည့် အဖွဲ့အစည်းများအတွက် အကြံပြုထားသည်။

## ကြိုတင်လိုအပ်ချက်များ

- အများသုံး IP လိပ်စာပါရှိသော Linux ဆာဗာ (Ubuntu 22.04+ သို့မဟုတ် Debian 12+ ကို အကြံပြုထား)
- PSTN ချိတ်ဆက်မှုအတွက် SIP trunk ဝန်ဆောင်မှုပေးသူ (ဥပမာ Telnyx, Flowroute, VoIP.ms)
- သင့် Llamenos အင်စတန်းကို အများသုံး URL တစ်ခုမှတစ်ဆင့် ဝင်ရောက်နိုင်ရန် ဖြန့်ကျက်ထားရန်
- Linux ဆာဗာအုပ်ချုပ်မှုဆိုင်ရာ အခြေခံကျွမ်းကျင်မှု

## 1. Asterisk ကို ထည့်သွင်းပါ

### ရွေးချယ်မှု A: Package manager (ပိုမိုရိုးရှင်း)

```bash
sudo apt update
sudo apt install asterisk
```

### ရွေးချယ်မှု B: Docker (စီမံခန့်ခွဲရန် ပိုမိုလွယ်ကူသောကြောင့် အကြံပြုထား)

```bash
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

## 2. SIP trunk ကို သတ်မှတ်ပါ

သင့် SIP trunk ဝန်ဆောင်မှုပေးသူကို ထည့်ရန် `/etc/asterisk/pjsip.conf` ကို တည်းဖြတ်ပါ:

```ini
[trunk-provider]
type=registration
transport=transport-tls
outbound_auth=trunk-auth
server_uri=sip:sip.your-provider.com
client_uri=sip:your-account@sip.your-provider.com

[trunk-auth]
type=auth
auth_type=userpass
username=your-account
password=your-password

[trunk-endpoint]
type=endpoint
context=from-trunk
transport=transport-tls
disallow=all
allow=ulaw
allow=alaw
allow=opus
aors=trunk-aor
outbound_auth=trunk-auth

[trunk-aor]
type=aor
contact=sip:sip.your-provider.com
```

## 3. ARI ကို ဖွင့်ပါ

`/etc/asterisk/ari.conf` ကို တည်းဖြတ်ပါ:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

`/etc/asterisk/http.conf` ကို တည်းဖြတ်ပါ:

```ini
[general]
enabled=yes
bindaddr=0.0.0.0
bindport=8088
tlsenable=yes
tlsbindaddr=0.0.0.0:8089
tlscertfile=/etc/asterisk/keys/asterisk.pem
tlsprivatekey=/etc/asterisk/keys/asterisk.key
```

## 4. Dialplan ကို သတ်မှတ်ပါ

`/etc/asterisk/extensions.conf` ကို တည်းဖြတ်ပါ:

```ini
[from-trunk]
exten => _X.,1,NoOp(Incoming call from ${CALLERID(num)})
 same => n,Stasis(llamenos,incoming)
 same => n,Hangup()
```

## 5. sip-bridge ဝန်ဆောင်မှုကို ဖြန့်ကျက်ပါ

`sip-bridge` ဝန်ဆောင်မှုသည် Llamenos webhooks နှင့် ARI ဖြစ်ရပ်များကြား ဘာသာပြန်ပေးသည်။ ၎င်းသည် Llamenos သိုလှောင်မှုတွင် ပါဝင်ပြီး `--profile telephony` အလံကိုအသုံးပြု၍ Docker Compose မှတစ်ဆင့် ဖြန့်ကျက်သည်။

သင့် `.env` တွင် ထည့်ပါ:

```env
PBX_TYPE=asterisk
ARI_PASSWORD=your-strong-ari-password
BRIDGE_SECRET=your-hex-bridge-secret   # openssl rand -hex 32
```

တယ်လီဖုန်းပရိုဖိုင်ဖြင့် စတင်ပါ:

```bash
docker compose -f deploy/docker/docker-compose.yml \
  -f deploy/docker/docker-compose.production.yml \
  --profile telephony up -d
```

သို့မဟုတ် သီးသန့်လည်ပတ်ပါ:

```bash
cd sip-bridge
PBX_TYPE=asterisk \
ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
ASTERISK_ARI_USERNAME=llamenos \
ARI_PASSWORD=your-strong-ari-password \
LLAMENOS_CALLBACK_URL=https://your-domain.com/api/telephony \
BRIDGE_SECRET=your-hex-bridge-secret \
bun run start
```

## 6. Llamenos တွင် သတ်မှတ်ပါ

1. အက်ဒ်မင်အဖြစ် ဝင်ရောက်ပါ
2. **ဆက်တင်များ** → **တယ်လီဖုန်းဝန်ဆောင်မှုပေးသူ** သို့ သွားပါ
3. **Asterisk (ကိုယ်တိုင်လက်ခံ)** ကိုရွေးချယ်ပါ
4. အောက်ပါတို့ကို ထည့်သွင်းပါ:
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: သင့် ARI စကားဝှက်
   - **Bridge Secret**: သင့် bridge လျှို့ဝှက်ချက်
   - **Phone Number**: သင့် SIP trunk နံပါတ် (E.164 ပုံစံ)
5. **သိမ်းရန်** ကိုနှိပ်ပါ

## 7. သတ်မှတ်မှုကို စမ်းသပ်ပါ

```bash
# ARI အလုပ်လုပ်ကြောင်း စစ်ဆေးပါ
curl -u llamenos:password https://your-server:8089/ari/asterisk/info

# Asterisk ကို ပြန်စတင်ပါ
sudo systemctl restart asterisk
```

ထို့နောက် ဖုန်းတစ်လုံးမှ သင့်ဟော့ပ်လိုင်းနံပါတ်ကို ခေါ်ဆိုပြီး sip-bridge မှတ်တမ်းများကို စစ်ဆေးပါ။

## လုံခြုံရေးဆိုင်ရာ ထည့်သွင်းစဉ်းစားမှုများ

### TLS နှင့် SRTP

```ini
; pjsip.conf တွင်
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

Endpoints တွင် SRTP ကို ဖွင့်ပါ:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### ကွန်ရက်အထီးကျန်ခြင်း

- Firewall ကိုသုံးပါ: သင့် SIP trunk ဝန်ဆောင်မှုပေးသူသာ SIP (5060-5061) နှင့် RTP (10000-20000/udp) ဆိပ်ကမ်းများသို့ ရောက်ရှိသင့်သည်
- ARI (8088-8089/tcp) ကို sip-bridge ဆာဗာသို့သာ ကန့်သတ်ပါ
- SIP စကင်ဖောက်ခြင်းတိုက်ခိုက်မှုများမှ ကာကွယ်ရန် fail2ban ကိုသုံးပါ

## ပြဿနာဖြေရှင်းခြင်း

- **ARI ချိတ်ဆက်မှုငြင်းပယ်ခံရ**: `http.conf` တွင် `enabled=yes` ရှိကြောင်း စစ်ဆေးပါ
- **အသံမရှိခြင်း**: RTP ဆိပ်ကမ်းများ (10000-20000/udp) ဖွင့်ထားပြီး NAT ကို သတ်မှတ်ထားကြောင်း စစ်ဆေးပါ
- **SIP မှတ်ပုံတင်မအောင်မြင်ခြင်း**: SIP trunk အထောက်အထားများနှင့် DNS ကို စစ်ဆေးပါ
- **sip-bridge ချိတ်ဆက်မထားခြင်း**: `PBX_TYPE=asterisk` သတ်မှတ်ထားကြောင်းနှင့် ARI_PASSWORD နှင့် BRIDGE_SECRET တို့သည် bridge နှင့် Llamenos အက်ဒ်မင်ဆက်တင်များတွင် တူညီကြောင်း စစ်ဆေးပါ
