---
title: Arquitetura
description: Visao geral da arquitetura do sistema -- repositorios, fluxo de dados, camadas de criptografia e comunicacao em tempo real.
---

Esta pagina explica como o Llamenos esta estruturado, como os dados fluem pelo sistema e onde a criptografia e aplicada.

## Estrutura dos repositorios

O Llamenos e dividido em tres repositorios que compartilham um protocolo comum e um nucleo criptografico:

```
llamenos              llamenos-core           llamenos-mobile
(Desktop + API)       (Shared Crypto)         (Mobile App)
+--------------+      +--------------+        +--------------+
| Tauri v2     |      | Rust crate   |        | React Native |
| Vite + React |      | - Native lib |        | iOS + Android|
| CF Workers   |      | - WASM pkg   |        | UniFFI bind  |
| Durable Objs |      | - UniFFI     |        |              |
+--------------+      +--------------+        +--------------+
       |                  ^      ^                   |
       |  path dep        |      |    UniFFI         |
       +------------------+      +-------------------+
```

- **llamenos** -- O aplicativo desktop (Tauri v2 com webview Vite + React), o backend Cloudflare Worker e o backend Node.js auto-hospedado. Este e o repositorio principal.
- **llamenos-core** -- Um crate Rust compartilhado que implementa todas as operacoes criptograficas: criptografia de envelope ECIES, assinaturas Schnorr, derivacao de chaves PBKDF2, HKDF e XChaCha20-Poly1305. Compilado para codigo nativo (Tauri), WASM (navegador) e bindings UniFFI (mobile).
- **llamenos-mobile** -- O aplicativo movel React Native para iOS e Android. Usa bindings UniFFI para chamar o mesmo codigo Rust de criptografia.

Todas as tres plataformas implementam o mesmo protocolo de fio definido em `docs/protocol/PROTOCOL.md`.

## Fluxo de dados

### Chamada recebida

```
Chamador (telefone)
    |
    v
Provedor de Telefonia (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | HTTP webhook
    v
Worker API  -->  CallRouterDO
    |                |
    |                | Verifica ShiftManagerDO para voluntarios em turno
    |                | Inicia toque simultaneo para todos os voluntarios disponiveis
    |                v
    |           Provedor de Telefonia (chamadas de saida para telefones de voluntarios)
    |
    | Primeiro voluntario atende
    v
CallRouterDO  -->  Conecta chamador e voluntario
    |
    | Chamada encerrada
    v
Cliente (navegador/app do voluntario)
    |
    | Criptografa nota com chave por nota
    | Envolve chave via ECIES para si mesmo + cada admin
    v
Worker API  -->  RecordsDO  (armazena nota criptografada + chaves envolvidas)
```

### Mensagem recebida (SMS / WhatsApp / Signal)

```
Contato (SMS / WhatsApp / Signal)
    |
    | Webhook do provedor
    v
Worker API  -->  ConversationDO
    |                |
    |                | Criptografa conteudo da mensagem imediatamente
    |                | Envolve chave simetrica via ECIES para voluntario atribuido + admins
    |                | Descarta texto simples
    |                v
    |           Nostr relay (evento criptografado do hub notifica clientes online)
    |
    v
Cliente (navegador/app do voluntario)
    |
    | Decifra mensagem com chave privada propria
    | Compoe resposta, criptografa saida
    v
Worker API  -->  ConversationDO  -->  Provedor de Mensagens (envia resposta)
```

## Durable Objects

O backend usa seis Cloudflare Durable Objects (ou seus equivalentes PostgreSQL para implantacoes auto-hospedadas):

| Durable Object | Responsabilidade |
|---|---|
| **IdentityDO** | Gerencia identidades de voluntarios, chaves publicas, nomes de exibicao e credenciais WebAuthn. Lida com criacao e resgate de convites. |
| **SettingsDO** | Armazena configuracoes da linha: nome, canais ativos, credenciais de provedores, campos personalizados de notas, configuracoes anti-spam, flags de funcionalidades. |
| **RecordsDO** | Armazena notas de chamadas criptografadas, reportes criptografados e metadados de anexos. Lida com busca de notas (sobre metadados criptografados). |
| **ShiftManagerDO** | Gerencia agendas de turnos recorrentes, grupos de toque e atribuicoes de voluntarios a turnos. Determina quem esta em turno em qualquer momento. |
| **CallRouterDO** | Orquestra o roteamento de chamadas em tempo real: toque simultaneo, encerramento no primeiro atendimento, status de pausa, rastreamento de chamadas ativas. Gera respostas TwiML/provedor. |
| **ConversationDO** | Gerencia conversas com historico entre SMS, WhatsApp e Signal. Lida com criptografia de mensagens na ingestao, atribuicao de conversas e respostas de saida. |

Todos os DOs sao acessados como singletons via `idFromName()` e roteados internamente usando um `DORouter` leve (correspondencia de metodo + padrao de caminho).

## Matriz de criptografia

| Dado | Criptografado? | Algoritmo | Quem pode decifrar |
|---|---|---|---|
| Notas de chamada | Sim (E2EE) | XChaCha20-Poly1305 + envelope ECIES | Autor da nota + todos os admins |
| Campos personalizados de notas | Sim (E2EE) | Mesmo das notas | Autor da nota + todos os admins |
| Reportes | Sim (E2EE) | Mesmo das notas | Autor do reporte + todos os admins |
| Anexos de reportes | Sim (E2EE) | XChaCha20-Poly1305 (streaming) | Autor do reporte + todos os admins |
| Conteudo de mensagens | Sim (E2EE) | XChaCha20-Poly1305 + envelope ECIES | Voluntario atribuido + todos os admins |
| Transcricoes | Sim (em repouso) | XChaCha20-Poly1305 | Criador da transcricao + todos os admins |
| Eventos do hub (Nostr) | Sim (simetrico) | XChaCha20-Poly1305 com chave do hub | Todos os membros atuais do hub |
| nsec do voluntario | Sim (em repouso) | PBKDF2 + XChaCha20-Poly1305 (PIN) | Apenas o voluntario |
| Entradas de auditoria | Nao (integridade protegida) | Cadeia de hash SHA-256 | Admins (leitura), sistema (escrita) |
| Numeros de telefone de chamadores | Nao (apenas servidor) | N/A | Servidor + admins |
| Numeros de telefone de voluntarios | Armazenados no IdentityDO | N/A | Apenas admins |

