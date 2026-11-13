// Chantier P0.4 — LA PASSE QUOTIDIENNE : UNE PAR JOUR, PAR TRANCHES, REPRISE SANS DOUBLON.
//
// Constat de production (2026-11-12) : aucune passe quotidienne complète enregistrée depuis le
// 2026-09-23. La passe traitait tout en une seule invocation, sans regarder l'heure, et n'écrivait sa
// trace qu'à la fin : coupée par la durée maximale d'une fonction, elle ne laissait rien et n'était
// jamais reprise.
//
// Ces tests vérifient, sur une vraie base (PostgreSQL embarqué) et de vrais envois (boîte d'envoi sur
// disque) :
//   - une passe par jour : un second déclenchement ne renvoie aucun mail ;
//   - le découpage en tranches : chaque tranche avance, la suivante reprend, aucun mail en double ;
//   - deux déclenchements simultanés : un seul travaille ;
//   - une passe coupée est reprise ; ce qui la fait tomber deux fois est écarté, pas les autres ;
//   - une invocation dessaisie s'arrête ;
//   - la supervision distingue « en cours », « interrompue », « incomplète » et « achevée » ;
//   - l'enchaînement des tranches par un vrai appel HTTP de l'API à elle-même.
//
// Ce qu'ils ne prouvent PAS : le comportement sur la plateforme d'hébergement (durée réelle des
// requêtes vers la base, appel de l'API à elle-même en production). Cela se vérifie sur le
// déploiement, dans les journaux de la plateforme et dans /api/status.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { and, desc, eq, sql } from 'drizzle-orm';
import { serve } from '@hono/node-server';
import { runMigrations, getDb, jobRuns } from '@afrisupply/db';
import { app } from '../app.js';
import { runDailyForAll, dailyPending, dailyBudgetMs, dailyLeaseMs, FUNCTION_MAX_MS, MAX_COUPURES, ETAPES_PASSE } from '../jobs/daily.js';
import { selfUrl, poursuivreLaPasse, maxTranches } from '../routes/jobs.js';
import { jobHealth, publicJobHealth, RUNNING_GRACE_MS } from '../lib/ops-health.js';
import { creerAppel, inscrire, type Compte } from './aide-comptes.js';

const BOITE = '/tmp/afs-outbox-p0-passe'; const SAUVEGARDES = '/tmp/afs-backups-p0-passe';
const SECRET = 'secret-des-taches-de-test';
process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.DATABASE_URL = '';
process.env.PGLITE_DIR = 'memory://p0-passe'; process.env.MAIL_OUTBOX_DIR = BOITE; process.env.BACKUP_DIR = SAUVEGARDES;
process.env.CRON_SECRET = SECRET;
for (const k of ['RESEND_API_KEY', 'BACKUP_S3_ENDPOINT', 'VERCEL', 'VERCEL_ENV', 'DAILY_BUDGET_MS', 'DAILY_LEASE_MS', 'JOBS_SELF_URL', 'AFS_SELF_URL', 'ADMIN_EMAILS']) delete process.env[k];

const appel = creerAppel(app);
const cron = { 'x-cron-secret': SECRET };
const comptes: Compte[] = [];

/** Jour simulé n° k (à partir de demain) : chaque scénario a sa propre passe. */
const jourN = (k: number) => new Date(Date.now() + k * 86_400_000);
const cle = (d: Date) => d.toISOString().slice(0, 10);
const lignesDu = async (d: Date) => (await getDb()).select().from(jobRuns).where(and(eq(jobRuns.job, 'daily'), sql`${jobRuns.summary}->>'jour' = ${cle(d)}`)).orderBy(desc(jobRuns.startedAt));

/** Mails du matin réellement déposés, par destinataire. */
const matins = (): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const f of readdirSync(BOITE).filter((x) => x.endsWith('.txt'))) {
    const t = readFileSync(path.join(BOITE, f), 'utf8');
    if (!/^Subject: ☀️ Votre matin AFRISUPPLY/m.test(t)) continue;
    const to = /^To: (.+)$/m.exec(t)?.[1] ?? '?'; out[to] = (out[to] ?? 0) + 1;
  }
  return out;
};
/** Mails du matin reçus depuis `avant`, pour chaque compte de test (dans l'ordre des comptes). */
const recusDepuis = (avant: Record<string, number>) => { const apres = matins(); return comptes.map((c) => (apres[c.email] ?? 0) - (avant[c.email] ?? 0)); };

