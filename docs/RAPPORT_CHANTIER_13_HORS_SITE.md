# Rapport de fin de chantier 13 — Sauvegarde hors site : une copie qui existe ailleurs, relue et restaurable

**Date** : 22 septembre 2026 · **État** : sur `main`, après l'audit n°3 (`AUDIT_AFRISUPPLY_V3.md`)
**Périmètre** : envoi des sauvegardes vers un stockage **externe** compatible S3, relecture et
comparaison d'empreinte, **essai de restauration depuis la copie externe**, rétention distante,
supervision du hors site, et vérification de bout en bout avec un faux service S3 qui exige une
requête signée.

---

## 1. Ce que l'audit reprochait (constat de départ)

C'était le **bloquant n°4** du verdict de l'audit n°3 : « **Sauvegarde hors site** — les sauvegardes
s'écrivent sur le disque local, éphémère en serverless ». Autrement dit : la plateforme produisait des
sauvegardes **sur la machine même qu'elles étaient censées protéger**. En serverless, l'instance
disparaît — avec le fichier. Une panne, une suppression, une rançon ou une simple erreur humaine
emportaient la base **et** sa copie.

## 2. ✅ Corrigé

### 2.1 Un client de stockage externe, sans dépendance

`apps/api/src/lib/offsite.ts` parle aux services compatibles S3 (Cloudflare R2, Backblaze B2,
Scaleway, AWS S3, MinIO) : envoi, relecture, liste paginée, suppression, rétention. La **signature
AWS V4** est implémentée avec `node:crypto` — **aucun paquet à installer, à mettre à jour ou à
auditer**. La configuration est relue **à chaque appel** : une variable corrigée prend effet sans
redéploiement.

### 2.2 Une copie ne compte que si elle est RELUE

Après l'envoi, le fichier est re-téléchargé et son empreinte **SHA-256** comparée au fichier local.
Si la copie ne correspond pas, elle est **supprimée** et l'échec est signalé : mieux vaut pas de copie
qu'une copie qui donne l'illusion d'exister. Testé en altérant un objet côté service.

### 2.3 La preuve est une restauration, pas une empreinte

`POST /api/admin/backups/offsite-drill` part de la copie **externe** : téléchargement → vérification
du format, de la version et de l'empreinte → **base neuve et jetable** → migrations → restauration →
**recomptage indépendant** des lignes, table par table. Le rapport nomme ce qui manque, le cas
échéant. Vérifié en bout en bout : **85 lignes restaurées**, aucune table incomplète, données métier
comprises (produits, stock, mouvements de stock, fournisseur, offre, commande, lignes, livraison).

### 2.4 La rétention distante ne dépend jamais du disque local

Le piège réel : une instance serverless neuve a un **disque vide**. Une rétention qui se baserait sur
les fichiers locaux croirait « rien à garder » et **effacerait l'archive**. Ici, la rétention liste le
stockage externe et ne supprime un objet que si une copie **plus récente du même restaurant** y existe
déjà. Les objets étrangers au format ne sont jamais touchés. Deux tests verrouillent ce comportement,
dont un avec un disque local vide.

### 2.5 Aucun succès simulé — et un échec toujours nommé

| Situation | Comportement |
|---|---|
| Variables absentes | Réponse « non configurée » qui **nomme les variables manquantes** ; un problème est listé dans l'exploitation ; la sauvegarde locale reste valable |
| Identifiants refusés | Échec : « le service a refusé les identifiants (AccessDenied) : vérifiez … » |
| Seau ou région incorrects | Échec : la région et le style d'URL sont mis en cause nommément |
| Service injoignable | Échec après 2 reprises, avec le délai dépassé en clair |
| Fichier demandé mais absent du disque | Échec **nommé** : « aucun fichier local pour : … (dossier « … ») » — jamais un silence |
| Copie altérée | Copie **supprimée**, échec signalé |
| Échec d'envoi | La sauvegarde locale est **conservée**, une alerte administrateur est déposée, `job_runs` porte l'échec |

### 2.6 L'exploitation voit l'état réel

