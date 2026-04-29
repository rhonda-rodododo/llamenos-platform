---
title: "설정: WhatsApp"
description: 암호화된 메시징을 위해 Meta Cloud API를 통해 WhatsApp Business를 연결합니다.
---

Llamenos는 Meta Cloud API (Graph API v21.0)를 통한 WhatsApp Business 메시징을 지원합니다. WhatsApp은 텍스트, 이미지, 문서, 오디오 및 인터랙티브 메시지를 지원하는 풍부한 메시징 기능을 제공합니다.

## 사전 요구 사항

- [Meta Business 계정](https://business.facebook.com)
- WhatsApp Business API 전화번호
- WhatsApp 제품이 활성화된 Meta 개발자 앱

## 통합 모드

Llamenos는 두 가지 WhatsApp 통합 모드를 지원합니다:

### Meta Direct (권장)

Meta Cloud API에 직접 연결합니다. 모든 기능을 완전히 제어할 수 있습니다.

**필요한 자격 증명:**
- **Phone Number ID** — WhatsApp Business 전화번호 ID
- **Business Account ID** — Meta Business Account ID
- **Access Token** — 장기 Meta API access token
- **Verify Token** — 웹훅 확인에 사용할 사용자 정의 문자열
- **App Secret** — 웹훅 서명 검증을 위한 Meta 앱 시크릿

### Twilio 모드

이미 음성에 Twilio를 사용하고 있다면, Twilio 계정을 통해 WhatsApp을 라우팅할 수 있습니다. 설정이 간단하지만 일부 기능이 제한될 수 있습니다.

**필요한 자격 증명:**
- 기존 Twilio Account SID, Auth Token 및 Twilio에 연결된 WhatsApp 발신자

## 1. Meta 앱 만들기

1. [developers.facebook.com](https://developers.facebook.com)으로 이동하세요
2. 새 앱을 만드세요 (유형: Business)
3. **WhatsApp** 제품을 추가하세요
4. WhatsApp > Getting Started에서 **Phone Number ID**와 **Business Account ID**를 확인하세요
5. 영구 access token을 생성하세요 (Settings > Access Tokens)

## 2. 웹훅 설정

Meta 개발자 대시보드에서:

1. WhatsApp > Configuration > Webhook으로 이동하세요
2. Callback URL을 다음으로 설정하세요:
   ```
   https://your-worker.your-domain.com/api/messaging/whatsapp/webhook
   ```
3. Verify Token을 Llamenos 관리자 설정에 입력할 것과 동일한 문자열로 설정하세요
4. `messages` 웹훅 필드를 구독하세요

Meta가 웹훅 확인을 위한 GET 요청을 보냅니다. verify token이 일치하면 Worker가 챌린지로 응답합니다.

## 3. 관리자 설정에서 WhatsApp 활성화

**관리자 설정 > 메시징 채널** (또는 설정 마법사)로 이동하여 **WhatsApp**을 활성화하세요.

**Meta Direct** 또는 **Twilio** 모드를 선택하고 필요한 자격 증명을 입력하세요.

선택적 설정을 구성하세요:
- **자동 응답 메시지** — 처음 연락하는 사용자에게 전송
- **근무 외 시간 응답** — 근무 시간 외에 전송

## 4. 테스트

Business 전화번호로 WhatsApp 메시지를 보내세요. 대화가 **대화** 탭에 나타나야 합니다.

## 24시간 메시징 윈도우

WhatsApp은 24시간 메시징 윈도우를 적용합니다:
- 사용자의 마지막 메시지로부터 24시간 이내에 답장할 수 있습니다
- 24시간 후에는 승인된 **템플릿 메시지**를 사용하여 대화를 다시 시작해야 합니다
- Llamenos는 이를 자동으로 처리합니다 — 윈도우가 만료되면 대화 재시작을 위해 템플릿 메시지를 보냅니다

## 미디어 지원

WhatsApp은 풍부한 미디어 메시지를 지원합니다:
- **이미지** (JPEG, PNG)
- **문서** (PDF, Word 등)
- **오디오** (MP3, OGG)
- **비디오** (MP4)
- **위치** 공유
- **인터랙티브** 버튼 및 리스트 메시지

미디어 첨부 파일은 대화 뷰에서 인라인으로 표시됩니다.

## 보안 참고 사항

- WhatsApp은 사용자와 Meta 인프라 사이에 종단 간 암호화를 사용합니다
- Meta는 기술적으로 서버에서 메시지 내용에 접근할 수 있습니다
- 메시지는 웹훅에서 수신한 후 Llamenos에 저장됩니다
- 웹훅 서명은 앱 시크릿을 사용한 HMAC-SHA256으로 검증됩니다
- 최대 개인정보 보호를 위해, WhatsApp 대신 Signal 사용을 고려하세요
