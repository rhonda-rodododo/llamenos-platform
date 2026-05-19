---
title: Seguranca e Privacidade
subtitle: O que esta protegido, o que e visivel e o que pode ser obtido sob intimacao judicial -- organizado pelas funcionalidades que voce utiliza.
---

## Se o seu provedor de hospedagem receber uma intimacao judicial

| Podem fornecer | NAO podem fornecer |
|----------------|---------------------|
| Metadados de chamadas/mensagens (horarios, duracoes) | Conteudo de notas, transcricoes, corpos de relatorios |
| Blobs cifrados do banco de dados | Nomes de voluntarios (cifrado ponta a ponta) |
| Quais contas de voluntarios estavam ativas e quando | Registros do diretorio de contatos (cifrado ponta a ponta) |
| Registros de entrega de mensagens em massa | Conteudo de mensagens (cifrado na chegada, armazenado como texto cifrado) |
| | Chaves de descriptografia (protegidas pelo PIN, pelo provedor de identidade e opcionalmente pela chave de seguranca de hardware) |
| | Chaves de cifracao por nota (efemeras -- destruidas apos o encapsulamento) |
| | Seu segredo HMAC para reverter hashes de telefone |
| | Conteudo dos fragmentos de recuperacao (cifrado, o servidor nao consegue ler) |

**O servidor armazena dados que nao consegue ler.** Metadados (quando, quanto tempo, quais contas) sao visiveis. Conteudo (o que foi dito, o que foi escrito, quem sao seus contatos) nao e.

---

## Por funcionalidade

Sua exposicao de privacidade depende dos canais que voce habilita:

### Chamadas de voz

| Se voce usa... | Terceiros podem acessar | Servidor pode acessar | Conteudo cifrado ponta a ponta |
|----------------|------------------------|----------------------|-------------------------------|
| Twilio/SignalWire/Vonage/Plivo | Audio de chamada (ao vivo), registros | Metadados de chamada | Notas, transcricoes |
| Asterisk auto-hospedado | Nada (voce controla) | Metadados de chamada | Notas, transcricoes |
| Navegador para navegador (WebRTC) | Nada | Metadados de chamada | Notas, transcricoes |

**Intimacao ao provedor de telefonia**: Eles tem registros de chamadas (horarios, numeros, duracoes). NAO tem notas ou transcricoes. A gravacao esta desabilitada por padrao.

**Transcricao**: A transcricao acontece completamente no seu navegador usando IA local. **O audio nunca sai do seu dispositivo.**

### Mensagens de texto (um para um)

| Canal | Acesso do provedor | Armazenamento no servidor | Notas |
|-------|-------------------|--------------------------|-------|
| SMS | Seu provedor de telefonia le todas as mensagens | **Cifrado** | O provedor retem as mensagens originais |
| WhatsApp | Meta le todas as mensagens | **Cifrado** | O provedor retem as mensagens originais |
| Signal | Rede Signal e E2EE; bridge re-cifra na chegada | **Cifrado** | Rota preferida quando disponivel |

**Roteamento priorizando Signal**: Quando um destinatario tem Signal, as mensagens sao roteadas automaticamente pelo Signal. Para SMS, apenas uma notificacao generica e enviada por padrao (sem corpo da mensagem).

**As mensagens sao cifradas no momento em que chegam ao seu servidor.** O servidor armazena apenas texto cifrado.

### Mensagens em massa e difusao

Administradores podem enviar mensagens em massa para assinantes via SMS, WhatsApp, Signal ou RCS.

**Importante: mensagens em massa enviadas NAO sao cifradas ponta a ponta no servidor.** Para entregar uma mensagem a assinantes de SMS ou WhatsApp, o servidor deve processar o conteudo em texto simples momentaneamente e repassa-lo ao provedor de mensagens.