/** Journal d'une passe arrêtée, tel que l'aurait laissé une invocation précédente. */
const journalArrete = (d: Date, extra: Record<string, unknown> = {}) => ({
  jour: cle(d), enCours: true, etape: 'restaurants', restaurants: comptes.length, traites: 0, tranches: 1, jeton: 'jeton-de-l-invocation-coupee',
  bailJusqua: new Date(Date.now() - 1_000).toISOString(), travailMs: 52_000, enCoursPour: null, coupures: {}, ecartes: [], results: [], sauvegardes: {}, etapes: {}, durees: {}, ...extra,
});
const deposer = async (summary: Record<string, unknown>, quand = new Date(Date.now() - 120_000)) => {
  const [l] = await (await getDb()).insert(jobRuns).values({ job: 'daily', status: 'running', startedAt: quand, finishedAt: new Date(quand.getTime() + 52_000), durationMs: 52_000, summary }).returning();
  return l;
};

beforeAll(async () => {
  rmSync(BOITE, { recursive: true, force: true }); rmSync(SAUVEGARDES, { recursive: true, force: true }); mkdirSync(BOITE, { recursive: true });
  await runMigrations();
  comptes.push(await inscrire(appel, 'patron-un@resto.test', 'Restaurant Un'));
  comptes.push(await inscrire(appel, 'patron-deux@resto.test', 'Restaurant Deux'));
  comptes.push(await inscrire(appel, 'patron-trois@resto.test', 'Restaurant Trois'));
}, 60_000);

describe('une passe par jour', () => {
  const J = jourN(1);

  it('une passe achevée laisse UNE ligne au statut final, avec le résultat de chaque restaurant, et un mail par restaurant', async () => {
    const avant = matins();
    const r = await runDailyForAll({ now: J });
    expect(r.complete).toBe(true); expect(r.count).toBe(3); expect(r.sent).toBe(3); expect(r.tranches).toBe(1);
    expect(r.remaining).toEqual({ restaurants: 0, etapes: [] });
    expect(recusDepuis(avant)).toEqual([1, 1, 1]);
    const lignes = await lignesDu(J);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].status).toBe('ok');
    const resume = lignes[0].summary as Record<string, unknown> & { results: { restaurantId: string; ms: number }[] };
    expect(resume.count).toBe(3); expect(resume.results).toHaveLength(3);
    expect(resume.results.map((x) => x.restaurantId).sort()).toEqual(comptes.map((c) => c.rid).sort());
    // le journal de travail a bien été remplacé par le résultat : plus de bail, plus de jeton, plus « en cours »
    for (const k of ['enCours', 'jeton', 'bailJusqua', 'enCoursPour', 'etapes']) expect(resume[k], k).toBeUndefined();
    // les étapes globales ont toutes eu lieu, et leur résultat est dans le résumé
    for (const k of ['billing', 'reminders', 'payments', 'recurring', 'backup', 'offsite', 'watchdog']) expect(resume[k], k).toBeDefined();
    expect((resume.backup as { written: number }).written).toBe(3);
    expect(lignes[0].durationMs).toBeGreaterThan(0);
    // le journal ne contient aucune adresse e-mail (il est lu par la supervision)
    expect(JSON.stringify(resume)).not.toContain('@resto.test');
  }, 60_000);

  it('un second déclenchement le même jour ne refait RIEN : aucun mail, aucune ligne, et il le dit', async () => {
    const avant = matins();
    const r = await runDailyForAll({ now: J });
    expect(r.alreadyComplete).toBe(true); expect(r.complete).toBe(true); expect(r.progressed).toBe(false);
    expect(r.count).toBe(3); expect(r.sent).toBe(3);
    expect(recusDepuis(avant)).toEqual([0, 0, 0]);
    expect(await lignesDu(J)).toHaveLength(1);
    expect(await dailyPending(J)).toBe('faite');
  }, 60_000);

  it('« force » relance volontairement une passe : nouvelle ligne, nouveaux mails', async () => {
    const avant = matins();
    const r = await runDailyForAll({ now: J, force: true });
    expect(r.complete).toBe(true); expect(r.alreadyComplete).toBeUndefined(); expect(r.progressed).toBe(true);
    expect(recusDepuis(avant)).toEqual([1, 1, 1]);
    expect(await lignesDu(J)).toHaveLength(2);
  }, 60_000);

  it('une simulation (dryRun) n’écrit aucune trace et n’envoie aucun mail', async () => {
    const D = jourN(2); const avant = matins();
    const r = await runDailyForAll({ dryRun: true, now: D });
    expect(r.dryRun).toBe(true); expect(r.count).toBe(3);
    expect(await lignesDu(D)).toHaveLength(0);
    expect(recusDepuis(avant)).toEqual([0, 0, 0]);
    expect(await dailyPending(D)).toBe('absente');
  }, 60_000);
});

