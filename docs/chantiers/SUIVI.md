# Mission AFRISUPPLY — rapport de suivi

Point de contrôle n° 2 — 12 novembre 2026, 19 h UTC. Ce fichier est mis à jour à chaque point de contrôle.

## Repères

| | |
|---|---|
| Dépôt | `Huberaya/AFRISUPPLY` (public) |
| HEAD de `main` | `15c8b81e665ab0b01e35e76fbae5f22c9c0271b0` — **inchangé** depuis l'audit P0.1 (aucun commit depuis le 2026-10-05) |
| Production | `https://afrisupply-api-zeta.vercel.app` — sert `15c8b81`, fonctions en `iad1` (lu sur `/api/health` le 2026-11-12 à 18:59 UTC) : **aucune correction n'y est en ligne** |
| Branche de travail | `arena/326bcc8c-afrisupply`, issue de `15c8b81` — demande de fusion n° 1, en brouillon |
| Dernier SHA contrôlé | `15c8b81` (main, production) |
| Dernier SHA modifié | `dc8908d` (code) ; ce dossier est dans le commit suivant |
| Commits de la branche | `dbbeaaf` corrections P0.2 à P0.5 · `2bf98b2` et `dc0d382` passe quotidienne (P0.4) · `c2b843f` navigateur, e-mails, fenêtres (P0.6) · `dc8908d` frein des invitations |
| Défauts corrigés | 26 sur 26 du registre P0.1, plus 17 trouvés en cours de route (`REGISTRE_DEFAUTS_P0_1.md`) |
| Tests ajoutés | 208 (2 anciens tests, qui validaient le défaut critique, remplacés) |
| Tests | 724 réussis, 0 échoué (base 5, API 636, web 83) — avant : 518 |
| Bout en bout (API réelle) | 535 vérifications réussies sur 535, 13 scripts sur 13 — avant : 530 |
| Navigateur réel | 72 vérifications réussies sur 72 — avant : aucune validation par navigateur |
| `npm audit` (production) | 0 vulnérabilité — avant : 4 (1 critique, 1 haute, 2 modérées) |
| Intégration continue | Verte sur les quatre exécutions de la branche (`45fc754`, `2bf98b2`, `dc0d382`, `c2b843f`) ; elle échouait depuis le 2026-09-23. Trois tâches : qualité, bout en bout, navigateur (la dernière depuis `c2b843f`) |

**Une seule branche.** L'environnement de travail de l'agent n'autorise qu'une branche par session :
tous les chantiers sont donc sur `arena/326bcc8c-afrisupply`, jamais sur `main`. Aucune fusion,
aucun déploiement de production, aucun push forcé n'a été fait.

**Livrables P0.1.** Aucun des six fichiers nommés dans la mission n'existe dans le dépôt, sur aucune
branche. L'audit P0.1 a produit ses fichiers sous d'autres noms, restés hors du dépôt
(`P0_1_RAPPORT_AUDIT.md`, `P0_1_ROUTES_API.csv`, `P0_1_CARTE_MODULES.md`,
`P0_1_ENVIRONNEMENTS_CI_CD.md`, `P0_1_BASE_DE_DONNEES.md`, `P0_1_SECURITE.md`). Ils décrivent des
faiblesses d'une production qui n'est pas encore corrigée, dans un dépôt public : ils ne sont pas
commités. Décision attendue (autorisation n° 3).

## Ce qui a changé depuis le point n° 1

1. **Passe quotidienne (P0.4)** : réécrite. Elle avance par tranches, tient son journal, se reprend
   sans renvoyer ce qui est parti, et ne s'exécute qu'une fois par jour.
2. **Premier parcours dans un vrai navigateur (P0.6)** : 72 vérifications, en local et sur GitHub.
   Il a trouvé un défaut qu'aucun autre essai ne voyait : un nouveau client ne pouvait pas créer son
   premier fournisseur.
