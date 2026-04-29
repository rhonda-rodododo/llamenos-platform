---
title: WebRTC 浏览器通话
description: 启用 WebRTC，让志愿者通过浏览器接听来电。
---

WebRTC（Web 实时通信）让志愿者可以直接在浏览器中接听热线来电，无需使用手机。这对于不想分享电话号码或在电脑前工作的志愿者非常有用。

## 工作原理

1. 管理员在电话服务提供商设置中启用 WebRTC
2. 志愿者在个人资料中将通话偏好设置为"浏览器"
3. 来电时，Llamenos 应用会通过浏览器通知响铃
4. 志愿者点击"接听"，通话通过浏览器使用麦克风连接

通话音频通过 WebRTC 连接从电话服务提供商路由到志愿者的浏览器。通话质量取决于志愿者的网络连接。

## 前置条件

### 管理员设置

- 支持 WebRTC 的电话服务提供商已启用（Twilio、SignalWire、Vonage 或 Plivo）
- 已配置提供商特定的 WebRTC 凭证（参见各提供商设置指南）
- 在**设置** > **电话服务提供商**中已开启 WebRTC

### 志愿者要求

- 现代浏览器（Chrome、Firefox、Edge 或 Safari 14.1+）
- 正常工作的麦克风
- 稳定的网络连接（最低 100 kbps 上行/下行）
- 已授予浏览器通知权限

## 各提供商特定设置

每个电话服务提供商需要不同的 WebRTC 凭证：

### Twilio / SignalWire

1. 在提供商控制台中创建 **API Key**
2. 创建 **TwiML/LaML Application**，将 Voice URL 设置为 `https://your-worker-url.com/telephony/webrtc-incoming`
3. 在 Llamenos 中，输入 API Key SID、API Key Secret 和 Application SID

### Vonage

1. 您的 Vonage Application 已包含 WebRTC 功能
2. 在 Llamenos 中，粘贴 Application 的 **private key**（PEM 格式）
3. Application ID 已在初始设置中配置

### Plivo

1. 在 Plivo Console 的 **Voice** > **Endpoints** 下创建 **Endpoint**
2. WebRTC 使用您现有的 Auth ID 和 Auth Token
3. 在 Llamenos 中启用 WebRTC -- 无需额外凭证

### Asterisk

Asterisk WebRTC 需要使用 WebSocket 传输的 SIP.js 配置。比云端提供商更复杂：

1. 在 Asterisk 的 `http.conf` 中启用 WebSocket 传输
2. 为 WebRTC 客户端创建带有 DTLS-SRTP 的 PJSIP endpoint
3. 选择 Asterisk 时 Llamenos 会自动配置 SIP.js 客户端

详情请参阅 [Asterisk 设置指南](/docs/deploy/providers/asterisk)。

## 志愿者通话偏好设置

志愿者在应用中配置通话偏好：

1. 登录 Llamenos
2. 转到**设置**（齿轮图标）
3. 在**通话偏好**下，选择**浏览器**而不是**手机**
4. 在提示时授予麦克风和通知权限
5. 在排班期间保持 Llamenos 标签页打开

来电时，您将看到浏览器通知和应用内响铃指示。点击**接听**即可连接。

## 浏览器兼容性

| 浏览器 | 桌面版 | 移动版 | 备注 |
|---|---|---|---|
| Chrome | 是 | 是 | 推荐 |
| Firefox | 是 | 是 | 完全支持 |
| Edge | 是 | 是 | 基于 Chromium，完全支持 |
| Safari | 是 (14.1+) | 是 (14.1+) | 需要用户交互才能启动音频 |
| Brave | 是 | 有限 | 可能需要禁用 shields 以使用麦克风 |

## 音频质量提示

- 使用耳机或耳塞以防止回声
- 关闭其他使用麦克风的应用程序
- 尽可能使用有线网络连接
- 禁用可能干扰 WebRTC 的浏览器扩展程序（VPN 扩展、具有 WebRTC 泄漏保护的广告拦截器）

## 故障排除

### 没有音频

- **检查麦克风权限**：点击地址栏中的锁定图标，确保麦克风访问设置为"允许"
- **测试麦克风**：使用浏览器内置的音频测试或访问 [webcamtest.com](https://webcamtest.com) 等网站
- **检查音频输出**：确保扬声器或耳机已被选为输出设备

### 来电不在浏览器中响铃

- **通知被阻止**：检查是否已为 Llamenos 网站启用浏览器通知
- **标签页未激活**：Llamenos 标签页必须打开（可以在后台，但标签页必须存在）
- **通话偏好**：在设置中确认您的通话偏好已设置为"浏览器"
- **WebRTC 未配置**：请管理员确认 WebRTC 已启用且凭证已设置

### 防火墙和 NAT 问题

WebRTC 使用 STUN/TURN 服务器来穿越防火墙和 NAT。如果通话连接但听不到音频：

- **企业防火墙**：某些防火墙会阻止非标准端口的 UDP 流量。请 IT 团队允许端口 3478 和 10000-60000 的 UDP 流量
- **对称 NAT**：某些路由器使用对称 NAT，可能阻止直接对等连接。电话服务提供商的 TURN 服务器应能自动处理此问题
- **VPN 干扰**：VPN 可能干扰 WebRTC 连接。尝试在排班期间断开 VPN

### 回声或反馈

- 使用耳机代替扬声器
- 在操作系统音频设置中降低麦克风灵敏度
- 在浏览器中启用回声消除（通常默认启用）
- 远离硬质反射表面
