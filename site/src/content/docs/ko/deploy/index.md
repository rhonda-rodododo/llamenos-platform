---
title: 시작하기
description: 1시간 이내에 나만의 Llamenos 핫라인을 배포하세요.
---

1시간 이내에 나만의 Llamenos 핫라인을 배포하세요. Cloudflare 계정, 전화 서비스 제공업체 계정, 그리고 Bun이 설치된 컴퓨터가 필요합니다.

## 사전 요구 사항

- [Bun](https://bun.sh) v1.0 이상 (런타임 및 패키지 관리자)
- [Cloudflare](https://www.cloudflare.com) 계정 (무료 티어로 개발 가능)
- 전화 서비스 제공업체 계정 — [Twilio](https://www.twilio.com)가 가장 쉽게 시작할 수 있지만, Llamenos는 [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo), [자체 호스팅 Asterisk](/docs/deploy/providers/asterisk)도 지원합니다. 선택에 도움이 필요하면 [전화 서비스 제공업체](/docs/deploy/providers) 비교 페이지를 참조하세요.
- Git

## 1. 클론 및 설치

```bash
git clone https://github.com/rhonda-rodododo/llamenos.git
cd llamenos
bun install
```

## 2. 관리자 키 쌍 생성

관리자 계정을 위한 Nostr 키 쌍을 생성합니다. 이 과정에서 비밀 키(nsec)와 공개 키(npub/hex)가 생성됩니다.

```bash
bun run bootstrap-admin
```

`nsec`를 안전하게 보관하세요 — 이것이 관리자 로그인 자격 증명입니다. 다음 단계에서 16진수 공개 키가 필요합니다.

## 3. 비밀 값 구성

로컬 개발을 위해 프로젝트 루트에 `.dev.vars` 파일을 생성합니다. 이 예시는 Twilio를 사용합니다 — 다른 제공업체를 사용하는 경우 Twilio 변수를 건너뛰고 첫 로그인 후 관리자 UI에서 제공업체를 구성할 수 있습니다.

```bash
# .dev.vars
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
ADMIN_PUBKEY=your_hex_public_key_from_step_2
ENVIRONMENT=development
```

프로덕션 환경에서는 Wrangler 시크릿으로 설정합니다:

```bash
bunx wrangler secret put ADMIN_PUBKEY
# Twilio를 환경 변수로 기본 제공업체로 사용하는 경우:
bunx wrangler secret put TWILIO_ACCOUNT_SID
bunx wrangler secret put TWILIO_AUTH_TOKEN
bunx wrangler secret put TWILIO_PHONE_NUMBER
```

> **참고**: 환경 변수 대신 관리자 설정 UI를 통해 전화 서비스 제공업체를 완전히 구성할 수도 있습니다. Twilio가 아닌 제공업체의 경우 이 방법이 필수입니다. [제공업체 설정 가이드](/docs/deploy/providers)를 참조하세요.

## 4. 전화 서비스 웹훅 구성

전화 서비스 제공업체가 음성 웹훅을 Worker로 보내도록 구성합니다. 웹훅 URL은 제공업체에 관계없이 동일합니다:

- **수신 전화 URL**: `https://your-worker.your-domain.com/telephony/incoming` (POST)
- **상태 콜백 URL**: `https://your-worker.your-domain.com/telephony/status` (POST)

제공업체별 웹훅 설정 안내는 다음을 참조하세요: [Twilio](/docs/deploy/providers/twilio), [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo), [Asterisk](/docs/deploy/providers/asterisk).

로컬 개발 시, 로컬 Worker를 전화 서비스 제공업체에 노출하기 위해 터널(Cloudflare Tunnel 또는 ngrok 등)이 필요합니다.

## 5. 로컬 실행

Worker 개발 서버(백엔드 + 프론트엔드)를 시작합니다:

```bash
# 프론트엔드 자산을 먼저 빌드
bun run build

# Worker 개발 서버 시작
bun run dev:worker
```

앱은 `http://localhost:8787`에서 접속 가능합니다. 2단계에서 생성한 관리자 nsec로 로그인하세요.

## 6. Cloudflare에 배포

```bash
bun run deploy
```

이 명령은 프론트엔드를 빌드하고 Durable Objects와 함께 Worker를 Cloudflare에 배포합니다. 배포 후, 전화 서비스 제공업체의 웹훅 URL을 프로덕션 Worker URL로 업데이트하세요.

## 다음 단계

- [관리자 가이드](/docs/admin-guide) — 자원봉사자 추가, 근무 일정 생성, 설정 구성
- [자원봉사자 가이드](/docs/volunteer-guide) — 자원봉사자에게 공유하세요
- [전화 서비스 제공업체](/docs/deploy/providers) — 제공업체 비교 및 필요시 Twilio에서 전환
- [보안 모델](/security) — 암호화 및 위협 모델 이해
