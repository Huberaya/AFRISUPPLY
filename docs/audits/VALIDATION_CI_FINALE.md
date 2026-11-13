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
