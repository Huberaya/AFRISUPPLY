// Job quotidien « matin » : alertes → auto-reorder → e-mail digest, pour chaque restaurant.
// Déclenché par POST /api/jobs/daily (header X-Cron-Secret) — depuis GitHub Actions / Vercel cron / crontab.
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { getDb, restaurants, alerts, orders, suppliers, deliveries, deliveryDiscrepancies, orderLines, sales, jobRuns } from '@afrisupply/db';
import { captureException } from '../lib/ops.js';
import { refreshAlerts } from '../routes/restaurant.js';
import { loadContext, runAutoReorder } from '../routes/intelligence.js';
import { buildSmartCart } from '../lib/forecast.js';
import { stockStatus } from '../lib/engines.js';
import { buildDigest, type DigestInput } from '../lib/digest.js';
import { sendMail } from '../lib/mailer.js';
import { sweepTrials, billingEnforced } from '../lib/billing.js';
import { invoiceCommissions } from '../routes/billing.js';
import { buildWeeklyPilotReport } from '../routes/pilots.js';
import { remindPendingVendorOrders } from './reminders.js';
import { runRecurringOrders } from '../routes/marketplace.js';
import { recipientsFor as recipientsFrom } from '../lib/recipients.js';
import { notifyCriticalAlerts, pendingImmediateAlerts, markAlertsNotified } from '../lib/notify.js';
import { backupAllRestaurants } from '../lib/backup.js';
import { offsiteConfig, offsiteSweep } from '../lib/offsite.js';
import { recordJobRun, statusFrom } from '../lib/job-runs.js';
import { watchdog } from '../lib/ops-health.js';
import { remindPayments } from '../lib/credit.js';

const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
export const APP_URL = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export interface DailyResult { restaurantId: string; name: string; alerts: number; autoReorder: number; digest: 'sent' | 'skipped_disabled' | 'skipped_closed' | 'skipped_no_recipient' | 'error'; recipients: string[]; transport?: string; error?: string; immediate?: { alerts: number; sent: boolean; status: string }; missingSales?: { created: boolean; gentle?: boolean; gapDays: number | null }; autoReorderError?: string; autoReorderSkipped?: string[] }

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
    // Chantier 9 : la relance « ventes non saisies » en attente est réellement affichée dans le mail du matin
    // (elle est marquée « annoncée » ensuite : jamais annoncée dans le vide).
    salesReminder: (() => { const a = recentAlerts.find((x) => x.kind === 'saisie'); return a ? { title: a.title, message: a.message } : null; })(),
    spend: { thisMonth: n(sp.thisMonth), evolutionPct },
  };
  return { input, ctx };
}

// Chantier 6 : les destinataires sont définis une seule fois (lib/recipients.ts), partagés
// par le mail du matin et par les alertes immédiates.
const recipientsFor = (rid: string, settingsRecipients?: string[]) => recipientsFrom(rid, settingsRecipients);

/** Nombre de jours tolérés sans saisie de ventes avant relance (chantier 6, défaut 3). */
export const SALES_GAP_DAYS = () => Math.max(1, Number(process.env.SALES_GAP_DAYS ?? 3));