describe('budget de temps : la passe se fait par tranches et se reprend', () => {
  const J = jourN(3);

  it('chaque tranche avance d’au moins une unité, la suivante reprend, et chaque restaurant reçoit UN seul mail', async () => {
    const avant = matins();
    // Budget minuscule : chaque invocation fait exactement une unité de travail puis rend la main.
    const un = await runDailyForAll({ now: J, budgetMs: 1 });
    expect(un.complete).toBe(false); expect(un.progressed).toBe(true); expect(un.resumed).toBe(false);
    expect(un.count).toBe(1); expect(un.remaining.restaurants).toBe(2);
    expect(un.remaining.etapes).toEqual([...ETAPES_PASSE]);
    // entre deux tranches : ligne « running », bail relâché (la reprise peut être immédiate), rien « en cours »
    const [suspendue] = await lignesDu(J);
    expect(suspendue.status).toBe('running');
    const j = suspendue.summary as { bailJusqua: string | null; enCoursPour: string | null; traites: number; restaurants: number };
    expect(j.bailJusqua).toBeNull(); expect(j.enCoursPour).toBeNull(); expect(j.traites).toBe(1); expect(j.restaurants).toBe(3);
    expect(await dailyPending(J)).toBe('a-reprendre');

    let r = un; let appels = 1;
    while (!r.complete && appels < 40) {
      const avantTranche = r.count + (ETAPES_PASSE.length - r.remaining.etapes.length);
      r = await runDailyForAll({ now: J, budgetMs: 1 }); appels++;
      expect(r.resumed).toBe(true); expect(r.progressed).toBe(true);
      expect(r.count + (ETAPES_PASSE.length - r.remaining.etapes.length)).toBeGreaterThanOrEqual(avantTranche);
    }
    expect(r.complete).toBe(true);
    expect(appels).toBeGreaterThan(3);              // la passe a réellement été découpée
    expect(r.tranches).toBe(appels);
    expect(r.count).toBe(3); expect(r.sent).toBe(3);
    // AUCUN doublon : un mail du matin par restaurant, malgré une douzaine d'invocations
    expect(recusDepuis(avant)).toEqual([1, 1, 1]);
    const lignes = await lignesDu(J);
    expect(lignes).toHaveLength(1);                // une passe = une ligne, quel que soit le nombre de tranches
    expect(lignes[0].status).toBe('ok');
    const resume = lignes[0].summary as { tranches: number; backup: { written: number }; results: unknown[] };
    expect(resume.tranches).toBe(appels); expect(resume.backup.written).toBe(3); expect(resume.results).toHaveLength(3);
    // les résultats rendus par la dernière tranche couvrent TOUS les restaurants, pas seulement les siens
    expect(r.results.map((x) => x.restaurantId).sort()).toEqual(comptes.map((c) => c.rid).sort());
  }, 120_000);

  it('sans budget (serveur autonome) la passe se fait en une fois ; sur la plateforme, le budget tient dans la durée d’une fonction', () => {
    expect(dailyBudgetMs()).toBe(Number.POSITIVE_INFINITY);
    const vercel = JSON.parse(readFileSync(new URL('../../../../vercel.json', import.meta.url), 'utf8')) as { functions: Record<string, { maxDuration: number }> };
    // la constante du code et la configuration de la plateforme disent la même chose
    expect(vercel.functions['api/index.js'].maxDuration * 1000).toBe(FUNCTION_MAX_MS);
    process.env.VERCEL = '1';
    try {
      // il reste au moins 20 s à l'unité en cours pour finir après l'épuisement du budget
      expect(dailyBudgetMs()).toBeLessThanOrEqual(FUNCTION_MAX_MS - 20_000);
      // le bail dépasse la durée maximale : une invocation vivante n'est jamais prise pour morte
      expect(dailyLeaseMs()).toBeGreaterThan(FUNCTION_MAX_MS);
      process.env.DAILY_BUDGET_MS = '12000';
      expect(dailyBudgetMs()).toBe(12_000);
      process.env.DAILY_BUDGET_MS = 'n-importe-quoi';
      expect(dailyBudgetMs()).toBe(35_000);        // une valeur illisible ne désactive pas le budget
    } finally { delete process.env.VERCEL; delete process.env.DAILY_BUDGET_MS; }
  });
});