`GET /api/admin/ops` expose désormais un bloc `offsite` : configuré ou non (avec les variables
manquantes), points de terminaison et seau, nombre d'objets, octets, date du **dernier envoi** réel,
plus un problème listé si la copie externe ne se fait plus depuis 36 h. **Aucun secret** ne sort :
vérifié par test (ni clé d'accès, ni clé secrète, ni en-tête de signature).

## 3. 📁 Fichiers

| Fichier | Rôle |
|---|---|
| `apps/api/src/lib/offsite.ts` (nouveau) | Client S3 (signature V4), envoi vérifié, rétention distante, essai de restauration externe, état lisible |
| `apps/api/src/jobs/daily.ts` | Après la sauvegarde locale : envoi hors site, relecture, rétention, trace `offsite-backup` dans `job_runs` |
| `apps/api/src/routes/ops.ts` | `GET /admin/ops` (+ `offsite`, + problème), `POST /admin/backups/offsite`, `…/offsite-drill`, `…/offsite-download` |
| `apps/api/src/test/offsite-backup.test.ts` (nouveau) | 14 tests, faux service S3 **vérifiant la signature** |
| `apps/api/src/test/faux-s3.ts` (nouveau) | Faux service S3 pour les tests : refuse, altère, tombe en panne, **exige une signature valide** |
| `scripts/verifications/faux_s3.py` (nouveau) | Faux service S3 pour la CI (bibliothèque standard), qui **refuse toute requête non signée** |
| `scripts/verifications/chantier13_verif.py` (nouveau) | Vérification de bout en bout (22 contrôles) |
| `scripts/verifications/toutes.sh` | 13ᵉ script enregistré |
| `.github/workflows/ci.yml` | Faux service S3 démarré, API configurée dessus, dossier de sauvegardes dédié |
| `docs/SAUVEGARDE_HORS_SITE.md` (nouveau) | Configuration, garanties, procédure de **reprise après sinistre** |
| `.env.example` | Les 4 variables (+ 4 facultatives) documentées |

## 4. 🧪 Tests et preuves

| Contrôle | Résultat |
|---|---|
| `offsite-backup.test.ts` | **14/14** — non configuré, envoi + relecture + empreinte, altération détectée et retirée, refus 403, service injoignable, rétention (dont disque local vide), restauration depuis la copie externe, copie tronquée refusée, état d'exploitation sans secret, job quotidien + `job_runs` |
| `chantier13_verif.py` — service externe **configuré** | **22/22** : envoi réel, objet existant dans le stockage inspecté, empreintes comparées, **restauration depuis la copie externe (85 lignes, aucune table incomplète)**, téléchargement, refus d'une copie inexistante, fichier local introuvable nommé, rétention, état d'exploitation |
| `chantier13_verif.py` — service **non configuré** | **10/10** : l'API nomme les variables manquantes, n'annonce aucun succès, refuse l'envoi et l'essai de restauration |
| Bout en bout complet | **13 scripts** exécutés (voir le total du passage) |
| Types · lint | 0 erreur |

Un défaut a été trouvé **dans mon propre contrôleur de test** au passage : il hachait le corps de la
requête en texte UTF-8, ce qui altère les données binaires (le gzip) et refusait à tort les envois
corrects. C'est le genre d'erreur qu'un faux service « qui dit toujours oui » n'aurait jamais révélée.

## 5. ⚠️ Ce qui reste à faire (côté humain, pas côté code)

1. **Créer le seau et la clé** chez l'hébergeur (Cloudflare R2 ou Scaleway recommandés : données en
   Europe, pas de frais de sortie), renseigner les 4 variables sur Vercel.
2. **Lancer une fois** : sauvegarde → envoi hors site → essai de restauration externe, et **regarder le
   rapport** (les trois se vérifient en une minute dans l'exploitation).
3. **Décider la politique de conservation** (`BACKUP_OFFSITE_KEEP`, 14 par défaut).
4. **Inscrire la procédure de reprise** dans le runbook d'astreinte : elle est écrite telle quelle dans
   `docs/SAUVEGARDE_HORS_SITE.md`.

## 6. ➡️ Suivant

Les bloquants de l'audit n°3 restants sont **hors code** : mise en ligne (Vercel + Neon, `APP_URL`),
**réinitialisation du mot de passe Neon et révocation des jetons GitHub**, configuration de
l'encaissement Stripe, et la **recette terrain par 3 restaurateurs**. Côté produit, les deux autres
chantiers proposés par l'audit restent ouverts : **14 — intégrer le jour 1 au parcours guidé** et
**15 — en-têtes de sécurité sur le document** (CSP, X-Frame-Options), tous deux plus courts que
celui-ci.
