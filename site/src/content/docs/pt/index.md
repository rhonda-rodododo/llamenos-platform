---
title: Documentacao
description: Aprenda a implantar, configurar e usar o Llamenos.
guidesHeading: Guias
guides:
  - title: Primeiros passos
    description: Pre-requisitos, instalacao, assistente de configuracao e primeira implantacao.
    href: /docs/getting-started
  - title: Auto-hospedagem
    description: Implante na sua propria infraestrutura com Docker Compose ou Kubernetes.
    href: /docs/self-hosting
  - title: "Implantar: Docker Compose"
    description: Implantacao auto-hospedada em servidor unico com HTTPS automatico.
    href: /docs/deploy-docker
  - title: "Implantar: Kubernetes (Helm)"
    description: Implante no Kubernetes com o chart oficial do Helm.
    href: /docs/deploy-kubernetes
  - title: Guia do administrador
    description: Gerencie voluntarios, turnos, canais, conversas, reportes, bloqueios e configuracoes.
    href: /docs/admin-guide
  - title: Guia do voluntario
    description: Faca login, receba chamadas, responda mensagens, escreva notas e use a transcricao.
    href: /docs/volunteer-guide
  - title: Guia do reportero
    description: Envie reportes criptografados e acompanhe seu status.
    href: /docs/reporter-guide
  - title: Guia do aplicativo movel
    description: Instale e configure o aplicativo movel Llamenos no iOS e Android.
    href: /docs/mobile-guide
  - title: Provedores de telefonia
    description: Compare os provedores de telefonia suportados e escolha o melhor para sua linha.
    href: /docs/telephony-providers
  - title: "Configuracao: SMS"
    description: Ative mensagens SMS de entrada e saida atraves do seu provedor de telefonia.
    href: /docs/setup-sms
  - title: "Configuracao: WhatsApp"
    description: Conecte o WhatsApp Business via a API Cloud da Meta.
    href: /docs/setup-whatsapp
  - title: "Configuracao: Signal"
    description: Configure o canal Signal atraves do bridge signal-cli.
    href: /docs/setup-signal
  - title: "Configuracao: Twilio"
    description: Guia passo a passo para configurar o Twilio como provedor de telefonia.
    href: /docs/setup-twilio
  - title: "Configuracao: SignalWire"
    description: Guia passo a passo para configurar o SignalWire como provedor de telefonia.
    href: /docs/setup-signalwire
  - title: "Configuracao: Vonage"
    description: Guia passo a passo para configurar o Vonage como provedor de telefonia.
    href: /docs/setup-vonage
  - title: "Configuracao: Plivo"
    description: Guia passo a passo para configurar o Plivo como provedor de telefonia.
    href: /docs/setup-plivo
  - title: "Configuracao: Asterisk (auto-hospedado)"
    description: Implante o Asterisk com o bridge ARI para maxima privacidade e controle.
    href: /docs/setup-asterisk
  - title: Chamadas WebRTC no navegador
    description: Ative o atendimento de chamadas no navegador para voluntarios usando WebRTC.
    href: /docs/webrtc-calling
  - title: Arquitetura
    description: Visao geral da arquitetura do sistema, fluxo de dados, criptografia e comunicacao em tempo real.
    href: /docs/architecture
  - title: Solucao de problemas
    description: Solucoes para problemas comuns com implantacao, apps, telefonia e criptografia.
    href: /docs/troubleshooting
  - title: Modelo de seguranca
    description: Entenda o que esta criptografado, o que nao esta e o modelo de ameacas.
    href: /security
---

## Visao geral da arquitetura

Llamenos e uma aplicacao de pagina unica (SPA) que pode ser executada no **Cloudflare Workers** ou na sua propria infraestrutura via **Docker Compose / Kubernetes**. Suporta chamadas de voz, SMS, WhatsApp e Signal -- tudo roteado para voluntarios em turno atraves de uma interface unificada.

| Componente | Cloudflare | Auto-hospedado |
|---|---|---|
| Frontend | Vite + React + TanStack Router | Igual |
| Backend | Cloudflare Workers + 6 Durable Objects | Node.js + PostgreSQL |
| Armazenamento | R2 | MinIO (compativel com S3) |
| Voz | Twilio, SignalWire, Vonage, Plivo ou Asterisk | Igual |
| Mensagens | SMS, WhatsApp Business, Signal | Igual |
| Autenticacao | Chaves Nostr (BIP-340 Schnorr) + WebAuthn | Igual |
| Criptografia | ECIES (secp256k1 + XChaCha20-Poly1305) | Igual |
| Transcricao | Whisper no lado do cliente (WASM) | Whisper no lado do cliente (WASM) |
| i18n | i18next (13 idiomas) | Igual |

## Funcoes

| Funcao | Pode ver | Pode fazer |
|---|---|---|
| **Chamador** | Nada (telefone/SMS/WhatsApp/Signal) | Ligar ou enviar mensagens para a linha |
| **Voluntario** | Suas proprias notas, conversas atribuidas | Atender chamadas, escrever notas, responder mensagens |
| **Reportero** | Apenas seus proprios reportes | Enviar reportes criptografados com anexos |
| **Administrador** | Todas as notas, reportes, conversas, logs de auditoria | Gerenciar voluntarios, turnos, canais, bloqueios, configuracoes |
