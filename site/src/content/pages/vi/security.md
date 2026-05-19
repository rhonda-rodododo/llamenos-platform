---
title: Bảo mật và Quyền riêng tư
subtitle: Những gì được bảo vệ, những gì hiển thị và những gì có thể lấy được theo trát hầu tòa — tổ chức theo tính năng bạn sử dụng.
---

## Nếu nhà cung cấp dịch vụ lưu trữ của bạn nhận được trát hầu tòa

| Họ CÓ THỂ cung cấp | Họ KHÔNG THỂ cung cấp |
|--------------------|----------------------|
| Siêu dữ liệu cuộc gọi/tin nhắn (thời gian, thời lượng) | Nội dung ghi chú, bản ghi, nội dung báo cáo |
| Các blob cơ sở dữ liệu được mã hóa | Tên tình nguyện viên (mã hóa đầu cuối) |
| Tài khoản tình nguyện viên nào hoạt động khi nào | Hồ sơ thư mục liên hệ (mã hóa đầu cuối) |
| Hồ sơ giao nhận tin nhắn hàng loạt | Nội dung tin nhắn (được mã hóa khi đến, lưu dưới dạng bản mã) |
| | Khóa giải mã (được bảo vệ bởi PIN, nhà cung cấp danh tính và tùy chọn khóa bảo mật phần cứng) |
| | Khóa mã hóa mỗi ghi chú (tạm thời — bị phá hủy sau khi đóng gói) |
| | Bí mật HMAC của bạn để đảo ngược hash số điện thoại |
| | Nội dung mảnh khôi phục (được mã hóa, máy chủ không thể đọc) |

**Máy chủ lưu trữ dữ liệu mà nó không thể đọc.** Siêu dữ liệu (khi nào, bao lâu, tài khoản nào) hiển thị. Nội dung (điều gì đã được nói, viết, ai là liên hệ của bạn) thì không.

---

## Theo tính năng

Mức độ phơi lộ quyền riêng tư của bạn phụ thuộc vào kênh bạn bật:

### Cuộc gọi thoại

| Nếu bạn sử dụng... | Bên thứ ba có thể truy cập | Máy chủ có thể truy cập | Nội dung mã hóa đầu cuối |
|--------------------|--------------------------|------------------------|--------------------------|
| Twilio/SignalWire/Vonage/Plivo | Âm thanh cuộc gọi (trực tiếp), hồ sơ | Siêu dữ liệu cuộc gọi | Ghi chú, bản ghi |
| Asterisk tự lưu trữ | Không có gì (bạn kiểm soát) | Siêu dữ liệu cuộc gọi | Ghi chú, bản ghi |
| Trình duyệt-đến-trình duyệt (WebRTC) | Không có gì | Siêu dữ liệu cuộc gọi | Ghi chú, bản ghi |

**Trát hầu tòa với nhà cung cấp điện thoại**: Họ có hồ sơ chi tiết cuộc gọi (thời gian, số điện thoại, thời lượng). Họ KHÔNG có ghi chú hoặc bản ghi. Ghi âm bị tắt theo mặc định.

**Phiên âm**: Phiên âm xảy ra hoàn toàn trong trình duyệt của bạn sử dụng AI cục bộ. **Âm thanh không bao giờ rời thiết bị của bạn.**

### Tin nhắn văn bản (một-một)

| Kênh | Truy cập nhà cung cấp | Lưu trữ máy chủ | Ghi chú |
|------|----------------------|----------------|---------|
| SMS | Nhà cung cấp điện thoại của bạn đọc tất cả tin nhắn | **Mã hóa** | Nhà cung cấp giữ lại tin nhắn gốc |
| WhatsApp | Meta đọc tất cả tin nhắn | **Mã hóa** | Nhà cung cấp giữ lại tin nhắn gốc |
| Signal | Mạng Signal là E2EE; cầu nối mã hóa lại khi đến | **Mã hóa** | Tuyến đường ưu tiên khi có sẵn |

