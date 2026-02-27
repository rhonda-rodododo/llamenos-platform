---
title: "配置：SMS"
description: 通过您的电话服务提供商启用入站和出站 SMS 消息。
---

Llamenos 中的 SMS 消息功能复用您现有的语音电话服务提供商凭据。无需单独的 SMS 服务——如果您已经为语音配置了 Twilio、SignalWire、Vonage 或 Plivo，SMS 使用相同的账户即可工作。

## 支持的提供商

| 提供商 | SMS 支持 | 备注 |
|--------|----------|------|
| **Twilio** | 是 | 通过 Twilio Messaging API 的完整双向 SMS |
| **SignalWire** | 是 | 兼容 Twilio API——相同的接口 |
| **Vonage** | 是 | 通过 Vonage REST API 的 SMS |
| **Plivo** | 是 | 通过 Plivo Message API 的 SMS |
| **Asterisk** | 否 | Asterisk 不支持原生 SMS |

## 1. 在管理设置中启用 SMS

导航到**管理设置 > 消息频道**（或在首次登录时使用设置向导），切换启用 **SMS**。

配置 SMS 设置：
- **自动回复消息** —— 可选的欢迎消息，发送给首次联系者
- **非工作时间回复** —— 可选的在排班时间外发送的消息

## 2. 配置 Webhook

将您的电话服务提供商的 SMS Webhook 指向您的 Worker：

```
POST https://your-worker.your-domain.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. 前往 Twilio Console > Phone Numbers > Active Numbers
2. 选择您的电话号码
3. 在 **Messaging** 下，将"A message comes in"的 Webhook URL 设置为上述 URL
4. 将 HTTP 方法设置为 **POST**

### Vonage

1. 前往 Vonage API Dashboard > Applications
2. 选择您的应用程序
3. 在 **Messages** 下，将 Inbound URL 设置为上述 Webhook URL

### Plivo

1. 前往 Plivo Console > Messaging > Applications
2. 创建或编辑消息应用程序
3. 将 Message URL 设置为上述 Webhook URL
4. 将应用程序分配给您的电话号码

## 3. 测试

向您的热线电话号码发送一条 SMS。您应该可以在管理面板的**对话**选项卡中看到对话出现。

## 工作原理

1. SMS 到达您的提供商，提供商向您的 Worker 发送 Webhook
2. Worker 验证 Webhook 签名（提供商特定的 HMAC）
3. 消息被解析并存储到 ConversationDO
4. 在班志愿者通过 Nostr relay 事件收到通知
5. 志愿者从对话选项卡回复——回复通过您的提供商的 SMS API 发送

## 安全说明

- SMS 消息以明文方式通过运营商网络传输——您的提供商和运营商可以读取它们
- 入站消息在到达后存储在 ConversationDO 中
- 发送方电话号码在存储前进行哈希处理（保护隐私）
- Webhook 签名按提供商进行验证（Twilio 使用 HMAC-SHA1 等）
