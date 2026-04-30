---
title: "Thiết lập: Signal"
description: Thiết lập kênh tin nhắn Signal qua cầu nối signal-cli cho tin nhắn bảo mật.
---

Llamenos hỗ trợ tin nhắn Signal qua cầu nối [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) tự lưu trữ. Signal cung cấp đảm bảo quyền riêng tư mạnh nhất trong tất cả các kênh tin nhắn, lý tưởng cho các tình huống ứng phó khủng hoảng nhạy cảm.

## Yêu cầu tiên quyết

- Một máy chủ Linux hoặc VM cho cầu nối (có thể cùng máy chủ với Asterisk hoặc riêng biệt)
- Docker đã cài trên máy chủ cầu nối
- Một số điện thoại chuyên dụng cho đăng ký Signal
- Truy cập mạng từ cầu nối đến Cloudflare Worker

## Kiến trúc

![Signal Bridge Architecture](/diagrams/signal-bridge.svg)

Cầu nối signal-cli chạy trên hạ tầng của bạn và chuyển tiếp tin nhắn đến Worker qua HTTP webhook. Điều này có nghĩa bạn kiểm soát toàn bộ đường đi của tin nhắn từ Signal đến ứng dụng.

## 1. Triển khai cầu nối signal-cli

```bash
docker run -d \
  --name signal-cli \
  --restart unless-stopped \
  -p 8080:8080 \
  -v signal-cli-data:/home/.local/share/signal-cli \
  -e MODE=json-rpc \
  bbernhard/signal-cli-rest-api:latest
```

## 2. Đăng ký số điện thoại

```bash
curl -X POST http://localhost:8080/v1/register/+1234567890
curl -X POST http://localhost:8080/v1/register/+1234567890/verify/123456
```

## 3. Cấu hình chuyển tiếp webhook

```bash
curl -X PUT http://localhost:8080/v1/about \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "url": "https://your-worker.your-domain.com/api/messaging/signal/webhook",
      "headers": {
        "Authorization": "Bearer your-webhook-secret"
      }
    }
  }'
```

## 4. Bật Signal trong cài đặt quản trị

Điều hướng đến **Cài đặt quản trị > Kênh tin nhắn** (hoặc sử dụng trình hướng dẫn) và bật **Signal**.

Nhập thông tin:
- **Bridge URL** — URL của cầu nối signal-cli (ví dụ `https://signal-bridge.example.com:8080`)
- **Bridge API Key** — bearer token cho xác thực
- **Webhook Secret** — secret cho xác thực webhook đến (phải khớp với bước 3)
- **Registered Number** — số điện thoại đã đăng ký Signal

## 5. Kiểm thử

Gửi tin nhắn Signal đến số đã đăng ký. Cuộc hội thoại sẽ xuất hiện trong tab **Hội thoại**.

## Giám sát sức khỏe

Llamenos giám sát sức khỏe cầu nối:
- Kiểm tra sức khỏe định kỳ đến endpoint `/v1/about`
- Suy giảm uyển chuyển khi không thể kết nối — các kênh khác tiếp tục hoạt động
- Cảnh báo quản trị viên khi cầu nối ngừng hoạt động

## Chuyển đổi tin nhắn thoại

Tin nhắn thoại Signal có thể được chuyển đổi trực tiếp trong trình duyệt sử dụng Whisper phía máy khách (WASM qua `@huggingface/transformers`). Âm thanh không bao giờ rời khỏi thiết bị.

## Lưu ý bảo mật

- Signal cung cấp mã hóa đầu cuối giữa người dùng và cầu nối
- Cầu nối giải mã tin nhắn để chuyển tiếp — máy chủ cầu nối có quyền truy cập bản rõ
- Xác thực webhook sử dụng bearer token với so sánh thời gian hằng số
- Giữ cầu nối trên cùng mạng với máy chủ Asterisk (nếu có)
- Cầu nối lưu lịch sử tin nhắn trong Docker volume — cân nhắc mã hóa lưu trữ

## Khắc phục sự cố

- **Cầu nối không nhận tin nhắn**: Kiểm tra đăng ký số với `GET /v1/about`
- **Lỗi gửi webhook**: Xác minh URL webhook và authorization header
- **Vấn đề đăng ký**: Một số số có thể cần hủy liên kết khỏi tài khoản Signal hiện có
