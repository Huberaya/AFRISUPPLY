# Chantier 28 — Tarifs par volume & prix négociés par restaurant

## Grossiste — onglet **Tarifs**
- **Paliers de volume** par offre : « à partir de N colis → prix X » (≤ 6 paliers, strictement décroissants, sous le prix catalogue). `PUT /vendor/offers/:id/tiers`.
- **Prix négociés par client** (restaurants ayant déjà commandé ou lié le grossiste) : prix ferme sur une offre, remise % sur une offre, ou remise % sur tout le catalogue ; date de validité, note interne. `GET /vendor/pricing`, `POST /vendor/customer-prices`, `DELETE /vendor/customer-prices/:id`. Audit `vendor.customer_price`.

## Restaurant — fiche grossiste (Marketplace)
- Prix affiché = **son** prix (badge « négocié » + prix catalogue au survol), paliers listés sous le prix.
- Panier : devis en direct (`POST /marketplace/vendors/:id/quote`) → « ✓ palier », « +2 colis → 34,00 € », économies totales dans la barre de commande.
- La commande enregistre le prix résolu ligne par ligne.

## Règle de résolution (`apps/api/src/lib/pricing.ts`)
prix ferme client (offre) > remise % client (offre) > remise % client (globale) > palier volume > catalogue — avec, pour les accords clients, le **plus bas** entre l'accord et le palier. Accords expirés ignorés. Les autres restaurants ne voient jamais les prix négociés d'un tiers. Tables `vendor_price_tiers`, `vendor_customer_prices` (migration 0014).
