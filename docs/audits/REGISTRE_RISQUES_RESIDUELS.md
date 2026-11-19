# Registre des risques résiduels (chantier P0-M)

13 novembre 2026. Un risque n'est « levé » que sur preuve : ni une intention, ni un essai contre une simulation ne suffisent.

| # | Risque | Gravité | Probabilité | Impact | Preuve | Correction | Responsable | Condition de levée | Décision attendue |
|---|---|---|---|---|---|---|---|---|---|
| R1 | Défaut critique de connexion (`clerk-sync`) toujours en production | Critique | Possible dès qu'une adresse de client est connue | Prise de contrôle d'un compte, y compris d'exploitant | Reproduit sur le code de production (`15c8b81`) | Dans la branche ; 22 tests | Titulaire | Branche déployée ; `/api/health` montre son commit | Autorisation de fusion |
| R2 | L'exploitant perd ses écrans d'administration au déploiement | Élevée | Certaine en l'état : 0 adresse confirmée | Exploitation aveugle le jour du déploiement | Relevé Neon ; règle testée | Confirmer l'adresse par le lien reçu, avant la fusion | Titulaire | Adresse de l'exploitant confirmée en production | Domaine d'envoi (R3) |
| R3 | Aucun e-mail remis aux clients en production | Élevée | Constatée | Ni confirmation, ni alerte, ni mail du matin | 83 non remis pour 1 remis ; 61 passages d'alertes en erreur | Motifs et reprise dans la branche ; domaine d'envoi à vérifier | Titulaire | Un e-mail reçu sur une boîte extérieure ; tâche d'alertes « ok » | Domaine et expéditeur |
| R4 | Aucune sauvegarde conservée | Élevée | Constatée | Perte de données au-delà de l'historique de Neon | `/api/status` : 0 fichier | Code prouvé ; stockage à créer | Titulaire | Une sauvegarde externe relue et restaurée en essai | Stockage externe |
| R5 | Coordonnées de tiers dans l'historique public du dépôt | Élevée | Constatée depuis le 18 septembre | Exposition de 191 noms, 62 adresses, 134 téléphones | `DEPOT_PUBLIC_DONNEES_PERSONNELLES.md` | Retirées de la branche ; contrôle automatique | Titulaire | Dépôt privé, ou historique purgé et vérifié | Privé ou purge |
| R6 | La prévisualisation travaille sur une copie de la production | Élevée | Constatée | Données réelles manipulées par des essais | Relevé Neon : 96 / 89 / 50 de part et d'autre | Base neuve et procédure prêtes | ChatGPT, titulaire | `PREVIEW_DATABASE_URL` vers une base sans donnée réelle | Création de la base ; sort de la copie |
| R7 | L'application se connecte avec le rôle propriétaire ; aucune RLS | Moyenne | Faible : exige une faille du code | Une faille d'injection donnerait accès à tout | Relevé Neon ; diagnostic | Rôle minimal prêt ; RLS en chantier distinct | ChatGPT, titulaire | `database.role = afrisupply_app` en prévisualisation, puis en production | Passage de la production au rôle minimal |
| R8 | Deux événements `auth.clerk_sync` non qualifiés | À établir | À établir | Si usage du défaut : accès à un compte le 5 octobre | `QUALIFICATION_AUTH_CLERK_SYNC.md` | Relevés Q1 à Q6 ; révocation prête | Titulaire, ChatGPT | Conclusion écrite du titulaire | Qualification |
| R9 | Passe quotidienne non prouvée sur la plateforme | Moyenne | Moyenne | Mail du matin absent | Prouvée en local seulement | — | Agent, titulaire | `/api/status` : passe « ok » le lendemain du déploiement | — |
| R10 | Clerk jamais essayé contre le service réel | Moyenne | — | Connexion Clerk inutilisable en prévisualisation | Tests contre un faux service | Fiche prête | ChatGPT | `clerk.instance.same = true` et connexion d'essai | Méthode de connexion |
| R11 | `main` sans règle de protection | Moyenne | Faible | Envoi direct ou fusion sans contrôles | API GitHub : `protected: false` | — | Titulaire | Règle active : demande de fusion et contrôles verts exigés | Protection de `main` |
| R12 | Variables de production jamais lues par l'agent, dont `JWT_SECRET` | Élevée si le secret est absent ou court | Inconnue | L'API répondrait 503 au déploiement | Connecteur refusé | Lecture dans Vercel | Titulaire, ChatGPT | `JWT_SECRET` présent, 32 caractères, constaté | Portée du connecteur, ou lecture manuelle |
| R13 | Confirmation d'adresse en boucle (production actuelle) | Moyenne | Certaine pour une personne connectée | La page annonce une erreur après une confirmation réussie | Journal du parcours ; test | Corrigé dans la branche | Titulaire | Branche déployée | Autorisation de fusion |
| R14 | Sauvegardes non chiffrées par l'application | Moyenne | — | Dépend du stockage choisi | Lecture du code | Chiffrement au repos côté stockage | Titulaire | Stockage chiffré retenu | Stockage externe |
| R15 | 16 vulnérabilités d'outils de développement | Faible | Faible | Poste de développement seulement | `npm audit` | Demande de fusion séparée | Agent | `npm audit` : 0 | — |
| R16 | Cadence ou quota de déploiements Vercel | Faible | Constatée une fois | Mise en ligne retardée | Statut du commit `6292ccb` | Envois regroupés | Titulaire | Nature de la limite relevée ; second projet coupé | Second projet Vercel |
| R17 | Mentions légales inexactes, société non immatriculée | Élevée pour un pilote payant | Constatée | Engagements publics non tenus | `docs/chantiers/DOSSIER_COMMERCIALISATION.md` | Hors de cette mission | Titulaire | Mentions corrigées | Décisions de la société |

