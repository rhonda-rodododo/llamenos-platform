---
title: "Thiết lập: Twilio"
description: Hướng dẫn từng bước để cấu hình Twilio làm nhà cung cấp dịch vụ điện thoại.
---

Twilio là nhà cung cấp dịch vụ điện thoại mặc định cho Llamenos và dễ bắt đầu nhất. Hướng dẫn này sẽ đưa bạn qua quá trình tạo tài khoản, thiết lập số điện thoại và cấu hình webhook.

## Yêu cầu tiên quyết

- Một [tài khoản Twilio](https://www.twilio.com/try-twilio) (bản dùng thử miễn phí có thể dùng để kiểm tra)
- Phiên bản Llamenos của bạn đã được triển khai và có thể truy cập qua URL công khai

## 1. Tạo tài khoản Twilio

Đăng ký tại [twilio.com/try-twilio](https://www.twilio.com/try-twilio). Xác minh email và số điện thoại của bạn. Twilio cung cấp tín dụng dùng thử để kiểm tra.

## 2. Mua số điện thoại

1. Trong Twilio Console, vào **Phone Numbers** > **Manage** > **Buy a number**
2. Tìm kiếm số có khả năng **Voice** trong mã vùng mong muốn
3. Nhấn **Buy** và xác nhận

Lưu số này -- bạn sẽ nhập nó trong cài đặt quản trị Llamenos.

## 3. Lấy Account SID và Auth Token

1. Truy cập [bảng điều khiển Twilio Console](https://console.twilio.com)
2. Tìm **Account SID** và **Auth Token** trên trang chính
3. Nhấn biểu tượng mắt để hiển thị Auth Token

## 4. Cấu hình webhook

Trong Twilio Console, điều hướng đến cấu hình số điện thoại của bạn:

1. Vào **Phone Numbers** > **Manage** > **Active Numbers**
2. Nhấn vào số đường dây nóng của bạn
3. Trong phần **Voice Configuration**, thiết lập:
   - **A call comes in**: Webhook, `https://your-worker-url.com/telephony/incoming`, HTTP POST
   - **Call status changes**: `https://your-worker-url.com/telephony/status`, HTTP POST

Thay `your-worker-url.com` bằng URL Cloudflare Worker thực tế của bạn.

## 5. Cấu hình trong Llamenos

1. Đăng nhập với quyền quản trị viên
2. Vào **Cài đặt** > **Nhà cung cấp dịch vụ điện thoại**
3. Chọn **Twilio** từ danh sách thả xuống nhà cung cấp
4. Nhập:
   - **Account SID**: từ bước 3
   - **Auth Token**: từ bước 3
   - **Phone Number**: số bạn đã mua (định dạng E.164, ví dụ: `+15551234567`)
5. Nhấn **Lưu**

## 6. Kiểm tra thiết lập

Gọi đến số đường dây nóng từ điện thoại. Bạn sẽ nghe thấy menu chọn ngôn ngữ. Nếu có tình nguyện viên đang trực, cuộc gọi sẽ được chuyển tiếp.

## Thiết lập WebRTC (tùy chọn)

Để cho phép tình nguyện viên trả lời cuộc gọi trong trình duyệt thay vì điện thoại:

### Tạo API Key

1. Trong Twilio Console, vào **Account** > **API keys & tokens**
2. Nhấn **Create API Key**
3. Chọn loại khóa **Standard**
4. Lưu **SID** và **Secret** -- Secret chỉ hiển thị một lần

### Tạo TwiML App

1. Vào **Voice** > **Manage** > **TwiML Apps**
2. Nhấn **Create new TwiML App**
3. Đặt **Voice Request URL** thành `https://your-worker-url.com/telephony/webrtc-incoming`
4. Lưu và ghi lại **App SID**

### Kích hoạt trong Llamenos

1. Vào **Cài đặt** > **Nhà cung cấp dịch vụ điện thoại**
2. Bật **Gọi WebRTC**
3. Nhập:
   - **API Key SID**: từ API Key bạn đã tạo
   - **API Key Secret**: từ API Key bạn đã tạo
   - **TwiML App SID**: từ TwiML App bạn đã tạo
4. Nhấn **Lưu**

Xem [Gọi qua trình duyệt WebRTC](/docs/deploy/providers/webrtc) để biết cách thiết lập cho tình nguyện viên và xử lý sự cố.

## Xử lý sự cố

- **Cuộc gọi không đến**: Xác minh URL webhook chính xác và Worker đã được triển khai. Kiểm tra nhật ký lỗi trong Twilio Console.
- **Lỗi "Invalid webhook"**: Đảm bảo URL webhook sử dụng HTTPS và trả về TwiML hợp lệ.
- **Giới hạn tài khoản dùng thử**: Tài khoản dùng thử chỉ có thể gọi đến số đã xác minh. Nâng cấp lên tài khoản trả phí để sử dụng trong môi trường sản xuất.
- **Xác thực webhook thất bại**: Đảm bảo Auth Token trong Llamenos khớp với Auth Token trong Twilio Console.
