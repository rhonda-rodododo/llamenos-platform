---
title: "Thiết lập: SignalWire"
description: Hướng dẫn từng bước để cấu hình SignalWire làm nhà cung cấp dịch vụ điện thoại.
---

SignalWire là giải pháp thay thế tiết kiệm chi phí cho Twilio với API tương thích. Nó sử dụng LaML (ngôn ngữ đánh dấu tương thích TwiML), nên việc chuyển đổi giữa Twilio và SignalWire rất đơn giản.

## Yêu cầu tiên quyết

- Một [tài khoản SignalWire](https://signalwire.com/signup) (có bản dùng thử miễn phí)
- Phiên bản Llamenos của bạn đã được triển khai và có thể truy cập qua URL công khai

## 1. Tạo tài khoản SignalWire

Đăng ký tại [signalwire.com/signup](https://signalwire.com/signup). Trong quá trình đăng ký, bạn sẽ chọn một **tên Space** (ví dụ: `myhotline`). URL Space của bạn sẽ là `myhotline.signalwire.com`. Ghi lại tên này -- bạn sẽ cần nó khi cấu hình.

## 2. Mua số điện thoại

1. Trong bảng điều khiển SignalWire, vào **Phone Numbers**
2. Nhấn **Buy a Phone Number**
3. Tìm kiếm số có khả năng thoại
4. Mua số

## 3. Lấy thông tin xác thực

1. Vào **API** trong bảng điều khiển SignalWire
2. Tìm **Project ID** (đóng vai trò Account SID)
3. Tạo **API Token** mới nếu chưa có -- đóng vai trò Auth Token

## 4. Cấu hình webhook

1. Vào **Phone Numbers** trong bảng điều khiển
2. Nhấn vào số đường dây nóng
3. Trong phần **Voice Settings**, thiết lập:
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Call status callback**: `https://your-worker-url.com/telephony/status` (POST)

## 5. Cấu hình trong Llamenos

1. Đăng nhập với quyền quản trị viên
2. Vào **Cài đặt** > **Nhà cung cấp dịch vụ điện thoại**
3. Chọn **SignalWire** từ danh sách thả xuống nhà cung cấp
4. Nhập:
   - **Account SID**: Project ID từ bước 3
   - **Auth Token**: API Token từ bước 3
   - **SignalWire Space**: tên Space của bạn (chỉ tên, không phải URL đầy đủ -- ví dụ: `myhotline`)
   - **Phone Number**: số bạn đã mua (định dạng E.164)
5. Nhấn **Lưu**

## 6. Kiểm tra thiết lập

Gọi đến số đường dây nóng. Bạn sẽ nghe thấy menu chọn ngôn ngữ và luồng cuộc gọi.

## Thiết lập WebRTC (tùy chọn)

SignalWire WebRTC sử dụng cùng mẫu API Key như Twilio:

1. Trong bảng điều khiển SignalWire, tạo **API Key** dưới **API** > **Tokens**
2. Tạo một **LaML Application**:
   - Vào **LaML** > **LaML Applications**
   - Đặt Voice URL thành `https://your-worker-url.com/telephony/webrtc-incoming`
   - Ghi lại Application SID
3. Trong Llamenos, vào **Cài đặt** > **Nhà cung cấp dịch vụ điện thoại**
4. Bật **Gọi WebRTC**
5. Nhập API Key SID, API Key Secret và Application SID
6. Nhấn **Lưu**

## Khác biệt với Twilio

- **LaML so với TwiML**: SignalWire sử dụng LaML, về chức năng giống hệt TwiML. Llamenos tự động xử lý điều này.
- **Space URL**: Các lệnh gọi API được gửi đến `{space}.signalwire.com` thay vì `api.twilio.com`. Bộ điều hợp xử lý điều này thông qua tên Space bạn cung cấp.
- **Giá cả**: SignalWire thường rẻ hơn Twilio 30-40% cho cuộc gọi thoại.
- **Tương đương tính năng**: Tất cả tính năng Llamenos (ghi âm, chuyển đổi giọng nói, CAPTCHA, hộp thư thoại) hoạt động giống hệt với SignalWire.

## Xử lý sự cố

- **Lỗi "Space not found"**: Kiểm tra lại tên Space (chỉ tên miền phụ, không phải URL đầy đủ).
- **Webhook thất bại**: Đảm bảo URL Worker có thể truy cập công khai và sử dụng HTTPS.
- **Vấn đề API Token**: Token SignalWire có thể hết hạn. Tạo token mới nếu gặp lỗi xác thực.
