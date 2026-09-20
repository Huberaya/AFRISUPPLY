// Chantier 17 — Tableau de bord fondateur : toute la plateforme en un écran (offre, demande, activité, argent, funnel, journal).
import { Hono } from 'hono';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { getDb, users, restaurants, vendors, vendorOffers, products, orders, orderLines, inventoryItems, prospects, leads, commissions, auditLog, suppliers } from '@afrisupply/db';
import { requireAuth, type Env } from '../lib/auth.js';

const isAdmin = (email: string) => (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
const n = (v: unknown) => Number(v ?? 0);
export const adminDashboardRoutes = new Hono<Env>();
adminDashboardRoutes.use('/admin/dashboard', requireAuth, async (c, next) => { if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403); await next(); });

adminDashboardRoutes.get('/admin/dashboard', async (c) => {
  const db = await getDb(); const d30 = sql`now() - interval '30 days'`; const d7 = sql`now() - interval '7 days'`;
  const [u] = await db.select({ total: sql<number>`count(*)`, w: sql<number>`count(*) filter (where ${users.createdAt} >= ${d7})`, m: sql<number>`count(*) filter (where ${users.createdAt} >= ${d30})` }).from(users);
  const [r] = await db.select({ total: sql<number>`count(*)`, m: sql<number>`count(*) filter (where ${restaurants.createdAt} >= ${d30})`, trial: sql<number>`count(*) filter (where ${restaurants.plan} = 'trial')`, paying: sql<number>`count(*) filter (where ${restaurants.plan} in ('starter','pro','business'))` }).from(restaurants);
  const activeR = await db.select({ c: sql<number>`count(distinct ${orders.restaurantId})` }).from(orders).where(gte(orders.createdAt, sql`now() - interval '30 days'`));
  const [v] = await db.select({ total: sql<number>`count(*)`, actif: sql<number>`count(*) filter (where ${vendors.status} = 'actif')`, attente: sql<number>`count(*) filter (where ${vendors.status} = 'en_attente')` }).from(vendors);
  const [vo] = await db.select({ offers: sql<number>`count(*)`, inStock: sql<number>`count(*) filter (where ${vendorOffers.inStock})`, productsCovered: sql<number>`count(distinct ${vendorOffers.productId})` }).from(vendorOffers);
  const [pr] = await db.select({ ref: sql<number>`count(*) filter (where ${products.restaurantId} is null)`, priv: sql<number>`count(*) filter (where ${products.restaurantId} is not null)` }).from(products);
  const [tracked] = await db.select({ c: sql<number>`count(distinct ${inventoryItems.productId})` }).from(inventoryItems);
  const [o] = await db.select({ total: sql<number>`count(*)`, m: sql<number>`count(*) filter (where ${orders.createdAt} >= ${d30})`, mkt: sql<number>`count(*) filter (where ${orders.vendorId} is not null)`, mktM: sql<number>`count(*) filter (where ${orders.vendorId} is not null and ${orders.createdAt} >= ${d30})`,
    gmvM: sql<number>`coalesce(sum(${orders.totalEur}) filter (where ${orders.vendorId} is not null and ${orders.status} in ('confirmee','livree','livree_partiel') and ${orders.createdAt} >= ${d30}),0)`, gmvAll: sql<number>`coalesce(sum(${orders.totalEur}) filter (where ${orders.vendorId} is not null and ${orders.status} in ('confirmee','livree','livree_partiel')),0)`,
    pending: sql<number>`count(*) filter (where ${orders.vendorId} is not null and ${orders.status} = 'envoyee')`, refused: sql<number>`count(*) filter (where ${orders.vendorId} is not null and ${orders.status} = 'annulee')`,
    avgDecisionH: sql<number>`coalesce(avg(extract(epoch from (${orders.vendorDecisionAt} - ${orders.sentAt}))/3600) filter (where ${orders.vendorDecisionAt} is not null), 0)` }).from(orders);
  const weekly = await db.select({ week: sql<string>`to_char(date_trunc('week', ${orders.createdAt}), 'YYYY-MM-DD')`, all: sql<number>`count(*)`, mkt: sql<number>`count(*) filter (where ${orders.vendorId} is not null)`, gmv: sql<number>`coalesce(sum(${orders.totalEur}) filter (where ${orders.vendorId} is not null and ${orders.status} <> 'annulee'),0)` }).from(orders).where(gte(orders.createdAt, sql`date_trunc('week', now()) - interval '11 weeks'`)).groupBy(sql`1`).orderBy(sql`1`);
  const signups = await db.select({ week: sql<string>`to_char(date_trunc('week', ${restaurants.createdAt}), 'YYYY-MM-DD')`, c: sql<number>`count(*)` }).from(restaurants).where(gte(restaurants.createdAt, sql`date_trunc('week', now()) - interval '11 weeks'`)).groupBy(sql`1`).orderBy(sql`1`);
  const [com] = await db.select({ month: sql<number>`coalesce(sum(${commissions.amountEur}) filter (where ${commissions.period} = to_char(now(),'YYYY-MM')),0)`, all: sql<number>`coalesce(sum(${commissions.amountEur}),0)`, uninvoiced: sql<number>`coalesce(sum(${commissions.amountEur}) filter (where not ${commissions.invoiced}),0)` }).from(commissions);
  const prospectsAgg = await db.select({ kind: prospects.kind, status: prospects.status, c: sql<number>`count(*)` }).from(prospects).groupBy(prospects.kind, prospects.status);
  const [ld] = await db.select({ total: sql<number>`count(*)`, m: sql<number>`count(*) filter (where ${leads.createdAt} >= ${d30})`, vitrine: sql<number>`count(*) filter (where ${leads.source} = 'vitrine')`, referentiel: sql<number>`count(*) filter (where ${leads.source} = 'referentiel' and ${leads.status} = 'nouveau')` }).from(leads);
  const demandTop = await db.select({ name: products.name, restaurants: sql<number>`count(distinct ${inventoryItems.restaurantId})`, covered: sql<boolean>`exists (select 1 from vendor_offers o where o.product_id = ${products.id} and o.in_stock)` }).from(inventoryItems).innerJoin(products, eq(products.id, inventoryItems.productId)).where(isNull(products.restaurantId)).groupBy(products.id, products.name).orderBy(sql`count(distinct ${inventoryItems.restaurantId}) desc`).limit(15);
  const topVendors = await db.select({ name: vendors.name, city: vendors.city, status: vendors.status, offers: sql<number>`(select count(*) from vendor_offers o where o.vendor_id = ${vendors.id})`, orders: sql<number>`(select count(*) from orders x where x.vendor_id = ${vendors.id})`, gmv: sql<number>`(select coalesce(sum(total_eur),0) from orders x where x.vendor_id = ${vendors.id} and x.status <> 'annulee')`, linked: sql<number>`(select count(*) from suppliers s where s.vendor_id = ${vendors.id})` }).from(vendors).orderBy(desc(vendors.createdAt)).limit(10);
  const topRestaurants = await db.select({ name: restaurants.name, city: restaurants.city, plan: restaurants.plan, createdAt: restaurants.createdAt, orders: sql<number>`(select count(*) from orders x where x.restaurant_id = ${restaurants.id})`, items: sql<number>`(select count(*) from inventory_items i where i.restaurant_id = ${restaurants.id})`, suppliers: sql<number>`(select count(*) from suppliers s where s.restaurant_id = ${restaurants.id})`, lastOrder: sql<string | null>`(select max(created_at) from orders x where x.restaurant_id = ${restaurants.id})` }).from(restaurants).orderBy(desc(restaurants.createdAt)).limit(15);
  const recent = await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(30);
  const recentOrders = await db.select({ id: orders.id, reference: orders.reference, status: orders.status, total: orders.totalEur, createdAt: orders.createdAt, restaurant: restaurants.name, vendor: vendors.name }).from(orders).innerJoin(restaurants, eq(restaurants.id, orders.restaurantId)).leftJoin(vendors, eq(vendors.id, orders.vendorId)).orderBy(desc(orders.createdAt)).limit(12);
  const env = { adminEmails: !!process.env.ADMIN_EMAILS, llm: !!process.env.LLM_API_KEY, stripe: !!process.env.STRIPE_SECRET_KEY, resend: !!process.env.RESEND_API_KEY, appUrl: process.env.APP_URL ?? null, vendorAutoApprove: process.env.VENDOR_AUTO_APPROVE === 'true' };
  const num = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, val]) => [k, typeof val === 'string' && /^-?\d+(\.\d+)?$/.test(val) ? Number(val) : val]));
  return c.json({
    users: num(u), restaurants: { ...num(r), active30: n(activeR[0]?.c) }, vendors: num(v), offers: num(vo), products: { ...num(pr), tracked: n(tracked.c) }, orders: num(o), commissions: num(com), leads: num(ld),
    weekly: weekly.map(num), signups: signups.map(num), prospects: prospectsAgg.map(num), demandTop: demandTop.map(num), topVendors: topVendors.map(num), topRestaurants: topRestaurants.map(num), recent, recentOrders: recentOrders.map(num), env,
    todo: [
      ...(n(v.attente) ? [{ level: 'action', text: `${n(v.attente)} grossiste(s) en attente de validation`, to: '/app/admin/fournisseurs' }] : []),
      ...(n(ld.referentiel) ? [{ level: 'action', text: `${n(ld.referentiel)} demande(s) de produit manquant`, to: '/app/admin/referentiel' }] : []),
      ...(n(o.pending) ? [{ level: 'watch', text: `${n(o.pending)} commande(s) marketplace en attente de confirmation grossiste`, to: '/app/admin/fournisseurs' }] : []),
      ...(!n(v.actif) ? [{ level: 'critical', text: 'Aucun grossiste actif : la vitrine affiche « Prix sur demande » partout. Invitez vos 3 premiers grossistes.', to: '/app/admin/prospection' }] : []),
      ...(!env.llm ? [{ level: 'info', text: 'LLM_API_KEY absente : import de tarif par photo et assistant IA désactivés.', to: null }] : []),
      ...(!env.stripe ? [{ level: 'info', text: 'Stripe non configuré : abonnements et facturation des commissions inactifs.', to: null }] : []),
    ],
  });
});
