---
title: "설정: Twilio"
description: Twilio를 전화 서비스 제공업체로 구성하는 단계별 가이드.
---

Twilio는 Llamenos의 기본 전화 서비스 제공업체이며 가장 쉽게 시작할 수 있습니다. 이 가이드에서는 계정 생성, 전화번호 설정, 웹훅 구성을 안내합니다.

## 사전 요구 사항

- [Twilio 계정](https://www.twilio.com/try-twilio) (무료 체험으로 테스트 가능)
- Llamenos 인스턴스가 공개 URL로 배포 및 접근 가능한 상태

## 1. Twilio 계정 생성

[twilio.com/try-twilio](https://www.twilio.com/try-twilio)에서 가입합니다. 이메일과 전화번호를 인증합니다. Twilio는 테스트용 체험 크레딧을 제공합니다.

## 2. 전화번호 구매

1. Twilio Console에서 **Phone Numbers** > **Manage** > **Buy a number**로 이동
2. 원하는 지역번호에서 **Voice** 기능이 있는 번호 검색
3. **Buy** 클릭 후 확인

이 번호를 저장하세요 -- Llamenos 관리 설정에서 입력합니다.

## 3. Account SID 및 Auth Token 확인

1. [Twilio Console 대시보드](https://console.twilio.com)로 이동
2. 메인 페이지에서 **Account SID**와 **Auth Token** 확인
3. 눈 아이콘을 클릭하여 Auth Token 표시

## 4. 웹훅 구성

Twilio Console에서 전화번호 구성으로 이동합니다:

1. **Phone Numbers** > **Manage** > **Active Numbers**로 이동
2. 핫라인 번호 클릭
3. **Voice Configuration** 아래에서 설정:
   - **A call comes in**: Webhook, `https://your-worker-url.com/telephony/incoming`, HTTP POST
   - **Call status changes**: `https://your-worker-url.com/telephony/status`, HTTP POST

`your-worker-url.com`을 실제 Cloudflare Worker URL로 교체하세요.

## 5. Llamenos에서 구성

1. 관리자로 로그인
2. **설정** > **전화 서비스 제공업체**로 이동
3. 제공업체 드롭다운에서 **Twilio** 선택
4. 입력:
   - **Account SID**: 3단계에서 확인한 값
   - **Auth Token**: 3단계에서 확인한 값
   - **Phone Number**: 구매한 번호 (E.164 형식, 예: `+15551234567`)
5. **저장** 클릭

## 6. 설정 테스트

전화기에서 핫라인 번호로 전화를 겁니다. 언어 선택 메뉴가 들려야 합니다. 근무 중인 자원봉사자가 있으면 전화가 연결됩니다.

## WebRTC 설정 (선택 사항)

자원봉사자가 전화기 대신 브라우저에서 전화를 받을 수 있도록 설정하려면:

### API Key 생성

1. Twilio Console에서 **Account** > **API keys & tokens**로 이동
2. **Create API Key** 클릭
3. **Standard** 키 유형 선택
4. **SID**와 **Secret** 저장 -- Secret은 한 번만 표시됩니다

### TwiML App 생성

1. **Voice** > **Manage** > **TwiML Apps**로 이동
2. **Create new TwiML App** 클릭
3. **Voice Request URL**을 `https://your-worker-url.com/telephony/webrtc-incoming`으로 설정
4. 저장하고 **App SID** 기록

### Llamenos에서 활성화

1. **설정** > **전화 서비스 제공업체**로 이동
2. **WebRTC 통화** 토글 켜기
3. 입력:
   - **API Key SID**: 생성한 API Key에서 확인
   - **API Key Secret**: 생성한 API Key에서 확인
   - **TwiML App SID**: 생성한 TwiML App에서 확인
4. **저장** 클릭

자원봉사자 설정 및 문제 해결은 [WebRTC 브라우저 통화](/docs/deploy/providers/webrtc)를 참조하세요.

## 문제 해결

- **전화가 도착하지 않음**: 웹훅 URL이 올바르고 Worker가 배포되었는지 확인하세요. Twilio Console 오류 로그를 확인하세요.
- **"Invalid webhook" 오류**: 웹훅 URL이 HTTPS를 사용하고 유효한 TwiML을 반환하는지 확인하세요.
- **체험 계정 제한**: 체험 계정은 인증된 번호로만 전화할 수 있습니다. 프로덕션 사용을 위해 유료 계정으로 업그레이드하세요.
- **웹훅 검증 실패**: Llamenos의 Auth Token이 Twilio Console의 것과 일치하는지 확인하세요.
