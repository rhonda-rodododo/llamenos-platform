---
title: "Thiết lập: Plivo"
description: Hướng dẫn từng bước để cấu hình Plivo làm nhà cung cấp dịch vụ điện thoại.
---

Plivo là nhà cung cấp dịch vụ điện thoại đám mây tiết kiệm với API đơn giản. Nó sử dụng điều khiển cuộc gọi dựa trên XML tương tự TwiML, giúp tích hợp với Llamenos mượt mà.

## Yêu cầu tiên quyết

- Một [tài khoản Plivo](https://console.plivo.com/accounts/register/) (có tín dụng dùng thử)
- Phiên bản Llamenos của bạn đã được triển khai và có thể truy cập qua URL công khai

## 1. Tạo tài khoản Plivo

Đăng ký tại [console.plivo.com](https://console.plivo.com/accounts/register/). Sau khi xác minh, bạn có thể tìm **Auth ID** và **Auth Token** trên trang chủ bảng điều khiển.

## 2. Mua số điện thoại

1. Trong Plivo Console, vào **Phone Numbers** > **Buy Numbers**
2. Chọn quốc gia và tìm kiếm số có khả năng thoại
3. Mua số

## 3. Tạo XML Application

Plivo sử dụng "XML Applications" để định tuyến cuộc gọi:

1. Vào **Voice** > **XML Applications**
2. Nhấn **Add New Application**
3. Cấu hình:
   - **Application Name**: Llamenos Hotline
   - **Answer URL**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Hangup URL**: `https://your-worker-url.com/telephony/status` (POST)
4. Lưu ứng dụng

## 4. Liên kết số điện thoại

1. Vào **Phone Numbers** > **Your Numbers**
2. Nhấn vào số đường dây nóng
3. Trong phần **Voice**, chọn XML Application bạn đã tạo ở bước 3
4. Lưu

## 5. Cấu hình trong Llamenos

1. Đăng nhập với quyền quản trị viên
2. Vào **Cài đặt** > **Nhà cung cấp dịch vụ điện thoại**
3. Chọn **Plivo** từ danh sách thả xuống nhà cung cấp
4. Nhập:
   - **Auth ID**: từ bảng điều khiển Plivo Console
   - **Auth Token**: từ bảng điều khiển Plivo Console
   - **Phone Number**: số bạn đã mua (định dạng E.164)
5. Nhấn **Lưu**

## 6. Kiểm tra thiết lập

Gọi đến số đường dây nóng. Bạn sẽ nghe thấy menu chọn ngôn ngữ và được chuyển qua luồng cuộc gọi bình thường.

## Thiết lập WebRTC (tùy chọn)

Plivo WebRTC sử dụng Browser SDK với thông tin xác thực hiện có:

1. Trong Plivo Console, vào **Voice** > **Endpoints**
2. Tạo endpoint mới (đóng vai trò danh tính điện thoại trình duyệt)
3. Trong Llamenos, vào **Cài đặt** > **Nhà cung cấp dịch vụ điện thoại**
4. Bật **Gọi WebRTC**
5. Nhấn **Lưu**

Bộ điều hợp tạo token HMAC có giới hạn thời gian từ Auth ID và Auth Token để xác thực trình duyệt an toàn.

## Lưu ý riêng cho Plivo

- **XML so với TwiML**: Plivo sử dụng định dạng XML riêng cho điều khiển cuộc gọi, tương tự nhưng không giống hệt TwiML. Bộ điều hợp Llamenos tự động tạo XML Plivo chính xác.
- **Answer URL so với Hangup URL**: Plivo tách trình xử lý cuộc gọi ban đầu (Answer URL) và trình xử lý kết thúc cuộc gọi (Hangup URL), khác với Twilio sử dụng một callback trạng thái duy nhất.
- **Giới hạn tốc độ**: Plivo có giới hạn tốc độ API khác nhau theo cấp tài khoản. Đối với đường dây nóng lưu lượng cao, liên hệ bộ phận hỗ trợ Plivo để tăng giới hạn.

## Xử lý sự cố

- **"Auth ID invalid"**: Auth ID không phải là địa chỉ email của bạn. Tìm nó trên trang chủ bảng điều khiển Plivo Console.
- **Cuộc gọi không được định tuyến**: Xác minh rằng số điện thoại đã được liên kết với đúng XML Application.
- **Lỗi Answer URL**: Plivo yêu cầu phản hồi XML hợp lệ. Kiểm tra nhật ký Worker để xem lỗi phản hồi.
- **Giới hạn cuộc gọi đi**: Tài khoản dùng thử có giới hạn cuộc gọi đi. Nâng cấp để sử dụng trong môi trường sản xuất.
