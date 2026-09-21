// Chantier 3 (audit AFRISUPPLY) — prix réellement facturé et détection de la hausse de prix.
//
// Constat d'audit : la réception enregistrait le prix COMMANDÉ (source « reception »).
// L'historique de prix restait donc plat, l'alerte « vos prix augmentent » ne pouvait
// jamais se déclencher et le coût des entrées en stock était théorique.
//
// Ces tests vérifient que le prix facturé saisi à la réception devient une donnée réelle :
// coût d'entrée en stock, historique de prix, dernier prix payé chez le fournisseur,
// alerte de surfacturation chiffrée en euros, et hausse détectée par le moteur d'alertes.
import { describe, it, expect, beforeAll } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';
import { runMigrations, getDb, stockMovements, priceHistory } from '@afrisupply/db';
import { app } from '../app.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.CRON_SECRET = 'cron-test'; process.env.PGLITE_DIR = 'memory://invoiced-price';

type Json = Record<string, any>;
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json: Json = {}; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
};

let auth: Record<string, string> = {};
let productId = '';
let seq = 0;
const PACK_QTY = 25;
const ORDERED_PACK = 42;                   // 42 € le sac de 25 kg → 1,68 €/kg
const ORDERED_UNIT = ORDERED_PACK / PACK_QTY;
const INVOICED_PACK = 46;                  // +9,5 % → au-dessus du seuil d'alerte (8 %)
const INVOICED_UNIT = INVOICED_PACK / PACK_QTY;

/** Un fournisseur et son offre par scénario : les prix ne se contaminent pas d'un test à l'autre. */
const makeSupplierWithOffer = async (packPrice: number, packQty = PACK_QTY) => {
  const sup = await call('POST', '/api/suppliers', { name: `Grossiste Facture ${++seq}`, whatsapp: `+3360000000${seq}`, leadTimeHours: 24 }, auth);
  const supplierId = (sup.json.supplier?.id ?? sup.json.id) as string;
  const offer = await call('POST', `/api/suppliers/${supplierId}/offers`, { productId, packLabel: `sac ${packQty} kg`, packQty, packPrice }, auth);
  return { supplierId, offerId: (offer.json.offer?.id ?? offer.json.id) as string };
};

const newSentOrder = async (supplierId: string, offerId: string, packs = 2) => {
  const o = await call('POST', '/api/orders', { supplierId, channel: 'whatsapp', lines: [{ offerId, packs }] }, auth);
  expect(o.status).toBe(201);
  const orderId = o.json.order.id as string;
  await call('POST', `/api/orders/${orderId}/send`, undefined, auth);
  return { orderId, lineId: (await getOrder(orderId))!.lines[0].id as string, quantity: Number((await getOrder(orderId))!.lines[0].quantity) };
};

const getOrder = async (orderId: string) => {
  const r = await call('GET', '/api/orders', undefined, auth);
  return (r.json.orders ?? []).find((o: Json) => o.id === orderId) as Json | undefined;
};
const alerts = async () => (await call('GET', '/api/alerts', undefined, auth)).json.alerts ?? [];
const priceSeries = async () => (await call('GET', `/api/prices/${productId}/history`, undefined, auth)).json.series ?? [];
/** Les points d'historique du fournisseur donné. */
const pointsFor = async (supplierId: string) => (await priceSeries()).find((s: Json) => s.supplierId === supplierId)?.points ?? [];
/** Coût unitaire du dernier mouvement de réception écrit en base (preuve directe, sans passer par l'API). */
const lastReceptionCost = async () => {
  const db = await getDb();
  const [row] = await db.select().from(stockMovements).where(eq(stockMovements.type, 'reception')).orderBy(desc(stockMovements.createdAt)).limit(1);
  return Number(row?.unitCostEur ?? -1);
};
/** Prix de l'offre tel que le voit le comparateur (dernier prix payé). */
const offerUnitPrice = async (productIdForCompare: string, supplierId: string) => {
  const r = await call('GET', `/api/compare/${productIdForCompare}`, undefined, auth);
  const offer = (r.json.ranked ?? r.json.offers ?? []).find((o: Json) => o.supplierId === supplierId);
  return offer ? Number(offer.unitPrice ?? (Number(offer.packPriceEur) / Number(offer.packQty))) : null;
};

