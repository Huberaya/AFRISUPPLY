# Mission AFRISUPPLY — rapport de suivi

Point de contrôle n° 1 — 12 novembre 2026. Ce fichier est mis à jour à chaque point de contrôle.

## Repères

| | |
|---|---|
| Dépôt | `Huberaya/AFRISUPPLY` (public) |
| HEAD de `main` | `15c8b81e665ab0b01e35e76fbae5f22c9c0271b0` — **inchangé** depuis l'audit P0.1 (aucun commit depuis le 2026-10-05) |
| Production | `https://afrisupply-api-zeta.vercel.app` — sert `15c8b81` (lu sur `/api/health` le 2026-11-12) : **aucune correction n'y est en ligne** |
| Branche de travail | `arena/326bcc8c-afrisupply`, issue de `15c8b81` |
| Dernier SHA contrôlé | `15c8b81` (main, production) |
| Dernier SHA modifié | `dbbeaafa8ed97e76ced0c98c62016e69e1a7506d` (corrections) ; ce dossier est dans le commit suivant |
| Défauts corrigés | 26 sur 26 du registre P0.1, plus 10 trouvés en cours de route (`REGISTRE_DEFAUTS_P0_1.md`) |
| Tests ajoutés | 164 (2 anciens tests, qui validaient le défaut critique, remplacés) |
| Tests | 680 réussis, 0 échoué (base 5, API 595, web 80) — avant : 518 |
| Bout en bout | 534 vérifications réussies sur 534, 13 scripts sur 13 — avant : 530 |
| `npm audit` (production) | 0 vulnérabilité — avant : 4 (1 critique, 1 haute, 2 modérées) |

**Une seule branche.** L'environnement de travail de l'agent n'autorise qu'une branche par session :
tous les chantiers sont donc sur `arena/326bcc8c-afrisupply`, jamais sur `main`. Aucune fusion,
aucun déploiement de production, aucun push forcé n'a été fait.

**Livrables P0.1.** Aucun des six fichiers nommés dans la mission n'existe dans le dépôt, sur aucune
branche. L'audit P0.1 a produit six fichiers sous d'autres noms, restés hors du dépôt :
`P0_1_RAPPORT_AUDIT.md` (audit technique, registre des risques, plan de chantiers),
`P0_1_ROUTES_API.csv`, `P0_1_CARTE_MODULES.md` (fonctionnalités), `P0_1_ENVIRONNEMENTS_CI_CD.md`,
`P0_1_BASE_DE_DONNEES.md`, `P0_1_SECURITE.md`. Ils décrivent des faiblesses d'une production qui
n'est pas encore corrigée, dans un dépôt public : ils ne sont pas commités. Décision attendue (voir
« Autorisations »).

## Tableau de suivi

| Chantier | État | Travaux réalisés | Tests | Preuves | Blocages |
|---|---|---|---|---|---|
| **P0.2-A** Défaut critique | À CONTRÔLER PAR CHATGPT | Route identifiée (`POST /api/auth/clerk-sync`), défaut reproduit, cause corrigée (identité prise dans un jeton Clerk vérifié côté serveur), liens antérieurs neutralisés, limite de débit | 21 tests ; sonde d'audit rejouée | `preuves/P0_2_clerk_sync_avant_apres.txt` | BLOQUANT : la production reste vulnérable jusqu'à fusion et déploiement (autorisation) |
| **P0.2-B** Isolation des restaurants | À CONTRÔLER PAR CHATGPT | Références croisées corrigées (produit, recette, fournisseur, offre) ; rôles alignés sur 76 routes | 22 + 79 tests ; balayage de 52 routes à paramètre × 21 identifiants réels (1 491 essais) | `preuves/P0_2_roles_et_references_avant_apres.txt` | — |
| **P0.2-C** Fournisseurs / restaurants | À CONTRÔLER PAR CHATGPT | Défaut nouveau trouvé et corrigé (conditions de paiement sur un restaurant non client) ; partages légitimes vérifiés | compris dans les 22 ; balayage des routes fournisseur | même fichier | — |
| **P0.2-D** Clerk | EN ATTENTE CLERK | Code : jeton vérifié, origine contrôlée, plus de clé de test de repli, plus de session Clerk acceptée directement | 21 tests avec un **faux** service Clerk | `interventions/CLERK-01` | EXTERNE : instance réelle, clés et réglages inconnus |
| **P0.2-E** Neon et RLS | EN ATTENTE NEON | Contrôles préparés (11 requêtes en lecture seule, validées sur le schéma du dépôt). Constat du dépôt : **aucune RLS** | — | `interventions/NEON-01` | EXTERNE : aucun accès à Neon |
| **P0.3** Défauts d'API | À CONTRÔLER PAR CHATGPT | 26 défauts sur 26 corrigés ; trois familles corrigées à la racine | 20 tests, dont les balayages des 251 routes | `REGISTRE_DEFAUTS_P0_1.md`, `preuves/P0_3_http_avant_apres.txt` | — |
| **P0.4** Production et Vercel | EN COURS | Migrations au build maîtrisées ; prévisualisation cloisonnée ; même garde de configuration sur Vercel ; état du schéma dans `/api/status` ; contrôles du bundle | 22 tests ; essai de fumée du bundle | `preuves/bundle_serverless.txt` | EXTERNE : connecteur Vercel sans portée (variables, journaux, tâches planifiées non lisibles). IMPORTANT : passe quotidienne non fiabilisée |
| **P0.5** Dépendances et sécurité applicative | À CONTRÔLER PAR CHATGPT | 4 vulnérabilités de production corrigées ; taille des corps ; en-têtes des pages ; secret des tâches comparé à temps constant | suite complète rejouée après chaque mise à jour | `preuves/dependances.txt` | SECONDAIRE : 16 vulnérabilités d'outils de développement |
| **P0.6** Parcours et intégrations | NON COMMENCÉ | (les 13 scripts de bout en bout existants passent) | — | `preuves/verifications_bout_en_bout.txt` | EXTERNE : base de prévisualisation (NEON-02) |
| **Commercialisation** | NON COMMENCÉ | Trois écarts relevés en passant (voir plus bas) | — | — | — |

