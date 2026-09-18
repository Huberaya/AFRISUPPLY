# Prospection — restaurants africains, Paris & petite couronne (19/09/2026)

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
