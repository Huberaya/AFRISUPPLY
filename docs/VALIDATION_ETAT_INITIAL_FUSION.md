# État initial avant fusion : ce que disent les rapports, ce que montrent les services

| | |
|---|---|
| Date du relevé | 17 novembre 2026, entre 11 h 30 et 12 h UTC |
| SHA contrôlés | `main` = `15c8b81e665ab0b01e35e76fbae5f22c9c0271b0` ; tête de la branche au moment du relevé = `be6d05b86b99b34ddc3ab7592b7e3d6a0f80d3f6`. Le commit qui porte ce fichier se lit sur la demande de fusion n° 1 |
| Environnements lus | GitHub (API, plateforme réelle) ; production (deux pages publiques, en lecture) ; boîte de réception du titulaire (notifications des prestataires, par le connecteur qu'il a activé) ; poste de l'agent (base PostgreSQL embarquée, données fictives) |
| Environnements non lus | Neon, Clerk, tableau de bord Vercel, tableau de bord du prestataire d'e-mails, prévisualisation Vercel |
| Écritures | Aucune sur un service. Aucun e-mail envoyé, modifié ni supprimé. Aucune fusion, aucun déploiement demandé, aucune migration |

**Statuts employés dans les documents de cette mission**

| Statut | Sens |
|---|---|
| **PROUVÉ** | Preuve lue sur le service réel, ou rejouée par un test automatisé (la nature de la preuve est toujours précisée) |
| **CORRIGÉ** | Défaut corrigé dans la branche, avec un test qui échoue si la correction est retirée |
| **EN ATTENTE EXTERNE** | Opération hors de portée de l'agent, non réalisée ou non constatée |
| **BLOQUÉ** | Empêche la fusion ou la mise en production tant qu'une décision ou une opération n'a pas eu lieu |
| **NON APPLICABLE** | Sans objet pour cette demande de fusion |

## 1. Identité, relevée sur GitHub

| Point | Valeur relevée | Statut |
|---|---|---|
| `main` | `15c8b81`, dernier commit du 5 octobre 2026 ; aucun commit depuis la création de la branche | PROUVÉ |
| Protection de `main` | `protected: false` : aucune règle | PROUVÉ |
| Branches distantes | deux : `main` et `arena/326bcc8c-afrisupply` | PROUVÉ |
| Demandes de fusion | une seule, n° 1 : ouverte, brouillon, 12 commits, 183 fichiers, +15 064 / −2 893, « fusionnable, sans conflit » | PROUVÉ |
| Travaux parallèles | aucun : ni autre branche, ni autre demande de fusion, ni commit sur `main` | PROUVÉ |
| CI sur `be6d05b` | exécution `43417700631` (13 novembre, 11 h 31 UTC) : quatre tâches réussies — qualité, rôle PostgreSQL minimal, vérifications de bout en bout, parcours du navigateur | PROUVÉ |
| Vercel sur `be6d05b` | statut « Vercel » réussi (projet `afrisupply-api`) ; un déploiement « Preview » enregistré par GitHub (projet `afrisupply`), le 13 novembre à 11 h 32 UTC | PROUVÉ |
| Vercel sur `15c8b81` | un déploiement « Production », du 5 octobre 2026 | PROUVÉ |
| Dépôt | public ; fusion par commit de fusion, par écrasement ou par rebasage autorisées | PROUVÉ |

## 2. La production telle qu'elle répond le 17 novembre

Lecture de `/api/health` et de `/api/status`, deux pages publiques, à 11 h 48 UTC. Aucune de ces deux
pages ne déclenche de tâche.

| Point | Valeur relevée | Lecture |
|---|---|---|
| Code en ligne | `commit: 15c8b81`, `env: production` | **Aucune correction de la branche n'est en production.** Le défaut critique de connexion y est donc toujours |
| Région des fonctions | `iad1` (États-Unis) | La branche les place à Francfort (`fra1`) ; sans effet tant qu'elle n'est pas en ligne |
| Base | joignable, 1 083 ms pour la sonde | — |
| État global | `ok: false` | Trois tâches sur quatre sont hors de leur état normal |
| Passe quotidienne | dernière passe **enregistrée** : 23 septembre 2026, « partielle » | Le mail du matin part pourtant chaque jour (§ 3) : la passe tourne, mais n'écrit plus sa trace. C'est le défaut décrit au chantier P0.4, corrigé dans la branche |
| Rappels | « ok », le 16 novembre à 14 h 42 UTC | — |
| Tâche d'alertes | « error », le 16 novembre à 14 h 42 UTC, après 22,3 secondes | En erreur à sa dernière exécution (les rapports du 13 novembre comptaient 61 passages en erreur) ; durée cohérente avec un balayage de tous les restaurants (§ 5.3) |
| Sauvegarde | « périmée » : dernière réussie le 5 octobre ; 0 fichier conservé | Aucune sauvegarde exploitable |
| E-mails | prestataire configuré ; expéditeur `onboarding@resend.dev` | **Expéditeur d'essai** : le prestataire ne remet qu'à l'adresse du titulaire de son propre compte |
| SMS, suivi d'erreurs | non configurés | — |

## 3. Ce que montre la boîte de réception du titulaire

Relevé limité aux messages des prestataires du projet (expéditeur, objet, date) ; deux messages
ouverts. Cette boîte ne montre que ce qui est arrivé à **une** adresse : elle ne dit rien des autres destinataires.

| Constat | Détail | Lecture |
|---|---|---|
| Le mail du matin arrive tous les jours | 29 jours sur 29 du 20 octobre au 17 novembre, à 5 h 21 UTC, expéditeur `onboarding@resend.dev` | La passe quotidienne s'exécute en production et le prestataire remet bien **à cette adresse** — celle du titulaire du compte du prestataire |
| Autres e-mails de l'application | une facture et un message de bienvenue, le 4 octobre | — |
| E-mail de confirmation d'adresse | aucun sur 150 jours, courrier indésirable et corbeille compris | Aucun lien de confirmation n'a été reçu à cette adresse |
| Notification Vercel du 5 novembre | « offre gratuite : 100 % du stockage des fonctions inclus (10 Go) utilisé », pour toute l'équipe | La nature de la limite est identifiée (`VALIDATION_VERCEL_PREVIEW.md`, § 2) |
| Échecs de déploiement signalés par Vercel | pour ce projet : trois dates, toutes en septembre. En novembre : plusieurs dizaines, pour d'autres projets de la même équipe | Le quota est partagé avec d'autres projets |

## 4. Les rapports du dépôt comparés aux faits

| Ce qu'affirmaient les rapports du 13 novembre | Constat du 17 novembre | Statut |
|---|---|---|
| `main` inchangé à `15c8b81` ; production : aucun changement | Même SHA sur GitHub et dans la réponse de la production | PROUVÉ |
| Demande de fusion n° 1 en brouillon, fusionnable | Identique | PROUVÉ |
| « Toutes les tâches CI vertes : à constater sur le dernier commit » | Quatre tâches réussies sur `be6d05b` | PROUVÉ |
| 785 tests (base 5, API 691, site 89) | Les journaux de l'exécution ne sont pas téléchargeables depuis le poste de l'agent : le décompte n'a pas été relu sur GitHub. Rejoué localement sur l'arbre mis à jour (`docs/audits/VALIDATION_CI_FINALE.md`, mise à jour du 17 novembre) | PROUVÉ pour le résultat des tâches ; décompte non relu sur la plateforme |
| E-mails de production : expéditeur d'essai, un seul destinataire servi | Confirmé par la production elle-même et par la boîte du titulaire | PROUVÉ |
| Tâche d'alertes en erreur ; passes quotidiennes partielles | Confirmé (§ 2) | PROUVÉ |
| Aucune sauvegarde conservée | Confirmé (§ 2) | PROUVÉ |
| `main` sans protection | Confirmé | PROUVÉ |
| Deux projets Vercel construisent chaque envoi | Confirmé (§ 1) | PROUVÉ |
| Nature de la limite Vercel « non vérifiée » | Identifiée par la notification du prestataire (§ 3) | PROUVÉ pour la nature ; niveau actuel non lu |
| 16 vulnérabilités d'outils de développement, 0 en production | Relevé identique avant correction : 16 (14 modérées, 2 élevées), 0 en production. Ramenées à 4 dans cette mission | PROUVÉ, puis CORRIGÉ en partie |
| `cron-daily.yml` « n'affiche que des compteurs » | Vrai pour la version de la branche. **Faux pour la version qui s'exécute**, celle de `main` (§ 5.1) | **ÉCART** |
| Connecteur Vercel de l'agent refusé | Toujours refusé le 17 novembre (liste des projets : « accès refusé ») | PROUVÉ |
| Prévisualisation branchée sur une copie de la production | Non relu : Neon est hors de portée, et la prévisualisation du dernier commit exige une connexion Vercel | EN ATTENTE EXTERNE |

## 5. Écarts nouveaux, trouvés pendant ce relevé

### 5.1 Le déclencheur de secours de GitHub échoue chaque jour, et son journal est public

- Le workflow « Daily digest » (`.github/workflows/cron-daily.yml`) s'exécute dans sa version de `main`.
  Ses 55 dernières exécutions, du 23 septembre au 16 novembre, sont **toutes en échec**. Le 16 novembre :
  l'appel de la passe quotidienne réussit, l'étape de résumé échoue.
- Dans cette version, l'étape de résumé écrit dans le journal **le nom de chaque restaurant traité**, le
  résultat de son mail et le texte de l'erreur éventuelle. Le dépôt est public : ces journaux sont
  consultables par toute personne connectée à GitHub.
- Limite : l'agent n'a pas pu télécharger ces journaux (hôte de stockage hors de sa portée). Leur
  contenu est déduit de la lecture du fichier de `main`, non d'une lecture des journaux.
- Statut : **CORRIGÉ dans la branche** (sa version n'écrit que des compteurs, et relance la passe
  jusqu'à ce qu'elle soit complète), donc **sans effet tant que la branche n'est pas fusionnée**. Même
  corrigé, ce workflow restera en échec tant que des envois d'e-mails sont refusés — mais sans aucun nom.
  Gestes possibles dès maintenant, au choix du titulaire : désactiver ce workflow dans l'onglet
  « Actions » de GitHub, et supprimer les journaux des exécutions passées. L'agent n'a fait ni l'un ni l'autre.

### 5.2 Une migration écrite à la main avait laissé l'outil de migration sans repère

- La migration n° 28 (`0028_clerk_auth.sql`) a été écrite à la main, sans l'instantané de schéma que
  l'outil produit d'ordinaire. Conséquence : la **prochaine** migration générée aurait rejoué
  l'ajout de la colonne `clerk_id` — et échoué en production (« la colonne existe déjà »).
- Statut : **CORRIGÉ**. L'instantané manquant est ajouté (`packages/db/drizzle/meta/0028_snapshot.json`,
  fichier de métadonnées : aucune instruction SQL, journal des migrations inchangé, toujours 29 migrations),
  et un contrôle automatique vérifie désormais que le schéma du code ne contient rien d'absent des
  migrations (`npm run check:schema`, exécuté par la CI). Essai contraire fait : une colonne ajoutée au
  schéma sans migration, puis l'instantané retiré — le contrôle échoue dans les deux cas.
