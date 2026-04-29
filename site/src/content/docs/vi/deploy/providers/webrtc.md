---
title: Gọi qua trình duyệt WebRTC
description: Bật tính năng WebRTC để tình nguyện viên có thể nhận cuộc gọi trực tiếp từ trình duyệt.
---

WebRTC (Web Real-Time Communication) cho phép tình nguyện viên nhận cuộc gọi đường dây nóng trực tiếp trong trình duyệt mà không cần điện thoại. Điều này hữu ích cho những tình nguyện viên không muốn chia sẻ số điện thoại hoặc làm việc từ máy tính.

## Cách hoạt động

1. Quản trị viên bật WebRTC trong cài đặt nhà cung cấp dịch vụ điện thoại
2. Tình nguyện viên đặt tùy chọn cuộc gọi thành "Trình duyệt" trong hồ sơ cá nhân
3. Khi có cuộc gọi đến, ứng dụng Llamenos đổ chuông trong trình duyệt kèm thông báo
4. Tình nguyện viên nhấn "Trả lời" và cuộc gọi được kết nối qua trình duyệt sử dụng micro

Âm thanh cuộc gọi được định tuyến từ nhà cung cấp dịch vụ điện thoại qua kết nối WebRTC đến trình duyệt của tình nguyện viên. Chất lượng cuộc gọi phụ thuộc vào kết nối internet của tình nguyện viên.

## Yêu cầu tiên quyết

### Thiết lập quản trị viên

- Nhà cung cấp dịch vụ điện thoại được hỗ trợ đã bật WebRTC (Twilio, SignalWire, Vonage hoặc Plivo)
- Thông tin xác thực WebRTC theo nhà cung cấp đã được cấu hình (xem hướng dẫn thiết lập nhà cung cấp)
- WebRTC đã bật trong **Cài đặt** > **Nhà cung cấp dịch vụ điện thoại**

### Yêu cầu tình nguyện viên

- Trình duyệt hiện đại (Chrome, Firefox, Edge hoặc Safari 14.1+)
- Micro hoạt động
- Kết nối internet ổn định (tối thiểu 100 kbps upload/download)
- Đã cấp quyền thông báo trình duyệt

## Thiết lập theo nhà cung cấp

Mỗi nhà cung cấp dịch vụ điện thoại yêu cầu thông tin xác thực WebRTC khác nhau:

### Twilio / SignalWire

1. Tạo **API Key** trong bảng điều khiển nhà cung cấp
2. Tạo **TwiML/LaML Application** với Voice URL đặt thành `https://your-worker-url.com/telephony/webrtc-incoming`
3. Trong Llamenos, nhập API Key SID, API Key Secret và Application SID

### Vonage

1. Vonage Application của bạn đã bao gồm khả năng WebRTC
2. Trong Llamenos, dán **private key** của Application (định dạng PEM)
3. Application ID đã được cấu hình từ thiết lập ban đầu

### Plivo

1. Tạo **Endpoint** trong Plivo Console dưới **Voice** > **Endpoints**
2. WebRTC sử dụng Auth ID và Auth Token hiện có
3. Bật WebRTC trong Llamenos -- không cần thông tin xác thực bổ sung

### Asterisk

Asterisk WebRTC yêu cầu cấu hình SIP.js với truyền tải WebSocket. Phức tạp hơn so với nhà cung cấp đám mây:

1. Bật truyền tải WebSocket trong `http.conf` của Asterisk
2. Tạo PJSIP endpoint cho client WebRTC với DTLS-SRTP
3. Llamenos tự động cấu hình client SIP.js khi chọn Asterisk

Xem [hướng dẫn thiết lập Asterisk](/docs/deploy/providers/asterisk) để biết chi tiết đầy đủ.

## Thiết lập tùy chọn cuộc gọi cho tình nguyện viên

Tình nguyện viên cấu hình tùy chọn cuộc gọi trong ứng dụng:

