# Plan de reprise de la production

| | |
|---|---|
| Date | 17 novembre 2026 |
| SHA contrôlés | production actuelle : `15c8b81e665ab0b01e35e76fbae5f22c9c0271b0` (lue sur `/api/health` le 17 novembre à 11 h 48 UTC). Candidat : la tête de la demande de fusion n° 1, à lire sur GitHub |
| Environnement | Aucun : **ceci est un plan. Rien de ce document n'a été exécuté** |
| Statut d'ensemble | **BLOQUÉ** par les préalables du § 3 |
| Qui exécute | Le titulaire. L'agent ne fusionne pas, ne déploie pas, ne modifie aucune variable |

Les statuts sont définis dans `VALIDATION_ETAT_INITIAL_FUSION.md`.

## 1. D'où l'on part

| Point | État au 17 novembre | Source |
|---|---|---|
| Code en production | `15c8b81` : aucune correction de la branche. Le défaut critique de connexion par Clerk y est toujours | `/api/health` ; `docs/audits/QUALIFICATION_AUTH_CLERK_SYNC.md` |
| Passe quotidienne | tourne chaque jour, n'écrit plus sa trace depuis le 23 septembre | `/api/status` ; boîte du titulaire |
| Tâche d'alertes | en erreur | `/api/status` |
| E-mails | expéditeur d'essai : remis à une seule adresse | `/api/status` ; `docs/audits/RESEND_DIAGNOSTIC.md` |
| Sauvegardes | aucune conservée | `/api/status` |
| Fonctions | aux États-Unis (`iad1`), base à Francfort | `/api/health` |
| Base | 29 migrations ; la branche n'en ajoute aucune | relevé indépendant du 13 novembre ; `npm run check:schema` |

## 2. Ce qu'une fusion déclenche

1. **Une mise en production automatique.** Les six derniers déploiements de production ont été créés
   par Vercel à chaque envoi sur `main` (`VALIDATION_VERCEL_PREVIEW.md`, § 1). Fusionner, c'est donc
   mettre en ligne, sans autre geste.
2. Le build : installation, **contrôle en lecture seule** de la base (il échoue si elle est en retard
   sur le code ; il n'applique rien sans la variable `MIGRATE_ON_BUILD=apply`), construction du site, puis du paquet de l'API.
3. Les fonctions passent de `iad1` à `fra1`.
4. Le workflow « Daily digest » de GitHub prend sa version corrigée (`VALIDATION_ETAT_INITIAL_FUSION.md`, § 5.1).
5. Les deux projets Vercel reliés au dépôt peuvent chacun construire un déploiement (constaté sur la branche).

## 3. Préalables — tant qu'ils ne sont pas levés, ne pas mettre en production

| # | Préalable | Ce qui se passe sinon | Comment le constater | Statut |
|---|---|---|---|---|
| P1 | `JWT_SECRET` de la portée Production : présent, 32 caractères au moins, pas une valeur d'exemple | **L'API répond 503 partout**, sauf `/api/health`. La version actuelle tolère un secret faible, et même absent (elle signe alors les sessions avec une valeur écrite dans le code, donc publique) ; la branche, non | Lecture dans Vercel (la valeur ne se recopie nulle part). **À relire sans attendre la fusion** | **BLOQUÉ** — jamais lu |
| P2 | L'adresse de l'exploitant est **confirmée** en production | L'exploitant perd ses écrans d'administration à la mise en ligne : la branche les réserve à une adresse confirmée | Bandeau « Confirmez votre adresse » absent de son compte ; ou requête N7 de la fiche NEON-03 | **BLOQUÉ** — 0 adresse confirmée au relevé du 13 novembre |
| P3 | `SEED_DEMO` absente de la portée Production | 503, comme P1 | Lecture dans Vercel | EN ATTENTE EXTERNE |
| P4 | `DATABASE_URL` présente en portée Production | 503 | La production actuelle répond avec sa base : remplie aujourd'hui | PROUVÉ |
| P5 | Base à 29 migrations | Le build échoue, rien n'est mis en ligne | Relevé du 13 novembre : 29 | PROUVÉ à cette date |
| P6 | Quota Vercel : un déploiement de production peut être construit | Mise en ligne retardée ou refusée | « Usage » de l'équipe | EN ATTENTE EXTERNE |
| P7 | Les préalables P1 à P3 ont été essayés sur une prévisualisation propre | On découvre en production ce qu'on aurait vu en essai | `VALIDATION_VERCEL_PREVIEW.md`, § 3 | EN ATTENTE EXTERNE |

**P2, comment le lever dès aujourd'hui.** Le prestataire d'e-mails, avec l'expéditeur d'essai, ne remet
qu'à l'adresse du titulaire de son propre compte — celle où arrive chaque matin le mail d'AFRISUPPLY.
Si le compte de l'exploitant est à cette adresse : se connecter à la production, cliquer sur « Renvoyer
le lien » dans le bandeau, ouvrir le lien reçu. La page de la version actuelle peut afficher une erreur
après une confirmation réussie (défaut corrigé dans la branche) : c'est la disparition du bandeau qui
fait foi. Si le compte de l'exploitant est à une autre adresse, il faut d'abord un domaine d'envoi
vérifié. **Jamais d'écriture en base pour confirmer une adresse.**

Ne sont pas des préalables à la mise en production, mais restent dus avant d'ouvrir à des clients :
domaine d'envoi vérifié, stockage externe des sauvegardes, sort de l'historique public du dépôt,
protection de `main` (`docs/audits/REGISTRE_RISQUES_RESIDUELS.md`).

## 4. Deux façons de fusionner — décision du titulaire

| | A. Fusion = mise en production | B. Fusion sans mise en ligne |
|---|---|---|
| Principe | Comportement actuel : la fusion déploie | La fusion n'intègre que le code ; la mise en production devient un geste distinct |
| Comment | Rien à changer | Soit couper le déploiement automatique de `main` dans les réglages Git du projet Vercel ; soit ajouter au fichier `vercel.json` le bloc `"git": { "deploymentEnabled": { "main": false } }` |
| Avantage | Le correctif de sécurité est en ligne dès la fusion | La fusion peut avoir lieu avant que P1 et P2 soient levés |
| Risque | P1 ou P2 non levé : API en 503, ou exploitant sans administration | Croire le correctif en ligne alors qu'il ne l'est pas : tant que personne ne déploie, la production reste sur `15c8b81` |
| À faire ensuite | § 5, à partir de l'étape 3 | Rétablir le déploiement, ou déployer à la main, puis § 5 à partir de l'étape 3 |

**La voie B n'est pas appliquée.** L'agent n'a pas modifié `vercel.json` : couper la mise en ligne de la
branche de production est une décision du titulaire. Le bloc ci-dessus n'a pas pu être essayé (aucun
accès à Vercel) : à vérifier dans la documentation de Vercel avant usage.

