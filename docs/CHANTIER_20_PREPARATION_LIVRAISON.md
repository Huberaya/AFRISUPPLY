# Chantier 20 — Préparation, livraison, preuve de livraison (+ suivi restaurant)

## Grossiste — onglet « Préparation & livraison » (`/fournisseur`)
- **Tournée** : commandes confirmées, filtrables par date de livraison ; étapes **Commencer la préparation** (créneau) → **Partie en livraison** (nom du livreur, restaurant prévenu) → **Livrée — preuve de livraison**.
- **Preuve** (modale mobile) : nom du réceptionnaire, **signature au doigt** (canvas), **photo** (appareil photo, compressée ≤ 1024 px), remarque. Au moins un élément requis.
- **Liste de picking** : quantités à préparer par produit/conditionnement avec répartition par restaurant, cases à cocher, impression.
- Bon de livraison PDF depuis la tournée.
- API : `GET /vendor/picking[?date=YYYY-MM-DD]`, `POST /vendor/orders/:id/fulfillment` `{step, deliverySlot, driverName, receiverName, photo, signature, note}` (ordre strict, 400 si retour arrière), `GET /vendor/orders/:id/timeline`. L'ancien `POST /vendor/orders/:id/shipped` redirige.

## Restaurant — suivi (`/app/achats`)
- Sur chaque commande marketplace : **frise** Envoyée → Confirmée → En préparation → En livraison → Livrée → Réceptionnée, journal horodaté, et la **preuve de livraison** (nom, signature, photo) quand le grossiste l'a saisie.
- Badge « 🚚 En livraison » / « 📦 Livrée — à réceptionner » dans la liste ; la réception (stock + écarts) reste l'étape finale côté restaurant.
- Notifications e-mail + WhatsApp/SMS (chantier 18) à « en livraison » et « livrée ».
- API : `GET /orders/:id/timeline`.

## Données (migration 0010)
`orders.fulfillment, prepared_at, shipped_at, vendor_delivered_at, delivery_slot, driver_name, proof_receiver_name, proof_photo, proof_signature, proof_note` ; table `order_events` (chronologie). Les images sont stockées en data-URL (photo JPEG ≤ ~400 Ko) — à migrer vers un stockage objet (Vercel Blob/S3) si le volume grossit.
