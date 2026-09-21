process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.PGLITE_DIR = 'memory://notif'; process.env.ADMIN_EMAILS = 'admin@afrisupply.fr'; process.env.VENDOR_AUTO_APPROVE = 'true'; process.env.CRON_SECRET = 'cron'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_notif';
import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations, getDb, notifications, orders } from '@afrisupply/db';
import { eq } from 'drizzle-orm';
import { app } from '../app.js';
import { normalizePhone, waLink } from '../lib/sms.js';
type Json = Record<string, any>;
const call = async (m: string, p: string, body?: unknown, h: Record<string, string> = {}) => { const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined }); return { status: r.status, json: (await r.clone().json().catch(() => ({}))) as Json }; };
const reg = async (email: string, name: string) => { const r = await call('POST', '/api/auth/register', { email, password: 'Plantain-Yassa-42', fullName: 'Test', restaurantName: name, city: 'Nantes' }); return { h: { Authorization: `Bearer ${r.json.token}` } }; };
let V: Record<string, string>; let R: Record<string, string>; let orderId = '';
beforeAll(async () => { await runMigrations(); V = (await reg('gros@n.fr', 'Gros')).h; R = (await reg('resto@n.fr', 'Resto N')).h; }, 60_000);

describe('chantier 18 — WhatsApp / SMS', () => {
  it('normalise les numéros et construit un lien wa.me', () => {
    expect(normalizePhone('06 12 34 56 78')).toBe('+33612345678'); expect(normalizePhone('+33 6-12-34-56-78')).toBe('+33612345678'); expect(normalizePhone('0033612345678')).toBe('+33612345678'); expect(normalizePhone('abc')).toBeNull();
    expect(waLink('0612345678', 'Bonjour')).toBe('https://wa.me/33612345678?text=Bonjour');
  });
  it('réglage restaurant : numéro validé, test journalisé en mode log', async () => {
    expect((await call('PUT', '/api/settings', { notifyPhone: '12' }, R)).status).toBe(400);
    const ok = await call('PUT', '/api/settings', { notifyPhone: '06 98 76 54 32' }, R); expect(ok.status).toBe(200); expect(ok.json.settings.notifyPhone).toBe('+33698765432');
    const t = await call('POST', '/api/settings/test-sms', {}, R); expect(t.status).toBe(200); expect(t.json.channel).toBe('log'); expect(t.json.configured).toBe(false);
    const s = await call('GET', '/api/settings', undefined, R); expect(s.json.settings.notifyPhone).toBe('+33698765432'); expect(s.json.sms.configured).toBe(false);
  });
  it('commande marketplace → notification grossiste, confirmation → notification restaurant, rappel cron', async () => {
    const v = await call('POST', '/api/vendor/register', { acceptCgv: true, name: 'Gros N', city: 'Rungis', deliveryZones: ['75'], categories: ['epicerie'], contactEmail: 'gros@n.fr', whatsapp: '07 11 22 33 44' }, V); expect(v.json.vendor.status).toBe('actif'); const vid = v.json.vendor.id;
    const t = await call('GET', '/api/onboarding/templates', undefined, R); await call('POST', '/api/onboarding/apply', { templates: t.json.templates.slice(0, 1).map((x: Json) => x.id ?? x.name) }, R);
    const pid = (await call('GET', '/api/stock', undefined, R)).json.items[0].productId;
    const off = await call('POST', '/api/vendor/offers', { productId: pid, packLabel: 'Sac 25 kg', packQty: 25, packPrice: 30 }, V); expect(off.json.offer.id).toBeTruthy();
    const o = await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: off.json.offer.id, packs: 2 }] }, R); expect(o.status).toBe(201); orderId = o.json.order.id;
    await new Promise((r) => setTimeout(r, 200));
    const db = await getDb(); let logs = await db.select().from(notifications).where(eq(notifications.orderId, orderId));
    expect(logs.find((l) => l.kind === 'order.new')?.to).toBe('+33711223344'); expect(logs[0].channel).toBe('log');
    // rappel : rien avant 4 h, puis une seule fois
    expect((await call('GET', '/api/jobs/reminders?secret=cron')).json.reminded).toBe(0);
    await db.update(orders).set({ sentAt: new Date(Date.now() - 5 * 3_600_000) }).where(eq(orders.id, orderId));
    const rem = await call('GET', '/api/jobs/reminders?secret=cron'); expect(rem.json.reminded).toBe(1); expect(rem.json.details[0].channel).toContain('log');
    expect((await call('GET', '/api/jobs/reminders?secret=cron')).json.reminded).toBe(0);
    expect((await call('GET', '/api/jobs/reminders?secret=faux')).status).toBe(401);
    // confirmation → restaurant prévenu sur son numéro
    expect((await call('POST', `/api/vendor/orders/${orderId}/confirm`, {}, V)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 200));
    logs = await db.select().from(notifications).where(eq(notifications.orderId, orderId));
    expect(logs.find((l) => l.kind === 'order.confirmed')?.to).toBe('+33698765432');
    const vo = await call('GET', '/api/vendor/orders', undefined, V); expect(vo.json.orders[0].whatsappLink).toContain('wa.me/33698765432');
  });
});

