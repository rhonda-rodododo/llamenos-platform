---
title: Guide du benevole
description: Tout ce que vous devez savoir en tant que benevole -- connexion, reception d'appels, redaction de notes et utilisation de la transcription.
---

Ce guide couvre tout ce que vous devez savoir en tant que benevole : connexion, reception d'appels, redaction de notes et utilisation de la fonctionnalite de transcription.

## Obtenir vos identifiants

Votre administrateur vous fournira l'un des elements suivants :

- Un **nsec** (cle secrete WebSocket) -- une chaine commencant par `nsec1`
- Un **lien d'invitation** -- une URL a usage unique qui genere vos identifiants

**Gardez votre nsec prive.** C'est votre identite et votre identifiant de connexion. Toute personne possedant votre nsec peut se faire passer pour vous. Stockez-le dans un gestionnaire de mots de passe.

## Connexion

1. Ouvrez l'application de la ligne d'aide dans votre navigateur
2. Collez votre `nsec` dans le champ de connexion
3. L'application verifie votre identite de maniere cryptographique -- votre cle secrete ne quitte jamais votre navigateur

Apres la premiere connexion, il vous sera demande de definir votre nom d'affichage et votre langue preferee.

### Connexion par cle d'acces (optionnel)

Si votre administrateur a active les cles d'acces, vous pouvez enregistrer une cle materielle ou biometrique dans **Parametres**. Cela vous permet de vous connecter sur d'autres appareils sans saisir votre nsec.

## Le tableau de bord

Apres la connexion, vous verrez le tableau de bord avec :

- **Appels actifs** -- les appels en cours de traitement
- **Statut de votre equipe** -- affiche dans la barre laterale (equipe actuelle ou prochaine equipe)
- **Benevoles en ligne** -- nombre de personnes disponibles

## Recevoir des appels

Lorsqu'un appel arrive pendant votre equipe, vous serez notifie via :

- Une **sonnerie** dans le navigateur (a activer dans les Parametres)
- Une **notification push** si vous avez accorde l'autorisation
- Un **titre d'onglet clignotant**

Cliquez sur **Repondre** pour prendre l'appel. Votre telephone sonnera -- decrochez pour vous connecter avec l'appelant. Si un autre benevole repond en premier, la sonnerie s'arrete.

## Pendant un appel

Pendant un appel, vous verrez :

- Un **compteur d'appel** affichant la duree
- Un **panneau de prise de notes** ou vous pouvez ecrire des notes en temps reel
- Un bouton **Signaler un spam** pour signaler l'appelant

Les notes sont automatiquement sauvegardees sous forme de brouillons chiffres. Vous pouvez egalement enregistrer la note manuellement.

## Redaction de notes

Les notes sont chiffrees dans votre navigateur avant d'etre envoyees au serveur. Seuls vous et l'administrateur pouvez les lire.

Si votre administrateur a configure des champs personnalises (texte, menu deroulant, case a cocher, etc.), ils apparaitront dans le formulaire de notes. Remplissez-les selon la pertinence -- ils sont chiffres avec le texte de votre note.

Accedez a **Notes** dans la barre laterale pour consulter, modifier ou rechercher vos notes passees. Vous pouvez exporter vos notes sous forme de fichier chiffre.

## Transcription

Si la transcription est activee (par l'administrateur et selon votre propre preference), les appels sont automatiquement transcrits apres leur fin. La transcription apparait a cote de votre note pour cet appel.

Vous pouvez activer ou desactiver la transcription dans **Parametres**. Lorsqu'elle est desactivee, vos appels ne seront pas transcrits independamment du parametre global de l'administrateur.

Les transcriptions sont chiffrees au repos -- le serveur traite temporairement l'audio, puis chiffre le texte resultant.

## Prendre une pause

Activez l'interrupteur **pause** dans la barre laterale pour suspendre les appels entrants sans quitter votre equipe. Les appels ne feront pas sonner votre telephone pendant votre pause. Reactivez-le lorsque vous etes pret.

## Astuces

- Utilisez <kbd>Ctrl</kbd>+<kbd>K</kbd> (ou <kbd>Cmd</kbd>+<kbd>K</kbd> sur Mac) pour ouvrir la palette de commandes pour une navigation rapide
- Appuyez sur <kbd>?</kbd> pour voir tous les raccourcis clavier
- Installez l'application en tant que PWA pour une experience d'application native et de meilleures notifications
- Gardez votre onglet de navigateur ouvert pendant votre equipe pour les alertes d'appel en temps reel
