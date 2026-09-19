// Liste de courses (type « Éthimarket ») : le restaurateur écrit « 10 kg de piment, 5 kg de riz, 2 cartons de poisson fumé »
// → on retrouve chaque produit, on compare toutes les offres (fournisseurs plateforme de sa zone + ses propres fournisseurs),
// on propose la moins chère par défaut, et on passe les commandes groupées par fournisseur en un clic.
import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { getDb, vendors, vendorOffers, suppliers, supplierOffers, products, restaurants, inventoryItems } from '@afrisupply/db';
import { requireAuth, requireRestaurant, type Env } from '../lib/auth.js';
import { tokenize, bestMatches, normalize } from '../lib/quick.js';
import { restaurantZones } from './marketplace.js';

export const shoppingRoutes = new Hono<Env>();
shoppingRoutes.use('*', requireAuth, requireRestaurant);
const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
const servesZone = (v: { deliveryZones: string[] }, zones: Set<string>) => v.deliveryZones.length === 0 || v.deliveryZones.some((d) => zones.has(d.trim().toLowerCase()) || zones.has(d));

export interface ShopOffer { key: string; kind: 'vendor' | 'supplier'; offerId: string; sellerId: string; sellerName: string; packLabel: string; packQty: number; packPrice: number; unitPrice: number; leadTimeHours: number; minOrderEur: number; deliveryFeeEur: number; packs: number; lineTotal: number; linked: boolean }

/** Convertit la quantité demandée dans l'unité de base du produit (kg/L) quand c'est possible. */
function toBase(qty: number, unit: string | undefined, baseUnit: string): { qty: number; note?: string } {
  if (!unit || unit === baseUnit) return { qty };
  if (unit === 'g' && baseUnit === 'kg') return { qty: qty / 1000 };
  if (unit === 'mL' && baseUnit === 'L') return { qty: qty / 1000 };
  if (unit === 'cL' && baseUnit === 'L') return { qty: qty / 100 };
  if (['sac', 'carton', 'bidon'].includes(unit)) return { qty, note: `${qty} ${unit}${qty > 1 ? 's' : ''} → colis` };
  return { qty, note: `unité « ${unit} » ≠ ${baseUnit}` };
}

/** Classement des produits pour un libellé : mot exact (« riz » ⊂ « Riz parfumé ») > similarité floue ;
 *  puis, à score égal, produits déjà suivis en stock, puis produits ayant au moins une offre. */
export function rankProducts(label: string, prods: { id: string; name: string; aliases: string[] }[], mine: Set<string>, withOffers: Set<string>) {
  const words = normalize(label).split(' ').filter((w) => w.length >= 2);
  const scored = prods.map((p) => {
    const nameWords = normalize(p.name).split(' '); const aliasWords = p.aliases.map((x) => normalize(x).split(' '));
    const inName = words.length && words.every((w) => nameWords.includes(w));
    const inAlias = words.length && words.every((w) => aliasWords.some((ws) => ws.includes(w)));
    // le nom du produit prime sur un alias (un alias est un raccourci, pas une identité) ; alias exact complet reste fort
    const exact = inName ? 0.95 + (nameWords[0] === words[0] ? 0.02 : 0) : inAlias ? (aliasWords.some((ws) => ws.join(' ') === words.join(' ')) ? 0.9 : 0.85) : 0;
    const fuzzy = Math.min(0.84, bestMatches(label, [{ id: p.id, name: p.name, aliases: p.aliases }], 1)[0]?.score ?? 0);
    const score = Math.max(exact, fuzzy) + (mine.has(p.id) ? 0.02 : 0) + (withOffers.has(p.id) ? 0.01 : 0);
    return { id: p.id, name: p.name, score: Math.min(1, Math.round(score * 1000) / 1000) };
  }).filter((m) => m.score >= 0.45).sort((a, b) => b.score - a.score);
  return scored.slice(0, 4);
}

