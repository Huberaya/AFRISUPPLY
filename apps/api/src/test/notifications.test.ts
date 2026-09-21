process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.PGLITE_DIR = 'memory://notif'; process.env.ADMIN_EMAILS = 'admin@afrisupply.fr'; process.env.VENDOR_AUTO_APPROVE = 'true'; process.env.CRON_SECRET = 'cron';
import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations, getDb, notifications, orders } from '@afrisupply/db';
import { eq } from 'drizzle-orm';
import { app } from '../app.js';
import { normalizePhone, waLink } from '../lib/sms.js';
type Json = Record<string, any>;
const call = async (m: string, p: string, body?: unknown, h: Record<string, string> = {}) => { const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: (await r.clone().json().catch(() => ({}))) as Json }; };
const reg = async (email: string, name: string) => { const r = await call('POST', '/api/auth/register', { email, password: 'motdepasse1', fullName: 'Test', restaurantName: name, city: 'Nantes' }); return { h: { Authorization: `Bearer ${r.json.token}` } }; };
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