describe('chantier 22 — CGV fournisseur', () => {
  it('inscription refusée sans acceptation, version enregistrée, blocage si obsolète, ré-acceptation', async () => {
    const W = (await reg('gros2@n.fr', 'Gros 2')).h;
    const ko = await call('POST', '/api/vendor/register', { name: 'Sans CGV', categories: ['epicerie'] }, W); expect(ko.status).toBe(400); expect(ko.json.code).toBe('cgv_required');
    const ok = await call('POST', '/api/vendor/register', { acceptCgv: true, name: 'Avec CGV', categories: ['epicerie'] }, W); expect(ok.status).toBe(201); expect(ok.json.vendor.cgvVersion).toBe('1.0'); expect(ok.json.vendor.cgvAcceptedBy).toBe('gros2@n.fr');
    const db = await getDb(); const { vendors } = await import('@afrisupply/db');
    await db.update(vendors).set({ cgvVersion: '0.9' }).where(eq(vendors.id, ok.json.vendor.id));
    const me = await call('GET', '/api/vendor/me', undefined, W); expect(me.json.vendors[0].cgvUpToDate).toBe(false);
    expect((await call('GET', '/api/vendor/orders', undefined, W)).status).toBe(200);
    const blocked = await call('PUT', '/api/vendor/profile', { city: 'Paris' }, W); expect(blocked.status).toBe(428); expect(blocked.json.code).toBe('cgv_outdated');
    expect((await call('POST', '/api/vendor/accept-cgv', {}, W)).json.version).toBe('1.0');
    expect((await call('PUT', '/api/vendor/profile', { city: 'Paris' }, W)).status).toBe(200);
  });
});

describe('chantier 20 — préparation, livraison, preuve, chronologie', () => {
  it('picking, étapes ordonnées, preuve obligatoire, timeline des deux côtés', async () => {
    const pk = await call('GET', '/api/vendor/picking', undefined, V); expect(pk.status).toBe(200); expect(pk.json.orders.length).toBe(1); expect(pk.json.products[0].packs).toBe(2);
    const bad = await call('POST', `/api/vendor/orders/${orderId}/fulfillment`, { step: 'livree' }, V); expect(bad.status).toBe(400); // preuve requise
    expect((await call('POST', `/api/vendor/orders/${orderId}/fulfillment`, { step: 'en_preparation', deliverySlot: '7h–9h' }, V)).json.order.fulfillment).toBe('en_preparation');
    expect((await call('POST', `/api/vendor/orders/${orderId}/fulfillment`, { step: 'en_preparation' }, V)).status).toBe(400); // pas de retour arrière
    const ship = await call('POST', `/api/vendor/orders/${orderId}/fulfillment`, { step: 'en_livraison', driverName: 'Moussa' }, V); expect(ship.json.order.shippedAt).toBeTruthy();
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const del = await call('POST', `/api/vendor/orders/${orderId}/fulfillment`, { step: 'livree', receiverName: 'Awa', signature: png, note: 'RAS' }, V); expect(del.status).toBe(200); expect(del.json.order.fulfillment).toBe('livree'); expect(del.json.order.proofSignature).toBeUndefined();
    const tl = await call('GET', `/api/orders/${orderId}/timeline`, undefined, R); expect(tl.status).toBe(200);
    expect(tl.json.events.map((e: Json) => e.type)).toEqual(['sent', 'confirmed', 'preparing', 'shipped', 'delivered']); expect(tl.json.order.proofSignature).toBe(png); expect(tl.json.order.proofReceiverName).toBe('Awa');
    const list = await call('GET', '/api/orders', undefined, R); const o = list.json.orders.find((x: Json) => x.id === orderId); expect(o.hasProof).toBe(true); expect(o.proofSignature).toBeUndefined(); expect(o.fulfillment).toBe('livree');
    expect((await call('GET', `/api/vendor/orders/${orderId}/timeline`, undefined, V)).json.events.length).toBe(5);
    expect((await call('GET', '/api/vendor/picking', undefined, V)).json.orders[0].fulfillment).toBe('livree');
  });
});

