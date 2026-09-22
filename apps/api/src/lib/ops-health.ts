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
import { offsiteConfigured } from './offsite.js';

/** Adresse de support unique (surchargeable par SUPPORT_EMAIL). */
export const SUPPORT = {
  email: () => process.env.SUPPORT_EMAIL ?? 'bonjour@afrisupply.fr',
  /** Horaires où une réponse humaine est réellement possible. */
  hours: 'du lundi au samedi, 8 h – 20 h (heure de Paris)',
  /** Délais annoncés : tenus par une personne, pas par un robot. */
  responseTime: 'réponse sous 4 h ouvrées · incident bloquant (impossible de commander ou de réceptionner) : sous 1 h',
  phone: () => process.env.SUPPORT_PHONE ?? null,
};

/**
 * Fraîcheur attendue de chaque tâche planifiée (heures) : au-delà, elle est signalée en retard.
 *
 * Ces seuils DOIVENT correspondre à la cadence réellement déclarée des crons, sinon la supervision
 * ment dans un sens ou dans l'autre :
 *   • trop courts → une plateforme qui fonctionne est signalée en retard plusieurs fois par jour
 *     (cris d'alarme quotidiens qui finissent par être ignorés — le pire des états) ;
 *   • trop longs → un cron mort reste invisible pendant des jours.
 *
 * Constat de la mise en ligne réelle : le plan Vercel Hobby n'autorise qu'UN passage par jour et par
 * cron. `reminders` et `alerts-notify` tournent donc une fois par jour, pas toutes les heures : les
 * attendre en 3 h garantissait une fausse alerte quotidienne. Les valeurs par défaut reflètent cette
 * réalité, et chaque seuil reste ajustable par variable d'environnement le jour où la cadence change
 * (`JOB_MAX_HOURS_REMINDERS=3` pour un cron horaire, par exemple).
 */
const seuil = (job: string, defaut: number) => {
  const brut = process.env[`JOB_MAX_HOURS_${job.toUpperCase().replace(/-/g, '_')}`];
  const n = Number(brut);
  return Number.isFinite(n) && n > 0 ? n : defaut;
};
export const JOB_MAX_HOURS: Record<string, number> = {
  daily: seuil('daily', 30),
  // Cron quotidien (plan Hobby) : 26 h laisse une marge d'une heure sur la fenêtre de la plateforme.
  reminders: seuil('reminders', 26),
  'alerts-notify': seuil('alerts-notify', 26),
  backup: seuil('backup', 30),
  // Chantier 13 : la copie hors site est supervisée comme les autres — si elle cesse, on le sait.
  'offsite-backup': seuil('offsite-backup', 30),
};

export type JobState = 'ok' | 'never' | 'degraded' | 'stale';
export interface JobHealth {
  state: JobState;
  maxHours: number;
  lastRun: null | { status: string; finishedAt: string; durationMs: number; hoursAgo: number; summary: unknown; error: string | null };
}

/**
 * Tâches réellement supervisées.
 *
 * La copie hors site n'est supervisée QUE si elle est en service : tant que `BACKUP_S3_*` n'est pas
 * renseigné, il n'y a rien à surveiller — seulement une configuration à faire, et elle est déjà
 * annoncée comme problème dans l'exploitation (`/api/admin/ops`) et dans l'état public. Superviser
 * une tâche non configurée ferait sonner la surveillance tous les jours pour la même raison : au bout
 * d'une semaine, plus personne ne lit les alertes — c'est ce qu'on veut éviter.
 *
 * Dès que la copie externe est configurée, elle redevient une promesse mesurée : si les envois
 * s'arrêtent, la supervision le dit.
 */
export function jobsSurveilles(): Record<string, number> {
  return Object.fromEntries(Object.entries(JOB_MAX_HOURS).filter(([job]) => job !== 'offsite-backup' || offsiteConfigured()));
}

/** Santé de chaque job supervisé, calculée à partir des passages réellement enregistrés (job_runs). */
export async function jobHealth(): Promise<Record<string, JobHealth>> {
  const db = await getDb();
  const runs = await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(400);
  const out: Record<string, JobHealth> = {};
  const surveilles = jobsSurveilles();
  for (const job of Object.keys(surveilles)) {
    const last = runs.find((r) => r.job === job) ?? null;
    const hoursAgo = last ? (Date.now() - new Date(last.finishedAt).getTime()) / 3_600_000 : null;
    const state: JobState = !last ? 'never' : last.status !== 'ok' ? 'degraded' : hoursAgo! > surveilles[job] ? 'stale' : 'ok';
    out[job] = {
      state, maxHours: surveilles[job],
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