Aucun chantier n'est marqué VALIDÉ : la validation revient au contrôle indépendant.

## P0.2 — ce qui a été fait, et comment le vérifier

### A. Le défaut critique

- **Route** : `POST /api/auth/clerk-sync` (`apps/api/src/routes/auth.ts`), en ligne depuis le 2026-09-23.
- **Défaut** : la route recevait `{ clerkId, email }` dans le corps de la requête et ouvrait une
  session sur le compte portant cette adresse. La vérification auprès de Clerk était facultative
  (absente sans clé) et son échec était ignoré (repli sur le corps de la requête).
- **Accès réellement possible ?** Oui, reproduit en local sur le commit audité : sans compte, avec la
  seule adresse d'un client, on obtient sa session ; avec l'adresse d'un exploitant, les écrans
  d'administration. **Non testé en production** (règle de l'audit). L'usage passé se lit dans le
  journal d'audit de la base : requête Q9 de la fiche NEON-01.
- **Exposé** : tout ce que voit le compte visé — données du restaurant, export complet, membres ; pour
  un exploitant : tous les restaurants, sauvegardes, restauration, journal d'audit.
- **Correction** : `apps/api/src/lib/clerk.ts` (vérification) et réécriture de la route. Cinq règles :
  identité = jeton de session Clerk vérifié ; adresse lue chez Clerk et vérifiée ; un compte déjà relié
  n'est ouvert que si l'adresse correspond ; un compte existant n'est relié que si son adresse a été
  prouvée des deux côtés ; tout échec ferme la porte.
- **Non-régression** : `apps/api/src/test/clerk-sync.test.ts`. Rejouer :
  `cd apps/api && npx vitest run src/test/clerk-sync.test.ts`.

### B et C. Cloisonnement

Méthode : deux restaurants et deux grossistes créés par les routes de l'application, chacun avec ses
fournisseurs, offres, stock, recettes, commandes, livraison avec écart, règle de réassort, événement,
liste de courses. Le restaurant B présente ensuite les 21 identifiants réels de A à chacune des 52
routes à paramètre du périmètre restaurant (lecture, suppression, écriture avec corps vide et avec
corps plausible). Sont vérifiés : aucune réponse ne contient un libellé de A, l'empreinte de chacune
des tables de A est identique avant et après, aucune erreur 500. Même exercice entre grossistes.

Couverture demandée par la mission : lecture, création, modification, suppression, commandes, stocks,
produits, fournisseurs, documents (PDF, export CSV, export de compte), membres, tableaux de bord,
exports, traitements automatiques (passe quotidienne) — chacun a son test dans
`p0-cloisonnement.test.ts`. Factures d'abonnement : route couverte par le balayage, sans facture
réelle dans le jeu d'essai.

Rejouer : `cd apps/api && npx vitest run src/test/p0-cloisonnement.test.ts src/test/p0-roles.test.ts`.

### D et E. Ce qui dépend de Clerk et de Neon

Rien n'est déclaré fait. Les fiches `interventions/CLERK-01`, `NEON-01`, `NEON-02` et `VERCEL-01`
décrivent chaque intervention : objectif, opérations, risques, interdits, preuves attendues.

## Ce qui change pour l'exploitation au moment de la fusion

À lire avant d'autoriser la fusion : chacun de ces points est voulu, et chacun peut surprendre.

