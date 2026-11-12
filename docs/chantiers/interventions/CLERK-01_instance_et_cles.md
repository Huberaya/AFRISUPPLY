# Fiche d'intervention CLERK-01 — Instance Clerk, clés et réglages de vérification

| | |
|---|---|
| Chantier | P0.2-D (Clerk) |
| Nature | Constat dans le tableau de bord Clerk, puis (sur décision) réglages et clés |
| Qui | Le titulaire du compte Clerk, accompagné par ChatGPT |
| Durée | 15 minutes pour le constat |
| État | À réaliser — rien de ce qui suit n'a été exécuté |

## Contexte

Ce que le code faisait au commit audité (`15c8b81`), et ce qu'il fait sur la branche de correction :

| Point | Avant | Sur la branche |
|---|---|---|
| Preuve d'identité exigée par `POST /api/auth/clerk-sync` | aucune (identifiant et adresse lus dans le corps de la requête) | jeton de session Clerk vérifié côté serveur + fiche lue chez Clerk avec la clé secrète |
| Clé publique du site sans variable | repli sur une clé de **test** écrite dans le code (`pk_test_…`, instance `picked-werewolf-6804`) | aucun repli : sans `VITE_CLERK_PUBLISHABLE_KEY`, la connexion Clerk n'est pas proposée |
| Sans `CLERK_SECRET_KEY` côté serveur | la session était ouverte quand même | refus (503 `clerk_not_configured`) |
| Session Clerk présentée directement à l'API | acceptée sans contrôle d'origine | refusée : seule la session AFRISUPPLY est acceptée |
| Rôles et permissions | gérés par AFRISUPPLY (propriétaire, responsable, équipe) — Clerk ne porte aucun rôle | inchangé |
| Webhooks Clerk | aucun point d'entrée dans le code | inchangé (voir « Limites connues ») |

Ce que l'agent **ne sait pas** et que cette fiche doit établir : quelle instance Clerk la production
utilise réellement, avec quelles clés, et si elle exige la vérification de l'adresse e-mail.
Indice relevé le 2026-11-12 : le fichier JavaScript principal servi en production n'est pas celui
qu'on obtient en construisant le commit `15c8b81` sans variable `VITE_*` — au moins une variable
`VITE_*` est donc définie au build de production ; laquelle, cela se lit dans Vercel (fiche VERCEL-01).

## Ce qu'on cherche à établir

1. Le type de l'instance utilisée par la production : **Development** ou **Production**.
2. Les préfixes des clés en service (`pk_test_`/`pk_live_`, `sk_test_`/`sk_live_`) — jamais les valeurs.
3. Si une adresse e-mail doit être **vérifiée** avant qu'un compte Clerk soit utilisable.
4. Les domaines et origines autorisés par l'instance.
5. Le nombre de comptes Clerk existants, à rapprocher de la requête Q8 de la fiche NEON-01.

## Vérifications préalables

Se connecter à dashboard.clerk.com et sélectionner l'application AFRISUPPLY. Si plusieurs instances
existent (Development et Production), faire le constat pour chacune.

## Opérations — constat (lecture seule)

| # | Où | Quoi relever |
|---|---|---|
| C1 | Sélecteur d'instance, en haut | Instances existantes : Development seule, ou Development + Production |
| C2 | Configure → API keys | Préfixe de la clé publique (`pk_test_` ou `pk_live_`) et de la clé secrète. Relever aussi le domaine de l'API front (`…clerk.accounts.dev` ou `clerk.<votre-domaine>`) |
| C3 | Configure → User & authentication → Email | « Verify at sign-up » est-il **activé** ? Méthode de vérification (code ou lien) |
| C4 | Configure → User & authentication → SSO connections | Fournisseurs activés (Google…) |
| C5 | Configure → Domains (instance Production) | Domaine déclaré, état des enregistrements DNS |
| C6 | Configure → Sessions | Durée de vie de session, « Customize session token » (attendu : aucun champ ajouté) |
| C7 | Configure → Webhooks | Points d'entrée déclarés (attendu : aucun) |
| C8 | Users | Nombre de comptes ; pour chacun, l'adresse est-elle marquée « Verified » ? |
| C9 | Configure → API keys → « Show JWT public key » | **Ne pas copier ici.** Noter seulement qu'elle est disponible (elle servira à `CLERK_JWT_KEY`) |

