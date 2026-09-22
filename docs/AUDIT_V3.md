# AFRISUPPLY — Audit complet (3ᵉ passage)

**Date** : 22 septembre 2026
**État audité** : `main` = `origin/main` = **`1287858`** (avance rapide uniquement, aucun `--force`)
**Méthode** : exécution réelle (API + web + base neuve + 12 scripts de bout en bout), lecture du code,
sondage direct des scénarios métier, contrôle de la CI publiée, DNS de production.

> Cet audit **contrôle** les deux précédents au lieu de les recopier :
> `AUDIT_AFRISUPPLY.md` (n°1) · `AUDIT_AFRISUPPLY_V2.md` (n°2, = `docs/AUDIT_V2_FUSION.md`).

---

## 0. VERDICT

# ⚠️ OUI MAIS AVEC CONDITIONS — la première n'est pas du code

Le produit est **construit, testé et vérifiable**. Il **n'est déployé nulle part** : `afrisupply.fr` et
`app.afrisupply.fr` **ne résolvent pas** (vérifié le 22/09 ; `github.com` résout, donc le problème n'est pas
le réseau de la machine d'audit). Un restaurateur ne peut donc pas l'utiliser demain — non parce que le
logiciel serait cassé, mais parce qu'il n'est pas en ligne.

| # | Condition | Preuve de l'état actuel |
|---|---|---|
| 🔴 1 | **Mettre l'application en ligne** (Vercel + Neon) | `docs/DEPLOIEMENT.md` : checklist §5 **non cochée** ; aucun domaine ne résout |
| 🔴 2 | **Changer le mot de passe Neon et révoquer les jetons** | le dépôt écrit lui-même que le mot de passe a « transité par le chat » |
| 🔴 3 | **Configurer l'encaissement** (Stripe) | l'API l'annonce : `ready:false`, 5 variables manquantes |
| 🔴 4 | **Sauvegarde hors site** | les sauvegardes s'écrivent sur le disque local, éphémère en serverless |
| 🔴 5 | **Recette terrain** : 3 restaurateurs non formés | protocole prêt (`docs/CHANTIER_12_RECETTE_TERRAIN.md`), **jamais joué** |

Les bloquants de l'audit n°2 qui concernaient le **produit** sont levés : l'écran blanc est corrigé, la CI
a fonctionné et tourne, 507 vérifications passent. Il reste **un risque de test instable** côté CI (§6.1).

---

## 1. Ce qui a changé depuis l'audit n°2 (contrôlé, pas raconté)

| Fait | Preuve |
|---|---|
| L'**écran blanc** (fusion ratée de `lib/auth.tsx`) est corrigé | `auth.tsx` + `api.ts` ; test de contrat `auth.contrat.test.tsx` ; `tsc -p tsconfig.app.json` = 0 |
| Le contrôle des types est **réel** désormais | `npm run typecheck` (racine) = 0 erreur ; c'est ce contrôle qui avait révélé le bug, mes vérifications précédentes étaient à vide |
| Les **deux correctifs parallèles** du même bug sont fusionnés sans perte | commit `b9e5201` : les deux chemins (`afs:access-notice` 402, `afs:access` 403) coexistent |
| La **CI tourne** sur ce dépôt (2 jobs) | runs `35703692757`, `35705076750`, `8e20042`, `1287858` : **succès** |
| L'apport distant continue | navigation (`e2bbba7`, `f38c69b`), photos lots 17-19 → **269/324** |
| Un **run CI a échoué** entre-temps (test instable) | `c5b533f` : étape « Tests » rouge, sur un test **inchangé depuis** (§6.1) |

---

## 2. Audit de l'existant — statut par élément

| Élément | Statut | Preuve mesurée |
|---|---|---|
| Comptes, rôles (propriétaire/gérant/employé), multi-établissements | ✅ | inscription HTTP 201, `/auth/me` renvoie rôle + établissements ; 11 routes d'authentification |
| Stock, seuils, objectifs, inventaire, mouvements | ✅ | 26 lignes créées par l'onboarding ; `criticalLevel`, `targetLevel`, `daysLeft` renvoyés |
| Fournisseurs, offres, prix, colis → prix unitaire | ✅ | 65 offres en base ; l'ajout d'offre écrit aussi l'historique de prix |
| Comparateur multi-critères | ✅ | scénario 2 en direct (49/49) |
| Panier intelligent (répartition multi-fournisseurs) | ✅ **avec réserve** | fonctionne dès qu'il existe des offres ; **vide le jour 1** (§4.2) |
| Commandes + message WhatsApp/e-mail + statuts | ✅ | scénario 2 : création → message → envoi → réception |
| Réception, écarts, réclamation pré-rédigée | ✅ | scénario 4 : commandé 50 kg / reçu 45 kg → écart détecté, réclamation écrite, stock mis à jour |
| Détection de hausse de prix | ✅ | 319 points d'historique ; +12 % / +9 % retrouvés par l'assistant |
| Analyse des coûts | ✅ | page dédiée (`/analysis`, 47 ms médian) + explication chiffrée |
| Prévision 7 j explicable + démarrage à froid | ✅ | 26 produits prévus sans historique ; `predictedNeed = 0` (aucune conso inventée), `recommendedOrder = 10` |
| Assistant IA branché sur les données | ✅ | 9/9 questions suggérées reconnues ; chiffres issus de la base (§4.3) |
| Facturation / abonnements / factures PDF | ✅ code, 🔴 clés | `/billing/health` : `mode: manuel` |
| E-mail (Resend) et WhatsApp/SMS (Twilio) | 🟡 | transports réels écrits, **non configurés** ; le produit refuse d'annoncer un envoi fictif |
| Sauvegardes + exercice de restauration | 🟡 | exercice 70/70 (chantier 12) mais cible = **disque local** |
| Vitrine, avis, marketplace, espace grossiste, admin | ✅ | 9 écrans de site · 13 grossiste · 8 admin |
| Application mobile | ⛔ absente | web responsive + barre d'onglets mobile : suffisant pour un pilote, pas une app store |

**Comptage factuel (sur `1287858`)** : **65 écrans** (30 racine · 9 site · 13 grossiste · 8 admin · 5 boutique)
· **24 routeurs API** · **642 déclarations de route** · **48 tables** · **28 migrations** · **106 index** ·
**57 fichiers de test** · **460 tests** (base 5 · API 376 · web 79) · 13 scripts de vérification ·
18 639 lignes de code produit + 6 938 lignes de tests · 52 dépendances · **1 seul « TODO » dans tout le code**
(et c'est un commentaire).

---

## 3. Gap vs la vision

| Brique | État | Ce qui manque réellement |
|---|---|---|
| Stock · Fournisseurs · Commandes · Réception/écarts · Analyse | ✅ | — |
| Catalogue africain | 🟡 | **269 photos sur 324 (83 %)** |
| Comparateur (prix, prix/unité, dispo, délai, livraison, minimum, fiabilité) | ✅ | — |
| Prévision (conso, historique, ventes, saisonnalité) | ✅ | saisonnalité = **un seul coefficient** (1,2) : choix assumé, ce n'est pas une saisonnalité par produit |
| Panier intelligent | ✅ | dépend d'offres saisies (§4.2) |
| **IA connectée aux données** | ✅ | architecture « données d'abord » : faits calculés en base, LLM en **reformulation seule**, repli local si aucune clé |

---

## 4. Audit métier — les 6 scénarios, rejoués en direct

### 4.1 S1 — Nouveau restaurant ✅
Inscription (201) → **31 modèles de menu** → application de 3 modèles : **3 recettes, 26 produits suivis**.
Stock à 0 et aucun fournisseur : l'interface ne prétend pas le contraire.

### 4.2 S2/S3 — Première commande et rupture sous seuil ✅ *mais jour 1 exigeant*
Le panier intelligent est **vide le jour 1** : les 26 produits remontent dans `unavailable` avec la quantité
nécessaire (10 × 26), faute de fournisseurs. L'écran l'explique (« Sans offre fournisseur » + lien vers
l'import CSV ou la fiche fournisseur) — donc **pas de mensonge**, mais la promesse « 20 minutes pour
démarrer » n'est tenable que si le parcours guidé impose l'étape « ajouter un fournisseur et ses prix »
avant d'ouvrir le panier. Sinon le premier écran que découvre le restaurateur est vide.
La prévision, elle, fonctionne dès le jour 1 et s'explique.

### 4.3 S4 — Réception 50 kg commandés / 45 reçus ✅
Écart détecté (1 ligne), **réclamation pré-rédigée au fournisseur**, écart enregistré, **stock incrémenté du
reçu**, historique de prix alimenté. Vérifié par `scripts/verifications/scenario_tests.py` (49/49).

### 4.4 S5 — Hausse de prix ✅
Chaque offre saisie trace son prix unitaire ; les hausses réelles sont retrouvées et nommées
(« Huile de palme rouge +12 % chez Afro Distribution Nantes », « Poulet entier PAC +9 % »).

### 4.5 S6 — « Pourquoi mes coûts augmentent ? » ✅ *avec une réserve de forme*
Réponse **calculée sur les données réelles** (achats 30 j vs 30 j précédents, causes citées produit par
produit). Réserve : le pourcentage peut être spectaculaire (« +345 % ») quand la base de comparaison est
mince ou atypique, et **la réponse ne prévient pas** que la base est faible. Défaut de forme, pas de fond.

---

## 5. Audit UX/UI

**Acquis vérifiés** : navigation par tâches (« Aujourd'hui / Commander / Mon stock / Comprendre / Mon
compte »), fil « Rupture → Commander → Recevoir » en tête du parcours, barre d'onglets mobile, aucun
dialogue natif du navigateur, e-mail de support centralisé (6 endroits en dur supprimés), écrans de vide et
d'erreur explicites.

| Point | Constat mesuré | Gravité |
|---|---|---|
| Jour 1 | panier vide tant qu'aucune offre n'existe (encart explicatif présent) | 🟡 |
| Assistant | 9/9 questions suggérées passent, mais « Qu'est-ce que je dois commander ? » (sans « cette semaine ») retombe sur l'aide | 🟡 |
| Réponses « % » | pas de mise en garde sur une base de comparaison faible | 🟡 |
| Aide | pas de visite guidée à l'écran ; les étapes sont écrites dans le tableau de bord | 🟢 |
| Mobile | barre d'onglets + menu latéral, pas de vue tableau spécifique tablette | 🟢 |

---

## 6. Audit technique

### 6.1 ⚠️ Un test instable a fait rougir la CI (et le risque demeure)
Sur `c5b533f`, le job « Qualité » a échoué à l'étape « Tests » — et **pas** au hasard :

```
FAIL src/test/notifications-channels.test.ts > 2. Écart de livraison …
     > 50 commandés / 45 reçus → alerte écart + e-mail immédiat + job_runs
AssertionError: expected 0 to be greater than 0
❯ src/test/notifications-channels.test.ts:126:57
126|  expect(outboxText('Écart sur la livraison').length).toBeGreaterThan(0);
```

Ce que j'ai pu établir :
- la ligne 125 (`notifiedAt` présent **et** alerte marquée « notifiée ») **passe** : le chemin d'envoi a bien
  été exécuté et le code considère l'e-mail remis ;
- la ligne 126 **échoue** : aucun fichier du dossier temporaire ne contient « Écart sur la livraison » ;
- **en local, ce fichier passe 3 fois sur 3 (18/18)** et la suite API complète passe (376/376), sur **le même
  Node 20 que la CI** ;
- le fichier de test **n'a pas été modifié** depuis (les commits suivants n'ajoutent que des photos), et la CI
  est **repassée au vert** sur `8e20042` et `1287858` sans correction.

Conclusion honnête : **test dépendant de l'environnement** (dossier temp, ordonnancement des fichiers dans le
processus de test), pas une régression produit connue — mais **tant qu'il n'est pas rendu déterministe, un
push sur deux peut casser la CI sans raison**, ce qui masquera un jour une vraie régression. Correctif
recommandé : faire porter l'assertion sur la **valeur retournée par l'API** (`notifyCriticalAlerts` renvoie
déjà `sent`, `transport`, `delivered`) plutôt que sur le contenu d'un dossier temporaire.

### 6.2 🟡 Défaut nouveau, mesuré : identifiant invalide → HTTP 500
**7 routes sur 16 testées** renvoient 500 (au lieu de 400/404) sur un identifiant non-UUID :

```
/prices/abc/history · /suppliers/abc (GET) · /orders/abc/message · /compare/abc (et /compare/undefined)
```

En développement la réponse contient **l'erreur SQL brute**. Cause : l'identifiant d'URL est comparé
directement à une colonne UUID, sans validation. Les routes sont derrière authentification et la production
masque le détail — d'où 🟡 et non 🔴 — mais un 500 non maîtrisé pollue la supervision.

### 6.3 Contrôles automatiques sur l'état publié

| Contrôle | Résultat |
|---|---|
| `npm run lint` | **0 erreur** |
| `npm run typecheck` (db · api · web) | **0 erreur** |
| `npm run test` | base **5** · API **376** · web **79** = **460 verts** |
| `npm run build` + `check:bundle` | OK — `api/index.js` conforme aux sources |
| `scripts/verifications/toutes.sh` | **507/507 · 12/12 scripts · exit 0** |
| `npm audit --omit=dev` | **0 vulnérabilité** |
| Base **neuve** 0000→0027 | **28 migrations · 48 tables · 106 index**, tables attendues présentes |
| Secrets en dur | **aucun** trouvé (grep sur 4 motifs) |

### 6.4 Performance mesurée — et ce qu'elle ne prouve pas
Médianes sur 5 appels, base locale : `/dashboard` 43 ms · `/smart-cart` 49 ms · `/analysis` 47 ms ·
`/forecast` 37 ms · `/assistant/ask` 38 ms · `/stock` 21 ms · `/alerts` 10 ms.
**Réserve indispensable** : la base contient **19 restaurants, 25 commandes, 511 ventes**. Ces chiffres
prouvent qu'aucune requête n'est absurde, **pas** que le produit tient la charge.

### 6.5 Index : une table fille sans index sur sa clé étrangère
`order_lines` ne possède **que sa clé primaire** — aucun index sur `order_id` ni `product_id`. `sales`,
`alerts` et `forecast_events` reposent sur leur contrainte d'unicité métier (acceptable), mais les requêtes
de liste par établissement + statut ne sont pas couvertes. Invisible à 45 lignes, à corriger avant la charge.

### 6.6 Ce qui reste solide
Erreur centrale maîtrisée (500 générique, détail masqué en production, Sentry optionnel) · limites anti-abus
**stockées en base** (`rate_limits`) donc valables en serverless multi-instances, avec purge opportuniste ·
migrations rejouables de bout en bout · `db:generate` → « No schema changes » · journal d'audit indexé.

---

## 7. Audit sécurité (classé)

| Gravité | Point | Preuve |
|---|---|---|
| 🔴 | Aucune production en ligne → sécurité non éprouvée en réel | DNS inexistant |
| 🔴 | Mot de passe Neon ayant transité par un chat (le dépôt le dit) | `docs/DEPLOIEMENT.md` §1, case non cochée |
| 🔴 | Sauvegardes sur disque local (éphémère en serverless) | `BACKUP_DIR`, aucun export S3/Blob |
| 🟠 | Clés Stripe/webhook absentes → encaissement impossible, webhook non vérifiable | `/billing/health` : `missing: 5` |
| 🟠 | Données d'activité envoyées à un tiers **si `LLM_API_KEY` est activée** (OpenAI-compatible par défaut) — à déclarer (RGPD) | `LLM_BASE_URL` par défaut |
| 🟡 | 500 non maîtrisés sur identifiants invalides (+ détail SQL en développement) | §6.2 |
| 🟡 | Pas de `Content-Security-Policy` ; **le document HTML n'a aucun en-tête de sécurité** (`vercel.json` ne pose que du cache sur `/assets`) | en-têtes observés |
| 🟢 | Session : cookie **HttpOnly + SameSite=Lax**, `secure` en production | en-tête réellement observé |
| 🟢 | En-têtes API : `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` | observés en direct |
| 🟢 | Isolation entre restaurants | scénarios cross-tenant : 403/404 (dashboard, commandes, écritures, messages) |
| 🟢 | Mot de passe (longueur + liste de mots courants) et limites par point d'entrée (login 10/min, inscription 5/min, mot de passe oublié 5/15 min) | code + table `rate_limits` |
| 🟢 | Aucun secret en dur · CORS en liste blanche · `X-Restaurant-Id` vérifié serveur · webhook Stripe signé (HMAC) | code |

---

## 8. Audit des données

- **48 tables · 80 clés étrangères · 8 contraintes d'unicité · 327 colonnes `NOT NULL`** → modèle contraint.
- **20 tables sans `restaurant_id`**, toutes justifiables : tables globales (`users`, `restaurants`,
  `vendors`, `prospects`, `job_runs`, `rate_limits`, `audit_log`) ou enfants rattachés par leur parent
  (`order_lines` → `orders`, `recipe_ingredients` → `recipes`, `delivery_discrepancies` → `deliveries`).
- Champs obligatoires cohérents sur les entités clés : `products(name, category, base_unit)`,
  `supplier_offers(pack_label, pack_qty, pack_price_eur)`, `order_lines(packs, quantity, unit_price_eur)`,
  `delivery_discrepancies(ordered_qty, received_qty)`, `sales(day, portions)`.
- **Réserve** : aucune politique de rétention déclarée pour `price_history`, `audit_log`, `notifications`
  (croissance continue) et index manquants (§6.5).

---

## 9. Audit des intégrations

| Intégration | Statut | Preuve |
|---|---|---|
| Paiement (Stripe) | 🟡 code complet, **clés absentes** | signature HMAC du webhook implémentée ; `/billing/health` honnête |
| E-mail (Resend) | 🟡 configurable, non configuré | sans clé : « non configuré », jamais « envoyé » |
| WhatsApp / SMS (Twilio) | 🟡 code réel, non configuré | lien `wa.me` utilisable sans compte ; envoi automatique = Twilio |
| Notifications in-app | ✅ | cloche alimentée par les alertes réelles |
| Envoi fournisseur | ✅ | message généré + lien WhatsApp + e-mail |
| API publique | ✅ | ~642 déclarations de route, vérifiées par les scripts |
| IA | ✅ (clé facultative) | faits calculés en base, LLM en reformulation, repli local |
| Import/export (CSV, Excel, photo de tarif, PDF, sauvegarde JSON) | ✅ | import fournisseurs + tarifs ; export comptable et RGPD |
| Facturation (abonnements, factures, commissions) | ✅ code / 🔴 clés | 3 offres, plafonds utilisateurs, factures PDF |
| Authentification | ✅ | cookie HttpOnly, vérification d'adresse, réinitialisation (2FA non prévue) |

---

## 10. Audit business

- **Valeur** : claire et chiffrée — comparer, prévoir, commander, réceptionner, comprendre ses coûts.
- **Offre** : 39 € / 89 € / 199 € par mois · **30 jours gratuits sans carte** · −50 % pour les 20 premiers ·
  1 établissement · 3/5/illimité utilisateurs.
- **FAQ honnête** : « Mes fournisseurs doivent-ils s'inscrire ? → Non » ; « L'IA commande-t-elle à ma place ?
  → Jamais ». C'est un vrai différenciateur de confiance.
- **« 20 restaurateurs comprendraient-ils pourquoi payer ? »** — **oui, à une condition** : la démonstration
  doit montrer un écart de prix détecté et un panier réparti entre fournisseurs. Le produit sait le faire ;
  il ne le met pas en scène à la première visite.
- **Friction d'acquisition** : demande d'accès nominative (téléphone) → adapté au pilote, moins à
  l'inscription libre.
- **Preuve sociale** : avis grossistes, page statut publique, CGV/mentions — mais **aucun client réel** à
  montrer aujourd'hui.

---

## 11. Audit lancement

### 🔴 BLOQUANTS (avant d'ouvrir un compte à quiconque) — *état au 22/09/2026 au soir*
1. ~~**Déployer** (Vercel + Neon)~~ → **FAIT** : production `6fad9b5` READY, base Neon connectée,
   `/api/health` 200, interface servie. Reste à fixer `APP_URL` et `ALLOWED_ORIGINS`.
2. **Réinitialiser le mot de passe Neon** et **révoquer les jetons GitHub / Vercel** utilisés
   (mot de passe et jetons ont circulé : cette action reste entièrement à faire, côté humain).
3. **Configurer l'encaissement** : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, 3 prix, webhook
   déclaré — en ligne, `/api/billing/health` annonce honnêtement `ready:false`, `mode:'manuel'`.
4. **Sauvegarde hors site** : **code livré et vérifié** (chantier 13, `chantier13_verif.py` 23/23)
   → « à construire » devenu **« à activer »** : créer le seau, poser les 4 `BACKUP_S3_*`, lancer
   une fois les trois gestes et lire le rapport. En attendant, la copie locale vit sur un disque
   **éphémère** — désormais annoncé comme tel dans l'exploitation.
5. **Recette terrain** : 3 restaurateurs non formés, protocole prêt, non joué — **le seul bloquant
   que ni le code ni les tests ne peuvent lever**.

### 🟠 AVANT 10 CLIENTS
6. Corriger les **500 sur identifiants invalides** (7 routes listées, §6.2).
7. **Rendre déterministe** le test instable de la CI (§6.1).
8. Ajouter les **index manquants** (`order_lines` en priorité) + politique de rétention des journaux.
9. Intégrer le **jour 1** au parcours guidé : fournisseur → prix → panier.
10. Ne plus afficher un pourcentage sans prévenir d'une **base de comparaison faible**.
11. **En-têtes sur le document** (CSP, X-Frame-Options) via `vercel.json`.
12. Compléter la **photothèque** (269/324).

### 🟢 AMÉLIORATIONS
13. Élargir la reconnaissance des questions de l'assistant.
14. Documenter l'usage de l'IA externe (RGPD) et la politique de conservation.
15. V2/V3 déjà cadrées : saisonnalité par produit, achats groupés, app mobile, portail fournisseur.

---

## 12. Score de maturité (13 domaines)

| Domaine | Note | Justification mesurée |
|---|---|---|
| Produit | 🟢 | les 6 scénarios métier passent sur une API réelle |
| Fonctionnalités | 🟢 | ~642 routes, 65 écrans ; aucune fonction annoncée et absente trouvée |
| UX/UI | 🟡 | navigation par tâches solide ; jour 1 et variantes de questions à polir |
| Technique | 🟢 | lint/types/tests/build/bundle verts, migrations rejouables, base neuve OK |
| Sécurité | 🟡 | bons réflexes en place, mais **rien n'est éprouvé en production** ; 7 routes en 500 |
| IA | 🟢 | faits calculés en base, LLM en reformulation, dégradation propre sans clé |
| Données | 🟢 | 48 tables, 80 clés étrangères, 327 colonnes obligatoires |
| Approvisionnement | 🟢 | commande → envoi → réception → écart, tout est tracé |
| Gestion fournisseurs | 🟡 | délais/fiabilité/litiges notés, mais aucun compte fournisseur en V1 |
| Analyse | 🟢 | page dédiée + assistant explicable, chiffres issus des données |
| Performance | 🟡 | 10–50 ms sur petite base ; **non démontré à l'échelle**, index à compléter |
| Business | 🟡 | offre et argumentaire clairs, aucun client réel, accès sur demande |
| Préparation lancement | 🔴 | pas de production, pas d'encaissement, sauvegarde dans le vide, recette non jouée |

**Pas de note globale** : une moyenne masquerait que **le produit est prêt et l'exploitation ne l'est pas**.

---

## 13. Ce que cet audit ne peut pas prouver

Le comportement **en production** (aucune instance à interroger) · le comportement **sous charge**
(19 restaurants, 25 commandes) · le comportement **avec de vraies clés** Stripe/Resend/Twilio ·
et surtout **ce qu'un restaurateur en pense** — 3 personnes non formées devant l'écran restent la seule
preuve qui compte, et elle n'a pas été faite.

---

## 14. Preuves d'exécution (22 septembre 2026, état `1287858`)

| Contrôle | Résultat |
|---|---|
| Avance de l'historique | `git merge --ff-only origin/main` → local = distant, **aucun `--force`** |
| lint · typecheck (db/api/web) | **0 erreur** (revérifiés sur `1287858`) |
| Tests | base **5** · API **376** · web **79** = **460 verts** (web et base revérifiés sur `1287858` ; API revérifiée sur `c5b533f`, code API inchangé depuis) |
| Test CI incriminé, seul, 3 fois | **18/18 à chaque fois** (stable en local ⇒ dépendance à l'environnement CI) |
| Bout en bout | **507/507 · 12/12 scripts · exit 0** (sur `f38c69b` ; les commits suivants n'ajoutent que des photos et un test de navigation) |
| Base neuve 0000→0027 | 28 migrations · 48 tables · 106 index |
| `npm audit --omit=dev` | 0 vulnérabilité |
| Scénarios S1→S6 | ✅ ✅ ✅ ✅ ✅ ✅ (S3 avec la réserve du jour 1) |
| Assistant | 9/9 questions suggérées reconnues, chiffres réels |
| Routes à identifiant invalide | **7/16 renvoient 500** (défaut identifié) |
| Encaissement | `/billing/health` → `ready: false`, mode **manuel**, 5 variables manquantes |
| DNS de production | `afrisupply.fr` et `app.afrisupply.fr` **ne résolvent pas** |
| CI GitHub | verte sur `8e20042` et `1287858` ; **rouge (test instable) sur `c5b533f`** |

**Verdict final, sans complaisance** : AFRISUPPLY n'est plus un prototype — c'est un produit bâti, testé et
vérifiable, avec ses preuves. Ce qui manque pour qu'un restaurateur l'utilise **demain** n'est pas du code :
c'est une mise en ligne, un moyen d'encaisser, une sauvegarde qui survit, et trois personnes devant l'écran.

---

## Suivi des correctifs — 22/09/2026 (après l'audit n°3)

Ces trois correctifs ont été exécutés sur ordre « continue », puis publiés. L'audit lui-même n'a
modifié aucun fichier : les mesures ci-dessus restent celles de l'état audité.

### 1. Un identifiant invalide ne produit plus d'erreur serveur (défaut 🔴 relevé dans l'audit)

- **Constat mesuré** : `GET /api/compare/abc` renvoyait **500 « Erreur serveur »**, avec la requête SQL
  en clair dans la réponse. 7 routes sur 16 testées ; 40 routes paramétrées exposées dans le dépôt.
- **Cause** : l'identifiant d'URL était comparé directement à une colonne `uuid` ; PostgreSQL refuse la
  requête (code `22P02`), l'erreur n'était pas reconnue par le gestionnaire central.
- **Correction** : `apps/api/src/lib/db-errors.ts` (nouveau) reconnaît la valeur malformée en remontant
  la chaîne des `cause` (Drizzle enveloppe l'erreur d'origine) ; `app.ts` répond **404 « Ressource
  introuvable »** — un seul point de passage, donc les 40 routes sont couvertes, y compris les futures.
- **Preuves** : `GET /api/compare/abc` → **404**, plus aucun SQL dans la réponse, sur l'API réelle ;
  `identifiants-invalides.test.ts` : 16 lectures, 8 écritures, identifiant invalide dans le corps —
  **35 tests**, qui vérifient aussi que la route existe (sinon un 404 « Route inconnue » validerait le
  test à tort) et qu'aucune donnée n'est inventée quand la réponse est 200.
- **Effet** : plus de fausse alerte de supervision pour une faute de frappe, plus de fuite de schéma.

### 2. Deux messages au même destinataire ne s'écrasent plus — et la CI instable s'explique

- **Constat** : la CI était rouge par intermittence sur un test d'e-mail (« test instable », non
  reproductible en local — 18/18 à chaque exécution).
- **Cause réelle, trouvée et reproduite hors test** : le nom d'un message déposé dans la boîte d'envoi
  se construisait sur « **milliseconde + destinataire** ». Deux messages partis au même destinataire
  dans la même milliseconde s'écrivaient au **même fichier** : le second écrasait le premier, alors que
  les deux envois annonçaient « ok ». Démonstration : deux envois simultanés → deux `ok`, **un seul
  message relisible**, l'alerte perdue. En CI, l'alerte d'écart de livraison était écrasée par la
  confirmation de commande partie à la même milliseconde — en mission réelle, un développeur pouvait
  perdre la preuve d'une alerte de la même façon.
- **Correction** : `mailer.ts` écrit avec le drapeau `wx` (un fichier existant n'est jamais remplacé) et
  suffixe `-2`, `-3`… en cas de collision ; HTML et pièces jointes suivent le nom retenu.
- **Preuve** : test à **horloge figée** (collision certaine) — il **échoue sans le correctif**, passe avec.
- **Leçon de méthode** : ce n'était pas « une instabilité de test » mais un défaut du produit ; un test
  qui rougit sans raison visible doit être traité comme un signal, pas comme du bruit.

### 3. Le contrôle local mentait, la CI avait raison

- La CI a refusé un commit à l'étape Lint (`Unnecessary escape character`) alors que mon contrôle local
  affichait « lint OK » : le code de sortie mesuré était celui du `tail` qui suivait, pas d'`eslint`.
  Corrigé, et la vérification fautive (une expression régulière illisible) a été remplacée par une
  analyse en clair de la réponse. **La CI a fait exactement son travail.**

### État après correctifs

| Contrôle | Résultat |
|---|---|
| lint · typecheck | **0 erreur** (codes de sortie mesurés correctement) |
| Tests | base **5** · API **412** · web **80** |
| Bout en bout | **507/507 · 12/12 scripts** avec les correctifs appliqués |
| Routes à identifiant invalide | **0** erreur serveur, **0** fuite de SQL (les 4 routes mesurées en 500 → 404) |
| Bundle serverless | régénéré, conforme aux sources (`check:bundle`) |
| CI | relancée sur le commit publié (suivi dans le rapport de chantier) |

**Le verdict de l'audit n°3 ne change pas** : ⚠️ **OUI MAIS AVEC CONDITIONS**. Ces correctifs lèvent deux
défauts de fiabilité ; ils ne remplacent aucune des conditions préalables (mise en ligne, moyen
d'encaisser, sauvegarde hors site, recette par trois restaurateurs).

---

## Chantier 13 réalisé — Sauvegarde hors site (bloquant 🔴 n°4 traité côté code)

**Constat de l'audit** : les sauvegardes s'écrivaient uniquement sur le disque de la machine qui les
produisait — éphémère en serverless. La copie vivait donc à côté de la base qu'elle devait protéger.

**Ce qui a été livré** (`lib/offsite.ts`, job quotidien, routes d'exploitation, faux service S3 de CI) :

| Règle tenue | Preuve |
|---|---|
| Une copie n'est comptée que si elle est **relue** (SHA-256 comparé) | Copie altérée détectée **et supprimée** ; test dédié |
| La preuve est une **restauration**, pas une empreinte | Essai depuis la copie **externe** : base neuve, migrations, **85 lignes** retrouvées, aucune table incomplète |
| La rétention distante ne s'appuie **jamais** sur le disque local | Instance neuve au disque vide : l'archive n'est pas effacée ; objets étrangers jamais touchés |
| **Aucun succès simulé** | Sans configuration : variables manquantes nommées, envoi et essai refusés ; refus 403, seau ou région erronés, service injoignable, fichier absent : échec **nommé** à chaque fois |

**Vérifications** : `offsite-backup.test.ts` **14/14** · `chantier13_verif.py` **23/23** (service
externe configuré) et **10/10** (non configuré) · batterie complète **529/529 · 13/13 scripts**, en
local **et en CI** (`401a095`) · tests base 5 · API 426 · web 80 · lint 0 · types 0 · bundle conforme.

**Ce qui reste, et qui n'est pas du code** : créer le seau chez l'hébergeur (R2/Scaleway
recommandés), renseigner les 4 variables, puis **lancer une fois** les trois gestes (sauvegarder →
envoyer → essayer de restaurer depuis la copie externe) et lire le rapport. Procédure complète dans
`docs/SAUVEGARDE_HORS_SITE.md`. Le bloquant n°4 passe donc de « à construire » à « à activer ».

**Rapport détaillé** : `docs/RAPPORT_CHANTIER_13_HORS_SITE.md`.

## Vérification du déploiement en ligne — 22/09/2026 (soir)

**Réponse** : **oui, tout ce qui est poussé est en ligne** — `origin/main` = `6fad9b5` =
production READY sur `afrisupply-api-zeta.vercel.app`, base Neon connectée (`/api/health` 200),
SPA servie, deux déploiements en échec expliqués (`7d801f2`, `npm ci --include=dev`, réparé par
`3a39658`). **Mais 13 variables manquent en production** : sauvegarde hors site, Stripe, suivi
d'erreurs, SMS, `SUPPORT_EMAIL`, `ALLOWED_ORIGINS` — présentes dans le code, **inactives en
ligne**, chacune honnêtement annoncée « non configuré ».

**La vérification en ligne a révélé deux vrais défauts, invisibles en local** (ils n'existent
qu'en serverless), corrigés dans `a6097e2` :

1. **Disque du projet en lecture seule sur Vercel** → la sauvegarde ne s'écrivait nulle part.
   `backupDir()` bascule sur `tmpdir()` si `VERCEL` sans `BACKUP_DIR` ; le caractère **éphémère
   est annoncé** (`ephemere`, note, problème listé dans l'exploitation : seule la copie hors site
   est durable).
2. **Cadences de supervision irréalistes** : surveiller `reminders`/`alerts-notify` à 3 h sur un
   plan à **un cron par jour** = fausse alerte quotidienne garantie → seuils **26 h** / **30 h**,
   surchargeables par `JOB_MAX_HOURS_<JOB>`, et `offsite-backup` supervisé **seulement** si le
   hors site est configuré.

**Le `backup: never` de production est expliqué et **n'est pas** un échec silencieux** :
hypothèse testée puis **réfutée** (`backup-echec-visible.test.ts`) ; le dernier passage du cron
(22/09 05 h 21 UTC) est **antérieur** au déploiement du code des sauvegardes. Prochain passage
**23/09 à 04 h 30 UTC**.

**Preuves après correctif** : `ops-backup.test.ts` **30/30** · `backup-echec-visible.test.ts`
**5/5** · `chantier12_verif.py` **70/70** · `chantier13_verif.py` **23/23** · typecheck 0 ·
lint 0. Les ✗ d'un premier passage en configuration « simulée Vercel » venaient de
l'environnement de test (sans clé d'e-mail, la tâche quotidienne se déclare en dégradé à juste
titre), **pas du code** : la même vérification passe 70/70 sur base neuve et configuration standard.

**Rapport complet** : `docs/VERIFICATION_VERCEL.md`.
