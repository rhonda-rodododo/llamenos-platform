---
title: Architecture
description: Vue d'ensemble de l'architecture système — dépôts, flux de données, couches de chiffrement et communication en temps réel.
---

Cette page explique comment Llamenos est structuré, comment les données circulent dans le système et où le chiffrement est appliqué.

## Structure des dépôts

Llamenos est réparti sur trois dépôts qui partagent un protocole commun et un noyau cryptographique :

```
llamenos              llamenos-core           llamenos-platform
(Desktop + API)       (Crypto partagée)       (Application mobile)
+--------------+      +--------------+        +--------------+
| Tauri v2     |      | Rust crate   |        | React Native |
| Vite + React |      | - Native lib |        | iOS + Android|
| CF Workers   |      | - WASM pkg   |        | UniFFI bind  |
| Durable Objs |      | - UniFFI     |        |              |
+--------------+      +--------------+        +--------------+
       |                  ^      ^                   |
       |  path dep        |      |    UniFFI         |
       +------------------+      +-------------------+
```

- **llamenos** — L'application de bureau (Tauri v2 avec une webview Vite + React), le backend Cloudflare Worker et le backend Node.js auto-hébergé. Il s'agit du dépôt principal.
- **llamenos-core** — Un crate Rust partagé qui implémente toutes les opérations cryptographiques : chiffrement par enveloppe ECIES, signatures Schnorr, dérivation de clé PBKDF2, HKDF et XChaCha20-Poly1305. Compilé en code natif (pour Tauri), WASM (pour le navigateur) et liaisons UniFFI (pour mobile).
- **llamenos-platform** — L'application mobile React Native pour iOS et Android. Utilise les liaisons UniFFI pour appeler le même code Rust de cryptographie.

Les trois plateformes implémentent le même protocole filaire défini dans `docs/protocol/PROTOCOL.md`.

## Flux de données

### Appel entrant

```
Appelant (téléphone)
    |
    v
Fournisseur de téléphonie (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | Webhook HTTP
    v
Worker API  -->  CallRouterDO
    |                |
    |                | Consulte ShiftManagerDO pour les bénévoles en service
    |                | Lance une sonnerie en parallèle pour tous les bénévoles disponibles
    |                v
    |           Fournisseur de téléphonie (appels sortants vers les téléphones des bénévoles)
    |
    | Premier bénévole qui répond
    v
CallRouterDO  -->  Connecte l'appelant et le bénévole
    |
    | Fin de l'appel
    v
Client (navigateur/application du bénévole)
    |
    | Chiffre la note avec une clé unique par note
    | Enveloppe la clé via ECIES pour soi-même + chaque administrateur
    v
Worker API  -->  RecordsDO  (stocke la note chiffrée + les clés enveloppées)
```

### Message entrant (SMS / WhatsApp / Signal)

```
Contact (SMS / WhatsApp / Signal)
    |
    | Webhook du fournisseur
    v
Worker API  -->  ConversationDO
    |                |
    |                | Chiffre immédiatement le contenu du message
    |                | Enveloppe la clé symétrique via ECIES pour le bénévole assigné + admins
    |                | Supprime le texte en clair
    |                v
    |           Relais Nostr (événement hub chiffré notifie les clients en ligne)
    |
    v
Client (navigateur/application du bénévole)
    |
    | Déchiffre le message avec sa propre clé privée
    | Compose une réponse, chiffre le message sortant
    v
Worker API  -->  ConversationDO  -->  Fournisseur de messagerie (envoie la réponse)
```

## Durable Objects

Le backend utilise six Cloudflare Durable Objects (ou leurs équivalents PostgreSQL pour les déploiements auto-hébergés) :

