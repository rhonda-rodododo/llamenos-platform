---
title: "Configuracao: Plivo"
description: Guia passo a passo para configurar o Plivo como provedor de telefonia.
---

O Plivo e um provedor de telefonia cloud economico com uma API direta. Ele usa controle de chamadas baseado em XML semelhante ao TwiML, tornando a integracao com o Llamenos transparente.

## Pre-requisitos

- Uma [conta Plivo](https://console.plivo.com/accounts/register/) (credito de teste disponivel)
- Sua instancia Llamenos implantada e acessivel via URL publica

## 1. Criar uma conta Plivo

Registre-se em [console.plivo.com](https://console.plivo.com/accounts/register/). Apos a verificacao, voce encontrara seu **Auth ID** e **Auth Token** na pagina inicial do painel.

## 2. Comprar um numero de telefone

1. Va em **Phone Numbers** > **Buy Numbers** no console do Plivo
2. Selecione seu pais e pesquise numeros com capacidade de voz
3. Compre um numero

## 3. Criar uma aplicacao XML

O Plivo usa "Aplicacoes XML" para encaminhar chamadas:

1. Va em **Voice** > **XML Applications**
2. Clique em **Add New Application**
3. Configure:
   - **Application Name**: Llamenos Hotline
   - **Answer URL**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Hangup URL**: `https://your-worker-url.com/telephony/status` (POST)
4. Salve a aplicacao

## 4. Vincular o numero de telefone

1. Va em **Phone Numbers** > **Your Numbers**
2. Clique no seu numero da linha
3. Em **Voice**, selecione a Aplicacao XML que voce criou no passo 3
4. Salve

## 5. Configurar no Llamenos

1. Faca login como administrador
2. Va em **Configuracoes** > **Provedor de telefonia**
3. Selecione **Plivo** no menu suspenso de provedores
4. Insira:
   - **Auth ID**: do painel do console do Plivo
   - **Auth Token**: do painel do console do Plivo
   - **Phone Number**: o numero que voce comprou (formato E.164)
5. Clique em **Salvar**

## 6. Testar a configuracao

Ligue para o numero da sua linha. Voce devera ouvir o menu de selecao de idioma e ser encaminhado pelo fluxo de chamada normal.

## Configuracao WebRTC (opcional)

O Plivo WebRTC usa o SDK do navegador com suas credenciais existentes:

1. Va em **Voice** > **Endpoints** no console do Plivo
2. Crie um novo endpoint (ele funciona como a identidade telefonica do navegador)
3. No Llamenos, va em **Configuracoes** > **Provedor de telefonia**
4. Ative **Chamadas WebRTC**
5. Clique em **Salvar**

O adaptador gera tokens HMAC com tempo limitado a partir do seu Auth ID e Auth Token para autenticacao segura do navegador.

## Notas especificas do Plivo

- **XML vs TwiML**: O Plivo usa seu proprio formato XML para controle de chamadas, que e semelhante mas nao identico ao TwiML. O adaptador do Llamenos gera o XML do Plivo correto automaticamente.
- **Answer URL vs Hangup URL**: O Plivo separa o manipulador de chamada inicial (Answer URL) do manipulador de fim de chamada (Hangup URL), diferente do Twilio que usa um unico callback de status.
- **Limites de taxa**: O Plivo tem limites de taxa de API que variam por nivel de conta. Para linhas de alto volume, entre em contato com o suporte do Plivo para aumentar os limites.

## Solucao de problemas

- **"Auth ID invalid"**: O Auth ID nao e seu endereco de e-mail. Encontre-o na pagina inicial do painel do console do Plivo.
- **Chamadas nao encaminhadas**: Verifique se o numero de telefone esta vinculado a Aplicacao XML correta.
- **Erros na Answer URL**: O Plivo espera respostas XML validas. Verifique os logs do seu Worker para erros de resposta.
- **Restricoes de chamadas de saida**: Contas de teste tem limitacoes em chamadas de saida. Faca upgrade para uso em producao.
