---
title: 文档
description: 了解如何部署、配置和使用 Llamenos。
guidesHeading: 指南
guides:
  - title: 快速入门
    description: 前置条件、安装、电话服务配置和首次部署。
    href: /docs/getting-started
  - title: 管理员指南
    description: 管理志愿者、排班、封禁列表、自定义字段和设置。
    href: /docs/admin-guide
  - title: 志愿者指南
    description: 登录、接听来电、撰写备注和使用语音转文字。
    href: /docs/volunteer-guide
  - title: 电话服务提供商
    description: 比较支持的电话服务提供商，为您的热线选择最合适的方案。
    href: /docs/telephony-providers
  - title: "配置：Twilio"
    description: 逐步指导您配置 Twilio 作为电话服务提供商。
    href: /docs/setup-twilio
  - title: "配置：SignalWire"
    description: 逐步指导您配置 SignalWire 作为电话服务提供商。
    href: /docs/setup-signalwire
  - title: "配置：Vonage"
    description: 逐步指导您配置 Vonage 作为电话服务提供商。
    href: /docs/setup-vonage
  - title: "配置：Plivo"
    description: 逐步指导您配置 Plivo 作为电话服务提供商。
    href: /docs/setup-plivo
  - title: "配置：Asterisk（自托管）"
    description: 部署 Asterisk 和 ARI 桥接服务，获得最大的隐私保护和控制权。
    href: /docs/setup-asterisk
  - title: WebRTC 浏览器通话
    description: 启用 WebRTC，让志愿者通过浏览器接听来电。
    href: /docs/webrtc-calling
  - title: 安全模型
    description: 了解哪些内容被加密、哪些没有，以及威胁模型。
    href: /security
---

## 架构概览

Llamenos 是一个单页应用（SPA），由 Cloudflare Workers 和 Durable Objects 提供后端支持。无需管理传统服务器。

| 组件 | 技术 |
|---|---|
| 前端 | Vite + React + TanStack Router |
| 后端 | Cloudflare Workers + Durable Objects |
| 电话服务 | Twilio、SignalWire、Vonage、Plivo 或 Asterisk（通过 TelephonyAdapter 接口） |
| 认证 | Nostr 密钥对（BIP-340 Schnorr）+ WebAuthn |
| 加密 | ECIES（secp256k1 + XChaCha20-Poly1305） |
| 语音转文字 | 客户端 Whisper（WASM） |
| 国际化 | i18next（支持 12+ 种语言） |

## 角色

| 角色 | 可查看 | 可操作 |
|---|---|---|
| **来电者** | 无（GSM 电话） | 拨打热线号码 |
| **志愿者** | 仅限自己的备注 | 在排班期间接听来电、撰写备注 |
| **管理员** | 所有备注、审计日志、通话数据 | 管理志愿者、排班、封禁列表、设置 |
