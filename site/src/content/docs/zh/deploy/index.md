---
title: 快速入门
description: 在一小时内部署您自己的 Llamenos 热线。
---

在一小时内部署您自己的 Llamenos 热线。您需要一个 Cloudflare 账户、一个电话服务提供商账户以及一台安装了 Bun 的计算机。

## 前置条件

- [Bun](https://bun.sh) v1.0 或更高版本（运行时和包管理器）
- 一个 [Cloudflare](https://www.cloudflare.com) 账户（免费套餐适用于开发环境）
- 一个电话服务提供商账户 — [Twilio](https://www.twilio.com) 是最容易上手的选择，但 Llamenos 同时支持 [SignalWire](/docs/deploy/providers/signalwire)、[Vonage](/docs/deploy/providers/vonage)、[Plivo](/docs/deploy/providers/plivo) 和[自托管 Asterisk](/docs/deploy/providers/asterisk)。请参阅[电话服务提供商](/docs/deploy/providers)比较页面以获取选择建议。
- Git

## 1. 克隆并安装

```bash
git clone https://github.com/rhonda-rodododo/llamenos.git
cd llamenos
bun install
```

## 2. 生成管理员密钥对

为管理员账户生成一个 Nostr 密钥对。此操作会生成一个私钥（nsec）和公钥（npub/hex）。

```bash
bun run bootstrap-admin
```

请安全保存 `nsec` — 这是您的管理员登录凭证。下一步需要使用十六进制公钥。

## 3. 配置密钥

在项目根目录创建一个 `.dev.vars` 文件用于本地开发。此示例使用 Twilio — 如果您使用其他提供商，可以跳过 Twilio 相关变量，首次登录后通过管理界面配置您的提供商。

```bash
# .dev.vars
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
ADMIN_PUBKEY=your_hex_public_key_from_step_2
ENVIRONMENT=development
```

对于生产环境，将这些设置为 Wrangler 密钥：

```bash
bunx wrangler secret put ADMIN_PUBKEY
# 如果通过环境变量使用 Twilio 作为默认提供商：
bunx wrangler secret put TWILIO_ACCOUNT_SID
bunx wrangler secret put TWILIO_AUTH_TOKEN
bunx wrangler secret put TWILIO_PHONE_NUMBER
```

> **注意**：您也可以完全通过管理设置界面来配置电话服务提供商，而无需使用环境变量。对于非 Twilio 提供商，这是必需的操作。请参阅[您的提供商设置指南](/docs/deploy/providers)。

## 4. 配置电话服务 Webhook

配置您的电话服务提供商，使其将语音 Webhook 发送到您的 Worker。无论使用哪个提供商，Webhook URL 都是相同的：

- **来电 URL**：`https://your-worker.your-domain.com/telephony/incoming`（POST）
- **状态回调 URL**：`https://your-worker.your-domain.com/telephony/status`（POST）

有关特定提供商的 Webhook 设置说明，请参阅：[Twilio](/docs/deploy/providers/twilio)、[SignalWire](/docs/deploy/providers/signalwire)、[Vonage](/docs/deploy/providers/vonage)、[Plivo](/docs/deploy/providers/plivo) 或 [Asterisk](/docs/deploy/providers/asterisk)。

在本地开发时，您需要一个隧道工具（如 Cloudflare Tunnel 或 ngrok）将本地 Worker 暴露给电话服务提供商。

## 5. 本地运行

启动 Worker 开发服务器（后端 + 前端）：

```bash
# 先构建前端资源
bun run build

# 启动 Worker 开发服务器
bun run dev:worker
```

应用将在 `http://localhost:8787` 上可用。使用第 2 步中的管理员 nsec 登录。

## 6. 部署到 Cloudflare

```bash
bun run deploy
```

此命令会构建前端并将带有 Durable Objects 的 Worker 部署到 Cloudflare。部署后，将电话服务提供商的 Webhook URL 更新为生产环境的 Worker URL。

## 下一步

- [管理员指南](/docs/admin-guide) — 添加志愿者、创建排班、配置设置
- [志愿者指南](/docs/volunteer-guide) — 分享给您的志愿者
- [电话服务提供商](/docs/deploy/providers) — 比较提供商，如需要可从 Twilio 切换
- [安全模型](/security) — 了解加密和威胁模型
