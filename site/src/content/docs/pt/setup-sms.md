---
title: "Configuracao: SMS"
description: Ative mensagens SMS de entrada e saida atraves do seu provedor de telefonia.
---

O SMS no Llamenos reutiliza as credenciais existentes do seu provedor de telefonia de voz. Nenhum servico de SMS separado e necessario -- se voce ja configurou Twilio, SignalWire, Vonage ou Plivo para voz, o SMS funciona com a mesma conta.

## Provedores suportados

| Provedor | Suporte a SMS | Notas |
|----------|--------------|-------|
| **Twilio** | Sim | SMS bidirecional completo via Twilio Messaging API |
| **SignalWire** | Sim | Compativel com a API do Twilio -- mesma interface |
| **Vonage** | Sim | SMS via Vonage REST API |
| **Plivo** | Sim | SMS via Plivo Message API |
| **Asterisk** | Nao | Asterisk nao suporta SMS nativo |

## 1. Ativar SMS nas configuracoes de administrador

Navegue ate **Configuracoes de Admin > Canais de Mensagens** (ou use o assistente de configuracao no primeiro login) e ative **SMS**.

Configure as opcoes de SMS:
- **Mensagem de auto-resposta** -- mensagem de boas-vindas opcional enviada a contatos novos
- **Resposta fora do horario** -- mensagem opcional enviada fora do horario de turno

## 2. Configurar o webhook

Aponte o webhook de SMS do seu provedor de telefonia para o seu Worker:

```
POST https://seu-worker.seu-dominio.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. Va ao Console Twilio > Phone Numbers > Active Numbers
2. Selecione seu numero de telefone
3. Em **Messaging**, defina a URL do webhook para "A message comes in" com a URL acima
4. Defina o metodo HTTP como **POST**

### Vonage

1. Va ao Vonage API Dashboard > Applications
2. Selecione sua aplicacao
3. Em **Messages**, defina a Inbound URL para a URL do webhook acima

### Plivo

1. Va ao Console Plivo > Messaging > Applications
2. Crie ou edite uma aplicacao de mensagens
3. Defina a Message URL para a URL do webhook acima
4. Associe a aplicacao ao seu numero de telefone

## 3. Testar

Envie um SMS para o numero de telefone da sua linha. Voce deve ver a conversa aparecer na aba **Conversas** no painel de administracao.

## Como funciona

1. Um SMS chega ao seu provedor, que envia um webhook para o seu Worker
2. O Worker valida a assinatura do webhook (HMAC especifico do provedor)
3. A mensagem e analisada e armazenada no ConversationDO
4. Os voluntarios em turno sao notificados via eventos do relay Nostr
5. Os voluntarios respondem pela aba de Conversas -- as respostas sao enviadas de volta pela API de SMS do seu provedor

## Notas de seguranca

- As mensagens SMS trafegam pela rede da operadora em texto simples -- seu provedor e as operadoras podem le-las
- As mensagens recebidas sao armazenadas no ConversationDO apos a chegada
- Os numeros de telefone dos remetentes sao transformados em hash antes do armazenamento (privacidade)
- As assinaturas de webhook sao validadas por provedor (HMAC-SHA1 para Twilio, etc.)
