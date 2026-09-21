// Chantier 12 (audit) — SOURCES DE VÉRITÉ DE L'EXPLOITATION.
//
// Deux sujets, une seule source pour chacun :
//   1. l'adresse de support : une seule adresse pour toute la plateforme (site, app, e-mails,
//      factures, messages d'erreur). Elle change par variable d'environnement, pas dans 6 fichiers ;
//   2. la santé des tâches planifiées : un job qui ne tourne plus est une panne silencieuse.
//      C'est ici qu'on décide ce qu'est un job « en retard », et qu'on alerte pour de vrai.
import { desc } from 'drizzle-orm';
import { getDb, jobRuns } from '@afrisupply/db';
import { alertAdmin } from './ops.js';

/** Adresse de support unique (surchargeable par SUPPORT_EMAIL). */
export const SUPPORT = {
  email: () => process.env.SUPPORT_EMAIL ?? 'bonjour@afrisupply.fr',
  /** Horaires où une réponse humaine est réellement possible. */
  hours: 'du lundi au samedi, 8 h – 20 h (heure de Paris)',
  /** Délais annoncés : tenus par une personne, pas par un robot. */
  responseTime: 'réponse sous 4 h ouvrées · incident bloquant (impossible de commander ou de réceptionner) : sous 1 h',
  phone: () => process.env.SUPPORT_PHONE ?? null,
};

/** Fraîcheur attendue de chaque tâche planifiée (heures) : au-delà, elle est signalée en retard. */
export const JOB_MAX_HOURS: Record<string, number> = { daily: 30, reminders: 3, 'alerts-notify': 3, backup: 30 };

export type JobState = 'ok' | 'never' | 'degraded' | 'stale';
export interface JobHealth {
  state: JobState;
  maxHours: number;
  lastRun: null | { status: string; finishedAt: string; durationMs: number; hoursAgo: number; summary: unknown; error: string | null };
}

/** Santé de chaque job supervisé, calculée à partir des passages réellement enregistrés (job_runs). */
export async function jobHealth(): Promise<Record<string, JobHealth>> {
  const db = await getDb();
  const runs = await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(400);
  const out: Record<string, JobHealth> = {};
  for (const job of Object.keys(JOB_MAX_HOURS)) {
    const last = runs.find((r) => r.job === job) ?? null;
    const hoursAgo = last ? (Date.now() - new Date(last.finishedAt).getTime()) / 3_600_000 : null;
    const state: JobState = !last ? 'never' : last.status !== 'ok' ? 'degraded' : hoursAgo! > JOB_MAX_HOURS[job] ? 'stale' : 'ok';
    out[job] = {
      state, maxHours: JOB_MAX_HOURS[job],
      lastRun: last ? { status: last.status, finishedAt: new Date(last.finishedAt).toISOString(), durationMs: last.durationMs, hoursAgo: Math.round(hoursAgo! * 10) / 10, summary: last.summary ?? null, error: last.error ?? null } : null,
    };
  }
  return out;
}

/**
 * Même santé, mais DÉTAILS RETIRÉS : c'est ce que la page de statut PUBLIQUE a le droit de montrer.
 * Le contenu d'un passage (`summary`, `error`) peut citer des chemins de fichiers internes et des
 * volumes d'activité : utile au back-office, hors sujet pour un visiteur anonyme. Une seule règle,
 * écrite une seule fois, utilisée par la route publique.
 */
export function publicJobHealth(jobs: Record<string, JobHealth>): Record<string, JobHealth> {
  return Object.fromEntries(Object.entries(jobs).map(([job, h]) => [job, {
    state: h.state, maxHours: h.maxHours,
    lastRun: h.lastRun ? { status: h.lastRun.status, finishedAt: h.lastRun.finishedAt, durationMs: h.lastRun.durationMs, hoursAgo: h.lastRun.hoursAgo, summary: null, error: null } : null,
  }]));
}

/**
 * Surveillance croisée : chaque job, en fin de passage, vérifie que les AUTRES ne sont pas muets.
 * Un cron quotidien ne peut pas signaler sa propre absence ; un job horaire, si.
 * L'alerte est limitée dans le temps (alertAdmin) : un incident long ne noie pas l'exploitant.
 */
export async function watchdog(opts: { self: string; now?: Date } = { self: 'unknown' }) {
  const jobs = await jobHealth();
  // « never » compte aussi : un job jamais enregistré n'est pas un job en bonne santé, c'est une
  // configuration oubliée (cron non branché, secret manquant). L'alerte est limitée dans le temps.
  const late = Object.entries(jobs).filter(([job, h]) => job !== opts.self && h.state !== 'ok');
  const raised: { job: string; state: JobState; hoursAgo: number | null; alerted: boolean }[] = [];
  for (const [job, h] of late) {
    const when = h.lastRun ? `il y a ${h.lastRun.hoursAgo} h` : 'jamais';
    const ok = await alertAdmin({
      key: `job.${job}.${h.state}`,
      message: `Tâche planifiée « ${job} » en problème : ${h.state === 'stale' ? `aucun passage depuis plus de ${h.maxHours} h (dernier : ${when})` : h.state === 'never' ? 'aucun passage enregistré (cron non branché ?)' : `dernier passage en échec (${when})`}.`,
      detail: { job, state: h.state, lastRun: h.lastRun, detectedBy: opts.self },
    });
    raised.push({ job, state: h.state, hoursAgo: h.lastRun?.hoursAgo ?? null, alerted: ok === true });
  }
  return { checked: Object.keys(jobs).length, late: raised };
}
