# Parcours navigateur final : les dix-huit opérations (chantier P0-I)

13 novembre 2026. Données fictives uniquement (comptes en `@parcours.test`, noms suffixés par l'horodatage du passage).

**Résultat : 18 opérations sur 18 rejouées, 140 vérifications sur 140**, en local, sur le site construit,
contre une API réellement démarrée avec le rôle PostgreSQL minimal. Journal complet :
`preuves/parcours_navigateur_final.txt` ; captures : `preuves/navigateur/`.

**Ce qui n'est pas fait** : le même parcours sur une prévisualisation propre. Elle n'existe pas encore
(`LEVEE_RESERVES_NEON.md`, § 8). Le critère « 18 opérations rejouables dans un environnement Preview
propre » reste donc **EN ATTENTE EXTERNE**.

## 1. Méthode

`scripts/navigateur/parcours.mjs` pilote un vrai navigateur (Chromium 153). Pour chaque opération :

- **l'action est faite à l'écran** : clics, saisies, fenêtres de dialogue — jamais un appel direct à l'API ;
- avant chaque clic, le script vérifie que l'élément visé **recevra** le clic (rien ne le recouvre) ;
- la **réponse de l'API** à cette action est contrôlée (code HTTP vu par le navigateur) ;
- l'état est **relu en base par l'API**, avec la session du navigateur — le navigateur n'a pas d'autre accès à la base ;
- les erreurs JavaScript, les erreurs serveur et les requêtes en échec sont relevées sur chaque écran.

Seuls deux gestes passent hors de l'écran, et ne sont pas comptés comme preuves de parcours : la création
du second restaurant (préparation du contrôle de cloisonnement) et le ménage final.

Rejouer : `npm run build -w apps/web`, démarrer l'API (`ADMIN_EMAILS=exploitant@parcours.test`) et le
site construit, puis `AFS_ADMIN_EMAIL=exploitant@parcours.test npm run verifs:navigateur`. En
intégration continue : tâche « Parcours dans un navigateur ». Sur une prévisualisation : `AFS_WEB=<adresse>`
et `AFS_BYPASS=<secret de contournement>` ; les étapes qui lisent un e-mail sur disque y sont sautées et le disent.

## 2. Les dix-huit opérations

| # | Opération | À l'écran | Réponse de l'API | Relecture en base | Vérif. |
|---|---|---|---|---|---|
| 1 | Création d'un restaurant | Formulaire d'inscription | `register` 201 ; session en cookie illisible par le JavaScript | — | 6/6 |
| 2 | Création d'un fournisseur | Fenêtre « Nouveau fournisseur », liste, fiche | `suppliers` 201 | Présent après rechargement | 6/6 |
| 3 | Création d'un produit fournisseur | Carte du restaurant (2 plats), puis 3 prix saisis dans la fiche | `onboarding/apply` 200, `offers` 201 × 3 | 16 produits, 2 recettes ; prix présents après rechargement | 7/7 |
| 4 | Consultation et comparaison des prix | Second fournisseur moins cher, puis comparateur ouvert depuis la ligne du stock | `offers` 201 | Les deux prix à l'unité affichés ; le moins cher est recommandé | 6/6 |
| 5 | Constitution d'un panier | Panier intelligent | — | Total chiffré, réparti entre les deux fournisseurs, riz attribué au moins cher | 2/2 |
| 6 | Préparation d'une commande | « Préparer les commandes » (clic vérifié non recouvert) | `smart-cart/checkout` 201 | 2 commandes, statut « préparée » | 4/4 |
| 7 | Validation et émission | Message au fournisseur, « J'ai envoyé » | `orders/:id` 200 | Statut « envoyée » | 3/3 |
| 8 | Réception d'une livraison | Quantités et prix facturé saisis, confirmation | `orders/:id/receive` 200 | Stock augmenté de ce qui a été reçu | 8/8 |
| 9 | Déclaration d'un écart | 130 kg commandés, 120 reçus ; 4,80 € facturés pour 4,50 € | — | 1 écart (45,00 €), réclamation rédigée, + 36,00 € signalés | 8/8 |
| 10 | Mise à jour du stock | Inventaire en une phrase ; stock après réception | `quick/apply` 200 | 20 / 15 / 10 kg, puis + 120 et + 110 kg | 4/4 |
| 11 | Enregistrement d'une vente | Ventes du jour en une phrase | `quick/apply` 200 | Stock diminué des ingrédients | 3/3 |
| 12 | Alertes et prévisions | Accueil, écran Prévision | prévision 200 | Alerte d'écart et alerte de facture créées et affichées | 5/5 |
| 13 | Invitation d'un collaborateur | Écran Équipe | `members` 201 | Invité présent dans l'équipe | 2/2 |
| 14 | Droits du collaborateur | Lien reçu, mot de passe choisi, connexion | lecture 200, réglages 403, invitation 403 | Lien à usage unique | 10/10 |
| 15 | Export des données | Écran « Mes données » | `backup/export` 200 | Contient le restaurant, ses fournisseurs, sa commande ; ni mot de passe, ni autre restaurant | 4/4 |
| 16 | Déconnexion | Bouton de déconnexion | `logout` 200 | Espace refermé | 3/3 |
| 17 | Expiration et révocation | Session supprimée ; jeton rejoué après déconnexion | 401 | Le jeton d'une session fermée est refusé par le serveur | 4/4 |
| 18 | Reconnexion | Mauvais puis bon mot de passe | — | Données retrouvées | 3/3 |

Une vérification peut compter pour deux opérations (réception et écart partagent une fenêtre).

## 3. Contrôles ajoutés autour des dix-huit opérations

| Contrôle | Résultat |
|---|---|
| **Cloisonnement** : un second restaurant, connecté dans le même navigateur | Huit écrans sans aucune donnée du premier ; cinq requêtes portant les identifiants réels du premier : cinq réponses 404 ; son export ne contient rien du premier |
| **Exploitant** : droits avant et après confirmation de l'adresse | Avant : menu d'administration absent, trois API d'exploitation à 403. Après le lien reçu : menu présent, trois API à 200. Lien remplacé refusé ; lien rejoué sans effet |
| **Clerk coupé** | Le serveur l'annonce hors service ; une identité envoyée dans le corps n'ouvre rien ; zéro requête du navigateur vers un domaine de Clerk |
| **Ménage** | Les quatre comptes d'essai sont supprimés avec leurs restaurants ; le jeu de démonstration n'est pas touché |

## 4. Défauts trouvés par ce parcours, corrigés

| Défaut | Avant | Après |
|---|---|---|
| **Confirmation d'adresse en boucle.** Pour une personne connectée, la page ouverte depuis l'e-mail renvoyait le lien sans fin | Journal du serveur : la confirmation réussit, puis le même lien est renvoyé 17 fois, puis 429 ; la page affiche « Trop de tentatives » alors que l'adresse vient d'être confirmée. **Ce défaut est en production** | Un seul envoi ; « Adresse e-mail confirmée » reste affiché. Test : `VerifyEmail.render.test.tsx` (4 envois sans la correction, 1 avec) |
| « Préparer les commandes » recouvert (ordinateur et téléphone) | Corrigé au lot précédent | Vérifié à chaque passage par le contrôle « non recouvert » |

## 5. Constats laissés en l'état

| Constat | Nature |
|---|---|
| Le comparateur ne s'ouvre depuis le stock que pour un produit « à commander » | Choix d'écran ; un produit bien approvisionné n'a pas de lien de comparaison |
| Un membre d'équipe ne peut pas supprimer lui-même son compte ; le propriétaire le retire, ce qui supprime le compte | Règle voulue par le code ; à relire au titre du droit à l'effacement |
| Écran Stock : « jours restants » surestimés après une seule journée de ventes | Non instruit |
