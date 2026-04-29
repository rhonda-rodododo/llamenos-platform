---
title: "설정: Plivo"
description: Plivo를 전화 서비스 제공업체로 구성하는 단계별 가이드.
---

Plivo는 간단한 API를 갖춘 경제적인 클라우드 전화 서비스 제공업체입니다. TwiML과 유사한 XML 기반 통화 제어를 사용하여 Llamenos와의 통합이 원활합니다.

## 사전 요구 사항

- [Plivo 계정](https://console.plivo.com/accounts/register/) (체험 크레딧 제공)
- Llamenos 인스턴스가 공개 URL로 배포 및 접근 가능한 상태

## 1. Plivo 계정 생성

[console.plivo.com](https://console.plivo.com/accounts/register/)에서 가입합니다. 인증 후 대시보드 홈 페이지에서 **Auth ID**와 **Auth Token**을 확인할 수 있습니다.

## 2. 전화번호 구매

1. Plivo Console에서 **Phone Numbers** > **Buy Numbers**로 이동
2. 국가를 선택하고 음성 기능이 있는 번호 검색
3. 번호 구매

## 3. XML Application 생성

Plivo는 "XML Applications"를 사용하여 통화를 라우팅합니다:

1. **Voice** > **XML Applications**로 이동
2. **Add New Application** 클릭
3. 구성:
   - **Application Name**: Llamenos Hotline
   - **Answer URL**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Hangup URL**: `https://your-worker-url.com/telephony/status` (POST)
4. 애플리케이션 저장

## 4. 전화번호 연결

1. **Phone Numbers** > **Your Numbers**로 이동
2. 핫라인 번호 클릭
3. **Voice** 아래에서 3단계에서 생성한 XML Application 선택
4. 저장

## 5. Llamenos에서 구성

1. 관리자로 로그인
2. **설정** > **전화 서비스 제공업체**로 이동
3. 제공업체 드롭다운에서 **Plivo** 선택
4. 입력:
   - **Auth ID**: Plivo Console 대시보드에서 확인
   - **Auth Token**: Plivo Console 대시보드에서 확인
   - **Phone Number**: 구매한 번호 (E.164 형식)
5. **저장** 클릭

## 6. 설정 테스트

핫라인 번호로 전화를 겁니다. 언어 선택 메뉴가 들리고 정상적인 통화 흐름으로 라우팅되어야 합니다.

## WebRTC 설정 (선택 사항)

Plivo WebRTC는 기존 자격 증명과 함께 Browser SDK를 사용합니다:

1. Plivo Console에서 **Voice** > **Endpoints**로 이동
2. 새 endpoint 생성 (브라우저 전화 ID 역할)
3. Llamenos에서 **설정** > **전화 서비스 제공업체**로 이동
4. **WebRTC 통화** 토글 켜기
5. **저장** 클릭

어댑터가 Auth ID와 Auth Token에서 시간 제한 HMAC 토큰을 생성하여 안전한 브라우저 인증을 제공합니다.

## Plivo 관련 참고 사항

- **XML과 TwiML**: Plivo는 TwiML과 유사하지만 동일하지 않은 자체 XML 형식을 사용합니다. Llamenos 어댑터가 올바른 Plivo XML을 자동으로 생성합니다.
- **Answer URL과 Hangup URL**: Plivo는 초기 통화 핸들러(Answer URL)와 통화 종료 핸들러(Hangup URL)를 분리합니다. 이는 단일 상태 콜백을 사용하는 Twilio와 다릅니다.
- **속도 제한**: Plivo는 계정 티어에 따라 다른 API 속도 제한이 있습니다. 대용량 핫라인의 경우 Plivo 지원팀에 연락하여 제한을 늘리세요.

## 문제 해결

- **"Auth ID invalid"**: Auth ID는 이메일 주소가 아닙니다. Plivo Console 대시보드 홈 페이지에서 찾으세요.
- **통화가 라우팅되지 않음**: 전화번호가 올바른 XML Application에 연결되었는지 확인하세요.
- **Answer URL 오류**: Plivo는 유효한 XML 응답을 기대합니다. Worker 로그에서 응답 오류를 확인하세요.
- **발신 통화 제한**: 체험 계정은 발신 통화에 제한이 있습니다. 프로덕션 사용을 위해 업그레이드하세요.