3. **E-mails** : les 26 modèles inséraient des noms saisis par les utilisateurs comme du HTML brut.
   Corrigé ; les invitations sont freinées.
4. **Région** : la production exécute ses fonctions aux États-Unis, à 96 ms de la base par requête.
   La branche les place à Francfort — **choix à confirmer avant la fusion** (VERCEL-01, V11).
5. **Dossier de commercialisation** : première version. Verdict : pas prêt pour un pilote payant,
   cinq raisons (`DOSSIER_COMMERCIALISATION.md`).

## Tableau de suivi

| Chantier | État | Travaux réalisés | Tests | Preuves | Blocages |
|---|---|---|---|---|---|
| **P0.2-A** Défaut critique | À CONTRÔLER PAR CHATGPT | Route identifiée (`POST /api/auth/clerk-sync`), défaut reproduit, cause corrigée (identité prise dans un jeton Clerk vérifié côté serveur), liens antérieurs neutralisés, limite de débit, délai sur l'appel à Clerk | 22 tests ; sonde d'audit rejouée (25 accès sur 25 avant, 0 sur 25 après) | `preuves/P0_2_clerk_sync_avant_apres.txt` | BLOQUANT : la production reste vulnérable jusqu'à fusion et déploiement (autorisation n° 1) |
| **P0.2-B** Isolation des restaurants | À CONTRÔLER PAR CHATGPT | Références croisées corrigées (produit, recette, fournisseur, offre) ; rôles alignés sur 76 routes, 18 fermées au compte « équipe » | 22 + 79 tests ; balayage de 52 routes à paramètre × 21 identifiants réels (1 491 essais) | `preuves/P0_2_roles_et_references_avant_apres.txt` | — |
| **P0.2-C** Fournisseurs / restaurants | À CONTRÔLER PAR CHATGPT | Défaut nouveau trouvé et corrigé (conditions de paiement sur un restaurant non client) ; partages légitimes vérifiés | compris dans les 22 ; balayage des routes fournisseur | même fichier | — |
| **P0.2-D** Clerk | EN ATTENTE CLERK | Code : jeton vérifié, origine contrôlée, plus de clé de test de repli, plus de session Clerk acceptée directement | 22 tests avec un **faux** service Clerk | `interventions/CLERK-01` | EXTERNE : instance réelle, clés et réglages inconnus |
| **P0.2-E** Neon et RLS | EN ATTENTE NEON | Contrôles préparés (13 requêtes en lecture seule, rejouées sur le schéma du dépôt : 20 instructions, 0 échec). Constat du dépôt : **aucune RLS** | — | `interventions/NEON-01` | EXTERNE : aucun accès à Neon |
| **P0.3** Défauts d'API | À CONTRÔLER PAR CHATGPT | 26 défauts sur 26 corrigés ; trois familles corrigées à la racine | 20 tests, dont les balayages des 251 routes | `REGISTRE_DEFAUTS_P0_1.md`, `preuves/P0_3_http_avant_apres.txt` | — |
| **P0.4** Production et Vercel | À CONTRÔLER PAR CHATGPT pour le code · EN ATTENTE VERCEL pour la preuve sur la plateforme | Migrations au build maîtrisées ; prévisualisation cloisonnée ; même garde de configuration sur Vercel ; **passe quotidienne par tranches** ; délais sur tous les appels sortants ; région et latence de la base dans `/api/status` ; workflow du matin réécrit (il n'affiche plus de données) ; fonctions à Francfort | 28 + 22 + 4 tests ; essai de fumée du bundle ; script du workflow exécuté contre une API locale | `preuves/P0_4_passe_quotidienne.txt`, `preuves/bundle_serverless.txt` | EXTERNE : connecteur Vercel sans portée (variables, journaux, tâches planifiées non lisibles). IMPORTANT : l'enchaînement des tranches et les durées réelles ne sont prouvés qu'en local |
| **P0.5** Dépendances et sécurité applicative | À CONTRÔLER PAR CHATGPT | 4 vulnérabilités de production corrigées ; taille des corps ; en-têtes des pages ; secret des tâches comparé à temps constant ; **HTML des e-mails échappé** ; noms montrés à des tiers limités ; invitations freinées | 8 tests ; suite complète rejouée après chaque mise à jour | `preuves/dependances.txt`, `REGISTRE_DEFAUTS_P0_1.md` | SECONDAIRE : 16 vulnérabilités d'outils de développement |
| **P0.6** Parcours et intégrations | EN COURS | Parcours réel dans un navigateur : pages publiques, inscription, démarrage, navigation, création d'un fournisseur, invitation d'un collègue jusqu'à sa connexion, droits, déconnexion, session expirée. Défaut des fenêtres de dialogue corrigé. Tableau des 12 parcours et des 8 intégrations | 72 vérifications dans le navigateur ; 3 tests du site | `P0_6_PARCOURS.md`, `preuves/P0_6_navigateur.txt`, `preuves/navigateur/` | IMPORTANT : commande, réception, stock et prix ne sont pas encore saisis par l'écran dans le navigateur (ils sont prouvés par l'API). EXTERNE : aucune intégration vérifiée contre le service réel ; base de prévisualisation (NEON-02) |
| **Commercialisation** | EN COURS | Première version du dossier : état fonction par fonction, écarts entre le site et les faits, documents, cinq blocages, plan de pilote avec conditions d'entrée et mesures | — | `DOSSIER_COMMERCIALISATION.md` | Décisions du responsable de la société (mentions légales, immatriculation, délais de support) |

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

## P0.4 — la passe quotidienne

Constat en production (page de statut publique, 2026-11-12) : dernière passe enregistrée le
2026-09-23, « partielle » ; tâche d'alertes en erreur ; aucune sauvegarde conservée ; 96 ms par
requête SQL. Mesure locale : environ 115 requêtes SQL par restaurant, soit 11 secondes à cette
latence — au-delà de cinq restaurants, l'ancienne passe ne tenait plus dans les 60 secondes d'une
fonction. **Que ce soit la cause réelle de la panne reste à vérifier** (journaux Vercel : VERCEL-01
V10 ; table des passes : NEON-01 Q12).

Ce que fait la branche :

- une passe par jour ; un second déclenchement répond « déjà faite » (`?force=1` la relance) ;
- 35 secondes de travail par invocation, puis l'API s'appelle elle-même pour la tranche suivante
  (40 tranches au plus) ; la tâche de 14 h et le workflow GitHub reprennent une passe inachevée ;
- le journal est écrit dans la ligne de la passe dès son démarrage : une coupure laisse une trace,
  et la page de statut dit « interrompue » ou « incomplète » ;
- une unité de travail (un restaurant, une sauvegarde) qui interrompt la passe deux fois est écartée ;
  la passe continue, finit « partielle » et le dit ;
- un e-mail déjà parti n'est pas renvoyé à la reprise (au pire, une unité coupée en plein envoi est
  rejouée : la remise est « au moins une fois »).

Rejouer : `cd apps/api && npx vitest run src/test/p0-passe-quotidienne.test.ts`. Huit règles de la
passe ont été retirées du code, une à la fois : chaque retrait fait échouer la suite (tableau dans
`preuves/P0_4_passe_quotidienne.txt`).

**Non prouvé** : l'appel de l'API à elle-même sur la plateforme, et les durées réelles. Se vérifie le
lendemain du déploiement sur `GET /api/status` (`checks.jobs.daily`), sans aucun accès privilégié.

## P0.6 — parcours dans un navigateur

`scripts/navigateur/parcours.mjs` pilote un vrai navigateur sur le site construit, contre une API
réellement démarrée : 72 vérifications, 215 appels à l'API, aucune erreur serveur. Exécuté en local
et par la tâche « navigateur » de l'intégration continue (exécution `43283984008`, 72 sur 72).

Le tableau des 12 parcours de la mission, avec pour chacun ce qui est piloté par le navigateur, ce qui
l'est par l'API, et ce qui est simulé, est dans `P0_6_PARCOURS.md`. En résumé : inscription, création
du restaurant, invitation, fournisseurs, droits, déconnexion et expiration de session sont démontrés
dans le navigateur ; catalogue, commande, réception, stock et comparaison de prix le sont par l'API,
pas encore par la saisie à l'écran. **Aucune intégration externe (Clerk, Stripe, Resend, stockage,
SMS) n'est vérifiée contre le service réel.**

