# Chantier 18 — Notifications WhatsApp / SMS + rappels grossistes

## Ce qui se passe
| Événement | Grossiste | Restaurant |
|---|---|---|
| Nouvelle commande marketplace | e-mail **+ WhatsApp (ou SMS)** sur le numéro WhatsApp / téléphone de sa fiche | — |
| Pas de réponse après 4 h (`REMINDER_HOURS`) | **rappel** WhatsApp/SMS + e-mail, une seule fois (`orders.vendor_reminded_at`) | — |
| Confirmation / refus / expédition | — | e-mail **+ WhatsApp/SMS** si un numéro est renseigné dans *Réglages → WhatsApp / SMS de suivi* |
| Dans l'espace grossiste | bouton **💬 WhatsApp** sur chaque commande (lien `wa.me` vers le restaurant, sans Twilio) | |

Tous les envois sont journalisés dans la table `notifications` (canal, destinataire, succès/erreur).

## Rappels
- Route cron `GET /api/jobs/reminders` (secret `CRON_SECRET`) + inclus dans le job quotidien.
- Vercel Hobby n'autorise qu'un cron par jour → déclenchement opportuniste aussi à chaque ouverture de « Commandes » côté grossiste (max 1 fois / 15 min). Avec Vercel Pro, ajouter `{ "path": "/api/jobs/reminders", "schedule": "0 * * * *" }` dans `vercel.json`.

## Activer les vrais envois (Twilio, ~10 min)
1. Créer un compte sur twilio.com → récupérer **Account SID** et **Auth Token**.
2. WhatsApp : *Messaging → Try it out → Send a WhatsApp message* (sandbox gratuit pour tester : le destinataire envoie « join <mot> » au numéro sandbox) ; en production, demander un **WhatsApp Business Sender** (numéro dédié, validation Meta 1–3 jours).
3. SMS : acheter un numéro français (~1 €/mois, ~0,08 €/SMS).
4. Sur Vercel → Settings → Environment Variables :
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` (sandbox) ou votre numéro validé
   - `TWILIO_SMS_FROM=+33…` (optionnel, repli si pas de WhatsApp)
   - `REMINDER_HOURS=4` (optionnel)
5. Redéployer. Sans ces variables, rien n'est envoyé : les messages sont seulement journalisés (`channel = log`).

Test côté restaurant : *Réglages → WhatsApp / SMS → Tester*.
