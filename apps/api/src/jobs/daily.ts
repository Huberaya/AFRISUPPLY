// Job quotidien « matin » : alertes → auto-reorder → e-mail digest, pour chaque restaurant.
// Déclenché par POST /api/jobs/daily (header X-Cron-Secret) — depuis GitHub Actions / Vercel cron / crontab.
import { randomUUID } from 'node:crypto';
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
import { backupAllRestaurants, backupDir, retentionDays } from '../lib/backup.js';
import { offsiteConfig, offsiteSweep, pruneOffsite, listObjects } from '../lib/offsite.js';
import { recordJobRun, statusFrom } from '../lib/job-runs.js';
import { watchdog } from '../lib/ops-health.js';
import { remindPayments } from '../lib/credit.js';
import { h } from '../lib/html.js';

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
      transport = res.transport; if (!res.ok) throw new Error(`[${res.code}] ${res.error}`);
    }
    if (pending.length) await markAlertsNotified(pending.map((a) => a.id), now);
    return { ...base, digest: 'sent', recipients: recipients.map((x) => x.email), transport: opts.dryRun ? 'dry-run' : transport, preview };
  } catch (e) { return { ...base, digest: 'error', error: (e as Error).message }; }
}

// =============================================================================================
// Chantier P0.4 — UNE PASSE QUI TIENT DANS LE TEMPS D'UNE FONCTION, QUI SE REPREND, ET NE SE DOUBLE PAS
// =============================================================================================
//
// Constat de production (2026-11-12) : plus aucune passe complète enregistrée depuis le 2026-09-23.
// La passe traitait TOUS les restaurants, puis toutes les étapes globales (essais, relances,
// sauvegardes…), dans UNE seule invocation et sans regarder l'heure. Une fonction serverless est
// coupée à sa durée maximale (60 s ici, voir vercel.json) : au-delà, tout ce qui restait était perdu,
// sans trace et sans reprise. Mesure : environ 80 requêtes SQL par restaurant, plus 35 pour sa
// sauvegarde — la durée de la passe croît donc avec le nombre de restaurants et la latence de la base.
//
// Règles appliquées ici :
//   1. UNE passe par jour (clé : date UTC). Un second déclenchement le même jour ne refait rien : un
//      planificateur peut livrer deux fois le même événement, et deux déclencheurs existent (cron de la
//      plateforme, workflow de secours). `force` démarre volontairement une nouvelle passe.
//   2. Chaque invocation travaille pendant un BUDGET de temps, puis rend la main proprement : la passe
//      est « à reprendre », et l'invocation suivante continue là où la précédente s'est arrêtée.
//   3. Le journal de la passe vit dans sa ligne `job_runs` (aucune table nouvelle) : restaurants traités,
//      étapes faites, unité en cours. Il est écrit AVANT et APRÈS chaque unité de travail.
//   4. Un seul ouvrier à la fois : la prise de la passe est sérialisée (verrou consultatif le temps
//      d'une transaction), l'ouvrier tient un bail qu'il renouvelle à chaque écriture, et un jeton
//      l'arrête à sa prochaine écriture s'il a été dessaisi.
//   5. Une unité (restaurant, sauvegarde ou étape) qui fait tomber la passe deux fois est écartée et
//      signalée : elle ne prive pas les autres restaurants de leur mail du matin.
//
// Garantie d'envoi : « au moins une fois ». Si une invocation est coupée APRÈS l'envoi du mail d'un
// restaurant mais AVANT l'écriture du journal, ce restaurant (et lui seul) sera retraité à la reprise.
// Un mail en double ce jour-là est préféré à une alerte de rupture jamais envoyée.

const positif = (v: string | undefined) => { const x = Number(v); return v !== undefined && v.trim() !== '' && Number.isFinite(x) && x > 0 ? x : null; };

