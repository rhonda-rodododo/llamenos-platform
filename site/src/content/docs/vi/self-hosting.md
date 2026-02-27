---
title: Tổng quan tự lưu trữ
description: Triển khai Llamenos trên hạ tầng riêng với Docker Compose hoặc Kubernetes.
---

Llamenos có thể chạy trên Cloudflare Workers **hoặc** trên hạ tầng riêng của bạn. Tự lưu trữ cho phép bạn kiểm soát hoàn toàn vị trí dữ liệu, cách ly mạng và lựa chọn hạ tầng — quan trọng cho các tổ chức không thể sử dụng nền tảng đám mây của bên thứ ba hoặc cần đáp ứng các yêu cầu tuân thủ nghiêm ngặt.

## Tùy chọn triển khai

| Tùy chọn | Phù hợp nhất cho | Độ phức tạp | Khả năng mở rộng |
|----------|-----------------|-------------|-------------------|
| [Cloudflare Workers](/docs/getting-started) | Bắt đầu dễ nhất, edge toàn cầu | Thấp | Tự động |
| [Docker Compose](/docs/deploy-docker) | Tự lưu trữ trên một máy chủ | Trung bình | Đơn nút |
| [Kubernetes (Helm)](/docs/deploy-kubernetes) | Điều phối đa dịch vụ | Cao hơn | Mở rộng ngang (đa bản sao) |

## Khác biệt kiến trúc

Cả hai mục tiêu triển khai chạy **cùng một mã ứng dụng**. Sự khác biệt nằm ở lớp hạ tầng:

| Thành phần | Cloudflare | Tự lưu trữ |
|------------|------------|-------------|
| **Backend runtime** | Cloudflare Workers | Node.js (qua Hono) |
| **Lưu trữ dữ liệu** | Durable Objects (KV) | PostgreSQL |
| **Blob storage** | R2 | MinIO (tương thích S3) |
| **Chuyển đổi giọng nói** | Whisper phía máy khách (WASM) | Whisper phía máy khách (WASM) |
| **File tĩnh** | Workers Assets | Caddy / Hono serveStatic |
| **Sự kiện thời gian thực** | Nostr relay (Nosflare) | Nostr relay (strfry) |
| **TLS termination** | Cloudflare edge | Caddy (HTTPS tự động) |
| **Chi phí** | Theo sử dụng (có gói miễn phí) | Chi phí máy chủ của bạn |

## Yêu cầu

### Yêu cầu tối thiểu

- Một máy chủ Linux (tối thiểu 2 lõi CPU, 2 GB RAM)
- Docker và Docker Compose v2 (hoặc cụm Kubernetes cho Helm)
- Một tên miền trỏ đến máy chủ
- Một cặp khóa quản trị (tạo bằng `bun run bootstrap-admin`)
- Ít nhất một kênh liên lạc (nhà cung cấp thoại, SMS, v.v.)

### Thành phần tùy chọn

- **Whisper transcription** — cần 4 GB+ RAM (CPU) hoặc GPU
- **Asterisk** — cho SIP tự lưu trữ (xem [Thiết lập Asterisk](/docs/setup-asterisk))
- **Signal bridge** — cho tin nhắn Signal (xem [Thiết lập Signal](/docs/setup-signal))

## So sánh nhanh

**Chọn Docker Compose nếu:**
- Bạn chạy trên một máy chủ hoặc VPS
- Bạn muốn thiết lập tự lưu trữ đơn giản nhất
- Bạn quen với Docker cơ bản

**Chọn Kubernetes (Helm) nếu:**
- Bạn đã có cụm K8s
- Bạn cần mở rộng ngang (nhiều bản sao)
- Bạn muốn tích hợp với công cụ K8s hiện có (cert-manager, external-secrets, v.v.)

## Cân nhắc bảo mật

Tự lưu trữ cho bạn nhiều quyền kiểm soát hơn nhưng cũng nhiều trách nhiệm hơn:

- **Mã hóa dữ liệu lưu trữ**: Dữ liệu PostgreSQL không được mã hóa mặc định. Sử dụng mã hóa toàn đĩa (LUKS, dm-crypt) hoặc bật PostgreSQL TDE. Ghi chú cuộc gọi và bản chuyển đổi đã được mã hóa E2EE — máy chủ không bao giờ thấy bản rõ.
- **Bảo mật mạng**: Sử dụng tường lửa. Chỉ cổng 80/443 nên được công khai.
- **Secrets**: Không bao giờ đặt secrets trong Docker Compose files hoặc version control. Sử dụng file `.env` hoặc Docker/Kubernetes secrets.
- **Cập nhật**: Thường xuyên kéo image mới. Theo dõi [changelog](https://github.com/your-org/llamenos/blob/main/CHANGELOG.md).
- **Sao lưu**: Thường xuyên sao lưu PostgreSQL và MinIO. Xem phần sao lưu trong mỗi hướng dẫn triển khai.

## Bước tiếp theo

- [Triển khai Docker Compose](/docs/deploy-docker) — chạy trong 10 phút
- [Triển khai Kubernetes](/docs/deploy-kubernetes) — triển khai với Helm
- [Bắt đầu](/docs/getting-started) — triển khai Cloudflare Workers
