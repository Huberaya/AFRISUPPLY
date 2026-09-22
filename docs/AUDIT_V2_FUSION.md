# AFRISUPPLY — Audit complet (2ᵉ passage)

> **Périmètre** : le dépôt `Huberaya/AFRISUPPLY` **après la fusion des deux historiques** — mes 12 chantiers
> d'audit (4→12) **et** les 6 vagues de travail arrivées en parallèle sur `origin/main` (démarrage à froid,
> vérité des coûts, finitions métier, prévision complète, exploitation/CI, ouverture commerciale) ainsi que
> les lots de photos 10 à 15.
> **Méthode** : rien n'est repris d'un rapport précédent sans être revérifié. Toutes les preuves chiffrées de
> ce document ont été **réexécutées** sur l'état fusionné. Ce qui n'a pas pu être exécuté est marqué comme tel.
> **Date** : 22 septembre 2026 · **Branche** : `main` (fusion `4a0666c`) · **État** : 17 commits d'avance sur
> `origin/main` (le push est bloqué par une limite de jeton, voir §11).

---

## 0. VERDICT

# ⚠️ OUI, MAIS AVEC CONDITIONS

**Ce qui a changé depuis le premier audit (verdict déjà conditionnel) : les conditions ont fondu de moitié.**
Le produit n'est plus « un prototype prometteur avec des trous » : c'est un logiciel d'approvisionnement
**complet, cohérent et vérifiable** — mais **toujours pas un produit commercialisable demain matin**, pour
trois raisons qui ne sont pas des détails d'implémentation :

1. **Aucun euro n'a encore été encaissé en ligne.** Le code de paiement (Stripe Checkout, webhooks,
   commissions, encours, plafonds) est écrit et testé, mais **tourne sans clés** : sans
   `STRIPE_SECRET_KEY`, l'écran répond honnêtement 503 et l'activation se fait à la main. Ce n'est pas
   un mensonge de l'app — c'est une promesse commerciale non encore tenue par la plateforme.
2. **La sauvegarde ne quitte pas la machine.** Sauvegarde quotidienne, empreinte SHA-256, **essai de
   restauration réel dans une base neuve** : c'est sérieux. Mais il n'existe **aucune copie hors site**
   (S3/autre). Un incident d'hébergeur détruirait les données de tous les restaurants, sauvegardes incluses.
3. **Personne, hors de l'équipe, n'a jamais utilisé le produit.** La recette terrain annoncée (3
   restaurateurs non formés, protocole écrit dans `docs/CHANTIER_12_RECETTE_TERRAIN.md`) n'a pas eu lieu.
   Tout ce qui suit est donc « vérifié par la machine », pas « validé par un client ».

