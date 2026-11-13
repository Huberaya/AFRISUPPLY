# Vercel : déploiements et quota (chantier P0-H)

13 novembre 2026. Sources : statuts et déploiements publiés sur GitHub. Le tableau de bord Vercel n'a pas été lu.

## 1. Deux projets sont reliés au dépôt

| Projet | Ce qu'on en voit sur GitHub | Rôle probable |
|---|---|---|
| `afrisupply-api` | Publie le statut « Vercel » de chaque commit ; son nom figure dans le lien de chaque statut, y compris pour `15c8b81` (production) | Sert la production (`afrisupply-api-zeta.vercel.app`) |
| `afrisupply` | Crée les objets « déploiement » de GitHub ; leurs adresses commencent par `afrisupply-`, pas par `afrisupply-api-` | **À établir** : second projet construit à chaque envoi |

Chaque envoi déclenche donc deux constructions. Lequel doit produire les déploiements AFRISUPPLY :
`afrisupply-api`, puisque c'est lui qui sert l'adresse de production. À confirmer dans Vercel.

## 2. Statuts par commit

| Commit | Statut « Vercel » (`afrisupply-api`) | Déploiement GitHub (`afrisupply`) |
|---|---|---|
| `482c4c5` | réussi, 01:22 UTC | créé, réussi |
| `6292ccb` | **refusé à 01:33 UTC : « Deployment rate limited — retry in 24 hours »** | aucun |
| `2a17015` | **réussi à 01:52 UTC**, dix-neuf minutes plus tard | créé, réussi |
| `33c559d` | réussi | non relevé |

**Correction.** Le rapport précédent écrivait que les commits suivant `6292ccb` n'avaient pas de
prévisualisation. C'était faux : `2a17015` a été déployé dix-neuf minutes après le refus. Le message
« retry in 24 hours » ne décrit donc pas un blocage de vingt-quatre heures constaté.

## 3. Ce qu'on sait et ce qu'on ignore

- La branche a reçu huit envois en deux jours, soit seize constructions : très loin d'un quota journalier. Le refus du 13 novembre à 01:33 est survenu au deuxième envoi en treize minutes : il ressemble à une limite de **cadence**, pas de volume. **Non vérifié** : la nature exacte de la limite se lit dans Vercel (Usage).
- Un statut « réussi » prouve qu'une construction a abouti. Il ne prouve pas que la prévisualisation répond : elle est derrière l'authentification de Vercel. **Aucune prévisualisation n'a été interrogée.**

## 4. Mesures

| Mesure | État |
|---|---|
| Regrouper les envois de l'agent | Appliqué : deux envois pour toute cette mission |
| Ne pas fusionner dans l'heure qui suit plusieurs envois | Recommandation pour le jour de la fusion : un refus de cadence empêcherait la mise en ligne |
| Couper les déploiements automatiques du projet redondant | **Proposition, non réalisée** : dans Vercel, projet `afrisupply` → Settings → Git → déconnecter le dépôt, ou « Ignored Build Step ». Divise la consommation par deux. À ne faire qu'après avoir vérifié qu'aucun domaine utile n'est servi par ce projet |
| Reprise après un refus | Relancer le déploiement depuis Vercel (« Redeploy »), ou pousser un nouveau commit après quelques minutes |