| Changement | Effet | À vérifier avant |
|---|---|---|
| Sans `JWT_SECRET` sûr (32 caractères), l'API de production répond 503 | Arrêt du service si la variable manque ou est courte | VERCEL-01, point V2 |
| Droits d'exploitant sur adresse confirmée | L'exploitant perd ses écrans d'administration tant que son adresse n'est pas confirmée | NEON-01, requête Q10 |
| Le build de production contrôle les migrations | Échec du build si la base n'est pas à 29 migrations | NEON-01, requête Q2 |
| Clerk sans clé de repli | Sans `VITE_CLERK_PUBLISHABLE_KEY` au build, la connexion Clerk n'est plus proposée | VERCEL-01 V4, CLERK-01 |
| Déconnexion = révocation | Se déconnecter ferme les sessions du compte sur tous ses appareils | décision de produit |
| Rôles | Un compte « équipe » reçoit 403 sur 18 routes qu'il atteignait (17 réservées au responsable, 1 au propriétaire) | — |
| Prévisualisations | Elles répondent 503 tant qu'elles n'ont pas leur base | NEON-02 |

## Risques résiduels

| Risque | Classe | Détail |
|---|---|---|
| Production non corrigée | BLOQUANT | Le défaut critique est exploitable en production tant que la branche n'est pas déployée ; le dépôt étant public, la correction le rend visible |
| Liens Clerk posés avant la correction | IMPORTANT | La route corrigée les neutralise (adresse exigée identique) ; leur existence se lit avec NEON-01 Q8 et Q9 |
| Aucune RLS | IMPORTANT | L'isolation repose sur le code et sur les tests de cloisonnement ; décision d'architecture dans NEON-01 |
| Passe quotidienne | IMPORTANT | Aucune passe complète enregistrée en production depuis le 2026-09-23. La passe traite tous les restaurants l'un après l'autre dans une fonction limitée à 60 s et n'écrit sa trace qu'à la fin : un dépassement ne laisse aucune trace. Cause réelle non vérifiée (journaux Vercel inaccessibles). Non corrigé |
| Région | IMPORTANT | Fonctions en `iad1` (États-Unis, lu sur `/api/health`) ; si la base est en Europe, chaque requête SQL traverse l'Atlantique. À confirmer (NEON-01, VERCEL-01) |
| Données personnelles dans le dépôt public | IMPORTANT | `docs/prospection/` (constat S-04 de l'audit) : non traité, demande une décision (dépôt privé ou réécriture de l'historique) |
| Validation par navigateur | IMPORTANT | Aucune ; le parcours Clerk côté site n'a été vérifié que par compilation et tests unitaires |
| Outils de développement | SECONDAIRE | 16 vulnérabilités (jamais déployées) ; `npm audit fix` échoue sur une erreur interne de npm 10.9.8 |
| Politique de contenu des pages | SECONDAIRE | En-têtes ajoutés sans restriction des scripts (à régler avec une validation par navigateur) |

## Écarts relevés pour le dossier de commercialisation

1. L'inscription par Clerk ne fait pas accepter les conditions générales (l'inscription par mot de passe le fait).
2. La page « Profil » affichait « Vérifiée par Clerk » pour tout compte, y compris sans Clerk — corrigé : elle affiche l'état réel.
3. La politique de mot de passe accepte « Abcdefgh ».

## Autorisations demandées

| N° | Décision | Pourquoi |
|---|---|---|
| 1 | Fusionner la demande de fusion et déployer en production | Seul moyen de fermer le défaut critique. Préalables : VERCEL-01 (V2), NEON-01 (Q2, Q10) |
| 2 | Rendre le dépôt privé, ou accepter que la correction soit publique avant d'être en ligne | Le dépôt est public |
| 3 | Sort des fichiers de l'audit P0.1 | Les commiter après correction de la production, ou dès maintenant si le dépôt devient privé |
| 4 | Donner au connecteur Vercel la portée de l'équipe et des deux projets | Sans elle : ni variables, ni journaux, ni tâches planifiées |
| 5 | `docs/prospection/` : dépôt privé ou réécriture de l'historique | Données personnelles de tiers |
| 6 | Déconnexion = fermeture de toutes les sessions du compte | Choix de produit fait par défaut dans la correction |

## Prochaine action concrète

1. **ChatGPT et le titulaire des comptes** : fiches VERCEL-01 (points V1 à V3) et NEON-01 (requêtes Q1, Q2, Q8, Q9, Q10) — vingt minutes, lecture seule.
2. **Agent**, en parallèle et sans attendre : fiabiliser la passe quotidienne (trace dès le démarrage, budget de temps, reprise sans double envoi), puis ouvrir P0.6 sur la prévisualisation dès que NEON-02 est faite.
