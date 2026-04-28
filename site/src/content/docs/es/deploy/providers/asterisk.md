---
title: "Configurar Asterisk (Autoalojado)"
description: Guia paso a paso para desplegar Asterisk con el bridge ARI para Llamenos.
---

Asterisk es una plataforma de telefonia de codigo abierto que alojas en tu propia infraestructura. Esto te da control total sobre tus datos y elimina los costos por minuto de la nube. Llamenos se conecta a Asterisk mediante la interfaz REST de Asterisk (ARI).

Esta es la opcion de configuracion mas compleja y se recomienda para organizaciones con personal tecnico capaz de administrar infraestructura de servidores.

## Requisitos previos

- Un servidor Linux (se recomienda Ubuntu 22.04+ o Debian 12+) con una IP publica
- Un proveedor de trunk SIP para conectividad con la red telefonica (por ejemplo, Telnyx, Flowroute, VoIP.ms)
- Tu instancia de Llamenos desplegada y accesible desde una URL publica
- Familiaridad basica con la administracion de servidores Linux

## 1. Instalar Asterisk

### Opcion A: Gestor de paquetes (mas simple)

```bash
sudo apt update
sudo apt install asterisk
```

### Opcion B: Docker (recomendado para facilitar la gestion)

```bash
docker pull asterisk/asterisk:20
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

### Opcion C: Compilar desde el codigo fuente (para modulos personalizados)

```bash
wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz
tar xzf asterisk-20-current.tar.gz
cd asterisk-20.*/
./configure
make
sudo make install
sudo make samples
```

## 2. Configurar el trunk SIP

Edita `/etc/asterisk/pjsip.conf` para agregar tu proveedor de trunk SIP. Aqui tienes un ejemplo de configuracion:

```ini
; Trunk SIP hacia tu proveedor de red telefonica
[trunk-provider]
type=registration
transport=transport-tls
outbound_auth=trunk-auth
server_uri=sip:sip.tu-proveedor.com
client_uri=sip:tu-cuenta@sip.tu-proveedor.com

[trunk-auth]
type=auth
auth_type=userpass
username=tu-cuenta
password=tu-contrasena

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
contact=sip:sip.tu-proveedor.com
```

## 3. Habilitar ARI

ARI (Asterisk REST Interface) es como Llamenos controla las llamadas en Asterisk.

Edita `/etc/asterisk/ari.conf`:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=tu-contrasena-ari-segura
```

Edita `/etc/asterisk/http.conf` para habilitar el servidor HTTP:

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

## 4. Configurar el plan de marcado

Edita `/etc/asterisk/extensions.conf` para enrutar las llamadas entrantes a la aplicacion ARI:

```ini
[from-trunk]
exten => _X.,1,NoOp(Llamada entrante de ${CALLERID(num)})
 same => n,Stasis(llamenos,incoming)
 same => n,Hangup()

[llamenos-outbound]
exten => _X.,1,NoOp(Llamada saliente a ${EXTEN})
 same => n,Stasis(llamenos,outbound)
 same => n,Hangup()
```

## 5. Desplegar el servicio bridge ARI

El bridge ARI es un servicio pequeno que traduce entre los webhooks de Llamenos y los eventos ARI. Se ejecuta junto a Asterisk y se conecta tanto al WebSocket de ARI como a tu Worker de Llamenos.

```bash
# El servicio bridge esta incluido en el repositorio de Llamenos
cd llamenos
bun run build:ari-bridge

# Ejecutarlo
ASTERISK_ARI_URL=https://tu-servidor-asterisk:8089/ari \
ASTERISK_ARI_USERNAME=llamenos \
ASTERISK_ARI_PASSWORD=tu-contrasena-ari-segura \
LLAMENOS_CALLBACK_URL=https://tu-url-del-worker.com/telephony \
bun run ari-bridge
```

O con Docker:

