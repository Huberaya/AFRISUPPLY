# Validation de l'intégration continue et de la qualité (chantier P0-L)

13 novembre 2026. Chaque résultat est rattaché à un SHA. Les résultats du **dernier** commit de la
branche figurent sur la demande de fusion ; ce fichier ne peut pas contenir le SHA du commit qui le porte.

## 1. Exécutions

| Commit | Exécution | Résultat |
|---|---|---|
| `2a17015` | `43347942576` | quatre tâches réussies (qualité, rôle minimal, bout en bout, navigateur) |
| `33c559d` | `43413352333` | **échec** de la tâche « Qualité » ; les trois autres n'ont pas tourné |
| commit suivant | à lire sur la demande de fusion | — |

**L'échec de `33c559d` vient de la branche elle-même.** Le contrôle « dépôt public », ajouté dans ce
commit, contenait dans son auto-test des exemples de secrets écrits en clair — et s'est signalé
lui-même une fois suivi par Git. Corrigé dans le commit suivant : les exemples sont assemblés à
l'exécution. Aucun test n'a été affaibli.

## 2. Contrôles rejoués sur l'arbre du dernier commit

| Commande | Résultat |
|---|---|
| `npm ci` | réussi |
| `npm test` | 785 tests réussis, 0 échec (base 5, API 691, site 89) |
| `AFS_DB_MINIMAL_ROLE=true npm test -w apps/api` | 691 réussis sur 691 |
| `npm run lint`, `npm run typecheck` | 0 erreur |
| `npm run build`, `check:bundle`, `check:bundle:run` | réussis |
| `npm run check:depot` | 13 cas d'auto-test ; aucun constat sur les fichiers suivis |
| `npm run check:base-neuve` | le script de base neuve correspond aux 29 migrations |
| Parcours du navigateur | 140 vérifications sur 140 ; 18 opérations sur 18 |
| `npm audit --omit=dev` | 0 vulnérabilité |
| Migrations | contrôle seul : aucune migration ajoutée, aucune appliquée nulle part |

## 3. Les 16 vulnérabilités d'outils de développement — qualifiées, non corrigées

Aucune ne touche le code déployé (`npm audit --omit=dev` : 0). Elles concernent des outils qui ne tournent
que sur un poste de développement ou en intégration continue.

| Paquet | Gravité | Nature | Exploitable ici ? | Suite |
|---|---|---|---|---|
| `vite` (via `launch-editor`) | haute | Ouverture d'un fichier dans l'éditeur depuis le serveur de développement | Seulement sur un poste qui fait tourner le serveur de développement et visite une page piégée | Mise à jour mineure disponible |
| `source-map-js` | haute | Déni de service sur une carte de sources malformée | Outillage de build ; aucune entrée extérieure | Mise à jour disponible |
| `esbuild`, `@esbuild-kit/*`, `drizzle-kit` | modérée | Le serveur de développement d'esbuild accepte des requêtes de toute page | `drizzle-kit` ne sert qu'à générer des migrations, à la main | Correctif = version majeure de `drizzle-kit` : à faire à part |
| `vitest`, `@vitest/mocker` | modérée | Injection par l'interface de test, traversée de chemin sous Windows | Seulement avec l'interface de test ouverte | Mise à jour disponible |
| `typescript-eslint` et ses paquets, `minimatch` | modérée | Déni de service sur un motif de fichiers | Motifs écrits par le projet lui-même | Mise à jour disponible |
| `postcss-selector-parser` | modérée | Lenteur sur un sélecteur CSS malformé | CSS écrit par le projet | Mise à jour disponible |

Pourquoi elles ne sont pas corrigées dans cette branche : `npm audit fix` échoue sur une erreur interne
de npm 10.9.8, et mettre à jour à la main l'outil de build et l'outil de test à la veille d'une fusion de
sécurité ajoute un risque sans réduire celui de la production. Proposition : une demande de fusion séparée, après celle-ci.

## 4. Workflows et secrets

| Workflow | Secrets utilisés | Remarque |
|---|---|---|
| `ci.yml` (quatre tâches) | **aucun** : valeurs d'essai écrites dans le fichier, base embarquée, faux stockage | Aucune tâche ne touche une ressource réelle |
| `cron-daily.yml` | `API_URL`, `CRON_SECRET` s'ils existent | Appelle la passe quotidienne de la production ; ne fait rien sans ses deux secrets ; n'affiche que des compteurs |

