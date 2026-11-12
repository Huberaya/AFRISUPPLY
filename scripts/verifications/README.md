# Vérifications de bout en bout

Ces scripts ne testent pas des fonctions : ils **utilisent l'API réellement démarrée** et vérifient ce qui se passe
(codes HTTP, rôles refusés, e-mails déposés sur disque, PDF produits, quantités en base). C'est la porte de sortie du
dépôt : `npm run verifs:e2e` (ou `.github/workflows/ci.yml`, job « verifications »).

## Prérequis

```bash
npm install
PGLITE_DIR=/tmp/afs-pglite SEED_DEMO=true JWT_SECRET=dev-secret-local CRON_SECRET=dev-cron \
  ADMIN_EMAILS=admin@afrisupply.fr npm run start -w apps/api     # API sur :8787
npm run dev:web                                                   # web sur :3000
```

Certains contrôles lisent les sources web servies par Vite (`http://localhost:3000/src/pages/...`) :
le serveur web doit donc tourner aussi. Les variables `AFS_API` et `AFS_WEB` permettent de viser d'autres adresses.

## Exécution

```bash
npm run verifs:e2e                 # les 13 scripts d'affilée (~15 min)
AFS_PAUSE=0 npm run verifs:e2e     # sans pauses (comptes de test déjà espacés)
python3 scripts/verifications/chantier9_verif.py   # un seul script
```

Chaque script écrit son journal et son rapport machine dans `scripts/verifications/resultats/` (non versionnés).
Le lanceur sort en **erreur** si un script échoue.

## Ce que chaque script prouve

| Script | Ce qu'il vérifie sur une API réelle |
|---|---|
| `chantier1_verif.py` | Intégrité de la réception : 50 kg commandés / 45 reçus → écart détecté, chiffré, alerté ; statuts de commande cohérents |
| `chantier2_verif.py` | Rôles réellement appliqués côté serveur (un employé ne peut pas écrire), mot de passe, sessions révoquées, isolation entre restaurants |
| `scenario_tests.py` | Les 6 scénarios métier (nouveau restaurant → première commande → rupture → réception → hausse de prix → analyse des coûts) |
| `chantier3_verif.py` | Prix réellement facturé (et pas le prix catalogue) + détection de hausse alimentée par les vraies factures |
| `chantier4_verif.py` | Page Analyse : chiffres issus des données réelles, écran qui explique au lieu d'afficher des totaux vides |
| `chantier5_verif.py` | Accès et récupération de compte : liens à usage unique, expiration, confirmation d'e-mail, messages honnêtes |
| `chantier6_verif.py` | Canaux réels : e-mail/WhatsApp/SMS qui disent la vérité, rupture et écart de livraison envoyés immédiatement, supervision des jobs |
| `chantier7_verif.py` | Encaissement : essai, formules, factures (PDF réellement joint), santé de la facturation, bascule admin |
| `chantier8_verif.py` | Parcours client et paiements fournisseur : carte enregistrée, commissions calculées et facturées, isolation entre vendeurs |
| `chantier9_verif.py` | Prévision : cascade de sources (ventes 28 j → 7 j → couverts → seuils), jours fermés, saisonnalité, relances graduées, lot d'alertes complet |
| `chantier12_verif.py` | Exploitation : export réel des données du restaurant, **restauration prouvée dans une base neuve**, détection d'altération, refus d'écraser une base non vide, rotation des fichiers, supervision des tâches (cron muet détecté), journal d'audit + CSV, canal de support unique |
| `chantier11_verif.py` | Expérience réelle : plus aucune boîte de dialogue du navigateur, confirmations accessibles, notifications, menu par tâche, recherche d'écran, parcours « Rupture → Commander → Recevoir », erreurs avec « Réessayer » — et les écrans du parcours répondent sur l'API |

Dernier relevé complet : **535 vérifications**, 13 scripts sur 13 (12 novembre 2026 —
`docs/chantiers/preuves/verifications_bout_en_bout.txt`).

Les scripts 6, 9 et 12 appellent la passe quotidienne avec `?force=1` : sans cela, une passe déjà faite
dans la journée répond « déjà faite » et ne refait rien (chantier P0.4).

## Et dans un vrai navigateur

Ces scripts parlent à l'API. Le parcours d'un client **dans un navigateur** (site construit, clics,
formulaires, fenêtres) est vérifié à part : `scripts/navigateur/parcours.mjs`, 72 vérifications,
`npm run verifs:navigateur`, tâche « navigateur » de l'intégration continue.

```bash
npm run build -w apps/web
PGLITE_DIR=/tmp/afs-pglite-nav SEED_DEMO=true JWT_SECRET=dev-secret-local-dev-secret-local-0001 \
  CRON_SECRET=dev-cron MAIL_OUTBOX_DIR=/tmp/afs-boite-nav npm run start -w apps/api &
(cd apps/web && API_URL=http://localhost:8787 npx vite preview --port 3100 --strictPort) &
npm --prefix scripts/navigateur ci        # une fois (Node 22 ; ajoute un Chromium si la machine n'a pas de Chrome)
AFS_OUTBOX=/tmp/afs-boite-nav npm run verifs:navigateur
```

Rapport et captures d'écran : `scripts/navigateur/resultats/` (non versionnés). Ce que le parcours couvre
et ce qu'il ne couvre pas encore : `docs/chantiers/P0_6_PARCOURS.md`.
