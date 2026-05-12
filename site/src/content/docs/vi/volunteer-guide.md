---
title: Hướng dẫn tình nguyện viên
description: Mọi thứ bạn cần biết với vai trò tình nguyện viên — đăng nhập, nhận cuộc gọi, viết ghi chú và sử dụng chuyển đổi giọng nói.
---

Hướng dẫn này bao gồm mọi thứ bạn cần biết với vai trò tình nguyện viên: đăng nhập, nhận cuộc gọi, viết ghi chú và sử dụng tính năng chuyển đổi giọng nói.

## Nhận thông tin đăng nhập

Quản trị viên sẽ cung cấp cho bạn một trong hai:

- Một **nsec** (khóa bí mật WebSocket) — chuỗi ký tự bắt đầu bằng `nsec1`
- Một **liên kết mời** — URL dùng một lần sẽ tạo thông tin đăng nhập cho bạn

**Giữ bí mật nsec của bạn.** Đó là danh tính và thông tin đăng nhập của bạn. Bất kỳ ai có nsec của bạn đều có thể mạo danh bạn. Hãy lưu trữ nó trong trình quản lý mật khẩu.

## Đăng nhập

1. Mở ứng dụng đường dây nóng trong trình duyệt
2. Dán `nsec` của bạn vào ô đăng nhập
3. Ứng dụng xác minh danh tính của bạn bằng mật mã — khóa bí mật không bao giờ rời khỏi trình duyệt

Sau lần đăng nhập đầu tiên, bạn sẽ được yêu cầu đặt tên hiển thị và ngôn ngữ ưa thích.

### Đăng nhập bằng passkey (tùy chọn)

Nếu quản trị viên đã bật passkey, bạn có thể đăng ký khóa phần cứng hoặc sinh trắc học trong **Cài đặt**. Điều này cho phép bạn đăng nhập trên các thiết bị khác mà không cần nhập nsec.

## Bảng điều khiển

Sau khi đăng nhập, bạn sẽ thấy bảng điều khiển với:

- **Cuộc gọi đang hoạt động** — các cuộc gọi đang được xử lý
- **Trạng thái ca trực của bạn** — hiển thị trong thanh bên (ca trực hiện tại hoặc ca trực sắp tới)
- **Tình nguyện viên trực tuyến** — số lượng người sẵn sàng

## Nhận cuộc gọi

Khi có cuộc gọi đến trong ca trực, bạn sẽ được thông báo qua:

- **Nhạc chuông** trong trình duyệt (có thể bật/tắt trong Cài đặt)
- **Thông báo đẩy** nếu bạn đã cấp quyền
- **Tiêu đề tab nhấp nháy**

Nhấn **Trả lời** để nhận cuộc gọi. Điện thoại của bạn sẽ đổ chuông — trả lời để kết nối với người gọi. Nếu tình nguyện viên khác trả lời trước, chuông sẽ ngừng.

## Trong cuộc gọi

Trong khi đang gọi, bạn sẽ thấy:

- **Bộ đếm thời gian** hiển thị thời lượng cuộc gọi
- **Bảng ghi chú** nơi bạn có thể viết ghi chú theo thời gian thực
- Nút **Báo cáo spam** để đánh dấu người gọi

Ghi chú được tự động lưu dưới dạng bản nháp được mã hóa. Bạn cũng có thể lưu ghi chú thủ công.

## Viết ghi chú

Ghi chú được mã hóa trong trình duyệt trước khi gửi đến máy chủ. Chỉ bạn và quản trị viên mới có thể đọc chúng.

Nếu quản trị viên đã cấu hình trường tùy chỉnh (văn bản, danh sách thả xuống, hộp kiểm, v.v.), chúng sẽ xuất hiện trong biểu mẫu ghi chú. Điền vào khi cần thiết — chúng được mã hóa cùng với văn bản ghi chú của bạn.

Điều hướng đến **Ghi chú** trong thanh bên để xem lại, chỉnh sửa hoặc tìm kiếm các ghi chú trước đây. Bạn có thể xuất ghi chú dưới dạng tệp được mã hóa.

## Chuyển đổi giọng nói

Nếu chuyển đổi giọng nói được bật (bởi quản trị viên và theo cài đặt cá nhân của bạn), cuộc gọi sẽ được tự động chuyển đổi thành văn bản sau khi kết thúc. Bản chuyển đổi sẽ xuất hiện bên cạnh ghi chú của bạn cho cuộc gọi đó.

Bạn có thể bật hoặc tắt chuyển đổi giọng nói trong **Cài đặt**. Khi tắt, cuộc gọi của bạn sẽ không được chuyển đổi bất kể cài đặt toàn cục của quản trị viên.

Bản chuyển đổi được mã hóa khi lưu trữ — máy chủ xử lý âm thanh tạm thời, sau đó mã hóa văn bản kết quả.

## Nghỉ giải lao

Chuyển đổi nút **Nghỉ** trong thanh bên để tạm dừng nhận cuộc gọi mà không rời ca trực. Cuộc gọi sẽ không đổ chuông điện thoại của bạn trong khi nghỉ. Chuyển lại khi bạn sẵn sàng.

## Mẹo hữu ích

- Sử dụng <kbd>Ctrl</kbd>+<kbd>K</kbd> (hoặc <kbd>Cmd</kbd>+<kbd>K</kbd> trên Mac) để mở bảng lệnh để điều hướng nhanh
- Nhấn <kbd>?</kbd> để xem tất cả phím tắt
- Cài đặt ứng dụng dưới dạng PWA để có trải nghiệm như ứng dụng gốc và thông báo tốt hơn
- Giữ tab trình duyệt mở trong ca trực để nhận cảnh báo cuộc gọi theo thời gian thực
