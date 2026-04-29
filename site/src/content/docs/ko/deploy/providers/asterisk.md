---
title: "설정: Asterisk (자체 호스팅)"
description: Llamenos용 ARI 브리지와 함께 Asterisk를 배포하는 단계별 가이드.
---

Asterisk는 자체 인프라에서 호스팅하는 오픈소스 전화 플랫폼입니다. 데이터에 대한 최대한의 제어권을 제공하며 분당 클라우드 요금이 없습니다. Llamenos는 Asterisk REST Interface(ARI)를 통해 Asterisk에 연결됩니다.

이것은 가장 복잡한 설정 옵션이며, 서버 인프라를 관리할 수 있는 기술 인력이 있는 조직에 권장됩니다.

## 사전 요구 사항

- 공인 IP 주소가 있는 Linux 서버 (Ubuntu 22.04+ 또는 Debian 12+ 권장)
- PSTN 연결을 위한 SIP 트렁크 제공업체 (예: Telnyx, Flowroute, VoIP.ms)
- Llamenos 인스턴스가 공개 URL로 배포 및 접근 가능한 상태
- Linux 서버 관리에 대한 기본 지식

## 1. Asterisk 설치

### 옵션 A: 패키지 관리자 (간단)

```bash
sudo apt update
sudo apt install asterisk
```

### 옵션 B: Docker (관리 용이성을 위해 권장)

```bash
docker pull asterisk/asterisk:20
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

### 옵션 C: 소스에서 빌드 (커스텀 모듈용)

```bash
wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz
tar xzf asterisk-20-current.tar.gz
cd asterisk-20.*/
./configure
make
sudo make install
sudo make samples
```

## 2. SIP 트렁크 구성

`/etc/asterisk/pjsip.conf`를 편집하여 SIP 트렁크 제공업체를 추가합니다. 다음은 예시 구성입니다:

```ini
; SIP trunk to your PSTN provider
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

## 3. ARI 활성화

ARI(Asterisk REST Interface)는 Llamenos가 Asterisk에서 통화를 제어하는 방법입니다.

`/etc/asterisk/ari.conf` 편집:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

`/etc/asterisk/http.conf`를 편집하여 HTTP 서버 활성화:

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

## 4. 다이얼플랜 구성

`/etc/asterisk/extensions.conf`를 편집하여 수신 통화를 ARI 애플리케이션으로 라우팅합니다:

```ini
[from-trunk]
exten => _X.,1,NoOp(Incoming call from ${CALLERID(num)})
 same => n,Stasis(llamenos,incoming)
 same => n,Hangup()

[llamenos-outbound]
exten => _X.,1,NoOp(Outbound call to ${EXTEN})
 same => n,Stasis(llamenos,outbound)
 same => n,Hangup()
```

## 5. ARI 브리지 서비스 배포

ARI 브리지는 Llamenos 웹훅과 ARI 이벤트 사이를 변환하는 소규모 서비스입니다. Asterisk와 함께 실행되며 ARI WebSocket과 Llamenos Worker에 모두 연결됩니다.

```bash
# 브리지 서비스는 Llamenos 저장소에 포함되어 있습니다
cd llamenos
bun run build:ari-bridge

# 실행
ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
ASTERISK_ARI_USERNAME=llamenos \
ASTERISK_ARI_PASSWORD=your-strong-ari-password \
LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
bun run ari-bridge
```

또는 Docker 사용:

```bash
docker run -d \
  --name llamenos-ari-bridge \
  -e ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
  -e ASTERISK_ARI_USERNAME=llamenos \
  -e ASTERISK_ARI_PASSWORD=your-strong-ari-password \
  -e LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
  llamenos/ari-bridge
```

## 6. Llamenos에서 구성

1. 관리자로 로그인
2. **설정** > **전화 서비스 제공업체**로 이동
3. 제공업체 드롭다운에서 **Asterisk (자체 호스팅)** 선택
4. 입력:
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: ARI 비밀번호
   - **Bridge Callback URL**: ARI 브리지가 Llamenos에서 웹훅을 수신하는 URL (예: `https://bridge.your-domain.com/webhook`)
   - **Phone Number**: SIP 트렁크 전화번호 (E.164 형식)
5. **저장** 클릭

## 7. 설정 테스트

1. Asterisk 재시작: `sudo systemctl restart asterisk`
2. ARI 실행 확인: `curl -u llamenos:password https://your-server:8089/ari/asterisk/info`
3. 전화기에서 핫라인 번호로 전화
4. ARI 브리지 로그에서 연결 및 통화 이벤트 확인

## 보안 고려 사항

자체 Asterisk 서버를 운영하면 완전한 제어권을 갖지만, 보안에 대한 완전한 책임도 가집니다:

### TLS 및 SRTP

SIP 시그널링을 위한 TLS와 미디어 암호화를 위한 SRTP를 항상 활성화하세요:

```ini
; In pjsip.conf transport section
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

엔드포인트에서 SRTP 활성화:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### 네트워크 격리

- Asterisk를 DMZ 또는 격리된 네트워크 세그먼트에 배치
- 방화벽으로 접근 제한:
  - SIP (5060-5061/tcp/udp): SIP 트렁크 제공업체만
  - RTP (10000-20000/udp): SIP 트렁크 제공업체만
  - ARI (8088-8089/tcp): ARI 브리지 서버만
  - SSH (22/tcp): 관리자 IP만
- SIP 스캐닝 공격을 방어하기 위해 fail2ban 사용

### 정기 업데이트

보안 취약점을 패치하기 위해 Asterisk를 최신 상태로 유지하세요:

```bash
sudo apt update && sudo apt upgrade asterisk
```

## Asterisk WebRTC

Asterisk는 내장된 WebSocket 전송과 브라우저의 SIP.js를 통해 WebRTC를 지원합니다. 추가 구성이 필요합니다:

1. `http.conf`에서 WebSocket 전송 활성화
2. WebRTC 클라이언트용 PJSIP 엔드포인트 생성
3. 미디어 암호화를 위한 DTLS-SRTP 구성
4. 클라이언트 측에서 SIP.js 사용 (Asterisk 선택 시 Llamenos가 자동 구성)

Asterisk의 WebRTC 설정은 클라우드 제공업체보다 더 복잡합니다. 자세한 내용은 [WebRTC 브라우저 통화](/docs/deploy/providers/webrtc) 가이드를 참조하세요.

## 문제 해결

- **ARI 연결 거부**: `http.conf`의 `enabled=yes` 및 바인드 주소가 올바른지 확인하세요.
- **오디오 없음**: RTP 포트(10000-20000/udp)가 방화벽에서 열려 있고 NAT가 올바르게 구성되었는지 확인하세요.
- **SIP 등록 실패**: SIP 트렁크 자격 증명과 DNS가 제공업체의 SIP 서버를 해석하는지 확인하세요.
- **브리지 연결 안 됨**: ARI 브리지가 Asterisk ARI 엔드포인트와 Llamenos Worker URL 모두에 도달할 수 있는지 확인하세요.
- **통화 품질 문제**: 서버에 충분한 대역폭이 있고 SIP 트렁크 제공업체까지 지연이 낮은지 확인하세요. 코덱을 고려하세요 (WebRTC는 opus, PSTN은 ulaw/alaw).
