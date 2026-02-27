---
title: Fonctionnalités
subtitle: Tout ce dont une plateforme de réponse aux crises a besoin, dans un seul package open source. Voix, SMS, WhatsApp, Signal, et rapports chiffrés — construits sur Cloudflare Workers sans serveurs à gérer.
---

## Téléphonie multi-fournisseurs

**5 fournisseurs vocaux** — Choisissez parmi Twilio, SignalWire, Vonage, Plivo ou Asterisk auto-hébergé. Configurez votre fournisseur dans l'interface des paramètres administrateur ou lors de l'assistant de configuration. Changez de fournisseur à tout moment sans modification de code.

**Appels WebRTC via le navigateur** — Les bénévoles peuvent répondre aux appels directement dans le navigateur sans téléphone. Génération de jetons WebRTC spécifique au fournisseur pour Twilio, SignalWire, Vonage et Plivo. Préférence d'appel configurable par bénévole (téléphone, navigateur, ou les deux).

## Routage des appels

**Sonnerie parallèle** — Lorsqu'un appelant compose le numéro, chaque bénévole en service et disponible sonne simultanément. Le premier bénévole à décrocher reçoit l'appel ; les autres sonneries s'arrêtent immédiatement.

**Planification par quarts** — Créez des quarts récurrents avec des jours et des plages horaires spécifiques. Affectez des bénévoles aux quarts. Le système achemine automatiquement les appels vers la personne de service.

**File d'attente avec musique d'attente** — Si tous les bénévoles sont occupés, les appelants entrent dans une file d'attente avec une musique d'attente configurable. Le délai d'expiration de la file est réglable (30-300 secondes). Quand personne ne répond, les appels sont redirigés vers la messagerie vocale.