beforeAll(async () => { await runMigrations(); }, 60_000);

describe('0. Préparation : compte, référentiel produits', () => {
  it('crée le compte et applique un modèle de stock', async () => {
    const reg = await call('POST', '/api/auth/register', { email: 'facture@resto.fr', password: 'Plantain-Yassa-42', fullName: 'Awa Facture', restaurantName: 'Chez Facture', city: 'Nantes', coversPerDay: 50 });
    expect(reg.status).toBe(201); auth = { authorization: `Bearer ${reg.json.token}` };
    const tpl = await call('GET', '/api/onboarding/templates', undefined, auth);
    await call('POST', '/api/onboarding/apply', { templates: tpl.json.templates.slice(0, 1).map((t: Json) => t.name) }, auth);
    const stock = await call('GET', '/api/stock', undefined, auth);
    productId = stock.json.items[0].productId;
    expect(productId).toBeTruthy();
  });
});

describe('1. Prix facturé identique au prix commandé : rien ne change (non-régression)', () => {
  let orderId = ''; let lineId = ''; let supplierId = '';
  it('réception avec le même prix : commande livrée, aucun écart de prix, aucune alerte', async () => {
    const s = await makeSupplierWithOffer(ORDERED_PACK); supplierId = s.supplierId;
    const o = await newSentOrder(s.supplierId, s.offerId); orderId = o.orderId; lineId = o.lineId;
    const rec = await call('POST', `/api/orders/${orderId}/receive`, { lines: [{ lineId, receivedQty: o.quantity, invoicedUnitPrice: ORDERED_UNIT }] }, auth);
    expect(rec.status).toBe(200);
    expect(rec.json.priceVariance).toEqual([]);
    expect(rec.json.surchargeEur).toBe(0);
    expect((await getOrder(orderId))!.status).toBe('livree');
    expect(Number((await getOrder(orderId))!.lines[0].invoicedUnitPriceEur)).toBeCloseTo(ORDERED_UNIT, 4);
    expect((await pointsFor(supplierId)).filter((p: Json) => p.source === 'facture')).toHaveLength(1);
    await call('POST', '/api/alerts/refresh', undefined, auth);
    expect((await alerts()).filter((a: Json) => a.kind === 'hausse_prix')).toHaveLength(0);
  });
});

describe('2. Réception sans prix facturé : comportement inchangé', () => {
  it('le stock entre au prix commandé et l’historique reste en source « reception »', async () => {
    const s = await makeSupplierWithOffer(ORDERED_PACK);
    const o = await newSentOrder(s.supplierId, s.offerId);
    const rec = await call('POST', `/api/orders/${o.orderId}/receive`, { lines: [{ lineId: o.lineId, receivedQty: o.quantity }] }, auth);
    expect(rec.status).toBe(200);
    expect(rec.json.invoicedTotal).toBeNull();
    expect(rec.json.surchargeEur).toBe(0);
    expect((await getOrder(o.orderId))!.lines[0].invoicedUnitPriceEur).toBeNull();
    expect((await lastReceptionCost())).toBeCloseTo(ORDERED_UNIT, 4);
    const pts = await pointsFor(s.supplierId);
    expect(pts[pts.length - 1].source).toBe('reception');
  });
});

