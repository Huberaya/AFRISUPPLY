# E-mails et tâche d'alertes : diagnostic (chantier P0-E)

13 novembre 2026. Aucun secret, aucune adresse.

## 1. Relevés de production (lecture indépendante)

| Relevé | Valeur |
|---|---|
| E-mails de confirmation « non remis » | 83 |
| E-mails de confirmation « remis » | 1 |
| Erreurs explicites du prestataire | 7 |
| Passages de la tâche d'alertes en erreur | 61, dont 54 avec pour seul motif « N restaurant(s) sans envoi possible » |
| Expéditeur | adresse d'essai du prestataire (`onboarding@resend.dev`) |

## 2. Cause

Avec son adresse d'essai, le prestataire ne remet qu'au titulaire de son propre compte et refuse tout
autre destinataire. Tout concorde : presque aucune confirmation remise, donc aucune adresse confirmée ;
aucune alerte remise, donc la tâche en erreur chaque jour. Le seul e-mail remis est vraisemblablement
adressé au titulaire du compte du prestataire. **Hypothèse forte, à confirmer** par le texte des 7 erreurs explicites.

Les 54 erreurs « non classées » viennent du code : la tâche écrivait combien de restaurants n'avaient
rien reçu, jamais pourquoi.

## 3. Défauts du code trouvés en instruisant ce chantier, corrigés

| Défaut | Correction | Preuve |
|---|---|---|
| Un seul code d'erreur (`send_failed`) pour tous les refus | Onze motifs : service non configuré, clé refusée, expéditeur d'essai, domaine non vérifié, expéditeur refusé, destinataire refusé, message refusé, limite de débit, panne, réseau, écriture locale | `levee-blocages-mail.test.ts`, 20 tests |
| **Le texte du prestataire était stocké et exposé** : il contient l'adresse e-mail du titulaire du compte, et sortait par la page de statut publique (`mail.stats.lastError`), les lignes de suivi et le suivi d'erreurs | Le texte du prestataire n'est plus ni renvoyé ni journalisé : seulement le motif et une phrase fixe | test « la page de statut publique ne montre que le motif » |
| Adresses complètes dans les journaux et les alertes d'exploitation | Masquées (`a***@domaine`) | tests de masquage |
| Un restaurant sans destinataire mettait la tâche en erreur | Compté à part (`skipped`), la tâche reste « ok » | test dédié |
| Quand l'échec vaut pour tous (clé, domaine, débit), le prestataire était sollicité pour chaque restaurant | Un seul appel, puis arrêt des envois pour ce passage | trois tests |
| La ligne de suivi ne disait pas pourquoi | Motifs comptés dans la ligne, cause en clair | test dédié |

Reprise et non-duplication : une alerte non remise n'est pas marquée et repart au passage suivant, une
seule fois (testé sur trois passages). Les erreurs d'envoi ne font plus échouer la tâche sans raison ;
elles la font échouer quand rien n'a pu partir, et la ligne dit pourquoi.

Statut de preuve : **confirmé par test automatisé**, prestataire **simulé**. Aucun envoi réel n'a été fait.

## 4. Où `MAIL_FROM` intervient

Un seul endroit : `apps/api/src/lib/mailer.ts` (`mailerConfig`). Sans la variable, l'expéditeur est
l'adresse du support. La configuration signale en production l'usage de l'adresse d'essai, et
`/api/status` l'expose (`checks.mail.testSender`).

## 5. Ce qu'il faut pour que les e-mails partent — décision et gestes du titulaire

1. Choisir le domaine d'envoi de la société. **Aucun domaine, aucune adresse, aucune valeur DNS n'est proposée ici** : ils se lisent dans le tableau de bord du prestataire au moment de l'ajout.
2. Ajouter ce domaine chez le prestataire ; créer chez l'hébergeur du domaine les enregistrements qu'il affiche ; attendre l'état « vérifié ».
3. Régler `MAIL_FROM` sur une adresse de ce domaine — d'abord en portée Preview (`RESEND_VALIDATION_PREVIEW.md`), puis en Production sur décision.

Tant que ce n'est pas fait en production : aucun client ne reçoit de confirmation, d'alerte ni de mail
du matin, et **l'exploitant ne peut pas confirmer son adresse** (`VALIDATION_PRE_FUSION.md`).
