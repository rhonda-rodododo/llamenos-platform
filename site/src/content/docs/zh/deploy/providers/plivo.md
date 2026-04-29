---
title: "配置：Plivo"
description: 逐步指导您配置 Plivo 作为电话服务提供商。
---

Plivo 是一个经济实惠的云端电话服务提供商，拥有简洁的 API。它使用基于 XML 的呼叫控制，类似于 TwiML，使与 Llamenos 的集成非常顺畅。

## 前置条件

- 一个 [Plivo 账户](https://console.plivo.com/accounts/register/)（提供试用额度）
- 您的 Llamenos 实例已部署并可通过公网 URL 访问

## 1. 创建 Plivo 账户

在 [console.plivo.com](https://console.plivo.com/accounts/register/) 注册。验证后，您可以在仪表板主页找到您的 **Auth ID** 和 **Auth Token**。

## 2. 购买电话号码

1. 在 Plivo Console 中，转到 **Phone Numbers** > **Buy Numbers**
2. 选择您的国家并搜索具有语音功能的号码
3. 购买号码

## 3. 创建 XML 应用

Plivo 使用"XML Applications"来路由呼叫：

1. 转到 **Voice** > **XML Applications**
2. 点击 **Add New Application**
3. 配置：
   - **Application Name**：Llamenos Hotline
   - **Answer URL**：`https://your-worker-url.com/telephony/incoming`（POST）
   - **Hangup URL**：`https://your-worker-url.com/telephony/status`（POST）
4. 保存应用

## 4. 关联电话号码

1. 转到 **Phone Numbers** > **Your Numbers**
2. 点击您的热线号码
3. 在 **Voice** 下，选择您在第 3 步创建的 XML Application
4. 保存

## 5. 在 Llamenos 中配置

1. 以管理员身份登录
2. 转到**设置** > **电话服务提供商**
3. 从提供商下拉菜单中选择 **Plivo**
4. 输入：
   - **Auth ID**：来自 Plivo Console 仪表板
   - **Auth Token**：来自 Plivo Console 仪表板
   - **Phone Number**：您购买的号码（E.164 格式）
5. 点击**保存**

## 6. 测试设置

拨打您的热线号码。您应该会听到语言选择菜单，然后进入正常的通话流程。

## WebRTC 设置（可选）

Plivo WebRTC 使用 Browser SDK 和您现有的凭证：

1. 在 Plivo Console 中，转到 **Voice** > **Endpoints**
2. 创建新的 endpoint（作为浏览器电话身份）
3. 在 Llamenos 中，转到**设置** > **电话服务提供商**
4. 开启 **WebRTC 通话**
5. 点击**保存**

适配器使用您的 Auth ID 和 Auth Token 生成有时间限制的 HMAC Token，用于安全的浏览器身份验证。

## Plivo 特定说明

- **XML 与 TwiML**：Plivo 使用自己的 XML 格式进行呼叫控制，与 TwiML 类似但不完全相同。Llamenos 适配器会自动生成正确的 Plivo XML。
- **Answer URL 与 Hangup URL**：Plivo 将初始呼叫处理程序（Answer URL）和呼叫结束处理程序（Hangup URL）分开，不同于 Twilio 使用单一的状态回调。
- **速率限制**：Plivo 根据账户等级有不同的 API 速率限制。对于高流量的热线，请联系 Plivo 支持以增加限制。

## 故障排除

- **"Auth ID invalid"**：Auth ID 不是您的电子邮件地址。在 Plivo Console 仪表板主页上查找。
- **呼叫未路由**：验证电话号码已关联到正确的 XML Application。
- **Answer URL 错误**：Plivo 期望有效的 XML 响应。检查您的 Worker 日志以查看响应错误。
- **外呼限制**：试用账户对外呼有限制。升级以用于生产环境。
