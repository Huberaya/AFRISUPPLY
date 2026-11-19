# Prospection — restaurants africains, Paris & petite couronne (19/09/2026)

> **Les fichiers de données ne sont plus dans le dépôt.** Ce dépôt est public, et ces listes contiennent des
> coordonnées de tiers (noms de dirigeants, téléphones, adresses e-mail). Elles ont été retirées de la branche
> le 13 novembre 2026 ; elles restent dans l'historique Git tant qu'il n'est pas purgé
> (`docs/audits/DEPOT_PUBLIC_DONNEES_PERSONNELLES.md`). La liste de travail se conserve hors du dépôt et s'importe
> dans l'application par l'écran « Prospection » du back-office. Ce document ne décrit plus que la méthode.

- `restaurants_africains_paris.xlsx` / `.csv` : 198 établissements (156 Paris intra-muros, 42 petite couronne), avec nom, adresse, code postal, ville, téléphone (96), e-mail (34), site/réseau (69), cuisine, raison sociale + SIREN + dirigeant (90), lien vers la fiche source.
- Les 198 fiches sont **importées dans l'onglet Admin → Prospection** (section Restaurants), statut « À contacter ».

## Méthode (données réelles, sources ouvertes)
1. OpenStreetMap (Overpass) : restaurants / fast-foods à cuisine africaine, antillaise, éthiopienne… + recherche par nom (Teranga, Mafé, Dakar, Maquis, Baobab…).
2. Adresses manquantes complétées par géocodage inverse (api-adresse.data.gouv.fr).
3. Téléphones / e-mails complétés depuis les sites web des restaurants.
4. Identité juridique (raison sociale, SIREN, dirigeant) via recherche-entreprises.api.gouv.fr (SIRENE), en croisant nom + code postal.

## Limites à connaître
- Les données OSM sont contributives : ~5 % des fiches peuvent être fermées ou avoir changé de nom → un appel de vérification suffit.
- Sans téléphone renseigné (≈ 100 fiches) : chercher le nom sur Google Maps / Pages Jaunes au moment de l'appel, puis compléter la fiche dans l'onglet Prospection.
- Le « dirigeant » vient du registre SIRENE : c'est souvent la bonne personne à qui parler.