/** Durée maximale d'une fonction sur la plateforme (vercel.json → functions.maxDuration). Un test vérifie la cohérence. */
export const FUNCTION_MAX_MS = 60_000;
/** Temps de travail accordé à UNE invocation avant de rendre la main. Sans limite hors plateforme serverless. */
export const dailyBudgetMs = () => positif(process.env.DAILY_BUDGET_MS) ?? (process.env.VERCEL ? 35_000 : Number.POSITIVE_INFINITY);
/** Durée du bail : tant qu'il court, aucune autre invocation ne travaille sur la passe. Toujours supérieure à la durée maximale d'une fonction. */
export const dailyLeaseMs = () => positif(process.env.DAILY_LEASE_MS) ?? (process.env.VERCEL ? FUNCTION_MAX_MS + 15_000 : 600_000);
/** Nombre de coupures tolérées pour une même unité avant de l'écarter. */
export const MAX_COUPURES = 2;
/** Étapes globales, dans l'ordre, après les restaurants. */
export const ETAPES_PASSE = ['billing', 'pilotReport', 'recurring', 'reminders', 'payments', 'backup', 'watchdog'] as const;
const VERROU_PASSE = 4_207_001;

/** Ce que le journal garde d'un restaurant traité (aucune adresse e-mail : le journal est lu par la supervision). */
export interface ResultatJournal { restaurantId: string; name: string; digest: DailyResult['digest']; alerts: number; autoReorder: number; error?: string; ms?: number }
interface SauvegardeJournal { name?: string; rows?: number; sizeBytes?: number; removed?: number; error?: string; envoyes?: number; echecs?: { name: string; error: string }[] }
interface Journal {
  jour: string; enCours: true; etape: string; restaurants: number; traites: number; tranches: number;
  jeton: string | null; bailJusqua: string | null; travailMs: number; enCoursPour: string | null;
  coupures: Record<string, number>; ecartes: string[];
  results: ResultatJournal[]; sauvegardes: Record<string, SauvegardeJournal>;
  etapes: Record<string, unknown>; durees: Record<string, number>;
}

export interface DailySummary {
  ranAt: string; dryRun: boolean; count: number; sent: number; errors: number;
  results: (ResultatJournal & Partial<DailyResult>)[];
  /** Jour (UTC) de la passe : une passe par jour. */
  jour: string;
  /** Faux tant qu'il reste des restaurants ou des étapes : rappeler la route pour continuer. */
  complete: boolean;
  restaurants: number; tranches: number;
  remaining: { restaurants: number; etapes: string[] };
  /** Cette invocation a repris une passe commencée par une autre. */
  resumed: boolean;
  /** Cette invocation a fait avancer la passe (au moins une unité). */
  progressed: boolean;
  /** La passe du jour était déjà achevée : rien n'a été refait. */
  alreadyComplete?: boolean;
  /** Une autre invocation travaille en ce moment sur la passe : rien n'a été fait ici. */
  runningElsewhere?: boolean;
  status?: string;
  [k: string]: unknown;
}

type Prise =
  | { mode: 'nouvelle' | 'reprise'; id: string; startedAt: Date; journal: Journal }
  | { mode: 'deja-faite' | 'occupee'; row: typeof jobRuns.$inferSelect };

const journalNeuf = (jour: string): Journal => ({ jour, enCours: true, etape: 'restaurants', restaurants: 0, traites: 0, tranches: 1, jeton: null, bailJusqua: null, travailMs: 0, enCoursPour: null, coupures: {}, ecartes: [], results: [], sauvegardes: {}, etapes: {}, durees: {} });