## 5. Déroulé

| # | Étape | Contrôle | Qui |
|---|---|---|---|
| 1 | Noter le déploiement de production actuel (celui du 5 octobre, `15c8b81`) : c'est le point de retour | Il est visible dans la liste des déploiements du projet | Titulaire |
| 2 | Lever P1 à P3, relire P6 | § 3 | Titulaire |
| 3 | Sortir la demande de fusion du brouillon, vérifier que les quatre tâches CI sont vertes **sur son dernier commit**, fusionner | Onglet « Checks » de la demande de fusion | Titulaire |
| 4 | Attendre la fin du déploiement de production | Statut « Vercel » du commit de fusion | — |
| 5 | Lire `/api/health` | `commit` = commit de fusion ; `region` = `fra1` ; `env` = `production` | Titulaire ou agent (page publique) |
| 6 | Lire `/api/status` | La page répond (pas de 503) ; `checks.database.ok = true` | idem |
| 7 | Lire `/api/status/config` avec le secret des tâches planifiées en en-tête | `sessionSecret.ok = true` ; `migrations.state = "a_jour"` ; Clerk coupé, sans erreur | Titulaire |
| 8 | Se connecter comme exploitant | Le menu d'administration apparaît ; l'écran « Exploitation » s'ouvre ; les sauvegardes et le journal répondent | Titulaire |
| 9 | Se connecter comme client d'essai : tableau de bord, une commande | Aucun écran d'erreur | Titulaire |
| 10 | Le lendemain matin : lire `/api/status` | `jobs.daily` : une passe **enregistrée** du jour (« ok », ou « partial » si des e-mails sont encore refusés) ; `alerts-notify` : motif lisible | Titulaire ou agent |
| 11 | Onglet « Actions » : l'exécution suivante de « Daily digest » | Aucun nom de restaurant dans son journal | Titulaire |

## 6. Retour arrière

- **Code** : dans Vercel, remettre en production le déploiement noté à l'étape 1 (« Instant Rollback »
  ou « Promote »). La branche n'ajoute aucune migration : l'ancien code lit la base telle que le nouveau la laisse.
- **Dépôt** : annuler la fusion par un commit d'annulation, dans une nouvelle demande de fusion. Jamais d'envoi forcé sur `main`.
- **Quand revenir en arrière** : 503 généralisé (P1 ou P3), connexion impossible, exploitant sans administration (P2) — si la cause ne se corrige pas par une variable en quelques minutes.
- Limite : ce retour arrière n'a pas été essayé ; il repose sur le fonctionnement documenté de Vercel et sur l'absence de migration.

## 7. Après la reprise

| Sujet | Document |
|---|---|
| Domaine d'envoi vérifié, puis essai réel des e-mails | `docs/audits/RESEND_VALIDATION_PREVIEW.md` |
| Stockage externe des sauvegardes, première restauration d'essai | `docs/audits/SAUVEGARDE_RESTAURATION_VALIDATION.md` |
| Passage de la production au rôle PostgreSQL minimal | `VALIDATION_NEON_PREVIEW.md` |
| Historique public du dépôt ; journaux publics du workflow | `docs/audits/DEPOT_PUBLIC_DONNEES_PERSONNELLES.md` |
| Protection de `main` | `docs/audits/VALIDATION_CI_FINALE.md`, § 5 |
| Qualification des deux connexions du 5 octobre | `docs/audits/QUALIFICATION_AUTH_CLERK_SYNC.md` |
