---
title: "Configuration : WhatsApp"
description: Connectez WhatsApp Business via la Meta Cloud API pour la messagerie chiffree.
---

Llamenos prend en charge la messagerie WhatsApp Business via la Meta Cloud API (Graph API v21.0). WhatsApp permet une messagerie riche avec prise en charge du texte, des images, des documents, de l'audio et des messages interactifs.

## Prerequis

- Un [compte Meta Business](https://business.facebook.com)
- Un numero de telephone WhatsApp Business API
- Une application developpeur Meta avec le produit WhatsApp active

## Modes d'integration

Llamenos prend en charge deux modes d'integration WhatsApp :

### Meta Direct (recommande)

Connectez-vous directement a la Meta Cloud API. Offre un controle total et toutes les fonctionnalites.

**Identifiants requis :**
- **Phone Number ID** — l'identifiant de votre numero WhatsApp Business
- **Business Account ID** — l'identifiant de votre compte Meta Business
- **Access Token** — un token d'acces Meta API a longue duree
- **Verify Token** — une chaine personnalisee que vous choisissez pour la verification webhook
- **App Secret** — le secret de votre application Meta (pour la validation de la signature webhook)

### Mode Twilio

Si vous utilisez deja Twilio pour la voix, vous pouvez router WhatsApp via votre compte Twilio. Configuration plus simple, mais certaines fonctionnalites peuvent etre limitees.

**Identifiants requis :**
- Vos Twilio Account SID et Auth Token existants, et un expediteur WhatsApp connecte a Twilio

## 1. Creer une application Meta

1. Allez sur [developers.facebook.com](https://developers.facebook.com)
2. Creez une nouvelle application (type : Business)
3. Ajoutez le produit **WhatsApp**
4. Dans WhatsApp > Getting Started, notez votre **Phone Number ID** et **Business Account ID**
5. Generez un token d'acces permanent (Settings > Access Tokens)

## 2. Configurer le webhook

Dans le tableau de bord developpeur Meta :

1. Allez dans WhatsApp > Configuration > Webhook
2. Definissez le Callback URL sur :
   ```
   https://your-worker.your-domain.com/api/messaging/whatsapp/webhook
   ```
3. Definissez le Verify Token sur la meme chaine que vous saisirez dans les parametres admin Llamenos
4. Abonnez-vous au champ webhook `messages`

Meta enverra une requete GET pour verifier le webhook. Votre Worker repondra avec le challenge si le token de verification correspond.

## 3. Activer WhatsApp dans les parametres admin

Naviguez vers **Parametres admin > Canaux de messagerie** (ou utilisez l'assistant de configuration) et activez **WhatsApp**.

Selectionnez le mode **Meta Direct** ou **Twilio** et saisissez les identifiants requis.

Configurez les parametres optionnels :
- **Message de reponse automatique** — envoye aux nouveaux contacts
- **Reponse hors heures** — envoyee en dehors des heures d'equipe

## 4. Test

Envoyez un message WhatsApp a votre numero Business. La conversation devrait apparaitre dans l'onglet **Conversations**.

## Fenetre de messagerie de 24 heures

WhatsApp impose une fenetre de messagerie de 24 heures :
- Vous pouvez repondre a un utilisateur dans les 24 heures suivant son dernier message
- Apres 24 heures, vous devez utiliser un **message template** approuve pour relancer la conversation
- Llamenos gere cela automatiquement — si la fenetre a expire, il envoie un message template pour relancer la conversation

## Support media

WhatsApp prend en charge les messages media riches :
- **Images** (JPEG, PNG)
- **Documents** (PDF, Word, etc.)
- **Audio** (MP3, OGG)
- **Video** (MP4)
- Partage de **localisation**
- Boutons et messages de liste **interactifs**

Les pieces jointes media apparaissent en ligne dans la vue conversation.

## Notes de securite

- WhatsApp utilise le chiffrement de bout en bout entre l'utilisateur et l'infrastructure de Meta
- Meta peut techniquement acceder au contenu des messages sur ses serveurs
- Les messages sont stockes dans Llamenos apres reception depuis le webhook
- Les signatures de webhook sont validees avec HMAC-SHA256 et votre secret d'application
- Pour une confidentialite maximale, envisagez d'utiliser Signal au lieu de WhatsApp
