---
title: Seguranca e Privacidade
subtitle: O que esta protegido, o que e visivel e o que pode ser obtido sob intimacao judicial -- organizado pelas funcionalidades que voce utiliza.
---

## Se seu provedor de hospedagem receber uma intimacao

| Podem fornecer | NAO podem fornecer |
|----------------|---------------------|
| Metadados de chamadas/mensagens (horarios, duracoes) | Conteudo de notas, transcricoes, corpos de reportes |
| Blobs de banco de dados criptografados | Nomes de voluntarios (criptografia de ponta a ponta) |
| Quais voluntarios estavam ativos e quando | Registros do diretorio de contatos (criptografia de ponta a ponta) |
| | Conteudo de mensagens (criptografado na chegada, armazenado como texto cifrado) |
| | Chaves de decifracao (protegidas pelo seu PIN, sua conta de provedor de identidade e opcionalmente sua chave de seguranca de hardware) |
| | Chaves de criptografia por nota (efemeras — destruidas apos envolvimento) |
| | Seu segredo HMAC para reverter hashes de telefone |

**O servidor armazena dados que nao pode ler.** Metadados (quando, quanto tempo, quais contas) sao visiveis. Conteudo (o que foi dito, o que foi escrito, quem sao seus contatos) nao e.

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

**Transcricao**: A transcricao acontece inteiramente no seu navegador usando IA no dispositivo. **O audio nunca sai do seu dispositivo.** Apenas a transcricao criptografada e armazenada.

### Mensagens de texto

| Canal | Acesso do provedor | Armazenamento no servidor | Notas |
|-------|-------------------|--------------------------|-------|
| SMS | Seu provedor de telefonia le todas as mensagens | **Criptografado** | Provedor retem as mensagens originais |
| WhatsApp | A Meta le todas as mensagens | **Criptografado** | Provedor retem as mensagens originais |
| Signal | A rede Signal e E2EE, mas o bridge decifra na chegada | **Criptografado** | Melhor que SMS, nao e conhecimento zero |

**As mensagens sao criptografadas no momento em que chegam ao seu servidor.** O servidor armazena apenas texto cifrado. Seu provedor de telefonia ou mensagens pode ainda ter a mensagem original — isso e uma limitacao dessas plataformas, nao algo que possamos mudar.

**Intimacao ao provedor de mensagens**: O provedor de SMS tem o conteudo completo das mensagens. A Meta tem o conteudo do WhatsApp. Mensagens Signal sao E2EE ate o bridge, mas o bridge (rodando no seu servidor) decifra antes de re-criptografar para armazenamento. Em todos os casos, **seu servidor tem apenas texto cifrado** — o provedor de hospedagem nao pode ler o conteudo das mensagens.

### Notas, transcricoes e reportes

Todo conteudo escrito por voluntarios e criptografado de ponta a ponta:

- Cada nota usa uma **chave aleatoria unica** (sigilo futuro — comprometer uma nota nao compromete outras)
- As chaves sao envolvidas separadamente para o voluntario e cada administrador
- O servidor armazena apenas texto cifrado
- A decifracao acontece no navegador
- **Campos personalizados, conteudo de reportes e anexos de arquivo sao todos criptografados individualmente**

**Apreensao de dispositivo**: Sem seu PIN **e** acesso a sua conta de provedor de identidade, os atacantes obtem um blob criptografado que e computacionalmente impossivel de decifrar. Se voce tambem usa uma chave de seguranca de hardware, **tres fatores independentes** protegem seus dados.

---

## Privacidade do numero de telefone do voluntario

Quando voluntarios recebem chamadas em seus telefones pessoais, seus numeros ficam expostos ao provedor de telefonia.

| Cenario | Numero de telefone visivel para |
|---------|--------------------------------|
| Chamada PSTN para o telefone do voluntario | Provedor de telefonia, operadora |
| Navegador a navegador (WebRTC) | Ninguem (audio permanece no navegador) |
| Asterisk auto-hospedado + telefone SIP | Apenas seu servidor Asterisk |

**Para proteger numeros de telefone de voluntarios**: Use chamadas pelo navegador (WebRTC) ou forneca telefones SIP conectados a Asterisk auto-hospedado.

---

## Lancado recentemente

Estas melhorias estao disponiveis hoje:

| Funcionalidade | Beneficio de privacidade |
|----------------|--------------------------|
| Armazenamento criptografado de mensagens | Mensagens SMS, WhatsApp e Signal armazenadas como texto cifrado no seu servidor |
| Transcricao no dispositivo | Audio nunca sai do seu navegador — processado inteiramente no seu dispositivo |
| Protecao de chaves multifator | Suas chaves de criptografia sao protegidas pelo seu PIN, provedor de identidade e opcionalmente chave de seguranca de hardware |
| Chaves de seguranca de hardware | Chaves fisicas adicionam um terceiro fator que nao pode ser comprometido remotamente |
| Builds reproduziveis | Verificar que o codigo implantado corresponde ao fonte publico |
| Diretorio de contatos criptografado | Registros de contatos, relacionamentos e notas sao criptografados de ponta a ponta |

## Ainda planejado

| Funcionalidade | Beneficio de privacidade |
|----------------|--------------------------|
| Aplicativos nativos para receber chamadas | Numeros de telefone pessoais nao expostos |

---

## Tabela resumo

| Tipo de dado | Criptografado | Visivel ao servidor | Obtivel sob intimacao |
|--------------|---------------|--------------------|-----------------------|
| Notas de chamada | Sim (E2EE) | Nao | Apenas texto cifrado |
| Transcricoes | Sim (E2EE) | Nao | Apenas texto cifrado |
| Reportes | Sim (E2EE) | Nao | Apenas texto cifrado |
| Anexos de arquivo | Sim (E2EE) | Nao | Apenas texto cifrado |
| Registros de contatos | Sim (E2EE) | Nao | Apenas texto cifrado |
| Identidades de voluntarios | Sim (E2EE) | Nao | Apenas texto cifrado |
| Metadados de equipe/funcoes | Sim (criptografado) | Nao | Apenas texto cifrado |
| Definicoes de campos personalizados | Sim (criptografado) | Nao | Apenas texto cifrado |
| Conteudo SMS/WhatsApp/Signal | Sim (no seu servidor) | Nao | Texto cifrado do seu servidor; provedor pode ter original |
| Metadados de chamadas | Nao | Sim | Sim |
| Hashes de telefone de chamadores | HMAC hasheado | Apenas hash | Hash (nao reversivel sem seu segredo) |

---

## Para auditores de seguranca

Documentacao tecnica:

- [Especificacao do Protocolo](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/llamenos-protocol.md)
- [Modelo de Ameacas](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/THREAT_MODEL.md)
- [Classificacao de Dados](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Auditorias de Seguranca](https://github.com/rhonda-rodododo/llamenos-platform/tree/main/docs/security)
- [Documentacao API](/api/docs)

Llamenos e codigo aberto: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
