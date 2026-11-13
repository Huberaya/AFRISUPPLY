// Levée des réserves — chantiers B (Clerk), C (Neon) et D (Vercel) : ce que le code garantit
// quelle que soit la configuration saisie chez l'hébergeur, et ce qu'il sait dire de lui-même.
//
// Relevé indépendant à l'origine de ces tests : en production, la clé Clerk du site est une clé
// d'instance de DÉVELOPPEMENT (pk_test_), une seconde variable porte une AUTRE clé, et aucune
// instance Clerk de production n'existe. Le serveur ne doit pas dépendre de la correction de ces
// variables pour être sûr.
//
// Clerk est SIMULÉ ici (faux service local). Ces tests prouvent les règles du code ; ils ne
// prouvent pas la configuration réelle, que le diagnostic `GET /api/status/config` permet de lire
// sur la plateforme sans afficher aucun secret.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { runMigrations, getDb } from '@afrisupply/db';
import { demarrerFauxClerk, type FauxClerk } from './faux-clerk.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'un-secret-de-test-de-quarante-caracteres-0001';
process.env.CRON_SECRET = 'secret-des-taches-de-test-0001';
process.env.DATABASE_URL = '';
process.env.PGLITE_DIR = 'memory://levee-reserves-config';
process.env.MAIL_OUTBOX_DIR = '/tmp/afs-outbox-levee-config';
for (const k of ['RESEND_API_KEY', 'APP_URL', 'ALLOWED_ORIGINS', 'CLERK_AUTHORIZED_PARTIES', 'CLERK_SECRET_KEY', 'CLERK_JWT_KEY', 'CLERK_API_URL', 'CLERK_FRONTEND_API_URL', 'VITE_CLERK_PUBLISHABLE_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_PUBLISHABLE_KEY', 'VERCEL', 'VERCEL_ENV']) delete process.env[k];

const { app } = await import('../app.js');
const { deploymentKind } = await import('../lib/environment.js');
const { publishableKeyFacts, secretKeyMode, clerkKeyFacts, clerkConfigProblem } = await import('../lib/clerk-config.js');
const { clerkSettings, verifyClerkSessionToken, clerkDiagnostic, ClerkAuthError } = await import('../lib/clerk.js');
const { checkSecureConfig } = await import('../lib/security.js');
const { VARIABLES_SUIVIES, databaseDiagnostic } = await import('../lib/config-diagnostic.js');

/** Clé du site telle que Clerk la fabrique : préfixe + base64(« domaine$ »). */
const cleSite = (mode: 'test' | 'live', domaine: string) => `pk_${mode}_${Buffer.from(`${domaine}$`).toString('base64')}`;
const PK_DEV_AFRISUPPLY = cleSite('test', 'afrisupply-dev-42.clerk.accounts.dev');
const PK_DEV_AUTRE = cleSite('test', 'autre-appli-7.clerk.accounts.dev');
const PK_PROD = cleSite('live', 'clerk.afrisupply.fr');
const SK_DEV = 'sk_test_cle_secrete_de_developpement_0001';
const SK_PROD = 'sk_live_cle_secrete_de_production_0001';