**Định tuyến ưu tiên Signal**: Khi người nhận có Signal, tin nhắn được tự động định tuyến qua Signal. Đối với SMS, chỉ thông báo chung được gửi theo mặc định (không có nội dung tin nhắn).

**Tin nhắn được mã hóa ngay khi đến máy chủ của bạn.** Máy chủ chỉ lưu bản mã.

### Tin nhắn hàng loạt và phát sóng

Quản trị viên có thể gửi tin nhắn hàng loạt cho người đăng ký qua SMS, WhatsApp, Signal hoặc RCS.

**Quan trọng: tin nhắn hàng loạt gửi đi KHÔNG được mã hóa đầu cuối ở máy chủ.** Để gửi tin nhắn đến người đăng ký SMS hoặc WhatsApp, máy chủ phải xử lý nội dung ở dạng văn bản thuần túy trong giây lát và chuyển cho nhà cung cấp nhắn tin.

| Kênh | Truy cập máy chủ khi gửi | Truy cập nhà cung cấp | Sau khi giao nhận |
|------|--------------------------|----------------------|-----------------|
| SMS hàng loạt | Văn bản thuần túy (tạm thời, để giao nhận) | Nội dung đầy đủ | Nhà cung cấp giữ lại |
| WhatsApp hàng loạt | Văn bản thuần túy (tạm thời, để giao nhận) | Nội dung đầy đủ (Meta) | Nhà cung cấp giữ lại |
| Signal hàng loạt | Văn bản thuần túy (tạm thời, để giao nhận) | Mã hóa E2EE qua mạng Signal | Nhà cung cấp không giữ lại |
| RCS hàng loạt | Văn bản thuần túy (tạm thời, để giao nhận) | Google có thể xem nội dung | Nhà cung cấp giữ lại |

**Điều này có nghĩa là gì**: Tin nhắn hàng loạt không nên chứa thông tin nhạy cảm về người gọi. Sử dụng chúng cho thông báo — không phải chi tiết vụ việc.

Số điện thoại của người đăng ký được lưu trữ dưới dạng mã định danh được băm — cơ sở dữ liệu của bạn không bao giờ chứa danh sách người đăng ký ở dạng văn bản thuần túy.

### Ghi chú, bản ghi và báo cáo

Tất cả nội dung do tình nguyện viên viết đều được mã hóa đầu cuối:

- Mỗi ghi chú sử dụng một **khóa ngẫu nhiên duy nhất** (bí mật tiến — xâm phạm một ghi chú không xâm phạm các ghi chú khác)
- Khóa được đóng gói riêng cho tình nguyện viên và mỗi quản trị viên
- Máy chủ chỉ lưu trữ bản mã
- Giải mã xảy ra trên thiết bị của bạn, trong một lớp an toàn không bao giờ tiết lộ khóa cho giao diện ứng dụng
- **Trường tùy chỉnh, nội dung báo cáo và tệp đính kèm đều được mã hóa riêng**

**Hồ sơ vụ việc và dữ liệu thực thể**: Tuân theo cùng mô hình mã hóa — mỗi mục được mã hóa bằng khóa duy nhất.

**Tịch thu thiết bị**: Không có PIN của bạn **và** quyền truy cập vào tài khoản nhà cung cấp danh tính, kẻ tấn công chỉ nhận được blob được mã hóa bảo vệ bởi Argon2id. Với khóa bảo mật phần cứng, **ba yếu tố độc lập** bảo vệ dữ liệu của bạn.

---

## Thiết bị của bạn

### Xem và thu hồi thiết bị

Ứng dụng duy trì danh sách từng thiết bị bạn đã đăng nhập. Bạn có thể xem danh sách này và thu hồi bất kỳ thiết bị nào bạn không nhận ra.

**Khi bạn thu hồi một thiết bị:**
- Thiết bị đó ngay lập tức bị chặn khỏi tài khoản của bạn
- Khóa mã hóa của bạn được xoay để thiết bị bị thu hồi không thể giải mã nội dung trong tương lai
- Việc thu hồi được ghi lại trong lịch sử bảo mật tài khoản của bạn

