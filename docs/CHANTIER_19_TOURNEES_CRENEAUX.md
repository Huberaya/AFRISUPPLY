# Chantier 19 — Tournées & créneaux de livraison

## Pourquoi
Un grossiste ne livre pas partout tous les jours : il tourne par secteur (« le mardi le 93/94, le jeudi le 92 »), avec une heure limite de commande et un camion qui n'accepte qu'un nombre fini d'arrêts. Jusqu'ici la date de livraison était un simple « délai standard » ; le restaurant ne savait pas quand le camion passerait réellement.

## Côté grossiste — onglet **Tournées**
- Créer une tournée : **nom, jour de la semaine, zones** (codes postaux à 2 ou 5 chiffres, ou villes ; vide = toutes ses zones), **créneaux horaires** proposés (« 6h–8h »), **heure limite** (J-n à HH:MM, heure de Paris), **capacité** (commandes max, optionnel).
- Suspendre / réactiver / supprimer. Aperçu des 3 prochaines dates avec le nombre de commandes déjà prises.
- La liste de picking (chantier 20) est déjà groupée par date de livraison : chaque tournée = une feuille de picking.

## Côté restaurant — au moment de commander
- Dès que le panier contient un article, un bloc **« Date de livraison »** propose les prochaines dates (14 jours) parmi les tournées qui desservent sa ville / son code postal, avec le créneau horaire et l'heure limite de commande. Dates complètes grisées ; « 2 places » quand il reste peu.
- Sans choix explicite, la première date libre est prise. Si le grossiste n'a aucune tournée, rien ne change (délai standard).
- Confirmation : « livraison prévue le mardi 23 septembre (8h–10h) ».

## Règles serveur (`lib/routes.ts`)
- Une tournée dessert un restaurant si l'une de ses zones = code postal exact, département (2 chiffres) ou ville ; zones vides = tout.
- Créneau proposé seulement si `maintenant < (date − cutoffDaysBefore) à cutoffTime` (Europe/Paris).
- Capacité = commandes non annulées déjà posées sur (tournée, date).
- À la commande : créneau introuvable/expiré → 400 ; tournée complète → 409 ; créneau horaire non proposé → 400.
- Les commandes récurrentes (chantier 24) gardent le délai standard (à affiner plus tard : placer sur la prochaine tournée).

## API
| Méthode | Route | Rôle |
|---|---|---|
| GET/POST | `/api/vendor/routes` | grossiste — liste (+ charge à venir) / création |
| PUT/DELETE | `/api/vendor/routes/:id` | grossiste |
| GET | `/api/marketplace/vendors/:id/slots` | restaurant — `{ slots: [{routeId, date, weekdayLabel, slots, cutoffAt, remaining, full}], hasRoutes }` |
| POST | `/api/marketplace/vendors/:id/orders` | accepte `routeId`, `expectedAt`, `deliverySlot` |

## Données
Table `vendor_routes` + colonne `orders.route_id` (migration `0018_routes`).

## Test
`notifications.test.ts` → « chantier 19 » : CRUD, zone hors secteur jamais proposée, mauvais créneau 400, capacité 409 + date marquée complète, défaut = première date libre, heure limite dépassée → date retirée.