## Ce qui change pour l'exploitation au moment de la fusion

À lire avant d'autoriser la fusion : chacun de ces points est voulu, et chacun peut surprendre.

| Changement | Effet | À vérifier avant |
|---|---|---|
| Sans `JWT_SECRET` sûr (32 caractères), l'API de production répond 503 | Arrêt du service si la variable manque ou est courte | VERCEL-01, point V2 |
| Droits d'exploitant sur adresse confirmée | L'exploitant perd ses écrans d'administration tant que son adresse n'est pas confirmée | NEON-01, requête Q10 |
| Le build de production contrôle les migrations | Échec du build si la base n'est pas à 29 migrations | NEON-01, requête Q2 |
| Clerk sans clé de repli | Sans `VITE_CLERK_PUBLISHABLE_KEY` au build, la connexion Clerk n'est plus proposée | VERCEL-01 V4, CLERK-01 |
| Fonctions à Francfort (`fra1`) au lieu de la Virginie | Plus rapide si la base est à Francfort, comme le site l'annonce ; plus lent si elle est ailleurs. **Choix fait sans lecture de la configuration réelle** | VERCEL-01, point V11 |
| Déconnexion = révocation | Se déconnecter ferme les sessions du compte sur tous ses appareils | décision de produit |
| Rôles | Un compte « équipe » reçoit 403 sur 18 routes qu'il atteignait (17 réservées au responsable, 1 au propriétaire) | — |
| Une passe quotidienne par jour | Un second déclenchement le même jour ne refait rien | — |
| Invitations et noms | 20 invitations par heure et par restaurant ; noms nouveaux limités à 80 caractères, sans chevron ni adresse web (les noms existants ne sont pas modifiés) | — |
| Prévisualisations | Elles répondent 503 tant qu'elles n'ont pas leur base | NEON-02 |

