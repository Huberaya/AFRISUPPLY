// Chantier 26 — Litiges & avoirs : le restaurant réclame (depuis un écart de réception ou librement),
// le grossiste répond (avoir / relivraison / refus), le restaurant clôt ou escalade vers AFRISUPPLY.
import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb, claims, orders, orderLines, products, deliveryDiscrepancies, deliveries, vendors, vendorMembers, restaurants, restaurantMembers, users, alerts } from '@afrisupply/db';
import { requireAuth, requireRestaurant, type Env } from '../lib/auth.js';
import { sendMail } from '../lib/mailer.js';
import { sendMessage } from '../lib/sms.js';
import { logOrderEvent } from '../lib/order-events.js';
import { audit } from '../lib/ops.js';

const APP_URL = () => process.env.APP_URL ?? 'http://localhost:5173';
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;
const KIND: Record<string, string> = { manquant: 'Manquant', abime: 'Abîmé / casse', erreur_produit: 'Erreur de produit', qualite: 'Qualité / DLC', autre: 'Autre' };
const isAdmin = (email: string) => (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());

async function nextClaimRef() { const db = await getDb(); await db.execute(sql`create sequence if not exists claim_ref_seq`); const res = await db.execute(sql`select nextval('claim_ref_seq') as v`); const rows = (res as unknown as { rows?: { v: string | number }[] }).rows ?? (res as unknown as { v: string | number }[]); return `LIT-${new Date().getFullYear()}-${String(Number((Array.isArray(rows) ? rows[0] : rows).v)).padStart(4, '0')}`; }
async function notifyVendor(vendorId: string, subject: string, text: string, kind: 'order.confirmed' = 'order.confirmed') {
  const db = await getDb(); const [v] = await db.select().from(vendors).where(eq(vendors.id, vendorId)); if (!v) return;
  if (v.contactEmail) void sendMail({ to: v.contactEmail, subject, text, html: `<p>${text.replace(/\n/g, '<br>')}</p><p><a href="${APP_URL()}/fournisseur">Ouvrir mon espace</a></p>`, tags: { type: 'claim' } });
  const phone = v.whatsapp || v.contactPhone; if (phone) void sendMessage({ to: phone, prefer: v.whatsapp ? 'whatsapp' : 'sms', kind, vendorId, body: `AFRISUPPLY — ${subject}\n${text}\n${APP_URL()}/fournisseur` });
}
async function notifyRestaurant(restaurantId: string, subject: string, text: string) {
  const db = await getDb(); const [r] = await db.select({ settings: restaurants.settings }).from(restaurants).where(eq(restaurants.id, restaurantId));
  const rcpts = await db.select({ email: users.email }).from(restaurantMembers).innerJoin(users, eq(users.id, restaurantMembers.userId)).where(eq(restaurantMembers.restaurantId, restaurantId));
  for (const x of rcpts) void sendMail({ to: x.email, subject, text, html: `<p>${text.replace(/\n/g, '<br>')}</p><p><a href="${APP_URL()}/app/achats/ecarts">Voir mes litiges</a></p>`, tags: { type: 'claim' } });
  if (r?.settings?.notifyPhone) void sendMessage({ to: r.settings.notifyPhone, kind: 'order.confirmed', restaurantId, body: `AFRISUPPLY — ${subject}\n${text}` });
}
const publicClaim = (c: typeof claims.$inferSelect) => ({ ...c, photo: undefined, hasPhoto: !!c.photo, kindLabel: KIND[c.kind] ?? c.kind });

// ---------------- Restaurant ----------------
export const claimRoutes = new Hono<Env>();
claimRoutes.use('/claims', requireAuth, requireRestaurant); claimRoutes.use('/claims/*', requireAuth, requireRestaurant);

