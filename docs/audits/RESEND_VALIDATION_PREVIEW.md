# E-mails : validation sur une prévisualisation propre (chantier P0-E)

État au 13 novembre 2026 : **EN ATTENTE EXTERNE**. Rien de ce document n'a été exécuté : il manque un
domaine d'envoi vérifié et une prévisualisation sans données réelles.

## Préalables

| Préalable | Qui | État |
|---|---|---|
| Base de prévisualisation sans données réelles | ChatGPT (`LEVEE_RESERVES_NEON.md`, § 8) | en attente |
| Domaine d'envoi vérifié chez le prestataire | Titulaire (`RESEND_DIAGNOSTIC.md`, § 5) | en attente |
| Clé d'envoi **distincte de la production**, portée Preview | Titulaire | en attente |
| `MAIL_FROM` sur le domaine vérifié, portée Preview | Titulaire | en attente |
| Une boîte de test extérieure, autorisée par le titulaire | Titulaire | en attente |

## Déroulé et preuves attendues

| # | Geste | Résultat attendu |
|---|---|---|
| 1 | `GET <prévisualisation>/api/status` | `checks.mail` : `transport = "resend"`, `testSender = false` |
| 2 | Créer un compte d'essai avec l'adresse de la boîte de test | E-mail de confirmation **reçu** dans la boîte |
| 3 | Ouvrir le lien reçu, dans le navigateur où le compte est connecté | « Adresse e-mail confirmée », une seule fois ; le bandeau disparaît |
| 4 | Dans l'espace d'essai : carte, inventaire à zéro (alertes de rupture) | Des alertes urgentes existent |
| 5 | `GET <prévisualisation>/api/jobs/notify`, en-tête du secret des tâches de la prévisualisation | `failed: 0`, `emails ≥ 1` ; e-mail d'alerte reçu |
| 6 | Relancer l'appel 5 | `withAlerts: 0` : aucun doublon |
| 7 | `GET <prévisualisation>/api/status/jobs` (même secret) | Dernière ligne `alerts-notify` : `status = "ok"` |

Critère de sortie de la mission : étapes 2 et 5 réussies. En cas d'échec, la réponse de l'étape 5 donne
le motif (`reasons`), sans adresse ni texte du prestataire.

Interdits : utiliser la clé d'envoi de production sur la prévisualisation ; écrire à une adresse qui
n'est pas une boîte de test autorisée ; modifier une variable de portée Production.

## Mise à jour du 17 novembre 2026

| | |
|---|---|
| SHA contrôlé | arbre de `be6d05b86b99b34ddc3ab7592b7e3d6a0f80d3f6` complété par le commit qui porte cette mise à jour (à lire sur la demande de fusion n° 1) |
| Environnement | Aucun : rien de ce document n'a été exécuté |
| Statut | **EN ATTENTE EXTERNE**, inchangé : ni domaine d'envoi vérifié, ni prévisualisation sans données réelles |

Ce qui a changé côté code est décrit dans `RESEND_DIAGNOSTIC.md` (mise à jour du même jour). Une
précision pour le déroulé : sur une prévisualisation, le parcours automatique crée des comptes en
`@parcours.test`, domaine qui ne reçoit rien. L'essai d'envoi réel se fait donc à part, à la main, vers une
boîte que l'on peut lire — et les deux opérations du parcours qui dépendent d'un e-mail aussi.
