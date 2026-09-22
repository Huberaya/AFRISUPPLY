// Correctif (vérification du déploiement) — UNE SAUVEGARDE QUI ÉCHOUE DOIT ÊTRE VISIBLE.
//
// Constat mesuré en production (`afrisupply-api-zeta.vercel.app`, état `6fad9b5`) :
//
//   "jobs": { "backup": { "state": "never", … } }
//
// « never » veut dire « aucun passage enregistré ». Mais la tâche quotidienne avait bien tourné (elle
// est enregistrée, en `partial`) : c'est donc l'ÉTAPE de sauvegarde qui échouait — et son échec
// n'était enregistré nulle part. Sur Vercel, le disque du projet est en LECTURE SEULE : la
// sauvegarde locale ne peut pas s'écrire, elle lève une exception, le `catch` se contente de la noter
// dans le résumé, et aucune ligne `job_runs` n'est écrite pour le job « backup ».
//
// Conséquence : la supervision affichait « jamais lancé » (comme un cron oublié) au lieu de
// « dernier passage en échec : dossier non inscriptible » — l'opérateur cherchait donc le problème
// au mauvais endroit. C'est exactement le genre de silence que l'audit reproche.
//
// Ce que ce test verrouille :
//   1. si le dossier de sauvegarde ne peut pas être écrit, une ligne `job_runs` « backup » existe,
//      en statut `error`, avec un message qui NOMME la cause ;
//   2. la tâche quotidienne continue malgré tout (les autres étapes ne sont pas perdues) ;
//   3. la supervision lit alors « degraded » avec le motif, et non « never ».
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.PGLITE_DIR = 'memory://backup-echec-visible';
process.env.ADMIN_EMAILS = 'admin@afrisupply.fr';
process.env.CRON_SECRET = 'cron';
delete process.env.RESEND_API_KEY;
delete process.env.VERCEL;

import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations, getDb, jobRuns } from '@afrisupply/db';
import { desc, eq } from 'drizzle-orm';
import { app } from '../app.js';
import { runDailyForAll } from '../jobs/daily.js';
import { jobHealth } from '../lib/ops-health.js';
import { backupDir, backupDiskEphemere } from '../lib/backup.js';

const call = async (m: string, p: string, body?: unknown, h: Record<string, string> = {}) => {
  const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: (await r.clone().json().catch(() => ({}))) as Record<string, any> };
};

/** Un chemin de dossier IMPOSSIBLE à créer : un fichier ordinaire occupe la place (ENOTDIR). */
function dossierImpossible(): { dir: string; racine: string } {
  const racine = mkdtempSync(path.join(tmpdir(), 'afs-dossier-ko-'));
  writeFileSync(path.join(racine, 'fichier'), 'je ne suis pas un dossier');
  return { dir: path.join(racine, 'fichier', 'sauvegardes'), racine };
}

