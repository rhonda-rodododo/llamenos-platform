---
title: Guide du rapporteur
description: Comment soumettre des rapports chiffrés et suivre leur statut.
---

En tant que rapporteur, vous pouvez soumettre des rapports chiffrés à votre organisation via la plateforme Llamenos. Les rapports sont chiffrés de bout en bout — le serveur ne voit jamais le contenu de votre rapport.

## Pour commencer

Votre administrateur vous fournira l'un des éléments suivants :
- Un **nsec** (clé secrète Nostr) — une chaîne commençant par `nsec1`
- Un **lien d'invitation** — une URL à usage unique qui crée des identifiants pour vous

**Gardez votre nsec privé.** C'est votre identité et votre identifiant de connexion. Stockez-le dans un gestionnaire de mots de passe.

## Connexion

1. Ouvrez l'application dans votre navigateur
2. Collez votre `nsec` dans le champ de connexion
3. Votre identité est vérifiée cryptographiquement — votre clé secrète ne quitte jamais votre navigateur

Après la première connexion, vous pouvez enregistrer une clé d'accès WebAuthn dans les Paramètres pour des connexions futures plus faciles.

## Soumettre un rapport

1. Cliquez sur **Nouveau rapport** depuis la page Rapports
2. Saisissez un **titre** pour votre rapport (aide les administrateurs au tri — stocké en texte clair)
3. Sélectionnez une **catégorie** si votre administrateur a défini des catégories de rapports
4. Rédigez le **contenu de votre rapport** dans le champ texte — chiffré avant de quitter votre navigateur
5. Remplissez éventuellement les **champs personnalisés** configurés par votre administrateur
6. Joignez éventuellement des **fichiers** — les fichiers sont chiffrés côté client avant l'envoi
7. Cliquez sur **Soumettre**

Votre rapport apparaît dans votre liste de Rapports avec le statut « Ouvert ».

## Chiffrement des rapports

- Le corps du rapport et les valeurs des champs personnalisés sont chiffrés avec ECIES (secp256k1 + XChaCha20-Poly1305)
- Les pièces jointes sont chiffrées séparément avec le même schéma
- Seuls vous et l'administrateur pouvez déchiffrer le contenu
- Le serveur ne stocke que du texte chiffré — même si la base de données est compromise, le contenu de votre rapport est protégé

## Suivre vos rapports

Votre page Rapports affiche tous vos rapports soumis avec :
- **Titre** et **catégorie**
- **Statut** — Ouvert, Réclamé (un administrateur y travaille) ou Résolu
- **Date** de soumission

Cliquez sur un rapport pour voir le fil complet, y compris les réponses de l'administrateur.

## Répondre aux administrateurs

Quand un administrateur répond à votre rapport, sa réponse apparaît dans le fil du rapport. Vous pouvez répondre — tous les messages du fil sont chiffrés.

## Ce que vous ne pouvez pas faire

En tant que rapporteur, votre accès est limité pour protéger la vie privée de tous :
- Vous **pouvez** consulter vos propres rapports et la page d'Aide
- Vous **ne pouvez pas** voir les rapports d'autres rapporteurs, les enregistrements d'appels, les informations des bénévoles ou les paramètres admin
- Vous **ne pouvez pas** répondre aux appels ni aux conversations SMS/WhatsApp/Signal

## Conseils

- Utilisez des titres descriptifs — ils aident les administrateurs au tri sans déchiffrer le contenu complet
- Joignez des fichiers pertinents (captures d'écran, documents) quand ils étayent votre rapport
- Vérifiez périodiquement les réponses de l'administrateur — vous verrez les changements de statut dans votre liste de rapports
- Utilisez la page d'Aide pour les FAQ et les guides
