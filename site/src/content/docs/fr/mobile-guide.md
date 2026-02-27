---
title: Guide mobile
description: Installez et configurez l'application mobile Llamenos sur iOS et Android.
---

L'application mobile Llamenos permet aux benevoles de repondre aux appels, reagir aux messages et rediger des notes chiffrees depuis leur telephone. Elle est construite avec React Native et partage le meme coeur cryptographique Rust que l'application de bureau.

## Qu'est-ce que l'application mobile ?

L'application mobile est un compagnon de l'application de bureau. Elle se connecte au meme backend Llamenos (Cloudflare Workers ou auto-heberge) et utilise le meme protocole, permettant aux benevoles de basculer entre bureau et mobile de maniere transparente.

L'application mobile se trouve dans un depot separe (`llamenos-mobile`) mais partage :

- **llamenos-core** — Le meme crate Rust pour toutes les operations cryptographiques, compile via UniFFI pour iOS et Android
- **Protocole** — Le meme format filaire, les memes endpoints API et le meme schema de chiffrement
- **Backend** — Le meme Cloudflare Worker ou serveur auto-heberge

## Telecharger et installer

### Android

L'application mobile est actuellement distribuee en tant qu'APK pour l'installation manuelle :

1. Telechargez le dernier fichier `.apk` depuis la page [GitHub Releases](https://github.com/rhonda-rodododo/llamenos-mobile/releases/latest)
2. Sur votre appareil Android, allez dans **Parametres > Securite** et activez **Installation depuis des sources inconnues** (ou activez-le par application lorsque demande)
3. Ouvrez l'APK telecharge et appuyez sur **Installer**
4. Une fois installe, ouvrez Llamenos depuis votre tiroir d'applications

La distribution via App Store et Play Store est prevue pour une version future.

### iOS

Les builds iOS sont disponibles en tant que versions beta TestFlight :

1. Installez [TestFlight](https://apps.apple.com/app/testflight/id899247664) depuis l'App Store
2. Demandez a votre administrateur le lien d'invitation TestFlight
3. Ouvrez le lien sur votre appareil iOS pour rejoindre la beta
4. Installez Llamenos depuis TestFlight

La distribution via l'App Store est prevue pour une version future.

## Configuration initiale

L'application mobile est configuree en la liant a un compte de bureau existant. Cela garantit que la meme identite cryptographique est utilisee sur tous les appareils sans jamais transmettre la cle secrete en clair.

### Provisionnement d'appareil (scan QR)

1. Ouvrez l'application Llamenos de bureau et allez dans **Parametres > Appareils**
2. Cliquez sur **Lier un nouvel appareil** — cela genere un code QR contenant un token de provisionnement a usage unique
3. Ouvrez l'application mobile Llamenos et appuyez sur **Lier l'appareil**
4. Scannez le code QR avec la camera de votre telephone
5. Les applications effectuent un echange de cles ECDH ephemere pour transferer votre materiel de cle chiffre en toute securite
6. Definissez un PIN sur l'application mobile pour proteger votre stockage de cles local
7. L'application mobile est maintenant liee et prete a l'emploi

Le processus de provisionnement ne transmet jamais votre nsec en clair. L'application de bureau enveloppe le materiel de cle avec le secret partage ephemere, et l'application mobile le developpe localement.

### Configuration manuelle (saisie du nsec)

Si vous ne pouvez pas scanner un code QR, vous pouvez saisir votre nsec directement :

1. Ouvrez l'application mobile et appuyez sur **Entrer le nsec manuellement**
2. Collez votre cle `nsec1...`
3. Definissez un PIN pour proteger le stockage local
4. L'application derive votre cle publique et s'enregistre aupres du backend

Cette methode necessite de manipuler votre nsec directement, ne l'utilisez que si le lien d'appareil n'est pas possible. Utilisez un gestionnaire de mots de passe pour coller le nsec plutot que de le taper.

## Comparaison des fonctionnalites

| Fonctionnalite | Bureau | Mobile |
|---|---|---|
| Repondre aux appels entrants | Oui | Oui |
| Rediger des notes chiffrees | Oui | Oui |
| Champs personnalises des notes | Oui | Oui |
| Repondre aux messages (SMS, WhatsApp, Signal) | Oui | Oui |
| Voir les conversations | Oui | Oui |
| Statut d'equipe et pauses | Oui | Oui |
| Transcription cote client | Oui (WASM Whisper) | Non |
| Recherche de notes | Oui | Oui |
| Palette de commandes | Oui (Ctrl+K) | Non |
| Raccourcis clavier | Oui | Non |
| Parametres admin | Oui (complet) | Oui (limite) |
| Gestion des benevoles | Oui | Lecture seule |
| Voir les journaux d'audit | Oui | Oui |
| Appel navigateur WebRTC | Oui | Non (utilise le telephone natif) |
| Notifications push | Notifications OS | Push natif (FCM/APNS) |
| Mise a jour auto | Updater Tauri | App Store / TestFlight |
| Pieces jointes (rapports) | Oui | Oui |

## Limitations

- **Pas de transcription cote client** — Le modele WASM Whisper necessite des ressources memoire et CPU significatives, impraticables sur mobile. La transcription des appels est uniquement disponible sur bureau.
- **Performance crypto reduite** — Bien que l'application mobile utilise le meme coeur crypto Rust via UniFFI, les operations peuvent etre plus lentes sur les appareils d'entree de gamme par rapport aux performances natives du bureau.
- **Fonctionnalites admin limitees** — Certaines operations admin (gestion en masse des benevoles, configuration detaillee des parametres) ne sont disponibles que dans l'application de bureau. L'application mobile fournit des vues en lecture seule pour la plupart des ecrans admin.
- **Pas d'appel WebRTC** — Les benevoles mobiles recoivent les appels sur leur numero de telephone via le fournisseur de telephonie, pas via le navigateur. L'appel WebRTC en application est reserve au bureau.
- **Batterie et connectivite** — L'application a besoin d'une connexion persistante pour recevoir les mises a jour en temps reel. Le mode arriere-plan peut etre limite par la gestion d'energie de l'OS. Gardez l'application au premier plan pendant les equipes pour des notifications fiables.

## Depannage mobile

### L'approvisionnement echoue avec « Code QR invalide »

- Assurez-vous que le code QR a ete genere recemment (les tokens d'approvisionnement expirent apres 5 minutes)
- Generez un nouveau code QR depuis l'application de bureau et reessayez
- Assurez-vous que les deux appareils sont connectes a Internet

### Pas de notifications push

- Verifiez que les notifications sont activees pour Llamenos dans les parametres de votre appareil
- Sur Android : allez dans **Parametres > Applications > Llamenos > Notifications** et activez tous les canaux
- Sur iOS : allez dans **Reglages > Notifications > Llamenos** et activez **Autoriser les notifications**
- Assurez-vous de ne pas etre en mode Ne pas deranger
- Verifiez que votre equipe est active et que vous n'etes pas en pause

### L'application plante au demarrage

- Assurez-vous d'executer la derniere version de l'application
- Videz le cache : **Parametres > Applications > Llamenos > Stockage > Vider le cache**
- Si le probleme persiste, desinstallez et reinstallez (vous devrez re-lier l'appareil)

### Impossible de dechiffrer les anciennes notes apres reinstallation

- La reinstallation de l'application supprime le materiel de cle local
- Re-liez l'appareil via code QR depuis votre application de bureau pour restaurer l'acces
- Les notes chiffrees avant la reinstallation seront accessibles une fois l'appareil re-lie avec la meme identite

### Performance lente sur les anciens appareils

- Fermez les autres applications pour liberer de la memoire
- Desactivez les animations dans les parametres de l'application si disponible
- Envisagez d'utiliser l'application de bureau pour les operations lourdes comme la revue de notes en masse