describe('chantier 21 — ruptures & substitutions', () => {
  it('proposition grossiste → acceptation restaurant : lignes modifiées, total, commission ; refus → annulée', async () => {
    const stock = (await call('GET', '/api/stock', undefined, R)).json.items; const p1 = stock[0].productId; const p2 = stock[1]?.productId ?? p1;
    const vid = (await call('GET', '/api/vendor/me', undefined, V)).json.vendors[0].id;
    const offA = (await call('POST', '/api/vendor/offers', { productId: p1, packLabel: 'Sac 10 kg', packQty: 10, packPrice: 20 }, V)).json.offer;
    const offB = (await call('POST', '/api/vendor/offers', { productId: p2, packLabel: 'Sac 5 kg', packQty: 5, packPrice: 12 }, V)).json.offer;
    const o = await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: offA.id, packs: 4 }] }, R); expect(o.status, JSON.stringify(o.json)).toBe(201); const oid = o.json.order.id; const lineId = (await call('GET', '/api/orders', undefined, R)).json.orders.find((x: Json) => x.id === oid).lines[0].id;
    expect((await call('POST', `/api/vendor/orders/${oid}/propose`, { lines: [{ lineId, newPacks: 4 }] }, V)).status).toBe(400); // rien ne change
    expect((await call('POST', `/api/vendor/orders/${oid}/propose`, { lines: [{ lineId, newPacks: 5 }] }, V)).status).toBe(400); // > commandé
    const prop = await call('POST', `/api/vendor/orders/${oid}/propose`, { note: 'Arrivage jeudi', lines: [{ lineId, newPacks: 1, replacementOfferId: offB.id, replacementPacks: 2 }] }, V); expect(prop.status).toBe(200);
    expect(prop.json.proposal.newTotalEur).toBe(20 + 24); expect(prop.json.order.status).toBe('envoyee');
    expect((await call('POST', `/api/vendor/orders/${oid}/confirm`, {}, V)).status).toBe(200); // le grossiste peut encore confirmer tel quel — mais on teste l'acceptation sur une 2e commande
    const o2 = await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: offA.id, packs: 4 }] }, R); const oid2 = o2.json.order.id; const line2 = (await call('GET', '/api/orders', undefined, R)).json.orders.find((x: Json) => x.id === oid2).lines[0].id;
    expect((await call('POST', `/api/orders/${oid2}/proposal`, { action: 'accept' }, R)).status).toBe(400); // pas de proposition
    await call('POST', `/api/vendor/orders/${oid2}/propose`, { lines: [{ lineId: line2, newPacks: 1, replacementOfferId: offB.id, replacementPacks: 2 }] }, V);
    const mine = (await call('GET', '/api/orders', undefined, R)).json.orders.find((x: Json) => x.id === oid2); expect(mine.proposal.newTotalEur).toBe(44);
    const acc = await call('POST', `/api/orders/${oid2}/proposal`, { action: 'accept' }, R); expect(acc.status).toBe(200); expect(acc.json.order.status).toBe('confirmee'); expect(Number(acc.json.order.totalEur)).toBe(44);
    const after = (await call('GET', '/api/orders', undefined, R)).json.orders.find((x: Json) => x.id === oid2); expect(after.lines.length).toBe(2); expect(after.lines.find((l: Json) => l.id === line2).packs).toBe(1); expect(after.proposal).toBeNull();
    expect((await call('GET', '/api/vendor/commissions', undefined, V)).json.commissions?.some((c: Json) => c.orderId === oid2) ?? true).toBe(true);
    // refus
    const o3 = await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: offA.id, packs: 2 }] }, R); const oid3 = o3.json.order.id; const line3 = (await call('GET', '/api/orders', undefined, R)).json.orders.find((x: Json) => x.id === oid3).lines[0].id;
    await call('POST', `/api/vendor/orders/${oid3}/propose`, { lines: [{ lineId: line3, newPacks: 1 }] }, V);
    expect((await call('POST', `/api/orders/${oid3}/proposal`, { action: 'decline' }, R)).json.order.status).toBe('annulee');
    const tl = await call('GET', `/api/orders/${oid3}/timeline`, undefined, R); expect(tl.json.events.map((e: Json) => e.type)).toEqual(['sent', 'note', 'cancelled']);
  });
});

describe('chantier 24 — recommander & récurrent', () => {
  it('aperçu au prix du jour, recommande, programmation, exécution par le job', async () => {
    const mine = (await call('GET', '/api/orders', undefined, R)).json.orders.filter((o: Json) => o.vendorId && o.status === 'confirmee'); const src = mine[0]; expect(src).toBeTruthy();
    const pv = await call('GET', `/api/orders/${src.id}/reorder-preview`, undefined, R); expect(pv.status).toBe(200); expect(pv.json.items.length).toBeGreaterThan(0); expect(pv.json.total).toBeGreaterThan(0);
    const re = await call('POST', `/api/orders/${src.id}/reorder`, {}, R); expect(re.status).toBe(201); expect(re.json.order.source).toBe('recommande'); expect(re.json.order.status).toBe('envoyee');
    const bad = await call('POST', '/api/recurring', { fromOrderId: src.id, name: 'Lundi', weekdays: [] }, R); expect(bad.status).toBe(400);
    const today = new Date().getDay(); const tomorrow = (today + 1) % 7;
    const rec = await call('POST', '/api/recurring', { fromOrderId: src.id, name: 'Commande du lendemain', weekdays: [tomorrow] }, R); expect(rec.status).toBe(201);
    const exp = new Date(); exp.setDate(exp.getDate() + 1); expect(rec.json.recurring.nextRunOn).toBe(exp.toISOString().slice(0, 10));
    const list = await call('GET', '/api/recurring', undefined, R); expect(list.json.recurring.length).toBe(1); expect(list.json.recurring[0].estimatedTotal).toBeGreaterThan(0);
    // job : rien aujourd'hui, puis exécution « demain »
    const { runRecurringOrders } = await import('../routes/marketplace.js');
    expect((await runRecurringOrders()).due).toBe(0);
    const run = await runRecurringOrders(exp); expect(run.due).toBe(1); expect(run.results[0].ok).toBe(true);
    const again = await runRecurringOrders(exp); expect(again.due).toBe(0); // nextRunOn a avancé d'une semaine
    const after = (await call('GET', '/api/recurring', undefined, R)).json.recurring[0]; expect(after.lastOrderId).toBeTruthy();
    const ord = (await call('GET', '/api/orders', undefined, R)).json.orders.find((o: Json) => o.id === after.lastOrderId); expect(ord.source).toBe('recurrente');
    expect((await call('PUT', `/api/recurring/${after.id}`, { enabled: false }, R)).json.recurring.enabled).toBe(false);
    expect((await call('POST', `/api/recurring/${after.id}/run`, {}, R)).status).toBe(201);
    expect((await call('DELETE', `/api/recurring/${after.id}`, undefined, R)).json.ok).toBe(true);
  });
});

