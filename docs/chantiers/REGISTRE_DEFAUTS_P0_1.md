# Registre des défauts prouvés par l'audit P0.1 — état après correction

Commit audité : `15c8b81` (identique au HEAD de `main` le 2026-11-12). Corrections : commit `dbbeaaf`
de la branche `arena/326bcc8c-afrisupply` pour les 26 défauts ; commits `2bf98b2`, `dc0d382`, `c2b843f`
et suivants pour ceux trouvés pendant les chantiers P0.4 et P0.6 (avant-dernière section). Les 26 défauts prouvés du fichier `P0_1_ROUTES_API.csv`
(1 critique, 25 autres) sont repris un par un. « Test » désigne le fichier de `apps/api/src/test/`
qui échouerait si le défaut revenait.

**Portée de la preuve.** Tous les tests s'exécutent sur une base PostgreSQL embarquée, Clerk y est
simulé. Chaque ligne « corrigé » signifie : corrigé dans le code et vérifié par un test. Aucune ne
signifie « corrigé en production » : la production exécute encore `15c8b81` tant que la branche
n'est pas fusionnée et déployée.

## Les 26 défauts

| N° | Route | Défaut prouvé | Correction | Test |
|---|---|---|---|---|
| R001 | `POST /api/auth/clerk-sync` | **Critique.** Session ouverte sur tout compte à partir de sa seule adresse e-mail ; aucune limite de débit | Identité prise uniquement dans un jeton de session Clerk vérifié côté serveur ; adresse lue chez Clerk et exigée vérifiée ; aucun repli ; 20 appels par minute | `clerk-sync.test.ts` (21) |
| R002 | `POST /api/auth/forgot-password` | Réponse différente selon que le compte existe | Même message et mêmes champs dans les deux cas | `p0-api-robustesse` · `account-recovery` |
| R004 | `POST /api/auth/logout` | Le jeton reste valable après la déconnexion | La déconnexion révoque les sessions du compte | `p0-api-robustesse` · `clerk-sync` |
| R009 | `POST /api/auth/register` | Une adresse de `ADMIN_EMAILS` encore libre donne les droits d'exploitant dès l'inscription | Les droits d'exploitant exigent une adresse confirmée (règle unique, `isPlatformAdmin`) | `p0-api-robustesse` |
| R018 | `POST /api/import/suppliers` | Un compte « équipe » crée des fournisseurs par import | Rôle responsable exigé | `p0-roles` |
| R031 | `PUT /api/admin/reference/:id` | 500 sur `{}` ; 404 sans session | 400 ; 401 | `p0-api-robustesse` |
| R036 | `POST /api/catalog/track` | Accepte le produit privé d'un autre restaurant, dont le nom apparaît ensuite dans le stock | Produit vérifié pour le restaurant ; contrôle répété dans la fonction de suivi | `p0-cloisonnement` |
| R040 | `DELETE /api/stock/:itemId` | Aucune garde de rôle ; 404 sans session | Rôle responsable ; 401 | `p0-roles` |
| R054 | `PUT /api/suppliers/:id` | 500 sur `{}` ; 404 sans session | 400 ; 401 | `p0-api-robustesse` |
| R056 | `POST /api/suppliers/:id/offers/batch` | Un compte « équipe » modifie des prix ; 404 sans session | Rôle responsable ; 401 | `p0-roles` |
| R073 | `PUT /api/recurring/:id` | 500 sur `{}` ; 404 sans session | 400 ; 401 | `p0-api-robustesse` |
| R082 | `PUT /api/recipes/:id` | 500 sur `{}` ; 404 sans session | 400 ; 401 | `p0-api-robustesse` |
| R084 | `POST /api/sales` | Accepte la recette d'un autre restaurant | Recette vérifiée pour le restaurant (404) | `p0-cloisonnement` |
| R092 | `PUT /api/reorder-rules/:inventoryItemId` | Aucune garde de rôle ; 404 sans session | Rôle responsable ; 401 | `p0-roles` |
| R093 | `POST /api/reorder-rules/run` | Aucune garde de rôle | Rôle responsable | `p0-roles` |
| R101 | `POST /api/smart-cart/checkout` | Un compte « équipe » crée des commandes ; 500 et commande orpheline à 0 € ; 500 sur quantité démesurée | Rôle responsable ; validation complète avant toute écriture ; quantités bornées | `p0-roles` · `p0-api-robustesse` |
| R150 | `DELETE /api/vendor/offers/:id` | 200 même quand rien n'est supprimé ; 404 sans session | 404 si rien n'est supprimé ; 401 | `p0-api-robustesse` |
| R164 | `PUT /api/vendor/profile` | 500 sur `{}` | 400 | `p0-api-robustesse` |
| R171 | `PUT /api/vendor/routes/:id` | 500 sur `{}` ; 404 sans session | 400 ; 401 | `p0-api-robustesse` |
| R174 | `PUT /api/admin/billing/invoices/:id` | 500 sur `{}` ; 404 sans session | 400 ou 404 ; 401 | `p0-api-robustesse` |
| R200 | `PUT /api/admin/leads/:id` | 500 sur `{}` ; 404 sans session | 400 ; 401 | `p0-api-robustesse` |
| R205 | `POST /api/admin/prospects` | 500 sur `{}` | 400 | `p0-api-robustesse` |
| R209 | `POST /api/admin/prospects/import` | 500 sur `{}` | 400 | `p0-api-robustesse` |
| R211 | `PUT /api/admin/vendors/:id` | 500 sur `{}` ; 404 sans session | 400 ; 401 | `p0-api-robustesse` |
| R212 | `POST /api/feedback` | 500 sur `{}` | 400 | `p0-api-robustesse` |
| R216 | `GET /api/public/invite/:code` | Aucune limite de débit ; codes de 4 caractères tirés avec `Math.random` | 10 lectures par quart d'heure, tous codes confondus ; codes de 10 caractères, tirage cryptographique | `p0-api-robustesse` |

