---
title: "설정: SMS"
description: 전화 서비스 제공업체를 통한 수신 및 발신 SMS 메시징을 활성화합니다.
---

Llamenos의 SMS 메시징은 기존 음성 전화 서비스 제공업체 자격 증명을 재사용합니다. 별도의 SMS 서비스가 필요하지 않습니다 — 음성용으로 이미 Twilio, SignalWire, Vonage 또는 Plivo를 설정한 경우, SMS는 동일한 계정으로 작동합니다.

## 지원 제공업체

| 제공업체 | SMS 지원 | 참고 |
|----------|----------|------|
| **Twilio** | 예 | Twilio Messaging API를 통한 양방향 SMS |
| **SignalWire** | 예 | Twilio API와 호환 — 동일한 인터페이스 |
| **Vonage** | 예 | Vonage REST API를 통한 SMS |
| **Plivo** | 예 | Plivo Message API를 통한 SMS |
| **Asterisk** | 아니오 | Asterisk는 네이티브 SMS를 지원하지 않음 |

## 1. 관리자 설정에서 SMS 활성화

**관리자 설정 > 메시징 채널** (또는 첫 로그인 시 설정 마법사)로 이동하여 **SMS**를 활성화하세요.

SMS 설정을 구성하세요:
- **자동 응답 메시지** — 처음 연락하는 사용자에게 보내는 선택적 환영 메시지
- **근무 외 시간 응답** — 근무 시간 외에 보내는 선택적 메시지

## 2. 웹훅 설정

전화 서비스 제공업체의 SMS 웹훅을 Worker로 설정하세요:

```
POST https://your-worker.your-domain.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. Twilio 콘솔 > Phone Numbers > Active Numbers로 이동하세요
2. 전화번호를 선택하세요
3. **Messaging** 항목에서 "A message comes in"의 웹훅 URL을 위의 URL로 설정하세요
4. HTTP 메서드를 **POST**로 설정하세요

### Vonage

1. Vonage API Dashboard > Applications로 이동하세요
2. 애플리케이션을 선택하세요
3. **Messages** 항목에서 Inbound URL을 위의 웹훅 URL로 설정하세요

### Plivo

1. Plivo 콘솔 > Messaging > Applications로 이동하세요
2. 메시징 애플리케이션을 만들거나 편집하세요
3. Message URL을 위의 웹훅 URL로 설정하세요
4. 전화번호에 애플리케이션을 연결하세요

## 3. 테스트

핫라인 전화번호로 SMS를 보내세요. 관리자 패널의 **대화** 탭에 대화가 나타나야 합니다.

## 작동 원리

1. SMS가 제공업체에 도착하면, 제공업체가 Worker로 웹훅을 보냅니다
2. Worker가 웹훅 서명을 검증합니다 (제공업체별 HMAC)
3. 메시지가 파싱되어 ConversationDO에 저장됩니다
4. 근무 중인 자원봉사자에게 Nostr relay 이벤트로 알림이 갑니다
5. 자원봉사자가 대화 탭에서 답장하면 — 제공업체의 SMS API를 통해 응답이 발송됩니다

## 보안 참고 사항

- SMS 메시지는 통신사 네트워크를 통해 평문으로 전송됩니다 — 제공업체와 통신사가 읽을 수 있습니다
- 수신 메시지는 도착 후 ConversationDO에 저장됩니다
- 발신자 전화번호는 저장 전에 해싱됩니다 (개인정보 보호)
- 웹훅 서명은 제공업체별로 검증됩니다 (Twilio의 경우 HMAC-SHA1 등)
