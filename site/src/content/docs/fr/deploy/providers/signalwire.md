---
title: "Configuration : SignalWire"
description: Guide etape par etape pour configurer SignalWire comme fournisseur de telephonie.
---

SignalWire est une alternative economique a Twilio avec une API compatible. Il utilise LaML (un langage de balisage compatible TwiML), ce qui rend la migration entre Twilio et SignalWire simple.

## Prerequis

- Un [compte SignalWire](https://signalwire.com/signup) (essai gratuit disponible)
- Votre instance Llamenos deployee et accessible via une URL publique

## 1. Creer un compte SignalWire

Inscrivez-vous sur [signalwire.com/signup](https://signalwire.com/signup). Lors de l'inscription, vous choisirez un **nom de Space** (ex. : `myhotline`). L'URL de votre Space sera `myhotline.signalwire.com`. Notez ce nom -- vous en aurez besoin pour la configuration.

## 2. Acheter un numero de telephone

1. Dans votre tableau de bord SignalWire, allez dans **Phone Numbers**
2. Cliquez sur **Buy a Phone Number**
3. Recherchez un numero avec la capacite vocale
4. Achetez le numero

## 3. Obtenir vos identifiants

1. Allez dans **API** dans le tableau de bord SignalWire
2. Trouvez votre **Project ID** (il fonctionne comme le Account SID)
3. Creez un nouveau **API Token** si vous n'en avez pas -- il fonctionne comme le Auth Token

## 4. Configurer les webhooks

1. Allez dans **Phone Numbers** dans le tableau de bord
2. Cliquez sur votre numero de ligne
3. Sous **Voice Settings**, definissez :
   - **Handle calls using** : LaML Webhooks
   - **When a call comes in** : `https://your-worker-url.com/telephony/incoming` (POST)
   - **Call status callback** : `https://your-worker-url.com/telephony/status` (POST)

## 5. Configurer dans Llamenos

1. Connectez-vous en tant qu'administrateur
2. Allez dans **Parametres** > **Fournisseur de telephonie**
3. Selectionnez **SignalWire** dans le menu deroulant des fournisseurs
4. Saisissez :
   - **Account SID** : votre Project ID de l'etape 3
   - **Auth Token** : votre API Token de l'etape 3
   - **SignalWire Space** : votre nom de Space (juste le nom, pas l'URL complete -- ex. : `myhotline`)
   - **Phone Number** : le numero que vous avez achete (format E.164)
5. Cliquez sur **Enregistrer**

## 6. Tester la configuration

Appelez votre numero de ligne. Vous devriez entendre le menu de selection de langue suivi du flux d'appel.

## Configuration WebRTC (optionnel)

SignalWire WebRTC utilise le meme schema de cle API que Twilio :

1. Dans votre tableau de bord SignalWire, creez une **cle API** sous **API** > **Tokens**
2. Creez une **application LaML** :
   - Allez dans **LaML** > **LaML Applications**
   - Definissez le Voice URL sur `https://your-worker-url.com/telephony/webrtc-incoming`
   - Notez le Application SID
3. Dans Llamenos, allez dans **Parametres** > **Fournisseur de telephonie**
4. Activez **Appels WebRTC**
5. Saisissez le API Key SID, le API Key Secret et le Application SID
6. Cliquez sur **Enregistrer**

## Differences avec Twilio

- **LaML vs TwiML** : SignalWire utilise LaML, qui est fonctionnellement identique a TwiML. Llamenos gere cela automatiquement.
- **URL du Space** : Les appels API vont vers `{space}.signalwire.com` au lieu de `api.twilio.com`. L'adaptateur gere cela via le nom de Space que vous fournissez.
- **Tarifs** : SignalWire est generalement 30 a 40 % moins cher que Twilio pour les appels vocaux.
- **Parite des fonctionnalites** : Toutes les fonctionnalites de Llamenos (enregistrement, transcription, CAPTCHA, messagerie vocale) fonctionnent de maniere identique avec SignalWire.

## Depannage

- **Erreurs "Space not found"** : Verifiez le nom du Space (juste le sous-domaine, pas l'URL complete).
- **Echecs de webhook** : Assurez-vous que l'URL de votre Worker est accessible publiquement et utilise HTTPS.
- **Problemes de token API** : Les tokens SignalWire peuvent expirer. Creez un nouveau token si vous obtenez des erreurs d'authentification.
