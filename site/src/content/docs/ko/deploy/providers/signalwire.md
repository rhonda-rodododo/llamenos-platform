---
title: "설정: SignalWire"
description: SignalWire를 전화 서비스 제공업체로 구성하는 단계별 가이드.
---

SignalWire는 호환되는 API를 갖춘 비용 효율적인 Twilio 대안입니다. TwiML 호환 마크업 언어인 LaML을 사용하므로 Twilio와 SignalWire 간의 마이그레이션이 간단합니다.

## 사전 요구 사항

- [SignalWire 계정](https://signalwire.com/signup) (무료 체험 가능)
- Llamenos 인스턴스가 공개 URL로 배포 및 접근 가능한 상태

## 1. SignalWire 계정 생성

[signalwire.com/signup](https://signalwire.com/signup)에서 가입합니다. 가입 시 **Space 이름**(예: `myhotline`)을 선택합니다. Space URL은 `myhotline.signalwire.com`이 됩니다. 이 이름을 기록하세요 -- 구성에 필요합니다.

## 2. 전화번호 구매

1. SignalWire 대시보드에서 **Phone Numbers**로 이동
2. **Buy a Phone Number** 클릭
3. 음성 기능이 있는 번호 검색
4. 번호 구매

## 3. 자격 증명 확인

1. SignalWire 대시보드에서 **API**로 이동
2. **Project ID** 확인 (Account SID 역할)
3. 없다면 새 **API Token** 생성 -- Auth Token 역할

## 4. 웹훅 구성

1. 대시보드에서 **Phone Numbers**로 이동
2. 핫라인 번호 클릭
3. **Voice Settings** 아래에서 설정:
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Call status callback**: `https://your-worker-url.com/telephony/status` (POST)

## 5. Llamenos에서 구성

1. 관리자로 로그인
2. **설정** > **전화 서비스 제공업체**로 이동
3. 제공업체 드롭다운에서 **SignalWire** 선택
4. 입력:
   - **Account SID**: 3단계의 Project ID
   - **Auth Token**: 3단계의 API Token
   - **SignalWire Space**: Space 이름 (전체 URL이 아닌 이름만 -- 예: `myhotline`)
   - **Phone Number**: 구매한 번호 (E.164 형식)
5. **저장** 클릭

## 6. 설정 테스트

핫라인 번호로 전화를 겁니다. 언어 선택 메뉴와 통화 흐름이 들려야 합니다.

## WebRTC 설정 (선택 사항)

SignalWire WebRTC는 Twilio와 동일한 API Key 패턴을 사용합니다:

1. SignalWire 대시보드에서 **API** > **Tokens** 아래에 **API Key** 생성
2. **LaML Application** 생성:
   - **LaML** > **LaML Applications**로 이동
   - Voice URL을 `https://your-worker-url.com/telephony/webrtc-incoming`으로 설정
   - Application SID 기록
3. Llamenos에서 **설정** > **전화 서비스 제공업체**로 이동
4. **WebRTC 통화** 토글 켜기
5. API Key SID, API Key Secret, Application SID 입력
6. **저장** 클릭

## Twilio와의 차이점

- **LaML과 TwiML**: SignalWire는 기능적으로 TwiML과 동일한 LaML을 사용합니다. Llamenos가 이를 자동으로 처리합니다.
- **Space URL**: API 호출이 `api.twilio.com` 대신 `{space}.signalwire.com`으로 전송됩니다. 어댑터가 제공된 Space 이름을 통해 이를 처리합니다.
- **가격**: SignalWire는 일반적으로 Twilio보다 음성 통화 비용이 30-40% 저렴합니다.
- **기능 동등성**: 모든 Llamenos 기능(녹음, 음성 변환, CAPTCHA, 음성 사서함)이 SignalWire에서 동일하게 작동합니다.

## 문제 해결

- **"Space not found" 오류**: Space 이름을 다시 확인하세요 (전체 URL이 아닌 서브도메인만).
- **웹훅 실패**: Worker URL이 공개적으로 접근 가능하고 HTTPS를 사용하는지 확인하세요.
- **API Token 문제**: SignalWire 토큰은 만료될 수 있습니다. 인증 오류가 발생하면 새 토큰을 생성하세요.
