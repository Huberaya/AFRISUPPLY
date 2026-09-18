// =============================================================
// Catalogue, onboarding par recettes types, import CSV fournisseurs
// =============================================================
import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, isNull, sql, inArray } from 'drizzle-orm';
import { getDb, products, suppliers, supplierOffers, priceHistory, inventoryItems, recipes, recipeIngredients } from '@afrisupply/db';
import { REFERENCE_PRODUCTS, RECIPE_TEMPLATES, findReferenceProduct, normalize } from '@afrisupply/db/data';
import { requireAuth, requireRestaurant, type Env } from '../lib/auth.js';
import { parseCsv, pick, toNumber, parsePack } from '../lib/csv.js';

export const catalogRoutes = new Hono<Env>();
catalogRoutes.use('*', requireAuth, requireRestaurant);

const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

/** Synchronise le référentiel partagé en base (idempotent). */
async function ensureReference() {
  const db = await getDb();
  const existing = await db.select({ id: products.id, name: products.name }).from(products).where(isNull(products.restaurantId));
  const byName = new Map(existing.map((p) => [p.name, p.id]));
  const missing = REFERENCE_PRODUCTS.filter((p) => !byName.has(p.name));
  if (missing.length) {
    const ins = await db.insert(products).values(missing.map((p) => ({
      name: p.name, category: p.category, baseUnit: p.baseUnit, origin: p.origin, aliases: [...p.aliases, ...(p.tags ?? [])],
      shelfLifeDays: p.shelfLifeDays, seasonality: p.season?.length ? JSON.stringify(p.season) : null,
    }))).returning({ id: products.id, name: products.name });
    ins.forEach((p) => byName.set(p.name, p.id));
  }
  return byName;
}

// -------------------------------------------------------------
// Catalogue : recherche (nom, alias, tags), méta référentiel
// -------------------------------------------------------------
catalogRoutes.get('/catalog', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  await ensureReference();
  const q = normalize(c.req.query('q') ?? ''); const cat = c.req.query('category');
  const rows = await db.select().from(products).where(sql`${products.restaurantId} is null or ${products.restaurantId} = ${rid}`).orderBy(products.category, products.name);
  const [inv, offerCounts] = await Promise.all([
    db.select({ productId: inventoryItems.productId }).from(inventoryItems).where(eq(inventoryItems.restaurantId, rid)),
    db.select({ productId: supplierOffers.productId, count: sql<number>`count(*)`, minPrice: sql<number>`min(${supplierOffers.packPriceEur} / ${supplierOffers.packQty})` }).from(supplierOffers).where(eq(supplierOffers.restaurantId, rid)).groupBy(supplierOffers.productId),
  ]);
  const tracked = new Set(inv.map((i) => i.productId)); const oc = new Map(offerCounts.map((o) => [o.productId, o]));
  const refByName = new Map(REFERENCE_PRODUCTS.map((p) => [p.name, p]));
  const out = rows.filter((p) => (!cat || p.category === cat) && (!q || normalize(p.name).includes(q) || p.aliases.some((a) => normalize(a).includes(q))))
    .map((p) => ({ ...p, packs: refByName.get(p.name)?.packs ?? [], tags: refByName.get(p.name)?.tags ?? [], tracked: tracked.has(p.id), offerCount: n(oc.get(p.id)?.count), minUnitPrice: oc.get(p.id)?.minPrice ? n(oc.get(p.id)!.minPrice) : null, isCustom: !!p.restaurantId }));
  return c.json({ products: out, total: rows.length });
});

