---
title: "配置：Twilio"
description: 逐步指导您配置 Twilio 作为电话服务提供商。
---

Twilio 是 Llamenos 的默认电话服务提供商，也是最容易上手的选择。本指南将引导您完成账户创建、电话号码设置和 Webhook 配置。

## 前置条件

- 一个 [Twilio 账户](https://www.twilio.com/try-twilio)（免费试用可用于测试）
- 您的 Llamenos 实例已部署并可通过公网 URL 访问

## 1. 创建 Twilio 账户

在 [twilio.com/try-twilio](https://www.twilio.com/try-twilio) 注册。验证您的电子邮件和电话号码。Twilio 提供试用额度用于测试。

## 2. 购买电话号码

1. 在 Twilio Console 中，转到 **Phone Numbers** > **Manage** > **Buy a number**
2. 搜索具有 **Voice** 功能的号码，选择您需要的区号
3. 点击 **Buy** 并确认

保存此号码 -- 您将在 Llamenos 管理设置中输入它。

## 3. 获取 Account SID 和 Auth Token

1. 转到 [Twilio Console 仪表板](https://console.twilio.com)
2. 在主页面找到您的 **Account SID** 和 **Auth Token**
3. 点击眼睛图标以显示 Auth Token

## 4. 配置 Webhook

在 Twilio Console 中，导航到您的电话号码配置：

1. 转到 **Phone Numbers** > **Manage** > **Active Numbers**
2. 点击您的热线号码
3. 在 **Voice Configuration** 下，设置：
   - **A call comes in**：Webhook，`https://your-worker-url.com/telephony/incoming`，HTTP POST
   - **Call status changes**：`https://your-worker-url.com/telephony/status`，HTTP POST

将 `your-worker-url.com` 替换为您实际的 Cloudflare Worker URL。

## 5. 在 Llamenos 中配置

1. 以管理员身份登录
2. 转到 **设置** > **电话服务提供商**
3. 从提供商下拉菜单中选择 **Twilio**
4. 输入：
   - **Account SID**：来自第 3 步
   - **Auth Token**：来自第 3 步
   - **Phone Number**：您购买的号码（E.164 格式，例如 `+15551234567`）
5. 点击**保存**

## 6. 测试设置

用手机拨打您的热线号码。您应该会听到语言选择菜单。如果有志愿者在班，来电将被转接。

## WebRTC 设置（可选）

要让志愿者能在浏览器中接听来电而不是使用手机：

### 创建 API Key

1. 在 Twilio Console 中，转到 **Account** > **API keys & tokens**
2. 点击 **Create API Key**
3. 选择 **Standard** 密钥类型
4. 保存 **SID** 和 **Secret** -- Secret 仅显示一次

### 创建 TwiML App

1. 转到 **Voice** > **Manage** > **TwiML Apps**
2. 点击 **Create new TwiML App**
3. 将 **Voice Request URL** 设置为 `https://your-worker-url.com/telephony/webrtc-incoming`
4. 保存并记录 **App SID**

### 在 Llamenos 中启用

1. 转到**设置** > **电话服务提供商**
2. 开启 **WebRTC 通话**
3. 输入：
   - **API Key SID**：来自您创建的 API Key
   - **API Key Secret**：来自您创建的 API Key
   - **TwiML App SID**：来自您创建的 TwiML App
4. 点击**保存**

请参阅 [WebRTC 浏览器通话](/docs/deploy/providers/webrtc)了解志愿者设置和故障排除。

## 故障排除

- **来电未到达**：验证 Webhook URL 是否正确以及 Worker 是否已部署。检查 Twilio Console 的错误日志。
- **"Invalid webhook"错误**：确保 Webhook URL 使用 HTTPS 并返回有效的 TwiML。
- **试用账户限制**：试用账户只能拨打已验证的号码。升级到付费账户以用于生产环境。
- **Webhook 验证失败**：确保 Llamenos 中的 Auth Token 与 Twilio Console 中的一致。
