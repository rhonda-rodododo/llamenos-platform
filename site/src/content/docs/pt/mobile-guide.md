---
title: Guia do aplicativo movel
description: Instale e configure o aplicativo movel Llamenos no iOS e Android.
---

O aplicativo movel Llamenos permite que voluntarios atendam chamadas, respondam a mensagens e escrevam notas criptografadas pelo celular. Ele e construido com React Native e compartilha o mesmo nucleo criptografico Rust do aplicativo desktop.

## O que e o aplicativo movel?

O aplicativo movel e um complemento ao aplicativo desktop. Ele se conecta ao mesmo backend Llamenos (Cloudflare Workers ou auto-hospedado) e usa o mesmo protocolo, para que os voluntarios possam alternar entre desktop e mobile sem interrupcoes.

O aplicativo movel esta em um repositorio separado (`llamenos-platform`), mas compartilha:

- **llamenos-core** -- O mesmo crate Rust para todas as operacoes criptograficas, compilado via UniFFI para iOS e Android
- **Protocolo** -- O mesmo formato de fio, endpoints de API e esquema de criptografia
- **Backend** -- O mesmo Cloudflare Worker ou servidor auto-hospedado

## Baixar e instalar

### Android

O aplicativo movel e distribuido atualmente como APK para instalacao manual:

