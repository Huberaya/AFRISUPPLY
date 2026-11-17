# Vercel : prévisualisation, variables et quota — validation

| | |
|---|---|
| Date | 17 novembre 2026 |
| SHA contrôlé | `be6d05b86b99b34ddc3ab7592b7e3d6a0f80d3f6` pour les déploiements relevés ; le commit qui porte ce fichier se lit sur la demande de fusion n° 1 |
| Environnement des preuves | GitHub (statuts et déploiements publiés par Vercel) ; boîte du titulaire (notifications de Vercel) ; documentation publique de Vercel. **Le tableau de bord Vercel n'a pas été lu** : le connecteur de l'agent y est refusé |
| Statut d'ensemble | **EN ATTENTE EXTERNE** |
| Écritures sur Vercel | aucune : ni variable, ni déploiement demandé, ni réglage |

Les statuts sont définis dans `VALIDATION_ETAT_INITIAL_FUSION.md`. La matrice des variables et la
configuration Preview à appliquer restent celles de `docs/audits/VERCEL_MATRICE_ENVIRONNEMENTS.md`
(§ 1 et § 3) et de `docs/audits/LEVEE_RESERVES_VERCEL.md` (fiche VERCEL-02).

## 1. Ce qui est constaté

| Point | Constat | Source | Statut |
|---|---|---|---|
| Une prévisualisation du dernier commit publié existe | déploiement « Preview » du 13 novembre, 11 h 32 UTC, réussi | API GitHub | PROUVÉ |
| Elle n'est pas publique | toute lecture anonyme est renvoyée vers la page de connexion de Vercel (« déploiement protégé ») | lecture du 17 novembre | PROUVÉ |
| Deux projets Vercel sont reliés au dépôt | `afrisupply-api` publie le statut du commit ; `afrisupply` publie le déploiement | API GitHub | PROUVÉ |
| La production est servie par `afrisupply-api` | le statut « Vercel » du commit de production (`15c8b81`) pointe vers ce projet, et le domaine de production porte son nom | API GitHub ; nom de domaine | PROUVÉ par recoupement ; non lu dans Vercel |
| Un envoi sur `main` met en production tout seul | les six derniers déploiements « Production » (22 septembre au 5 octobre) ont tous été créés par le robot de Vercel, chacun pour un commit de `main` | API GitHub | PROUVÉ pour le passé ; réglage actuel non lu |
| Connecteur de l'agent | liste des équipes vide ; liste des projets : « accès refusé », avec ou sans identifiant d'équipe | essais du 13 et du 17 novembre | PROUVÉ |
| Variables de la portée Preview | jamais lues | — | EN ATTENTE EXTERNE |
| Variables de la portée Production, dont `JWT_SECRET` | jamais lues | — | EN ATTENTE EXTERNE — voir `PLAN_REPRISE_PRODUCTION.md`, § 3 |

## 2. Quota : la nature de la limite est identifiée

| Point | Constat | Source | Statut |
|---|---|---|---|
| Nature | Offre gratuite : **le stockage des fonctions inclus (10 Go) est utilisé à 100 %** | notification de Vercel du 5 novembre 2026 | PROUVÉ |
| Périmètre | toute l'équipe, pas ce seul projet : la même boîte reçoit en novembre plusieurs dizaines d'avis d'échec de prévisualisation pour d'autres projets | notifications de Vercel | PROUVÉ |
| Niveau actuel | inconnu : aucune notification depuis le 5 novembre | — | EN ATTENTE EXTERNE |
| Effet sur ce projet | le dernier commit publié a bien été déployé le 13 novembre ; aucun avis d'échec pour ce projet depuis septembre | API GitHub, notifications | PROUVÉ à cette date |
| Ce qui consomme | chaque envoi sur la branche produit deux déploiements (deux projets) ; chaque déploiement conserve son paquet de fonctions tant qu'il n'est pas supprimé | § 1 ; documentation de Vercel | PROUVÉ pour le doublon |

Ce que la documentation de Vercel indique pour réduire ce stockage (`https://vercel.com/docs/deployment-storage/optimize`, lue le 17 novembre) :

