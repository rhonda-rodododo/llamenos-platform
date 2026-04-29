---
title: Chamadas WebRTC no navegador
description: Ative o atendimento de chamadas no navegador para voluntarios usando WebRTC.
---

WebRTC (Web Real-Time Communication) permite que voluntarios atendam chamadas da linha diretamente no navegador, sem precisar de um telefone. Isso e util para voluntarios que preferem nao compartilhar seu numero de telefone ou que trabalham de um computador.

## Como funciona

1. O administrador ativa WebRTC nas configuracoes do provedor de telefonia
2. Os voluntarios definem sua preferencia de chamada para "Navegador" no perfil
3. Quando uma chamada chega, o aplicativo Llamenos toca no navegador com uma notificacao
4. O voluntario clica em "Atender" e a chamada se conecta pelo navegador usando o microfone

O audio da chamada e roteado do provedor de telefonia atraves de uma conexao WebRTC para o navegador do voluntario. A qualidade da chamada depende da conexao de internet do voluntario.

## Pre-requisitos

### Configuracao do administrador

- Um provedor de telefonia suportado com WebRTC ativado (Twilio, SignalWire, Vonage ou Plivo)
- Credenciais WebRTC especificas do provedor configuradas (veja os guias de configuracao dos provedores)
- WebRTC ativado em **Configuracoes** > **Provedor de telefonia**

### Requisitos dos voluntarios

- Um navegador moderno (Chrome, Firefox, Edge ou Safari 14.1+)
- Um microfone funcionando
- Uma conexao de internet estavel (minimo 100 kbps upload/download)
- Permissoes de notificacao do navegador concedidas

## Configuracao por provedor

Cada provedor de telefonia requer credenciais diferentes para WebRTC:

### Twilio / SignalWire

1. Crie uma **chave de API** no console do provedor
2. Crie um **aplicativo TwiML/LaML** com o Voice URL definido como `https://your-worker-url.com/telephony/webrtc-incoming`
3. No Llamenos, insira o API Key SID, API Key Secret e Application SID

### Vonage

1. Sua aplicacao Vonage ja inclui capacidade WebRTC
2. No Llamenos, cole a **chave privada** da sua aplicacao (formato PEM)
3. O Application ID ja esta configurado da configuracao inicial

### Plivo

1. Crie um **Endpoint** no console do Plivo em **Voice** > **Endpoints**
2. WebRTC usa seu Auth ID e Auth Token existentes
3. Ative WebRTC no Llamenos -- nenhuma credencial adicional necessaria

### Asterisk

WebRTC com Asterisk requer configuracao SIP.js com transporte WebSocket. Isso e mais complexo do que com provedores cloud:

1. Ative o transporte WebSocket no `http.conf` do Asterisk
2. Crie endpoints PJSIP para clientes WebRTC com DTLS-SRTP
3. O Llamenos configura automaticamente o cliente SIP.js quando Asterisk e selecionado

Consulte o [guia de configuracao do Asterisk](/docs/deploy/providers/asterisk) para todos os detalhes.

## Configuracao de preferencia de chamada dos voluntarios

Os voluntarios configuram sua preferencia de chamada no aplicativo:

1. Faca login no Llamenos
2. Va em **Configuracoes** (icone de engrenagem)
3. Em **Preferencias de chamada**, selecione **Navegador** em vez de **Telefone**
4. Conceda permissoes de microfone e notificacao quando solicitado
5. Mantenha a aba do Llamenos aberta durante seu turno

Quando uma chamada chega, voce vera uma notificacao do navegador e um indicador de toque no aplicativo. Clique em **Atender** para se conectar.

## Compatibilidade de navegadores

| Navegador | Desktop | Mobile | Observacoes |
|---|---|---|---|
| Chrome | Sim | Sim | Recomendado |
| Firefox | Sim | Sim | Suporte completo |
| Edge | Sim | Sim | Baseado em Chromium, suporte completo |
| Safari | Sim (14.1+) | Sim (14.1+) | Requer interacao do usuario para iniciar o audio |
| Brave | Sim | Limitado | Pode ser necessario desativar os escudos para o microfone |

## Dicas de qualidade de audio

- Use um headset ou fones de ouvido para evitar eco
- Feche outros aplicativos que usam o microfone
- Use uma conexao de internet com fio quando possivel
- Desative extensoes do navegador que podem interferir com WebRTC (extensoes VPN, bloqueadores de anuncios com protecao contra vazamento WebRTC)

## Solucao de problemas

### Sem audio

- **Verifique as permissoes do microfone**: Clique no icone do cadeado na barra de endereco e certifique-se de que o acesso ao microfone esta em "Permitir"
- **Teste seu microfone**: Use o teste de audio integrado do seu navegador ou um site como [webcamtest.com](https://webcamtest.com)
- **Verifique a saida de audio**: Certifique-se de que seus alto-falantes ou headset estao selecionados como dispositivo de saida

### Chamadas nao tocam no navegador

- **Notificacoes bloqueadas**: Verifique se as notificacoes do navegador estao habilitadas para o site Llamenos
- **Aba nao ativa**: A aba do Llamenos deve estar aberta (pode estar em segundo plano, mas a aba deve existir)
- **Preferencia de chamada**: Verifique se sua preferencia de chamada esta definida como "Navegador" nas Configuracoes
- **WebRTC nao configurado**: Peca ao seu administrador para verificar se o WebRTC esta ativado e as credenciais estao configuradas

### Problemas de firewall e NAT

WebRTC usa servidores STUN/TURN para atravessar firewalls e NAT. Se as chamadas conectam mas voce nao ouve audio:

- **Firewalls corporativos**: Alguns firewalls bloqueiam trafego UDP em portas nao padrao. Peca a sua equipe de TI para permitir trafego UDP nas portas 3478 e 10000-60000
- **NAT simetrico**: Alguns roteadores usam NAT simetrico que pode impedir conexoes diretas entre pares. Os servidores TURN do provedor de telefonia devem lidar com isso automaticamente
- **Interferencia de VPN**: VPNs podem interferir com conexoes WebRTC. Tente desconectar sua VPN durante os turnos

### Eco ou retorno

- Use fones de ouvido em vez de alto-falantes
- Reduza a sensibilidade do microfone nas configuracoes de audio do seu sistema operacional
- Ative o cancelamento de eco no seu navegador (geralmente ativado por padrao)
- Afaste-se de superficies duras e reflexivas