| Durable Object | Responsabilité |
|---|---|
| **IdentityDO** | Gère les identités des bénévoles, les clés publiques, les noms d'affichage et les identifiants WebAuthn. Gère la création et la validation des invitations. |
| **SettingsDO** | Stocke la configuration de la permanence téléphonique : nom, canaux activés, identifiants de fournisseur, champs de notes personnalisés, paramètres d'atténuation du spam, indicateurs de fonctionnalité. |
| **RecordsDO** | Stocke les notes d'appels chiffrées, les rapports chiffrés et les métadonnées des pièces jointes. Gère la recherche de notes (sur les métadonnées chiffrées). |
| **ShiftManagerDO** | Gère les plannings de permanence récurrents, les groupes d'appel et les affectations de permanence des bénévoles. Détermine qui est en service à tout moment. |
| **CallRouterDO** | Orchestre le routage des appels en temps réel : sonnerie en parallèle, terminaison au premier décroché, statut de pause, suivi des appels actifs. Génère les réponses TwiML/fournisseur. |
| **ConversationDO** | Gère les conversations de messagerie par fils de discussion sur SMS, WhatsApp et Signal. Gère le chiffrement des messages à l'ingestion, l'affectation des conversations et les réponses sortantes. |

Tous les DOs sont accessibles en tant que singletons via `idFromName()` et routés en interne à l'aide d'un `DORouter` léger (correspondance de méthode + schéma de chemin).

## Matrice de chiffrement

| Données | Chiffré ? | Algorithme | Qui peut déchiffrer |
|---|---|---|---|
| Notes d'appels | Oui (E2EE) | XChaCha20-Poly1305 + enveloppe ECIES | Auteur de la note + tous les admins |
| Champs personnalisés de notes | Oui (E2EE) | Idem que les notes | Auteur de la note + tous les admins |
| Rapports | Oui (E2EE) | Idem que les notes | Auteur du rapport + tous les admins |
| Pièces jointes des rapports | Oui (E2EE) | XChaCha20-Poly1305 (en flux) | Auteur du rapport + tous les admins |
| Contenu des messages | Oui (E2EE) | XChaCha20-Poly1305 + enveloppe ECIES | Bénévole assigné + tous les admins |
| Transcriptions | Oui (au repos) | XChaCha20-Poly1305 | Créateur de la transcription + tous les admins |
| Événements hub (Nostr) | Oui (symétrique) | XChaCha20-Poly1305 avec clé hub | Tous les membres actuels du hub |
| nsec du bénévole | Oui (au repos) | PBKDF2 + XChaCha20-Poly1305 (PIN) | Bénévole uniquement |
| Entrées du journal d'audit | Non (protection de l'intégrité) | Chaîne de hachage SHA-256 | Admins (lecture), système (écriture) |
| Numéros de téléphone des appelants | Non (côté serveur uniquement) | N/A | Serveur + admins |
| Numéros de téléphone des bénévoles | Stockés dans IdentityDO | N/A | Admins uniquement |

### Confidentialité persistante par note

Chaque note ou message reçoit une clé symétrique aléatoire unique. Cette clé est enveloppée via ECIES (clé éphémère secp256k1 + HKDF + XChaCha20-Poly1305) individuellement pour chaque lecteur autorisé. Compromettre la clé d'une note ne révèle rien sur les autres notes. Il n'y a pas de clés symétriques à longue durée de vie pour le chiffrement du contenu.

### Hiérarchie des clés

```
nsec du bénévole (BIP-340 Schnorr / secp256k1)
    |
    +-- Dérive le npub (clé publique x-only, 32 octets)
    |
    +-- Utilisé pour l'accord de clé ECIES (préfixe 02 pour la forme compressée)
    |
    +-- Signe les événements Nostr (signature Schnorr)

Clé hub (32 octets aléatoires, NON dérivée d'une identité)
    |
    +-- Chiffre les événements hub Nostr en temps réel
    |
    +-- Enveloppée par ECIES par membre via LABEL_HUB_KEY_WRAP
    |
    +-- Tournée au départ d'un membre

Clé par note (32 octets aléatoires)
    |
    +-- Chiffre le contenu de la note via XChaCha20-Poly1305
    |
    +-- Enveloppée par ECIES par lecteur (bénévole + chaque admin)
    |
    +-- Jamais réutilisée entre les notes
```

