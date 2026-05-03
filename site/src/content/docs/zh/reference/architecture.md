---
title: 架构
description: 系统架构概览——仓库结构、数据流、加密层和实时通信。
---

本页面介绍 Llamenos 的结构、数据如何在系统中流动，以及在哪些环节应用了加密。

## 仓库结构

Llamenos 分布在三个仓库中，它们共享一个通用的协议和密码学核心：

```
llamenos              llamenos-core           llamenos-hotline
(Desktop + API)       (Shared Crypto)         (Mobile App)
+--------------+      +--------------+        +--------------+
| Tauri v2     |      | Rust crate   |        | React Native |
| Vite + React |      | - Native lib |        | iOS + Android|
| CF Workers   |      | - WASM pkg   |        | UniFFI bind  |
| Durable Objs |      | - UniFFI     |        |              |
+--------------+      +--------------+        +--------------+
       |                  ^      ^                   |
       |  path dep        |      |    UniFFI         |
       +------------------+      +-------------------+
```

- **llamenos** —— 桌面应用程序（Tauri v2 + Vite + React webview）、Cloudflare Worker 后端和自托管 Node.js 后端。这是主仓库。
- **llamenos-core** —— 共享 Rust crate，实现所有密码学操作：ECIES 信封加密、Schnorr 签名、PBKDF2 密钥派生、HKDF 和 XChaCha20-Poly1305。编译为原生代码（用于 Tauri）、WASM（用于浏览器）和 UniFFI 绑定（用于移动端）。
- **llamenos-hotline** —— iOS 和 Android 的 React Native 移动应用程序。使用 UniFFI 绑定调用相同的 Rust 密码学代码。

三个平台都实现了 `docs/protocol/PROTOCOL.md` 中定义的相同通信协议。

## 数据流

### 来电

```
Caller (phone)
    |
    v
Telephony Provider (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | HTTP webhook
    v
Worker API  -->  CallRouterDO
    |                |
    |                | Checks ShiftManagerDO for on-shift volunteers
    |                | Initiates parallel ring to all available volunteers
    |                v
    |           Telephony Provider (outbound calls to volunteer phones)
    |
    | First volunteer answers
    v
CallRouterDO  -->  Connects caller and volunteer
    |
    | Call ends
    v
Client (volunteer's browser/app)
    |
    | Encrypts note with per-note key
    | Wraps key via ECIES for self + each admin
    v
Worker API  -->  RecordsDO  (stores encrypted note + wrapped keys)
```

### 收到消息（SMS / WhatsApp / Signal）

```
Contact (SMS / WhatsApp / Signal)
    |
    | Provider webhook
    v
Worker API  -->  ConversationDO
    |                |
    |                | Encrypts message content immediately
    |                | Wraps symmetric key via ECIES for assigned volunteer + admins
    |                | Discards plaintext
    |                v
    |           Nostr relay (encrypted hub event notifies online clients)
    |
    v
Client (volunteer's browser/app)
    |
    | Decrypts message with own private key
    | Composes reply, encrypts outbound
    v
Worker API  -->  ConversationDO  -->  Messaging Provider (sends reply)
```

## Durable Objects

后端使用六个 Cloudflare Durable Objects（或自托管部署中对应的 PostgreSQL 等效实现）：

| Durable Object | 职责 |
|---|---|
| **IdentityDO** | 管理志愿者身份、公钥、显示名称和 WebAuthn 凭据。处理邀请的创建和兑换。 |
| **SettingsDO** | 存储热线配置：名称、已启用频道、提供商凭据、自定义备注字段、垃圾信息防范设置、功能标志。 |
| **RecordsDO** | 存储加密的通话备注、加密的报告和文件附件元数据。处理备注搜索（在加密元数据上）。 |
| **ShiftManagerDO** | 管理循环排班计划、响铃组、志愿者排班分配。确定任何给定时间谁在值班。 |
| **CallRouterDO** | 编排实时呼叫路由：并行响铃、首接终止、休息状态、活动通话跟踪。生成 TwiML/提供商响应。 |
| **ConversationDO** | 管理跨 SMS、WhatsApp 和 Signal 的线程式消息对话。处理消息入库时的加密、对话分配和出站回复。 |

所有 DO 通过 `idFromName()` 作为单例访问，并通过轻量级 `DORouter`（方法 + 路径模式匹配）进行内部路由。

## 加密矩阵

