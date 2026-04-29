---
title: "Configuracao: Twilio"
description: Guia passo a passo para configurar o Twilio como provedor de telefonia.
---

O Twilio e o provedor de telefonia padrao do Llamenos e o mais facil de configurar. Este guia orienta sobre a criacao da conta, configuracao do numero de telefone e configuracao de webhooks.

## Pre-requisitos

- Uma [conta Twilio](https://www.twilio.com/try-twilio) (a versao de teste gratuita funciona para testes)
- Sua instancia Llamenos implantada e acessivel via URL publica

## 1. Criar uma conta Twilio

Registre-se em [twilio.com/try-twilio](https://www.twilio.com/try-twilio). Verifique seu e-mail e numero de telefone. O Twilio fornece credito de teste.

## 2. Comprar um numero de telefone

1. Va em **Phone Numbers** > **Manage** > **Buy a number** no console do Twilio
2. Pesquise um numero com capacidade **Voice** no codigo de area desejado
3. Clique em **Buy** e confirme

Anote este numero -- voce o inserira nas configuracoes de administracao do Llamenos.

## 3. Obter seu Account SID e Auth Token

1. Va ao [painel do console do Twilio](https://console.twilio.com)
2. Encontre seu **Account SID** e **Auth Token** na pagina principal
3. Clique no icone do olho para revelar o Auth Token

## 4. Configurar webhooks

No console do Twilio, navegue ate a configuracao do seu numero de telefone:

1. Va em **Phone Numbers** > **Manage** > **Active Numbers**
2. Clique no seu numero da linha
3. Em **Voice Configuration**, defina:
   - **A call comes in**: Webhook, `https://your-worker-url.com/telephony/incoming`, HTTP POST
   - **Call status changes**: `https://your-worker-url.com/telephony/status`, HTTP POST

Substitua `your-worker-url.com` pela URL real do seu Cloudflare Worker.

## 5. Configurar no Llamenos

1. Faca login como administrador
2. Va em **Configuracoes** > **Provedor de telefonia**
3. Selecione **Twilio** no menu suspenso de provedores
4. Insira:
   - **Account SID**: do passo 3
   - **Auth Token**: do passo 3
   - **Phone Number**: o numero que voce comprou (formato E.164, ex.: `+15551234567`)
5. Clique em **Salvar**

## 6. Testar a configuracao

Ligue para o numero da sua linha de um telefone. Voce devera ouvir o menu de selecao de idioma. Se houver voluntarios em servico, a chamada sera encaminhada.

## Configuracao WebRTC (opcional)

Para permitir que voluntarios atendam chamadas no navegador em vez do telefone:

### Criar uma chave de API

1. Va em **Account** > **API keys & tokens** no console do Twilio
2. Clique em **Create API Key**
3. Escolha o tipo de chave **Standard**
4. Salve o **SID** e o **Secret** -- o secret e exibido apenas uma vez

### Criar um aplicativo TwiML

1. Va em **Voice** > **Manage** > **TwiML Apps**
2. Clique em **Create new TwiML App**
3. Defina o **Voice Request URL** como `https://your-worker-url.com/telephony/webrtc-incoming`
4. Salve e anote o **App SID**

### Ativar no Llamenos

1. Va em **Configuracoes** > **Provedor de telefonia**
2. Ative **Chamadas WebRTC**
3. Insira:
   - **API Key SID**: da chave de API que voce criou
   - **API Key Secret**: da chave de API que voce criou
   - **TwiML App SID**: do aplicativo TwiML que voce criou
4. Clique em **Salvar**

Consulte [Chamadas WebRTC no navegador](/docs/deploy/providers/webrtc) para configuracao dos voluntarios e solucao de problemas.

## Solucao de problemas

- **Chamadas nao chegam**: Verifique se a URL do webhook esta correta e se seu Worker esta implantado. Verifique os logs de erro do console do Twilio.
- **Erros "Invalid webhook"**: Certifique-se de que a URL do webhook usa HTTPS e retorna TwiML valido.
- **Limitacoes da conta de teste**: Contas de teste so podem ligar para numeros verificados. Faca upgrade para uma conta paga para uso em producao.
- **Falhas na validacao de webhooks**: Certifique-se de que o Auth Token no Llamenos corresponde ao do console do Twilio.