## Risques résiduels

| Risque | Classe | Détail |
|---|---|---|
| Production non corrigée | BLOQUANT | Le défaut critique est exploitable en production tant que la branche n'est pas déployée ; le dépôt étant public, la correction le rend visible |
| Mail du matin et sauvegardes en production | BLOQUANT pour un pilote | Aucune passe complète depuis le 2026-09-23 ; tâche d'alertes en erreur ; 0 sauvegarde conservée (aucune copie hors de la plateforme n'est configurée) |
| Passe quotidienne non prouvée sur la plateforme | IMPORTANT | Prouvée en local seulement ; l'appel de l'API à elle-même dépend de variables de la plateforme (VERCEL-01) |
| Région choisie sans confirmation | IMPORTANT | `fra1` repose sur les mentions légales du site et sur la latence mesurée, pas sur la lecture de la configuration (V11) |
| Liens Clerk posés avant la correction | IMPORTANT | La route corrigée les neutralise (adresse exigée identique) ; leur existence se lit avec NEON-01 Q8 et Q9 |
| Aucune RLS | IMPORTANT | L'isolation repose sur le code et sur les tests de cloisonnement ; décision d'architecture dans NEON-01 |
| Services externes non vérifiés | IMPORTANT | Clerk, Stripe, Resend, stockage des sauvegardes : essayés contre des simulations seulement. Les e-mails de production partent de l'adresse d'essai du prestataire |
| Parcours par l'écran incomplets | IMPORTANT | Commande, réception, stock, prix : prouvés par l'API, pas encore par la saisie dans un navigateur — le défaut des fenêtres montre ce que cet écart peut cacher |
| Données personnelles dans le dépôt public | IMPORTANT | `docs/prospection/` (constat S-04 de l'audit) : non traité, demande une décision (dépôt privé ou réécriture de l'historique) |
| Mentions légales inexactes | IMPORTANT | Hébergement annoncé dans l'Union européenne alors que les fonctions s'exécutent aux États-Unis ; sous-traitants manquants ; société non immatriculée (`DOSSIER_COMMERCIALISATION.md`) |
| Outils de développement | SECONDAIRE | 16 vulnérabilités (jamais déployées) ; `npm audit fix` échoue sur une erreur interne de npm 10.9.8 |
| Politique de contenu des pages | SECONDAIRE | En-têtes ajoutés sans restriction des scripts |
| Mot de passe | SECONDAIRE | La politique accepte « Abcdefgh » ; décision de produit |

