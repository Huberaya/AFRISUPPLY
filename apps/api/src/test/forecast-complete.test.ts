// =============================================================
// Chantier 4 (audit) — « Prévision complète » : non-régression de bout en bout
//
// Verrouille : soirées privatisées (coef d'événement ×1,5 → besoin augmenté,
// un événement par jour, suppression) ; alerte de rupture NON déclenchée quand la
// commande en cours couvre le creux, déclenchée sinon.
// =============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '@afrisupply/db';
import { app } from '../app.js';
import { _resetRateLimits } from '../lib/ops.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.CRON_SECRET = 'cron-test'; process.env.PGLITE_DIR = 'memory://forecast4';

type Json = Record<string, any>;
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json: Json = {}; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
};
const isoOffset = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
let auth: Record<string, string> = {};
let prodA = '', prodB = '', itemA = '', itemB = '', recipeId = '', supplierId = '', offerId = '';

beforeAll(async () => {
  await runMigrations();
  await _resetRateLimits();
  const r = await call('POST', '/api/auth/register', { email: 'prevision@resto.fr', password: 'Thieb-Dieuppeul-7', fullName: 'Prévision Test', restaurantName: 'La Prévision', city: 'Rouen', coversPerDay: 60 });
  auth = { authorization: `Bearer ${r.json.token}`, 'x-restaurant-id': r.json.restaurant.id };
  await call('GET', '/api/catalog', undefined, auth); // amorçage du référentiel (migrations 0013-0016)
  // produits du référentiel (pas de POST /products : la carte démarre depuis le catalogue)
  const prods = await call('GET', '/api/products', undefined, auth);
  const ref = prods.json.products.filter((p: Json) => !p.restaurantId);
  expect(ref.length).toBeGreaterThan(1);
  const a = ref.find((p: Json) => /riz/i.test(p.name)) ?? ref[0];
  const b = ref.find((p: Json) => /huile/i.test(p.name)) ?? ref[1];
  prodA = a.id; prodB = b.id;
  // recette : 1 portion = 2 A + 0,5 B → crée les items de stock (trackProducts)
  const rec = await call('POST', '/api/recipes', { name: 'Plat du jour', ingredients: [{ productId: prodA, quantity: 2 }, { productId: prodB, quantity: 0.5 }] }, auth);
  expect(rec.status).toBe(201);
  recipeId = rec.json.id ?? rec.json.recipe?.id;
  // stock de confort AVANT tout rafraîchissement d'alertes
  const status = await call('GET', '/api/stock', undefined, auth);
  itemA = status.json.items.find((i: Json) => i.productId === prodA).id;
  itemB = status.json.items.find((i: Json) => i.productId === prodB).id;
  expect((await call('POST', `/api/stock/${itemA}/movements`, { type: 'ajustement', quantity: 200, note: 'mise en place' }, auth)).status).toBe(200);
  expect((await call('POST', `/api/stock/${itemB}/movements`, { type: 'ajustement', quantity: 50, note: 'mise en place' }, auth)).status).toBe(200);
  // 4 jours de ventes (20 portions) pour sortir du démarrage à froid
  for (const off of [2, 5, 9, 12]) {
    expect((await call('POST', '/api/sales', { day: isoOffset(-off), lines: [{ recipeId, portions: 20 }], decrementStock: false }, auth)).status).toBe(200);
  }
  const sup = await call('POST', '/api/suppliers', { name: 'Grossiste Rouen', city: 'Rouen', leadTimeHours: 24, minOrderEur: 0, deliveryFeeEur: 0 }, auth);
  expect(sup.status).toBe(201);
  supplierId = sup.json.supplier?.id ?? sup.json.id;
  const off = await call('POST', `/api/suppliers/${supplierId}/offers`, { productId: prodA, packLabel: 'Sac 5 kg', packQty: 5, packPrice: 12 }, auth);
  expect(off.status).toBe(201);
  offerId = off.json.id;
}, 60_000);

