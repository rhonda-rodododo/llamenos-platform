---
title: 아키텍처
description: 시스템 아키텍처 개요 — 저장소, 데이터 흐름, 암호화 계층 및 실시간 통신.
---

이 페이지에서는 Llamenos의 구조, 데이터가 시스템을 통해 흐르는 방식, 그리고 어디에 암호화가 적용되는지 설명합니다.

## 저장소 구조

Llamenos는 공통 프로토콜과 암호화 코어를 공유하는 세 개의 저장소로 나뉩니다:

```
llamenos              llamenos-core           llamenos-platform
(Desktop + API)       (Shared Crypto)         (Mobile App)
+--------------+      +--------------+        +--------------+
| Tauri v2     |      | Rust crate   |        | React Native |
| Vite + React |      | - Native lib |        | iOS + Android|
| CF Workers   |      | - WASM pkg   |        | UniFFI bind  |
| Durable Objs |      | - UniFFI     |        |              |
+--------------+      +--------------+        +--------------+
       |                  ^      ^                   |
       |  path dep        |      |    UniFFI         |
       +------------------+      +-------------------+
```

- **llamenos** — 데스크톱 애플리케이션 (Vite + React 웹뷰를 포함한 Tauri v2), Cloudflare Worker 백엔드 및 자체 호스팅 Node.js 백엔드. 이것이 주 저장소입니다.
- **llamenos-core** — 모든 암호화 작업을 구현하는 공유 Rust 크레이트: ECIES 봉투 암호화, Schnorr 서명, PBKDF2 키 파생, HKDF, XChaCha20-Poly1305. 네이티브 코드(Tauri용), WASM(브라우저용), UniFFI 바인딩(모바일용)으로 컴파일됩니다.
- **llamenos-platform** — iOS 및 Android용 React Native 모바일 애플리케이션. UniFFI 바인딩을 사용하여 동일한 Rust 암호화 코드를 호출합니다.

세 플랫폼 모두 `docs/protocol/PROTOCOL.md`에 정의된 동일한 와이어 프로토콜을 구현합니다.

## 데이터 흐름

### 수신 전화

```
발신자 (전화)
    |
    v
전화 서비스 제공업체 (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | HTTP webhook
    v
Worker API  -->  CallRouterDO
    |                |
    |                | ShiftManagerDO에서 근무 중인 자원봉사자 확인
    |                | 가용한 모든 자원봉사자에게 동시 호출 시작
    |                v
    |           전화 서비스 제공업체 (자원봉사자 전화로 발신 통화)
    |
    | 첫 번째 자원봉사자 응답
    v
CallRouterDO  -->  발신자와 자원봉사자 연결
    |
    | 통화 종료
    v
클라이언트 (자원봉사자의 브라우저/앱)
    |
    | 개별 메모 키로 메모 암호화
    | ECIES로 자신 + 각 관리자용 키 래핑
    v
Worker API  -->  RecordsDO  (암호화된 메모 + 래핑된 키 저장)
```

### 수신 메시지 (SMS / WhatsApp / Signal)

```
연락처 (SMS / WhatsApp / Signal)
    |
    | 제공업체 웹훅
    v
Worker API  -->  ConversationDO
    |                |
    |                | 메시지 내용 즉시 암호화
    |                | 배정된 자원봉사자 + 관리자용 ECIES로 대칭 키 래핑
    |                | 평문 폐기
    |                v
    |           Nostr relay (암호화된 허브 이벤트가 온라인 클라이언트에 알림)
    |
    v
클라이언트 (자원봉사자의 브라우저/앱)
    |
    | 자신의 개인 키로 메시지 복호화
    | 답장 작성, 발신 암호화
    v
Worker API  -->  ConversationDO  -->  메시징 제공업체 (답장 전송)
```

## Durable Objects

백엔드는 6개의 Cloudflare Durable Objects (또는 자체 호스팅 배포의 PostgreSQL 동등 기능)를 사용합니다:

