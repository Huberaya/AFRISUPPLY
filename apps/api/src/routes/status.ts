// Statut public de la plateforme : base joignable, derniers jobs, état réel des canaux de notification, version.
// Chantier 12 : la santé des tâches vient de lib/ops-health.ts (même règle que le back-office), en
// version publique — le détail d'un passage (chemins de fichiers, volumes) reste au back-office.
// Sans données métier — et sans chiffre inventé : tout vient de job_runs, du disque des sauvegardes et de la base.
import { Hono } from 'hono';
import { desc, sql } from 'drizzle-orm';
import { getDb, jobRuns } from '@afrisupply/db';
import { buildInfo, sentryEnabled } from '../lib/ops.js';
import { SUPPORT, jobHealth, publicJobHealth } from '../lib/ops-health.js';
import { backupStorageStats } from '../lib/backup.js';
import { mailerConfig, mailStats, outboxCount } from '../lib/mailer.js';
import { smsConfig, smsStats } from '../lib/sms.js';

export const statusRoutes = new Hono();

statusRoutes.get('/status', async (c) => {
  const t0 = Date.now(); let dbOk = false; let dbMs = 0;
  let jobs: Awaited<ReturnType<typeof jobHealth>> = {};
  let backup: { lastAt: string | null; ageHours: number | null; files: number; keep: number } = { lastAt: null, ageHours: null, files: 0, keep: 0 };
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
  const ok = dbOk && !degraded;
  return c.json({
    ok, ...buildInfo(), checkedAt: new Date().toISOString(),
    checks: {
      database: { ok: dbOk, latencyMs: dbMs },
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
  const auth = c.req.header('authorization'); const given = c.req.header('x-cron-secret') ?? (auth?.startsWith('Bearer ') ? auth.slice(7) : undefined);
  if (!process.env.CRON_SECRET || given !== process.env.CRON_SECRET) return c.json({ error: 'Non autorisé' }, 401);
  const db = await getDb();
  return c.json({ runs: await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(Math.min(100, Number(c.req.query('limit') ?? 30))) });
});
