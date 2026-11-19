# Dossier de commercialisation — première version

Point au 12 novembre 2026. Ce dossier distingue, fonction par fonction, ce qui est **opérationnel**
(démontré par un essai reproductible), ce qui est **annoncé** par le site sans être démontré, et ce qui
**manque**. Il sera complété à mesure que les interventions Neon, Clerk et Vercel reviennent.

État du chantier : EN COURS. Verdict actuel : **le produit n'est pas prêt pour un pilote payant**.
Les cinq raisons, par ordre de gravité, sont au paragraphe 4.

## 1. Le cœur du produit, écran par écran

| Fonction | Dans le dépôt (branche de correction) | En production aujourd'hui | Statut |
|---|---|---|---|
| Inscription, connexion | Démontré dans un navigateur et par l'API | En ligne, mais avec le défaut critique `clerk-sync` non corrigé | Bloqué par la fusion |
| Démarrage guidé (7 étapes) | Écran affiché, étapes listées ; la saisie des étapes n'est pas encore pilotée par le navigateur | En ligne | À compléter (P0.6) |
| Fournisseurs | Création démontrée dans un navigateur — **après correction d'un défaut qui empêchait un nouveau client de créer son premier fournisseur** | Le défaut est en ligne | Bloqué par la fusion |
| Import de produits | Par fichier : démontré par l'API. Par photo : dépend d'un service d'IA non vérifié | Inconnu | Opérationnel par fichier |
| Stock, prévision | Démontré par l'API (cascade de sources, jours fermés, saisonnalité) | En ligne | Opérationnel |
| Commande | Démontré par l'API (commande, envoi, statuts) | En ligne | Opérationnel |
| Réception, écarts | Démontré par l'API (écart détecté, chiffré, alerté) | En ligne | Opérationnel |
| Mail du matin, alertes | Le contenu est démontré ; la passe quotidienne est fiabilisée dans la branche | **Aucun mail du matin depuis le 2026-09-23** ; la tâche d'alertes est en erreur | Bloqué : fusion, puis domaine d'envoi |
| Notifications SMS / WhatsApp | L'API dit honnêtement « non en service » | Non configuré | Annoncé, non opérationnel |
| Abonnement, paiement | Démontré contre un faux service de paiement | Inconnu ; sans configuration, la page affiche « paiement en ligne pas encore ouvert » | Non démontré en réel |
| Équipe, rôles | Démontré dans un navigateur et par 76 routes × 3 rôles | Les 18 routes mal protégées sont en ligne | Bloqué par la fusion |
| Export et suppression du compte | Démontré par l'API | En ligne | Opérationnel |
| Sauvegardes | Démontré (fichier vérifié, restauration dans une base neuve, copie externe) | **0 sauvegarde conservée** ; copie externe non configurée | Annoncé, non opérationnel |

## 2. Ce que le site promet, comparé aux faits

