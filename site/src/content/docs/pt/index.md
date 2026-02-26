---
title: Documentacao
description: Aprenda a implantar, configurar e usar o Llamenos.
guidesHeading: Guias
guides:
  - title: Primeiros passos
    description: Pre-requisitos, instalacao, configuracao de telefonia e primeira implantacao.
    href: /docs/getting-started
  - title: Guia do administrador
    description: Gerencie voluntarios, turnos, listas de bloqueio, campos personalizados e configuracoes.
    href: /docs/admin-guide
  - title: Guia do voluntario
    description: Faca login, receba chamadas, escreva notas e use a transcricao.
    href: /docs/volunteer-guide
  - title: Provedores de telefonia
    description: Compare os provedores de telefonia suportados e escolha o melhor para sua linha.
    href: /docs/telephony-providers
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
  - title: Modelo de seguranca
    description: Entenda o que esta criptografado, o que nao esta e o modelo de ameacas.
    href: /security
---

## Visao geral da arquitetura

Llamenos e uma aplicacao de pagina unica (SPA) baseada em Cloudflare Workers e Durable Objects. Nao ha servidores tradicionais para gerenciar.

| Componente | Tecnologia |
|---|---|
| Frontend | Vite + React + TanStack Router |
| Backend | Cloudflare Workers + Durable Objects |
| Telefonia | Twilio, SignalWire, Vonage, Plivo ou Asterisk (via interface TelephonyAdapter) |
| Autenticacao | Chaves Nostr (BIP-340 Schnorr) + WebAuthn |
| Criptografia | ECIES (secp256k1 + XChaCha20-Poly1305) |
| Transcricao | Whisper no lado do cliente (WASM) |
| i18n | i18next (12+ idiomas) |

## Funcoes

| Funcao | Pode ver | Pode fazer |
|---|---|---|
| **Chamador** | Nada (telefone GSM) | Ligar para o numero da linha |
| **Voluntario** | Apenas suas proprias notas | Atender chamadas, escrever notas durante o turno |
| **Administrador** | Todas as notas, registros de auditoria, dados de chamadas | Gerenciar voluntarios, turnos, bloqueios, configuracoes |
