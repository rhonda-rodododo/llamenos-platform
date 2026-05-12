---
title: Guia do voluntario
description: Tudo o que voce precisa saber como voluntario -- login, recebimento de chamadas, redacao de notas e uso da transcricao.
---

Este guia abrange tudo o que voce precisa saber como voluntario: login, recebimento de chamadas, redacao de notas e uso do recurso de transcricao.

## Obtendo suas credenciais

Seu administrador fornecera um dos seguintes:

- Um **nsec** (chave secreta WebSocket) -- uma string que comeca com `nsec1`
- Um **link de convite** -- uma URL de uso unico que gera suas credenciais

**Mantenha seu nsec privado.** Ele e sua identidade e credencial de login. Qualquer pessoa com seu nsec pode se passar por voce. Armazene-o em um gerenciador de senhas.

## Login

1. Abra o aplicativo da linha de ajuda no seu navegador
2. Cole seu `nsec` no campo de login
3. O aplicativo verifica sua identidade criptograficamente -- sua chave secreta nunca sai do seu navegador

Apos o primeiro login, voce sera solicitado a definir seu nome de exibicao e idioma preferido.

### Login por chave de acesso (opcional)

Se seu administrador habilitou chaves de acesso, voce pode registrar uma chave de hardware ou biometrica em **Configuracoes**. Isso permite que voce faca login em outros dispositivos sem digitar seu nsec.

## O painel

Apos o login, voce vera o painel com:

- **Chamadas ativas** -- chamadas sendo atendidas no momento
- **Status do seu turno** -- exibido na barra lateral (turno atual ou proximo turno)
- **Voluntarios online** -- contagem de quem esta disponivel

## Recebendo chamadas

Quando uma chamada chega durante seu turno, voce sera notificado por:

- Um **toque** no navegador (alternavel nas Configuracoes)
- Uma **notificacao push** se voce concedeu permissao
- Um **titulo de aba piscando**

Clique em **Atender** para pegar a chamada. Seu telefone tocara -- atenda para se conectar com o chamador. Se outro voluntario atender primeiro, o toque para.

## Durante uma chamada

Durante uma chamada, voce vera:

- Um **cronometro de chamada** mostrando a duracao
- Um **painel de notas** onde voce pode escrever notas em tempo real
- Um botao **Reportar spam** para sinalizar o chamador

As notas sao salvas automaticamente como rascunhos criptografados. Voce tambem pode salvar a nota manualmente.

## Escrevendo notas

As notas sao criptografadas no seu navegador antes de serem enviadas ao servidor. Somente voce e o administrador podem le-las.

Se seu administrador configurou campos personalizados (texto, menu suspenso, caixa de selecao, etc.), eles aparecerao no formulario de notas. Preencha-os conforme relevante -- eles sao criptografados junto com o texto da sua nota.

Navegue ate **Notas** na barra lateral para revisar, editar ou pesquisar suas notas anteriores. Voce pode exportar suas notas como um arquivo criptografado.

## Transcricao

Se a transcricao estiver habilitada (pelo administrador e pela sua propria preferencia), as chamadas sao transcritas automaticamente apos seu termino. A transcricao aparece ao lado da sua nota para aquela chamada.

Voce pode ativar ou desativar a transcricao em **Configuracoes**. Quando desativada, suas chamadas nao serao transcritas independentemente da configuracao global do administrador.

As transcricoes sao criptografadas em repouso -- o servidor processa o audio temporariamente e entao criptografa o texto resultante.

## Fazendo uma pausa

Ative o interruptor de **pausa** na barra lateral para pausar chamadas recebidas sem sair do seu turno. As chamadas nao tocarao no seu telefone enquanto voce estiver em pausa. Desative-o quando estiver pronto.

## Dicas

- Use <kbd>Ctrl</kbd>+<kbd>K</kbd> (ou <kbd>Cmd</kbd>+<kbd>K</kbd> no Mac) para abrir a paleta de comandos para navegacao rapida
- Pressione <kbd>?</kbd> para ver todos os atalhos de teclado
- Instale o aplicativo como PWA para uma experiencia de aplicativo nativo e melhores notificacoes
- Mantenha a aba do navegador aberta durante seu turno para alertas de chamada em tempo real
