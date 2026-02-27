---
title: "Thiết lập: WhatsApp"
description: Kết nối WhatsApp Business qua Meta Cloud API cho tin nhắn được mã hóa.
---

Llamenos hỗ trợ tin nhắn WhatsApp Business qua Meta Cloud API (Graph API v21.0). WhatsApp cho phép tin nhắn đa phương tiện với hỗ trợ văn bản, hình ảnh, tài liệu, âm thanh và tin nhắn tương tác.

## Yêu cầu tiên quyết

- Một [tài khoản Meta Business](https://business.facebook.com)
- Số điện thoại WhatsApp Business API
- Một ứng dụng Meta developer đã bật sản phẩm WhatsApp

## Chế độ tích hợp

### Meta Direct (khuyến nghị)

Kết nối trực tiếp đến Meta Cloud API. Kiểm soát hoàn toàn và đầy đủ tính năng.

**Thông tin xác thực cần thiết:**
- **Phone Number ID** — ID số điện thoại WhatsApp Business
- **Business Account ID** — ID tài khoản Meta Business
- **Access Token** — token truy cập Meta API dài hạn
- **Verify Token** — chuỗi tùy chỉnh cho xác minh webhook
- **App Secret** — app secret Meta (cho xác thực chữ ký webhook)

### Chế độ Twilio

Nếu đã dùng Twilio cho thoại, có thể định tuyến WhatsApp qua Twilio. Thiết lập đơn giản hơn nhưng một số tính năng có thể bị giới hạn.

## 1. Tạo ứng dụng Meta

1. Vào [developers.facebook.com](https://developers.facebook.com)
2. Tạo ứng dụng mới (loại: Business)
3. Thêm sản phẩm **WhatsApp**
4. Trong WhatsApp > Getting Started, ghi lại **Phone Number ID** và **Business Account ID**
5. Tạo access token vĩnh viễn (Settings > Access Tokens)

## 2. Cấu hình webhook

Trong bảng điều khiển Meta developer:

1. Vào WhatsApp > Configuration > Webhook
2. Đặt Callback URL:
   ```
   https://your-worker.your-domain.com/api/messaging/whatsapp/webhook
   ```
3. Đặt Verify Token khớp với cài đặt quản trị Llamenos
4. Đăng ký trường webhook `messages`

## 3. Bật WhatsApp trong cài đặt quản trị

Điều hướng đến **Cài đặt quản trị > Kênh tin nhắn** và bật **WhatsApp**.

Chọn chế độ **Meta Direct** hoặc **Twilio** và nhập thông tin xác thực.

## 4. Kiểm thử

Gửi tin nhắn WhatsApp đến số Business. Cuộc hội thoại sẽ xuất hiện trong tab **Hội thoại**.

## Cửa sổ tin nhắn 24 giờ

WhatsApp áp dụng cửa sổ tin nhắn 24 giờ:
- Bạn có thể trả lời trong vòng 24 giờ sau tin nhắn cuối của người dùng
- Sau 24 giờ, phải sử dụng **tin nhắn mẫu** đã được phê duyệt
- Llamenos xử lý tự động — nếu cửa sổ hết hạn, gửi tin nhắn mẫu để khởi động lại

## Hỗ trợ đa phương tiện

- **Hình ảnh** (JPEG, PNG)
- **Tài liệu** (PDF, Word, v.v.)
- **Âm thanh** (MP3, OGG)
- **Video** (MP4)
- Chia sẻ **vị trí**
- Nút và tin nhắn danh sách **tương tác**

## Lưu ý bảo mật

- WhatsApp sử dụng mã hóa đầu cuối giữa người dùng và hạ tầng Meta
- Về mặt kỹ thuật, Meta có thể truy cập nội dung tin nhắn
- Tin nhắn được lưu trong Llamenos sau khi nhận từ webhook
- Chữ ký webhook được xác thực bằng HMAC-SHA256 với app secret
- Để bảo mật tối đa, cân nhắc sử dụng Signal thay vì WhatsApp
