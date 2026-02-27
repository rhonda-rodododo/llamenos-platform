---
title: Funcionalidades
subtitle: Tudo o que uma plataforma de resposta a crises precisa, em um pacote de codigo aberto. Voz, SMS, WhatsApp, Signal e reportes criptografados -- construido sobre Cloudflare Workers sem servidores para gerenciar.
---

## Telefonia multiprovedora

**5 provedores de voz** -- Escolha entre Twilio, SignalWire, Vonage, Plivo ou Asterisk auto-hospedado. Configure seu provedor na interface de administracao ou durante o assistente de configuracao. Troque de provedor a qualquer momento sem alteracoes no codigo.

**Chamadas WebRTC no navegador** -- Os voluntarios podem atender chamadas diretamente no navegador sem telefone. Geracao de tokens WebRTC especificos por provedor para Twilio, SignalWire, Vonage e Plivo. Preferencia de chamada configuravel por voluntario (telefone, navegador ou ambos).

## Roteamento de chamadas

**Toque simultaneo** -- Quando um chamador liga, todos os voluntarios em turno e disponiveis tocam simultaneamente. O primeiro voluntario a atender recebe a chamada; o toque dos demais para imediatamente.

**Turnos programados** -- Crie turnos recorrentes com dias e faixas horarias especificos. Atribua voluntarios a turnos. O sistema roteia chamadas automaticamente para quem estiver de servico.

**Fila com musica de espera** -- Se todos os voluntarios estiverem ocupados, os chamadores entram em uma fila com musica de espera configuravel. O tempo de espera e ajustavel (30-300 segundos). Quando ninguem responde, as chamadas vao para o correio de voz.

**Correio de voz como fallback** -- Os chamadores podem deixar uma mensagem de voz (ate 5 minutos) se nenhum voluntario atender. As mensagens de voz sao transcritas via Whisper AI e criptografadas para revisao do administrador.

## Notas criptografadas

**Notas com criptografia de ponta a ponta** -- Os voluntarios escrevem notas durante e apos as chamadas. As notas sao criptografadas no navegador usando ECIES (secp256k1 + XChaCha20-Poly1305) antes de sair do navegador. O servidor armazena apenas texto cifrado.

**Criptografia dupla** -- Cada nota e criptografada duas vezes: uma para o voluntario que a escreveu e outra para o administrador. Ambos podem decifrar independentemente. Ninguem mais pode ler o conteudo.

**Campos personalizados** -- Os administradores definem campos personalizados para as notas: texto, numero, selecao, caixa de verificacao, area de texto. Os campos sao criptografados junto com o conteudo da nota.

**Salvamento automatico de rascunhos** -- As notas sao salvas automaticamente como rascunhos criptografados no navegador. Se a pagina recarregar ou o voluntario navegar para outro lugar, o trabalho e preservado. Os rascunhos sao apagados ao sair.

## Transcricao com IA

**Transcricao com Whisper** -- As gravacoes de chamadas sao transcritas usando Cloudflare Workers AI com o modelo Whisper. A transcricao acontece no servidor, e o texto e criptografado antes do armazenamento.

**Controles de ativacao** -- O administrador pode ativar ou desativar a transcricao globalmente. Os voluntarios podem desativa-la individualmente. Ambos os controles sao independentes.

**Transcricoes criptografadas** -- As transcricoes usam a mesma criptografia ECIES das notas. O que e armazenado e apenas texto cifrado.

## Mitigacao de spam

**CAPTCHA por voz** -- Deteccao opcional de bots por voz: os chamadores ouvem um numero aleatorio de 4 digitos e devem inseri-lo no teclado. Bloqueia chamadas automatizadas enquanto permanece acessivel para chamadores reais.

**Limite de frequencia** -- Limite de frequencia por janela deslizante por numero de telefone, persistido no armazenamento de Durable Object. Sobrevive a reinicializacoes do Worker. Limites configuraveis.

