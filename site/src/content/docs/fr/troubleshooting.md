---
title: Depannage
description: Solutions aux problemes courants de deploiement, de l'application de bureau, de l'application mobile, de la telephonie et des operations cryptographiques.
---

Ce guide couvre les problemes courants et leurs solutions pour tous les modes de deploiement et plateformes Llamenos.

## Problemes de deploiement Docker

### Les conteneurs ne demarrent pas

**Variables d'environnement manquantes :**

Docker Compose valide tous les services au demarrage, meme ceux avec profil. Si vous voyez des erreurs concernant des variables manquantes, assurez-vous que votre fichier `.env` inclut toutes les valeurs requises :

```bash
# Requis dans .env pour Docker Compose
PG_PASSWORD=your_postgres_password
MINIO_ACCESS_KEY=your_minio_access_key
MINIO_SECRET_KEY=your_minio_secret_key
HMAC_SECRET=your_hmac_secret
ARI_PASSWORD=your_ari_password       # Requis meme si vous n'utilisez pas Asterisk
BRIDGE_SECRET=your_bridge_secret     # Requis meme si vous n'utilisez pas Asterisk
ADMIN_PUBKEY=your_admin_hex_pubkey
```

Meme si vous n'utilisez pas le bridge Asterisk, Docker Compose valide sa definition de service et exige que `ARI_PASSWORD` et `BRIDGE_SECRET` soient definis.

**Conflits de ports :**

Si un port est deja utilise, verifiez quel processus l'occupe :

```bash
sudo lsof -i :8787
sudo lsof -i :5432
sudo lsof -i :9000
```

Arretez le processus en conflit ou changez le mapping de port dans `docker-compose.yml`.

### Erreurs de connexion a la base de donnees

Si l'application ne peut pas se connecter a PostgreSQL :

- Verifiez que `PG_PASSWORD` dans `.env` correspond a ce qui a ete utilise lors de la premiere creation du conteneur
- Verifiez que le conteneur PostgreSQL est sain : `docker compose ps`
- Si le mot de passe a ete change, vous devrez peut-etre supprimer le volume et recreer : `docker compose down -v && docker compose up -d`

### Le relai strfry ne se connecte pas

Le relai Nostr (strfry) est un service principal, pas optionnel. Si le relai ne fonctionne pas :

```bash
docker compose logs strfry
docker compose restart strfry
```

Si le relai ne demarre pas, verifiez les conflits sur le port 7777 ou les permissions insuffisantes sur le repertoire de donnees.

### Erreurs de stockage MinIO / S3

- Verifiez que `MINIO_ACCESS_KEY` et `MINIO_SECRET_KEY` sont corrects
- Verifiez que le conteneur MinIO fonctionne : `docker compose ps minio`
- Accedez a la console MinIO sur `http://localhost:9001` pour verifier la creation du bucket

## Problemes de deploiement Cloudflare

### Erreurs Durable Object

**« Durable Object not found » ou erreurs de binding :**

- Executez `bun run deploy` (jamais `wrangler deploy` directement) pour assurer des bindings DO corrects
- Verifiez `wrangler.jsonc` pour les noms de classes DO et les bindings corrects
- Apres l'ajout d'un nouveau DO, vous devez deployer avant qu'il ne soit disponible

### Erreurs Worker (reponses 500)

Verifiez les journaux du Worker :

```bash
bunx wrangler tail
```

Causes courantes :
- Secrets manquants (utilisez `bunx wrangler secret list` pour verifier)
- Format `ADMIN_PUBKEY` incorrect (doit etre 64 caracteres hex, sans prefixe `npub`)
- Limitation de debit sur le tier gratuit (1 000 requetes/minute sur Workers Free)

### L'echec de deploiement avec les erreurs « Pages deploy »

N'executez jamais `wrangler pages deploy` ou `wrangler deploy` directement. Utilisez toujours les scripts racine de `package.json` :

```bash
bun run deploy          # Tout deployer (app + site marketing)
bun run deploy:demo     # Deployer uniquement le Worker de l'app
bun run deploy:site     # Deployer uniquement le site marketing
```

## Problemes de l'application de bureau

### La mise a jour automatique ne fonctionne pas

- Verifiez votre connexion Internet
- Verifiez que le endpoint de mise a jour est joignable : `https://github.com/rhonda-rodododo/llamenos/releases/latest/download/latest.json`
- Sur Linux, l'AppImage necessite des droits d'ecriture dans son repertoire
- Sur macOS, l'application doit etre dans `/Applications`

### Echec du deverrouillage PIN

