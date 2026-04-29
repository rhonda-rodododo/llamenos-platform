---
title: Nhà cung cấp dịch vụ điện thoại
description: So sánh các nhà cung cấp dịch vụ điện thoại được hỗ trợ và chọn phương án phù hợp nhất cho đường dây nóng của bạn.
---

Llamenos hỗ trợ nhiều nhà cung cấp dịch vụ điện thoại thông qua giao diện **TelephonyAdapter**. Bạn có thể chuyển đổi nhà cung cấp bất cứ lúc nào từ cài đặt quản trị mà không cần thay đổi bất kỳ mã ứng dụng nào.

## Nhà cung cấp được hỗ trợ

| Nhà cung cấp | Loại | Mô hình tính phí | Hỗ trợ WebRTC | Độ khó thiết lập | Phù hợp nhất cho |
|---|---|---|---|---|---|
| **Twilio** | Đám mây | Tính phí theo phút | Có | Dễ | Bắt đầu nhanh |
| **SignalWire** | Đám mây | Tính phí theo phút (rẻ hơn) | Có | Dễ | Tổ chức tiết kiệm chi phí |
| **Vonage** | Đám mây | Tính phí theo phút | Có | Trung bình | Phủ sóng quốc tế |
| **Plivo** | Đám mây | Tính phí theo phút | Có | Trung bình | Tùy chọn đám mây tiết kiệm |
| **Asterisk** | Tự lưu trữ | Chỉ chi phí SIP trunk | Có (SIP.js) | Khó | Bảo mật tối đa, triển khai quy mô lớn |

## So sánh giá

Chi phí mỗi phút gần đúng cho cuộc gọi thoại tại Mỹ (giá thay đổi theo khu vực và khối lượng):

| Nhà cung cấp | Gọi đến | Gọi đi | Số điện thoại | Gói miễn phí |
|---|---|---|---|---|
| Twilio | $0.0085 | $0.014 | $1.15/tháng | Tín dụng dùng thử |
| SignalWire | $0.005 | $0.009 | $1.00/tháng | Tín dụng dùng thử |
| Vonage | $0.0049 | $0.0139 | $1.00/tháng | Tín dụng miễn phí |
| Plivo | $0.0055 | $0.010 | $0.80/tháng | Tín dụng dùng thử |
| Asterisk | Phí SIP trunk | Phí SIP trunk | Từ nhà cung cấp SIP | Không áp dụng |

Tất cả nhà cung cấp đám mây tính phí theo phút với độ chính xác đến giây. Chi phí Asterisk phụ thuộc vào nhà cung cấp SIP trunk và chi phí lưu trữ máy chủ của bạn.

## Ma trận hỗ trợ tính năng

| Tính năng | Twilio | SignalWire | Vonage | Plivo | Asterisk |
|---|---|---|---|---|---|
| Ghi âm cuộc gọi | Có | Có | Có | Có | Có |
| Chuyển đổi giọng nói trực tiếp | Có | Có | Có | Có | Có (qua cầu nối) |
| CAPTCHA giọng nói | Có | Có | Có | Có | Có |
| Hộp thư thoại | Có | Có | Có | Có | Có |
| Gọi qua trình duyệt WebRTC | Có | Có | Có | Có | Có (SIP.js) |
| Xác thực webhook | Có | Có | Có | Có | Tùy chỉnh (HMAC) |
| Đổ chuông song song | Có | Có | Có | Có | Có |
| Hàng đợi / nhạc chờ | Có | Có | Có | Có | Có |

## Cách cấu hình

1. Điều hướng đến **Cài đặt** trong thanh bên quản trị
2. Mở phần **Nhà cung cấp dịch vụ điện thoại**
3. Chọn nhà cung cấp từ danh sách thả xuống
4. Nhập thông tin xác thực cần thiết (mỗi nhà cung cấp có các trường khác nhau)
5. Nhập số điện thoại đường dây nóng theo định dạng E.164 (ví dụ: `+15551234567`)
6. Nhấn **Lưu**
7. Cấu hình webhook trong bảng điều khiển của nhà cung cấp để trỏ đến phiên bản Llamenos của bạn

Xem hướng dẫn thiết lập chi tiết cho từng nhà cung cấp:

- [Thiết lập: Twilio](/docs/deploy/providers/twilio)
- [Thiết lập: SignalWire](/docs/deploy/providers/signalwire)
- [Thiết lập: Vonage](/docs/deploy/providers/vonage)
- [Thiết lập: Plivo](/docs/deploy/providers/plivo)
- [Thiết lập: Asterisk (Tự lưu trữ)](/docs/deploy/providers/asterisk)
- [Gọi qua trình duyệt WebRTC](/docs/deploy/providers/webrtc)