```bash
docker run -d \
  --name llamenos-ari-bridge \
  -e ASTERISK_ARI_URL=https://tu-servidor-asterisk:8089/ari \
  -e ASTERISK_ARI_USERNAME=llamenos \
  -e ASTERISK_ARI_PASSWORD=tu-contrasena-ari-segura \
  -e LLAMENOS_CALLBACK_URL=https://tu-url-del-worker.com/telephony \
  llamenos/ari-bridge
```

## 6. Configurar en Llamenos

1. Inicia sesion como administrador
2. Ve a **Configuracion** > **Proveedor de Telefonia**
3. Selecciona **Asterisk (Autoalojado)** en el menu desplegable
4. Ingresa:
   - **ARI URL**: `https://tu-servidor-asterisk:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: tu contrasena ARI
   - **Bridge Callback URL**: URL donde el bridge ARI recibe webhooks de Llamenos (por ejemplo, `https://bridge.tu-dorustfs.com/webhook`)
   - **Numero de Telefono**: tu numero del trunk SIP (formato E.164)
5. Haz clic en **Guardar**

## 7. Probar la configuracion

1. Reinicia Asterisk: `sudo systemctl restart asterisk`
2. Verifica que ARI este funcionando: `curl -u llamenos:password https://tu-servidor:8089/ari/asterisk/info`
3. Llama a tu numero de linea desde un telefono
4. Revisa los registros del bridge ARI para ver eventos de conexion y llamada

## Consideraciones de seguridad

Ejecutar tu propio servidor Asterisk te da control total, pero tambien responsabilidad total sobre la seguridad:

### TLS y SRTP

Siempre habilita TLS para la senalizacion SIP y SRTP para el cifrado de medios:

```ini
; En la seccion de transporte de pjsip.conf
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

Habilita SRTP en los endpoints:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### Aislamiento de red

- Coloca Asterisk en una DMZ o segmento de red aislado
- Usa un firewall para restringir el acceso:
  - SIP (5060-5061/tcp/udp): solo desde tu proveedor de trunk SIP
  - RTP (10000-20000/udp): solo desde tu proveedor de trunk SIP
  - ARI (8088-8089/tcp): solo desde el servidor del bridge ARI
  - SSH (22/tcp): solo desde las IPs de administradores
- Usa fail2ban para protegerte contra ataques de escaneo SIP

### Actualizaciones regulares

Manten Asterisk actualizado para corregir vulnerabilidades de seguridad:

```bash
sudo apt update && sudo apt upgrade asterisk
```

## WebRTC con Asterisk

Asterisk soporta WebRTC mediante su transporte WebSocket integrado y SIP.js en el navegador. Esto requiere configuracion adicional:

1. Habilitar el transporte WebSocket en `http.conf`
2. Crear endpoints PJSIP para clientes WebRTC
3. Configurar DTLS-SRTP para cifrado de medios
4. Usar SIP.js en el lado del cliente (configurado automaticamente por Llamenos cuando se selecciona Asterisk)

La configuracion de WebRTC con Asterisk es mas compleja que con proveedores en la nube. Consulta la guia de [Llamadas WebRTC en el Navegador](/docs/deploy/providers/webrtc) para mas detalles.

## Solucion de problemas

- **Conexion ARI rechazada**: Verifica que `http.conf` tenga `enabled=yes` y que la direccion de enlace sea correcta.
- **Sin audio**: Verifica que los puertos RTP (10000-20000/udp) esten abiertos en tu firewall y que el NAT este configurado correctamente.
- **Fallos en el registro SIP**: Verifica las credenciales de tu trunk SIP y que el DNS resuelva el servidor SIP de tu proveedor.
- **El bridge no se conecta**: Verifica que el bridge ARI pueda alcanzar tanto el endpoint ARI de Asterisk como la URL de tu Worker de Llamenos.
- **Problemas de calidad de llamada**: Asegurate de que tu servidor tenga suficiente ancho de banda y baja latencia hacia el proveedor de trunk SIP. Considera los codecs (opus para WebRTC, ulaw/alaw para la red telefonica).
