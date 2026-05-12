---
title: Sécurité et confidentialité
subtitle: Ce qui est protégé, ce qui est visible, et ce qui peut être obtenu sous assignation à comparaître — organisé selon les fonctionnalités que vous utilisez.
---

## Si votre hébergeur reçoit une assignation à comparaître

| Ils PEUVENT fournir | Ils NE PEUVENT PAS fournir |
|------------------|---------------------|
| Métadonnées des appels/messages (heures, durées) | Contenu des notes, transcriptions, corps des rapports |
| Blobs de base de données chiffrés | Noms des bénévoles (chiffrement de bout en bout) |
| Quels bénévoles étaient actifs et quand | Enregistrements du répertoire de contacts (chiffrement de bout en bout) |
| | Contenu des messages (chiffré à l'arrivée, stocké sous forme de texte chiffré) |
| | Clés de déchiffrement (protégées par votre PIN, votre fournisseur d'identité et optionnellement votre clé de sécurité matérielle) |
| | Clés de chiffrement par note (éphémères — détruites après encapsulation) |
| | Votre secret HMAC pour inverser les hachages de téléphone |

**Le serveur stocke des données qu'il ne peut pas lire.** Les métadonnées (quand, combien de temps, quels comptes) sont visibles. Le contenu (ce qui a été dit, ce qui a été écrit, qui sont vos contacts) ne l'est pas.

---

## Par fonctionnalité

Votre exposition à la confidentialité dépend des canaux que vous activez :

### Appels vocaux

| Si vous utilisez... | Les tiers peuvent accéder à | Le serveur peut accéder à | Contenu E2EE |
|---------------|-------------------------|-------------------|--------------|
| Twilio/SignalWire/Vonage/Plivo | Audio d'appel (en direct), enregistrements d'appels | Métadonnées d'appel | Notes, transcriptions |
| Asterisk auto-hébergé | Rien (vous le contrôlez) | Métadonnées d'appel | Notes, transcriptions |
| Navigateur à navigateur (WebRTC) | Rien | Métadonnées d'appel | Notes, transcriptions |

**Assignation du fournisseur de téléphonie** : Ils ont des enregistrements de détails d'appels (heures, numéros de téléphone, durées). Ils n'ont PAS les notes ou transcriptions d'appels. L'enregistrement est désactivé par défaut.

**Transcription** : La transcription s'effectue entièrement dans votre navigateur à l'aide d'une IA embarquée. **L'audio ne quitte jamais votre appareil.** Seule la transcription chiffrée est stockée.

### Messagerie textuelle

| Canal | Accès du fournisseur | Stockage serveur | Notes |
|---------|-----------------|----------------|-------|
| SMS | Votre fournisseur de téléphonie lit tous les messages | **Chiffré** | Le fournisseur conserve les messages originaux |
| WhatsApp | Meta lit tous les messages | **Chiffré** | Le fournisseur conserve les messages originaux |
| Signal | Le réseau Signal est E2EE ; le pont re-chiffre à l'arrivée | **Chiffré** | Route préférée quand disponible |

**Livraison Signal en priorité** : Lorsqu'un destinataire a Signal, les messages sont automatiquement acheminés via Signal — votre fournisseur de téléphonie ne voit jamais le contenu. Pour les SMS, seule une notification générique « vous avez un nouveau message » est envoyée par défaut (sans le contenu), donc les journaux de votre fournisseur ne contiennent aucun contenu sensible.

**Les messages sont chiffrés dès leur arrivée sur votre serveur.** Le serveur ne stocke que du texte chiffré. Votre fournisseur de téléphonie ou de messagerie peut encore avoir le message original — c'est une limitation de ces plateformes, pas quelque chose que nous pouvons changer.

**Assignation du fournisseur de messagerie** : Les fournisseurs SMS ont le contenu complet des messages uniquement si vous activez explicitement le mode SMS a contenu complet. Avec le mode notification seule par defaut, les corps SMS ne contiennent aucun contenu de message. Meta a le contenu WhatsApp. Les messages Signal sont E2EE vers le pont, mais le pont (sur votre serveur) déchiffre avant de re-chiffrer pour le stockage. Dans tous les cas, **votre serveur ne contient que du texte chiffré** — l'hébergeur ne peut pas lire le contenu des messages.

### Notes, transcriptions et rapports

Tout le contenu rédigé par les bénévoles est chiffré de bout en bout :

- Chaque note utilise une **clé aléatoire unique** (confidentialité persistante — compromettre une note ne compromet pas les autres)
- Les clés sont encapsulées séparément pour le bénévole et chaque administrateur
- Le serveur ne stocke que du texte chiffré
- Le déchiffrement se produit sur votre appareil, dans une couche sécurisée qui n'expose jamais les clés à l'interface utilisateur
- **Les champs personnalisés, le contenu des rapports et les pièces jointes sont tous chiffrés individuellement**

**Saisie de l'appareil** : Sans votre PIN **et** l'accès à votre compte de fournisseur d'identité, les attaquants obtiennent un blob chiffré protégé par Argon2id — une fonction de dérivation de clés à mémoire intensive qui rend les attaques par force brute avec du matériel spécialisé (GPU, ASIC) exponentiellement plus coûteuses que les approches traditionnelles. Si vous utilisez également une clé de sécurité matérielle, **trois facteurs indépendants** protègent vos données.

---

## Confidentialité du numéro de téléphone des bénévoles

Lorsque les bénévoles reçoivent des appels sur leurs téléphones personnels, leurs numéros sont exposés à votre fournisseur de téléphonie.

| Scénario | Numéro de téléphone visible pour |
|----------|------------------------|
| Appel PSTN vers le téléphone du bénévole | Fournisseur de téléphonie, opérateur téléphonique |
| Navigateur à navigateur (WebRTC) | Personne (l'audio reste dans le navigateur) |
| Asterisk auto-hébergé + téléphone SIP | Uniquement votre serveur Asterisk |

**Pour protéger les numéros de téléphone des bénévoles** : Utilisez les appels via le navigateur (WebRTC) ou fournissez des téléphones SIP connectés à Asterisk auto-hébergé.

---

## Récemment livré

Ces améliorations sont disponibles aujourd'hui :

| Fonctionnalité | Avantage pour la confidentialité |
|---------|-----------------|
| Protection des cles Argon2id | Les cles de votre appareil sont protegees par une fonction a memoire intensive qui resiste aux attaques par force brute avec GPU et materiel specialise |
| Routage Signal prioritaire | Les messages sont automatiquement achemines via Signal quand disponible, gardant le contenu hors des journaux du fournisseur SMS |
| Mode SMS notification seule | Les destinataires SMS voient uniquement « vous avez un nouveau message » — aucun contenu sensible dans les journaux du fournisseur |
| Resistance a l'analyse de trafic | Les tailles des evenements en temps reel sont completees pour que les observateurs ne puissent pas distinguer les messages courts des longs |
| Aucun numero de telephone en clair dans la base | Les numeros d'appelants sont stockes en hachages irreversibles — votre base ne contient jamais le numero reel |
| Chiffrement par hub avec confidentialite persistante | Les evenements en temps reel de chaque hub sont chiffres avec des cles qui tournent toutes les 24 heures — les anciennes cles ne peuvent pas dechiffrer les nouveaux evenements |
| Cryptographie en Rust sur toutes les plateformes | Bureau, iOS et Android executent la meme bibliotheque cryptographique Rust auditee — les cles n'entrent jamais dans le code JavaScript, Swift ou Kotlin |
| Acces restreint au relais | Votre relais WebSocket accepte les evenements uniquement de votre serveur — aucun tiers ne peut injecter de fausses notifications |
| Stockage de messages chiffré | Les messages SMS, WhatsApp et Signal sont stockés sous forme de texte chiffré sur votre serveur |
| Transcription embarquée | L'audio ne quitte jamais votre navigateur — traité entièrement sur votre appareil |
| Protection des clés multi-facteurs | Vos clés de chiffrement sont protégées par votre PIN, votre fournisseur d'identité et optionnellement une clé de sécurité matérielle |
| Clés de sécurité matérielles | Les clés physiques ajoutent un troisième facteur qui ne peut pas être compromis à distance |
| Builds reproductibles | Vérifier que le code déployé correspond à la source publique |
| Répertoire de contacts chiffré | Les enregistrements de contacts, relations et notes sont chiffrés de bout en bout |

## Encore prévu

| Fonctionnalité | Avantage pour la confidentialité |
|---------|-----------------|
| Applications natives pour recevoir des appels | Aucun numéro de téléphone personnel exposé |

---

## Tableau de synthèse

| Type de données | Chiffré | Visible par le serveur | Obtainable sous assignation |
|-----------|-----------|-------------------|---------------------------|
| Notes d'appel | Oui (E2EE) | Non | Texte chiffré uniquement |
| Transcriptions | Oui (E2EE) | Non | Texte chiffré uniquement |
| Rapports | Oui (E2EE) | Non | Texte chiffré uniquement |
| Pièces jointes | Oui (E2EE) | Non | Texte chiffré uniquement |
| Enregistrements de contacts | Oui (E2EE) | Non | Texte chiffré uniquement |
| Identités des bénévoles | Oui (E2EE) | Non | Texte chiffré uniquement |
| Métadonnées d'équipe/rôles | Oui (chiffré) | Non | Texte chiffré uniquement |
| Définitions de champs personnalisés | Oui (chiffré) | Non | Texte chiffré uniquement |
| Contenu SMS/WhatsApp/Signal | Oui (sur votre serveur) | Non | Texte chiffré de votre serveur ; le fournisseur peut avoir l'original |
| Métadonnées d'appel | Non | Oui | Oui |
| Hachages de téléphone des appelants | Haché HMAC | Hachage uniquement | Hachage (non réversible sans votre secret) |

---

## Pour les auditeurs de sécurité

Documentation technique :

- [Spécification du protocole](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/llamenos-protocol.md)
- [Modèle de menace](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/THREAT_MODEL.md)
- [Classification des données](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Audits de sécurité](https://github.com/rhonda-rodododo/llamenos-platform/tree/main/docs/security)
- [Documentation API](/api/docs)

Llamenos est open source : [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
