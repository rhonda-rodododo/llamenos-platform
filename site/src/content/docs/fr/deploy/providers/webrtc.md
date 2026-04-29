---
title: Appels WebRTC dans le navigateur
description: Activez la prise d'appels dans le navigateur pour les benevoles via WebRTC.
---

WebRTC (Web Real-Time Communication) permet aux benevoles de repondre aux appels de la ligne directement dans leur navigateur, sans avoir besoin d'un telephone. C'est utile pour les benevoles qui preferent ne pas partager leur numero de telephone ou qui travaillent depuis un ordinateur.

## Comment ca fonctionne

1. L'administrateur active WebRTC dans les parametres du fournisseur de telephonie
2. Les benevoles definissent leur preference d'appel sur "Navigateur" dans leur profil
3. Quand un appel arrive, l'application Llamenos sonne dans le navigateur avec une notification
4. Le benevole clique sur "Repondre" et l'appel se connecte via le navigateur en utilisant son microphone

L'audio de l'appel est achemine du fournisseur de telephonie vers le navigateur du benevole via une connexion WebRTC. La qualite de l'appel depend de la connexion internet du benevole.

## Prerequis

### Configuration cote administrateur

- Un fournisseur de telephonie pris en charge avec WebRTC active (Twilio, SignalWire, Vonage ou Plivo)
- Les identifiants WebRTC specifiques au fournisseur configures (voir les guides de configuration des fournisseurs)
- WebRTC active dans **Parametres** > **Fournisseur de telephonie**

### Conditions requises pour les benevoles

- Un navigateur moderne (Chrome, Firefox, Edge ou Safari 14.1+)
- Un microphone fonctionnel
- Une connexion internet stable (minimum 100 kbps en montant/descendant)
- Les autorisations de notification du navigateur accordees

## Configuration par fournisseur

Chaque fournisseur de telephonie necessite des identifiants differents pour WebRTC :

### Twilio / SignalWire

1. Creez une **cle API** dans la console du fournisseur
2. Creez une **application TwiML/LaML** avec le Voice URL defini sur `https://your-worker-url.com/telephony/webrtc-incoming`
3. Dans Llamenos, saisissez le API Key SID, le API Key Secret et le Application SID

### Vonage

1. Votre application Vonage inclut deja la capacite WebRTC
2. Dans Llamenos, collez la **cle privee** de votre application (format PEM)
3. Le Application ID est deja configure lors de la configuration initiale

### Plivo

1. Creez un **Endpoint** dans la console Plivo sous **Voice** > **Endpoints**
2. WebRTC utilise votre Auth ID et Auth Token existants
3. Activez WebRTC dans Llamenos -- aucun identifiant supplementaire necessaire

### Asterisk

WebRTC avec Asterisk necessite une configuration SIP.js avec le transport WebSocket. C'est plus complexe qu'avec les fournisseurs cloud :

1. Activez le transport WebSocket dans `http.conf` d'Asterisk
2. Creez des endpoints PJSIP pour les clients WebRTC avec DTLS-SRTP
3. Llamenos configure automatiquement le client SIP.js quand Asterisk est selectionne

Consultez le [guide de configuration Asterisk](/docs/deploy/providers/asterisk) pour tous les details.

## Configuration des preferences d'appel des benevoles

Les benevoles configurent leur preference d'appel dans l'application :

1. Connectez-vous a Llamenos
2. Allez dans **Parametres** (icone d'engrenage)
3. Sous **Preferences d'appel**, selectionnez **Navigateur** au lieu de **Telephone**
4. Accordez les autorisations de microphone et de notification lorsque demande
5. Gardez l'onglet Llamenos ouvert pendant votre equipe

Quand un appel arrive, vous verrez une notification du navigateur et un indicateur de sonnerie dans l'application. Cliquez sur **Repondre** pour vous connecter.

## Compatibilite des navigateurs

| Navigateur | Bureau | Mobile | Remarques |
|---|---|---|---|
| Chrome | Oui | Oui | Recommande |
| Firefox | Oui | Oui | Support complet |
| Edge | Oui | Oui | Base Chromium, support complet |
| Safari | Oui (14.1+) | Oui (14.1+) | Necessite une interaction utilisateur pour demarrer l'audio |
| Brave | Oui | Limite | Peut necessiter de desactiver les boucliers pour le microphone |

## Conseils pour la qualite audio

- Utilisez un casque ou des ecouteurs pour eviter l'echo
- Fermez les autres applications qui utilisent le microphone
- Utilisez une connexion internet filaire si possible
- Desactivez les extensions de navigateur qui pourraient interferer avec WebRTC (extensions VPN, bloqueurs de publicite avec protection contre les fuites WebRTC)

## Depannage

### Pas d'audio

- **Verifiez les autorisations du microphone** : Cliquez sur l'icone du cadenas dans la barre d'adresse et assurez-vous que l'acces au microphone est sur "Autoriser"
- **Testez votre microphone** : Utilisez le test audio integre de votre navigateur ou un site comme [webcamtest.com](https://webcamtest.com)
- **Verifiez la sortie audio** : Assurez-vous que vos haut-parleurs ou votre casque sont selectionnes comme peripherique de sortie

### Les appels ne sonnent pas dans le navigateur

- **Notifications bloquees** : Verifiez que les notifications du navigateur sont activees pour le site Llamenos
- **Onglet non actif** : L'onglet Llamenos doit etre ouvert (il peut etre en arriere-plan, mais l'onglet doit exister)
- **Preference d'appel** : Verifiez que votre preference d'appel est definie sur "Navigateur" dans les Parametres
- **WebRTC non configure** : Demandez a votre administrateur de verifier que WebRTC est active et que les identifiants sont configures

### Problemes de pare-feu et de NAT

WebRTC utilise des serveurs STUN/TURN pour traverser les pare-feu et le NAT. Si les appels se connectent mais que vous n'entendez pas d'audio :

- **Pare-feu d'entreprise** : Certains pare-feu bloquent le trafic UDP sur les ports non standard. Demandez a votre equipe informatique d'autoriser le trafic UDP sur les ports 3478 et 10000-60000
- **NAT symetrique** : Certains routeurs utilisent un NAT symetrique qui peut empecher les connexions directes entre pairs. Les serveurs TURN du fournisseur de telephonie devraient gerer cela automatiquement
- **Interference VPN** : Les VPN peuvent interferer avec les connexions WebRTC. Essayez de deconnecter votre VPN pendant vos equipes

### Echo ou retour

- Utilisez des ecouteurs au lieu de haut-parleurs
- Reduisez la sensibilite du microphone dans les parametres audio de votre systeme d'exploitation
- Activez l'annulation d'echo dans votre navigateur (generalement active par defaut)
- Eloignez-vous des surfaces dures et reflechissantes
