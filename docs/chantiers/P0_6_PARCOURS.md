# P0.6 — Parcours réels et intégrations : ce qui est démontré, et comment

Point au 12 novembre 2026. Chaque parcours de la mission est relié aux essais reproductibles qui le
démontrent. Trois niveaux de preuve, du plus proche du client au plus proche du code :

- **Navigateur** — un vrai navigateur pilote le site construit contre une API réellement démarrée
  (`scripts/navigateur/parcours.mjs`, 72 vérifications ; preuve : `preuves/P0_6_navigateur.txt`).
- **API réelle** — 13 scripts interrogent une API réellement démarrée (`scripts/verifications/`,
  535 vérifications ; preuve : `preuves/verifications_bout_en_bout.txt`).
- **Tests** — 724 tests automatisés sur une base PostgreSQL embarquée (`preuves/tests_automatises.txt`).

Tous s'exécutent en local et en intégration continue. **Aucun ne s'exécute contre la production ni
contre un service externe réel** : la colonne « Réel ou simulé » dit ce qui est simulé.

## Les 12 parcours

| # | Parcours | Navigateur | API réelle | Tests | Réel ou simulé | État |
|---|---|---|---|---|---|---|
| 1 | Inscription et connexion | Formulaire d'inscription, mauvais puis bon mot de passe, cookie de session illisible par le JavaScript (parcours 3 et 9) | `chantier5` (liens à usage unique, confirmation d'adresse), `chantier2` | `security`, `account-recovery`, `clerk-sync` | Mot de passe : réel. **Clerk : simulé** (faux service) — instance réelle non vérifiée (fiche CLERK-01) | Démontré hors Clerk |
| 2 | Création du restaurant | Création à l'inscription, écran de démarrage, tableau de bord (parcours 3 et 4) | `scenario_tests` (nouveau restaurant) | `e2e` | Réel | Démontré |
| 3 | Invitation d'un membre | Invitation par le propriétaire, e-mail réellement écrit, lien ouvert, mot de passe choisi, connexion, droits du rôle, lien à usage unique (parcours 6 et 8 bis) | `chantier2`, `chantier5` | `p0-roles`, `p0-courriels-html` | Réel jusqu'à l'e-mail écrit sur disque. **Remise par le prestataire d'e-mails : non vérifiée** | Démontré hors remise réelle |
| 4 | Fournisseurs | Création par le formulaire, liste, fiche (parcours 5) | `scenario_tests` | `p0-cloisonnement` | Réel | Démontré |
| 5 | Catalogues | Écrans affichés (`/app/catalogue`, `/app/import`, `/catalogue`) | `scenario_tests`, `chantier3` | `catalog-import`, `csv` | Import par fichier : réel. **Lecture de photo (LLM) : non vérifiée** | Démontré par l'API ; saisie par l'écran non pilotée |
| 6 | Commande | Écrans affichés (`/app/achats`, panier) | `scenario_tests` (première commande), `chantier1`, `chantier8` (place de marché) | `order-integrity`, `marketplace` | Réel ; envoi au fournisseur par e-mail écrit sur disque | Démontré par l'API ; saisie par l'écran non pilotée |
| 7 | Réception de livraison | Écran affiché (`/app/achats/ecarts`) | `chantier1` (50 kg commandés, 45 reçus : écart détecté, chiffré, alerté), `chantier3` | `order-integrity`, `invoiced-price` | Réel | Démontré par l'API ; saisie par l'écran non pilotée |
| 8 | Stock | Écrans affichés (`/app/stock`, prévision) | `scenario_tests` (rupture), `chantier9` (prévision) | `forecast*`, `engines` | Réel | Démontré par l'API ; saisie par l'écran non pilotée |
| 9 | Comparaison de prix | Non piloté (l'écran demande un produit suivi) | `chantier3` (prix facturé, hausse détectée), `scenario_tests` (hausse de prix) | `cost-truth`, `invoiced-price` | Réel | Démontré par l'API seulement |
| 10 | Facturation et abonnement | Écran affiché (`/app/abonnement`) : essai, formules, message sans paiement en ligne | `chantier7` (essai, formules, factures PDF, santé de la facturation) | `billing`, `billing-invoices`, `vendor-billing` | **Stripe : simulé** (faux serveur) — compte réel non vérifié | Démontré contre un faux Stripe |
| 11 | Droits | Refus des écrans et des données d'exploitation à un client ; droits d'un compte « équipe » (parcours 7 et 8 bis) | `chantier2` | `p0-roles` (76 routes × 3 rôles), `p0-cloisonnement` (1 491 essais croisés) | Réel | Démontré |
| 12 | Déconnexion et expiration de session | Bouton de déconnexion, espace refermé, session supprimée → retour à la connexion sans écran cassé (parcours 8 et 10) | `chantier2` (sessions révoquées) | `security`, `clerk-sync` | Réel | Démontré |

Lecture : 8 parcours sur 12 sont pilotés dans un navigateur de bout en bout ou sur leur partie
critique (1, 2, 3, 4, 10 pour l'affichage, 11, 12 ; 5 à 8 pour l'affichage). Pour les parcours 5 à 9,
la **saisie par les écrans** (ajouter un produit, composer une commande, réceptionner, comparer) n'est
pas encore pilotée par le navigateur : elle l'est par l'API. C'est la suite du chantier.

## Ce que le navigateur a trouvé que les autres essais ne voyaient pas

Un défaut bloquant pour un client qui démarre : la fenêtre « Nouveau fournisseur » sortait de
l'écran sur un restaurant neuf, son premier champ (obligatoire) hors d'atteinte. Corrigé et gardé par
le parcours. Détail, mesures et captures : `preuves/P0_6_navigateur.txt`.

## Intégrations externes

| Service | Dans les essais | En production (constaté sans accès privilégié) | Reste à faire |
|---|---|---|---|
| Neon (base) | Base PostgreSQL embarquée, mêmes migrations | Base joignable ; ~96 ms par requête depuis les fonctions (page de statut publique) | Fiche NEON-01 (état réel, rôle, migrations) ; région des fonctions |
| Clerk (identité) | **Simulé** : faux service, vraie bibliothèque de vérification | Inconnu | Fiche CLERK-01 ; essai réel sur une prévisualisation |
| Stripe (paiement) | **Simulé** : faux serveur | Inconnu (variables non lisibles) | Relevé VERCEL-01 ; un paiement d'essai en mode test de Stripe |
| Resend (e-mails) | E-mails écrits sur disque (contenu réel, remise non testée) | Transport « resend », expéditeur d'essai `onboarding@resend.dev` ; la tâche d'alertes est en erreur aujourd'hui | Vérifier un domaine d'envoi ; lire le motif d'erreur (NEON-01, Q12) |
| Twilio (SMS, WhatsApp) | Non configuré : l'API le dit, rien n'est simulé comme « envoyé » | Non configuré (page de statut) | Décision : canal utile au pilote ou non |
| Stockage S3 (sauvegardes) | **Simulé** : faux service S3 qui exige de vraies signatures ; dépôt, relecture, restauration | Non configuré : 0 sauvegarde conservée | VERCEL-01, point V12 |
| Sentry (erreurs) | Non configuré | Non configuré (page de statut) | Créer un projet et poser `SENTRY_DSN` avant le pilote |
| LLM (assistant, lecture de photo) | Non appelé (sans clé, le moteur local répond) | Inconnu | Décision : fonction utile au pilote ou non ; si oui, l'inscrire au registre des sous-traitants |

Aucune intégration externe n'est déclarée « fonctionnelle » : chacune l'a été contre une simulation ou
n'a pas été appelée. La vérification réelle demande une prévisualisation avec sa base (fiche NEON-02)
et des comptes de test des services.

## Suite du chantier

1. Piloter par le navigateur la première semaine d'un client : carte, fournisseur et ses prix,
   première commande, inventaire, ventes, réception (les sept étapes de l'écran de démarrage).
2. Rejouer le parcours du navigateur sur la prévisualisation, dès qu'elle a sa base (NEON-02).
3. Essais réels, sur la prévisualisation : Clerk (instance de test), Stripe (mode test), Resend
   (domaine vérifié), stockage S3.