describe('un seul ouvrier à la fois', () => {
  it('deux déclenchements simultanés : un seul travaille, l’autre le dit, et chaque restaurant reçoit UN mail', async () => {
    const J = jourN(4); const avant = matins();
    const [a, b] = await Promise.all([runDailyForAll({ now: J }), runDailyForAll({ now: J })]);
    const ecartes = [a, b].filter((x) => x.runningElsewhere);
    const ouvriers = [a, b].filter((x) => !x.runningElsewhere);
    expect(ecartes).toHaveLength(1); expect(ouvriers).toHaveLength(1);
    expect(ecartes[0].complete).toBe(false); expect(ecartes[0].progressed).toBe(false);
    expect(ouvriers[0].complete).toBe(true); expect(ouvriers[0].sent).toBe(3);
    expect(recusDepuis(avant)).toEqual([1, 1, 1]);
    expect(await lignesDu(J)).toHaveLength(1);
  }, 60_000);

  it('une passe tenue par une invocation vivante n’est pas reprise — même avec « force »', async () => {
    const J = jourN(5); const avant = matins();
    await deposer(journalArrete(J, { bailJusqua: new Date(Date.now() + 60_000).toISOString() }));
    expect(await dailyPending(J)).toBe('en-cours');
    for (const force of [false, true]) {
      const r = await runDailyForAll({ now: J, force });
      expect(r.runningElsewhere).toBe(true); expect(r.complete).toBe(false); expect(r.progressed).toBe(false);
    }
    expect(recusDepuis(avant)).toEqual([0, 0, 0]);
    expect(await lignesDu(J)).toHaveLength(1);
  }, 60_000);

  it('une invocation dessaisie (son jeton a été remplacé) s’arrête à sa prochaine écriture, sans clore la passe', async () => {
    const J = jourN(6); const db = await getDb();
    const passe = runDailyForAll({ now: J });
    // Pendant que la passe travaille, une autre invocation la « prend » (bail jugé expiré) : on le simule
    // en remplaçant le jeton dès que la ligne existe.
    let vol = false;
    for (let i = 0; i < 2_000 && !vol; i++) {
      const [l] = await lignesDu(J);
      if (l) { await db.update(jobRuns).set({ summary: { ...(l.summary as object), jeton: 'jeton-du-repreneur', bailJusqua: null } }).where(eq(jobRuns.id, l.id)); vol = true; }
    }
    expect(vol).toBe(true);
    const r = await passe;
    expect(r.complete).toBe(false); expect(r.runningElsewhere).toBe(true);
    const [l] = await lignesDu(J);
    expect(l.status).toBe('running');                                           // elle n'a PAS clos la passe
    expect((l.summary as { jeton: string }).jeton).toBe('jeton-du-repreneur');  // ni réécrit le journal du repreneur
    // La reprise termine la passe. Garantie « au moins une fois » : le restaurant en cours au moment du
    // dessaisissement peut être retraité (un mail en double, pour lui seul) — jamais plus.
    const avant = matins();
    const fin = await runDailyForAll({ now: J });
    expect(fin.complete).toBe(true); expect(fin.count).toBe(3);
    expect(recusDepuis(avant).every((n) => n <= 1)).toBe(true);
  }, 60_000);
});

