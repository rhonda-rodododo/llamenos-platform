---
title: "Configuracao: Asterisk (auto-hospedado)"
description: Guia passo a passo para implantar o Asterisk com o bridge ARI para o Llamenos.
---

O Asterisk e uma plataforma de telefonia open-source que voce hospeda em sua propria infraestrutura. Isso lhe da controle maximo sobre seus dados e elimina as taxas cloud por minuto. O Llamenos se conecta ao Asterisk via a Interface REST do Asterisk (ARI).

Esta e a opcao de configuracao mais complexa e e recomendada para organizacoes com equipe tecnica capaz de gerenciar infraestrutura de servidores.

## Pre-requisitos

- Um servidor Linux (Ubuntu 22.04+ ou Debian 12+ recomendado) com endereco IP publico
- Um provedor de trunk SIP para conectividade PSTN (ex.: Telnyx, Flowroute, VoIP.ms)
- Sua instancia Llamenos implantada e acessivel via URL publica
- Familiaridade basica com administracao de servidores Linux

## 1. Instalar o Asterisk

### Opcao A: Gerenciador de pacotes (mais simples)

```bash
sudo apt update
sudo apt install asterisk
```

### Opcao B: Docker (recomendado para gerenciamento mais facil)

```bash
docker pull asterisk/asterisk:20
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

### Opcao C: Compilar a partir do codigo-fonte (para modulos personalizados)

```bash
wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz
tar xzf asterisk-20-current.tar.gz
cd asterisk-20.*/
./configure
make
sudo make install
sudo make samples
```

## 2. Configurar o trunk SIP

Edite `/etc/asterisk/pjsip.conf` para adicionar seu provedor de trunk SIP. Aqui esta um exemplo de configuracao:

```ini
; Trunk SIP para seu provedor PSTN
[trunk-provider]
type=registration
transport=transport-tls
outbound_auth=trunk-auth
server_uri=sip:sip.your-provider.com
client_uri=sip:your-account@sip.your-provider.com

[trunk-auth]
type=auth
auth_type=userpass
username=your-account
password=your-password

[trunk-endpoint]
type=endpoint
context=from-trunk
transport=transport-tls
disallow=all
allow=ulaw
allow=alaw
allow=opus
aors=trunk-aor
outbound_auth=trunk-auth

[trunk-aor]
type=aor
contact=sip:sip.your-provider.com
```

## 3. Ativar o ARI

ARI (Asterisk REST Interface) e como o Llamenos controla chamadas no Asterisk.

Edite `/etc/asterisk/ari.conf`:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

Edite `/etc/asterisk/http.conf` para ativar o servidor HTTP:

```ini
[general]
enabled=yes
bindaddr=0.0.0.0
bindport=8088
tlsenable=yes
tlsbindaddr=0.0.0.0:8089
tlscertfile=/etc/asterisk/keys/asterisk.pem
tlsprivatekey=/etc/asterisk/keys/asterisk.key
```

## 4. Configurar o plano de discagem

Edite `/etc/asterisk/extensions.conf` para encaminhar chamadas recebidas para a aplicacao ARI:

```ini
[from-trunk]
exten => _X.,1,NoOp(Incoming call from ${CALLERID(num)})
 same => n,Stasis(llamenos,incoming)
 same => n,Hangup()

[llamenos-outbound]
exten => _X.,1,NoOp(Outbound call to ${EXTEN})
 same => n,Stasis(llamenos,outbound)
 same => n,Hangup()
```

## 5. Implantar o servico bridge ARI

O bridge ARI e um pequeno servico que traduz entre webhooks do Llamenos e eventos ARI. Ele roda ao lado do Asterisk e se conecta tanto ao WebSocket ARI quanto ao seu Worker Llamenos.

```bash
# O servico bridge esta incluido no repositorio do Llamenos
cd llamenos
bun run build:ari-bridge