## Opérations — réglages (uniquement après décision explicite)

Ces opérations modifient la configuration d'authentification : elles demandent une autorisation.

1. Si la production utilise une instance **Development** : créer l'instance **Production** (elle exige
   un nom de domaine dont on contrôle le DNS — `afrisupply.fr` n'existe pas aujourd'hui), puis
   remplacer les clés dans Vercel (fiche VERCEL-01). Sans domaine, garder la connexion Clerk
   désactivée en production (ne pas définir `VITE_CLERK_PUBLISHABLE_KEY`) : la connexion par e-mail
   et mot de passe suffit pour le pilote.
2. Activer « Verify at sign-up » s'il ne l'est pas : la route corrigée refuse de toute façon une
   adresse non vérifiée (403 `clerk_email_unverified`), mais l'utilisateur doit pouvoir la vérifier.
3. Poser dans Vercel, pour l'environnement concerné : `VITE_CLERK_PUBLISHABLE_KEY` (build du site),
   `CLERK_SECRET_KEY` (serveur), et `APP_URL` (origine autorisée). Facultatif : `CLERK_JWT_KEY`.

## Risques

- Changer d'instance Clerk change les identifiants des comptes : un compte AFRISUPPLY relié à un
  identifiant de l'ancienne instance sera refusé (409 `clerk_identity_conflict`) jusqu'à ce que son
  lien soit réinitialisé — opération sur la base, à autoriser séparément (fiche NEON à créer).
- Désactiver Clerk en production prive de connexion les comptes créés uniquement par Clerk (sans mot
  de passe). Ils retrouvent l'accès par « Mot de passe oublié » — ce qui suppose un envoi d'e-mails
  réellement fonctionnel.

## Opérations interdites

- Copier une clé secrète (`sk_…`) ou la clé publique JWT dans une conversation ou dans le dépôt.
- Supprimer des comptes Clerk ou une instance.
- Utiliser la clé d'une instance dans une autre (clé publique et clé secrète doivent être de la même instance).

## Preuves attendues en retour

Pour C1 à C9 : la valeur relevée (préfixes et réglages, jamais de clé). Pour C8 : des nombres.

## Comment le résultat sera vérifié

- Après réglage et déploiement : `GET /api/health` → `ok: true` ; une connexion Clerk réelle ouvre
  une session (journal d'audit : action `auth.clerk_sync`, `outcome` = `created`, `linked` ou `existing`).
- Une tentative sans jeton → 401 ; avec une adresse non vérifiée → 403. Ces deux cas sont déjà
  couverts par les tests (`apps/api/src/test/clerk-sync.test.ts`, 21 tests) — avec un faux service
  Clerk : ils prouvent le code, pas la configuration de l'instance réelle.

## Limites connues, à trancher

- **Changement d'adresse dans Clerk** : la route refuse une identité dont l'adresse vérifiée ne
  correspond plus à celle du compte AFRISUPPLY (409 `clerk_identity_mismatch`). C'est voulu — un lien
  posé avant la correction ne doit donner accès à rien — mais un utilisateur qui change d'adresse
  dans Clerk devra passer par le support.
- **Suppression d'un compte dans Clerk** : sans webhook, le compte AFRISUPPLY subsiste (il reste
  inaccessible par Clerk, mais ses données ne sont pas effacées). À traiter avec le dossier RGPD.
- **Inscription par Clerk et conditions générales** : le formulaire d'inscription par mot de passe
  fait accepter les CGU/CGV ; le parcours d'inscription Clerk ne le fait pas. À corriger avant
  d'ouvrir l'inscription Clerk à des clients (dossier de commercialisation).
