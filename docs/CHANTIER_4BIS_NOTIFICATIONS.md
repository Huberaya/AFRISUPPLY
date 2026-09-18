# Chantier 4 bis — « Votre matin AFRISUPPLY » (e-mail quotidien + job cron)

## Promesse produit
Le restaurateur n'a pas besoin d'ouvrir l'app : chaque matin vers 6 h 30 il reçoit **un seul e-mail actionnable** :

| Section | Contenu | Lien |
|---|---|---|
| 🔴 À commander aujourd'hui | produits en rupture ≤ 3 j ou critiques, quantité conseillée, jour de rupture | `/app/achats/panier` |
| 🧺 Panier de la semaine | nb produits / fournisseurs, total, économie vs habitudes | `/app/achats/panier` |
| 🤖 Commandes préparées | auto-reorder exécuté le matin même (statut `preparee`, jamais envoyé) | `/app/achats` |
| 📈 Prix en hausse / 🟢 Moins cher ailleurs | alertes non lues des 36 dernières heures | `/app/stock` |
| ⚠️ Écarts à réclamer | nb d'écarts ouverts + montant à récupérer | `/app/achats/ecarts` |
| 🚚 Livraisons attendues | commandes envoyées/confirmées, date prévue | `/app/achats` |
| Pied | stock 🟢🟠🔴, portions saisies hier (ou rappel de saisie), achats du mois + évolution | `/app` |

Le **sujet** résume la priorité du jour : ruptures > hausse de prix > écarts > « Tout est sous contrôle ». Un jour calme donne un mail de 5 lignes.

## Architecture
```
POST /api/jobs/daily  (X-Cron-Secret)          ← GitHub Actions / crontab / Vercel cron
   └─ runDailyForAll()            apps/api/src/jobs/daily.ts
        └─ pour chaque restaurant :
             1. refreshAlerts(rid)          routes/restaurant.ts   (mêmes règles que le bouton « Actualiser »)
             2. runAutoReorder(rid, null)   routes/intelligence.ts (si settings.autoReorderEnabled ≠ false)
             3. buildDigestForRestaurant()  → buildDigest()  lib/digest.ts (texte + HTML inline, sans script)
             4. sendMail()                  lib/mailer.ts   (Resend si RESEND_API_KEY, sinon fichiers .outbox/)
```
- **Idempotent** : relancer le job le même jour ne recrée ni alertes ni commandes (dédup côté `refreshAlerts` / règles), il renvoie seulement le mail.
- **Isolation** : tout part de `restaurant_id`, aucun agrégat inter-restaurants.
- **Destinataires** : `settings.digestRecipients` si renseigné, sinon tous les membres `owner`/`manager`.
- **Réglages** (`restaurants.settings`) : `dailyDigestEnabled`, `digestRecipients`, `closedWeekdays` (0 = dimanche), `autoReorderEnabled`, `priceIncreaseAlertPct`, `forecastHorizonDays`.

## API
| Route | Auth | Rôle |
|---|---|---|
| `POST /api/jobs/daily?dryRun=1&restaurantId=…` | header `X-Cron-Secret` = `CRON_SECRET` (401 sinon ; 503 si non configuré) | lance le job ; `dryRun` calcule sans commander ni envoyer |
| `GET/PUT /api/settings` | JWT (owner/manager pour PUT) | réglages restaurant + notifications |
| `GET /api/digest/preview[?format=html]` | JWT | aperçu du mail du jour (json : subject/text/html) |
| `POST /api/digest/send-test` | JWT | envoie le mail maintenant à l'utilisateur connecté |

Page web : **`/app/parametres`** (restaurant, jours de fermeture, seuils, auto-reorder, destinataires, aperçu HTML dans un iframe sandbox, bouton « M'envoyer le mail maintenant »).

## Variables d'environnement
```
CRON_SECRET=une-longue-chaine-aleatoire   # obligatoire en prod
APP_URL=https://app.afrisupply.fr         # liens dans le mail
RESEND_API_KEY=re_...                     # absent → mails écrits dans MAIL_OUTBOX_DIR (.outbox/)
MAIL_FROM="AFRISUPPLY <bonjour@afrisupply.fr>"
```

## Planification
- **GitHub Actions** : copier `docs/cron-daily.yml.example` vers `.github/workflows/cron-daily.yml` et créer les secrets `API_URL` + `CRON_SECRET`.
- **crontab** : `30 6 * * * curl -sf -X POST https://api.afrisupply.fr/api/jobs/daily -H "X-Cron-Secret: $CRON_SECRET"`
- **Vercel / Render cron** : même appel HTTP.

## Vérifié en local
- 401 sans secret ; run complet : 33 alertes créées, 1 commande auto-préparée, 2 mails écrits dans `.outbox/` (txt + html) ; 2ᵉ run : 0 alerte / 0 commande / mail renvoyé ; `dryRun` → `transport: dry-run`.
- 38 tests vitest (dont `test/digest.test.ts` : sujet, sections, arrondis d'unités, échappement HTML, priorités du titre).

## Suites possibles
WhatsApp Business (même contenu, template approuvé), digest hebdo « votre semaine en chiffres » (dimanche soir), notification push PWA quand une livraison est en retard.
