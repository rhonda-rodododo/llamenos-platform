---
title: Kiến trúc
description: Tổng quan kiến trúc hệ thống — kho mã nguồn, luồng dữ liệu, lớp mã hóa và giao tiếp thời gian thực.
---

Trang này giải thích cấu trúc của Llamenos, cách dữ liệu lưu chuyển trong hệ thống và nơi mã hóa được áp dụng.

## Cấu trúc kho mã nguồn

Llamenos được chia thành ba kho mã nguồn chia sẻ một giao thức và lõi mật mã chung:

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

- **llamenos** — Ứng dụng desktop (Tauri v2 với Vite + React webview), backend Cloudflare Worker và backend Node.js tự lưu trữ. Đây là kho chính.
- **llamenos-core** — Rust crate chia sẻ triển khai tất cả phép toán mật mã: mã hóa phong bì ECIES, chữ ký Schnorr, dẫn xuất khóa PBKDF2, HKDF và XChaCha20-Poly1305.
- **llamenos-platform** — Ứng dụng React Native cho iOS và Android. Sử dụng UniFFI bindings gọi cùng mã Rust.

Cả ba nền tảng triển khai cùng giao thức wire được định nghĩa trong `docs/protocol/PROTOCOL.md`.

## Luồng dữ liệu

### Cuộc gọi đến

```
Caller (phone)
    |
    v
Telephony Provider (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | HTTP webhook
    v
Worker API  -->  CallRouterDO
    |                |
    |                | Checks ShiftManagerDO for on-shift volunteers
    |                | Initiates parallel ring to all available volunteers
    |                v
    |           Telephony Provider (outbound calls to volunteer phones)
    |
    | First volunteer answers
    v
CallRouterDO  -->  Connects caller and volunteer
    |
    | Call ends
    v
Client (volunteer's browser/app)
    |
    | Encrypts note with per-note key
    | Wraps key via ECIES for self + each admin
    v
Worker API  -->  RecordsDO  (stores encrypted note + wrapped keys)
```

### Tin nhắn đến (SMS / WhatsApp / Signal)

```
Contact (SMS / WhatsApp / Signal)
    |
    | Provider webhook
    v
Worker API  -->  ConversationDO
    |                |
    |                | Encrypts message content immediately
    |                | Wraps symmetric key via ECIES for assigned volunteer + admins
    |                | Discards plaintext
    |                v
    |           Nostr relay (encrypted hub event notifies online clients)
    |
    v
Client (volunteer's browser/app)
    |
    | Decrypts message with own private key
    | Composes reply, encrypts outbound
    v
Worker API  -->  ConversationDO  -->  Messaging Provider (sends reply)
```

## Durable Objects

Backend sử dụng sáu Cloudflare Durable Objects (hoặc tương đương PostgreSQL cho triển khai tự lưu trữ):

| Durable Object | Trách nhiệm |
|---|---|
| **IdentityDO** | Quản lý danh tính tình nguyện viên, khóa công khai, tên hiển thị và thông tin WebAuthn. |
| **SettingsDO** | Lưu cấu hình đường dây nóng: tên, kênh đã bật, thông tin nhà cung cấp, trường tùy chỉnh, cài đặt chống spam. |
| **RecordsDO** | Lưu ghi chú cuộc gọi đã mã hóa, báo cáo và metadata tệp đính kèm. |
| **ShiftManagerDO** | Quản lý lịch ca tuần hoàn, nhóm chuông, phân công ca tình nguyện viên. |
| **CallRouterDO** | Điều phối định tuyến cuộc gọi thời gian thực: chuông song song, kết thúc khi có người nhận đầu tiên, trạng thái nghỉ. |
| **ConversationDO** | Quản lý hội thoại tin nhắn theo luồng qua SMS, WhatsApp và Signal. |

Tất cả DO được truy cập dưới dạng singleton qua `idFromName()` và định tuyến nội bộ bằng `DORouter` nhẹ.

## Ma trận mã hóa

| Dữ liệu | Mã hóa? | Thuật toán | Ai có thể giải mã |
|----------|---------|-----------|-------------------|
| Ghi chú cuộc gọi | Có (E2EE) | XChaCha20-Poly1305 + ECIES envelope | Tác giả + tất cả quản trị viên |
| Trường tùy chỉnh | Có (E2EE) | Như ghi chú | Tác giả + tất cả quản trị viên |
| Báo cáo | Có (E2EE) | Như ghi chú | Tác giả + tất cả quản trị viên |
| Tệp đính kèm | Có (E2EE) | XChaCha20-Poly1305 (luồng) | Tác giả + tất cả quản trị viên |
| Nội dung tin nhắn | Có (E2EE) | XChaCha20-Poly1305 + ECIES envelope | Tình nguyện viên được giao + quản trị viên |
| Bản chuyển đổi | Có (lưu trữ) | XChaCha20-Poly1305 | Người tạo + quản trị viên |
| Hub events (Nostr) | Có (đối xứng) | XChaCha20-Poly1305 với hub key | Tất cả thành viên hub hiện tại |
| Volunteer nsec | Có (lưu trữ) | PBKDF2 + XChaCha20-Poly1305 (PIN) | Chỉ tình nguyện viên |
| Nhật ký kiểm toán | Không (bảo vệ toàn vẹn) | SHA-256 hash chain | Quản trị viên (đọc), hệ thống (ghi) |

