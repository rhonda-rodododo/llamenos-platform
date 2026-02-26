---
title: Tài liệu
description: Tìm hiểu cách triển khai, cấu hình và sử dụng Llamenos.
guidesHeading: Hướng dẫn
guides:
  - title: Bắt đầu
    description: Yêu cầu tiên quyết, cài đặt, thiết lập dịch vụ điện thoại và triển khai lần đầu.
    href: /docs/getting-started
  - title: Hướng dẫn quản trị viên
    description: Quản lý tình nguyện viên, ca trực, danh sách chặn, trường tùy chỉnh và cài đặt.
    href: /docs/admin-guide
  - title: Hướng dẫn tình nguyện viên
    description: Đăng nhập, nhận cuộc gọi, viết ghi chú và sử dụng tính năng chuyển đổi giọng nói.
    href: /docs/volunteer-guide
  - title: Nhà cung cấp dịch vụ điện thoại
    description: So sánh các nhà cung cấp dịch vụ điện thoại được hỗ trợ và chọn phương án phù hợp nhất cho đường dây nóng của bạn.
    href: /docs/telephony-providers
  - title: "Thiết lập: Twilio"
    description: Hướng dẫn từng bước để cấu hình Twilio làm nhà cung cấp dịch vụ điện thoại.
    href: /docs/setup-twilio
  - title: "Thiết lập: SignalWire"
    description: Hướng dẫn từng bước để cấu hình SignalWire làm nhà cung cấp dịch vụ điện thoại.
    href: /docs/setup-signalwire
  - title: "Thiết lập: Vonage"
    description: Hướng dẫn từng bước để cấu hình Vonage làm nhà cung cấp dịch vụ điện thoại.
    href: /docs/setup-vonage
  - title: "Thiết lập: Plivo"
    description: Hướng dẫn từng bước để cấu hình Plivo làm nhà cung cấp dịch vụ điện thoại.
    href: /docs/setup-plivo
  - title: "Thiết lập: Asterisk (Tự lưu trữ)"
    description: Triển khai Asterisk với cầu nối ARI để đạt mức bảo mật và kiểm soát tối đa.
    href: /docs/setup-asterisk
  - title: Gọi qua trình duyệt WebRTC
    description: Bật tính năng WebRTC để tình nguyện viên có thể nhận cuộc gọi trực tiếp từ trình duyệt.
    href: /docs/webrtc-calling
  - title: Mô hình bảo mật
    description: Hiểu những gì được mã hóa, những gì không và mô hình đe dọa.
    href: /security
---

## Tổng quan kiến trúc

Llamenos là một ứng dụng trang đơn (SPA) được hỗ trợ bởi Cloudflare Workers và Durable Objects. Không cần quản lý máy chủ truyền thống.

| Thành phần | Công nghệ |
|---|---|
| Giao diện | Vite + React + TanStack Router |
| Máy chủ | Cloudflare Workers + Durable Objects |
| Dịch vụ điện thoại | Twilio, SignalWire, Vonage, Plivo hoặc Asterisk (thông qua giao diện TelephonyAdapter) |
| Xác thực | Cặp khóa Nostr (BIP-340 Schnorr) + WebAuthn |
| Mã hóa | ECIES (secp256k1 + XChaCha20-Poly1305) |
| Chuyển đổi giọng nói | Whisper phía máy khách (WASM) |
| Đa ngôn ngữ | i18next (hỗ trợ 12+ ngôn ngữ) |

## Vai trò

| Vai trò | Có thể xem | Có thể thực hiện |
|---|---|---|
| **Người gọi** | Không có gì (điện thoại GSM) | Gọi đến số đường dây nóng |
| **Tình nguyện viên** | Chỉ ghi chú của mình | Nhận cuộc gọi, viết ghi chú trong ca trực |
| **Quản trị viên** | Tất cả ghi chú, nhật ký kiểm toán, dữ liệu cuộc gọi | Quản lý tình nguyện viên, ca trực, danh sách chặn, cài đặt |
