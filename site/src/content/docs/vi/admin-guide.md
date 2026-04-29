---
title: Hướng dẫn quản trị viên
description: Quản lý toàn diện — tình nguyện viên, ca trực, cài đặt cuộc gọi, danh sách chặn và trường tùy chỉnh.
---

Với vai trò quản trị viên, bạn quản lý mọi thứ: tình nguyện viên, ca trực, cài đặt cuộc gọi, danh sách chặn và trường tùy chỉnh. Hướng dẫn này bao gồm các quy trình quản trị chính.

## Đăng nhập

Đăng nhập bằng `nsec` (khóa bí mật Nostr) được tạo trong quá trình [thiết lập](/docs/deploy). Trang đăng nhập chấp nhận định dạng nsec (`nsec1...`). Trình duyệt của bạn ký xác thực bằng khóa — khóa bí mật không bao giờ rời khỏi thiết bị.

Tùy chọn, đăng ký passkey WebAuthn trong Cài đặt để đăng nhập không cần mật khẩu trên các thiết bị khác.

## Quản lý tình nguyện viên

Điều hướng đến **Tình nguyện viên** trong thanh bên để:

- **Thêm tình nguyện viên** — tạo cặp khóa Nostr mới. Chia sẻ nsec một cách an toàn với tình nguyện viên (chỉ hiển thị một lần).
- **Tạo liên kết mời** — tạo liên kết dùng một lần mà tình nguyện viên có thể sử dụng để tự đăng ký.
- **Chỉnh sửa** — cập nhật tên, số điện thoại và vai trò.
- **Xóa** — vô hiệu hóa quyền truy cập của tình nguyện viên.

Số điện thoại của tình nguyện viên chỉ hiển thị với quản trị viên. Chúng được sử dụng để đổ chuông song song khi tình nguyện viên đang trong ca trực.

## Cấu hình ca trực

Điều hướng đến **Ca trực** để tạo lịch trình lặp lại:

1. Nhấn **Thêm ca trực**
2. Đặt tên, chọn các ngày trong tuần, đặt thời gian bắt đầu/kết thúc
3. Phân công tình nguyện viên bằng ô chọn đa mục có tìm kiếm
4. Lưu — hệ thống sẽ tự động chuyển cuộc gọi đến tình nguyện viên đang trong ca trực

Cấu hình **Nhóm dự phòng** ở cuối trang ca trực. Các tình nguyện viên này sẽ được gọi khi không có ca trực nào đang hoạt động.

## Danh sách chặn

Điều hướng đến **Chặn** để quản lý các số điện thoại bị chặn:

- **Thêm từng số** — nhập số điện thoại theo định dạng E.164 (ví dụ: +15551234567)
- **Nhập hàng loạt** — dán nhiều số, mỗi dòng một số
- **Xóa** — bỏ chặn một số ngay lập tức

Lệnh chặn có hiệu lực ngay lập tức. Người gọi bị chặn sẽ nghe thông báo từ chối và bị ngắt kết nối.

## Cài đặt cuộc gọi

Trong **Cài đặt**, bạn sẽ tìm thấy các phần sau:

### Chống cuộc gọi rác

- **CAPTCHA giọng nói** — bật/tắt. Khi bật, người gọi phải nhập mã số 4 chữ số ngẫu nhiên.
- **Giới hạn tần suất** — bật/tắt. Giới hạn số cuộc gọi từ mỗi số điện thoại trong một khoảng thời gian trượt.

### Chuyển đổi giọng nói

- **Bật/tắt toàn cục** — bật/tắt chuyển đổi giọng nói Whisper cho tất cả cuộc gọi.
- Từng tình nguyện viên cũng có thể tự chọn không tham gia qua cài đặt của họ.

### Cài đặt cuộc gọi

- **Thời gian chờ hàng đợi** — thời gian người gọi chờ trước khi chuyển đến hộp thư thoại (30-300 giây).
- **Thời lượng tối đa hộp thư thoại** — thời lượng ghi âm tối đa (30-300 giây).

### Trường ghi chú tùy chỉnh

Định nghĩa các trường có cấu trúc hiển thị trong biểu mẫu ghi chú:

- Các loại được hỗ trợ: văn bản, số, chọn (danh sách thả xuống), hộp kiểm, vùng văn bản
- Cấu hình xác thực: bắt buộc, độ dài tối thiểu/tối đa, giá trị tối thiểu/tối đa
- Kiểm soát hiển thị: chọn trường nào tình nguyện viên có thể xem và chỉnh sửa
- Sắp xếp lại thứ tự trường bằng mũi tên lên/xuống
- Tối đa 20 trường, tối đa 50 tùy chọn cho mỗi trường chọn

Giá trị trường tùy chỉnh được mã hóa cùng với nội dung ghi chú. Máy chủ không bao giờ nhìn thấy chúng.

### Lời nhắc giọng nói

Ghi âm các lời nhắc âm thanh IVR tùy chỉnh cho mỗi ngôn ngữ được hỗ trợ. Hệ thống sử dụng bản ghi âm của bạn cho các luồng chào hỏi, CAPTCHA, hàng đợi và hộp thư thoại. Khi không có bản ghi âm, hệ thống sẽ dùng chuyển đổi văn bản thành giọng nói.

### Chính sách WebAuthn

Tùy chọn yêu cầu passkey cho quản trị viên, tình nguyện viên hoặc cả hai. Khi đặt là bắt buộc, người dùng phải đăng ký passkey trước khi có thể sử dụng ứng dụng.

## Nhật ký kiểm toán

Trang **Nhật ký kiểm toán** hiển thị danh sách các sự kiện hệ thống theo thứ tự thời gian: đăng nhập, trả lời cuộc gọi, tạo ghi chú, thay đổi cài đặt và hành động quản trị. Các mục bao gồm địa chỉ IP đã được băm và siêu dữ liệu quốc gia. Sử dụng phân trang để duyệt lịch sử.

## Lịch sử cuộc gọi

Trang **Cuộc gọi** hiển thị tất cả cuộc gọi với trạng thái, thời lượng và phân công tình nguyện viên. Lọc theo khoảng thời gian hoặc tìm kiếm theo số điện thoại. Xuất dữ liệu theo định dạng JSON tuân thủ GDPR.