### Xác minh emoji SAS

Đối với các tổ chức có nhu cầu bảo mật cao, quản trị viên có thể xác minh danh tính thiết bị sử dụng xác minh SAS (Chuỗi Xác thực Ngắn) — được hiển thị dưới dạng chuỗi 7 emoji.

**Cách thức hoạt động:**
1. Quản trị viên và chủ sở hữu thiết bị so sánh chuỗi emoji của họ (trực tiếp, qua điện thoại hoặc qua kênh đáng tin cậy)
2. Nếu emoji khớp, thiết bị được xác nhận là thuộc về chủ sở hữu đã đăng ký
3. Xác minh được ghi lại — quản trị viên có thể thấy thiết bị nào đã được xác minh

Điều này bảo vệ chống lại kẻ tấn công đã đăng ký thiết bị giả mạo dưới tài khoản của người khác.

---

## Xóa tài khoản

### Xóa do người dùng tự thực hiện

Bạn có thể yêu cầu xóa vĩnh viễn tài khoản và tất cả dữ liệu liên quan. Mặc định có độ trễ (được cấu hình bởi quản trị viên hub, thường là 72 giờ) trước khi xóa hoàn tất — điều này cho bạn thời gian hủy nếu yêu cầu được thực hiện dưới ép buộc.

**Những gì bị xóa:**
- Khóa thiết bị của bạn (làm cho tất cả nội dung mã hóa vĩnh viễn không thể đọc, ngay cả từ bản sao lưu)
- Hồ sơ tài khoản, phân công vai trò và lịch sử ca trực của bạn
- Token thông báo đẩy của bạn

**Điều gì xảy ra với nội dung mã hóa bạn đã tạo**: Ghi chú và báo cáo bạn đã viết được mã hóa lại cho những người đọc được ủy quyền còn lại. Bản sao khóa giải mã của bạn bị phá hủy.

**Nhật ký kiểm tra**: Các mục nhật ký kiểm tra của bạn bị "phá hủy mật mã" — khóa mã hóa mỗi người dùng bị phá hủy, làm cho các mục của bạn không thể đọc. Chuỗi hash vẫn còn nguyên.

### Xóa khẩn cấp

Nếu bạn tin tài khoản đang bị đe dọa ngay lập tức, bạn có thể yêu cầu xóa khẩn cấp với đồng phê duyệt — giảm độ trễ xuống tối thiểu 4 giờ. Mức tối thiểu 4 giờ tồn tại để bảo vệ khỏi việc xóa bị ép buộc.

---

## Nhóm khôi phục

Nếu bạn mất tất cả thiết bị, bạn thường sẽ mất quyền truy cập vào tất cả dữ liệu mã hóa. Nhóm khôi phục giải quyết điều này.

### Cách khôi phục hoạt động

Bạn chỉ định một nhóm liên hệ đáng tin cậy (thường 3-5 người) làm nhóm khôi phục. Mỗi liên hệ giữ một "mảnh" của khóa khôi phục.

**Để khôi phục tài khoản của bạn:**
1. Bạn đăng ký thiết bị mới và khởi tạo yêu cầu khôi phục
2. Các liên hệ khôi phục của bạn nhận được thông báo
3. Sau độ trễ có thể cấu hình, số ngưỡng liên hệ (ví dụ: 2 trong 3) phê duyệt yêu cầu
4. Mỗi liên hệ phê duyệt gửi mảnh của họ, được mã hóa trực tiếp đến thiết bị mới của bạn
5. Thiết bị mới của bạn kết hợp các mảnh để tái tạo khóa khôi phục

**Máy chủ có thể thấy gì**: Máy chủ chuyển tiếp các mảnh mã hóa giữa các thiết bị. Nó không thể đọc các mảnh và không thể tự tái tạo khóa khôi phục.

### Thuộc tính bảo mật của nhóm khôi phục

