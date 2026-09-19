// Chantier 16 — Admin « Référentiel » : gérer les 324 produits communs sans toucher au code,
// + demandes de produits manquants envoyées par les grossistes depuis l'import de catalogue.
import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { getDb, products, leads, vendorOffers, inventoryItems } from '@afrisupply/db';
import { requireAuth, type Env } from '../lib/auth.js';
import { audit } from '../lib/ops.js';

const isAdmin = (email: string) => (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
const CATS = ['feculents', 'frais', 'viandes_poissons', 'epicerie', 'boissons', 'emballages'] as const;
const UNITS = ['kg', 'g', 'L', 'mL', 'piece', 'botte', 'sac', 'carton'] as const;
const body = z.object({ name: z.string().min(2).max(120), aliases: z.array(z.string().min(1).max(60)).max(30).default([]), category: z.enum(CATS), baseUnit: z.enum(UNITS), origin: z.string().max(120).nullable().optional(), shelfLifeDays: z.number().int().positive().nullable().optional(), imageUrl: z.string().url().nullable().optional().or(z.literal('')) });

export const referenceAdminRoutes = new Hono<Env>();
referenceAdminRoutes.use('/admin/reference', requireAuth); referenceAdminRoutes.use('/admin/reference/*', requireAuth);
referenceAdminRoutes.use('/admin/reference', async (c, next) => { if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403); await next(); });
referenceAdminRoutes.use('/admin/reference/*', async (c, next) => { if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403); await next(); });

referenceAdminRoutes.get('/admin/reference', async (c) => {
  const db = await getDb(); const q = (c.req.query('q') ?? '').trim(); const cat = c.req.query('category');
  const where = and(isNull(products.restaurantId), cat ? eq(products.category, cat as typeof CATS[number]) : undefined, q ? or(ilike(products.name, `%${q}%`), sql`exists (select 1 from unnest(${products.aliases}) a where a ilike ${'%' + q + '%'})`) : undefined);
  const rows = await db.select({ p: products, offers: sql<number>`(select count(*) from vendor_offers o where o.product_id = ${products.id})`, tracked: sql<number>`(select count(*) from inventory_items i where i.product_id = ${products.id})` }).from(products).where(where).orderBy(products.category, products.name).limit(400);
  const requests = await db.select().from(leads).where(and(eq(leads.source, 'referentiel'), eq(leads.status, 'nouveau'))).orderBy(desc(leads.createdAt)).limit(50);
  return c.json({ products: rows.map((r) => ({ ...r.p, offers: Number(r.offers), tracked: Number(r.tracked) })), requests: requests.map((r) => ({ id: r.id, product: (r.message ?? '').replace(/^Produit manquant : /, ''), from: r.restaurantName, email: r.email, notes: r.notes, createdAt: r.createdAt })), categories: CATS, units: UNITS });
});

referenceAdminRoutes.post('/admin/reference', async (c) => {
  const b = body.safeParse(await c.req.json()); if (!b.success) return c.json({ error: 'Données invalides', details: b.error.flatten() }, 400);
  const db = await getDb(); const d = b.data;
  const [dup] = await db.select({ id: products.id, name: products.name }).from(products).where(and(isNull(products.restaurantId), ilike(products.name, d.name))); if (dup) return c.json({ error: `« ${dup.name} » existe déjà` }, 409);
  const [p] = await db.insert(products).values({ name: d.name, aliases: d.aliases, category: d.category, baseUnit: d.baseUnit, origin: d.origin ?? null, shelfLifeDays: d.shelfLifeDays ?? null, imageUrl: d.imageUrl || null, restaurantId: null }).returning();
  const reqId = c.req.query('request'); if (reqId) await db.update(leads).set({ status: 'client', notes: `Créé : ${p.name}` }).where(eq(leads.id, reqId));
  await audit('reference.create', { actorEmail: c.get('user').email, target: p.id, meta: { name: p.name } });
  return c.json({ product: p, message: `« ${p.name} » ajouté au référentiel : les grossistes peuvent le proposer et les restaurants le suivre.` }, 201);
});

