---
title: Seguranca e Privacidade
subtitle: O que esta protegido, o que e visivel e o que pode ser obtido sob intimacao judicial -- organizado pelas funcionalidades que voce utiliza.
---

## Se seu provedor de hospedagem receber uma intimacao

| Podem fornecer | NAO podem fornecer |
|----------------|---------------------|
| Metadados de chamadas/mensagens (horarios, duracoes) | Conteudo de notas, transcricoes, corpos de reportes |
| Blobs de banco de dados criptografados | Chaves de decifracao (armazenadas nos seus dispositivos) |
| Quais voluntarios estavam ativos e quando | Chaves de criptografia por nota (efemeras) |
| Conteudo de mensagens SMS/WhatsApp | Seu segredo HMAC para reverter hashes de telefone |

**O servidor armazena dados que nao pode ler.** Metadados (quando, quanto tempo, quem) sao visiveis. Conteudo (o que foi dito, o que foi escrito) nao e.

---

## Por funcionalidade

Sua exposicao de privacidade depende de quais canais voce ativa:

### Chamadas de voz

| Se voce usar... | Terceiros podem acessar | Servidor pode acessar | Conteudo E2EE |
|-----------------|------------------------|----------------------|---------------|
| Twilio/SignalWire/Vonage/Plivo | Audio da chamada (ao vivo), registros | Metadados da chamada | Notas, transcricoes |
| Asterisk auto-hospedado | Nada (voce controla) | Metadados da chamada | Notas, transcricoes |
| Navegador a navegador (WebRTC) | Nada | Metadados da chamada | Notas, transcricoes |

**Intimacao ao provedor de telefonia**: Eles tem registros detalhados de chamadas (horarios, numeros de telefone, duracoes). Eles NAO tem notas de chamadas ou transcricoes. A gravacao esta desativada por padrao.

**Janela de transcricao**: Durante os ~30 segundos de transcricao, o audio e processado pelo Cloudflare Workers AI. Apos a transcricao, apenas texto criptografado e armazenado.

### Mensagens de texto

| Canal | Acesso do provedor | Armazenamento no servidor | Notas |
|-------|-------------------|--------------------------|-------|
| SMS | Seu provedor de telefonia le todas as mensagens | Texto simples | Limitacao inerente do SMS |
| WhatsApp | A Meta le todas as mensagens | Texto simples | Requisito da API WhatsApp Business |
| Signal | A rede Signal e E2EE, mas o bridge signal-cli decifra | Texto simples | Melhor que SMS, nao e conhecimento zero |

**Intimacao ao provedor de mensagens**: O provedor de SMS tem o conteudo completo das mensagens. A Meta tem o conteudo do WhatsApp. Mensagens Signal sao E2EE ate o bridge, mas o bridge (rodando no seu servidor) tem texto simples.

**Melhoria futura**: Estamos explorando armazenamento E2EE de mensagens onde o servidor armazena apenas texto cifrado. Veja [o que esta planejado](#o-que-esta-planejado).

### Notas, transcricoes e reportes

Todo conteudo escrito por voluntarios e criptografado de ponta a ponta:

- Cada nota usa uma chave aleatoria unica (sigilo futuro)
- As chaves sao envolvidas separadamente para o voluntario e o administrador
- O servidor armazena apenas texto cifrado
- A decifracao acontece no navegador

**Apreensao de dispositivo**: Sem seu PIN, os atacantes obtem um blob criptografado. Um PIN de 6 digitos com 600K iteracoes PBKDF2 leva horas para quebrar por forca bruta em hardware GPU.

---

## Privacidade do numero de telefone do voluntario

Quando voluntarios recebem chamadas em seus telefones pessoais, seus numeros ficam expostos ao provedor de telefonia.

| Cenario | Numero de telefone visivel para |
|---------|--------------------------------|
| Chamada PSTN para o telefone do voluntario | Provedor de telefonia, operadora |
| Navegador a navegador (WebRTC) | Ninguem (audio permanece no navegador) |
| Asterisk auto-hospedado + telefone SIP | Apenas seu servidor Asterisk |

**Para proteger numeros de telefone de voluntarios**: Use chamadas pelo navegador (WebRTC) ou forneca telefones SIP conectados a Asterisk auto-hospedado.

**Melhoria futura**: Aplicativos nativos de desktop e movel para receber chamadas sem expor numeros de telefone pessoais.

---

## O que esta planejado

Estamos trabalhando em melhorias para reduzir requisitos de confianca:

| Funcionalidade | Status | Beneficio de privacidade |
|----------------|--------|--------------------------|
| Armazenamento E2EE de mensagens | Planejado | SMS/WhatsApp/Signal armazenados como texto cifrado |
| Transcricao no lado do cliente | Planejado | Audio nunca sai do navegador |
| Aplicativos nativos para receber chamadas | Planejado | Numeros de telefone pessoais nao expostos |
| Builds reproduziveis | Planejado | Verificar que o codigo implantado corresponde ao fonte |
| Bridge Signal auto-hospedado | Disponivel | Executar signal-cli na sua propria infraestrutura |

---

## Tabela resumo

| Tipo de dado | Criptografado | Visivel ao servidor | Obtivel sob intimacao |
|--------------|---------------|--------------------|-----------------------|
| Notas de chamada | Sim (E2EE) | Nao | Apenas texto cifrado |
| Transcricoes | Sim (E2EE) | Nao | Apenas texto cifrado |
| Reportes | Sim (E2EE) | Nao | Apenas texto cifrado |
| Anexos de arquivo | Sim (E2EE) | Nao | Apenas texto cifrado |
| Metadados de chamadas | Nao | Sim | Sim |
| Identidades de voluntarios | Criptografado em repouso | Apenas admin | Sim (com esforco) |
| Hashes de telefone de chamadores | HMAC hasheado | Apenas hash | Hash (nao reversivel sem seu segredo) |
| Conteudo SMS | Nao | Sim | Sim |
| Conteudo WhatsApp | Nao | Sim | Sim (tambem da Meta) |
| Conteudo Signal | Nao | Sim | Sim (do seu servidor) |

---

## Para auditores de seguranca

Documentacao tecnica:

- [Especificacao do Protocolo](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/protocol/llamenos-protocol.md)
- [Modelo de Ameacas](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/THREAT_MODEL.md)
- [Classificacao de Dados](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Auditorias de Seguranca](https://github.com/rhonda-rodododo/llamenos/tree/main/docs/security)

Llamenos e codigo aberto: [github.com/rhonda-rodododo/llamenos](https://github.com/rhonda-rodododo/llamenos)
