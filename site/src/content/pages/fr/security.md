---
title: Sécurité et confidentialité
subtitle: Ce qui est protégé, ce qui est visible, et ce qui peut être obtenu sous assignation à comparaître — organisé selon les fonctionnalités que vous utilisez.
---

## Si votre hébergeur reçoit une assignation à comparaître

| Ils PEUVENT fournir | Ils NE PEUVENT PAS fournir |
|------------------|---------------------|
| Métadonnées des appels/messages (heures, durées) | Contenu des notes, transcriptions, corps des rapports |
| Blobs de base de données chiffrés | Clés de déchiffrement (stockées sur vos appareils) |
| Quels bénévoles étaient actifs et quand | Clés de chiffrement par note (éphémères) |
| Contenu des messages SMS/WhatsApp | Votre secret HMAC pour inverser les hachages de téléphone |

**Le serveur stocke des données qu'il ne peut pas lire.** Les métadonnées (quand, combien de temps, qui) sont visibles. Le contenu (ce qui a été dit, ce qui a été écrit) ne l'est pas.

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

**Fenêtre de transcription** : Pendant les ~30 secondes de transcription, l'audio est traité par Cloudflare Workers AI. Après la transcription, seul le texte chiffré est stocké.

### Messagerie textuelle

| Canal | Accès du fournisseur | Stockage serveur | Notes |
|---------|-----------------|----------------|-------|
| SMS | Votre fournisseur de téléphonie lit tous les messages | Texte en clair | Limitation inhérente au SMS |
| WhatsApp | Meta lit tous les messages | Texte en clair | Exigence de l'API WhatsApp Business |
| Signal | Le réseau Signal est E2EE, mais le pont signal-cli déchiffre | Texte en clair | Meilleur que SMS, pas sans connaissance |

**Assignation du fournisseur de messagerie** : Le fournisseur SMS a le contenu complet des messages. Meta a le contenu WhatsApp. Les messages Signal sont E2EE vers le pont, mais le pont (sur votre serveur) a le texte en clair.

**Amélioration future** : Nous explorons le stockage de messages E2EE où le serveur ne stocke que du texte chiffré. Voir le [roadmap](#whats-planned).

### Notes, transcriptions et rapports

Tout le contenu rédigé par les bénévoles est chiffré de bout en bout :

- Chaque note utilise une clé aléatoire unique (confidentialité persistante)
- Les clés sont encapsulées séparément pour le bénévole et l'administrateur
- Le serveur ne stocke que du texte chiffré
- Le déchiffrement se produit dans le navigateur

**Saisie de l'appareil** : Sans votre PIN, les attaquants obtiennent un blob chiffré. Un PIN à 6 chiffres avec 600 000 itérations PBKDF2 prend des heures à forcer sur du matériel GPU.

---

## Confidentialité du numéro de téléphone des bénévoles

Lorsque les bénévoles reçoivent des appels sur leurs téléphones personnels, leurs numéros sont exposés à votre fournisseur de téléphonie.

| Scénario | Numéro de téléphone visible pour |
|----------|------------------------|
| Appel PSTN vers le téléphone du bénévole | Fournisseur de téléphonie, opérateur téléphonique |
| Navigateur à navigateur (WebRTC) | Personne (l'audio reste dans le navigateur) |
| Asterisk auto-hébergé + téléphone SIP | Uniquement votre serveur Asterisk |

**Pour protéger les numéros de téléphone des bénévoles** : Utilisez les appels via le navigateur (WebRTC) ou fournissez des téléphones SIP connectés à Asterisk auto-hébergé.

**Amélioration future** : Applications de bureau et mobiles natives pour recevoir des appels sans exposer les numéros de téléphone personnels.

---

## Ce qui est prévu

Nous travaillons sur des améliorations pour réduire les exigences de confiance :

| Fonctionnalité | Statut | Avantage pour la confidentialité |
|---------|--------|-----------------|
| Stockage de messages E2EE | Prévu | SMS/WhatsApp/Signal stockés sous forme de texte chiffré |
| Transcription côté client | Prévue | L'audio ne quitte jamais le navigateur |
| Applications natives pour recevoir des appels | Prévues | Aucun numéro de téléphone personnel exposé |
| Builds reproductibles | Prévus | Vérifier que le code déployé correspond à la source |
| Pont Signal auto-hébergé | Disponible | Exécutez signal-cli sur votre propre infrastructure |

---

## Tableau de synthèse

| Type de données | Chiffré | Visible par le serveur | Obtainable sous assignation |
|-----------|-----------|-------------------|---------------------------|
| Notes d'appel | Oui (E2EE) | Non | Texte chiffré uniquement |
| Transcriptions | Oui (E2EE) | Non | Texte chiffré uniquement |
| Rapports | Oui (E2EE) | Non | Texte chiffré uniquement |
| Pièces jointes | Oui (E2EE) | Non | Texte chiffré uniquement |
| Métadonnées d'appel | Non | Oui | Oui |
| Identités des bénévoles | Chiffré au repos | Admin uniquement | Oui (avec effort) |
| Hachages de téléphone des appelants | Haché HMAC | Hachage uniquement | Hachage (non réversible sans votre secret) |
| Contenu SMS | Non | Oui | Oui |
| Contenu WhatsApp | Non | Oui | Oui (aussi depuis Meta) |
| Contenu Signal | Non | Oui | Oui (depuis votre serveur) |

---

## Pour les auditeurs de sécurité

Documentation technique :

- [Spécification du protocole](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/protocol/llamenos-protocol.md)
- [Modèle de menace](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/THREAT_MODEL.md)
- [Classification des données](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Audits de sécurité](https://github.com/rhonda-rodododo/llamenos/tree/main/docs/security)

Llamenos est open source : [github.com/rhonda-rodododo/llamenos](https://github.com/rhonda-rodododo/llamenos)
