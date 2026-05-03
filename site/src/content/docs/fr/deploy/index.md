---
title: Premiers pas
description: Deployez votre propre ligne Llamenos en moins d'une heure.
---

Deployez votre propre ligne Llamenos en moins d'une heure. Vous aurez besoin d'un compte Cloudflare, d'un compte fournisseur de telephonie et d'une machine avec Bun installe.

## Prerequis

- [Bun](https://bun.sh) v1.0 ou ulterieur (runtime et gestionnaire de paquets)
- Un compte [Cloudflare](https://www.cloudflare.com) (le niveau gratuit suffit pour le developpement)
- Un compte fournisseur de telephonie -- [Twilio](https://www.twilio.com) est le plus simple pour commencer, mais Llamenos prend aussi en charge [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo) et [Asterisk auto-heberge](/docs/deploy/providers/asterisk). Consultez la [comparaison des fournisseurs de telephonie](/docs/deploy/providers) pour vous aider a choisir.
- Git

## 1. Cloner et installer

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
bun install
```

## 2. Generer la paire de cles administrateur

Generez une paire de cles Nostr pour le compte administrateur. Cela produit une cle secrete (nsec) et une cle publique (npub/hex).

```bash
bun run bootstrap-admin
```

Conservez le `nsec` en lieu sur -- c'est votre identifiant de connexion administrateur. Vous aurez besoin de la cle publique hexadecimale pour l'etape suivante.

## 3. Configurer les secrets

Creez un fichier `.dev.vars` a la racine du projet pour le developpement local. Cet exemple utilise Twilio -- si vous utilisez un autre fournisseur, vous pouvez ignorer les variables Twilio et configurer votre fournisseur via l'interface d'administration apres la premiere connexion.

```bash
# .dev.vars
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
ADMIN_PUBKEY=your_hex_public_key_from_step_2
ENVIRONMENT=development
```

Pour la production, definissez-les en tant que secrets Wrangler :

```bash
bunx wrangler secret put ADMIN_PUBKEY
# Si vous utilisez Twilio comme fournisseur par defaut via les variables d'environnement :
bunx wrangler secret put TWILIO_ACCOUNT_SID
bunx wrangler secret put TWILIO_AUTH_TOKEN
bunx wrangler secret put TWILIO_PHONE_NUMBER
```

> **Remarque** : Vous pouvez aussi configurer votre fournisseur de telephonie entierement via l'interface d'administration des parametres, au lieu d'utiliser des variables d'environnement. C'est obligatoire pour les fournisseurs autres que Twilio. Consultez le [guide de configuration de votre fournisseur](/docs/deploy/providers).

## 4. Configurer les webhooks de telephonie

Configurez votre fournisseur de telephonie pour envoyer les webhooks vocaux a votre Worker. Les URL de webhook sont les memes quel que soit le fournisseur :

- **URL d'appel entrant** : `https://your-worker.your-domain.com/telephony/incoming` (POST)
- **URL de rappel de statut** : `https://your-worker.your-domain.com/telephony/status` (POST)

Pour les instructions de configuration specifiques a chaque fournisseur, consultez : [Twilio](/docs/deploy/providers/twilio), [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo) ou [Asterisk](/docs/deploy/providers/asterisk).

Pour le developpement local, vous aurez besoin d'un tunnel (comme Cloudflare Tunnel ou ngrok) pour exposer votre Worker local a votre fournisseur de telephonie.

## 5. Executer localement

Demarrez le serveur de developpement Worker (backend + frontend) :

```bash
# Construire les ressources frontend d'abord
bun run build

# Demarrer le serveur de developpement Worker
bun run dev:worker
```

L'application sera disponible a l'adresse `http://localhost:8787`. Connectez-vous avec le nsec administrateur de l'etape 2.

## 6. Deployer sur Cloudflare

```bash
bun run deploy
```

Cela construit le frontend et deploie le Worker avec les Durable Objects sur Cloudflare. Apres le deploiement, mettez a jour les URL de webhook de votre fournisseur de telephonie pour pointer vers l'URL du Worker de production.

## Etapes suivantes

- [Guide administrateur](/docs/admin-guide) -- ajouter des benevoles, creer des equipes, configurer les parametres
- [Guide du benevole](/docs/volunteer-guide) -- a partager avec vos benevoles
- [Fournisseurs de telephonie](/docs/deploy/providers) -- comparer les fournisseurs et changer de Twilio si necessaire
- [Modele de securite](/security) -- comprendre le chiffrement et le modele de menaces