/** Produit privé du restaurant (hors référentiel). */
catalogRoutes.post('/catalog/products', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = z.object({ name: z.string().min(2), category: z.enum(['feculents', 'frais', 'viandes_poissons', 'epicerie', 'boissons', 'emballages']), baseUnit: z.enum(['kg', 'g', 'L', 'mL', 'piece', 'botte', 'sac', 'carton']), aliases: z.array(z.string()).default([]) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const [row] = await db.insert(products).values({ ...body.data, restaurantId: rid }).returning();
  return c.json(row, 201);
});

/** Ajoute un produit au stock suivi (avec seuil optionnel). */
catalogRoutes.post('/catalog/track', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = z.object({ productIds: z.array(z.string().uuid()).min(1), criticalLevel: z.number().nonnegative().optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const res = await db.insert(inventoryItems).values(body.data.productIds.map((productId) => ({ restaurantId: rid, productId, quantity: '0', criticalLevel: (body.data.criticalLevel ?? 0).toFixed(3) }))).onConflictDoNothing().returning({ id: inventoryItems.id });
  return c.json({ added: res.length });
});

// -------------------------------------------------------------
// Onboarding : recettes types → recettes + stock suivi
// -------------------------------------------------------------
catalogRoutes.get('/onboarding/templates', (c) => {
  const refByName = new Map(REFERENCE_PRODUCTS.map((p) => [p.name, p]));
  return c.json({
    templates: RECIPE_TEMPLATES.map((t) => ({ ...t, ingredientCount: t.ingredients.length, ingredients: t.ingredients.map(([product, qty]) => ({ product, qty, unit: refByName.get(product)?.baseUnit ?? 'kg', category: refByName.get(product)?.category })) })),
    regions: [...new Set(RECIPE_TEMPLATES.map((t) => t.region))],
  });
});

catalogRoutes.post('/onboarding/apply', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = z.object({ templates: z.array(z.string()).min(1), prices: z.record(z.number()).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const byName = await ensureReference();
  const chosen = RECIPE_TEMPLATES.filter((t) => body.data.templates.includes(t.name));
  if (!chosen.length) return c.json({ error: 'Aucune recette reconnue' }, 400);

  const existing = await db.select({ name: recipes.name }).from(recipes).where(eq(recipes.restaurantId, rid));
  const have = new Set(existing.map((r) => r.name));
  let createdRecipes = 0; const productIds = new Set<string>();
  for (const t of chosen) {
    for (const [p] of t.ingredients) { const id = byName.get(p); if (id) productIds.add(id); }
    if (have.has(t.name)) continue;
    const price = body.data.prices?.[t.name] ?? t.suggestedPrice;
    const [r] = await db.insert(recipes).values({ restaurantId: rid, name: t.name, sellingPriceEur: price.toFixed(2) }).returning();
    await db.insert(recipeIngredients).values(t.ingredients.map(([p, q]) => ({ recipeId: r.id, productId: byName.get(p)!, quantity: q.toFixed(4) })));
    createdRecipes++;
  }
  const inv = await db.insert(inventoryItems).values([...productIds].map((productId) => ({ restaurantId: rid, productId, quantity: '0', criticalLevel: '0' }))).onConflictDoNothing().returning({ id: inventoryItems.id });
  return c.json({ createdRecipes, trackedProducts: inv.length, totalProducts: productIds.size });
});

// -------------------------------------------------------------
// Import CSV : fournisseurs + offres/prix
// -------------------------------------------------------------
const importSchema = z.object({
  csv: z.string().min(1),
  dryRun: z.boolean().default(true),
  defaultSupplier: z.string().optional(),   // si la colonne fournisseur est absente
});

type Preview = { line: number; supplier: string; product: string; matched: string | null; matchedId: string | null; pack: string; packQty: number | null; packPrice: number | null; unitPrice: number | null; status: 'ok' | 'nouveau_produit' | 'erreur'; message?: string };

catalogRoutes.post('/import/suppliers', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = importSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const { headers, rows } = parseCsv(body.data.csv);
  if (!rows.length) return c.json({ error: 'Fichier vide ou illisible', headers }, 400);

  const byName = await ensureReference();
  const privateProducts = await db.select({ id: products.id, name: products.name, aliases: products.aliases }).from(products).where(eq(products.restaurantId, rid));
  const findPrivate = (q: string) => privateProducts.find((p) => normalize(p.name) === normalize(q) || p.aliases.some((a) => normalize(a) === normalize(q)));

  const previews: Preview[] = rows.map((row, i) => {
    const supplier = pick(row, 'supplier') || body.data.defaultSupplier || '';
    const product = pick(row, 'product'); const pack = pick(row, 'pack') || '';
    let packQty = toNumber(pick(row, 'packQty')); const price = toNumber(pick(row, 'price')); const unitPrice = toNumber(pick(row, 'unitPrice'));
    if (!packQty && pack) packQty = parsePack(pack)?.qty ?? null;
    if (!packQty && !unitPrice) packQty = 1;
    const packPrice = price ?? (unitPrice && packQty ? unitPrice * packQty : null);
    const ref = findReferenceProduct(product); const priv = findPrivate(product);
    const matched = priv?.name ?? ref?.name ?? null; const matchedId = priv?.id ?? (ref ? byName.get(ref.name) ?? null : null);
    const base: Preview = { line: i + 2, supplier, product, matched, matchedId, pack: pack || (packQty ? `${packQty}` : ''), packQty, packPrice, unitPrice: packPrice && packQty ? packPrice / packQty : unitPrice, status: 'ok' };
    if (!supplier) return { ...base, status: 'erreur', message: 'Fournisseur manquant' };
    if (!product) return { ...base, status: 'erreur', message: 'Produit manquant' };
    if (!packPrice) return { ...base, status: 'erreur', message: 'Prix manquant ou illisible' };
    if (!matched) return { ...base, status: 'nouveau_produit', message: 'Produit inconnu : sera créé comme produit privé' };
    return base;
  });

  const summary = { total: previews.length, ok: previews.filter((p) => p.status === 'ok').length, newProducts: previews.filter((p) => p.status === 'nouveau_produit').length, errors: previews.filter((p) => p.status === 'erreur').length, suppliers: [...new Set(previews.filter((p) => p.supplier).map((p) => p.supplier))] };
  if (body.data.dryRun) return c.json({ headers, summary, previews });

  // --- Import réel ---
  const supRows = await db.select().from(suppliers).where(eq(suppliers.restaurantId, rid));
  const supByName = new Map(supRows.map((s) => [normalize(s.name), s]));
  let createdSuppliers = 0, createdProducts = 0, upsertedOffers = 0;
  for (const p of previews) {
    if (p.status === 'erreur') continue;
    const row = rows[p.line - 2];
    let sup = supByName.get(normalize(p.supplier));
    if (!sup) {
      const lead = toNumber(pick(row, 'leadTime'));
      [sup] = await db.insert(suppliers).values({
        restaurantId: rid, name: p.supplier, phone: pick(row, 'phone') || null, whatsapp: pick(row, 'whatsapp') || null, email: pick(row, 'email') || null, city: pick(row, 'city') || null,
        leadTimeHours: lead ? (lead <= 15 ? lead * 24 : lead) : 48, minOrderEur: (toNumber(pick(row, 'minOrder')) ?? 0).toFixed(2), deliveryFeeEur: (toNumber(pick(row, 'deliveryFee')) ?? 0).toFixed(2),
        preferredChannel: pick(row, 'whatsapp') ? 'whatsapp' : pick(row, 'email') ? 'email' : 'telephone',
      }).returning();
      supByName.set(normalize(sup.name), sup); createdSuppliers++;
    }
    let productId = p.matchedId;
    if (!productId) {
      const catRaw = normalize(pick(row, 'category')); const cat = (['feculents', 'frais', 'viandes_poissons', 'epicerie', 'boissons', 'emballages'] as const).find((x) => catRaw.includes(x.split('_')[0])) ?? 'epicerie';
      const unitRaw = normalize(pick(row, 'unit')); const unit = unitRaw.startsWith('l') ? 'L' : unitRaw.startsWith('p') || unitRaw.startsWith('u') ? 'piece' : 'kg';
      const [np] = await db.insert(products).values({ restaurantId: rid, name: p.product, category: cat, baseUnit: unit }).returning();
      productId = np.id; privateProducts.push({ id: np.id, name: np.name, aliases: [] }); createdProducts++;
    }
    const packLabel = p.pack || 'Unité';
    const [offer] = await db.insert(supplierOffers).values({ restaurantId: rid, supplierId: sup.id, productId, packLabel, packQty: (p.packQty ?? 1).toFixed(3), packPriceEur: p.packPrice!.toFixed(2) })
      .onConflictDoUpdate({ target: [supplierOffers.supplierId, supplierOffers.productId, supplierOffers.packLabel], set: { packQty: (p.packQty ?? 1).toFixed(3), packPriceEur: p.packPrice!.toFixed(2), lastSeenAt: new Date(), inStock: true } }).returning();
    await db.insert(priceHistory).values({ restaurantId: rid, offerId: offer.id, unitPriceEur: (p.packPrice! / (p.packQty ?? 1)).toFixed(4), source: 'import' });
    upsertedOffers++;
  }
  // les produits importés deviennent suivis en stock
  const pids = [...new Set(previews.filter((p) => p.status !== 'erreur').map((p) => p.matchedId).filter(Boolean))] as string[];
  const allIds = pids.length ? pids : [];
  const extra = privateProducts.filter((pp) => previews.some((p) => p.status === 'nouveau_produit' && normalize(p.product) === normalize(pp.name))).map((pp) => pp.id);
  const toTrack = [...new Set([...allIds, ...extra])];
  if (toTrack.length) await db.insert(inventoryItems).values(toTrack.map((productId) => ({ restaurantId: rid, productId, quantity: '0', criticalLevel: '0' }))).onConflictDoNothing();

  return c.json({ headers, summary, createdSuppliers, createdProducts, upsertedOffers });
});

/** Export CSV des offres actuelles (pour corriger puis ré-importer). */
catalogRoutes.get('/export/offers.csv', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const rows = await db.select({ supplier: suppliers.name, product: products.name, pack: supplierOffers.packLabel, qty: supplierOffers.packQty, price: supplierOffers.packPriceEur, unit: products.baseUnit, phone: suppliers.phone, whatsapp: suppliers.whatsapp, email: suppliers.email, city: suppliers.city, lead: suppliers.leadTimeHours, min: suppliers.minOrderEur, fee: suppliers.deliveryFeeEur })
    .from(supplierOffers).innerJoin(suppliers, eq(suppliers.id, supplierOffers.supplierId)).innerJoin(products, eq(products.id, supplierOffers.productId)).where(eq(supplierOffers.restaurantId, rid)).orderBy(suppliers.name, products.name);
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const header = 'fournisseur;produit;conditionnement;quantite;unite;prix;telephone;whatsapp;email;ville;delai_h;minimum;frais_livraison';
  const body = rows.map((r) => [r.supplier, r.product, r.pack, Number(r.qty), r.unit, Number(r.price).toFixed(2).replace('.', ','), r.phone, r.whatsapp, r.email, r.city, r.lead, Number(r.min), Number(r.fee)].map(esc).join(';'));
  return new Response('\uFEFF' + [header, ...body].join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="afrisupply-offres.csv"' } });
});

/** Modèle CSV vierge. */
catalogRoutes.get('/import/template.csv', (c) => {
  const lines = [
    'fournisseur;produit;conditionnement;prix;telephone;whatsapp;ville;delai_h;minimum;frais_livraison',
    'Afro Distribution;Riz parfumé;Sac 25 kg;42,00;02 40 00 11 22;06 00 11 22 33;Nantes;24;80;0',
    'Afro Distribution;Attiéké;Carton 10 kg;34,00;;;;;;',
    'Primeurs du Marché;Tomate;Plateau 6 kg;9,60;02 40 33 44 55;;Rezé;24;50;10',
    'Volailles LA;Poulet entier;Carton 10 kg;48,00;;;Ancenis;48;120;0',
  ];
  return new Response('\uFEFF' + lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="modele-import-afrisupply.csv"' } });
});

// petit utilitaire utilisé par les tests d'intégration
export const _internal = { ensureReference, inArray, and };