| Durable Object | 역할 |
|---|---|
| **IdentityDO** | 자원봉사자 신원, 공개 키, 표시 이름 및 WebAuthn 자격 증명 관리. 초대 생성 및 사용 처리. |
| **SettingsDO** | 핫라인 설정 저장: 이름, 활성화된 채널, 제공업체 자격 증명, 사용자 정의 메모 필드, 스팸 방지 설정, 기능 플래그. |
| **RecordsDO** | 암호화된 통화 메모, 암호화된 신고서 및 파일 첨부 메타데이터 저장. 암호화된 메타데이터에 대한 메모 검색 처리. |
| **ShiftManagerDO** | 반복 근무 일정, 벨 그룹, 자원봉사자 근무 배정 관리. 주어진 시간에 누가 근무 중인지 결정. |
| **CallRouterDO** | 실시간 통화 라우팅 오케스트레이션: 동시 호출, 첫 응답 시 종료, 휴식 상태, 활성 통화 추적. TwiML/제공업체 응답 생성. |
| **ConversationDO** | SMS, WhatsApp, Signal에 걸친 스레드형 메시징 대화 관리. 수신 시 메시지 암호화, 대화 배정 및 발신 답장 처리. |

모든 DO는 `idFromName()`을 통해 싱글톤으로 접근하며 경량 `DORouter` (메서드 + 경로 패턴 매칭)를 사용하여 내부적으로 라우팅됩니다.

## 암호화 매트릭스

| 데이터 | 암호화? | 알고리즘 | 복호화 가능 대상 |
|--------|---------|----------|------------------|
| 통화 메모 | 예 (E2EE) | XChaCha20-Poly1305 + ECIES envelope | 메모 작성자 + 모든 관리자 |
| 메모 사용자 정의 필드 | 예 (E2EE) | 메모와 동일 | 메모 작성자 + 모든 관리자 |
| 신고서 | 예 (E2EE) | 메모와 동일 | 신고 작성자 + 모든 관리자 |
| 신고서 첨부 파일 | 예 (E2EE) | XChaCha20-Poly1305 (스트리밍) | 신고 작성자 + 모든 관리자 |
| 메시지 내용 | 예 (E2EE) | XChaCha20-Poly1305 + ECIES envelope | 배정된 자원봉사자 + 모든 관리자 |
| 음성 변환 기록 | 예 (at-rest) | XChaCha20-Poly1305 | 변환 생성자 + 모든 관리자 |
| 허브 이벤트 (Nostr) | 예 (대칭) | XChaCha20-Poly1305 with hub key | 모든 현재 허브 멤버 |
| 자원봉사자 nsec | 예 (at-rest) | PBKDF2 + XChaCha20-Poly1305 (PIN) | 자원봉사자 본인만 |
| 감사 로그 항목 | 아니오 (무결성 보호) | SHA-256 hash chain | 관리자 (읽기), 시스템 (쓰기) |
| 발신자 전화번호 | 아니오 (서버측만) | N/A | 서버 + 관리자 |
| 자원봉사자 전화번호 | IdentityDO에 저장 | N/A | 관리자만 |

### 개별 메모 전방 비밀성

각 메모 또는 메시지는 고유한 랜덤 대칭 키를 받습니다. 해당 키는 각 인가된 독자에 대해 개별적으로 ECIES (secp256k1 임시 키 + HKDF + XChaCha20-Poly1305)를 통해 래핑됩니다. 하나의 메모 키가 유출되어도 다른 메모에 대해서는 아무것도 노출되지 않습니다. 콘텐츠 암호화를 위한 장기 대칭 키는 없습니다.

### 키 계층 구조

```
자원봉사자 nsec (BIP-340 Schnorr / secp256k1)
    |
    +-- npub 파생 (x-only 공개 키, 32바이트)
    |
    +-- ECIES 키 합의에 사용 (압축 형식을 위해 02 접두사)
    |
    +-- Nostr 이벤트 서명 (Schnorr 서명)

허브 키 (랜덤 32바이트, 어떤 신원 키에서도 파생되지 않음)
    |
    +-- 실시간 Nostr 허브 이벤트 암호화
    |
    +-- LABEL_HUB_KEY_WRAP을 통해 멤버별 ECIES 래핑
    |
    +-- 멤버 탈퇴 시 순환

개별 메모 키 (랜덤 32바이트)
    |
    +-- XChaCha20-Poly1305로 메모 내용 암호화
    |
    +-- 독자별 ECIES 래핑 (자원봉사자 + 각 관리자)
    |
    +-- 메모 간 재사용하지 않음
```

