// Chantiers P0.2 / P0.4 — CONFIGURATION ET ENVIRONNEMENTS.
//
//   1. secret de session : aucune valeur de repli en production (avant : une chaîne publique du dépôt) ;
//   2. même règle sur Vercel que sur le serveur autonome : configuration dangereuse → l'API ne sert pas ;
//   3. prévisualisation Vercel : jamais la base de production, jamais de migration au build ;
//   4. migrations : le build de production contrôle sans écrire ; l'état réel de la base est lisible.
//
// Tout est vérifié ici sans service externe. Ce fichier ne prouve PAS que les variables sont
// correctement posées dans Vercel ni que la base Neon est à jour (fiches VERCEL-01 et NEON-01).
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { runMigrations, getDb, getDatabaseUrl, databaseUnavailableReason, migrationStatus, describeMigrationStatus, databaseRegion, regionCheck } from '@afrisupply/db';
import { app } from '../app.js';
import { checkSecureConfig, configGateState, jwtSecretProblem, sameSecret, cronSecretCheck } from '../lib/security.js';
import { signToken, verifyToken, UnsafeConfigError } from '../lib/auth.js';
import { clerkAuthorizedParties, clerkSettings } from '../lib/clerk.js';
import { _resetSchemaCache } from '../routes/status.js';
import { creerAppel } from './aide-comptes.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.DATABASE_URL = '';
process.env.PGLITE_DIR = 'memory://p0-config'; process.env.MAIL_OUTBOX_DIR = '/tmp/afs-outbox-p0-config';

const appel = creerAppel(app);
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SECRET_SUR = 'un-secret-de-session-aleatoire-de-quarante-caracteres';
const prod = { NODE_ENV: 'production', JWT_SECRET: SECRET_SUR, DATABASE_URL: 'postgresql://app:motdepasse@prod.exemple.neon.tech/afrisupply', CRON_SECRET: 'c', ADMIN_EMAILS: 'a@b.fr', RESEND_API_KEY: 'r', APP_URL: 'https://app.exemple.test' } as NodeJS.ProcessEnv;

const sauvegarde = { ...process.env };
afterEach(() => { for (const k of Object.keys(process.env)) if (!(k in sauvegarde)) delete process.env[k]; Object.assign(process.env, sauvegarde); });

beforeAll(async () => { await runMigrations(); }, 60_000);