**Ce qui est désormais solide, et je le dis sans complaisance inverse :** l'isolation entre restaurants,
l'intégrité de la réception (impossible de compter deux fois une livraison), la prévision explicable
(chaque chiffre dit d'où il vient), l'assistant réellement branché sur les données (pas un chatbot
décoratif), les 507 vérifications de bout en bout rejouées en local, la CI, et une carte d'offres
**nettoyée de toute promesse non construite** (multi-établissements et exports comptables ne sont plus
vendus — ils n'existent pas).

**Ce qu'il faut pour lancer** : les clés (Stripe, e-mail), la copie hors site, la recette terrain de 3
restaurateurs, et le déblocage du push (scope `workflow` du jeton). Tout le reste est du confort.

---

## 1. Audit de l'existant — statut par élément

Légende : ✅ **terminé et vérifié** · 🟡 **partiel** · 🔵 **simulé / non branché** · 🔴 **ne fonctionne pas** ·
⬜ **absent** · ⚠️ **à corriger avant lancement**

| Domaine | Élément | Statut | Preuve / réserve |
|---|---|---|---|
| Compte | Inscription, connexion, rôles (propriétaire/gérant/équipe) | ✅ | 372 tests API ; scénarios E2E |
| Compte | Vérification d'adresse e-mail (jeton haché, 48 h, usage unique) | ✅ | `chantier5_verif.py` 37/37 |
| Compte | Mot de passe oublié / réinitialisation / « déconnecter partout » | ✅ | idem |
| Compte | 2FA, SSO | ⬜ | absent (acceptable en B2B TPE, à assumer) |
| Session | Jeton en **cookie HttpOnly** (plus de jeton lisible en JS) | ✅ | leur chantier 5 ; testé |
| Sécurité | Limitation de débit (connexion, inscription, mot de passe oublié) en base partagée | ✅ | `rate_limits` + hooks ; 26 tests |
| Sécurité | CORS liste blanche, en-têtes de sécurité, refus `*` avec credentials | ✅ | `app.ts` + `chantier2_verif.py` |
| Multi-tenant | **Isolation entre restaurants** (un restaurant ne voit rien d'un autre) | ✅ | test cross-tenant du scénario E2E + index par restaurant |
| Stock | Suivi, seuils, jours restants, statuts 🟢🟠🔴, inventaire, journal des mouvements | ✅ | `chantier3_verif.py` + leurs « finitions » |
| Stock | Plafonds de plausibilité (refus d'une quantité absurde, confirmation explicite du réel) | ✅ | `limits.ts` ; BUG-3/4 corrigés |
| Fournisseurs | Fiches, prix, historisation, fiabilité, portail fournisseur (13 écrans) | ✅ | `chantier6/7_verif.py` |
| Fournisseurs | Import tarif CSV/Excel, **lecture d'une photo de tarif** | 🟡 | CSV/Excel ✅ ; photo = **nécessite `LLM_API_KEY`**, sinon message honnête |
| Fournisseurs | API/EDI fournisseur (connexion directe à leurs systèmes) | ⬜ | inexistant — V3 |
| Catalogue | 324 produits de référence, alias, conditionnements | ✅ | référentiel ; 229/324 photos (71 %) 🟡 |
| Comparateur | Multi-critères : prix, prix/unité, disponibilité, délai, frais, minimum, fiabilité | ✅ | `chantier4_verif.py` 51/51 + « coût total » de leur chantier 3 |
| Prévision | Cascade ventes 28 j → 7 j → couverts → seuils, expliquée à l'écran | ✅ | `chantier9_verif.py` 40/40 |
| Prévision | Jours de fermeture, saisonnalité, **événements/soirées privatisées**, démarrage à froid | ✅ | fusion #3 ; tests unitaires + E2E |
| Prévision | Apprentissage (poids qui s'ajustent aux écarts réels) | ⬜ | V3 — la confiance est graduée, pas apprise |
| Panier | Panier intelligent justifié ligne par ligne, auto-reorder | ✅ | `chantier11_verif.py` |
| Commandes | Création, envoi, statuts, timeline, récurrentes, tournées/créneaux | ✅ | + paiement en ligne des commandes (🔵 sans clés) |
| Réception | Réception **atomique**, anti-double comptage, écarts, réclamations/avoirs | ✅ | BUG-1/2 corrigés ; `deliveries_order_unique` |
| Analyse | Coûts par catégorie/fournisseur, dérives produit, **prix vs volume**, marges par plat dans le temps | ✅ | `chantier4_verif.py` + `/analysis/margins` |
| IA | Assistant branché sur les données (15 intentions), chiffres réels | ✅ | **interrogé en direct aujourd'hui** (§3, S6) |
| IA | Reformulation par LLM | 🟡 | optionnelle (`LLM_API_KEY`) : sans clé, réponses en gabarit — jamais inventées |
| Notifications | In-app + e-mail (Resend), WhatsApp/SMS (Twilio) | 🟡 | e-mail ✅ si clé ; WhatsApp/SMS = code présent, **non configuré** ; sans clé : aucune fausse promesse |
| Paiement | Abonnement, portail, factures PDF, commissions, encours, plafond | 🔵 | **code complet et testé, sans clés Stripe en production** |
| Sauvegardes | Quotidienne, gzip + SHA-256, essai de restauration réel, refus d'écraser, rotation | ✅ | `chantier12_verif.py` 71/71 |
| Sauvegardes | Copie hors site (S3/autre) | ⬜ | **le point le plus grave du dispositif actuel** |
| Supervision | `/status`, `/status/jobs`, journal d'audit exportable, watchdog, crons | ✅ | `chantier12_verif.py` |
| Exploitation | CI GitHub Actions (qualité + vérifications de bout en bout) | ✅ | `.github/workflows/ci.yml` — **non poussable** : jeton sans scope `workflow` |
| Vitrine | Site, tarifs honnêtes, FAQ, statut de service, mentions légales, CGV | ✅ | 9 pages ; contrat anti-promesse (14 tests) |
| Preuve sociale | Témoignages publiés **avec accord** (modération admin) | ✅ | leur chantier 6 |
| Mobile | PWA installable + service worker (coquille hors réseau) | 🟡 | hors ligne = coquille ; **aucune saisie hors réseau** |

**Ce qui ne fonctionne pas** : rien de cassé n'a été trouvé sur le chemin nominal lors de cette passe.
Les seuls échecs rencontrés aujourd'hui étaient **hors produit** : 5 réinitialisations de l'environnement de
travail et un jeton GitHub insuffisant (§11).

**Ce qui est simulé** : uniquement ce qui dépend d'une clé absente (Stripe, Resend, Twilio, LLM) — et dans
les quatre cas, l'application **le dit** au lieu de faire semblant. C'est la bonne façon d'être incomplet.

---

## 2. Gap vs la vision

| Brique de la vision | État réel | Ce qui manque pour être « complet » |
|---|---|---|
| Stock intelligent | ✅ | Alertes configurables par jour/heure de réception |
| Gestion fournisseurs | 🟡 | Annuaire externalisé, notation publique, API/EDI |
| Catalogue produits africains | ✅ (photos 71 %) | 95 photos restantes, prix moyens de marché par ville |
| Comparateur multi-critères | ✅ | Prise en compte des promotions/remises de volume négociées (chantier 28 côté distant : tarifs volume) |
| Prévision | ✅ explicable | Apprentissage réel des écarts ; prévision par produit hors recette |
| Panier intelligent | ✅ | Arbitrage automatique multi-fournisseurs (aujourd'hui : proposé, validé par l'humain — **volontairement**) |
| Commandes | ✅ | Envoi direct au fournisseur par API quand elle existera |
| Réception | ✅ | Contrôle qualité (température, DLC) au-delà des quantités |
| Analyse des coûts | ✅ | Export comptable (assumé absent, retiré de l'offre) |
| **IA connectée aux données** | ✅ | Rien d'essentiel : c'est le point qui a le plus progressé (faits = source de vérité, LLM optionnel) |

**Écart restant le plus important pour la vision** : le produit est aujourd'hui **un très bon outil pour un
restaurant**, pas encore **un réseau** (fournisseurs connectés, achats groupés réels entre restaurants,
données de marché partagées). Les achats groupés existent en base et dans l'interface, mais **sans masse
critique de restaurants, ils ne produisent rien** : c'est un problème de marché, pas de code.

---

## 3. Audit métier — les 6 scénarios, rejoués

Les six scénarios sont des **scripts exécutés**, pas des intentions : `scripts/verifications/scenario_tests.py`
(49 vérifications, `**49/49 OK**`) et les 12 scripts de chantier.

### S1 — Nouveau restaurant : compte, menu, produits, fournisseurs, stocks
Parcours complet rejoué de bout en bout : inscription → onboarding (nom du restaurant, couverts, seuils) →
**prévision dès le premier jour** (leur chantier 1) → import fournisseurs → inventaire → carte.
✅ **Réel.** Réserve : l'onboarding suppose que le restaurateur connaisse ses seuils ; les valeurs par défaut
couvrent ce cas (« vos seuils d'alerte » pré-remplis), c'est correct.

### S2 — Première commande (recherche → comparaison → commande → validation)
Recherche produit → comparateur (prix/unité, disponibilité, délai, frais, minimum, fiabilité, **coût total
livré**) → panier → commande → validation explicite par l'humain.
✅ **Réel.** Point de vigilance produit : la quantité proposée est **plafonnée** (anti-surstock) et
**expliquée** ; un restaurateur qui « sait mieux » peut la modifier.

### S3 — Rupture sous seuil (alerte ? quantité recommandée ?)
`scenario_tests.py` provoque la rupture : alerte créée (`/alerts`), quantité recommandée avec **source
affichée** (« vos ventes des 4 dernières semaines », « vos couverts », « vos seuils »), date de rupture prévue.
✅ **Réel et explicable.** C'est le cœur de la valeur du produit et il tient.

### S4 — Réception 50 kg commandés / 45 reçus (détection d'anomalie ?)
Écart détecté (5 kg), **écart valorisé** (`/discrepancies`, valeur ouverte affichée), commande clôturée en
`livree_partiel`, **double réception impossible** (409), quantités invraisemblables refusées avec explication.
✅ **Réel et durci** (BUG-1 à BUG-4 du premier audit corrigés et prouvés).

### S5 — Hausse de prix (détection + alerte ?)
Historisation des prix à chaque saisie/import ; hausse détectée, alerte « hausse de prix » créée, ampleur en €
et en % ; apparition dans la page Analyse (dérives, prix vs volume).
✅ **Réel.** Réserve honnête : la hausse est détectée **sur les prix que vous saisissez ou importez** ; sans
mise à jour des tarifs fournisseurs, il n'y a rien à détecter. Le produit ne lit pas encore les tarifs du
fournisseur à la source.

### S6 — « Pourquoi mes coûts augmentent ? » (réponse depuis les données réelles ?)
**Interrogé en direct aujourd'hui** sur le restaurant de démonstration :

> « Tes achats ont évolué de **+297 %** sur 30 jours (2 098,50 € vs 529,10 €). Les causes identifiées côté
> prix : **Huile de palme rouge** +12 % chez Afro Distribution Nantes (4,38 € → 4,90 €/L), **Poulet entier
> PAC** +9 % chez Volailles Loire Atlantique (4,40 € → 4,80 €/kg). Ton premier poste est Afro Distribution
> Nantes (21 823,00 € sur 30 j). »

✅ **Réel, chiffré, sourcé** (noms de fournisseurs réels, prix réels, période réelle) — et décomposé en
« effet prix » / « effet volume » dans la page Analyse.
⚠️ **Un défaut d'UX à corriger** : « **+297 %** » est arithmétiquement juste mais **alarmiste et trompeur**
sur un historique mince (les achats de démonstration sont concentrés sur la fin de période). Il faut afficher
la base de comparaison (« 529 € sur le mois précédent, 4 commandes ») ou basculer en « trop peu d'historique
pour conclure » sous un seuil. C'est le genre de chiffre qui fait perdre la confiance d'un restaurateur.

---

## 4. Audit UX/UI

**Ce qui est bon :** 64 écrans cohérents (un seul système de design), navigation par tâches, parcours guidé
« démarrer », confirmations intégrées (plus aucune boîte native `alert/confirm`), **chaque écran d'erreur
propose « Réessayer »** et dit « vos données ne sont pas perdues » — vérifié automatiquement par
`chantier11_verif.py` (40/40). Dictée vocale pour la liste de courses, saisie express, mode PWA installable.

**Ce qui reste fragile :**
* **Aucun test avec un vrai restaurateur.** C'est le trou noir de cet audit : toute la conception a été
  validée entre nous. Le document de recette (`docs/CHANTIER_12_RECETTE_TERRAIN.md`) existe, il n'a pas été joué.
* Motifs React à nettoyer : les règles `react-hooks` v7 (`set-state-in-effect`, `purity`, `immutability`,
  `static-components`) signalaient **45 occurrences** sur des écrans préexistants ; je les ai laissées
  **non activées**, avec la raison écrite dans `eslint.config.js`, plutôt que de désactiver en bloc. À traiter
  en chantier dédié (aucun impact utilisateur visible aujourd'hui).
* Densité de certains écrans d'administration (8 écrans admin) : acceptable pour un opérateur, pas pour un
  restaurateur.
* Le comparateur affiche beaucoup de colonnes : sur un téléphone, l'information clé (coût total livré) doit
  rester visible sans défilement horizontal.

---

## 5. Audit produit

**Le produit résout-il le vrai problème ?** Oui, sur le papier et dans l'exécution : ruptures annoncées
**avant** qu'elles arrivent, commande préparée sans repartir de zéro, écarts de livraison **valorisés en
euros**, hausse de prix détectée et attribuée, marge par plat suivie dans le temps.

**Feature par feature — ce qui est réellement piloté par les données (critère demandé) :**

| Element | Réel ? | Pourquoi |
|---|---|---|
| Prévision | ✅ | calculée sur ventes/couverts/seuils réels du restaurant, source affichée, jamais de valeur fixe |
| Panier intelligent | ✅ | quantité, prix et fournisseur issus des offres en base + prévision |
| Comparateur | ✅ | offres réelles ; « coût total » = produit + livraison + minimum ; fiabilité = historique de réception du restaurant |
| Alertes | ✅ | générées par les seuils et les prix du restaurant |
| Analyse | ✅ | agrégats réels ; aucune donnée de démonstration n'apparaît dans une réponse client |
| Assistant | ✅ | 15 intentions calculées sur les données ; LLM uniquement pour reformuler, jamais pour inventer |
| Fiabilité fournisseur | ✅ | note recalculée sur les réceptions réelles (délai, écart, litiges) |
| Achats groupés | 🟡 | mécanique réelle, mais **dépend d'un nombre de restaurants que nous n'avons pas** |

**Aucune fonctionnalité clé ne repose sur une valeur figée.** Les seuls « fixés » restants sont des
paramètres assumés (coefficient de pleine saison 1,2, confiance par source, plafonds de plausibilité) —
et **chacun est affiché à l'écran** quand il s'applique.

---

## 6. Audit technique

| Élément | État | Détail |
|---|---|---|
| Architecture | ✅ | monorepo TS : `apps/web` (React 18/Vite), `apps/api` (Hono), `packages/db` (Drizzle + PGlite/Neon) |
| Taille | — | 64 écrans · **244 endpoints** (23 routeurs) · **48 tables** · 30 index · **28 migrations** |
| Qualité | ✅ | `tsc` strict 0 erreur (API + web), ESLint 0 erreur avec `no-explicit-any`, 55 fichiers de tests |
| Tests | ✅ | base 5 · API 372 · web 72 (**449 tests verts** après fusion) |
| Vérification réelle | ✅ | 12 scripts, **507 vérifications bout-en-bout** contre une API vivante |
| Migrations | ✅ | chaîne 0000→0027 cohérente (`No schema changes`), **base neuve migrée + seed** rejoués aujourd'hui |
| Base | ✅ | PGlite en local, Neon en production ; `auto-migrate` ; seed démo refusé en production |
| Erreurs | ✅ | `onError`/`notFound` globaux, codes d'erreur métier, capture Sentry optionnelle |
| Journalisation | ✅ | `audit_log` exportable (CSV), `job_runs`, historique d'événements par commande |
| Performance | 🟡 | aucune pagination sur les gros écrans, **aucun test de charge**, PGlite plafonne à une instance |
| Scalabilité | 🟡 | un `SELECT` non indexé par écran est possible ; jobs quotidiens non verrouillés multi-instance |
| Secrets | ✅ | `.env` non committé, `.env.example` exhaustif (36 clés), refus des secrets par défaut faibles en prod |
| Dépendances | 🟡 | `npm audit` surveillé en CI ; reste des alertes de développement (non bloquantes) |
| Bundle | ✅ | `api/index.js` committé et **contrôlé identique aux sources** (`check:bundle`) |
| Dette | 🟡 | 45 motifs React à corriger ; historique git en fusions successives (un commit « état fusion 5 » de sauvegarde, assumé) |

---

## 7. Audit sécurité (classé)

| Niveau | Constat | Détail / action |
|---|---|---|
| 🟠 **ÉLEVÉ** | **Sauvegarde sans copie hors site** | Un incident d'hébergeur = perte totale. Action : export chiffré vers S3/Backblaze, testé (chantier 14). |
| 🟠 **ÉLEVÉ** | **Aucun test d'intrusion, aucune revue externe** | Le code est propre et testé, mais jamais éprouvé par un attaquant. Action : audit externe avant 20 clients (chantier 15). |
| 🟡 **MOYEN** | Pas de 2FA sur les comptes propriétaires | Un mot de passe réutilisé suffit à prendre la main sur le restaurant. Action : TOTP (chantier 15). |
| 🟡 **MOYEN** | Verrou d'exécution des jobs quotidiens absent | Deux instances en parallèle peuvent double-exécuter relances/sauvegardes. Action : verrou en base (chantier 14). |
| 🟡 **MOYEN** | Pas de journal de connexions visible par le restaurateur | Détection d'intrusion impossible côté client. Action : écran « appareils/sessions ». |
| 🟡 **MOYEN** | Politique de rétention RGPD non outillée | Export et suppression existent et **sont gratuits** ; l'effacement automatique après inactivité n'existe pas. |
| 🟢 **FAIBLE** | En-têtes de sécurité, CORS liste blanche, limitation de débit | ✅ en place, vérifiés |
| 🟢 **FAIBLE** | Jetons (session, vérification, réinitialisation) | ✅ hachés, à usage unique, expirants, « déconnecter partout » |
| 🟢 **FAIBLE** | Isolation multi-tenant | ✅ testée en E2E (aucune fuite entre restaurants) |

**Ce qui est fait correctement et mérite d'être dit** : la session en **cookie HttpOnly** (plus de jeton volable
par XSS), la limitation de débit partagée en base, la liste blanche CORS, les plafonds d'usage, le refus des
quantités invraisemblables, et le **refus explicite de faire croire à un envoi d'e-mail qui n'a pas eu lieu**.

---

## 8. Audit données (champs requis & relations)

48 tables, dont les relations structurantes suivent toutes le même contrat : **`restaurant_id` en clé de
cloisonnement** (indexé), suppression en cascade, horodatage de création.

| Entité | Champs clés vérifiés | Relations |
|---|---|---|
| `users` | email normalisé, mot de passe haché, `token_version`, `email_verified_at` | — / `restaurant_members` |
| `restaurants` | nom, ville, couverts/jour, réglages de prévision, formule, `stripe_customer_id` | → membres, stocks, commandes… |
| `restaurant_members` | rôle (`owner`/`manager`/`staff`), unicité par utilisateur | → users, restaurants |
| `products` | nom, catégorie, unité de base, alias, DLC indicative, saisonnalité | → offres, ingrédients |
| `suppliers` / `supplier_offers` | conditionnement, prix, disponibilité, minimum, délai, frais de livraison | → produits, historiques |
| `price_history` | prix daté par offre (hausses détectables) | → offres |
| `inventory_items` | quantité, seuil critique, **objectif (s,S)**, DLC | → produits |
| `stock_movements` | type, quantité signée, coût unitaire, auteur | → inventaire |
| `orders` / `order_lines` | référence unique, statut, totaux, `received_at`, paiement | → fournisseurs, livraisons |
| `deliveries` / `delivery_discrepancies` | quantités reçues, écart valorisé, **unicité une livraison par commande** | → commandes |
| `recipes` / `recipe_ingredients` | rendement, prix de vente, marge cible | → produits |
| `sales` | jour, portions par plat (base de la prévision) | → recettes |
| `forecast_events` | jour, libellé, coefficient (soirées privatisées) | → restaurants |
| `alerts` | type, gravité, message, `dedupe_key` (anti-doublon), lu/notifié | → restaurants |
| `email_verifications`, `password_resets`, `rate_limits` | jetons hachés, expiration, compteurs | — |
| `job_runs`, `audit_log`, `billing_events` | traçabilité et rejeu des webhooks | — |

**Contrôles d'intégrité actifs** : unicité de référence (`AFS-`, `AFR-`, `LIT-` avec resynchronisation de
séquence), unicité de livraison par commande, anti-doublon d'alerte, transactions sur la réception,
plafonds de plausibilité calculés sur les données réelles.

**Réserve** : `products.seasonality` est un champ texte (JSON ou texte libre) — tolérant, mais sans contrainte
en base. Un champ structuré serait plus sûr (chantier de dette).

---

## 9. Audit des intégrations

| Intégration | Statut | Réalité vérifiée |
|---|---|---|
| Authentification | ✅ connecté fonctionnel | e-mail + mot de passe, cookie HttpOnly, vérification d'adresse, réinitialisation, rôles |
| Paiement en ligne (Stripe) | 🔵 **codé, non branché** | Checkout, portail, webhooks, commissions fournisseurs, encours, plafonds : tout est écrit et testé. **Sans clés** : 503 honnête + activation manuelle par l'admin. |
| E-mail (Resend) | ⚠️ incomplet (clé requise) | Avec clé : envoi réel. Sans clé en dev : dépôt dans `.outbox` (preuve lisible) ; en production : **refus d'envoyer** plutôt que mensonge |
| WhatsApp / SMS (Twilio) | ⚠️ incomplet | Code présent (commandes, relances) ; sans configuration, l'écran dit que rien n'a été envoyé |
| Notifications in-app | ✅ | centre de notifications, canaux, préférences par utilisateur |
| Fournisseurs (API/EDI) | ❌ absent | aucun connecteur ; les tarifs entrent par saisie, CSV/Excel ou photo (LLM requis) |
| IA (LLM) | ⚠️ optionnel | reformulation ; **sans clé, l'assistant répond quand même** avec les chiffres réels |
| Import / export | ✅ | import CSV/Excel, export RGPD (JSON), PDF (commandes, factures, analyses) |
| Facturation | ✅ | factures d'abonnement PDF avec mentions légales obligatoires (SIRET/TVA par environnement, **signalées si manquantes**), factures de commission, factures fournisseur |
| Supervision / statut | ✅ | page de statut publique, `/status/jobs`, watchdog, journal d'audit |
| Sauvegarde / restauration | ⚠️ incomplet | sauvegarde + restauration prouvée ✅ ; **copie hors site absente** ❌ |

---

## 10. Audit business

**Proposition de valeur** : claire, vérifiable, et désormais **défendable chiffre en main** — « on vous dit
quoi commander, quand, chez qui, à quel prix, et ce que vous perdez quand vous vous trompez ».

**Tarification** : 39 € (Starter) / 89 € (Pro) / 199 € (Business), offre fondateur −30 % à vie pour les
premiers sièges, essai sans carte. **La carte des offres a été nettoyée** : plus de « multi-établissements »
ni d'« accès API & exports comptables » vendus alors qu'ils n'existent pas ; un **test dédié (14 tests)
interdit le retour d'une promesse fantôme** (features web = features API). C'est rare, et ça compte.

**20 restaurateurs comprendraient-ils pourquoi payer ?** Oui pour la partie **Stock + Commandes + Réception
+ Alertes** (Starter) — la douleur est immédiate et la démonstration prend 10 minutes. Plus difficile pour
**Analyse + Prévision + Assistant** (Pro) : la valeur est réelle mais demande **3 semaines de données**.
Conséquence pratique : l'essai doit être **long** (30 jours, pas 14) ou l'onboarding doit **importer
l'historique** (ventes passées, dernier tarif fournisseur) pour raccourcir le délai de perception.

**Acquisition** : vitrine complète (fonctionnalités, tarifs, FAQ, statut, mentions légales, CGV), demande
d'accès, démo de 20 minutes scénarisée (`docs/commercial/SCRIPT_DEMO_20MIN.md`), plaquette.
**Ce qui manque** : aucune mesure d'acquisition (pas d'analytics produit ni d'entonnoir d'inscription) —
on ne saura pas **où les essais se perdent**.

**Confiance / preuve sociale** : témoignages publiés **uniquement avec accord écrit** du pilote (modération
admin) — et donc aujourd'hui **vides**, ce qui est honnête mais commercialement faible.

**Support** : une adresse unique configurable, promesse « réponse sous 24 h ouvrées », écran de support.

---

## 11. Audit lancement

### 🔴 BLOQUANTS (ne pas ouvrir un compte payant avant)
1. **Clés de paiement absentes** → personne ne peut payer en ligne. (Action : compte Stripe + 3 prix + webhook.)
2. **Aucune sauvegarde hors site** → un incident détruit toutes les données clients.
3. **Push bloqué par le jeton GitHub** (scope `workflow` manquant) : la CI que nous avons écrite **ne peut pas
   être poussée**. Le dépôt distant n'a donc **pas** nos 17 commits ni les correctifs d'audit.
4. **Recette terrain non faite** (3 restaurateurs, protocole écrit) → aucune preuve d'usage réel.

### 🟠 IMPORTANT (avant 10 clients)
5. Clé e-mail (`RESEND_API_KEY`) : sans elle, aucune alerte ne part par e-mail en production.
6. Verrou multi-instance des jobs quotidiens (relances, sauvegardes).
7. Test de charge / pagination des gros écrans.
8. Gestion des clés Twilio (WhatsApp/SMS) ou décision assumée de ne vendre que l'in-app + e-mail.
9. Analytics produit minimal (inscription → première commande → première réception) pour piloter l'essai.

### 🟢 AMÉLIORATIONS
10. Nettoyage des 45 motifs React préexistants (règles `react-hooks` v7).
11. Photos produits : 229/324 (95 restantes).
12. 2FA propriétaire, écran de sessions actives.
13. Reformulation du « +297 % » quand l'historique est mince (défaut d'UX repéré aujourd'hui).

---

## 12. Score de maturité (13 domaines)

| Domaine | Note | Justification (preuves) |
|---|---|---|
| Produit | 🟢 | Tous les modules de la vision existent et fonctionnent ensemble ; aucun module « vitrine » vide. |
| Fonctionnalités | 🟢 | 244 endpoints, 64 écrans, parcours complets ; seules les briques réseau (API fournisseur, groupés à l'échelle) manquent. |
| UX/UI | 🟡 | Cohérent, guidé, erreurs rattrapables ; mais **jamais testé par un vrai restaurateur**, densité à réduire sur mobile. |
| Technique | 🟢 | Types stricts, CI, 449 tests, 507 vérifications, migrations prouvées, base neuve rejouable. |
| Sécurité | 🟡 | Cookie HttpOnly, rate limit, CORS, rôles, isolation testée ; **manquent 2FA, audit externe, hors site**. |
| IA | 🟢 | Connectée aux données, explicable, 15 intentions, LLM optionnel. Seul manque : l'apprentissage des écarts. |
| Données | 🟢 | 48 tables, cloisonnement par restaurant, intégrité et plafonds, 28 migrations cohérentes. |
| Approvisionnement | 🟢 | Stock → prévision → panier → commande → réception → écarts : la chaîne entière, testée. |
| Gestion fournisseurs | 🟡 | Fiches, prix, fiabilité, portail fournisseur complets ; **pas de connexion directe aux systèmes fournisseurs**. |
| Analyse | 🟢 | Coûts, dérives, effet prix vs volume, marges dans le temps, tout sourcé sur les achats réels. |
| Performance | 🟡 | Correct à l'échelle de la démonstration ; **non mesuré** sous charge, pagination incomplète. |
| Business | 🟡 | Offres honnêtes et testées, kit commercial prêt ; **0 client payant, prix non validé**, pas d'analytics. |
| Préparation lancement | 🟡 | Bloquants identifiés et documentés ; il reste les clés, le hors site, la recette terrain, le push. |

**Pas de note globale unique**, à dessein : un produit peut être 🟢 en ingénierie et 🟡 en marché, et c'est
exactement notre cas.

---

## 13. Rapport final

**a) Ce qui est terminé.** Compte et sécurité de base · stock et seuils · fournisseurs, prix, fiabilité ·
comparateur multi-critères avec coût total · prévision explicable (4 sources, fermetures, saisonnalité,
événements) · panier intelligent et auto-reorder · commandes, tournées, récurrentes · réception atomique,
écarts, litiges · analyse des coûts et marges · assistant connecté aux données · notifications in-app et
e-mail · sauvegardes avec essai de restauration · supervision · vitrine, tarifs, CGV, mentions légales ·
CI et vérifications automatisées.

**b) Ce qui fonctionne réellement** (vérifié par exécution aujourd'hui) : 449 tests, 507 vérifications
bout-en-bout, base neuve migrée 0000→0027 + seed, `drizzle-kit generate` sans dérive, assistant répondant
sur données réelles, 6 scénarios métier rejoués, 6 fusions d'historiques sans écraser le travail distant.

**c) Ce qui est simulé** : rien d'autre que ce qui dépend d'une clé absente — Stripe, Resend, Twilio, LLM —
et dans les quatre cas l'application **avoue** au lieu de simuler.

**d) Ce qui est incomplet** : paiement en ligne non branché · e-mail hors ligne (clé) · WhatsApp/SMS ·
copie hors site · prévision apprenante · API fournisseur · export comptable (assumé absent) ·
95 photos produits · 2FA.

**e) Ce qui manque** : la clientèle. Aucun restaurant réel n'a utilisé le produit ; le protocole de recette
terrain existe mais n'a pas été joué. Tant que ce n'est pas fait, tout le reste est une hypothèse bien
étayée.

**f) Bugs connus** : aucun bug bloquant ouvert (les 4 bugs d'intégrité du premier audit sont corrigés et
prouvés). Défaut d'UX : le « +297 % » sur historique mince. Dette : 45 motifs React, champ `seasonality`
non structuré.

**g) UX** : bonne base, cohérence réelle, erreurs rattrapables ; à éprouver avec de vrais utilisateurs et à
alléger sur mobile.