/** Clé de semaine ISO (AAAA-Sxx) : une relance « ventes non saisies » au maximum par semaine. */
export function weekKey(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-S${String(w).padStart(2, '0')}`;
}

/**
 * Chantier 6 — relance si les ventes ne sont pas saisies depuis SALES_GAP_DAYS jours.
 * La relance devient une alerte (visible dans la cloche), envoyée par e-mail par lib/notify.ts.
 */
export async function checkMissingSales(rid: string, now = new Date()): Promise<{ created: boolean; gentle: boolean; gapDays: number | null }> {
  const db = await getDb();
  const [last] = await db.select({ day: sales.day }).from(sales).where(eq(sales.restaurantId, rid)).orderBy(desc(sales.day)).limit(1);
  const gapDays = last?.day ? Math.floor((now.getTime() - new Date(`${last.day}T00:00:00Z`).getTime()) / 86_400_000) : null;
  // Chantier 9 (audit 2) : rappel doux à J+1/J+2 (une fois par jour, sans e-mail — la relance ferme
  // des 3 jours garde son envoi immédiat). Les deux fenêtres ne se recouvrent jamais : pas de doublon.
  const gentleKey = `ventes_non_saisies:j${now.toISOString().slice(0, 10)}`;
  let gentle = false;
  if (gapDays !== null && gapDays >= 2 && gapDays < SALES_GAP_DAYS()) {
    const res = await db.insert(alerts).values({
      restaurantId: rid, dedupeKey: gentleKey, kind: 'saisie', severity: 'blue',
      title: '📝 Pensez à saisir vos ventes',
      message: `Dernière saisie : ${last?.day}. Sans vos ventes, la prévision se rabat sur vos couverts et vos seuils. 30 secondes suffisent pour la remettre au juste.`,
      actionUrl: '/app/ventes', payload: { gapDays, lastDay: last?.day ?? null, reminder: 'sales', gentle: true },
    }).onConflictDoNothing().returning({ id: alerts.id });
    gentle = res.length > 0;
  }
  if (last && gapDays !== null && gapDays < SALES_GAP_DAYS()) return { created: false, gentle, gapDays };
  const key = `ventes_non_saisies:${weekKey(now)}`;
  const res = await db.insert(alerts).values({
    restaurantId: rid, dedupeKey: key, kind: 'saisie', severity: 'orange',
    title: last ? `📝 Ventes non saisies depuis ${gapDays} jours` : '📝 Aucune vente saisie pour l’instant',
    message: last
      ? `Sans vos ventes, la prévision se dégrade : elle se base alors sur vos couverts et vos seuils. 30 secondes suffisent pour la remettre à jour.`
      : `Enregistrez vos ventes du jour (portions vendues) : la prévision, le panier intelligent et les alertes de rupture s’appuient dessus.`,
    actionUrl: '/app/ventes', payload: { gapDays, lastDay: last?.day ?? null, reminder: 'sales' },
  }).onConflictDoNothing().returning({ id: alerts.id });
  return { created: res.length > 0, gentle, gapDays };
}

/** Le mail du matin ne part pas : on envoie tout de suite les alertes urgentes en attente (pas de silence). */
async function notifyInsteadOfDigest(base: DailyResult, rid: string, opts: { dryRun?: boolean; now?: Date }): Promise<DailyResult> {
  if (opts.dryRun) return base;
  try {
    const res = await notifyCriticalAlerts(rid, { now: opts.now });
    return { ...base, immediate: { alerts: res.alerts, sent: res.sent, status: res.status } };
  } catch (e) { return { ...base, error: (e as Error).message }; }
}

/** Exécute le job pour un restaurant. `dryRun` = calculer sans envoyer ni créer de commandes ; `force` = ignorer désactivation / jour fermé. */
export async function runDailyForRestaurant(rid: string, opts: { dryRun?: boolean; now?: Date; force?: boolean } = {}): Promise<DailyResult & { preview?: ReturnType<typeof buildDigest> }> {
  const db = await getDb(); const now = opts.now ?? new Date();
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, rid));
  const base: DailyResult = { restaurantId: rid, name: r.name, alerts: 0, autoReorder: 0, digest: 'skipped_disabled', recipients: [] };
  try {
    const { inserted } = await refreshAlerts(rid); base.alerts = inserted;
    // Chantier 6 : relance si les ventes ne sont pas saisies depuis 3 jours (une alerte par semaine civile).
    if (!opts.dryRun) { const miss = await checkMissingSales(rid, now); base.missingSales = miss; }
    let prepared: DigestInput['autoReorder'] = [];
    if ((r.settings?.autoReorderEnabled ?? true) && !opts.dryRun) {
      // Chantier 6 (audit) : l'auto-reorder est une aide, pas une condition. S'il échoue, le mail du matin
      // part quand même (c'est lui qui prévient de la rupture) — l'incident est tracé et remonté.
      try {
        const res = await runAutoReorder(rid, null);
        prepared = res.prepared.map((p) => ({ productName: p.productName, supplierName: p.supplierName, total: p.total, reference: p.reference })); base.autoReorder = prepared.length;
        base.autoReorderSkipped = res.skipped.slice(0, 5);
      } catch (e) {
        base.autoReorderError = (e as Error).message.split('\n')[0].slice(0, 200);
        await captureException(e as Error, { route: '/api/jobs/daily#auto-reorder', restaurantId: rid });
      }
    }
    if (!opts.force && r.settings?.dailyDigestEnabled === false) return await notifyInsteadOfDigest(base, rid, opts);
    if (!opts.force && r.settings?.closedWeekdays?.includes(now.getDay())) return await notifyInsteadOfDigest({ ...base, digest: 'skipped_closed' }, rid, opts);
    const recipients = await recipientsFor(rid, r.settings?.digestRecipients);
    if (!recipients.length) return await notifyInsteadOfDigest({ ...base, digest: 'skipped_no_recipient' }, rid, opts);
    const { input } = await buildDigestForRestaurant(rid, { autoReorderPrepared: prepared, now });
    // Chantier 6 : les alertes urgentes en attente seront couvertes par le mail du matin — on évite le doublon.
    const pending = opts.dryRun ? [] : await pendingImmediateAlerts(rid);
    let preview: ReturnType<typeof buildDigest> | undefined; let transport = '';
    for (const rcpt of recipients) {
      const digest = buildDigest({ ...input, firstName: rcpt.firstName }); preview ??= digest;
      if (opts.dryRun) continue;
      const res = await sendMail({ to: rcpt.email, subject: digest.subject, text: digest.text, html: digest.html, tags: { type: 'daily_digest', restaurant: rid } });
      transport = res.transport; if (!res.ok) throw new Error(res.error);
    }
    if (pending.length) await markAlertsNotified(pending.map((a) => a.id), now);
    return { ...base, digest: 'sent', recipients: recipients.map((x) => x.email), transport: opts.dryRun ? 'dry-run' : transport, preview };
  } catch (e) { return { ...base, digest: 'error', error: (e as Error).message }; }
}

export async function runDailyForAll(opts: { dryRun?: boolean; now?: Date } = {}) {
  const db = await getDb();
  const all = await db.select({ id: restaurants.id }).from(restaurants);
  const results: DailyResult[] = []; const startedAt = new Date();
  for (const r of all) { const { preview: _p, ...res } = await runDailyForRestaurant(r.id, opts); void _p; results.push(res); }
  const errors = results.filter((r) => r.digest === 'error');
  const summary = { ranAt: (opts.now ?? new Date()).toISOString(), dryRun: !!opts.dryRun, count: results.length, sent: results.filter((r) => r.digest === 'sent').length, errors: errors.length, results };
  // Chantier 6 : essais expirés + relances J-7/J-3/J-1 ; factures de commission le 1er du mois pour le mois précédent.
  let billing: Record<string, unknown> = {};
  try {
    const now = opts.now ?? new Date();
    const sw = await sweepTrials(now);
    if (!opts.dryRun) for (const r of sw.reminders) {
      const recips = await recipientsFor(r.id);
      for (const { email: to } of recips) await sendMail({ to, subject: r.daysLeft === 1 ? `Dernier jour d'essai AFRISUPPLY pour ${r.name}` : `Plus que ${r.daysLeft} jours d'essai AFRISUPPLY`, text: `Bonjour,\n\nVotre essai gratuit AFRISUPPLY pour ${r.name} se termine dans ${r.daysLeft} jour(s). Pour garder votre stock, vos fournisseurs et vos alertes, choisissez une formule ici : ${APP_URL()}/app/abonnement\n\nBesoin d'aide ? Répondez simplement à cet e-mail.\n\nL'équipe AFRISUPPLY`, html: `<p>Bonjour,</p><p>Votre essai gratuit AFRISUPPLY pour <b>${r.name}</b> se termine dans <b>${r.daysLeft} jour(s)</b>.</p><p>Pour garder votre stock, vos fournisseurs et vos alertes : <a href="${APP_URL()}/app/abonnement">choisir ma formule</a>.</p><p>Besoin d'aide ? Répondez simplement à cet e-mail.</p><p>L'équipe AFRISUPPLY</p>`, tags: { type: 'trial-reminder' } });
    }
    billing = { trialsExpired: sw.expired.length, reminders: sw.reminders.length, enforced: billingEnforced() };
    if (now.getUTCDate() === 1) { const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)); const inv = await invoiceCommissions(prev.toISOString().slice(0, 7), { dryRun: opts.dryRun }); billing.commissionInvoices = inv.invoices.length; }
  } catch (e) { billing = { error: String(e) }; void captureException(e as Error, { route: '/api/jobs/daily#billing' }); }
  (summary as Record<string, unknown>).billing = billing;
  // Chantier 7 : rapport pilotes chaque lundi aux admins
  try {
    const now = opts.now ?? new Date(); const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (now.getUTCDay() === 1 && admins.length && !opts.dryRun) { const rep = await buildWeeklyPilotReport(now); for (const to of admins) await sendMail({ to, subject: `📊 Pilotes AFRISUPPLY — ${rep.pilots} restaurants, semaine du ${now.toLocaleDateString('fr-FR')}`, text: rep.text, html: rep.html, tags: { type: 'pilot-report' } }); (summary as Record<string, unknown>).pilotReport = rep.pilots; }
  } catch (e) { void captureException(e as Error, { route: '/api/jobs/daily#pilots' }); }
  for (const e of errors) void captureException(new Error(`daily digest failed: ${e.error}`), { route: '/api/jobs/daily', restaurantId: e.restaurantId });
  try { if (!opts.dryRun) (summary as Record<string, unknown>).recurring = (await runRecurringOrders(opts.now)).results.length; } catch (e) { await captureException(e, { route: 'jobs/recurring' }); }
  try { (summary as Record<string, unknown>).reminders = opts.dryRun ? 'skipped' : (await remindPendingVendorOrders({ now: opts.now })).reminded; } catch (e) { await captureException(e, { route: 'jobs/reminders' }); }
  // Chantier 29 (leur apport) : rappel des encours/retards de paiement — résultat consigné dans le
  // résumé de la passe, donc visible dans la supervision (job_runs) et non seulement dans les journaux.
  try { if (!opts.dryRun) (summary as Record<string, unknown>).payments = (await remindPayments(opts.now)).reminded; } catch (e) { await captureException(e, { route: 'jobs/payments' }); }
  // Chantier 12 : sauvegarde quotidienne de chaque restaurant (fichier vérifiable + rotation).
  // Une sauvegarde n'est utile que si elle existe vraiment : on l'écrit, on note sa taille, et
  // l'échec d'écriture est signalé (jamais avalé).
  try {
    if (!opts.dryRun) {
      const b = await backupAllRestaurants();
      (summary as Record<string, unknown>).backup = { written: b.written.length, errors: b.errors.length, removed: b.removed.length, keep: b.keep, dir: b.dir, files: b.written.map((w) => ({ name: w.name, rows: w.rows, sizeBytes: w.sizeBytes })) };
      if (b.errors.length) void captureException(new Error(`Backup échouée : ${b.errors.map((e) => e.error).join(' | ')}`), { route: 'jobs/backup' });
      // Trace supervisée : sans passage enregistré, /status et le watchdog ne peuvent pas savoir
      // que les sauvegardes ont réellement lieu (et un disque plein resterait invisible).
      await recordJobRun({
        job: 'backup', startedAt, status: statusFrom(b.written.length, b.errors.length),
        summary: { count: b.written.length, keep: b.keep, dir: b.dir, removed: b.removed.length, bytes: b.written.reduce((a, w) => a + w.sizeBytes, 0) },
        error: b.errors.length ? b.errors.map((e) => e.error).join(' | ') : null,
      });
      // Chantier 13 (audit n°3) : la COPIE HORS SITE. Une sauvegarde qui vit sur le même disque que
      // la base qu'elle protège ne protège de rien — en serverless, ce disque disparaît avec
      // l'instance. Chaque fichier est envoyé, puis RELU et comparé (SHA-256) : une copie qui ne se
      // relit pas n'est pas une sauvegarde. Sans configuration, c'est dit tel quel : jamais de
      // succès simulé, et la sauvegarde locale reste valable.
      const horsSite = await offsiteSweep();
      const hs = (summary as Record<string, unknown>).offsite = {
        configured: horsSite.configured, uploaded: horsSite.uploaded.length, failed: horsSite.failed.length,
        removed: horsSite.removed.length, objects: horsSite.objects, bytes: horsSite.bytes,
        endpoint: horsSite.endpoint, bucket: horsSite.bucket, error: horsSite.error ?? null,
      } as Record<string, unknown>;
      if (!horsSite.configured) hs.pourquoi = offsiteConfig().why;
      await recordJobRun({
        job: 'offsite-backup', startedAt,
        status: horsSite.configured ? statusFrom(horsSite.uploaded.length, horsSite.failed.length) : 'partial',
        summary: { uploaded: horsSite.uploaded.length, failed: horsSite.failed.length, removed: horsSite.removed.length, objects: horsSite.objects, bytes: horsSite.bytes, endpoint: horsSite.endpoint },
        error: horsSite.configured ? (horsSite.error ?? null) : 'sauvegarde hors site non configurée',
      });
    } else (summary as Record<string, unknown>).backup = 'skipped';
  } catch (e) { (summary as Record<string, unknown>).backup = { error: (e as Error).message }; void captureException(e as Error, { route: 'jobs/backup' }); }
  // Chantier 12 : surveillance croisée — un cron quotidien ne peut pas signaler sa propre absence,
  // la passe horaire le fait (et inversement).
  try { (summary as Record<string, unknown>).watchdog = await watchdog({ self: 'daily', now: opts.now }); }
  catch (e) { void captureException(e as Error, { route: 'jobs/watchdog' }); }
  // La ligne de supervision est écrite EN DERNIER : elle décrit la passe complète (digest, essais,
  // relances, sauvegarde, surveillance), pas seulement son début. Sinon un job « ok » cacherait
  // une sauvegarde ratée.
  const finishedAt = new Date();
  if (!opts.dryRun) {
    try { await db.insert(jobRuns).values({ job: 'daily', status: errors.length === 0 ? 'ok' : errors.length === results.length ? 'error' : 'partial', startedAt, finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime(), summary: { ...summary, results: results.map((r) => ({ name: r.name, digest: r.digest, alerts: r.alerts, autoReorder: r.autoReorder, error: r.error })) }, error: errors.map((e) => `${e.name}: ${e.error}`).join(' | ') || null }); } catch (e) { console.error('[jobs] job_runs', e); }
  }
  return summary;
}
