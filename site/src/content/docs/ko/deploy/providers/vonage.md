---
title: "설정: Vonage"
description: Vonage를 전화 서비스 제공업체로 구성하는 단계별 가이드.
---

Vonage(구 Nexmo)는 강력한 국제 커버리지와 경쟁력 있는 가격을 제공합니다. Twilio와 다른 API 모델을 사용합니다 -- Vonage Applications는 번호, 웹훅, 자격 증명을 함께 그룹화합니다.

## 사전 요구 사항

- [Vonage 계정](https://dashboard.nexmo.com/sign-up) (무료 크레딧 제공)
- Llamenos 인스턴스가 공개 URL로 배포 및 접근 가능한 상태

## 1. Vonage 계정 생성

[Vonage API Dashboard](https://dashboard.nexmo.com/sign-up)에서 가입합니다. 계정을 인증하고 대시보드 홈 페이지에서 **API Key**와 **API Secret**을 기록합니다.

## 2. 전화번호 구매

1. Vonage Dashboard에서 **Numbers** > **Buy numbers**로 이동
2. 국가를 선택하고 **Voice** 기능이 있는 번호 선택
3. 번호 구매

## 3. Vonage Application 생성

Vonage는 구성을 "Applications"로 그룹화합니다:

1. **Applications** > **Create a new application**으로 이동
2. 이름 입력 (예: "Llamenos Hotline")
3. **Voice** 아래에서 토글을 켜고 설정:
   - **Answer URL**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Event URL**: `https://your-worker-url.com/telephony/status` (POST)
4. **Generate new application** 클릭
5. 확인 페이지에 표시된 **Application ID** 저장
6. **private key** 파일 다운로드 -- 구성에 내용이 필요합니다

## 4. 전화번호 연결

1. **Numbers** > **Your numbers**로 이동
2. 핫라인 번호 옆의 톱니바퀴 아이콘 클릭
3. **Voice** 아래에서 3단계에서 생성한 Application 선택
4. **Save** 클릭

## 5. Llamenos에서 구성

1. 관리자로 로그인
2. **설정** > **전화 서비스 제공업체**로 이동
3. 제공업체 드롭다운에서 **Vonage** 선택
4. 입력:
   - **API Key**: Vonage Dashboard 홈 페이지에서 확인
   - **API Secret**: Vonage Dashboard 홈 페이지에서 확인
   - **Application ID**: 3단계에서 확인
   - **Phone Number**: 구매한 번호 (E.164 형식)
5. **저장** 클릭

## 6. 설정 테스트

핫라인 번호로 전화를 겁니다. 언어 선택 메뉴가 들려야 합니다. 근무 중인 자원봉사자에게 전화가 라우팅되는지 확인합니다.

## WebRTC 설정 (선택 사항)

Vonage WebRTC는 이미 생성한 Application 자격 증명을 사용합니다:

1. Llamenos에서 **설정** > **전화 서비스 제공업체**로 이동
2. **WebRTC 통화** 토글 켜기
3. **Private Key** 내용 입력 (다운로드한 파일의 전체 PEM 텍스트)
4. **저장** 클릭

Application ID는 초기 설정에서 이미 구성되어 있습니다. Vonage는 브라우저 인증을 위해 private key를 사용하여 RS256 JWT를 생성합니다.

## Vonage 관련 참고 사항

- **NCCO와 TwiML**: Vonage는 XML 마크업 대신 JSON 형식의 NCCO(Nexmo Call Control Objects)를 사용합니다. Llamenos 어댑터가 올바른 형식을 자동으로 생성합니다.
- **Answer URL 형식**: Vonage는 answer URL이 XML이 아닌 JSON(NCCO)을 반환하기를 기대합니다. 어댑터가 이를 처리합니다.
- **Event URL**: Vonage는 통화 이벤트(울림, 응답, 완료)를 JSON POST 요청으로 event URL에 전송합니다.
- **Private key 보안**: private key는 암호화되어 저장됩니다. 서버를 벗어나지 않으며 -- 단기 JWT 토큰 생성에만 사용됩니다.

## 문제 해결

- **"Application not found"**: Application ID가 정확히 일치하는지 확인하세요. Vonage Dashboard의 **Applications** 아래에서 찾을 수 있습니다.
- **수신 전화 없음**: 전화번호가 올바른 Application에 연결되었는지 확인하세요 (4단계).
- **Private key 오류**: `-----BEGIN PRIVATE KEY-----`와 `-----END PRIVATE KEY-----` 줄을 포함한 전체 PEM 내용을 붙여넣으세요.
- **국제 번호 형식**: Vonage는 E.164 형식을 요구합니다. `+`와 국가 코드를 포함하세요.