describe('3. Le fournisseur facture 46 € au lieu de 42 € : l’écart est détecté et chiffré', () => {
  let orderId = ''; let lineId = ''; let supplierId = ''; let surcharge = 0;
  it('la réception accepte le prix facturé et signale la surfacturation', async () => {
    const s = await makeSupplierWithOffer(ORDERED_PACK); supplierId = s.supplierId;
    const o = await newSentOrder(s.supplierId, s.offerId); orderId = o.orderId; lineId = o.lineId;
    const rec = await call('POST', `/api/orders/${orderId}/receive`, { lines: [{ lineId, receivedQty: o.quantity, invoicedUnitPrice: INVOICED_UNIT }] }, auth);
    expect(rec.status).toBe(200);
    expect(rec.json.priceVariance).toHaveLength(1);
    const v = rec.json.priceVariance[0];
    expect(v.orderedUnit).toBeCloseTo(ORDERED_UNIT, 4);
    expect(v.invoicedUnit).toBeCloseTo(INVOICED_UNIT, 4);
    expect(v.deltaUnit).toBeCloseTo(INVOICED_UNIT - ORDERED_UNIT, 4);
    expect(v.deltaPct).toBeCloseTo(9.5, 1);
    // 2 sacs facturés 46 € au lieu de 42 € → 8 € de trop (calculé sur la quantité reçue).
    surcharge = rec.json.surchargeEur;
    expect(surcharge).toBeCloseTo((INVOICED_PACK - ORDERED_PACK) * 2, 2);
    expect(rec.json.invoicedTotal).toBeGreaterThan(rec.json.orderedTotal);
  });
  it('le prix facturé est mémorisé sur la ligne de commande', async () => {
    expect(Number((await getOrder(orderId))!.lines[0].invoicedUnitPriceEur)).toBeCloseTo(INVOICED_UNIT, 4);
  });
  it('le stock entre au coût réellement payé (et non au prix commandé)', async () => {
    expect(await lastReceptionCost()).toBeCloseTo(INVOICED_UNIT, 4);
  });
  it('l’offre du fournisseur reflète le dernier prix payé dans le comparateur', async () => {
    expect(await offerUnitPrice(productId, supplierId)).toBeCloseTo(INVOICED_UNIT, 2);
  });
  it('l’historique de prix contient le prix RÉELLEMENT payé (source « facture »)', async () => {
    const pts = await pointsFor(supplierId);
    const facture = pts.filter((p: Json) => p.source === 'facture');
    expect(facture.length).toBeGreaterThan(0);
    expect(facture[facture.length - 1].price).toBeCloseTo(INVOICED_UNIT, 4);
  });
  it('une alerte « facture plus élevée que la commande » est créée avec le montant en euros', async () => {
    const alert = (await alerts()).find((a: Json) => a.kind === 'hausse_prix' && /Facture plus élevée/.test(a.title));
    expect(alert).toBeTruthy();
    expect(alert.message).toMatch(/dépassent les prix commandés/);
    expect(Number(alert.payload?.surchargeEur)).toBeCloseTo(surcharge, 2);
    expect(alert.payload?.lines?.[0]?.deltaPct).toBeCloseTo(9.5, 1);
  });
  it('le moteur d’alertes détecte la hausse de 9,5 % à partir des factures réelles', async () => {
    const refresh = await call('POST', '/api/alerts/refresh', undefined, auth);
    expect(refresh.status).toBe(200);
    const hausse = (await alerts()).find((a: Json) => a.kind === 'hausse_prix' && /Hausse détectée/.test(a.title));
    expect(hausse).toBeTruthy();
    expect(Number(hausse.payload?.pct)).toBeGreaterThanOrEqual(8);
  });
});

