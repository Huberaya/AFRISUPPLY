// =============================================================
// Cloisonnement entre restaurants — références reçues dans le corps d'une requête (chantier P0.2)
//
// Un identifiant passé dans l'URL est toujours relu avec `restaurant_id = restaurant courant`.
// Un identifiant passé dans le CORPS (produit d'une offre, ingrédient d'une recette, fournisseur
// préféré, recette d'une vente…) ne l'était pas toujours : un restaurant pouvait alors rattacher à
// ses données l'objet d'un autre restaurant, et en lire le nom par ricochet.
//
// Ces fonctions répondent à une seule question : « ce restaurant a-t-il le droit de référencer cet
// objet ? ». Un objet inconnu et l'objet d'un autre restaurant reçoivent la MÊME réponse
// (« introuvable ») : rien ne permet de deviner qu'un identifiant existe ailleurs.
// =============================================================
import { and, eq, inArray } from 'drizzle-orm';
import { getDb, recipes, suppliers, vendorOffers, vendors, visibleProductIds } from '@afrisupply/db';

const unique = (ids: string[]) => [...new Set(ids.filter(Boolean))];

/** Produits que ce restaurant ne peut PAS référencer : inconnus, ou privés d'un autre restaurant. */
export async function unusableProductIds(restaurantId: string, productIds: string[]): Promise<string[]> {
  const ids = unique(productIds);
  if (!ids.length) return [];
  const ok = await visibleProductIds(restaurantId, ids);
  return ids.filter((id) => !ok.has(id));
}

/** Réponse commune quand un produit n'est pas référençable. */
export const PRODUCT_NOT_FOUND = { error: 'Produit introuvable : il n\'existe pas dans le référentiel ni dans vos produits.', code: 'product_not_found' } as const;

/** Le fournisseur appartient-il à ce restaurant ? */
export async function ownsSupplier(restaurantId: string, supplierId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, supplierId), eq(suppliers.restaurantId, restaurantId))).limit(1);
  return !!row;
}

/** Parmi ces recettes, celles qui n'appartiennent pas à ce restaurant (ou n'existent pas). */
export async function foreignRecipeIds(restaurantId: string, recipeIds: string[]): Promise<string[]> {
  const ids = unique(recipeIds);
  if (!ids.length) return [];
  const db = await getDb();
  const own = new Set((await db.select({ id: recipes.id }).from(recipes).where(and(eq(recipes.restaurantId, restaurantId), inArray(recipes.id, ids)))).map((r) => r.id));
  return ids.filter((id) => !own.has(id));
}

/**
 * Offres de catalogue d'un grossiste de la place de marché : le grossiste doit être actif et chaque
 * offre doit lui appartenir. Renvoie un message d'erreur, ou null si tout est cohérent.
 */
export async function vendorOffersProblem(vendorId: string, vendorOfferIds: string[]): Promise<string | null> {
  const db = await getDb();
  const [v] = await db.select({ id: vendors.id, status: vendors.status }).from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!v || v.status !== 'actif') return 'Fournisseur introuvable sur la place de marché.';
  const ids = unique(vendorOfferIds);
  if (!ids.length) return 'Au moins une ligne est requise.';
  const found = await db.select({ id: vendorOffers.id }).from(vendorOffers).where(and(eq(vendorOffers.vendorId, vendorId), inArray(vendorOffers.id, ids)));
  return found.length === ids.length ? null : 'Une des offres n\'appartient pas au catalogue de ce fournisseur.';
}