**h) Technique** : solide et prouvable ; le point faible est la performance non mesurée et l'absence de verrou
multi-instance.

**i) Sécurité** : très correcte pour le stade ; les deux vrais sujets sont **hors site** et **audit externe**.

**j) Métier** : le produit résout un vrai problème et le prouve dans l'app ; la démonstration commerciale
tient en 10 minutes pour Starter, 3 semaines de données pour Pro.

**k) Risques de lancement** : (1) encaisser sans clés → impossible ; (2) perdre des données faute de copie
hors site ; (3) livrer une promesse d'e-mail/WhatsApp non configurée (atténué : l'app le dit) ;
(4) lancer sans aucun retour client réel.

**l) Indispensable avant lancement** : clés Stripe + e-mail, sauvegarde hors site, recette terrain
3 restaurateurs, déblocage du push, verrou des jobs.

**m) V2** : multi-établissements self-service, factures fournisseurs automatiques, API fournisseur ou import
structuré, analytics produit, 2FA, offline réel en saisie, WhatsApp à l'échelle.

**n) V3** : prévision apprenante, achats groupés à l'échelle (réseau), données de marché (prix moyens par
ville), connecteurs EDI/API fournisseurs, application mobile native.

---

## 14. Plan d'action en chantiers (priorisé)

