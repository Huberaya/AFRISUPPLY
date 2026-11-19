# Qualification des événements `auth.clerk_sync` (chantier P0-C)

Rapport factuel du 13 novembre 2026. Aucun identifiant personnel. **Ce rapport ne conclut pas** : dire
si les deux événements sont légitimes ou frauduleux revient au titulaire, sur les relevés du § 4.

## 1. Les faits relevés (lecture indépendante de la base de production)

- Deux événements `auth.clerk_sync`, le 5 octobre 2026, à environ une demi-seconde d'intervalle.
- Même compte cible, même identifiant Clerk.
- Aujourd'hui : 96 comptes, **aucun** relié à Clerk, **aucune** adresse confirmée.

## 2. Ce que faisait la route à cette date (code de production, `15c8b81` et déploiement précédent `cd85b53`)

`POST /api/auth/clerk-sync` recevait `{ clerkId, email }` dans le corps de la requête.

| Étape | Comportement | Conséquence |
|---|---|---|
| Vérification auprès de Clerk | Facultative ; son échec était ignoré | Sans réponse de Clerk, l'adresse du corps de la requête faisait foi : c'est le défaut critique |
| Compte trouvé par identifiant Clerk | Session ouverte | — |
| Compte trouvé par adresse | Session ouverte **et** le compte reçoit l'identifiant Clerk et une adresse marquée confirmée | Trace durable dans `users` |
| Aucun compte | Compte créé avec identifiant Clerk et adresse confirmée, plus un restaurant | Trace durable dans `users` |
| Dans tous les cas | Événement `auth.clerk_sync` écrit avec le compte cible | Trace dans `audit_log` |

**Donc, dans les deux versions : tout succès laisse sur le compte cible un identifiant Clerk et une
adresse confirmée.** Or la base n'en contient aucun. Les deux constats ne sont compatibles que si le
compte cible n'existe plus (compte supprimé depuis), ou si ces deux champs ont été remis à vide.

## 3. Ce que la forme des événements indique, sans le prouver

- Deux appels à une demi-seconde, même identifiant : c'est la signature d'**une** connexion faite par le site. Le site appelle la route dès que la session Clerk est prête, et l'appel peut partir deux fois ; le premier crée ou relie le compte, le second le retrouve. Un appel forgé n'a pas besoin d'être doublé.
- Le 5 octobre est aussi le jour du dernier déploiement de production (`15c8b81`, 08:19 UTC).
- La clé Clerk du site de production désigne une **autre** application de test qu'AFRISUPPLY : si quelqu'un s'est connecté par Clerk ce jour-là, sa fiche est dans cette autre application, pas dans l'instance AFRISUPPLY (qui compte zéro utilisateur).

Ces éléments rendent plausible un essai de connexion par Clerk fait depuis le site, suivi de la suppression du compte. Ils ne l'établissent pas.

## 4. Relevés qui tranchent — pour ChatGPT, lecture seule

| # | Relevé | Ce qu'il établit |
|---|---|---|
| Q1 | `select count(*) from users where id = '<cible>';` | 0 : le compte a été supprimé depuis — ce qui explique l'absence de trace |
| Q2 | `select at, action from audit_log where target = '<cible>' or actor_email = (select actor_email from audit_log where action = 'auth.clerk_sync' limit 1) order by at;` | Toute la vie du compte : création, connexions, export, suppression (`account.delete`) |
| Q3 | Heure des deux événements, comparée à 08:19 UTC le 5 octobre | Avant ou après le déploiement ; délai après celui-ci |
| Q4 | Tableau de bord Clerk de l'**autre** application de test : existe-t-il un utilisateur portant cet identifiant, créé le 5 octobre ? | Oui : une vraie inscription par Clerk a eu lieu. Non : l'identifiant a été fourni à la main |
| Q5 | Forme de l'identifiant (préfixe `user_` suivi d'une longue suite) — sans le recopier | Identifiant réellement émis par Clerk, ou valeur arbitraire |
| Q6 | Si le compte existe encore : `select created_at, last_login_at from users where id = '<cible>';` | Compte créé par cet appel, ou compte antérieur ouvert par cet appel |

Lecture : Q1 = 0, Q2 montre une suppression par le même acteur, Q4 = oui → essai du titulaire, à lui de
le confirmer. Compte antérieur au 5 octobre, appartenant à un client, et Q4 = non → usage du défaut à traiter comme un incident.

## 5. Protections de la branche candidate

| Exigence | État | Test (`apps/api/src/test/clerk-sync.test.ts`, 22 tests) |
|---|---|---|
| Identité forgée dans le corps | refusée | « l'adresse e-mail d'un compte, envoyée dans le corps, n'ouvre plus aucune session » ; idem pour l'adresse d'un exploitant ; idem sans Clerk configuré |
| Jeton absent | 401 `clerk_token_required` | même test ; parcours du navigateur 13 bis |
| Jeton invalide | refusé | « un jeton signé par une autre clé est refusé » |
| Jeton expiré | refusé | « un jeton expiré est refusé » |
| Origine non autorisée | refusée | « un jeton émis pour une autre origine, ou sans origine, est refusé » |
| Identité Clerk non correspondante | refusée | « une autre identité Clerk ne peut pas se relier à un compte déjà relié » ; « un identifiant Clerk inconnu de l'annuaire est refusé » ; « un lien posé avant la correction ne donne accès à rien » |
| Compte métier existant | relié seulement si l'adresse est confirmée des deux côtés | « compte existant dont l'adresse est confirmée des deux côtés » ; « un compte dont l'adresse n'a jamais été confirmée n'est pas relié » |
| Compte métier inexistant | créé à partir de la seule identité vérifiée | « nouvelle identité Clerk vérifiée → compte, restaurant et session ; le corps est ignoré » |
| Répétition de requête | même compte, aucun doublon ; 20 appels par minute au plus | « deuxième connexion de la même identité » ; « la route est freinée » |
| Rattachement du compte d'un autre | refusé | « une identité Clerk dont l'adresse n'est pas vérifiée ne prend pas le compte de cette adresse » |
| Clerk muet ou en panne | 503, aucune session | deux tests |

Seule une identité tirée d'un jeton Clerk vérifié côté serveur ouvre une session. En production, les
clés actuelles étant des clés de développement, la route répond 503 avant toute vérification.
Statut de preuve : **confirmé par test automatisé** (Clerk simulé) ; **non vérifié** contre l'instance réelle.

## 6. Révocation des sessions si un usage frauduleux est confirmé

Sans toucher à `JWT_SECRET`. Une session porte le numéro de version du compte ; l'incrémenter invalide toutes ses sessions.

| Moment | Moyen | Effet |
|---|---|---|
| Aujourd'hui, production actuelle | Le titulaire du compte visé réinitialise son mot de passe (« Mot de passe oublié ») | Version du compte incrémentée : toutes ses sessions tombent. Exige que l'e-mail arrive (`RESEND_DIAGNOSTIC.md`) |
| Aujourd'hui, si l'e-mail n'arrive pas | Écriture ciblée en base, **sur autorisation écrite du titulaire** : `update users set token_version = token_version + 1 where id = '<cible>' returning id;` | Même effet, une ligne, sans changer le mot de passe |
| Après déploiement de la branche | La déconnexion révoque déjà toutes les sessions du compte ; le changement de mot de passe aussi | Testé : « la déconnexion révoque la session issue de Clerk », parcours 11 du navigateur |

Dans tous les cas : relire `audit_log` pour ce compte (Q2) et prévenir son titulaire.