describe('4. Un prix facturé invraisemblable est refusé (faute de frappe)', () => {
  it('refuse un prix à plus de trois fois le prix commandé, avec un message compréhensible', async () => {
    const s = await makeSupplierWithOffer(ORDERED_PACK);
    const o = await newSentOrder(s.supplierId, s.offerId);
    const rec = await call('POST', `/api/orders/${o.orderId}/receive`, { lines: [{ lineId: o.lineId, receivedQty: o.quantity, invoicedUnitPrice: 30 }] }, auth);
    expect(rec.status).toBe(400); expect(rec.json.code).toBe('invoice_out_of_range');
    expect(rec.json.error).toMatch(/prix facturé|unité de la facture/i);
    expect((await getOrder(o.orderId))!.receivedAt).toBeNull();   // rien n'a été écrit
  });
  it('accepte ce même prix après confirmation explicite, et chiffre la surfacturation', async () => {
    const s = await makeSupplierWithOffer(ORDERED_PACK);
    const o = await newSentOrder(s.supplierId, s.offerId);
    const rec = await call('POST', `/api/orders/${o.orderId}/receive`, { lines: [{ lineId: o.lineId, receivedQty: o.quantity, invoicedUnitPrice: 30 }], override: true }, auth);
    expect(rec.status).toBe(200);
    expect(rec.json.surchargeEur).toBeGreaterThan(0);
    expect(rec.json.priceVariance[0].deltaPct).toBeGreaterThan(1000);
  });
  it('refuse un prix au-delà du plafond absolu (10 000 € l’unité)', async () => {
    const s = await makeSupplierWithOffer(ORDERED_PACK);
    const o = await newSentOrder(s.supplierId, s.offerId);
    const rec = await call('POST', `/api/orders/${o.orderId}/receive`, { lines: [{ lineId: o.lineId, receivedQty: o.quantity, invoicedUnitPrice: 50_000 }] }, auth);
    expect(rec.status).toBe(400);
  });
});

describe('5. Livraison partielle : l’écart de prix est calculé sur la quantité réellement reçue', () => {
  it('50 kg commandés, 45 reçus à 46 € le sac → écart chiffré sur 45 kg, et commande en « livrée partiellement »', async () => {
    const s = await makeSupplierWithOffer(ORDERED_PACK);
    const o = await newSentOrder(s.supplierId, s.offerId, 2);      // 2 sacs = 50 kg
    const rec = await call('POST', `/api/orders/${o.orderId}/receive`, { lines: [{ lineId: o.lineId, receivedQty: 45, invoicedUnitPrice: INVOICED_UNIT }] }, auth);
    expect(rec.status).toBe(200);
    // manque 5 kg ET prix plus élevé : les deux problèmes sont signalés en même temps
    expect(rec.json.discrepancies).toHaveLength(1);
    expect(rec.json.priceVariance[0].receivedQty).toBe(45);
    expect(rec.json.priceVariance[0].deltaEur).toBeCloseTo((INVOICED_UNIT - ORDERED_UNIT) * 45, 2);
    expect(rec.json.surchargeEur).toBeCloseTo(7.2, 2);
    expect((await getOrder(o.orderId))!.status).toBe('livree_partiel');
    // le coût réel porte sur les 45 kg effectivement entrés en stock
    expect(await lastReceptionCost()).toBeCloseTo(INVOICED_UNIT, 4);
  });
});

describe('6. Historique direct en base : un seul point par réception, au bon prix', () => {
  it('les points « facture » correspondent aux prix saisis, pas aux prix commandés', async () => {
    const db = await getDb();
    const rows = await db.select({ price: priceHistory.unitPriceEur, source: priceHistory.source }).from(priceHistory)
      .where(and(eq(priceHistory.restaurantId, (await call('GET', '/api/auth/me', undefined, auth)).json.restaurants[0].id)));
    const factures = rows.filter((r) => r.source === 'facture').map((r) => Number(r.price));
    expect(factures.length).toBeGreaterThan(0);
    expect(factures.every((p) => p > 0)).toBe(true);
    // le prix facturé « normal » (46 € le sac) ET le prix confirmé explicitement (30 €/kg) sont bien là
    expect(factures.some((p) => Math.abs(p - INVOICED_UNIT) < 0.0001)).toBe(true);
    expect(factures.some((p) => p > ORDERED_UNIT * 3)).toBe(true);
  });
});
