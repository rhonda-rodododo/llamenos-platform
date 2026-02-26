---
title: 문서
description: Llamenos를 배포, 구성 및 사용하는 방법을 알아보세요.
guidesHeading: 가이드
guides:
  - title: 시작하기
    description: 사전 요구 사항, 설치, 전화 서비스 설정 및 첫 번째 배포.
    href: /docs/getting-started
  - title: 관리자 가이드
    description: 자원봉사자, 근무 일정, 차단 목록, 사용자 정의 필드 및 설정을 관리합니다.
    href: /docs/admin-guide
  - title: 자원봉사자 가이드
    description: 로그인, 전화 수신, 메모 작성 및 음성 변환 기능 사용법.
    href: /docs/volunteer-guide
  - title: 전화 서비스 제공업체
    description: 지원되는 전화 서비스 제공업체를 비교하고 핫라인에 가장 적합한 업체를 선택하세요.
    href: /docs/telephony-providers
  - title: "설정: Twilio"
    description: Twilio를 전화 서비스 제공업체로 구성하는 단계별 가이드.
    href: /docs/setup-twilio
  - title: "설정: SignalWire"
    description: SignalWire를 전화 서비스 제공업체로 구성하는 단계별 가이드.
    href: /docs/setup-signalwire
  - title: "설정: Vonage"
    description: Vonage를 전화 서비스 제공업체로 구성하는 단계별 가이드.
    href: /docs/setup-vonage
  - title: "설정: Plivo"
    description: Plivo를 전화 서비스 제공업체로 구성하는 단계별 가이드.
    href: /docs/setup-plivo
  - title: "설정: Asterisk (자체 호스팅)"
    description: 최대의 개인정보 보호와 제어를 위해 ARI 브리지와 함께 Asterisk를 배포합니다.
    href: /docs/setup-asterisk
  - title: WebRTC 브라우저 통화
    description: WebRTC를 사용하여 자원봉사자가 브라우저에서 전화를 받을 수 있도록 설정합니다.
    href: /docs/webrtc-calling
  - title: 보안 모델
    description: 무엇이 암호화되고 무엇이 되지 않는지, 그리고 위협 모델을 이해합니다.
    href: /security
---

## 아키텍처 개요

Llamenos는 Cloudflare Workers와 Durable Objects를 기반으로 하는 단일 페이지 애플리케이션(SPA)입니다. 전통적인 서버를 관리할 필요가 없습니다.

| 구성 요소 | 기술 |
|---|---|
| 프론트엔드 | Vite + React + TanStack Router |
| 백엔드 | Cloudflare Workers + Durable Objects |
| 전화 서비스 | Twilio, SignalWire, Vonage, Plivo 또는 Asterisk (TelephonyAdapter 인터페이스를 통해) |
| 인증 | Nostr 키 쌍 (BIP-340 Schnorr) + WebAuthn |
| 암호화 | ECIES (secp256k1 + XChaCha20-Poly1305) |
| 음성 변환 | 클라이언트측 Whisper (WASM) |
| 국제화 | i18next (12개 이상의 언어) |

## 역할

| 역할 | 볼 수 있는 것 | 할 수 있는 것 |
|---|---|---|
| **발신자** | 없음 (GSM 전화) | 핫라인 번호로 전화 걸기 |
| **자원봉사자** | 본인의 메모만 | 근무 중 전화 수신, 메모 작성 |
| **관리자** | 모든 메모, 감사 로그, 통화 데이터 | 자원봉사자, 근무 일정, 차단 목록, 설정 관리 |
