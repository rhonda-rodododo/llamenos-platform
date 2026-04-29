---
title: WebRTC 브라우저 통화
description: WebRTC를 사용하여 자원봉사자가 브라우저에서 전화를 받을 수 있도록 설정합니다.
---

WebRTC(Web Real-Time Communication)를 사용하면 자원봉사자가 전화기 없이 브라우저에서 직접 핫라인 전화를 받을 수 있습니다. 전화번호를 공유하고 싶지 않거나 컴퓨터에서 작업하는 자원봉사자에게 유용합니다.

## 작동 방식

1. 관리자가 전화 서비스 제공업체 설정에서 WebRTC를 활성화
2. 자원봉사자가 프로필에서 통화 설정을 "브라우저"로 변경
3. 전화가 오면 Llamenos 앱이 알림과 함께 브라우저에서 울림
4. 자원봉사자가 "응답"을 클릭하면 마이크를 통해 브라우저로 통화 연결

통화 오디오는 전화 서비스 제공업체에서 WebRTC 연결을 통해 자원봉사자의 브라우저로 라우팅됩니다. 통화 품질은 자원봉사자의 인터넷 연결에 따라 달라집니다.

## 사전 요구 사항

### 관리자 설정

- WebRTC가 활성화된 지원 전화 서비스 제공업체 (Twilio, SignalWire, Vonage 또는 Plivo)
- 제공업체별 WebRTC 자격 증명 구성 (제공업체 설정 가이드 참조)
- **설정** > **전화 서비스 제공업체**에서 WebRTC 토글 켜기

### 자원봉사자 요구 사항

- 최신 브라우저 (Chrome, Firefox, Edge 또는 Safari 14.1+)
- 작동하는 마이크
- 안정적인 인터넷 연결 (최소 100 kbps 업/다운)
- 브라우저 알림 권한 부여

## 제공업체별 설정

각 전화 서비스 제공업체는 WebRTC에 다른 자격 증명을 요구합니다:

### Twilio / SignalWire

1. 제공업체 콘솔에서 **API Key** 생성
2. Voice URL을 `https://your-worker-url.com/telephony/webrtc-incoming`으로 설정한 **TwiML/LaML Application** 생성
3. Llamenos에서 API Key SID, API Key Secret, Application SID 입력

### Vonage

1. Vonage Application에 이미 WebRTC 기능 포함
2. Llamenos에서 Application의 **private key** (PEM 형식) 붙여넣기
3. Application ID는 초기 설정에서 이미 구성됨

### Plivo

1. Plivo Console의 **Voice** > **Endpoints** 아래에서 **Endpoint** 생성
2. WebRTC는 기존 Auth ID와 Auth Token 사용
3. Llamenos에서 WebRTC 활성화 -- 추가 자격 증명 불필요

### Asterisk

Asterisk WebRTC는 WebSocket 전송을 사용한 SIP.js 구성이 필요합니다. 클라우드 제공업체보다 복잡합니다:

1. Asterisk의 `http.conf`에서 WebSocket 전송 활성화
2. DTLS-SRTP를 사용한 WebRTC 클라이언트용 PJSIP 엔드포인트 생성
3. Asterisk 선택 시 Llamenos가 SIP.js 클라이언트를 자동 구성

전체 세부사항은 [Asterisk 설정 가이드](/docs/deploy/providers/asterisk)를 참조하세요.

## 자원봉사자 통화 설정

자원봉사자는 앱에서 통화 설정을 구성합니다:

1. Llamenos에 로그인
2. **설정** (톱니바퀴 아이콘)으로 이동
3. **통화 설정** 아래에서 **전화기** 대신 **브라우저** 선택
4. 요청 시 마이크 및 알림 권한 부여
5. 근무 중 Llamenos 탭을 열어두기

전화가 오면 브라우저 알림과 앱 내 울림 표시가 나타납니다. **응답**을 클릭하여 연결합니다.

## 브라우저 호환성

| 브라우저 | 데스크톱 | 모바일 | 비고 |
|---|---|---|---|
| Chrome | 예 | 예 | 권장 |
| Firefox | 예 | 예 | 완전 지원 |
| Edge | 예 | 예 | Chromium 기반, 완전 지원 |
| Safari | 예 (14.1+) | 예 (14.1+) | 오디오 시작에 사용자 상호작용 필요 |
| Brave | 예 | 제한적 | 마이크 사용을 위해 shields 비활성화 필요할 수 있음 |

## 오디오 품질 팁

- 에코를 방지하기 위해 헤드셋이나 이어버드 사용
- 마이크를 사용하는 다른 애플리케이션 닫기
- 가능하면 유선 인터넷 연결 사용
- WebRTC를 방해할 수 있는 브라우저 확장 프로그램 비활성화 (VPN 확장, WebRTC 유출 방지 기능이 있는 광고 차단기)

## 문제 해결

### 오디오 없음

- **마이크 권한 확인**: 주소 표시줄의 잠금 아이콘을 클릭하고 마이크 접근이 "허용"인지 확인
- **마이크 테스트**: 브라우저 내장 오디오 테스트 또는 [webcamtest.com](https://webcamtest.com) 같은 사이트 사용
- **오디오 출력 확인**: 스피커 또는 헤드셋이 출력 장치로 선택되었는지 확인

### 브라우저에서 벨이 울리지 않음

- **알림 차단됨**: Llamenos 사이트에 대해 브라우저 알림이 활성화되었는지 확인
- **탭이 활성화되지 않음**: Llamenos 탭이 열려 있어야 합니다 (백그라운드에 있을 수 있지만 탭이 존재해야 함)
- **통화 설정**: 설정에서 통화 설정이 "브라우저"로 되어 있는지 확인
- **WebRTC 미구성**: 관리자에게 WebRTC가 활성화되고 자격 증명이 설정되었는지 확인 요청

### 방화벽 및 NAT 문제

WebRTC는 방화벽과 NAT를 통과하기 위해 STUN/TURN 서버를 사용합니다. 통화는 연결되지만 오디오가 들리지 않는 경우:

- **기업 방화벽**: 일부 방화벽은 비표준 포트의 UDP 트래픽을 차단합니다. IT 팀에 포트 3478 및 10000-60000의 UDP 트래픽 허용을 요청하세요
- **대칭 NAT**: 일부 라우터는 직접 피어 연결을 방해할 수 있는 대칭 NAT를 사용합니다. 전화 서비스 제공업체의 TURN 서버가 이를 자동으로 처리해야 합니다
- **VPN 간섭**: VPN이 WebRTC 연결을 방해할 수 있습니다. 근무 중 VPN 연결 해제를 시도하세요

### 에코 또는 피드백

- 스피커 대신 헤드폰 사용
- OS 오디오 설정에서 마이크 감도 줄이기
- 브라우저에서 에코 제거 활성화 (보통 기본 활성화)
- 딱딱한 반사 표면에서 멀리 이동
