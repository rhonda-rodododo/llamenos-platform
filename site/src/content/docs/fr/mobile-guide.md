---
title: Guide mobile
description: Installez et configurez l'application mobile Llamenos sur iOS et Android.
---

L'application mobile Llamenos permet aux bénévoles de répondre aux appels, réagir aux messages et rédiger des notes chiffrées depuis leur téléphone. Elle est construite avec React Native et partage le même coeur cryptographique Rust que l'application de bureau.

## Qu'est-ce que l'application mobile ?

L'application mobile est un compagnon de l'application de bureau. Elle se connecte au même backend Llamenos (Cloudflare Workers ou auto-hébergé) et utilise le même protocole, permettant aux bénévoles de basculer entre bureau et mobile de manière transparente.

L'application mobile se trouve dans un dépôt séparé (`llamenos-platform`) mais partage :

- **llamenos-core** — Le même crate Rust pour toutes les opérations cryptographiques, compilé via UniFFI pour iOS et Android
- **Protocole** — Le même format filaire, les mêmes endpoints API et le même schéma de chiffrement
- **Backend** — Le même Cloudflare Worker ou serveur auto-hébergé

## Télécharger et installer

### Android

L'application mobile est actuellement distribuée en tant qu'APK pour l'installation manuelle :

1. Téléchargez le dernier fichier `.apk` depuis la page [GitHub Releases](https://github.com/rhonda-rodododo/llamenos-platform/releases/latest)
2. Sur votre appareil Android, allez dans **Paramètres > Sécurité** et activez **Installation depuis des sources inconnues** (ou activez-le par application lorsque demandé)
3. Ouvrez l'APK téléchargé et appuyez sur **Installer**
4. Une fois installé, ouvrez Llamenos depuis votre tiroir d'applications

La distribution via App Store et Play Store est prévue pour une version future.

### iOS

Les builds iOS sont disponibles en tant que versions bêta TestFlight :

1. Installez [TestFlight](https://apps.apple.com/app/testflight/id899247664) depuis l'App Store
2. Demandez à votre administrateur le lien d'invitation TestFlight
3. Ouvrez le lien sur votre appareil iOS pour rejoindre la bêta
4. Installez Llamenos depuis TestFlight

La distribution via l'App Store est prévue pour une version future.

## Configuration initiale

L'application mobile est configurée en la liant à un compte de bureau existant. Cela garantit que la même identité cryptographique est utilisée sur tous les appareils sans jamais transmettre la clé secrète en clair.

### Provisionnement d'appareil (scan QR)

1. Ouvrez l'application Llamenos de bureau et allez dans **Paramètres > Appareils**
2. Cliquez sur **Lier un nouvel appareil** — cela génère un code QR contenant un token de provisionnement à usage unique
3. Ouvrez l'application mobile Llamenos et appuyez sur **Lier l'appareil**
4. Scannez le code QR avec la caméra de votre téléphone
5. Les applications effectuent un échange de clés ECDH éphémère pour transférer votre matériel de clé chiffré en toute sécurité
6. Définissez un PIN sur l'application mobile pour protéger votre stockage de clés local
7. L'application mobile est maintenant liée et prête à l'emploi

Le processus de provisionnement ne transmet jamais votre nsec en clair. L'application de bureau enveloppe le matériel de clé avec le secret partagé éphémère, et l'application mobile le développe localement.

### Configuration manuelle (saisie du nsec)

Si vous ne pouvez pas scanner un code QR, vous pouvez saisir votre nsec directement :

1. Ouvrez l'application mobile et appuyez sur **Entrer le nsec manuellement**
2. Collez votre clé `nsec1...`
3. Définissez un PIN pour protéger le stockage local
4. L'application dérive votre clé publique et s'enregistre auprès du backend

Cette méthode nécessite de manipuler votre nsec directement, ne l'utilisez que si le lien d'appareil n'est pas possible. Utilisez un gestionnaire de mots de passe pour coller le nsec plutôt que de le taper.

## Comparaison des fonctionnalités

| Fonctionnalité | Bureau | Mobile |
|---|---|---|
| Répondre aux appels entrants | Oui | Oui |
| Rédiger des notes chiffrées | Oui | Oui |
| Champs personnalisés des notes | Oui | Oui |
| Répondre aux messages (SMS, WhatsApp, Signal) | Oui | Oui |
| Voir les conversations | Oui | Oui |
| Statut d'équipe et pauses | Oui | Oui |
| Transcription côté client | Oui (WASM Whisper) | Non |
| Recherche de notes | Oui | Oui |
| Palette de commandes | Oui (Ctrl+K) | Non |
| Raccourcis clavier | Oui | Non |
| Paramètres admin | Oui (complet) | Oui (limité) |
| Gestion des bénévoles | Oui | Lecture seule |
| Voir les journaux d'audit | Oui | Oui |
| Appel navigateur WebRTC | Oui | Non (utilise le téléphone natif) |
| Notifications push | Notifications OS | Push natif (FCM/APNS) |
| Mise à jour auto | Updater Tauri | App Store / TestFlight |
| Pièces jointes (rapports) | Oui | Oui |

## Limitations

- **Pas de transcription côté client** — Le modèle WASM Whisper nécessite des ressources mémoire et CPU significatives, impraticables sur mobile. La transcription des appels est uniquement disponible sur bureau.
- **Performance crypto réduite** — Bien que l'application mobile utilise le même coeur crypto Rust via UniFFI, les opérations peuvent être plus lentes sur les appareils d'entrée de gamme par rapport aux performances natives du bureau.
- **Fonctionnalités admin limitées** — Certaines opérations admin (gestion en masse des bénévoles, configuration détaillée des paramètres) ne sont disponibles que dans l'application de bureau. L'application mobile fournit des vues en lecture seule pour la plupart des écrans admin.
- **Pas d'appel WebRTC** — Les bénévoles mobiles reçoivent les appels sur leur numéro de téléphone via le fournisseur de téléphonie, pas via le navigateur. L'appel WebRTC en application est réservé au bureau.
- **Batterie et connectivité** — L'application a besoin d'une connexion persistante pour recevoir les mises à jour en temps réel. Le mode arrière-plan peut être limité par la gestion d'énergie de l'OS. Gardez l'application au premier plan pendant les équipes pour des notifications fiables.

## Dépannage mobile

### L'approvisionnement échoue avec « Code QR invalide »

- Assurez-vous que le code QR a été généré récemment (les tokens d'approvisionnement expirent après 5 minutes)
- Générez un nouveau code QR depuis l'application de bureau et réessayez
- Assurez-vous que les deux appareils sont connectés à Internet

### Pas de notifications push

- Vérifiez que les notifications sont activées pour Llamenos dans les paramètres de votre appareil
- Sur Android : allez dans **Paramètres > Applications > Llamenos > Notifications** et activez tous les canaux
- Sur iOS : allez dans **Réglages > Notifications > Llamenos** et activez **Autoriser les notifications**
- Assurez-vous de ne pas être en mode Ne pas déranger
- Vérifiez que votre équipe est active et que vous n'êtes pas en pause

### L'application plante au démarrage

- Assurez-vous d'exécuter la dernière version de l'application
- Videz le cache : **Paramètres > Applications > Llamenos > Stockage > Vider le cache**
- Si le problème persiste, désinstallez et réinstallez (vous devrez re-lier l'appareil)

### Impossible de déchiffrer les anciennes notes après réinstallation

- La réinstallation de l'application supprime le matériel de clé local
- Re-liez l'appareil via code QR depuis votre application de bureau pour restaurer l'accès
- Les notes chiffrées avant la réinstallation seront accessibles une fois l'appareil re-lié avec la même identité

### Performance lente sur les anciens appareils

- Fermez les autres applications pour libérer de la mémoire
- Désactivez les animations dans les paramètres de l'application si disponible
- Envisagez d'utiliser l'application de bureau pour les opérations lourdes comme la revue de notes en masse