Relevé sur les pages publiques du dépôt (mentions légales, conditions générales, page de statut, page
d'abonnement). Chaque ligne demande une décision du responsable de la société.

| Ce qui est écrit | Fait constaté | À faire |
|---|---|---|
| « L'ensemble des serveurs et des bases de données est situé sur le territoire de l'Union européenne » ; Vercel : « Paris (France, UE) » | Les fonctions de production s'exécutent en `iad1`, **aux États-Unis** (lu sur `/api/health`) | La branche place les fonctions à Francfort (`vercel.json`). Après déploiement, corriger « Paris » en « Francfort ». Tant que ce n'est pas déployé, la phrase est fausse |
| Société « AFRISUPPLY SAS, en cours d'immatriculation » ; directeur de la publication : « Direction générale AFRISUPPLY » | Pas de numéro SIREN, pas de capital, pas de personne nommée | Mentions obligatoires à compléter dès l'immatriculation ; une facture d'abonnement ne peut pas être émise sans elles |
| Registre des sous-traitants : Neon, Vercel, Stripe, Resend | Le code peut aussi appeler Clerk (identité), un service d'IA (assistant, lecture de facture), Twilio et Sentry | Inscrire chaque service réellement activé, avec sa localisation et sa garantie de transfert — ou ne pas l'activer |
| Resend : « Irlande / UE » | Non vérifié ; l'expéditeur actuel est l'adresse d'essai du prestataire | Vérifier un domaine d'envoi et sa région |
| Support « du lundi au samedi, 8 h – 20 h », réponse « sous 4 h ouvrées », incident bloquant « sous 1 h » | Engagement écrit ; aucune astreinte ni outil de suivi dans le dépôt ; suivi d'erreurs non configuré | Confirmer que ces délais sont tenables, sinon les réécrire avant le pilote |
| « Sans engagement, résiliable en un clic » | La résiliation passe par le portail du prestataire de paiement, non démontré en réel | Essai réel en mode test |
| « Facture AFRISUPPLY en PDF chaque mois » | Démontré contre un faux service ; les mentions légales de la facture dépendent de variables non vérifiées (`INVOICE_SIRET`, `INVOICE_VAT`) | Renseigner après immatriculation |
| Conditions générales : acceptées « en créant votre espace » | Aucune trace d'acceptation n'est enregistrée pour un restaurant (elle l'est pour un grossiste) ; l'inscription par Clerk n'affiche pas la mention | Enregistrer la version acceptée et sa date |
| Page de statut : « Tous les systèmes fonctionnent » quand c'est vrai | En production elle affiche honnêtement « Un système nécessite notre attention » depuis des semaines | Rien à changer : elle dit vrai. C'est l'état qu'il faut corriger |
| Page d'abonnement sans paiement configuré | Le client lit la liste des variables techniques à renseigner | Choix d'origine (transparence) ; à réserver à l'exploitant avant le pilote |

## 3. Documents et procédures

| Élément | État |
|---|---|
| Conditions générales (restaurants) | Présentes, 9 articles (`/cgv`) — à relire par un juriste ; version et date d'acceptation non enregistrées |
| Conditions générales (grossistes) | Présentes (`/cgv-fournisseur`), acceptation enregistrée avec version et date |
| Politique de confidentialité, mentions légales | Présentes (`/mentions-legales`) — trois inexactitudes ci-dessus |
| Droits RGPD | Export complet et suppression du compte disponibles dans l'application et démontrés ; adresse de contact indiquée |
| Pages d'aide | Foire aux questions (`/faq`) ; pas de guide pas à pas hors de l'écran de démarrage |
| Procédure de sauvegarde et de restauration | Écrite (`docs/SAUVEGARDE_HORS_SITE.md`) et démontrée en local ; **non en service en production** |
| Procédure d'incident | Absente (voir le plan de pilote) |
| Procédure de résiliation | Dans les conditions générales ; non démontrée en réel |

## 4. Ce qui empêche un pilote aujourd'hui

1. **La production n'est pas corrigée.** Le défaut critique de connexion, les 18 routes mal protégées
   et le défaut du formulaire fournisseur sont en ligne. Décision : fusion et déploiement.
2. **Le mail du matin ne part plus** depuis le 2026-09-23, et les alertes sont en erreur. La branche
   fiabilise la passe ; il reste à vérifier un domaine d'envoi (les e-mails partent aujourd'hui de
   l'adresse d'essai du prestataire).
3. **Aucune sauvegarde n'est conservée** en production. La seule protection est celle de Neon, dont
   la durée d'historique est inconnue (fiche NEON-01, Q13).
4. **L'encaissement n'est pas démontré** avec le vrai prestataire, et la société n'a pas encore les
   mentions légales nécessaires à une facture.
5. **Les mentions légales affirment un hébergement européen que les faits contredisent** tant que la
   branche n'est pas déployée.

## 5. Plan de pilote (5 à 10 restaurants)

À lancer quand les cinq points ci-dessus sont levés. Durée : 6 semaines.

**Conditions d'entrée (toutes vérifiables sans accès privilégié)**

| Condition | Comment la vérifier |
|---|---|
| Correction en ligne | `GET /api/health` → `commit` de la branche fusionnée, `config: "ok"` |
| Fonctions près de la base | `GET /api/status` → `checks.database.colocated: true`, `latencyMs` < 10 |
| Passe quotidienne saine 7 jours de suite | `GET /api/status` → `checks.jobs.daily.state: "ok"` chaque matin |
| E-mails réellement remis | `checks.jobs.alerts-notify.state: "ok"` ; un mail du matin reçu dans une boîte extérieure |
| Sauvegardes conservées | `checks.backups.ok: true` ; un essai de restauration réussi depuis la copie externe |
| Suivi d'erreurs en service | `checks.errorTracking.configured: true` |
| Intégration continue verte | Les trois tâches (qualité, bout en bout, navigateur) réussies sur `main` |

**Mesures de réussite**

| Mesure | Cible | Source |
|---|---|---|
| Restaurants ayant terminé les 7 étapes de démarrage en 7 jours | 7 sur 10 | écran « Pilotes » du back-office |
| Restaurants actifs chaque semaine (au moins une commande ou un inventaire) | 6 sur 10 en semaine 6 | même écran |
| Mails du matin envoyés / attendus | ≥ 98 % | `job_runs` (résultat de chaque passe) |
| Passes quotidiennes achevées | 42 sur 42 | `/api/status/jobs` |
| Incidents bloquants (impossible de commander ou de réceptionner) | 0 de plus de 4 h | registre d'incidents |
| Erreurs serveur | < 0,5 % des requêtes | suivi d'erreurs |
| Écarts de livraison détectés et chiffrés | relevé par restaurant | écran « Écarts » |
| Recommandation (question posée en semaine 4) | note moyenne ≥ 7 sur 10 | écran « Pilotes » |

**Traitement des incidents pendant le pilote**

| Gravité | Définition | Délai de prise en charge | Qui est prévenu |
|---|---|---|---|
| Bloquant | Un restaurant ne peut pas se connecter, commander ou réceptionner ; fuite de données | 1 h (heures annoncées) | Responsable de la société, immédiatement |
| Important | Mail du matin absent, alerte non reçue, chiffre faux | 1 jour ouvré | Responsable, le jour même |
| Mineur | Défaut d'affichage, libellé | Prochaine livraison | Récapitulatif hebdomadaire |

Sources d'alerte déjà en place : la page de statut publique, la surveillance croisée des tâches
(alerte à l'exploitant), le bouton « Un avis, un bug ? » dans l'application, et — s'il est activé — le
workflow « Daily digest » de GitHub, qui prévient par e-mail quand la passe du jour ne se termine pas.
À créer avant le pilote : un registre d'incidents (date, restaurant, gravité, cause, correction) et le
suivi d'erreurs.

**Arrêt du pilote** : toute fuite de données entre restaurants, ou deux incidents bloquants de plus
de 4 h, suspendent les nouvelles inscriptions jusqu'à correction démontrée.
