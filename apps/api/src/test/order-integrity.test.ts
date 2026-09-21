// Chantier 1 (audit AFRISUPPLY) — intégrité de la réception et des statuts de commande.
// Ces tests reproduisent exactement les bugs prouvés lors de l'audit :
//   • double réception → stock compté deux fois (BUG-1) ;
//   • renvoi d'une commande déjà livrée/réceptionnée (BUG-2) ;
//   • quantité reçue absurde (1e12) → 500 base de données (BUG-3) ;
//   • commande à 999 999 colis = 42 M€ acceptée (BUG-4).
import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '@afrisupply/db';
import { app } from '../app.js';
import { checkReceive, checkSend, checkStatusChange, checkLineEdit } from '../lib/orders.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.CRON_SECRET = 'cron-test'; process.env.PGLITE_DIR = 'memory://order-integrity';

type Json = Record<string, any>;
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json: Json = {}; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
};

describe('0. Machine à états (unitaire, sans base de données)', () => {
  const now = new Date('2026-09-20T10:00:00Z');
  it('refuse une seconde réception et nomme la date de la première', () => {
    const r = checkReceive({ status: 'livree', receivedAt: now });
    expect(r?.code).toBe('order_already_received'); expect(r?.status).toBe(409);
    expect(r?.error).toContain('déjà été réceptionnée');
  });
  it('autorise la réception d\'une commande préparée, envoyée ou confirmée', () => {
    expect(checkReceive({ status: 'preparee' })).toBeNull();
    expect(checkReceive({ status: 'envoyee' })).toBeNull();
    expect(checkReceive({ status: 'confirmee' })).toBeNull();
  });
  it('refuse la réception d\'une commande annulée, déjà livrée ou en brouillon', () => {
    expect(checkReceive({ status: 'annulee' })?.code).toBe('order_cancelled');
    expect(checkReceive({ status: 'livree_partiel' })?.code).toBe('order_closed');
    expect(checkReceive({ status: 'brouillon' })?.code).toBe('order_not_receivable');
  });
  it('refuse l\'envoi d\'une commande réceptionnée ou clôturée (BUG-2)', () => {
    expect(checkSend({ status: 'livree', receivedAt: now })?.code).toBe('order_already_received');
    expect(checkSend({ status: 'livree' })?.code).toBe('order_closed');
    expect(checkSend({ status: 'annulee' })?.code).toBe('order_closed');
    expect(checkSend({ status: 'preparee' })).toBeNull();
    expect(checkSend({ status: 'envoyee' })).toBeNull();
  });
  it('n\'autorise pas un retour en arrière après confirmation', () => {
    expect(checkStatusChange('confirmee', 'preparee')?.code).toBe('invalid_transition');
    expect(checkStatusChange('envoyee', 'annulee')).toBeNull();
    expect(checkStatusChange('livree', 'envoyee')?.code).toBe('order_closed');
  });
  it('verrouille les lignes d\'une commande réceptionnée', () => {
    expect(checkLineEdit({ status: 'livree', receivedAt: now })?.code).toBe('order_already_received');
    expect(checkLineEdit({ status: 'preparee' })).toBeNull();
    expect(checkLineEdit({ status: 'annulee' })?.code).toBe('order_closed');
  });
});

let auth: Record<string, string> = {};
let supplierId = ''; let productA = ''; let productB = '';
const offerFor = async (productId: string, packQty = 25) => {
  const r = await call('POST', `/api/suppliers/${supplierId}/offers`, { productId, packLabel: `sac ${packQty} kg`, packQty, packPrice: packQty * 1.6 }, auth);
  return (r.json.offer?.id ?? r.json.id) as string;
};
/** L'API expose la liste des commandes (avec leurs lignes) : suffisant pour les tests. */
const getOrder = async (orderId: string) => {
  const r = await call('GET', '/api/orders', undefined, auth);
  return (r.json.orders ?? []).find((o: Json) => o.id === orderId) as Json | undefined;
};
const stockOf = async (productId: string) => {
  const s = await call('GET', '/api/stock', undefined, auth);
  return Number(s.json.items.find((i: Json) => i.productId === productId)?.quantity ?? 0);
};
const newOrder = async (offerId: string, packs: number, extra: Json = {}) => {
  const r = await call('POST', '/api/orders', { supplierId, channel: 'whatsapp', lines: [{ offerId, packs }], ...extra }, auth);
  return r;
};