shoppingRoutes.post('/shopping/parse', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = z.object({ text: z.string().min(1).max(2000) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Texte requis' }, 400);
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, rid)); const zones = restaurantZones(r);
  // Référentiel : produits communs + produits privés du restaurant
  const prods = await db.select().from(products).where(or(isNull(products.restaurantId), eq(products.restaurantId, rid)));
  const mine = new Set((await db.select({ productId: inventoryItems.productId }).from(inventoryItems).where(eq(inventoryItems.restaurantId, rid))).map((x) => x.productId));
  const tokens = tokenize(body.data.text);
  if (!tokens.length) return c.json({ lines: [], unmatched: [], hint: 'Écrivez une quantité puis un produit : « 10 kg piment, 5 kg riz, 2 cartons poisson fumé ».' });
  // Offres plateforme (zone du restaurant, en stock) + offres de mes fournisseurs
  const activeVendors = (await db.select().from(vendors).where(eq(vendors.status, 'actif'))).filter((v) => servesZone(v, zones));
  const vById = new Map(activeVendors.map((v) => [v.id, v]));
  const vo = activeVendors.length ? await db.select().from(vendorOffers).where(and(inArray(vendorOffers.vendorId, activeVendors.map((v) => v.id)), eq(vendorOffers.inStock, true))) : [];
  const mySups = await db.select().from(suppliers).where(and(eq(suppliers.restaurantId, rid), eq(suppliers.isActive, true)));
  const sById = new Map(mySups.map((s) => [s.id, s])); const linkedVendorIds = new Set(mySups.map((s) => s.vendorId).filter(Boolean));
  const so = mySups.length ? await db.select().from(supplierOffers).where(and(eq(supplierOffers.restaurantId, rid), eq(supplierOffers.inStock, true), inArray(supplierOffers.supplierId, mySups.map((s) => s.id)))) : [];

  const lines = tokens.map((t) => {
    const cands = rankProducts(t.label, prods, mine, new Set([...vo.map((o) => o.productId), ...so.map((o) => o.productId)]));
    const top = cands[0];
    if (!top || top.score < 0.55) return { raw: t.raw, qty: t.qty, unit: t.unit, product: null, candidates: cands, offers: [] as ShopOffer[], selected: null as string | null, note: 'Produit inconnu' };
    const p = prods.find((x) => x.id === top.id)!;
    const conv = toBase(t.qty, t.unit, p.baseUnit); const needed = conv.qty; const asPacks = !!t.unit && ['sac', 'carton', 'bidon'].includes(t.unit);
    const offers: ShopOffer[] = [];
    for (const o of vo.filter((x) => x.productId === p.id)) {
      const v = vById.get(o.vendorId)!; if (linkedVendorIds.has(v.id)) continue; // déjà présent via mes fournisseurs (offres synchronisées)
      const packs = asPacks ? Math.max(1, Math.round(needed)) : Math.max(1, Math.ceil(needed / n(o.packQty)));
      offers.push({ key: `v:${o.id}`, kind: 'vendor', offerId: o.id, sellerId: v.id, sellerName: v.name, packLabel: o.packLabel, packQty: n(o.packQty), packPrice: n(o.packPriceEur), unitPrice: n(o.packPriceEur) / n(o.packQty), leadTimeHours: v.leadTimeHours, minOrderEur: n(v.minOrderEur), deliveryFeeEur: n(v.deliveryFeeEur), packs, lineTotal: packs * n(o.packPriceEur), linked: false });
    }
    for (const o of so.filter((x) => x.productId === p.id)) {
      const s = sById.get(o.supplierId)!;
      const packs = asPacks ? Math.max(1, Math.round(needed)) : Math.max(1, Math.ceil(needed / n(o.packQty)));
      offers.push({ key: `s:${o.id}`, kind: 'supplier', offerId: o.id, sellerId: s.id, sellerName: s.name, packLabel: o.packLabel, packQty: n(o.packQty), packPrice: n(o.packPriceEur), unitPrice: n(o.packPriceEur) / n(o.packQty), leadTimeHours: s.leadTimeHours, minOrderEur: n(s.minOrderEur), deliveryFeeEur: n(s.deliveryFeeEur), packs, lineTotal: packs * n(o.packPriceEur), linked: true });
    }
    offers.sort((a, b) => a.unitPrice - b.unitPrice);
    const best = offers[0]; const worst = offers[offers.length - 1];
    return { raw: t.raw, qty: t.qty, unit: t.unit ?? p.baseUnit, neededQty: needed, product: { id: p.id, name: p.name, unit: p.baseUnit, category: p.category, tracked: mine.has(p.id) }, candidates: cands, offers, selected: best?.key ?? null,
      savingPct: best && worst && worst.unitPrice > 0 ? Math.round(((worst.unitPrice - best.unitPrice) / worst.unitPrice) * 100) : 0, note: offers.length ? conv.note : 'Aucune offre disponible pour ce produit' };
  });
  return c.json({ lines, unmatched: lines.filter((l) => !l.product).map((l) => l.raw), sellers: { vendors: activeVendors.length, suppliers: mySups.length } });
});