describe('une passe coupée est reprise ; ce qui la fait tomber deux fois est écarté', () => {
  it('reprise après une coupure : les restaurants déjà traités ne le sont pas à nouveau, celui qui était en cours passe en dernier', async () => {
    const J = jourN(7); const avant = matins(); const [un, deux, trois] = comptes;
    await deposer(journalArrete(J, {
      traites: 1, enCoursPour: deux.rid,
      results: [{ restaurantId: un.rid, name: 'Restaurant Un', digest: 'sent', alerts: 0, autoReorder: 0, ms: 900 }],
    }));
    expect(await dailyPending(J)).toBe('a-reprendre');
    const r = await runDailyForAll({ now: J });
    expect(r.resumed).toBe(true); expect(r.complete).toBe(true); expect(r.tranches).toBe(2);
    expect(r.count).toBe(3); expect(r.sent).toBe(3);
    // « un » avait déjà son mail : il n'en reçoit pas un second
    expect(recusDepuis(avant)).toEqual([0, 1, 1]);
    // « deux » était en cours au moment de la coupure : il est traité après « trois »
    expect(r.results.map((x) => x.restaurantId)).toEqual([un.rid, trois.rid, deux.rid]);
    const [l] = await lignesDu(J);
    expect(l.status).toBe('ok');
    expect((l.summary as { coupures: Record<string, number> }).coupures).toEqual({ [deux.rid]: 1 });
    // le temps de travail des tranches s'additionne (52 s avant la coupure + cette tranche)
    expect(l.durationMs).toBeGreaterThan(52_000);
  }, 60_000);

  it(`un restaurant qui a fait tomber la passe ${MAX_COUPURES} fois est écarté et signalé — les autres reçoivent leur mail`, async () => {
    const J = jourN(8); const avant = matins(); const [un, deux, trois] = comptes;
    await deposer(journalArrete(J, { enCoursPour: deux.rid, coupures: { [deux.rid]: MAX_COUPURES - 1 } }));
    const r = await runDailyForAll({ now: J });
    expect(r.complete).toBe(true); expect(r.count).toBe(3); expect(r.sent).toBe(2); expect(r.errors).toBe(1);
    expect(recusDepuis(avant)).toEqual([1, 0, 1]);
    const ecarte = r.results.find((x) => x.restaurantId === deux.rid)!;
    expect(ecarte.digest).toBe('error'); expect(ecarte.error).toMatch(/écarté\(e\) de la passe/);
    expect(r.results.find((x) => x.restaurantId === un.rid)!.digest).toBe('sent');
    expect(r.results.find((x) => x.restaurantId === trois.rid)!.digest).toBe('sent');
    const [l] = await lignesDu(J);
    expect(l.status).toBe('partial');                      // la passe est achevée, mais pas « ok »
    expect(l.error).toMatch(/Restaurant Deux: restaurant écarté/);
    expect((l.summary as { ecartes: string[] }).ecartes).toEqual([deux.rid]);
    // la supervision le voit
    expect((l.summary as { backup: { written: number } }).backup.written).toBe(3);   // …et sa sauvegarde a tout de même été faite
  }, 60_000);

  it('une étape globale qui a fait tomber la passe deux fois est écartée : les étapes suivantes ont lieu, la passe finit « partial »', async () => {
    const J = jourN(9); const [un, deux, trois] = comptes;
    await deposer(journalArrete(J, {
      traites: 3, etape: 'recurring', enCoursPour: 'etape:recurring', coupures: { 'etape:recurring': MAX_COUPURES - 1 },
      results: [un, deux, trois].map((c) => ({ restaurantId: c.rid, name: c.email, digest: 'sent', alerts: 0, autoReorder: 0 })),
      etapes: { billing: { trialsExpired: 0, reminders: 0, enforced: false }, pilotReport: null },
    }));
    const avant = matins();
    const r = await runDailyForAll({ now: J });
    expect(r.complete).toBe(true);
    expect(recusDepuis(avant)).toEqual([0, 0, 0]);                 // les restaurants étaient faits : aucun mail
    expect((r.recurring as { error: string }).error).toMatch(/étape « recurring » écarté\(e\)/);
    expect(r.backup).toBeDefined(); expect(r.watchdog).toBeDefined(); expect(r.payments).toBeDefined();
    const [l] = await lignesDu(J);
    expect(l.status).toBe('partial');
    expect((l.summary as { ecartes: string[] }).ecartes).toEqual(['etape:recurring']);
  }, 60_000);
});

