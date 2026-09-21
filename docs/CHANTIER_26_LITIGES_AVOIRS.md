# Chantier 26 — Litiges & avoirs

Ferme la boucle réception → argent sur les commandes marketplace.

## Flux
1. **Restaurant** (Achats → Écarts) : sur un écart, **⚖️ Ouvrir un litige** (nature, montant pré-calculé sur le manquant, photo, message) → référence `LIT-AAAA-NNNN`, grossiste prévenu (e-mail + WhatsApp/SMS), événement dans la chronologie.
2. **Grossiste** (onglet **Litiges**) : répond sous 48 h — **avoir** (montant), **relivraison** ou **refus motivé**. Avoir ≥ réclamé → statut *accepté* ; sinon *proposé*.
3. **Restaurant** : accepte (→ *clos*, écart résolu automatiquement) ou **conteste** → *escalade* (admins prévenus).
4. **Admin** (`/app/admin/litiges`) : arbitre (avoir / relivraison / rejet + motivation envoyée aux deux), liste des litiges sans réponse > 48 h.

L'avoir est **déduit par le grossiste de sa prochaine facture** (AFRISUPPLY n'encaisse pas) ; les montants sont tracés (`claims.credit_eur`) et affichés côté restaurant (« avoirs obtenus »).

## API
Restaurant : `GET/POST /claims`, `POST /claims/:id/close {accept|escalate}`, `GET /claims/:id/photo`. Grossiste : `GET /vendor/claims`, `POST /vendor/claims/:id/respond`. Admin : `GET /admin/claims`, `POST /admin/claims/:id/arbitrate`. Table `claims` (migration 0013). Audit `claim.respond`, `claim.arbitrate`.