## Autorisations demandées

| N° | Décision | Pourquoi |
|---|---|---|
| 1 | Fusionner la demande de fusion n° 1 et déployer en production | Seul moyen de fermer le défaut critique. Préalables : VERCEL-01 (V2, V4, V11), NEON-01 (Q2, Q10) |
| 2 | Rendre le dépôt privé, ou accepter que la correction soit publique avant d'être en ligne | Le dépôt est public |
| 3 | Sort des fichiers de l'audit P0.1 | Les commiter après correction de la production, ou dès maintenant si le dépôt devient privé |
| 4 | Donner au connecteur Vercel la portée de l'équipe et des deux projets | Sans elle : ni variables, ni journaux, ni tâches planifiées |
| 5 | `docs/prospection/` : dépôt privé ou réécriture de l'historique | Données personnelles de tiers |
| 6 | Déconnexion = fermeture de toutes les sessions du compte | Choix de produit fait par défaut dans la correction |
| 7 | Région des fonctions : confirmer Francfort, ou faire retirer la ligne de la branche | Choix fait par l'agent sans attendre la lecture de la configuration, que la fiche VERCEL-01 prévoyait d'attendre |
| 8 | Avant un pilote : stockage externe des sauvegardes (`BACKUP_S3_*`), suivi d'erreurs (`SENTRY_DSN`), domaine d'envoi vérifié, secrets `API_URL` et `CRON_SECRET` dans GitHub pour le workflow du matin | Chacun crée ou modifie une ressource hors du dépôt |

## Fiches à transmettre à ChatGPT

| Ordre | Fiche | Le minimum avant la fusion | Durée |
|---|---|---|---|
| 1 | `interventions/VERCEL-01` | V2 (secret de session), V4 (clés Clerk), V11 (région de la base) | 15 min, lecture seule |
| 2 | `interventions/NEON-01` | Q2 (29 migrations), Q10 (adresse de l'exploitant confirmée) ; puis Q8 et Q9 (usage passé du défaut critique), Q12, Q13 | 20 min, lecture seule |
| 3 | `interventions/CLERK-01` | C1 à C3 (instance, clés, vérification de l'adresse) | 10 min, lecture seule |
| 4 | `interventions/NEON-02` | Après la fusion ou en parallèle : base de prévisualisation | 20 min, crée une ressource |

Pour le contrôle du code : la demande de fusion n° 1, `REGISTRE_DEFAUTS_P0_1.md` et le dossier
`preuves/` (chaque fichier donne la commande qui rejoue la preuve).

## Prochaine action concrète

1. **ChatGPT et le titulaire des comptes** : les cinq lectures qui conditionnent la fusion — VERCEL-01
   V2, V4, V11 et NEON-01 Q2, Q10 — puis la décision n° 1.
2. **Agent**, sans attendre : piloter par le navigateur la première semaine d'un client (carte,
   fournisseur et ses prix, première commande, inventaire, ventes, réception), puis rejouer le
   parcours sur la prévisualisation dès qu'elle a sa base (NEON-02).
