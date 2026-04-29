---
title: "Configuration : Asterisk (auto-heberge)"
description: Guide etape par etape pour deployer Asterisk avec le bridge ARI pour Llamenos.
---

Asterisk est une plateforme de telephonie open-source que vous hebergez sur votre propre infrastructure. Cela vous donne un controle maximal sur vos donnees et elimine les frais cloud a la minute. Llamenos se connecte a Asterisk via l'interface REST Asterisk (ARI).

C'est l'option de configuration la plus complexe et elle est recommandee pour les organisations disposant de personnel technique capable de gerer l'infrastructure serveur.

## Prerequis

- Un serveur Linux (Ubuntu 22.04+ ou Debian 12+ recommande) avec une adresse IP publique
- Un fournisseur de trunk SIP pour la connectivite RTPC (ex. : Telnyx, Flowroute, VoIP.ms)
- Votre instance Llamenos deployee et accessible via une URL publique
- Des connaissances de base en administration de serveurs Linux

## 1. Installer Asterisk

### Option A : Gestionnaire de paquets (plus simple)

```bash
sudo apt update
sudo apt install asterisk
```

### Option B : Docker (recommande pour une gestion plus facile)

```bash
docker pull asterisk/asterisk:20
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

### Option C : Compilation depuis les sources (pour les modules personnalises)

```bash
wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz
tar xzf asterisk-20-current.tar.gz
cd asterisk-20.*/
./configure
make
sudo make install
sudo make samples
```

## 2. Configurer le trunk SIP

Editez `/etc/asterisk/pjsip.conf` pour ajouter votre fournisseur de trunk SIP. Voici un exemple de configuration :

```ini
; Trunk SIP vers votre fournisseur RTPC
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

## 3. Activer ARI

ARI (Asterisk REST Interface) est la methode par laquelle Llamenos controle les appels sur Asterisk.

Editez `/etc/asterisk/ari.conf` :

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

Editez `/etc/asterisk/http.conf` pour activer le serveur HTTP :

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

## 4. Configurer le plan de numerotation

Editez `/etc/asterisk/extensions.conf` pour acheminer les appels entrants vers l'application ARI :

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

## 5. Deployer le service bridge ARI

Le bridge ARI est un petit service qui traduit entre les webhooks de Llamenos et les evenements ARI. Il s'execute a cote d'Asterisk et se connecte a la fois au WebSocket ARI et a votre Worker Llamenos.

```bash
# Le service bridge est inclus dans le depot Llamenos
cd llamenos
bun run build:ari-bridge

# L'executer
ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
ASTERISK_ARI_USERNAME=llamenos \
ASTERISK_ARI_PASSWORD=your-strong-ari-password \
LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
bun run ari-bridge
```

Ou avec Docker :

```bash
docker run -d \
  --name llamenos-ari-bridge \
  -e ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
  -e ASTERISK_ARI_USERNAME=llamenos \
  -e ASTERISK_ARI_PASSWORD=your-strong-ari-password \
  -e LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
  llamenos/ari-bridge
```

## 6. Configurer dans Llamenos

1. Connectez-vous en tant qu'administrateur
2. Allez dans **Parametres** > **Fournisseur de telephonie**
3. Selectionnez **Asterisk (auto-heberge)** dans le menu deroulant des fournisseurs
4. Saisissez :
   - **ARI URL** : `https://your-asterisk-server:8089/ari`
   - **ARI Username** : `llamenos`
   - **ARI Password** : votre mot de passe ARI
   - **Bridge Callback URL** : URL ou le bridge ARI recoit les webhooks de Llamenos (ex. : `https://bridge.your-domain.com/webhook`)
   - **Phone Number** : votre numero de telephone du trunk SIP (format E.164)
5. Cliquez sur **Enregistrer**

## 7. Tester la configuration

1. Redemarrez Asterisk : `sudo systemctl restart asterisk`
2. Verifiez que ARI fonctionne : `curl -u llamenos:password https://your-server:8089/ari/asterisk/info`
3. Appelez votre numero de ligne depuis un telephone
4. Consultez les journaux du bridge ARI pour les evenements de connexion et d'appel

## Considerations de securite

Heberger votre propre serveur Asterisk vous donne un controle total, mais aussi la pleine responsabilite de la securite :

### TLS et SRTP

Activez toujours TLS pour la signalisation SIP et SRTP pour le chiffrement des medias :

```ini
; Dans la section transport de pjsip.conf
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

Activez SRTP sur les endpoints :

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### Isolation reseau

- Placez Asterisk dans une DMZ ou un segment reseau isole
- Utilisez un pare-feu pour restreindre l'acces :
  - SIP (5060-5061/tcp/udp) : uniquement depuis votre fournisseur de trunk SIP
  - RTP (10000-20000/udp) : uniquement depuis votre fournisseur de trunk SIP
  - ARI (8088-8089/tcp) : uniquement depuis le serveur du bridge ARI
  - SSH (22/tcp) : uniquement depuis les IP d'administration
- Utilisez fail2ban pour proteger contre les attaques de scan SIP

### Mises a jour regulieres

Maintenez Asterisk a jour pour corriger les vulnerabilites de securite :

```bash
sudo apt update && sudo apt upgrade asterisk
```

## WebRTC avec Asterisk

Asterisk prend en charge WebRTC via son transport WebSocket integre et SIP.js dans le navigateur. Cela necessite une configuration supplementaire :

1. Activez le transport WebSocket dans `http.conf`
2. Creez des endpoints PJSIP pour les clients WebRTC
3. Configurez DTLS-SRTP pour le chiffrement des medias
4. Utilisez SIP.js cote client (configure automatiquement par Llamenos quand Asterisk est selectionne)

La configuration WebRTC avec Asterisk est plus complexe qu'avec les fournisseurs cloud. Consultez le guide [Appels WebRTC dans le navigateur](/docs/deploy/providers/webrtc) pour plus de details.

## Depannage

- **Connexion ARI refusee** : Verifiez que `http.conf` a `enabled=yes` et que l'adresse de liaison est correcte.
- **Pas d'audio** : Verifiez que les ports RTP (10000-20000/udp) sont ouverts dans votre pare-feu et que le NAT est configure correctement.
- **Echecs d'enregistrement SIP** : Verifiez vos identifiants de trunk SIP et que le DNS resout le serveur SIP de votre fournisseur.
- **Le bridge ne se connecte pas** : Verifiez que le bridge ARI peut atteindre a la fois le point de terminaison ARI d'Asterisk et l'URL de votre Worker Llamenos.
- **Problemes de qualite d'appel** : Assurez-vous que votre serveur a une bande passante suffisante et une faible latence vers le fournisseur de trunk SIP. Considerez les codecs (opus pour WebRTC, ulaw/alaw pour RTPC).
