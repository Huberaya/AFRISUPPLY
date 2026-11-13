// Chantier P0.2 — CLOISONNEMENT ENTRE RESTAURANTS, ET ENTRE FOURNISSEURS ET RESTAURANTS.
//
// Règle vérifiée : un utilisateur du restaurant A ne peut ni lire ni modifier les données du
// restaurant B — que l'identifiant de B arrive par l'URL, par le corps de la requête ou par un
// en-tête. Les partages légitimes (un grossiste voit la commande qu'un restaurant lui passe ; un
// restaurant voit le catalogue public d'un grossiste) continuent de fonctionner.
//
// Méthode : deux restaurants réellement peuplés par les routes de l'application, puis
//   1. les références croisées prouvées par l'audit P0.1 (et celles trouvées depuis) ;
//   2. un balayage de TOUTES les routes à paramètre du registre de l'application, où B présente les
//      identifiants réels de A — avec empreinte de toutes les tables de A avant et après ;
//   3. le même balayage entre deux grossistes ;
//   4. les partages légitimes.
// Tout s'exécute sur une base PostgreSQL embarquée (PGlite) : ce fichier ne prouve rien sur la base
// Neon de production (voir docs/chantiers/interventions/NEON-01).
import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { and, eq, inArray, isNull, getTableColumns } from 'drizzle-orm';
import * as dbm from '@afrisupply/db';
import { runMigrations, getDb, trackProducts, visibleProductIds } from '@afrisupply/db';
import { app } from '../app.js';
import { _resetRateLimits } from '../lib/ops.js';
import { creerAppel, inscrire, ajouterMembre, confirmerAdresse, type Compte, type Rep } from './aide-comptes.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.DATABASE_URL = '';
process.env.PGLITE_DIR = 'memory://p0-cloisonnement'; process.env.ADMIN_EMAILS = 'exploitant@afrisupply.test';
process.env.MAIL_OUTBOX_DIR = '/tmp/afs-outbox-p0-cloisonnement'; process.env.BACKUP_DIR = '/tmp/afs-backups-p0-cloisonnement';
delete process.env.RESEND_API_KEY;

