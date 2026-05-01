---
title: "Déploiement : Docker Compose"
description: Déployez Llamenos sur votre propre serveur avec Docker Compose.
---

Ce guide vous accompagne dans le déploiement de Llamenos avec Docker Compose sur un serveur unique. Vous obtiendrez une ligne d'urgence entièrement fonctionnelle avec HTTPS automatique, base de données PostgreSQL, stockage objets et transcription optionnelle — le tout géré par Docker Compose.

## Prérequis

- Un serveur Linux (Ubuntu 22.04+, Debian 12+ ou similaire)
- [Docker Engine](https://docs.docker.com/engine/install/) v24+ avec Docker Compose v2
- Un nom de domaine avec DNS pointant vers l'IP de votre serveur
- [Bun](https://bun.sh/) installé localement (pour générer la paire de clés administrateur)

## 1. Cloner le dépôt

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
```

## 2. Générer la paire de clés administrateur

Vous avez besoin d'une paire de clés Nostr pour le compte administrateur. Exécutez ceci sur votre machine locale (ou sur le serveur si Bun est installé) :

```bash
bun install
bun run bootstrap-admin
```

Conservez le **nsec** (identifiant de connexion administrateur) en lieu sûr. Copiez la **clé publique hex** — vous en aurez besoin à l'étape suivante.

## 3. Configurer l'environnement

```bash
cd deploy/docker
cp .env.example .env
```

Modifiez `.env` avec vos valeurs :

```env
# Requis
ADMIN_PUBKEY=your_hex_public_key_from_step_2
DOMAIN=hotline.yourdomain.com

# Mot de passe PostgreSQL (générez-en un robuste)
PG_PASSWORD=$(openssl rand -base64 24)

# Nom de la ligne (affiché dans les messages IVR)
HOTLINE_NAME=Your Hotline

# Fournisseur vocal (optionnel — configurable via l'interface admin)
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890

# Identifiants MinIO (changez les valeurs par défaut !)
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key-min-8-chars
```

> **Important** : Définissez des mots de passe forts et uniques pour `PG_PASSWORD`, `MINIO_ACCESS_KEY` et `MINIO_SECRET_KEY`.

## 4. Configurer votre domaine

Modifiez le `Caddyfile` pour définir votre domaine :

```
hotline.yourdomain.com {
    reverse_proxy app:3000
    encode gzip
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer"
    }
}
```

Caddy obtient et renouvelle automatiquement les certificats TLS Let's Encrypt pour votre domaine. Assurez-vous que les ports 80 et 443 sont ouverts dans votre pare-feu.

## 5. Démarrer les services

```bash
docker compose up -d
```

Cela démarre quatre services principaux :

| Service | Fonction | Port |
|---------|----------|------|
| **app** | Application Llamenos | 3000 (interne) |
| **postgres** | Base de données PostgreSQL | 5432 (interne) |
| **caddy** | Reverse proxy + TLS | 80, 443 |
| **minio** | Stockage fichiers/enregistrements | 9000, 9001 (interne) |

Vérifiez que tout fonctionne :

```bash
docker compose ps
docker compose logs app --tail 50
```

Vérifiez le point de terminaison santé :

```bash
curl https://hotline.yourdomain.com/api/health
# → {"status":"ok"}
```

## 6. Première connexion

Ouvrez `https://hotline.yourdomain.com` dans votre navigateur. Connectez-vous avec le nsec administrateur de l'étape 2. L'assistant de configuration vous guidera à travers :

1. **Nommer votre ligne** — nom affiché dans l'application
2. **Choisir les canaux** — activer Voix, SMS, WhatsApp, Signal et/ou Rapports
3. **Configurer les fournisseurs** — saisir les identifiants pour chaque canal
4. **Vérifier et terminer**

## 7. Configurer les webhooks

Dirigez les webhooks de votre fournisseur de téléphonie vers votre domaine. Consultez les guides spécifiques à chaque fournisseur pour les détails :

- **Voix** (tous fournisseurs) : `https://hotline.yourdomain.com/telephony/incoming`
- **SMS** : `https://hotline.yourdomain.com/api/messaging/sms/webhook`
- **WhatsApp** : `https://hotline.yourdomain.com/api/messaging/whatsapp/webhook`
- **Signal** : Configurez le bridge pour rediriger vers `https://hotline.yourdomain.com/api/messaging/signal/webhook`

## Optionnel : Activer la transcription

Le service de transcription Whisper nécessite de la RAM supplémentaire (4 Go+). Activez-le avec le profil `transcription` :

```bash
docker compose --profile transcription up -d
```

Cela démarre un conteneur `faster-whisper-server` utilisant le modèle `base` sur CPU. Pour une transcription plus rapide :

- **Utilisez un modèle plus grand** : Modifiez `docker-compose.yml` et changez `WHISPER__MODEL` en `Systran/faster-whisper-small` ou `Systran/faster-whisper-medium`
- **Utilisez l'accélération GPU** : Changez `WHISPER__DEVICE` en `cuda` et ajoutez les ressources GPU au service whisper

## Optionnel : Activer Asterisk

Pour la téléphonie SIP auto-hébergée (voir [Configuration Asterisk](/docs/deploy/providers/asterisk)) :

```bash
# Définir le secret partagé du bridge
echo "BRIDGE_SECRET=$(openssl rand -hex 32)" >> .env

docker compose --profile asterisk up -d
```

## Optionnel : Activer Signal

Pour la messagerie Signal (voir [Configuration Signal](/docs/deploy/providers/signal)) :

```bash
docker compose --profile signal up -d
```

Vous devrez enregistrer le numéro Signal via le conteneur signal-cli. Consultez le [guide de configuration Signal](/docs/deploy/providers/signal) pour les instructions.

## Mise à jour

Tirez les dernières images et redémarrez :

```bash
docker compose pull
docker compose up -d
```

Vos données sont persistées dans les volumes Docker (`postgres-data`, `minio-data`, etc.) et survivent aux redémarrages de conteneurs et aux mises à jour d'images.

## Sauvegardes

### PostgreSQL

Utilisez `pg_dump` pour les sauvegardes de base de données :

```bash
docker compose exec postgres pg_dump -U llamenos llamenos > backup-$(date +%Y%m%d).sql
```

Pour restaurer :

```bash
docker compose exec -T postgres psql -U llamenos llamenos < backup-20250101.sql
```

### Stockage MinIO

MinIO stocke les fichiers téléchargés, les enregistrements et les pièces jointes :

```bash
# En utilisant le client MinIO (mc)
docker compose exec minio mc alias set local http://localhost:9000 $MINIO_ACCESS_KEY $MINIO_SECRET_KEY
docker compose exec minio mc mirror local/llamenos /tmp/minio-backup
docker compose cp minio:/tmp/minio-backup ./minio-backup-$(date +%Y%m%d)
```

### Sauvegardes automatisées

Pour la production, configurez une tâche cron :

```bash
# /etc/cron.d/llamenos-backup
0 3 * * * root cd /path/to/llamenos/deploy/docker && docker compose exec -T postgres pg_dump -U llamenos llamenos | gzip > /backups/llamenos-$(date +\%Y\%m\%d).sql.gz 2>&1 | logger -t llamenos-backup
```

## Surveillance

### Vérifications de santé

L'application expose un point de terminaison santé sur `/api/health`. Docker Compose inclut des vérifications de santé intégrées. Surveillez en externe avec n'importe quel outil de surveillance HTTP.

### Journaux

```bash
# Tous les services
docker compose logs -f

# Service spécifique
docker compose logs -f app

# 100 dernières lignes
docker compose logs --tail 100 app
```

### Utilisation des ressources

```bash
docker stats
```

## Dépannage

### L'application ne démarre pas

```bash
# Vérifier les journaux pour les erreurs
docker compose logs app

# Vérifier que .env est chargé
docker compose config

# Vérifier que PostgreSQL est sain
docker compose ps postgres
docker compose logs postgres
```

### Problèmes de certificats

Caddy a besoin des ports 80 et 443 ouverts pour les défis ACME. Vérifiez avec :

```bash
# Vérifier les journaux Caddy
docker compose logs caddy

# Vérifier que les ports sont accessibles
curl -I http://hotline.yourdomain.com
```

### Erreurs de connexion MinIO

Assurez-vous que le service MinIO est sain avant le démarrage de l'application :

```bash
docker compose ps minio
docker compose logs minio
```

## Architecture des services

![Docker Architecture](/diagrams/docker-architecture.svg)

## Étapes suivantes

- [Guide administrateur](/docs/admin-guide) — configurer la ligne
- [Vue d'ensemble de l'auto-hébergement](/docs/deploy/self-hosting) — comparer les options de déploiement
- [Déploiement Kubernetes](/docs/deploy/kubernetes) — migrer vers Helm
