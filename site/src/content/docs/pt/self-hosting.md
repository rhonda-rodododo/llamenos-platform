---
title: Visao geral do auto-hospedagem
description: Implante o Llamenos na sua propria infraestrutura com Docker Compose ou Kubernetes.
---

O Llamenos pode rodar no Cloudflare Workers **ou** na sua propria infraestrutura. O auto-hospedagem oferece controle total sobre residencia de dados, isolamento de rede e escolhas de infraestrutura -- importante para organizacoes que nao podem usar plataformas de nuvem de terceiros ou precisam atender requisitos rigorosos de conformidade.

## Opcoes de implantacao

| Opcao | Melhor para | Complexidade | Escalabilidade |
|-------|-------------|--------------|----------------|
| [Cloudflare Workers](/docs/getting-started) | Inicio mais facil, borda global | Baixa | Automatica |
| [Docker Compose](/docs/deploy-docker) | Auto-hospedagem em servidor unico | Media | Servidor unico |
| [Kubernetes (Helm)](/docs/deploy-kubernetes) | Orquestracao multi-servico | Alta | Horizontal (multi-replica) |

## Diferencas de arquitetura

Ambos os alvos de implantacao executam o **mesmo codigo do aplicativo**. A diferenca esta na camada de infraestrutura:

| Componente | Cloudflare | Auto-hospedado |
|------------|------------|----------------|
| **Runtime do backend** | Cloudflare Workers | Node.js (via Hono) |
| **Armazenamento de dados** | Durable Objects (KV) | PostgreSQL |
| **Armazenamento de blobs** | R2 | RustFS (compativel com S3) |
| **Transcricao** | Whisper no lado do cliente (WASM) | Whisper no lado do cliente (WASM) |
| **Arquivos estaticos** | Workers Assets | Caddy / Hono serveStatic |
| **Eventos em tempo real** | Nostr relay (Nosflare) | Nostr relay (strfry) |
| **Terminacao TLS** | Borda Cloudflare | Caddy (HTTPS automatico) |
| **Custo** | Baseado em uso (plano gratuito disponivel) | Custos do seu servidor |

## O que voce precisa

### Requisitos minimos

- Um servidor Linux (2 nucleos de CPU, 2 GB de RAM no minimo)
- Docker e Docker Compose v2 (ou um cluster Kubernetes para Helm)
- Um nome de dorustfs apontando para seu servidor
- Um par de chaves de administrador (gerado com `bun run bootstrap-admin`)
- Pelo menos um canal de comunicacao (provedor de voz, SMS, etc.)

### Componentes opcionais

- **Transcricao Whisper** -- requer 4 GB+ de RAM (CPU) ou uma GPU para processamento mais rapido
- **Asterisk** -- para telefonia SIP auto-hospedada (veja [configuracao do Asterisk](/docs/setup-asterisk))
- **Bridge Signal** -- para mensagens Signal (veja [configuracao do Signal](/docs/setup-signal))

## Comparacao rapida

**Escolha Docker Compose se:**
- Voce esta rodando em um servidor unico ou VPS
- Voce quer a configuracao auto-hospedada mais simples possivel
- Voce esta confortavel com o basico do Docker

**Escolha Kubernetes (Helm) se:**
- Voce ja tem um cluster K8s
- Voce precisa de escalabilidade horizontal (multiplas replicas)
- Voce quer integrar com ferramentas K8s existentes (cert-manager, external-secrets, etc.)

## Consideracoes de seguranca

O auto-hospedagem oferece mais controle, mas tambem mais responsabilidade:

- **Dados em repouso**: Os dados do PostgreSQL sao armazenados sem criptografia por padrao. Use criptografia de disco completo (LUKS, dm-crypt) no seu servidor, ou ative o TDE do PostgreSQL se disponivel. Note que notas de chamadas e transcricoes ja sao E2EE -- o servidor nunca ve o texto simples.
- **Seguranca de rede**: Use um firewall para restringir o acesso. Apenas as portas 80/443 devem ser acessiveis publicamente.
- **Secrets**: Nunca coloque secrets em arquivos Docker Compose ou controle de versao. Use arquivos `.env` (excluidos das imagens) ou secrets do Docker/Kubernetes.
- **Atualizacoes**: Baixe novas imagens regularmente. Acompanhe o [changelog](https://github.com/your-org/llamenos/blob/main/CHANGELOG.md) para correcoes de seguranca.
- **Backups**: Faca backup do banco de dados PostgreSQL e do armazenamento RustFS regularmente. Veja a secao de backup em cada guia de implantacao.

## Proximos passos

- [Implantacao com Docker Compose](/docs/deploy-docker) -- comece a rodar em 10 minutos
- [Implantacao no Kubernetes](/docs/deploy-kubernetes) -- implante com Helm
- [Primeiros passos](/docs/getting-started) -- implantacao no Cloudflare Workers
