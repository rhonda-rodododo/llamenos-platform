---
title: Bảo mật và Quyền riêng tư
subtitle: Những gì được bảo vệ, những gì hiển thị và những gì có thể lấy được theo trát hầu tòa — tổ chức theo tính năng bạn sử dụng.
---

## Nếu nhà cung cấp hosting nhận trát hầu tòa

| Họ CÓ THỂ cung cấp | Họ KHÔNG THỂ cung cấp |
|---------------------|----------------------|
| Metadata cuộc gọi/tin nhắn (thời gian, thời lượng) | Nội dung ghi chú, bản chuyển đổi, nội dung báo cáo |
| Blob cơ sở dữ liệu mã hóa | Khóa giải mã (lưu trên thiết bị của bạn) |
| Tình nguyện viên nào hoạt động khi nào | Khóa mã hóa mỗi ghi chú (tạm thời) |
| Nội dung tin nhắn SMS/WhatsApp | Bí mật HMAC để đảo ngược hash số điện thoại |

**Máy chủ lưu dữ liệu mà nó không thể đọc.** Metadata (khi nào, bao lâu, ai) hiển thị. Nội dung (nói gì, viết gì) không hiển thị.

---

## Theo tính năng

Mức độ quyền riêng tư phụ thuộc vào kênh bạn bật:

### Cuộc gọi thoại

| Nếu bạn dùng... | Bên thứ ba truy cập được | Máy chủ truy cập được | Nội dung E2EE |
|-----------------|-------------------------|----------------------|---------------|
| Twilio/SignalWire/Vonage/Plivo | Âm thanh cuộc gọi (trực tiếp), bản ghi | Metadata cuộc gọi | Ghi chú, bản chuyển đổi |
| Asterisk tự lưu trữ | Không có gì (bạn kiểm soát) | Metadata cuộc gọi | Ghi chú, bản chuyển đổi |
| Trình duyệt-đến-trình duyệt (WebRTC) | Không có gì | Metadata cuộc gọi | Ghi chú, bản chuyển đổi |

**Trát hầu tòa nhà cung cấp điện thoại**: Họ có bản ghi chi tiết cuộc gọi (thời gian, số điện thoại, thời lượng). Họ KHÔNG có ghi chú hoặc bản chuyển đổi. Ghi âm tắt mặc định.

**Cửa sổ chuyển đổi**: Trong khoảng 30 giây chuyển đổi, âm thanh được Cloudflare Workers AI xử lý. Sau đó chỉ lưu văn bản mã hóa.

### Tin nhắn văn bản

| Kênh | Nhà cung cấp truy cập | Lưu trữ máy chủ | Ghi chú |
|------|----------------------|------------------|---------|
| SMS | Nhà cung cấp đọc tất cả tin nhắn | Bản rõ | Hạn chế cố hữu của SMS |
| WhatsApp | Meta đọc tất cả tin nhắn | Bản rõ | Yêu cầu WhatsApp Business API |
| Signal | Mạng Signal là E2EE, nhưng cầu nối signal-cli giải mã | Bản rõ | Tốt hơn SMS, không phải zero-knowledge |

**Cải tiến tương lai**: Đang khám phá lưu trữ tin nhắn E2EE. Xem [kế hoạch](#ke-hoach).

### Ghi chú, bản chuyển đổi và báo cáo

Tất cả nội dung tình nguyện viên viết đều được mã hóa đầu cuối:

- Mỗi ghi chú dùng khóa ngẫu nhiên duy nhất (bảo mật chuyển tiếp)
- Khóa được bọc riêng cho tình nguyện viên và quản trị viên
- Máy chủ chỉ lưu bản mã
- Giải mã diễn ra trong trình duyệt

**Thu giữ thiết bị**: Không có PIN, kẻ tấn công nhận blob mã hóa. PIN 6 chữ số với 600K lần PBKDF2 mất hàng giờ brute-force trên GPU.

---

## Quyền riêng tư số điện thoại tình nguyện viên

| Tình huống | Số điện thoại hiển thị cho |
|------------|---------------------------|
| Cuộc gọi PSTN đến điện thoại tình nguyện viên | Nhà cung cấp, nhà mạng |
| Trình duyệt-đến-trình duyệt (WebRTC) | Không ai (âm thanh ở trong trình duyệt) |
| Asterisk tự lưu trữ + điện thoại SIP | Chỉ máy chủ Asterisk của bạn |

**Bảo vệ số điện thoại tình nguyện viên**: Sử dụng gọi qua trình duyệt (WebRTC) hoặc cung cấp điện thoại SIP kết nối Asterisk tự lưu trữ.

---

## Kế hoạch

| Tính năng | Trạng thái | Lợi ích bảo mật |
|-----------|-----------|-----------------|
| Lưu trữ tin nhắn E2EE | Đang lên kế hoạch | SMS/WhatsApp/Signal lưu dưới dạng bản mã |
| Chuyển đổi phía máy khách | Đang lên kế hoạch | Âm thanh không rời trình duyệt |
| Ứng dụng nhận cuộc gọi gốc | Đang lên kế hoạch | Không lộ số điện thoại cá nhân |
| Bản dựng tái tạo được | Đang lên kế hoạch | Xác minh mã triển khai khớp mã nguồn |
| Cầu nối Signal tự lưu trữ | Khả dụng | Chạy signal-cli trên hạ tầng riêng |

---

## Bảng tóm tắt

| Loại dữ liệu | Mã hóa | Máy chủ thấy | Lấy được qua trát hầu tòa |
|--------------|--------|-------------|--------------------------|
| Ghi chú cuộc gọi | Có (E2EE) | Không | Chỉ bản mã |
| Bản chuyển đổi | Có (E2EE) | Không | Chỉ bản mã |
| Báo cáo | Có (E2EE) | Không | Chỉ bản mã |
| Tệp đính kèm | Có (E2EE) | Không | Chỉ bản mã |
| Metadata cuộc gọi | Không | Có | Có |
| Danh tính tình nguyện viên | Mã hóa lưu trữ | Chỉ quản trị viên | Có (cần nỗ lực) |
| Hash số người gọi | HMAC hash | Chỉ hash | Hash (không đảo ngược được) |
| Nội dung SMS | Không | Có | Có |
| Nội dung WhatsApp | Không | Có | Có (cũng từ Meta) |
| Nội dung Signal | Không | Có | Có (từ máy chủ bạn) |

---

## Cho kiểm toán viên bảo mật

Tài liệu kỹ thuật:

- [Đặc tả giao thức](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/protocol/llamenos-protocol.md)
- [Mô hình đe dọa](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/THREAT_MODEL.md)
- [Phân loại dữ liệu](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Kiểm toán bảo mật](https://github.com/rhonda-rodododo/llamenos/tree/main/docs/security)

Llamenos là mã nguồn mở: [github.com/rhonda-rodododo/llamenos](https://github.com/rhonda-rodododo/llamenos)
