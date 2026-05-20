---
title: "Configurar: Asterisk (Autoalojado)"
description: Guía paso a paso nuu desplegar Asterisk nuu sip-bridge nuu Llámenos.
---

Asterisk iin plataforma telefonía código abierto ke usted aloja nuu propia infraestructura. Yaa le da máximo control sobre datos ni elimina tarifas por minuto nube. Llámenos conecta a Asterisk vía servicio `sip-bridge` usando Asterisk REST Interface (ARI).

> **Nota:** Servicio `asterisk-bridge` ya no existe. Ha sido reemplazado por `sip-bridge`, ke soporta Asterisk ARI, FreeSWITCH ESL, ni Kamailio vía variable entorno `PBX_TYPE`. Establezca `PBX_TYPE=asterisk` nuu Asterisk.

Yaa iin opción configuración más compleja ni recomendada nuu organizaciones nuu personal técnico ke puede gestionar infraestructura servidor.

## Requisitos previos

- Iin servidor Linux (Ubuntu 22.04+ o Debian 12+ recomendado) nuu IP pública
- Iin proveedor SIP trunk nuu conectividad PSTN (ej., Telnyx, Flowroute, VoIP.ms)
- Instancia Llámenos desplegada ni accesible vía URL pública
- Familiaridad básica nuu administración servidor Linux

## 1. Instalar Asterisk

### Opción A: Gestor paquetes (más simple)

```bash
sudo apt update
sudo apt install asterisk
```

### Opción B: Docker (recomendado nuu gestión más fácil)

```bash
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

## 2. Configurar SIP trunk

Edite `/etc/asterisk/pjsip.conf` nuu añadir proveedor SIP trunk:

```ini
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

## 3. Habilitar ARI

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

Edite `/etc/asterisk/http.conf`:

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

## 4. Configurar dialplan

Edite `/etc/asterisk/extensions.conf`:

```ini
[from-trunk]
exten => _X.,1,NoOp(Incoming call from ${CALLERID(num)})
 same => n,Stasis(llamenos,incoming)
 same => n,Hangup()
```

## 5. Desplegar servicio sip-bridge

Servicio `sip-bridge` traduce entre webhooks Llámenos ni eventos ARI. Está incluido nuu repositorio Llámenos ni se despliega vía Docker Compose usando bandera `--profile telephony`.

Añada a `.env`:

```env
PBX_TYPE=asterisk
ARI_PASSWORD=your-strong-ari-password
BRIDGE_SECRET=your-hex-bridge-secret   # openssl rand -hex 32
```

Inicie nuu perfil telefonía:

```bash
docker compose -f deploy/docker/docker-compose.yml \
  -f deploy/docker/docker-compose.production.yml \
  --profile telephony up -d
```

O ejecute standalone:

```bash
cd sip-bridge
PBX_TYPE=asterisk \
ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
ASTERISK_ARI_USERNAME=llamenos \
ARI_PASSWORD=your-strong-ari-password \
LLAMENOS_CALLBACK_URL=https://your-domain.com/api/telephony \
BRIDGE_SECRET=your-hex-bridge-secret \
bun run start
```

## 6. Configurar nuu Llámenos

1. Inicie sesión nuu ña'a
2. Vaya a **Configuración** → **Proveedor Telefonía**
3. Seleccione **Asterisk (Autoalojado)**
4. Ke ingrese:
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: contraseña ARI
   - **Bridge Secret**: bridge secret
   - **Phone Number**: número SIP trunk (formato E.164)
5. Clic **Guardar**

## 7. Probar configuración

```bash
# Verificar ARI está corriendo
curl -u llamenos:password https://your-server:8089/ari/asterisk/info

# Reiniciar Asterisk
sudo systemctl restart asterisk
```

Luego llame a número línea caliente desde iin teléfono ni verifique logs sip-bridge.

## Consideraciones seguridad

### TLS ni SRTP

```ini
; En pjsip.conf
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

Habilite SRTP nuu endpoints:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### Aislamiento red

- Use firewall: solo proveedor SIP trunk debe alcanzar SIP (5060-5061) ni RTP (10000-20000/udp)
- Restrinja ARI (8088-8089/tcp) solo a servidor sip-bridge
- Use fail2ban nuu proteger contra ataques escaneo SIP

## Ke kunche'e problemas

- **Conexión ARI rechazada**: Verifique `http.conf` tiene `enabled=yes`
- **No hay audio**: Verifique puertos RTP (10000-20000/udp) están abiertos ni NAT está configurado
- **Fallos registro SIP**: Verifique credenciales SIP trunk ni DNS
- **sip-bridge no conecta**: Verifique `PBX_TYPE=asterisk` está establecido, ni ke ARI_PASSWORD ni BRIDGE_SECRET coinciden en bridge ni configuración ña'a Llámenos