**Listas de bloqueio em tempo real** -- Os administradores gerenciam listas de bloqueio de numeros telefonicos com entrada individual ou importacao em massa. Os bloqueios surtem efeito imediatamente. Chamadores bloqueados ouvem uma mensagem de rejeicao.

**Prompts IVR personalizados** -- Grave prompts de voz personalizados para cada idioma suportado. O sistema usa suas gravacoes para os fluxos IVR, recorrendo a texto-para-voz quando nao existir gravacao.

## Mensagens multicanal

**SMS** -- Mensagens SMS de entrada e saida via Twilio, SignalWire, Vonage ou Plivo. Auto-resposta com mensagens de boas-vindas configuraveis. As mensagens fluem para a visualizacao de conversas com historico.

**WhatsApp Business** -- Conexao via a API Cloud da Meta (Graph API v21.0). Suporte a mensagens de modelo para iniciar conversas dentro da janela de 24 horas. Suporte a mensagens de midia para imagens, documentos e audio.

**Signal** -- Mensagens com foco em privacidade via bridge signal-cli-rest-api auto-hospedado. Monitoramento de saude com degradacao elegante. Transcricao de mensagens de voz via Workers AI Whisper.

**Conversas com historico** -- Todos os canais de mensagens fluem para uma visualizacao de conversas unificada. Bolhas de mensagens com timestamps e indicadores de direcao. Atualizacoes em tempo real via WebSocket.

## Reportes criptografados

**Funcao de reportero** -- Uma funcao dedicada para pessoas que enviam denuncias ou reportes. Os reporteros veem uma interface simplificada com apenas reportes e ajuda. Convidados pelo mesmo fluxo dos voluntarios, com seletor de funcao.

**Envios criptografados** -- O conteudo dos reportes e criptografado usando ECIES antes de sair do navegador. Titulos em texto simples para triagem, conteudo criptografado para privacidade. Anexos de arquivo sao criptografados separadamente.

**Fluxo de trabalho de reportes** -- Categorias para organizar reportes. Acompanhamento de status (aberto, reivindicado, resolvido). Os administradores podem reivindicar reportes e responder com mensagens criptografadas em historico.

## Painel de administracao

**Assistente de configuracao** -- Configuracao guiada passo a passo no primeiro login do administrador. Escolha quais canais ativar (Voz, SMS, WhatsApp, Signal, Reportes), configure provedores e defina o nome da sua linha.

**Lista de verificacao inicial** -- Widget no painel que acompanha o progresso da configuracao: configuracao de canais, integracao de voluntarios, criacao de turnos.

**Monitoramento em tempo real** -- Veja chamadas ativas, chamadores na fila, conversas e status dos voluntarios em tempo real via WebSocket. As metricas sao atualizadas instantaneamente.

**Gestao de voluntarios** -- Adicione voluntarios com pares de chaves gerados, gerencie funcoes (voluntario, administrador, reportero), visualize status online. Links de convite para autoregistro com selecao de funcao.

**Log de auditoria** -- Cada chamada atendida, nota criada, mensagem enviada, reporte submetido, configuracao alterada e acao de administrador e registrada. Visualizador paginado para administradores.

**Historico de chamadas** -- Historico de chamadas pesquisavel e filtravel com faixas de datas, busca por numero de telefone e atribuicao de voluntarios. Exportacao de dados compativel com GDPR.

**Ajuda no aplicativo** -- Secoes de perguntas frequentes, guias por funcao, cartoes de referencia rapida para atalhos de teclado e seguranca. Acessivel pela barra lateral e pela paleta de comandos.

## Experiencia do voluntario

**Paleta de comandos** -- Pressione Ctrl+K (ou Cmd+K no Mac) para acesso instantaneo a navegacao, busca, criacao rapida de notas e troca de tema. Comandos exclusivos de administrador sao filtrados por funcao.

