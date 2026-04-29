---
title: Bảo mật và Quyền riêng tư
subtitle: Những gì được bảo vệ, những gì hiển thị và những gì có thể lấy được theo trát hầu tòa — tổ chức theo tính năng bạn sử dụng.
---

## Nếu nhà cung cấp hosting nhận trát hầu tòa

| Họ CÓ THỂ cung cấp | Họ KHÔNG THỂ cung cấp |
|---------------------|----------------------|
| Metadata cuộc gọi/tin nhắn (thời gian, thời lượng) | Nội dung ghi chú, bản chuyển đổi, nội dung báo cáo |
| Blob cơ sở dữ liệu mã hóa | Tên tình nguyện viên (mã hóa đầu cuối) |
| Tình nguyện viên nào hoạt động khi nào | Bản ghi danh bạ liên hệ (mã hóa đầu cuối) |
| | Nội dung tin nhắn (mã hóa khi đến, lưu trữ dưới dạng bản mã) |
| | Khóa giải mã (được bảo vệ bởi PIN, tài khoản nhà cung cấp danh tính và tùy chọn khóa bảo mật phần cứng) |
| | Khóa mã hóa mỗi ghi chú (tạm thời — bị hủy sau khi bọc) |
| | Bí mật HMAC để đảo ngược hash số điện thoại |

**Máy chủ lưu dữ liệu mà nó không thể đọc.** Metadata (khi nào, bao lâu, tài khoản nào) hiển thị. Nội dung (nói gì, viết gì, liên hệ của bạn là ai) không hiển thị.

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

**Chuyển đổi giọng nói**: Chuyển đổi diễn ra hoàn toàn trong trình duyệt của bạn bằng AI trên thiết bị. **Âm thanh không bao giờ rời khỏi thiết bị của bạn.** Chỉ bản chuyển đổi đã mã hóa được lưu trữ.

### Tin nhắn văn bản

| Kênh | Nhà cung cấp truy cập | Lưu trữ máy chủ | Ghi chú |
|------|----------------------|------------------|---------|
| SMS | Nhà cung cấp đọc tất cả tin nhắn | **Mã hóa** | Nhà cung cấp giữ lại tin nhắn gốc |
| WhatsApp | Meta đọc tất cả tin nhắn | **Mã hóa** | Nhà cung cấp giữ lại tin nhắn gốc |
| Signal | Mạng Signal là E2EE, nhưng cầu nối giải mã khi đến | **Mã hóa** | Tốt hơn SMS, không phải zero-knowledge |

**Tin nhắn được mã hóa ngay khi đến máy chủ của bạn.** Máy chủ chỉ lưu bản mã. Nhà cung cấp điện thoại hoặc tin nhắn của bạn có thể vẫn có tin nhắn gốc — đó là hạn chế của các nền tảng đó, không phải điều chúng tôi có thể thay đổi.

**Trát hầu tòa nhà cung cấp tin nhắn**: Nhà cung cấp SMS có toàn bộ nội dung tin nhắn. Meta có nội dung WhatsApp. Tin nhắn Signal là E2EE đến cầu nối, nhưng cầu nối (chạy trên máy chủ của bạn) giải mã trước khi mã hóa lại để lưu trữ. Trong mọi trường hợp, **máy chủ của bạn chỉ có bản mã** — nhà cung cấp hosting không thể đọc nội dung tin nhắn.

### Ghi chú, bản chuyển đổi và báo cáo

Tất cả nội dung tình nguyện viên viết đều được mã hóa đầu cuối:

- Mỗi ghi chú dùng **khóa ngẫu nhiên duy nhất** (bảo mật chuyển tiếp — xâm phạm một ghi chú không xâm phạm các ghi chú khác)
- Khóa được bọc riêng cho tình nguyện viên và mỗi quản trị viên
- Máy chủ chỉ lưu bản mã
- Giải mã diễn ra trong trình duyệt
- **Trường tùy chỉnh, nội dung báo cáo và tệp đính kèm đều được mã hóa riêng lẻ**

