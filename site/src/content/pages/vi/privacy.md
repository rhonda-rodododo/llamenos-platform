---
title: Chính sách quyền riêng tư
subtitle: Llámenos thu thập gì, cách bảo vệ và quyền của bạn với tư cách người dùng.
---

**Ngày hiệu lực: 18 tháng 5 năm 2026**

Llámenos là phần mềm ứng phó khủng hoảng mã nguồn mở. Chính sách này áp dụng cho ứng dụng iOS Llámenos và các dịch vụ phụ trợ do quản trị viên hub của bạn vận hành. Không áp dụng cho các hub do bên thứ ba vận hành — mỗi quản trị viên hub chịu trách nhiệm về thực tiễn dữ liệu của chính họ.

---

## Những Gì Chúng Tôi Thu Thập

### Dữ liệu tài khoản và danh tính

- **Khóa công khai thiết bị** — mã định danh mật mã duy nhất cho thiết bị của bạn. Không bao giờ được chia sẻ ngoài hub của bạn.
- **Token thông báo đẩy** — chỉ được sử dụng để gửi cảnh báo cuộc gọi đến thiết bị của bạn. Được xoay vòng định kỳ.
- **Vai trò và tư cách thành viên hub** — bạn thuộc hub nào và vai trò được giao của bạn (tình nguyện viên, quản trị viên).
- **Siêu dữ liệu thiết bị** — kiểu thiết bị, phiên bản hệ điều hành và phiên bản ứng dụng.

### Dữ liệu hoạt động

- **Siêu dữ liệu cuộc gọi** — dấu thời gian, thời lượng cuộc gọi, tình nguyện viên nào đã trả lời. Không phải nội dung cuộc gọi.
- **Hồ sơ ca trực** — bạn được phân công ca trực nào và liệu bạn có hoạt động hay không.
- **Mục nhật ký kiểm toán** — các hành động được thực hiện trong ứng dụng. Chỉ quản trị viên mới xem được.
- **Sự kiện bảo mật** — đăng ký thiết bị, thu hồi, hoạt động phiên và thay đổi tài khoản.

### Nội dung bạn tạo — được mã hóa đầu cuối

- **Ghi chú và bản ghi cuộc gọi** — ghi chú viết tay và bản ghi do trình duyệt tạo ra.
- **Báo cáo và hồ sơ vụ việc** — báo cáo có cấu trúc, trường tùy chỉnh, tệp đính kèm và lịch sử vụ việc.
- **Hồ sơ liên hệ** — thông tin liên hệ của người gọi, nếu được ghi lại.
- **Tin nhắn** — tin nhắn văn bản đến được định tuyến đến hub của bạn.

**Máy chủ chỉ lưu trữ nội dung này dưới dạng văn bản mã hóa.** Không thể đọc được bởi nhà khai thác máy chủ, nhà cung cấp dịch vụ lưu trữ hoặc Llámenos.

### Dữ liệu phát sóng/người đăng ký

Số điện thoại người đăng ký được lưu trữ dưới dạng mã định danh băm — không phải số điện thoại dạng văn bản thuần túy. Khi gửi tin nhắn hàng loạt, máy chủ xử lý nội dung tạm thời dưới dạng văn bản thuần túy để gửi. Nội dung không được lưu trữ sau khi gửi.

### Dữ liệu nhóm khôi phục

Nếu bạn cấu hình nhóm khôi phục, máy chủ lưu trữ các mảnh phần được mã hóa (mỗi mảnh được mã hóa cho thiết bị của một người giữ phần cụ thể — máy chủ không thể đọc chúng). Máy chủ không thể tái tạo khóa khôi phục của bạn.

---

## Cách Chúng Tôi Sử Dụng Dữ Liệu

- **Để vận hành ứng dụng** — định tuyến cuộc gọi, cho phép ghi chú, quản lý ca trực và báo cáo.
- **Để bảo mật** — phát hiện lạm dụng, duy trì danh sách chặn, giới hạn tốc độ.
- **Để kiểm toán** — cung cấp cho quản trị viên nhật ký kiểm toán về hoạt động ứng dụng (không có nội dung).
- **Để khôi phục** — lưu trữ các mảnh được mã hóa để nhóm khôi phục có thể giúp người dùng lấy lại quyền truy cập.

Chúng tôi không sử dụng dữ liệu của bạn cho quảng cáo. Chúng tôi không bán hoặc chia sẻ dữ liệu của bạn với bên thứ ba cho mục đích thương mại.

---

## Mã Hóa Đầu Cuối

Tất cả nội dung ghi chú, bản ghi, báo cáo, hồ sơ liên hệ và tin nhắn đến đều được mã hóa đầu cuối.

