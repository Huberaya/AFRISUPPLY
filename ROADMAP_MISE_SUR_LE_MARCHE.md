# AFRISUPPLY — Feuille de route de mise sur le marché

> **« Achetez mieux. Gaspillez moins. Gagnez plus. »**
> L'assistant d'approvisionnement intelligent des restaurants africains.

Document de cadrage : les **10 chantiers** à mener, de la base de code héritée d'ethimarket jusqu'aux premiers clients payants, puis la marketplace.

---

## Vue d'ensemble

| # | Chantier | Objectif | Horizon | Dépend de |
|---|----------|----------|---------|-----------|
| 0 | Cadrage & validation terrain | Vérifier que le problème vaut 89 €/mois | S1–S3 | — |
| 1 | Socle technique (extraction ethimarket) | Repo AFRISUPPLY propre et déployable | S1–S2 | — |
| 2 | Données : catalogue produits & fournisseurs | Base de référence des produits africains | S2–S6 | 1 |
| 3 | Produit MVP — 6 modules | Version utilisable par un restaurant pilote | S3–S8 | 1, 2 |
| 4 | Intelligence : prévision, comparateur, assistant | Le « cerveau » différenciant | S5–S9 | 3 |
| 5 | Marque, site & offre commerciale | Identité, site vitrine, tarifs, onboarding | S4–S8 | 0 |
| 6 | Pilotes & itérations | 5–10 restaurants qui utilisent le produit chaque semaine | S8–S14 | 3, 4, 5 |
| 7 | Juridique, conformité, paiement | CGV/CGU, RGPD, Stripe, facturation | S6–S10 | 5 |
| 8 | Go-to-market & acquisition | Passer de 10 pilotes à 100 clients | S12–S26 | 6, 7 |
| 9 | Marketplace & réseau fournisseurs (V2) | Commission sur transactions, achats groupés | S20+ | 8 |

*S = semaine. Horizon indicatif pour un fondateur + 1 dev (ou fondateur technique à plein temps).*

---

## Chantier 0 — Cadrage & validation terrain

**Pourquoi d'abord :** ethimarket montre le risque classique — beaucoup de fonctionnalités, peu d'usage vérifié. Il faut confirmer le problème avant de construire.

