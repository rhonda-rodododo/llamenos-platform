---
title: "Configuration : Plivo"
description: Guide etape par etape pour configurer Plivo comme fournisseur de telephonie.
---

Plivo est un fournisseur de telephonie cloud economique avec une API simple. Il utilise un controle d'appel base sur XML similaire a TwiML, rendant l'integration avec Llamenos transparente.

## Prerequis

- Un [compte Plivo](https://console.plivo.com/accounts/register/) (credit d'essai disponible)
- Votre instance Llamenos deployee et accessible via une URL publique

## 1. Creer un compte Plivo

Inscrivez-vous sur [console.plivo.com](https://console.plivo.com/accounts/register/). Apres verification, vous trouverez votre **Auth ID** et **Auth Token** sur la page d'accueil du tableau de bord.

## 2. Acheter un numero de telephone

1. Allez dans **Phone Numbers** > **Buy Numbers** dans la console Plivo
2. Selectionnez votre pays et recherchez des numeros avec la capacite vocale
3. Achetez un numero

## 3. Creer une application XML

Plivo utilise des "Applications XML" pour acheminer les appels :

1. Allez dans **Voice** > **XML Applications**
2. Cliquez sur **Add New Application**
3. Configurez :
   - **Application Name** : Llamenos Hotline
   - **Answer URL** : `https://your-worker-url.com/telephony/incoming` (POST)
   - **Hangup URL** : `https://your-worker-url.com/telephony/status` (POST)
4. Enregistrez l'application

## 4. Lier le numero de telephone

1. Allez dans **Phone Numbers** > **Your Numbers**
2. Cliquez sur votre numero de ligne
3. Sous **Voice**, selectionnez l'Application XML que vous avez creee a l'etape 3
4. Enregistrez

## 5. Configurer dans Llamenos

1. Connectez-vous en tant qu'administrateur
2. Allez dans **Parametres** > **Fournisseur de telephonie**
3. Selectionnez **Plivo** dans le menu deroulant des fournisseurs
4. Saisissez :
   - **Auth ID** : depuis le tableau de bord de la console Plivo
   - **Auth Token** : depuis le tableau de bord de la console Plivo
   - **Phone Number** : le numero que vous avez achete (format E.164)
5. Cliquez sur **Enregistrer**

## 6. Tester la configuration

Appelez votre numero de ligne. Vous devriez entendre le menu de selection de langue et etre achemine via le flux d'appel normal.

## Configuration WebRTC (optionnel)

Plivo WebRTC utilise le SDK navigateur avec vos identifiants existants :

1. Allez dans **Voice** > **Endpoints** dans la console Plivo
2. Creez un nouveau endpoint (il sert d'identite telephonique du navigateur)
3. Dans Llamenos, allez dans **Parametres** > **Fournisseur de telephonie**
4. Activez **Appels WebRTC**
5. Cliquez sur **Enregistrer**

L'adaptateur genere des tokens HMAC a duree limitee a partir de votre Auth ID et Auth Token pour une authentification securisee du navigateur.

## Notes specifiques a Plivo

- **XML vs TwiML** : Plivo utilise son propre format XML pour le controle d'appel, qui est similaire mais pas identique a TwiML. L'adaptateur Llamenos genere automatiquement le XML Plivo correct.
- **Answer URL vs Hangup URL** : Plivo separe le gestionnaire d'appel initial (Answer URL) du gestionnaire de fin d'appel (Hangup URL), contrairement a Twilio qui utilise un seul callback de statut.
- **Limites de debit** : Plivo a des limites de debit d'API qui varient selon le niveau de compte. Pour les lignes a haut volume, contactez le support Plivo pour augmenter les limites.

## Depannage

- **"Auth ID invalid"** : Le Auth ID n'est pas votre adresse e-mail. Trouvez-le sur la page d'accueil du tableau de bord de la console Plivo.
- **Les appels ne sont pas achemines** : Verifiez que le numero de telephone est lie a la bonne Application XML.
- **Erreurs de l'Answer URL** : Plivo attend des reponses XML valides. Consultez les journaux de votre Worker pour les erreurs de reponse.
- **Restrictions d'appels sortants** : Les comptes d'essai ont des limitations sur les appels sortants. Faites un upgrade pour l'utilisation en production.