describe('Une sauvegarde impossible est VISIBLE dans la supervision', () => {
  beforeAll(async () => { await runMigrations(); }, 60_000);

  it('dossier non écrivable → ligne job_runs « backup » en erreur, avec la cause, et la tâche quotidienne continue', async () => {
    const reg = await call('POST', '/api/auth/register', {
      email: 'echec-visible@resto.fr', password: 'Plantain-Yassa-42', fullName: 'Awa Échec',
      restaurantName: 'Chez Échec Visible', city: 'Nantes',
    });
    expect(reg.status).toBe(201);

    const { dir, racine } = dossierImpossible();
    const avant = process.env.BACKUP_DIR;
    process.env.BACKUP_DIR = dir;
    try {
      const run = await runDailyForAll({});
      // 1. La tâche quotidienne a bien tourné (elle ne s'interrompt pas à cause de la sauvegarde).
      expect(run.count).toBeGreaterThan(0);
      // 2. Elle DIT que la sauvegarde a échoué.
      const resume = JSON.stringify(run);
      expect(resume).toMatch(/backup/);

      const db = await getDb();
      const lignes = await db.select().from(jobRuns).where(eq(jobRuns.job, 'backup')).orderBy(desc(jobRuns.startedAt)).limit(1);
      // Avant le correctif : `lignes` était VIDE (d'où « never » en production).
      expect(lignes.length, 'aucune ligne job_runs « backup » : un échec de sauvegarde est donc invisible').toBe(1);
      expect(lignes[0].status).toBe('error');
      expect(String(lignes[0].error ?? '')).toMatch(new RegExp(escapeRegex(path.dirname(dir))));

      // 3. La supervision affiche « degraded » avec un motif, et non « never ».
      const sante = await jobHealth();
      expect(sante.backup.state).toBe('degraded');
      expect(String(sante.backup.lastRun?.error ?? '')).toMatch(/sauvegarde|dossier|répertoire/i);
      expect(sante.backup.lastRun?.status).toBe('error');
    } finally {
      if (avant === undefined) delete process.env.BACKUP_DIR; else process.env.BACKUP_DIR = avant;
      rmSync(racine, { recursive: true, force: true });
    }
  }, 120_000);
});

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('La production serverless ne peut pas écrire dans le projet : le dossier bascule sur /tmp', () => {
  it('sous VERCEL sans BACKUP_DIR : dossier inscriptible, sauvegarde réellement écrite, et disque ANNONCÉ éphémère', async () => {
    const avant = { dir: process.env.BACKUP_DIR, vercel: process.env.VERCEL };
    delete process.env.BACKUP_DIR;
    process.env.VERCEL = '1';
    try {
      // Sans ce correctif, le dossier restait `process.cwd()/.backups` — en LECTURE SEULE sur la
      // plateforme : la sauvegarde échouait à chaque passage, comme observé en production.
      expect(backupDir()).toContain('afrisupply-backups');
      expect(backupDir().startsWith(tmpdir())).toBe(true);
      expect(backupDiskEphemere()).toBe(true);

      const run = await runDailyForAll({});
      expect(run.count).toBeGreaterThan(0);
      const resume = JSON.stringify((run as Record<string, unknown>).results ?? run);
      expect(resume).not.toMatch(/ENOENT|EROFS|read-only/i);

      const db = await getDb();
      const [ligne] = await db.select().from(jobRuns).where(eq(jobRuns.job, 'backup')).orderBy(desc(jobRuns.startedAt)).limit(1);
      expect(ligne).toBeTruthy();
      // La sauvegarde est réellement écrite (le fichier existe).
      const liste = readdirSync(backupDir()).filter((f) => f.endsWith('.json.gz'));
      expect(liste.length).toBeGreaterThan(0);
    } finally {
      if (avant.dir !== undefined) process.env.BACKUP_DIR = avant.dir;
      if (avant.vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = avant.vercel;
    }
  }, 120_000);

  it('l’état de sauvegarde dit clairement que le disque est éphémère (aucune illusion de conservation)', async () => {
    const avant = { dir: process.env.BACKUP_DIR, vercel: process.env.VERCEL };
    delete process.env.BACKUP_DIR;
    process.env.VERCEL = '1';
    try {
      const { backupStorageStats } = await import('../lib/backup.js');
      const etat = await backupStorageStats();
      expect(etat.ephemere).toBe(true);
      expect(String(etat.note ?? '')).toMatch(/temporaire|hors site/i);
    } finally {
      if (avant.dir !== undefined) process.env.BACKUP_DIR = avant.dir;
      if (avant.vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = avant.vercel;
    }
  });
});

describe('Surveillance : la cadence attendue correspond à la cadence réelle de la plateforme', () => {
  it('un cron QUOTIDIEN n’est pas signalé en retard au bout de 5 h (sinon alerte quotidienne inutile)', async () => {
    // Avant le correctif, l'attente était de 3 h pour `reminders` et `alerts-notify` alors que le plan
    // Vercel Hobby n'autorise qu'un passage par jour : la supervision aurait signalé « en retard » une
    // plateforme en bonne santé, tous les jours, à la même heure.
    const { JOB_MAX_HOURS } = await import('../lib/ops-health.js');
    expect(JOB_MAX_HOURS.reminders).toBeGreaterThanOrEqual(24);
    expect(JOB_MAX_HOURS['alerts-notify']).toBeGreaterThanOrEqual(24);
    // ...mais un cron réellement mort reste détecté : le seuil reste fini et proche de la journée.
    expect(JOB_MAX_HOURS.reminders).toBeLessThanOrEqual(48);
  });

  it('la copie hors site n’est supervisée QUE si elle est en service (pas de fausse alerte quotidienne)', async () => {
    // Non configurée : rien à surveiller. Le manque est annoncé ailleurs (problème d'exploitation,
    // état public) — sonner tous les jours pour une configuration à faire use les alertes.
    delete process.env.BACKUP_S3_ENDPOINT; delete process.env.BACKUP_S3_BUCKET;
    delete process.env.BACKUP_S3_ACCESS_KEY_ID; delete process.env.BACKUP_S3_SECRET_ACCESS_KEY;
    const { jobsSurveilles } = await import('../lib/ops-health.js');
    expect(Object.keys(jobsSurveilles())).not.toContain('offsite-backup');
    expect(Object.keys(await jobHealth())).not.toContain('offsite-backup');

    // Configurée : elle redevient une promesse mesurée, avec une cadence réaliste (cron quotidien).
    process.env.BACKUP_S3_ENDPOINT = 'https://exemple.invalid';
    process.env.BACKUP_S3_BUCKET = 'seau-de-test';
    process.env.BACKUP_S3_ACCESS_KEY_ID = 'cle';
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'secret';
    try {
      expect(Object.keys(jobsSurveilles())).toContain('offsite-backup');
      const sante = await jobHealth();
      expect(Object.keys(sante)).toContain('offsite-backup');
      // Le seuil est ajustable le jour où la cadence change (cron horaire sur un plan supérieur).
      expect(sante['offsite-backup'].maxHours).toBeGreaterThanOrEqual(24);
    } finally {
      delete process.env.BACKUP_S3_ENDPOINT; delete process.env.BACKUP_S3_BUCKET;
      delete process.env.BACKUP_S3_ACCESS_KEY_ID; delete process.env.BACKUP_S3_SECRET_ACCESS_KEY;
    }
  });
});
