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

## Mise à jour du 17 novembre 2026

| | |
|---|---|
| SHA contrôlé | arbre de `be6d05b86b99b34ddc3ab7592b7e3d6a0f80d3f6` complété par le commit qui porte cette mise à jour (à lire sur la demande de fusion n° 1) |
| Environnements | Production (`/api/status`, page publique) ; boîte du titulaire (expéditeur, objet et date des messages de l'application) ; base embarquée et faux prestataire pour les tests. **Le tableau de bord du prestataire n'a pas été lu** |

Les statuts sont définis dans `docs/VALIDATION_ETAT_INITIAL_FUSION.md`.

| Point | Constat | Statut |
|---|---|---|
| Expéditeur de la production | `onboarding@resend.dev`, l'expéditeur d'essai du prestataire | PROUVÉ — production |
| Ce que cet expéditeur permet | Le mail du matin arrive chaque jour dans la boîte du titulaire du compte du prestataire (29 jours sur 29 du 20 octobre au 17 novembre). Le prestataire remet donc bien — à cette seule adresse | PROUVÉ — boîte du titulaire |
| Tâche d'alertes en production | « error » le 16 novembre, après 22,3 secondes | PROUVÉ — production |
| Message donné à la personne quand l'envoi échoue, à l'inscription et au renvoi du lien | Qualifié : réessayer plus tard, vérifier l'adresse, ou envoi de la plateforme non opérationnel. Avant : toujours « non configuré » | CORRIGÉ — 2 tests |
| Ce qui entre dans la réponse et dans le journal d'audit | Un motif seulement ; ni le texte du prestataire, ni une adresse | CORRIGÉ — mêmes tests |
| Tâche d'alertes : durée | Ne visite que les restaurants à servir ; s'arrête à un temps imparti, dit combien il en reste, reprend au passage suivant sans doublon | CORRIGÉ — 2 tests |
| Lien de confirmation | Jeton de 32 octets aléatoires, conservé sous forme d'empreinte, valable 48 heures, à usage unique ; un jeton falsifié ou tronqué est refusé et ne consomme pas le vrai ; cinq renvois par quart d'heure, puis refus | PROUVÉ — tests |
| Site | Le bandeau ne promet aucun envoi ; le motif s'affiche au clic sur « Renvoyer le lien » | PROUVÉ — test du site |
| Envoi réel à un tiers | Jamais constaté | EN ATTENTE EXTERNE |

Limites : les essais d'envoi utilisent un faux prestataire ; le texte des sept erreurs explicites relevées
le 13 novembre reste à lire dans le tableau de bord du prestataire.

Demandé au titulaire : vérifier un domaine d'envoi, poser `MAIL_FROM` sur ce domaine, puis dérouler
`RESEND_VALIDATION_PREVIEW.md`. Sans attendre : `docs/PLAN_REPRISE_PRODUCTION.md`, § 3, P2.

## Mise à jour du 17 novembre, seconde passe

| Point | Constat | Statut |
|---|---|---|
| Balayage des alertes avec l'expéditeur d'essai | Il sollicitait le prestataire pour **chaque** restaurant : autant d'appels rejetés par passage, un risque de limite de débit et une ligne de suivi illisible. Il s'arrête désormais au premier restaurant qui n'a rien reçu (`sweepBlocker`) | CORRIGÉ — 3 tests |
| Le titulaire du compte du prestataire | Il reste servi : si son adresse figure parmi les destinataires d'un restaurant, l'envoi lui parvient et le balayage continue | PROUVÉ — test |
| Confirmation indépendante, côté boîte du titulaire | Le courrier du matin y arrive chaque jour à 05 h 21 UTC (13, 14, 15, 16 et 17 novembre), et à cette seule adresse : le prestataire remet bien, mais à son seul titulaire de compte | PROUVÉ — boîte du titulaire |
| Workflow quotidien « Daily digest » | En échec chaque jour à l'étape « Résumé (et échec si le job a échoué) », après une étape de déclenchement **réussie** : l'API répond, l'échec vient des restaurants en erreur d'envoi. Journaux détaillés non lisibles depuis l'environnement de l'agent (`results-receiver.actions.githubusercontent.com` injoignable) | PROUVÉ — API GitHub ; détail à confirmer dans l'interface |

Ces deux constats convergent : en production, la remise à un tiers est impossible tant que l'expéditeur
reste l'adresse d'essai. Aucune correction de code ne peut lever ce point ; il faut un domaine vérifié
et un `MAIL_FROM` sur ce domaine (`RESEND_VALIDATION_PREVIEW.md`).