## Communication en temps réel

Les mises à jour en temps réel (nouveaux appels, messages, changements de permanence, présence) transitent par un relais Nostr :

- **Auto-hébergé** : relais strfry fonctionnant aux côtés de l'application dans Docker/Kubernetes
- **Cloudflare** : Nosflare (relais basé sur Cloudflare Workers)

Tous les événements sont éphémères (kind 20001) et chiffrés avec la clé hub. Les événements utilisent des tags génériques (`["t", "llamenos:event"]`) afin que le relais ne puisse pas distinguer les types d'événements. Le champ de contenu contient du texte chiffré XChaCha20-Poly1305.

### Flux d'événements

```
Client A (action du bénévole)
    |
    | Chiffre le contenu de l'événement avec la clé hub
    | Signe en tant qu'événement Nostr (Schnorr)
    v
Relais Nostr (strfry / Nosflare)
    |
    | Diffuse aux abonnés
    v
Client B, C, D...
    |
    | Vérifie la signature Schnorr
    | Déchiffre le contenu avec la clé hub
    v
Met à jour l'état de l'interface locale
```

Le relais voit des blobs chiffrés et des signatures valides, mais ne peut pas lire le contenu des événements ni déterminer quelles actions sont effectuées.

## Couches de sécurité

### Couche transport

- Toutes les communications client-serveur via HTTPS (TLS 1.3)
- Connexions WebSocket au relais Nostr via WSS
- La politique de sécurité du contenu (CSP) restreint les sources de scripts, les connexions et les ancêtres de frames
- Le schéma d'isolation Tauri sépare les IPC de la webview

### Couche applicative

- Authentification via des paires de clés Nostr (signatures BIP-340 Schnorr)
- Jetons de session WebAuthn pour la commodité multi-appareils
- Contrôle d'accès basé sur les rôles (appelant, bénévole, rapporteur, admin)
- Les 25 constantes de séparation de domaine cryptographique définies dans `crypto-labels.ts` préviennent les attaques inter-protocoles

### Chiffrement au repos

- Notes d'appels, rapports, messages et transcriptions chiffrés avant stockage
- Clés secrètes des bénévoles chiffrées avec des clés dérivées du PIN (PBKDF2)
- Tauri Stronghold fournit un stockage en coffre-fort chiffré sur le bureau
- Intégrité du journal d'audit protégée par une chaîne de hachage SHA-256

### Vérification des builds

- Builds reproductibles via `Dockerfile.build` avec `SOURCE_DATE_EPOCH`
- Noms de fichiers hachés par contenu pour les ressources frontend
- `CHECKSUMS.txt` publié avec les GitHub Releases
- Attestations de provenance SLSA
- Script de vérification : `scripts/verify-build.sh`

## Différences entre plateformes

| Fonctionnalité | Bureau (Tauri) | Mobile (React Native) | Navigateur (Cloudflare) |
|---|---|---|---|
| Backend crypto | Rust natif (via IPC) | Rust natif (via UniFFI) | WASM (llamenos-core) |
| Stockage des clés | Tauri Stronghold (chiffré) | Secure Enclave / Keystore | localStorage du navigateur (chiffré par PIN) |
| Transcription | Whisper côté client (WASM) | Non disponible | Whisper côté client (WASM) |
| Mise à jour automatique | Tauri updater | App Store / Play Store | Automatique (CF Workers) |
| Notifications push | OS natif (notification Tauri) | OS natif (FCM/APNS) | Notifications navigateur |
| Support hors ligne | Limité (nécessite l'API) | Limité (nécessite l'API) | Limité (nécessite l'API) |