/** Prend la passe du jour (ou constate qu'elle est achevée, ou tenue par un autre). Sérialisé : deux déclenchements simultanés ne peuvent pas la prendre tous les deux. */
async function prendreLaPasse(jour: string, jeton: string, force: boolean): Promise<Prise> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${VERROU_PASSE})`);
    const [row] = await tx.select().from(jobRuns).where(and(eq(jobRuns.job, 'daily'), sql`${jobRuns.summary}->>'jour' = ${jour}`)).orderBy(desc(jobRuns.startedAt)).limit(1);
    const j = (row?.summary ?? null) as Partial<Journal> | null;
    const bail = () => new Date(Date.now() + dailyLeaseMs()).toISOString();
    if (row?.status === 'running') {
      // Bail en cours : quelqu'un travaille. Même `force` ne passe pas par-dessus un ouvrier vivant.
      if (j?.bailJusqua && new Date(j.bailJusqua).getTime() > Date.now()) return { mode: 'occupee', row };
      if (!force) {
        // Passe suspendue (budget) ou coupée (bail expiré) : on la reprend. L'unité qui était en cours
        // au moment d'une coupure est notée — deux coupures et elle est écartée.
        const coupures = { ...(j?.coupures ?? {}) };
        if (j?.enCoursPour) coupures[j.enCoursPour] = (coupures[j.enCoursPour] ?? 0) + 1;
        const journal: Journal = { ...journalNeuf(jour), ...j, jour, enCours: true, jeton, bailJusqua: bail(), tranches: (j?.tranches ?? 1) + 1, coupures, enCoursPour: null };
        await tx.update(jobRuns).set({ finishedAt: new Date(), summary: journal as unknown as Record<string, unknown> }).where(eq(jobRuns.id, row.id));
        return { mode: 'reprise', id: row.id, startedAt: new Date(row.startedAt), journal };
      }
    } else if (row && !force) return { mode: 'deja-faite', row };
    const journal: Journal = { ...journalNeuf(jour), jeton, bailJusqua: bail() };
    const startedAt = new Date();
    const [cree] = await tx.insert(jobRuns).values({ job: 'daily', status: 'running', startedAt, finishedAt: startedAt, durationMs: 0, summary: journal as unknown as Record<string, unknown> }).returning({ id: jobRuns.id });
    return { mode: 'nouvelle', id: cree.id, startedAt, journal };
  });
}

/** La passe du jour reste-t-elle à faire ou à finir ? (lecture seule — sert à la reprise par l'autre cron) */
export async function dailyPending(now = new Date()): Promise<'absente' | 'a-reprendre' | 'en-cours' | 'faite'> {
  const db = await getDb(); const jour = now.toISOString().slice(0, 10);
  const [row] = await db.select().from(jobRuns).where(and(eq(jobRuns.job, 'daily'), sql`${jobRuns.summary}->>'jour' = ${jour}`)).orderBy(desc(jobRuns.startedAt)).limit(1);
  if (!row) return 'absente';
  if (row.status !== 'running') return 'faite';
  const bail = (row.summary as Partial<Journal> | null)?.bailJusqua;
  return bail && new Date(bail).getTime() > Date.now() ? 'en-cours' : 'a-reprendre';
}

export async function runDailyForAll(opts: { dryRun?: boolean; now?: Date; force?: boolean; budgetMs?: number } = {}): Promise<DailySummary> {
  const db = await getDb();
  const now = opts.now ?? new Date(); const jour = now.toISOString().slice(0, 10);
  const debut = Date.now(); const budget = opts.budgetMs ?? dailyBudgetMs();
  let progres = false; let dessaisie = false;
  // La première unité d'une invocation est toujours faite : chaque tranche fait avancer la passe, même avec un budget minuscule.
  const horsBudget = () => progres && Date.now() - debut >= budget;
  const jeton = randomUUID();

  // ---- prise de la passe (aucune trace pour une simulation)
  const prise: Prise = opts.dryRun ? { mode: 'nouvelle', id: '', startedAt: new Date(), journal: { ...journalNeuf(jour), jeton } } : await prendreLaPasse(jour, jeton, !!opts.force);
  if (!('journal' in prise)) {
    const s = (prise.row.summary ?? {}) as Record<string, unknown> & Partial<Journal>;
    const faits = (s.results ?? []) as ResultatJournal[];
    const occupee = prise.mode === 'occupee';
    return {
      ...(occupee ? {} : s),
      ranAt: String(s.ranAt ?? new Date(prise.row.startedAt).toISOString()), dryRun: false,
      count: faits.length, sent: faits.filter((r) => r.digest === 'sent').length, errors: faits.filter((r) => r.digest === 'error').length, results: faits,
      jour, complete: !occupee, restaurants: Number(s.restaurants ?? faits.length), tranches: Number(s.tranches ?? 1),
      remaining: occupee ? { restaurants: Math.max(0, Number(s.restaurants ?? 0) - faits.length), etapes: ETAPES_PASSE.filter((e) => !(e in (s.etapes ?? {}))) } : { restaurants: 0, etapes: [] },
      resumed: false, progressed: false, status: prise.row.status,
      ...(occupee ? { runningElsewhere: true } : { alreadyComplete: true }),
    };
  }

  const j = prise.journal; const travailAvant = j.travailMs ?? 0;
  const startedAt = prise.startedAt;
  const all = await db.select({ id: restaurants.id, name: restaurants.name }).from(restaurants);
  j.restaurants = all.length;
  const complets = new Map<string, DailyResult>();     // résultats détaillés des restaurants traités par CETTE invocation

  /**
   * Écrit le journal et renouvelle le bail (ou le relâche : suspension, clôture). Faux si la passe nous
   * a été retirée — jeton remplacé par une autre invocation : on s'arrête sans rien écrire de plus.
   */
  const sauver = async (o: { final?: { status: string; summary: Record<string, unknown>; error: string | null }; relacher?: boolean } = {}) => {
    j.travailMs = travailAvant + (Date.now() - debut);
    if (opts.dryRun) return true;
    j.bailJusqua = o.final || o.relacher ? null : new Date(Date.now() + dailyLeaseMs()).toISOString();
    const lignes = await db.update(jobRuns)
      .set({ finishedAt: new Date(), durationMs: j.travailMs, ...(o.final ?? { summary: j as unknown as Record<string, unknown> }) })
      .where(and(eq(jobRuns.id, prise.id), sql`${jobRuns.summary}->>'jeton' = ${jeton}`)).returning({ id: jobRuns.id });
    if (!lignes.length) dessaisie = true;
    return lignes.length > 0;
  };

  /** Résumé rendu à l'appelant (mêmes clés qu'avant pour une passe achevée, plus l'état de la passe). */
  const resume = (complete: boolean): DailySummary => {
    const errors = j.results.filter((r) => r.digest === 'error');
    const s: DailySummary = {
      ranAt: now.toISOString(), dryRun: !!opts.dryRun, count: j.results.length, sent: j.results.filter((r) => r.digest === 'sent').length, errors: errors.length,
      results: j.results.map((r) => ({ ...r, ...(complets.get(r.restaurantId) ?? {}) })),
      jour, complete, restaurants: all.length, tranches: j.tranches,
      remaining: { restaurants: all.filter((r) => !j.results.some((x) => x.restaurantId === r.id)).length, etapes: ETAPES_PASSE.filter((e) => !(e in j.etapes)) },
      resumed: prise.mode === 'reprise', progressed: progres,
    };
    for (const [k, v] of Object.entries(j.etapes)) if (v !== null && v !== undefined) s[k] = v;
    if (j.ecartes.length) s.ecartes = j.ecartes;
    if (dessaisie) { s.complete = false; s.runningElsewhere = true; }
    return s;
  };
  /** Budget épuisé : on rend la main proprement (rien « en cours », bail relâché : la reprise peut être immédiate). */
  const suspendre = async () => { j.enCoursPour = null; await sauver({ relacher: true }); return resume(false); };
  /** Une unité écartée après MAX_COUPURES coupures : dite, tracée, et la passe continue. */
  const ecarter = (cle: string, quoi: string) => { if (!j.ecartes.includes(cle)) j.ecartes.push(cle); void captureException(new Error(`passe quotidienne : ${quoi} écarté(e) après ${MAX_COUPURES} interruptions`), { route: '/api/jobs/daily', extra: { unite: cle } }); return `${quoi} écarté(e) de la passe : son traitement l'a interrompue ${MAX_COUPURES} fois`; };

  // ---- 1. les restaurants, un par un (ceux qui ont déjà fait tomber la passe passent en dernier)
  const restants = all.filter((r) => !j.results.some((x) => x.restaurantId === r.id)).sort((a, b) => (j.coupures[a.id] ?? 0) - (j.coupures[b.id] ?? 0));
  for (const r of restants) {
    if ((j.coupures[r.id] ?? 0) >= MAX_COUPURES) {
      j.results.push({ restaurantId: r.id, name: r.name, alerts: 0, autoReorder: 0, digest: 'error', error: ecarter(r.id, 'restaurant') });
      j.traites = j.results.length; progres = true;
      if (!(await sauver())) return resume(false);
      continue;
    }
    if (horsBudget()) return suspendre();
    j.etape = 'restaurants'; j.enCoursPour = r.id;
    if (!(await sauver())) return resume(false);
    const t = Date.now();
    let res: DailyResult;
    try { const { preview: _p, ...x } = await runDailyForRestaurant(r.id, { dryRun: opts.dryRun, now: opts.now }); void _p; res = x; }
    catch (e) { res = { restaurantId: r.id, name: r.name, alerts: 0, autoReorder: 0, digest: 'error', recipients: [], error: (e as Error).message }; }
    complets.set(r.id, res);
    j.results.push({ restaurantId: r.id, name: res.name, digest: res.digest, alerts: res.alerts, autoReorder: res.autoReorder, error: res.error, ms: Date.now() - t });
    j.traites = j.results.length; j.enCoursPour = null; progres = true;
    if (res.digest === 'error') void captureException(new Error(`daily digest failed: ${res.error}`), { route: '/api/jobs/daily', restaurantId: r.id });
    if (!(await sauver())) return resume(false);
  }

  // ---- 2. les étapes globales, chacune une seule fois par passe
  const etape = async (nom: string, fn: () => Promise<unknown>): Promise<'faite' | 'budget' | 'dessaisie'> => {
    if (nom in j.etapes) return 'faite';
    const cle = `etape:${nom}`;
    if ((j.coupures[cle] ?? 0) >= MAX_COUPURES) {
      j.etapes[nom] = { error: ecarter(cle, `étape « ${nom} »`) }; progres = true;
      return (await sauver()) ? 'faite' : 'dessaisie';
    }
    if (horsBudget()) return 'budget';
    j.etape = nom; j.enCoursPour = cle;
    if (!(await sauver())) return 'dessaisie';
    const t = Date.now();
    let v: unknown;
    try { v = await fn(); } catch (e) { v = { error: (e as Error).message }; void captureException(e as Error, { route: `/api/jobs/daily#${nom}` }); }
    j.etapes[nom] = v === undefined ? null : v; j.durees[nom] = Date.now() - t; j.enCoursPour = null; progres = true;
    return (await sauver()) ? 'faite' : 'dessaisie';
  };
  const enchainer = async (nom: string, fn: () => Promise<unknown>) => { const r = await etape(nom, fn); return r === 'faite' ? null : r === 'budget' ? await suspendre() : resume(false); };
  let arret: DailySummary | null;

  // Chantier 6 : essais expirés + relances J-7/J-3/J-1 ; factures de commission le 1er du mois pour le mois précédent.
  if ((arret = await enchainer('billing', async () => {
    try {
      const sw = await sweepTrials(now);
      if (!opts.dryRun) for (const r of sw.reminders) {
        const recips = await recipientsFor(r.id);
        for (const { email: to } of recips) await sendMail({ to, subject: r.daysLeft === 1 ? `Dernier jour d'essai AFRISUPPLY pour ${r.name}` : `Plus que ${r.daysLeft} jours d'essai AFRISUPPLY`, text: `Bonjour,\n\nVotre essai gratuit AFRISUPPLY pour ${r.name} se termine dans ${r.daysLeft} jour(s). Pour garder votre stock, vos fournisseurs et vos alertes, choisissez une formule ici : ${APP_URL()}/app/abonnement\n\nBesoin d'aide ? Répondez simplement à cet e-mail.\n\nL'équipe AFRISUPPLY`, html: h`<p>Bonjour,</p><p>Votre essai gratuit AFRISUPPLY pour <b>${r.name}</b> se termine dans <b>${r.daysLeft} jour(s)</b>.</p><p>Pour garder votre stock, vos fournisseurs et vos alertes : <a href="${APP_URL()}/app/abonnement">choisir ma formule</a>.</p><p>Besoin d'aide ? Répondez simplement à cet e-mail.</p><p>L'équipe AFRISUPPLY</p>`, tags: { type: 'trial-reminder' } });
      }
      const billing: Record<string, unknown> = { trialsExpired: sw.expired.length, reminders: sw.reminders.length, enforced: billingEnforced() };
      if (now.getUTCDate() === 1) { const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)); const inv = await invoiceCommissions(prev.toISOString().slice(0, 7), { dryRun: opts.dryRun }); billing.commissionInvoices = inv.invoices.length; }
      return billing;
    } catch (e) { void captureException(e as Error, { route: '/api/jobs/daily#billing' }); return { error: String(e) }; }
  }))) return arret;

  // Chantier 7 : rapport pilotes chaque lundi aux admins
  if ((arret = await enchainer('pilotReport', async () => {
    try {
      const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (now.getUTCDay() === 1 && admins.length && !opts.dryRun) { const rep = await buildWeeklyPilotReport(now); for (const to of admins) await sendMail({ to, subject: `📊 Pilotes AFRISUPPLY — ${rep.pilots} restaurants, semaine du ${now.toLocaleDateString('fr-FR')}`, text: rep.text, html: rep.html, tags: { type: 'pilot-report' } }); return rep.pilots; }
    } catch (e) { void captureException(e as Error, { route: '/api/jobs/daily#pilots' }); }
    return null;
  }))) return arret;

  if ((arret = await enchainer('recurring', async () => {
    try { if (!opts.dryRun) return (await runRecurringOrders(opts.now)).results.length; } catch (e) { await captureException(e, { route: 'jobs/recurring' }); }
    return null;
  }))) return arret;

  if ((arret = await enchainer('reminders', async () => {
    try { return opts.dryRun ? 'skipped' : (await remindPendingVendorOrders({ now: opts.now })).reminded; } catch (e) { await captureException(e, { route: 'jobs/reminders' }); }
    return null;
  }))) return arret;

  // Chantier 29 (leur apport) : rappel des encours/retards de paiement — résultat consigné dans le
  // résumé de la passe, donc visible dans la supervision (job_runs) et non seulement dans les journaux.
  if ((arret = await enchainer('payments', async () => {
    try { if (!opts.dryRun) return (await remindPayments(opts.now)).reminded; } catch (e) { await captureException(e, { route: 'jobs/payments' }); }
    return null;
  }))) return arret;

  // Chantier 12 : sauvegarde quotidienne de chaque restaurant (fichier vérifiable + rotation), puis
  // chantier 13 : COPIE HORS SITE relue et comparée (SHA-256). Une unité par restaurant, et la copie
  // hors site part dans la MÊME unité que le fichier : en serverless le disque local disparaît avec
  // l'instance, une invocation suivante ne le retrouverait pas. Sans configuration hors site, c'est
  // dit tel quel : jamais de succès simulé.
  if (!('backup' in j.etapes)) {
    if (opts.dryRun) j.etapes.backup = 'skipped';
    else {
      const horsSiteActif = offsiteConfig().configured;
      for (const r of all) {
        if (j.sauvegardes[r.id]) continue;
        const cle = `sauvegarde:${r.id}`;
        if ((j.coupures[cle] ?? 0) >= MAX_COUPURES) { j.sauvegardes[r.id] = { error: ecarter(cle, 'sauvegarde') }; progres = true; if (!(await sauver())) return resume(false); continue; }
        if (horsBudget()) return suspendre();
        j.etape = 'backup'; j.enCoursPour = cle;
        if (!(await sauver())) return resume(false);
        const s: SauvegardeJournal = {};
        try {
          const b = await backupAllRestaurants({ restaurantId: r.id });
          const w = b.written[0];
          if (w) { s.name = w.name; s.rows = w.rows; s.sizeBytes = w.sizeBytes; }
          s.removed = b.removed.length;
          if (b.errors.length) s.error = b.errors.map((e) => e.error).join(' | ');
          if (w && horsSiteActif) {
            const envoi = await offsiteSweep({ names: [w.name], prune: false });
            s.envoyes = envoi.uploaded.length; s.echecs = envoi.failed;
          }
        } catch (e) { s.error = (e as Error).message; }
        j.sauvegardes[r.id] = s; j.enCoursPour = null; progres = true;
        if (!(await sauver())) return resume(false);
      }
      // Clôture : traces supervisées (sans passage enregistré, /status et le watchdog ne peuvent pas
      // savoir que les sauvegardes ont réellement lieu), rétention et inventaire distants.
      if ((arret = await enchainer('backup', async () => {
        const dir = backupDir(); const keep = retentionDays();
        const faites = Object.values(j.sauvegardes);
        const ecrites = faites.filter((s) => s.name); const enEchec = faites.filter((s) => s.error);
        if (enEchec.length) void captureException(new Error(`Backup échouée : ${enEchec.map((e) => e.error).join(' | ')}`), { route: 'jobs/backup' });
        await recordJobRun({
          job: 'backup', startedAt, status: statusFrom(ecrites.length, enEchec.length),
          summary: { count: ecrites.length, keep, dir, removed: faites.reduce((a, s) => a + (s.removed ?? 0), 0), bytes: ecrites.reduce((a, s) => a + (s.sizeBytes ?? 0), 0) },
          error: enEchec.length ? enEchec.map((e) => e.error).join(' | ') : null,
        });
        const cfg = offsiteConfig();
        const envoyes = faites.reduce((a, s) => a + (s.envoyes ?? 0), 0); const echecs = faites.flatMap((s) => s.echecs ?? []);
        const hs: Record<string, unknown> = { configured: cfg.configured, uploaded: envoyes, failed: echecs.length, removed: 0, objects: 0, bytes: 0, endpoint: cfg.configured ? new URL(cfg.endpoint).host : null, bucket: cfg.configured ? cfg.bucket : null, error: null };
        if (cfg.configured) {
          try {
            const elague = await pruneOffsite(); hs.removed = elague.removed.length;
            const liste = await listObjects(cfg); hs.objects = liste.objects.length; hs.bytes = liste.objects.reduce((a, o) => a + o.bytes, 0);
            hs.error = echecs.length ? `${echecs.length} envoi(s) en échec` : !liste.ok ? (liste.error ?? 'inventaire distant impossible') : envoyes === 0 ? 'rien à envoyer' : null;
          } catch (e) { hs.error = (e as Error).message; }
        } else { hs.error = cfg.why; hs.pourquoi = cfg.why; }
        await recordJobRun({
          job: 'offsite-backup', startedAt,
          status: cfg.configured ? statusFrom(envoyes, echecs.length) : 'partial',
          summary: { uploaded: envoyes, failed: echecs.length, removed: hs.removed, objects: hs.objects, bytes: hs.bytes, endpoint: hs.endpoint },
          error: cfg.configured ? ((hs.error as string | null) ?? null) : 'sauvegarde hors site non configurée',
        });
        j.etapes.offsite = hs;
        return { written: ecrites.length, errors: enEchec.length, removed: faites.reduce((a, s) => a + (s.removed ?? 0), 0), keep, dir, files: ecrites.map((s) => ({ name: s.name, rows: s.rows, sizeBytes: s.sizeBytes })) };
      }))) return arret;
    }
  }

  // Chantier 12 : surveillance croisée — un cron quotidien ne peut pas signaler sa propre absence,
  // la passe horaire le fait (et inversement).
  if ((arret = await enchainer('watchdog', async () => {
    try { return await watchdog({ self: 'daily', now: opts.now }); } catch (e) { void captureException(e as Error, { route: 'jobs/watchdog' }); }
    return null;
  }))) return arret;

  // ---- 3. clôture. La ligne de supervision reçoit son statut EN DERNIER : elle décrit la passe complète
  // (mails, essais, relances, sauvegardes, surveillance), pas seulement son début.
  const fin = resume(true);
  if (!opts.dryRun) {
    const errors = j.results.filter((r) => r.digest === 'error');
    const status = errors.length === 0 ? (j.ecartes.length ? 'partial' : 'ok') : errors.length === j.results.length ? 'error' : 'partial';
    const { results: _r, complete: _c, resumed: _re, progressed: _p, remaining: _rem, ...aGarder } = fin; void _r; void _c; void _re; void _p; void _rem;
    const ok = await sauver({ final: {
      status, error: errors.map((e) => `${e.name}: ${e.error}`).join(' | ') || null,
      summary: { ...aGarder, results: j.results, travailMs: j.travailMs, durees: j.durees, ...(Object.keys(j.coupures).length ? { coupures: j.coupures } : {}) },
    } });
    if (!ok) return resume(false);
    fin.status = status;
  }
  return fin;
}