| Loại dữ liệu | Máy chủ có thể đọc? | Có thể thu thập theo lệnh tòa? |
|-------------|--------------------|-----------------------------|
| Ghi chú cuộc gọi | Không | Chỉ văn bản mã hóa |
| Bản ghi | Không | Chỉ văn bản mã hóa |
| Báo cáo | Không | Chỉ văn bản mã hóa |
| Hồ sơ vụ việc | Không | Chỉ văn bản mã hóa |
| Tin nhắn đến | Không | Chỉ văn bản mã hóa |
| Mảnh khôi phục | Không | Chỉ văn bản mã hóa |
| Tin nhắn hàng loạt gửi đi | **Có, tạm thời trong khi gửi** | Có (văn bản thuần túy khi gửi) |
| Siêu dữ liệu cuộc gọi | Có | Có |
| Khóa công khai thiết bị của bạn | Có | Có |
| Sự kiện bảo mật | Có | Có |

---

## Lưu Trữ Dữ Liệu

### Nội dung bạn tạo

Được lưu giữ cho đến khi bạn hoặc quản trị viên xóa rõ ràng, hoặc hub của bạn bị đóng.

### Tin nhắn hàng loạt

Nội dung không được lưu trữ sau khi gửi. Chỉ lưu giữ hồ sơ trạng thái gửi.

### Siêu dữ liệu cuộc gọi và nhật ký kiểm toán

Được lưu giữ theo cấu hình của quản trị viên hub.

### Mảnh khôi phục

Được lưu giữ cho đến khi bạn xóa cấu hình nhóm khôi phục hoặc tài khoản của bạn bị xóa.

### Token đẩy

Bị xóa khi bạn đăng xuất hoặc gỡ cài đặt ứng dụng.

---

## Xóa Tài Khoản

Bạn có quyền yêu cầu xóa vĩnh viễn tài khoản của mình.

### Xóa làm gì

1. **Khóa bị hủy trước**: Khóa mã hóa thiết bị của bạn bị hủy ngay lập tức, khiến mọi nội dung bạn tạo ra vĩnh viễn không đọc được.
2. **Hồ sơ tài khoản bị xóa**: Hồ sơ tài khoản, đăng ký thiết bị, token đẩy và phân công vai trò của bạn bị xóa.
3. **Mục kiểm toán bị phá hủy mật mã**: Khóa mã hóa cho các mục nhật ký kiểm toán của bạn bị hủy.
4. **Nội dung mã hóa được đóng gói lại**: Ghi chú và báo cáo bạn đã viết được mã hóa lại cho những người đọc được ủy quyền còn lại.

### Tự xóa

Có sẵn trong cài đặt tài khoản trên tất cả các nền tảng. Có độ trễ mặc định (do quản trị viên hub cấu hình, tối thiểu 24 giờ, tối đa 7 ngày). Bạn có thể hủy trong thời gian này.

### Xóa khẩn cấp

Người đồng phê duyệt có thể phê duyệt xóa khẩn cấp, giảm độ trễ xuống tối thiểu 4 giờ.

---

## Dịch Vụ Bên Thứ Ba

Llámenos tích hợp với các nhà cung cấp điện thoại để định tuyến cuộc gọi.

**Nhà cung cấp điện thoại nhận được gì**: Số điện thoại của người gọi, thời lượng và dấu thời gian. Họ không nhận ghi chú, bản ghi hoặc bất kỳ nội dung nào bạn tạo trong ứng dụng.

**Nhà cung cấp tin nhắn nhận được gì cho tin nhắn hàng loạt**: Nội dung tin nhắn (SMS, WhatsApp, RCS) — nhà cung cấp phải nhận văn bản thuần túy để gửi. Đối với phát sóng Signal, nội dung được gửi mã hóa đầu cuối.

---

## Quyền Của Bạn Theo GDPR

Llámenos được phát triển bởi một tổ chức có trụ sở tại EU. Nếu bạn ở Khu vực Kinh tế Châu Âu:

- **Quyền truy cập** — yêu cầu bản sao dữ liệu cá nhân được lưu giữ về bạn
- **Quyền chỉnh sửa** — sửa dữ liệu không chính xác
- **Quyền xóa** — yêu cầu xóa vĩnh viễn tài khoản và tất cả dữ liệu liên quan
- **Quyền di chuyển dữ liệu** — nhận dữ liệu của bạn ở định dạng có thể đọc máy
- **Quyền phản đối** — phản đối việc xử lý dựa trên lợi ích hợp pháp
- **Quyền hạn chế xử lý** — yêu cầu hạn chế xử lý
- **Quyền rút lại sự đồng ý** — rút lại sự đồng ý bất kỳ lúc nào

Để thực hiện các quyền này, liên hệ với quản trị viên hub hoặc gửi email cho chúng tôi tại [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com).

---

## Quyền Riêng Tư Của Trẻ Em

Llámenos không hướng đến trẻ em dưới 13 tuổi (dưới 16 tuổi ở EU).

---

## Thay Đổi Chính Sách Này

Chúng tôi sẽ đăng bất kỳ thay đổi nào lên trang này và cập nhật ngày hiệu lực.

---

## Liên Hệ

**Câu hỏi về quyền riêng tư:** [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com)

**Báo cáo lỗi và tiết lộ bảo mật:** [github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues)

Llámenos là mã nguồn mở: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
