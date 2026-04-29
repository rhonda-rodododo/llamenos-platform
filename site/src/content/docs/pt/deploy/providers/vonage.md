---
title: "Configuracao: Vonage"
description: Guia passo a passo para configurar o Vonage como provedor de telefonia.
---

O Vonage (anteriormente Nexmo) oferece forte cobertura internacional e precos competitivos. Ele usa um modelo de API diferente do Twilio -- as Aplicacoes Vonage agrupam seu numero, webhooks e credenciais.

## Pre-requisitos

- Uma [conta Vonage](https://dashboard.nexmo.com/sign-up) (credito gratuito disponivel)
- Sua instancia Llamenos implantada e acessivel via URL publica

## 1. Criar uma conta Vonage

Registre-se no [painel de API do Vonage](https://dashboard.nexmo.com/sign-up). Verifique sua conta e anote seu **API Key** e **API Secret** na pagina inicial do painel.

## 2. Comprar um numero de telefone

1. Va em **Numbers** > **Buy numbers** no painel Vonage
2. Selecione seu pais e escolha um numero com capacidade **Voice**
3. Compre o numero

## 3. Criar uma aplicacao Vonage

O Vonage agrupa a configuracao em "Aplicacoes":

1. Va em **Applications** > **Create a new application**
2. Insira um nome (ex.: "Llamenos Hotline")
3. Em **Voice**, ative-o e defina:
   - **Answer URL**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Event URL**: `https://your-worker-url.com/telephony/status` (POST)
4. Clique em **Generate new application**
5. Salve o **Application ID** exibido na pagina de confirmacao
6. Baixe o arquivo de **chave privada** -- voce precisara do seu conteudo para a configuracao

## 4. Vincular o numero de telefone

1. Va em **Numbers** > **Your numbers**
2. Clique no icone de engrenagem ao lado do seu numero da linha
3. Em **Voice**, selecione a Aplicacao que voce criou no passo 3
4. Clique em **Save**

## 5. Configurar no Llamenos

1. Faca login como administrador
2. Va em **Configuracoes** > **Provedor de telefonia**
3. Selecione **Vonage** no menu suspenso de provedores
4. Insira:
   - **API Key**: da pagina inicial do painel Vonage
   - **API Secret**: da pagina inicial do painel Vonage
   - **Application ID**: do passo 3
   - **Phone Number**: o numero que voce comprou (formato E.164)
5. Clique em **Salvar**

## 6. Testar a configuracao

Ligue para o numero da sua linha. Voce devera ouvir o menu de selecao de idioma. Verifique se as chamadas sao encaminhadas para os voluntarios em servico.

## Configuracao WebRTC (opcional)

O Vonage WebRTC usa as credenciais da Aplicacao que voce ja criou:

1. No Llamenos, va em **Configuracoes** > **Provedor de telefonia**
2. Ative **Chamadas WebRTC**
3. Insira o conteudo da **chave privada** (o texto PEM completo do arquivo que voce baixou)
4. Clique em **Salvar**

O Application ID ja esta configurado. O Vonage gera JWTs RS256 usando a chave privada para autenticacao do navegador.

## Notas especificas do Vonage

- **NCCO vs TwiML**: O Vonage usa NCCO (Nexmo Call Control Objects) em formato JSON em vez de marcacao XML. O adaptador do Llamenos gera o formato correto automaticamente.
- **Formato da Answer URL**: O Vonage espera que a answer URL retorne JSON (NCCO), nao XML. Isso e tratado pelo adaptador.
- **Event URL**: O Vonage envia eventos de chamada (tocando, atendida, concluida) para a event URL como requisicoes POST em JSON.
- **Seguranca da chave privada**: A chave privada e armazenada de forma criptografada. Ela nunca sai do servidor -- e usada apenas para gerar tokens JWT de curta duracao.

## Solucao de problemas

- **"Application not found"**: Verifique se o Application ID corresponde exatamente. Voce pode encontra-lo em **Applications** no painel Vonage.
- **Sem chamadas recebidas**: Certifique-se de que o numero de telefone esta vinculado a Aplicacao correta (passo 4).
- **Erros de chave privada**: Cole o conteudo PEM completo incluindo as linhas `-----BEGIN PRIVATE KEY-----` e `-----END PRIVATE KEY-----`.
- **Formato de numero internacional**: O Vonage exige o formato E.164. Inclua o `+` e o codigo do pais.
