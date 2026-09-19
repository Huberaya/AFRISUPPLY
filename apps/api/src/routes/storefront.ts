// Chantier 13 — Vitrine publique (parcours « Amazon » inspiré d'ethimarket) : catalogue, fiche produit, grossistes.
// Aucune authentification : tout le monde voit produits et prix ; il faut un compte restaurant pour commander.
import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb, leads, products, vendors, vendorOffers } from '@afrisupply/db';
import type { Env } from '../lib/auth.js';

export const storefrontRoutes = new Hono<Env>();
const n = (v: unknown) => Number(v ?? 0);
export const slugify = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** Catalogue public : 324 produits du référentiel + meilleur prix parmi les grossistes actifs (null = prix sur demande). */
storefrontRoutes.get('/public/catalog', async (c) => {
  const db = await getDb();
  const q = (c.req.query('q') ?? '').trim().toLowerCase(); const cat = c.req.query('category') ?? ''; const origin = c.req.query('origin') ?? '';
  const rows = await db.select({ id: products.id, name: products.name, aliases: products.aliases, category: products.category, baseUnit: products.baseUnit, origin: products.origin, imageUrl: products.imageUrl }).from(products).where(isNull(products.restaurantId)).orderBy(products.category, products.name);
  const best = await db.select({ productId: vendorOffers.productId, unit: sql<number>`min(${vendorOffers.packPriceEur} / nullif(${vendorOffers.packQty}, 0))`, offers: sql<number>`count(*)`, vendors: sql<number>`count(distinct ${vendorOffers.vendorId})` })
    .from(vendorOffers).innerJoin(vendors, eq(vendors.id, vendorOffers.vendorId)).where(and(eq(vendorOffers.inStock, true), eq(vendors.status, 'actif'))).groupBy(vendorOffers.productId);
  const bm = new Map(best.map((b) => [b.productId, b]));
  let items = rows.map((p) => { const b = bm.get(p.id); return { ...p, slug: slugify(p.name), fromUnitPrice: b ? Number(Number(b.unit).toFixed(2)) : null, offerCount: b ? n(b.offers) : 0, vendorCount: b ? n(b.vendors) : 0 }; });
  if (cat) items = items.filter((p) => p.category === cat);
  if (origin) items = items.filter((p) => (p.origin ?? '').toLowerCase().includes(origin.toLowerCase()));
  if (q) items = items.filter((p) => p.name.toLowerCase().includes(q) || p.aliases.some((a) => a.toLowerCase().includes(q)) || (p.origin ?? '').toLowerCase().includes(q));
  items.sort((a, b) => Number(b.fromUnitPrice !== null) - Number(a.fromUnitPrice !== null));
  const origins = [...new Set(rows.map((r) => r.origin).filter(Boolean) as string[])].sort();
  const counts = rows.reduce<Record<string, number>>((acc, r) => { acc[r.category] = (acc[r.category] ?? 0) + 1; return acc; }, {});
  return c.json({ items: items.map(({ aliases: _a, ...p }) => p), total: items.length, origins, categories: counts, withPrice: items.filter((i) => i.fromUnitPrice !== null).length });
});

/** Fiche produit publique : toutes les offres des grossistes actifs, triées par prix unitaire. */
storefrontRoutes.get('/public/products/:id', async (c) => {
  const db = await getDb(); const id = c.req.param('id');
  const [p] = await db.select().from(products).where(and(eq(products.id, id), isNull(products.restaurantId))); if (!p) return c.json({ error: 'Produit introuvable' }, 404);
  const rows = await db.select({ o: vendorOffers, v: vendors }).from(vendorOffers).innerJoin(vendors, eq(vendors.id, vendorOffers.vendorId)).where(and(eq(vendorOffers.productId, id), eq(vendors.status, 'actif')));
  const offers = rows.map(({ o, v }) => ({ id: o.id, packLabel: o.packLabel, packQty: n(o.packQty), packPriceEur: n(o.packPriceEur), unitPrice: Number((n(o.packPriceEur) / n(o.packQty)).toFixed(2)), inStock: o.inStock, updatedAt: o.updatedAt,
    vendor: { id: v.id, name: v.name, slug: v.slug, city: v.city, deliveryZones: v.deliveryZones, leadTimeHours: v.leadTimeHours, minOrderEur: n(v.minOrderEur), deliveryFeeEur: n(v.deliveryFeeEur) } })).sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.unitPrice - b.unitPrice);
  const similar = await db.select({ id: products.id, name: products.name, category: products.category, baseUnit: products.baseUnit, origin: products.origin }).from(products).where(and(isNull(products.restaurantId), eq(products.category, p.category), sql`${products.id} <> ${id}`)).limit(8);
  return c.json({ product: { ...p, slug: slugify(p.name) }, offers, similar: similar.map((s) => ({ ...s, slug: slugify(s.name) })) });
});

/** Grossistes actifs (annuaire public). */
storefrontRoutes.get('/public/vendors', async (c) => {
  const db = await getDb();
  const vs = await db.select().from(vendors).where(eq(vendors.status, 'actif'));
  const counts = await db.select({ vendorId: vendorOffers.vendorId, offers: sql<number>`count(*)` }).from(vendorOffers).where(eq(vendorOffers.inStock, true)).groupBy(vendorOffers.vendorId);
  const cm = new Map(counts.map((x) => [x.vendorId, n(x.offers)]));
  return c.json({ vendors: vs.map((v) => ({ id: v.id, name: v.name, slug: v.slug, description: v.description, city: v.city, deliveryZones: v.deliveryZones, categories: v.categories, leadTimeHours: v.leadTimeHours, minOrderEur: n(v.minOrderEur), deliveryFeeEur: n(v.deliveryFeeEur), offerCount: cm.get(v.id) ?? 0 })) });
});

/** « Prévenez-moi » sur un produit sans offre : enregistré comme lead (source vitrine) pour orienter le démarchage des grossistes. */
storefrontRoutes.post('/public/product-alert', async (c) => {
  const body = z.object({ productId: z.string().uuid(), email: z.string().email(), restaurantName: z.string().min(2).max(120).optional(), city: z.string().max(80).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb(); const [p] = await db.select({ name: products.name }).from(products).where(eq(products.id, body.data.productId)); if (!p) return c.json({ error: 'Produit introuvable' }, 404);
  await db.insert(leads).values({ restaurantName: body.data.restaurantName ?? 'Vitrine', contactName: body.data.email.split('@')[0], email: body.data.email, city: body.data.city ?? null, message: `Alerte produit : ${p.name}`, planInterest: 'vitrine', source: 'vitrine' });
  return c.json({ ok: true, message: `C'est noté : vous serez prévenu dès qu'un grossiste propose « ${p.name} ».` }, 201);
});