| 数据 | 是否加密？ | 算法 | 谁可以解密 |
|------|-----------|------|-----------|
| 通话备注 | 是 (E2EE) | XChaCha20-Poly1305 + ECIES envelope | 备注作者 + 所有管理员 |
| 备注自定义字段 | 是 (E2EE) | 同备注 | 备注作者 + 所有管理员 |
| 报告 | 是 (E2EE) | 同备注 | 报告作者 + 所有管理员 |
| 报告附件 | 是 (E2EE) | XChaCha20-Poly1305（流式） | 报告作者 + 所有管理员 |
| 消息内容 | 是 (E2EE) | XChaCha20-Poly1305 + ECIES envelope | 指定的志愿者 + 所有管理员 |
| 转录文本 | 是（静态加密） | XChaCha20-Poly1305 | 转录创建者 + 所有管理员 |
| Hub 事件 (Nostr) | 是（对称加密） | XChaCha20-Poly1305 with hub key | 所有当前 hub 成员 |
| 志愿者 nsec | 是（静态加密） | PBKDF2 + XChaCha20-Poly1305 (PIN) | 仅志愿者本人 |
| 审计日志条目 | 否（完整性保护） | SHA-256 hash chain | 管理员（读取），系统（写入） |
| 来电者电话号码 | 否（仅服务器端） | N/A | 服务器 + 管理员 |
| 志愿者电话号码 | 存储在 IdentityDO | N/A | 仅管理员 |

### 每条备注的前向保密

每条备注或消息都有一个唯一的随机对称密钥。该密钥通过 ECIES（secp256k1 临时密钥 + HKDF + XChaCha20-Poly1305）为每个授权读者分别封装。泄露一条备注的密钥不会暴露其他备注的任何信息。不存在用于内容加密的长期对称密钥。

### 密钥层次

```
Volunteer nsec (BIP-340 Schnorr / secp256k1)
    |
    +-- Derives npub (x-only public key, 32 bytes)
    |
    +-- Used for ECIES key agreement (prepend 02 for compressed form)
    |
    +-- Signs Nostr events (Schnorr signature)

Hub key (random 32 bytes, NOT derived from any identity)
    |
    +-- Encrypts real-time Nostr hub events
    |
    +-- ECIES-wrapped per member via LABEL_HUB_KEY_WRAP
    |
    +-- Rotated on member departure

Per-note key (random 32 bytes)
    |
    +-- Encrypts note content via XChaCha20-Poly1305
    |
    +-- ECIES-wrapped per reader (volunteer + each admin)
    |
    +-- Never reused across notes
```

## 实时通信

实时更新（新来电、消息、排班变更、在线状态）通过 Nostr relay 传输：

- **自托管**：与应用程序一起在 Docker/Kubernetes 中运行的 strfry relay
- **Cloudflare**：Nosflare（基于 Cloudflare Workers 的 relay）

所有事件都是临时的（kind 20001）并使用 hub key 加密。事件使用通用标签（`["t", "llamenos:event"]`），因此 relay 无法区分事件类型。内容字段包含 XChaCha20-Poly1305 密文。

### 事件流

```
Client A (volunteer action)
    |
    | Encrypt event content with hub key
    | Sign as Nostr event (Schnorr)
    v
Nostr relay (strfry / Nosflare)
    |
    | Broadcast to subscribers
    v
Client B, C, D...
    |
    | Verify Schnorr signature
    | Decrypt content with hub key
    v
Update local UI state
```

Relay 只能看到加密的数据块和有效签名，但无法读取事件内容或判断正在执行什么操作。

## 安全层

### 传输层

- 所有客户端-服务器通信通过 HTTPS (TLS 1.3)
- 到 Nostr relay 的 WebSocket 连接通过 WSS
- Content Security Policy (CSP) 限制脚本来源、连接和 frame ancestors
- Tauri isolation pattern 将 IPC 与 webview 隔离

### 应用层

- 通过 Nostr 密钥对进行身份验证（BIP-340 Schnorr 签名）
- WebAuthn session token 用于多设备便利性
- 基于角色的访问控制（来电者、志愿者、报告人、管理员）
- 所有 25 个密码学域分离常量在 `crypto-labels.ts` 中定义，防止跨协议攻击

### 静态加密

- 通话备注、报告、消息和转录在存储前加密
- 志愿者密钥使用 PIN 派生的密钥加密（PBKDF2）
- Tauri Stronghold 在桌面端提供加密保险库存储
- 审计日志完整性通过 SHA-256 哈希链保护

### 构建验证

- 通过 `Dockerfile.build` 和 `SOURCE_DATE_EPOCH` 实现可重现构建
- 前端资源使用内容哈希文件名
- `CHECKSUMS.txt` 随 GitHub Releases 发布
- SLSA 来源证明
- 验证脚本：`scripts/verify-build.sh`

## 平台差异

| 功能 | 桌面端 (Tauri) | 移动端 (React Native) | 浏览器 (Cloudflare) |
|------|---------------|----------------------|---------------------|
| 密码学后端 | 原生 Rust（通过 IPC） | 原生 Rust（通过 UniFFI） | WASM (llamenos-core) |
| 密钥存储 | Tauri Stronghold（加密） | Secure Enclave / Keystore | 浏览器 localStorage（PIN 加密） |
| 语音转文字 | 客户端 Whisper (WASM) | 不可用 | 客户端 Whisper (WASM) |
| 自动更新 | Tauri updater | App Store / Play Store | 自动（CF Workers） |
| 推送通知 | 操作系统原生（Tauri notification） | 操作系统原生（FCM/APNS） | 浏览器通知 |
| 离线支持 | 有限（需要 API） | 有限（需要 API） | 有限（需要 API） |
