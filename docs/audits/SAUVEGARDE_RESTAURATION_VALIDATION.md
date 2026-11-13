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