- **Bảo mật ngưỡng**: Các mảnh dưới ngưỡng không tiết lộ gì về bí mật
- **Không có sự tham gia của máy chủ vào bí mật**: Các mảnh được mã hóa trực tiếp vào khóa công khai của thiết bị mới
- **Phạm vi hub**: Khôi phục khôi phục quyền truy cập của bạn vào hub cụ thể
- **Độ trễ có thể hủy**: Bạn có thể hủy yêu cầu khôi phục trong thời gian trễ
- **Xác minh qua Signal**: Yêu cầu khôi phục được xác minh qua Signal

---

## Quyền riêng tư số điện thoại tình nguyện viên

Khi tình nguyện viên nhận cuộc gọi trên điện thoại cá nhân, số điện thoại của họ bị lộ với nhà cung cấp điện thoại của bạn.

| Kịch bản | Số điện thoại hiển thị với |
|----------|--------------------------|
| Cuộc gọi PSTN đến điện thoại tình nguyện viên | Nhà cung cấp điện thoại, nhà mạng |
| Trình duyệt đến trình duyệt (WebRTC) | Không ai (âm thanh ở lại trong trình duyệt) |
| Asterisk tự lưu trữ + điện thoại SIP | Chỉ máy chủ Asterisk của bạn |

**Để bảo vệ số điện thoại tình nguyện viên**: Sử dụng cuộc gọi qua trình duyệt (WebRTC) hoặc cung cấp điện thoại SIP kết nối với Asterisk tự lưu trữ.

---

## Mới phát hành gần đây

Những cải tiến này có sẵn ngay hôm nay:

| Tính năng | Lợi ích quyền riêng tư |
|-----------|----------------------|
| Quản lý thiết bị | Xem và thu hồi bất kỳ thiết bị đã đăng nhập; thu hồi kích hoạt xoay khóa |
| Xác minh emoji SAS thiết bị | Quản trị viên có thể xác minh thiết bị trực tiếp bằng dấu vân tay mật mã gồm 7 emoji |
| Xóa tài khoản có độ trễ | Yêu cầu xóa; độ trễ có thể cấu hình cho phép hủy khi bị ép buộc |
| Xóa khẩn cấp | Xóa nhanh được đồng phê duyệt với tối thiểu 4 giờ |
| Phá hủy mật mã khi xóa | Khóa mã hóa bị phá hủy trước, làm nội dung vĩnh viễn không thể đọc |
| Nhóm khôi phục (Shamir) | Chỉ định liên hệ đáng tin cậy có thể giúp khôi phục nếu mất tất cả thiết bị |
| Tin nhắn hàng loạt với tiết lộ trung thực | Quản trị viên có thể gửi tin nhắn hàng loạt; máy chủ xử lý văn bản thuần túy tạm thời để giao nhận |
| Băm người đăng ký | Số điện thoại người đăng ký được lưu dưới dạng mã định danh băm |
| Bảo vệ khóa Argon2id | Khóa thiết bị được bảo vệ bởi hàm yêu cầu bộ nhớ cao |
| Định tuyến ưu tiên Signal | Tin nhắn tự động định tuyến qua Signal khi có sẵn |
| Chế độ SMS chỉ thông báo | Người nhận SMS chỉ thấy "bạn có tin nhắn mới" |
| Kháng phân tích lưu lượng | Kích thước sự kiện được đệm để quan sát viên không thể phân biệt |
| Không có số điện thoại văn bản thuần túy | Số người gọi được lưu dưới dạng hash không thể đảo ngược |
| Mã hóa theo hub với bí mật tiến | Khóa xoay mỗi 24 giờ |
| Mật mã học Rust trên mọi nền tảng | Cùng thư viện Rust mật mã học được kiểm toán trên máy tính, iOS và Android |
| Truy cập relay bị hạn chế | WebSocket relay chỉ chấp nhận sự kiện từ máy chủ của bạn |
| Lưu trữ tin nhắn mã hóa | SMS, WhatsApp và Signal được lưu dưới dạng bản mã |
| Phiên âm trên thiết bị | Âm thanh không bao giờ rời thiết bị của bạn |
| Bảo vệ khóa đa yếu tố | PIN, nhà cung cấp danh tính và tùy chọn khóa bảo mật phần cứng |
| Khóa bảo mật phần cứng | Yếu tố thứ ba không thể bị xâm phạm từ xa |
| Các bản dựng có thể tái tạo | Xác minh rằng mã được triển khai khớp với nguồn công khai |
| Thư mục liên hệ mã hóa | Hồ sơ liên hệ, mối quan hệ và ghi chú được mã hóa đầu cuối |

