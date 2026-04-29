---
title: Guide administrateur
description: Gerez tout -- benevoles, equipes, parametres d'appel, listes de blocage et champs personnalises.
---

En tant qu'administrateur, vous gerez tout : benevoles, equipes, parametres d'appel, listes de blocage et champs personnalises. Ce guide couvre les principaux flux de travail d'administration.

## Connexion

Connectez-vous avec le `nsec` (cle secrete Nostr) genere lors de la [configuration](/docs/deploy). La page de connexion accepte le format nsec (`nsec1...`). Votre navigateur signe un defi avec la cle -- le secret ne quitte jamais l'appareil.

Vous pouvez egalement enregistrer une cle d'acces WebAuthn dans les Parametres pour une connexion sans mot de passe sur d'autres appareils.

## Gestion des benevoles

Accedez a **Benevoles** dans la barre laterale pour :

- **Ajouter un benevole** -- genere une nouvelle paire de cles Nostr. Partagez le nsec de maniere securisee avec le benevole (il n'est affiche qu'une seule fois).
- **Creer un lien d'invitation** -- genere un lien a usage unique qu'un benevole peut utiliser pour s'inscrire.
- **Modifier** -- mettre a jour le nom, le numero de telephone et le role.
- **Supprimer** -- desactiver l'acces d'un benevole.

Les numeros de telephone des benevoles ne sont visibles que par les administrateurs. Ils sont utilises pour la sonnerie simultanee lorsque le benevole est en service.

## Configuration des equipes

Accedez a **Equipes** pour creer des plannings recurrents :

1. Cliquez sur **Ajouter une equipe**
2. Definissez un nom, selectionnez les jours de la semaine et definissez les heures de debut/fin
3. Attribuez des benevoles a l'aide du selecteur multiple avec recherche
4. Enregistrez -- le systeme acheminera automatiquement les appels vers les benevoles de l'equipe active

Configurez un **Groupe de secours** en bas de la page des equipes. Ces benevoles seront appeles lorsqu'aucune equipe planifiee n'est active.

## Listes de blocage

Accedez a **Blocages** pour gerer les numeros de telephone bloques :

- **Entree individuelle** -- saisissez un numero de telephone au format E.164 (ex. : +15551234567)
- **Import en masse** -- collez plusieurs numeros, un par ligne
- **Supprimer** -- debloquer un numero instantanement

Les blocages prennent effet immediatement. Les appelants bloques entendent un message de rejet et sont deconnectes.

## Parametres d'appel

Dans **Parametres**, vous trouverez plusieurs sections :

### Protection anti-spam

- **CAPTCHA vocal** -- activer/desactiver. Lorsqu'il est active, les appelants doivent saisir un code a 4 chiffres aleatoire.
- **Limitation de debit** -- activer/desactiver. Limite les appels par numero de telephone dans une fenetre de temps glissante.

### Transcription

- **Interrupteur global** -- activer/desactiver la transcription Whisper pour tous les appels.
- Les benevoles peuvent egalement se desinscrire individuellement via leurs propres parametres.

### Parametres d'appel

- **Delai de file d'attente** -- duree d'attente des appelants avant le renvoi vers la messagerie vocale (30-300 secondes).
- **Duree maximale de la messagerie** -- duree maximale d'enregistrement (30-300 secondes).

### Champs de note personnalises

Definissez des champs structures qui apparaissent dans le formulaire de prise de notes :

- Types pris en charge : texte, nombre, selection (menu deroulant), case a cocher, zone de texte
- Configurez la validation : obligatoire, longueur min/max, valeur min/max
- Controlez la visibilite : choisissez quels champs les benevoles peuvent voir et modifier
- Reordonnez les champs avec les fleches haut/bas
- Maximum 20 champs, maximum 50 options par champ de selection

Les valeurs des champs personnalises sont chiffrees avec le contenu des notes. Le serveur ne les voit jamais.

### Messages vocaux

Enregistrez des messages audio IVR personnalises pour chaque langue prise en charge. Le systeme utilise vos enregistrements pour les flux d'accueil, de CAPTCHA, de file d'attente et de messagerie vocale. En l'absence d'enregistrement, il utilise la synthese vocale par defaut.

### Politique WebAuthn

Exigez optionnellement des cles d'acces pour les administrateurs, les benevoles, ou les deux. Lorsque c'est requis, les utilisateurs doivent enregistrer une cle d'acces avant de pouvoir utiliser l'application.

## Journal d'audit

La page **Journal d'audit** affiche une liste chronologique des evenements systeme : connexions, reponses aux appels, creation de notes, modifications de parametres et actions d'administration. Les entrees incluent des adresses IP hachees et des metadonnees de pays. Utilisez la pagination pour parcourir l'historique.

## Historique des appels

La page **Appels** affiche tous les appels avec le statut, la duree et le benevole attribue. Filtrez par plage de dates ou recherchez par numero de telephone. Exportez les donnees au format JSON conforme au RGPD.