describe('1. Secret de session', () => {
  it('un secret absent, court ou d’exemple est un problème', () => {
    expect(jwtSecretProblem(undefined)).toMatch(/absent/);
    expect(jwtSecretProblem('  ')).toMatch(/absent/);
    expect(jwtSecretProblem('dev-secret-change-me-in-production')).toMatch(/trop faible/);
    expect(jwtSecretProblem('court')).toMatch(/trop faible/);
    expect(jwtSecretProblem(SECRET_SUR)).toBeNull();
  });

  it('en production, sans secret sûr, aucune session n’est signée ni vérifiée (plus de valeur de repli)', async () => {
    process.env.NODE_ENV = 'production';
    for (const valeur of [undefined, '', 'dev-secret-change-me-in-production', 'test-secret']) {
      if (valeur === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = valeur;
      await expect(signToken({ id: 'u', email: 'a@b.fr', fullName: 'A' })).rejects.toBeInstanceOf(UnsafeConfigError);
      await expect(verifyToken('a.b.c')).rejects.toBeInstanceOf(UnsafeConfigError);
    }
    process.env.JWT_SECRET = SECRET_SUR;
    const jeton = await signToken({ id: 'u', email: 'a@b.fr', fullName: 'A' });
    expect((await verifyToken(jeton))?.id).toBe('u');
  });

  it('un jeton fabriqué avec l’ancienne valeur publique de repli est refusé en production', async () => {
    const faux = await new SignJWT({ email: 'exploitant@afrisupply.fr', fullName: 'Faux', tv: 0 }).setProtectedHeader({ alg: 'HS256' })
      .setSubject('00000000-0000-4000-8000-000000000000').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode('dev-secret-change-me-in-production'));
    process.env.NODE_ENV = 'production'; process.env.JWT_SECRET = SECRET_SUR; process.env.DATABASE_URL = prod.DATABASE_URL;
    expect(await verifyToken(faux)).toBeNull();
    // …et si la production n'a pas de secret du tout, l'API ne répond pas à ce jeton : elle se déclare indisponible.
    delete process.env.JWT_SECRET;
    const rep = await appel('GET', '/api/auth/me', undefined, { authorization: `Bearer ${faux}` });
    expect(rep.status).toBe(503);
    expect(rep.json.code).toBe('config_unsafe');
  });

  it('seul l’algorithme HS256 est accepté (un jeton « alg: none » est refusé)', async () => {
    const corps = Buffer.from(JSON.stringify({ sub: 'u', tv: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const sansSignature = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${corps}.`;
    expect(await verifyToken(sansSignature)).toBeNull();
  });
});

describe('2. Même règle sur Vercel que sur le serveur autonome', () => {
  it('configuration saine : rien n’est bloqué', () => {
    expect(checkSecureConfig(prod).errors).toEqual([]);
    expect(configGateState(prod).blocked).toBe(false);
    expect(configGateState({ ...prod, VERCEL: '1', VERCEL_ENV: 'production' }).blocked).toBe(false);
  });

  it('en production, une configuration dangereuse bloque le service (secret, base, démonstration)', () => {
    expect(configGateState({ ...prod, JWT_SECRET: undefined }).blocked).toBe(true);
    expect(configGateState({ ...prod, JWT_SECRET: 'changeme' }).blocked).toBe(true);
    expect(configGateState({ ...prod, DATABASE_URL: '' }).blocked).toBe(true);
    expect(configGateState({ ...prod, SEED_DEMO: 'true' }).blocked).toBe(true);
    // hors production, les mêmes anomalies sont signalées sans bloquer le développeur
    expect(configGateState({ NODE_ENV: 'development', JWT_SECRET: 'changeme' }).blocked).toBe(false);
  });

  it('l’API ne sert plus aucune route tant que la configuration est dangereuse, et le dit sans la détailler', async () => {
    process.env.NODE_ENV = 'production'; process.env.JWT_SECRET = 'changeme'; process.env.DATABASE_URL = prod.DATABASE_URL;
    for (const [m, p] of [['GET', '/api/status'], ['POST', '/api/auth/login'], ['GET', '/api/stock'], ['GET', '/api/public/plans'], ['POST', '/api/auth/clerk-sync'], ['GET', '/api/jobs/daily']] as const) {
      const rep = await appel(m, p, m === 'POST' ? { email: 'a@b.fr', password: 'x' } : undefined);
      expect(rep.status, `${m} ${p}`).toBe(503);
      expect(rep.json.code).toBe('config_unsafe');
      expect(rep.text).not.toMatch(/JWT_SECRET|DATABASE_URL|changeme/);
    }
    const sante = await appel('GET', '/api/health');
    expect(sante.status).toBe(503);
    expect(sante.json).toMatchObject({ ok: false, config: 'a_corriger' });
    expect(sante.text).not.toMatch(/JWT_SECRET|changeme/);
  });

  it('une fois la configuration corrigée, le service répond de nouveau', async () => {
    process.env.NODE_ENV = 'production'; process.env.JWT_SECRET = SECRET_SUR; process.env.DATABASE_URL = prod.DATABASE_URL;
    const sante = await appel('GET', '/api/health');
    expect(sante.status).toBe(200);
    expect(sante.json).toMatchObject({ ok: true, config: 'ok' });
  });

  it('avertissements Clerk : clé de test en production, clé publique sans clé secrète, aucune origine autorisée', () => {
    const w = (env: NodeJS.ProcessEnv) => checkSecureConfig(env).warnings.join(' | ');
    // Levée des réserves : en production, des clés de développement ne valent plus un simple
    // avertissement « à remplacer » — la connexion Clerk est coupée, et l'avertissement le dit.
    expect(w({ ...prod, CLERK_SECRET_KEY: 'sk_test_abc' })).toMatch(/Clés Clerk de développement .* en production : connexion Clerk coupée/);
    expect(w({ ...prod, VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_abc', CLERK_SECRET_KEY: 'sk_live_abc' })).toMatch(/ne sont pas de la même sorte/);
    expect(w({ ...prod, VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_abc' })).toMatch(/CLERK_SECRET_KEY absent/);
    expect(w({ ...prod, APP_URL: undefined, CLERK_SECRET_KEY: 'sk_live_abc' })).toMatch(/sans origine autorisée/);
    expect(w({ ...prod, CLERK_SECRET_KEY: 'sk_live_abc', VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_abc' })).not.toMatch(/Clerk/);
  });

  it('origines autorisées pour Clerk : celles de la configuration et celles attribuées par la plateforme, rien d’autre', () => {
    expect(clerkAuthorizedParties({ ...prod })).toEqual(['https://app.exemple.test']);
    expect(clerkAuthorizedParties({ ...prod, APP_URL: undefined })).toEqual([]);
    expect(clerkAuthorizedParties({ ...prod, APP_URL: undefined, VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'afrisupply.exemple.app' })).toEqual(['https://afrisupply.exemple.app']);
    expect(clerkAuthorizedParties({ NODE_ENV: 'production', VERCEL_ENV: 'preview', VERCEL_URL: 'afrisupply-git-branche.exemple.app', VERCEL_PROJECT_PRODUCTION_URL: 'afrisupply.exemple.app' })).toEqual(['https://afrisupply-git-branche.exemple.app']);
    // l'adresse de l'API Clerk n'est modifiable qu'hors production (tests) : jamais en production
    expect(clerkSettings({ ...prod, CLERK_SECRET_KEY: 'sk_live_x', CLERK_API_URL: 'http://127.0.0.1:1' }).apiUrl).toBeUndefined();
    expect(clerkSettings({ NODE_ENV: 'test', CLERK_SECRET_KEY: 'sk_test_x', CLERK_API_URL: 'http://127.0.0.1:1' }).apiUrl).toBe('http://127.0.0.1:1');
  });

  it('secret des tâches planifiées : comparaison exacte, à temps constant, et refus si le secret n’est pas configuré', () => {
    expect(sameSecret('abc', 'abc')).toBe(true);
    expect(sameSecret('abc', 'abd')).toBe(false);
    expect(sameSecret('', '')).toBe(false);
    expect(sameSecret(undefined, 'abc')).toBe(false);
    expect(cronSecretCheck({ cron: 's' }, undefined, { CRON_SECRET: 's' })).toBe('ok');
    expect(cronSecretCheck({ authorization: 'Bearer s' }, undefined, { CRON_SECRET: 's' })).toBe('ok');
    expect(cronSecretCheck({}, 's', { CRON_SECRET: 's' })).toBe('ok');
    expect(cronSecretCheck({ cron: 'x' }, undefined, { CRON_SECRET: 's' })).toBe('refuse');
    expect(cronSecretCheck({ cron: '' }, undefined, {})).toBe('absent');
  });
});

describe('3. Prévisualisation Vercel : cloisonnée de la production', () => {
  const PROD_URL = 'postgresql://app:secret@prod.exemple.neon.tech/afrisupply';
  const PREVIEW_URL = 'postgresql://app:secret@preview.exemple.neon.tech/afrisupply';

  it('une prévisualisation ignore DATABASE_URL et n’utilise que PREVIEW_DATABASE_URL', () => {
    expect(getDatabaseUrl({ VERCEL_ENV: 'production', DATABASE_URL: PROD_URL })).toBe(PROD_URL);
    expect(getDatabaseUrl({ VERCEL_ENV: 'preview', DATABASE_URL: PROD_URL })).toBeUndefined();
    expect(getDatabaseUrl({ VERCEL_ENV: 'preview', DATABASE_URL: PROD_URL, PREVIEW_DATABASE_URL: PREVIEW_URL })).toBe(PREVIEW_URL);
    // la même adresse dans les deux variables est refusée : ce serait la base de production
    expect(getDatabaseUrl({ VERCEL_ENV: 'preview', DATABASE_URL: PROD_URL, PREVIEW_DATABASE_URL: PROD_URL })).toBeUndefined();
    expect(getDatabaseUrl({ DATABASE_URL: '  ' })).toBeUndefined();
  });

  it('sans base dédiée, la prévisualisation l’explique (et ne se rabat sur rien)', () => {
    expect(databaseUnavailableReason({ VERCEL: '1', VERCEL_ENV: 'preview', DATABASE_URL: PROD_URL })).toMatch(/PREVIEW_DATABASE_URL est absent/);
    expect(databaseUnavailableReason({ VERCEL: '1', VERCEL_ENV: 'preview', DATABASE_URL: PROD_URL, PREVIEW_DATABASE_URL: PROD_URL })).toMatch(/identique à DATABASE_URL/);
    expect(databaseUnavailableReason({ VERCEL: '1', VERCEL_ENV: 'production' })).toMatch(/DATABASE_URL est absent/);
    expect(databaseUnavailableReason({ VERCEL: '1', VERCEL_ENV: 'preview', PREVIEW_DATABASE_URL: PREVIEW_URL })).toBeNull();
    expect(databaseUnavailableReason({})).toBeNull();   // poste local : base embarquée
    // la configuration d'une prévisualisation sans base est une erreur bloquante : l'API répond 503
    expect(configGateState({ NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'preview', JWT_SECRET: SECRET_SUR, DATABASE_URL: PROD_URL }).blocked).toBe(true);
    expect(configGateState({ NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'preview', JWT_SECRET: SECRET_SUR, DATABASE_URL: PROD_URL, PREVIEW_DATABASE_URL: PREVIEW_URL }).blocked).toBe(false);
  });

  it('le contrôle de santé d’une prévisualisation sans base dit « aucune » (et non une base locale imaginaire)', async () => {
    process.env.NODE_ENV = 'production'; process.env.VERCEL = '1'; process.env.VERCEL_ENV = 'preview'; process.env.JWT_SECRET = SECRET_SUR; process.env.DATABASE_URL = PROD_URL;
    const sante = await appel('GET', '/api/health');
    expect(sante.status).toBe(503);
    expect(sante.json).toMatchObject({ ok: false, db: 'aucune', config: 'a_corriger', env: 'preview' });
    expect(sante.text).not.toContain('prod.exemple');
    expect((await appel('GET', '/api/public/plans')).status).toBe(503);
  });
});

describe('4. Migrations : contrôlées, jamais appliquées par surprise', () => {
  let decide: (env: Record<string, string | undefined>, argv?: string[]) => { action: string; reason: string };
  beforeAll(async () => { decide = (await import(/* @vite-ignore */ path.join(racine, 'scripts/deploy-migrate.mjs'))).decideMigrationAction; });
  const URL_BASE = 'postgresql://app:secret@prod.exemple.neon.tech/afrisupply';

  it('un build de prévisualisation ne touche jamais la base de production, même avec DATABASE_URL et une demande d’application', () => {
    expect(decide({ VERCEL: '1', VERCEL_ENV: 'preview', DATABASE_URL: URL_BASE }).action).toBe('skip');
    expect(decide({ VERCEL: '1', VERCEL_ENV: 'preview', DATABASE_URL: URL_BASE, MIGRATE_ON_BUILD: 'apply' }).action).toBe('skip');
    expect(decide({ VERCEL: '1', VERCEL_ENV: 'preview', DATABASE_URL: URL_BASE }, ['--apply']).action).toBe('skip');
    expect(decide({ VERCEL: '1', VERCEL_ENV: 'development', DATABASE_URL: URL_BASE }).action).toBe('skip');
    expect(decide({ VERCEL: '1', DATABASE_URL: URL_BASE }).action).toBe('skip');   // environnement Vercel inconnu : prudence
    // la même adresse placée dans PREVIEW_DATABASE_URL est refusée : ce serait la production
    expect(decide({ VERCEL: '1', VERCEL_ENV: 'preview', DATABASE_URL: URL_BASE, PREVIEW_DATABASE_URL: URL_BASE, MIGRATE_ON_BUILD: 'apply' }).action).toBe('skip');
  });

  it('avec une base DÉDIÉE, une prévisualisation la contrôle, et ne l’aligne que sur demande', () => {
    const PREVIEW = 'postgresql://app:secret@preview.exemple.neon.tech/afrisupply';
    expect(decide({ VERCEL: '1', VERCEL_ENV: 'preview', DATABASE_URL: URL_BASE, PREVIEW_DATABASE_URL: PREVIEW })).toMatchObject({ action: 'check', target: 'preview' });
    expect(decide({ VERCEL: '1', VERCEL_ENV: 'preview', DATABASE_URL: URL_BASE, PREVIEW_DATABASE_URL: PREVIEW, MIGRATE_ON_BUILD: 'apply' })).toMatchObject({ action: 'apply', target: 'preview' });
    expect(decide({ VERCEL: '1', VERCEL_ENV: 'preview', PREVIEW_DATABASE_URL: PREVIEW, SKIP_MIGRATE: '1' }).action).toBe('skip');
  });

  it('un build de production contrôle sans écrire ; l’application exige une demande explicite', () => {
    expect(decide({ VERCEL: '1', VERCEL_ENV: 'production', DATABASE_URL: URL_BASE })).toMatchObject({ action: 'check', target: 'production' });
    expect(decide({ VERCEL: '1', VERCEL_ENV: 'production', DATABASE_URL: URL_BASE, MIGRATE_ON_BUILD: 'apply' })).toMatchObject({ action: 'apply', target: 'production' });
    // en production, PREVIEW_DATABASE_URL n'est jamais regardée
    expect(decide({ VERCEL: '1', VERCEL_ENV: 'production', PREVIEW_DATABASE_URL: 'postgresql://x@preview/x' }).action).toBe('skip');
    expect(decide({ VERCEL: '1', VERCEL_ENV: 'production', DATABASE_URL: URL_BASE, SKIP_MIGRATE: '1', MIGRATE_ON_BUILD: 'apply' }).action).toBe('skip');
    expect(decide({ VERCEL: '1', VERCEL_ENV: 'production' }).action).toBe('skip');
    // à la main, hors Vercel : contrôle par défaut, application sur demande
    expect(decide({ DATABASE_URL: URL_BASE }).action).toBe('check');
    expect(decide({ DATABASE_URL: URL_BASE }, ['--apply']).action).toBe('apply');
  });

  it('le script exécuté en prévisualisation sort sans erreur et sans afficher l’adresse de la base', () => {
    const r = spawnSync('node', ['scripts/deploy-migrate.mjs'], { cwd: racine, encoding: 'utf8', env: { PATH: process.env.PATH, VERCEL: '1', VERCEL_ENV: 'preview', DATABASE_URL: URL_BASE } as NodeJS.ProcessEnv });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/aucune connexion à une base/);
    expect(r.stdout + r.stderr).not.toContain('prod.exemple');
  });

  it('l’état des migrations est lu dans la base : à jour après migration', async () => {
    const s = await migrationStatus();
    expect(s.state).toBe('a_jour');
    expect(s.expected).toBe(29); expect(s.applied).toBe(29);
    expect(s.pending).toEqual([]); expect(s.modified).toEqual([]); expect(s.unknownInDatabase).toBe(0);
    expect(s.lastApplied).toBe('0028_clerk_auth');
    expect(describeMigrationStatus(s)).toMatch(/base à jour \(29\/29/);
  });

  // Écrire dans le journal des migrations est un geste de propriétaire : le rôle applicatif minimal
  // (AFS_DB_MINIMAL_ROLE=true, levée des réserves) n'en a pas le droit — et c'est voulu. Le test
  // reprend donc le rôle propriétaire le temps d'une écriture, puis rend la main au rôle applicatif.
  const enProprietaire = async <T>(fn: () => Promise<T>): Promise<T> => {
    const client = ((await getDb()) as unknown as { $client: { exec: (q: string) => Promise<unknown> } }).$client;
    const minimal = process.env.AFS_DB_MINIMAL_ROLE === 'true';
    if (minimal) await client.exec('RESET ROLE');
    try { return await fn(); } finally { if (minimal) await client.exec('SET ROLE afrisupply_app'); }
  };

  it('une base en retard, en avance ou divergente est détectée — sans jamais écrire', async () => {
    const db = await getDb();
    const lignes = async () => Number((await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`)).rows[0].n);
    const [derniere] = (await db.execute(sql`select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`)).rows as { id: number; hash: string; created_at: string }[];
    // en retard : la dernière migration du code manque dans la base
    await enProprietaire(() => db.execute(sql`delete from drizzle.__drizzle_migrations where id = ${derniere.id}`));
    const retard = await migrationStatus();
    expect(retard.state).toBe('en_retard'); expect(retard.pending).toEqual(['0028_clerk_auth']); expect(retard.applied).toBe(28);
    expect(await lignes()).toBe(28);   // la lecture n'a rien réparé toute seule
    // divergente : la migration est inscrite, mais avec une autre empreinte que le fichier du dépôt
    await enProprietaire(() => db.execute(sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${'empreinte-modifiee'}, ${derniere.created_at})`));
    const diverge = await migrationStatus();
    expect(diverge.state).toBe('divergente'); expect(diverge.modified).toEqual(['0028_clerk_auth']);
    // en avance : la base connaît une migration que ce code n'a pas
    await enProprietaire(() => db.execute(sql`update drizzle.__drizzle_migrations set hash = ${derniere.hash} where created_at = ${derniere.created_at}`));
    await enProprietaire(() => db.execute(sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${'migration-future'}, ${'9999999999999'})`));
    const avance = await migrationStatus();
    expect(avance.state).toBe('en_avance'); expect(avance.unknownInDatabase).toBe(1); expect(avance.pending).toEqual([]);
    await enProprietaire(() => db.execute(sql`delete from drizzle.__drizzle_migrations where hash = ${'migration-future'}`));
    expect((await migrationStatus()).state).toBe('a_jour');
  });

  it('le statut public expose l’état réel du schéma, et passe en alerte si la base est en retard', async () => {
    const db = await getDb();
    _resetSchemaCache();
    const sain = await appel('GET', '/api/status');
    expect(sain.json.checks.schema).toMatchObject({ ok: true, state: 'a_jour', expected: 29, applied: 29, pending: 0 });
    const [derniere] = (await db.execute(sql`select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`)).rows as { id: number; hash: string; created_at: string }[];
    await enProprietaire(() => db.execute(sql`delete from drizzle.__drizzle_migrations where id = ${derniere.id}`));
    _resetSchemaCache();
    const retard = await appel('GET', '/api/status');
    expect(retard.status).toBe(503);
    expect(retard.json.ok).toBe(false);
    expect(retard.json.checks.schema).toMatchObject({ ok: false, state: 'en_retard', pending: 1 });
    await enProprietaire(() => db.execute(sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${derniere.hash}, ${derniere.created_at})`));
    _resetSchemaCache();
    expect((await appel('GET', '/api/status')).json.checks.schema.state).toBe('a_jour');
  });

  it('la commande de contrôle renvoie un code de sortie exploitable par le build (3 = base en retard)', () => {
    const r = spawnSync('npm', ['run', '--silent', 'migrate:status', '-w', 'packages/db'], { cwd: racine, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, PGLITE_DIR: 'memory://etat-vide' } as NodeJS.ProcessEnv });
    expect(r.status).toBe(3);
    expect(r.stdout).toMatch(/base non initialisée : aucune des 29 migrations/);
  }, 60_000);
});

describe('5. Les fonctions tournent-elles près de la base ?', () => {
  // Mesuré en production le 2026-11-12 (page de statut publique) : fonctions en « iad1 », ~96 ms par
  // requête SQL. Ce contrôle rend la cause lisible — sans jamais montrer l'adresse de la base.
  const NEON = 'postgresql://app:MOT-DE-PASSE-SECRET@ep-calme-riviere-a1b2c3d4-pooler.eu-central-1.aws.neon.tech/afrisupply?sslmode=require';

  it('la région de la base se lit dans le nom d’hôte — et rien d’autre n’en sort', () => {
    expect(databaseRegion({ DATABASE_URL: NEON })).toEqual({ provider: 'aws', region: 'eu-central-1' });
    expect(databaseRegion({ DATABASE_URL: 'postgresql://u:p@ep-x-123.us-east-2.aws.neon.tech/db' })).toEqual({ provider: 'aws', region: 'us-east-2' });
    expect(databaseRegion({ DATABASE_URL: 'postgresql://u:p@ep-x-123.germanywestcentral.azure.neon.tech/db' })).toEqual({ provider: 'azure', region: 'germanywestcentral' });
    // autre hébergeur, adresse illisible, adresse absente : on ne devine pas
    expect(databaseRegion({ DATABASE_URL: 'postgresql://u:p@db.exemple.fr:5432/db' })).toBeNull();
    expect(databaseRegion({ DATABASE_URL: 'pas une adresse' })).toBeNull();
    expect(databaseRegion({})).toBeNull();
    expect(JSON.stringify(databaseRegion({ DATABASE_URL: NEON }))).not.toMatch(/MOT-DE-PASSE|ep-calme|app:/);
  });

  it('fonctions outre-Atlantique, base en Europe : éloignées, avec la région conseillée', () => {
    expect(regionCheck({ VERCEL_REGION: 'iad1', DATABASE_URL: NEON })).toEqual({ fonction: 'iad1', base: 'aws/eu-central-1', conseillee: 'fra1', voisines: false });
    expect(regionCheck({ VERCEL_REGION: 'fra1', DATABASE_URL: NEON }).voisines).toBe(true);
    // hors plateforme, ou région de base inconnue : on ne conclut pas
    expect(regionCheck({ DATABASE_URL: NEON }).voisines).toBeNull();
    expect(regionCheck({ VERCEL_REGION: 'iad1', DATABASE_URL: 'postgresql://u:p@db.exemple.fr/db' }).voisines).toBeNull();
    expect(regionCheck({ VERCEL_REGION: 'iad1' })).toEqual({ fonction: 'iad1', base: null, conseillee: null, voisines: null });
  });

  it('une prévisualisation est jugée sur SA base (PREVIEW_DATABASE_URL), pas sur celle de production', () => {
    const preview = 'postgresql://u:p@ep-preview-9.us-east-1.aws.neon.tech/db';
    expect(regionCheck({ VERCEL_ENV: 'preview', VERCEL_REGION: 'iad1', DATABASE_URL: NEON, PREVIEW_DATABASE_URL: preview })).toEqual({ fonction: 'iad1', base: 'aws/us-east-1', conseillee: 'iad1', voisines: true });
    expect(regionCheck({ VERCEL_ENV: 'preview', VERCEL_REGION: 'iad1', DATABASE_URL: NEON }).base).toBeNull();
  });

  it('l’éloignement est un AVERTISSEMENT de configuration (l’API reste en service), sans l’adresse ni le mot de passe', () => {
    const { errors, warnings } = checkSecureConfig({ ...prod, VERCEL: '1', VERCEL_ENV: 'production', VERCEL_REGION: 'iad1', DATABASE_URL: NEON });
    expect(errors).toEqual([]);
    const w = warnings.find((x) => /Région de fonctions conseillée/.test(x));
    expect(w).toMatch(/« iad1 »/); expect(w).toMatch(/« aws\/eu-central-1 »/); expect(w).toMatch(/« fra1 »/);
    expect(warnings.join(' ')).not.toMatch(/MOT-DE-PASSE|ep-calme|neon\.tech/);
    // même région : aucun avertissement
    const memes = checkSecureConfig({ ...prod, VERCEL: '1', VERCEL_ENV: 'production', VERCEL_REGION: 'fra1', DATABASE_URL: NEON });
    expect(memes.warnings.some((x) => /Région de fonctions conseillée/.test(x))).toBe(false);
  });

  it('le dépôt place les fonctions dans la région de la base annoncée par les mentions légales (Francfort)', async () => {
    const { readFileSync } = await import('node:fs');
    const vercel = JSON.parse(readFileSync(path.join(racine, 'vercel.json'), 'utf8')) as { regions?: string[] };
    const mentions = readFileSync(path.join(racine, 'apps/web/src/pages/site/Legal.tsx'), 'utf8');
    // Ce que le site publie : base à Francfort (eu-central-1), serveurs dans l'Union européenne.
    expect(mentions).toMatch(/eu-central-1/);
    expect(mentions).toMatch(/Union\s+européenne|Union<\/b>|européenne/);
    // Une seule région de fonctions, et c'est celle qui est voisine de cette base.
    expect(vercel.regions).toEqual(['fra1']);
    expect(regionCheck({ VERCEL_REGION: vercel.regions![0], DATABASE_URL: 'postgresql://u:p@ep-x-1.eu-central-1.aws.neon.tech/db' }).voisines).toBe(true);
    // « iad1 » (États-Unis), la région par défaut de la plateforme, contredirait les deux.
    expect(regionCheck({ VERCEL_REGION: 'iad1', DATABASE_URL: 'postgresql://u:p@ep-x-1.eu-central-1.aws.neon.tech/db' }).voisines).toBe(false);
  });

  it('la page de statut publie la latence d’UN aller-retour et le voisinage (inconnu sur un poste local)', async () => {
    _resetSchemaCache();
    const r = await appel('GET', '/api/status');
    expect(r.json.checks.database.ok).toBe(true);
    expect(typeof r.json.checks.database.latencyMs).toBe('number');
    expect(r.json.checks.database.latencyMs).toBeLessThan(200);   // base embarquée : quelques millisecondes, connexion comprise ou non
    expect(r.json.checks.database.colocated).toBeNull();
  });
});
