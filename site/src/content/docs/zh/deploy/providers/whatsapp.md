---
title: "配置：WhatsApp"
description: 通过 Meta Cloud API 连接 WhatsApp Business，实现加密消息传递。
---

Llamenos 通过 Meta Cloud API（Graph API v21.0）支持 WhatsApp Business 消息功能。WhatsApp 支持富消息，包括文本、图片、文档、音频和交互式消息。

## 前置条件

- 一个 [Meta Business 账户](https://business.facebook.com)
- WhatsApp Business API 电话号码
- 已启用 WhatsApp 产品的 Meta 开发者应用

## 集成模式

Llamenos 支持两种 WhatsApp 集成模式：

### Meta Direct（推荐）

直接连接到 Meta Cloud API。提供完全控制和所有功能。

**所需凭据：**
- **Phone Number ID** —— 您的 WhatsApp Business 电话号码 ID
- **Business Account ID** —— 您的 Meta Business Account ID
- **Access Token** —— 长期有效的 Meta API 访问令牌
- **Verify Token** —— 您为 Webhook 验证选择的自定义字符串
- **App Secret** —— 您的 Meta 应用密钥（用于 Webhook 签名验证）

### Twilio 模式

如果您已使用 Twilio 进行语音通话，可以通过 Twilio 账户路由 WhatsApp。设置更简单，但部分功能可能受限。

**所需凭据：**
- 您现有的 Twilio Account SID、Auth Token 和 Twilio 连接的 WhatsApp 发送方

## 1. 创建 Meta 应用

1. 前往 [developers.facebook.com](https://developers.facebook.com)
2. 创建新应用（类型：Business）
3. 添加 **WhatsApp** 产品
4. 在 WhatsApp > Getting Started 中，记下您的 **Phone Number ID** 和 **Business Account ID**
5. 生成永久访问令牌（Settings > Access Tokens）

## 2. 配置 Webhook

在 Meta 开发者控制台中：

1. 前往 WhatsApp > Configuration > Webhook
2. 将 Callback URL 设置为：
   ```
   https://your-worker.your-domain.com/api/messaging/whatsapp/webhook
   ```
3. 将 Verify Token 设置为与 Llamenos 管理设置中相同的字符串
4. 订阅 `messages` Webhook 字段

Meta 将发送 GET 请求来验证 Webhook。如果验证令牌匹配，您的 Worker 将以 challenge 响应。

## 3. 在管理设置中启用 WhatsApp

导航到**管理设置 > 消息频道**（或使用设置向导），切换启用 **WhatsApp**。

选择 **Meta Direct** 或 **Twilio** 模式并输入所需凭据。

配置可选设置：
- **自动回复消息** —— 发送给首次联系者
- **非工作时间回复** —— 在排班时间外发送

## 4. 测试

向您的 Business 电话号码发送一条 WhatsApp 消息。对话应出现在**对话**选项卡中。

## 24 小时消息窗口

WhatsApp 强制执行 24 小时消息窗口规则：
- 您可以在用户最后一条消息后的 24 小时内回复
- 24 小时后，您必须使用已批准的**模板消息**来重新发起对话
- Llamenos 自动处理此规则——如果窗口已过期，它会发送模板消息来重新开始对话

## 媒体支持

WhatsApp 支持富媒体消息：
- **图片**（JPEG、PNG）
- **文档**（PDF、Word 等）
- **音频**（MP3、OGG）
- **视频**（MP4）
- **位置**分享
- **交互式**按钮和列表消息

媒体附件在对话视图中以内联方式显示。

## 安全说明

- WhatsApp 在用户和 Meta 基础设施之间使用端到端加密
- 从技术上讲，Meta 可以在其服务器上访问消息内容
- 消息从 Webhook 接收后存储在 Llamenos 中
- Webhook 签名使用 HMAC-SHA256 和您的 App Secret 进行验证
- 为获得最大隐私，请考虑使用 Signal 代替 WhatsApp
