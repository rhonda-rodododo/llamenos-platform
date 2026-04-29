---
title: "配置：Asterisk（自托管）"
description: 逐步指导您部署 Asterisk 和 ARI 桥接服务用于 Llamenos。
---

Asterisk 是一个开源电话平台，您可以在自己的基础设施上托管。这赋予您对数据的最大控制权，并消除了按分钟计费的云端费用。Llamenos 通过 Asterisk REST 接口（ARI）连接到 Asterisk。

这是最复杂的设置选项，建议有技术团队能够管理服务器基础设施的组织使用。

## 前置条件

- 一台具有公网 IP 地址的 Linux 服务器（推荐 Ubuntu 22.04+ 或 Debian 12+）
- 用于 PSTN 连接的 SIP 中继提供商（例如 Telnyx、Flowroute、VoIP.ms）
- 您的 Llamenos 实例已部署并可通过公网 URL 访问
- 具备基本的 Linux 服务器管理经验

## 1. 安装 Asterisk

### 方案 A：包管理器（较简单）

```bash
sudo apt update
sudo apt install asterisk
```

### 方案 B：Docker（推荐，便于管理）

```bash
docker pull asterisk/asterisk:20
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

### 方案 C：从源码编译（用于自定义模块）

```bash
wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz
tar xzf asterisk-20-current.tar.gz
cd asterisk-20.*/
./configure
make
sudo make install
sudo make samples
```

## 2. 配置 SIP 中继

编辑 `/etc/asterisk/pjsip.conf` 以添加您的 SIP 中继提供商。以下是示例配置：

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

## 3. 启用 ARI

ARI（Asterisk REST 接口）是 Llamenos 在 Asterisk 上控制呼叫的方式。

编辑 `/etc/asterisk/ari.conf`：

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

编辑 `/etc/asterisk/http.conf` 以启用 HTTP 服务器：

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

## 4. 配置拨号计划

编辑 `/etc/asterisk/extensions.conf` 以将来电路由到 ARI 应用：

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

## 5. 部署 ARI 桥接服务

ARI 桥接是一个小型服务，负责在 Llamenos Webhook 和 ARI 事件之间进行转换。它与 Asterisk 一起运行，同时连接 ARI WebSocket 和您的 Llamenos Worker。

```bash
# 桥接服务包含在 Llamenos 仓库中
cd llamenos
bun run build:ari-bridge

# 运行
ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
ASTERISK_ARI_USERNAME=llamenos \
ASTERISK_ARI_PASSWORD=your-strong-ari-password \
LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
bun run ari-bridge
```

或使用 Docker：

```bash
docker run -d \
  --name llamenos-ari-bridge \
  -e ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
  -e ASTERISK_ARI_USERNAME=llamenos \
  -e ASTERISK_ARI_PASSWORD=your-strong-ari-password \
  -e LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
  llamenos/ari-bridge
```

## 6. 在 Llamenos 中配置

1. 以管理员身份登录
2. 转到**设置** > **电话服务提供商**
3. 从提供商下拉菜单中选择 **Asterisk（自托管）**
4. 输入：
   - **ARI URL**：`https://your-asterisk-server:8089/ari`
   - **ARI Username**：`llamenos`
   - **ARI Password**：您的 ARI 密码
   - **Bridge Callback URL**：ARI 桥接接收来自 Llamenos 的 Webhook 的 URL（例如 `https://bridge.your-domain.com/webhook`）
   - **Phone Number**：您的 SIP 中继电话号码（E.164 格式）
5. 点击**保存**

## 7. 测试设置

1. 重启 Asterisk：`sudo systemctl restart asterisk`
2. 验证 ARI 正在运行：`curl -u llamenos:password https://your-server:8089/ari/asterisk/info`
3. 用手机拨打您的热线号码
4. 检查 ARI 桥接日志以查看连接和呼叫事件

## 安全注意事项

运行自己的 Asterisk 服务器赋予您完全的控制权，但也意味着要完全负责安全：

### TLS 和 SRTP

始终启用 TLS 用于 SIP 信令和 SRTP 用于媒体加密：

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

在 endpoint 上启用 SRTP：

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### 网络隔离

- 将 Asterisk 置于 DMZ 或隔离的网络段中
- 使用防火墙限制访问：
  - SIP (5060-5061/tcp/udp)：仅允许来自 SIP 中继提供商
  - RTP (10000-20000/udp)：仅允许来自 SIP 中继提供商
  - ARI (8088-8089/tcp)：仅允许来自 ARI 桥接服务器
  - SSH (22/tcp)：仅允许来自管理员 IP
- 使用 fail2ban 防御 SIP 扫描攻击

### 定期更新

保持 Asterisk 更新以修补安全漏洞：

```bash
sudo apt update && sudo apt upgrade asterisk
```

## Asterisk 的 WebRTC

Asterisk 通过内置的 WebSocket 传输和浏览器中的 SIP.js 支持 WebRTC。这需要额外的配置：

1. 在 `http.conf` 中启用 WebSocket 传输
2. 为 WebRTC 客户端创建 PJSIP endpoint
3. 配置 DTLS-SRTP 用于媒体加密
4. 在客户端使用 SIP.js（选择 Asterisk 时 Llamenos 会自动配置）

Asterisk 的 WebRTC 设置比云端提供商更复杂。详情请参阅 [WebRTC 浏览器通话](/docs/deploy/providers/webrtc)指南。

## 故障排除

- **ARI 连接被拒**：验证 `http.conf` 中的 `enabled=yes` 和绑定地址是否正确。
- **没有音频**：检查 RTP 端口（10000-20000/udp）是否在防火墙中开放，以及 NAT 是否正确配置。
- **SIP 注册失败**：验证您的 SIP 中继凭证以及 DNS 是否能解析提供商的 SIP 服务器。
- **桥接无法连接**：检查 ARI 桥接是否能同时到达 Asterisk ARI 端点和您的 Llamenos Worker URL。
- **通话质量问题**：确保服务器有足够的带宽且到 SIP 中继提供商的延迟较低。考虑使用的编解码器（WebRTC 用 opus，PSTN 用 ulaw/alaw）。
