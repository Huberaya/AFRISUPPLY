# État exact de la demande de fusion n° 1 avant la levée finale (chantier P0-A)

Relevé du 13 novembre 2026, 10:41 UTC, avant toute modification de cette mission. Sources : GitHub
(dépôt, demande de fusion, exécutions, statuts). Aucun secret, aucune donnée personnelle.

## Identifiants

| | Valeur | Preuve |
|---|---|---|
| `main` | `15c8b81e665ab0b01e35e76fbae5f22c9c0271b0` — inchangé (dernier commit : 2026-10-05) | GitHub, lecture directe |
| Branche candidate | `arena/326bcc8c-afrisupply` → `2a17015f9c4f09a5c0cbfeff774f6bb564723cbe` | GitHub, lecture directe |
| Demande de fusion n° 1 | ouverte, brouillon ; source = branche candidate, même SHA ; cible = `main` ; fusionnable sans conflit | API GitHub |
| Volume | 10 commits, 148 fichiers, +11770 / −2403 lignes | `git diff --numstat` |
| Modifications non commitées | aucune ; seuls les fichiers de l'audit P0.1 sont hors dépôt, volontairement | `git status` |
| Changement depuis le rapport précédent | aucun : la branche était toujours à `2a17015` | comparaison des SHA |
| Protection de `main` | **`protected: false`** d'après l'API publique de GitHub ; le détail des règles n'est pas lisible (403) | API GitHub |

`2a17015` n'est pas le SHA final : la mission ajoute `33c559d` puis le commit qui contient ce fichier.

## Les dix commits

| SHA | Date (UTC) | Objet |
|---|---|---|
| `dbbeaaf` | 12/11 15:49 | Corrections P0.2 à P0.5 : identité Clerk vérifiée, cloisonnement, défauts d'API, build, dépendances |
| `45fc754` | 12/11 15:51 | Suivi, registre des 26 défauts, fiches d'intervention, preuves |
| `2bf98b2` | 12/11 16:04 | Passe quotidienne : trace dès le démarrage |
| `dc0d382` | 12/11 18:06 | Passe quotidienne par tranches, reprise sans doublon, délais des appels sortants, régions |
| `c2b843f` | 12/11 18:50 | Parcours dans un navigateur, HTML des e-mails échappé, fenêtres de dialogue, région `fra1` |
| `dc8908d` | 12/11 18:59 | Frein des invitations par restaurant |
| `427e470` | 12/11 19:08 | Suivi : point de contrôle n° 2 |
| `482c4c5` | 13/11 01:20 | Clés Clerk tenues par le code, diagnostic de configuration sans secret |
| `6292ccb` | 13/11 01:33 | Rôle PostgreSQL minimal, prouvé sur la suite de l'API |
| `2a17015` | 13/11 01:51 | Bouton de commande dégagé, dossier Clerk / Neon / Vercel |

Les dix sont présents sur la branche distante ; aucun n'a été réécrit ni annulé.

## Différences avec `main`, par zone

| Zone | Fichiers | Lignes ajoutées | Lignes retirées |
|---|---|---|---|
| Tests de l'API | 28 | 2840 | 102 |
| API (code) | 42 | 1790 | 467 |
| Site | 17 | 349 | 119 |
| Base : client, migrations lues, rôle | 8 | 320 | 14 |
| Fonction serverless (entrée et bundle généré) | 2 | 2513 | 1374 |
| Scripts de vérification et de build | 14 | 1261 | 15 |
| Intégration continue | 2 | 174 | 13 |
| Documentation et preuves | 31 | 2419 | 9 |
| Racine (package.json, vercel.json, …) | 4 | 104 | 290 |
| **Total** | **148** | **11770** | **2403** |

Le diff complet se lit sur la demande de fusion ; `api/index.js` est un fichier généré (contrôlé par `check:bundle`).

## Intégration continue et déploiements

| Commit | Exécution | Qualité | Rôle minimal | Bout en bout | Navigateur | Statut Vercel |
|---|---|---|---|---|---|---|
| `45fc754` | `43252514046` | réussi | — | réussi | — | réussi |
| `2bf98b2` | `43256024698` | réussi | — | réussi | — | réussi |
| `dc0d382` | `43276393451` | réussi | — | réussi | — | réussi |
| `c2b843f` | `43283984008` | réussi | — | réussi | réussi | réussi |
| `427e470` | `43287128134` | réussi | — | réussi | réussi | réussi |
| `482c4c5` | `43344175716` | annulée par l'envoi suivant | — | — | — | réussi |
| `6292ccb` | `43345852567` | réussi | réussi | annulée par l'envoi suivant | réussi | **refusé : limite de déploiements** |
| `2a17015` | `43347942576` | réussi (2 min 35 s) | réussi (1 min 25 s) | réussi (14 min 33 s) | réussi (1 min 29 s) | réussi |

Workflows : `.github/workflows/ci.yml` (quatre tâches à `2a17015`) et `.github/workflows/cron-daily.yml`
(déclencheur du matin, inactif sans ses deux secrets). Un statut Vercel « réussi » prouve qu'un
déploiement a été construit, pas que la prévisualisation répond : elle est derrière l'authentification
de Vercel et n'a pas pu être interrogée.