**Notificacoes em tempo real** -- Chamadas recebidas ativam um toque no navegador, notificacao push e titulo de aba piscante. Ative ou desative cada tipo de notificacao independentemente nas configuracoes.

**Presenca de voluntarios** -- Os administradores veem contagens em tempo real de voluntarios online, offline e em pausa. Os voluntarios podem ativar um interruptor de pausa na barra lateral para pausar chamadas recebidas sem sair do turno.

**Atalhos de teclado** -- Pressione ? para ver todos os atalhos disponiveis. Navegue entre paginas, abra a paleta de comandos e realize acoes comuns sem tocar no mouse.

**Salvamento automatico de rascunhos de notas** -- As notas sao salvas automaticamente como rascunhos criptografados no navegador. Se a pagina recarregar ou o voluntario navegar para outro lugar, o trabalho e preservado. Os rascunhos sao apagados do localStorage ao sair.

**Exportacao de dados criptografada** -- Exporte notas como um arquivo criptografado compativel com GDPR (.enc) usando a chave do voluntario. Apenas o autor original pode decifrar a exportacao.

**Temas claro/escuro** -- Alterne entre modo escuro, modo claro ou seguir o tema do sistema. A preferencia e mantida por sessao.

## Multilingue e movel

**12+ idiomas** -- Traducoes completas da interface: ingles, espanhol, chines, tagalo, vietnamita, arabe, frances, crioulo haitiano, coreano, russo, hindi, portugues e alemao. Suporte RTL para arabe.

**Aplicativo web progressivo** -- Instalavel em qualquer dispositivo pelo navegador. O service worker armazena em cache a estrutura do app para inicializacao offline. Notificacoes push para chamadas recebidas.

**Design mobile-first** -- Layout responsivo construido para celulares e tablets. Barra lateral recolhivel, controles amigaveis ao toque e layouts adaptativos.

## Autenticacao e gestao de chaves

**Armazem de chaves protegido por PIN** -- Sua chave secreta e criptografada com um PIN de 6 digitos usando PBKDF2 (600.000 iteracoes) + XChaCha20-Poly1305. A chave bruta nunca toca o sessionStorage ou qualquer API do navegador -- ela vive apenas em uma variavel em memoria, zerada ao bloquear.

**Bloqueio automatico** -- O gerenciador de chaves bloqueia automaticamente apos inatividade ou quando a aba do navegador e ocultada. Reinsira seu PIN para desbloquear. Duracao de inatividade configuravel.

**Vinculacao de dispositivos** -- Configure novos dispositivos sem nunca expor sua chave secreta. Escaneie um codigo QR ou insira um codigo de provisionamento curto. Usa troca de chaves ECDH efemera para transferir seu material de chave criptografado com seguranca entre dispositivos. Salas de provisionamento expiram apos 5 minutos.

**Chaves de recuperacao** -- Durante a integracao, voce recebe uma chave de recuperacao no formato Base32 (128 bits de entropia). Isso substitui o fluxo antigo de exibicao do nsec. Download obrigatorio de backup criptografado antes de prosseguir.

**Sigilo futuro por nota** -- Cada nota e criptografada com uma chave aleatoria unica, que e entao envolvida via ECIES para cada leitor autorizado. Comprometer a chave de identidade nao revela notas anteriores.

**Autenticacao com chaves Nostr** -- Os voluntarios se autenticam com pares de chaves compativeis com Nostr (nsec/npub). Verificacao de assinatura BIP-340 Schnorr. Sem senhas, sem enderecos de email.

**Passkeys com WebAuthn** -- Suporte opcional a passkeys para login multi-dispositivo. Registre uma chave de hardware ou biometria, e entao faca login sem digitar sua chave secreta.

**Gestao de sessoes** -- Modelo de acesso em dois niveis: "autenticado mas bloqueado" (apenas token de sessao) vs "autenticado e desbloqueado" (PIN inserido, acesso criptografico completo). Tokens de sessao de 8 horas com avisos de inatividade.
