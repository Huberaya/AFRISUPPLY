# Sauvegardes et restauration : validation (chantier P0-K)

13 novembre 2026.

**Résumé.** Le code de sauvegarde et de restauration est prouvé sur des données fictives, en
environnement isolé. **En production, rien n'est opérationnel** : aucune sauvegarde n'est conservée,
aucune copie externe n'est configurée. La seule protection est l'historique de Neon, dont la durée reste à relever.

## 1. Ce que fait le code

| Point | Constat | Preuve |
|---|---|---|
| Format | Export JSON compressé, par restaurant et pour la plateforme | `apps/api/src/lib/backup.ts` |
| Intégrité | Empreinte SHA-256 enregistrée et revérifiée ; une archive altérée est détectée | `ops-backup.test.ts` ; script de bout en bout n° 12 (71 vérifications) |
| Rétention | 14 fichiers par défaut (`BACKUP_KEEP`), rotation testée | idem |
| Copie externe | Dépôt sur un stockage compatible S3, relecture, puis restauration d'essai depuis la copie | `offsite-backup.test.ts` — stockage **simulé**, signatures réelles |
| Restauration | Uniquement dans une base **vide** : refus d'écraser une base qui contient des données | `ops-backup.test.ts` |
| Numérotation après restauration | Les compteurs de commandes, de factures et de litiges repartent du plus grand numéro existant | `billing-invoices.test.ts`, `reference` |
| Alerte en cas d'échec | La tâche de sauvegarde est suivie (seuil : 30 h) ; un retard alerte l'exploitant et paraît sur `/api/status` | `backup-echec-visible.test.ts` |
| Erreurs | Un échec de sauvegarde est écrit dans la ligne de suivi, jamais avalé | idem |
| Avec le rôle PostgreSQL minimal | Toute la suite de sauvegarde et de restauration passe | tâche « rôle minimal » |
| **Chiffrement** | **L'archive n'est pas chiffrée par l'application.** Elle est compressée, envoyée en HTTPS ; son chiffrement au repos dépend du stockage choisi | lecture du code |
| Séparation | Les sauvegardes locales vivent sur le disque de la fonction, qui disparaît avec elle : sans copie externe, rien n'est conservé | `/api/status` de production : 0 fichier |

Statut de preuve : **confirmé par test automatisé** sur base PostgreSQL embarquée, données fictives ;
copie externe **confirmée par simulation**. **Non vérifié** sur un stockage réel ni sur la production.

## 2. État de la production

| Point | État | Source |
|---|---|---|
| Sauvegardes conservées | 0 | `/api/status`, 12 novembre |
| Dernière tâche de sauvegarde réussie | 5 octobre 2026 | idem |
| Copie externe | non configurée | idem ; variables non lues |
| Historique de Neon | seule protection ; **durée de conservation non relevée** | `LEVEE_RESERVES_NEON.md`, N10 |

## 3. Procédure de restauration sur base isolée

À faire sur une base neuve, jamais sur la production.

1. Créer une base vide (`packages/db/sql/base_neuve.sql`) et y brancher une instance d'essai de l'application.
2. Back-office → Exploitation → Sauvegardes : choisir le fichier, « Vérifier » (empreinte), puis « Restaurer ». L'API refuse si la base n'est pas vide.
3. Contrôler : nombre de lignes par table annoncé par la restauration ; une commande et une facture créées ensuite reçoivent un numéro supérieur au dernier existant.
4. Depuis la copie externe : même écran, « Essai de restauration hors site » — l'archive est téléchargée, vérifiée, restaurée dans une base jetable, comptée.

Détail et reprise après sinistre : `docs/SAUVEGARDE_HORS_SITE.md`.

## 4. Objectifs proposés — non mesurés en production

| | Aujourd'hui | Avec copie externe quotidienne |
|---|---|---|
| Perte de données maximale (RPO) | Durée de l'historique de Neon, inconnue | 24 heures au plus par les sauvegardes ; moins dans la fenêtre de l'historique de Neon |
| Délai de remise en service (RTO) | Non défini, jamais répété | Cible : moins de 2 heures pour le volume actuel (96 comptes, 89 restaurants, 50 commandes) — **à mesurer** lors d'un essai réel |

## 5. Choix d'un stockage externe — décision du titulaire

Critères : compatible S3 ; région de l'Union européenne ; chiffrement au repos ; versions ou verrouillage
des objets (une sauvegarde ne doit pas pouvoir être effacée par la clé qui l'écrit) ; clé limitée à un
seul espace. Volume attendu : quelques mégaoctets par jour. Les tarifs ne sont pas relevés ici : ils se
lisent chez le fournisseur retenu au moment du choix. **Aucune ressource n'a été créée.**

## 6. Critères de sortie

| Critère | État |
|---|---|
| Sauvegarde valide, intégrité vérifiée | Rempli (test automatisé) |
| Restauration testée sur environnement isolé | Rempli (base embarquée, données fictives) |
| Procédure documentée | Rempli |
| Alertes en cas d'échec | Rempli (test automatisé) |
| Sauvegardes opérationnelles en production | **Non rempli — EN ATTENTE EXTERNE** : stockage à décider et à créer |

## Mise à jour du 17 novembre 2026

| | |
|---|---|
| SHA contrôlé | arbre de `be6d05b86b99b34ddc3ab7592b7e3d6a0f80d3f6` complété par le commit qui porte cette mise à jour (à lire sur la demande de fusion n° 1) |
| Environnements | Production (`/api/status`, page publique) ; base embarquée et faux stockage pour les tests |

Les statuts sont définis dans `docs/VALIDATION_ETAT_INITIAL_FUSION.md`.

| Point | Constat | Statut |
|---|---|---|
| Sauvegardes de production | 0 fichier conservé ; tâche « périmée » ; dernière réussie le 5 octobre | PROUVÉ — production |
| Code de sauvegarde et de restauration | Suite rejouée, y compris sous le rôle minimal | PROUVÉ — tests, stockage simulé |
| Copie externe réelle | Aucune | EN ATTENTE EXTERNE — décision du titulaire |

**Pour décider du stockage.** Le code accepte tout stockage compatible S3 (variables `BACKUP_S3_*`). Au
volume attendu — une base d'une centaine de comptes, quatorze archives conservées, donc très en dessous
d'un gigaoctet : estimation, la production n'ayant aucune archive à mesurer — le prix ne départage pas
les offres. Ce qui compte : la localisation des données et le chiffrement au repos, puisque l'archive
n'est pas chiffrée par l'application.

| Offre | Ordre de grandeur public, par gigaoctet et par mois | Localisation |
|---|---|---|
| Cloudflare R2 | 0,015 $ ; 10 Go offerts ; sortie gratuite | prestataire américain ; localisation européenne à vérifier |
| Backblaze B2 | environ 0,007 $ ; 10 Go offerts | prestataire américain ; localisation européenne à vérifier |
| Scaleway Object Storage | environ 0,01 à 0,016 € | France |
| OVHcloud Object Storage | environ 0,007 à 0,014 € | France |

Tarifs relevés en novembre 2026 sur la page de Cloudflare (`https://developers.cloudflare.com/r2/pricing/`)
et dans des comparatifs publics (`https://tadata.fr/posts/object-storage-pricing`,
`https://technomind.fr/stockage-s3-fonctionnement-object-storage/`,
`https://shattered.io/backblaze-pricing-b2-vs-wasabi-r2-s3-gcs-2026/`) : à vérifier sur le site du
prestataire avant de choisir. Les colonnes « localisation » sont à confirmer à la création du compte.
