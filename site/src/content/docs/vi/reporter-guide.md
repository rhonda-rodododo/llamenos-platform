---
title: Hướng dẫn người báo cáo
description: Cách gửi báo cáo được mã hóa và theo dõi trạng thái của chúng.
---

Với tư cách là người báo cáo, bạn có thể gửi các báo cáo được mã hóa đến tổ chức của mình thông qua nền tảng Llamenos. Báo cáo được mã hóa đầu cuối — máy chủ không bao giờ thấy nội dung báo cáo của bạn.

## Bắt đầu

Quản trị viên sẽ cung cấp cho bạn một trong hai:
- Một **nsec** (khóa bí mật Nostr) — một chuỗi bắt đầu bằng `nsec1`
- Một **liên kết mời** — URL sử dụng một lần tạo thông tin xác thực cho bạn

**Giữ nsec của bạn riêng tư.** Đó là danh tính và thông tin đăng nhập của bạn. Lưu trữ nó trong trình quản lý mật khẩu.

## Đăng nhập

1. Mở ứng dụng trong trình duyệt
2. Dán `nsec` vào trường đăng nhập
3. Danh tính của bạn được xác minh bằng mật mã học — khóa bí mật không bao giờ rời khỏi trình duyệt

Sau lần đăng nhập đầu tiên, bạn có thể đăng ký passkey WebAuthn trong Cài đặt để đăng nhập dễ dàng hơn.

## Gửi báo cáo

1. Nhấp **Báo cáo mới** từ trang Báo cáo
2. Nhập **tiêu đề** cho báo cáo (giúp quản trị viên phân loại — lưu dưới dạng văn bản rõ)
3. Chọn **danh mục** nếu quản trị viên đã định nghĩa
4. Viết **nội dung báo cáo** — được mã hóa trước khi rời trình duyệt
5. Tùy chọn điền các **trường tùy chỉnh**
6. Tùy chọn **đính kèm file** — file được mã hóa phía máy khách trước khi tải lên
7. Nhấp **Gửi**

Báo cáo xuất hiện trong danh sách với trạng thái "Mở".

## Mã hóa báo cáo

- Nội dung báo cáo và giá trị trường tùy chỉnh được mã hóa bằng ECIES (secp256k1 + XChaCha20-Poly1305)
- Tệp đính kèm được mã hóa riêng biệt
- Chỉ bạn và quản trị viên có thể giải mã
- Máy chủ chỉ lưu bản mã — ngay cả khi cơ sở dữ liệu bị xâm phạm, nội dung vẫn an toàn

## Theo dõi báo cáo

Trang Báo cáo hiển thị tất cả báo cáo đã gửi với:
- **Tiêu đề** và **danh mục**
- **Trạng thái** — Mở, Đã nhận (quản trị viên đang xử lý) hoặc Đã giải quyết
- **Ngày** gửi

Nhấp vào báo cáo để xem toàn bộ luồng hội thoại, bao gồm phản hồi của quản trị viên.

## Trả lời quản trị viên

Khi quản trị viên phản hồi, câu trả lời xuất hiện trong luồng báo cáo. Bạn có thể trả lời lại — tất cả tin nhắn đều được mã hóa.

## Những gì bạn không thể làm

Với tư cách người báo cáo, quyền truy cập bị giới hạn để bảo vệ quyền riêng tư:
- Bạn **có thể** xem báo cáo của mình và trang Trợ giúp
- Bạn **không thể** xem báo cáo của người khác, bản ghi cuộc gọi, thông tin tình nguyện viên hoặc cài đặt quản trị
- Bạn **không thể** nhận cuộc gọi hoặc trả lời tin nhắn SMS/WhatsApp/Signal

## Mẹo

- Sử dụng tiêu đề mô tả — giúp quản trị viên phân loại mà không cần giải mã toàn bộ
- Đính kèm file liên quan (ảnh chụp màn hình, tài liệu) khi hỗ trợ báo cáo
- Kiểm tra định kỳ phản hồi của quản trị viên
- Sử dụng trang Trợ giúp cho FAQ và hướng dẫn
