// Job quotidien « matin » : alertes → auto-reorder → e-mail digest, pour chaque restaurant.
// Déclenché par POST /api/jobs/daily (header X-Cron-Secret) — depuis GitHub Actions / Vercel cron / crontab.
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { getDb, restaurants, restaurantMembers, users, alerts, orders, suppliers, deliveries, deliveryDiscrepancies, orderLines, sales } from '@afrisupply/db';
import { refreshAlerts } from '../routes/restaurant.js';
import { loadContext, runAutoReorder } from '../routes/intelligence.js';
import { buildSmartCart } from '../lib/forecast.js';
import { stockStatus } from '../lib/engines.js';
import { buildDigest, type DigestInput } from '../lib/digest.js';
import { sendMail } from '../lib/mailer.js';

const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
export const APP_URL = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export interface DailyResult { restaurantId: string; name: string; alerts: number; autoReorder: number; digest: 'sent' | 'skipped_disabled' | 'skipped_closed' | 'skipped_no_recipient' | 'error'; recipients: string[]; transport?: string; error?: string }

/** Construit le contenu du digest d'un restaurant (sans l'envoyer). */
export async function buildDigestForRestaurant(rid: string, opts: { autoReorderPrepared?: DigestInput['autoReorder']; now?: Date } = {}) {
  const db = await getDb(); const now = opts.now ?? new Date();
  const ctx = await loadContext(rid);
  const statusOf = new Map(ctx.stocks.map((s) => { const f = ctx.productForecasts.find((x) => x.productId === s.productId); return [s.productId, stockStatus({ ...s, avgDailyUse: f?.avgDailyNeed ?? 0 })]; }));
  const urgent = ctx.productForecasts
    .filter((f) => f.recommendedOrder > 0 && (f.stockoutDay !== null || (f.daysOfStockLeft !== null && f.daysOfStockLeft <= 3) || statusOf.get(f.productId) === 'critique'))
    .sort((a, b) => (a.daysOfStockLeft ?? 99) - (b.daysOfStockLeft ?? 99))
    .map((f) => ({ productName: f.productName, unit: f.unit, quantity: f.currentStock, daysLeft: f.daysOfStockLeft, stockoutDay: f.stockoutDay, recommendedOrder: f.recommendedOrder }));
  const needs = ctx.productForecasts.filter((f) => f.recommendedOrder > 0).map((f) => { const s = ctx.stocks.find((x) => x.productId === f.productId)!; return { productId: f.productId, productName: f.productName, unit: f.unit, neededQty: f.recommendedOrder, daysOfStockLeft: f.daysOfStockLeft, preferredSupplierId: s.preferredSupplierId }; });
  const cart = needs.length ? buildSmartCart(needs, ctx.offers) : null;
  const since = new Date(now.getTime() - 36 * 3_600_000);
  const recentAlerts = await db.select().from(alerts).where(and(eq(alerts.restaurantId, rid), eq(alerts.isRead, false), gte(alerts.createdAt, since))).orderBy(desc(alerts.createdAt)).limit(50);
  const [disc] = await db.select({ count: sql<number>`count(*)`, value: sql<number>`coalesce(sum(greatest(${deliveryDiscrepancies.orderedQty} - ${deliveryDiscrepancies.receivedQty}, 0) * ${orderLines.unitPriceEur}), 0)` })
    .from(deliveryDiscrepancies).innerJoin(deliveries, eq(deliveries.id, deliveryDiscrepancies.deliveryId)).innerJoin(orderLines, eq(orderLines.id, deliveryDiscrepancies.orderLineId))
    .where(and(eq(deliveries.restaurantId, rid), eq(deliveryDiscrepancies.resolved, false)));
  const pending = await db.select({ reference: orders.reference, supplierName: suppliers.name, status: orders.status, expectedAt: orders.expectedAt }).from(orders).innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .where(and(eq(orders.restaurantId, rid), inArray(orders.status, ['envoyee', 'confirmee']))).orderBy(orders.expectedAt).limit(10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const [ys] = await db.select({ p: sql<number>`coalesce(sum(${sales.portions}), 0)`, c: sql<number>`count(*)` }).from(sales).where(and(eq(sales.restaurantId, rid), eq(sales.day, yesterday)));
  const startMonth = new Date(now); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
  const d30 = new Date(now.getTime() - 30 * 86_400_000).toISOString(), d60 = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  const [sp] = await db.select({
    thisMonth: sql<number>`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${startMonth.toISOString()}),0)`,
    last30: sql<number>`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${d30}),0)`,
    prev30: sql<number>`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${d60} and ${orders.createdAt} < ${d30}),0)`,
  }).from(orders).where(and(eq(orders.restaurantId, rid), sql`${orders.status} <> 'annulee'`));
  const evolutionPct = n(sp.prev30) > 0 ? Math.round(((n(sp.last30) - n(sp.prev30)) / n(sp.prev30)) * 1000) / 10 : null;
  const statuses = [...statusOf.values()];

  const input: DigestInput = {
    restaurantName: ctx.restaurant.name, firstName: 'chef', date: now, appUrl: APP_URL(),
    stock: { critique: statuses.filter((s) => s === 'critique').length, bas: statuses.filter((s) => s === 'bas').length, ok: statuses.filter((s) => s === 'ok').length, urgent },
    cart: cart ? { total: cart.total, saving: cart.saving, supplierCount: cart.suppliers.length, lineCount: cart.suppliers.reduce((a, s) => a + s.lines.length, 0) } : null,
    autoReorder: opts.autoReorderPrepared ?? [],
    priceAlerts: recentAlerts.filter((a) => a.kind === 'hausse_prix').map((a) => ({ title: a.title, message: a.message })),
    opportunities: recentAlerts.filter((a) => a.kind === 'opportunite').map((a) => ({ title: a.title, message: a.message })),
    discrepancies: { count: n(disc.count), openValue: Math.round(n(disc.value) * 100) / 100 },
    pendingOrders: pending,
    salesYesterday: n(ys.c) > 0 ? n(ys.p) : null,
    spend: { thisMonth: n(sp.thisMonth), evolutionPct },
  };
  return { input, ctx };
}

async function recipientsFor(rid: string, settingsRecipients?: string[]) {
  if (settingsRecipients?.length) return settingsRecipients.map((e) => ({ email: e, firstName: 'chef' }));
  const db = await getDb();
  const rows = await db.select({ email: users.email, fullName: users.fullName, role: restaurantMembers.role }).from(restaurantMembers).innerJoin(users, eq(users.id, restaurantMembers.userId)).where(eq(restaurantMembers.restaurantId, rid));
  return rows.filter((r) => r.role !== 'staff').map((r) => ({ email: r.email, firstName: r.fullName.split(' ')[0] || 'chef' }));
}

/** Exécute le job pour un restaurant. `dryRun` = calculer sans envoyer ni créer de commandes ; `force` = ignorer désactivation / jour fermé. */
export async function runDailyForRestaurant(rid: string, opts: { dryRun?: boolean; now?: Date; force?: boolean } = {}): Promise<DailyResult & { preview?: ReturnType<typeof buildDigest> }> {
  const db = await getDb(); const now = opts.now ?? new Date();
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, rid));
  const base: DailyResult = { restaurantId: rid, name: r.name, alerts: 0, autoReorder: 0, digest: 'skipped_disabled', recipients: [] };
  try {
    const { inserted } = await refreshAlerts(rid); base.alerts = inserted;
    let prepared: DigestInput['autoReorder'] = [];
    if ((r.settings?.autoReorderEnabled ?? true) && !opts.dryRun) {
      const res = await runAutoReorder(rid, null);
      prepared = res.prepared.map((p) => ({ productName: p.productName, supplierName: p.supplierName, total: p.total, reference: p.reference })); base.autoReorder = prepared.length;
    }
    if (!opts.force && r.settings?.dailyDigestEnabled === false) return base;
    if (!opts.force && r.settings?.closedWeekdays?.includes(now.getDay())) return { ...base, digest: 'skipped_closed' };
    const recipients = await recipientsFor(rid, r.settings?.digestRecipients);
    if (!recipients.length) return { ...base, digest: 'skipped_no_recipient' };
    const { input } = await buildDigestForRestaurant(rid, { autoReorderPrepared: prepared, now });
    let preview: ReturnType<typeof buildDigest> | undefined; let transport = '';
    for (const rcpt of recipients) {
      const digest = buildDigest({ ...input, firstName: rcpt.firstName }); preview ??= digest;
      if (opts.dryRun) continue;
      const res = await sendMail({ to: rcpt.email, subject: digest.subject, text: digest.text, html: digest.html, tags: { type: 'daily_digest', restaurant: rid } });
      transport = res.transport; if (!res.ok) throw new Error(res.error);
    }
    return { ...base, digest: 'sent', recipients: recipients.map((x) => x.email), transport: opts.dryRun ? 'dry-run' : transport, preview };
  } catch (e) { return { ...base, digest: 'error', error: (e as Error).message }; }
}

export async function runDailyForAll(opts: { dryRun?: boolean; now?: Date } = {}) {
  const db = await getDb();
  const all = await db.select({ id: restaurants.id }).from(restaurants);
  const results: DailyResult[] = [];
  for (const r of all) { const { preview: _p, ...res } = await runDailyForRestaurant(r.id, opts); void _p; results.push(res); }
  return { ranAt: (opts.now ?? new Date()).toISOString(), count: results.length, sent: results.filter((r) => r.digest === 'sent').length, results };
}
