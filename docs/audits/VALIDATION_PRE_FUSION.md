# Validation avant fusion (chantier P0-M)

13 novembre 2026. **Conclusion à cette date : la demande de fusion n° 1 n'est pas prête.** Le code est
vérifié ; sept conditions de sortie dépendent d'opérations que l'agent ne peut pas faire (Neon, Clerk,
Vercel, prestataire d'e-mails) et qui ne sont pas réalisées.

## 1. Identité du candidat

| | |
|---|---|
| `main` | `15c8b81e665ab0b01e35e76fbae5f22c9c0271b0` — inchangé |
| Branche | `arena/326bcc8c-afrisupply` ; son SHA final et ses contrôles se lisent sur la demande de fusion n° 1 (brouillon) |
| Commits | les dix de `ETAT_PR_AVANT_LEVEE_FINALE.md`, puis `33c559d` et le commit qui porte ce fichier |
| Migrations | 29 dans le code, 29 relevées en production : **aucune migration ajoutée, aucune exécutée** |
| Production | aucune fusion, aucun déploiement, aucune variable modifiée, aucune écriture en base |

## 2. Conditions de sortie

« Rempli » : preuve disponible et citée. « EN ATTENTE EXTERNE » : opération hors de portée de l'agent, non réalisée.

| # | Condition | État | Preuve ou manque | Nature de la preuve |
|---|---|---|---|---|
| 1 | SHA exact identifié | Rempli | `ETAT_PR_AVANT_LEVEE_FINALE.md` | plateforme réelle (GitHub) |
| 2 | Toutes les tâches CI vertes | **À constater sur le dernier commit** | `VALIDATION_CI_FINALE.md` ; `33c559d` a échoué, cause corrigée | plateforme réelle (GitHub) |
| 3 | Tests de l'API | Rempli : 691 sur 691, et 691 sur 691 avec le rôle minimal | `VALIDATION_CI_FINALE.md` | test automatisé |
| 4 | Tests du site | Rempli : 89 sur 89 | idem | test automatisé |
| 5 | 18 opérations rejouables au navigateur | Rempli en local ; **EN ATTENTE EXTERNE** sur une prévisualisation propre | `PARCOURS_NAVIGATEUR_FINAL.md` | test automatisé |
| 6 | Aucun accès croisé | Rempli | 1 491 essais par l'API ; cloisonnement dans le navigateur | test automatisé |
| 7 | **Accès de l'exploitant garanti** | **BLOQUANT** | Aucune adresse n'est confirmée en production et les e-mails n'y sont pas remis : au déploiement, l'exploitant perdrait ses écrans d'administration sans pouvoir confirmer son adresse. Le mécanisme, lui, est prouvé | test automatisé pour le mécanisme |
| 8 | Clerk production désactivé sans régression | Rempli par le code | `CLERK_VALIDATION_PREVIEW.md` | test automatisé ; à constater après déploiement |
| 9 | Clerk Preview : connexion réelle | **EN ATTENTE EXTERNE** | Instance de développement sans méthode de connexion ; clés Preview à poser | simulation seulement |
| 10 | Neon Preview sans données réelles | **EN ATTENTE EXTERNE** | La prévisualisation actuelle est une copie de la production ; fichier et procédure prêts (`LEVEE_RESERVES_NEON.md`, § 8) | — |
| 11 | Rôle minimal testé sur Neon Preview | **EN ATTENTE EXTERNE** | Prouvé hors de Neon : 691 tests, privilèges couverts table par table | test automatisé (base embarquée) |
| 12 | Migrations : aucun écart, aucune exécution en production | Rempli | 29 = 29 (relevé indépendant) | relevé indépendant |
| 13 | E-mails : envoi réel validé sur Preview | **EN ATTENTE EXTERNE** | Domaine d'envoi à vérifier (`RESEND_VALIDATION_PREVIEW.md`) | simulation seulement |
| 14 | Alertes : tâche réussie, erreurs restantes qualifiées | Code rempli ; tâche réussie sur Preview **EN ATTENTE EXTERNE** | `RESEND_DIAGNOSTIC.md` ; texte des 7 erreurs explicites à relever | test automatisé |
| 15 | Vercel : variables Preview cohérentes, diagnostic validé | **EN ATTENTE EXTERNE** | Connecteur refusé ; aucune variable lue ; matrice prête | non vérifié |
| 16 | Quota : situation identifiée, plan de reprise | Partiel | Deux projets identifiés depuis GitHub ; nature de la limite non vérifiée (`VERCEL_DEPLOYMENTS_QUOTA.md`) | plateforme réelle (GitHub) |
| 17 | Données personnelles du dépôt public | Branche : rempli. Historique : **BLOQUANT listé** | `DEPOT_PUBLIC_DONNEES_PERSONNELLES.md` ; décision privé ou purge | test automatisé (contrôle) |
| 18 | Restauration prouvée en environnement isolé | Rempli ; sauvegardes de production non opérationnelles | `SAUVEGARDE_RESTAURATION_VALIDATION.md` | test automatisé |
| 19 | Vulnérabilités qualifiées | Rempli : 0 en production, 16 d'outillage qualifiées et non corrigées | `VALIDATION_CI_FINALE.md` | plateforme (registre npm) |
| 20 | Deux documents finaux | Rempli | ce fichier, `REGISTRE_RISQUES_RESIDUELS.md` | — |
| 21 | Production : aucun changement non autorisé | Rempli | § 1 | — |

## 3. Ordre proposé pour lever les attentes

1. **Domaine d'envoi** vérifié chez le prestataire d'e-mails (titulaire). Débloque les conditions 7, 13 et 14.
2. **Base de prévisualisation propre** et rôle minimal (ChatGPT, `LEVEE_RESERVES_NEON.md` § 8). Débloque 10 et 11.
3. **Variables Preview** (`VERCEL_MATRICE_ENVIRONNEMENTS.md` § 3). Débloque 15, puis 5 sur la prévisualisation.
4. **Clerk développement** : méthode de connexion, clés Preview (`CLERK_VALIDATION_PREVIEW.md`). Débloque 9.
5. **En production actuelle**, une fois le domaine d'envoi en place : l'exploitant confirme son adresse par le lien reçu. Lève 7.
6. **Dépôt** : privé, ou purge autorisée. Lève 17.

## 4. Décisions attendues du titulaire

| # | Décision |
|---|---|
| 1 | Domaine et adresse d'expéditeur des e-mails |
| 2 | Création d'une base de prévisualisation distincte ; sort de la branche Neon qui copie la production |
| 3 | Méthode de connexion Clerk pour l'instance de développement |
| 4 | Dépôt privé, ou purge de l'historique (et analyse de la publication des coordonnées de tiers) |
| 5 | Qualification des deux événements du 5 octobre (`QUALIFICATION_AUTH_CLERK_SYNC.md`, § 4) |
| 6 | Stockage externe des sauvegardes |
| 7 | Protection de la branche `main` |
| 8 | Arrêt des déploiements du second projet Vercel |
| 9 | Portée du connecteur Vercel de l'agent |
| 10 | Sort des rapports de l'audit P0.1, restés hors du dépôt |
| 11 | En dernier : autorisation de fusion, après le contrôle indépendant |

## 5. Mise à jour du 17 novembre 2026

| | |
|---|---|
| SHA contrôlé | arbre de `be6d05b86b99b34ddc3ab7592b7e3d6a0f80d3f6` complété par le commit qui porte cette mise à jour (à lire sur la demande de fusion n° 1) |
| Environnements | GitHub, production (deux pages publiques), boîte du titulaire, base embarquée. Ni Neon, ni Clerk, ni le tableau de bord Vercel, ni celui du prestataire d'e-mails |
| Conclusion | **La demande de fusion n'est toujours pas prête à être fusionnée : dix conditions sur vingt et une ne sont pas prouvées sur les services réels.** L'agent n'a pas fusionné. Le détail de l'état initial est dans `docs/VALIDATION_ETAT_INITIAL_FUSION.md` ; les statuts y sont définis |

| # | Condition | Statut au 17 novembre | Ce qui a changé depuis le 13 |
|---|---|---|---|
| 1 | SHA exact identifié | PROUVÉ | Relu sur GitHub : `main` inchangé, aucun travail parallèle |
| 2 | Toutes les tâches CI vertes | PROUVÉ sur `be6d05b` (quatre tâches) ; à constater sur le dernier commit, sur la demande de fusion | — |
| 3 | Tests de l'API | PROUVÉ : 698 sur 698, et 698 sur 698 avec le rôle minimal | 7 tests ajoutés |
| 4 | Tests du site | PROUVÉ : 89 sur 89 | — |
| 5 | 18 opérations rejouables au navigateur | PROUVÉ en local (18 sur 18, 140 vérifications, rejoué le 17 novembre) ; **EN ATTENTE EXTERNE** sur une prévisualisation propre | Limite précisée : contre une API distante, deux opérations dépendent d'un e-mail réel (`docs/VALIDATION_VERCEL_PREVIEW.md`, § 4) |
| 6 | Aucun accès croisé | PROUVÉ — tests | — |
| 7 | Accès de l'exploitant garanti | **BLOQUÉ** | Une voie existe sans attendre le domaine d'envoi (`docs/PLAN_REPRISE_PRODUCTION.md`, § 3, P2) |
| 8 | Clerk production désactivé sans régression | PROUVÉ — tests ; à constater après déploiement | — |
| 9 | Clerk Preview : connexion réelle | **EN ATTENTE EXTERNE** | — |
| 10 | Neon Preview sans données réelles | **EN ATTENTE EXTERNE** | Procédure des données d'essai écrite (`docs/VALIDATION_NEON_PREVIEW.md`, § 3) |
| 11 | Rôle minimal testé sur Neon Preview | **EN ATTENTE EXTERNE** | — |
| 12 | Migrations : aucun écart, aucune exécution en production | PROUVÉ ; un défaut de l'outil **CORRIGÉ** | Instantané de la migration n° 28 ajouté ; contrôle « schéma et migrations » en CI |
| 13 | E-mails : envoi réel validé sur Preview | **EN ATTENTE EXTERNE** | — |
| 14 | Alertes : tâche réussie, erreurs restantes qualifiées | Code **CORRIGÉ** ; tâche réussie sur Preview **EN ATTENTE EXTERNE** | Tâche bornée dans le temps ; en production elle est toujours en erreur (lu le 17 novembre) |
| 15 | Vercel : variables Preview cohérentes, diagnostic validé | **EN ATTENTE EXTERNE** | Connecteur toujours refusé ; prévisualisation protégée, non lisible par l'agent |
| 16 | Quota : situation identifiée, plan de reprise | Nature PROUVÉE ; niveau actuel et réglages **EN ATTENTE EXTERNE** | Notification du prestataire lue : stockage des fonctions de l'offre gratuite à 100 % |
| 17 | Données personnelles du dépôt public | Branche : PROUVÉ. Historique : **BLOQUÉ** (décision) | Nouveau : journaux publics du workflow quotidien (`DEPOT_PUBLIC_DONNEES_PERSONNELLES.md`, mise à jour) |
| 18 | Restauration prouvée en environnement isolé | PROUVÉ — tests ; en production, aucune sauvegarde (relu le 17 novembre) | — |
| 19 | Vulnérabilités qualifiées | **CORRIGÉ** en partie : 16 → 4 ; 0 en production | `VALIDATION_CI_FINALE.md`, mise à jour |
| 20 | Documents finaux | Faits | Quatre documents ajoutés sous `docs/`, dix mis à jour ici |
| 21 | Production : aucun changement non autorisé | PROUVÉ | La production répond toujours avec le commit `15c8b81` |

Non prouvées sur les services réels : 5, 7, 9, 10, 11, 13, 14, 15, 16, 17.

**Ordre proposé, mis à jour.** Deux gestes ne dépendent de personne d'autre que le titulaire et prennent
quelques minutes : relire `JWT_SECRET` de la production, et confirmer l'adresse de l'exploitant par le
lien reçu. Ils lèvent les deux préalables qui rendraient la mise en production dangereuse. Le reste
suit l'ordre du § 3. Le défaut critique de connexion reste en production tant que la branche n'y est pas.

## 6. Mise à jour du 17 novembre 2026, seconde passe

| | |
|---|---|
| Branche contrôlée | `arena/326bcc8c-afrisupply`, dont la tête était `d358360be716ee182264977c7ef9b3e441f83f0f` (poussée par un autre agent à 12 h 04 UTC, CI verte : exécution `44079711068`) ; les commits de cette passe sont `36ab9d1` puis la fusion `51e228b` |
| `main` | `15c8b81e665ab0b01e35e76fbae5f22c9c0271b0`, inchangé |
| Environnements | GitHub, boîte du titulaire, base embarquée, registre des paquets. Toujours ni Neon, ni Clerk, ni le tableau de bord Vercel, ni celui du prestataire d'e-mails |
| Fusion | **non effectuée** — les conditions 5, 7, 9, 10, 11, 13, 14, 15, 16 et 17 ne sont toujours pas prouvées sur les services réels |

**Corrections apportées par cette passe** (chacune avec son test) :

| # | Défaut | Correction | Preuve |
|---|---|---|---|
| 1 | Une relance fournisseur qui n'avait rien remis marquait la commande comme relancée : elle ne repartait plus jamais | `vendor_reminded_at` n'est posé que si un message a été remis, ou s'il n'existe aucun canal | 2 tests (`p0m-corrections-finales.test.ts`) |
| 2 | `forecast_events` (soirée privatisée, fermeture…) absent de la sauvegarde : une restauration les perdait sans le dire | Table ajoutée à l'export et à l'essai de restauration | 1 test |
| 3 | La garde « prévisualisation ≠ production » comparait les chaînes complètes : la production sous une autre orthographe (mot de passe, `?sslmode=`, `/` final) passait pour une base de prévisualisation | `sameDatabase` compare l'hôte, le port et la base ; utilisé par `getDatabaseUrl` **et** par `scripts/deploy-migrate.mjs` | 2 tests |
| 4 | Le fichier du rôle ne retirait rien à un rôle déjà existant : un rôle créé par la console Neon gardait ses privilèges étendus | `ALTER ROLE … NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT NOREPLICATION`, `CREATE` retiré à `PUBLIC` sur la base et sur le schéma du journal, `CONNECT` accordé explicitement, gardes `IF EXISTS` pour rester rejouable sur une base vide | 1 test |
| 5 | Avec l'expéditeur d'essai, le balayage des alertes sollicitait le prestataire pour **chaque** restaurant (jusqu'à 200 appels rejetés par passage, limite de débit, ligne de suivi illisible) | `sweepBlocker` : le balayage s'arrête au premier restaurant qui n'a rien reçu ; le titulaire du compte du prestataire reste servi s'il figure parmi les destinataires | 2 tests + 1 test de la règle |
| 6 | 16 vulnérabilités d'outillage | 0 (`VALIDATION_CI_FINALE.md`, mise à jour) | `npm audit` |

**Conditions dont l'état change avec cette passe** : 3 (706 tests de l'API, et 706 sous le rôle
minimal), 14 (code corrigé une seconde fois), 19 (0 vulnérabilité, production et outillage). Les
autres sont inchangées par rapport au § 5.

**Constat nouveau, côté Vercel.** Le connecteur de l'agent s'authentifie (utilisateur
`baya-ibraimmayoanouedu-8164`, équipe par défaut `team_BdnOPU97H1GOmMxy7T06nijQ`) mais le jeton est
signalé **`limited: true`** : `list_teams` répond une liste vide et `list_projects` est refusé. C'est
la cause précise de l'impossibilité de lire la matrice des variables (condition 15) — il ne s'agit pas
d'un refus du projet mais d'un jeton sans portée de lecture. Geste du titulaire : attacher au
connecteur un jeton disposant de la lecture des projets et des variables (aucune valeur de secret n'est
demandée, les noms suffisent).

**Constat nouveau, côté boîte du titulaire.** Le courrier du matin arrive chaque jour à 05 h 21 UTC du
13 au 17 novembre, et uniquement à cette adresse : cela confirme sur un canal indépendant que le
prestataire remet **à son seul titulaire de compte** (expéditeur d'essai). Le workflow « Daily digest »
échoue chaque jour à l'étape « Résumé (et échec si le job a échoué) » après une étape de déclenchement
réussie : l'API répond donc, et l'échec vient des restaurants en erreur d'envoi. Les journaux
détaillés ne sont pas lisibles d'ici (l'hôte `results-receiver.actions.githubusercontent.com` n'est pas
joignable depuis l'environnement de l'agent) — constat à confirmer dans l'interface GitHub.
