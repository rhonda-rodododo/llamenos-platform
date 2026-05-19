---
title: Sécurité et confidentialité
subtitle: Ce qui est protégé, ce qui est visible, et ce qui peut être obtenu sous assignation à comparaître — organisé selon les fonctionnalités que vous utilisez.
---

## Si votre hébergeur reçoit une assignation à comparaître

| Ils PEUVENT fournir | Ils NE PEUVENT PAS fournir |
|---------------------|---------------------------|
| Métadonnées d'appels/messages (horaires, durées) | Contenu des notes, transcriptions, corps des rapports |
| Blobs chiffrés de la base de données | Noms des bénévoles (chiffrement de bout en bout) |
| Quels comptes bénévoles étaient actifs et quand | Enregistrements du répertoire de contacts (chiffrement de bout en bout) |
| Enregistrements de livraison de messages en masse | Contenu des messages (chiffré à l'arrivée, stocké en texte chiffré) |
| | Clés de déchiffrement (protégées par votre PIN, votre fournisseur d'identité et optionnellement votre clé de sécurité matérielle) |
| | Clés de chiffrement par note (éphémères — détruites après encapsulation) |
| | Votre secret HMAC pour inverser les hachages de numéros de téléphone |
| | Contenu des fragments de récupération (chiffré, le serveur ne peut pas le lire) |

**Le serveur stocke des données qu'il ne peut pas lire.** Les métadonnées (quand, combien de temps, quels comptes) sont visibles. Le contenu (ce qui a été dit, écrit, qui sont vos contacts) ne l'est pas.

---

## Par fonctionnalité

Votre exposition à la vie privée dépend des canaux que vous activez :

### Appels vocaux

| Si vous utilisez... | Accès des tiers | Accès du serveur | Contenu chiffré de bout en bout |
|---------------------|----------------|------------------|--------------------------------|
| Twilio/SignalWire/Vonage/Plivo | Audio d'appel (en direct), enregistrements | Métadonnées d'appel | Notes, transcriptions |
| Asterisk auto-hébergé | Rien (vous le contrôlez) | Métadonnées d'appel | Notes, transcriptions |
| Navigateur à navigateur (WebRTC) | Rien | Métadonnées d'appel | Notes, transcriptions |

**Assignation au fournisseur de téléphonie** : Ils ont des enregistrements d'appels (horaires, numéros, durées). Ils N'ONT PAS les notes d'appels ni les transcriptions. L'enregistrement est désactivé par défaut.

**Transcription** : La transcription se fait entièrement dans votre navigateur avec une IA locale. **L'audio ne quitte jamais votre appareil.**

### Messages texte (un à un)

| Canal | Accès du fournisseur | Stockage serveur | Notes |
|-------|---------------------|-----------------|-------|
| SMS | Votre fournisseur lit tous les messages | **Chiffré** | Le fournisseur conserve les messages originaux |
| WhatsApp | Meta lit tous les messages | **Chiffré** | Le fournisseur conserve les messages originaux |
| Signal | Le réseau Signal est E2EE ; le bridge re-chiffre à l'arrivée | **Chiffré** | Route préférée quand disponible |

**Routage Signal en priorité** : Quand un destinataire a Signal, les messages sont automatiquement acheminés via Signal. Pour les SMS, seule une notification générique est envoyée par défaut (sans corps du message).

**Les messages sont chiffrés dès leur arrivée sur votre serveur.** Le serveur ne stocke que du texte chiffré.

### Messages en masse et diffusion

Les administrateurs peuvent envoyer des messages en masse aux abonnés via SMS, WhatsApp, Signal ou RCS.

**Important : les messages en masse sortants ne sont PAS chiffrés de bout en bout au niveau du serveur.** Pour livrer un message aux abonnés SMS ou WhatsApp, le serveur doit traiter le contenu en texte clair momentanément et le transmettre au fournisseur de messagerie.

| Canal | Accès du serveur à l'envoi | Accès du fournisseur | Après livraison |
|-------|---------------------------|---------------------|----------------|
| SMS en masse | Texte clair (momentané, pour livraison) | Contenu complet | Le fournisseur conserve |
| WhatsApp en masse | Texte clair (momentané, pour livraison) | Contenu complet (Meta) | Le fournisseur conserve |
| Signal en masse | Texte clair (momentané, pour livraison) | Chiffré E2EE via réseau Signal | Non conservé par le fournisseur |
| RCS en masse | Texte clair (momentané, pour livraison) | Google peut voir le contenu | Le fournisseur conserve |

**Ce que cela signifie** : Les messages en masse ne doivent pas contenir d'informations sensibles sur les appelants. Utilisez-les pour des annonces et des avis — pas pour des détails de cas.

Les numéros de téléphone des abonnés sont stockés sous forme d'identifiants hachés — votre base de données ne contient jamais une liste d'abonnés en texte clair.

### Notes, transcriptions et rapports

Tout le contenu rédigé par les bénévoles est chiffré de bout en bout :

- Chaque note utilise une **clé aléatoire unique** (secret de transmission — compromettre une note ne compromet pas les autres)
- Les clés sont encapsulées séparément pour le bénévole et chaque administrateur
- Le serveur ne stocke que du texte chiffré
- Le déchiffrement se produit sur votre appareil, dans une couche sécurisée qui n'expose jamais les clés à l'interface utilisateur
- **Les champs personnalisés, le contenu des rapports et les pièces jointes sont tous chiffrés individuellement**

**Enregistrements de cas et données d'entités** : Suivent le même modèle de chiffrement — chaque élément chiffré avec une clé unique.

**Saisie d'appareil** : Sans votre PIN **et** accès à votre compte de fournisseur d'identité, les attaquants obtiennent un blob chiffré protégé par Argon2id. Avec une clé de sécurité matérielle, **trois facteurs indépendants** protègent vos données.

---

## Vos appareils

### Afficher et révoquer des appareils

L'application tient à jour une liste de chaque appareil avec lequel vous vous êtes connecté. Vous pouvez consulter cette liste et révoquer tout appareil que vous ne reconnaissez pas.

**Lorsque vous révoquez un appareil :**
- Cet appareil est immédiatement bloqué de l'accès à votre compte
- Vos clés de chiffrement sont renouvelées pour que l'appareil révoqué ne puisse pas déchiffrer le contenu futur
- La révocation est enregistrée dans l'historique de sécurité de votre compte

### Vérification des emoji SAS

Pour les organisations avec des besoins de sécurité élevés, les administrateurs peuvent vérifier l'identité d'un appareil en utilisant la vérification SAS (Chaîne d'Authentification Courte) — affichée sous forme d'une séquence de 7 emoji.

**Comment ça fonctionne :**
1. L'administrateur et le propriétaire de l'appareil comparent leurs séquences d'emoji (en personne, par téléphone ou via un canal de confiance)
2. Si les emoji correspondent, l'appareil est confirmé comme appartenant à son propriétaire enregistré
3. La vérification est enregistrée — les administrateurs peuvent voir quels appareils ont été vérifiés

Cela protège contre un attaquant qui aurait enregistré un faux appareil sous le compte de quelqu'un d'autre.

---

## Suppression de compte

### Suppression par l'utilisateur

Vous pouvez demander la suppression permanente de votre compte et de toutes les données associées. Par défaut, il y a un délai (configuré par votre administrateur de hub, généralement 72 heures) avant que la suppression soit effectuée — cela vous donne le temps d'annuler si la demande a été faite sous contrainte.

**Ce qui est supprimé :**
- Vos clés d'appareil (rendant tout le contenu chiffré définitivement illisible, même depuis les sauvegardes)
- Votre enregistrement de compte, attributions de rôles et historique de permanences
- Vos jetons de notification push

**Ce qui arrive au contenu chiffré que vous avez créé** : Les notes et rapports que vous avez rédigés sont re-chiffrés pour les lecteurs autorisés restants. Votre copie de la clé de déchiffrement est détruite.

**Journaux d'audit** : Vos entrées de journal d'audit sont « crypto-détruites » — la clé de chiffrement par utilisateur est détruite, rendant vos entrées illisibles. La chaîne de hachage reste intacte.

### Suppression d'urgence

Si vous croyez que votre compte est sous menace immédiate, vous pouvez demander une suppression d'urgence avec un co-approbateur — réduit le délai à un minimum de 4 heures. Le minimum de 4 heures existe pour se protéger contre la suppression sous contrainte.

---

## Groupes de récupération

Si vous perdez tous vos appareils, vous perdriez normalement l'accès à toutes vos données chiffrées. Les groupes de récupération résolvent ce problème.

### Comment fonctionne la récupération

Vous désignez un groupe de contacts de confiance (généralement 3 à 5 personnes) comme votre groupe de récupération. Chaque contact détient un « fragment » d'une clé de récupération.

**Pour récupérer votre compte :**
1. Vous enregistrez un nouvel appareil et initiez une demande de récupération
2. Vos contacts de récupération reçoivent une notification
3. Après un délai configurable, un nombre seuil de contacts (ex. : 2 sur 3) approuve la demande
4. Chaque contact approbateur envoie son fragment, chiffré directement vers votre nouvel appareil
5. Votre nouvel appareil combine les fragments pour reconstruire la clé de récupération

**Ce que le serveur peut voir** : Le serveur relaie des fragments chiffrés entre les appareils. Il ne peut pas lire les fragments ni reconstruire la clé de récupération seul.

### Propriétés de sécurité des groupes de récupération

- **Sécurité par seuil** : Les fragments en dessous du seuil ne révèlent rien sur le secret
- **Pas d'implication du serveur dans le secret** : Les fragments sont chiffrés directement vers la clé publique de votre nouvel appareil
- **Portée par hub** : La récupération restaure votre accès à un hub spécifique
- **Délai avec annulation** : Vous pouvez annuler une demande de récupération pendant la période de délai
- **Vérification par Signal** : Les demandes de récupération sont vérifiées via Signal

---

## Confidentialité du numéro de téléphone des bénévoles

Quand les bénévoles reçoivent des appels sur leurs téléphones personnels, leurs numéros sont exposés à votre fournisseur de téléphonie.

| Scénario | Numéro de téléphone visible par |
|----------|--------------------------------|
| Appel PSTN vers le téléphone du bénévole | Fournisseur de téléphonie, opérateur téléphonique |
| Navigateur à navigateur (WebRTC) | Personne (l'audio reste dans le navigateur) |
| Asterisk auto-hébergé + téléphone SIP | Uniquement votre serveur Asterisk |

**Pour protéger les numéros de téléphone des bénévoles** : Utilisez les appels basés sur navigateur (WebRTC) ou fournissez des téléphones SIP connectés à Asterisk auto-hébergé.

---

## Récemment déployé

Ces améliorations sont disponibles aujourd'hui :

| Fonctionnalité | Bénéfice pour la vie privée |
|----------------|---------------------------|
| Gestion des appareils | Affichez et révoquez tout appareil connecté ; la révocation déclenche le renouvellement des clés |
| Vérification emoji SAS | Les administrateurs peuvent vérifier les appareils en personne avec une empreinte cryptographique de 7 emoji |
| Suppression de compte avec délai | Demandez la suppression ; le délai configurable permet l'annulation si sous contrainte |
| Suppression d'urgence | Suppression rapide co-approuvée avec un minimum de 4 heures |
| Crypto-destruction à la suppression | Les clés de chiffrement sont détruites en premier, rendant le contenu définitivement illisible |
| Groupes de récupération (Shamir) | Désignez des contacts de confiance pour vous aider à récupérer si vous perdez tous vos appareils |
| Messages en masse avec divulgation honnête | Les administrateurs peuvent envoyer des messages en masse ; le serveur traite le texte clair momentanément pour la livraison |
| Hachage des abonnés | Numéros de téléphone des abonnés stockés sous forme d'identifiants hachés |
| Protection des clés Argon2id | Clés d'appareil protégées par une fonction résistante à la mémoire |
| Routage Signal en priorité | Messages acheminés automatiquement via Signal quand disponible |
| Mode SMS notification seulement | Les destinataires SMS voient uniquement « vous avez un nouveau message » |
| Résistance à l'analyse du trafic | Tailles des événements rembourrées pour empêcher la distinction |
| Pas de numéros de téléphone en clair | Numéros des appelants stockés sous forme de hachages irréversibles |
| Chiffrement par hub avec secret de transmission | Clés renouvelées toutes les 24 heures |
| Cryptographie en Rust sur toutes les plateformes | Même bibliothèque cryptographique auditée sur bureau, iOS et Android |
| Accès restreint au relais | Le relais WebSocket n'accepte les événements que de votre serveur |
| Stockage chiffré des messages | SMS, WhatsApp et Signal stockés en texte chiffré |
| Transcription sur appareil | L'audio ne quitte jamais votre appareil |
| Protection des clés multifacteur | PIN, fournisseur d'identité et optionnellement clé de sécurité matérielle |
| Clés de sécurité matérielles | Troisième facteur ne pouvant pas être compromis à distance |
| Builds reproductibles | Vérifiez que le code déployé correspond au code source public |
| Répertoire de contacts chiffré | Enregistrements, relations et notes chiffrés de bout en bout |

## Encore à venir

| Fonctionnalité | Bénéfice pour la vie privée | Statut |
|----------------|---------------------------|--------|
| Applications natives pour recevoir des appels | Pas d'exposition des numéros personnels | En développement |
| Épinglage de certificat (mobile) | Défense contre l'interception TLS par CA frauduleux | Structure complète ; épingles en attente |
| Chiffrement des médias vocaux SFrame | Appels vocaux chiffrés de bout en bout | Dérivation des clés complète ; chiffrement par trame prévu |

---

## Tableau récapitulatif

| Type de données | Chiffré | Visible par le serveur | Obtenu sous assignation |
|-----------------|---------|----------------------|------------------------|
| Notes d'appels | Oui (bout en bout) | Non | Texte chiffré seulement |
| Transcriptions | Oui (bout en bout) | Non | Texte chiffré seulement |
| Rapports | Oui (bout en bout) | Non | Texte chiffré seulement |
| Dossiers de cas / données d'entités | Oui (bout en bout) | Non | Texte chiffré seulement |
| Pièces jointes | Oui (bout en bout) | Non | Texte chiffré seulement |
| Enregistrements de contacts | Oui (bout en bout) | Non | Texte chiffré seulement |
| Identités des bénévoles | Oui (bout en bout) | Non | Texte chiffré seulement |
| Métadonnées équipe/rôles | Oui (chiffré) | Non | Texte chiffré seulement |
| Définitions de champs personnalisés | Oui (chiffré) | Non | Texte chiffré seulement |
| Contenu SMS/WhatsApp/Signal entrant | Oui (sur votre serveur) | Non | Texte chiffré du serveur ; le fournisseur peut avoir l'original |
| Messages en masse sortants | **Non — texte clair pendant la livraison** | **Oui, momentanément** | Oui (texte clair au moment de l'envoi) |
| Fragments de récupération | Oui (bout en bout vers l'appareil) | Non | Texte chiffré seulement |
| Événements en temps réel | Oui (par hub, clés tournantes) | Non | Texte chiffré seulement |
| Métadonnées d'appels | Non | Oui | Oui |
| Enregistrements de livraison en masse | Non | Oui | Oui |
| Hachages de numéros des appelants | Hachage HMAC | Hachage seulement | Hachage (non réversible sans votre secret) |
| Hachages de numéros des abonnés | Hachage HMAC | Hachage seulement | Hachage (non réversible sans votre secret) |
| Chaînes User-Agent | Hachage SHA-256 | Hachage seulement | Hachage (non réversible) |

---

## Pour les auditeurs de sécurité

Documentation technique :

- [Spécification du protocole](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/PROTOCOL.md)
- [Modèle de menaces](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/THREAT_MODEL.md)
- [Classification des données](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Lacunes de sécurité et feuille de route](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/SECURITY_GAPS_AND_ROADMAP.md)
- [Audits de sécurité](https://github.com/rhonda-rodododo/llamenos-platform/tree/main/docs/security)
- [Documentation API](/api/docs)

Llamenos est open source : [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