## 5. Protection de `main`

L'API publique de GitHub indique `protected: false` pour `main` : **aucune règle de protection n'est
active**. Rien n'empêche techniquement un envoi direct ou une fusion sans contrôles verts. L'agent ne
peut ni lire le détail ni le régler (403). Proposition au titulaire : exiger une demande de fusion et les
quatre tâches vertes avant toute fusion sur `main`.

## 6. Mise à jour du 17 novembre 2026

| | |
|---|---|
| SHA contrôlé | arbre de `be6d05b86b99b34ddc3ab7592b7e3d6a0f80d3f6` complété par le commit qui porte cette mise à jour (à lire sur la demande de fusion n° 1) |
| Environnements | GitHub Actions (résultats des tâches) ; poste de l'agent, Node 22, npm 10.9.8, base embarquée |

**Exécution du dernier commit publié.** `be6d05b` : exécution `43417700631`, quatre tâches réussies
(PROUVÉ, GitHub). Les journaux de cette exécution ne sont pas téléchargeables depuis le poste de
l'agent : le décompte des tests n'y a pas été relu.

**Contrôles rejoués le 17 novembre sur l'arbre mis à jour** (PROUVÉ, tests automatisés)

| Commande | Résultat |
|---|---|
| `npm ci` avec npm 10.9.8 sur le nouveau fichier de verrouillage | réussi, aucun paquet invalide |
| `npm test` | 792 tests réussis, 0 échec (base 5, API 698, site 89) |
| `AFS_DB_MINIMAL_ROLE=true npm test -w apps/api` | 698 réussis sur 698 |
| `npm run lint`, `npm run typecheck` | 0 erreur |
| `npm run build`, `check:bundle`, `check:bundle:run` | réussis |
| `npm run check:depot`, `npm run check:base-neuve` | réussis |
| `npm run check:schema` (nouveau) | les 29 migrations couvrent tout le schéma du code |
| Parcours du navigateur, sous le rôle minimal | 18 opérations sur 18 ; 140 vérifications sur 140 |
| `npm audit --omit=dev` | 0 vulnérabilité |

**Essais contraires** (chaque correction retirée, un test doit échouer) : limite de temps de la tâche
d'alertes ; sélection des seuls restaurants à servir ; motif d'échec d'envoi transmis à la personne ;
colonne ajoutée au schéma sans migration ; instantané de la migration n° 28 retiré. Cinq sur cinq détectés.

**Vulnérabilités d'outils de développement : 16 → 4** (CORRIGÉ en partie). Ce document proposait le
13 novembre de les traiter à part ; elles l'ont été ici, par des mises à jour mineures, chacune suivie de la suite complète.

| Paquet | Avant | Après | Reste |
|---|---|---|---|
| `vite` | 8.3.0 | 8.3.8 | 0 |
| `vitest`, `@vitest/mocker` | 4.1.11 | 4.1.12 | 0 |
| `typescript-eslint` et ses paquets (dont `minimatch`) | 8.70.0 | 8.73.0 | 0 |
| `source-map-js` | 1.2.1 | 1.2.2 | 0 |
| `postcss-selector-parser` | 6.1.4 | 6.1.6 | 0 |
| `drizzle-kit`, `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`, `esbuild` 0.18 | — | inchangés | **4 modérées** |

Les quatre restantes tiennent à l'outil de migration : la seule correction proposée par le registre
est un changement de version majeure de `drizzle-kit`. Elles concernent le serveur de développement
d'esbuild, que rien ne lance ici : l'outil ne sert qu'à générer une migration et au contrôle
`check:schema`. Statut : qualifiées, non corrigées — à faire à part.

Limite d'outillage : npm 10.9.8 échoue sur une erreur interne dès qu'il modifie une dépendance d'un
espace de travail. Le fichier de verrouillage a été produit avec npm 11.21.2 (même format, version 3),
puis vérifié par une installation propre avec npm 10.9.8.

**Nouveau contrôle en CI** : « Schéma et migrations concordent » (tâche « Qualité »).

**Protection de `main`** : toujours absente (`protected: false`, relu le 17 novembre). EN ATTENTE EXTERNE.
