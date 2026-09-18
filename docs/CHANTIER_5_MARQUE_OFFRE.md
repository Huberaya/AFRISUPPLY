# Chantier 5 — Marque, site vitrine & offre commerciale

## Identité
- **Nom** : AFRISUPPLY. ⚠️ À faire par le fondateur : vérification INPI (classes 9, 35, 42) et dépôt des domaines afrisupply.fr / .com / .eu — hors périmètre technique.
- **Palette** : terracotta `brand-700 #c2410c` (chaleur, terre, piment) sur `stone` (pro), accent jaune `#facc15` (soleil / maïs). Logo : triangle (le grenier, la marmite) + point solaire — `public/favicon.svg` et composant `Logo`.
- **Ton** : pro mais chaleureux, tutoiement dans l'assistant, vouvoiement sur le site. Toujours des exemples concrets (plantain, mafé, huile de palme), jamais de jargon ERP.
- **Visuel hero** : `apps/web/public/hero-cuisine.jpg` (généré, libre de droits — à remplacer par une photo d'un restaurant pilote dès que possible).

## Site vitrine (dans `apps/web`, routes publiques)
| Route | Contenu |
|---|---|
| `/` | Hero → problème (4 douleurs) + aperçu « L'IA recommande » → 3 bénéfices chiffrés → assistant → 3 étapes → tarifs → CTA pilote |
| `/fonctionnalites` | 10 modules expliqués |
| `/tarifs` | 3 plans, prix pilote, matrice comparative, marketplace à venir |
| `/faq` | 8 questions (fournisseurs sans compte, données, IA, multi-sites…) |
| `/demander-un-acces` | Formulaire lead (plan pré-sélectionné via `?plan=`, UTM capturés, honeypot anti-spam, rate-limit 5/h/IP) |
| `/mentions-legales` | Gabarit RGPD à compléter (chantier 7) |
SEO : title/description/OG dans `index.html`, `robots.txt` (désindexe `/app`), `sitemap.xml`. Le layout du site est distinct de l'app (`components/site/SiteLayout.tsx`).
La vidéo démo 90 s reste à tourner (bouton « Voir la démo » pointe vers le compte démo en attendant).

## Offre
Source de vérité : `apps/api/src/routes/public.ts` (`PLANS`, `FOUNDER_OFFER`, exposés par `GET /api/public/plans`) — miroir client dans `apps/web/src/lib/plans.ts`.
- Starter 39 € · Pro 89 € (mis en avant) · Business 199 € — HT / mois / établissement, sans engagement.
- Essai 30 jours sans CB ; **pilote fondateur** : −50 % à vie pour les 20 premiers.
- Marketplace (V2) : gratuite côté restaurant, commission 2–5 % côté fournisseur.
- Le paiement (Stripe) et l'application effective des limites par plan relèvent du chantier 7.

## Leads
Table `leads` (migration `0001_leads.sql`) : restaurant, contact, ville, cuisine, couverts, plan visé, message, source, UTM, statut (`nouveau → contacte → demo → pilote → client / perdu`), notes.
`GET/PUT /api/admin/leads` réservé aux e-mails listés dans `ADMIN_EMAILS`. Pas d'UI admin pour l'instant (curl / SQL suffisent pour 20 pilotes).

## Onboarding 15 minutes
Déjà en place (chantier 2) : `/app/demarrer` (recettes types → produits) puis `/app/import` (CSV) ou saisie des prix sur la fiche fournisseur (chantier 3), puis Inventaire (chantier 3). La FAQ et le site promettent exactement ce parcours.

## Supports
- `docs/commercial/SCRIPT_DEMO_20MIN.md` — déroulé, phrases clés, objections.
- `docs/commercial/PLAQUETTE.md` — texte recto/verso prêt à mettre en page.
- Témoignages : à collecter auprès des pilotes (chantier 6) — ne pas en inventer.

## Reste à faire (hors code)
INPI + domaines, tourner la vidéo 90 s, photo réelle pour le hero, mise en page de la plaquette (Canva), adresse e-mail bonjour@afrisupply.fr.
