# Chantier 7 — Programme pilote (20 restaurants fondateurs)

## Objectif
Faire réussir les 20 premiers restaurants : les faire entrer, les accompagner la première semaine, savoir chaque jour qui décroche, collecter les retours, et prouver la valeur avant de payer.

## Parcours d'un pilote
1. **Invitation** (admin, `/app/admin/pilotes` → Invitations) : e-mail avec code `PILOTE-XXXX` + lien `/inscription?code=…` pré-rempli.
2. **Inscription avec code** → restaurant **fondateur** (−50 % à vie, badge, offre affichée dans Mon abonnement) ; le lead passe en « client ».
3. **Checklist « Semaine 1 »** sur l'accueil (7 étapes, détectées automatiquement : carte, inventaire, fournisseur + prix, ventes, commande, réception, app installée). Étape suivante mise en avant ; masquable.
4. **Bouton « Un avis, un bug ? »** partout dans l'app (bug / idée / question) → e-mail immédiat aux admins pour les bugs et questions.
5. **NPS** demandé à J+14 et J+45 (une fois par fenêtre) ; score ≤ 6 → alerte admin.
6. **Relances essai** J-7/J-3/J-1 (chantier 6) puis conversion au tarif fondateur.

## Cockpit admin (`/app/admin/pilotes`)
- **Santé** de chaque restaurant : 🟢 actif · 🟠 à surveiller (connecté sans saisie, checklist en retard, 3 j sans login) · 🔴 à rappeler (≥ 7 j sans login, jamais connecté après J3, NPS ≤ 6). Raisons explicites, chiffres 7 j (ventes, mouvements, commandes), NPS, contacts.
- **Retours** à traiter (bouton « Traité »), **Invitations** (renvoi possible).
- **Rapport hebdo** e-mail chaque lundi aux `ADMIN_EMAILS` (job quotidien) : classement rouge → vert + retours de la semaine.
- Menu « Admin AFRISUPPLY » visible uniquement pour les e-mails de `ADMIN_EMAILS`.

## Mesure d'usage
`usage_events` : pages vues (route anonymisée) et actions, envoyées par lots depuis le front (`track()`), sans tiers ni cookie. Sert au score de santé (≥ 5 événements/7 j = actif) — à enrichir au fil de l'eau (`track('action.xxx')`).

## Rituel conseillé (fondateur)
- **Chaque matin (5 min)** : cockpit → appeler les 🔴, message WhatsApp aux 🟠.
- **J+1 de chaque inscription** : appel de 15 min « on fait l'inventaire ensemble ».
- **Lundi** : lire le rapport, répondre à chaque retour, noter les 3 irritants les plus cités → prochain sprint.
- **J+14** : lire les NPS ; ≤ 6 → appel le jour même.
- Objectif de sortie du pilote : ≥ 12 restaurants actifs chaque semaine, NPS ≥ 30, ≥ 10 conversions payantes au tarif fondateur.

## API
Public `GET /public/invite/:code` · Restaurant `GET /onboarding/checklist`, `POST /onboarding/checklist/:step`, `POST /feedback`, `GET /feedback/nps-due`, `POST /usage` · Admin `GET /admin/pilots`, `POST /admin/pilots/invite`, `PUT /admin/pilots/feedback/:id`. Migration `0005_pilots.sql` (tables `feedback`, `usage_events`, colonnes `restaurants.invite_code/onboarding_done`, `leads.invite_code/invited_at/restaurant_id`).

## Tests
`apps/api/src/test/pilots.test.ts` (7) — invitation, inscription avec code, checklist auto/manuelle, retours + NPS, usage, cockpit, rapport.