**Thu giữ thiết bị**: Không có PIN **và** quyền truy cập tài khoản nhà cung cấp danh tính, kẻ tấn công nhận blob mã hóa không thể giải mã về mặt tính toán. Nếu bạn cũng dùng khóa bảo mật phần cứng, **ba yếu tố độc lập** bảo vệ dữ liệu của bạn.

---

## Quyền riêng tư số điện thoại tình nguyện viên

Khi tình nguyện viên nhận cuộc gọi trên điện thoại cá nhân, số của họ bị lộ cho nhà cung cấp điện thoại.

| Tình huống | Số điện thoại hiển thị cho |
|------------|---------------------------|
| Cuộc gọi PSTN đến điện thoại tình nguyện viên | Nhà cung cấp, nhà mạng |
| Trình duyệt-đến-trình duyệt (WebRTC) | Không ai (âm thanh ở trong trình duyệt) |
| Asterisk tự lưu trữ + điện thoại SIP | Chỉ máy chủ Asterisk của bạn |

**Bảo vệ số điện thoại tình nguyện viên**: Sử dụng gọi qua trình duyệt (WebRTC) hoặc cung cấp điện thoại SIP kết nối Asterisk tự lưu trữ.

---

## Đã phát hành gần đây

Các cải tiến này đã hoạt động:

| Tính năng | Lợi ích bảo mật |
|-----------|-----------------|
| Lưu trữ tin nhắn mã hóa | SMS, WhatsApp và Signal được lưu dưới dạng bản mã trên máy chủ của bạn |
| Chuyển đổi trên thiết bị | Âm thanh không bao giờ rời trình duyệt — xử lý hoàn toàn trên thiết bị của bạn |
| Bảo vệ khóa đa yếu tố | Khóa mã hóa được bảo vệ bởi PIN, nhà cung cấp danh tính và tùy chọn khóa bảo mật phần cứng |
| Khóa bảo mật phần cứng | Khóa vật lý thêm yếu tố thứ ba không thể bị xâm phạm từ xa |
| Bản dựng tái tạo được | Xác minh mã triển khai khớp mã nguồn công khai |
| Danh bạ liên hệ mã hóa | Bản ghi liên hệ, mối quan hệ và ghi chú được mã hóa đầu cuối |

## Vẫn trong kế hoạch

| Tính năng | Lợi ích bảo mật |
|-----------|-----------------|
| Ứng dụng nhận cuộc gọi gốc | Không lộ số điện thoại cá nhân |

---

## Bảng tóm tắt

| Loại dữ liệu | Mã hóa | Máy chủ thấy | Lấy được qua trát hầu tòa |
|--------------|--------|-------------|--------------------------|
| Ghi chú cuộc gọi | Có (E2EE) | Không | Chỉ bản mã |
| Bản chuyển đổi | Có (E2EE) | Không | Chỉ bản mã |
| Báo cáo | Có (E2EE) | Không | Chỉ bản mã |
| Tệp đính kèm | Có (E2EE) | Không | Chỉ bản mã |
| Bản ghi liên hệ | Có (E2EE) | Không | Chỉ bản mã |
| Danh tính tình nguyện viên | Có (E2EE) | Không | Chỉ bản mã |
| Metadata nhóm/vai trò | Có (mã hóa) | Không | Chỉ bản mã |
| Định nghĩa trường tùy chỉnh | Có (mã hóa) | Không | Chỉ bản mã |
| Nội dung SMS/WhatsApp/Signal | Có (trên máy chủ bạn) | Không | Bản mã từ máy chủ bạn; nhà cung cấp có thể có bản gốc |
| Metadata cuộc gọi | Không | Có | Có |
| Hash số người gọi | HMAC hash | Chỉ hash | Hash (không đảo ngược được nếu không có bí mật) |

---

## Cho kiểm toán viên bảo mật

Tài liệu kỹ thuật:

- [Đặc tả giao thức](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/protocol/llamenos-protocol.md)
- [Mô hình đe dọa](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/THREAT_MODEL.md)
- [Phân loại dữ liệu](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Kiểm toán bảo mật](https://github.com/rhonda-rodododo/llamenos/tree/main/docs/security)
- [Tài liệu API](/api/docs)

Llamenos là mã nguồn mở: [github.com/rhonda-rodododo/llamenos](https://github.com/rhonda-rodododo/llamenos)