1. Đăng nhập vào Llamenos
2. Vào **Cài đặt** (biểu tượng bánh răng)
3. Trong phần **Tùy chọn cuộc gọi**, chọn **Trình duyệt** thay vì **Điện thoại**
4. Cấp quyền micro và thông báo khi được yêu cầu
5. Giữ tab Llamenos mở trong ca trực

Khi có cuộc gọi đến, bạn sẽ thấy thông báo trình duyệt và chỉ báo đổ chuông trong ứng dụng. Nhấn **Trả lời** để kết nối.

## Tương thích trình duyệt

| Trình duyệt | Desktop | Di động | Ghi chú |
|---|---|---|---|
| Chrome | Có | Có | Khuyến nghị |
| Firefox | Có | Có | Hỗ trợ đầy đủ |
| Edge | Có | Có | Dựa trên Chromium, hỗ trợ đầy đủ |
| Safari | Có (14.1+) | Có (14.1+) | Cần tương tác của người dùng để bắt đầu âm thanh |
| Brave | Có | Hạn chế | Có thể cần tắt shields để sử dụng micro |

## Mẹo chất lượng âm thanh

- Sử dụng tai nghe để tránh tiếng vọng
- Đóng các ứng dụng khác đang sử dụng micro
- Sử dụng kết nối internet có dây khi có thể
- Tắt các tiện ích mở rộng trình duyệt có thể ảnh hưởng đến WebRTC (tiện ích VPN, trình chặn quảng cáo có bảo vệ rò rỉ WebRTC)

## Xử lý sự cố

### Không có âm thanh

- **Kiểm tra quyền micro**: Nhấn biểu tượng khóa trong thanh địa chỉ và đảm bảo quyền truy cập micro là "Cho phép"
- **Kiểm tra micro**: Sử dụng kiểm tra âm thanh tích hợp của trình duyệt hoặc trang web như [webcamtest.com](https://webcamtest.com)
- **Kiểm tra đầu ra âm thanh**: Đảm bảo loa hoặc tai nghe đã được chọn làm thiết bị đầu ra

### Cuộc gọi không đổ chuông trong trình duyệt

- **Thông báo bị chặn**: Kiểm tra rằng thông báo trình duyệt đã được bật cho trang Llamenos
- **Tab không hoạt động**: Tab Llamenos phải được mở (có thể ở nền, nhưng tab phải tồn tại)
- **Tùy chọn cuộc gọi**: Xác minh tùy chọn cuộc gọi đã được đặt thành "Trình duyệt" trong Cài đặt
- **WebRTC chưa cấu hình**: Yêu cầu quản trị viên xác nhận WebRTC đã được bật và thông tin xác thực đã được thiết lập

### Vấn đề tường lửa và NAT

WebRTC sử dụng máy chủ STUN/TURN để vượt qua tường lửa và NAT. Nếu cuộc gọi kết nối nhưng không nghe thấy âm thanh:

- **Tường lửa doanh nghiệp**: Một số tường lửa chặn lưu lượng UDP trên các cổng không chuẩn. Yêu cầu đội IT cho phép lưu lượng UDP trên cổng 3478 và 10000-60000
- **NAT đối xứng**: Một số router sử dụng NAT đối xứng có thể ngăn kết nối trực tiếp ngang hàng. Máy chủ TURN của nhà cung cấp dịch vụ điện thoại sẽ tự động xử lý điều này
- **VPN can thiệp**: VPN có thể ảnh hưởng đến kết nối WebRTC. Thử ngắt kết nối VPN trong ca trực

### Tiếng vọng hoặc phản hồi

- Sử dụng tai nghe thay vì loa
- Giảm độ nhạy micro trong cài đặt âm thanh hệ điều hành
- Bật khử tiếng vọng trong trình duyệt (thường được bật mặc định)
- Di chuyển ra xa các bề mặt cứng phản xạ