Format demandé : **Nom / Problème / Pourquoi prioritaire / Fichiers-modules / Actions / Résultat attendu /
Critères de validation**.

### Vague A — pour pouvoir lancer (séquentiel)

**Chantier 13 — Encaissement réel et facturation légale**
*Problème* : le paiement en ligne est écrit mais sans clés ; les factures d'abonnement ne partent à personne.
*Priorité* : sans cela, aucun euro n'entre et l'offre « 89 €/mois » reste théorique.
*Fichiers* : `apps/api/src/lib/billing.ts`, `apps/api/src/lib/pdf.ts`, `apps/api/src/routes/billing.ts`,
`apps/web/src/pages/Billing.tsx`, `.env.example`, `docs/DEPLOIEMENT.md`.
*Actions* : compte Stripe + 3 prix + webhook de production ; mentions légales réelles (SIRET/TVA) ;
  environnement de test → 1 paiement réel de bout en bout puis remboursement ; facture PDF envoyée
  automatiquement à l'activation ; alerte si un webhook échoue.
*Résultat attendu* : un client peut souscrire seul, payer, recevoir sa facture.
*Validation* : paiement réel encaissé + facture PDF conforme + webhook rejoué + 402/503 honnêtes sans clés.

**Chantier 14 — Exploitation de production**
*Problème* : sauvegarde sans copie hors site ; jobs quotidiens sans verrou multi-instance ; aucune mesure de
charge.
*Priorité* : c'est le risque « perte totale de données », inacceptable dès le premier client payant.
*Fichiers* : `apps/api/src/lib/backup.ts`, `jobs/daily.ts`, `lib/ops.ts`, `scripts/verifications/chantier12_verif.py`.
*Actions* : export chiffré vers un stockage objet (S3/R2/Backblaze) + test de restauration depuis cette copie ;
  verrou d'exécution en base ; test de charge sur les 5 écrans les plus lourds ; pagination des listes.
