---
title: "Configuration : Twilio"
description: Guide etape par etape pour configurer Twilio comme fournisseur de telephonie.
---

Twilio est le fournisseur de telephonie par defaut de Llamenos et le plus facile a mettre en place. Ce guide vous accompagne dans la creation du compte, la configuration du numero de telephone et la configuration des webhooks.

## Prerequis

- Un [compte Twilio](https://www.twilio.com/try-twilio) (l'essai gratuit fonctionne pour les tests)
- Votre instance Llamenos deployee et accessible via une URL publique

## 1. Creer un compte Twilio

Inscrivez-vous sur [twilio.com/try-twilio](https://www.twilio.com/try-twilio). Verifiez votre adresse e-mail et votre numero de telephone. Twilio offre un credit d'essai pour les tests.

## 2. Acheter un numero de telephone

1. Allez dans **Phone Numbers** > **Manage** > **Buy a number** dans la console Twilio
2. Recherchez un numero avec la capacite **Voice** dans l'indicatif de votre choix
3. Cliquez sur **Buy** et confirmez

Notez ce numero -- vous le saisirez dans les parametres d'administration de Llamenos.

## 3. Obtenir votre Account SID et Auth Token

1. Allez sur le [tableau de bord de la console Twilio](https://console.twilio.com)
2. Trouvez votre **Account SID** et votre **Auth Token** sur la page principale
3. Cliquez sur l'icone de l'oeil pour reveler le Auth Token

## 4. Configurer les webhooks

Dans la console Twilio, accedez a la configuration de votre numero de telephone :

1. Allez dans **Phone Numbers** > **Manage** > **Active Numbers**
2. Cliquez sur votre numero de ligne
3. Sous **Voice Configuration**, definissez :
   - **A call comes in** : Webhook, `https://your-worker-url.com/telephony/incoming`, HTTP POST
   - **Call status changes** : `https://your-worker-url.com/telephony/status`, HTTP POST

Remplacez `your-worker-url.com` par l'URL reelle de votre Cloudflare Worker.

## 5. Configurer dans Llamenos

1. Connectez-vous en tant qu'administrateur
2. Allez dans **Parametres** > **Fournisseur de telephonie**
3. Selectionnez **Twilio** dans le menu deroulant des fournisseurs
4. Saisissez :
   - **Account SID** : de l'etape 3
   - **Auth Token** : de l'etape 3
   - **Phone Number** : le numero que vous avez achete (format E.164, ex. : `+15551234567`)
5. Cliquez sur **Enregistrer**

## 6. Tester la configuration

Appelez votre numero de ligne depuis un telephone. Vous devriez entendre le menu de selection de langue. Si des benevoles sont en service, l'appel leur sera transmis.

## Configuration WebRTC (optionnel)

Pour permettre aux benevoles de repondre aux appels dans leur navigateur plutot que sur leur telephone :

### Creer une cle API

1. Allez dans **Account** > **API keys & tokens** dans la console Twilio
2. Cliquez sur **Create API Key**
3. Choisissez le type de cle **Standard**
4. Enregistrez le **SID** et le **Secret** -- le secret n'est affiche qu'une seule fois

### Creer une application TwiML

1. Allez dans **Voice** > **Manage** > **TwiML Apps**
2. Cliquez sur **Create new TwiML App**
3. Definissez le **Voice Request URL** sur `https://your-worker-url.com/telephony/webrtc-incoming`
4. Enregistrez et notez le **App SID**

### Activer dans Llamenos

1. Allez dans **Parametres** > **Fournisseur de telephonie**
2. Activez **Appels WebRTC**
3. Saisissez :
   - **API Key SID** : de la cle API que vous avez creee
   - **API Key Secret** : de la cle API que vous avez creee
   - **TwiML App SID** : de l'application TwiML que vous avez creee
4. Cliquez sur **Enregistrer**

Consultez [Appels WebRTC dans le navigateur](/docs/deploy/providers/webrtc) pour la configuration des benevoles et le depannage.

## Depannage

- **Les appels n'arrivent pas** : Verifiez que l'URL du webhook est correcte et que votre Worker est deploye. Consultez les journaux d'erreurs de la console Twilio.
- **Erreurs "Invalid webhook"** : Assurez-vous que l'URL du webhook utilise HTTPS et renvoie du TwiML valide.
- **Limitations du compte d'essai** : Les comptes d'essai ne peuvent appeler que les numeros verifies. Passez a un compte payant pour la production.
- **Echecs de validation des webhooks** : Assurez-vous que le Auth Token dans Llamenos correspond a celui de la console Twilio.
