// Chantier P0.4 — LA PASSE QUOTIDIENNE LAISSE UNE TRACE MÊME QUAND ELLE EST COUPÉE.
//
// Constat de production (2026-11-12) : aucune passe quotidienne complète enregistrée depuis le
// 2026-09-23, sans qu'on puisse dire si elle démarre, ni où elle s'arrête — sa seule trace était
// écrite à la toute fin. Ces tests vérifient que la trace existe dès le démarrage, qu'elle avance,
// et que la supervision distingue « en cours », « achevée » et « interrompue ».
//
// Ils ne corrigent pas la cause de l'interruption en production (non vérifiée : journaux Vercel
// inaccessibles) : ils garantissent qu'au prochain passage, elle sera visible et localisée.
import { describe, it, expect, beforeAll } from 'vitest';
import { desc, eq } from 'drizzle-orm';
import { runMigrations, getDb, jobRuns } from '@afrisupply/db';
import { app } from '../app.js';
import { runDailyForAll } from '../jobs/daily.js';
import { jobHealth, publicJobHealth, RUNNING_GRACE_MS } from '../lib/ops-health.js';
import { creerAppel, inscrire } from './aide-comptes.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.DATABASE_URL = '';
process.env.PGLITE_DIR = 'memory://p0-passe'; process.env.MAIL_OUTBOX_DIR = '/tmp/afs-outbox-p0-passe'; process.env.BACKUP_DIR = '/tmp/afs-backups-p0-passe';
delete process.env.RESEND_API_KEY; delete process.env.BACKUP_S3_ENDPOINT;

const appel = creerAppel(app);
const passes = async () => (await getDb()).select().from(jobRuns).where(eq(jobRuns.job, 'daily')).orderBy(desc(jobRuns.startedAt));

beforeAll(async () => {
  await runMigrations();
  await inscrire(appel, 'patron-un@resto.test', 'Restaurant Un');
  await inscrire(appel, 'patron-deux@resto.test', 'Restaurant Deux');
}, 60_000);

describe('trace de la passe quotidienne', () => {
  it('une passe achevée laisse UNE ligne, au statut final, avec le résultat de chaque restaurant', async () => {
    const r = await runDailyForAll();
    expect(r.count).toBe(2);
    const lignes = await passes();
    expect(lignes).toHaveLength(1);
    expect(['ok', 'partial', 'error']).toContain(lignes[0].status);
    const resume = lignes[0].summary as { count?: number; results?: unknown[]; enCours?: boolean };
    expect(resume.count).toBe(2); expect(resume.results).toHaveLength(2);
    expect(resume.enCours).toBeUndefined();          // la ligne d'avancement a bien été remplacée par le résultat
    expect(lignes[0].durationMs).toBeGreaterThan(0);
  }, 60_000);

  it('une simulation (dryRun) n’écrit aucune trace', async () => {
    const avant = (await passes()).length;
    await runDailyForAll({ dryRun: true });
    expect((await passes()).length).toBe(avant);
  }, 60_000);

  it('une passe coupée en route est signalée, avec l’étape et le nombre de restaurants traités', async () => {
    const db = await getDb();
    const debut = new Date(Date.now() - RUNNING_GRACE_MS - 60_000);
    await db.insert(jobRuns).values({ job: 'daily', status: 'running', startedAt: debut, finishedAt: new Date(debut.getTime() + 52_000), durationMs: 52_000, summary: { enCours: true, etape: 'restaurants', restaurants: 9, traites: 3 } });
    // la ligne coupée est plus ancienne que la passe achevée du premier test : on la rend la plus récente
    await db.update(jobRuns).set({ startedAt: new Date(Date.now() - 86_400_000) }).where(eq(jobRuns.status, 'ok'));
    await db.update(jobRuns).set({ startedAt: new Date(Date.now() - 86_400_000) }).where(eq(jobRuns.status, 'partial'));
    const sante = (await jobHealth()).daily;
    expect(sante.state).toBe('degraded');
    expect(sante.lastRun?.status).toBe('interrompue');
    expect(sante.lastRun?.error).toMatch(/Passe interrompue/);
    expect(sante.lastRun?.error).toMatch(/3 restaurant\(s\) traité\(s\) sur 9/);
    expect(sante.lastRun?.error).toMatch(/arrêtée après 52 s/);
    // la page de statut publique dit « dégradée » sans le détail
    const publique = publicJobHealth({ daily: sante }).daily;
    expect(publique.state).toBe('degraded'); expect(publique.lastRun?.error).toBeNull(); expect(publique.lastRun?.summary).toBeNull();
    const statut = await appel('GET', '/api/status');
    expect(statut.json.checks.jobs.daily.state).toBe('degraded');
    expect(statut.text).not.toContain('restaurant(s) traité(s)');
  });

  it('une passe réellement en cours ne déclenche pas de fausse alerte : on juge sur le dernier passage achevé', async () => {
    const db = await getDb();
    await db.delete(jobRuns).where(eq(jobRuns.job, 'daily'));
    const hier = new Date(Date.now() - 20 * 3_600_000);
    await db.insert(jobRuns).values({ job: 'daily', status: 'ok', startedAt: hier, finishedAt: hier, durationMs: 9_000, summary: { count: 2 } });
    const maintenant = new Date(Date.now() - 10_000);
    await db.insert(jobRuns).values({ job: 'daily', status: 'running', startedAt: maintenant, finishedAt: maintenant, durationMs: 0, summary: { enCours: true, etape: 'restaurants', restaurants: 2, traites: 0 } });
    const sante = (await jobHealth()).daily;
    expect(sante.state).toBe('ok');
    expect(sante.lastRun?.status).toBe('ok');
  });
});
