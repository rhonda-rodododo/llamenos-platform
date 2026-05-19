---
title: Politica de Privacidade
subtitle: O que o Llamenos coleta, como e protegido e quais sao seus direitos como usuario.
---

**Data de vigencia: 18 de maio de 2026**

Llamenos e um software de resposta a crises de codigo aberto. Esta politica aplica-se ao aplicativo iOS do Llamenos e aos servicos de backend operados pelo seu administrador de hub. Nao se aplica a hubs operados por terceiros — cada administrador e responsavel por suas proprias praticas de dados.

---

## O Que Coletamos

### Dados de conta e identidade

- **Chave publica do dispositivo** — um identificador criptografico unico ao seu dispositivo. Nunca compartilhado fora do seu hub.
- **Token de notificacao push** — usado apenas para entregar alertas de chamadas. Rotacionado periodicamente.
- **Funcao e associacao ao hub** — a quais hubs voce pertence e sua funcao atribuida (voluntario, administrador).
- **Metadados do dispositivo** — modelo, versao do SO e versao do aplicativo.

### Dados de atividade

- **Metadados de chamadas** — timestamps, duracao das chamadas, qual voluntario atendeu. Nao o conteudo das chamadas.
- **Registros de turnos** — quais turnos voce estava escalado e se estava ativo.
- **Entradas de log de auditoria** — acoes tomadas no aplicativo. Visiveis apenas para administradores.
- **Eventos de seguranca** — registros de dispositivos, revogacoes, atividade de sessao e alteracoes de conta.

### Conteudo que voce cria — criptografado de ponta a ponta

- **Notas e transcricoes de chamadas** — notas escritas e transcricoes geradas pelo navegador.
- **Relatorios e registros de casos** — relatorios estruturados, campos personalizados, anexos e historico de casos.
- **Registros de contatos** — informacoes de contato do chamante, se registradas.
- **Mensagens** — mensagens de texto recebidas roteadas para o seu hub.

**O servidor armazena este conteudo apenas como texto cifrado.** Nao pode ser lido pelo operador do servidor, provedor de hospedagem ou Llamenos.

### Dados de transmissao/assinantes

Os numeros de telefone dos assinantes sao armazenados como identificadores com hash — nao como numeros de telefone em texto simples. Quando uma mensagem em massa e enviada, o servidor processa o conteudo em texto simples momentaneamente para entrega. O conteudo nao e armazenado apos a entrega.

### Dados de grupos de recuperacao

Se voce configurar um grupo de recuperacao, o servidor armazena fragmentos de partes criptografados (cada fragmento criptografado para o dispositivo de um detentor de parte especifico — o servidor nao pode le-los). O servidor nao pode reconstruir sua chave de recuperacao.

---

## Como Usamos os Dados

- **Para operar o aplicativo** — rotear chamadas, habilitar anotacoes, gerenciar turnos e relatorios.
- **Para seguranca** — detectar abusos, manter listas de bloqueio, limitar taxas.
- **Para auditoria** — fornecer aos administradores logs de auditoria de atividade do aplicativo (nao conteudo).
- **Para recuperacao** — armazenar fragmentos criptografados para que grupos de recuperacao possam ajudar usuarios.

Nao usamos seus dados para publicidade. Nao vendemos ou compartilhamos seus dados com terceiros para fins comerciais.

---

## Criptografia de Ponta a Ponta

Todo o conteudo de notas, transcricoes, relatorios, registros de contatos e mensagens de entrada e criptografado de ponta a ponta.

| Tipo de dado | O servidor pode ler? | Obtivel por ordem judicial |
|-------------|---------------------|--------------------------|
| Notas de chamadas | Nao | Apenas texto cifrado |
| Transcricoes | Nao | Apenas texto cifrado |
| Relatorios | Nao | Apenas texto cifrado |
| Registros de casos | Nao | Apenas texto cifrado |
| Mensagens de entrada | Nao | Apenas texto cifrado |
| Fragmentos de recuperacao | Nao | Apenas texto cifrado |
| Mensagens em massa de saida | **Sim, momentaneamente durante entrega** | Sim (texto simples ao enviar) |
| Metadados de chamadas | Sim | Sim |
| Sua chave publica do dispositivo | Sim | Sim |
| Eventos de seguranca | Sim | Sim |

---

## Retencao de Dados

### Conteudo que voce cria

Retido ate que voce ou um administrador o exclua explicitamente, ou seu hub seja encerrado.

### Mensagens em massa

O conteudo nao e armazenado apos a entrega. Apenas registros de status de entrega sao retidos.

### Metadados de chamadas e logs de auditoria

Retidos conforme a configuracao do seu administrador de hub.

### Fragmentos de recuperacao

Retidos ate que voce exclua a configuracao do grupo de recuperacao ou sua conta seja apagada.

### Tokens push

Removidos quando voce sai ou desinstala o aplicativo.

---

## Exclusao de Conta

Voce tem o direito de solicitar a exclusao permanente da sua conta.

### O que a exclusao faz

1. **Chaves destruidas primeiro**: As chaves de criptografia do seu dispositivo sao destruidas imediatamente.
2. **Registros de conta excluidos**: Seu registro de conta, registros de dispositivos, tokens push e atribuicoes de funcao sao removidos.
3. **Entradas de auditoria crypto-destruidas**: A chave de criptografia para suas entradas de log de auditoria e destruida.
4. **Conteudo cifrado re-envolvido**: Notas e relatorios que voce escreveu sao re-criptografados para os leitores autorizados restantes.

### Exclusao pelo usuario

Disponivel nas configuracoes da conta em todas as plataformas. Ha um atraso padrao (configurado pelo seu administrador de hub, minimo 24 horas, maximo 7 dias). Voce pode cancelar durante este periodo.

### Exclusao de emergencia

Um co-aprovador pode aprovar a exclusao de emergencia, reduzindo o atraso para um minimo de 4 horas.

---

## Servicos de Terceiros

Llamenos integra-se com provedores de telefonia para roteamento de chamadas.

**O que os provedores de telefonia recebem**: O numero de telefone do chamante, duracao e timestamps. Nao recebem notas, transcricoes ou qualquer conteudo criado no aplicativo.

**O que provedores de mensagens recebem para mensagens em massa**: Conteudo da mensagem (SMS, WhatsApp, RCS) — o provedor deve receber texto simples para entregar. Para transmissoes Signal, o conteudo e criptografado de ponta a ponta.

---

## Seus Direitos sob o RGPD

Llamenos e desenvolvido por uma organizacao com sede na UE. Se voce esta no Espaco Economico Europeu:

- **Direito de acesso** — solicitar uma copia dos dados pessoais mantidos sobre voce
- **Direito de retificacao** — corrigir dados imprecisos
- **Direito ao apagamento** — solicitar exclusao permanente da sua conta e todos os dados associados
- **Direito a portabilidade de dados** — receber seus dados em formato legivel por maquina
- **Direito de oposicao** — opor-se ao processamento baseado em interesses legitimos
- **Direito de restringir o processamento** — solicitar que o processamento seja limitado
- **Direito de retirar o consentimento** — retirar o consentimento a qualquer momento

Para exercer esses direitos, contate seu administrador de hub ou escreva para [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com).

---

## Privacidade de Criancas

Llamenos nao e direcionado a criancas menores de 13 anos, ou menores de 16 na UE.

---

## Alteracoes nesta Politica

Publicaremos quaisquer alteracoes nesta pagina e atualizaremos a data de vigencia.

---

## Contato

**Consultas de privacidade:** [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com)

**Relatorios de bugs e divulgacoes de seguranca:** [github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues)

Llamenos e codigo aberto: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
