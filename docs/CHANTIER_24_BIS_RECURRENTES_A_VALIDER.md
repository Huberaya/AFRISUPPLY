# Chantier 24 bis — Commandes récurrentes « me demander avant »

## Pourquoi
Certains restaurateurs veulent la régularité d'une commande programmée sans perdre la main : vérifier le frigo avant que la commande parte. Le mode `confirm` existait dans le formulaire mais n'était pas appliqué (la commande partait quand même).

## Fonctionnement
1. Le job quotidien (`runRecurringOrders`) traite la récurrence : en mode **auto** la commande est envoyée au grossiste (inchangé) ; en mode **confirm** elle est créée au statut **`preparee`** (brouillon plateforme), **invisible pour le grossiste**, sans e-mail ni WhatsApp.
2. Les propriétaires/responsables reçoivent un e-mail « ✅ À valider : commande « … » — 84,00 € » avec un bouton **Valider la commande** → `/app/achats?validate=<id>`.
3. Dans *Achats → Commandes*, la commande porte le badge « ⏳ En attente de votre validation » et le bouton **« Valider et envoyer à <grossiste> »** (ou *Modifier* avant). Une commande non validée n'est jamais envoyée.
4. À la validation : statut `envoyee`, e-mail + WhatsApp/SMS au grossiste, timeline « Commande envoyée ».

## API
| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/marketplace/orders/:id/send` | restaurant — envoie un brouillon plateforme (`preparee` → `envoyee`), 409 si déjà envoyée |
| `placeVendorOrder(..., { draft: true })` | interne | crée sans notifier |

`GET /api/vendor/orders` exclut désormais les statuts `brouillon` / `preparee`.

## Test
`notifications.test.ts` → « chantier 24 bis » : job → `preparee` sans `sentAt`, invisible côté grossiste, validation 200, second envoi 409, visible ensuite côté grossiste.