1. **Durée de conservation des déploiements** : réglage d'équipe (« Team Settings », « Build and Deployment », « Deployment Retention Policy ») ou de projet. C'est le premier levier ; il ne demande aucun changement de code.
2. Repérer, dans « Usage », les projets qui pèsent le plus, puis leurs déploiements anciens.
3. Supprimer les déclenchements en double. Ici : le second projet relié au même dépôt.
4. Exceptions à connaître : le dernier déploiement de prévisualisation de chaque branche active est conservé — fermer les demandes de fusion périmées des autres projets libère donc de la place.

Ce que cette mission ajoute à la consommation : **un seul envoi** sur la branche, donc deux déploiements de prévisualisation.

## 3. Ce que la prévisualisation doit montrer avant toute conclusion

| # | Preuve attendue | Statut |
|---|---|---|
| 1 | `GET <prévisualisation>/api/status/config`, avec le secret des tâches planifiées en en-tête : `sessionSecret.ok = true` | EN ATTENTE EXTERNE |
| 2 | même réponse : `database.role = "afrisupply_app"`, `database.host` différent de la production, `migrations.state = "a_jour"` | EN ATTENTE EXTERNE |
| 3 | même réponse : `clerk.instance.same = true` (les deux clés Clerk viennent de la même instance de développement) | EN ATTENTE EXTERNE |
| 4 | même réponse : `mail.testSender = false` (expéditeur sur un domaine vérifié) | EN ATTENTE EXTERNE |
| 5 | `GET <prévisualisation>/api/health` : `commit` = dernier commit de la branche, `region` = `fra1` | EN ATTENTE EXTERNE |
| 6 | Aucune variable de portée Production n'est visible de la prévisualisation (base, clé d'envoi, paiement, stockage des sauvegardes) | EN ATTENTE EXTERNE — ne peut pas être garanti par le code |

## 4. Rejouer le parcours du navigateur sur la prévisualisation

```
npm --prefix scripts/navigateur ci
AFS_WEB=https://<prévisualisation> AFS_BYPASS=<secret de contournement de la protection> node scripts/navigateur/parcours.mjs
```

- `AFS_BYPASS` est le secret « Protection Bypass for Automation » du projet : il se lit dans Vercel et ne s'écrit ni dans le dépôt ni dans une conversation.
- Le parcours crée ses propres données, toutes fictives (`VALIDATION_NEON_PREVIEW.md`, § 3).
- **Limite connue** : deux des dix-huit opérations lisent un lien dans un e-mail (acceptation d'une invitation, confirmation de l'adresse de l'exploitant). Contre une API distante, le script les annonce « NON FAIT » et ne les compte pas. Elles se font à la main, avec une vraie boîte de réception, une fois l'envoi d'e-mails validé (`docs/audits/RESEND_VALIDATION_PREVIEW.md`).
- À ne lancer que sur la base de prévisualisation propre. **Jamais sur la prévisualisation actuelle**, branchée sur une copie de la production.

## 5. Limites

- Aucune variable n'a été lue : la matrice est une cible, pas un constat.
- La nature du quota vient d'une notification ; son niveau actuel et son effet sur les prochains déploiements ne sont pas connus.
- Que la mise en production automatique soit toujours active se déduit du passé ; le réglage lui-même n'a pas été lu.

## 6. Ce qui est demandé au titulaire

| # | Geste | Effet |
|---|---|---|
| 1 | Relever le niveau de stockage dans « Usage » ; régler la durée de conservation des déploiements | Lève l'incertitude sur le quota |
| 2 | Décider du sort du second projet relié au dépôt (lequel des deux doit construire) | Divise par deux la consommation de chaque envoi |
| 3 | Appliquer la configuration Preview (`VERCEL_MATRICE_ENVIRONNEMENTS.md`, § 3), puis lire le diagnostic | Lève les points 1 à 6 du § 3 |
| 4 | Décider de la portée du connecteur de l'agent, ou relever soi-même les variables | Permet le constat au lieu de la cible |
| 5 | Relire `JWT_SECRET` de la portée Production : présent, 32 caractères au moins | Préalable à toute mise en production (`PLAN_REPRISE_PRODUCTION.md`) |