describe('déclencheurs HTTP', () => {
  it('le cron des rappels REPREND une passe du jour inachevée — mais ne démarre jamais une passe absente', async () => {
    // aucune passe aujourd'hui : les rappels ne la démarrent pas
    expect(await dailyPending()).toBe('absente');
    const sans = await appel('POST', '/api/jobs/reminders', undefined, cron);
    expect(sans.status).toBe(200); expect(sans.json.daily).toBeUndefined();
    expect(await dailyPending()).toBe('absente');
    // une tranche, puis plus rien (la suite n'est pas partie) : le passage des rappels reprend
    const avant = matins();
    const un = await runDailyForAll({ budgetMs: 1 });
    expect(un.complete).toBe(false); expect(await dailyPending()).toBe('a-reprendre');
    const rappels = await appel('POST', '/api/jobs/reminders', undefined, cron);
    expect(rappels.status).toBe(200);
    expect(rappels.json.daily.reprise).toBe(true); expect(rappels.json.daily.complete).toBe(true);
    expect(rappels.json.daily.traites).toBe(3); expect(rappels.json.daily.tranches).toBe(2);
    expect(recusDepuis(avant)).toEqual([1, 1, 1]);
    expect(await dailyPending()).toBe('faite');
    // la passe est finie : un nouveau passage des rappels n'y touche plus
    const encore = await appel('POST', '/api/jobs/reminders', undefined, cron);
    expect(encore.json.daily).toBeUndefined();
  }, 60_000);

  it('GET /api/jobs/daily : une passe par jour ; « force=1 » relance ; le secret reste exigé', async () => {
    expect((await appel('GET', '/api/jobs/daily')).status).toBe(401);
    expect((await appel('GET', '/api/jobs/daily?force=1')).status).toBe(401);
    const avant = matins();
    const deja = await appel('GET', '/api/jobs/daily', undefined, cron);
    expect(deja.status).toBe(200); expect(deja.json.alreadyComplete).toBe(true); expect(deja.json.complete).toBe(true);
    expect(deja.json.continuation).toBeUndefined();
    expect(recusDepuis(avant)).toEqual([0, 0, 0]);
    const force = await appel('GET', '/api/jobs/daily?force=1', undefined, cron);
    expect(force.status).toBe(200); expect(force.json.complete).toBe(true); expect(force.json.alreadyComplete).toBeUndefined();
    expect(force.json.sent).toBe(3);
    expect(recusDepuis(avant)).toEqual([1, 1, 1]);
  }, 60_000);

  it('adresse de rappel : explicite, domaine de production sur la plateforme, jamais en prévisualisation', () => {
    expect(selfUrl({})).toBeNull();
    expect(selfUrl({ AFS_SELF_URL: 'http://127.0.0.1:8787' })).toBe('http://127.0.0.1:8787');
    expect(selfUrl({ JOBS_SELF_URL: 'https://api.exemple.fr/', AFS_SELF_URL: 'http://127.0.0.1:8787' })).toBe('https://api.exemple.fr');
    expect(selfUrl({ VERCEL: '1', VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'app.exemple.fr' })).toBe('https://app.exemple.fr');
    // prévisualisation : déploiement protégé, aucun cron — pas de rappel, même si le domaine de production est connu
    expect(selfUrl({ VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_PROJECT_PRODUCTION_URL: 'app.exemple.fr' })).toBeNull();
    // sur la plateforme, l'adresse locale d'un serveur autonome n'a aucun sens
    expect(selfUrl({ VERCEL: '1', VERCEL_ENV: 'production', AFS_SELF_URL: 'http://127.0.0.1:8787' })).toBeNull();
    // une valeur qui n'est pas une adresse http(s) est ignorée
    expect(selfUrl({ JOBS_SELF_URL: 'javascript:alert(1)' })).toBeNull();
  });

  it('la suite n’est lancée que si elle sert à quelque chose', async () => {
    const base = { dryRun: false, complete: false, progressed: true, tranches: 2 };
    expect(await poursuivreLaPasse({ ...base, complete: true })).toBeUndefined();
    expect(await poursuivreLaPasse({ ...base, dryRun: true })).toBeUndefined();
    expect(await poursuivreLaPasse({ ...base, runningElsewhere: true })).toMatch(/non lancée : une autre invocation/);
    expect(await poursuivreLaPasse({ ...base, progressed: false })).toMatch(/non lancée : cette tranche n'a rien fait avancer/);
    expect(await poursuivreLaPasse({ ...base, tranches: maxTranches() })).toMatch(/non lancée : \d+ tranches déjà enchaînées/);
    // l'API ne connaît pas sa propre adresse (cas de ces tests : aucune variable posée)
    expect(await poursuivreLaPasse(base)).toMatch(/non lancée : l'API ne connaît pas sa propre adresse/);
  });
});

describe('enchaînement réel : l’API se rappelle elle-même par HTTP', () => {
  let serveur: ReturnType<typeof serve>; let base = '';
  beforeAll(async () => {
    await new Promise<void>((ok) => { serveur = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => { base = `http://127.0.0.1:${info.port}`; ok(); }); });
    process.env.AFS_SELF_URL = base; process.env.DAILY_BUDGET_MS = '1';
  });
  afterAll(async () => { delete process.env.AFS_SELF_URL; delete process.env.DAILY_BUDGET_MS; await new Promise((ok) => serveur.close(() => ok(null))); });

  it('UN seul appel du planificateur suffit : les tranches s’enchaînent jusqu’à la fin de la passe, sans doublon', async () => {
    const avant = matins(); const lignesAvant = (await lignesDu(new Date())).length;
    // Le planificateur appelle une fois. (« force » : la passe du jour a déjà eu lieu dans les tests précédents.)
    const res = await fetch(`${base}/api/jobs/daily?force=1`, { headers: cron });
    expect(res.status).toBe(200);
    const un = await res.json() as { complete: boolean; count: number; tranches: number; continuation?: string };
    expect(un.complete).toBe(false); expect(un.count).toBe(1); expect(un.tranches).toBe(1);
    expect(un.continuation).toBe('lancée');
    // Aucun autre appel de notre part : on attend seulement que la passe se termine d'elle-même.
    let l: Awaited<ReturnType<typeof lignesDu>>[number] | undefined;
    for (let i = 0; i < 300; i++) {
      [l] = await lignesDu(new Date());
      if (l && l.status !== 'running') break;
      await new Promise((ok) => setTimeout(ok, 100));
    }
    expect(l!.status).toBe('ok');
    const resume = l!.summary as { tranches: number; count: number; sent: number; backup: { written: number } };
    expect(resume.tranches).toBeGreaterThan(3);          // plusieurs invocations HTTP distinctes
    expect(resume.count).toBe(3); expect(resume.sent).toBe(3); expect(resume.backup.written).toBe(3);
    expect(recusDepuis(avant)).toEqual([1, 1, 1]);       // un mail par restaurant, pas un de plus
    expect((await lignesDu(new Date())).length).toBe(lignesAvant + 1);
    // l'enchaînement s'arrête de lui-même : aucune passe nouvelle n'apparaît ensuite
    await new Promise((ok) => setTimeout(ok, 2_000));
    expect((await lignesDu(new Date())).length).toBe(lignesAvant + 1);
    expect(recusDepuis(avant)).toEqual([1, 1, 1]);
  }, 90_000);

  it('un appel de suite sans le secret est refusé (la route reste protégée)', async () => {
    const res = await fetch(`${base}/api/jobs/daily`, { method: 'POST', headers: { 'x-afs-suite': '2' } });
    expect(res.status).toBe(401);
  });
});

describe('supervision : en cours, interrompue, incomplète, achevée', () => {
  const vider = async () => { await (await getDb()).delete(jobRuns).where(eq(jobRuns.job, 'daily')); };
  const ancien = () => new Date(Date.now() - RUNNING_GRACE_MS - 60_000);

  it('une passe COUPÉE en plein travail (bail jamais relâché) est signalée « interrompue », avec l’étape et l’unité en cours', async () => {
    await vider();
    await deposer(journalArrete(new Date(), { restaurants: 9, traites: 3, enCoursPour: 'restaurant-qui-etait-en-cours', bailJusqua: new Date(ancien().getTime() + 75_000).toISOString() }), ancien());
    const sante = (await jobHealth()).daily;
    expect(sante.state).toBe('degraded');
    expect(sante.lastRun?.status).toBe('interrompue');
    expect(sante.lastRun?.error).toMatch(/Passe interrompue/);
    expect(sante.lastRun?.error).toMatch(/3 restaurant\(s\) traité\(s\) sur 9/);
    expect(sante.lastRun?.error).toMatch(/arrêtée après 52 s de travail/);
    expect(sante.lastRun?.error).toMatch(/pendant le traitement de « restaurant-qui-etait-en-cours »/);
    // la page de statut publique dit « dégradée » sans le détail
    const publique = publicJobHealth({ daily: sante }).daily;
    expect(publique.state).toBe('degraded'); expect(publique.lastRun?.error).toBeNull(); expect(publique.lastRun?.summary).toBeNull();
    const statut = await appel('GET', '/api/status');
    expect(statut.json.checks.jobs.daily.state).toBe('degraded');
    expect(statut.text).not.toContain('restaurant(s) traité(s)');
    expect(statut.text).not.toContain('restaurant-qui-etait-en-cours');
  });

  it('une passe SUSPENDUE (budget épuisé) que personne n’a reprise est signalée « incomplète »', async () => {
    await vider();
    await deposer(journalArrete(new Date(), { restaurants: 9, traites: 4, tranches: 2, bailJusqua: null }), ancien());
    const sante = (await jobHealth()).daily;
    expect(sante.state).toBe('degraded');
    expect(sante.lastRun?.status).toBe('incomplete');
    expect(sante.lastRun?.error).toMatch(/Passe incomplète/);
    expect(sante.lastRun?.error).toMatch(/4 restaurant\(s\) traité\(s\) sur 9, 2 tranches/);
    expect(sante.lastRun?.error).toMatch(/pas encore reprise/);
  });

  it('toute première passe, en cours : la tâche n’est pas déclarée « jamais passée » (pas de fausse alerte « cron non branché »)', async () => {
    await vider();
    await deposer(journalArrete(new Date(), { bailJusqua: new Date(Date.now() + 60_000).toISOString() }), new Date(Date.now() - 20_000));
    const db = await getDb();
    await db.update(jobRuns).set({ finishedAt: new Date(Date.now() - 2_000) }).where(eq(jobRuns.job, 'daily'));   // journal écrit il y a 2 s
    const sante = (await jobHealth()).daily;
    expect(sante.state).toBe('ok');
    expect(sante.lastRun?.status).toBe('running');
    // …mais si elle se tait plus de cinq minutes, elle est signalée
    await db.update(jobRuns).set({ finishedAt: ancien() }).where(eq(jobRuns.job, 'daily'));
    expect((await jobHealth()).daily.state).toBe('degraded');
  });

  it('une passe réellement en cours ne déclenche pas de fausse alerte : on juge sur le dernier passage achevé', async () => {
    await vider(); const db = await getDb();
    const hier = new Date(Date.now() - 20 * 3_600_000);
    await db.insert(jobRuns).values({ job: 'daily', status: 'ok', startedAt: hier, finishedAt: hier, durationMs: 9_000, summary: { count: 2 } });
    // démarrée il y a 20 minutes, mais son journal a été écrit il y a 10 secondes : elle vit (passe en plusieurs tranches)
    const debut = new Date(Date.now() - 20 * 60_000);
    await db.insert(jobRuns).values({ job: 'daily', status: 'running', startedAt: debut, finishedAt: new Date(Date.now() - 10_000), durationMs: 300_000, summary: journalArrete(new Date(), { tranches: 9, bailJusqua: null }) });
    const sante = (await jobHealth()).daily;
    expect(sante.state).toBe('ok');
    expect(sante.lastRun?.status).toBe('ok');
  });
});
