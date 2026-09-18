# Chantier 6 — Facturation (Stripe)

## Ce que fait le produit
- **Essai gratuit 30 jours** à l'inscription (sans carte), toutes les fonctions Pro.
- Page **/app/abonnement** : état (essai / actif / paiement refusé / expiré), 3 formules (Starter 39 €, Pro 89 €, Business 199 € HT/mois), tarif fondateur −50 % affiché si le restaurant est pilote, bouton → **Stripe Checkout** (l'essai restant est conservé : prélèvement à la fin), bouton → **Stripe Portal** (factures, carte, changement de formule, résiliation).
- **Relances automatiques** J-7 / J-3 / J-1 avant fin d'essai (job quotidien).
- **Fin d'essai / résiliation** → lecture seule : les GET passent, les écritures répondent `402 subscription_required` ; le front affiche un bandeau et renvoie vers /app/abonnement. Paiement refusé → 14 jours de grâce puis lecture seule.
- **Fonctions par formule** (`402 plan_required`) : Starter n'a pas prévision / comparateur / panier intelligent / recettes / auto-reorder / assistant IA / photo de facture ; Business débloque achats groupés et export. L'essai donne tout le Pro.
- **Commissions fournisseurs** : le 1er du mois, une facture par fournisseur pour le mois précédent — Stripe (`send_invoice`, 15 jours) si le fournisseur a un client Stripe, sinon relevé par e-mail. Idempotent (`commission_invoices` unique vendor+période).
- **Admin /app/admin/abonnements** : MRR, liste des restaurants (état, jours d'essai), marquer **pilote fondateur**, prolonger l'essai, activer un plan à la main (client payé par virement), lancer/simuler la facturation des commissions.

## Mise en place Stripe (15 min)
1. dashboard.stripe.com → **Produits** : créer « AFRISUPPLY Starter » 39 €/mois, « Pro » 89 €/mois, « Business » 199 €/mois (récurrent mensuel, HT + TVA automatique si vous activez Stripe Tax). Copier les 3 `price_…` → `STRIPE_PRICE_STARTER/PRO/BUSINESS`.
2. **Coupons** : créer « FONDATEUR » −50 % durée *forever* → `STRIPE_COUPON_FOUNDER`.
3. **Développeurs → Clés API** : clé secrète → `STRIPE_SECRET_KEY`.
4. **Développeurs → Webhooks** : endpoint `https://<votre-domaine>/api/billing/webhook`, événements `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed` → secret `whsec_…` → `STRIPE_WEBHOOK_SECRET`.
5. Vercel → Environment variables → redeploy. Tester avec la carte `4242 4242 4242 4242` en mode test.
6. Portail client : Stripe → Paramètres → Billing → Customer portal → activer changement de formule et résiliation.

Tant que `STRIPE_SECRET_KEY` est vide : aucun blocage (sauf `BILLING_ENFORCE=true`), le bouton « Choisir » répond « écrivez-nous ».

## Données
`restaurants.stripe_subscription_id / subscription_status / current_period_end / founder`, `vendors.stripe_customer_id`, tables `billing_events` (idempotence webhooks) et `commission_invoices`. Migration `0004_billing.sql`.

## Tests
`apps/api/src/test/billing.test.ts` (8) : états d'accès, signature webhook, 402 plan/abonnement, webhook rejoué, résiliation, admin fondateur, factures de commission.