### Actions
- [ ] **20 entretiens** avec des restaurateurs africains (Paris, Nantes, Lyon, Marseille, Bruxelles). Questions clés : combien de fournisseurs ? combien de temps par semaine à commander ? dernière rupture ? dernière surprise de prix ? comment suivent-ils le stock aujourd'hui (cahier, WhatsApp, rien) ?
- [ ] **10 entretiens fournisseurs/grossistes** (Château-Rouge, Rungis, importateurs afro-caribéens, grossistes d'attiéké, boissons). Comprendre : minimum de commande, délais, comment ils reçoivent les commandes (téléphone/WhatsApp), appétence pour une plateforme.
- [ ] Cartographier le **parcours d'achat actuel** d'un restaurant type (menu de 8–12 plats).
- [ ] Définir le **persona prioritaire** : restaurant indépendant 1 établissement, 30–80 couverts/jour, gérant = acheteur.
- [ ] Identifier les **3 douleurs n°1** (hypothèses : ruptures, temps perdu, absence de visibilité sur les coûts).
- [ ] Constituer une **liste d'attente** de 30 restaurants intéressés (formulaire simple).

### Livrables
- Synthèse d'entretiens (1 page), persona, carte du parcours, liste d'attente.
- **Décision go/no-go** sur le positionnement et le prix d'entrée.

### Critère de succès
≥ 10 restaurateurs disent « je paierais pour ça » et ≥ 5 acceptent d'être pilotes.

---

## Chantier 1 — Socle technique (extraction depuis ethimarket)

**Principe :** extraire, pas forker. On garde la stack et les moteurs, on abandonne 70 % du volume (certifications, Trust Center, RASFF, CRM prospection, blog, admin).

### Actions
- [ ] Initialiser le repo `AFRISUPPLY` : Vite + React 18 + TypeScript + Tailwind + Supabase + Vitest + ESLint (copie de la config ethimarket).
- [ ] Nouveau projet **Supabase dédié** (ne pas réutiliser celui d'ethimarket).
- [ ] **Schéma propre** (~15 tables, une seule migration initiale) :
  - `restaurants`, `restaurant_members` (depuis `organizations`)
  - `suppliers`, `supplier_ratings`
  - `products` (référentiel), `supplier_offers` (prix / conditionnement / délai / MOQ / stock)
  - `price_history`
  - `inventory_items`, `stock_movements`
  - `orders`, `order_lines`, `deliveries`, `delivery_discrepancies`
  - `recipes`, `recipe_ingredients`, `sales` (ventes par plat/jour)
  - `alerts`, `reorder_rules`, `forecasts`
  - `subscriptions`
- [ ] **RLS** par restaurant dès le départ (leçon d'ethimarket : le durcissement tardif a coûté une migration entière).
- [ ] Porter tel quel : `auth.tsx`, `ProtectedRoute`, pages Login/Register/Reset, `DashboardLayout`, `NotificationBell`, `notificationService`, `ErrorBoundary`, `errorMonitor`, `Skeleton`.
- [ ] i18n : garder le mécanisme mais **FR uniquement** au lancement.
- [x] **CI GitHub Actions** (`.github/workflows/ci.yml`) : lint + types + tests + build + contrôle du bundle committé, **plus** les 9 scripts de vérification de bout en bout. Déploiement Vercel (preview par PR) — chantier de l'audit n° 10.
- [ ] Environnements : `dev` / `staging` / `prod` Supabase.
- [ ] Données de démonstration : 1 restaurant fictif (« Chez Awa ») avec 12 plats, 40 produits, 6 fournisseurs, 90 jours d'historique.

### Livrables
- Repo déployé sur une URL staging, login fonctionnel, dashboard vide mais navigable.

---

## Chantier 2 — Données : catalogue produits & fournisseurs

**Pourquoi c'est un chantier à part :** sans référentiel de produits fiable, ni le comparateur ni la prévision ne fonctionnent. C'est aussi un actif défensif.

### Actions
- [ ] **Référentiel produits africains** (~300 références au départ) avec : nom, alias (attiéké / attieke / garba), catégorie, unité de base (kg/L/pièce), conditionnements courants (sac 25 kg, bidon 5 L), origine, saisonnalité, DLC moyenne.
  - Féculents : riz parfumé/brisé, attiéké, manioc, plantain, igname, patate douce, foufou, gari
  - Frais : gombo, aubergine africaine, piment, feuilles (manioc, patate, ndolé), tomate, oignon, gingembre
  - Viandes & poissons : poulet, bœuf, mouton, capitaine, tilapia, poisson fumé, crevettes séchées
  - Épicerie : huile de palme, arachide/pâte, cube, soumbala, néré, épices, sauces
  - Boissons : bissap, gingembre, tamarin, baobab, sodas africains, bières
  - Emballages : barquettes, sacs, gobelets
- [ ] **Base fournisseurs** : 30–50 grossistes/importateurs en IDF puis grandes villes, avec zones de livraison, délais, MOQ, moyen de commande actuel, contact. Réutiliser `supplierSourcing.ts` et les scripts Python d'ethimarket pour la génération/import.
- [ ] **Grille de prix** : collecte manuelle initiale (tarifs, relevés) → alimente `supplier_offers` et `price_history`.
- [ ] Import CSV/Excel pour qu'un restaurant charge son propre carnet fournisseurs et ses prix.
- [ ] **Recettes types** : 25 plats emblématiques pré-remplis (mafé, yassa, thiéb, attiéké-poisson, poulet braisé, ndolé, alloco, …) avec grammages moyens, pour un onboarding en 5 minutes.

### Livrables
- Fichiers seed SQL/CSV, script d'import, page « Catalogue » consultable.

---

## Chantier 3 — Produit MVP : les 6 modules

Ordre de construction = ordre de valeur perçue par le restaurateur.

### 3.1 Stock (nouveau)
- Liste des articles, quantité, seuil critique, unité.
- Mouvements : entrée (réception), sortie (consommation), ajustement (inventaire).
- Saisie ultra-rapide mobile : « inventaire du soir » en 2 minutes.
- Décrémentation automatique à partir des ventes (recette × quantité vendue).
- Statuts 🟢🟠🔴 et « jours de stock restants ».

### 3.2 Fournisseurs (port de `buyerWorkspace`)
- Fiche fournisseur : produits, prix, délais, MOQ, note, fiabilité calculée (retards, erreurs, manquants).
- Historique de commandes.
- « Meilleur fournisseur pour… » par catégorie.

### 3.3 Commandes & réception (port de `orderService`, `purchaseOrderGenerator`, `ReceptionModal`)
- Création de commande multi-lignes, envoi par **e-mail + WhatsApp + PDF** (les fournisseurs n'auront pas de compte au départ).
- Réception : cocher les lignes, saisir écarts → mise à jour du stock + création d'un écart (`delivery_discrepancies`) + message de réclamation pré-rédigé.
- Suivi des dépenses par fournisseur / catégorie / mois.

### 3.4 Comparateur (port de `procurementComparator`)
- Remplacer les 4 scores éthiques par : **prix/unité, délai vs urgence de stock, fiabilité, frais de livraison/MOQ**.
- Conserver la recommandation rédigée en français (« Fournisseur C moins cher mais 5 jours ; votre stock ne permet pas d'attendre »).

### 3.5 Recettes & coût matière (nouveau)
- Recette = liste d'ingrédients × grammages → coût matière calculé à partir du dernier prix payé.
- Marge brute par plat, alerte quand un ingrédient fait dériver le coût, prix de vente conseillé.

### 3.6 Alertes (port de `alertsEngine`)
- 🔴 rupture imminente, 🟠 stock bas, 📈 hausse de prix détectée, 🟢 alternative moins chère, 🔵 fournisseur à réévaluer.
- Notifications in-app + e-mail quotidien « Votre matin AFRISUPPLY ».

### Livrable
Un restaurant pilote peut gérer 100 % de ses achats dans l'outil pendant une semaine sans revenir à son cahier.

---

## Chantier 4 — Intelligence : prévision, panier intelligent, assistant

### 4.1 Prévision de consommation
- V1 **déterministe et explicable** (pas de ML au départ) : moyenne mobile pondérée par jour de semaine + coefficient saison/événement + recettes × prévision de couverts.
- Sortie : besoin à 7 jours, stock actuel, stock recommandé, quantité à commander, niveau de confiance.
- Chaque prévision affiche son « pourquoi » (les restaurateurs n'obéissent pas à une boîte noire).
- V2 : apprentissage sur l'historique réel des pilotes.

### 4.2 Panier intelligent
- Agrège les besoins de la prévision, applique le comparateur ligne par ligne, respecte les MOQ et regroupe par fournisseur pour limiter les frais de port.
- Affiche « Optimisation : –37 € » vs fournisseur habituel.
- Un clic → n commandes générées.

### 4.3 Auto-Reorder
- Règles par article (seuil, quantité cible, fournisseur préféré ou « meilleur choix »).
- Prépare la commande, notifie, attend la validation (jamais d'envoi sans validation en V1).

### 4.4 Assistant « Demander à l'IA »
- Port de `procurementLlm.ts` / `llmParser.ts` : le LLM **traduit la question en requête** sur les données du restaurant, puis rédige la réponse avec chiffres. Il ne « devine » jamais un prix.
- 8 intentions couvertes au lancement : que commander, pourquoi mes coûts montent, moins cher pour X, coût réel d'un plat, fournisseur le plus fiable, dois-je augmenter un prix, dépenses du mois, ruptures à venir.
- Fournisseur LLM au choix (OpenAI/Anthropic/Mistral) derrière une Edge Function Supabase ; coût maîtrisé (< 1 €/restaurant/mois).

### 4.5 Suivi des prix
- Détection de variation > X % sur `price_history`, alerte + alternatives.
- Indice de prix par catégorie visible dans « Analyse ».

---

## Chantier 5 — Marque, site & offre commerciale

- [ ] **Identité** : nom (vérifier disponibilité INPI + domaine afrisupply.fr / .com / .eu), logo, palette, ton (« pro mais chaleureux »).
- [ ] **Site vitrine** 1 page : problème → démo vidéo 90 s → 3 bénéfices chiffrés → tarifs → « Demander un accès ». Réutiliser `Home`, `Tarifs`, `SEOHead` d'ethimarket.
- [ ] **Offre** :
  - Starter 39 € : stock, fournisseurs, commandes, alertes
  - Pro 89 € : + prévision, comparateur, recettes, assistant IA
  - Business 199 € : + multi-établissements, achats groupés, API
  - **Essai 30 jours** + offre « pilote fondateur » (–50 % à vie pour les 20 premiers).
- [ ] **Onboarding en 15 minutes** : choisir ses plats parmi les 25 recettes types → l'app en déduit la liste de produits → importer ou saisir ses fournisseurs → premier inventaire. Réutiliser `BuyerOnboarding`.
- [ ] Supports : plaquette PDF, script de démo, FAQ, 3 témoignages pilotes.

---

## Chantier 6 — Pilotes & itérations

- [ ] Recruter **5 à 10 restaurants pilotes** (issus du chantier 0), idéalement 2 villes.
- [ ] Onboarding en présentiel, puis **point hebdo de 20 min** pendant 6 semaines.
- [ ] Instrumenter l'usage (réutiliser `analytics.ts` / `growth_analytics`) : connexions/semaine, commandes créées, inventaires saisis, alertes cliquées, questions posées à l'IA.
- [ ] Mesurer la **valeur créée** par pilote : € économisés (comparateur), ruptures évitées, heures gagnées. Ce sont les chiffres du site et du pitch.
- [ ] Boucle d'itération de 2 semaines : correctifs + 1 amélioration majeure par sprint.

### Critères de sortie
- ≥ 60 % des pilotes actifs chaque semaine au bout de 6 semaines.
- ≥ 3 pilotes acceptent de payer à la fin de l'essai.
- NPS ≥ 40.

---

## Chantier 7 — Juridique, conformité, paiement

- [ ] Structure : société existante ou nouvelle entité ; propriété du code (ethimarket → AFRISUPPLY).
- [ ] **CGU / CGV SaaS**, politique de confidentialité, mentions légales (réutiliser le socle `Legal` d'ethimarket, à faire relire).
- [ ] **RGPD** : registre de traitements, DPA Supabase/Vercel/LLM, export et suppression de compte (déjà présent : `account_rgpd`).
- [ ] **Stripe** : abonnements récurrents, essai gratuit, TVA, factures automatiques (port de `stripe-checkout` / `stripe-webhook`).
- [ ] Assurance RC pro ; disclaimers sur les recommandations (l'outil aide à décider, ne garantit pas les prix).
- [ ] Préparer la V2 marketplace : statut d'intermédiaire, conditions fournisseurs, mandat d'encaissement (Stripe Connect) — à étudier mais pas à bloquer maintenant.

---

## Chantier 8 — Go-to-market & acquisition

### Canaux prioritaires (par coût d'acquisition croissant)
1. **Terrain** : Château-Rouge, marchés, quartiers à forte densité de restaurants africains (Paris 18e/19e, Saint-Denis, Montreuil, Nantes Bellevue, Lyon Guillotière, Marseille Noailles). Démo sur tablette en 10 minutes.
2. **Fournisseurs prescripteurs** : un grossiste qui recommande AFRISUPPLY à ses 50 clients restaurants vaut 50 rendez-vous. Leur proposer une visibilité dans le catalogue en échange.
3. **Communautés** : associations de restaurateurs afro, groupes WhatsApp/Facebook, diaspora, influenceurs food afro.
4. **Événements** : salons food, festivals africains, Africa Food Week, Sirha.
5. **Contenu SEO** : « prix de l'attiéké 2026 », « fournisseur huile de palme professionnel », « coût matière poulet braisé ». Réutiliser le module blog si utile.
6. **Parrainage** : 1 mois offert par restaurant parrainé.

### Objectifs
- M6 : 30 clients payants (≈ 2 500 € MRR)
- M12 : 100 clients payants (≈ 8 000 € MRR) + 2 villes hors IDF
- M18 : 250 clients, ouverture Bruxelles/Lyon/Marseille en propre

### Organisation
- Un profil **commercial terrain** (freelance ou associé) dès M4.
- Support client via WhatsApp Business (canal naturel de la cible).

---

## Chantier 9 — Marketplace & réseau fournisseurs (V2)

À lancer uniquement quand ≥ 100 restaurants commandent régulièrement via l'outil (le volume est l'argument de négociation).

- [ ] **Espace fournisseur** : réception des commandes, catalogue et prix mis à jour par le fournisseur lui-même (port de `MyShop`, `MyProducts`, `AddProduct`).
- [ ] Commande directe et **paiement intégré** (Stripe Connect) → commission 2–5 %.
- [ ] **Achats groupés** : agrégation hebdomadaire des besoins par produit et zone → négociation → répartition.
- [ ] **Scan de facture / bon de livraison** (OCR + LLM) pour la réception automatique.
- [ ] Prédiction des prix, intégration comptable (export FEC, Pennylane, etc.), API publique.
- [ ] Logistique : partenariats de tournées mutualisées.

---

## Budget & équipe indicatifs (12 premiers mois)

| Poste | Estimation |
|---|---|
| Développement (fondateur tech + 1 dev freelance 6 mois) | 30–50 k€ |
| Infra (Supabase Pro, Vercel, LLM, e-mails, WhatsApp API) | 150–400 €/mois |
| Marque, site, vidéo démo | 3–6 k€ |
| Juridique (CGV, RGPD, marque INPI) | 2–4 k€ |
| Commercial terrain (6 mois) | 15–25 k€ |
| Événements / marketing | 5–10 k€ |
| **Total** | **≈ 60–100 k€** |

Financement possible : BPI Bourse French Tech, prêt d'honneur (Initiative / Réseau Entreprendre), subventions régionales Pays de la Loire / IDF, programmes diaspora (Meet Africa, Choose Africa).

---

## Risques principaux et parades

| Risque | Parade |
|---|---|
| Restaurateurs peu digitalisés, pas le temps de saisir | Onboarding 15 min, saisie mobile 2 min/jour, décrément auto via recettes, WhatsApp comme canal |
| Données de prix rapidement obsolètes | Prix mis à jour à chaque réception (saisie par le restaurateur = donnée fraîche), puis par les fournisseurs en V2 |
| Fournisseurs réticents à la transparence | Commencer côté restaurant sans compte fournisseur ; les amener par le volume |
| Prévision perçue comme fausse | Toujours expliquer le calcul, laisser corriger, apprendre des corrections |
| Reproduire ethimarket : trop de fonctionnalités, pas d'usage | Chantier 0 obligatoire, 6 modules max au MVP, métriques d'usage hebdo |
| Concurrence généraliste (Choco, Rekki, Pennylane) | Spécialisation : référentiel produits africains, recettes, réseau fournisseurs de niche |

---

## Chantiers issus de l'audit de septembre 2026

L'audit critique de l'existant (verdict « ⚠️ OUI, mais avec conditions », document tenu hors dépôt) a donné une liste
de chantiers, menés **un par un**, chacun avec ses tests, ses vérifications en direct et son rapport :

| # | Chantier | Statut |
|---|---|---|
| 1 | Intégrité de la réception et des statuts de commande | ✅ livré (poussé) |
| 2 | Sécurisation du déploiement et cloisonnement des données | ✅ livré (poussé) |
| 3 | Prix réellement facturé et détection de la hausse | ✅ livré (poussé) |
| 4 | Page Analyse réellement utile (« pourquoi mes coûts augmentent ») | ✅ livré |
| 5 | Accès et récupération de compte | ✅ livré |
| 6 | Canaux réels : e-mail, WhatsApp, notifications | ✅ livré |
| 7 | Encaissement et offre commerciale honnête | ✅ livré |
| 8 | Parcours client et moyens de paiement | ✅ livré |
| 9 | Prévision robuste (cascade de sources, relances, saisonnalité) | ✅ livré |
| 10 | Qualité, CI et dette : rendre le dépôt fiable et vérifiable | ✅ livré |
| 11 | UX : recentrer le produit sur le parcours d'achat (navigation, dialogues intégrés, parcours guidé) | ✅ livré |
| 12 | Exploitation : sauvegardes réellement restaurées, supervision des tâches, journal d'audit, support | ✅ livré |

## Les 30 prochains jours (révisé après audit)

1. ~~**Semaine 1** — Chantier UX : navigation par tâches, plus aucun `alert()`/`confirm()` natif, parcours guidé
   « Rupture → Commander → Recevoir », barre d'onglets mobile.~~ **Fait** (chantier 11).
2. ~~**Semaine 2** — Chantier Exploitation : sauvegarde/restauration **testées**, supervision branchée, journal d'audit consultable,
   canal de support.~~ **Fait** (chantier 12) — reste le test à blanc avec 3 restaurateurs qui n'ont jamais vu le produit
   (protocole : `docs/CHANTIER_11_RECETTE_MANUELLE.md`).
3. **Semaine 3** — Brancher les clés réelles (Stripe, Resend) sur un environnement de recette, rejouer la CI sur les deux
   environnements, puis ouvrir le pilote fondateur aux premiers restaurants.
