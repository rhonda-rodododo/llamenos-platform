---
title: "Thiết lập: Asterisk (Tự lưu trữ)"
description: Hướng dẫn từng bước để triển khai Asterisk với cầu nối ARI cho Llamenos.
---

Asterisk là nền tảng điện thoại mã nguồn mở mà bạn tự lưu trữ trên hạ tầng riêng. Điều này cho phép bạn kiểm soát tối đa dữ liệu và loại bỏ phí đám mây tính theo phút. Llamenos kết nối với Asterisk thông qua Asterisk REST Interface (ARI).

Đây là tùy chọn thiết lập phức tạp nhất và được khuyến nghị cho các tổ chức có đội ngũ kỹ thuật có thể quản lý hạ tầng máy chủ.

## Yêu cầu tiên quyết

- Một máy chủ Linux (khuyến nghị Ubuntu 22.04+ hoặc Debian 12+) với địa chỉ IP công khai
- Nhà cung cấp SIP trunk cho kết nối PSTN (ví dụ: Telnyx, Flowroute, VoIP.ms)
- Phiên bản Llamenos của bạn đã được triển khai và có thể truy cập qua URL công khai
- Kiến thức cơ bản về quản trị máy chủ Linux

## 1. Cài đặt Asterisk

### Phương án A: Trình quản lý gói (đơn giản hơn)

```bash
sudo apt update
sudo apt install asterisk
```

### Phương án B: Docker (khuyến nghị để quản lý dễ dàng hơn)

```bash
docker pull asterisk/asterisk:20
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

### Phương án C: Biên dịch từ mã nguồn (cho module tùy chỉnh)

```bash
wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz
tar xzf asterisk-20-current.tar.gz
cd asterisk-20.*/
./configure
make
sudo make install
sudo make samples
```

## 2. Cấu hình SIP trunk

Chỉnh sửa `/etc/asterisk/pjsip.conf` để thêm nhà cung cấp SIP trunk của bạn. Đây là cấu hình ví dụ:

```ini
; SIP trunk to your PSTN provider
[trunk-provider]
type=registration
transport=transport-tls
outbound_auth=trunk-auth
server_uri=sip:sip.your-provider.com
client_uri=sip:your-account@sip.your-provider.com

[trunk-auth]
type=auth
auth_type=userpass
username=your-account
password=your-password

[trunk-endpoint]
type=endpoint
context=from-trunk
transport=transport-tls
disallow=all
allow=ulaw
allow=alaw
allow=opus
aors=trunk-aor
outbound_auth=trunk-auth

[trunk-aor]
type=aor
contact=sip:sip.your-provider.com
```

## 3. Kích hoạt ARI

ARI (Asterisk REST Interface) là cách Llamenos điều khiển cuộc gọi trên Asterisk.

Chỉnh sửa `/etc/asterisk/ari.conf`:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

Chỉnh sửa `/etc/asterisk/http.conf` để kích hoạt máy chủ HTTP:

```ini
[general]
enabled=yes
bindaddr=0.0.0.0
bindport=8088
tlsenable=yes
tlsbindaddr=0.0.0.0:8089
tlscertfile=/etc/asterisk/keys/asterisk.pem
tlsprivatekey=/etc/asterisk/keys/asterisk.key
```

## 4. Cấu hình dialplan

Chỉnh sửa `/etc/asterisk/extensions.conf` để định tuyến cuộc gọi đến đến ứng dụng ARI:

```ini
[from-trunk]
exten => _X.,1,NoOp(Incoming call from ${CALLERID(num)})
 same => n,Stasis(llamenos,incoming)
 same => n,Hangup()

[llamenos-outbound]
exten => _X.,1,NoOp(Outbound call to ${EXTEN})
 same => n,Stasis(llamenos,outbound)
 same => n,Hangup()
```

## 5. Triển khai dịch vụ cầu nối ARI

Cầu nối ARI là một dịch vụ nhỏ chuyển đổi giữa webhook Llamenos và sự kiện ARI. Nó chạy cùng Asterisk và kết nối đến cả ARI WebSocket và Llamenos Worker của bạn.

```bash
# Dịch vụ cầu nối được bao gồm trong kho Llamenos
cd llamenos
bun run build:ari-bridge

