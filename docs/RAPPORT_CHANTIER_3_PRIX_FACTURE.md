# RAPPORT — CHANTIER 3 : PRIX RÉELLEMENT FACTURÉ ET DÉTECTION DE LA HAUSSE

**Date :** 21 septembre 2026
**Périmètre :** réception des commandes, historique de prix, alertes de dérive tarifaire.
**Principe tenu :** chaque affirmation ci-dessous est prouvée par une exécution (test automatisé ou appel HTTP sur l'API qui tourne).

---

## ✅ CORRIGÉ

| # | Problème constaté à l'audit | Correction | Preuve d'exécution |
|---|---|---|---|
| 1 | **La réception enregistrait le prix COMMANDÉ, jamais le prix facturé.** L'historique de prix restait donc plat : il ne contenait que des prix théoriques. | Champ **« Prix facturé »** par ligne à la réception (optionnel, pré-rempli avec le prix commandé). Le prix saisi est mémorisé sur la ligne de commande (`order_lines.invoiced_unit_price_eur`). | HTTP : `invoicedUnitPrice` 1,84 €/kg → mémorisé et renvoyé ; test automatisé n°3. |
| 2 | **L'alerte « vos prix augmentent » ne pouvait jamais se déclencher** : le moteur compare le dernier prix à la moyenne des précédents, et tous les points valaient le prix commandé. | L'historique de prix reçoit désormais le **prix réellement payé**, en source `facture`. | Après réception à 46 € au lieu de 42 € : `POST /alerts/refresh` produit *« Le prix de ail frais chez Grossiste… augmente de 10 % (1,68 € → 1,84 €/kg) »*, `pct = 9,5 %` dans la charge utile. |
| 3 | **Aucun montant : impossible de savoir combien la dérive coûte.** | Alerte dédiée **« 💸 Facture plus élevée que la commande »** avec le total en euros, la ligne la plus lourde, le pourcentage et le détail par ligne. | HTTP : *« Les prix facturés dépassent les prix commandés de 7,20 € au total. Le plus gros écart : Ail frais, 1,68 € → 1,84 €/kg (+9.5 %), soit 7,20 € »* ; `payload.surchargeEur = 7.20`. |
| 4 | **Le coût des entrées en stock était théorique** (`unitCostEur` = prix commandé). | Le mouvement de stock enregistre le **coût réellement payé** quand il est saisi ; la note « Prix facturé saisi à la réception » trace l'origine. | Vérifié en base par test automatisé (dernier mouvement de réception = 1,84 €/kg) et sur une livraison partielle (`45 kg × 1,84 €`). |
| 5 | **Le comparateur affichait le tarif annoncé, pas ce qu'on paie vraiment.** | À la réception avec prix facturé, l'offre du fournisseur est mise à jour au **dernier prix payé** (`lastSeenAt` rafraîchi). | HTTP : `GET /compare/:productId` renvoie 1,84 €/kg après la réception à 46 € le sac. |
| 6 | **Aucune protection contre une faute de frappe sur le prix** (le prix est un montant, donc une erreur coûte cher en analyse). | Plafonds : 10 000 € par unité, et refus au-delà de **3 × le prix commandé + 0,50 €**, avec message orienté utilisateur (« Vérifiez l'unité de la facture : prix au kilo ou au sac ? ») et passage possible par confirmation explicite, tracée. | HTTP : 90 €/kg pour 1,68 €/kg commandé → `400 invoice_out_of_range`, **commande non réceptionnée** ; accepté après confirmation (`override`). |
| 7 | L'écart de prix était calculé sur la quantité commandée, faussant le montant en cas de livraison partielle. | L'écart est calculé sur la **quantité réellement reçue**. | 50 kg commandés / 45 reçus à 46 € le sac → `deltaEur = 7,20 €` (45 × 0,16 €), statut `livree_partiel`, écart de quantité signalé en même temps. |
| 8 | L'encodage des messages utilisait un formateur absent de ce module (erreur 500 détectée par les tests). | Ajout du formateur monétaire français dans le module de réception. | Les 15 tests du chantier 3 passent (avant correction : 10 échecs en 500). |

**Preuve d'honnêteté :** le premier jet de la fonctionnalité a **échoué 10 fois sur 15** (500 sur la route de réception à cause d'une fonction manquante). Ce n'est qu'après correction que les tests sont passés — c'est exactement ce que ces tests servent à attraper.

---

## 📁 FICHIERS

**Créés**
- `packages/db/drizzle/0017_prix_facture.sql` (+ snapshot) — `order_lines.invoiced_unit_price_eur`.
  *(Numérotée 0017 et non 0016 : entre-temps, le dépôt distant a publié `0016_reviews` — les deux migrations cohabitent sans conflit.)*
- `apps/api/src/test/invoiced-price.test.ts` — 15 tests (prix identique, prix absent, hausse détectée, garde-fous, livraison partielle, lecture directe en base).
- `audit/chantier3_verif.py` — **26 vérifications HTTP** rejouables sur l'API réelle.
- `docs/RAPPORT_CHANTIER_3_PRIX_FACTURE.md` — ce rapport.

**Modifiés**
- `packages/db/src/schema.ts` — colonne du prix facturé (+ commentaire expliquant le pourquoi).
- `apps/api/src/routes/restaurant.ts` — réception : lecture et bornage du prix facturé, écriture du coût réel, historique `facture`, mise à jour du dernier prix payé, alerte chiffrée, réponse enrichie (`priceVariance`, `surchargeEur`, `orderedTotal`, `invoicedTotal`).
- `apps/web/src/pages/Orders.tsx` — fenêtre de réception (prix facturé par ligne, écart par ligne et total en direct), écran de résultat (« Facture plus élevée que la commande : +7,20 € » + détail), détail de commande (« payé 1,84 €/unité au lieu de 1,68 € »).

---

## 🔧 FONCTIONNALITÉS (ce qui change pour le restaurateur)

1. **Il saisit ce qu'il voit sur la facture** — pas de double saisie : le champ est pré-rempli avec le prix commandé, il ne corrige que si la facture diffère.
2. **Il sait immédiatement ce que la hausse lui coûte** : pendant la saisie (« +0,16 € par unité → +7,20 € sur la ligne »), puis dans le récapitulatif de réception.
3. **Il est prévenu avant que ça fasse mal** : dès la deuxième facture à ce prix, l'alerte de hausse (+9,5 % ici) apparaît sur l'accueil, avec l'ancien et le nouveau prix et des alternatives moins chères quand il y en a.
4. **Son comparateur dit la vérité** : le prix affiché pour un fournisseur est le dernier prix réellement payé chez lui, plus le tarif annoncé.
5. **Ses coûts deviennent réels** : le stock entre au prix payé — base saine pour l'analyse de coûts (chantier 4).

---

## 🧪 TESTS & PREUVES (exécutés)

| Vérification | Résultat |
|---|---|
| Nouveaux tests `invoiced-price.test.ts` | **15/15** |
| Suite API complète | **164/164** (21 fichiers) |
| Tests base de données | **5/5** |
| Vérification de types (API, web, db) | **verts** |
| Build web | **OK** (215,77 kB, 70,94 kB gzip) |
| `audit/chantier3_verif.py` (nouveau) | **26/26** |
| `audit/chantier1_verif.py` (non-régression réception) | **23/23** |
| `audit/scenario_tests.py` (6 scénarios métier) | **49/49** |
| Rejeu complet après fusion des travaux distants (chantiers 24/26/27/28) | **26/26** et **23/23** — migration renumérotée 0017, schéma et migrations synchronisés |

Chaîne complète prouvée de bout en bout sur l'API réelle : *compte → fournisseur → offre 42 € → commande 50 kg → réception 45 kg à 46 € → écart de quantité + écart de prix chiffré + historique `facture` + comparateur à jour + alerte de surfacturation + détection de hausse par le moteur.*

---

## ⚠️ RESTANT / LIMITES ASSUMÉES

1. **La saisie du prix facturé est manuelle.** Elle est pré-remplie et rapide, mais reste une saisie. Le flux existe déjà de son côté : la lecture de facture par photo (`/quick/invoice/*`) enregistre des prix réels — **raccorder ce flux à la réception de commande est une évolution naturelle** (à prévoir au chantier « facture » suivant, avec la vision IA).
2. **Le coût réel enregistré n'est encore lu par aucun écran.** La donnée est juste et exploitable (elle sert à la margé et à l'analyse), mais la page Analyse reste celle de l'audit (3 compteurs) : **c'est l'objet du chantier 4**.
3. **L'alerte de hausse garde un seuil de 8 %** (paramétrable par restaurant via les réglages) : une dérive de 2 % répétée chaque mois n'alerte pas encore. Un « cumul glissant » serait plus juste (chantier 4 ou V2).
4. **Un test a échoué une fois sous forte charge mémoire** (expiration de délai) puis est passé au second lancement (165/165). Signalé par honnêteté : la suite complète demande environ 1 minute et 1 Go de mémoire libre.
5. **Le prix facturé unitaire suppose la bonne unité.** Si un fournisseur facture au sac et que le produit est suivi au kilo, la garde à 3× attrape les grosses erreurs mais pas les erreurs d'un facteur 2 : le message invite explicitement à vérifier l'unité.

---

## ➡️ SUIVANT — CHANTIER 4 PROPOSÉ

**« Page Analyse réellement utile » (chantier 4 de la feuille de route).**
- Problème : `/app/analyse` n'affiche que 3 compteurs et une barre par fournisseur, avec un reliquat de backlog visible par le client ; aucune évolution de prix, aucun poste de coût, aucune marge dans le temps — alors que les données existent désormais (prix facturés réels, coûts par mouvement de stock, recettes avec prix de vente).
- Actions : évolution des prix des 90 derniers jours par produit et par fournisseur (source `facture` mise en avant), postes de coût (par catégorie, par fournisseur), marge par recette avec le coût réel, classement des 5 produits qui pèsent le plus, et une réponse directe à « pourquoi mes coûts augmentent ce mois-ci ? » calculée sur ces données.
- Critères de validation : sur le jeu de démonstration, la page explique une hausse avec un chiffre vérifiable à la main ; aucun reliquat technique affiché ; test automatisé sur le calcul + parcours HTTP.

**En attente de votre validation pour démarrer le chantier 4.**
