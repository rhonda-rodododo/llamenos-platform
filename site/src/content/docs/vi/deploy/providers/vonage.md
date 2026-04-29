---
title: "Thiết lập: Vonage"
description: Hướng dẫn từng bước để cấu hình Vonage làm nhà cung cấp dịch vụ điện thoại.
---

Vonage (trước đây là Nexmo) cung cấp phủ sóng quốc tế mạnh mẽ và giá cả cạnh tranh. Nó sử dụng mô hình API khác với Twilio -- Vonage Applications nhóm số, webhook và thông tin xác thực của bạn lại với nhau.

## Yêu cầu tiên quyết

- Một [tài khoản Vonage](https://dashboard.nexmo.com/sign-up) (có tín dụng miễn phí)
- Phiên bản Llamenos của bạn đã được triển khai và có thể truy cập qua URL công khai

## 1. Tạo tài khoản Vonage

Đăng ký tại [Vonage API Dashboard](https://dashboard.nexmo.com/sign-up). Xác minh tài khoản và ghi lại **API Key** và **API Secret** từ trang chủ bảng điều khiển.

## 2. Mua số điện thoại

1. Trong Vonage Dashboard, vào **Numbers** > **Buy numbers**
2. Chọn quốc gia và chọn số có khả năng **Voice**
3. Mua số

## 3. Tạo Vonage Application

Vonage nhóm cấu hình vào "Applications":

1. Vào **Applications** > **Create a new application**
2. Nhập tên (ví dụ: "Llamenos Hotline")
3. Trong phần **Voice**, bật và thiết lập:
   - **Answer URL**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Event URL**: `https://your-worker-url.com/telephony/status` (POST)
4. Nhấn **Generate new application**
5. Lưu **Application ID** hiển thị trên trang xác nhận
6. Tải xuống tệp **private key** -- bạn sẽ cần nội dung của nó cho cấu hình

## 4. Liên kết số điện thoại

1. Vào **Numbers** > **Your numbers**
2. Nhấn biểu tượng bánh răng bên cạnh số đường dây nóng
3. Trong phần **Voice**, chọn Application bạn đã tạo ở bước 3
4. Nhấn **Save**

## 5. Cấu hình trong Llamenos

1. Đăng nhập với quyền quản trị viên
2. Vào **Cài đặt** > **Nhà cung cấp dịch vụ điện thoại**
3. Chọn **Vonage** từ danh sách thả xuống nhà cung cấp
4. Nhập:
   - **API Key**: từ trang chủ Vonage Dashboard
   - **API Secret**: từ trang chủ Vonage Dashboard
   - **Application ID**: từ bước 3
   - **Phone Number**: số bạn đã mua (định dạng E.164)
5. Nhấn **Lưu**

## 6. Kiểm tra thiết lập

Gọi đến số đường dây nóng. Bạn sẽ nghe thấy menu chọn ngôn ngữ. Xác minh rằng cuộc gọi được chuyển đến tình nguyện viên đang trực.

## Thiết lập WebRTC (tùy chọn)

Vonage WebRTC sử dụng thông tin xác thực Application bạn đã tạo:

1. Trong Llamenos, vào **Cài đặt** > **Nhà cung cấp dịch vụ điện thoại**
2. Bật **Gọi WebRTC**
3. Nhập nội dung **Private Key** (toàn bộ văn bản PEM từ tệp bạn đã tải xuống)
4. Nhấn **Lưu**

Application ID đã được cấu hình từ thiết lập ban đầu. Vonage tạo RS256 JWT sử dụng private key để xác thực trình duyệt.

## Lưu ý riêng cho Vonage

- **NCCO so với TwiML**: Vonage sử dụng NCCO (Nexmo Call Control Objects) ở định dạng JSON thay vì đánh dấu XML. Bộ điều hợp Llamenos tự động tạo định dạng chính xác.
- **Định dạng Answer URL**: Vonage yêu cầu answer URL trả về JSON (NCCO), không phải XML. Bộ điều hợp xử lý điều này.
- **Event URL**: Vonage gửi sự kiện cuộc gọi (đang đổ chuông, đã trả lời, đã hoàn thành) đến event URL dưới dạng yêu cầu JSON POST.
- **Bảo mật private key**: Private key được lưu trữ dạng mã hóa. Nó không bao giờ rời khỏi máy chủ -- chỉ được sử dụng để tạo token JWT ngắn hạn.

## Xử lý sự cố

- **"Application not found"**: Xác minh Application ID khớp chính xác. Bạn có thể tìm nó trong **Applications** trên Vonage Dashboard.
- **Không có cuộc gọi đến**: Đảm bảo số điện thoại đã được liên kết với đúng Application (bước 4).
- **Lỗi private key**: Dán toàn bộ nội dung PEM bao gồm các dòng `-----BEGIN PRIVATE KEY-----` và `-----END PRIVATE KEY-----`.
- **Định dạng số quốc tế**: Vonage yêu cầu định dạng E.164. Bao gồm `+` và mã quốc gia.
