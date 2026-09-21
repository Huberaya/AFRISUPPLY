// Chantier 28 — Résolution du prix d'une offre grossiste pour un restaurant et une quantité.
// Ordre : prix négocié ferme (offre × restaurant) > remise % (offre) > remise globale client > palier volume > prix catalogue.
import { and, eq, inArray, isNull, or, gte } from 'drizzle-orm';
import { getDb, vendorPriceTiers, vendorCustomerPrices, type vendorOffers } from '@afrisupply/db';

type Offer = Pick<typeof vendorOffers.$inferSelect, 'id' | 'vendorId' | 'packPriceEur'>;
export type Tier = { minPacks: number; packPriceEur: number };
export type PriceInfo = { packPriceEur: number; listPriceEur: number; source: 'catalogue' | 'palier' | 'negocie' | 'remise_client'; tiers: Tier[]; negotiated: boolean; nextTier: Tier | null };
const n = (v: unknown) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Charge paliers + accords clients pour un lot d'offres (1 requête chacun). */
export async function loadPricing(offers: Offer[], restaurantId: string | null) {
  const db = await getDb(); const ids = offers.map((o) => o.id); const vendorIds = [...new Set(offers.map((o) => o.vendorId))];
  const tiers = ids.length ? await db.select().from(vendorPriceTiers).where(inArray(vendorPriceTiers.vendorOfferId, ids)).orderBy(vendorPriceTiers.minPacks) : [];
  const today = new Date().toISOString().slice(0, 10);
  const custom = restaurantId && vendorIds.length ? await db.select().from(vendorCustomerPrices).where(and(eq(vendorCustomerPrices.restaurantId, restaurantId), inArray(vendorCustomerPrices.vendorId, vendorIds), or(isNull(vendorCustomerPrices.validUntil), gte(vendorCustomerPrices.validUntil, today)))) : [];
  return { tiers, custom };
}

export function priceFor(offer: Offer, packs: number, ctx: Awaited<ReturnType<typeof loadPricing>>): PriceInfo {
  const list = n(offer.packPriceEur);
  const tiers: Tier[] = ctx.tiers.filter((t) => t.vendorOfferId === offer.id).map((t) => ({ minPacks: t.minPacks, packPriceEur: n(t.packPriceEur) })).sort((a, b) => a.minPacks - b.minPacks);
  const applicable = tiers.filter((t) => packs >= t.minPacks).pop();
  const nextTier = tiers.find((t) => t.minPacks > packs) ?? null;
  const base: PriceInfo = { packPriceEur: applicable ? applicable.packPriceEur : list, listPriceEur: list, source: applicable ? 'palier' : 'catalogue', tiers, negotiated: false, nextTier };
  const own = ctx.custom.find((c) => c.vendorOfferId === offer.id); const global = ctx.custom.find((c) => c.vendorId === offer.vendorId && !c.vendorOfferId);
  if (own?.packPriceEur) return { ...base, packPriceEur: Math.min(n(own.packPriceEur), base.packPriceEur), source: 'negocie', negotiated: true };
  if (own?.discountPct) return { ...base, packPriceEur: r2(Math.min(list * (1 - n(own.discountPct) / 100), base.packPriceEur)), source: 'negocie', negotiated: true };
  if (global?.discountPct) return { ...base, packPriceEur: r2(Math.min(list * (1 - n(global.discountPct) / 100), base.packPriceEur)), source: 'remise_client', negotiated: true };
  return base;
}

export async function resolvePrice(offer: Offer, restaurantId: string | null, packs: number) { return priceFor(offer, packs, await loadPricing([offer], restaurantId)); }
