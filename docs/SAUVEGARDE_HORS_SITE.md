# Sauvegarde hors site — copie externe, relue et restaurable

> Chantier 13 (audit n°3). Objectif : qu'une sauvegarde ne disparaisse pas avec la machine qui l'a
> produite. En serverless, le disque est **éphémère** : une sauvegarde qui vit à côté de la base
> qu'elle protège ne protège de rien.

## Ce qui existe maintenant

| Élément | Rôle |
|---|---|
| `apps/api/src/lib/offsite.ts` | Client de stockage compatible S3 (signature AWS V4, `node:crypto`, **zéro dépendance**) : envoi, relecture, liste, suppression, rétention, essai de restauration depuis la copie externe. |
| Job quotidien (`jobs/daily.ts`) | Après la sauvegarde locale, envoie chaque fichier hors site, **relit la copie**, compare le SHA-256, applique la rétention distante et trace le passage dans `job_runs` (job `offsite-backup`). |
| `POST /api/admin/backups/offsite` | Envoie maintenant (tous les fichiers ou une liste), avec la rétention. |
| `POST /api/admin/backups/offsite-drill` | **La preuve** : télécharge la copie depuis le stockage externe, la vérifie, la recharge dans une base neuve et jetable, recompte les lignes. |
| `POST /api/admin/backups/offsite-download` | Ramène une copie externe sur le serveur (premier geste d'une reprise après sinistre). |
| `GET /api/admin/ops` → `offsite` | État réel : configuré ou non (avec les variables manquantes), nombre d'objets, octets, date du dernier envoi. |
| `scripts/verifications/chantier13_verif.py` | Vérification de bout en bout sur une API réelle, avec un faux service S3 local qui **exige une requête signée**. |

## Configuration

Quatre variables suffisent. Elles se lisent **à chaque appel** : une correction prend effet sans redéployer.

```bash
BACKUP_S3_ENDPOINT=https://<compte>.r2.cloudflarestorage.com   # ou s3.eu-west-3.amazonaws.com, s3.fr-par.scw.cloud, s3.eu-central-003.backblazeb2.com…
BACKUP_S3_BUCKET=afrisupply-sauvegardes
BACKUP_S3_ACCESS_KEY_ID=…
BACKUP_S3_SECRET_ACCESS_KEY=…
# Facultatif
BACKUP_S3_REGION=auto                 # « auto » pour R2/Scaleway ; région réelle pour AWS/B2
BACKUP_S3_STYLE=path                  # « path » (défaut) ou « virtual »
BACKUP_S3_PREFIX=afrisupply/backups   # préfixe des objets dans le seau
BACKUP_OFFSITE_KEEP=14                # nombre de sauvegardes conservées PAR RESTAURANT hors site
```

Hébergeurs compatibles S3 : **Cloudflare R2** (pas de frais de sortie), **Backblaze B2**, **Scaleway
Object Storage** (France), **AWS S3**, **MinIO** (auto-hébergé). Créez un seau **privé** et une clé
limitée à ce seau (écriture + lecture + liste + suppression : la rétention supprime).

> Sans configuration, rien n'est simulé : l'API répond « non configurée » en **nommant les variables
> manquantes**, l'exploitation le listera comme un problème, et la sauvegarde locale reste valable.

## Ce qui rend cette copie crédible

1. **Une copie n'est comptée que si elle est relue.** Après l'envoi, le fichier est re-téléchargé et
   son empreinte SHA-256 comparée. Si elle diffère, la copie est **supprimée** et l'échec est signalé :
   mieux vaut pas de copie qu'une copie qui donne l'illusion d'exister.
2. **La preuve est une restauration.** `offsite-drill` part de la copie **externe** : téléchargement →
   vérification du format et de l'empreinte → base neuve et jetable → migrations → restauration →
   recomptage indépendant des lignes. C'est ce résultat, et lui seul, qui autorise à dire « nous
   savons restaurer ».
3. **La rétention distante ne s'appuie jamais sur le disque local.** Elle liste le stockage externe et
   ne supprime un objet que si une copie **plus récente du même restaurant** y existe déjà. Une
   instance neuve, au disque vide, ne peut donc pas effacer une archive (cas testé).
4. **Aucun succès simulé.** Refus d'identifiants, seau inexistant, région incorrecte, service
   injoignable : chaque cas produit un **échec nommé** (et une alerte administrateur), jamais un `ok`.

## Reprise après sinistre — la marche à suivre

1. **Vérifier ce qui existe vraiment** : `GET /api/admin/ops` → bloc `offsite` (objets, octets, date),
   et/ou lister le seau (`aws s3 ls s3://<seau>/afrisupply/backups/ --recursive`).
2. **Prouver que la copie est utilisable** : `POST /api/admin/backups/offsite-drill` avec le nom du
   fichier (ou sans nom : la dernière copie est utilisée). Le rapport donne les lignes restaurées et
   la liste des tables incomplètes.
3. **Ramener la copie** : `POST /api/admin/backups/offsite-download { "name": "afs-…-admin.json.gz" }`.
4. **Restaurer** dans la base : `POST /api/admin/backups/restore { "name": "…", "confirm": "RESTAURER" }`
   (refusé si la base contient déjà des restaurants, sauf `force: true` — volontaire).
5. **Remettre les mots de passe** : le fichier `admin` contient les empreintes ; les comptes
   fonctionnent donc à l'identique. Un fichier `owner` (téléchargé par le restaurant) n'en contient
   pas : chaque membre doit alors choisir un nouveau mot de passe.

## Ce qu'il reste à faire côté humain

- Créer le seau et la clé chez l'hébergeur, renseigner les 4 variables, **puis lancer** :
  une sauvegarde + un envoi hors site + un essai de restauration externe (les trois se vérifient en
  une minute dans le back-office d'exploitation).
- Vérifier que la rotation hors site correspond à la politique voulue (14 sauvegardes par restaurant
  par défaut).
- Noter dans le runbook d'astreinte la procédure ci-dessus (elle est copiable telle quelle).
