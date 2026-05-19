---
title: Politique de confidentialité
subtitle: Ce que Llámenos collecte, comment c'est protégé et vos droits en tant qu'utilisateur.
---

**Date d'entrée en vigueur : 18 mai 2026**

Llámenos est un logiciel de réponse aux crises open source. Cette politique s'applique à l'application iOS Llámenos et aux services backend exploités par votre administrateur de hub. Elle ne s'applique pas aux hubs exploités par des tiers — chaque administrateur de hub est responsable de ses propres pratiques en matière de données.

---

## Ce que nous collectons

### Données de compte et d'identité

- **Clé publique de l'appareil** — un identifiant cryptographique unique à votre appareil. Jamais partagé en dehors de votre hub.
- **Jeton de notification push** — utilisé uniquement pour livrer des alertes d'appels. Renouvelé périodiquement.
- **Rôle et appartenance au hub** — à quels hubs vous appartenez et votre rôle assigné (bénévole, administrateur).
- **Métadonnées de l'appareil** — modèle, version du système d'exploitation et version de l'application.

### Données d'activité

- **Métadonnées d'appels** — horodatages, durées d'appels, quel bénévole a répondu. Pas le contenu des appels.
- **Enregistrements de permanences** — quelles permanences vous étiez planifié et si vous étiez actif.
- **Entrées de journal d'audit** — actions effectuées dans l'application. Visibles uniquement par les administrateurs.
- **Événements de sécurité** — enregistrements d'appareils, révocations, activité de session et modifications de compte.

### Contenu que vous créez — chiffré de bout en bout

- **Notes et transcriptions d'appels** — notes écrites et transcriptions générées par le navigateur.
- **Rapports et dossiers de cas** — rapports structurés, champs personnalisés, pièces jointes et historique de cas.
- **Enregistrements de contacts** — coordonnées des appelants, si enregistrées.
- **Messages** — messages texte entrants acheminés vers votre hub.

**Le serveur stocke ce contenu uniquement sous forme de texte chiffré.** Il ne peut pas être lu par l'opérateur du serveur, le fournisseur d'hébergement ou Llámenos.

### Données de diffusion/abonnés

Les numéros de téléphone des abonnés sont stockés sous forme d'identifiants hachés — pas en texte clair. Lors de l'envoi d'un message en masse, le serveur traite momentanément le contenu en texte clair pour la livraison. Le contenu n'est pas stocké après la livraison.

### Données des groupes de récupération

Si vous configurez un groupe de récupération, le serveur stocke des fragments de parts chiffrés (chaque fragment chiffré vers l'appareil d'un détenteur spécifique — le serveur ne peut pas les lire). Le serveur ne peut pas reconstruire votre clé de récupération.

---

## Comment nous utilisons les données

- **Pour faire fonctionner l'application** — acheminer les appels, activer la prise de notes, gérer les permanences.
- **Pour la sécurité** — détecter les abus, maintenir les listes de blocage, limiter le débit.
- **Pour l'audit** — fournir aux administrateurs des journaux d'audit de l'activité de l'application (pas le contenu).
- **Pour la récupération** — stocker des fragments chiffrés pour que les groupes de récupération puissent aider les utilisateurs.

Nous n'utilisons pas vos données à des fins publicitaires. Nous ne vendons ni ne partageons vos données avec des tiers à des fins commerciales.

---

## Chiffrement de bout en bout

Tout le contenu de notes, transcriptions, rapports, enregistrements de contacts et messages entrants est chiffré de bout en bout.