## Mise à jour du 17 novembre 2026

| | |
|---|---|
| SHA contrôlé | arbre de `be6d05b86b99b34ddc3ab7592b7e3d6a0f80d3f6` complété par le commit qui porte cette mise à jour (à lire sur la demande de fusion n° 1) |
| Environnements | GitHub, production (deux pages publiques), boîte du titulaire, base embarquée |

**Risques dont l'état a changé**

| # | Ce qui a changé | Statut |
|---|---|---|
| R1 | Relu : la production sert toujours `15c8b81`. Le défaut critique y est donc toujours | BLOQUÉ — levé par la mise en production de la branche |
| R2 | Une voie existe sans attendre le domaine d'envoi : `docs/PLAN_REPRISE_PRODUCTION.md`, § 3, P2 | BLOQUÉ — geste du titulaire |
| R3 | Confirmé par la production (expéditeur d'essai) et par la boîte du titulaire, servie chaque jour. À l'inscription, la personne est désormais informée du motif | PROUVÉ ; message CORRIGÉ ; remise EN ATTENTE EXTERNE |
| R4 | Relu : 0 fichier, dernière sauvegarde réussie le 5 octobre | PROUVÉ — EN ATTENTE EXTERNE |
| R9 | Confirmé en production : la dernière passe enregistrée date du 23 septembre, alors que le mail du matin part chaque jour | PROUVÉ en production ; CORRIGÉ dans la branche ; à constater après déploiement |
| R12 | Précision : la version en production accepte un secret de session absent et signe alors avec une valeur écrite dans le code, donc publique. La lecture de `JWT_SECRET` est à faire sans attendre la fusion | **BLOQUÉ** — jamais lu |
| R15 | 16 vulnérabilités d'outillage, puis 4 : ramenées à **0** le 17 novembre (seconde passe) par le passage de l'outil de migration en 0.31.11 ; 0 en production | CORRIGÉ |
| R16 | Nature de la limite identifiée : stockage des fonctions de l'offre gratuite à 100 % le 5 novembre, pour toute l'équipe | PROUVÉ ; réglages EN ATTENTE EXTERNE |

**Risques nouveaux**

| # | Risque | Gravité | Probabilité | Impact | Preuve | Correction | Responsable | Condition de levée | Statut |
|---|---|---|---|---|---|---|---|---|---|
| R18 | Le workflow quotidien de GitHub écrit le nom des restaurants dans un journal public | Élevée | Constatée dans le fichier de `main` ; journaux non lus | Liste de clients lisible par toute personne connectée à GitHub | `docs/VALIDATION_ETAT_INITIAL_FUSION.md`, § 5.1 | Dans la branche : compteurs seulement | Titulaire | Workflow désactivé ou branche fusionnée ; journaux passés supprimés | CORRIGÉ dans la branche ; journaux existants : BLOQUÉ — décision |
| R19 | Ce même workflow est en échec chaque jour depuis le 23 septembre (55 exécutions) | Moyenne | Constatée | Une alerte permanente n'alerte plus : une vraie panne passerait inaperçue | API GitHub | Version de la branche ; elle restera en échec tant que des e-mails sont refusés | Titulaire | Une exécution verte après la mise en ordre des e-mails | EN ATTENTE EXTERNE |
| R20 | La prochaine migration générée aurait rejoué la migration n° 28 et échoué en production | Moyenne | Certaine à la prochaine migration | Mise en production bloquée, ou schéma corrigé à la main | Essai : l'outil régénérait les trois instructions | Instantané ajouté ; contrôle en CI | Agent | — | CORRIGÉ |
| R21 | La durée de la tâche d'alertes croissait avec le nombre de restaurants (22 secondes pour 89) | Moyenne | Certaine avec la croissance | Tâche coupée par la limite de 60 secondes ; alertes non envoyées | `/api/status` de production | Tâche bornée, reprise au passage suivant | Agent, titulaire | Constat sur la plateforme après déploiement | CORRIGÉ dans la branche |
| R22 | Fusionner déclenche une mise en production automatique | Élevée si R2 ou R12 ne sont pas levés | Certaine | API en 503, ou exploitant sans administration | Six derniers déploiements de production créés par Vercel à chaque envoi sur `main` | Plan écrit ; voie « fusion sans mise en ligne » décrite, non appliquée | Titulaire | Préalables P1 à P3 du plan levés avant la fusion | BLOQUÉ |

| R23 | Une relance fournisseur dont l'envoi avait échoué était définitivement perdue (commande marquée relancée) | Moyenne | Certaine à chaque panne du prestataire | Un grossiste ne reçoit jamais la relance, sans trace d'erreur | Test reproduisant la panne puis la reprise | Marquage seulement après remise | Agent | — | CORRIGÉ |
| R24 | Une sauvegarde perdait les événements de fréquentation (`forecast_events`) | Moyenne | Certaine à chaque restauration | Prévisions faussées après restauration, sans avertissement | Test d'export et d'essai de restauration | Table ajoutée à l'export | Agent | — | CORRIGÉ |
| R25 | La garde « prévisualisation ≠ production » se contournait par l'orthographe de la chaîne de connexion | Élevée | Possible par erreur de saisie | Une prévisualisation écrivant dans la base de production | Test avec trois orthographes différentes de la même base | Comparaison de l'hôte, du port et de la base | Agent | — | CORRIGÉ |
| R26 | Le jeton Vercel de l'agent est à portée réduite (`limited: true`) | Faible | Constatée | Impossible de relire ou de poser les variables de la prévisualisation ; la condition 15 reste externe | `get_authenticated_user`, `list_teams` (vide), `list_projects` (refusé) | Jeton avec lecture des projets et des variables | Titulaire | Un appel `list_projects` réussi | EN ATTENTE EXTERNE |