describe('chantier 26 — litiges & avoirs', () => {
  it('écart → litige → réponse partielle → escalade → arbitrage ; avoir total → clos', async () => {
    const vid = (await call('GET', '/api/vendor/me', undefined, V)).json.vendors[0].id;
    const pid = (await call('GET', '/api/stock', undefined, R)).json.items[0].productId;
    const off = (await call('POST', '/api/vendor/offers', { productId: pid, packLabel: 'Carton 6', packQty: 6, packPrice: 30 }, V)).json.offer;
    const mk = async () => { const o = (await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: off.id, packs: 2 }] }, R)).json.order; await call('POST', `/api/vendor/orders/${o.id}/confirm`, {}, V); const line = (await call('GET', '/api/orders', undefined, R)).json.orders.find((x: Json) => x.id === o.id).lines[0]; const rc = await call('POST', `/api/orders/${o.id}/receive`, { lines: [{ lineId: line.id, receivedQty: 6 }] }, R); expect(rc.status).toBe(200); const disc = (await call('GET', '/api/discrepancies', undefined, R)).json.items.find((d: Json) => d.orderId === o.id); expect(disc.vendorId).toBe(vid); return { o, disc }; };
    const { o, disc } = await mk();
    const cl = await call('POST', '/api/claims', { discrepancyId: disc.id, kind: 'manquant', message: 'Il manque un carton' }, R); expect(cl.status).toBe(201); expect(Number(cl.json.claim.claimedEur)).toBe(30); expect(cl.json.claim.reference).toMatch(/^LIT-/);
    expect((await call('POST', '/api/claims', { discrepancyId: disc.id }, R)).status).toBe(409);
    expect((await call('POST', `/api/claims/${cl.json.claim.id}/close`, { action: 'accept' }, R)).status).toBe(400); // pas encore de réponse
    const vc = await call('GET', '/api/vendor/claims', undefined, V); expect(vc.json.openCount).toBe(1); expect(vc.json.items[0].restaurantName).toBe('Resto N');
    expect((await call('POST', `/api/vendor/claims/${cl.json.claim.id}/respond`, { resolution: 'refus' }, V)).status).toBe(400); // refus non motivé
    const partial = await call('POST', `/api/vendor/claims/${cl.json.claim.id}/respond`, { resolution: 'avoir', creditEur: 10, message: 'Geste commercial' }, V); expect(partial.json.claim.status).toBe('propose');
    const esc = await call('POST', `/api/claims/${cl.json.claim.id}/close`, { action: 'escalate', message: 'Insuffisant' }, R); expect(esc.json.claim.status).toBe('escalade');
    expect((await call('GET', '/api/admin/claims', undefined, R)).status).toBe(403);
    const ADM = (await reg('admin@afrisupply.fr', 'Admin')).h;
    const all = await call('GET', '/api/admin/claims', undefined, ADM); expect(all.json.items.some((c: Json) => c.status === 'escalade')).toBe(true);
    const arb = await call('POST', `/api/admin/claims/${cl.json.claim.id}/arbitrate`, { resolution: 'avoir', creditEur: 30, message: 'Photo probante, avoir intégral' }, ADM); expect(arb.json.claim.status).toBe('clos'); expect(Number(arb.json.claim.creditEur)).toBe(30);
    expect((await call('GET', '/api/discrepancies?all=1', undefined, R)).json.items.find((d: Json) => d.id === disc.id).resolved).toBe(true);
    const tl = await call('GET', `/api/orders/${o.id}/timeline`, undefined, R); expect(tl.json.events.filter((e: Json) => e.type === 'note').length).toBeGreaterThanOrEqual(3);
    // avoir total → accepte → clos par le restaurant
    const { disc: d2 } = await mk();
    const c2 = (await call('POST', '/api/claims', { discrepancyId: d2.id }, R)).json.claim;
    expect((await call('POST', `/api/vendor/claims/${c2.id}/respond`, { resolution: 'avoir' }, V)).json.claim.status).toBe('accepte');
    const mine = await call('GET', '/api/claims', undefined, R); expect(mine.json.creditsEur).toBe(60);
    expect((await call('POST', `/api/claims/${c2.id}/close`, { action: 'accept' }, R)).json.claim.status).toBe('clos');
  });
});

