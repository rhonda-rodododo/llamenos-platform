---
title: Guia do reportero
description: Como enviar reportes criptografados e acompanhar seu status.
---

Como reportero, voce pode enviar reportes criptografados para sua organizacao atraves da plataforma Llamenos. Os reportes sao criptografados de ponta a ponta -- o servidor nunca ve o conteudo do seu reporte.

## Primeiros passos

Seu administrador fornecera um dos seguintes:
- Um **nsec** (chave secreta Nostr) -- uma string que comeca com `nsec1`
- Um **link de convite** -- uma URL de uso unico que cria credenciais para voce

**Mantenha seu nsec privado.** Ele e sua identidade e credencial de login. Armazene-o em um gerenciador de senhas.

## Fazendo login

1. Abra o aplicativo no seu navegador
2. Cole seu `nsec` no campo de login
3. Sua identidade e verificada criptograficamente -- sua chave secreta nunca sai do seu navegador

Apos o primeiro login, voce pode registrar uma passkey WebAuthn nas Configuracoes para logins futuros mais faceis.

## Enviando um reporte

1. Clique em **Novo Reporte** na pagina de Reportes
2. Insira um **titulo** para o seu reporte (isso ajuda os administradores na triagem -- e armazenado em texto simples)
3. Selecione uma **categoria** se o administrador definiu categorias de reportes
4. Escreva o **conteudo do reporte** no campo do corpo -- ele e criptografado antes de sair do seu navegador
5. Opcionalmente, preencha quaisquer **campos personalizados** que o administrador configurou
6. Opcionalmente, **anexe arquivos** -- os arquivos sao criptografados no lado do cliente antes do envio
7. Clique em **Enviar**

Seu reporte aparece na sua lista de Reportes com o status "Aberto".

## Criptografia de reportes

- O corpo do reporte e os valores dos campos personalizados sao criptografados usando ECIES (secp256k1 + XChaCha20-Poly1305)
- Os arquivos anexos sao criptografados separadamente usando o mesmo esquema
- Apenas voce e o administrador podem decifrar o conteudo
- O servidor armazena apenas texto cifrado -- mesmo que o banco de dados seja comprometido, o conteudo do seu reporte esta seguro

## Acompanhando seus reportes

Sua pagina de Reportes mostra todos os seus reportes enviados com:
- **Titulo** e **categoria**
- **Status** -- Aberto, Reivindicado (um administrador esta trabalhando nele) ou Resolvido
- **Data** de envio

Clique em um reporte para ver o historico completo, incluindo respostas do administrador.

## Respondendo a administradores

Quando um administrador responde ao seu reporte, a resposta aparece no historico do reporte. Voce pode responder de volta -- todas as mensagens no historico sao criptografadas.

## O que voce nao pode fazer

Como reportero, seu acesso e limitado para proteger a privacidade de todos:
- Voce **pode** ver seus proprios reportes e a pagina de Ajuda
- Voce **nao pode** ver reportes de outros reporteros, registros de chamadas, informacoes de voluntarios ou configuracoes de administrador
- Voce **nao pode** atender chamadas ou responder a conversas de SMS/WhatsApp/Signal

## Dicas

- Use titulos descritivos -- eles ajudam os administradores na triagem sem precisar decifrar o conteudo completo
- Anexe arquivos relevantes (capturas de tela, documentos) quando eles sustentarem seu reporte
- Verifique periodicamente se ha respostas do administrador -- voce vera mudancas de status na sua lista de reportes
- Use a pagina de Ajuda para perguntas frequentes e guias
