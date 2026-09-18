// Statut public de la plateforme : base joignable, dernier job du matin, version. Sans données métier.
import { Hono } from 'hono';
import { desc, eq, sql } from 'drizzle-orm';
import { getDb, jobRuns } from '@afrisupply/db';
import { buildInfo, sentryEnabled } from '../lib/ops.js';
import { mailerConfig } from '../lib/mailer.js';

export const statusRoutes = new Hono();

statusRoutes.get('/status', async (c) => {
  const t0 = Date.now(); let dbOk = false; let dbMs = 0; let lastJob: { status: string; finishedAt: Date; durationMs: number; sent?: unknown; count?: unknown } | null = null;
  try {
    const db = await getDb(); await db.execute(sql`select 1`); dbMs = Date.now() - t0; dbOk = true;
    const [j] = await db.select().from(jobRuns).where(eq(jobRuns.job, 'daily')).orderBy(desc(jobRuns.startedAt)).limit(1);
    if (j) lastJob = { status: j.status, finishedAt: j.finishedAt, durationMs: j.durationMs, sent: j.summary?.sent, count: j.summary?.count };
  } catch { dbOk = false; }
  const hoursSinceJob = lastJob ? (Date.now() - new Date(lastJob.finishedAt).getTime()) / 3_600_000 : null;
  const jobState = !lastJob ? 'never' : lastJob.status !== 'ok' ? 'degraded' : hoursSinceJob! > 30 ? 'stale' : 'ok';
  const ok = dbOk && jobState !== 'degraded';
  return c.json({
    ok, ...buildInfo(), checkedAt: new Date().toISOString(),
    checks: {
      database: { ok: dbOk, latencyMs: dbMs },
      dailyJob: { state: jobState, lastRun: lastJob ? { ...lastJob, hoursAgo: Math.round(hoursSinceJob! * 10) / 10 } : null },
      mail: { transport: mailerConfig().transport, configured: mailerConfig().transport === 'resend' },
      errorTracking: { configured: sentryEnabled() },
      cron: { configured: !!process.env.CRON_SECRET },
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