describe('chantier 28 — paliers de volume & prix négociés', () => {
  it('paliers validés, devis, commande au bon prix, accord client prioritaire', async () => {
    const vid = (await call('GET', '/api/vendor/me', undefined, V)).json.vendors[0].id; const rid = (await call('GET', '/api/settings', undefined, R)).json.restaurant.id;
    const pid = (await call('GET', '/api/stock', undefined, R)).json.items[0].productId;
    const off = (await call('POST', '/api/vendor/offers', { productId: pid, packLabel: 'Sac 20 kg', packQty: 20, packPrice: 40 }, V)).json.offer;
    expect((await call('PUT', `/api/vendor/offers/${off.id}/tiers`, { tiers: [{ minPacks: 5, packPriceEur: 45 }] }, V)).status).toBe(400); // pas moins cher
    expect((await call('PUT', `/api/vendor/offers/${off.id}/tiers`, { tiers: [{ minPacks: 5, packPriceEur: 38 }, { minPacks: 10, packPriceEur: 39 }] }, V)).status).toBe(400); // non décroissant
    expect((await call('PUT', `/api/vendor/offers/${off.id}/tiers`, { tiers: [{ minPacks: 10, packPriceEur: 34 }, { minPacks: 5, packPriceEur: 37 }] }, V)).status).toBe(200);
    const fiche = await call('GET', `/api/marketplace/vendors/${vid}`, undefined, R); const fo = fiche.json.offers.find((o: Json) => o.id === off.id); expect(fo.tiers.map((t: Json) => t.minPacks)).toEqual([5, 10]); expect(fo.negotiated).toBe(false);
    const q1 = await call('POST', `/api/marketplace/vendors/${vid}/quote`, { lines: [{ vendorOfferId: off.id, packs: 3 }] }, R); expect(q1.json.lines[0].packPriceEur).toBe(40); expect(q1.json.lines[0].nextTier.missingPacks).toBe(2);
    const q2 = await call('POST', `/api/marketplace/vendors/${vid}/quote`, { lines: [{ vendorOfferId: off.id, packs: 6 }] }, R); expect(q2.json.lines[0].packPriceEur).toBe(37); expect(q2.json.saved).toBe(18); expect(q2.json.lines[0].source).toBe('palier');
    const o = await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: off.id, packs: 10 }] }, R); expect(o.status).toBe(201); expect(Number(o.json.order.totalEur)).toBe(340);
    // accord client : remise globale 10 % → 36 pour 1 colis ; palier 34 reste meilleur à 10 colis
    expect((await call('POST', '/api/vendor/customer-prices', { restaurantId: rid, discountPct: 10 }, V)).status).toBe(201);
    const q3 = await call('POST', `/api/marketplace/vendors/${vid}/quote`, { lines: [{ vendorOfferId: off.id, packs: 1 }] }, R); expect(q3.json.lines[0].packPriceEur).toBe(36); expect(q3.json.lines[0].source).toBe('remise_client');
    const q4 = await call('POST', `/api/marketplace/vendors/${vid}/quote`, { lines: [{ vendorOfferId: off.id, packs: 10 }] }, R); expect(q4.json.lines[0].packPriceEur).toBe(34);
    // prix ferme sur l'offre : 30 → prioritaire partout
    const cp = await call('POST', '/api/vendor/customer-prices', { restaurantId: rid, vendorOfferId: off.id, packPriceEur: 30, validUntil: '2099-01-01' }, V); expect(cp.status).toBe(201);
    expect((await call('POST', '/api/vendor/customer-prices', { restaurantId: rid, vendorOfferId: off.id, packPriceEur: 50 }, V)).status).toBe(400);
    const f2 = (await call('GET', `/api/marketplace/vendors/${vid}`, undefined, R)).json.offers.find((x: Json) => x.id === off.id); expect(f2.negotiated).toBe(true); expect(Number(f2.packPriceEur)).toBe(30); expect(f2.listPriceEur).toBe(40);
    const o2 = await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: off.id, packs: 2 }] }, R); expect(Number(o2.json.order.totalEur)).toBe(60);
    const pr = await call('GET', '/api/vendor/pricing', undefined, V); expect(pr.json.customers.length).toBe(2); expect(pr.json.clients.some((c: Json) => c.id === rid)).toBe(true);
    // un autre restaurant ne voit pas le prix négocié
    const R2 = (await reg('autre@n.fr', 'Autre resto')).h; const f3 = (await call('GET', `/api/marketplace/vendors/${vid}`, undefined, R2)).json.offers.find((x: Json) => x.id === off.id); expect(f3.negotiated).toBe(false); expect(Number(f3.packPriceEur)).toBe(40);
    expect((await call('POST', '/api/vendor/customer-prices', { restaurantId: (await call('GET', '/api/settings', undefined, R2)).json.restaurant.id, discountPct: 5 }, V)).status).toBe(400); // pas client
    expect((await call('DELETE', `/api/vendor/customer-prices/${cp.json.price.id}`, undefined, V)).json.ok).toBe(true);
  });
});

describe('chantier 27 — avis & fiabilité grossiste', () => {
  it('avis après livraison uniquement, un par commande, réponse du grossiste, badge public', async () => {
    const vid = (await call('GET', '/api/vendor/me', undefined, V)).json.vendors[0].id;
    const pid = (await call('GET', '/api/stock', undefined, R)).json.items[0].productId;
    const off = (await call('POST', '/api/vendor/offers', { productId: pid, packLabel: 'Carton 10 kg', packQty: 10, packPrice: 25 }, V)).json.offer;
    const o = await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: off.id, packs: 2 }] }, R); expect(o.status).toBe(201); const oid = o.json.order.id;
    expect((await call('POST', `/api/orders/${oid}/review`, { rating: 5 }, R)).status).toBe(400); // pas encore livrée
    expect((await call('POST', `/api/vendor/orders/${oid}/confirm`, {}, V)).status).toBe(200);
    expect((await call('POST', `/api/vendor/orders/${oid}/fulfillment`, { step: 'en_preparation' }, V)).status).toBe(200);
    expect((await call('POST', `/api/vendor/orders/${oid}/fulfillment`, { step: 'en_livraison', driverName: 'Moussa' }, V)).status).toBe(200);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    expect((await call('POST', `/api/vendor/orders/${oid}/fulfillment`, { step: 'livree', receiverName: 'Awa', signature: png }, V)).status).toBe(200);
    const pend = await call('GET', '/api/reviews/pending', undefined, R); expect(pend.json.pending.some((p: Json) => p.id === oid)).toBe(true);
    expect((await call('POST', `/api/orders/${oid}/review`, { rating: 7 }, R)).status).toBe(400);
    const rv = await call('POST', `/api/orders/${oid}/review`, { rating: 4, onTime: true, conform: true, comment: 'Très bien' }, R); expect(rv.status).toBe(201);
    expect((await call('POST', `/api/orders/${oid}/review`, { rating: 1 }, R)).status).toBe(409); // doublon
    const mine = await call('GET', '/api/vendor/reviews', undefined, V); expect(mine.json.reviews.length).toBeGreaterThanOrEqual(1); expect(mine.json.reliability.rating).toBeGreaterThan(0);
    const rid = mine.json.reviews.find((x: Json) => x.orderId === oid).id;
    expect((await call('POST', `/api/vendor/reviews/${rid}/reply`, { reply: 'Merci !' }, V)).json.review.vendorReply).toBe('Merci !');
    const pub = await call('GET', `/api/public/vendors/${vid}/reviews`); expect(pub.status).toBe(200); expect(pub.json.reviews[0].vendorReply).toBe('Merci !'); expect(pub.json.reviews[0].restaurantId).toBeUndefined(); expect(pub.json.reliability.reviews).toBeGreaterThanOrEqual(1);
    const mk = await call('GET', '/api/marketplace/vendors', undefined, R); expect(mk.json.vendors.every((x: Json) => x.reliability?.badge)).toBe(true); // annuaire enrichi
    const fiche = await call('GET', `/api/marketplace/vendors/${vid}`, undefined, R); expect(fiche.json.reliability.onTimePct).toBe(100); expect(fiche.json.reliability.rating).toBe(4);
  });
});

