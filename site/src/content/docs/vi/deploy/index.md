---
title: Bắt đầu
description: Triển khai đường dây nóng Llamenos của riêng bạn trong vòng một giờ.
---

Triển khai đường dây nóng Llamenos của riêng bạn trong vòng một giờ. Bạn sẽ cần một tài khoản Cloudflare, một tài khoản nhà cung cấp dịch vụ điện thoại và một máy tính đã cài đặt Bun.

## Yêu cầu tiên quyết

- [Bun](https://bun.sh) phiên bản v1.0 trở lên (runtime và trình quản lý gói)
- Một tài khoản [Cloudflare](https://www.cloudflare.com) (gói miễn phí đủ dùng cho phát triển)
- Một tài khoản nhà cung cấp dịch vụ điện thoại — [Twilio](https://www.twilio.com) là lựa chọn dễ bắt đầu nhất, nhưng Llamenos cũng hỗ trợ [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo) và [Asterisk tự lưu trữ](/docs/deploy/providers/asterisk). Xem trang [So sánh nhà cung cấp dịch vụ điện thoại](/docs/deploy/providers) để được hỗ trợ lựa chọn.
- Git

## 1. Sao chép và cài đặt

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
bun install
```

## 2. Tạo cặp khóa quản trị viên

Tạo một cặp khóa Nostr cho tài khoản quản trị viên. Thao tác này tạo ra một khóa bí mật (nsec) và khóa công khai (npub/hex).

```bash
bun run bootstrap-admin
```

Hãy lưu trữ `nsec` một cách an toàn — đây là thông tin đăng nhập quản trị viên của bạn. Bạn sẽ cần khóa công khai dạng hex cho bước tiếp theo.

## 3. Cấu hình khóa bí mật

Tạo một tệp `.dev.vars` tại thư mục gốc của dự án cho phát triển cục bộ. Ví dụ này sử dụng Twilio — nếu bạn sử dụng nhà cung cấp khác, bạn có thể bỏ qua các biến Twilio và cấu hình nhà cung cấp của bạn qua giao diện quản trị sau lần đăng nhập đầu tiên.

```bash
# .dev.vars
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
ADMIN_PUBKEY=your_hex_public_key_from_step_2
ENVIRONMENT=development
```

Đối với môi trường sản xuất, hãy đặt các giá trị này làm Wrangler secret:

```bash
bunx wrangler secret put ADMIN_PUBKEY
# Nếu sử dụng Twilio làm nhà cung cấp mặc định qua biến môi trường:
bunx wrangler secret put TWILIO_ACCOUNT_SID
bunx wrangler secret put TWILIO_AUTH_TOKEN
bunx wrangler secret put TWILIO_PHONE_NUMBER
```

> **Lưu ý**: Bạn cũng có thể cấu hình nhà cung cấp dịch vụ điện thoại hoàn toàn thông qua giao diện quản trị thay vì sử dụng biến môi trường. Điều này là bắt buộc đối với các nhà cung cấp không phải Twilio. Xem [hướng dẫn thiết lập cho nhà cung cấp của bạn](/docs/deploy/providers).

## 4. Cấu hình webhook dịch vụ điện thoại

Cấu hình nhà cung cấp dịch vụ điện thoại để gửi webhook thoại đến Worker của bạn. URL webhook giống nhau bất kể nhà cung cấp nào:

- **URL cuộc gọi đến**: `https://your-worker.your-domain.com/telephony/incoming` (POST)
- **URL callback trạng thái**: `https://your-worker.your-domain.com/telephony/status` (POST)

Để xem hướng dẫn thiết lập webhook theo từng nhà cung cấp, hãy tham khảo: [Twilio](/docs/deploy/providers/twilio), [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo), hoặc [Asterisk](/docs/deploy/providers/asterisk).

Khi phát triển cục bộ, bạn sẽ cần một đường hầm (như Cloudflare Tunnel hoặc ngrok) để cho phép nhà cung cấp dịch vụ điện thoại truy cập Worker cục bộ của bạn.

## 5. Chạy cục bộ

Khởi động máy chủ phát triển Worker (backend + frontend):

```bash
# Xây dựng tài nguyên frontend trước
bun run build

# Khởi động máy chủ phát triển Worker
bun run dev:worker
```

Ứng dụng sẽ có sẵn tại `http://localhost:8787`. Đăng nhập bằng nsec quản trị viên từ bước 2.

## 6. Triển khai lên Cloudflare

```bash
bun run deploy
```

Lệnh này xây dựng frontend và triển khai Worker cùng Durable Objects lên Cloudflare. Sau khi triển khai, hãy cập nhật URL webhook của nhà cung cấp dịch vụ điện thoại để trỏ đến URL Worker sản xuất.

## Các bước tiếp theo

- [Hướng dẫn quản trị viên](/docs/admin-guide) — thêm tình nguyện viên, tạo ca trực, cấu hình cài đặt
- [Hướng dẫn tình nguyện viên](/docs/volunteer-guide) — chia sẻ với tình nguyện viên của bạn
- [Nhà cung cấp dịch vụ điện thoại](/docs/deploy/providers) — so sánh nhà cung cấp và chuyển đổi từ Twilio nếu cần
- [Mô hình bảo mật](/security) — hiểu mô hình mã hóa và đe dọa