- Aucune migration n'a été ajoutée ni exécutée.

### 5.3 La tâche d'alertes parcourait tous les restaurants

- En production, la tâche dure 22 secondes (89 restaurants au relevé du 13 novembre) : le code de `main`
  visite chaque restaurant, qu'il ait une alerte à envoyer ou non. La durée croît avec le nombre de clients ; la fonction est limitée à 60 secondes.
- Statut : **CORRIGÉ**. La tâche ne visite plus que les restaurants qui ont une alerte à envoyer, les
  plus anciennes d'abord ; elle s'arrête au bout d'un temps imparti (30 secondes sur Vercel), dit combien
  il en reste, et le passage suivant sert exactement le reste. Essais contraires faits : sans la limite
  de temps, puis avec l'ancienne sélection — un test échoue dans les deux cas.
- Sur la plateforme : EN ATTENTE EXTERNE (aucune prévisualisation exploitable).

### 5.4 À l'inscription, un envoi refusé était annoncé comme « non configuré »

- Statut : **CORRIGÉ**. La réponse dit désormais ce que la personne peut faire : réessayer plus tard,
  vérifier son adresse, ou prévenir le support quand l'envoi de la plateforme n'est pas opérationnel
  (cas de la production). Ni le texte du prestataire ni une adresse n'entrent dans la réponse ; le
  journal d'audit ne garde que le motif. Le site affiche ce message au clic sur « Renvoyer le lien ».

## 6. Limites de ce relevé

- Neon, Clerk, les variables Vercel et le tableau de bord du prestataire d'e-mails n'ont pas été lus.
- Les relevés faits sur Neon après le 13 novembre par une autre personne ne sont pas retranscrits ici :
  ils sont à reporter dans `VALIDATION_NEON_PREVIEW.md` (§ 4) par qui les a faits.
- La production n'est connue que par ses deux pages publiques ; le diagnostic détaillé
  (`/api/status/config`) exige le secret des tâches planifiées, que l'agent n'a pas.
- Les rapports de l'audit P0.1 restent hors du dépôt : leur sort attend une décision du titulaire.

## 7. Ce que ce relevé demande au titulaire

| # | Geste | Pourquoi |
|---|---|---|
| 1 | Onglet « Actions » de GitHub : regarder le journal d'une exécution de « Daily digest », puis décider de désactiver ce workflow et de supprimer ses journaux | § 5.1 : noms de clients dans un journal public |
| 2 | Vercel, « Usage » de l'équipe : relever le niveau actuel du stockage des fonctions | § 3 : la notification date du 5 novembre |
| 3 | Reporter les relevés Neon récents dans `VALIDATION_NEON_PREVIEW.md` | § 6 |