referenceAdminRoutes.put('/admin/reference/:id', async (c) => {
  const b = body.partial().safeParse(await c.req.json()); if (!b.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb(); const d = b.data;
  const [p] = await db.update(products).set({ ...d, imageUrl: d.imageUrl === '' ? null : d.imageUrl }).where(and(eq(products.id, c.req.param('id')), isNull(products.restaurantId))).returning(); if (!p) return c.json({ error: 'Produit introuvable' }, 404);
  await audit('reference.update', { actorEmail: c.get('user').email, target: p.id, meta: d });
  return c.json({ product: p });
});

/** Fusion : le produit « doublon » est remplacé par « cible » partout (offres, stocks…), ses alias sont conservés. */
referenceAdminRoutes.post('/admin/reference/:id/merge', async (c) => {
  const b = z.object({ into: z.string().uuid() }).safeParse(await c.req.json()); if (!b.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb(); const from = c.req.param('id'); const into = b.data.into; if (from === into) return c.json({ error: 'Même produit' }, 400);
  const [a] = await db.select().from(products).where(eq(products.id, from)); const [t] = await db.select().from(products).where(eq(products.id, into)); if (!a || !t) return c.json({ error: 'Produit introuvable' }, 404);
  await db.execute(sql`update vendor_offers set product_id = ${into} where product_id = ${from} and not exists (select 1 from vendor_offers x where x.vendor_id = vendor_offers.vendor_id and x.product_id = ${into} and x.pack_label = vendor_offers.pack_label)`);
  await db.execute(sql`delete from vendor_offers where product_id = ${from}`);
  await db.execute(sql`update inventory_items set product_id = ${into} where product_id = ${from} and not exists (select 1 from inventory_items x where x.restaurant_id = inventory_items.restaurant_id and x.product_id = ${into})`);
  await db.execute(sql`delete from inventory_items where product_id = ${from}`);
  for (const tbl of ['supplier_offers', 'order_lines', 'stock_movements', 'recipe_ingredients', 'price_alerts', 'sales_lines']) { try { await db.execute(sql.raw(`update ${tbl} set product_id = '${into}' where product_id = '${from}'`)); } catch { /* table absente ou contrainte : on ignore */ } }
  await db.update(products).set({ aliases: [...new Set([...t.aliases, a.name, ...a.aliases])] }).where(eq(products.id, into));
  await db.delete(products).where(eq(products.id, from));
  await audit('reference.merge', { actorEmail: c.get('user').email, target: into, meta: { from: a.name, into: t.name } });
  return c.json({ ok: true, message: `« ${a.name} » fusionné dans « ${t.name} ».` });
});

referenceAdminRoutes.post('/admin/reference/requests/:id/dismiss', async (c) => {
  const db = await getDb(); await db.update(leads).set({ status: 'perdu' }).where(eq(leads.id, c.req.param('id'))); return c.json({ ok: true });
});

/** Côté grossiste (et restaurant) : signaler un produit absent du référentiel. */
export const referenceRequestRoutes = new Hono<Env>();
referenceRequestRoutes.post('/reference/request', requireAuth, async (c) => {
  const b = z.object({ product: z.string().min(2).max(120), details: z.string().max(500).optional(), from: z.string().max(120).optional() }).safeParse(await c.req.json()); if (!b.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb(); const u = c.get('user');
  const [existing] = await db.select({ id: products.id, name: products.name }).from(products).where(and(isNull(products.restaurantId), or(ilike(products.name, b.data.product), sql`exists (select 1 from unnest(${products.aliases}) a where lower(a) = lower(${b.data.product}))`)));
  if (existing) return c.json({ ok: false, existing, message: `Ce produit existe déjà sous le nom « ${existing.name} ».` });
  await db.insert(leads).values({ restaurantName: b.data.from ?? u.fullName ?? 'Fournisseur', contactName: u.fullName ?? u.email, email: u.email, message: `Produit manquant : ${b.data.product}`, notes: b.data.details ?? null, source: 'referentiel', planInterest: 'referentiel' });
  return c.json({ ok: true, message: `Demande envoyée : « ${b.data.product} » sera ajouté au référentiel sous 24 h ouvrées, vous serez prévenu.` }, 201);
});
