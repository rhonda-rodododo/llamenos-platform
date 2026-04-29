---
title: Provedores de telefonia
description: Compare os provedores de telefonia suportados e escolha o melhor para sua linha.
---

O Llamenos suporta multiplos provedores de telefonia atraves de sua interface **TelephonyAdapter**. Voce pode trocar de provedor a qualquer momento pelas configuracoes de administracao sem alterar nenhum codigo do aplicativo.

## Provedores suportados

| Provedor | Tipo | Modelo de precos | Suporte WebRTC | Dificuldade de configuracao | Ideal para |
|---|---|---|---|---|---|
| **Twilio** | Cloud | Por minuto | Sim | Facil | Comecar rapidamente |
| **SignalWire** | Cloud | Por minuto (mais barato) | Sim | Facil | Organizacoes conscientes dos custos |
| **Vonage** | Cloud | Por minuto | Sim | Medio | Cobertura internacional |
| **Plivo** | Cloud | Por minuto | Sim | Medio | Opcao cloud economica |
| **Asterisk** | Auto-hospedado | Apenas custo do trunk SIP | Sim (SIP.js) | Dificil | Maxima privacidade, implantacao em larga escala |

## Comparacao de precos

Custos aproximados por minuto para chamadas de voz nos EUA (os precos variam por regiao e volume):

| Provedor | Entrada | Saida | Numero de telefone | Plano gratuito |
|---|---|---|---|---|
| Twilio | $0.0085 | $0.014 | $1.15/mes | Credito de teste |
| SignalWire | $0.005 | $0.009 | $1.00/mes | Credito de teste |
| Vonage | $0.0049 | $0.0139 | $1.00/mes | Credito gratuito |
| Plivo | $0.0055 | $0.010 | $0.80/mes | Credito de teste |
| Asterisk | Tarifa do trunk SIP | Tarifa do trunk SIP | Do provedor SIP | N/A |

Todos os provedores cloud cobram por minuto com granularidade por segundo. Os custos do Asterisk dependem do seu provedor de trunk SIP e da hospedagem do servidor.

## Matriz de funcionalidades

| Funcionalidade | Twilio | SignalWire | Vonage | Plivo | Asterisk |
|---|---|---|---|---|---|
| Gravacao de chamadas | Sim | Sim | Sim | Sim | Sim |
| Transcricao ao vivo | Sim | Sim | Sim | Sim | Sim (via bridge) |
| CAPTCHA por voz | Sim | Sim | Sim | Sim | Sim |
| Correio de voz | Sim | Sim | Sim | Sim | Sim |
| Chamadas WebRTC no navegador | Sim | Sim | Sim | Sim | Sim (SIP.js) |
| Validacao de webhooks | Sim | Sim | Sim | Sim | Personalizada (HMAC) |
| Toque simultaneo | Sim | Sim | Sim | Sim | Sim |
| Fila / musica de espera | Sim | Sim | Sim | Sim | Sim |

## Como configurar

1. Navegue ate **Configuracoes** na barra lateral de administracao
2. Abra a secao **Provedor de telefonia**
3. Selecione seu provedor no menu suspenso
4. Insira as credenciais necessarias (cada provedor tem campos diferentes)
5. Defina o numero de telefone da sua linha no formato E.164 (ex.: `+15551234567`)
6. Clique em **Salvar**
7. Configure os webhooks no console do seu provedor para apontar para sua instancia Llamenos

Consulte os guias de configuracao individuais para instrucoes passo a passo:

- [Configuracao: Twilio](/docs/deploy/providers/twilio)
- [Configuracao: SignalWire](/docs/deploy/providers/signalwire)
- [Configuracao: Vonage](/docs/deploy/providers/vonage)
- [Configuracao: Plivo](/docs/deploy/providers/plivo)
- [Configuracao: Asterisk (auto-hospedado)](/docs/deploy/providers/asterisk)
- [Chamadas WebRTC no navegador](/docs/deploy/providers/webrtc)