### Bảo mật chuyển tiếp cho mỗi ghi chú

Mỗi ghi chú có khóa đối xứng ngẫu nhiên duy nhất. Khóa đó được bọc qua ECIES cho mỗi người đọc được ủy quyền. Xâm phạm khóa một ghi chú không tiết lộ gì về các ghi chú khác.

### Hệ thống phân cấp khóa

```
Volunteer nsec (BIP-340 Schnorr / secp256k1)
    |
    +-- Derives npub (x-only public key, 32 bytes)
    +-- Used for ECIES key agreement (prepend 02 for compressed form)
    +-- Signs Nostr events (Schnorr signature)

Hub key (random 32 bytes, NOT derived from any identity)
    |
    +-- Encrypts real-time Nostr hub events
    +-- ECIES-wrapped per member via LABEL_HUB_KEY_WRAP
    +-- Rotated on member departure

Per-note key (random 32 bytes)
    |
    +-- Encrypts note content via XChaCha20-Poly1305
    +-- ECIES-wrapped per reader (volunteer + each admin)
    +-- Never reused across notes
```

## Giao tiếp thời gian thực

Cập nhật thời gian thực qua Nostr relay:

- **Tự lưu trữ**: strfry relay chạy cùng ứng dụng trong Docker/Kubernetes
- **Cloudflare**: Nosflare (relay dựa trên Cloudflare Workers)

Tất cả sự kiện là tạm thời (kind 20001) và được mã hóa bằng hub key. Relay chỉ thấy blob mã hóa và chữ ký hợp lệ.

## Các lớp bảo mật

### Lớp vận chuyển

- Tất cả giao tiếp client-server qua HTTPS (TLS 1.3)
- WebSocket đến Nostr relay qua WSS
- Content Security Policy (CSP) hạn chế nguồn script, kết nối
- Tauri isolation pattern tách biệt IPC khỏi webview

### Lớp ứng dụng

- Xác thực qua cặp khóa Nostr (chữ ký BIP-340 Schnorr)
- WebAuthn session token cho tiện lợi đa thiết bị
- Kiểm soát truy cập dựa trên vai trò
- 25 hằng số tách biệt miền mật mã trong `crypto-labels.ts`

### Mã hóa lưu trữ

- Ghi chú, báo cáo, tin nhắn và bản chuyển đổi được mã hóa trước khi lưu
- Khóa bí mật tình nguyện viên được mã hóa bằng khóa dẫn xuất PIN (PBKDF2)
- Tauri Stronghold cung cấp kho lưu trữ mã hóa trên desktop
- Toàn vẹn nhật ký kiểm toán được bảo vệ bằng chuỗi băm SHA-256

### Xác minh bản dựng

- Bản dựng tái tạo được qua `Dockerfile.build` với `SOURCE_DATE_EPOCH`
- Tên file băm nội dung cho tài nguyên frontend
- `CHECKSUMS.txt` xuất bản cùng GitHub Releases
- Chứng nhận nguồn gốc SLSA
- Script xác minh: `scripts/verify-build.sh`

## Khác biệt nền tảng

| Tính năng | Desktop (Tauri) | Mobile (React Native) | Browser (Cloudflare) |
|-----------|----------------|----------------------|---------------------|
| Backend mật mã | Rust gốc (qua IPC) | Rust gốc (qua UniFFI) | WASM (llamenos-core) |
| Lưu trữ khóa | Tauri Stronghold (mã hóa) | Secure Enclave / Keystore | Browser localStorage (mã hóa PIN) |
| Chuyển đổi giọng nói | Whisper phía máy khách (WASM) | Không khả dụng | Whisper phía máy khách (WASM) |
| Cập nhật tự động | Tauri updater | App Store / Play Store | Tự động (CF Workers) |
| Thông báo đẩy | OS gốc (Tauri notification) | OS gốc (FCM/APNS) | Thông báo trình duyệt |
| Hỗ trợ ngoại tuyến | Hạn chế (cần API) | Hạn chế (cần API) | Hạn chế (cần API) |
