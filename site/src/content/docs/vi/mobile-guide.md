---
title: Hướng dẫn ứng dụng di động
description: Cài đặt và thiết lập ứng dụng Llamenos trên iOS và Android.
---

Ứng dụng Llamenos cho phép tình nguyện viên nhận cuộc gọi, trả lời tin nhắn và viết ghi chú được mã hóa từ điện thoại. Ứng dụng được xây dựng với React Native và chia sẻ cùng lõi mật mã Rust với ứng dụng desktop.

## Ứng dụng di động là gì?

Ứng dụng di động là ứng dụng đồng hành với ứng dụng desktop. Nó kết nối đến cùng backend Llamenos (Cloudflare Workers hoặc tự lưu trữ) và sử dụng cùng giao thức.

Ứng dụng nằm trong kho riêng (`llamenos-mobile`) nhưng chia sẻ:

- **llamenos-core** — Cùng Rust crate cho tất cả phép toán mật mã, biên dịch qua UniFFI cho iOS và Android
- **Giao thức** — Cùng định dạng wire, API endpoints và lược đồ mã hóa
- **Backend** — Cùng Cloudflare Worker hoặc máy chủ tự lưu trữ

## Tải và cài đặt

### Android

Ứng dụng hiện được phân phối dưới dạng APK:

1. Tải file `.apk` mới nhất từ trang [GitHub Releases](https://github.com/rhonda-rodododo/llamenos-mobile/releases/latest)
2. Trên thiết bị Android, vào **Cài đặt > Bảo mật** và bật **Cài đặt từ nguồn không xác định**
3. Mở APK đã tải và nhấn **Cài đặt**
4. Mở Llamenos từ danh sách ứng dụng

Phân phối qua Play Store được lên kế hoạch cho bản phát hành tương lai.

### iOS

Bản iOS khả dụng qua TestFlight:

1. Cài [TestFlight](https://apps.apple.com/app/testflight/id899247664) từ App Store
2. Hỏi quản trị viên liên kết mời TestFlight
3. Mở liên kết trên thiết bị iOS để tham gia beta
4. Cài Llamenos từ TestFlight

## Thiết lập ban đầu

Ứng dụng di động được thiết lập bằng cách liên kết với tài khoản desktop hiện có. Đảm bảo cùng danh tính mật mã được sử dụng trên tất cả thiết bị mà không truyền khóa bí mật dưới dạng bản rõ.

### Cung cấp thiết bị (quét QR)

1. Mở ứng dụng Llamenos desktop và vào **Cài đặt > Thiết bị**
2. Nhấp **Liên kết thiết bị mới** — tạo mã QR chứa token cung cấp một lần
3. Mở ứng dụng di động và nhấn **Liên kết thiết bị**
4. Quét mã QR bằng camera
5. Ứng dụng thực hiện trao đổi khóa ECDH tạm thời để truyền an toàn tài liệu khóa mã hóa
6. Đặt PIN trên ứng dụng di động để bảo vệ lưu trữ khóa cục bộ
7. Ứng dụng đã liên kết và sẵn sàng sử dụng

### Thiết lập thủ công (nhập nsec)

Nếu không thể quét mã QR:

1. Mở ứng dụng di động và nhấn **Nhập nsec thủ công**
2. Dán khóa `nsec1...`
3. Đặt PIN
4. Ứng dụng dẫn xuất khóa công khai và đăng ký với backend

## So sánh tính năng

| Tính năng | Desktop | Di động |
|-----------|---------|---------|
| Nhận cuộc gọi đến | Có | Có |
| Viết ghi chú mã hóa | Có | Có |
| Trường tùy chỉnh | Có | Có |
| Trả lời tin nhắn (SMS, WhatsApp, Signal) | Có | Có |
| Xem hội thoại | Có | Có |
| Trạng thái ca và nghỉ | Có | Có |
| Chuyển đổi giọng nói phía máy khách | Có (WASM Whisper) | Không |
| Tìm kiếm ghi chú | Có | Có |
| Bảng lệnh | Có (Ctrl+K) | Không |
| Phím tắt | Có | Không |
| Cài đặt quản trị | Có (đầy đủ) | Có (giới hạn) |
| Quản lý tình nguyện viên | Có | Chỉ xem |
| Xem nhật ký kiểm toán | Có | Có |
| Gọi WebRTC trình duyệt | Có | Không (dùng điện thoại gốc) |
| Thông báo đẩy | Thông báo OS | Push gốc (FCM/APNS) |
| Cập nhật tự động | Tauri updater | App Store / TestFlight |
| Tệp đính kèm (báo cáo) | Có | Có |

## Hạn chế

- **Không có chuyển đổi giọng nói phía máy khách** — Mô hình WASM Whisper yêu cầu bộ nhớ và CPU lớn, không thực tế trên di động.
- **Hiệu suất mật mã thấp hơn** — Trên thiết bị cũ có thể chậm hơn desktop.
- **Tính năng quản trị giới hạn** — Một số thao tác quản trị chỉ khả dụng trên desktop.
- **Không có gọi WebRTC** — Tình nguyện viên di động nhận cuộc gọi qua số điện thoại.
- **Pin và kết nối** — Ứng dụng cần kết nối liên tục. Giữ ứng dụng ở foreground trong ca trực.

## Khắc phục sự cố di động

### Cung cấp thất bại với "Mã QR không hợp lệ"

- Đảm bảo mã QR được tạo gần đây (token hết hạn sau 5 phút)
- Tạo mã QR mới từ ứng dụng desktop
- Đảm bảo cả hai thiết bị kết nối internet

### Không nhận được thông báo đẩy

- Kiểm tra quyền thông báo trong cài đặt thiết bị
- Android: **Cài đặt > Ứng dụng > Llamenos > Thông báo**
- iOS: **Cài đặt > Thông báo > Llamenos** và bật **Cho phép thông báo**
- Đảm bảo không ở chế độ Không làm phiền
- Xác minh ca trực đang hoạt động

### Ứng dụng crash khi khởi động

- Đảm bảo đang chạy phiên bản mới nhất
- Xóa cache ứng dụng: **Cài đặt > Ứng dụng > Llamenos > Bộ nhớ > Xóa cache**
- Nếu vấn đề tiếp tục, gỡ cài đặt và cài lại (cần liên kết lại thiết bị)

### Không thể giải mã ghi chú cũ sau cài lại

- Cài lại ứng dụng xóa tài liệu khóa cục bộ
- Liên kết lại thiết bị qua mã QR từ ứng dụng desktop
- Ghi chú được mã hóa trước khi cài lại sẽ truy cập được sau khi liên kết lại với cùng danh tính