| Type de données | Le serveur peut lire ? | Obtenu sous assignation |
|----------------|----------------------|------------------------|
| Notes d'appels | Non | Texte chiffré seulement |
| Transcriptions | Non | Texte chiffré seulement |
| Rapports | Non | Texte chiffré seulement |
| Dossiers de cas | Non | Texte chiffré seulement |
| Messages entrants | Non | Texte chiffré seulement |
| Fragments de récupération | Non | Texte chiffré seulement |
| Messages en masse sortants | **Oui, momentanément pendant la livraison** | Oui (texte clair à l'envoi) |
| Métadonnées d'appels | Oui | Oui |
| Votre clé publique d'appareil | Oui | Oui |
| Événements de sécurité | Oui | Oui |

---

## Conservation des données

### Contenu que vous créez

Conservé jusqu'à ce que vous ou un administrateur le supprimez explicitement, ou que votre hub soit fermé.

### Messages en masse

Le contenu n'est pas stocké après la livraison. Seuls les enregistrements de statut de livraison sont conservés.

### Métadonnées d'appels et journaux d'audit

Conservés selon la configuration de votre administrateur de hub.

### Fragments de récupération

Conservés jusqu'à ce que vous supprimiez la configuration de votre groupe de récupération ou que votre compte soit effacé.

### Jetons push

Supprimés lorsque vous vous déconnectez ou désinstallez l'application.

---

## Suppression du compte

Vous avez le droit de demander la suppression permanente de votre compte.

### Ce que fait la suppression

1. **Clés détruites en premier** : Vos clés de chiffrement d'appareil sont détruites immédiatement.
2. **Enregistrements de compte supprimés** : Votre enregistrement de compte, enregistrements d'appareils, jetons push et attributions de rôles sont supprimés.
3. **Entrées d'audit crypto-détruites** : La clé de chiffrement de vos entrées de journal d'audit est détruite.
4. **Contenu chiffré re-encapsulé** : Les notes et rapports que vous avez rédigés sont re-chiffrés pour les lecteurs autorisés restants.

### Suppression par l'utilisateur

Disponible depuis les paramètres du compte sur toutes les plateformes. Il y a un délai par défaut (configuré par votre administrateur de hub, minimum 24 heures, maximum 7 jours). Vous pouvez annuler pendant cette période.

### Suppression d'urgence

Un co-approbateur peut approuver la suppression d'urgence, réduisant le délai à un minimum de 4 heures.

---

## Services tiers

Llámenos s'intègre avec des fournisseurs de téléphonie pour le routage des appels.

**Ce que reçoivent les fournisseurs de téléphonie** : Le numéro de téléphone de l'appelant, la durée et les horodatages. Ils ne reçoivent pas les notes, transcriptions ou tout contenu créé dans l'application.

**Ce que reçoivent les fournisseurs de messagerie pour les messages en masse** : Le contenu du message (SMS, WhatsApp, RCS) — le fournisseur doit recevoir le texte clair pour livrer. Pour les diffusions Signal, le contenu est livré chiffré de bout en bout.

---

## Vos droits en vertu du RGPD

Llámenos est développé par une organisation basée dans l'UE. Si vous êtes dans l'Espace économique européen :

- **Droit d'accès** — demander une copie des données personnelles vous concernant
- **Droit de rectification** — corriger les données inexactes
- **Droit à l'effacement** — demander la suppression permanente de votre compte et de toutes les données associées
- **Droit à la portabilité des données** — recevoir vos données dans un format lisible par machine
- **Droit d'opposition** — vous opposer au traitement basé sur des intérêts légitimes
- **Droit de limiter le traitement** — demander que le traitement soit limité
- **Droit de retirer votre consentement** — retirer le consentement à tout moment

Pour exercer ces droits, contactez votre administrateur de hub ou écrivez-nous à [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com).

---

## Confidentialité des enfants

Llámenos n'est pas destiné aux enfants de moins de 13 ans, ou de moins de 16 ans dans l'UE.

---

## Modifications de cette politique

Nous publierons tout changement sur cette page et mettrons à jour la date d'entrée en vigueur.

---

## Contact

**Questions de confidentialité :** [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com)

**Rapports de bugs et divulgations de sécurité :** [github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues)

Llámenos est open source : [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
