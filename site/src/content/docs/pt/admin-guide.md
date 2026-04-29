---
title: Guia do administrador
description: Gerencie tudo -- voluntarios, turnos, configuracoes de chamadas, listas de bloqueio e campos personalizados.
---

Como administrador, voce gerencia tudo: voluntarios, turnos, configuracoes de chamadas, listas de bloqueio e campos personalizados. Este guia abrange os principais fluxos de trabalho de administracao.

## Login

Faca login com o `nsec` (chave secreta Nostr) gerado durante a [configuracao](/docs/deploy). A pagina de login aceita o formato nsec (`nsec1...`). Seu navegador assina um desafio com a chave -- o segredo nunca sai do dispositivo.

Opcionalmente, registre uma chave de acesso WebAuthn nas Configuracoes para login sem senha em dispositivos adicionais.

## Gerenciar voluntarios

Navegue ate **Voluntarios** na barra lateral para:

- **Adicionar um voluntario** -- gera um novo par de chaves Nostr. Compartilhe o nsec de forma segura com o voluntario (ele e exibido apenas uma vez).
- **Criar um link de convite** -- gera um link de uso unico que um voluntario pode usar para se registrar.
- **Editar** -- atualizar nome, numero de telefone e funcao.
- **Remover** -- desativar o acesso de um voluntario.

Os numeros de telefone dos voluntarios sao visiveis apenas para administradores. Eles sao usados para toque simultaneo quando o voluntario esta em servico.

## Configurar turnos

Navegue ate **Turnos** para criar horarios recorrentes:

1. Clique em **Adicionar turno**
2. Defina um nome, selecione os dias da semana e defina os horarios de inicio/fim
3. Atribua voluntarios usando o seletor multiplo com busca
4. Salve -- o sistema encaminhara automaticamente as chamadas para os voluntarios do turno ativo

Configure um **Grupo de reserva** na parte inferior da pagina de turnos. Esses voluntarios serao chamados quando nenhum turno agendado estiver ativo.

## Listas de bloqueio

Navegue ate **Bloqueios** para gerenciar numeros de telefone bloqueados:

- **Entrada individual** -- digite um numero de telefone no formato E.164 (ex.: +15551234567)
- **Importacao em massa** -- cole varios numeros, um por linha
- **Remover** -- desbloquear um numero instantaneamente

Os bloqueios entram em vigor imediatamente. Chamadores bloqueados ouvem uma mensagem de rejeicao e sao desconectados.

## Configuracoes de chamada

Em **Configuracoes**, voce encontrara varias secoes:

### Mitigacao de spam

- **CAPTCHA por voz** -- ativar/desativar. Quando ativado, os chamadores devem digitar um codigo aleatorio de 4 digitos.
- **Limitacao de taxa** -- ativar/desativar. Limita chamadas por numero de telefone dentro de uma janela de tempo deslizante.

### Transcricao

- **Interruptor global** -- ativar/desativar a transcricao Whisper para todas as chamadas.
- Voluntarios individuais tambem podem desativar nas suas proprias configuracoes.

### Configuracoes de chamada

- **Tempo limite da fila** -- quanto tempo os chamadores esperam antes de serem direcionados ao correio de voz (30-300 segundos).
- **Duracao maxima do correio de voz** -- duracao maxima da gravacao (30-300 segundos).

### Campos de nota personalizados

Defina campos estruturados que aparecem no formulario de anotacoes:

- Tipos suportados: texto, numero, selecao (menu suspenso), caixa de selecao, area de texto
- Configure validacao: obrigatorio, comprimento min/max, valor min/max
- Controle a visibilidade: escolha quais campos os voluntarios podem ver e editar
- Reordene os campos usando as setas para cima/baixo
- Maximo de 20 campos, maximo de 50 opcoes por campo de selecao

Os valores dos campos personalizados sao criptografados junto com o conteudo das notas. O servidor nunca os ve.

### Mensagens de voz

Grave mensagens de audio IVR personalizadas para cada idioma suportado. O sistema usa suas gravacoes para os fluxos de saudacao, CAPTCHA, fila e correio de voz. Quando nao houver gravacao, ele recorre a sintese de voz.

### Politica WebAuthn

Opcionalmente exija chaves de acesso para administradores, voluntarios ou ambos. Quando exigido, os usuarios devem registrar uma chave de acesso antes de poderem usar o aplicativo.

## Registro de auditoria

A pagina **Registro de auditoria** exibe uma lista cronologica de eventos do sistema: logins, atendimentos de chamadas, criacao de notas, alteracoes de configuracoes e acoes administrativas. As entradas incluem enderecos IP com hash e metadados de pais. Use a paginacao para navegar pelo historico.

## Historico de chamadas

A pagina **Chamadas** exibe todas as chamadas com status, duracao e voluntario atribuido. Filtre por intervalo de datas ou pesquise por numero de telefone. Exporte dados no formato JSON compativel com o RGPD.
