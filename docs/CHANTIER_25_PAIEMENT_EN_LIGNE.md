# Chantier 25 — Paiement en ligne des commandes (Stripe Connect)

## Pourquoi
Le chantier 29 a posé les conditions de paiement et le pointage manuel des règlements. Ce chantier permet au restaurant de **payer directement depuis AFRISUPPLY** (carte ou prélèvement SEPA) et au grossiste de **recevoir l'argent sur son compte bancaire** — la commission plateforme est prélevée à la source, sans facture de commission mensuelle sur ces commandes.

## Modèle
- **Stripe Connect Express** : chaque grossiste a un compte connecté (onboarding Stripe hébergé : identité, SIREN, IBAN — 5 min). AFRISUPPLY ne touche jamais les fonds.
- **Checkout « payment »** avec `transfer_data.destination = compte du grossiste` et `application_fee_amount = commission %` → l'argent va au grossiste, la commission à AFRISUPPLY, automatiquement.
- Moyens : carte, prélèvement SEPA (asynchrone : la commande est soldée à `checkout.session.async_payment_succeeded`).

## Côté grossiste — onglet **Paiement en ligne**
- Bouton **Activer le paiement en ligne** → onboarding Stripe → retour sur `/vendor?tab=payments`. État : compte actif / dossier à compléter (éléments manquants) ; compteur de paiements en ligne reçus.
- Sans clé Stripe sur la plateforme : message « pas encore activé », tout le reste fonctionne (virement + pointage dans *Encours*).

## Côté restaurant
- Bandeau « Factures fournisseurs à régler » (*Achats*) : bouton **💳 Payer en ligne** par facture → page Stripe → retour `/app/achats?paid=<id>` avec message.
- Refus clairs : grossiste non onboardé, commande déjà réglée, commande non payable.
- Une fois payée : reste dû 0, `paymentMethod = en_ligne`, disparaît des factures ouvertes des deux côtés, timeline « 💳 Paiement en ligne reçu ».

## API
| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/vendor/payments` | état Connect (resynchronisé à chaque appel), commission, volume en ligne |
| POST | `/api/vendor/payments/onboard` | crée le compte Express si besoin + lien d'onboarding (503 si Stripe absent) |
| POST | `/api/orders/:id/pay` | restaurant (responsable+) — session Checkout, `{url, amountEur}` |
| GET | `/api/orders/:id/payment` | disponibilité + montants (`reason`: already_paid · not_payable · stripe_off · vendor_not_onboarded) |
| POST | `/api/billing/webhook` | branche `mode=payment` + `metadata.kind=order_payment` → `applyOrderPayment` (idempotent via `billing_events`) |

## Données
Migration `0020_online_payment` : `vendors.stripe_account_id`, `vendors.stripe_payouts_enabled`, `orders.stripe_checkout_id`, `orders.stripe_payment_intent_id`.

## Mise en service (à faire par vous, 15 min)
1. Dashboard Stripe → activer **Connect** (plateforme, comptes Express), pays France.
2. Sur Vercel : `STRIPE_SECRET_KEY` (sk_live_…) et `STRIPE_WEBHOOK_SECRET` (endpoint `https://<api>/api/billing/webhook`, événements `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, + ceux des abonnements).
3. Redéployer. Les grossistes voient alors le bouton d'activation.

## Test
`notifications.test.ts` → « chantier 25 » : sans Stripe = messages clairs (503 / stripe_off / 400) ; webhook signé SEPA « unpaid » ignoré, puis « paid » → commande soldée ; rejeu = dupliqué sans double comptage ; signature invalide 400 ; disparaît des factures ouvertes du grossiste.
