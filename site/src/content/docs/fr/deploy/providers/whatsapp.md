---
title: "Configuration : WhatsApp"
description: Connectez WhatsApp Business via la Meta Cloud API pour la messagerie chiffrée.
---

Llamenos prend en charge la messagerie WhatsApp Business via la Meta Cloud API (Graph API v21.0). WhatsApp permet une messagerie riche avec prise en charge du texte, des images, des documents, de l'audio et des messages interactifs.

## Prérequis

- Un [compte Meta Business](https://business.facebook.com)
- Un numéro de téléphone WhatsApp Business API
- Une application développeur Meta avec le produit WhatsApp activé

## Modes d'intégration

Llamenos prend en charge deux modes d'intégration WhatsApp :

### Meta Direct (recommandé)

Connectez-vous directement à la Meta Cloud API. Offre un contrôle total et toutes les fonctionnalités.

**Identifiants requis :**
- **Phone Number ID** — l'identifiant de votre numéro WhatsApp Business
- **Business Account ID** — l'identifiant de votre compte Meta Business
- **Access Token** — un token d'accès Meta API à longue durée
- **Verify Token** — une chaîne personnalisée que vous choisissez pour la vérification webhook
- **App Secret** — le secret de votre application Meta (pour la validation de la signature webhook)

### Mode Twilio

Si vous utilisez déjà Twilio pour la voix, vous pouvez router WhatsApp via votre compte Twilio. Configuration plus simple, mais certaines fonctionnalités peuvent être limitées.

**Identifiants requis :**
- Vos Twilio Account SID et Auth Token existants, et un expéditeur WhatsApp connecté à Twilio

## 1. Créer une application Meta

1. Allez sur [developers.facebook.com](https://developers.facebook.com)
2. Créez une nouvelle application (type : Business)
3. Ajoutez le produit **WhatsApp**
4. Dans WhatsApp > Getting Started, notez votre **Phone Number ID** et **Business Account ID**
5. Générez un token d'accès permanent (Settings > Access Tokens)

## 2. Configurer le webhook

Dans le tableau de bord développeur Meta :

1. Allez dans WhatsApp > Configuration > Webhook
2. Définissez le Callback URL sur :
   ```
   https://your-worker.your-domain.com/api/messaging/whatsapp/webhook
   ```
3. Définissez le Verify Token sur la même chaîne que vous saisirez dans les paramètres admin Llamenos
4. Abonnez-vous au champ webhook `messages`

Meta enverra une requête GET pour vérifier le webhook. Votre Worker répondra avec le challenge si le token de vérification correspond.

## 3. Activer WhatsApp dans les paramètres admin

Naviguez vers **Paramètres admin > Canaux de messagerie** (ou utilisez l'assistant de configuration) et activez **WhatsApp**.

Sélectionnez le mode **Meta Direct** ou **Twilio** et saisissez les identifiants requis.

Configurez les paramètres optionnels :
- **Message de réponse automatique** — envoyé aux nouveaux contacts
- **Réponse hors heures** — envoyée en dehors des heures d'équipe

## 4. Test

Envoyez un message WhatsApp à votre numéro Business. La conversation devrait apparaître dans l'onglet **Conversations**.

## Fenêtre de messagerie de 24 heures

WhatsApp impose une fenêtre de messagerie de 24 heures :
- Vous pouvez répondre à un utilisateur dans les 24 heures suivant son dernier message
- Après 24 heures, vous devez utiliser un **message template** approuvé pour relancer la conversation
- Llamenos gère cela automatiquement — si la fenêtre a expiré, il envoie un message template pour relancer la conversation

## Support média

WhatsApp prend en charge les messages média riches :
- **Images** (JPEG, PNG)
- **Documents** (PDF, Word, etc.)
- **Audio** (MP3, OGG)
- **Vidéo** (MP4)
- Partage de **localisation**
- Boutons et messages de liste **interactifs**

Les pièces jointes média apparaissent en ligne dans la vue conversation.

## Notes de sécurité

- WhatsApp utilise le chiffrement de bout en bout entre l'utilisateur et l'infrastructure de Meta
- Meta peut techniquement accéder au contenu des messages sur ses serveurs
- Les messages sont stockés dans Llamenos après réception depuis le webhook
- Les signatures de webhook sont validées avec HMAC-SHA256 et votre secret d'application
- Pour une confidentialité maximale, envisagez d'utiliser Signal au lieu de WhatsApp