| Canal | Acesso do servidor ao enviar | Acesso do provedor | Apos entrega |
|-------|-----------------------------|--------------------|--------------|
| SMS em massa | Texto simples (momentaneo, para entrega) | Conteudo completo | Provedor retem |
| WhatsApp em massa | Texto simples (momentaneo, para entrega) | Conteudo completo (Meta) | Provedor retem |
| Signal em massa | Texto simples (momentaneo, para entrega) | Cifrado E2EE via rede Signal | Nao retido pelo provedor |
| RCS em massa | Texto simples (momentaneo, para entrega) | Google pode ver conteudo | Provedor retem |

**O que isso significa**: Mensagens em massa nao devem conter informacoes sensiveis de chamantes. Use-as para anuncios e avisos -- nao para detalhes de casos.

Os numeros de telefone dos assinantes sao armazenados como identificadores com hash -- seu banco de dados nunca contem uma lista de assinantes em texto simples.

### Notas, transcricoes e relatorios

Todo conteudo escrito por voluntarios e cifrado ponta a ponta:

- Cada nota usa uma **chave aleatoria unica** (sigilo futuro -- comprometer uma nota nao compromete outras)
- Chaves sao encapsuladas separadamente para o voluntario e cada administrador
- O servidor armazena apenas texto cifrado
- A descriptografia acontece no seu dispositivo, em uma camada segura que nunca expoe chaves a interface do usuario
- **Campos personalizados, conteudo de relatorios e anexos sao todos cifrados individualmente**

**Registros de casos e dados de entidades**: Seguem o mesmo modelo de cifracao -- cada item cifrado com uma chave unica.

**Apreensao de dispositivo**: Sem seu PIN **e** acesso a sua conta de provedor de identidade, atacantes obtem um blob cifrado protegido por Argon2id. Com uma chave de seguranca de hardware, **tres fatores independentes** protegem seus dados.

---

## Seus dispositivos

### Visualizar e revogar dispositivos

O aplicativo mantem uma lista de cada dispositivo que voce usou para fazer login. Voce pode visualizar esta lista e revogar qualquer dispositivo que nao reconhecer.

**Ao revogar um dispositivo:**
- Esse dispositivo e imediatamente bloqueado de acessar sua conta
- Suas chaves de cifracao sao rotacionadas para que o dispositivo revogado nao possa descriptografar conteudo futuro
- A revogacao e registrada no historico de seguranca da sua conta

### Verificacao de emoji SAS

Para organizacoes com altas necessidades de seguranca, administradores podem verificar a identidade de um dispositivo usando verificacao SAS (String de Autenticacao Curta) -- exibida como uma sequencia de 7 emoji.

**Como funciona:**
1. O administrador e o proprietario do dispositivo comparam suas sequencias de emoji (pessoalmente, por telefone ou via canal confavel)
2. Se os emoji coincidirem, o dispositivo e confirmado como pertencente ao seu proprietario registrado
3. A verificacao e registrada -- administradores podem ver quais dispositivos foram verificados

Isso protege contra um atacante que registrou um dispositivo falso na conta de outra pessoa.

---

## Exclusao de conta

### Exclusao pelo proprio usuario

Voce pode solicitar que sua conta e todos os dados associados sejam permanentemente excluidos. Por padrao ha um atraso (configurado pelo seu administrador de hub, tipicamente 72 horas) antes que a exclusao seja concluida -- isso lhe da tempo para cancelar se a solicitacao foi feita sob coercao.

**O que e excluido:**
- Suas chaves de dispositivo (tornando todo conteudo cifrado permanentemente ilegivel, mesmo de backups)
- Seu registro de conta, atribuicoes de funcao e historico de turnos
- Seus tokens de notificacao push

**O que acontece com o conteudo cifrado que voce criou**: Notas e relatorios que voce escreveu sao re-cifrados para os leitores autorizados restantes. Sua copia da chave de descriptografia e destruida.

**Logs de auditoria**: Suas entradas de log de auditoria sao "crypto-destruidas" -- a chave de cifracao por usuario e destruida, tornando suas entradas ilegveis. A cadeia de hash permanece intacta.

### Exclusao de emergencia

Se voce acredita que sua conta esta sob ameaca imediata, pode solicitar exclusao de emergencia com um co-aprovador -- reduz o atraso para um minimo de 4 horas. O minimo de 4 horas existe para protecao contra exclusao coercitiva.