*Résultat attendu* : les données survivent à la perte de l'hébergeur ; deux instances ne se marchent plus dessus.
*Validation* : restauration réussie depuis la copie hors site ; deux instances simultanées = une seule passe ;
  1 000 commandes / 5 000 lignes de stock sans dégradation.

**Chantier 15 — Sécurité et conformité**
*Problème* : pas de 2FA, aucune revue externe, rétention RGPD non outillée.
*Priorité* : la confiance est la monnaie du B2B ; et le RGPD est une obligation, pas un argument.
*Fichiers* : `apps/api/src/routes/account.ts`, `lib/auth.ts`, nouvel écran sessions, `docs/` (registre, DPA).
*Actions* : TOTP propriétaire ; écran « sessions/appareils » ; effacement automatique après inactivité ;
  sous-traitants et durées de conservation documentés ; test d'intrusion externe.
*Validation* : connexion à deux facteurs obligatoire pour le propriétaire ; rapport de test d'intrusion
  reçu et ses constats corrigés ou acceptés par écrit.

### Vague B — pour vendre plus vite

**Chantier 16 — Multi-établissements à la demande** : seuls les groupes en ont besoin, mais l'offre Business
les vise. *Validation* : un compte crée un 2ᵉ établissement, les données restent cloisonnées, la facturation
suit.

