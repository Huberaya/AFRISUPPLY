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