beforeAll(async () => { await runMigrations(); }, 60_000);

describe('1. Réception : une seule fois, et jamais deux fois le même stock (BUG-1)', () => {
  let orderId = ''; let lineId = ''; let orderedQty = 0;
  it('prépare un compte, un fournisseur, une offre et une commande', async () => {
    const reg = await call('POST', '/api/auth/register', { email: 'integrite@resto.fr', password: 'Plantain-Yassa-42', fullName: 'Awa Test', restaurantName: 'Chez Test', city: 'Nantes', coversPerDay: 60 });
    expect(reg.status).toBe(201); auth = { authorization: `Bearer ${reg.json.token}` };
    const tpl = await call('GET', '/api/onboarding/templates', undefined, auth);
    await call('POST', '/api/onboarding/apply', { templates: tpl.json.templates.slice(0, 2).map((t: Json) => t.name) }, auth);
    const s = await call('GET', '/api/stock', undefined, auth);
    productA = s.json.items[0].productId; productB = s.json.items[1].productId;
    const sup = await call('POST', '/api/suppliers', { name: 'Grossiste Intégrité', whatsapp: '+33600000001', leadTimeHours: 24 }, auth);
    supplierId = sup.json.supplier?.id ?? sup.json.id;
    const offer = await offerFor(productA);
    const o = await newOrder(offer, 2);
    expect(o.status).toBe(201); orderId = o.json.order.id;
    const detail = await getOrder(orderId);
    lineId = detail!.lines[0].id; orderedQty = Number(detail!.lines[0].quantity);
    expect(orderedQty).toBe(50); // 2 × sac 25 kg
  });
  it('envoie la commande puis la réceptionne : le stock augmente une fois', async () => {
    expect((await call('POST', `/api/orders/${orderId}/send`, undefined, auth)).status).toBe(200);
    const before = await stockOf(productA);
    const rec = await call('POST', `/api/orders/${orderId}/receive`, { lines: [{ lineId, receivedQty: orderedQty }] }, auth);
    expect(rec.status).toBe(200); expect(rec.json.receivedAt).toBeTruthy();
    expect(await stockOf(productA)).toBeCloseTo(before + orderedQty, 3);
  });
  it('horodate la réception et clôture la commande', async () => {
    const d = await getOrder(orderId);
    expect(d!.receivedAt).toBeTruthy(); expect(d!.status).toBe('livree');
  });
  it('REFUSE la seconde réception (409) et ne touche pas au stock', async () => {
    const before = await stockOf(productA);
    const rec = await call('POST', `/api/orders/${orderId}/receive`, { lines: [{ lineId, receivedQty: orderedQty }] }, auth);
    expect(rec.status).toBe(409); expect(rec.json.code).toBe('order_already_received');
    expect(await stockOf(productA)).toBeCloseTo(before, 3);
  });
  it('REFUSE de renvoyer la commande réceptionnée (BUG-2 : avant → 200 et retour en « envoyée »)', async () => {
    const s = await call('POST', `/api/orders/${orderId}/send`, undefined, auth);
    expect(s.status).toBe(409); expect(s.json.code).toBe('order_already_received');
    const s2 = await call('PUT', `/api/orders/${orderId}`, { status: 'envoyee' }, auth);
    expect(s2.status).toBe(409);
    const s3 = await call('PUT', `/api/orders/${orderId}`, { status: 'annulee' }, auth);
    expect(s3.status).toBe(409);
  });
  it('REFUSE de modifier les lignes d\'une commande réceptionnée', async () => {
    const r = await call('PUT', `/api/orders/${orderId}/lines`, { lines: [{ lineId, packs: 9 }] }, auth);
    expect(r.status).toBe(409); expect(r.json.code).toBe('order_already_received');
  });
});