### Sigilo futuro por nota

Cada nota ou mensagem recebe uma chave simetrica aleatoria unica. Essa chave e envolvida via ECIES (chave efemera secp256k1 + HKDF + XChaCha20-Poly1305) individualmente para cada leitor autorizado. Comprometer a chave de uma nota nao revela nada sobre outras notas. Nao existem chaves simetricas de longa duracao para criptografia de conteudo.

### Hierarquia de chaves

```
nsec do voluntario (BIP-340 Schnorr / secp256k1)
    |
    +-- Deriva npub (chave publica x-only, 32 bytes)
    |
    +-- Usada para acordo de chaves ECIES (prefixa 02 para formato comprimido)
    |
    +-- Assina eventos Nostr (assinatura Schnorr)

Chave do hub (32 bytes aleatorios, NAO derivada de nenhuma chave de identidade)
    |
    +-- Criptografa eventos Nostr do hub em tempo real
    |
    +-- Envolvida via ECIES por membro via LABEL_HUB_KEY_WRAP
    |
    +-- Rotacionada na saida de membro

Chave por nota (32 bytes aleatorios)
    |
    +-- Criptografa conteudo da nota via XChaCha20-Poly1305
    |
    +-- Envolvida via ECIES por leitor (voluntario + cada admin)
    |
    +-- Nunca reutilizada entre notas
```

## Comunicacao em tempo real

Atualizacoes em tempo real (novas chamadas, mensagens, mudancas de turno, presenca) fluem atraves de um relay Nostr:

- **Auto-hospedado**: relay strfry rodando ao lado do app em Docker/Kubernetes
- **Cloudflare**: Nosflare (relay baseado em Cloudflare Workers)

Todos os eventos sao efemeros (kind 20001) e criptografados com a chave do hub. Os eventos usam tags genericas (`["t", "llamenos:event"]`) para que o relay nao consiga distinguir tipos de evento. O campo de conteudo contem texto cifrado XChaCha20-Poly1305.

### Fluxo de eventos

```
Cliente A (acao do voluntario)
    |
    | Criptografa conteudo do evento com chave do hub
    | Assina como evento Nostr (Schnorr)
    v
Nostr relay (strfry / Nosflare)
    |
    | Transmite para assinantes
    v
Cliente B, C, D...
    |
    | Verifica assinatura Schnorr
    | Decifra conteudo com chave do hub
    v
Atualiza estado local da interface
```

O relay ve blobs criptografados e assinaturas validas, mas nao consegue ler o conteudo dos eventos ou determinar quais acoes estao sendo realizadas.

## Camadas de seguranca

### Camada de transporte

- Toda comunicacao cliente-servidor sobre HTTPS (TLS 1.3)
- Conexoes WebSocket ao relay Nostr sobre WSS
- Content Security Policy (CSP) restringe fontes de scripts, conexoes e ancestrais de frames
- Padrao de isolamento Tauri separa IPC da webview

### Camada de aplicacao

- Autenticacao via pares de chaves Nostr (assinaturas BIP-340 Schnorr)
- Tokens de sessao WebAuthn para conveniencia multi-dispositivo
- Controle de acesso baseado em funcoes (chamador, voluntario, reportero, admin)
- Todas as 25 constantes de separacao de dorustfs criptografico definidas em `crypto-labels.ts` previnem ataques entre protocolos

### Criptografia em repouso

- Notas de chamadas, reportes, mensagens e transcricoes criptografados antes do armazenamento
- Chaves secretas de voluntarios criptografadas com chaves derivadas de PIN (PBKDF2)
- Tauri Stronghold fornece armazenamento seguro criptografado no desktop
- Integridade do log de auditoria protegida via cadeia de hash SHA-256

### Verificacao de build

- Builds reproduziveis via `Dockerfile.build` com `SOURCE_DATE_EPOCH`
- Nomes de arquivos com hash de conteudo para ativos do frontend
- `CHECKSUMS.txt` publicado com GitHub Releases
- Atestacoes de proveniencia SLSA
- Script de verificacao: `scripts/verify-build.sh`

## Diferencas entre plataformas

| Recurso | Desktop (Tauri) | Mobile (React Native) | Navegador (Cloudflare) |
|---|---|---|---|
| Backend de criptografia | Rust nativo (via IPC) | Rust nativo (via UniFFI) | WASM (llamenos-core) |
| Armazenamento de chaves | Tauri Stronghold (criptografado) | Secure Enclave / Keystore | localStorage do navegador (criptografado com PIN) |
| Transcricao | Whisper no lado do cliente (WASM) | Nao disponivel | Whisper no lado do cliente (WASM) |
| Atualizacao automatica | Tauri updater | App Store / Play Store | Automatica (CF Workers) |
| Notificacoes push | Nativas do SO (Tauri notification) | Nativas do SO (FCM/APNS) | Notificacoes do navegador |
| Suporte offline | Limitado (precisa da API) | Limitado (precisa da API) | Limitado (precisa da API) |
