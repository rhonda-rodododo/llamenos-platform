---
title: "Configuracao: Signal"
description: Configure o canal de mensagens Signal via o bridge signal-cli para mensagens com foco em privacidade.
---

O Llamenos suporta mensagens Signal via um bridge [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) auto-hospedado. O Signal oferece as garantias de privacidade mais fortes de qualquer canal de mensagens, tornando-o ideal para cenarios sensiveis de resposta a crises.

## Pre-requisitos

- Um servidor Linux ou VM para o bridge (pode ser o mesmo servidor do Asterisk, ou separado)
- Docker instalado no servidor do bridge
- Um numero de telefone dedicado para registro no Signal
- Acesso de rede do bridge ao seu Cloudflare Worker

## Arquitetura

![Signal Bridge Architecture](/diagrams/signal-bridge.svg)

O bridge signal-cli roda na sua infraestrutura e encaminha mensagens para o seu Worker via webhooks HTTP. Isso significa que voce controla todo o caminho da mensagem, do Signal ate o seu aplicativo.

## 1. Implantar o bridge signal-cli

Execute o container Docker signal-cli-rest-api:

```bash
docker run -d \
  --name signal-cli \
  --restart unless-stopped \
  -p 8080:8080 \
  -v signal-cli-data:/home/.local/share/signal-cli \
  -e MODE=json-rpc \
  bbernhard/signal-cli-rest-api:latest
```

## 2. Registrar um numero de telefone

Registre o bridge com um numero de telefone dedicado:

```bash
# Solicitar um codigo de verificacao via SMS
curl -X POST http://localhost:8080/v1/register/+1234567890

# Verificar com o codigo que voce recebeu
curl -X POST http://localhost:8080/v1/register/+1234567890/verify/123456
```

## 3. Configurar encaminhamento de webhook

Configure o bridge para encaminhar mensagens recebidas ao seu Worker:

```bash
curl -X PUT http://localhost:8080/v1/about \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "url": "https://seu-worker.seu-dominio.com/api/messaging/signal/webhook",
      "headers": {
        "Authorization": "Bearer seu-segredo-de-webhook"
      }
    }
  }'
```

## 4. Ativar Signal nas configuracoes de administrador

Navegue ate **Configuracoes de Admin > Canais de Mensagens** (ou use o assistente de configuracao) e ative **Signal**.

Insira o seguinte:
- **URL do Bridge** -- a URL do seu bridge signal-cli (ex.: `https://signal-bridge.exemplo.com:8080`)
- **Chave de API do Bridge** -- um token bearer para autenticar requisicoes ao bridge
- **Segredo do Webhook** -- o segredo usado para validar webhooks recebidos (deve corresponder ao que voce configurou no passo 3)
- **Numero Registrado** -- o numero de telefone registrado com o Signal

## 5. Testar

Envie uma mensagem Signal para o seu numero registrado. A conversa deve aparecer na aba **Conversas**.

## Monitoramento de saude

O Llamenos monitora a saude do bridge signal-cli:
- Verificacoes periodicas de saude no endpoint `/v1/about` do bridge
- Degradacao elegante se o bridge estiver inacessivel -- outros canais continuam funcionando
- Alertas para o administrador quando o bridge cai

## Transcricao de mensagens de voz

Mensagens de voz do Signal podem ser transcritas diretamente no navegador do voluntario usando Whisper no lado do cliente (WASM via `@huggingface/transformers`). O audio nunca sai do dispositivo -- a transcricao e criptografada e armazenada junto com a mensagem de voz na visualizacao da conversa. Os voluntarios podem ativar ou desativar a transcricao nas suas configuracoes pessoais.

## Notas de seguranca

- O Signal fornece criptografia de ponta a ponta entre o usuario e o bridge signal-cli
- O bridge decifra as mensagens para encaminha-las como webhooks -- o servidor do bridge tem acesso ao texto simples
- A autenticacao de webhook usa tokens bearer com comparacao em tempo constante
- Mantenha o bridge na mesma rede que o seu servidor Asterisk (se aplicavel) para exposicao minima
- O bridge armazena o historico de mensagens localmente no seu volume Docker -- considere criptografia em repouso
- Para maxima privacidade: auto-hospede tanto o Asterisk (voz) quanto o signal-cli (mensagens) na sua propria infraestrutura

## Solucao de problemas

- **Bridge nao recebe mensagens**: Verifique se o numero de telefone esta registrado corretamente com `GET /v1/about`
- **Falhas de entrega de webhook**: Verifique se a URL do webhook esta acessivel a partir do servidor do bridge e se o cabecalho de autorizacao corresponde
- **Problemas de registro**: Alguns numeros de telefone podem precisar ser desvinculados de uma conta Signal existente primeiro