claimRoutes.get('/claims', async (c) => {
  const db = await getDb(); const rid = c.get('restaurantId');
  const rows = await db.select({ cl: claims, vendorName: vendors.name, reference: orders.reference }).from(claims).innerJoin(vendors, eq(vendors.id, claims.vendorId)).innerJoin(orders, eq(orders.id, claims.orderId)).where(eq(claims.restaurantId, rid)).orderBy(desc(claims.createdAt)).limit(200);
  const items = rows.map((r) => ({ ...publicClaim(r.cl), vendorName: r.vendorName, orderReference: r.reference }));
  const credits = items.filter((i) => i.status === 'accepte' || i.status === 'clos').reduce((a, i) => a + n(i.creditEur), 0);
  return c.json({ items, openCount: items.filter((i) => ['ouvert', 'propose', 'escalade'].includes(i.status)).length, creditsEur: Math.round(credits * 100) / 100 });
});
claimRoutes.get('/claims/:id/photo', async (c) => {
  const db = await getDb(); const rid = c.get('restaurantId');
  const [cl] = await db.select({ photo: claims.photo }).from(claims).where(and(eq(claims.id, c.req.param('id')), eq(claims.restaurantId, rid))); if (!cl?.photo) return c.json({ error: 'Pas de photo' }, 404);
  return c.json({ photo: cl.photo });
});
/** Ouvrir un litige : depuis un écart (discrepancyId) ou librement sur une commande marketplace. */
claimRoutes.post('/claims', async (c) => {
  const body = z.object({ orderId: z.string().uuid().optional(), discrepancyId: z.string().uuid().optional(), productName: z.string().min(1).max(120).optional(), kind: z.enum(['manquant', 'abime', 'erreur_produit', 'qualite', 'autre']).default('manquant'), claimedEur: z.number().nonnegative().optional(), message: z.string().max(600).optional(), photo: z.string().max(600_000).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const db = await getDb(); const rid = c.get('restaurantId'); const user = c.get('user'); const d = body.data;
  if (d.photo && !/^data:image\/(jpeg|png|webp);base64,/.test(d.photo)) return c.json({ error: 'Photo invalide' }, 400);
  let orderId = d.orderId, productName = d.productName, claimedEur = d.claimedEur, orderedQty: number | null = null, receivedQty: number | null = null;
  if (d.discrepancyId) {
    const [row] = await db.select({ dd: deliveryDiscrepancies, orderId: deliveries.orderId, rid: deliveries.restaurantId, unitPrice: orderLines.unitPriceEur, productName: products.name }).from(deliveryDiscrepancies).innerJoin(deliveries, eq(deliveries.id, deliveryDiscrepancies.deliveryId)).innerJoin(orderLines, eq(orderLines.id, deliveryDiscrepancies.orderLineId)).innerJoin(products, eq(products.id, orderLines.productId)).where(eq(deliveryDiscrepancies.id, d.discrepancyId));
    if (!row || row.rid !== rid) return c.json({ error: 'Écart introuvable' }, 404);
    const [dup] = await db.select({ id: claims.id }).from(claims).where(eq(claims.discrepancyId, d.discrepancyId)); if (dup) return c.json({ error: 'Un litige existe déjà pour cet écart' }, 409);
    orderId = row.orderId; productName = productName ?? row.productName; orderedQty = n(row.dd.orderedQty); receivedQty = n(row.dd.receivedQty);
    if (claimedEur === undefined) claimedEur = Math.round(Math.max(0, orderedQty - receivedQty) * n(row.unitPrice) * 100) / 100;
  }
  if (!orderId || !productName) return c.json({ error: 'Commande et produit requis' }, 400);
  const [o] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.restaurantId, rid))); if (!o) return c.json({ error: 'Commande introuvable' }, 404);
  if (!o.vendorId) return c.json({ error: 'Les litiges plateforme ne concernent que les commandes passées via un grossiste AFRISUPPLY. Pour un fournisseur privé, utilisez la réclamation pré-rédigée.' }, 400);
  if (claimedEur === undefined) return c.json({ error: 'Montant réclamé requis' }, 400);
  const reference = await nextClaimRef();
  const [cl] = await db.insert(claims).values({ restaurantId: rid, vendorId: o.vendorId, orderId: o.id, discrepancyId: d.discrepancyId, reference, productName, kind: d.kind, orderedQty: orderedQty?.toFixed(3), receivedQty: receivedQty?.toFixed(3), claimedEur: claimedEur.toFixed(2), message: d.message, photo: d.photo, createdBy: user.id }).returning();
  const [r] = await db.select({ name: restaurants.name }).from(restaurants).where(eq(restaurants.id, rid));
  void logOrderEvent(o.id, 'note', `Litige ${reference} ouvert — ${productName} (${KIND[d.kind]}), ${eur(claimedEur)} réclamés`, 'restaurant');
  void notifyVendor(o.vendorId, `⚠️ Litige ${reference} — ${r.name} — commande ${o.reference}`, `${r.name} signale un problème sur la commande ${o.reference} :\n• ${productName} — ${KIND[d.kind]}${orderedQty !== null ? ` (commandé ${orderedQty}, reçu ${receivedQty})` : ''}\n• Montant réclamé : ${eur(claimedEur)}${d.message ? `\nMessage : ${d.message}` : ''}\n\nRépondez sous 48 h : avoir, relivraison ou refus motivé.`);
  return c.json({ claim: publicClaim(cl), message: `Litige ${reference} envoyé à votre fournisseur. Réponse attendue sous 48 h.` }, 201);
});
/** Le restaurant accepte la réponse (clos) ou escalade vers AFRISUPPLY. */
claimRoutes.post('/claims/:id/close', async (c) => {
  const body = z.object({ action: z.enum(['accept', 'escalate']), message: z.string().max(600).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb(); const rid = c.get('restaurantId');
  const [cl] = await db.select().from(claims).where(and(eq(claims.id, c.req.param('id')), eq(claims.restaurantId, rid))); if (!cl) return c.json({ error: 'Litige introuvable' }, 404);
  if (!['propose', 'refuse', 'accepte'].includes(cl.status)) return c.json({ error: 'En attente de la réponse du fournisseur' }, 400);
  if (body.data.action === 'accept') {
    const [upd] = await db.update(claims).set({ status: 'clos', closedAt: new Date() }).where(eq(claims.id, cl.id)).returning();
    if (cl.discrepancyId) { await db.update(deliveryDiscrepancies).set({ resolved: true, reason: `litige → ${cl.resolution ?? 'clos'}` }).where(eq(deliveryDiscrepancies.id, cl.discrepancyId)); }
    void logOrderEvent(cl.orderId, 'note', `Litige ${cl.reference} clos — ${cl.resolution === 'avoir' ? `avoir ${eur(n(cl.creditEur))}` : cl.resolution ?? ''}`, 'restaurant');
    return c.json({ claim: publicClaim(upd) });
  }
  const [upd] = await db.update(claims).set({ status: 'escalade', message: body.data.message ? `${cl.message ?? ''}\n[Escalade] ${body.data.message}`.trim() : cl.message }).where(eq(claims.id, cl.id)).returning();
  void logOrderEvent(cl.orderId, 'note', `Litige ${cl.reference} escaladé à AFRISUPPLY`, 'restaurant');
  const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const to of admins) void sendMail({ to, subject: `🚨 Litige escaladé ${cl.reference} (${eur(n(cl.claimedEur))})`, text: `Le restaurant conteste la réponse du grossiste.\nLitige : ${cl.reference} — ${cl.productName} — réclamé ${eur(n(cl.claimedEur))}, proposé ${cl.resolution ?? '—'} ${cl.creditEur ? eur(n(cl.creditEur)) : ''}.\nMessage : ${body.data.message ?? '—'}\n${APP_URL()}/app/admin/litiges`, html: `<p>Litige <b>${cl.reference}</b> escaladé — ${cl.productName}, réclamé ${eur(n(cl.claimedEur))}.</p><p><a href="${APP_URL()}/app/admin/litiges">Arbitrer</a></p>`, tags: { type: 'claim' } });
  return c.json({ claim: publicClaim(upd), message: 'AFRISUPPLY a été prévenu et arbitrera sous 3 jours ouvrés.' });
});

// ---------------- Grossiste ----------------
type VEnv = { Variables: Env['Variables'] & { vendorId: string } };
export const vendorClaimRoutes = new Hono<VEnv>();
const vendorGuard = async (c: import('hono').Context<VEnv>, next: import('hono').Next) => { const db = await getDb(); const rows = await db.select({ vendorId: vendorMembers.vendorId }).from(vendorMembers).where(eq(vendorMembers.userId, c.get('user').id)); const w = c.req.header('x-vendor-id'); const vid = w && rows.some((r) => r.vendorId === w) ? w : rows[0]?.vendorId; if (!vid) return c.json({ error: 'Aucun espace fournisseur' }, 403); c.set('vendorId', vid); await next(); };
vendorClaimRoutes.use('/vendor/claims', requireAuth, vendorGuard); vendorClaimRoutes.use('/vendor/claims/*', requireAuth, vendorGuard);

vendorClaimRoutes.get('/vendor/claims', async (c) => {
  const db = await getDb(); const vid = c.get('vendorId');
  const rows = await db.select({ cl: claims, restaurantName: restaurants.name, reference: orders.reference }).from(claims).innerJoin(restaurants, eq(restaurants.id, claims.restaurantId)).innerJoin(orders, eq(orders.id, claims.orderId)).where(eq(claims.vendorId, vid)).orderBy(desc(claims.createdAt)).limit(200);
  const items = rows.map((r) => ({ ...publicClaim(r.cl), photo: r.cl.photo, restaurantName: r.restaurantName, orderReference: r.reference }));
  return c.json({ items, openCount: items.filter((i) => i.status === 'ouvert' || i.status === 'escalade').length, creditsEur: Math.round(items.reduce((a, i) => a + n(i.creditEur), 0) * 100) / 100 });
});
vendorClaimRoutes.post('/vendor/claims/:id/respond', async (c) => {
  const body = z.object({ resolution: z.enum(['avoir', 'relivraison', 'refus']), creditEur: z.number().nonnegative().optional(), message: z.string().max(600).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb(); const vid = c.get('vendorId'); const d = body.data;
  const [cl] = await db.select().from(claims).where(and(eq(claims.id, c.req.param('id')), eq(claims.vendorId, vid))); if (!cl) return c.json({ error: 'Litige introuvable' }, 404);
  if (!['ouvert', 'propose'].includes(cl.status)) return c.json({ error: `Litige ${cl.status}` }, 400);
  if (d.resolution === 'refus' && !d.message) return c.json({ error: 'Un refus doit être motivé' }, 400);
  const credit = d.resolution === 'avoir' ? (d.creditEur ?? n(cl.claimedEur)) : 0;
  if (d.resolution === 'avoir' && credit <= 0) return c.json({ error: 'Montant de l’avoir requis' }, 400);
  const full = d.resolution === 'avoir' && credit >= n(cl.claimedEur) - 0.005;
  const status = d.resolution === 'refus' ? 'refuse' : full ? 'accepte' : 'propose';
  const [upd] = await db.update(claims).set({ status, resolution: d.resolution, creditEur: d.resolution === 'avoir' ? credit.toFixed(2) : null, vendorMessage: d.message, vendorRespondedAt: new Date() }).where(eq(claims.id, cl.id)).returning();
  const [v] = await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, vid));
  const label = d.resolution === 'avoir' ? `avoir de ${eur(credit)}${full ? '' : ` (sur ${eur(n(cl.claimedEur))} réclamés)`}` : d.resolution === 'relivraison' ? 'relivraison du manquant' : `refus : ${d.message}`;
  void logOrderEvent(cl.orderId, 'note', `Litige ${cl.reference} — réponse de ${v.name} : ${label}`, 'vendor');
  void notifyRestaurant(cl.restaurantId, `${d.resolution === 'refus' ? '❌' : '✅'} Litige ${cl.reference} — réponse de ${v.name}`, `${v.name} répond au litige ${cl.reference} (${cl.productName}) : ${label}.${d.message && d.resolution !== 'refus' ? `\nMessage : ${d.message}` : ''}\n${full ? 'L’avoir est à déduire de votre prochaine facture chez ce fournisseur.' : 'Acceptez la réponse ou contestez auprès d’AFRISUPPLY dans Achats → Écarts & litiges.'}`);
  await audit('claim.respond', { actorEmail: c.get('user').email, target: cl.id, meta: { resolution: d.resolution, credit } });
  return c.json({ claim: publicClaim(upd) });
});

// ---------------- Admin : arbitrage ----------------
export const adminClaimRoutes = new Hono<Env>();
adminClaimRoutes.use('/admin/claims/*', requireAuth, async (c, next) => { if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403); await next(); });
adminClaimRoutes.use('/admin/claims', requireAuth, async (c, next) => { if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403); await next(); });
adminClaimRoutes.get('/admin/claims', async (c) => {
  const db = await getDb();
  const rows = await db.select({ cl: claims, restaurantName: restaurants.name, vendorName: vendors.name, reference: orders.reference }).from(claims).innerJoin(restaurants, eq(restaurants.id, claims.restaurantId)).innerJoin(vendors, eq(vendors.id, claims.vendorId)).innerJoin(orders, eq(orders.id, claims.orderId)).orderBy(desc(claims.createdAt)).limit(300);
  return c.json({ items: rows.map((r) => ({ ...publicClaim(r.cl), photo: r.cl.photo, restaurantName: r.restaurantName, vendorName: r.vendorName, orderReference: r.reference })) });
});
adminClaimRoutes.post('/admin/claims/:id/arbitrate', async (c) => {
  const body = z.object({ resolution: z.enum(['avoir', 'relivraison', 'refus']), creditEur: z.number().nonnegative().optional(), message: z.string().min(2).max(600) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb(); const d = body.data;
  const [cl] = await db.select().from(claims).where(eq(claims.id, c.req.param('id'))); if (!cl) return c.json({ error: 'Introuvable' }, 404);
  const credit = d.resolution === 'avoir' ? (d.creditEur ?? n(cl.claimedEur)) : 0;
  const [upd] = await db.update(claims).set({ status: 'clos', resolution: d.resolution, creditEur: d.resolution === 'avoir' ? credit.toFixed(2) : null, vendorMessage: `[Arbitrage AFRISUPPLY] ${d.message}`, closedAt: new Date() }).where(eq(claims.id, cl.id)).returning();
  if (cl.discrepancyId) await db.update(deliveryDiscrepancies).set({ resolved: true, reason: `arbitrage → ${d.resolution}` }).where(eq(deliveryDiscrepancies.id, cl.discrepancyId));
  const txt = `Décision AFRISUPPLY sur le litige ${cl.reference} (${cl.productName}) : ${d.resolution === 'avoir' ? `avoir de ${eur(credit)}` : d.resolution}. ${d.message}`;
  void logOrderEvent(cl.orderId, 'note', `Litige ${cl.reference} arbitré par AFRISUPPLY : ${d.resolution}${credit ? ` ${eur(credit)}` : ''}`, 'system');
  void notifyRestaurant(cl.restaurantId, `⚖️ Litige ${cl.reference} — décision AFRISUPPLY`, txt); void notifyVendor(cl.vendorId, `⚖️ Litige ${cl.reference} — décision AFRISUPPLY`, txt);
  await audit('claim.arbitrate', { actorEmail: c.get('user').email, target: cl.id, meta: { resolution: d.resolution, credit } });
  void alerts;
  return c.json({ claim: publicClaim(upd) });
});
