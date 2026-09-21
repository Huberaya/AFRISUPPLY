// =============================================================
// Seed de démonstration — restaurant « Chez Awa » (Nantes)
// Référentiel produits africains + 5 fournisseurs + offres/prix
// + stocks + 10 recettes + 60 jours de ventes + mouvements.
// Idempotent : ne fait rien si le restaurant démo existe déjà.
// =============================================================
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { getDb } from './client.js';
import * as s from './schema.js';

import { REFERENCE_PRODUCTS } from './data/products.js';
import { RECIPE_TEMPLATES } from './data/recipes.js';
export { REFERENCE_PRODUCTS };

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: number, dec = 3) => v.toFixed(dec);

export async function seedDemo(opts: { force?: boolean } = {}) {
  // Chantier 2 (audit) : le restaurant de démonstration porte des identifiants publics.
  // En production, il ne doit exister que si c'est un choix explicite (ALLOW_DEMO_SEED=true).
  const prod = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  if (prod && process.env.ALLOW_DEMO_SEED !== 'true') {
    const msg = 'Seed de démonstration refusé en production (compte awa@chezawa.fr / demo1234 accessible publiquement). Utilisez ALLOW_DEMO_SEED=true si c’est volontaire.';
    console.error(`[seed] ${msg}`);
    return { skipped: true as const, reason: msg };
  }
  const db = await getDb();

  const existing = await db.select().from(s.restaurants).where(eq(s.restaurants.slug, 'chez-awa')).limit(1);
  if (existing.length && !opts.force) {
    console.log('[seed] Restaurant démo déjà présent — rien à faire.');
    return { restaurantId: existing[0].id };
  }
  if (existing.length && opts.force) {
    await db.delete(s.restaurants).where(eq(s.restaurants.slug, 'chez-awa'));
  }

  // --- Référentiel produits (partagé, restaurant_id NULL) ---
  const existingRef = await db.select({ id: s.products.id, name: s.products.name }).from(s.products);
  const byName = new Map(existingRef.map((p) => [p.name, p.id]));
  const missing = REFERENCE_PRODUCTS.filter((p) => !byName.has(p.name));
  if (missing.length) {
    const inserted = await db.insert(s.products).values(
      missing.map((p) => ({ name: p.name, category: p.category, baseUnit: p.baseUnit, origin: p.origin, aliases: [...p.aliases, ...(p.tags ?? [])], shelfLifeDays: p.shelfLifeDays, seasonality: p.season?.length ? JSON.stringify(p.season) : null })),
    ).returning({ id: s.products.id, name: s.products.name });
    inserted.forEach((p) => byName.set(p.name, p.id));
  }
  const pid = (name: string) => {
    const id = byName.get(name);
    if (!id) throw new Error(`Produit référentiel manquant : ${name}`);
    return id;
  };

  // --- Utilisateur + restaurant ---
  const passwordHash = await bcrypt.hash('demo1234', 10);
  const [user] = await db.insert(s.users).values({
    email: 'awa@chezawa.fr', passwordHash, fullName: 'Awa Diallo', phone: '+33 6 12 34 56 78',
  }).onConflictDoUpdate({ target: s.users.email, set: { fullName: 'Awa Diallo' } }).returning();

  const [restaurant] = await db.insert(s.restaurants).values({
    name: 'Chez Awa', slug: 'chez-awa', city: 'Nantes', postalCode: '44100', address: '12 rue de la Bastille',
    cuisine: 'sénégalaise & ivoirienne', coversPerDay: 60, plan: 'pro',
    trialEndsAt: daysAgo(-30), settings: { priceIncreaseAlertPct: 8, forecastHorizonDays: 7 },
  }).returning();
  const rid = restaurant.id;
  await db.insert(s.restaurantMembers).values({ restaurantId: rid, userId: user.id, role: 'owner' });

  // --- Fournisseurs ---
  const supplierRows = await db.insert(s.suppliers).values([
    { restaurantId: rid, name: 'Afro Distribution Nantes', contactName: 'Moussa K.', phone: '+33 2 40 00 11 22', whatsapp: '+33 6 00 11 22 33', city: 'Nantes', categories: ['feculents', 'epicerie', 'boissons'], leadTimeHours: 24, minOrderEur: '80', deliveryFeeEur: '0', preferredChannel: 'whatsapp', rating: '4.8' },
    { restaurantId: rid, name: 'Tropic Import Paris', contactName: 'Service commandes', email: 'commandes@tropic-import.example', phone: '+33 1 40 00 22 33', city: 'Paris', categories: ['feculents', 'epicerie', 'boissons', 'viandes_poissons'], leadTimeHours: 72, minOrderEur: '150', deliveryFeeEur: '25', preferredChannel: 'email', rating: '4.3' },
    { restaurantId: rid, name: 'Primeurs du Marché (MIN Nantes)', contactName: 'Jean-Luc', phone: '+33 2 40 33 44 55', city: 'Rezé', categories: ['frais'], leadTimeHours: 24, deliveryDays: [1, 2, 3, 4, 5, 6], minOrderEur: '50', deliveryFeeEur: '10', preferredChannel: 'telephone', rating: '4.5' },
    { restaurantId: rid, name: 'Volailles Loire Atlantique', contactName: 'Mme Guérin', email: 'contact@volailles-la.example', phone: '+33 2 40 66 77 88', city: 'Ancenis', categories: ['viandes_poissons'], leadTimeHours: 48, deliveryDays: [2, 5], minOrderEur: '120', deliveryFeeEur: '0', preferredChannel: 'email', rating: '4.9' },
    { restaurantId: rid, name: 'Sahel Épices (en ligne)', email: 'pro@sahel-epices.example', city: 'Lyon', categories: ['epicerie', 'boissons'], leadTimeHours: 120, minOrderEur: '60', deliveryFeeEur: '15', preferredChannel: 'plateforme', rating: '4.1' },
  ]).returning();
  const sup = Object.fromEntries(supplierRows.map((r) => [r.name, r.id])) as Record<string, string>;
  const AFRO = sup['Afro Distribution Nantes'], TROPIC = sup['Tropic Import Paris'], PRIM = sup['Primeurs du Marché (MIN Nantes)'], VOL = sup['Volailles Loire Atlantique'], SAHEL = sup['Sahel Épices (en ligne)'];

  // --- Offres (fournisseur × produit × conditionnement) ---
  type O = [supplier: string, product: string, packLabel: string, packQty: number, packPrice: number, inStock?: boolean];
  const offers: O[] = [
    [AFRO, 'Riz parfumé', 'Sac 25 kg', 25, 42.00], [TROPIC, 'Riz parfumé', 'Sac 25 kg', 25, 45.00], [SAHEL, 'Riz parfumé', 'Sac 25 kg', 25, 39.00, false],
    [AFRO, 'Riz brisé', 'Sac 25 kg', 25, 38.50], [TROPIC, 'Riz brisé', 'Sac 25 kg', 25, 36.90],
    [AFRO, 'Attiéké', 'Carton 10 kg', 10, 34.00], [TROPIC, 'Attiéké', 'Carton 10 kg', 10, 31.00, false],
    [AFRO, 'Plantain', 'Carton 18 kg', 18, 27.00], [PRIM, 'Plantain', 'Carton 18 kg', 18, 29.50],
    [AFRO, 'Igname', 'Carton 20 kg', 20, 46.00],
    [PRIM, 'Tomate', 'Plateau 6 kg', 6, 9.60], [PRIM, 'Oignon jaune', 'Sac 10 kg', 10, 8.90], [PRIM, 'Piment frais fort (habanero / antillais)', 'Barquette 1 kg', 1, 7.80],
    [PRIM, 'Gombo frais', 'Carton 4 kg', 4, 18.00], [PRIM, 'Feuilles de manioc', 'Sachet 1 kg', 1, 6.50], [PRIM, 'Ndolé (feuilles)', 'Sachet 1 kg', 1, 7.90], [PRIM, 'Manioc frais', 'Carton 10 kg', 10, 16.00], [PRIM, 'Patate douce', 'Carton 10 kg', 10, 14.00], [TROPIC, 'Crevettes séchées', 'Sachet 500 g', 0.5, 9.50], [PRIM, 'Aubergine africaine (djakatou)', 'Carton 5 kg', 5, 16.50], [PRIM, 'Gingembre frais', 'Carton 5 kg', 5, 17.50],
    [PRIM, 'Citron vert', 'Carton 4 kg', 4, 9.20], [PRIM, 'Persil plat', 'Botte', 1, 0.90], [PRIM, 'Chou blanc', 'Pièce 2 kg', 2, 2.40], [PRIM, 'Carotte', 'Sac 10 kg', 10, 7.50],
    [VOL, 'Poulet entier PAC', 'Carton 10 kg', 10, 48.00], [TROPIC, 'Poulet entier PAC', 'Carton 10 kg', 10, 44.00],
    [VOL, 'Cuisses de poulet', 'Carton 10 kg', 10, 42.00], [VOL, 'Bœuf à braiser (paleron / macreuse)', 'Colis 5 kg', 5, 54.50], [VOL, 'Mouton (épaule / gigot)', 'Colis 5 kg', 5, 62.00],
    [TROPIC, 'Capitaine (thiof / mérou)', 'Carton 10 kg', 10, 129.00], [TROPIC, 'Tilapia entier', 'Carton 10 kg', 10, 58.00], [TROPIC, 'Poisson fumé (guedj / kong fumé)', 'Carton 5 kg', 5, 72.00], [AFRO, 'Poisson fumé (guedj / kong fumé)', 'Carton 5 kg', 5, 75.00],
    [AFRO, 'Huile de palme rouge', 'Bidon 5 L', 5, 24.50], [TROPIC, 'Huile de palme rouge', 'Bidon 5 L', 5, 22.00], [SAHEL, 'Huile de palme rouge', 'Bidon 5 L', 5, 21.50],
    [AFRO, 'Huile de tournesol', 'Bidon 10 L', 10, 19.90], [AFRO, "Pâte d'arachide", 'Seau 5 kg', 5, 27.50], [SAHEL, "Pâte d'arachide", 'Seau 5 kg', 5, 25.00],
    [AFRO, 'Double concentré de tomate', 'Boîte 4,5 kg', 4.5, 9.80], [AFRO, 'Cube bouillon (volaille / bœuf)', 'Carton 240 cubes', 240, 19.00], [SAHEL, 'Graines de néré (soumbala)', 'Sachet 1 kg', 1, 14.00],
    [AFRO, 'Ail frais', 'Filet 5 kg', 5, 17.00], [AFRO, 'Moutarde de Dijon', 'Seau 5 kg', 5, 12.50], [AFRO, 'Vinaigre blanc', 'Bidon 5 L', 5, 6.50], [AFRO, 'Sel fin', 'Sac 25 kg', 25, 9.00], [AFRO, 'Sucre en poudre', 'Sac 25 kg', 25, 26.00],
    [SAHEL, 'Tamarin (pulpe)', 'Bloc 1 kg', 1, 6.80], [AFRO, 'Tamarin (pulpe)', 'Bloc 1 kg', 1, 7.20],
    [AFRO, 'Fleurs de bissap séchées', 'Sac 5 kg', 5, 39.00], [SAHEL, 'Fleurs de bissap séchées', 'Sac 5 kg', 5, 34.50], [TROPIC, 'Fleurs de bissap séchées', 'Sac 5 kg', 5, 37.00],
    [SAHEL, 'Poudre de baobab (bouye)', 'Sac 1 kg', 1, 11.00], [SAHEL, 'Gingembre séché (tranches / poudre)', 'Sac 1 kg', 1, 8.50], [PRIM, 'Menthe fraîche', 'Botte', 1, 0.80],
    [AFRO, 'Eau minérale 50 cl', 'Pack 24', 24, 7.20], [AFRO, 'Bière Flag 33 cl', 'Carton 24', 24, 31.00],
    [AFRO, 'Barquette aluminium 1000 mL + couvercle', 'Carton 500', 500, 62.00], [AFRO, 'Sac kraft à poignées', 'Carton 500', 500, 38.00], [AFRO, 'Gobelet PET 33 cl / 50 cl (froid)', 'Carton 1000', 1000, 45.00],
  ];
  const offerRows = await db.insert(s.supplierOffers).values(
    offers.map(([supplierId, product, packLabel, packQty, packPrice, inStock = true]) => ({
      restaurantId: rid, supplierId, productId: pid(product), packLabel, packQty: num(packQty), packPriceEur: num(packPrice, 2), inStock,
    })),
  ).returning();

  // --- Historique de prix : 90 jours, avec une hausse de 12 % sur l'huile de palme Afro et +9 % sur le poulet Volailles ---
  const ph: (typeof s.priceHistory.$inferInsert)[] = [];
  for (const o of offerRows) {
    const unitNow = Number(o.packPriceEur) / Number(o.packQty);
    const prodName = [...byName.entries()].find(([, id]) => id === o.productId)?.[0];
    const hike = (o.supplierId === AFRO && prodName === 'Huile de palme rouge') ? 0.12 : (o.supplierId === VOL && prodName === 'Poulet entier PAC') ? 0.09 : 0;
    for (const d of [90, 60, 30, 7, 0]) {
      const factor = hike && d >= 7 ? 1 / (1 + hike) : 1;
      ph.push({ restaurantId: rid, offerId: o.id, unitPriceEur: num(unitNow * factor, 4), source: d === 0 ? 'catalogue' : 'reception', recordedAt: daysAgo(d) });
    }
  }
  await db.insert(s.priceHistory).values(ph);

  // --- Recettes (par portion, en baseUnit) ---
  const RECIPES: { name: string; price: number; ing: [string, number][] }[] = [
    { name: 'Poulet braisé', price: 18, ing: [['Poulet entier PAC', 0.45], ['Riz parfumé', 0.12], ['Oignon jaune', 0.08], ['Huile de tournesol', 0.03], ['Piment frais fort (habanero / antillais)', 0.01], ['Moutarde de Dijon', 0.015], ['Cube bouillon (volaille / bœuf)', 1], ['Plantain', 0.15]] },
    { name: 'Mafé bœuf', price: 16, ing: [['Bœuf à braiser (paleron / macreuse)', 0.2], ["Pâte d'arachide", 0.08], ['Riz parfumé', 0.15], ['Tomate', 0.08], ['Double concentré de tomate', 0.02], ['Oignon jaune', 0.06], ['Patate douce', 0.08], ['Carotte', 0.05], ['Huile de tournesol', 0.02], ['Cube bouillon (volaille / bœuf)', 1]] },
    { name: 'Yassa poulet', price: 16, ing: [['Cuisses de poulet', 0.35], ['Oignon jaune', 0.25], ['Citron vert', 0.06], ['Moutarde de Dijon', 0.02], ['Riz parfumé', 0.15], ['Huile de tournesol', 0.03], ['Cube bouillon (volaille / bœuf)', 1]] },
    { name: 'Thiéboudienne', price: 17, ing: [['Capitaine (thiof / mérou)', 0.25], ['Riz brisé', 0.18], ['Tomate', 0.08], ['Double concentré de tomate', 0.03], ['Chou blanc', 0.08], ['Carotte', 0.06], ['Manioc frais', 0.06], ['Aubergine africaine (djakatou)', 0.05], ['Huile de tournesol', 0.04], ['Poisson fumé (guedj / kong fumé)', 0.02], ['Cube bouillon (volaille / bœuf)', 1]] },
    { name: 'Attiéké poisson', price: 15, ing: [['Attiéké', 0.25], ['Tilapia entier', 0.35], ['Tomate', 0.08], ['Oignon jaune', 0.06], ['Piment frais fort (habanero / antillais)', 0.01], ['Huile de tournesol', 0.04], ['Citron vert', 0.03]] },
    { name: 'Alloco', price: 6, ing: [['Plantain', 0.3], ['Huile de tournesol', 0.06], ['Piment frais fort (habanero / antillais)', 0.005], ['Oignon jaune', 0.03]] },
    { name: 'Ndolé crevettes', price: 17, ing: [['Ndolé (feuilles)', 0.15], ["Pâte d'arachide", 0.06], ['Crevettes séchées', 0.03], ['Bœuf à braiser (paleron / macreuse)', 0.12], ['Oignon jaune', 0.05], ['Huile de palme rouge', 0.03], ['Plantain', 0.15], ['Ail frais', 0.005]] },
    { name: 'Saka-saka', price: 14, ing: [['Feuilles de manioc', 0.2], ['Huile de palme rouge', 0.04], ['Poisson fumé (guedj / kong fumé)', 0.05], ['Oignon jaune', 0.04], ['Riz parfumé', 0.15], ['Cube bouillon (volaille / bœuf)', 1]] },
    { name: 'Jus de bissap 33 cl', price: 3.5, ing: [['Fleurs de bissap séchées', 0.02], ['Sucre en poudre', 0.04], ['Menthe fraîche', 0.05], ['Gobelet PET 33 cl / 50 cl (froid)', 1]] },
    { name: 'Jus de gingembre 33 cl', price: 3.5, ing: [['Gingembre frais', 0.06], ['Sucre en poudre', 0.04], ['Citron vert', 0.02], ['Gobelet PET 33 cl / 50 cl (froid)', 1]] },
  ];
  const recipeRows = await db.insert(s.recipes).values(RECIPES.map((r) => ({ restaurantId: rid, name: r.name, sellingPriceEur: num(r.price, 2) }))).returning();
  await db.insert(s.recipeIngredients).values(
    RECIPES.flatMap((r, i) => r.ing.map(([p, q]) => ({ recipeId: recipeRows[i].id, productId: pid(p), quantity: num(q, 4) }))),
  );

  // --- Ventes : 60 jours, plus fort vendredi/samedi, fermé le lundi ---
  const BASE: Record<string, number> = { 'Poulet braisé': 18, 'Mafé bœuf': 10, 'Yassa poulet': 12, 'Thiéboudienne': 9, 'Attiéké poisson': 11, 'Alloco': 14, 'Ndolé crevettes': 5, 'Saka-saka': 4, 'Jus de bissap 33 cl': 22, 'Jus de gingembre 33 cl': 15 };
  const salesRows: (typeof s.sales.$inferInsert)[] = [];
  let seed = 42; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let d = 60; d >= 1; d--) {
    const date = daysAgo(d); const dow = date.getDay();
    if (dow === 1) continue;
    const dayFactor = dow === 5 ? 1.45 : dow === 6 ? 1.6 : dow === 0 ? 1.2 : 1;
    for (const r of recipeRows) {
      const portions = Math.max(0, Math.round(BASE[r.name] * dayFactor * (0.8 + rnd() * 0.4)));
      if (portions) salesRows.push({ restaurantId: rid, recipeId: r.id, day: isoDay(date), portions });
    }
  }
  await db.insert(s.sales).values(salesRows);

  // --- Stocks : niveaux volontairement contrastés pour les alertes de démo ---
  type Inv = [product: string, qty: number, critical: number, target: number, preferred?: string];
  const INV: Inv[] = [
    ['Riz parfumé', 22, 15, 45, AFRO], ['Riz brisé', 30, 10, 30, TROPIC], ['Attiéké', 6, 8, 25, AFRO], ['Plantain', 14, 10, 30, AFRO], ['Igname', 12, 5, 20],
    ['Manioc frais', 4, 3, 8, PRIM], ['Patate douce', 9, 4, 12, PRIM],
    ['Tomate', 11, 8, 20, PRIM], ['Oignon jaune', 26, 12, 40, PRIM], ['Piment frais fort (habanero / antillais)', 1.5, 1, 3, PRIM], ['Gombo frais', 3, 2, 6, PRIM], ['Aubergine africaine (djakatou)', 2, 2, 6, PRIM],
    ['Feuilles de manioc', 1.2, 1.5, 4, PRIM], ['Ndolé (feuilles)', 2.5, 1.5, 4, PRIM], ['Gingembre frais', 6, 4, 10, PRIM], ['Citron vert', 5, 3, 8, PRIM], ['Chou blanc', 6, 4, 10, PRIM], ['Carotte', 7, 4, 12, PRIM], ['Menthe fraîche', 6, 5, 15, PRIM],
    ['Poulet entier PAC', 34, 25, 70, VOL], ['Cuisses de poulet', 18, 15, 40, VOL], ['Bœuf à braiser (paleron / macreuse)', 9, 6, 15, VOL], ['Capitaine (thiof / mérou)', 7, 6, 15, TROPIC], ['Tilapia entier', 12, 8, 20, TROPIC], ['Poisson fumé (guedj / kong fumé)', 3, 2, 6, AFRO], ['Crevettes séchées', 1, 0.5, 2, TROPIC],
    ['Huile de palme rouge', 4, 5, 15, AFRO], ['Huile de tournesol', 22, 10, 30, AFRO], ["Pâte d'arachide", 6, 4, 10, AFRO], ['Double concentré de tomate', 5, 3, 9, AFRO], ['Cube bouillon (volaille / bœuf)', 180, 100, 480, AFRO],
    ['Ail frais', 2, 1, 5, AFRO], ['Moutarde de Dijon', 3, 2, 5, AFRO], ['Sucre en poudre', 18, 10, 30, AFRO], ['Sel fin', 12, 5, 25, AFRO],
    ['Fleurs de bissap séchées', 2.5, 3, 10, AFRO], ['Gobelet PET 33 cl / 50 cl (froid)', 600, 400, 2000, AFRO], ['Barquette aluminium 1000 mL + couvercle', 250, 200, 1000, AFRO],
  ];
  const invRows = await db.insert(s.inventoryItems).values(
    INV.map(([p, qty, critical, target, pref]) => ({ restaurantId: rid, productId: pid(p), quantity: num(qty), criticalLevel: num(critical), targetLevel: num(target), preferredSupplierId: pref, lastCountedAt: daysAgo(0) })),
  ).returning();

  // --- Commandes passées (pour l'historique fournisseur & dépenses) ---
  const pastOrders: { sup: string; d: number; lines: [string, number][]; late?: boolean; short?: [string, number] }[] = [
    { sup: AFRO, d: 42, lines: [['Riz parfumé', 2], ['Huile de palme rouge', 2], ['Cube bouillon (volaille / bœuf)', 1]] },
    { sup: VOL, d: 40, lines: [['Poulet entier PAC', 4], ['Bœuf à braiser (paleron / macreuse)', 2]] },
    { sup: PRIM, d: 38, lines: [['Tomate', 3], ['Oignon jaune', 2], ['Plantain', 1]] },
    { sup: AFRO, d: 28, lines: [['Attiéké', 2], ['Riz parfumé', 2], ['Fleurs de bissap séchées', 1]], late: true },
    { sup: VOL, d: 26, lines: [['Poulet entier PAC', 5], ['Cuisses de poulet', 2]] },
    { sup: TROPIC, d: 21, lines: [['Capitaine (thiof / mérou)', 1], ['Tilapia entier', 2], ['Riz brisé', 2]], short: ['Riz brisé', 45] },
    { sup: PRIM, d: 17, lines: [['Tomate', 3], ['Oignon jaune', 2], ['Gombo frais', 1], ['Piment frais fort (habanero / antillais)', 2]] },
    { sup: AFRO, d: 14, lines: [['Riz parfumé', 2], ['Huile de palme rouge', 2], ['Sucre en poudre', 1]] },
    { sup: VOL, d: 12, lines: [['Poulet entier PAC', 5]] },
    { sup: PRIM, d: 9, lines: [['Tomate', 2], ['Oignon jaune', 2], ['Feuilles de manioc', 2], ['Menthe fraîche', 20]] },
    { sup: AFRO, d: 5, lines: [['Attiéké', 2], ['Plantain', 1]], late: true },
    { sup: VOL, d: 3, lines: [['Poulet entier PAC', 4], ['Bœuf à braiser (paleron / macreuse)', 1]] },
  ];
  let seq = 100;
  for (const po of pastOrders) {
    const lines = po.lines.map(([p, packs]) => {
      const offer = offerRows.find((o) => o.supplierId === po.sup && o.productId === pid(p))!;
      const qty = packs * Number(offer.packQty); const unit = Number(offer.packPriceEur) / Number(offer.packQty);
      return { offer, productId: pid(p), packs, quantity: qty, unitPrice: unit, total: packs * Number(offer.packPriceEur), productName: p };
    });
    const total = lines.reduce((a, l) => a + l.total, 0);
    const [order] = await db.insert(s.orders).values({
      restaurantId: rid, supplierId: po.sup, reference: `AFS-2026-${String(++seq).padStart(6, '0')}`, status: 'livree', channel: 'whatsapp',
      expectedAt: isoDay(daysAgo(po.d - 1)), totalEur: num(total, 2), createdBy: user.id, sentAt: daysAgo(po.d), deliveredAt: daysAgo(po.d - (po.late ? 3 : 1)), createdAt: daysAgo(po.d),
    }).returning();
    const lineRows = await db.insert(s.orderLines).values(lines.map((l) => ({
      orderId: order.id, productId: l.productId, offerId: l.offer.id, packLabel: l.offer.packLabel, packs: l.packs, quantity: num(l.quantity), unitPriceEur: num(l.unitPrice, 4), lineTotalEur: num(l.total, 2),
      receivedQty: num(po.short && po.short[0] === l.productName ? po.short[1] : l.quantity),
    }))).returning();
    const [delivery] = await db.insert(s.deliveries).values({ restaurantId: rid, orderId: order.id, receivedAt: order.deliveredAt!, receivedBy: user.id, isLate: !!po.late, hasDiscrepancy: !!po.short }).returning();
    if (po.short) {
      const l = lineRows.find((x) => x.productId === pid(po.short![0]))!;
      await db.insert(s.deliveryDiscrepancies).values({ deliveryId: delivery.id, orderLineId: l.id, orderedQty: l.quantity, receivedQty: num(po.short[1]), reason: 'manquant', claimMessage: `Bonjour, nous avons constaté un écart de ${Number(l.quantity) - po.short[1]} kg sur la livraison ${order.reference} (${po.short[0]} : commandé ${l.quantity} kg, reçu ${po.short[1]} kg). Merci de nous indiquer la suite à donner.`, resolved: true });
    }
    // mouvements de réception
    for (const l of lineRows) {
      const inv = invRows.find((i) => i.productId === l.productId);
      if (inv) await db.insert(s.stockMovements).values({ restaurantId: rid, inventoryItemId: inv.id, type: 'reception', quantity: l.receivedQty!, unitCostEur: l.unitPriceEur, orderId: order.id, createdBy: user.id, createdAt: delivery.receivedAt });
    }
  }

  // --- Règles de réassort ---
  const invByProduct = new Map(invRows.map((i) => [i.productId, i.id]));
  await db.insert(s.reorderRules).values([
    { restaurantId: rid, inventoryItemId: invByProduct.get(pid('Riz parfumé'))!, threshold: '15', reorderQty: '50', supplierStrategy: 'best' },
    { restaurantId: rid, inventoryItemId: invByProduct.get(pid('Poulet entier PAC'))!, threshold: '25', reorderQty: '50', supplierStrategy: 'preferred' },
    { restaurantId: rid, inventoryItemId: invByProduct.get(pid('Huile de palme rouge'))!, threshold: '5', reorderQty: '15', supplierStrategy: 'best' },
  ]);

  console.log(`[seed] Restaurant démo « Chez Awa » créé (${rid}) — login awa@chezawa.fr / demo1234`);
  return { restaurantId: rid };
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedDemo({ force: process.argv.includes('--force') }).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