## 실시간 통신

실시간 업데이트 (새 통화, 메시지, 근무 변경, 접속 상태)는 Nostr relay를 통해 흐릅니다:

- **자체 호스팅**: Docker/Kubernetes에서 앱과 함께 실행되는 strfry relay
- **Cloudflare**: Nosflare (Cloudflare Workers 기반 relay)

모든 이벤트는 임시(kind 20001)이며 허브 키로 암호화됩니다. 이벤트는 일반 태그(`["t", "llamenos:event"]`)를 사용하므로 relay는 이벤트 유형을 구분할 수 없습니다. content 필드에는 XChaCha20-Poly1305 암호문이 포함됩니다.

### 이벤트 흐름

```
클라이언트 A (자원봉사자 액션)
    |
    | 허브 키로 이벤트 내용 암호화
    | Nostr 이벤트로 서명 (Schnorr)
    v
Nostr relay (strfry / Nosflare)
    |
    | 구독자에게 브로드캐스트
    v
클라이언트 B, C, D...
    |
    | Schnorr 서명 검증
    | 허브 키로 내용 복호화
    v
로컬 UI 상태 업데이트
```

relay는 암호화된 블롭과 유효한 서명을 볼 수 있지만 이벤트 내용을 읽거나 어떤 작업이 수행되고 있는지 판별할 수 없습니다.

## 보안 계층

### 전송 계층

- 모든 클라이언트-서버 통신은 HTTPS (TLS 1.3) 사용
- Nostr relay에 대한 WebSocket 연결은 WSS 사용
- Content Security Policy (CSP)는 스크립트 소스, 연결 및 프레임 상위를 제한
- Tauri isolation 패턴은 IPC를 웹뷰에서 분리

### 애플리케이션 계층

- Nostr 키 쌍(BIP-340 Schnorr 서명)을 통한 인증
- 다중 디바이스 편의를 위한 WebAuthn 세션 토큰
- 역할 기반 접근 제어 (발신자, 자원봉사자, 신고자, 관리자)
- `crypto-labels.ts`에 정의된 25개의 암호화 도메인 분리 상수가 교차 프로토콜 공격을 방지

### 저장 시 암호화

- 통화 메모, 신고서, 메시지 및 음성 변환 기록은 저장 전 암호화
- 자원봉사자 비밀 키는 PIN 파생 키(PBKDF2)로 암호화
- Tauri Stronghold는 데스크톱에서 암호화된 볼트 저장소 제공
- 감사 로그 무결성은 SHA-256 해시 체인으로 보호

### 빌드 검증

- `SOURCE_DATE_EPOCH`이 포함된 `Dockerfile.build`을 통한 재현 가능한 빌드
- 프론트엔드 에셋의 콘텐츠 해시 파일명
- GitHub Releases에 `CHECKSUMS.txt` 공개
- SLSA 출처 증명
- 검증 스크립트: `scripts/verify-build.sh`

## 플랫폼 차이점

| 기능 | 데스크톱 (Tauri) | 모바일 (React Native) | 브라우저 (Cloudflare) |
|------|-----------------|----------------------|----------------------|
| 암호화 백엔드 | 네이티브 Rust (IPC 경유) | 네이티브 Rust (UniFFI 경유) | WASM (llamenos-core) |
| 키 저장소 | Tauri Stronghold (암호화) | Secure Enclave / Keystore | 브라우저 localStorage (PIN 암호화) |
| 음성 변환 | 클라이언트측 Whisper (WASM) | 불가 | 클라이언트측 Whisper (WASM) |
| 자동 업데이트 | Tauri updater | App Store / Play Store | 자동 (CF Workers) |
| 푸시 알림 | OS 네이티브 (Tauri notification) | OS 네이티브 (FCM/APNS) | 브라우저 알림 |
| 오프라인 지원 | 제한적 (API 필요) | 제한적 (API 필요) | 제한적 (API 필요) |
