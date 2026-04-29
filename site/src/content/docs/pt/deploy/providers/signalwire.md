---
title: "Configuracao: SignalWire"
description: Guia passo a passo para configurar o SignalWire como provedor de telefonia.
---

O SignalWire e uma alternativa economica ao Twilio com uma API compativel. Ele usa LaML (uma linguagem de marcacao compativel com TwiML), tornando a migracao entre Twilio e SignalWire simples.

## Pre-requisitos

- Uma [conta SignalWire](https://signalwire.com/signup) (teste gratuito disponivel)
- Sua instancia Llamenos implantada e acessivel via URL publica

## 1. Criar uma conta SignalWire

Registre-se em [signalwire.com/signup](https://signalwire.com/signup). Durante o registro, voce escolhera um **nome de Space** (ex.: `myhotline`). A URL do seu Space sera `myhotline.signalwire.com`. Anote este nome -- voce precisara dele na configuracao.

## 2. Comprar um numero de telefone

1. No seu painel SignalWire, va em **Phone Numbers**
2. Clique em **Buy a Phone Number**
3. Pesquise um numero com capacidade de voz
4. Compre o numero

## 3. Obter suas credenciais

1. Va em **API** no painel SignalWire
2. Encontre seu **Project ID** (funciona como o Account SID)
3. Crie um novo **API Token** se nao tiver um -- funciona como o Auth Token

## 4. Configurar webhooks

1. Va em **Phone Numbers** no painel
2. Clique no seu numero da linha
3. Em **Voice Settings**, defina:
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Call status callback**: `https://your-worker-url.com/telephony/status` (POST)

## 5. Configurar no Llamenos

1. Faca login como administrador
2. Va em **Configuracoes** > **Provedor de telefonia**
3. Selecione **SignalWire** no menu suspenso de provedores
4. Insira:
   - **Account SID**: seu Project ID do passo 3
   - **Auth Token**: seu API Token do passo 3
   - **SignalWire Space**: seu nome de Space (apenas o nome, nao a URL completa -- ex.: `myhotline`)
   - **Phone Number**: o numero que voce comprou (formato E.164)
5. Clique em **Salvar**

## 6. Testar a configuracao

Ligue para o numero da sua linha. Voce devera ouvir o menu de selecao de idioma seguido do fluxo de chamada.

## Configuracao WebRTC (opcional)

O SignalWire WebRTC usa o mesmo padrao de chave de API do Twilio:

1. No seu painel SignalWire, crie uma **chave de API** em **API** > **Tokens**
2. Crie um **aplicativo LaML**:
   - Va em **LaML** > **LaML Applications**
   - Defina o Voice URL como `https://your-worker-url.com/telephony/webrtc-incoming`
   - Anote o Application SID
3. No Llamenos, va em **Configuracoes** > **Provedor de telefonia**
4. Ative **Chamadas WebRTC**
5. Insira o API Key SID, API Key Secret e Application SID
6. Clique em **Salvar**

## Diferencas em relacao ao Twilio

- **LaML vs TwiML**: O SignalWire usa LaML, que e funcionalmente identico ao TwiML. O Llamenos lida com isso automaticamente.
- **URL do Space**: As chamadas de API vao para `{space}.signalwire.com` em vez de `api.twilio.com`. O adaptador lida com isso atraves do nome de Space que voce fornece.
- **Precos**: O SignalWire e geralmente 30-40% mais barato que o Twilio para chamadas de voz.
- **Paridade de funcionalidades**: Todas as funcionalidades do Llamenos (gravacao, transcricao, CAPTCHA, correio de voz) funcionam de forma identica com o SignalWire.

## Solucao de problemas

- **Erros "Space not found"**: Verifique o nome do Space (apenas o subdominio, nao a URL completa).
- **Falhas de webhook**: Certifique-se de que a URL do seu Worker e acessivel publicamente e usa HTTPS.
- **Problemas com token de API**: Os tokens do SignalWire podem expirar. Crie um novo token se receber erros de autenticacao.
