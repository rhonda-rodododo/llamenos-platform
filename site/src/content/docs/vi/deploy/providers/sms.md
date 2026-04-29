---
title: "Thiết lập: SMS"
description: Bật tin nhắn SMS đến và đi qua nhà cung cấp dịch vụ điện thoại.
---

Tin nhắn SMS trong Llamenos sử dụng lại thông tin xác thực nhà cung cấp dịch vụ thoại hiện có. Không cần dịch vụ SMS riêng — nếu bạn đã cấu hình Twilio, SignalWire, Vonage hoặc Plivo cho thoại, SMS hoạt động với cùng tài khoản.

## Nhà cung cấp được hỗ trợ

| Nhà cung cấp | Hỗ trợ SMS | Ghi chú |
|-------------|-----------|---------|
| **Twilio** | Có | SMS hai chiều đầy đủ qua Twilio Messaging API |
| **SignalWire** | Có | Tương thích Twilio API — cùng giao diện |
| **Vonage** | Có | SMS qua Vonage REST API |
| **Plivo** | Có | SMS qua Plivo Message API |
| **Asterisk** | Không | Asterisk không hỗ trợ SMS gốc |

## 1. Bật SMS trong cài đặt quản trị

Điều hướng đến **Cài đặt quản trị > Kênh tin nhắn** và bật **SMS**.

Cấu hình:
- **Tin nhắn tự động trả lời** — tin nhắn chào mừng tùy chọn
- **Trả lời ngoài giờ** — tin nhắn tùy chọn ngoài giờ ca trực

## 2. Cấu hình webhook

```
POST https://your-worker.your-domain.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. Vào Twilio Console > Phone Numbers > Active Numbers
2. Chọn số điện thoại
3. Trong **Messaging**, đặt webhook URL cho "A message comes in"
4. Đặt HTTP method thành **POST**

### Vonage

1. Vào Vonage API Dashboard > Applications
2. Chọn ứng dụng
3. Trong **Messages**, đặt Inbound URL

### Plivo

1. Vào Plivo Console > Messaging > Applications
2. Tạo hoặc chỉnh sửa messaging application
3. Đặt Message URL
4. Gán ứng dụng cho số điện thoại

## 3. Kiểm thử

Gửi SMS đến số đường dây nóng. Cuộc hội thoại sẽ xuất hiện trong tab **Hội thoại**.

## Cách hoạt động

1. SMS đến nhà cung cấp, nhà cung cấp gửi webhook đến Worker
2. Worker xác thực chữ ký webhook (HMAC theo nhà cung cấp)
3. Tin nhắn được phân tích và lưu vào ConversationDO
4. Tình nguyện viên đang trực được thông báo qua Nostr relay
5. Tình nguyện viên trả lời từ tab Hội thoại — phản hồi gửi qua SMS API của nhà cung cấp

## Lưu ý bảo mật

- Tin nhắn SMS truyền qua mạng nhà mạng dưới dạng bản rõ — nhà cung cấp và nhà mạng có thể đọc
- Tin nhắn đến được lưu trong ConversationDO sau khi nhận
- Số điện thoại người gửi được băm trước khi lưu (bảo vệ quyền riêng tư)
- Chữ ký webhook được xác thực theo nhà cung cấp (HMAC-SHA1 cho Twilio, v.v.)