describe('2. Quantités : bornées et confirmables (BUG-3, BUG-4)', () => {
  it('refuse 999 999 colis à la création (BUG-4 : avant → 42 999 958 € acceptés)', async () => {
    const offer = await offerFor(productB);
    const r = await newOrder(offer, 999_999);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toMatch(/colis/);
  });
  it('refuse un volume absurde mais laisse passer un volume moyen, avec message explicite', async () => {
    const offer = await offerFor(productB);
    const tooBig = await newOrder(offer, 500); // 12 500 kg pour un produit jamais consommé
    expect(tooBig.status).toBe(400); expect(tooBig.json.code).toBe('quantity_out_of_range');
    expect(tooBig.json.error).toMatch(/plafond|maximum|habituel/i);
    const ok = await newOrder(offer, 2);
    expect(ok.status).toBe(201);
    const forced = await newOrder(offer, 500, { override: true }); // confirmation explicite → accepté
    expect(forced.status).toBe(201);
    await call('PUT', `/api/orders/${forced.json.order.id}`, { status: 'annulee' }, auth);
  });
  it('refuse 1e12 à la réception (BUG-3 : avant → 500 sur numeric(12,3))', async () => {
    const offer = await offerFor(productB);
    const o = await newOrder(offer, 1);
    const line = (await getOrder(o.json.order.id))!.lines[0];
    const r = await call('POST', `/api/orders/${o.json.order.id}/receive`, { lines: [{ lineId: line.id, receivedQty: 1e12 }] }, auth);
    expect(r.status).toBe(400);
  });
  it('refuse une quantité reçue invraisemblable, puis l\'accepte si elle est confirmée explicitement', async () => {
    const offer = await offerFor(productB);
    const o = await newOrder(offer, 1);
    const orderId = o.json.order.id;
    const line = (await getOrder(orderId))!.lines[0];
    const before = await stockOf(productB);

    const insane = await call('POST', `/api/orders/${orderId}/receive`, { lines: [{ lineId: line.id, receivedQty: 900_000 }] }, auth);
    expect(insane.status).toBe(400); expect(insane.json.code).toBe('quantity_out_of_range');
    expect(await stockOf(productB)).toBeCloseTo(before, 3); // aucune écriture partielle

    const forced = await call('POST', `/api/orders/${orderId}/receive`, { lines: [{ lineId: line.id, receivedQty: 900_000 }], override: true }, auth);
    expect(forced.status).toBe(200);
    expect(await stockOf(productB)).toBeGreaterThan(before);
    // et toujours pas de seconde réception possible
    expect((await call('POST', `/api/orders/${orderId}/receive`, { lines: [{ lineId: line.id, receivedQty: 1 }], override: true }, auth)).status).toBe(409);
  });
  it('refuse une demande de réception sans lignes', async () => {
    const offer = await offerFor(productB);
    const o = await newOrder(offer, 1);
    const r = await call('POST', `/api/orders/${o.json.order.id}/receive`, { lines: [] }, auth);
    expect(r.status).toBe(400);
  });
});

describe('3. Écarts de livraison : le cas 50 kg commandés / 45 reçus', () => {
  it('détecte l\'écart, l\'enregistre, prépare la réclamation et clôt en « livrée partiellement »', async () => {
    const offer = await offerFor(productA);
    const o = await newOrder(offer, 2); const orderId = o.json.order.id;
    const line = (await getOrder(orderId))!.lines[0];
    const rec = await call('POST', `/api/orders/${orderId}/receive`, { lines: [{ lineId: line.id, receivedQty: 45 }] }, auth);
    expect(rec.status).toBe(200);
    expect(rec.json.discrepancies.length).toBe(1);
    expect(rec.json.discrepancies[0]).toMatchObject({ ordered: 50, received: 45 });
    expect(rec.json.claimMessage).toContain('commandé 50 kg, reçu 45 kg');

    const d2 = await getOrder(orderId);
    expect(d2!.status).toBe('livree_partiel');
    const disc = await call('GET', '/api/discrepancies', undefined, auth);
    expect(JSON.stringify(disc.json)).toContain(d2!.reference);
    const alerts = await call('GET', '/api/alerts', undefined, auth);
    expect(JSON.stringify(alerts.json)).toContain('Écart sur la livraison');
  });
});
