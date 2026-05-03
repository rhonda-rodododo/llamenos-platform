---
title: Primeiros passos
description: Implante sua propria linha Llamenos em menos de uma hora.
---

Implante sua propria linha Llamenos em menos de uma hora. Voce precisara de uma conta Cloudflare, uma conta de provedor de telefonia e uma maquina com Bun instalado.

## Pre-requisitos

- [Bun](https://bun.sh) v1.0 ou superior (runtime e gerenciador de pacotes)
- Uma conta [Cloudflare](https://www.cloudflare.com) (o plano gratuito funciona para desenvolvimento)
- Uma conta de provedor de telefonia -- [Twilio](https://www.twilio.com) e o mais facil para comecar, mas o Llamenos tambem suporta [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo) e [Asterisk auto-hospedado](/docs/deploy/providers/asterisk). Consulte a [comparacao de provedores de telefonia](/docs/deploy/providers) para ajudar na escolha.
- Git

## 1. Clonar e instalar

```bash
git clone https://github.com/rhonda-rodododo/llamenos-hotline.git
cd llamenos-hotline
bun install
```

## 2. Gerar o par de chaves do administrador

Gere um par de chaves Nostr para a conta de administrador. Isso produz uma chave secreta (nsec) e uma chave publica (npub/hex).

```bash
bun run bootstrap-admin
```

Guarde o `nsec` com seguranca -- essa e sua credencial de login de administrador. Voce precisara da chave publica hexadecimal para o proximo passo.

## 3. Configurar os secrets

Crie um arquivo `.dev.vars` na raiz do projeto para desenvolvimento local. Este exemplo usa Twilio -- se voce estiver usando outro provedor, pode pular as variaveis do Twilio e configurar seu provedor pela interface de administracao apos o primeiro login.

```bash
# .dev.vars
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
ADMIN_PUBKEY=your_hex_public_key_from_step_2
ENVIRONMENT=development
```

Para producao, defina-os como secrets do Wrangler:

```bash
bunx wrangler secret put ADMIN_PUBKEY
# Se estiver usando Twilio como provedor padrao via variaveis de ambiente:
bunx wrangler secret put TWILIO_ACCOUNT_SID
bunx wrangler secret put TWILIO_AUTH_TOKEN
bunx wrangler secret put TWILIO_PHONE_NUMBER
```

> **Nota**: Voce tambem pode configurar seu provedor de telefonia inteiramente pela interface de configuracoes do administrador, em vez de usar variaveis de ambiente. Isso e obrigatorio para provedores que nao sejam Twilio. Consulte o [guia de configuracao do seu provedor](/docs/deploy/providers).

## 4. Configurar os webhooks de telefonia

Configure seu provedor de telefonia para enviar webhooks de voz ao seu Worker. As URLs de webhook sao as mesmas independentemente do provedor:

- **URL de chamada recebida**: `https://your-worker.your-domain.com/telephony/incoming` (POST)
- **URL de callback de status**: `https://your-worker.your-domain.com/telephony/status` (POST)

Para instrucoes de configuracao de webhook especificas de cada provedor, consulte: [Twilio](/docs/deploy/providers/twilio), [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo) ou [Asterisk](/docs/deploy/providers/asterisk).

Para desenvolvimento local, voce precisara de um tunel (como Cloudflare Tunnel ou ngrok) para expor seu Worker local ao seu provedor de telefonia.

## 5. Executar localmente

Inicie o servidor de desenvolvimento do Worker (backend + frontend):

```bash
# Construir os assets do frontend primeiro
bun run build

# Iniciar o servidor de desenvolvimento do Worker
bun run dev:worker
```

O aplicativo estara disponivel em `http://localhost:8787`. Faca login com o nsec de administrador do passo 2.

## 6. Implantar no Cloudflare

```bash
bun run deploy
```

Isso constroi o frontend e implanta o Worker com Durable Objects no Cloudflare. Apos a implantacao, atualize as URLs de webhook do seu provedor de telefonia para apontar para a URL do Worker de producao.

## Proximos passos

- [Guia do administrador](/docs/admin-guide) -- adicionar voluntarios, criar turnos, configurar parametros
- [Guia do voluntario](/docs/volunteer-guide) -- compartilhe com seus voluntarios
- [Provedores de telefonia](/docs/deploy/providers) -- comparar provedores e trocar do Twilio se necessario
- [Modelo de seguranca](/security) -- entender a criptografia e o modelo de ameacas
