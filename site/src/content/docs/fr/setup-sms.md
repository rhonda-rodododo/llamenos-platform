---
title: "Configuration : SMS"
description: Activez la messagerie SMS entrante et sortante via votre fournisseur de telephonie.
---

La messagerie SMS dans Llamenos reutilise les identifiants de votre fournisseur de telephonie vocale existant. Aucun service SMS separe n'est requis — si vous avez deja configure Twilio, SignalWire, Vonage ou Plivo pour la voix, le SMS fonctionne avec le meme compte.

## Fournisseurs pris en charge

| Fournisseur | Support SMS | Notes |
|-------------|------------|-------|
| **Twilio** | Oui | SMS bidirectionnel via Twilio Messaging API |
| **SignalWire** | Oui | Compatible API Twilio — meme interface |
| **Vonage** | Oui | SMS via Vonage REST API |
| **Plivo** | Oui | SMS via Plivo Message API |
| **Asterisk** | Non | Asterisk ne prend pas en charge le SMS nativement |

## 1. Activer le SMS dans les parametres admin

Naviguez vers **Parametres admin > Canaux de messagerie** (ou utilisez l'assistant de configuration a la premiere connexion) et activez **SMS**.

Configurez les parametres SMS :
- **Message de reponse automatique** — message de bienvenue optionnel envoye aux nouveaux contacts
- **Reponse hors heures** — message optionnel envoye en dehors des heures d'equipe

## 2. Configurer le webhook

Dirigez le webhook SMS de votre fournisseur de telephonie vers votre Worker :

```
POST https://your-worker.your-domain.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. Allez dans Twilio Console > Phone Numbers > Active Numbers
2. Selectionnez votre numero de telephone
3. Sous **Messaging**, definissez l'URL du webhook pour « A message comes in » sur l'URL ci-dessus
4. Definissez la methode HTTP sur **POST**

### Vonage

1. Allez dans Vonage API Dashboard > Applications
2. Selectionnez votre application
3. Sous **Messages**, definissez l'Inbound URL sur l'URL du webhook ci-dessus

### Plivo

1. Allez dans Plivo Console > Messaging > Applications
2. Creez ou modifiez une application de messagerie
3. Definissez le Message URL sur l'URL du webhook ci-dessus
4. Assignez l'application a votre numero de telephone

## 3. Test

Envoyez un SMS a votre numero de ligne d'urgence. Vous devriez voir la conversation apparaitre dans l'onglet **Conversations** du panneau admin.

## Fonctionnement

1. Un SMS arrive chez votre fournisseur, qui envoie un webhook a votre Worker
2. Le Worker valide la signature du webhook (HMAC specifique au fournisseur)
3. Le message est analyse et stocke dans le ConversationDO
4. Les benevoles en service sont notifies via les evenements du relai Nostr
5. Les benevoles repondent depuis l'onglet Conversations — les reponses sont envoyees via l'API SMS de votre fournisseur

## Notes de securite

- Les messages SMS transitent sur le reseau operateur en texte clair — votre fournisseur et les operateurs peuvent les lire
- Les messages entrants sont stockes dans le ConversationDO apres reception
- Les numeros de telephone des expediteurs sont haches avant stockage (confidentialite)
- Les signatures de webhook sont validees par fournisseur (HMAC-SHA1 pour Twilio, etc.)
