// Statut public de la plateforme : base joignable, derniers jobs, état réel des canaux de notification, version.
// Chantier 12 : la santé des tâches vient de lib/ops-health.ts (même règle que le back-office), en
// version publique — le détail d'un passage (chemins de fichiers, volumes) reste au back-office.
// Sans données métier — et sans chiffre inventé : tout vient de job_runs, du disque des sauvegardes et de la base.
import { Hono } from 'hono';
import { desc, sql } from 'drizzle-orm';
import { getDb, jobRuns, migrationStatus, type MigrationStatus } from '@afrisupply/db';
import { cronSecretCheck } from '../lib/security.js';
import { buildInfo, sentryEnabled } from '../lib/ops.js';
import { SUPPORT, jobHealth, publicJobHealth } from '../lib/ops-health.js';
import { backupStorageStats } from '../lib/backup.js';
import { mailerConfig, mailStats, outboxCount } from '../lib/mailer.js';
import { smsConfig, smsStats } from '../lib/sms.js';

export const statusRoutes = new Hono();

// Chantier P0.4 — état RÉEL des migrations de la base, lu dans son journal (lecture seule).
// Gardé une minute en mémoire par instance : le contrôle de statut ne doit pas charger la base.
let schemaCache: { at: number; value: MigrationStatus } | null = null;
export async function schemaStatus(): Promise<MigrationStatus> {
  if (schemaCache && Date.now() - schemaCache.at < 60_000) return schemaCache.value;
  const value = await migrationStatus();
  schemaCache = { at: Date.now(), value };
  return value;
}
export const _resetSchemaCache = () => { schemaCache = null; };

statusRoutes.get('/status', async (c) => {
  const t0 = Date.now(); let dbOk = false; let dbMs = 0;
  let jobs: Awaited<ReturnType<typeof jobHealth>> = {};
  let backup: { lastAt: string | null; ageHours: number | null; files: number; keep: number } = { lastAt: null, ageHours: null, files: 0, keep: 0 };
  let schema: { state: string; expected: number | null; applied: number | null; pending: number } = { state: 'inconnu', expected: null, applied: null, pending: 0 };
  try { const s = await schemaStatus(); schema = { state: s.state, expected: s.expected, applied: s.applied, pending: s.pending.length }; } catch { /* base injoignable : signalé par `database` ci-dessous */ }
  try {
    const db = await getDb(); await db.execute(sql`select 1`); dbMs = Date.now() - t0; dbOk = true;
    // Chantier 12 : la même source de vérité que le back-office (lib/ops-health.ts) — une seule règle
    // de « job en retard », utilisée ici et dans les alertes admin.
    // Vue PUBLIQUE : état et fraîcheur, sans le détail des passages (chemins internes, volumes).
    jobs = publicJobHealth(await jobHealth());
    const st = await backupStorageStats();
    backup = { lastAt: st.last?.createdAt ?? null, ageHours: st.last ? Math.round(((Date.now() - new Date(st.last.createdAt).getTime()) / 3_600_000) * 10) / 10 : null, files: st.files, keep: st.keep };
  } catch { dbOk = false; }
  const mc = mailerConfig(); const sc = smsConfig();
  const degraded = Object.values(jobs).some((j) => j.state === 'degraded');
  // Une base en retard sur le code (migration attendue mais absente) est une panne annoncée : le statut le dit.
  const schemaBehind = schema.state === 'en_retard' || schema.state === 'non_initialisee';
  const ok = dbOk && !degraded && !schemaBehind;
  return c.json({
    ok, ...buildInfo(), checkedAt: new Date().toISOString(),
    checks: {
      database: { ok: dbOk, latencyMs: dbMs },
      // État des migrations constaté dans la base (et non supposé d'après le dépôt).
      schema: { ok: !schemaBehind && schema.state !== 'inconnu', ...schema },
      jobs,
      // Compatibilité : l'ancien champ dailyJob reste exposé (supervision externe existante).
      dailyJob: jobs.daily ?? { state: 'never', maxHours: 30, lastRun: null },
      mail: { transport: mc.transport, configured: mc.transport === 'resend', delivered: mc.transport !== 'log', from: mc.from, stats: mailStats(), outboxCount: mc.transport === 'file' ? await outboxCount() : null },
      sms: { configured: sc.enabled, whatsapp: sc.whatsapp, delivered: sc.enabled, stats: smsStats() },
      errorTracking: { configured: sentryEnabled() },
      cron: { configured: !!process.env.CRON_SECRET, jobs: ['/api/jobs/daily', '/api/jobs/reminders'] },
      backups: { files: backup.files, lastAt: backup.lastAt, ageHours: backup.ageHours, retentionDays: backup.keep, ok: backup.files > 0 && (backup.ageHours ?? 999) <= 36 },
    },
    support: { email: SUPPORT.email(), hours: SUPPORT.hours, responseTime: SUPPORT.responseTime, phone: SUPPORT.phone() },
  }, ok ? 200 : 503);
});

/** Historique des jobs (admin) : GET /api/status/jobs?limit=30 — protégé par CRON_SECRET pour rester simple. */
statusRoutes.get('/status/jobs', async (c) => {
  if (cronSecretCheck({ cron: c.req.header('x-cron-secret'), authorization: c.req.header('authorization') }, undefined) !== 'ok') return c.json({ error: 'Non autorisé' }, 401);
  const db = await getDb();
  return c.json({ runs: await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(Math.min(100, Number(c.req.query('limit') ?? 30))) });
});
