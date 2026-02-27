---
title: 自托管概览
description: 使用 Docker Compose 或 Kubernetes 在您自己的基础设施上部署 Llamenos。
---

Llamenos 可以运行在 Cloudflare Workers 上**或**您自己的基础设施上。自托管让您完全控制数据存储位置、网络隔离和基础设施选择——这对于无法使用第三方云平台或需要满足严格合规要求的组织来说非常重要。

## 部署选项

| 选项 | 最适合 | 复杂度 | 扩展性 |
|------|--------|--------|--------|
| [Cloudflare Workers](/docs/getting-started) | 最简单的入门，全球边缘 | 低 | 自动 |
| [Docker Compose](/docs/deploy-docker) | 单服务器自托管 | 中等 | 单节点 |
| [Kubernetes (Helm)](/docs/deploy-kubernetes) | 多服务编排 | 较高 | 水平扩展（多副本） |

## 架构差异

两种部署目标运行**完全相同的应用代码**。差异在于基础设施层：

| 组件 | Cloudflare | 自托管 |
|------|------------|--------|
| **后端运行时** | Cloudflare Workers | Node.js（通过 Hono） |
| **数据存储** | Durable Objects (KV) | PostgreSQL |
| **Blob 存储** | R2 | MinIO（兼容 S3） |
| **语音转文字** | 客户端 Whisper (WASM) | 客户端 Whisper (WASM) |
| **静态文件** | Workers Assets | Caddy / Hono serveStatic |
| **实时事件** | Nostr relay (Nosflare) | Nostr relay (strfry) |
| **TLS 终端** | Cloudflare 边缘 | Caddy（自动 HTTPS） |
| **费用** | 按使用量计费（有免费额度） | 您的服务器成本 |

## 所需条件

### 最低要求

- 一台 Linux 服务器（最低 2 个 CPU 核心、2 GB 内存）
- Docker 和 Docker Compose v2（或用于 Helm 的 Kubernetes 集群）
- 一个指向您服务器的域名
- 一个管理员密钥对（通过 `bun run bootstrap-admin` 生成）
- 至少一个通信频道（语音提供商、SMS 等）

### 可选组件

- **Whisper 语音转文字** —— 需要 4 GB+ 内存（CPU）或 GPU 以加快处理速度
- **Asterisk** —— 用于自托管 SIP 电话服务（请参阅 [Asterisk 配置](/docs/setup-asterisk)）
- **Signal 桥接** —— 用于 Signal 消息功能（请参阅 [Signal 配置](/docs/setup-signal)）

## 快速对比

**选择 Docker Compose 如果：**
- 您在单台服务器或 VPS 上运行
- 您需要最简单的自托管方案
- 您熟悉 Docker 基础操作

**选择 Kubernetes (Helm) 如果：**
- 您已有 K8s 集群
- 您需要水平扩展（多副本）
- 您想集成现有的 K8s 工具（cert-manager、external-secrets 等）

## 安全注意事项

自托管给您更多控制权，但也意味着更多责任：

- **静态数据加密**：PostgreSQL 数据默认未加密存储。请在服务器上使用全盘加密（LUKS、dm-crypt），或启用 PostgreSQL TDE（如可用）。请注意，通话备注和转录已经是端到端加密的——服务器永远不会看到明文。
- **网络安全**：使用防火墙限制访问。只有 80/443 端口应该对外公开。
- **密钥管理**：切勿将密钥放入 Docker Compose 文件或版本控制中。使用 `.env` 文件（不包含在镜像中）或 Docker/Kubernetes secrets。
- **更新**：定期拉取新镜像。关注[更新日志](https://github.com/your-org/llamenos/blob/main/CHANGELOG.md)了解安全修复。
- **备份**：定期备份 PostgreSQL 数据库和 MinIO 存储。请参阅各部署指南中的备份章节。

## 后续步骤

- [Docker Compose 部署](/docs/deploy-docker) —— 10 分钟内启动运行
- [Kubernetes 部署](/docs/deploy-kubernetes) —— 使用 Helm 部署
- [快速入门](/docs/getting-started) —— Cloudflare Workers 部署
