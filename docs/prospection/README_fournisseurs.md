# Prospection — fournisseurs / grossistes africains d'Île-de-France

Fichiers : `fournisseurs_africains_idf.xlsx` (feuilles *Fournisseurs* + *Synthèse*) et `fournisseurs_africains_idf.csv` (séparateur `;`, UTF-8).
Les mêmes fiches sont importées dans l'onglet admin **Prospection → Fournisseurs** (`/app/admin/prospection?kind=fournisseur`), statut « À contacter ».

## Contenu (extraction du 19/09/2026)
- **206 fiches**, toutes en Île-de-France : 61 Paris, 43 Val-de-Marne (dont MIN de Rungis), 42 Seine-Saint-Denis, 15 Seine-et-Marne, 15 Val-d'Oise, 14 Essonne, 9 Hauts-de-Seine, 7 Yvelines.
- **Priorité A (41)** : grossistes vérifiés avec coordonnées directes — 21 opérateurs du MIN de Rungis/Chevilly-Larue (Tropic Island, ABCD de l'Exotique, Exofoods, Exotica, Exo-Ser, Exo 3, Tropica, Royal Exo, Maceo, Drevin Exotics, M.I.E, …) + importateurs-distributeurs du 93/75/92/77 (Tai Yat, Racines, Distristar, Haudecoeur, Seneafood, Youmbi/Exotique Pro, AFD44, Mary Exotik, Miamland, …).
- **Priorité B (123)** : sociétés SIRENE actives en commerce de gros alimentaire (NAF 46.31–46.39, 46.17, 10.85) dont le nom/l'activité renvoie à l'Afrique — téléphone à compléter.
- **Priorité C (42)** : intermédiaires / négoce non spécialisé (NAF 46.90Z) — à qualifier avant appel.
- Couverture : 38 téléphones, 28 e-mails, 24 sites, 172 SIREN.

## Sources (données réelles uniquement)
- Annuaire officiel du Marché de Rungis (`rungisinternational.com/entreprise/<id>`) : téléphone, e-mail, bâtiment, produits.
- Sites officiels des grossistes ; PagesJaunes / Europages / Kompass / Mozinor via recherche web.
- SIRENE via `recherche-entreprises.api.gouv.fr` (raison sociale, NAF, effectif, création, dirigeant, adresse du siège).
- OpenStreetMap (Overpass) pour recouper.

Une case vide = information non trouvée ; rien n'a été inventé. Les adresses SIRENE sont celles du **siège** (parfois domiciliation).

## Comment s'en servir
1. Commencer par la priorité A (Rungis + 93) : ce sont les fournisseurs à référencer en premier sur la marketplace (pitch : « vos clients restaurateurs commandent chez vous via AFRISUPPLY, sans commission la 1re année »).
2. Priorité B : appeler après recherche du numéro (Google/PagesJaunes) ; beaucoup sont de petites structures de 1–5 salariés.
3. Mettre à jour les statuts dans l'onglet Prospection (à_contacter → contacté → RDV → intéressé → converti/perdu) et planifier les relances.