- Assurez-vous de saisir le bon PIN (pas de recuperation « PIN oublie »)
- Si vous avez oublie votre PIN, vous devez re-saisir votre nsec pour en definir un nouveau
- Le Tauri Stronghold chiffre votre nsec avec une cle derivee du PIN (PBKDF2)

### Recuperation de cle

1. Utilisez votre nsec (stocke dans un gestionnaire de mots de passe) pour vous connecter sur un nouvel appareil
2. Si vous avez enregistre une cle d'acces WebAuthn, utilisez-la sur le nouvel appareil
3. Vos notes chiffrees sont stockees cote serveur — une fois connecte avec la meme identite, vous pouvez les dechiffrer
4. Si vous avez perdu votre nsec et votre cle d'acces, contactez votre admin

### L'application ne demarre pas (fenetre vide)

- Verifiez la configuration minimale requise (voir [Telecharger](/download))
- Sur Linux, assurez-vous que WebKitGTK est installe : `sudo apt install libwebkit2gtk-4.1-0`
- Essayez de lancer depuis le terminal pour voir les erreurs
- Sous Wayland, essayez avec `GDK_BACKEND=x11` comme solution de secours

### Conflit d'instance unique

Llamenos impose le mode instance unique. Si l'application dit qu'elle fonctionne deja :

- Verifiez les processus en arriere-plan : `ps aux | grep llamenos`
- Terminez les processus orphelins : `pkill llamenos`

## Problemes de l'application mobile

### Echecs d'approvisionnement

Voir le [Guide mobile](/docs/mobile-guide#troubleshooting-mobile-issues) pour le depannage detaille.

Causes courantes :
- Code QR expire (les tokens expirent apres 5 minutes)
- Pas de connexion Internet sur l'un des appareils
- Versions de protocole differentes entre bureau et mobile

### Les notifications push n'arrivent pas

- Verifiez que les permissions de notification sont accordees dans les parametres OS
- Sur Android, verifiez que l'optimisation de la batterie ne tue pas l'application en arriere-plan
- Sur iOS, verifiez que l'actualisation en arriere-plan est activee pour Llamenos

## Problemes de telephonie

### Configuration webhook Twilio

Si les appels ne sont pas routes vers les benevoles :

1. Verifiez les URLs de webhook dans la console Twilio :
   - Voice webhook : `https://your-worker.your-domain.com/telephony/incoming` (POST)
   - Status callback : `https://your-worker.your-domain.com/telephony/status` (POST)
2. Verifiez que les identifiants Twilio correspondent
3. Verifiez le debugger Twilio : [twilio.com/console/debugger](https://www.twilio.com/console/debugger)

### Les appels se connectent mais pas d'audio

- Verifiez les problemes NAT/pare-feu bloquant le trafic RTP
- Si vous utilisez WebRTC, verifiez que les serveurs STUN/TURN sont correctement configures
- Certains VPN bloquent le trafic VoIP

### Les messages SMS/WhatsApp n'arrivent pas

- Verifiez les URLs de webhook de messagerie chez votre fournisseur
- Pour WhatsApp, assurez-vous que le token de verification Meta correspond
- Verifiez que le canal est active dans **Parametres admin > Canaux**

## Erreurs cryptographiques

### Erreurs de non-correspondance de cles

**« Echec du dechiffrement » ou « Cle invalide » a l'ouverture des notes :**

- Cela signifie generalement que la note a ete chiffree pour une identite differente
- Verifiez que vous utilisez le bon nsec
- Si vous avez recree votre identite, les anciennes notes ne seront pas dechiffrables avec la nouvelle cle

**« Signature invalide » a la connexion :**

- Le nsec est peut-etre corrompu — reessayez depuis votre gestionnaire de mots de passe
- Assurez-vous que le nsec complet est colle (commence par `nsec1`, 63 caracteres au total)

### Erreurs d'enveloppe ECIES

**« Echec du developpement de la cle » :**

- L'enveloppe ECIES a peut-etre ete creee avec une cle publique incorrecte
- L'admin devrait verifier la cle publique du benevole et re-inviter si necessaire

### Erreurs de cle Hub

**« Echec du dechiffrement de l'evenement hub » :**

- La cle hub a peut-etre ete renouvelee depuis votre derniere connexion
- Fermez et rouvrez l'application pour recuperer la derniere cle hub

## Obtenir de l'aide

Si votre probleme n'est pas couvert ici :

- Consultez les [Issues GitHub](https://github.com/rhonda-rodododo/llamenos/issues) pour les bugs connus
- Recherchez les issues existantes avant d'en creer une nouvelle
- Lors d'un rapport de bug, incluez : mode de deploiement, plateforme et messages d'erreur