# Chạy
ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
ASTERISK_ARI_USERNAME=llamenos \
ASTERISK_ARI_PASSWORD=your-strong-ari-password \
LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
bun run ari-bridge
```

Hoặc với Docker:

```bash
docker run -d \
  --name llamenos-ari-bridge \
  -e ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
  -e ASTERISK_ARI_USERNAME=llamenos \
  -e ASTERISK_ARI_PASSWORD=your-strong-ari-password \
  -e LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
  llamenos/ari-bridge
```

## 6. Cấu hình trong Llamenos

1. Đăng nhập với quyền quản trị viên
2. Vào **Cài đặt** > **Nhà cung cấp dịch vụ điện thoại**
3. Chọn **Asterisk (Tự lưu trữ)** từ danh sách thả xuống nhà cung cấp
4. Nhập:
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: mật khẩu ARI của bạn
   - **Bridge Callback URL**: URL nơi cầu nối ARI nhận webhook từ Llamenos (ví dụ: `https://bridge.your-domain.com/webhook`)
   - **Phone Number**: số điện thoại SIP trunk của bạn (định dạng E.164)
5. Nhấn **Lưu**

## 7. Kiểm tra thiết lập

1. Khởi động lại Asterisk: `sudo systemctl restart asterisk`
2. Xác minh ARI đang chạy: `curl -u llamenos:password https://your-server:8089/ari/asterisk/info`
3. Gọi đến số đường dây nóng từ điện thoại
4. Kiểm tra nhật ký cầu nối ARI để xem sự kiện kết nối và cuộc gọi

## Cân nhắc bảo mật

Vận hành máy chủ Asterisk riêng cho bạn toàn quyền kiểm soát, nhưng cũng chịu toàn bộ trách nhiệm về bảo mật:

### TLS và SRTP

Luôn bật TLS cho tín hiệu SIP và SRTP cho mã hóa phương tiện:

```ini
; In pjsip.conf transport section
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

Bật SRTP trên endpoint:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### Cô lập mạng

- Đặt Asterisk trong DMZ hoặc phân đoạn mạng cô lập
- Sử dụng tường lửa để hạn chế truy cập:
  - SIP (5060-5061/tcp/udp): chỉ từ nhà cung cấp SIP trunk
  - RTP (10000-20000/udp): chỉ từ nhà cung cấp SIP trunk
  - ARI (8088-8089/tcp): chỉ từ máy chủ cầu nối ARI
  - SSH (22/tcp): chỉ từ IP quản trị viên
- Sử dụng fail2ban để chống lại tấn công quét SIP

### Cập nhật thường xuyên

Giữ Asterisk được cập nhật để vá lỗ hổng bảo mật:

```bash
sudo apt update && sudo apt upgrade asterisk
```

## WebRTC với Asterisk

Asterisk hỗ trợ WebRTC thông qua truyền tải WebSocket tích hợp và SIP.js trong trình duyệt. Điều này yêu cầu cấu hình bổ sung:

1. Bật truyền tải WebSocket trong `http.conf`
2. Tạo PJSIP endpoint cho client WebRTC
3. Cấu hình DTLS-SRTP cho mã hóa phương tiện
4. Sử dụng SIP.js ở phía client (Llamenos tự động cấu hình khi chọn Asterisk)

Thiết lập WebRTC với Asterisk phức tạp hơn so với nhà cung cấp đám mây. Xem hướng dẫn [Gọi qua trình duyệt WebRTC](/docs/deploy/providers/webrtc) để biết chi tiết.

## Xử lý sự cố

- **ARI từ chối kết nối**: Xác minh rằng `http.conf` có `enabled=yes` và địa chỉ bind chính xác.
- **Không có âm thanh**: Kiểm tra rằng cổng RTP (10000-20000/udp) đã mở trong tường lửa và NAT được cấu hình đúng.
- **Đăng ký SIP thất bại**: Xác minh thông tin xác thực SIP trunk và DNS phân giải được máy chủ SIP của nhà cung cấp.
- **Cầu nối không kết nối**: Kiểm tra rằng cầu nối ARI có thể truy cập cả endpoint Asterisk ARI và URL Llamenos Worker.
- **Vấn đề chất lượng cuộc gọi**: Đảm bảo máy chủ có đủ băng thông và độ trễ thấp đến nhà cung cấp SIP trunk. Xem xét codec (opus cho WebRTC, ulaw/alaw cho PSTN).