describe('chantier 19 — tournées & créneaux', () => {
  it('tournées CRUD, créneaux proposés selon zone et heure limite, capacité, commande sur créneau', async () => {
    const vid = (await call('GET', '/api/vendor/me', undefined, V)).json.vendors[0].id;
    const pid = (await call('GET', '/api/stock', undefined, R)).json.items[0].productId;
    const off = (await call('POST', '/api/vendor/offers', { productId: pid, packLabel: 'Sac 5 kg', packQty: 5, packPrice: 12 }, V)).json.offer;
    // sans tournée : pas de créneaux, commande classique (délai leadTime)
    const s0 = await call('GET', `/api/marketplace/vendors/${vid}/slots`, undefined, R); expect(s0.json.hasRoutes).toBe(false);
    expect((await call('POST', '/api/vendor/routes', { name: 'X', weekday: 9 }, V)).status).toBe(400);
    // tournée quotidienne toutes zones, heure limite J-0 23:59, capacité 1
    const days = [0, 1, 2, 3, 4, 5, 6];
    const created: string[] = [];
    for (const d of days) { const r = await call('POST', '/api/vendor/routes', { name: `Tournée ${d}`, weekday: d, slots: ['6h–8h', '8h–10h'], cutoffDaysBefore: 0, cutoffTime: '23:59', capacity: 1 }, V); expect(r.status).toBe(201); created.push(r.json.route.id); }
    // tournée hors zone (code postal 99999) → jamais proposée
    const far = await call('POST', '/api/vendor/routes', { name: 'Lointaine', weekday: 1, zones: ['99999'], cutoffDaysBefore: 0, cutoffTime: '23:59' }, V); expect(far.status).toBe(201);
    const s1 = await call('GET', `/api/marketplace/vendors/${vid}/slots`, undefined, R); expect(s1.json.hasRoutes).toBe(true);
    expect(s1.json.slots.some((s: Json) => s.routeName === 'Lointaine')).toBe(false); expect(s1.json.slots.length).toBeGreaterThanOrEqual(14);
    const first = s1.json.slots[0]; expect(first.remaining).toBe(1); expect(first.slots).toEqual(['6h–8h', '8h–10h']);
    // mauvais créneau horaire → 400 ; bon → 201 avec date & créneau
    expect((await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: off.id, packs: 1 }], routeId: first.routeId, expectedAt: first.date, deliverySlot: '22h–23h' }, R)).status).toBe(400);
    const o1 = await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: off.id, packs: 1 }], routeId: first.routeId, expectedAt: first.date, deliverySlot: '8h–10h' }, R);
    expect(o1.status).toBe(201); expect(o1.json.order.expectedAt).toBe(first.date); expect(o1.json.order.deliverySlot).toBe('8h–10h'); expect(o1.json.order.routeId).toBe(first.routeId);
    // capacité atteinte → 409 ; la liste marque la date complète
    expect((await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: off.id, packs: 1 }], routeId: first.routeId, expectedAt: first.date }, R)).status).toBe(409);
    const s2 = await call('GET', `/api/marketplace/vendors/${vid}/slots`, undefined, R); expect(s2.json.slots.find((s: Json) => s.date === first.date && s.routeId === first.routeId).full).toBe(true);
    // sans choix explicite → premier créneau libre (le suivant)
    const o2 = await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: off.id, packs: 1 }] }, R); expect(o2.status).toBe(201); expect(o2.json.order.expectedAt > first.date).toBe(true);
    // heure limite dépassée : J-1 à 00:00 → la date de demain n'est plus proposée
    for (const id of created) expect((await call('PUT', `/api/vendor/routes/${id}`, { cutoffDaysBefore: 1, cutoffTime: '00:00' }, V)).status).toBe(200);
    const s3 = await call('GET', `/api/marketplace/vendors/${vid}/slots`, undefined, R); const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect(s3.json.slots.some((s: Json) => s.date <= tomorrow)).toBe(false);
    const list = await call('GET', '/api/vendor/routes', undefined, V); expect(list.json.routes.length).toBe(8); expect(list.json.upcoming.length).toBeGreaterThanOrEqual(1);
    expect((await call('DELETE', `/api/vendor/routes/${far.json.route.id}`, undefined, V)).json.ok).toBe(true);
    for (const id of created) await call('DELETE', `/api/vendor/routes/${id}`, undefined, V);
  });
});