---

## Grupos de recuperacao

Se voce perder todos os seus dispositivos, normalmente perderia acesso a todos os seus dados cifrados. Os grupos de recuperacao resolvem isso.

### Como funciona a recuperacao

Voce designa um grupo de contatos confiaveis (tipicamente 3-5 pessoas) como seu grupo de recuperacao. Cada contato mantem um "fragmento" de uma chave de recuperacao.

**Para recuperar sua conta:**
1. Voce registra um novo dispositivo e inicia uma solicitacao de recuperacao
2. Seus contatos de recuperacao recebem uma notificacao
3. Apos um atraso configuravel, um numero limite de contatos (ex: 2 de 3) aprova a solicitacao
4. Cada contato aprovador envia seu fragmento, cifrado diretamente para o seu novo dispositivo
5. Seu novo dispositivo combina os fragmentos para reconstruir a chave de recuperacao

**O que o servidor pode ver**: O servidor retransmite fragmentos cifrados entre dispositivos. Nao consegue ler os fragmentos nem reconstruir a chave de recuperacao por conta propria.

### Propriedades de seguranca dos grupos de recuperacao

- **Seguranca por limite**: Fragmentos abaixo do limite nao revelam nada sobre o segredo
- **Sem participacao do servidor no segredo**: Fragmentos sao cifrados diretamente para a chave publica do seu novo dispositivo
- **Escopo por hub**: A recuperacao restaura seu acesso a um hub especifico
- **Atraso com cancelamento**: Voce pode cancelar uma solicitacao de recuperacao durante o periodo de atraso
- **Verificacao por Signal**: Solicitacoes de recuperacao sao verificadas via Signal

---

## Privacidade do numero de telefone do voluntario

Quando voluntarios recebem chamadas em seus telefones pessoais, seus numeros ficam expostos ao seu provedor de telefonia.

| Cenario | Numero de telefone visivel para |
|---------|--------------------------------|
| Chamada PSTN para telefone do voluntario | Provedor de telefonia, operadora |
| Navegador para navegador (WebRTC) | Ninguem (audio fica no navegador) |
| Asterisk auto-hospedado + telefone SIP | Apenas seu servidor Asterisk |

**Para proteger numeros de telefone de voluntarios**: Use chamadas baseadas em navegador (WebRTC) ou forneca telefones SIP conectados ao Asterisk auto-hospedado.

---

## Enviado recentemente

Estas melhorias estao disponiveis hoje:

| Funcionalidade | Beneficio de privacidade |
|----------------|-------------------------|
| Gerenciamento de dispositivos | Visualize e revogue qualquer dispositivo com sessao ativa; revogacao aciona rotacao de chaves |
| Verificacao de emoji SAS | Administradores podem verificar dispositivos pessoalmente usando impressao digital criptografica de 7 emoji |
| Exclusao de conta com atraso | Solicite exclusao; atraso configuravel permite cancelar se foi coercitiva |
| Exclusao de emergencia | Exclusao rapida co-aprovada com minimo de 4 horas |
| Crypto-destruicao na exclusao | Chaves de cifracao destruidas primeiro, tornando o conteudo permanentemente ilegivel |
| Grupos de recuperacao (Shamir) | Designe contatos confiaveis que podem ajudar a recuperar se voce perder todos os dispositivos |
| Mensagens em massa com divulgacao honesta | Administradores podem enviar mensagens em massa; servidor processa texto simples momentaneamente para entrega |
| Hash de assinantes | Numeros de telefone de assinantes armazenados como identificadores com hash |
| Protecao de chaves Argon2id | Chaves do dispositivo protegidas por funcao resistente a memoria |
| Roteamento priorizando Signal | Mensagens roteadas automaticamente pelo Signal quando disponivel |
| Modo SMS apenas notificacao | Destinatarios SMS veem apenas "voce tem uma nova mensagem" |
| Resistencia a analise de trafego | Tamanhos de eventos sao preenchidos para dificultar distincao |
| Sem numeros de telefone em texto simples | Numeros de chamantes armazenados como hashes irreversiveis |
| Cifracao por hub com sigilo futuro | Chaves rotacionadas a cada 24 horas |
| Criptografia em Rust em todas as plataformas | Mesma biblioteca criptografica auditada em desktop, iOS e Android |
| Acesso restrito ao relay | Relay WebSocket aceita eventos apenas do seu servidor |
| Armazenamento cifrado de mensagens | SMS, WhatsApp e Signal armazenados como texto cifrado |
| Transcricao no dispositivo | Audio nunca sai do seu dispositivo |
| Protecao de chaves multifator | PIN, provedor de identidade e opcionalmente chave de seguranca de hardware |
| Chaves de seguranca de hardware | Terceiro fator que nao pode ser comprometido remotamente |
| Builds reproduziveis | Verifique que o codigo implantado corresponde ao codigo-fonte publico |
| Diretorio de contatos cifrado | Registros, relacionamentos e notas cifrados ponta a ponta |

