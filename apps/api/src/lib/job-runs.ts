// Chantier 6 (audit) — supervision : chaque tâche planifiée (et chaque envoi qu'elle déclenche)
// laisse une trace horodatée dans job_runs (job, statut, durée, résumé, erreur).
// Sans ça, un cron qui ne tourne plus — ou qui échoue en silence — reste invisible des semaines.
import { getDb, jobRuns } from '@afrisupply/db';

export type JobStatus = 'ok' | 'partial' | 'error';

export interface JobRunReport {
  job: string;
  startedAt: Date;
  status: JobStatus;
  summary?: Record<string, unknown>;
  error?: string | null;
}

/** Trace un passage de job. Ne jette jamais : la supervision ne doit pas casser le job. */
export async function recordJobRun(r: JobRunReport) {
  const finishedAt = new Date();
  try {
    const db = await getDb();
    await db.insert(jobRuns).values({
      job: r.job, status: r.status, startedAt: r.startedAt, finishedAt,
      durationMs: Math.max(0, finishedAt.getTime() - r.startedAt.getTime()),
      summary: r.summary ?? {}, error: r.error ?? null,
    });
    return true;
  } catch (e) {
    console.error('[job_runs]', r.job, (e as Error).message);
    return false;
  }
}

/** Statut lisible à partir d'un compteur de succès/échecs. */
export const statusFrom = (ok: number, failed: number): JobStatus => (failed === 0 ? 'ok' : ok === 0 ? 'error' : 'partial');
