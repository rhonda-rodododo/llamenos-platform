---
title: "Configuration : SMS"
description: Activez la messagerie SMS entrante et sortante via votre fournisseur de téléphonie.
---

La messagerie SMS dans Llamenos réutilise les identifiants de votre fournisseur de téléphonie vocale existant. Aucun service SMS séparé n'est requis — si vous avez déjà configuré Twilio, SignalWire, Vonage ou Plivo pour la voix, le SMS fonctionne avec le même compte.

## Fournisseurs pris en charge

| Fournisseur | Support SMS | Notes |
|-------------|------------|-------|
| **Twilio** | Oui | SMS bidirectionnel via Twilio Messaging API |
| **SignalWire** | Oui | Compatible API Twilio — même interface |
| **Vonage** | Oui | SMS via Vonage REST API |
| **Plivo** | Oui | SMS via Plivo Message API |
| **Asterisk** | Non | Asterisk ne prend pas en charge le SMS nativement |

## 1. Activer le SMS dans les paramètres admin

Naviguez vers **Paramètres admin > Canaux de messagerie** (ou utilisez l'assistant de configuration à la première connexion) et activez **SMS**.

Configurez les paramètres SMS :
- **Message de réponse automatique** — message de bienvenue optionnel envoyé aux nouveaux contacts
- **Réponse hors heures** — message optionnel envoyé en dehors des heures d'équipe

## 2. Configurer le webhook

Dirigez le webhook SMS de votre fournisseur de téléphonie vers votre Worker :

```
POST https://your-worker.your-domain.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. Allez dans Twilio Console > Phone Numbers > Active Numbers
2. Sélectionnez votre numéro de téléphone
3. Sous **Messaging**, définissez l'URL du webhook pour « A message comes in » sur l'URL ci-dessus
4. Définissez la méthode HTTP sur **POST**

### Vonage

1. Allez dans Vonage API Dashboard > Applications
2. Sélectionnez votre application
3. Sous **Messages**, définissez l'Inbound URL sur l'URL du webhook ci-dessus

### Plivo

1. Allez dans Plivo Console > Messaging > Applications
2. Créez ou modifiez une application de messagerie
3. Définissez le Message URL sur l'URL du webhook ci-dessus
4. Assignez l'application à votre numéro de téléphone

## 3. Test

Envoyez un SMS à votre numéro de ligne d'urgence. Vous devriez voir la conversation apparaître dans l'onglet **Conversations** du panneau admin.

## Fonctionnement

1. Un SMS arrive chez votre fournisseur, qui envoie un webhook à votre Worker
2. Le Worker valide la signature du webhook (HMAC spécifique au fournisseur)
3. Le message est analysé et stocké dans le ConversationDO
4. Les bénévoles en service sont notifiés via les événements du relais Nostr
5. Les bénévoles répondent depuis l'onglet Conversations — les réponses sont envoyées via l'API SMS de votre fournisseur

## Notes de sécurité

- Les messages SMS transitent sur le réseau opérateur en texte clair — votre fournisseur et les opérateurs peuvent les lire
- Les messages entrants sont stockés dans le ConversationDO après réception
- Les numéros de téléphone des expéditeurs sont hachés avant stockage (confidentialité)
- Les signatures de webhook sont validées par fournisseur (HMAC-SHA1 pour Twilio, etc.)
