# P0.6 — Première semaine d'un restaurant : parcours complet (chantier E)

État au 13 novembre 2026 : **EN COURS**. Aucun secret ni aucune donnée personnelle dans ce document ;
tous les comptes cités sont des comptes d'essai en `@parcours.test`.

**Résumé.** Les dix-huit opérations du scénario ne sont pas encore toutes dans le parcours rejouable.
Six le sont (72 vérifications, en intégration continue). Dix ont été exécutées une fois à l'écran, dans
un vrai navigateur, par un script provisoire : la chaîne aboutit, et elle a révélé quatre défauts,
tous corrigés et mesurés. Quatre opérations n'ont pas encore été pilotées. La suite est l'intégration
de l'ensemble dans le parcours rejouable.

## 1. Les dix-huit opérations

« Rejouable » : dans `scripts/navigateur/parcours.mjs`, exécuté à chaque envoi par la tâche
« navigateur ». « Exécutée une fois » : faite à l'écran dans un navigateur réel le 13 novembre, site
construit, API réellement démarrée avec le rôle PostgreSQL minimal — preuve d'un jour, pas encore un test.

| # | Opération | État | Ce qui a été constaté à l'écran |
|---|---|---|---|
| 1 | Création du restaurant | Rejouable | Inscription par le formulaire, espace ouvert |
| 2 | Connexion du responsable | Rejouable | Mauvais puis bon mot de passe |
| 3 | Création d'un fournisseur | Rejouable | Formulaire, liste, fiche |
| 4 | Création ou import de produits | Exécutée une fois | « Configurer ma carte » : 2 plats cochés → 2 recettes, 16 produits ajoutés au stock ; seuils validés |
| 5 | Saisie des prix fournisseur | Exécutée une fois | 3 prix ajoutés par la fiche du fournisseur (recherche du produit, conditionnement, prix) |
| 6 | Comparaison des prix | **Non pilotée** | — |
| 7 | Première commande | Exécutée une fois | Panier intelligent : 885,00 €, 1 fournisseur, 3 produits couverts sur 16 → « Préparer les commandes » |
| 8 | Validation de la commande | Exécutée une fois | Message au fournisseur affiché, commande marquée « Envoyée » |
| 9 | Réception de la livraison | Exécutée une fois | Quantités et prix facturés saisis, confirmation, stock mis à jour |
| 10 | Écart de livraison | Exécutée une fois | 130 kg commandés, 120 reçus : écart détecté, réclamation rédigée ; facture 4,80 € au lieu de 4,50 € : + 36,00 € signalés ; écran « Écarts » : 1 écart, 45,00 € |
| 11 | Mise à jour du stock | Exécutée une fois | Inventaire par phrase (3 lignes) ; stock relu après réception |
| 12 | Saisie des ventes | Exécutée une fois | « vendu 40 yassa 25 mafé » : 2 lignes, stock déduit |
| 13 | Consultation des alertes | **Non pilotée** | — |
| 14 | Consultation des prévisions | **Non pilotée** | — |
| 15 | Invitation d'un collaborateur | Rejouable | E-mail réellement écrit, lien ouvert, mot de passe choisi |
| 16 | Droits du collaborateur | Rejouable | Lecture permise, réglages et invitations refusés |
| 17 | Export des données | **Non pilotée** | — |
| 18 | Déconnexion et expiration de session | Rejouable | Espace refermé, session expirée sans écran cassé |

À la fin de la chaîne, l'accueil du restaurant affiche « Vos 7 premiers pas — 6/7 faits » (le
septième, installer l'application sur le téléphone, est déclaratif).

L'absence de données croisées entre restaurants est prouvée par l'API (1 491 essais) ; elle n'est pas
encore vérifiée dans le navigateur.

## 2. Défauts trouvés sur ce chemin, corrigés et mesurés

| Défaut | Mesure avant | Correction | Mesure après |
|---|---|---|---|
| **Ordinateur : « Préparer les commandes » recouvert** par le bouton « Un avis, un bug ? » | Écran 1366 × 900 : bouton x 1087–1317, y 827–863 ; l'élément à son centre était « Un avis, un bug ? ». Un clic au milieu ouvrait la fenêtre d'avis | La barre d'action laisse libre la colonne du bouton d'avis (`SmartCart.tsx`) | Bouton x 895–1125 ; à gauche, au centre, à droite : le bouton. Clic au centre → commande créée (201) |
| **Téléphone : le même bouton entièrement sous la barre de navigation** | Écran 390 × 844 : à gauche, au centre et à droite du bouton, les éléments cliquables étaient « Accueil », « Stock », « Achats » | La barre d'action se place au-dessus de la navigation | À gauche, au centre, à droite : le bouton |
| La touche Échap ne fermait aucune fenêtre de dialogue | Fenêtre encore ouverte après Échap | `Modal.tsx` ; test de rendu | Fenêtre fermée |
| « Stock mis à jour sur 21 produits » pour 16 produits en stock | Le message comptait les lignes d'ingrédients | L'API compte les produits distincts | « sur 16 produits » |

Après correction, mesuré sur neuf tailles d'écran (360 × 640, 390 × 844, 600 × 900, 700 × 900,
820 × 1180, 1000 × 700, 1024 × 768, 1366 × 900, 1920 × 1080) : aucun recouvrement, et les trois points
du bouton répondent partout.

Ces deux recouvrements n'étaient visibles d'aucun test d'API : l'API acceptait la commande, c'est le
bouton qui ne recevait pas le clic. Le parcours rejouable devra vérifier, avant chaque clic, que
l'élément sous le pointeur est bien celui qu'on vise.

## 3. Constats non traités

| Constat | Nature | Suite |
|---|---|---|
| Après une seule journée de ventes, l'écran Stock annonce 0,4 kg par jour et 267 jours de stock pour un produit dont le panier calcule un besoin de 103,5 kg sur 7 jours | Deux bases de calcul différentes sur deux écrans ; à instruire par la lecture du code, pas encore un défaut prouvé | Chantier E, à suivre |
| La fiche d'une commande se referme après « marquer Envoyée » : il faut la rouvrir pour réceptionner | Confort | À décider |
| La recherche d'un produit propose des résultats sans rapport (« riz » → « Noix de coco ») | Confort | À décider |

## 4. Suite

1. Faire entrer les opérations 4 à 12 dans `scripts/navigateur/parcours.mjs`, avec le contrôle « l'élément sous le pointeur est celui qu'on vise » sur chaque clic.
2. Piloter les opérations 6, 13, 14 et 17, et une vérification de cloisonnement entre deux restaurants dans le navigateur.
3. Rejouer le tout sur la prévisualisation, quand elle aura sa base (`LEVEE_RESERVES_VERCEL.md`).