describe('chantier 24 bis — récurrente « me demander avant »', () => {
  it('le job crée un brouillon préparé, le restaurant valide en 1 clic, le grossiste ne voit la commande qu’après', async () => {
    const vid = (await call('GET', '/api/vendor/me', undefined, V)).json.vendors[0].id;
    const pid = (await call('GET', '/api/stock', undefined, R)).json.items[0].productId;
    const off = (await call('POST', '/api/vendor/offers', { productId: pid, packLabel: 'Bidon 5 L', packQty: 5, packPrice: 20 }, V)).json.offer;
    const exp = new Date(Date.now() + 86_400_000); const wd = exp.getUTCDay();
    const rec = await call('POST', '/api/recurring', { vendorId: vid, name: 'Huile du mardi', weekdays: [wd], mode: 'confirm', lines: [{ vendorOfferId: off.id, packs: 2 }] }, R); expect(rec.status).toBe(201);
    const { runRecurringOrders } = await import('../routes/marketplace.js');
    const run = await runRecurringOrders(exp); const mine = run.results.find((x) => x.name === 'Huile du mardi'); expect(mine?.ok).toBe(true);
    const after = (await call('GET', '/api/recurring', undefined, R)).json.recurring.find((x: Json) => x.name === 'Huile du mardi');
    const ord = (await call('GET', '/api/orders', undefined, R)).json.orders.find((o: Json) => o.id === after.lastOrderId); expect(ord.status).toBe('preparee'); expect(ord.sentAt).toBeNull();
    const before = (await call('GET', '/api/vendor/orders', undefined, V)).json.orders ?? []; expect(before.some((o: Json) => o.id === ord.id)).toBe(false); // le grossiste ne la voit pas encore
    const snd = await call('POST', `/api/marketplace/orders/${ord.id}/send`, {}, R); expect(snd.status).toBe(200); expect(snd.json.order.status).toBe('envoyee');
    expect((await call('POST', `/api/marketplace/orders/${ord.id}/send`, {}, R)).status).toBe(409);
    const vo = (await call('GET', '/api/vendor/orders', undefined, V)).json.orders; expect(vo.some((o: Json) => o.id === ord.id)).toBe(true);
    await call('DELETE', `/api/recurring/${after.id}`, undefined, R);
  });
});

describe('chantier 29 — encours & conditions de paiement', () => {
  it('délai accordé → échéance à la livraison, plafond d’encours 402, encaissement partiel puis solde, retard bloque, compte bloqué', async () => {
    const vid = (await call('GET', '/api/vendor/me', undefined, V)).json.vendors[0].id; const rid = (await call('GET', '/api/settings', undefined, R)).json.restaurant.id;
    const pid = (await call('GET', '/api/stock', undefined, R)).json.items[0].productId;
    const off = (await call('POST', '/api/vendor/offers', { productId: pid, packLabel: 'Caisse 10 kg', packQty: 10, packPrice: 100 }, V)).json.offer;
    // encours déjà engagé par les tests précédents + prix effectif (remise client du chantier 28 possible)
    const base = (await call('GET', `/api/marketplace/vendors/${vid}/credit`, undefined, R)).json.exposure.outstandingEur as number;
    const unit = (await call('POST', `/api/marketplace/vendors/${vid}/quote`, { lines: [{ vendorOfferId: off.id, packs: 1 }] }, R)).json.lines[0].packPriceEur as number;
    const limit = Math.round((base + unit * 2.5) * 100) / 100; // 2 caisses passent, la 3e non
    expect((await call('PUT', `/api/vendor/credit/${rid}`, { paymentDays: 120 }, V)).status).toBe(400);
    const tm = await call('PUT', `/api/vendor/credit/${rid}`, { paymentDays: 30, creditLimitEur: limit }, V); expect(tm.status).toBe(200); expect(tm.json.terms.paymentDays).toBe(30);
    const my = await call('GET', `/api/marketplace/vendors/${vid}/credit`, undefined, R); expect(my.json.terms.paymentDays).toBe(30); expect(my.json.terms.creditLimitEur).toBe(limit);
    // 2 caisses = 200 € OK ; puis 1 caisse = 100 € → 300 > 250 → 402
    const o1 = await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: off.id, packs: 2 }] }, R); expect(o1.status).toBe(201); expect(o1.json.order.paymentDays).toBe(30);
    const o2 = await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: off.id, packs: 1 }] }, R); expect(o2.status).toBe(402); expect(o2.json.error).toMatch(/Plafond/);
    // livraison → dueAt = +30 j ; encaissement impossible avant livraison
    expect((await call('POST', `/api/vendor/orders/${o1.json.order.id}/payment`, {}, V)).status).toBe(400);
    expect((await call('POST', `/api/vendor/orders/${o1.json.order.id}/confirm`, {}, V)).status).toBe(200);
    for (const step of [{ step: 'en_preparation' }, { step: 'en_livraison' }, { step: 'livree', receiverName: 'Awa' }]) expect((await call('POST', `/api/vendor/orders/${o1.json.order.id}/fulfillment`, step, V)).status).toBe(200);
    const cr = await call('GET', '/api/vendor/credit', undefined, V); const rec = cr.json.receivables.find((x: Json) => x.id === o1.json.order.id); const o1total = Math.round((Number(o1.json.order.totalEur) + Number(o1.json.order.deliveryFeeEur)) * 100) / 100; expect(rec.dueEur).toBe(o1total); expect(rec.overdue).toBe(false);
    const expectedDue = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10); expect(rec.dueAt).toBe(expectedDue);
    const cl = cr.json.clients.find((x: Json) => x.restaurantId === rid); expect(cl.outstandingEur).toBeGreaterThanOrEqual(unit * 2);
    const pay = await call('GET', '/api/marketplace/payables', undefined, R); expect(pay.json.items.some((x: Json) => x.id === o1.json.order.id)).toBe(true);
    // acompte 50 → reste 150 ; plafond : 150 + 100 = 250 → OK maintenant
    const p1 = await call('POST', `/api/vendor/orders/${o1.json.order.id}/payment`, { amountEur: unit * 0.5, method: 'especes' }, V); expect(p1.json.settled).toBe(false); expect(p1.json.remainingEur).toBe(Math.round((o1total - unit * 0.5) * 100) / 100);
    expect((await call('POST', `/api/vendor/orders/${o1.json.order.id}/payment`, { amountEur: unit * 5 }, V)).status).toBe(400);
    const o3 = await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: off.id, packs: 1 }] }, R); expect(o3.status).toBe(201);
    const p2 = await call('POST', `/api/vendor/orders/${o1.json.order.id}/payment`, { method: 'virement' }, V); expect(p2.json.settled).toBe(true);
    expect((await call('POST', `/api/vendor/orders/${o1.json.order.id}/payment`, {}, V)).status).toBe(409);
    // retard : on force une échéance passée sur o3 après livraison → nouvelle commande refusée 402
    for (const step of [{}, { step: 'en_preparation' }, { step: 'en_livraison' }, { step: 'livree', receiverName: 'Awa' }]) await call('POST', `/api/vendor/orders/${o3.json.order.id}/${'step' in step ? 'fulfillment' : 'confirm'}`, step, V);
    const { getDb, orders } = await import('@afrisupply/db'); const { eq } = await import('drizzle-orm');
    await (await getDb()).update(orders).set({ dueAt: '2020-01-01' }).where(eq(orders.id, o3.json.order.id));
    const o4 = await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: off.id, packs: 1 }] }, R); expect(o4.status).toBe(402); expect(o4.json.error).toMatch(/retard/);
    const cr2 = await call('GET', '/api/vendor/credit', undefined, V); expect(cr2.json.overdueEur).toBeGreaterThanOrEqual(unit);
    // compte bloqué explicitement
    await call('POST', `/api/vendor/orders/${o3.json.order.id}/payment`, {}, V);
    expect((await call('PUT', `/api/vendor/credit/${rid}`, { blocked: true }, V)).json.terms.blocked).toBe(true);
    expect((await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: off.id, packs: 1 }] }, R)).json.error).toMatch(/bloqué/);
    await call('PUT', `/api/vendor/credit/${rid}`, { blocked: false, paymentDays: 0, creditLimitEur: null }, V);
    // rappels : rien à J-2 aujourd'hui (tout soldé)
    const { remindPayments } = await import('../lib/credit.js'); expect((await remindPayments()).reminded).toBe(0);
  });
});

