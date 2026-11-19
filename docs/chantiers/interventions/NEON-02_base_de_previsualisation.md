# Fiche d'intervention NEON-02 — Une base dédiée aux prévisualisations

| | |
|---|---|
| Chantier | P0.4 (prévisualisation vérifiée), critère global n° 12 |
| Nature | **Création** d'une base vide, séparée de la production. Aucune opération sur la base de production |
| Qui | Le titulaire du compte Neon (puis Vercel), accompagné par ChatGPT |
| Durée | 10 minutes |
| État | À réaliser — rien de ce qui suit n'a été exécuté |
| Préalable | Fiche VERCEL-01 (savoir quelles variables sont offertes aux prévisualisations) |

## Pourquoi

Sur la branche de correction, une prévisualisation Vercel n'utilise plus jamais `DATABASE_URL` : elle
ne lit que `PREVIEW_DATABASE_URL`. Tant que cette variable n'existe pas, l'API d'une
prévisualisation répond 503 — c'est voulu (elle ne peut pas toucher la production), mais on ne peut
alors y vérifier aucun parcours. Pour valider les corrections dans les conditions réelles de Vercel
(fonction serverless, base Neon, vraie latence), il faut une base à elle.

## Résultat recherché

Une base PostgreSQL Neon **vide et séparée**, que seul l'environnement Preview de Vercel connaît,
amenée au schéma du code par le build de prévisualisation lui-même.

## Opérations

1. **Neon** — créer un **nouveau projet** (par exemple `afrisupply-preview`), dans la même région que
   la production. Un projet séparé a son propre calcul et ses propres identifiants : rien de ce qui
   s'y passe ne peut atteindre la production.
   *Ne pas créer une « branche » de la base de production : une branche Neon démarre avec une copie des
   données de sa base d'origine — la prévisualisation contiendrait alors des données réelles.*
2. **Neon** — relever la chaîne de connexion **pooler** de ce nouveau projet (`…-pooler…`, `sslmode=require`).
   Ne la coller dans aucune conversation.
3. **Vercel** — pour le projet qui sert l'application, ajouter en portée **Preview uniquement** :
   - `PREVIEW_DATABASE_URL` = la chaîne relevée à l'étape 2 ;
   - `MIGRATE_ON_BUILD` = `apply` ;
   - `JWT_SECRET` = une valeur aléatoire de 32 caractères, **différente** de celle de la production
     (`openssl rand -hex 32`).
4. **Vercel** — relancer le déploiement de prévisualisation de la branche (bouton « Redeploy »).

## Risques

- Coller par erreur la chaîne de **production** dans `PREVIEW_DATABASE_URL` : l'application le refuse
  si elle est identique à `DATABASE_URL` (l'API répond 503 et le build n'applique rien), mais ce
  contrôle ne voit que l'égalité exacte des deux chaînes. D'où le projet Neon séparé, dont la
  chaîne ne peut pas désigner la production.
- Poser `MIGRATE_ON_BUILD=apply` en portée **Production** par mégarde : les migrations seraient alors
  appliquées à la production au déploiement suivant. Vérifier que seule la case « Preview » est cochée.

## Opérations interdites

- Toute opération sur le projet Neon de production.
- Cocher « Production » pour l'une des trois variables de l'étape 3.
- Importer des données réelles dans la base de prévisualisation.

## Preuves attendues en retour

1. Le nom et la région du nouveau projet Neon.
2. Une capture de l'écran des variables Vercel montrant les trois noms et la seule portée « Preview » (valeurs masquées).
3. Les dernières lignes du journal de build de la prévisualisation commençant par `[migrate]`.

## Comment le résultat sera vérifié

L'agent lit, sans aucun accès privilégié :

| Vérification | Attendu |
|---|---|
| journal de build, lignes `[migrate]` | « migrations appliquées à la base de PRÉVISUALISATION », puis « migrations appliquées » |
| `GET <prévisualisation>/api/health` | 200 — `"db":"neon"`, `"config":"ok"`, `"env":"preview"` |
| `GET <prévisualisation>/api/status` → `checks.schema` | `"state":"a_jour"`, `"expected":29`, `"applied":29` |
| `GET <production>/api/status` | inchangé (même `commit`, mêmes tâches) : la production n'a pas été touchée |

Une fois ces quatre lignes obtenues, l'agent déroule sur la prévisualisation les parcours du chantier
P0.6 (inscription, restaurant, fournisseur, commande, réception) — sur des comptes de test uniquement.
