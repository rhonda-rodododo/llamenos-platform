---
title: "配置：Vonage"
description: 逐步指导您配置 Vonage 作为电话服务提供商。
---

Vonage（原 Nexmo）提供强大的国际覆盖和有竞争力的价格。它使用与 Twilio 不同的 API 模型 -- Vonage Applications 将您的号码、Webhook 和凭证组合在一起。

## 前置条件

- 一个 [Vonage 账户](https://dashboard.nexmo.com/sign-up)（提供免费额度）
- 您的 Llamenos 实例已部署并可通过公网 URL 访问

## 1. 创建 Vonage 账户

在 [Vonage API Dashboard](https://dashboard.nexmo.com/sign-up) 注册。验证您的账户，并从仪表板主页记下您的 **API Key** 和 **API Secret**。

## 2. 购买电话号码

1. 在 Vonage Dashboard 中，转到 **Numbers** > **Buy numbers**
2. 选择您的国家，选择具有 **Voice** 功能的号码
3. 购买号码

## 3. 创建 Vonage Application

Vonage 将配置归类到"Applications"中：

1. 转到 **Applications** > **Create a new application**
2. 输入名称（例如"Llamenos Hotline"）
3. 在 **Voice** 下，启用并设置：
   - **Answer URL**：`https://your-worker-url.com/telephony/incoming`（POST）
   - **Event URL**：`https://your-worker-url.com/telephony/status`（POST）
4. 点击 **Generate new application**
5. 保存确认页面上显示的 **Application ID**
6. 下载**私钥**文件 -- 配置时需要其内容

## 4. 关联电话号码

1. 转到 **Numbers** > **Your numbers**
2. 点击热线号码旁边的齿轮图标
3. 在 **Voice** 下，选择您在第 3 步创建的 Application
4. 点击 **Save**

## 5. 在 Llamenos 中配置

1. 以管理员身份登录
2. 转到**设置** > **电话服务提供商**
3. 从提供商下拉菜单中选择 **Vonage**
4. 输入：
   - **API Key**：来自 Vonage Dashboard 主页
   - **API Secret**：来自 Vonage Dashboard 主页
   - **Application ID**：来自第 3 步
   - **Phone Number**：您购买的号码（E.164 格式）
5. 点击**保存**

## 6. 测试设置

拨打您的热线号码。您应该会听到语言选择菜单。验证来电是否路由到在班的志愿者。

## WebRTC 设置（可选）

Vonage WebRTC 使用您已创建的 Application 凭证：

1. 在 Llamenos 中，转到**设置** > **电话服务提供商**
2. 开启 **WebRTC 通话**
3. 输入**私钥**内容（您下载的文件中的完整 PEM 文本）
4. 点击**保存**

Application ID 已在初始设置中配置。Vonage 使用私钥生成 RS256 JWT 用于浏览器身份验证。

## Vonage 特定说明

- **NCCO 与 TwiML**：Vonage 使用 JSON 格式的 NCCO（Nexmo Call Control Objects）而非 XML 标记。Llamenos 适配器会自动生成正确的格式。
- **Answer URL 格式**：Vonage 要求 Answer URL 返回 JSON（NCCO），而非 XML。适配器会处理此问题。
- **Event URL**：Vonage 以 JSON POST 请求的形式将通话事件（振铃、已接听、已结束）发送到 Event URL。
- **私钥安全性**：私钥以加密形式存储。它永远不会离开服务器 -- 仅用于生成短期有效的 JWT Token。

## 故障排除

- **"Application not found"**：验证 Application ID 完全匹配。可在 Vonage Dashboard 的 **Applications** 下找到。
- **没有来电**：确保电话号码已关联到正确的 Application（第 4 步）。
- **私钥错误**：粘贴完整的 PEM 内容，包括 `-----BEGIN PRIVATE KEY-----` 和 `-----END PRIVATE KEY-----` 行。
- **国际号码格式**：Vonage 要求 E.164 格式。包含 `+` 和国家代码。