## Vẫn đang lên kế hoạch

| Tính năng | Lợi ích quyền riêng tư | Trạng thái |
|-----------|-----------------------|-----------|
| Ứng dụng nhận cuộc gọi gốc | Không lộ số điện thoại cá nhân | Đang phát triển |
| Ghim chứng chỉ (di động) | Phòng thủ chống lại chặn TLS bởi CA giả mạo | Cấu trúc hoàn chỉnh; ghim đang chờ |
| Mã hóa phương tiện thoại SFrame | Cuộc gọi thoại mã hóa đầu cuối | Dẫn xuất khóa hoàn chỉnh; mã hóa mỗi khung được lên kế hoạch |

---

## Bảng tóm tắt

| Loại dữ liệu | Mã hóa | Hiển thị với máy chủ | Lấy được theo trát |
|-------------|--------|---------------------|-------------------|
| Ghi chú cuộc gọi | Có (đầu cuối) | Không | Chỉ bản mã |
| Bản ghi | Có (đầu cuối) | Không | Chỉ bản mã |
| Báo cáo | Có (đầu cuối) | Không | Chỉ bản mã |
| Hồ sơ vụ việc / dữ liệu thực thể | Có (đầu cuối) | Không | Chỉ bản mã |
| Tệp đính kèm | Có (đầu cuối) | Không | Chỉ bản mã |
| Hồ sơ liên hệ | Có (đầu cuối) | Không | Chỉ bản mã |
| Danh tính tình nguyện viên | Có (đầu cuối) | Không | Chỉ bản mã |
| Siêu dữ liệu nhóm/vai trò | Có (mã hóa) | Không | Chỉ bản mã |
| Định nghĩa trường tùy chỉnh | Có (mã hóa) | Không | Chỉ bản mã |
| Nội dung SMS/WhatsApp/Signal đến | Có (trên máy chủ của bạn) | Không | Bản mã từ máy chủ; nhà cung cấp có thể có bản gốc |
| Tin nhắn hàng loạt đi | **Không — văn bản thuần túy khi giao nhận** | **Có, tạm thời** | Có (văn bản thuần túy tại thời điểm gửi) |
| Mảnh khôi phục | Có (đầu cuối đến thiết bị) | Không | Chỉ bản mã |
| Sự kiện thời gian thực | Có (theo hub, khóa xoay) | Không | Chỉ bản mã |
| Siêu dữ liệu cuộc gọi | Không | Có | Có |
| Hồ sơ giao nhận hàng loạt | Không | Có | Có |
| Hash số điện thoại người gọi | Hash HMAC | Chỉ hash | Hash (không thể đảo ngược không có bí mật của bạn) |
| Hash số điện thoại người đăng ký | Hash HMAC | Chỉ hash | Hash (không thể đảo ngược không có bí mật của bạn) |
| Chuỗi User-Agent | Hash SHA-256 | Chỉ hash | Hash (không thể đảo ngược) |

---

## Dành cho kiểm toán viên bảo mật

Tài liệu kỹ thuật:

- [Thông số giao thức](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/PROTOCOL.md)
- [Mô hình mối đe dọa](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/THREAT_MODEL.md)
- [Phân loại dữ liệu](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Khoảng trống bảo mật và lộ trình](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/SECURITY_GAPS_AND_ROADMAP.md)
- [Kiểm toán bảo mật](https://github.com/rhonda-rodododo/llamenos-platform/tree/main/docs/security)
- [Tài liệu API](/api/docs)

Llamenos là mã nguồn mở: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
