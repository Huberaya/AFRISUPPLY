# Chantier 9 — Réduire la friction de saisie

**Le risque n°1 d'un outil de stock : personne ne le remplit.** Ce chantier fait en sorte qu'un restaurateur fatigué, à 23 h, sur son téléphone, puisse tenir AFRISUPPLY à jour en moins de 30 secondes.

## Livré

### 1. Saisie express — une phrase suffit (`/app/express`)
Le restaurateur tape ou **dicte** (Web Speech API, Chrome/Android/iOS) :
| Il dit… | AFRISUPPLY comprend | Effet |
|---|---|---|
| « vendu 40 mafé 25 yassa 12 thiep » | ventes du jour | upsert `sales` + décrément des ingrédients (comme la page Ventes) |
| « reste 3,5 kg plantain, 2 sacs riz » | comptage | mouvement `ajustement` + `lastCountedAt` |
| « reçu 25 kg riz 10 L huile » | réception | mouvement `reception` |
| « jeté 2 kg tilapia périmé » | perte | mouvement `perte` |

Moteur `apps/api/src/lib/quick.ts`, **sans LLM** (instantané, gratuit, hors-ligne-compatible côté logique) : détection d'intention par mots-clés, découpage quantité/unité/libellé (virgules décimales, nombres en lettres, « 25kg »), rapprochement par similarité (inclusion, préfixes, bigrammes, **préfixe phonétique** : « thiep » → « Thiéboudienne ») sur les plats actifs ou les produits suivis + alias. En cas d'ambiguïté (« poulet » : Yassa poulet ou Poulet braisé ?) il **ne choisit pas** : l'UI propose les candidats en un tap. Rien n'est écrit avant validation.

API : `POST /api/quick/parse` `{text, kind?}` → lignes + candidats ; `POST /api/quick/apply` `{kind, lines:[{id, qty}], day?}`.

### 2. Inventaire rapide (onglet « Inventaire »)
Un produit par écran, chiffre géant, boutons − / +, « OK » ou « Passer ». Ordre : jamais comptés → les plus anciens → alphabétique. Barre de progression, compteur « comptés cette semaine ». `GET /api/quick/inventory`.

### 3. Photo de facture → stock + prix (onglet « Photo facture »)
Photo (appareil arrière, recompressée à 1600 px côté client) → `POST /api/quick/invoice` → LLM vision (`LLM_API_KEY`, `LLM_VISION_MODEL` défaut `gpt-4o-mini`, JSON strict) → lignes `{label, qty, unit, unitPrice}` rapprochées du stock et du fournisseur → validation → `POST /api/quick/invoice/apply` : réception en stock **et** mise à jour de l'offre fournisseur + `price_history` (source `facture`). Sans clé LLM : 503 explicite, le reste de la page fonctionne.

### 4. PWA installable
`manifest.webmanifest` (icônes 192/512/maskable générées, raccourcis « Saisie express / Stock / Panier », `start_url=/app/express`), `sw.js` (coquille en cache → ouverture instantanée ; l'API n'est jamais mise en cache), balises iOS. Sur Android : « Ajouter à l'écran d'accueil » proposé par Chrome ; iOS : Partager → Sur l'écran d'accueil.

## Tests
`test/quick.test.ts` (5) : intention, découpage, similarité, alias, ambiguïté. `e2e.test.ts` +2 : phrase → ventes → stock ↓, comptage → 7 kg ; facture sans LLM → 503, validation manuelle → réception + prix. **57 tests.**

## Pour le pitch pilote
« Le soir, vous envoyez *vendu 40 mafé 25 yassa* — c'est tout. Le stock se met à jour, la prévision du lendemain aussi, et le matin vous recevez ce qu'il faut commander. »

## Suites
- **WhatsApp entrant** (même moteur `parseQuick`, via webhook Meta Cloud API ou Twilio) : nécessite un numéro WhatsApp Business vérifié → après le domaine.
- Apprentissage des alias : quand l'utilisateur choisit un candidat, mémoriser « thiep → Thiéboudienne » pour ce restaurant.
- Mode hors-ligne complet (file d'attente des saisies dans IndexedDB, synchronisation au retour du réseau).