const PRODUCTION = { NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production', JWT_SECRET: 'x'.repeat(48), APP_URL: 'https://afrisupply.fr', DATABASE_URL: 'postgresql://u:p@ep-x-1.eu-central-1.aws.neon.tech/db' } as NodeJS.ProcessEnv;
const PREVISUALISATION = { NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'preview', JWT_SECRET: 'y'.repeat(48), VERCEL_URL: 'afrisupply-git-x.vercel.app', PREVIEW_DATABASE_URL: 'postgresql://u:p@ep-y-2.eu-central-1.aws.neon.tech/db' } as NodeJS.ProcessEnv;
const LOCAL = { NODE_ENV: 'test' } as NodeJS.ProcessEnv;

let clerk: FauxClerk;
beforeAll(async () => { await runMigrations(); clerk = await demarrerFauxClerk(); });
afterAll(async () => { await clerk.fermer(); });

describe('nature du déploiement', () => {
  it('sur Vercel, seule VERCEL_ENV distingue la production d’une prévisualisation (NODE_ENV vaut « production » dans les deux)', () => {
    expect(deploymentKind(PRODUCTION)).toBe('production');
    expect(deploymentKind(PREVISUALISATION)).toBe('preview');
    expect(deploymentKind({ NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'development' } as NodeJS.ProcessEnv)).toBe('development');
    expect(deploymentKind({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe('production');   // serveur autonome
    expect(deploymentKind(LOCAL)).toBe('development');
  });
});

describe('une base par environnement, sans croisement possible', () => {
  it('la production ne lit jamais PREVIEW_DATABASE_URL ; une prévisualisation ne lit jamais DATABASE_URL', async () => {
    const { getDatabaseUrl } = await import('@afrisupply/db');
    const PROD = 'postgresql://utilisateur:motdepasse@ep-prod.eu-central-1.aws.neon.tech/db';
    const PREV = 'postgresql://utilisateur:motdepasse@ep-essai.eu-central-1.aws.neon.tech/db';
    // Production : seule DATABASE_URL compte — même absente, la base de prévisualisation n'est pas prise à sa place.
    expect(getDatabaseUrl({ VERCEL: '1', VERCEL_ENV: 'production', DATABASE_URL: PROD, PREVIEW_DATABASE_URL: PREV })).toBe(PROD);
    expect(getDatabaseUrl({ VERCEL: '1', VERCEL_ENV: 'production', PREVIEW_DATABASE_URL: PREV })).toBeUndefined();
    expect(getDatabaseUrl({ NODE_ENV: 'production', DATABASE_URL: PROD, PREVIEW_DATABASE_URL: PREV })).toBe(PROD);
    // Prévisualisation : seule PREVIEW_DATABASE_URL compte — et jamais si elle vaut la base de production.
    expect(getDatabaseUrl({ VERCEL: '1', VERCEL_ENV: 'preview', DATABASE_URL: PROD, PREVIEW_DATABASE_URL: PREV })).toBe(PREV);
    expect(getDatabaseUrl({ VERCEL: '1', VERCEL_ENV: 'preview', DATABASE_URL: PROD })).toBeUndefined();
    expect(getDatabaseUrl({ VERCEL: '1', VERCEL_ENV: 'preview', DATABASE_URL: PROD, PREVIEW_DATABASE_URL: PROD })).toBeUndefined();
  });
});

describe('clés Clerk : ce qu’elles disent sans être affichées', () => {
  it('clé du site : sorte et domaine de l’instance ; clé du serveur : sorte seulement', () => {
    expect(publishableKeyFacts(PK_DEV_AFRISUPPLY)).toEqual({ mode: 'test', frontendApi: 'afrisupply-dev-42.clerk.accounts.dev' });
    expect(publishableKeyFacts(PK_PROD)).toEqual({ mode: 'live', frontendApi: 'clerk.afrisupply.fr' });
    expect(publishableKeyFacts('pk_test_abc')).toEqual({ mode: 'test', frontendApi: null });      // sorte lisible, domaine illisible
    expect(publishableKeyFacts('n-importe-quoi')).toEqual({ mode: null, frontendApi: null });
    expect(publishableKeyFacts(undefined)).toEqual({ mode: null, frontendApi: null });
    expect(secretKeyMode(SK_DEV)).toBe('test'); expect(secretKeyMode(SK_PROD)).toBe('live'); expect(secretKeyMode('abc')).toBeNull();
  });

  it('le relevé de production : deux variables, deux instances — le serveur dit laquelle il retient et que l’autre est à retirer', () => {
    const env = { ...PRODUCTION, VITE_CLERK_PUBLISHABLE_KEY: PK_DEV_AUTRE, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: PK_DEV_AFRISUPPLY, CLERK_SECRET_KEY: SK_DEV };
    const f = clerkKeyFacts(env);
    expect(f.site).toEqual({ variable: 'VITE_CLERK_PUBLISHABLE_KEY', mode: 'test', frontendApi: 'autre-appli-7.clerk.accounts.dev' });
    expect(f.others).toEqual([{ variable: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', mode: 'test', frontendApi: 'afrisupply-dev-42.clerk.accounts.dev', same: false }]);
    const w = checkSecureConfig(env).warnings.join('\n');
    expect(w).toMatch(/NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY porte une AUTRE clé Clerk que VITE_CLERK_PUBLISHABLE_KEY/);
    expect(w).toMatch(/« afrisupply-dev-42\.clerk\.accounts\.dev » et « autre-appli-7\.clerk\.accounts\.dev »/);
    expect(w).toMatch(/connexion Clerk coupée/);
    // aucune clé dans les avertissements (ils partent dans les journaux de l'hébergeur)
    for (const secret of [PK_DEV_AUTRE, PK_DEV_AFRISUPPLY, SK_DEV]) expect(w).not.toContain(secret);
  });

  it('une clé du site fournie par une variable que le site ne lit pas est signalée', () => {
    const w = checkSecureConfig({ ...LOCAL, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: PK_DEV_AFRISUPPLY, CLERK_SECRET_KEY: SK_DEV, JWT_SECRET: 'z'.repeat(40) }).warnings.join('\n');
    expect(w).toMatch(/fournie par NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, que le site ne lit pas/);
  });
});

describe('une instance Clerk ne sert que l’environnement pour lequel elle est faite', () => {
  const code = (env: NodeJS.ProcessEnv) => clerkConfigProblem(env)?.code ?? null;

  it('production : des clés de développement coupent la connexion Clerk', () => {
    expect(code({ ...PRODUCTION, VITE_CLERK_PUBLISHABLE_KEY: PK_DEV_AUTRE, CLERK_SECRET_KEY: SK_DEV })).toBe('clerk_dev_instance_in_production');
    expect(code({ ...PRODUCTION, CLERK_SECRET_KEY: SK_DEV })).toBe('clerk_dev_instance_in_production');            // clé du serveur seule
    expect(code({ NODE_ENV: 'production', CLERK_SECRET_KEY: SK_DEV } as NodeJS.ProcessEnv)).toBe('clerk_dev_instance_in_production');   // hors Vercel aussi
    expect(code({ ...PRODUCTION, VITE_CLERK_PUBLISHABLE_KEY: PK_PROD, CLERK_SECRET_KEY: SK_PROD })).toBeNull();
    expect(clerkSettings({ ...PRODUCTION, VITE_CLERK_PUBLISHABLE_KEY: PK_DEV_AUTRE, CLERK_SECRET_KEY: SK_DEV }).enabled).toBe(false);
    expect(clerkSettings({ ...PRODUCTION, VITE_CLERK_PUBLISHABLE_KEY: PK_PROD, CLERK_SECRET_KEY: SK_PROD }).enabled).toBe(true);
  });

  it('prévisualisation : les clés de l’instance de production ne sont jamais utilisées', () => {
    expect(code({ ...PREVISUALISATION, VITE_CLERK_PUBLISHABLE_KEY: PK_PROD, CLERK_SECRET_KEY: SK_PROD })).toBe('clerk_live_instance_in_preview');
    expect(code({ ...PREVISUALISATION, CLERK_SECRET_KEY: SK_PROD })).toBe('clerk_live_instance_in_preview');
    expect(code({ ...PREVISUALISATION, VITE_CLERK_PUBLISHABLE_KEY: PK_DEV_AFRISUPPLY, CLERK_SECRET_KEY: SK_DEV })).toBeNull();
  });

  it('partout : une clé du site et une clé du serveur de deux sortes ne peuvent pas être de la même instance', () => {
    expect(code({ ...PRODUCTION, VITE_CLERK_PUBLISHABLE_KEY: PK_DEV_AUTRE, CLERK_SECRET_KEY: SK_PROD })).toBe('clerk_keys_mismatch');
    expect(code({ ...LOCAL, VITE_CLERK_PUBLISHABLE_KEY: PK_PROD, CLERK_SECRET_KEY: SK_DEV })).toBe('clerk_keys_mismatch');
  });

  it('une clé du serveur qui ne ressemble pas à une clé Clerk est refusée dès qu’on n’est plus en développement', () => {
    expect(code({ ...PRODUCTION, CLERK_SECRET_KEY: 'collée-par-erreur' })).toBe('clerk_key_unrecognized');
    expect(code({ ...PREVISUALISATION, CLERK_SECRET_KEY: 'collée-par-erreur' })).toBe('clerk_key_unrecognized');
    expect(code({ ...LOCAL, CLERK_SECRET_KEY: 'cle-du-faux-service' })).toBeNull();
  });

  it('sans clé du serveur : rien à refuser, Clerk n’est simplement pas configuré', () => {
    expect(code({ ...PRODUCTION, VITE_CLERK_PUBLISHABLE_KEY: PK_DEV_AUTRE })).toBeNull();
    expect(clerkSettings({ ...PRODUCTION, VITE_CLERK_PUBLISHABLE_KEY: PK_DEV_AUTRE }).enabled).toBe(false);
  });

  it('un jeton parfaitement valide n’ouvre rien quand les clés ne conviennent pas à l’environnement (503, aucun appel à Clerk)', async () => {
    clerk.ajouter({ id: 'user_reserve', email: 'reserve@exemple.test' });
    const jeton = await clerk.jeton('user_reserve', { azp: 'https://afrisupply.fr' });
    // Témoin : avec des clés convenables (développement, en local), ce même jeton est accepté.
    const local = { ...LOCAL, APP_URL: 'https://afrisupply.fr', CLERK_SECRET_KEY: SK_DEV, CLERK_JWT_KEY: clerk.jwtKey, CLERK_API_URL: clerk.url };
    await expect(verifyClerkSessionToken(jeton, local)).resolves.toMatchObject({ clerkId: 'user_reserve' });
    // Production + clés de développement : refus avant toute vérification.
    const avant = clerk.appels();
    const prod = { ...PRODUCTION, CLERK_SECRET_KEY: SK_DEV, CLERK_JWT_KEY: clerk.jwtKey, VITE_CLERK_PUBLISHABLE_KEY: PK_DEV_AUTRE };
    const refus = await verifyClerkSessionToken(jeton, prod).then(() => null, (e) => e);
    expect(refus).toBeInstanceOf(ClerkAuthError);
    expect(refus.status).toBe(503); expect(refus.code).toBe('clerk_dev_instance_in_production');
    expect(clerk.appels()).toBe(avant);
    // Prévisualisation + clés de production : même refus.
    const prev = await verifyClerkSessionToken(jeton, { ...PREVISUALISATION, CLERK_SECRET_KEY: SK_PROD, CLERK_JWT_KEY: clerk.jwtKey }).then(() => null, (e) => e);
    expect(prev.code).toBe('clerk_live_instance_in_preview');
  });
});

describe('diagnostic : la clé du site et la clé du serveur sont-elles de la MÊME instance ?', () => {
  // Deux faux points d'accès Clerk : le domaine public d'une instance et l'API interrogée avec la clé du serveur.
  let serveur: http.Server; let base = ''; let kidSite = 'ins_A'; let kidServeur = 'ins_A'; let enPanne = false;
  beforeAll(async () => {
    serveur = http.createServer((req, res) => {
      const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (enPanne) return json(503, {});
      if (req.url === '/.well-known/jwks.json') return json(200, { keys: [{ kid: kidSite, kty: 'RSA' }] });
      if (req.url === '/v1/jwks') return String(req.headers.authorization ?? '').startsWith('Bearer sk_') ? json(200, { keys: [{ kid: kidServeur, kty: 'RSA' }] }) : json(401, {});
      return json(404, {});
    });
    await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((ok) => { serveur.closeAllConnections(); serveur.close(() => ok()); }); });
  const env = () => ({ ...LOCAL, APP_URL: 'https://afrisupply.fr', VITE_CLERK_PUBLISHABLE_KEY: PK_DEV_AFRISUPPLY, CLERK_SECRET_KEY: SK_DEV, CLERK_API_URL: base, CLERK_FRONTEND_API_URL: base });

  it('même instance des deux côtés', async () => {
    kidSite = 'ins_A'; kidServeur = 'ins_A';
    const d = await clerkDiagnostic(env());
    expect(d.instance).toEqual({ site: ['ins_A'], server: ['ins_A'], same: true, detail: null });
    expect(d.enabled).toBe(true); expect(d.problem).toBeNull();
    expect(d.site.frontendApi).toBe('afrisupply-dev-42.clerk.accounts.dev');
    expect(d.authorizedParties).toContain('https://afrisupply.fr');
  });

  it('deux instances différentes (le cas relevé en production) : c’est dit, sans deviner laquelle est la bonne', async () => {
    kidSite = 'ins_AUTRE_APPLICATION'; kidServeur = 'ins_AFRISUPPLY';
    const d = await clerkDiagnostic(env());
    expect(d.instance.same).toBe(false);
    expect(d.instance.site).toEqual(['ins_AUTRE_APPLICATION']); expect(d.instance.server).toEqual(['ins_AFRISUPPLY']);
  });

  it('Clerk injoignable ou clé refusée : « comparaison impossible », jamais un faux « conforme »', async () => {
    enPanne = true;
    const d = await clerkDiagnostic(env());
    enPanne = false;
    expect(d.instance.same).toBeNull();
    expect(d.instance.detail).toMatch(/injoignable/);
    const sansCle = await clerkDiagnostic({ ...LOCAL, VITE_CLERK_PUBLISHABLE_KEY: PK_DEV_AFRISUPPLY, CLERK_FRONTEND_API_URL: base });
    expect(sansCle.instance.same).toBeNull(); expect(sansCle.instance.detail).toMatch(/CLERK_SECRET_KEY absente/);
  });

  it('le diagnostic ne contient aucune clé', async () => {
    kidSite = 'ins_A'; kidServeur = 'ins_A';
    const texte = JSON.stringify(await clerkDiagnostic({ ...env(), CLERK_JWT_KEY: clerk.jwtKey }));
    for (const secret of [SK_DEV, PK_DEV_AFRISUPPLY, clerk.jwtKey.slice(30, 80)]) expect(texte).not.toContain(secret);
  });

  it('en production, les adresses de Clerk ne sont pas modifiables par une variable (elles ne servent qu’aux tests)', async () => {
    const d = await clerkDiagnostic({ ...PRODUCTION, VITE_CLERK_PUBLISHABLE_KEY: cleSite('live', 'domaine-inexistant.invalid'), CLERK_SECRET_KEY: SK_PROD, CLERK_API_URL: base, CLERK_FRONTEND_API_URL: base, CLERK_TIMEOUT_MS: '1500' });
    // Si les variables étaient lues, le faux service répondrait « ins_A » des deux côtés.
    expect(d.instance.site).toBeNull();
    expect(d.instance.same).toBeNull();
  }, 20_000);
});

describe('e-mails : l’adresse d’essai du prestataire ne remet rien aux clients', () => {
  it('en production, l’expéditeur d’essai est signalé — avec ce qu’il empêche et ce qu’il faut faire', () => {
    const base = { ...PRODUCTION, RESEND_API_KEY: 're_cle_de_test_0001' };
    const w = (env: NodeJS.ProcessEnv) => checkSecureConfig(env).warnings.join('\n');
    expect(w({ ...base, MAIL_FROM: 'AFRISUPPLY <onboarding@resend.dev>' })).toMatch(/adresse d'essai du prestataire.*seuls les messages adressés au titulaire du compte/s);
    expect(w({ ...base, MAIL_FROM: 'AFRISUPPLY <bonjour@afrisupply.fr>' })).not.toMatch(/adresse d'essai/);
    expect(w({ ...base })).not.toMatch(/adresse d'essai/);                                   // sans MAIL_FROM : adresse du support
    expect(w({ ...PRODUCTION, MAIL_FROM: 'AFRISUPPLY <onboarding@resend.dev>' })).not.toMatch(/adresse d'essai/);   // sans clé : autre avertissement
  });
});

describe('GET /api/status et /api/status/config', () => {
  const lire = async (chemin: string, enTetes: Record<string, string> = {}) => { const r = await app.request(chemin, { headers: enTetes }); return { status: r.status, json: (await r.json()) as any, texte: '' }; };

  it('statut public : la connexion Clerk est-elle en service, et sinon pourquoi — sans clé ni domaine', async () => {
    process.env.VITE_CLERK_PUBLISHABLE_KEY = PK_DEV_AFRISUPPLY; process.env.CLERK_SECRET_KEY = SK_PROD;   // deux sortes : coupé
    const s = await lire('/api/status');
    delete process.env.VITE_CLERK_PUBLISHABLE_KEY; delete process.env.CLERK_SECRET_KEY;
    expect(s.json.checks.auth).toEqual({ sessionSecret: 'ok', clerk: { enabled: false, mode: 'live', problem: 'clerk_keys_mismatch' } });
    expect(JSON.stringify(s.json)).not.toContain('clerk.accounts.dev');
    const sans = await lire('/api/status');
    expect(sans.json.checks.auth.clerk).toEqual({ enabled: false, mode: null, problem: null });
  });

  it('diagnostic : refusé sans le secret des tâches, y compris présenté dans l’adresse', async () => {
    expect((await lire('/api/status/config')).status).toBe(401);
    expect((await lire('/api/status/config', { authorization: 'Bearer mauvais' })).status).toBe(401);
    expect((await lire(`/api/status/config?secret=${process.env.CRON_SECRET}`)).status).toBe(401);
  });

  it('diagnostic : rôle de la base, RLS, migrations, variables présentes — et aucune valeur', async () => {
    process.env.ADMIN_EMAILS = 'exploitante@afrisupply.test'; process.env.VITE_CLERK_PUBLISHABLE_KEY = PK_DEV_AFRISUPPLY; process.env.CLERK_SECRET_KEY = SK_DEV;
    process.env.CLERK_API_URL = 'http://127.0.0.1:1'; process.env.CLERK_FRONTEND_API_URL = 'http://127.0.0.1:1';
    const r = await app.request('/api/status/config', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const texte = await r.text(); const d = JSON.parse(texte);
    for (const k of ['ADMIN_EMAILS', 'VITE_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY', 'CLERK_API_URL', 'CLERK_FRONTEND_API_URL']) delete process.env[k];
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(d.environment).toBe('development');
    expect(d.sessionSecret).toEqual({ ok: true });
    expect(d.admins).toEqual({ declared: 1 });
    // Base : le rôle réellement utilisé et ce qu'il peut faire (ici la base embarquée des tests).
    expect(d.database.driver).toBe('pglite');
    expect(typeof d.database.role).toBe('string');
    expect(d.database.tables).toBeGreaterThanOrEqual(48);
    expect(d.database.rlsTables).toBe(0); expect(d.database.policies).toBe(0);       // constat du dépôt : aucune RLS
    expect(d.database.migrations).toMatchObject({ state: 'a_jour', expected: 29, applied: 29 });
    // Variables : présentes ou non, rien d'autre.
    expect(d.variables.JWT_SECRET).toBe(true); expect(d.variables.CRON_SECRET).toBe(true); expect(d.variables.CLERK_SECRET_KEY).toBe(true);
    expect(d.variables.DATABASE_URL).toBe(false); expect(d.variables.SENTRY_DSN).toBe(false);
    expect(Object.values(d.variables).every((v) => typeof v === 'boolean')).toBe(true);
    expect(d.clerk.site).toEqual({ variable: 'VITE_CLERK_PUBLISHABLE_KEY', mode: 'test', frontendApi: 'afrisupply-dev-42.clerk.accounts.dev' });
    expect(d.clerk.instance.same).toBeNull();
    for (const secret of [process.env.JWT_SECRET!, process.env.CRON_SECRET!, SK_DEV, PK_DEV_AFRISUPPLY, 'exploitante@afrisupply.test']) expect(texte).not.toContain(secret);
  }, 30_000);

  it('rôle de la base : le diagnostic lit le rôle RÉEL de la connexion', async () => {
    const d = await databaseDiagnostic();
    expect(d.error).toBeNull();
    expect(d.superuser === true || d.superuser === false).toBe(true);
    expect(d.bypassRls === true || d.bypassRls === false).toBe(true);
    expect(d.canCreateTables === true || d.canCreateTables === false).toBe(true);
  });

  // Chantier C — rôle applicatif à privilèges minimaux (packages/db/roles/afrisupply_app.sql).
  // `AFS_DB_MINIMAL_ROLE=true npm test -w apps/api` rejoue TOUTE la suite de l'API avec ce rôle
  // (tâche « rôle minimal » de l'intégration continue). Ce test-ci prouve que le rôle est bien en
  // place pendant ce passage : sans lui, la suite passerait pour de mauvaises raisons.
  it('sous le rôle applicatif minimal : lire et écrire des lignes, rien d’autre', async () => {
    const d = await databaseDiagnostic();
    if (process.env.AFS_DB_MINIMAL_ROLE !== 'true') { expect(d.role).not.toBe('afrisupply_app'); return; }
    expect(d).toMatchObject({ role: 'afrisupply_app', superuser: false, bypassRls: false, createRole: false, createDb: false, canCreateTables: false, canCreateTempTables: false, error: null });
    const db = await getDb();
    const interdits = ['create table interdit (id int)', 'alter table users add column interdit int', 'drop table rate_limits', 'truncate rate_limits',
      'create sequence interdite', 'create role intrus', 'delete from drizzle.__drizzle_migrations', 'alter table users enable row level security'];
    for (const q of interdits) await expect(db.execute(sql.raw(q)), q).rejects.toThrow();
    // … et ce dont l'application a besoin reste permis : lignes, séquences de numérotation, journal en lecture.
    await db.execute(sql.raw("insert into rate_limits (key, n, reset_at) values ('essai-role-minimal', 1, now()) on conflict (key) do nothing"));
    await db.execute(sql.raw("delete from rate_limits where key = 'essai-role-minimal'"));
    await db.execute(sql.raw("select nextval('order_ref_seq'), nextval('subscription_invoice_seq'), nextval('claim_ref_seq')"));
    await db.execute(sql.raw('select count(*) from drizzle.__drizzle_migrations'));
  });

  it('toute variable lue par le code de l’API figure dans le diagnostic (ou dans la liste de celles qui n’ont pas à y être)', () => {
    // Réglages sans enjeu de sécurité ni d'environnement, et variables fournies par la plateforme ou réservées aux tests.
    const HORS_SUIVI = new Set(['NODE_ENV', 'PORT', 'PGLITE_DIR', 'AFS_DB_MINIMAL_ROLE', 'MAIL_OUTBOX_DIR', 'BACKUP_DIR', 'BACKUP_KEEP', 'BACKUP_OFFSITE_KEEP', 'BACKUP_S3_PREFIX', 'BACKUP_S3_STYLE',
      'AFS_SELF_URL', 'CLERK_API_URL', 'CLERK_FRONTEND_API_URL', 'RESEND_API_URL', 'CLERK_TIMEOUT_MS', 'OFFSITE_TIMEOUT_MS', 'DAILY_BUDGET_MS', 'DAILY_LEASE_MS', 'DAILY_MAX_TRANCHES', 'STRIPE_API_BASE', 'STRIPE_COUPON_FOUNDER',
      'EMAIL_VERIFY_TTL_HOURS', 'PASSWORD_RESET_TTL_MINUTES', 'PASSWORD_MIN_LENGTH', 'IMMEDIATE_ALERT_WINDOW_HOURS', 'ORDER_MAX_MONTHS_OF_STOCK', 'REMINDER_HOURS', 'SALES_GAP_DAYS',
      'INVOICE_ADDRESS', 'INVOICE_EMAIL', 'INVOICE_IBAN', 'LLM_BASE_URL', 'LLM_MODEL', 'LLM_VISION_MODEL', 'SUPPORT_PHONE',
      'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_REGION', 'VERCEL_GIT_COMMIT_SHA', 'VERCEL_PROJECT_PRODUCTION_URL']);
    const racine = path.resolve(process.cwd(), '../..');
    const fichiers: string[] = [];
    const parcourir = (dossier: string) => { for (const n of readdirSync(dossier)) { const p = path.join(dossier, n); if (statSync(p).isDirectory()) { if (n !== 'test' && n !== 'node_modules') parcourir(p); } else if (/\.ts$/.test(n)) fichiers.push(p); } };
    parcourir(path.join(racine, 'apps/api/src')); parcourir(path.join(racine, 'packages/db/src')); parcourir(path.join(racine, 'api/_src'));
    const lues = new Set<string>();
    for (const f of fichiers) for (const m of readFileSync(f, 'utf8').matchAll(/\b(?:process\.env|env)\.([A-Z][A-Z0-9_]{2,})\b/g)) lues.add(m[1]);
    expect(lues.size).toBeGreaterThan(40);
    const suivies = new Set<string>(VARIABLES_SUIVIES);
    expect([...lues].filter((v) => !suivies.has(v) && !HORS_SUIVI.has(v)).sort()).toEqual([]);
  });
});