1. Baixe o arquivo `.apk` mais recente na pagina de [GitHub Releases](https://github.com/rhonda-rodododo/llamenos-platform/releases/latest)
2. No seu dispositivo Android, va para **Configuracoes > Seguranca** e ative **Instalar de fontes desconhecidas** (ou ative por aplicativo quando solicitado)
3. Abra o APK baixado e toque em **Instalar**
4. Depois de instalado, abra o Llamenos na gaveta de aplicativos

A distribuicao via App Store e Play Store esta planejada para uma versao futura.

### iOS

Builds para iOS estao disponiveis como versoes beta do TestFlight:

1. Instale o [TestFlight](https://apps.apple.com/app/testflight/id899247664) na App Store
2. Peca ao seu administrador o link de convite do TestFlight
3. Abra o link no seu dispositivo iOS para participar do beta
4. Instale o Llamenos pelo TestFlight

A distribuicao via App Store esta planejada para uma versao futura.

## Configuracao inicial

O aplicativo movel e configurado vinculando-o a uma conta desktop existente. Isso garante que a mesma identidade criptografica seja usada em todos os dispositivos sem nunca transmitir a chave secreta em texto simples.

### Provisionamento de dispositivo (leitura de QR)

1. Abra o aplicativo desktop Llamenos e va para **Configuracoes > Dispositivos**
2. Clique em **Vincular Novo Dispositivo** -- isso gera um codigo QR contendo um token de provisionamento de uso unico
3. Abra o aplicativo movel Llamenos e toque em **Vincular Dispositivo**
4. Escaneie o codigo QR com a camera do seu celular
5. Os aplicativos realizam uma troca de chaves ECDH efemera para transferir com seguranca o material de chave criptografado
6. Defina um PIN no aplicativo movel para proteger seu armazenamento local de chaves
7. O aplicativo movel esta agora vinculado e pronto para uso

O processo de provisionamento nunca transmite seu nsec em texto simples. O aplicativo desktop envolve o material de chave com o segredo compartilhado efemero, e o aplicativo movel o desembrulha localmente.

### Configuracao manual (entrada de nsec)

Se voce nao consegue escanear um codigo QR, pode inserir seu nsec diretamente:

1. Abra o aplicativo movel e toque em **Inserir nsec manualmente**
2. Cole sua chave `nsec1...`
3. Defina um PIN para proteger o armazenamento local
4. O aplicativo deriva sua chave publica e se registra no backend

Este metodo requer manipulacao direta do seu nsec, portanto use-o apenas se a vinculacao de dispositivo nao for possivel. Use um gerenciador de senhas para colar o nsec em vez de digita-lo.

## Comparacao de funcionalidades

| Funcionalidade | Desktop | Mobile |
|---|---|---|
| Atender chamadas recebidas | Sim | Sim |
| Escrever notas criptografadas | Sim | Sim |
| Campos personalizados de notas | Sim | Sim |
| Responder a mensagens (SMS, WhatsApp, Signal) | Sim | Sim |
| Visualizar conversas | Sim | Sim |
| Status de turno e pausas | Sim | Sim |
| Transcricao no lado do cliente | Sim (WASM Whisper) | Nao |
| Busca de notas | Sim | Sim |
| Paleta de comandos | Sim (Ctrl+K) | Nao |
| Atalhos de teclado | Sim | Nao |
| Configuracoes de admin | Sim (completas) | Sim (limitadas) |
| Gerenciar voluntarios | Sim | Apenas visualizacao |
| Visualizar logs de auditoria | Sim | Sim |
| Chamadas WebRTC no navegador | Sim | Nao (usa telefone nativo) |
| Notificacoes push | Notificacoes do SO | Push nativo (FCM/APNS) |
| Atualizacao automatica | Tauri updater | App Store / TestFlight |
| Anexos de arquivo (reportes) | Sim | Sim |

## Limitacoes

- **Sem transcricao no lado do cliente** -- O modelo WASM Whisper requer recursos significativos de memoria e CPU que sao impraticaveis em dispositivos moveis. A transcricao de chamadas esta disponivel apenas no desktop.
- **Desempenho criptografico reduzido** -- Embora o aplicativo movel use o mesmo nucleo Rust de criptografia via UniFFI, as operacoes podem ser mais lentas em dispositivos mais antigos em comparacao com o desempenho nativo do desktop.
- **Funcionalidades de admin limitadas** -- Algumas operacoes de administrador (gerenciamento em massa de voluntarios, configuracao detalhada) estao disponiveis apenas no aplicativo desktop. O aplicativo movel fornece visualizacoes somente leitura para a maioria das telas de administracao.
- **Sem chamadas WebRTC** -- Voluntarios no celular recebem chamadas no numero de telefone deles via provedor de telefonia, nao pelo navegador. Chamadas WebRTC no aplicativo sao exclusivas do desktop.
- **Bateria e conectividade** -- O aplicativo precisa de uma conexao persistente para receber atualizacoes em tempo real. O modo em segundo plano pode ser limitado pelo gerenciamento de energia do SO. Mantenha o aplicativo em primeiro plano durante os turnos para notificacoes confiaveis.

## Solucao de problemas do aplicativo movel

### Provisionamento falha com "Codigo QR invalido"

- Certifique-se de que o codigo QR foi gerado recentemente (tokens de provisionamento expiram apos 5 minutos)
- Gere um novo codigo QR no aplicativo desktop e tente novamente
- Certifique-se de que ambos os dispositivos estao conectados a internet

### Notificacoes push nao chegam

- Verifique se as notificacoes estao ativadas para o Llamenos nas configuracoes do dispositivo
- No Android: Va para **Configuracoes > Apps > Llamenos > Notificacoes** e ative todos os canais
- No iOS: Va para **Ajustes > Notificacoes > Llamenos** e ative **Permitir Notificacoes**
- Certifique-se de que voce nao esta no modo Nao Perturbe
- Verifique se seu turno esta ativo e voce nao esta em pausa

### Aplicativo trava ao abrir

- Certifique-se de que esta usando a versao mais recente do aplicativo
- Limpe o cache do aplicativo: **Configuracoes > Apps > Llamenos > Armazenamento > Limpar Cache**
- Se o problema persistir, desinstale e reinstale (voce precisara revincular o dispositivo)

### Nao consegue decifrar notas antigas apos reinstalacao

- Reinstalar o aplicativo remove o material de chave local
- Revincule o dispositivo via codigo QR pelo aplicativo desktop para restaurar o acesso
- Notas criptografadas antes da reinstalacao ficarao acessiveis assim que o dispositivo for revinculado com a mesma identidade

### Desempenho lento em dispositivos antigos

- Feche outros aplicativos para liberar memoria
- Desative animacoes nas configuracoes do aplicativo, se disponivel
- Considere usar o aplicativo desktop para operacoes pesadas como revisao em massa de notas
