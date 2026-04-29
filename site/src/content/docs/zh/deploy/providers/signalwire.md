---
title: "配置：SignalWire"
description: 逐步指导您配置 SignalWire 作为电话服务提供商。
---

SignalWire 是 Twilio 的一个经济实惠的替代方案，具有兼容的 API。它使用 LaML（一种与 TwiML 兼容的标记语言），因此在 Twilio 和 SignalWire 之间迁移非常简单。

## 前置条件

- 一个 [SignalWire 账户](https://signalwire.com/signup)（提供免费试用）
- 您的 Llamenos 实例已部署并可通过公网 URL 访问

## 1. 创建 SignalWire 账户

在 [signalwire.com/signup](https://signalwire.com/signup) 注册。注册时，您需要选择一个 **Space 名称**（例如 `myhotline`）。您的 Space URL 将是 `myhotline.signalwire.com`。记下此名称 -- 配置时将需要它。

## 2. 购买电话号码

1. 在 SignalWire 仪表板中，转到 **Phone Numbers**
2. 点击 **Buy a Phone Number**
3. 搜索具有语音功能的号码
4. 购买号码

## 3. 获取凭证

1. 在 SignalWire 仪表板中转到 **API**
2. 找到您的 **Project ID**（此项相当于 Account SID）
3. 如果还没有，创建一个新的 **API Token** -- 此项相当于 Auth Token

## 4. 配置 Webhook

1. 在仪表板中转到 **Phone Numbers**
2. 点击您的热线号码
3. 在 **Voice Settings** 下，设置：
   - **Handle calls using**：LaML Webhooks
   - **When a call comes in**：`https://your-worker-url.com/telephony/incoming`（POST）
   - **Call status callback**：`https://your-worker-url.com/telephony/status`（POST）

## 5. 在 Llamenos 中配置

1. 以管理员身份登录
2. 转到**设置** > **电话服务提供商**
3. 从提供商下拉菜单中选择 **SignalWire**
4. 输入：
   - **Account SID**：来自第 3 步的 Project ID
   - **Auth Token**：来自第 3 步的 API Token
   - **SignalWire Space**：您的 Space 名称（仅名称，不是完整 URL -- 例如 `myhotline`）
   - **Phone Number**：您购买的号码（E.164 格式）
5. 点击**保存**

## 6. 测试设置

拨打您的热线号码。您应该会听到语言选择菜单，随后是通话流程。

## WebRTC 设置（可选）

SignalWire WebRTC 使用与 Twilio 相同的 API Key 模式：

1. 在 SignalWire 仪表板中，在 **API** > **Tokens** 下创建一个 **API Key**
2. 创建一个 **LaML Application**：
   - 转到 **LaML** > **LaML Applications**
   - 将 Voice URL 设置为 `https://your-worker-url.com/telephony/webrtc-incoming`
   - 记录 Application SID
3. 在 Llamenos 中，转到**设置** > **电话服务提供商**
4. 开启 **WebRTC 通话**
5. 输入 API Key SID、API Key Secret 和 Application SID
6. 点击**保存**

## 与 Twilio 的差异

- **LaML 与 TwiML**：SignalWire 使用 LaML，功能上与 TwiML 相同。Llamenos 会自动处理此差异。
- **Space URL**：API 调用发送到 `{space}.signalwire.com` 而不是 `api.twilio.com`。适配器通过您提供的 Space 名称自动处理。
- **价格**：SignalWire 的语音通话费用通常比 Twilio 低 30-40%。
- **功能对等**：所有 Llamenos 功能（录音、语音转文字、验证码、语音信箱）在 SignalWire 上的工作方式完全相同。

## 故障排除

- **"Space not found"错误**：仔细检查 Space 名称（仅子域名，不是完整 URL）。
- **Webhook 故障**：确保您的 Worker URL 可公开访问并使用 HTTPS。
- **API Token 问题**：SignalWire 的 Token 可能会过期。如果遇到认证错误，请创建新的 Token。
