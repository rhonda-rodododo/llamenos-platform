---
title: Vue d'ensemble de l'auto-hébergement
description: Déployez Llamenos sur votre propre infrastructure avec Docker Compose ou Kubernetes.
---

Llamenos peut fonctionner sur Cloudflare Workers **ou** sur votre propre infrastructure. L'auto-hébergement vous donne un contrôle total sur la résidence des données, l'isolation réseau et les choix d'infrastructure — important pour les organisations qui ne peuvent pas utiliser de plateformes cloud tierces ou qui doivent respecter des exigences de conformité strictes.

## Options de déploiement

| Option | Idéal pour | Complexité | Mise à l'échelle |
|--------|-----------|------------|-----------------|
| [Cloudflare Workers](/docs/getting-started) | Démarrage le plus simple, edge mondial | Faible | Automatique |
| [Docker Compose](/docs/deploy-docker) | Auto-hébergement sur serveur unique | Moyenne | Noeud unique |
| [Kubernetes (Helm)](/docs/deploy-kubernetes) | Orchestration multi-services | Plus élevée | Horizontale (multi-réplicas) |

## Différences d'architecture

Les deux cibles de déploiement exécutent **exactement le même code applicatif**. La différence se situe dans la couche d'infrastructure :

| Composant | Cloudflare | Auto-hébergé |
|-----------|------------|--------------|
| **Runtime backend** | Cloudflare Workers | Node.js (via Hono) |
| **Stockage des données** | Durable Objects (KV) | PostgreSQL |
| **Stockage blob** | R2 | RustFS (compatible S3) |
| **Transcription** | Whisper côté client (WASM) | Whisper côté client (WASM) |
| **Fichiers statiques** | Workers Assets | Caddy / Hono serveStatic |
| **Événements temps réel** | Relais Nostr (Nosflare) | Relais Nostr (strfry) |
| **Terminaison TLS** | Edge Cloudflare | Caddy (HTTPS automatique) |
| **Coût** | À l'usage (offre gratuite disponible) | Vos coûts de serveur |

## Ce dont vous avez besoin

### Configuration minimale

- Un serveur Linux (2 coeurs CPU, 2 Go de RAM minimum)
- Docker et Docker Compose v2 (ou un cluster Kubernetes pour Helm)
- Un nom de domaine pointant vers votre serveur
- Une paire de clés administrateur (générée avec `bun run bootstrap-admin`)
- Au moins un canal de communication (fournisseur vocal, SMS, etc.)

### Composants optionnels

- **Transcription Whisper** — nécessite 4 Go+ de RAM (CPU) ou un GPU pour un traitement plus rapide
- **Asterisk** — pour la téléphonie SIP auto-hébergée (voir [Configuration Asterisk](/docs/setup-asterisk))
- **Bridge Signal** — pour la messagerie Signal (voir [Configuration Signal](/docs/setup-signal))

## Comparaison rapide

**Choisissez Docker Compose si :**
- Vous fonctionnez sur un serveur unique ou un VPS
- Vous voulez la configuration auto-hébergée la plus simple possible
- Vous êtes à l'aise avec les bases de Docker

**Choisissez Kubernetes (Helm) si :**
- Vous avez déjà un cluster K8s
- Vous avez besoin d'une mise à l'échelle horizontale (réplicas multiples)
- Vous souhaitez intégrer les outils K8s existants (cert-manager, external-secrets, etc.)

## Considérations de sécurité

L'auto-hébergement vous donne plus de contrôle mais aussi plus de responsabilités :

- **Données au repos** : Les données PostgreSQL sont stockées non chiffrées par défaut. Utilisez le chiffrement complet du disque (LUKS, dm-crypt) sur votre serveur, ou activez PostgreSQL TDE si disponible. Notez que les notes d'appel et les transcriptions sont déjà chiffrées de bout en bout — le serveur ne voit jamais le texte en clair.
- **Sécurité réseau** : Utilisez un pare-feu pour restreindre l'accès. Seuls les ports 80/443 doivent être publiquement accessibles.
- **Secrets** : Ne mettez jamais de secrets dans les fichiers Docker Compose ou le contrôle de version. Utilisez des fichiers `.env` (exclus des images) ou les secrets Docker/Kubernetes.
- **Mises à jour** : Tirez régulièrement de nouvelles images. Surveillez le [changelog](https://github.com/your-org/llamenos/blob/main/CHANGELOG.md) pour les correctifs de sécurité.
- **Sauvegardes** : Sauvegardez régulièrement la base de données PostgreSQL et le stockage RustFS. Consultez la section sauvegardes de chaque guide de déploiement.

## Étapes suivantes

- [Déploiement Docker Compose](/docs/deploy-docker) — opérationnel en 10 minutes
- [Déploiement Kubernetes](/docs/deploy-kubernetes) — déployer avec Helm
- [Premiers pas](/docs/getting-started) — déploiement Cloudflare Workers
