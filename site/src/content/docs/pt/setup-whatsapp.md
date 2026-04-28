---
title: "Configuracao: WhatsApp"
description: Conecte o WhatsApp Business via a API Cloud da Meta para mensagens criptografadas.
---

O Llamenos suporta mensagens WhatsApp Business via a API Cloud da Meta (Graph API v21.0). O WhatsApp possibilita mensagens ricas com suporte a texto, imagens, documentos, audio e mensagens interativas.

## Pre-requisitos

- Uma [conta Meta Business](https://business.facebook.com)
- Um numero de telefone da API WhatsApp Business
- Um aplicativo de desenvolvedor Meta com o produto WhatsApp ativado

## Modos de integracao

O Llamenos suporta dois modos de integracao com WhatsApp:

### Meta Direto (recomendado)

Conecte diretamente a API Cloud da Meta. Oferece controle total e todos os recursos.

**Credenciais necessarias:**
- **Phone Number ID** -- o ID do numero de telefone WhatsApp Business
- **Business Account ID** -- o ID da sua conta Meta Business
- **Access Token** -- um token de acesso Meta API de longa duracao
- **Verify Token** -- uma string personalizada que voce escolhe para verificacao de webhook
- **App Secret** -- o segredo do seu aplicativo Meta (para validacao de assinatura de webhook)

### Modo Twilio

Se voce ja usa Twilio para voz, pode rotear o WhatsApp pela sua conta Twilio. Configuracao mais simples, mas alguns recursos podem ser limitados.

**Credenciais necessarias:**
- Seu Account SID, Auth Token e um remetente WhatsApp conectado ao Twilio existentes

## 1. Criar um aplicativo Meta

1. Va para [developers.facebook.com](https://developers.facebook.com)
2. Crie um novo aplicativo (tipo: Business)
3. Adicione o produto **WhatsApp**
4. Em WhatsApp > Getting Started, anote seu **Phone Number ID** e **Business Account ID**
5. Gere um token de acesso permanente (Settings > Access Tokens)

## 2. Configurar o webhook

No painel de desenvolvedor da Meta:

1. Va para WhatsApp > Configuration > Webhook
2. Defina a Callback URL como:
   ```
   https://seu-worker.seu-dorustfs.com/api/messaging/whatsapp/webhook
   ```
3. Defina o Verify Token com a mesma string que voce inserira nas configuracoes de administrador do Llamenos
4. Inscreva-se no campo de webhook `messages`

A Meta enviara uma requisicao GET para verificar o webhook. Seu Worker respondera com o desafio se o verify token corresponder.

## 3. Ativar WhatsApp nas configuracoes de administrador

Navegue ate **Configuracoes de Admin > Canais de Mensagens** (ou use o assistente de configuracao) e ative **WhatsApp**.

Selecione o modo **Meta Direto** ou **Twilio** e insira as credenciais necessarias.

Configure as opcoes:
- **Mensagem de auto-resposta** -- enviada a contatos novos
- **Resposta fora do horario** -- enviada fora do horario de turno

## 4. Testar

Envie uma mensagem WhatsApp para o seu numero Business. A conversa deve aparecer na aba **Conversas**.

## Janela de mensagens de 24 horas

O WhatsApp impoe uma janela de mensagens de 24 horas:
- Voce pode responder a um usuario dentro de 24 horas apos a ultima mensagem dele
- Apos 24 horas, voce deve usar um **template de mensagem** aprovado para reiniciar a conversa
- O Llamenos lida com isso automaticamente -- se a janela expirou, ele envia um template de mensagem para retomar a conversa

## Suporte a midia

O WhatsApp suporta mensagens de midia rica:
- **Imagens** (JPEG, PNG)
- **Documentos** (PDF, Word, etc.)
- **Audio** (MP3, OGG)
- **Video** (MP4)
- Compartilhamento de **localizacao**
- Mensagens **interativas** com botoes e listas

Os anexos de midia aparecem integrados na visualizacao da conversa.

## Notas de seguranca

- O WhatsApp usa criptografia de ponta a ponta entre o usuario e a infraestrutura da Meta
- A Meta pode tecnicamente acessar o conteudo das mensagens em seus servidores
- As mensagens sao armazenadas no Llamenos apos o recebimento do webhook
- As assinaturas de webhook sao validadas usando HMAC-SHA256 com o app secret
- Para maxima privacidade, considere usar o Signal em vez do WhatsApp