const appel = creerAppel(app);
type Ids = Record<string, string>;
type Monde = { compte: Compte; ids: Ids; nom: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMAIN = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

/** Tables qui portent une colonne `restaurantId` : leurs lignes appartiennent à un restaurant. */
const tablesParRestaurant = (): [string, any][] => Object.entries(dbm).filter(([, v]) => {
  try { return !!v && typeof v === 'object' && 'restaurantId' in getTableColumns(v as any); } catch { return false; }
}) as [string, any][];

/** Empreinte de tout ce qui appartient à un restaurant (lignes directes + lignes filles). */
async function empreinte(rid: string): Promise<Record<string, string>> {
  const db = await getDb(); const out: Record<string, string> = {};
  const signer = (rows: unknown[]) => `${rows.length} ligne(s) ${createHash('sha256').update(rows.map((r) => JSON.stringify(r)).sort().join('\n')).digest('hex').slice(0, 16)}`;
  for (const [nom, table] of tablesParRestaurant()) {
    if (nom === 'schema' || nom === 'usageEvents' || nom === 'rateLimits') continue;
    out[nom] = signer(await db.select().from(table).where(eq(table.restaurantId, rid)));
  }
  const commandes = (await db.select({ id: dbm.orders.id }).from(dbm.orders).where(eq(dbm.orders.restaurantId, rid))).map((o) => o.id);
  out.orderLines = signer(commandes.length ? await db.select().from(dbm.orderLines).where(inArray(dbm.orderLines.orderId, commandes)) : []);
  const recettes = (await db.select({ id: dbm.recipes.id }).from(dbm.recipes).where(eq(dbm.recipes.restaurantId, rid))).map((r) => r.id);
  out.recipeIngredients = signer(recettes.length ? await db.select().from(dbm.recipeIngredients).where(inArray(dbm.recipeIngredients.recipeId, recettes)) : []);
  const livraisons = (await db.select({ id: dbm.deliveries.id }).from(dbm.deliveries).where(eq(dbm.deliveries.restaurantId, rid))).map((d) => d.id);
  out.deliveryDiscrepancies = signer(livraisons.length ? await db.select().from(dbm.deliveryDiscrepancies).where(inArray(dbm.deliveryDiscrepancies.deliveryId, livraisons)) : []);
  out.restaurant = signer(await db.select().from(dbm.restaurants).where(eq(dbm.restaurants.id, rid)));
  return out;
}

/** Peuple un restaurant par les routes de l'application ; chaque libellé porte la marque « du restaurant X ». */
async function peupler(compte: Compte, nom: string): Promise<Monde> {
  const h = compte.h; const db = await getDb(); const marque = `du restaurant ${nom}`;
  const ok = (r: Rep, attendu: number, quoi: string) => { if (r.status !== attendu) throw new Error(`${quoi} (${nom}) : HTTP ${r.status} ${r.text.slice(0, 200)}`); return r; };
  ok(await appel('GET', '/api/catalog', undefined, h), 200, 'catalogue');
  const ref = await db.select().from(dbm.products).where(isNull(dbm.products.restaurantId)).limit(3);
  const fournisseur = ok(await appel('POST', '/api/suppliers', { name: `Fournisseur ${marque}`, leadTimeHours: 24 }, h), 201, 'fournisseur').json;
  const offre = ok(await appel('POST', `/api/suppliers/${fournisseur.id}/offers`, { productId: ref[0].id, packLabel: `Sac 10 kg ${marque}`, packQty: 10, packPrice: 25 }, h), 201, 'offre').json;
  ok(await appel('POST', '/api/catalog/track', { productIds: [ref[0].id, ref[1].id] }, h), 200, 'suivi');
  const produit = ok(await appel('POST', '/api/catalog/products', { name: `Produit privé ${marque}`, category: 'epicerie', baseUnit: 'kg' }, h), 201, 'produit privé').json;
  ok(await appel('POST', '/api/catalog/track', { productIds: [produit.id] }, h), 200, 'suivi du produit privé');
  const recette = ok(await appel('POST', '/api/recipes', { name: `Recette ${marque}`, sellingPriceEur: 12, ingredients: [{ productId: ref[0].id, quantity: 0.2 }] }, h), 201, 'recette').json;
  const commande = ok(await appel('POST', '/api/orders', { supplierId: fournisseur.id, lines: [{ offerId: offre.id, packs: 1 }], notes: `Note ${marque}` }, h), 201, 'commande').json.order;
  const [article] = await db.select().from(dbm.inventoryItems).where(and(eq(dbm.inventoryItems.restaurantId, compte.rid), eq(dbm.inventoryItems.productId, ref[0].id)));
  ok(await appel('PUT', `/api/reorder-rules/${article.id}`, { threshold: 1, reorderQty: 5 }, h), 200, 'règle de réassort');
  ok(await appel('PUT', '/api/forecast/events', { events: [{ day: DEMAIN, label: `Événement ${marque}`, multiplier: 1.5 }] }, h), 200, 'événement');
  const liste = ok(await appel('POST', '/api/shopping/lists', { name: `Liste ${marque}`.slice(0, 60), text: '10 kg riz' }, h), 201, 'liste de courses').json.list;
  ok(await appel('POST', '/api/sales', { day: new Date().toISOString().slice(0, 10), lines: [{ recipeId: recette.id, portions: 3 }] }, h), 200, 'ventes');
  ok(await appel('POST', `/api/stock/${article.id}/movements`, { type: 'reception', quantity: 4, note: `Mouvement ${marque}` }, h), 200, 'mouvement de stock');
  ok(await appel('POST', `/api/orders/${commande.id}/send`, {}, h), 200, 'envoi de la commande');
  const [ligne] = await db.select().from(dbm.orderLines).where(eq(dbm.orderLines.orderId, commande.id));
  ok(await appel('POST', `/api/orders/${commande.id}/receive`, { lines: [{ lineId: ligne.id, receivedQty: 6 }], notes: `Réception ${marque}` }, h), 200, 'réception avec écart');
  ok(await appel('POST', '/api/feedback', { kind: 'idee', message: `Idée ${marque}` }, h), 201, 'retour');
  ok(await appel('POST', '/api/alerts/refresh', {}, h), 200, 'alertes');

  // Identifiants réels de tout ce que possède ce restaurant.
  const ids: Ids = { restaurant: compte.rid, proprietaire: compte.userId, ligneDeCommande: ligne.id, produitDuReferentiel: ref[0].id, listeDeCourses: liste.id };
  for (const [nomTable, table] of tablesParRestaurant()) {
    if (nomTable === 'schema') continue;
    const cols = getTableColumns(table);
    if (!('id' in cols)) continue;
    const rows = await db.select().from(table).where(eq(table.restaurantId, compte.rid)) as { id: string }[];
    if (rows[0]?.id && UUID.test(String(rows[0].id))) ids[nomTable] = rows[0].id;
  }
  const [ecart] = await db.select({ id: dbm.deliveryDiscrepancies.id }).from(dbm.deliveryDiscrepancies).innerJoin(dbm.deliveries, eq(dbm.deliveries.id, dbm.deliveryDiscrepancies.deliveryId)).where(eq(dbm.deliveries.restaurantId, compte.rid));
  if (ecart) ids.ecartDeLivraison = ecart.id;
  ids.inventoryItems = article.id;   // l'article qui porte la règle de réassort
  ids.products = produit.id;         // le produit privé (et non un produit du référentiel)
  return { compte, ids, nom };
}

/** Routes de l'application (une ligne par méthode + chemin), sans les middlewares. */
const routes = () => {
  const vues = new Set<string>(); const out: { method: string; path: string }[] = [];
  for (const r of app.routes) { if (r.method === 'ALL') continue; const k = `${r.method} ${r.path}`; if (vues.has(k)) continue; vues.add(k); out.push({ method: r.method, path: r.path }); }
  return out;
};
const HORS_RESTAURANT = /^\/api\/(auth|public|admin|vendor|jobs|status|health|reference)(\/|$)|^\/api\/billing\/(webhook|health)$/;

let A: Monde; let B: Monde; let staffA: Compte;

beforeAll(async () => {
  await runMigrations();
  A = await peupler(await inscrire(appel, 'patron-a@resto.test', 'Restaurant A'), 'A');
  B = await peupler(await inscrire(appel, 'patron-b@resto.test', 'Restaurant B', 'Lyon'), 'B');
  staffA = await ajouterMembre(appel, A.compte.rid, 'employe-a@resto.test', 'staff');
}, 120_000);

describe('1. Références croisées : un identifiant d’un autre restaurant dans le corps de la requête', () => {
  const lectures = async (h: Record<string, string>) => {
    const textes: string[] = [];
    for (const r of routes().filter((x) => x.method === 'GET' && !x.path.includes(':') && !HORS_RESTAURANT.test(x.path))) textes.push((await appel('GET', r.path, undefined, h)).text);
    return textes.join('\n');
  };

  it('le peuplement a bien créé des données distinctes, visibles de leur seul propriétaire', async () => {
    expect(Object.keys(A.ids).length).toBeGreaterThanOrEqual(14);
    const vuParA = await lectures(A.compte.h); const vuParB = await lectures(B.compte.h);
    expect(vuParA).toContain('du restaurant A'); expect(vuParA).not.toContain('du restaurant B');
    expect(vuParB).toContain('du restaurant B'); expect(vuParB).not.toContain('du restaurant A');
  });

  it('POST /api/catalog/track refuse le produit privé d’un autre restaurant (constat R036 de l’audit)', async () => {
    const db = await getDb();
    const r = await appel('POST', '/api/catalog/track', { productIds: [B.ids.products] }, A.compte.h);
    expect(r.status).toBe(404); expect(r.json.code).toBe('product_not_found');
    expect(await db.select().from(dbm.inventoryItems).where(and(eq(dbm.inventoryItems.restaurantId, A.compte.rid), eq(dbm.inventoryItems.productId, B.ids.products)))).toHaveLength(0);
    // un lot qui mélange un produit valide et un produit étranger est refusé en entier
    const melange = await appel('POST', '/api/catalog/track', { productIds: [A.ids.produitDuReferentiel, B.ids.products] }, A.compte.h);
    expect(melange.status).toBe(404);
    expect(await lectures(A.compte.h)).not.toContain('du restaurant B');
  });

  it('un identifiant de produit inexistant reçoit la même réponse (aucun moyen de deviner qu’un identifiant existe ailleurs)', async () => {
    const inconnu = await appel('POST', '/api/catalog/track', { productIds: ['7b7b7b7b-7b7b-4b7b-8b7b-7b7b7b7b7b7b'] }, A.compte.h);
    const etranger = await appel('POST', '/api/catalog/track', { productIds: [B.ids.products] }, A.compte.h);
    expect(inconnu.status).toBe(404);
    expect(inconnu.json).toEqual(etranger.json);
  });

  it('une offre, seule ou en lot, ne peut pas porter sur le produit privé d’un autre restaurant', async () => {
    const db = await getDb();
    const avant = (await db.select().from(dbm.supplierOffers).where(eq(dbm.supplierOffers.restaurantId, A.compte.rid))).length;
    const corps = { productId: B.ids.products, packLabel: 'Sac', packQty: 10, packPrice: 20 };
    expect((await appel('POST', `/api/suppliers/${A.ids.suppliers}/offers`, corps, A.compte.h)).status).toBe(404);
    const lot = await appel('POST', `/api/suppliers/${A.ids.suppliers}/offers/batch`, { items: [{ ...corps, productId: A.ids.produitDuReferentiel, packLabel: 'Carton' }, corps] }, A.compte.h);
    expect(lot.status).toBe(404);
    expect((await db.select().from(dbm.supplierOffers).where(eq(dbm.supplierOffers.restaurantId, A.compte.rid))).length).toBe(avant);   // rien d'écrit, même la ligne valide
  });

  it('une recette ne peut pas avoir pour ingrédient le produit privé d’un autre restaurant (création et modification)', async () => {
    const db = await getDb();
    const creation = await appel('POST', '/api/recipes', { name: 'Recette avec ingrédient étranger', ingredients: [{ productId: B.ids.products, quantity: 1 }] }, A.compte.h);
    expect(creation.status).toBe(404);
    expect(await db.select().from(dbm.recipes).where(and(eq(dbm.recipes.restaurantId, A.compte.rid), eq(dbm.recipes.name, 'Recette avec ingrédient étranger')))).toHaveLength(0);
    const avant = await empreinte(A.compte.rid);
    const modif = await appel('PUT', `/api/recipes/${A.ids.recipes}`, { name: 'Renommée', ingredients: [{ productId: B.ids.products, quantity: 1 }] }, A.compte.h);
    expect(modif.status).toBe(404);
    expect(await empreinte(A.compte.rid)).toEqual(avant);   // ni le nom ni les ingrédients n'ont bougé
  });

  it('le fournisseur préféré d’un article ne peut pas être le fournisseur d’un autre restaurant', async () => {
    const r = await appel('PUT', `/api/stock/${A.ids.inventoryItems}`, { preferredSupplierId: B.ids.suppliers }, A.compte.h);
    expect(r.status).toBe(404);
    const stock = await appel('GET', '/api/stock', undefined, A.compte.h);
    expect(stock.text).not.toContain('du restaurant B');
    // le sien est accepté
    expect((await appel('PUT', `/api/stock/${A.ids.inventoryItems}`, { preferredSupplierId: A.ids.suppliers }, A.compte.h)).status).toBe(200);
  });

  it('POST /api/sales refuse la recette d’un autre restaurant (constat R084) : ni vente, ni mouvement de stock', async () => {
    const db = await getDb();
    const avant = await empreinte(A.compte.rid);
    const r = await appel('POST', '/api/sales', { day: DEMAIN, lines: [{ recipeId: B.ids.recipes, portions: 5 }] }, A.compte.h);
    expect(r.status).toBe(404); expect(r.json.code).toBe('recipe_not_found');
    expect(await db.select().from(dbm.sales).where(and(eq(dbm.sales.restaurantId, A.compte.rid), eq(dbm.sales.recipeId, B.ids.recipes)))).toHaveLength(0);
    expect(await empreinte(A.compte.rid)).toEqual(avant);
  });

  it('une commande ne peut viser ni le fournisseur ni l’offre d’un autre restaurant (commande directe et panier intelligent)', async () => {
    const db = await getDb();
    const avant = (await db.select().from(dbm.orders).where(eq(dbm.orders.restaurantId, A.compte.rid))).length;
    expect((await appel('POST', '/api/orders', { supplierId: B.ids.suppliers, lines: [{ offerId: B.ids.supplierOffers, packs: 1 }] }, A.compte.h)).status).toBe(404);
    expect((await appel('POST', '/api/orders', { supplierId: A.ids.suppliers, lines: [{ offerId: B.ids.supplierOffers, packs: 1 }] }, A.compte.h)).status).toBe(400);
    expect((await appel('POST', '/api/smart-cart/checkout', { suppliers: [{ supplierId: B.ids.suppliers, lines: [{ offerId: B.ids.supplierOffers, packs: 1 }] }] }, A.compte.h)).status).toBe(404);
    expect((await appel('POST', '/api/smart-cart/checkout', { suppliers: [{ supplierId: A.ids.suppliers, lines: [{ offerId: B.ids.supplierOffers, packs: 1 }] }] }, A.compte.h)).status).toBe(400);
    expect((await db.select().from(dbm.orders).where(eq(dbm.orders.restaurantId, A.compte.rid))).length).toBe(avant);   // aucune commande, même vide
  });

  it('dernière ligne de défense : la fonction de suivi du stock ignore elle-même un produit étranger', async () => {
    expect(await trackProducts(A.compte.rid, [B.ids.products, '7b7b7b7b-7b7b-4b7b-8b7b-7b7b7b7b7b7b'])).toEqual([]);
    expect([...(await visibleProductIds(A.compte.rid, [A.ids.products, A.ids.produitDuReferentiel, B.ids.products]))].sort()).toEqual([A.ids.products, A.ids.produitDuReferentiel].sort());
  });

  it('les usages légitimes restent possibles : référentiel commun et produits du restaurant', async () => {
    const offre = await appel('POST', `/api/suppliers/${A.ids.suppliers}/offers`, { productId: A.ids.products, packLabel: 'Carton du restaurant A', packQty: 5, packPrice: 12 }, A.compte.h);
    expect(offre.status).toBe(201);
    const recette = await appel('POST', '/api/recipes', { name: 'Seconde recette du restaurant A', ingredients: [{ productId: A.ids.products, quantity: 0.1 }, { productId: A.ids.produitDuReferentiel, quantity: 0.3 }] }, A.compte.h);
    expect(recette.status).toBe(201);
  });
});

describe('2. Balayage : le restaurant B présente les identifiants réels du restaurant A à toutes les routes à paramètre', () => {
  // Corps plausibles pour les écritures les plus sensibles (le balayage envoie aussi un corps vide à chaque route).
  const corps: Record<string, unknown> = {
    'PUT /api/suppliers/:id': { name: 'Renommé par B' },
    'POST /api/suppliers/:id/offers': { productId: 'REF', packLabel: 'Sac posé par B', packQty: 10, packPrice: 9 },
    'POST /api/suppliers/:id/offers/batch': { items: [{ productId: 'REF', packLabel: 'Lot posé par B', packQty: 10, packPrice: 9 }] },
    'PUT /api/offers/:id': { packPrice: 1 },
    'PUT /api/stock/:itemId': { criticalLevel: 99 },
    'POST /api/stock/:itemId/movements': { type: 'perte', quantity: 3 },
    'PUT /api/recipes/:id': { name: 'Renommée par B' },
    'PUT /api/reorder-rules/:inventoryItemId': { threshold: 9, reorderQty: 9 },
    'PUT /api/orders/:id': { status: 'annulee' },
    'PUT /api/orders/:id/lines': { lines: [{ lineId: 'LIGNE', packs: 9 }] },
    'POST /api/orders/:id/receive': { lines: [{ lineId: 'LIGNE', receivedQty: 1 }] },
    'POST /api/orders/:id/proposal': { action: 'accept' },
    'POST /api/orders/:id/review': { rating: 1, comment: 'Avis posé par B' },
    'POST /api/discrepancies/:id/resolve': { resolution: 'abandon' },
    'POST /api/claims/:id/close': { action: 'accept' },
    'PUT /api/shopping/lists/:id': { name: 'Renommée par B' },
    'PUT /api/recurring/:id': { enabled: false },
    'PATCH /api/members/:userId': { role: 'staff' },
    'POST /api/marketplace/group-buys/:id/join': { packs: 1 },
  };
  const remplir = (b: unknown, ref: string, ligne: string) => JSON.parse(JSON.stringify(b).replaceAll('"REF"', `"${ref}"`).replaceAll('"LIGNE"', `"${ligne}"`));

  it('aucune lecture ne renvoie une donnée de A, aucune écriture ne modifie A, aucune erreur 500', async () => {
    const cibles = routes().filter((r) => !HORS_RESTAURANT.test(r.path) && /:(id|itemId|productId|inventoryItemId|userId)\b/.test(r.path));
    expect(cibles.length).toBeGreaterThanOrEqual(50);
    const avantA = await empreinte(A.compte.rid); const avantB = await empreinte(B.compte.rid);
    const fuites: string[] = []; const pannes: string[] = []; const codes: Record<number, number> = {}; let essais = 0;
    const reussites = new Map<string, Set<string>>();
    for (const r of cibles) {
      const cle = `${r.method} ${r.path}`;
      for (const [type, id] of Object.entries(A.ids)) {
        const chemin = r.path.replace(/:[A-Za-z]+/, id);
        const envois: unknown[] = r.method === 'GET' || r.method === 'DELETE' ? [undefined] : [{}, ...(corps[cle] ? [remplir(corps[cle], A.ids.produitDuReferentiel, A.ids.ligneDeCommande)] : [])];
        for (const body of envois) {
          const rep = await appel(r.method, chemin, body, B.compte.h);
          essais += 1; codes[rep.status] = (codes[rep.status] ?? 0) + 1;
          if (rep.status >= 500) pannes.push(`${cle} [${type}] → ${rep.status} ${rep.text.slice(0, 120)}`);
          if (/du restaurant A/.test(rep.text)) fuites.push(`${cle} [${type}] → ${rep.status}`);
          if (rep.status < 300) { if (!reussites.has(cle)) reussites.set(cle, new Set()); reussites.get(cle)!.add(type); }
        }
      }
      await _resetRateLimits();
    }
    expect(pannes).toEqual([]);
    expect(fuites).toEqual([]);
    expect(await empreinte(A.compte.rid)).toEqual(avantA);
    expect(essais).toBeGreaterThan(1400);

    // Une réponse 2xx n'est acceptable que si elle porte sur le référentiel commun ou sur le restaurant
    // de B lui-même (aucun identifiant propre à A ne doit « réussir »).
    const propresAA = Object.keys(A.ids).filter((t) => t !== 'produitDuReferentiel');
    const inattendues = [...reussites.entries()].flatMap(([cle, types]) => [...types].filter((t) => propresAA.includes(t)).map((t) => `${cle} [${t}]`));
    expect(inattendues).toEqual([]);
    // B, de son côté, n'a rien perdu d'autre que ce que ses propres écritures valides ont changé :
    // ses tables de référence (fournisseurs, recettes, commandes) sont intactes.
    const apresB = await empreinte(B.compte.rid);
    for (const t of ['suppliers', 'recipes', 'orders', 'orderLines', 'recipeIngredients', 'restaurantMembers', 'restaurant']) expect(apresB[t], t).toBe(avantB[t]);
  }, 240_000);

  it('l’en-tête X-Restaurant-Id d’un autre restaurant est refusé (403), en lecture comme en écriture', async () => {
    const usurpe = { ...B.compte.h, 'x-restaurant-id': A.compte.rid };
    for (const [m, p, b] of [['GET', '/api/suppliers', undefined], ['GET', '/api/stock', undefined], ['GET', '/api/orders', undefined], ['GET', '/api/account/export', undefined], ['POST', '/api/suppliers', { name: 'Créé par usurpation' }], ['DELETE', '/api/account', undefined]] as const) {
      const r = await appel(m, p, b, usurpe);
      expect(r.status, `${m} ${p}`).toBe(403);
      expect(r.json.code).toBe('restaurant_forbidden');
    }
  });

  it('un membre ne peut ni lire l’équipe d’un autre restaurant, ni en retirer ou rétrograder un membre', async () => {
    const db = await getDb();
    expect((await appel('GET', '/api/members', undefined, B.compte.h)).text).not.toContain('patron-a@resto.test');
    expect((await appel('DELETE', `/api/members/${A.compte.userId}`, undefined, B.compte.h)).status).toBe(404);
    expect((await appel('PATCH', `/api/members/${staffA.userId}`, { role: 'owner' }, B.compte.h)).status).toBe(404);
    const membres = await db.select().from(dbm.restaurantMembers).where(eq(dbm.restaurantMembers.restaurantId, A.compte.rid));
    expect(membres.map((m) => m.role).sort()).toEqual(['owner', 'staff']);
  });

  it('les exports ne contiennent que les données du restaurant appelant', async () => {
    for (const p of ['/api/account/export', '/api/backup/export', '/api/export/offers.csv']) {
      const deB = await appel('GET', p, undefined, B.compte.h);
      expect(deB.status, p).toBe(200);
      expect(deB.text, p).toContain('du restaurant B');
      expect(deB.text, p).not.toContain('du restaurant A');
      expect(deB.text, p).not.toContain('patron-a@resto.test');
    }
  });

  it('les tableaux de bord et analyses ne mélangent pas les restaurants', async () => {
    for (const p of ['/api/dashboard', '/api/analysis', '/api/analysis/margins', '/api/forecast', '/api/smart-cart', '/api/alerts', '/api/discrepancies', '/api/sales', '/api/recipes', '/api/shopping/lists', '/api/reorder-rules', '/api/digest/preview']) {
      const deB = await appel('GET', p, undefined, B.compte.h);
      expect(deB.status, p).toBeLessThan(500);
      expect(deB.text, p).not.toContain('du restaurant A');
    }
  });

  it('les traitements automatiques (passe quotidienne) n’écrivent chez un restaurant que ses propres données', async () => {
    process.env.CRON_SECRET = 'secret-des-taches-de-test';
    const db = await getDb();
    const r = await appel('POST', '/api/jobs/daily', undefined, { 'x-cron-secret': 'secret-des-taches-de-test' });
    expect(r.status).toBe(200);
    // Après la passe, chaque alerte, commande ou mouvement d'un restaurant ne référence que ses propres objets.
    for (const monde of [A, B]) {
      const autre = monde === A ? B : A;
      const alertes = await db.select().from(dbm.alerts).where(eq(dbm.alerts.restaurantId, monde.compte.rid));
      expect(JSON.stringify(alertes)).not.toContain(`du restaurant ${autre.nom}`);
      expect(alertes.every((a) => !a.supplierId || a.supplierId !== autre.ids.suppliers)).toBe(true);
      const commandes = await db.select().from(dbm.orders).where(eq(dbm.orders.restaurantId, monde.compte.rid));
      expect(commandes.every((o) => o.supplierId !== autre.ids.suppliers)).toBe(true);
    }
    const apercu = await appel('GET', '/api/digest/preview', undefined, B.compte.h);
    expect(apercu.text).not.toContain('du restaurant A');
  }, 120_000);
});

describe('3. Fournisseurs de la place de marché : cloisonnement entre eux, partage légitime avec leurs clients', () => {
  let exploitant: Compte; let g1: Compte; let g2: Compte; let v1 = ''; let v2 = ''; let offre1 = ''; let commande1 = '';
  const idsV1: Ids = {};

  beforeAll(async () => {
    const db = await getDb();
    exploitant = await inscrire(appel, 'exploitant@afrisupply.test', 'Exploitation'); await confirmerAdresse('exploitant@afrisupply.test');
    g1 = await inscrire(appel, 'grossiste-1@gros.test', 'Compte du grossiste Un'); g2 = await inscrire(appel, 'grossiste-2@gros.test', 'Compte du grossiste Deux');
    const creer = async (g: Compte, nom: string) => {
      const r = await appel('POST', '/api/vendor/register', { acceptCgv: true, name: nom, city: 'Nantes', deliveryZones: [], categories: ['epicerie'], minOrderEur: 0, contactEmail: `commandes@${nom.replace(/\W+/g, '').toLowerCase()}.test` }, g.h);
      if (r.status !== 201) throw new Error(`inscription fournisseur : ${r.status} ${r.text}`);
      const a = await appel('PUT', `/api/admin/vendors/${r.json.vendor.id}`, { status: 'actif', commissionPct: 4 }, exploitant.h);
      if (a.status !== 200) throw new Error(`validation fournisseur : ${a.status} ${a.text}`);
      return r.json.vendor.id as string;
    };
    v1 = await creer(g1, 'Grossiste Un'); v2 = await creer(g2, 'Grossiste Deux');
    const o1 = await appel('POST', '/api/vendor/offers', { productId: A.ids.produitDuReferentiel, packLabel: 'Sac 25 kg du grossiste Un', packQty: 25, packPrice: 30 }, g1.h);
    offre1 = o1.json.offer.id;
    await appel('POST', '/api/vendor/offers', { productId: A.ids.produitDuReferentiel, packLabel: 'Sac 25 kg du grossiste Deux', packQty: 25, packPrice: 31 }, g2.h);
    const tournee = await appel('POST', '/api/vendor/routes', { name: 'Tournée du grossiste Un', weekday: 2, zones: ['nantes'], cutoffHours: 24 }, g1.h);
    // Le restaurant A commande chez le grossiste Un : partage légitime.
    const cmd = await appel('POST', `/api/marketplace/vendors/${v1}/orders`, { lines: [{ vendorOfferId: offre1, packs: 2 }], notes: 'Commande du restaurant A chez le grossiste Un', override: true }, A.compte.h);
    if (cmd.status !== 201) throw new Error(`commande plateforme : ${cmd.status} ${cmd.text}`);
    commande1 = cmd.json.order.id;
    const prix = await appel('POST', '/api/vendor/customer-prices', { restaurantId: A.compte.rid, vendorOfferId: offre1, packPriceEur: 28, note: 'Accord du grossiste Un' }, g1.h);
    Object.assign(idsV1, { fournisseur: v1, offre: offre1, commande: commande1, restaurantClient: A.compte.rid });
    if (tournee.json?.route?.id) idsV1.tournee = tournee.json.route.id;
    if (prix.json?.price?.id) idsV1.prixClient = prix.json.price.id;
    const [ligne] = await db.select().from(dbm.orderLines).where(eq(dbm.orderLines.orderId, commande1));
    idsV1.ligne = ligne.id;
  }, 120_000);

  const empreinteFournisseur = async (vid: string) => {
    const db = await getDb(); const signer = (rows: unknown[]) => `${rows.length} ${createHash('sha256').update(rows.map((r) => JSON.stringify(r)).sort().join('\n')).digest('hex').slice(0, 16)}`;
    return {
      fiche: signer(await db.select().from(dbm.vendors).where(eq(dbm.vendors.id, vid))),
      offres: signer(await db.select().from(dbm.vendorOffers).where(eq(dbm.vendorOffers.vendorId, vid))),
      commandes: signer(await db.select().from(dbm.orders).where(eq(dbm.orders.vendorId, vid))),
      tournees: signer(await db.select().from(dbm.vendorRoutes).where(eq(dbm.vendorRoutes.vendorId, vid))),
      prix: signer(await db.select().from(dbm.vendorCustomerPrices).where(eq(dbm.vendorCustomerPrices.vendorId, vid))),
      membres: signer(await db.select().from(dbm.vendorMembers).where(eq(dbm.vendorMembers.vendorId, vid))),
    };
  };

  it('partage légitime : le grossiste voit la commande que le restaurant lui a passée, et lui seul', async () => {
    const recues = await appel('GET', '/api/vendor/orders', undefined, g1.h);
    expect(recues.status).toBe(200);
    expect(recues.json.orders.map((o: { id: string }) => o.id)).toContain(commande1);
    expect(recues.json.orders[0].restaurantName).toBe('Restaurant A');
    const chezLAutre = await appel('GET', '/api/vendor/orders', undefined, g2.h);
    expect(chezLAutre.json.orders).toHaveLength(0);
    expect(chezLAutre.text).not.toContain('Restaurant A');
    // …et le restaurant voit le catalogue public du grossiste.
    const fiche = await appel('GET', `/api/marketplace/vendors/${v1}`, undefined, B.compte.h);
    expect(fiche.status).toBe(200);
    expect(fiche.text).toContain('du grossiste Un');
  });

  it('un grossiste ne voit du restaurant que ce que la commande partage (pas ses fournisseurs privés, son stock ni ses autres commandes)', async () => {
    const vues = [];
    for (const r of routes().filter((x) => x.method === 'GET' && x.path.startsWith('/api/vendor/') && !x.path.includes(':'))) vues.push((await appel('GET', r.path, undefined, g1.h)).text);
    const tout = vues.join('\n');
    expect(tout).toContain('Restaurant A');                       // son client : partagé
    expect(tout).not.toContain('Fournisseur du restaurant A');    // fournisseur privé du restaurant
    expect(tout).not.toContain('Recette du restaurant A');
    expect(tout).not.toContain('Produit privé du restaurant A');
    expect(tout).not.toContain('Note du restaurant A');           // la note de SA commande chez un autre fournisseur
    expect(tout).not.toContain('du restaurant B');                // un restaurant qui n'est pas son client
    // Le compte du grossiste ne peut pas se présenter comme membre du restaurant client.
    expect((await appel('GET', '/api/stock', undefined, { ...g1.h, 'x-restaurant-id': A.compte.rid })).status).toBe(403);
  });

  it('balayage : le grossiste Deux présente les identifiants du grossiste Un à toutes les routes fournisseur à paramètre', async () => {
    const cibles = routes().filter((r) => r.path.startsWith('/api/vendor/') && /:(id|restaurantId)\b/.test(r.path));
    expect(cibles.length).toBeGreaterThanOrEqual(14);
    const corps: Record<string, unknown> = {
      'POST /api/vendor/orders/:id/confirm': { note: 'Confirmée par le grossiste Deux' },
      'POST /api/vendor/orders/:id/refuse': { reason: 'Refusée par le grossiste Deux' },
      'POST /api/vendor/orders/:id/propose': { lines: [{ lineId: idsV1.ligne, newPacks: 1 }] },
      'POST /api/vendor/orders/:id/fulfillment': { step: 'en_preparation' },
      'POST /api/vendor/orders/:id/payment': { amountEur: 1 },
      'PUT /api/vendor/offers/:id/tiers': { tiers: [{ minPacks: 2, packPriceEur: 1 }] },
      'PUT /api/vendor/routes/:id': { name: 'Tournée renommée par le grossiste Deux' },
      'PUT /api/vendor/credit/:restaurantId': { blocked: true },
    };
    const avant = await empreinteFournisseur(v1); const avantA = await empreinte(A.compte.rid);
    const fuites: string[] = []; const pannes: string[] = []; let essais = 0;
    for (const r of cibles) {
      const cle = `${r.method} ${r.path}`;
      for (const [type, id] of Object.entries(idsV1)) {
        const envois: unknown[] = r.method === 'GET' || r.method === 'DELETE' ? [undefined] : [{}, ...(corps[cle] ? [corps[cle]] : [])];
        for (const body of envois) {
          const rep = await appel(r.method, r.path.replace(/:[A-Za-z]+/, id), body, g2.h);
          essais += 1;
          if (rep.status >= 500) pannes.push(`${cle} [${type}] → ${rep.status} ${rep.text.slice(0, 120)}`);
          if (/du grossiste Un|Restaurant A|du restaurant A/.test(rep.text)) fuites.push(`${cle} [${type}] → ${rep.status}`);
        }
      }
      await _resetRateLimits();
    }
    expect(pannes).toEqual([]);
    expect(fuites).toEqual([]);
    expect(await empreinteFournisseur(v1)).toEqual(avant);
    expect(await empreinte(A.compte.rid)).toEqual(avantA);
    expect(essais).toBeGreaterThan(150);
  }, 120_000);

  it('l’en-tête X-Vendor-Id d’un autre fournisseur est sans effet : chacun reste dans son espace', async () => {
    const usurpe = await appel('GET', '/api/vendor/dashboard', undefined, { ...g2.h, 'x-vendor-id': v1 });
    expect(usurpe.status).toBe(200);
    expect(usurpe.json.vendor.id).toBe(v2);
    expect(usurpe.text).not.toContain('Grossiste Un');
  });

  it('un grossiste ne peut ni fixer de conditions ni lire le nom d’un restaurant qui n’est pas son client', async () => {
    const db = await getDb();
    const prix = await appel('POST', '/api/vendor/customer-prices', { restaurantId: B.compte.rid, discountPct: 10 }, g2.h);
    expect(prix.status).toBe(400);
    // Défaut trouvé par le balayage de ce fichier (absent de l'audit P0.1) : les conditions de paiement
    // acceptaient l'identifiant de n'importe quel restaurant, et la liste des encours renvoyait son nom.
    const credit = await appel('PUT', `/api/vendor/credit/${B.compte.rid}`, { blocked: true, paymentDays: 30 }, g2.h);
    expect(credit.status).toBe(404);
    const inconnu = await appel('PUT', '/api/vendor/credit/7b7b7b7b-7b7b-4b7b-8b7b-7b7b7b7b7b7b', { blocked: true }, g2.h);
    expect(inconnu.status).toBe(404);
    expect(inconnu.json).toEqual(credit.json);   // même réponse : rien ne dit si l'identifiant existe
    expect(await db.select().from(dbm.vendorCreditTerms).where(eq(dbm.vendorCreditTerms.restaurantId, B.compte.rid))).toHaveLength(0);
    // Même avec une ligne héritée d'avant la correction, la liste des encours ne révèle rien.
    await db.insert(dbm.vendorCreditTerms).values({ vendorId: v2, restaurantId: B.compte.rid, blocked: true });
    const encours = await appel('GET', '/api/vendor/credit', undefined, g2.h);
    expect(encours.status).toBe(200);
    expect(encours.text).not.toContain('Restaurant B');
    expect(encours.text).not.toContain(B.compte.rid);
    await db.delete(dbm.vendorCreditTerms).where(eq(dbm.vendorCreditTerms.restaurantId, B.compte.rid));
    // Le client légitime, lui, peut recevoir des conditions.
    const client = await appel('PUT', `/api/vendor/credit/${A.compte.rid}`, { paymentDays: 30 }, g1.h);
    expect(client.status).toBe(200);
    expect((await appel('GET', '/api/vendor/credit', undefined, g1.h)).text).toContain('Restaurant A');
  });

  it('un restaurant ne peut pas agir à la place d’un grossiste, ni sur la commande d’un autre restaurant', async () => {
    // le compte du restaurant B n'a pas d'espace fournisseur
    expect((await appel('POST', `/api/vendor/orders/${commande1}/confirm`, {}, B.compte.h)).status).toBe(403);
    // B ne peut ni lire ni payer ni noter la commande plateforme de A
    for (const [m, p] of [['GET', `/api/orders/${commande1}/timeline`], ['GET', `/api/orders/${commande1}/payment`], ['POST', `/api/orders/${commande1}/pay`], ['GET', `/api/orders/${commande1}/pdf`], ['POST', `/api/marketplace/orders/${commande1}/send`]] as const) {
      expect((await appel(m, p, m === 'POST' ? {} : undefined, B.compte.h)).status, `${m} ${p}`).toBe(404);
    }
    expect((await appel('POST', `/api/orders/${commande1}/review`, { rating: 1 }, B.compte.h)).status).toBe(404);
  });
});