describe('chantier 25 — paiement en ligne des commandes (Stripe Connect)', () => {
  it('sans Stripe : messages clairs ; webhook signé → commande soldée, idempotent, SEPA en attente ignoré', async () => {
    const { createHmac } = await import('node:crypto');
    const sign = (body: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', 'whsec_notif').update(`${t}.${body}`).digest('hex')}`;
    const vid = (await call('GET', '/api/vendor/me', undefined, V)).json.vendors[0].id; const rid = (await call('GET', '/api/settings', undefined, R)).json.restaurant.id;
    const pid = (await call('GET', '/api/stock', undefined, R)).json.items[0].productId;
    const off = (await call('POST', '/api/vendor/offers', { productId: pid, packLabel: 'Pot 1 kg', packQty: 1, packPrice: 8 }, V)).json.offer;
    const o = (await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: off.id, packs: 3 }] }, R)).json.order; expect(o?.id).toBeTruthy();
    // Stripe non configuré
    const vp = await call('GET', '/api/vendor/payments', undefined, V); expect(vp.json.configured).toBe(false);
    expect((await call('POST', '/api/vendor/payments/onboard', {}, V)).status).toBe(503);
    const st = await call('GET', `/api/orders/${o.id}/payment`, undefined, R); expect(st.json.available).toBe(false); expect(st.json.reason).toBe('stripe_off'); expect(st.json.remainingEur).toBe(Number(o.totalEur) + Number(o.deliveryFeeEur));
    expect((await call('POST', `/api/orders/${o.id}/pay`, {}, R)).status).toBe(400);
    // webhook : SEPA en attente → rien
    const total = Math.round((Number(o.totalEur) + Number(o.deliveryFeeEur)) * 100);
    const mk = (id: string, type: string, extra: Record<string, unknown>) => JSON.stringify({ id, type, data: { object: { id: 'cs_1', object: 'checkout.session', mode: 'payment', amount_total: total, payment_intent: 'pi_1', metadata: { kind: 'order_payment', orderId: o.id, vendorId: vid, restaurantId: rid }, ...extra } } });
    let body = mk('evt_p1', 'checkout.session.completed', { payment_status: 'unpaid' });
    expect((await call('POST', '/api/billing/webhook', body, { 'stripe-signature': sign(body) })).status).toBe(200);
    expect((await call('GET', `/api/orders/${o.id}/payment`, undefined, R)).json.paidAt).toBeNull();
    // puis paiement effectif
    body = mk('evt_p2', 'checkout.session.async_payment_succeeded', { payment_status: 'paid' });
    expect((await call('POST', '/api/billing/webhook', body, { 'stripe-signature': sign(body) })).status).toBe(200);
    const paid = await call('GET', `/api/orders/${o.id}/payment`, undefined, R); expect(paid.json.paidAt).toBeTruthy(); expect(paid.json.paymentMethod).toBe('en_ligne'); expect(paid.json.remainingEur).toBe(0); expect(paid.json.reason).toBe('already_paid');
    // rejoué → dupliqué, pas de double comptage
    expect((await call('POST', '/api/billing/webhook', body, { 'stripe-signature': sign(body) })).json.duplicate).toBe(true);
    expect((await call('GET', `/api/orders/${o.id}/payment`, undefined, R)).json.paidAmountEur).toBe(total / 100);
    // signature invalide
    expect((await call('POST', '/api/billing/webhook', body, { 'stripe-signature': 't=1,v1=bad' })).status).toBe(400);
    // le grossiste voit la commande soldée dans son encours (plus dans les factures ouvertes)
    const cr = await call('GET', '/api/vendor/credit', undefined, V); expect(cr.json.receivables.some((x: Json) => x.id === o.id)).toBe(false);
  });
});