# Executa-lo
ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
ASTERISK_ARI_USERNAME=llamenos \
ASTERISK_ARI_PASSWORD=your-strong-ari-password \
LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
bun run ari-bridge
```

Ou com Docker:

```bash
docker run -d \
  --name llamenos-ari-bridge \
  -e ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
  -e ASTERISK_ARI_USERNAME=llamenos \
  -e ASTERISK_ARI_PASSWORD=your-strong-ari-password \
  -e LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
  llamenos/ari-bridge
```

## 6. Configurar no Llamenos

1. Faca login como administrador
2. Va em **Configuracoes** > **Provedor de telefonia**
3. Selecione **Asterisk (auto-hospedado)** no menu suspenso de provedores
4. Insira:
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: sua senha ARI
   - **Bridge Callback URL**: URL onde o bridge ARI recebe webhooks do Llamenos (ex.: `https://bridge.your-domain.com/webhook`)
   - **Phone Number**: seu numero de telefone do trunk SIP (formato E.164)
5. Clique em **Salvar**

## 7. Testar a configuracao

1. Reinicie o Asterisk: `sudo systemctl restart asterisk`
2. Verifique se o ARI esta funcionando: `curl -u llamenos:password https://your-server:8089/ari/asterisk/info`
3. Ligue para o numero da sua linha de um telefone
4. Verifique os logs do bridge ARI para eventos de conexao e chamada

## Consideracoes de seguranca

Executar seu proprio servidor Asterisk lhe da controle total, mas tambem total responsabilidade pela seguranca:

### TLS e SRTP

Sempre ative TLS para sinalizacao SIP e SRTP para criptografia de midia:

```ini
; Na secao de transporte do pjsip.conf
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

Ativar SRTP nos endpoints:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### Isolamento de rede

- Coloque o Asterisk em uma DMZ ou segmento de rede isolado
- Use um firewall para restringir o acesso:
  - SIP (5060-5061/tcp/udp): apenas do seu provedor de trunk SIP
  - RTP (10000-20000/udp): apenas do seu provedor de trunk SIP
  - ARI (8088-8089/tcp): apenas do servidor do bridge ARI
  - SSH (22/tcp): apenas de IPs de administracao
- Use fail2ban para proteger contra ataques de varredura SIP

### Atualizacoes regulares

Mantenha o Asterisk atualizado para corrigir vulnerabilidades de seguranca:

```bash
sudo apt update && sudo apt upgrade asterisk
```

## WebRTC com Asterisk

O Asterisk suporta WebRTC via seu transporte WebSocket integrado e SIP.js no navegador. Isso requer configuracao adicional:

1. Ative o transporte WebSocket em `http.conf`
2. Crie endpoints PJSIP para clientes WebRTC
3. Configure DTLS-SRTP para criptografia de midia
4. Use SIP.js no lado do cliente (configurado automaticamente pelo Llamenos quando Asterisk e selecionado)

A configuracao WebRTC com Asterisk e mais complexa do que com provedores cloud. Consulte o guia [Chamadas WebRTC no navegador](/docs/deploy/providers/webrtc) para detalhes.

## Solucao de problemas

- **Conexao ARI recusada**: Verifique se `http.conf` tem `enabled=yes` e se o endereco de ligacao esta correto.
- **Sem audio**: Verifique se as portas RTP (10000-20000/udp) estao abertas no seu firewall e se o NAT esta configurado corretamente.
- **Falhas de registro SIP**: Verifique suas credenciais do trunk SIP e se o DNS resolve o servidor SIP do seu provedor.
- **Bridge nao conecta**: Verifique se o bridge ARI consegue alcancar tanto o endpoint ARI do Asterisk quanto a URL do seu Worker Llamenos.
- **Problemas de qualidade de chamada**: Certifique-se de que seu servidor tem largura de banda suficiente e baixa latencia para o provedor de trunk SIP. Considere os codecs (opus para WebRTC, ulaw/alaw para PSTN).
