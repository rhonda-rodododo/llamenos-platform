---
title: Tính năng
subtitle: Mọi thứ một nền tảng ứng phó khủng hoảng cần, trong một gói mã nguồn mở. Thoại, SMS, WhatsApp, Signal và báo cáo mã hóa — xây dựng trên Cloudflare Workers không cần quản lý máy chủ.
---

## Dịch vụ điện thoại đa nhà cung cấp

**5 nhà cung cấp thoại** — Chọn từ Twilio, SignalWire, Vonage, Plivo hoặc Asterisk tự lưu trữ. Cấu hình nhà cung cấp trong giao diện quản trị hoặc trình hướng dẫn. Chuyển đổi nhà cung cấp bất kỳ lúc nào mà không cần thay đổi mã.

**Gọi WebRTC qua trình duyệt** — Tình nguyện viên có thể nhận cuộc gọi trực tiếp trong trình duyệt mà không cần điện thoại. Tạo token WebRTC theo nhà cung cấp cho Twilio, SignalWire, Vonage và Plivo. Tùy chọn gọi cấu hình theo tình nguyện viên (điện thoại, trình duyệt hoặc cả hai).

## Định tuyến cuộc gọi

**Chuông song song** — Khi người gọi quay số, tất cả tình nguyện viên đang trực và rảnh chuông cùng lúc. Tình nguyện viên đầu tiên nhấc máy nhận cuộc gọi; chuông khác dừng ngay.

**Lên lịch theo ca** — Tạo ca tuần hoàn với ngày và khung giờ cụ thể. Phân công tình nguyện viên vào ca. Hệ thống tự động định tuyến cuộc gọi đến người đang trực.

**Hàng đợi với nhạc chờ** — Nếu tất cả tình nguyện viên đang bận, người gọi vào hàng đợi với nhạc chờ cấu hình được. Thời gian chờ điều chỉnh được (30-300 giây). Khi không ai trả lời, chuyển sang hộp thư thoại.

**Hộp thư thoại dự phòng** — Người gọi có thể để lại tin nhắn thoại (tối đa 5 phút). Tin nhắn thoại được chuyển đổi qua Whisper AI và mã hóa cho quản trị viên xem.

## Ghi chú mã hóa

**Ghi chú mã hóa đầu cuối** — Tình nguyện viên viết ghi chú trong và sau cuộc gọi. Ghi chú được mã hóa phía máy khách bằng ECIES (secp256k1 + XChaCha20-Poly1305) trước khi rời trình duyệt. Máy chủ chỉ lưu bản mã.

**Mã hóa kép** — Mỗi ghi chú được mã hóa hai lần: một cho tình nguyện viên, một cho quản trị viên. Cả hai giải mã độc lập. Không ai khác đọc được.

**Trường tùy chỉnh** — Quản trị viên định nghĩa trường cho ghi chú: text, number, select, checkbox, textarea. Các trường được mã hóa cùng nội dung ghi chú.

**Tự động lưu nháp** — Ghi chú tự động lưu dưới dạng nháp mã hóa trong trình duyệt. Nháp được xóa khi đăng xuất.

## Chuyển đổi giọng nói AI

**Chuyển đổi bằng Whisper** — Bản ghi cuộc gọi được chuyển đổi bằng Cloudflare Workers AI với mô hình Whisper. Sau đó bản chuyển đổi được mã hóa trước khi lưu.

**Điều khiển bật/tắt** — Quản trị viên bật/tắt toàn cục. Tình nguyện viên từ chối riêng lẻ. Hai điều khiển độc lập.

**Bản chuyển đổi mã hóa** — Sử dụng cùng mã hóa ECIES như ghi chú. Chỉ lưu bản mã.

## Chống spam

**CAPTCHA thoại** — Phát hiện bot tùy chọn: người gọi nghe số 4 chữ số ngẫu nhiên và nhập trên bàn phím.

**Giới hạn tần suất** — Giới hạn cửa sổ trượt theo số điện thoại, lưu trong Durable Object storage.

**Danh sách chặn thời gian thực** — Quản lý danh sách chặn với nhập đơn lẻ hoặc hàng loạt. Có hiệu lực ngay lập tức.

**Lời nhắc IVR tùy chỉnh** — Ghi lời nhắc thoại cho mỗi ngôn ngữ được hỗ trợ.

## Tin nhắn đa kênh

**SMS** — SMS đến và đi qua Twilio, SignalWire, Vonage hoặc Plivo. Tự động trả lời với tin nhắn chào mừng cấu hình được.

**WhatsApp Business** — Kết nối qua Meta Cloud API (Graph API v21.0). Hỗ trợ tin nhắn mẫu và đa phương tiện.

**Signal** — Tin nhắn bảo mật qua cầu nối signal-cli-rest-api tự lưu trữ. Giám sát sức khỏe với suy giảm uyển chuyển.