**Messagerie vocale de secours** — Les appelants peuvent laisser un message vocal (jusqu'à 5 minutes) si aucun bénévole ne répond. Les messages vocaux sont transcrits via Whisper AI et chiffrés pour examen par l'administrateur.

## Notes chiffrées

**Prise de notes chiffrée de bout en bout** — Les bénévoles rédigent des notes pendant et après les appels. Les notes sont chiffrées côté client avec ECIES (secp256k1 + XChaCha20-Poly1305) avant de quitter le navigateur. Le serveur ne stocke que du texte chiffré.

**Double chiffrement** — Chaque note est chiffrée deux fois : une fois pour le bénévole qui l'a rédigée, et une fois pour l'administrateur. Les deux peuvent déchiffrer indépendamment. Personne d'autre ne peut lire le contenu.

**Champs personnalisés** — Les administrateurs définissent des champs personnalisés pour les notes : texte, nombre, sélection, case à cocher, zone de texte. Les champs sont chiffrés avec le contenu des notes.

**Sauvegarde automatique des brouillons** — Les notes sont automatiquement sauvegardées sous forme de brouillons chiffrés dans le navigateur. Si la page se recharge ou si le bénévole navigue ailleurs, son travail est préservé. Les brouillons sont effacés à la déconnexion.

## Transcription IA

**Transcription propulsée par Whisper** — Les enregistrements d'appels sont transcrits via Cloudflare Workers AI avec le modèle Whisper. La transcription se produit côté serveur, puis la transcription est chiffrée avant stockage.

**Contrôles de bascule** — L'administrateur peut activer/désactiver la transcription globalement. Les bénévoles peuvent se désabonner individuellement. Les deux bascules sont indépendantes.

**Transcriptions chiffrées** — Les transcriptions utilisent le même chiffrement ECIES que les notes. La transcription stockée n'est que du texte chiffré.

## Atténuation du spam

**CAPTCHA vocal** — Détection optionnelle de bots vocaux : les appelants entendent un nombre aléatoire à 4 chiffres et doivent le saisir sur le clavier. Bloque les compositions automatisées tout en restant accessible aux vrais appelants.

**Limitation de débit** — Limitation de débit par fenêtre glissante par numéro de téléphone, persistée dans le stockage des Durable Objects. Survit aux redémarrages des Workers. Seuils configurables.

**Listes de blocage en temps réel** — Les administrateurs gèrent les listes de blocage de numéros de téléphone avec entrée unique ou importation en masse. Les blocages prennent effet immédiatement. Les appelants bloqués entendent un message de rejet.

**Invites IVR personnalisées** — Enregistrez des invites vocales personnalisées pour chaque langue prise en charge. Le système utilise vos enregistrements pour les flux IVR, avec retour à la synthèse vocale en l'absence d'enregistrement.

## Messagerie multi-canal

**SMS** — Messagerie SMS entrante et sortante via Twilio, SignalWire, Vonage ou Plivo. Réponse automatique avec des messages de bienvenue configurables. Les messages s'intègrent dans la vue de conversation à fils.

**WhatsApp Business** — Connexion via l'API Meta Cloud (Graph API v21.0). Prise en charge des messages de modèle pour initier des conversations dans la fenêtre de messagerie de 24 heures. Prise en charge des messages multimédia pour les images, documents et audio.

**Signal** — Messagerie axée sur la confidentialité via un pont signal-cli-rest-api auto-hébergé. Surveillance de l'état avec dégradation progressive. Transcription des messages vocaux via Workers AI Whisper.

**Conversations à fils** — Tous les canaux de messagerie s'intègrent dans une vue de conversation unifiée. Bulles de messages avec horodatages et indicateurs de direction. Mises à jour en temps réel via WebSocket.

## Rapports chiffrés

**Rôle de reporter** — Un rôle dédié pour les personnes qui soumettent des conseils ou des rapports. Les reporters voient une interface simplifiée avec seulement les rapports et l'aide. Invités via le même flux que les bénévoles, avec un sélecteur de rôle.

**Soumissions chiffrées** — Le contenu du corps du rapport est chiffré avec ECIES avant de quitter le navigateur. Titres en texte brut pour le triage, contenu chiffré pour la confidentialité. Les pièces jointes sont chiffrées séparément.

**Flux de travail des rapports** — Catégories pour organiser les rapports. Suivi du statut (ouvert, réclamé, résolu). Les administrateurs peuvent réclamer des rapports et répondre avec des réponses à fils chiffrées.

## Tableau de bord administrateur

**Assistant de configuration** — Configuration guidée en plusieurs étapes lors de la première connexion administrateur. Choisissez les canaux à activer (Voix, SMS, WhatsApp, Signal, Rapports), configurez les fournisseurs et définissez le nom de votre ligne d'assistance.

**Liste de contrôle de démarrage** — Widget du tableau de bord qui suit la progression de la configuration : configuration des canaux, intégration des bénévoles, création des quarts.

**Surveillance en temps réel** — Consultez les appels actifs, les appelants en file d'attente, les conversations et le statut des bénévoles en temps réel via WebSocket. Les métriques se mettent à jour instantanément.

**Gestion des bénévoles** — Ajoutez des bénévoles avec des paires de clés générées, gérez les rôles (bénévole, administrateur, reporter), consultez le statut en ligne. Liens d'invitation pour l'auto-inscription avec sélection de rôle.

**Journalisation d'audit** — Chaque appel répondu, note créée, message envoyé, rapport soumis, paramètre modifié et action d'administrateur est journalisé. Visionneuse paginée pour les administrateurs.

**Historique des appels** — Historique des appels consultable et filtrable avec des plages de dates, la recherche par numéro de téléphone et l'attribution des bénévoles. Exportation de données conforme au RGPD.

**Aide intégrée** — Sections FAQ, guides spécifiques aux rôles, cartes de référence rapide pour les raccourcis clavier et la sécurité. Accessible depuis la barre latérale et la palette de commandes.

## Expérience bénévole

**Palette de commandes** — Appuyez sur Ctrl+K (ou Cmd+K sur Mac) pour accéder instantanément à la navigation, la recherche, la création rapide de notes et le changement de thème. Les commandes réservées aux administrateurs sont filtrées par rôle.

**Notifications en temps réel** — Les appels entrants déclenchent une sonnerie dans le navigateur, une notification push et un titre d'onglet clignotant. Activez chaque type de notification indépendamment dans les paramètres.

**Présence des bénévoles** — Les administrateurs voient les compteurs en ligne, hors ligne et en pause en temps réel. Les bénévoles peuvent activer un commutateur de pause dans la barre latérale pour suspendre les appels entrants sans quitter leur quart.

**Raccourcis clavier** — Appuyez sur ? pour voir tous les raccourcis disponibles. Naviguez entre les pages, ouvrez la palette de commandes et effectuez des actions courantes sans toucher la souris.

**Sauvegarde automatique des brouillons de notes** — Les notes sont automatiquement sauvegardées sous forme de brouillons chiffrés dans le navigateur. Si la page se recharge ou si le bénévole navigue ailleurs, son travail est préservé. Les brouillons sont effacés de localStorage à la déconnexion.

**Exportation de données chiffrées** — Exportez les notes sous forme de fichier chiffré conforme au RGPD (.enc) en utilisant la propre clé du bénévole. Seul l'auteur original peut déchiffrer l'exportation.

**Thèmes sombre/clair** — Basculez entre le mode sombre, le mode clair ou suivez le thème du système. Préférence persistée par session.

## Multi-langue et mobile

**12+ langues** — Traductions complètes de l'interface : anglais, espagnol, chinois, tagalog, vietnamien, arabe, français, créole haïtien, coréen, russe, hindi, portugais et allemand. Support RTL pour l'arabe.

**Application Web Progressive** — Installable sur n'importe quel appareil via le navigateur. Le service worker met en cache le shell de l'application pour un lancement hors ligne. Notifications push pour les appels entrants.

**Conception mobile d'abord** — Mise en page responsive conçue pour les téléphones et les tablettes. Barre latérale réductible, commandes tactiles conviviales et mises en page adaptatives.

## Authentification et gestion des clés

**Magasin de clés local protégé par PIN** — Votre clé secrète est chiffrée avec un PIN à 6 chiffres via PBKDF2 (600 000 itérations) + XChaCha20-Poly1305. La clé brute ne touche jamais sessionStorage ou toute API de navigateur — elle vit uniquement dans une fermeture en mémoire, mise à zéro au verrouillage.

**Verrouillage automatique** — Le gestionnaire de clés se verrouille automatiquement après un délai d'inactivité ou lorsque l'onglet du navigateur est masqué. Ressaisissez votre PIN pour déverrouiller. Durée d'inactivité configurable.

**Liaison d'appareils** — Configurez de nouveaux appareils sans jamais exposer votre clé secrète. Scannez un code QR ou entrez un court code d'approvisionnement. Utilise un échange de clés ECDH éphémère pour transférer en toute sécurité votre matériel de clé chiffré entre les appareils. Les salles d'approvisionnement expirent après 5 minutes.

**Clés de récupération** — Lors de l'intégration, vous recevez une clé de récupération au format Base32 (entropie de 128 bits). Cela remplace l'ancien flux d'affichage nsec. Téléchargement de sauvegarde chiffrée obligatoire avant de pouvoir continuer.

**Confidentialité persistante par note** — Chaque note est chiffrée avec une clé aléatoire unique, puis cette clé est encapsulée via ECIES pour chaque lecteur autorisé. Compromettre la clé d'identité ne révèle pas les notes passées.

**Authentification par paire de clés Nostr** — Les bénévoles s'authentifient avec des paires de clés compatibles Nostr (nsec/npub). Vérification de signature Schnorr BIP-340. Pas de mots de passe, pas d'adresses e-mail.

**Clés d'accès WebAuthn** — Prise en charge optionnelle des clés d'accès pour la connexion multi-appareils. Enregistrez une clé matérielle ou biométrique, puis connectez-vous sans saisir votre clé secrète.

**Gestion des sessions** — Modèle d'accès à deux niveaux : « authentifié mais verrouillé » (jeton de session uniquement) vs « authentifié et déverrouillé » (PIN saisi, accès cryptographique complet). Jetons de session de 8 heures avec avertissements de délai d'inactivité.
