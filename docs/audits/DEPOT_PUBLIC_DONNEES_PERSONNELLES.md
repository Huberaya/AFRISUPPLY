# Dépôt public et données personnelles (chantier P0-J)

13 novembre 2026. Ce document ne reproduit aucune des données qu'il décrit.

## 1. Inventaire de `docs/prospection/`

| Fichier | Contenu | Lignes | Données personnelles ou de contact |
|---|---|---|---|
| `restaurants_africains_paris.csv` et `.xlsx` | Restaurants : nom, adresse, téléphone, e-mail, site, raison sociale, SIREN, dirigeant | 198 | 78 noms de dirigeants ; 96 téléphones dont 22 mobiles ; 34 adresses e-mail dont 15 de messagerie personnelle |
| `fournisseurs_africains_idf.csv` et `.xlsx` | Grossistes : nom, adresse, téléphone, e-mail, site, raison sociale, SIREN, effectif, dirigeant, notes | 206 | 113 noms de dirigeants ; 38 téléphones dont 10 mobiles ; 28 adresses e-mail dont 10 de messagerie personnelle ; 6 téléphones dans les notes |
| `README.md`, `README_fournisseurs.md` | Méthode de collecte et sources | — | Aucune coordonnée |

Soit, pour des tiers qui n'ont rien demandé : 191 noms de personnes physiques, 62 adresses e-mail, au
moins 134 numéros de téléphone. Le code de l'application ne lit aucun de ces fichiers.

## 2. Historique Git

Les quatre fichiers de données ont été committés sur `main` les 18 et 19 septembre 2026 (`e57f80f`,
`fd5692b`). Ils sont donc dans l'historique **public** depuis cette date, et le resteront après leur
retrait de la branche tant que l'historique n'est pas purgé. Le dépôt compte 0 fork et 0 étoile ; les
copies faites par des tiers (clones, robots d'indexation) ne sont pas connaissables.

## 3. Reste du dépôt et de l'historique

| Recherche | Résultat |
|---|---|
| Autres fichiers de données suivis (tableurs, exports, sauvegardes) | aucun |
| Fichiers de données supprimés dans le passé | aucun |
| Clés réelles (Clerk, Stripe, e-mails, stockage, GitHub), clés privées, jetons de session — dans tout l'historique | aucune occurrence |
| Chaînes de connexion avec mot de passe — dans tout l'historique | 3 occurrences, toutes des exemples ou des valeurs de test |
| Clé Clerk du site écrite dans le code d'origine (retirée par la branche) | 2 occurrences ; clé publique par nature, d'une instance de développement |
| Captures d'écran des preuves | comptes d'essai uniquement |
| Jeux d'essai, tests, données de démonstration | adresses inventées |

## 4. Classement

| Élément | Classement |
|---|---|
| Les deux `README` | Publiable |
| Les quatre fichiers de données, dans la branche | **Retiré du dépôt** (fait) — à conserver hors dépôt par le titulaire |
| Les quatre fichiers de données, dans l'historique | **Nécessite une purge de l'historique, ou le passage du dépôt en privé** |
| Rapports de l'audit P0.1 (jamais committés) | À garder hors dépôt tant que la production n'est pas corrigée |

## 5. Ce qui est fait dans la branche

1. Les quatre fichiers de données sont retirés ; les deux `README` disent pourquoi et où va la liste de travail (import par l'écran « Prospection »).
2. `.gitignore` refuse les tableurs, exports et sauvegardes, et tout fichier de `docs/prospection/` hors les deux `README`.
3. `scripts/controle-depot-public.mjs`, exécuté par la tâche « Qualité » : échec si un fichier suivi est un fichier de données, contient un secret probable, ou si un document contient un téléphone ou une adresse e-mail hors domaines d'exemple ; échec aussi pour toute liste de vingt coordonnées hors des tests. Il n'affiche jamais la valeur trouvée. Son auto-test (13 cas) tourne à chaque passage.

Effet à la fusion : les fichiers disparaissent de la branche principale. **Ils restent dans l'historique.**

## 6. Décision attendue du titulaire

| Option | Effet | Limites |
|---|---|---|
| **A. Passer le dépôt en privé** | Immédiat et réversible ; l'historique cesse d'être consultable par tous | Ne supprime pas les copies déjà faites ; les fonctions réservées aux dépôts publics cessent |
| **B. Purger l'historique** | Les fichiers disparaissent de tous les commits | Réécrit l'historique de `main` et de la branche (push forcé) : **interdit sans autorisation explicite** ; tous les SHA changent, la demande de fusion doit être refaite ; les vues en cache et les commits orphelins ne partent qu'après une demande à l'assistance de GitHub |

Proposition : A dès maintenant ; B avant toute remise en public.

Procédure B, si elle est autorisée : (1) geler les envois ; (2) copie de secours complète du dépôt, hors
ligne ; (3) retirer `docs/prospection/*.csv` et `*.xlsx` de tous les commits avec un outil de réécriture ;
(4) pousser en forçant `main` et la branche ; (5) demander à l'assistance de GitHub la purge des vues en
cache et des commits orphelins ; (6) vérifier par une recherche dans l'historique ; (7) faire recloner chaque poste.

**Information des personnes et obligations légales.** Des coordonnées de tiers ont été publiées sans que
ces personnes en soient informées. L'analyse de cette publication (information des personnes,
éventuelle notification à l'autorité de protection des données) relève du responsable de la société et de son conseil.