## Ainda planejado

| Funcionalidade | Beneficio de privacidade | Status |
|----------------|-------------------------|--------|
| Apps nativos para receber chamadas | Sem exposicao de numeros de telefone pessoais | Em desenvolvimento |
| Pinagem de certificado (mobile) | Defesa contra interceptacao TLS por CA fraudulenta | Estrutura completa; pins pendentes |
| Cifracao de midia de voz SFrame | Chamadas de voz cifradas ponta a ponta | Derivacao de chaves completa; cifracao por quadro planejada |

---

## Tabela de resumo

| Tipo de dado | Cifrado | Visivel ao servidor | Obtivel por ordem judicial |
|--------------|---------|--------------------|-----------------------------|
| Notas de chamadas | Sim (ponta a ponta) | Nao | Apenas texto cifrado |
| Transcricoes | Sim (ponta a ponta) | Nao | Apenas texto cifrado |
| Relatorios | Sim (ponta a ponta) | Nao | Apenas texto cifrado |
| Registros de casos / dados de entidades | Sim (ponta a ponta) | Nao | Apenas texto cifrado |
| Anexos | Sim (ponta a ponta) | Nao | Apenas texto cifrado |
| Registros de contatos | Sim (ponta a ponta) | Nao | Apenas texto cifrado |
| Identidades de voluntarios | Sim (ponta a ponta) | Nao | Apenas texto cifrado |
| Metadados de equipe/funcoes | Sim (cifrado) | Nao | Apenas texto cifrado |
| Definicoes de campos personalizados | Sim (cifrado) | Nao | Apenas texto cifrado |
| Conteudo SMS/WhatsApp/Signal de entrada | Sim (no seu servidor) | Nao | Texto cifrado do servidor; provedor pode ter original |
| Mensagens em massa de saida | **Nao -- texto simples durante entrega** | **Sim, momentaneamente** | Sim (texto simples no momento do envio) |
| Fragmentos de recuperacao | Sim (ponta a ponta ao dispositivo) | Nao | Apenas texto cifrado |
| Eventos em tempo real | Sim (por hub, chaves rotativas) | Nao | Apenas texto cifrado |
| Metadados de chamadas | Nao | Sim | Sim |
| Registros de entrega em massa | Nao | Sim | Sim |
| Hashes de telefones de chamantes | Hash HMAC | Apenas hash | Hash (nao reversivel sem seu segredo) |
| Hashes de telefones de assinantes | Hash HMAC | Apenas hash | Hash (nao reversivel sem seu segredo) |
| Strings de User-Agent | Hash SHA-256 | Apenas hash | Hash (nao reversivel) |

---

## Para auditores de seguranca

Documentacao tecnica:

- [Especificacao do Protocolo](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/PROTOCOL.md)
- [Modelo de Ameacas](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/THREAT_MODEL.md)
- [Classificacao de Dados](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Lacunas de Seguranca e Roadmap](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/SECURITY_GAPS_AND_ROADMAP.md)
- [Auditorias de Seguranca](https://github.com/rhonda-rodododo/llamenos-platform/tree/main/docs/security)
- [Documentacao da API](/api/docs)

Llamenos e codigo aberto: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