Bilan : **26 corrigés sur 26**, chacun couvert par un test. Aucun n'est laissé sans correction.

## Défauts de même famille, corrigés à la racine

Trois des constats de l'audit décrivaient une famille de routes, pas une route.

| Famille | Mesure de l'audit | Cause | Correction | Vérification |
|---|---|---|---|---|
| 404 au lieu de 401 sans session | 86 routes protégées à paramètre | Le registre des routes connues échappait aussi le motif des paramètres : aucune route à paramètre n'était reconnue | Seuls les segments littéraux sont échappés (`lib/security.ts`) | 221 routes protégées sur 221 répondent 401 |
| 500 sur JSON mal formé | 6 routes prouvées, 61 de même forme | `c.req.json()` sans traitement de l'erreur | Erreur de lecture du corps typée et traduite en 400, pour toute l'API | balayage de toutes les routes d'écriture : aucun 500 |
| 500 sur corps vide `{}` | 12 routes | Mise à jour sans champ transmise à la base ; validation levant une exception | 400 explicite (mise à jour vide, erreur de validation) | balayage de toutes les routes d'écriture, identifiants réels compris : aucun 500 |

## Défauts trouvés pendant les corrections (absents du registre P0.1)

| Défaut | Comment il a été trouvé | Correction | Test |
|---|---|---|---|
| Un grossiste pouvait enregistrer des conditions de paiement pour **n'importe quel restaurant**, puis lire son nom et sa ville dans la liste de ses encours | Balayage de cloisonnement : une table du restaurant A avait changé après le passage du grossiste Deux | Conditions réservées aux restaurants réellement clients ; la liste ignore toute ligne héritée | `p0-cloisonnement` |
| Offres, recettes et fournisseur préféré acceptaient eux aussi un identifiant d'un autre restaurant (même cause que R036 et R084) | Lecture du code | Contrôle commun (`lib/tenant.ts`) | `p0-cloisonnement` |
| Routes parallèles non gardées au-delà des six prouvées : « recommander », commandes récurrentes, envoi d'une commande préparée, litiges, avis, envoi de facture, carte type | Matrice des rôles | Rôle exigé sur chacune | `p0-roles` (76 routes classées) |
| Secret de session : valeur publique de repli quand `JWT_SECRET` manque, y compris en production | Lecture du code (constat S-03 de l'audit, non vérifié en production) | Aucun repli en production ; l'API répond 503 | `p0-config` |
| Une session Clerk présentée directement à l'API était acceptée sans contrôle d'origine, et échappait à la révocation | Lecture du code | Seule la session AFRISUPPLY est acceptée | `clerk-sync` |
| Sept réponses « 200 » pour un identifiant inexistant (suppression d'un événement, d'une règle de réassort, d'une fiche prospect ; lecture d'une alerte ; crédit et créneaux d'un grossiste inconnu ; historique de prix) | Balayage | 404 | `p0-cloisonnement` · `p0-api-robustesse` |
| Chaque requête relisait le compte et le restaurant jusqu'à douze fois (36 requêtes SQL avant le traitement, pour la dernière route montée) | Analyse du registre des routes | Une seule lecture par requête (3 requêtes SQL) | `p0-api-robustesse` |
| La fonction déployée aurait chargé `zod` et `@hono/node-server` dans une autre version que celle testée — ou pas du tout — après une mise à jour | Essai du bundle sur un vrai serveur HTTP | Dépendances déclarées à la racine ; contrôle permanent dans `check:bundle` | CI : « bundle » |
| Avec zod 4, une modification partielle remettait les champs absents à leur valeur par défaut (offre remise « en stock », alias d'un produit effacés, zones d'une tournée effacées) | Balayage `{}` après la mise à jour de la bibliothèque | Schémas de modification sans valeur par défaut | `p0-api-robustesse` |
| Le serveur autonome ne démarrait pas sans fichier `.env` — ce qui faisait échouer l'intégration continue depuis le 23 septembre | Exécution | Fichier chargé s'il existe | CI : « vérifications » |

## Défauts trouvés pendant les chantiers P0.4 et P0.6 (absents du registre P0.1)

| Défaut | Comment il a été trouvé | Correction | Test |
|---|---|---|---|
| La passe quotidienne traitait tous les restaurants dans une seule fonction limitée à 60 s et n'écrivait sa trace qu'à la fin : une coupure ne laissait aucune trace, et la passe suivante repartait de zéro. À 96 ms par requête SQL (mesure de production), elle ne tient plus au-delà de cinq restaurants environ. Que ce soit la cause de la panne de production reste à vérifier (VERCEL-01 V10, NEON-01 Q12) | Page de statut publique de la production (aucune passe complète depuis le 2026-09-23) ; mesure du nombre de requêtes SQL par restaurant | Passe par tranches, journal tenu dans la ligne de la passe, reprise sans double envoi, une passe par jour | `p0-passe-quotidienne` (22) ; huit règles retirées une à une, chacune détectée |
| Aucun délai maximal sur les appels à Clerk, à Stripe, au service d'IA et au stockage externe : un service muet bloquait la fonction jusqu'à sa coupure | Lecture du code pendant le chantier de la passe | Délai sur chaque appel sortant, inférieur à la durée d'une fonction | `p0-appels-sortants` (4) · `clerk-sync` |
| Le workflow « Daily digest » affichait la réponse de l'API (noms de restaurants, adresses e-mail) dans les journaux d'un dépôt public | Lecture du workflow | Le workflow n'affiche plus que des compteurs ; il ne fait rien sans ses deux secrets | exécution du script du workflow contre une API locale (`preuves/P0_4_passe_quotidienne.txt`) |
| **Fenêtre de dialogue hors de l'écran sur un restaurant neuf** : le premier champ, obligatoire, de « Nouveau fournisseur » était à 62 px au-dessus de l'écran. Un nouveau client ne pouvait pas créer son premier fournisseur. Treize écrans utilisent cette fenêtre | Premier passage du parcours dans un navigateur | Fenêtre rattachée au document ; l'animation des pages se termine sans transformation | `Modal.render.test.tsx` (3) ; parcours du navigateur (mesure de la position du champ) |
| **Les e-mails inséraient des noms saisis par les utilisateurs comme du HTML brut** (26 modèles) : un nom de restaurant ou de personne pouvait placer un lien ou une mise en page dans un e-mail envoyé par AFRISUPPLY à un tiers (invitation, e-mail de test) | Lecture des modèles pendant la préparation du parcours d'invitation | Toute valeur insérée est échappée (`lib/html.ts`) ; les noms montrés à des tiers sont limités : 80 caractères, ni chevron ni adresse web | `p0-courriels-html` (8), dont un contrôle qu'aucun modèle n'échappe à la règle |
| Les invitations n'étaient pas freinées : un compte pouvait faire partir des e-mails en série vers des adresses de son choix (inviter, retirer, réinviter) | Même lecture | 20 invitations par heure et par restaurant, quelle que soit l'adresse cliente | `p0-courriels-html` (retrait de la règle détecté) |
| Libellés techniques montrés à un client : noms internes des tâches sur la page de statut, rôle écrit `staff` dans l'e-mail d'invitation | Captures d'écran du parcours | Libellés en clair | `Status.render.test.tsx` · `p0-courriels-html` |

Deux réglages complètent ces corrections sans être des défauts du code : la région des fonctions
(`vercel.json`, à confirmer — fiche VERCEL-01, point V11) et le contrôle de cette région dans
`/api/status` (`p0-config`).

## Ce que ce registre ne couvre pas

- Les 30 routes que l'audit a classées « non atteintes par les tests » : 221 des 251 routes étaient
  atteintes avant ; les balayages ajoutés atteignent désormais **les 251** pour l'accès sans session,
  et toutes les routes d'écriture pour le corps vide et le JSON mal formé — sauf quatre, qui
  détruiraient la session ou le compte du balayage et sont testées séparément (suppression du
  compte, les deux déconnexions, restauration d'une sauvegarde). Atteindre une route n'est pas
  prouver son parcours métier : c'est l'objet du chantier P0.6.
- La politique de mot de passe (8 caractères, liste de mots courants) : relevée par l'audit, non
  classée comme défaut prouvé ; laissée à une décision de produit.
- L'inscription révèle qu'une adresse a déjà un compte (409) : comportement habituel d'un formulaire
  d'inscription, limité à 5 essais par minute ; non modifié.