**Chantier 17 — Factures fournisseurs et rapprochement** : saisir la facture reçue, la rapprocher de la
commande, expliquer l'écart. *Validation* : écart de facture détecté et justifié sur un cas réel.

**Chantier 18 — Acquisition mesurée** : analytics produit (inscription → 1ʳᵉ commande → 1ʳᵉ réception),
page « essai accompagné », 2 témoignages réels après les pilotes. *Validation* : entonnoir visible et
taux de passage calculé sur 20 essais.

### Vague C — pour durer

**Chantier 19 — Mobilité réelle** : saisie hors réseau (file d'attente locale), dictée déjà présente,
WhatsApp à l'échelle (avec les clés).
**Chantier 20 — Performance et données de marché** : pagination généralisée, index manquants, prix moyens
par ville.
**Chantier 21 — Prévision apprenante** : pondération des sources selon les écarts constatés,
auto-évaluation mensuelle de la précision.

---

## Annexe — Preuves d'exécution (22 septembre 2026)

| Contrôle | Résultat |
|---|---|
| `drizzle-kit generate` | « **No schema changes, nothing to migrate** » |
| Base **neuve** migrée 0000→0027 + seed | **28 migrations**, **48 tables**, démo créée (`awa@chezawa.fr`) |
| `tsc --noEmit` API / web | **0 erreur** |
| `npm run lint` | **0 erreur** (règle `no-explicit-any` active) |
| Tests | **449 verts** — base 5 · API 372 · web 72 |
| Vérifications bout-en-bout (`scripts/verifications/toutes.sh`) | **507 vérifications · 12/12 scripts** |
| Scénarios métier | 49/49 (S1→S6 + cross-tenant + 4 bugs d'intégrité rejoués) |
| Assistant interrogé en direct | réponses **chiffrées sur les données réelles** (fournisseurs, prix, ruptures) |
| Fusions d'historiques | **6 vagues** intégrées sans jamais écraser le distant |
| Réinitialisations de l'environnement | **5** (incident d'outillage, sans effet sur le produit) |

**Ce que cet audit ne peut pas prouver** : le comportement avec des clés de paiement réelles, le
comportement sous 50 restaurants simultanés, et — le plus important — **ce qu'un restaurateur en pense**.