**Hội thoại theo luồng** — Tất cả kênh hợp nhất trong một giao diện hội thoại. Cập nhật thời gian thực qua WebSocket.

## Báo cáo mã hóa

**Vai trò người báo cáo** — Vai trò chuyên dụng cho người gửi thông tin. Giao diện đơn giản chỉ có báo cáo và trợ giúp.

**Gửi mã hóa** — Nội dung báo cáo mã hóa ECIES trước khi rời trình duyệt. Tiêu đề bản rõ để phân loại, nội dung mã hóa bảo vệ quyền riêng tư.

**Quy trình báo cáo** — Danh mục, theo dõi trạng thái (mở, đã nhận, đã giải quyết). Quản trị viên nhận và trả lời bằng tin nhắn mã hóa theo luồng.

## Bảng điều khiển quản trị

**Trình hướng dẫn thiết lập** — Thiết lập nhiều bước có hướng dẫn khi quản trị viên đăng nhập lần đầu.

**Danh sách kiểm tra bắt đầu** — Widget theo dõi tiến độ thiết lập.

**Giám sát thời gian thực** — Xem cuộc gọi hoạt động, người gọi đang chờ, hội thoại và trạng thái tình nguyện viên theo thời gian thực.

**Quản lý tình nguyện viên** — Thêm tình nguyện viên với cặp khóa, quản lý vai trò, xem trạng thái trực tuyến. Liên kết mời tự đăng ký.

**Nhật ký kiểm toán** — Ghi lại mọi hành động. Trình xem phân trang cho quản trị viên.

**Lịch sử cuộc gọi** — Tìm kiếm, lọc với khoảng ngày, số điện thoại. Xuất dữ liệu tuân thủ GDPR.

**Trợ giúp trong ứng dụng** — FAQ, hướng dẫn theo vai trò, thẻ tham chiếu nhanh.

## Trải nghiệm tình nguyện viên

**Bảng lệnh** — Nhấn Ctrl+K (hoặc Cmd+K trên Mac) để truy cập nhanh.

**Thông báo thời gian thực** — Cuộc gọi đến kích hoạt chuông trình duyệt, thông báo đẩy và tiêu đề tab nhấp nháy.

**Trạng thái hiện diện** — Quản trị viên xem số lượng trực tuyến, ngoại tuyến và đang nghỉ theo thời gian thực.

**Phím tắt** — Nhấn ? để xem tất cả phím tắt khả dụng.

**Xuất dữ liệu mã hóa** — Xuất ghi chú dưới dạng file mã hóa (.enc) tuân thủ GDPR.

**Chủ đề sáng/tối** — Chuyển đổi giữa chế độ tối, sáng hoặc theo hệ thống.

## Đa ngôn ngữ và di động

**12+ ngôn ngữ** — Bản dịch giao diện đầy đủ: Tiếng Anh, Tây Ban Nha, Trung Quốc, Tagalog, Tiếng Việt, Ả Rập, Pháp, Creole Haiti, Hàn, Nga, Hindi, Bồ Đào Nha và Đức. Hỗ trợ RTL cho Ả Rập.

**Progressive Web App** — Cài đặt trên mọi thiết bị qua trình duyệt. Service Worker cache ứng dụng cho khởi động ngoại tuyến.

**Thiết kế ưu tiên di động** — Bố cục responsive cho điện thoại và máy tính bảng.

## Xác thực và quản lý khóa

**Kho khóa cục bộ bảo vệ PIN** — Khóa bí mật mã hóa bằng PIN 6 chữ số qua PBKDF2 (600,000 lần lặp) + XChaCha20-Poly1305. Khóa thô không bao giờ chạm sessionStorage.

**Tự động khóa** — Khóa sau timeout rảnh hoặc khi tab bị ẩn. Nhập lại PIN để mở.

**Liên kết thiết bị** — Thiết lập thiết bị mới mà không lộ khóa bí mật. Quét QR hoặc nhập mã cung cấp. Sử dụng trao đổi khóa ECDH tạm thời.

**Khóa khôi phục** — Nhận khóa khôi phục Base32 (128-bit entropy) khi đăng ký. Bắt buộc tải bản sao lưu mã hóa.

**Bảo mật chuyển tiếp mỗi ghi chú** — Mỗi ghi chú mã hóa bằng khóa ngẫu nhiên duy nhất, bọc qua ECIES cho mỗi người đọc.

**Xác thực cặp khóa Nostr** — Xác thực bằng cặp khóa Nostr (nsec/npub). Không mật khẩu, không email.

**WebAuthn passkeys** — Hỗ trợ passkey tùy chọn cho đăng nhập đa thiết bị.

**Quản lý phiên** — Mô hình hai cấp: "đã xác thực nhưng khóa" so với "đã xác thực và mở khóa". Token phiên 8 giờ.