describe('Chantier 4 — soirées privatisées & prévision ajustée', () => {
  it('coef ×1,5 → besoin augmenté sur GET /forecast, explication et liste à jour', async () => {
    const before = await call('GET', '/api/forecast', undefined, auth);
    const aBefore = before.json.products.find((p: Json) => p.productId === prodA);
    const evDay = isoOffset(3);
    const put = await call('PUT', '/api/forecast/events', { events: [{ day: evDay, label: 'Soirée privatisée', multiplier: 1.5 }] }, auth);
    expect(put.status).toBe(200); expect(put.json.saved).toBe(1);
    const after = await call('GET', '/api/forecast', undefined, auth);
    const aAfter = after.json.products.find((p: Json) => p.productId === prodA);
    expect(aAfter.predictedNeed).toBeGreaterThan(aBefore.predictedNeed);
    expect(aAfter.explanation).toContain('Événements déclarés');
    expect(aAfter.explanation).toContain('Soirée privatisée');
    expect(after.json.events).toHaveLength(1);
    expect(after.json.events[0].multiplier).toBe(1.5);
  });

  it('un seul événement par jour (upsert) et suppression propre', async () => {
    const evDay = isoOffset(4);
    await call('PUT', '/api/forecast/events', { events: [{ day: evDay, label: 'Anniversaire', multiplier: 1.3 }] }, auth);
    await call('PUT', '/api/forecast/events', { events: [{ day: evDay, label: 'Mariage Fatou', multiplier: 2 }] }, auth);
    const list = await call('GET', '/api/forecast/events', undefined, auth);
    expect(list.status).toBe(200);
    const sameDay = list.json.events.filter((e: Json) => e.day === evDay);
    expect(sameDay).toHaveLength(1);
    expect(sameDay[0].label).toBe('Mariage Fatou');
    expect(sameDay[0].multiplier).toBe(2);
    // validation : coef hors bornes refusé
    const bad = await call('PUT', '/api/forecast/events', { events: [{ day: evDay, label: 'X', multiplier: 50 }] }, auth);
    expect(bad.status).toBe(400);
    // suppression
    const del = await call('DELETE', `/api/forecast/events/${sameDay[0].id}`, undefined, auth);
    expect(del.status).toBe(200);
    const afterDel = await call('GET', '/api/forecast/events', undefined, auth);
    expect(afterDel.json.events.filter((e: Json) => e.day === evDay)).toHaveLength(0);
    // l'événement ×1,5 du test précédent est toujours actif
    expect(afterDel.json.events.some((e: Json) => e.label === 'Soirée privatisée')).toBe(true);
  });
});

describe('Chantier 4 — alerte de rupture vs livraison couvrante (e2e)', () => {
  it('la livraison couvre le creux → pas de rupture ; le produit sans commande → rupture', async () => {
    // 1) commande en cours sur le produit A (livraison attendue à J+1, 24 h de délai)
    const ord = await call('POST', '/api/orders', { supplierId, lines: [{ offerId, packs: 1 }] }, auth);
    expect(ord.status).toBe(201);
    // 2) puis les stocks tombent : A sur ~2 j de conso (couvert par la commande), B à 0 (sans commande)
    const status = await call('GET', '/api/stock', undefined, auth);
    const a = status.json.items.find((i: Json) => i.productId === prodA);
    const use = Math.max(a.avgDailyUse, 0.5); // ≥ 0,5 unité/j pour que le raisonnement tienne
    expect((await call('POST', `/api/stock/${itemA}/movements`, { type: 'ajustement', quantity: Math.ceil(use * 2), note: 'avant livraison' }, auth)).status).toBe(200);
    expect((await call('POST', `/api/stock/${itemB}/movements`, { type: 'ajustement', quantity: 0, note: 'épuisé' }, auth)).status).toBe(200);
    // 3) rafraîchissement des alertes (seule porte d'entrée hors cron)
    const ref = await call('POST', '/api/alerts/refresh', undefined, auth);
    expect(ref.status).toBe(200);
    // 4) verdict : rupture NON déclenchée sur A (la livraison couvre le creux)…
    const alerts = await call('GET', '/api/alerts', undefined, auth);
    const ruptures = alerts.json.alerts.filter((a2: Json) => a2.kind === 'rupture' && a2.resolvedAt == null);
    expect(ruptures.some((x: Json) => x.productId === prodA)).toBe(false);
    // …mais déclenchée sur B (aucune commande en cours)
    expect(ruptures.some((x: Json) => x.productId === prodB)).toBe(true);
  });
});
