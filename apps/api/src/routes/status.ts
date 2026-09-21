// Statut public de la plateforme : base joignable, derniers jobs, état réel des canaux de notification, version. Sans données métier.
import { Hono } from 'hono';
import { desc, sql } from 'drizzle-orm';
import { getDb, jobRuns } from '@afrisupply/db';
import { buildInfo, sentryEnabled } from '../lib/ops.js';
import { mailerConfig, mailStats } from '../lib/mailer.js';
import { smsConfig, smsStats } from '../lib/sms.js';

export const statusRoutes = new Hono();

/** Fraîcheur attendue de chaque job (heures) : au-delà, la supervision le signale comme en retard. */
const JOB_MAX_HOURS: Record<string, number> = { daily: 30, reminders: 3, 'alerts-notify': 3 };

type JobInfo = { state: 'ok' | 'never' | 'degraded' | 'stale'; lastRun: null | { status: string; finishedAt: Date; durationMs: number; hoursAgo: number; summary: unknown; error: string | null } };

statusRoutes.get('/status', async (c) => {
  const t0 = Date.now(); let dbOk = false; let dbMs = 0;
  const jobs: Record<string, JobInfo> = {};
  try {
    const db = await getDb(); await db.execute(sql`select 1`); dbMs = Date.now() - t0; dbOk = true;
    // Chantier 6 : on supervise chaque job (plus seulement « daily ») — un cron qui ne tourne plus est une panne silencieuse.
    const runs = await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(200);
    for (const job of Object.keys(JOB_MAX_HOURS)) {
      const last = runs.find((r) => r.job === job) ?? null;
      const hoursAgo = last ? (Date.now() - new Date(last.finishedAt).getTime()) / 3_600_000 : null;
      const state: JobInfo['state'] = !last ? 'never' : last.status !== 'ok' ? 'degraded' : hoursAgo! > JOB_MAX_HOURS[job] ? 'stale' : 'ok';
      jobs[job] = { state, lastRun: last ? { status: last.status, finishedAt: last.finishedAt, durationMs: last.durationMs, hoursAgo: Math.round(hoursAgo! * 10) / 10, summary: last.summary ?? null, error: last.error ?? null } : null };
    }
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
      dailyJob: jobs.daily ?? { state: 'never', lastRun: null },
      mail: { transport: mc.transport, configured: mc.transport === 'resend', delivered: mc.transport !== 'log', from: mc.from, stats: mailStats() },
      sms: { configured: sc.enabled, whatsapp: sc.whatsapp, delivered: sc.enabled, stats: smsStats() },
      errorTracking: { configured: sentryEnabled() },
      cron: { configured: !!process.env.CRON_SECRET, jobs: ['/api/jobs/daily', '/api/jobs/reminders'] },
    },
  }, ok ? 200 : 503);
});

/** Historique des jobs (admin) : GET /api/status/jobs?limit=30 — protégé par CRON_SECRET pour rester simple. */
statusRoutes.get('/status/jobs', async (c) => {
  const auth = c.req.header('authorization'); const given = c.req.header('x-cron-secret') ?? (auth?.startsWith('Bearer ') ? auth.slice(7) : undefined);
  if (!process.env.CRON_SECRET || given !== process.env.CRON_SECRET) return c.json({ error: 'Non autorisé' }, 401);
  const db = await getDb();
  return c.json({ runs: await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(Math.min(100, Number(c.req.query('limit') ?? 30))) });
});
