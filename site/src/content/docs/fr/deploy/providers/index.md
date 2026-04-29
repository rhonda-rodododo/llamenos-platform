---
title: Fournisseurs de telephonie
description: Comparez les fournisseurs de telephonie pris en charge et choisissez celui qui convient le mieux a votre ligne.
---

Llamenos prend en charge plusieurs fournisseurs de telephonie grace a son interface **TelephonyAdapter**. Vous pouvez changer de fournisseur a tout moment depuis les parametres d'administration sans modifier le code de l'application.

## Fournisseurs pris en charge

| Fournisseur | Type | Modele tarifaire | Support WebRTC | Difficulte de mise en place | Ideal pour |
|---|---|---|---|---|---|
| **Twilio** | Cloud | A la minute | Oui | Facile | Demarrer rapidement |
| **SignalWire** | Cloud | A la minute (moins cher) | Oui | Facile | Organisations soucieuses des couts |
| **Vonage** | Cloud | A la minute | Oui | Moyen | Couverture internationale |
| **Plivo** | Cloud | A la minute | Oui | Moyen | Option cloud economique |
| **Asterisk** | Auto-heberge | Cout du trunk SIP uniquement | Oui (SIP.js) | Difficile | Confidentialite maximale, deploiement a grande echelle |

## Comparaison des tarifs

Couts approximatifs par minute pour les appels vocaux aux Etats-Unis (les prix varient selon la region et le volume) :

| Fournisseur | Entrant | Sortant | Numero de telephone | Offre gratuite |
|---|---|---|---|---|
| Twilio | $0.0085 | $0.014 | $1.15/mois | Credit d'essai |
| SignalWire | $0.005 | $0.009 | $1.00/mois | Credit d'essai |
| Vonage | $0.0049 | $0.0139 | $1.00/mois | Credit gratuit |
| Plivo | $0.0055 | $0.010 | $0.80/mois | Credit d'essai |
| Asterisk | Tarif du trunk SIP | Tarif du trunk SIP | Du fournisseur SIP | N/A |

Tous les fournisseurs cloud facturent a la minute avec une granularite a la seconde. Les couts d'Asterisk dependent de votre fournisseur de trunk SIP et de l'hebergement du serveur.

## Matrice de fonctionnalites

| Fonctionnalite | Twilio | SignalWire | Vonage | Plivo | Asterisk |
|---|---|---|---|---|---|
| Enregistrement d'appels | Oui | Oui | Oui | Oui | Oui |
| Transcription en direct | Oui | Oui | Oui | Oui | Oui (via bridge) |
| CAPTCHA vocal | Oui | Oui | Oui | Oui | Oui |
| Messagerie vocale | Oui | Oui | Oui | Oui | Oui |
| Appels WebRTC depuis le navigateur | Oui | Oui | Oui | Oui | Oui (SIP.js) |
| Validation des webhooks | Oui | Oui | Oui | Oui | Personnalisee (HMAC) |
| Sonnerie simultanee | Oui | Oui | Oui | Oui | Oui |
| File d'attente / musique d'attente | Oui | Oui | Oui | Oui | Oui |

## Comment configurer

1. Accedez a **Parametres** dans la barre laterale d'administration
2. Ouvrez la section **Fournisseur de telephonie**
3. Selectionnez votre fournisseur dans le menu deroulant
4. Saisissez les identifiants requis (chaque fournisseur a des champs differents)
5. Definissez votre numero de telephone de la ligne au format E.164 (ex. : `+15551234567`)
6. Cliquez sur **Enregistrer**
7. Configurez les webhooks dans la console de votre fournisseur pour pointer vers votre instance Llamenos

Consultez les guides de configuration individuels pour des instructions etape par etape :

- [Configuration : Twilio](/docs/deploy/providers/twilio)
- [Configuration : SignalWire](/docs/deploy/providers/signalwire)
- [Configuration : Vonage](/docs/deploy/providers/vonage)
- [Configuration : Plivo](/docs/deploy/providers/plivo)
- [Configuration : Asterisk (auto-heberge)](/docs/deploy/providers/asterisk)
- [Appels WebRTC dans le navigateur](/docs/deploy/providers/webrtc)
