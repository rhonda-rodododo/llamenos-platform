---
title: "Configuration : Vonage"
description: Guide etape par etape pour configurer Vonage comme fournisseur de telephonie.
---

Vonage (anciennement Nexmo) offre une forte couverture internationale et des tarifs competitifs. Il utilise un modele d'API different de Twilio -- les Applications Vonage regroupent votre numero, vos webhooks et vos identifiants.

## Prerequis

- Un [compte Vonage](https://dashboard.nexmo.com/sign-up) (credit gratuit disponible)
- Votre instance Llamenos deployee et accessible via une URL publique

## 1. Creer un compte Vonage

Inscrivez-vous sur le [tableau de bord de l'API Vonage](https://dashboard.nexmo.com/sign-up). Verifiez votre compte et notez votre **API Key** et **API Secret** depuis la page d'accueil du tableau de bord.

## 2. Acheter un numero de telephone

1. Allez dans **Numbers** > **Buy numbers** dans le tableau de bord Vonage
2. Selectionnez votre pays et choisissez un numero avec la capacite **Voice**
3. Achetez le numero

## 3. Creer une application Vonage

Vonage regroupe la configuration dans des "Applications" :

1. Allez dans **Applications** > **Create a new application**
2. Entrez un nom (ex. : "Llamenos Hotline")
3. Sous **Voice**, activez-le et definissez :
   - **Answer URL** : `https://your-worker-url.com/telephony/incoming` (POST)
   - **Event URL** : `https://your-worker-url.com/telephony/status` (POST)
4. Cliquez sur **Generate new application**
5. Enregistrez le **Application ID** affiche sur la page de confirmation
6. Telechargez le fichier de **cle privee** -- vous aurez besoin de son contenu pour la configuration

## 4. Lier le numero de telephone

1. Allez dans **Numbers** > **Your numbers**
2. Cliquez sur l'icone d'engrenage a cote de votre numero de ligne
3. Sous **Voice**, selectionnez l'Application que vous avez creee a l'etape 3
4. Cliquez sur **Save**

## 5. Configurer dans Llamenos

1. Connectez-vous en tant qu'administrateur
2. Allez dans **Parametres** > **Fournisseur de telephonie**
3. Selectionnez **Vonage** dans le menu deroulant des fournisseurs
4. Saisissez :
   - **API Key** : depuis la page d'accueil du tableau de bord Vonage
   - **API Secret** : depuis la page d'accueil du tableau de bord Vonage
   - **Application ID** : de l'etape 3
   - **Phone Number** : le numero que vous avez achete (format E.164)
5. Cliquez sur **Enregistrer**

## 6. Tester la configuration

Appelez votre numero de ligne. Vous devriez entendre le menu de selection de langue. Verifiez que les appels sont achemines vers les benevoles en service.

## Configuration WebRTC (optionnel)

Vonage WebRTC utilise les identifiants d'Application que vous avez deja crees :

1. Dans Llamenos, allez dans **Parametres** > **Fournisseur de telephonie**
2. Activez **Appels WebRTC**
3. Saisissez le contenu de la **cle privee** (le texte PEM complet du fichier que vous avez telecharge)
4. Cliquez sur **Enregistrer**

Le Application ID est deja configure. Vonage genere des JWT RS256 en utilisant la cle privee pour l'authentification du navigateur.

## Notes specifiques a Vonage

- **NCCO vs TwiML** : Vonage utilise NCCO (Nexmo Call Control Objects) au format JSON au lieu du balisage XML. L'adaptateur Llamenos genere automatiquement le format correct.
- **Format de l'Answer URL** : Vonage attend que l'answer URL renvoie du JSON (NCCO), pas du XML. Cela est gere par l'adaptateur.
- **Event URL** : Vonage envoie les evenements d'appel (sonnerie, reponse, termine) a l'event URL sous forme de requetes POST JSON.
- **Securite de la cle privee** : La cle privee est stockee de maniere chiffree. Elle ne quitte jamais le serveur -- elle est uniquement utilisee pour generer des tokens JWT a duree de vie limitee.

## Depannage

- **"Application not found"** : Verifiez que le Application ID correspond exactement. Vous pouvez le trouver sous **Applications** dans le tableau de bord Vonage.
- **Pas d'appels entrants** : Assurez-vous que le numero de telephone est lie a la bonne Application (etape 4).
- **Erreurs de cle privee** : Collez le contenu PEM complet y compris les lignes `-----BEGIN PRIVATE KEY-----` et `-----END PRIVATE KEY-----`.
- **Format de numero international** : Vonage requiert le format E.164. Incluez le `+` et le code pays.
