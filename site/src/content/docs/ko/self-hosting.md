---
title: 자체 호스팅 개요
description: Docker Compose 또는 Kubernetes를 사용하여 자체 인프라에 Llamenos를 배포합니다.
---

Llamenos는 Cloudflare Workers **또는** 자체 인프라에서 실행할 수 있습니다. 자체 호스팅은 데이터 거주지, 네트워크 격리 및 인프라 선택에 대한 완전한 제어를 제공합니다 — 타사 클라우드 플랫폼을 사용할 수 없거나 엄격한 규정 준수 요건을 충족해야 하는 조직에 중요합니다.

## 배포 옵션

| 옵션 | 적합한 용도 | 복잡도 | 스케일링 |
|------|-------------|--------|----------|
| [Cloudflare Workers](/docs/getting-started) | 가장 쉬운 시작, 글로벌 엣지 | 낮음 | 자동 |
| [Docker Compose](/docs/deploy-docker) | 단일 서버 자체 호스팅 | 중간 | 단일 노드 |
| [Kubernetes (Helm)](/docs/deploy-kubernetes) | 멀티 서비스 오케스트레이션 | 높음 | 수평 확장 (다중 복제본) |

## 아키텍처 차이점

두 배포 대상 모두 **동일한 애플리케이션 코드**를 실행합니다. 차이점은 인프라 계층에 있습니다:

| 구성 요소 | Cloudflare | 자체 호스팅 |
|-----------|------------|-------------|
| **백엔드 런타임** | Cloudflare Workers | Node.js (via Hono) |
| **데이터 스토리지** | Durable Objects (KV) | PostgreSQL |
| **Blob 스토리지** | R2 | MinIO (S3-compatible) |
| **음성 변환** | 클라이언트측 Whisper (WASM) | 클라이언트측 Whisper (WASM) |
| **정적 파일** | Workers Assets | Caddy / Hono serveStatic |
| **실시간 이벤트** | Nostr relay (Nosflare) | Nostr relay (strfry) |
| **TLS 종단** | Cloudflare 엣지 | Caddy (자동 HTTPS) |
| **비용** | 사용량 기반 (무료 티어 제공) | 서버 비용 |

## 필요 사항

### 최소 요구 사항

- Linux 서버 (2 CPU 코어, 최소 2 GB RAM)
- Docker 및 Docker Compose v2 (또는 Helm용 Kubernetes 클러스터)
- 서버를 가리키는 도메인 이름
- 관리자 키 쌍 (`bun run bootstrap-admin`으로 생성)
- 최소 하나의 통신 채널 (음성 서비스 제공업체, SMS 등)

### 선택적 구성 요소

- **Whisper 음성 변환** — 4 GB 이상 RAM 필요 (CPU) 또는 더 빠른 처리를 위한 GPU
- **Asterisk** — 자체 호스팅 SIP 전화 서비스 ([Asterisk 설정](/docs/setup-asterisk) 참조)
- **Signal 브리지** — Signal 메시징 ([Signal 설정](/docs/setup-signal) 참조)

## 빠른 비교

**다음의 경우 Docker Compose를 선택하세요:**
- 단일 서버 또는 VPS에서 운영하는 경우
- 가장 간단한 자체 호스팅 설정을 원하는 경우
- Docker 기본 사항에 익숙한 경우

**다음의 경우 Kubernetes (Helm)를 선택하세요:**
- 이미 K8s 클러스터가 있는 경우
- 수평 확장(다중 복제본)이 필요한 경우
- 기존 K8s 도구(cert-manager, external-secrets 등)와 통합하려는 경우

## 보안 고려 사항

자체 호스팅은 더 많은 제어권을 제공하지만 더 많은 책임도 수반합니다:

- **저장 시 데이터**: PostgreSQL 데이터는 기본적으로 암호화되지 않고 저장됩니다. 서버에서 전체 디스크 암호화(LUKS, dm-crypt)를 사용하거나, 사용 가능한 경우 PostgreSQL TDE를 활성화하세요. 통화 메모와 음성 변환 기록은 이미 E2EE로 보호됩니다 — 서버는 평문을 볼 수 없습니다.
- **네트워크 보안**: 방화벽을 사용하여 접근을 제한하세요. 포트 80/443만 공개적으로 접근 가능해야 합니다.
- **시크릿**: Docker Compose 파일이나 버전 관리에 시크릿을 넣지 마세요. `.env` 파일(이미지에서 제외) 또는 Docker/Kubernetes 시크릿을 사용하세요.
- **업데이트**: 정기적으로 새 이미지를 가져오세요. 보안 수정 사항은 [변경 로그](https://github.com/your-org/llamenos/blob/main/CHANGELOG.md)를 확인하세요.
- **백업**: PostgreSQL 데이터베이스와 MinIO 스토리지를 정기적으로 백업하세요. 각 배포 가이드의 백업 섹션을 참조하세요.

## 다음 단계

- [Docker Compose 배포](/docs/deploy-docker) — 10분 만에 시작하기
- [Kubernetes 배포](/docs/deploy-kubernetes) — Helm으로 배포
- [시작하기](/docs/getting-started) — Cloudflare Workers 배포
